// engine/range-risk.js (n4-G2 CHART, 설계 docs/NEXT4_DESIGN.md 3.4절, 3.6절, 3.7절, 결정 63)
// 칸마다 위험도(비추천도, 이 앱 차트 기준): 0 핵심, 1 보통, 2 경계(혼합 포함), 3 아깝게 밖(인접 near 또는 함정 trap: 폴드인데 eq ≥ 범위 안 승률 하위 25% 값 q25),
//   4 밖. 백분위 pct = 같은 주 액션 칸 안 승률 순위. 팟 오즈 초과 overOdds는 등급과 별개 플래그(요약 줄 문장에만 쓴다).
// API(이름과 인자 고정):
//   cell(model, r, c, key, opts) → { label, action, mix, eq, pct, rank, of, top, edge, near, trap, q25, overOdds, level, levelName, text, needText, vs } | null
//     model = GtoChart 모델({ pos, facing, opener, limpers, key?, cells[r][c] = { label, action, w? } }), key = RangeEquity 표 키,
//     opts = { need(0~1 | null), needRef('engine' | 'std'), vs(상대 범위 문구) }
//   summary(model, key, opts) → { vs, ref, groups, traps, overOdds, folds, need, lines[] } | null(표 없음)
//   need(sit, state) → { need(0~1), ref('engine' | 'std') } | null: 실제 판(state, 프리플랍)은 팟 오즈 그대로 콜 / (팟(상대 벳 포함) + 콜), 없으면 표준 크기(참고)
//   standardNeed(sit, ctx) → 0~1 | null(학습실 표준 크기 기준 필요 승률, 참고), TEXT(문장 틀), BEHIND(뒤에 남은 사람 수, Coach.BEHIND와 같은 표)
//   points(model, key, hc) → 레인지 곡선 재료 [{ label, eq, action, mine, weight }](SvgCharts.rangeCurve 입력, 설계 5.2절 1번)
// 표준 크기(engine/ev.js 상수와 같은 값, ev.js는 부르지 않는다): 오픈 2.5bb(SB 3bb), 3벳 IP 3배와 OOP 4배, 4벳 2.3배. 블라인드 SB 0.5, BB 1.
//   필요 승률 = 콜 / (팟(상대 벳 포함) + 콜). 이 식은 이 콜이 마지막 돈일 때의 손익분기라 화면 글에는 "지금 콜만 보면"을 붙인다.
//   설계 3.4절 8번 10값: 오픈 대응 비블라인드 38.5, SB 33.3, BB 27.3 / 3벳 맞음 IP 30.3, SB 35.7, BB 36.6 / 4벳 맞음 27.1 / 콜드 3벳 비블라인드 39.5, SB 37.8, BB 36.1.
// 정의(3.4절):
//   레인(줄): 페어는 대각선, 수딧은 같은 행(첫 랭크 고정), 오프수트는 같은 열(첫 랭크 고정). 이웃 = 같은 레인에서 랭크 한 단계 위아래(RangeNotes.lanes와 같다).
//   edge: 폴드 아닌 칸이고 레인 이웃의 주 액션이 하나라도 다르면 참(혼합 칸은 늘 참). near: 폴드 칸이고 레인 이웃에 폴드 아닌 칸이 있으면 참.
//   q25: 폴드 아닌 칸 승률을 오름차순으로 세운 값의 floor(n / 4)번째(칸 기준). trap: 폴드 칸이고 eq ≥ q25. overOdds: 폴드 칸이고 need가 있고 eq ≥ need.
//   pct: 같은 주 액션 칸을 eq 내림차순(같으면 콤보 수 많은 쪽, 그다음 라벨)으로 세워 (of - rank) / (of - 1) x 100, 혼자면 100.
//   평균 승률(요약 줄): 칸 가중 = 그 칸 콤보 수(6, 4, 12) x 살아 있는 상대 콤보 수(대표 콤보 카드 제거), 혼합 칸은 그 액션 비율만큼.
// 문장 규칙(3.6절, 3.7절 7번): 해요체, 한 문장 60자 이내, 숫자는 계산값만. "콜하세요", "승률이 높으니" 같은 처방 문장은 쓰지 않는다(린트 테스트가 막는다).
//   승률은 "쇼다운까지 그냥 갔을 때" 값이라 차트가 승률 순서로 자르지 않는다는 한 줄(TEXT.common)을 요약 줄 아래에 늘 둔다.
// 규약: 로드 때 DOM 접근 없음. 순수(RangeEquity, Gto는 typeof 가드로 읽기만). 가운뎃점과 긴줄표 없음.
var RangeRisk = (function() {
  var BEHIND = { UTG: 5, HJ: 4, CO: 3, BTN: 2, SB: 1, BB: 0 };
  var SIZE = { open: 2.5, sbOpen: 3, ip3: 3, oop3: 4, four: 2.3, sb: 0.5, bb: 1 };
  var POST_ORDER = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];   // 포스트플랍 행동 순서(뒤일수록 IP)
  var POS6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var RANKS = 'AKQJT98765432';
  var LEVEL_NAME = ['핵심', '보통', '경계', '아깝게 밖', '밖'];

  function _blind(p) { return p === 'SB' ? SIZE.sb : p === 'BB' ? SIZE.bb : 0; }
  // a가 b보다 포스트플랍에 뒤에 행동하는가(IP)
  function _ip(a, b) { return POST_ORDER.indexOf(a) > POST_ORDER.indexOf(b); }
  function _openSize(p) { return p === 'SB' ? SIZE.sbOpen : SIZE.open; }
  function _threeSize(t, o) { return _openSize(o) * (_ip(t, o) ? SIZE.ip3 : SIZE.oop3); }
  // 두 사람(또는 세 사람) 말고 남은 블라인드(팟에 이미 들어간 죽은 돈)
  function _dead(players) {
    var d = 0;
    if (players.indexOf('SB') < 0) d += SIZE.sb;
    if (players.indexOf('BB') < 0) d += SIZE.bb;
    return d;
  }
  function _ratio(call, pot) { return call > 0 ? call / (pot + call) : null; }
  function _pos(p, dflt) { return POS6.indexOf(p) >= 0 ? p : dflt; }

  // 학습실 표준 크기 필요 승률(순수). sit = { pos(나), facing, opener?, limpers? }, ctx = { raiser?(3벳 또는 4벳한 자리), opener?(콜드 3벳의 오프너) }
  //   상대 자리를 모르면 RangeEquity.tableFor와 같은 기본 자리(3벳 맞음 BB, 4벳 맞음 CO, 콜드 3벳 BTN)를 쓴다. 오픈과 림퍼 뒤는 null
  function standardNeed(sit, ctx) {
    if (!sit || POS6.indexOf(sit.pos) < 0) return null;
    ctx = ctx || {};
    var me = sit.pos, f = sit.facing, o, t, open, three, pot, call;
    if (f === true) {
      o = _pos(sit.opener || ctx.opener, 'CO');
      if (o === me) return null;
      open = _openSize(o);
      pot = open + _dead([o]);           // 내 블라인드도 팟에 들어 있다
      call = open - _blind(me);
      return _ratio(call, pot);
    }
    if (f === 'vs3bet') {               // 내가 오프너, 3벳한 자리 t
      t = _pos(ctx.raiser, 'BB');
      if (t === me) return null;
      open = _openSize(me); three = _threeSize(t, me);
      pot = three + open + _dead([me, t]);
      call = three - open;
      return _ratio(call, pot);
    }
    if (f === 'vs4bet') {               // 내가 3벳, 오프너 o가 4벳
      o = _pos(ctx.raiser, 'CO');
      if (o === me) return null;
      three = _threeSize(me, o);
      var four = Math.round(three * SIZE.four * 10) / 10;
      pot = four + three + _dead([me, o]);
      call = four - three;
      return _ratio(call, pot);
    }
    if (f === 'cold3bet') {             // 오프너 o의 오픈에 t가 3벳, 나는 아직 돈을 넣지 않았다(블라인드 제외)
      t = _pos(ctx.raiser, 'BTN');
      o = _pos(ctx.opener, 'UTG');
      if (t === me || o === me || t === o) return null;
      open = _openSize(o); three = _threeSize(t, o);
      pot = open + three + _dead([o, t]);
      call = three - _blind(me);
      return _ratio(call, pot);
    }
    return null;   // 먼저 오픈, 림퍼 뒤: 필요 승률 개념 없음
  }

  // 필요 승률(순수). 실제 판(프리플랍 state)이면 팟 오즈 그대로(엔진 계산, Coach와 같은 식: 콜 / (state.pot + 콜)), 아니면 표준 크기(참고).
  //   sit = { pos, facing, opener?, limpers?, name?(좌석 이름, 기본 'Hero'), raiser?, cold? }. 콜할 돈이 없거나 먼저 오픈이면 null
  function need(sit, state) {
    if (!sit) return null;
    // 먼저 오픈과 림퍼 뒤(facing false)는 콜할 돈(빅 블라인드, 림프 금액)이 있어도 필요 승률 개념이 없다(차트는 레이즈 아니면 폴드)
    if (sit.facing !== true && sit.facing !== 'vs3bet' && sit.facing !== 'vs4bet' && sit.facing !== 'cold3bet') return null;
    if (state && state.street === 'preflop' && state.playerBets) {
      var nm = sit.name || 'Hero';
      var toCall = Math.max(0, (Number(state.currentBet) || 0) - (Number(state.playerBets[nm]) || 0));
      var potTotal = Number(state.pot) || 0;   // 상대 벳 포함 팟(Coach와 같은 값)
      if (!(toCall > 0) || !(potTotal + toCall > 0)) return null;
      // 올인 콜(콜 금액 ≥ 남은 스택): 이 콜이 마지막 돈이라 팟 오즈가 그대로 손익분기다(문장이 "플랍 뒤에 더 많은 돈"을 말하면 틀린다)
      var stack = state.stacks && state.stacks[nm] != null ? Number(state.stacks[nm]) : null;
      return { need: toCall / (potTotal + toCall), ref: 'engine', allIn: stack != null && isFinite(stack) && toCall >= stack };
    }
    var v = standardNeed(sit, { raiser: sit.raiser, opener: sit.cold || sit.coldOpener });
    return v == null ? null : { need: v, ref: 'std' };
  }

  // ── 칸과 레인 ──
  function _label(r, c) {
    if (r === c) return RANKS[r] + RANKS[r];
    if (r < c) return RANKS[r] + RANKS[c] + 's';
    return RANKS[c] + RANKS[r] + 'o';
  }
  function _weight(r, c) { return r === c ? 6 : (r < c ? 4 : 12); }
  // 레인 이웃: [위(랭크 한 단계 높은 쪽), 아래]. 없으면 null
  function laneNeighbors(r, c) {
    var up = null, dn = null;
    if (r === c) { if (r > 0) up = [r - 1, c - 1]; if (r < 12) dn = [r + 1, c + 1]; }
    else if (r < c) { if (c - 1 > r) up = [r, c - 1]; if (c < 12) dn = [r, c + 1]; }
    else { if (r - 1 > c) up = [r - 1, c]; if (r < 12) dn = [r + 1, c]; }
    return [up, dn];
  }
  function _mix(cell) {
    var w = cell && cell.w;
    if (!w || typeof w !== 'object') return null;
    var rr = Math.max(0, Number(w.raise) || 0), cc = Math.max(0, Number(w.call) || 0), ff = Math.max(0, Number(w.fold) || 0);
    var n = (rr > 0 ? 1 : 0) + (cc > 0 ? 1 : 0) + (ff > 0 ? 1 : 0);
    if (n < 2) return null;
    var s = rr + cc + ff || 1;
    return { raise: rr / s, call: cc / s, fold: ff / s };
  }
  // 주 액션(GtoChart.primaryAction과 같은 규칙: 혼합 칸은 가장 큰 비율, 같으면 레이즈, 콜, 폴드 순)
  function _primary(cell) {
    if (!cell) return 'none';
    var mx = _mix(cell);
    if (mx) {
      var best = 'raise', v = mx.raise;
      if (mx.call > v + 1e-9) { best = 'call'; v = mx.call; }
      if (mx.fold > v + 1e-9) best = 'fold';
      return best;
    }
    return cell.action || 'none';
  }
  // 백분위 무리: 혼합 칸은 폴드 아닌 큰 쪽(레이즈 ≥ 콜이면 레이즈), BB 림프 상대 콜 칸은 체크
  function _group(model, cell) {
    var mx = _mix(cell);
    if (mx) return mx.raise >= mx.call ? 'raise' : 'call';
    var a = cell ? cell.action : 'none';
    if (a === 'call' && model.limpers && model.pos === 'BB') return 'check';
    return a === 'raise' || a === 'call' || a === 'fold' ? a : 'none';
  }

  // 표 값(RangeEquity, typeof 가드)
  function _RE() { return (typeof RangeEquity !== 'undefined' && RangeEquity && !RangeEquity.STUB && typeof RangeEquity.get === 'function') ? RangeEquity : null; }
  function _table(key) { var RE = _RE(); return RE && RE.TABLES && Object.prototype.hasOwnProperty.call(RE.TABLES, key) ? RE.TABLES[key] : null; }

  // 살아 있는 상대 콤보 수(대표 콤보 카드 제거): 표 키마다 169칸 캐시
  var _liveCache = {};
  function _repCards(r, c) {
    // 카드 = 랭크 문자 + 무늬. 페어 X♠X♥, 수딧 X♠Y♠, 오프수트 X♠Y♥(X가 높은 랭크)
    var hi = RANKS[Math.min(r, c)], lo = RANKS[Math.max(r, c)];
    if (r === c) return [hi + 's', hi + 'h'];
    if (r < c) return [hi + 's', lo + 's'];
    return [hi + 's', lo + 'h'];
  }
  function _classCombos(lab) {
    var a = lab.charAt(0), b = lab.charAt(1), k = lab.charAt(2), S = 'shdc', out = [], i, j;
    if (a === b) { for (i = 0; i < 4; i++) for (j = i + 1; j < 4; j++) out.push([a + S[i], a + S[j]]); }
    else if (k === 's') { for (i = 0; i < 4; i++) out.push([a + S[i], b + S[i]]); }
    else { for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) if (i !== j) out.push([a + S[i], b + S[j]]); }
    return out;
  }
  function _rangeLabels(t) {
    if (!t || !t.range) return null;
    if (typeof Gto !== 'undefined' && Gto && typeof Gto.rangeClassSet === 'function') {
      try { var set = Gto.rangeClassSet(t.range), arr = []; set.forEach(function(l) { arr.push(l); }); return arr; } catch (e) { return null; }
    }
    return null;
  }
  // 살아 있는 상대 콤보 수 = 전체 - (내 카드 a가 든 콤보) - (b가 든 콤보) + (a, b 둘 다인 콤보). 카드별 개수를 한 번 세어 칸마다 O(1)
  function liveCombos(key, r, c) {
    var t = _table(key);
    if (!t) return null;
    var store = _liveCache[key];
    if (!store) {
      store = _liveCache[key] = [];
      var labs = _rangeLabels(t), per = {}, both = {}, total = 0;
      if (labs) labs.forEach(function(l) {
        _classCombos(l).forEach(function(cb) { total++; per[cb[0]] = (per[cb[0]] || 0) + 1; per[cb[1]] = (per[cb[1]] || 0) + 1; both[cb[0] + cb[1]] = 1; both[cb[1] + cb[0]] = 1; });
      });
      for (var rr = 0; rr < 13; rr++) for (var cc = 0; cc < 13; cc++) {
        var d = _repCards(rr, cc), n;
        if (!t.range) n = 1225;   // 랜덤 손: 50장 중 2장
        else if (!labs) n = t.combos || 1;
        else n = total - (per[d[0]] || 0) - (per[d[1]] || 0) + (both[d[0] + d[1]] ? 1 : 0);
        store.push(n);
      }
    }
    return store[r * 13 + c];
  }

  // ── 모델 x 표 분석(캐시): 칸마다 무리, eq, 순위, 경계, 인접 ──
  var _anaCache = {}, _anaN = 0;
  function analyze(model, key) {
    if (!model || !model.cells || !_table(key)) return null;
    var ck = model.key ? model.key + '|' + key : null;
    if (ck && _anaCache[ck]) return _anaCache[ck];
    if (!ck && model._ga && model._ga[key]) return model._ga[key];
    var RE = _RE(), cells = [], groups = {}, r, c;
    for (r = 0; r < 13; r++) for (c = 0; c < 13; c++) {
      var cell = model.cells[r][c], g = _group(model, cell), eq = RE.get(key, r, c);
      var o = { r: r, c: c, label: cell.label || _label(r, c), group: g, primary: _primary(cell), mix: _mix(cell), eq: eq, w: _weight(r, c) };
      cells.push(o);
      if (g !== 'none' && eq != null) (groups[g] = groups[g] || []).push(o);
    }
    Object.keys(groups).forEach(function(g) {
      var arr = groups[g];
      arr.sort(function(a, b) { return (b.eq - a.eq) || (b.w - a.w) || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0); });
      arr.forEach(function(o, i) {
        o.rank = i + 1; o.of = arr.length;
        o.pct = arr.length > 1 ? Math.round((arr.length - o.rank) / (arr.length - 1) * 100) : 100;
      });
    });
    // q25: 폴드 아닌 칸(무리가 raise, call, check)의 승률 하위 25% 값
    var inEq = [];
    cells.forEach(function(o) { if (o.group !== 'fold' && o.group !== 'none' && o.eq != null) inEq.push(o.eq); });
    inEq.sort(function(a, b) { return a - b; });
    var q25 = inEq.length ? inEq[Math.floor(inEq.length * 0.25)] : null;
    // 경계와 인접(레인 이웃의 주 액션)
    var at = function(rr, cc) { return cells[rr * 13 + cc]; };
    cells.forEach(function(o) {
      var nb = laneNeighbors(o.r, o.c), info = [];
      nb.forEach(function(p, i) { if (p) { var n = at(p[0], p[1]); info.push({ dir: i === 0 ? 'up' : 'dn', label: n.label, primary: n.primary, group: n.group, mix: n.mix }); } });
      o.nb = info;
      if (o.group === 'none') { o.edge = false; o.near = false; return; }
      if (o.group === 'fold') {
        o.edge = false;
        o.near = info.some(function(n) { return n.group !== 'fold' && n.group !== 'none'; });
      } else {
        o.near = false;
        o.edge = !!o.mix || info.some(function(n) { return n.primary !== o.primary && n.primary !== 'none'; });
      }
      o.trap = o.group === 'fold' && q25 != null && o.eq != null && o.eq >= q25;
    });
    // 무리별 중앙값(레이즈 칸의 폴드 에쿼티 문장 조건: 레이즈 칸인데 콜 칸 승률 중앙값보다 낮다)
    var med = {};
    Object.keys(groups).forEach(function(g) {
      var v = groups[g].map(function(o) { return o.eq; }).sort(function(a, b) { return a - b; });
      med[g] = v.length ? v[Math.floor(v.length / 2)] : null;
    });
    var out = { key: key, cells: cells, groups: groups, q25: q25, median: med };
    if (ck) {
      if (++_anaN > 120) { _anaCache = {}; _anaN = 1; }
      _anaCache[ck] = out;
    } else { model._ga = model._ga || {}; model._ga[key] = out; }
    return out;
  }

  // ── 문장(3.6절). {a} 액션 낱말, {n} 숫자 등은 _fill이 채운다 ──
  var TEXT = {
    core: '{a} 칸 가운데 승률이 위쪽(상위 {top}%)이에요. 망설일 것 없이 {a}해요.',
    coreTop: '{a} 칸 가운데 승률이 가장 높은 손이에요. 망설일 것 없이 {a}해요.',
    normal: '{a} 범위 안이지만 승률은 아래쪽(하위 {bot}%)이에요. 차트대로 {a}하되 뒤에서 세게 나오면 접을 준비를 해요.',
    normalRaise: '승률은 아래쪽(하위 {bot}%)인데 레이즈인 손이에요. 상대를 접게 만드는 힘(폴드 에쿼티)으로 들어간 손이에요.',
    normalRaiseBehind: '콜을 받으면 승률 {eq}%로 뒤처질 때가 많아요.',
    edge: '{a} 범위의 가장자리 손이에요. 같은 줄 옆 칸 {nbEun} {naIeyo}.',
    mix: '표준 차트가 {n}%만 {a}하는 섞는 손이에요. 어느 쪽도 큰 손해는 아니에요.',
    nearUp: '한 칸만 좋았으면 {na}인 손이에요. 같은 줄 바로 위 {nb}부터 {naIeyo}.',
    nearDn: '같은 줄 바로 아래 {nbEun} {naIeyo}. 이 손이 폴드인 건 승률 순서로만 자르지 않는다는 뜻이에요.',
    nearEq: '승률 {eq}%는 범위 안 손과 비슷해요.',
    behind: '뒤에 {n}명이 남아 있어 더 센 손이 나올 수 있어 접어요.',
    behindVs: '오픈한 상대 범위가 강하고 뒤에도 {n}명이 남아 접는 쪽이에요.',
    nearUpMix: '한 칸만 좋았으면 가끔 {na}하는 손이에요. 같은 줄 바로 위 {nb} {n}%만 {na}해요.',
    allInOdds: '올인 콜이라 이 콜이 마지막 돈이에요. 상대 범위가 이 표와 같다면 필요 승률 {need}%가 그대로 손익분기예요.',
    oop: '자리가 불리해(플랍 뒤 먼저 행동) 승률을 다 쓰지 못해 접어요.',
    generic: '쇼다운까지 그냥 간 값이라 플랍 뒤 플레이까지 보면 접는 쪽이에요.',
    trap: '승률 {eq}%는 범위 안 손 아래쪽 4분의 1보다 높지만 차트는 폴드예요.',
    trapOdds: '지금 콜만 보면 필요 승률 {need}%도 넘어요.',
    trapWhy: '이 승률은 쇼다운까지 그냥 갔을 때 값이고, 자리가 불리하거나 플랍 뒤가 어려운 손은 다 쓰지 못해요.',
    out: '범위 밖 손이에요. 승률 {eq}%로 {vs} 앞에서는 밀려요.',
    outEven: '범위 밖 손이에요. 승률 {eq}%로 {vsGwa} 비슷하지만 차트는 폴드예요.',
    outUnder: '지금 콜만 보면 필요 승률 {need}%에도 못 미쳐요.',
    outOver: '지금 콜만 보면 필요 승률 {need}%는 넘지만 플랍 뒤에 더 많은 돈이 오가요.',
    needOk: '지금 콜만 보면 필요 승률 {need}%({ref}), 이 손은 {d}%p 여유가 있어요.',
    needShort: '지금 콜만 보면 필요 승률 {need}%({ref})보다 {d}%p 모자라요.',
    common: '승률은 쇼다운까지 그냥 갔을 때의 값이에요. 차트는 자리, 뒤에 남은 사람, 플랍 뒤 플레이까지 봐서 승률 순서대로 자르지 않아요.',
    sumTrap: '점 찍힌 폴드 {k}칸은 승률이 범위 안 손 아래쪽 4분의 1보다 높은 아까운 폴드예요.',
    sumOdds: '폴드 {f}칸 중 {k}칸은 지금 콜만 보면 필요 승률 {need}%를 넘어요. 팟 오즈만으로 콜을 정하지 않는 이유예요.'
  };
  function _fill(t, v) { return String(t).replace(/\{(\w+)\}/g, function(all, k) { return v[k] != null ? String(v[k]) : ''; }); }
  // 받침 있는 낱말 뒤 조사(은/는, 이에요/예요): 라벨 끝 글자(s, o, 숫자, 영문)는 읽는 소리로 본다
  function _batchim(w) {
    var ch = String(w || '').replace(/\([^()]*\)$/, '').slice(-1);
    if (!ch) return false;
    var code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) return (code - 0xAC00) % 28 !== 0;
    // 영문과 숫자: 끝소리 받침(L, M, N, R, 1, 3, 6, 7, 8, 0)
    return /[LMNRlmnr136780]/.test(ch);
  }
  function _eun(w) { return w + (_batchim(w) ? '은' : '는'); }
  function _ieyo(w) { return w + (_batchim(w) ? '이에요' : '예요'); }
  function _gwa(w) { return w + (_batchim(w) ? '과' : '와'); }
  // 액션 낱말: 오픈, 3벳, 4벳, 5벳(올인), 레이즈(림퍼 뒤) / 콜, 체크 / 폴드
  function actionWord(model, g) {
    if (g === 'call') return '콜';
    if (g === 'check') return '체크';
    if (g === 'fold') return '폴드';
    if (g !== 'raise') return '자료 없음';
    if (model.limpers) return '레이즈';
    return model.facing === 'vs4bet' ? '5벳(올인)' : (model.facing === 'vs3bet' || model.facing === 'cold3bet') ? '4벳'
      : model.facing ? '3벳' : '오픈';
  }
  function _gword(model, g) { return g === 'none' ? '자료 없음' : actionWord(model, g); }
  // 표 키 → 상대 자리(뒤에 남은 사람, 자리 문장용). 랜덤은 null
  function _oppPos(key) {
    var m = /^(rfi|3bet|4bet)_([A-Z]+)/.exec(String(key || ''));
    if (m) return POS6.indexOf(m[2]) >= 0 ? m[2] : null;
    if (/^bbdef_/.test(String(key || ''))) return 'BB';
    return null;
  }
  // 이 자리가 그 상대보다 플랍 뒤에 먼저 행동하나(OOP). 모르면 null
  function _oop(model, key) {
    var op = _oppPos(key) || ((model.facing === true && POS6.indexOf(model.opener) >= 0) ? model.opener : null);
    if (!op || op === model.pos) return null;
    return !_ip(model.pos, op);
  }
  // 뒤에 아직 행동할 사람 수. 먼저 오픈은 BEHIND 표 그대로. 오픈 대응은 오프너가 내 앞자리일 때만 BEHIND(내가 림프한 뒤 뒷자리 오픈을 맞으면
  //   뒤 사람은 이미 다 행동했다, 0). 오프너를 모르면 표 키의 자리(rfi_CO 추정 등)로 본다
  function behindCount(model, key) {
    var n = BEHIND[model.pos] || 0;
    if (model.facing !== true) return n;
    var op = POS6.indexOf(model.opener) >= 0 ? model.opener : _oppPos(key);
    if (!op || op === model.pos) return n;
    return POS6.indexOf(op) < POS6.indexOf(model.pos) ? n : 0;
  }
  // 폴드 칸의 "왜 접나" 한 문장(near): 뒤에 남은 사람(먼저 오픈, 오픈 대응) 또는 자리, 아니면 일반
  function _whyFold(model, key) {
    var n = behindCount(model, key);
    // 먼저 오픈은 뒤에 남은 사람이 주된 이유, 오픈 대응은 오픈한 상대 범위(지배당하는 손)가 먼저라 문장을 나눈다
    if (model.facing === false && !model.limpers && n >= 2) return _fill(TEXT.behind, { n: n });
    if (model.facing === true && n >= 2) return _fill(TEXT.behindVs, { n: n });
    if (_oop(model, key) === true) return TEXT.oop;
    return TEXT.generic;
  }
  function _pctNum(v) { return Math.round(v * 100); }

  // 상대 범위 문구에서 꼬리 '상대'를 뗀다. 괄호 덧말이 뒤에 붙은 꼴('CO 오픈 범위 상대(CO 기준)')도 'CO 오픈 범위(CO 기준)'로
  function _vsOf(key, opts) {
    if (opts && opts.vs) return String(opts.vs).replace(/\s*상대(\([^()]*\))?$/, '$1');
    var t = _table(key);
    return t && t.vs ? t.vs : '상대 범위';
  }

  // 칸 하나(3.4절 1번 모양). 표 없음이나 자료 없는 칸은 null 또는 level null
  function cell(model, r, c, key, opts) {
    opts = opts || {};
    var A = analyze(model, key);
    if (!A || r < 0 || r > 12 || c < 0 || c > 12) return null;
    var o = A.cells[r * 13 + c];
    var nd = (opts.need != null && isFinite(opts.need) && opts.need > 0) ? Number(opts.need) : null;
    var vs = _vsOf(key, opts);
    var out = {
      label: o.label, action: o.group, mix: o.mix, eq: o.eq, pct: o.pct != null ? o.pct : null, rank: o.rank || null, of: o.of || null,
      top: o.rank ? Math.max(1, Math.round(o.rank / o.of * 100)) : null,
      edge: !!o.edge, near: !!o.near, trap: !!o.trap, q25: A.q25, overOdds: false,
      level: null, levelName: null, text: [], needText: null, vs: vs
    };
    if (o.group === 'none' || o.eq == null) return out;
    var fold = o.group === 'fold';
    out.overOdds = fold && nd != null && o.eq >= nd * 100;
    if (!fold) out.level = o.edge ? 2 : (o.pct >= 50 ? 0 : 1);
    else out.level = (o.near || o.trap) ? 3 : 4;
    out.levelName = LEVEL_NAME[out.level];
    var a = _gword(model, o.group);
    var bot = o.rank ? Math.max(1, Math.round((o.of - o.rank + 1) / o.of * 100)) : null;
    var needP = nd != null ? _pctNum(nd) : null;
    var T = out.text;
    // 레이즈 칸인데 승률이 콜 칸 가운데값보다 낮다 = 블러프 쪽 레이즈(예 A5s 3벳). 콜 칸이 없는 상황은 해당 없음
    var bluffy = o.group === 'raise' && !o.mix && A.median.call != null && o.eq < A.median.call;
    if (out.level === 0) T.push(_fill(o.rank === 1 ? TEXT.coreTop : TEXT.core, { a: a, top: out.top }));
    else if (out.level === 1) {
      if (bluffy) {
        T.push(_fill(TEXT.normalRaise, { bot: bot }));
        if (o.eq < 50) T.push(_fill(TEXT.normalRaiseBehind, { eq: o.eq }));
      } else T.push(_fill(TEXT.normal, { a: a, bot: bot }));
    } else if (out.level === 2) {
      if (o.mix) {
        var share = o.group === 'raise' ? o.mix.raise : o.mix.call;
        T.push(_fill(TEXT.mix, { n: Math.round(share * 100), a: a }));
      } else {
        var diff = null;
        for (var i = 0; i < o.nb.length; i++) if (o.nb[i].primary !== o.primary && o.nb[i].primary !== 'none') { diff = o.nb[i]; break; }
        if (diff) { var dw = _gword(model, diff.group); T.push(_fill(TEXT.edge, { a: a, nbEun: _eun(diff.label), naIeyo: _ieyo(dw) })); }
        if (bluffy) T.push(_fill(TEXT.normalRaise, { bot: bot }));
      }
    } else if (out.level === 3) {
      var up = null, dn = null;
      o.nb.forEach(function(n) { if (n.group !== 'fold' && n.group !== 'none') { if (n.dir === 'up') up = n; else dn = n; } });
      if (o.near && up) {
        var naU = _gword(model, up.group);
        if (up.mix) T.push(_fill(TEXT.nearUpMix, { na: naU, nb: _eun(up.label), n: Math.round((up.group === 'raise' ? up.mix.raise : up.mix.call) * 100) }));
        else T.push(_fill(TEXT.nearUp, { na: naU, nb: up.label, naIeyo: _ieyo(naU) }));
        if (o.trap) T.push(_fill(TEXT.nearEq, { eq: o.eq }));
        T.push(_whyFold(model, key));
      } else if (o.near && dn) {
        var naD = _gword(model, dn.group);
        T.push(_fill(TEXT.nearDn, { nbEun: _eun(dn.label), naIeyo: _ieyo(naD) }));
        if (o.trap) T.push(_fill(TEXT.nearEq, { eq: o.eq }));
      } else {
        T.push(_fill(TEXT.trap, { eq: o.eq }));
        if (out.overOdds) T.push(_fill(opts.allIn ? TEXT.allInOdds : TEXT.trapOdds, { need: needP }));
        T.push(TEXT.trapWhy);
      }
    } else {
      T.push(_fill(o.eq < 50 ? TEXT.out : TEXT.outEven, { eq: o.eq, vs: vs, vsGwa: _gwa(vs) }));
      if (needP != null) T.push(_fill(out.overOdds ? (opts.allIn ? TEXT.allInOdds : TEXT.outOver) : TEXT.outUnder, { need: needP }));
    }
    if (o.group === 'call' && nd != null) {   // 콜 칸만(레이즈 칸에 콜 손익분기는 엉뚱하다)
      var ref = opts.needRef === 'engine' ? '엔진 계산' : '참고, 표준 크기 기준';
      var d = o.eq - nd * 100;
      out.needText = d >= 0 ? _fill(TEXT.needOk, { need: needP, ref: ref, d: Math.round(d) }) : _fill(TEXT.needShort, { need: needP, ref: ref, d: Math.round(-d) });
    }
    return out;
  }

  // 요약 줄 재료(3.5절 3번): 무리별 콤보 가중 평균 승률, 함정 칸 수, 팟 오즈 넘는 폴드 칸 수, 문장
  function summary(model, key, opts) {
    opts = opts || {};
    var A = analyze(model, key);
    if (!A) return null;
    var nd = (opts.need != null && isFinite(opts.need) && opts.need > 0) ? Number(opts.need) : null;
    var acc = {}, traps = 0, folds = 0, over = 0;
    A.cells.forEach(function(o) {
      if (o.group === 'none' || o.eq == null) return;
      var live = liveCombos(key, o.r, o.c) || 1, base = o.w * live;
      var parts = o.mix ? { raise: o.mix.raise, call: o.mix.call, fold: o.mix.fold } : null;
      var add = function(g, f) { if (!(f > 0)) return; var s = acc[g] || (acc[g] = { num: 0, den: 0, n: 0 }); s.num += o.eq * base * f; s.den += base * f; s.n++; };
      if (parts) { add(o.group === 'check' ? 'check' : 'raise', parts.raise); add('call', parts.call); add('fold', parts.fold); }
      else add(o.group, 1);
      if (o.group === 'fold') {
        folds++;
        if (o.trap) traps++;
        if (nd != null && o.eq >= nd * 100) over++;
      }
    });
    var groups = {};
    Object.keys(acc).forEach(function(g) { groups[g] = { n: acc[g].n, avg: acc[g].den ? acc[g].num / acc[g].den : null }; });
    var t = _table(key), vs = _vsOf(key, opts);
    var order = ['raise', 'check', 'call', 'fold'], parts2 = [];
    order.forEach(function(g) { if (groups[g] && groups[g].avg != null) parts2.push(actionWord(model, g) + ' 칸 ' + Math.round(groups[g].avg) + '%'); });
    var line1 = vs + ' 상대 평균 승률: ' + parts2.join(', ');
    var lines = [line1];
    if (traps > 0) lines.push(_fill(TEXT.sumTrap, { k: traps }));
    // 올인 콜이면 "팟 오즈만으로 콜을 정하지 않는다"가 틀린다(이 콜이 마지막 돈): 그 줄을 빼고 올인 문장
    if (nd != null && over > 0) lines.push(opts.allIn ? _fill(TEXT.allInOdds, { need: _pctNum(nd) }) : _fill(TEXT.sumOdds, { f: folds, k: over, need: _pctNum(nd) }));
    lines.push(TEXT.common);
    return { vs: vs, ref: t ? t.ref : null, groups: groups, traps: traps, overOdds: over, folds: folds, need: nd, q25: A.q25, lines: lines };
  }

  // 레인지 곡선 재료(SvgCharts.rangeCurve): eq 내림차순, 콤보 가중 폭. hc = 내 칸 { r, c } | null
  function points(model, key, hc) {
    var A = analyze(model, key);
    if (!A) return [];
    var out = [];
    A.cells.forEach(function(o) {
      if (o.eq == null || o.group === 'none') return;
      out.push({ label: o.label, eq: o.eq, action: o.group === 'check' ? 'call' : o.group, mine: !!(hc && hc.r === o.r && hc.c === o.c), weight: o.w });
    });
    out.sort(function(a, b) { return (b.eq - a.eq) || (b.weight - a.weight) || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0); });
    return out;
  }

  return { STUB: false, BEHIND: BEHIND, SIZE: SIZE, TEXT: TEXT, LEVEL_NAME: LEVEL_NAME.slice(),
    cell: cell, summary: summary, need: need, standardNeed: standardNeed, points: points,
    analyze: analyze, laneNeighbors: laneNeighbors, liveCombos: liveCombos, actionWord: actionWord, behindCount: behindCount,
    _reset: function() { _anaCache = {}; _anaN = 0; _liveCache = {}; } };
})();
