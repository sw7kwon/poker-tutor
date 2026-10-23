// engine/reasoning.js (n2-P0 계약, 클라우드 L1 구현. 설계 원문 docs/NEXT2_DESIGN.md 5.3절 4번, 6.1절 4번, 지시문 docs/cloud-tasks/L1.md)
// 빌런 결정마다 "왜 그렇게 했나"를 엔진 규칙(ai/villain.js 분기)으로 되짚는다(순수, 해시 파일은 호출만 한다).
//   explain(log, evIndex, opts) → { name, type(숨김이면 null), street, action, amount, label, strength, lines: [문장], chart, odds: { toCall, pot, need },
//     thought(Thinking.villainThought 문장), random: { p, hit, p2?, hit2? } | null, overlay(ov), predicted: { action, amount, label } | null,
//     branches: { hit, miss } | null, mismatch?: true } | null
//     chart = { pos, facing, opener, limpers, sbc, cellLabel, appAction(이 앱 차트 칸 액션), profileIn(손이 든 상대 표 이름 | false(표 밖) | null(숨김)),
//               rangePct(판정에 쓴 표의 콤보 비율), table(판정에 쓴 표 이름: rfi, limp, call, threebet, fourbet, call3, jam) }
//   chartContext(log, evIndex) → { pos, facing(false | true | 'vs3bet' | 'vs4bet' | 'cold3bet'), opener, limpers, sbc } | null(프리플랍 액션만)
// 분기 복제(ai/villain.js를 읽고 같은 식으로, 그 파일은 고치지 않는다):
//   프리플랍 _preflopAction(villain.js 29~77행): sbc 0 오픈/림프/오버림프/폴드, 1 3벳/콜/폴드, 2 4벳/콜(스택 35%)/폴드, 3+ 잼/콜(스택 10%)/폴드.
//     무작위가 없어 predicted가 실제 act와 다르면(적응 보정 ov, 강등) mismatch.
//   포스트플랍 _postflopAction(143~191행): 확률 분기는 random { p, hit }로 적고 hit와 miss 양쪽 결과를 branches에 둔다. 실제 액션이 둘 중 하나가 아니면 mismatch.
//   강도는 Villain._handStrength, 보드 결은 Villain._isBoardWet(복제하지 않는다). 상대 표 판정은 Range.inRange, rangePct는 표를 Range.parse로 펼친 콤보 수 / 1326(캐시).
//   Mixed는 villain.js의 스트리트 맵(preflop TAG, flop LAG, turn TAG, river Fish)으로 프로필을 고른다(블러프 잡음 15%는 lines에 적는다).
// 문장: 해요체, 줄마다 60자 이내, 숫자는 계산값(Math.round). 유형 숨김(log.hidden)이면 유형 낱말 대신 "이 손님"이고 상대 표 줄은 생략한다.
// 규약: 로드 때 DOM, 저장소 접근 없음. Thinking, GtoChart, Villain, VillainProfiles, Range는 typeof 가드(없으면 그 부분만 null). 성능 explain 1ms 이하.
var Reasoning = (function() {
  var STREET_KOR = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버', showdown: '쇼다운' };
  var STR_KOR = { nut: '넛급 손', strong: '강한 손', medium: '중간 손', 'weak-pair': '약한 페어', air: '빈손' };
  var ACT_KOR = { fold: '폴드', check: '체크', call: '콜', bet: '벳', raise: '레이즈', '3bet': '3벳', '4bet': '4벳', allin: '올인' };
  var CELL_KOR = { raise: '레이즈', call: '콜', fold: '폴드', none: '자료 없음' };
  var TABLE_KOR = { rfi: '오픈 표', limp: '림프 예외 표', call: '콜 표', threebet: '3벳 표', fourbet: '4벳 표', call3: '3벳 콜 표', jam: '잼 표' };
  var MIXED_MAP = { preflop: 'TAG', flop: 'LAG', turn: 'TAG', river: 'Fish' };
  var LIGHT = { green: '🟢', yellow: '🟡', red: '🔴' };
  var _pct = {};

  function _card(s) {
    if (!s) return null;
    if (typeof s === 'object') return s;
    if (typeof Deck !== 'undefined' && Deck && typeof Deck.fromString === 'function') return Deck.fromString(s);
    return { rank: s.charAt(0), suit: s.charAt(1) };
  }
  function _cards(arr) { return (arr || []).map(_card).filter(Boolean); }
  function _fmt(v) { var n = Math.round((Number(v) || 0) * 10) / 10; return (n % 1 === 0) ? String(n) : n.toFixed(1); }
  function _pc(p) { return Math.round((Number(p) || 0) * 100); }
  function _player(log, name) {
    var ps = (log && log.players) || [];
    for (var i = 0; i < ps.length; i++) if (ps[i] && ps[i].name === name) return ps[i];
    return null;
  }
  function _inR(hole, str) {
    if (!str || typeof Range === 'undefined' || !Range || hole.length < 2) return false;
    return !!Range.inRange(hole[0], hole[1], str);
  }
  // 표 문자열의 콤보 비율(페어 6, 수딧 4, 오프수트 12 / 1326), 캐시
  function rangePct(str) {
    if (!str || typeof Range === 'undefined' || !Range) return null;
    if (_pct[str] != null) return _pct[str];
    var n = 0;
    Range.parse(str).forEach(function(c) { n += c.length === 2 ? 6 : (c.charAt(2) === 's' ? 4 : 12); });
    _pct[str] = n / 1326;
    return _pct[str];
  }
  function _profile(type, street) {
    if (typeof VillainProfiles === 'undefined' || !VillainProfiles || !type) return null;
    if (type === 'Mixed') return VillainProfiles[MIXED_MAP[street] || 'TAG'] || null;
    return VillainProfiles[type] || null;
  }
  // 그 이벤트 시점의 보드(직전 스트리트 이벤트)
  function _boardAt(log, i) {
    for (var j = i - 1; j >= 0; j--) { var e = log.ev[j]; if (e && e.k === 's') return _cards(e.board); }
    return [];
  }
  function _blindOf(log, pos, names) {
    var b = log.blinds || { sb: 0.5, bb: 1 };
    if (pos === 'BB') return b.bb;
    if (pos === 'SB') return b.sb;
    if (pos === 'BTN' && names === 2) return b.sb;   // HU는 BTN이 SB
    return 0;
  }

  // ── 차트 위치(이 앱 차트) ──
  function chartContext(log, i) {
    if (!log || !Array.isArray(log.ev)) return null;
    var e = log.ev[i];
    if (!e || e.k !== 'a' || (e.st && e.st !== 'preflop')) return null;
    var p = _player(log, e.n);
    if (!p) return null;
    var pre = e.pre || {}, sbc = pre.sbc || 0, bb = (log.blinds && log.blinds.bb) || 1;
    var facing, opener = null, limpers = 0;
    if (sbc === 0) { facing = false; limpers = Math.max(0, Math.round(((pre.pot || 0) - 1.5 * bb) / bb)); }
    else if (sbc === 1) facing = true;
    else if (sbc === 2) {
      var vol = (pre.have || 0) - _blindOf(log, p.pos, (log.players || []).length);
      facing = vol > 1e-9 ? 'vs3bet' : 'cold3bet';
    } else facing = 'vs4bet';
    if (pre.lr) { var lp = _player(log, pre.lr); opener = lp ? lp.pos : null; }
    return { pos: p.pos, facing: facing, opener: opener, limpers: limpers, sbc: sbc };
  }

  function _chart(log, i, hole, pf, table, hidden) {
    var ctx = chartContext(log, i);
    if (!ctx) return null;
    var inT = table && table.in ? table : (pf && pf.open && pf.open.in ? pf.open : null);   // 손이 든 상대 표(림프는 오픈 표 안)
    var out = { pos: ctx.pos, facing: ctx.facing, opener: ctx.opener, limpers: ctx.limpers, sbc: ctx.sbc, cellLabel: null, appAction: null,
      profileIn: hidden ? null : (inT ? inT.name : false), rangePct: hidden || !table || !table.str ? null : rangePct(table.str), table: hidden || !table ? null : table.name };
    if (typeof GtoChart !== 'undefined' && GtoChart && typeof GtoChart.cachedModel === 'function' && hole.length === 2) {
      try {
        var m = GtoChart.cachedModel(ctx.pos, ctx.facing, ctx.facing === true ? ctx.opener : null, ctx.facing === false ? ctx.limpers : 0);
        var rc = GtoChart.handCell(hole), cell = m && m.cells && m.cells[rc.r] && m.cells[rc.r][rc.c];
        if (cell) {
          out.cellLabel = cell.label;
          out.appAction = (typeof GtoChart.primaryAction === 'function') ? GtoChart.primaryAction(cell) : cell.action;
        }
      } catch (err) { /* 차트 모델이 없으면 칸 없이 */ }
    }
    return out;
  }

  // ── 프리플랍 복제(ai/villain.js _preflopAction) ──
  // 반환 { action, amount, label?, table: { name, str, in }, why }
  function _preflop(profile, pos, hole, pre, bb) {
    var have = pre.have || 0, stack = pre.stack || 0, maxTo = have + stack;
    var cb = pre.cb || 0, toCall = Math.max(0, cb - have), sbc = pre.sbc || 0;
    var cvr = profile.call_vs_raise || {};
    function inR(s) { return !!s && _inR(hole, s); }
    function jamOr(to) {
      to = Math.min(maxTo, Math.round(to * 2) / 2);
      if (to >= 0.4 * maxTo) to = maxTo;
      return to;
    }
    function call() { return { action: 'call', amount: Math.min(toCall, stack) }; }
    var r, t;
    if (sbc === 0) {
      if (toCall === 0) { r = { action: 'check', amount: 0 }; r.why = 'bbopt'; return r; }
      var limpers = Math.max(0, Math.round(((pre.pot || 0) - 1.5 * bb) / bb));
      t = { name: 'rfi', str: (profile.rfi || {})[pos] || '', in: inR((profile.rfi || {})[pos]) };
      if (t.in) {
        if (profile.limp_unless && !inR(profile.limp_unless)) { r = call(); r.why = 'limp'; r.table = { name: 'limp', str: profile.limp_unless, in: false }; r.open = t; return r; }
        r = { action: 'raise', amount: jamOr((pos === 'BTN' ? 2.5 : 3) * bb + limpers * bb) }; r.why = 'open'; r.table = t; r.limpers = limpers; return r;
      }
      if (limpers > 0 && profile.limp_unless && inR(cvr[pos])) { r = call(); r.why = 'overlimp'; r.table = { name: 'call', str: cvr[pos], in: true }; r.limpers = limpers; return r; }
      r = { action: 'fold', amount: 0 }; r.why = 'foldopen'; r.table = t; r.limpers = limpers; return r;
    }
    if (toCall <= 0) { r = { action: 'check', amount: 0 }; r.why = 'free'; return r; }
    if (sbc === 1) {
      t = { name: 'threebet', str: profile.threebet_range || '', in: inR(profile.threebet_range) };
      if (t.in) { var mul = (pos === 'SB' || pos === 'BB') ? 3.5 : 3; r = { action: '3bet', amount: jamOr(cb * mul), label: '3벳' }; r.why = '3bet'; r.table = t; r.mul = mul; return r; }
      var c1 = { name: 'call', str: cvr[pos] || '', in: inR(cvr[pos]) };
      if (c1.in) { r = call(); r.why = 'callopen'; r.table = c1; r.alt = t; return r; }
      r = { action: 'fold', amount: 0 }; r.why = 'foldopen1'; r.table = t; r.alt = c1; return r;
    }
    if (sbc === 2) {
      t = { name: 'fourbet', str: profile.fourbet || '', in: inR(profile.fourbet) };
      if (t.in) { r = { action: 'raise', amount: jamOr(cb * 2.3), label: '4벳' }; r.why = '4bet'; r.table = t; return r; }
      var c3 = { name: 'call3', str: profile.call_vs_3bet || '', in: inR(profile.call_vs_3bet) };
      if (c3.in && toCall <= 0.35 * stack) { r = call(); r.why = 'call3'; r.table = c3; return r; }
      r = { action: 'fold', amount: 0 }; r.why = c3.in ? 'fold3price' : 'fold3'; r.table = c3.in ? c3 : t; r.alt = c3; return r;
    }
    t = { name: 'jam', str: profile.jam || '', in: inR(profile.jam) };
    if (t.in) { r = { action: 'raise', amount: maxTo, label: '올인' }; r.why = 'jam'; r.table = t; return r; }
    if (toCall <= 0.1 * stack) { r = call(); r.why = 'call4'; r.table = t; return r; }
    r = { action: 'fold', amount: 0 }; r.why = 'fold4'; r.table = t; return r;
  }

  // ── 포스트플랍 복제(ai/villain.js _postflopAction) ──
  // 반환 { det: { action, amount } | null, random: { p, p2? } | null, hit: {...}, miss: {...}, miss2?: {...}, why, big, cbetFreq }
  function _postflop(profile, name, hole, board, pre, street, strength, wet) {
    var pot = pre.pot || 0, stack = pre.stack || 0, have = pre.have || 0;
    var toCall = Math.max(0, (pre.cb || 0) - have);
    var cbetFreq = wet ? profile.cbet.wet : profile.cbet.dry;
    var maxTo = have + stack;
    var raiseTo = function(x) { return Math.min(maxTo, Math.round(x * 2) / 2); };
    var call = function() { return { action: 'call', amount: Math.min(toCall, stack) }; };
    var reraise = function() { return { action: 'raise', amount: raiseTo((pre.cb || 0) * 2.5) }; };
    var CHECK = { action: 'check', amount: 0 }, FOLD = { action: 'fold', amount: 0 };
    var strongish = strength === 'nut' || strength === 'strong';
    var o = { det: null, random: null, hit: null, miss: null, why: '', big: false, cbetFreq: cbetFreq, toCall: toCall };
    if (toCall === 0) {
      if (pre.pfa && pre.pfa === name && street === 'flop') {
        var cb = { action: 'bet', amount: raiseTo(have + pot * (wet ? 0.67 : 0.4)) };
        if (strongish) { o.det = cb; o.why = 'cbet-strong'; return o; }
        o.random = { p: cbetFreq }; o.hit = cb; o.miss = CHECK; o.why = 'cbet'; return o;
      }
      if (strongish) { o.det = { action: 'bet', amount: raiseTo(have + pot * profile.bet_sizing.value) }; o.why = 'value'; o.size = profile.bet_sizing.value; return o; }
      if (strength === 'medium') { o.random = { p: cbetFreq * 0.4 }; o.hit = { action: 'bet', amount: raiseTo(have + pot * profile.bet_sizing.value) }; o.miss = CHECK; o.why = 'thin'; return o; }
      o.random = { p: profile.bluff_freq }; o.hit = { action: 'bet', amount: raiseTo(have + pot * profile.bet_sizing.bluff) }; o.miss = CHECK; o.why = 'bluff'; return o;
    }
    var big = toCall / (pot + toCall) >= 0.30, ftc = profile.fold_to_cbet;
    o.big = big;
    if (strength === 'nut') { o.det = reraise(); o.why = 'nut-raise'; return o; }
    if (strength === 'strong') { o.random = { p: profile.bluff_freq }; o.hit = reraise(); o.miss = call(); o.why = 'strong'; return o; }
    if (strength === 'medium') {
      if (big) { o.random = { p: ftc * 0.3 }; o.hit = FOLD; o.miss = call(); o.why = 'medium-big'; return o; }
      o.det = call(); o.why = 'medium-call'; return o;
    }
    if (strength === 'weak-pair') { o.random = { p: Math.min(0.95, ftc * (big ? 1.2 : 0.7)) }; o.hit = FOLD; o.miss = call(); o.why = 'weak'; return o; }
    o.random = { p: Math.min(0.95, ftc * 1.6 + 0.15), p2: profile.bluff_freq * 0.4 }; o.hit = FOLD; o.miss = reraise(); o.miss2 = call(); o.why = 'air'; return o;
  }

  function _same(a, act, amt) {
    if (!a) return false;
    if (a.action !== act) return false;
    if (act === 'fold' || act === 'check') return true;
    return Math.abs((a.amount || 0) - (amt || 0)) < 0.011;
  }
  function _cut(s) { s = String(s || ''); return s.length > 60 ? s.slice(0, 59) + '…' : s; }
  // 이에요/예요: 끝 글자 받침(한글)이나 bb(비비)로 고른다
  function _ieyo(w) {
    w = String(w || '');
    if (/bb$/.test(w)) return w + '예요';
    var c = w.charCodeAt(w.length - 1);
    if (c >= 0xAC00 && c <= 0xD7A3) return w + ((c - 0xAC00) % 28 > 0 ? '이에요' : '예요');
    return w + '이에요';
  }
  // 은/는(한글 받침 기준)
  function _eun(w) { w = String(w || ''); var c = w.charCodeAt(w.length - 1); return w + ((c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 > 0) ? '은' : '는'); }

  // ── 문장 ──
  function _pfLines(who, pos, r, act, amt, toCall, hidden) {
    var L = [], t = r.table, pct = t && !hidden && t.str ? '(약 ' + _pc(rangePct(t.str)) + '%)' : '';
    var tn = t ? TABLE_KOR[t.name] : '';
    switch (r.why) {
      case 'bbopt': L.push(who + '의 블라인드 옵션, 낼 칩이 없어 체크해요'); break;
      case 'free': L.push(who + '의 차례지만 더 낼 칩이 없어 체크해요'); break;
      case 'open':
        L.push(hidden ? who + '이 ' + pos + '에서 먼저 ' + _fmt(r.amount) + 'bb 오픈해요' : who + '의 ' + pos + ' 오픈 표' + pct + ' 안의 손이라 ' + _fmt(r.amount) + 'bb 오픈해요');
        if (r.limpers > 0) L.push('림퍼 ' + r.limpers + '명만큼 ' + r.limpers + 'bb를 더 올려요');
        break;
      case 'limp':
        L.push(hidden ? who + '은 레이즈 대신 ' + _fmt(toCall) + 'bb 림프해요' : who + '의 오픈 표 안이라도 림프 예외 표 밖이면 림프해요');
        break;
      case 'overlimp':
        L.push(hidden ? who + '은 림퍼 뒤에서 따라 림프해요' : '림퍼 ' + r.limpers + '명 뒤, ' + who + '의 콜 표' + pct + ' 안이라 따라 림프해요');
        break;
      case 'foldopen':
        L.push(hidden ? who + '은 먼저 열 자리에서 폴드해요' : who + '의 ' + pos + ' 오픈 표' + pct + ' 밖의 손이라 폴드해요');
        break;
      case '3bet':
        L.push(hidden ? who + '이 오픈에 ' + _fmt(r.amount) + 'bb 3벳해요' : who + '의 3벳 표' + pct + ' 안이라 ' + r.mul + '배 ' + _fmt(r.amount) + 'bb 3벳해요');
        if (!hidden && r.label === '3벳' && r.amount >= (r.maxTo || Infinity)) L.push('스택의 40% 이상이라 올인으로 밀어요');
        break;
      case 'callopen':
        L.push(hidden ? who + '이 오픈을 ' + _fmt(r.amount) + 'bb 콜해요' : who + '의 ' + pos + ' 콜 표' + pct + ' 안이라 ' + _fmt(r.amount) + 'bb 콜해요');
        break;
      case 'foldopen1':
        L.push(hidden ? who + '은 오픈에 폴드해요' : who + '의 3벳 표도 콜 표도 아니라 폴드해요');
        break;
      case '4bet':
        L.push(hidden ? who + '이 3벳에 ' + _fmt(r.amount) + 'bb 4벳해요' : who + '의 4벳 표' + pct + ' 안이라 2.3배 ' + _fmt(r.amount) + 'bb 4벳해요');
        break;
      case 'call3':
        L.push(hidden ? who + '이 3벳을 ' + _fmt(r.amount) + 'bb 콜해요' : who + '의 3벳 콜 표' + pct + ' 안이고 콜이 스택의 35% 이하라 콜해요');
        break;
      case 'fold3price':
        L.push(hidden ? who + '은 3벳에 폴드해요' : '3벳 콜 표 안이지만 콜이 스택의 35%를 넘어 폴드해요');
        break;
      case 'fold3':
        L.push(hidden ? who + '은 3벳에 폴드해요' : who + '의 4벳 표도 3벳 콜 표도 아니라 폴드해요');
        break;
      case 'jam':
        L.push(hidden ? who + '이 4벳에 올인해요' : who + '의 잼 표' + pct + ' 안이라 올인해요');
        break;
      case 'call4':
        L.push(hidden ? who + '이 4벳을 콜해요' : '잼 표 밖이지만 콜이 스택의 10% 이하라 콜해요');
        break;
      case 'fold4':
        L.push(hidden ? who + '은 4벳에 폴드해요' : who + '의 잼 표' + pct + ' 밖이고 콜이 커서 폴드해요');
        break;
      default: L.push(who + '의 선택은 ' + _ieyo(ACT_KOR[act] || act)); break;
    }
    return L;
  }
  function _poLines(who, street, strength, wet, o, act, random, hidden) {
    var L = [], sk = STR_KOR[strength] || strength, stK = STREET_KOR[street] || street;
    var tex = street === 'river' ? '' : (wet ? ', 드로우가 많은 보드예요' : ', 드라이한 보드예요');
    L.push(stK + '에서 ' + who + '의 손은 ' + sk + tex);
    var p = o.random ? _pc(o.random.p) : null, hit = random && random.hit;
    var took = ACT_KOR[act] || act;
    switch (o.why) {
      case 'cbet-strong': L.push('프리플랍 레이저이고 강한 손이라 늘 c벳해요'); break;
      case 'cbet': L.push('프리플랍 레이저라 ' + p + '% 확률로 c벳하는데 이번엔 ' + (hit ? '벳' : '체크') + '했어요'); break;
      case 'value': L.push('강한 손이라 늘 팟의 ' + _pc(o.size) + '%만큼 밸류 벳해요'); break;
      case 'thin': L.push('중간 손은 ' + p + '% 확률로 얇게 벳하는데 이번엔 ' + (hit ? '벳' : '체크') + '했어요'); break;
      case 'bluff': L.push(_eun(sk) + ' ' + p + '% 확률로 블러프 벳하는데 이번엔 ' + (hit ? '벳' : '체크') + '했어요'); break;
      case 'nut-raise': L.push('넛급 손은 벳을 맞으면 늘 2.5배 레이즈해요'); break;
      case 'strong': L.push('강한 손은 ' + p + '% 확률로 레이즈하고 아니면 콜, 이번엔 ' + took); break;
      case 'medium-big': L.push('큰 벳에 중간 손은 ' + p + '% 확률로 접는데 이번엔 ' + took + '했어요'); break;
      case 'medium-call': L.push('작은 벳이라 중간 손은 늘 콜해요'); break;
      case 'weak': L.push((o.big ? '큰' : '작은') + ' 벳에 약한 페어는 ' + p + '% 확률로 접는데 이번엔 ' + took + '했어요'); break;
      case 'air':
        L.push('빈손은 ' + p + '% 확률로 접고, 남으면 ' + _pc(o.random.p2) + '% 확률로 블러프 레이즈, 이번엔 ' + took);
        break;
      default: break;
    }
    return L;
  }
  function _heroLines(h, act, amt, chart) {
    var L = [], a = ACT_KOR[h.executed || act] || act;
    var s = '내 결정 ' + a + (amt > 0 && act !== 'fold' && act !== 'check' ? ' ' + _fmt(amt) + 'bb' : '');
    if (h.verdict) {
      s += ', 판정 ' + (LIGHT[h.light] || '') + ' 추천 ' + (ACT_KOR[h.verdict] || h.verdict);
      if (h.bestEV != null && h.actualEV != null) s += '(EV ' + (Math.round((h.actualEV - h.bestEV) * 10) / 10) + 'bb)';
    }
    L.push(s);
    if (chart && chart.cellLabel) L.push('이 앱 차트 기준 ' + chart.cellLabel + ' 칸은 ' + _ieyo(CELL_KOR[chart.appAction] || chart.appAction));
    if (h.eq != null) L.push('결정 때 내 승률은 약 ' + _pc(h.eq) + '%였어요');
    return L;
  }

  function _thought(log, i, e, board, hidden) {
    if (typeof Thinking === 'undefined' || !Thinking || typeof Thinking.villainThought !== 'function') return null;
    var players = {}, hole = {}, bets = {};
    (log.players || []).forEach(function(p) {
      if (!p || !p.name) return;
      players[p.name] = { name: p.name, type: p.hero ? 'Hero' : (hidden ? null : p.type), pos: p.pos, isHero: !!p.hero };
      hole[p.name] = _cards(log.hole && log.hole[p.name]);
      bets[p.name] = 0;
    });
    bets[e.n] = e.pre.have || 0;
    var stateLike = { players: players, holeCards: hole, board: board, street: e.st || 'preflop', hideTypes: hidden,
      pot: e.pre.pot || 0, currentBet: e.pre.cb || 0, playerBets: bets, handNum: log.handNum, seed: log.seed };
    try {
      var t = Thinking.villainThought(stateLike, e.n, e.act, e.amt, { snapshot: { potBefore: e.pre.pot || 0, currentBetBefore: e.pre.cb || 0, haveBefore: e.pre.have || 0 }, label: e.lbl || undefined });
      return t && t.text ? t.text : null;
    } catch (err) { return null; }
  }

  function explain(log, i, opts) {
    opts = opts || {};
    if (!log || !Array.isArray(log.ev)) return null;
    var e = log.ev[i];
    if (!e || e.k !== 'a' || !e.pre) return null;
    var p = _player(log, e.n);
    if (!p) return null;
    var hidden = !!log.hidden, street = e.st || 'preflop', pre = e.pre;
    var hole = _cards(log.hole && log.hole[e.n]), board = street === 'preflop' ? [] : _boardAt(log, i);
    var toCall = Math.max(0, (pre.cb || 0) - (pre.have || 0)), pot = pre.pot || 0;
    var odds = { toCall: Math.round(toCall * 100) / 100, pot: Math.round(pot * 100) / 100, need: toCall > 0 ? Math.round(toCall / (pot + toCall) * 1000) / 1000 : 0 };
    var V = (typeof Villain !== 'undefined' && Villain) ? Villain : null;
    var strength = (street !== 'preflop' && V && typeof V._handStrength === 'function' && board.length >= 3 && hole.length === 2) ? V._handStrength(hole, board) : null;
    var wet = (street !== 'preflop' && V && typeof V._isBoardWet === 'function') ? !!V._isBoardWet(board) : null;
    var out = { name: e.n, type: hidden && !p.hero ? null : (p.type || null), street: street, action: e.act, amount: e.amt, label: e.lbl || null,
      strength: strength, wet: wet, lines: [], chart: null, odds: odds, thought: null, random: null, overlay: e.ov || null, predicted: null, branches: null };
    var who = hidden ? '이 손님' : (p.type || e.n);

    // 히어로 결정
    if (p.hero || e.n === 'Hero') {
      var h = e.hero && typeof e.hero === 'object' ? e.hero : { intended: e.act };
      out.chart = street === 'preflop' ? _chart(log, i, hole, null, null, true) : null;
      if (out.chart) { out.chart.profileIn = null; out.chart.rangePct = null; out.chart.table = null; }
      out.lines = _heroLines(h, e.act, e.amt, out.chart).map(_cut);
      out.hero = h;
      if (strength) out.lines.unshift(_cut(STREET_KOR[street] + '에서 내 손은 ' + (STR_KOR[strength] || strength)));
      return out;
    }

    var profile = hidden ? null : _profile(p.type, street);
    if (street === 'preflop') {
      var bb = (log.blinds && log.blinds.bb) || 1;
      var r = profile && hole.length === 2 ? _preflop(profile, p.pos, hole, pre, bb) : null;
      if (r) {
        r.maxTo = (pre.have || 0) + (pre.stack || 0);
        out.predicted = { action: r.action, amount: Math.round(r.amount * 100) / 100, label: r.label || null };
        out.lines = _pfLines(who, p.pos, r, e.act, e.amt, toCall, false);
        if (!_same(r, e.act, e.amt)) out.mismatch = true;
      } else {
        out.lines = _pfLines(who, p.pos, { why: hidden ? _hiddenWhy(pre, e.act) : 'x', amount: e.amt, table: null }, e.act, e.amt, toCall, true);
      }
      out.chart = _chart(log, i, hole, r, r && r.table, hidden);
      if (out.chart && out.chart.cellLabel && !p.hero) out.lines.push('이 앱 차트 기준 ' + out.chart.cellLabel + ' 칸은 ' + _ieyo(CELL_KOR[out.chart.appAction] || out.chart.appAction));
    } else {
      var o = profile && strength ? _postflop(profile, e.n, hole, board, pre, street, strength, wet) : null;
      if (o) {
        if (o.det) {
          out.predicted = { action: o.det.action, amount: Math.round(o.det.amount * 100) / 100, label: null };
          if (!_same(o.det, e.act, e.amt)) out.mismatch = true;
        } else {
          var hit = _same(o.hit, e.act, e.amt), miss = _same(o.miss, e.act, e.amt), miss2 = o.miss2 ? _same(o.miss2, e.act, e.amt) : false;
          out.random = { p: Math.round(o.random.p * 1000) / 1000, hit: hit };
          if (o.random.p2 != null) { out.random.p2 = Math.round(o.random.p2 * 1000) / 1000; out.random.hit2 = !hit && miss; }
          out.branches = { hit: o.hit, miss: o.miss };
          if (o.miss2) out.branches.miss2 = o.miss2;
          if (!hit && !miss && !miss2) out.mismatch = true;
          // 강등(벳이 민벳 미만이라 체크)이면 실제 액션으로 hit를 정한다
          if (!hit && !miss && !miss2 && o.hit.action === 'bet' && e.act === 'check') out.random.hit = false;
        }
        out.lines = _poLines(who, street, strength, wet, o, e.act, out.random, hidden);
        if (p.type === 'Mixed') out.mixedNoise = (typeof VillainProfiles !== 'undefined' && VillainProfiles.Mixed) ? VillainProfiles.Mixed.noise : 0.15;   // 블러프 잡음은 화면이 적는다(규칙 2줄 유지)
      } else {
        var sk = strength ? (STR_KOR[strength] || strength) : '';
        out.lines = [STREET_KOR[street] + '에서 ' + who + (sk ? '의 손은 ' + sk : '') + (wet === true ? ', 드로우가 많은 보드예요' : wet === false ? ', 드라이한 보드예요' : ''),
          who + '의 선택은 ' + _ieyo((ACT_KOR[e.act] || e.act) + (e.amt > 0 && e.act !== 'fold' && e.act !== 'check' ? ' ' + _fmt(e.amt) + 'bb' : ''))];
      }
    }
    // 팟 오즈 줄은 odds 필드로 화면이 적는다(규칙 문장은 2줄 이내)
    if (out.mismatch) out.lines.push('(보정이나 강등으로 표와 달랐어요)');
    out.lines = out.lines.map(_cut);
    out.thought = _thought(log, i, e, board, hidden);
    return out;
  }
  // 숨김 테이블(프로필 없음) 프리플랍 문장용 분기 이름: 실제 액션과 sbc로 고른다
  function _hiddenWhy(pre, act) {
    var sbc = pre.sbc || 0, toCall = Math.max(0, (pre.cb || 0) - (pre.have || 0));
    if (act === 'check') return toCall === 0 && sbc === 0 ? 'bbopt' : 'free';
    if (sbc === 0) return act === 'fold' ? 'foldopen' : (act === 'call' ? 'limp' : 'open');
    if (sbc === 1) return act === 'fold' ? 'foldopen1' : (act === 'call' ? 'callopen' : '3bet');
    if (sbc === 2) return act === 'fold' ? 'fold3' : (act === 'call' ? 'call3' : '4bet');
    return act === 'fold' ? 'fold4' : (act === 'call' ? 'call4' : 'jam');
  }

  var api = { explain: explain, chartContext: chartContext, rangePct: rangePct, _preflop: _preflop, _postflop: _postflop, _profile: _profile, MIXED_MAP: MIXED_MAP };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
