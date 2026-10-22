// journey/views/range-lab.js (채우는 그룹: 로컬 G5 RANGE LAB. 설계 원문 docs/NEXT_BATCH_DESIGN.md '1+' 절 G5)
// 🗺 레인지 학습실(RangeLabView): JourneyUI.view('rangeLab', params)가 open(params, el)로 연다(VIEWS 등록과 홈 빠른 줄 버튼은 P0).
//   params: 문자열 스팟 키('rfi|CO', 'vsRfi|BB@BTN', 'vs3bet|BTN', 'vs4bet|SB', 'cold3bet|ANY', 'iso1|CO', 'iso2|BTN', 해시 복원도 같은 문자열),
//     또는 객체 { pos, facing, opener, limpers, tab }(차트 시트의 '학습실에서 크게 보기'가 GtoChart 모델 필드를 그대로 넘긴다) 또는 { spot, tab }.
//     없으면 마지막으로 본 스팟(poker_journey.rangeLab.last), 그것도 없으면 'rfi|CO'.
// 탭 4개:
//   1. 📋 차트(탐색): 상황(오픈, 상대 오픈 대응, 3벳 맞음, 4벳 맞음, 콜드 3벳, 림퍼 1명과 2명 뒤)과 자리(필요하면 오프너)를 칩으로 골라
//      13x13 표를 화면 폭 전체로 본다. 작은 칸(<i>, 폰 412에서 29px)을 누르면 그 줄이 아래 '크게 보기' 줄(44px 버튼 13개)로 열리고 칸이
//      선택되어 표 바로 아래 한 줄 읽기(분류, 액션)와 설명 카드(RangeNotes.explain: 분류 이유 + 이 칸의 액션 + '이 앱 차트 기준' 라벨)가
//      보인다(카드가 화면 아래 가려져 있으면 그만큼만 스크롤). 같은 분류 칸은 점선으로 옅게 강조.
//      범례는 액션별 비율("레이즈 27%, 358콤보")과 참여 상위 %를 적는다. 아래 '자리 비교 띠'는 같은 상황의 자리별 참여 %를 막대(띠 안 최대값
//      기준 높이)로 보이고 누르면 그 자리로 바뀐다. 상대 오픈 대응은 오프너보다 뒤 자리만 띠와 비교에 넣는다(validPos). 림퍼 뒤 BB 표의
//      콜 칸은 체크(공짜)라 참여(playCells, stats.play, diff)로 세지 않는다.
//   2. ↔ 비교: 같은 상황의 두 자리를 겹쳐 본다. 두 자리 모두 들어오는 칸은 옅게, B에서 새로 들어오는 칸은 ✚와 밝은 테두리, A에만 있던 칸은
//      빗금. 오픈 상황은 ▶ 재생으로 UTG, HJ, CO, BTN 순서로 넓어지는 애니메이션(단계마다 새 칸이 커지며 들어옴, 1.1초, 모션 줄이기면 짧게).
//   3. ✏ 외우기: lessons/widgets/range-paint.js의 RangePaint 부품을 그대로 쓴다(빈 격자에 참여하는 손을 칠하고 겹침 채점). 채점기가 있는
//      스팟(rfi, vsRfi, vs3bet)만 되고, 채점 결과로 칸별 숙련도를 기록한다. 👀 정답 보기 토글로 표를 잠깐 본다.
//   4. 📈 진도: 상황별 숙련도 막대(정답 칸 중 마지막에 맞힌 칸의 비율)와 오늘 복습할 칸 수, 🔁 복습 퀴즈(기한이 된 칸을 한 칸씩 묻고 설명).
// 칸별 숙련도(간격 복습): poker_journey.rangeLab = { v:1, last, spots: { 스팟키: { cells: { 칸: { box 0~4, due(ms|null), n, ok, lastOk, lastAt } },
//   grades, best, lastAt } } }(Journey.load/save로만, Journey가 없으면 메모리). 일정은 journey/review-queue.js와 같은 식(맞히면 상자 1~4 = 1, 3, 7, 21일
//   뒤의 로컬 0시, 21일 차에 맞히면 졸업 box 5, 틀리면 box 0에 다음 날, 기한 전에 맞힌 것은 상자 그대로). ReviewQueue.items에는 넣지 않는다(그 항목은 실수 핸드 seed이고 오늘의 5분
//   복습 블록이 App.startPractice로 연다). dueCount(now)로 전체 기한 칸 수를 준다(Today 연결은 코디네이터 결정).
// 차트 데이터는 GtoChart.buildChartModel, buildIsoModel을 읽기만 하고(ui/gto-chart.js는 G4 소유) 스팟마다 1회 캐시한다.
// 규약: 로드 시 DOM 접근 없음. html(params)은 순수 문자열(테스트용). 다른 모듈(GtoChart, Gto, RangeNotes, RangePaint, Journey, JourneyUI,
//   A11y, Nav)은 전부 typeof 가드. 문구는 해요체, 가운뎃점과 긴줄표 금지. 스타일은 css/range-lab.css(.rl- 접두).
var RangeLabView = (function() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : this);
  var POS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
  var KINDS = [
    { k: 'rfi', t: '오픈', s: '앞 전원 폴드', facing: false },
    { k: 'vsRfi', t: '상대 오픈에 대응', s: '3벳, 콜, 폴드', facing: true },
    { k: 'vs3bet', t: '3벳을 맞음', s: '내 오픈 뒤', facing: 'vs3bet' },
    { k: 'vs4bet', t: '4벳을 맞음', s: '내 3벳 뒤', facing: 'vs4bet' },
    { k: 'cold3bet', t: '콜드 3벳 직면', s: '자리 무관', facing: 'cold3bet' },
    { k: 'iso1', t: '림퍼 1명 뒤', s: '아이솔', limpers: 1 },
    { k: 'iso2', t: '림퍼 2명 뒤', s: '한 칸 좁게', limpers: 2 }
  ];
  var KIND_BY = {};
  KINDS.forEach(function(k) { KIND_BY[k.k] = k; });
  var TABS = [['explore', '📋', '차트'], ['compare', '↔', '비교'], ['paint', '✏', '외우기'], ['progress', '📈', '진도']];
  var DEFAULT_SPOT = 'rfi|CO';
  // 진도 탭에 늘 보이는 기본 스팟(퍼즐 rangepaint PAINT_SPOTS와 같은 10개)
  var CORE_SPOTS = ['rfi|UTG', 'rfi|HJ', 'rfi|CO', 'rfi|BTN', 'rfi|SB', 'vsRfi|BB@BTN', 'vsRfi|BB@UTG', 'vsRfi|BTN@CO', 'vsRfi|SB@BTN', 'vs3bet|BTN'];
  var INTERVALS = [1, 3, 7, 21], GRAD = 5, QUIZ_MAX = 10;   // 상자 1~4의 기한(일), 상자 5 = 졸업
  var ANIM_SEQ = ['UTG', 'HJ', 'CO', 'BTN'];
  var ANIM_MS = 1100, ANIM_MS_REDUCED = 450;
  var ACT_SHORT = { raise: 'R', call: 'C', fold: 'F' };

  var _el = null, _tab = 'explore', _sel = null, _cell = null, _row = 0, _rowOn = false, _focus = null, _pickOpen = false, _scroll = null;
  var _cmp = { a: null, b: null, step: -1, timer: null };
  var _paint = { st: null, off: null, peek: false, key: null };
  var _quiz = null;
  var _models = {}, _mem = null;

  // ── 작은 도구 ─────────────────────────────────────────
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function _m(name) { var o = G[name]; return (o && (typeof o === 'object' || typeof o === 'function')) ? o : null; }
  function _fn(o, k) { return !!o && typeof o[k] === 'function'; }
  function _num(x, d) { x = Number(x); return isFinite(x) ? x : d; }
  function _now(now) { return (typeof now === 'number' && isFinite(now)) ? now : Date.now(); }
  function _iso(t) { return new Date(t).toISOString(); }
  function _dueAt(t, n) { var d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); }
  function _isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function _reduced() { var A = _m('A11y'); try { return !!(A && _fn(A, 'reduced') && A.reduced()); } catch (e) { return false; } }
  function _toast(msg) { var J = _m('JourneyUI'); if (J && _fn(J, 'toast')) { try { J.toast(msg); } catch (e) { /* 무시 */ } } }
  function label(r, c) {
    if (r === c) return RANKS[r] + RANKS[r];
    if (r < c) return RANKS[r] + RANKS[c] + 's';
    return RANKS[c] + RANKS[r] + 'o';
  }
  function rcOf(l) {
    l = String(l == null ? '' : l);
    var a = RANKS.indexOf(l.charAt(0)), b = RANKS.indexOf(l.charAt(1));
    if (a < 0 || b < 0) return null;
    if (l.length === 2) return a === b ? { r: a, c: a } : null;
    if (l.length !== 3 || a >= b) return null;
    if (l.charAt(2) === 's') return { r: a, c: b };
    if (l.charAt(2) === 'o') return { r: b, c: a };
    return null;
  }
  function weight(l) { return l.length === 2 ? 6 : (l.charAt(2) === 's' ? 4 : 12); }
  function _rankName(r) { return RANKS[r] === 'T' ? 'T(10)' : RANKS[r]; }

  // ── 스팟(상황 + 자리) ─────────────────────────────────
  function posList(kind) {
    if (kind === 'rfi') return ['UTG', 'HJ', 'CO', 'BTN', 'SB'];
    if (kind === 'vsRfi') return ['HJ', 'CO', 'BTN', 'SB', 'BB'];
    if (kind === 'vs3bet' || kind === 'vs4bet') return POS.slice();
    if (kind === 'cold3bet') return [];
    if (kind === 'iso1') return ['HJ', 'CO', 'BTN', 'SB', 'BB'];
    if (kind === 'iso2') return ['CO', 'BTN', 'SB', 'BB'];
    return [];
  }
  function openerList(kind, pos) {
    if (kind !== 'vsRfi') return [];
    var i = POS.indexOf(pos);
    return i > 0 ? POS.slice(0, i) : [];
  }
  function _defaultOpener(pos) { return pos === 'BB' ? 'BTN' : (POS[POS.indexOf(pos) - 1] || 'UTG'); }
  // 어떤 입력이든 올바른 선택으로 맞춘다(없는 자리는 목록 첫 자리, 오프너는 바로 앞 자리, BB는 BTN)
  function normalize(sel) {
    var s = _isObj(sel) ? sel : {};
    var kind = KIND_BY[s.kind] ? s.kind : 'rfi';
    var list = posList(kind), pos = list.indexOf(s.pos) >= 0 ? s.pos : (list[0] || null);
    if (kind === 'cold3bet') pos = null;
    var opener = null;
    if (kind === 'vsRfi') { var ol = openerList(kind, pos); opener = ol.indexOf(s.opener) >= 0 ? s.opener : _defaultOpener(pos); }
    return { kind: kind, pos: pos, opener: opener };
  }
  function spotKey(sel) {
    var s = normalize(sel);
    if (s.kind === 'cold3bet') return 'cold3bet|ANY';
    return s.kind + '|' + s.pos + (s.opener ? '@' + s.opener : '');
  }
  // 'vsRfi|BB@BTN' → 선택 | null
  function parseSpot(str) {
    var p = String(str == null ? '' : str).split('|');
    if (p.length !== 2 || !KIND_BY[p[0]]) return null;
    var at = p[1].split('@');
    if (p[0] === 'cold3bet') return normalize({ kind: 'cold3bet' });
    if (posList(p[0]).indexOf(at[0]) < 0) return null;
    if (p[0] === 'vsRfi' && (!at[1] || openerList('vsRfi', at[0]).indexOf(at[1]) < 0)) return null;
    if (p[0] !== 'vsRfi' && at.length > 1) return null;
    return normalize({ kind: p[0], pos: at[0], opener: at[1] || null });
  }
  // GtoChart 모델 필드 { pos, facing, opener, limpers } → 선택
  function fromModel(o) {
    if (!_isObj(o)) return null;
    if (typeof o.spot === 'string') return parseSpot(o.spot);
    if (typeof o.id === 'string') return parseSpot(o.id);
    if (!o.pos && o.facing === undefined && !o.limpers) return null;
    var kind;
    if (_num(o.limpers, 0) > 0) kind = _num(o.limpers, 0) >= 2 ? 'iso2' : 'iso1';
    else if (o.facing === true) kind = 'vsRfi';
    else if (o.facing === 'vs3bet' || o.facing === 'vs4bet' || o.facing === 'cold3bet') kind = o.facing;
    else kind = 'rfi';
    return normalize({ kind: kind, pos: o.pos, opener: o.opener });
  }
  // RangePaint(퍼즐 rangepaint 채점기) 스팟 표기. 채점기가 아는 상황만
  function paintSpot(sel) {
    var s = normalize(sel);
    if (s.kind === 'rfi' || s.kind === 'vs3bet') return s.kind + '|' + s.pos;
    if (s.kind === 'vsRfi') return 'vsRfi|' + s.pos + '@' + s.opener;
    return null;
  }
  function ctxOf(sel) {
    var s = normalize(sel), k = KIND_BY[s.kind];
    return { pos: s.pos, facing: k.facing === undefined ? false : k.facing, opener: s.opener, limpers: k.limpers || 0 };
  }
  // 'CO 오픈(앞 전원 폴드)', 'BB, BTN 오픈에 대응'(자리와 상황 사이 쉼표, 오픈만 띄어쓰기)
  function spotTitle(sel) {
    var s = normalize(sel), N = _m('RangeNotes'), c = ctxOf(s);
    var kind = (N && _fn(N, 'kindText')) ? N.kindText(c) : KIND_BY[s.kind].t;
    return (s.pos ? s.pos + (s.kind === 'rfi' ? ' ' : ', ') : '') + kind;
  }
  // 자리 비교(띠, 비교 탭)에 쓸 자리 목록: 상대 오픈 대응은 오프너보다 뒤 자리만(앞 자리는 그 오픈을 맞을 수 없다)
  function validPos(sel) {
    var s = normalize(sel), list = posList(s.kind);
    if (s.kind !== 'vsRfi') return list;
    return list.filter(function(p) { return openerList('vsRfi', p).indexOf(s.opener) >= 0; });
  }

  // ── 차트 모델(GtoChart 읽기 전용, 캐시) ──────────────
  function modelOf(sel) {
    var key = spotKey(sel);
    if (_models[key] !== undefined) return _models[key];
    var GC = _m('GtoChart'), s = normalize(sel), m = null;
    if (GC && _fn(GC, 'buildChartModel')) {
      try {
        if (s.kind === 'cold3bet') m = GC.buildChartModel('BTN', 'cold3bet');
        else if (s.kind === 'iso1' || s.kind === 'iso2') m = _fn(GC, 'buildIsoModel') ? GC.buildIsoModel(s.pos, KIND_BY[s.kind].limpers) : null;
        else m = GC.buildChartModel(s.pos, KIND_BY[s.kind].facing, s.opener);
      } catch (e) { m = null; }
    }
    if (m && !hasData(m)) m = null;
    _models[key] = m;
    return m;
  }
  function hasData(model) {
    if (!model || !model.cells) return false;
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) if (model.cells[r][c].action !== 'none') return true;
    return false;
  }
  function actionOf(model, l) {
    var rc = rcOf(l);
    return (model && rc) ? model.cells[rc.r][rc.c].action : null;
  }
  // 림퍼 뒤 BB 표: 콜 칸은 체크(공짜)라 '참여'로 세지 않는다(레이즈만). 그 밖에는 레이즈와 콜이 참여
  function _bbIso(model) { return !!(model && model.limpers && model.pos === 'BB'); }
  function _isPlayIn(model, a) { return a === 'raise' || (a === 'call' && !_bbIso(model)); }
  // 참여하는 칸(레이즈와 콜, 림퍼 뒤 BB는 레이즈만) 목록
  function playCells(model) {
    var out = [];
    if (!model) return out;
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) if (_isPlayIn(model, model.cells[r][c].action)) out.push(model.cells[r][c].label);
    return out;
  }
  // 액션별 칸 수, 콤보 수, 전체 1326 대비 %
  function stats(model) {
    var out = { raise: { n: 0, combos: 0 }, call: { n: 0, combos: 0 }, fold: { n: 0, combos: 0 }, play: { n: 0, combos: 0 }, total: 1326 };
    if (!model) return out;
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) {
      var cell = model.cells[r][c], a = cell.action === 'none' ? 'fold' : cell.action, w = weight(cell.label);
      if (!out[a]) continue;
      out[a].n++; out[a].combos += w;
      if (_isPlayIn(model, a)) { out.play.n++; out.play.combos += w; }
    }
    ['raise', 'call', 'fold', 'play'].forEach(function(k) { out[k].pct = Math.round(out[k].combos * 100 / 1326); });
    return out;
  }
  // 모델이 가진 액션 종류(퀴즈 보기용), raise, call, fold 순
  function actionsIn(model) {
    var seen = {};
    if (model) for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) seen[model.cells[r][c].action] = true;
    return ['raise', 'call', 'fold'].filter(function(a) { return seen[a]; });
  }
  function _word(action, sel) {
    var N = _m('RangeNotes');
    if (N && _fn(N, 'actionWord')) { try { var w = N.actionWord(action, ctxOf(sel)); if (w) return w; } catch (e) { /* 아래 */ } }
    return { raise: '레이즈', call: '콜', fold: '폴드' }[action] || '';
  }
  // 두 자리 비교: 두 모델의 칸 차이
  function diff(selA, selB) {
    var A = modelOf(selA), B = modelOf(selB), out = { both: [], added: [], gone: [], a: spotKey(selA), b: spotKey(selB) };
    if (!A || !B) return out;
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) {
      var l = label(r, c), ia = _isPlayIn(A, A.cells[r][c].action), ib = _isPlayIn(B, B.cells[r][c].action);
      if (ia && ib) out.both.push(l); else if (ib) out.added.push(l); else if (ia) out.gone.push(l);
    }
    return out;
  }
  function _combos(list) { return list.reduce(function(s, l) { return s + weight(l); }, 0); }
  // 테스트용: 엔진 함수(Gto)로 같은 칸을 판정. 차트 모델과 어긋나면 안 된다
  function _engineAction(sel, l) {
    var Gt = _m('Gto'), GC = _m('GtoChart'), rc = rcOf(l);
    if (!Gt || !GC || !rc) return null;
    var cards = GC.comboCards(rc.r, rc.c), s = normalize(sel), k = KIND_BY[s.kind];
    if (s.kind === 'rfi') return Gt.gtoAction(s.pos, cards);
    if (s.kind === 'vsRfi') return Gt.gtoActionVsRfi(s.pos, cards, s.opener);
    if (s.kind === 'vs3bet') return Gt.gtoActionVs3bet(s.pos, cards);
    if (s.kind === 'vs4bet') return Gt.gtoActionVs4bet(s.pos, cards);
    if (s.kind === 'cold3bet') return Gt.gtoActionVsCold3bet(cards);
    var a = Gt.gtoActionVsLimp(s.pos, cards, k.limpers);
    return a === 'check' ? 'call' : a;   // 차트는 BB 체크 칸을 콜 색으로 그린다
  }

  // ── 저장(칸별 숙련도) ─────────────────────────────────
  function _state() {
    var J = _m('Journey');
    if (J && _fn(J, 'load')) { try { var st = J.load(); if (_isObj(st)) return st; } catch (e) { /* 메모리 */ } }
    if (!_mem) _mem = {};
    return _mem;
  }
  function _db() {
    var st = _state();
    if (!_isObj(st.rangeLab)) st.rangeLab = { v: 1, last: null, spots: {} };
    var d = st.rangeLab;
    if (!_isObj(d.spots)) d.spots = {};
    if (typeof d.v !== 'number') d.v = 1;
    return d;
  }
  function _save() { var J = _m('Journey'); if (J && _fn(J, 'save')) { try { J.save(); } catch (e) { /* 무시 */ } } }
  function _rec(key, create) {
    var d = _db(), r = d.spots[key];
    if (!_isObj(r)) { if (!create) return null; r = d.spots[key] = { cells: {}, grades: 0, best: 0, lastAt: null }; }
    if (!_isObj(r.cells)) r.cells = {};
    return r;
  }
  function _isDue(c, t) { return _num(c.box, 0) < GRAD && c.due != null && _num(c.due, Infinity) <= t; }
  // 칸 결과 기록: results = [{ label, ok }]. 맞히면 상자 올림(기한 전이면 그대로), 틀리면 상자 0에 다음 날
  function recordCells(key, results, now) {
    if (!parseSpot(key) || !Array.isArray(results)) return null;
    var t = _now(now), r = _rec(key, true), n = 0;
    results.forEach(function(x) {
      if (!x || !rcOf(x.label)) return;
      var c = r.cells[x.label];
      if (!_isObj(c)) c = r.cells[x.label] = { box: 0, due: null, n: 0, ok: 0, lastOk: null, lastAt: null };
      var ok = !!x.ok;
      c.n = _num(c.n, 0) + 1;
      if (ok) c.ok = _num(c.ok, 0) + 1;
      c.lastOk = ok; c.lastAt = _iso(t);
      var box = Math.max(0, Math.min(GRAD, Math.floor(_num(c.box, 0))));
      if (!ok) { c.box = 0; c.due = _dueAt(t, INTERVALS[0]); }
      else if (box < GRAD && (c.due == null || _num(c.due, 0) <= t)) {
        c.box = box + 1;   // 상자 1~4 = 1, 3, 7, 21일 뒤, 상자 5 = 졸업
        c.due = c.box >= GRAD ? null : _dueAt(t, INTERVALS[c.box - 1]);
      }
      n++;
    });
    r.lastAt = _iso(t);
    _save();
    return n;
  }
  // 채점 결과 → 칸 기록(정답 칸은 칠했으면 맞음, 넘친 칸은 틀림)
  function recordGrade(key, res, now) {
    var model = modelOf(parseSpot(key));
    if (!model || !res) return null;
    var missing = {}, extra = {};
    (res.missing || []).forEach(function(l) { missing[l] = true; });
    (res.extra || []).forEach(function(l) { extra[l] = true; });
    var list = playCells(model).map(function(l) { return { label: l, ok: !missing[l] }; });
    Object.keys(extra).forEach(function(l) { list.push({ label: l, ok: false }); });
    var r = _rec(key, true);
    r.grades = _num(r.grades, 0) + 1;
    r.best = Math.max(_num(r.best, 0), _num(res.pct, 0));
    return recordCells(key, list, now);
  }
  // 스팟 숙련도: 정답 칸(참여) 중 마지막에 맞힌 칸의 비율
  function mastery(key, now) {
    var sel = parseSpot(key), model = sel ? modelOf(sel) : null, t = _now(now);
    var out = { key: key, total: 0, known: 0, seen: 0, due: 0, pct: 0, grades: 0, best: 0 };
    if (!model) return out;
    var target = playCells(model), r = _rec(key, false), cells = r ? r.cells : {};
    out.total = target.length;
    target.forEach(function(l) { var c = cells[l]; if (_isObj(c)) { out.seen++; if (c.lastOk === true) out.known++; } });
    Object.keys(cells).forEach(function(l) { if (_isObj(cells[l]) && _isDue(cells[l], t)) out.due++; });
    out.pct = out.total ? Math.round(out.known * 100 / out.total) : 0;
    out.grades = r ? _num(r.grades, 0) : 0;
    out.best = r ? _num(r.best, 0) : 0;
    return out;
  }
  // 기한이 된 칸(box 오름, due 오름, 이름 순). key 없으면 전체 스팟에서 [{ spot, label }]
  function dueCells(key, now, limit) {
    var t = _now(now), d = _db(), keys = key ? [key] : Object.keys(d.spots), out = [];
    keys.forEach(function(k) {
      var r = _rec(k, false);
      if (!r || !parseSpot(k)) return;
      Object.keys(r.cells).forEach(function(l) {
        var c = r.cells[l];
        if (_isObj(c) && rcOf(l) && _isDue(c, t)) out.push({ spot: k, label: l, box: _num(c.box, 0), due: _num(c.due, 0) });
      });
    });
    out.sort(function(a, b) { return (a.box - b.box) || (a.due - b.due) || (a.spot < b.spot ? -1 : a.spot > b.spot ? 1 : 0) || (a.label < b.label ? -1 : 1); });
    if (limit != null && isFinite(limit)) out = out.slice(0, Math.max(0, Math.floor(limit)));
    return out;
  }
  function dueCount(now) { return dueCells(null, now).length; }
  // 진도 탭 스팟 목록: 기본 10개 + 기록이 있는 스팟
  function spotsForProgress() {
    var seen = {}, out = [];
    CORE_SPOTS.concat(Object.keys(_db().spots)).forEach(function(k) { if (!seen[k] && parseSpot(k)) { seen[k] = true; out.push(k); } });
    return out;
  }
  function _remember(key) { try { _db().last = key; _save(); } catch (e) { /* 무시 */ } }

  // ── 그리기(순수 문자열) ───────────────────────────────
  function _chip(kind, v, on, text, extra) {
    return '<button type="button" class="j-pick rl-pick' + (on ? ' is-on' : '') + '" aria-pressed="' + (on ? 'true' : 'false') +
      '" data-rl="' + kind + '" data-v="' + _esc(v) + '"' + (extra || '') + '>' + text + '</button>';
  }
  // 상황 줄은 기본으로 접혀 있다(지금 상황 한 줄 + ▾ 바꾸기). 펼치면 칩 7개. 폰에서 표가 첫 화면에 보이게 하려는 것
  function _pickersHTML(sel, opts) {
    var s = normalize(sel), o = opts || {}, h = '', k = KIND_BY[s.kind];
    if (_pickOpen) {
      h += '<div class="rl-row"><div class="rl-row-head"><span class="rl-row-l" id="rl-l-kind">상황</span>' +
        '<button type="button" class="rl-fold" data-rl="pickopen" aria-expanded="true">▴ 접기</button></div>' +
        '<span class="j-picks" role="group" aria-labelledby="rl-l-kind">' +
        KINDS.filter(function(x) { return !o.kinds || o.kinds.indexOf(x.k) >= 0; }).map(function(x) {
          return _chip('kind', x.k, x.k === s.kind, x.t + '<small>' + x.s + '</small>');
        }).join('') + '</span></div>';
    } else {
      h += '<div class="rl-row rl-row-sum"><span class="rl-row-l">상황</span>' +
        '<button type="button" class="rl-sum-btn" data-rl="pickopen" aria-expanded="false"><b>' + k.t + '</b><small>' + k.s + '</small><span class="rl-sum-arrow">▾ 바꾸기</span></button></div>';
    }
    var pl = posList(s.kind);
    if (pl.length) {
      h += '<div class="rl-row"><span class="rl-row-l" id="rl-l-pos">내 자리</span><span class="j-picks" role="group" aria-labelledby="rl-l-pos">' +
        pl.map(function(p) { return _chip('pos', p, p === s.pos, p); }).join('') + '</span></div>';
    } else if (s.kind === 'cold3bet') {
      h += '<div class="rl-row"><span class="rl-row-l">내 자리</span><span class="rl-row-note">자리와 상관없이 같은 표예요</span></div>';
    }
    var ol = openerList(s.kind, s.pos);
    if (ol.length) {
      // 이 앱 차트는 BB만 앞쪽(UTG, HJ)과 뒤쪽(CO, BTN, SB) 오픈에 다른 표를 쓴다(Gto.gtoActionVsRfi). 다른 자리는 오프너가 달라도 같은 표
      h += '<div class="rl-row"><span class="rl-row-l" id="rl-l-op">오픈한 상대</span><span class="j-picks" role="group" aria-labelledby="rl-l-op">' +
        ol.map(function(p) { return _chip('opener', p, p === s.opener, p); }).join('') + '</span>' +
        '<span class="rl-row-hint">' + (s.pos === 'BB' ? 'BB는 앞쪽(UTG, HJ) 오픈과 뒤쪽(CO, BTN, SB) 오픈에 다른 표를 써요.' :
          '이 앱 차트는 BB 말고는 오픈한 자리가 달라도 같은 표예요.') + '</span></div>';
    }
    return '<div class="rl-pickers">' + h + '</div>';
  }
  function _tagChip() {
    var N = _m('RangeNotes'), t = (N && N.TAG_TEXT && N.TAG_TEXT.chart) ? N.TAG_TEXT.chart : '이 앱 차트 기준';
    var P = _m('Puzzles'), full = (P && P.LABEL_TEXT && P.LABEL_TEXT.chart) ? String(P.LABEL_TEXT.chart) : t;
    return '<span class="rl-chip" title="' + _esc(full) + '"><span aria-hidden="true">▦</span> ' + _esc(t) + '</span>';
  }
  function _legendHTML(model, sel) {
    var st = stats(model), s = normalize(sel);
    function item(a, word) {
      if (!st[a].n) return '';
      return '<span class="rl-lg"><i class="rl-sw gto-cell gto-' + a + '" aria-hidden="true"></i>' + _esc(word) + ' <b>' + st[a].pct + '%</b><small>' + st[a].combos + '콤보</small></span>';
    }
    var top = _bbIso(model) ? '레이즈 상위 약 ' + st.play.pct + '%(체크는 공짜라 참여로 세지 않아요)' : '참여(레이즈와 콜) 상위 약 ' + st.play.pct + '%';
    // 림퍼 뒤 BB: 체크 칸 중 ◢ 표시(모델 cell.alt, CO 오픈 표 손)는 레이즈도 괜찮다
    var alt = _bbIso(model) && _altCount(model) ? '<span class="rl-lg"><i class="rl-sw gto-cell gto-call is-alt" aria-hidden="true"></i>체크, 레이즈도 괜찮음 <b>' + _altCount(model) + '칸</b></span>' : '';
    return '<div class="rl-legend" role="note">' + item('raise', _word('raise', s)) + item('call', _word('call', s)) + alt + item('fold', '폴드') +
      '<span class="rl-lg rl-lg-top">' + top + '</span></div>';
  }
  // 표 바로 아래 한 줄 읽기: 고른 칸의 분류와 액션(설명 카드는 아래에 있어 누른 자리에서 바로 보이게)
  // 모델 칸 객체(alt 표시용)와 alt 칸 수
  function _cellOf(model, l) { var rc = rcOf(l); return (model && rc) ? model.cells[rc.r][rc.c] : null; }
  function _altCount(model) {
    var n = 0;
    if (model) for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) if (model.cells[r][c].alt) n++;
    return n;
  }
  function _readoutHTML(model, sel, l) {
    var N = _m('RangeNotes');
    if (!l || !model) return '';
    var action = actionOf(model, l), cat = (N && _fn(N, 'category')) ? N.category(l) : null, cell = _cellOf(model, l);
    return '<div class="rl-readout" aria-live="polite"><i class="rl-sw gto-cell gto-' + action + (cell && cell.alt ? ' is-alt' : '') + '" aria-hidden="true"></i><b>' + _esc(l) + '</b>' +
      (cat && N.CATS && N.CATS[cat] ? '<span>' + _esc(N.CATS[cat]) + '</span>' : '') + '<span class="rl-readout-a">👉 ' + _esc(_word(action, sel) || '자료 없음') + ' 칸' +
      (cell && cell.alt ? ' (레이즈도 괜찮아요)' : '') + '</span>' +
      '<small>설명은 아래에</small></div>';
  }
  function _cellClass(l, action, sel, selected, kinCat, alt) {
    var N = _m('RangeNotes'), cls = 'rl-c gto-cell gto-' + action + (alt ? ' is-alt' : '');
    if (rcOf(l).r === rcOf(l).c) cls += ' is-p';
    if (selected === l) cls += ' is-sel';
    else if (kinCat && N && _fn(N, 'category') && N.category(l) === kinCat) cls += ' is-kin';
    if (_rowOn && rcOf(l).r === _row) cls += ' is-row';   // 줄 표시는 칸을 고르거나 ▲▼를 누른 뒤부터
    return cls;
  }
  function _gridHTML(model, sel, selected) {
    var N = _m('RangeNotes'), kin = (selected && N && _fn(N, 'category')) ? N.category(selected) : null;
    var h = '<div class="rl-grid" aria-hidden="true">';
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) {
      var cell = model.cells[r][c];
      h += '<i class="' + _cellClass(cell.label, cell.action, sel, selected, kin, !!cell.alt) + '" data-rl="c" data-l="' + cell.label + '" data-r="' + r + '">' + cell.label + '</i>';
    }
    return h + '</div>';
  }
  function _zoomHTML(model, sel, selected) {
    var r = _row, rk = _rankName(r);
    var h = '<div class="rl-zoom" role="group" aria-label="' + rk + ' 줄 크게 보기"><div class="rl-zhead">' +
      '<button type="button" class="rl-nav" data-rl="up" aria-label="위 줄"' + (r === 0 ? ' disabled' : '') + '>▲</button>' +
      '<span class="rl-zt"><b>' + rk + ' 줄</b> <small>칸을 누르면 이유를 보여요</small></span>' +
      '<button type="button" class="rl-nav" data-rl="down" aria-label="아래 줄"' + (r === 12 ? ' disabled' : '') + '>▼</button></div><div class="rl-zcells">';
    for (var c = 0; c < 13; c++) {
      var cell = model.cells[r][c], on = cell.label === selected;
      h += '<button type="button" class="rl-z gto-cell gto-' + cell.action + (r === c ? ' is-p' : '') + (on ? ' is-sel' : '') + (cell.alt ? ' is-alt' : '') + '" data-rl="z" data-l="' + cell.label +
        '" aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="' + cell.label + ', ' + _esc(_word(cell.action, sel) || '자료 없음') + (cell.alt ? ', 레이즈도 괜찮음' : '') + '"><b>' + cell.label +
        '</b><small>' + _esc(cell.action === 'none' ? '' : (cell.alt ? 'C/R' : (ACT_SHORT[cell.action] || ''))) + '</small></button>';
    }
    return h + '</div></div>';
  }
  function _noteHTML(sel, l) {
    var N = _m('RangeNotes'), model = modelOf(sel);
    if (!l || !model) {
      return '<div class="j-card rl-note rl-note-empty"><div class="j-card-d">표의 칸을 누르면 그 손이 왜 그 색인지 설명해요. 아래 크게 보기 줄에서 정확히 고를 수 있어요.</div></div>';
    }
    var action = actionOf(model, l), c = ctxOf(sel);
    c.action = action;
    var e = (N && _fn(N, 'explain')) ? N.explain(l, c) : null;
    if (!e) return '<div class="j-card rl-note"><div class="j-card-t">' + _esc(l) + '</div></div>';
    var word = _word(action, sel), tag = (N && N.TAG_TEXT && N.TAG_TEXT[e.tag]) || '이 앱 차트 기준';
    var kinN = 0;
    for (var r = 0; r < 13; r++) for (var cc = 0; cc < 13; cc++) if (N.category(label(r, cc)) === e.cat) kinN++;
    return '<div class="j-card rl-note" aria-live="polite">' +
      '<div class="rl-note-top"><i class="rl-sw rl-sw-big gto-cell gto-' + action + '" aria-hidden="true"></i><b class="rl-note-t">' + _esc(e.title) + '</b>' +
      '<span class="rl-chip" title="' + _esc(tag) + '"><span aria-hidden="true">▦</span> ' + _esc(tag) + '</span></div>' +
      '<div class="rl-note-act rl-act-' + action + '">👉 ' + _esc(word || '자료 없음') + '</div>' +
      e.why.map(function(w) { return '<p class="rl-note-p">' + _esc(w) + '</p>'; }).join('') +
      '<div class="j-card-d rl-note-kin">같은 종류(' + _esc((N.CATS && N.CATS[e.cat]) || '') + ') 칸 ' + kinN + '개를 표에서 점선으로 표시했어요.</div></div>';
  }
  // 자리 비교 띠: 같은 상황의 자리별 참여 %(막대 높이는 띠 안 최대값 기준, 숫자는 전체 1326 대비 %). 상대 오픈 대응은 오프너 뒤 자리만
  function _stripHTML(sel) {
    var s = normalize(sel), list = validPos(s);
    if (list.length < 2) return '';
    var isBBiso = s.kind === 'iso1' || s.kind === 'iso2';
    var rows = list.map(function(p) {
      var m = modelOf(normalize({ kind: s.kind, pos: p, opener: s.opener }));
      return m ? { p: p, pct: stats(m).play.pct } : null;
    }).filter(Boolean);
    var max = rows.reduce(function(mx, r) { return Math.max(mx, r.pct); }, 0) || 1;
    var items = rows.map(function(r) {
      var on = r.p === s.pos, hgt = Math.max(6, Math.round(r.pct * 100 / max));
      return '<button type="button" class="rl-bar' + (on ? ' is-on' : '') + '" data-rl="pos" data-v="' + r.p + '" aria-pressed="' + (on ? 'true' : 'false') +
        '" aria-label="' + r.p + ' 참여 ' + r.pct + '%">' + '<span class="rl-bar-pct">' + r.pct + '%</span><span class="rl-bar-track"><i style="height:' + hgt + '%"></i></span>' +
        '<span class="rl-bar-k">' + r.p + (isBBiso && r.p === 'BB' ? '<small>레이즈만</small>' : '') + '</span></button>';
    }).join('');
    var sub = s.kind === 'rfi' ? '자리가 뒤로 갈수록 여는 손이 넓어져요. 누르면 그 자리 표로 바뀌어요.' :
      s.kind === 'vsRfi' ? '같은 ' + (s.opener || '') + ' 오픈을 뒤 자리마다 얼마나 넓게 받는지예요. 누르면 그 자리 표로 바뀌어요.' :
      '자리마다 참여하는 손의 넓이예요. 누르면 그 자리 표로 바뀌어요.';
    return '<div class="j-card rl-strip-card"><div class="j-card-t">자리 비교 띠</div><div class="rl-strip" role="group" aria-label="자리별 참여 비율">' + items + '</div>' +
      '<div class="j-card-d">' + sub + '</div></div>';
  }
  function _headHTML(sel) {
    var N = _m('RangeNotes'), c = ctxOf(sel);
    var note = (N && _fn(N, 'posNote')) ? N.posNote(c) : '';
    return '<div class="rl-head"><div class="rl-head-t">' + _esc(spotTitle(sel)) + '</div>' + (note ? '<div class="rl-head-d">' + _esc(note) + '</div>' : '') + '</div>';
  }
  function _emptyHTML(sel) {
    return '<div class="j-card"><div class="j-card-t">표가 없어요</div><div class="j-card-d">' + _esc(spotTitle(sel)) + '에는 이 앱 차트 자료가 없어요. 다른 자리나 상황을 골라 보세요.</div></div>';
  }
  function _exploreHTML(sel) {
    var model = modelOf(sel);
    var h = _pickersHTML(sel);
    if (!model) return h + _emptyHTML(sel);
    h += '<div class="rl-chart">' + _headHTML(sel) + _gridHTML(model, sel, _cell) + _readoutHTML(model, sel, _cell) + _legendHTML(model, sel) +
      '<div class="rl-tagline">' + _tagChip() + '</div></div>' + _zoomHTML(model, sel, _cell) + _noteHTML(sel, _cell) + _stripHTML(sel);
    var ps = paintSpot(sel);
    h += '<div class="rl-acts">' + (ps ? '<button type="button" class="j-btn j-primary" data-rl="tab" data-v="paint">✏ 이 표 외우기</button>' : '') +
      '<button type="button" class="j-btn" data-rl="tab" data-v="compare">↔ 다른 자리와 비교</button></div>';
    return h;
  }

  // 비교 탭(자리 목록은 validPos: 상대 오픈 대응이면 오프너 뒤 자리만, 그래서 두 자리가 같은 오프너를 맞는다)
  function _cmpSel(pos) { var s = normalize(_sel); return normalize({ kind: s.kind, pos: pos, opener: s.opener }); }
  function _cmpDefaults(list) {
    var s = normalize(_sel);
    if (list.length < 2) { _cmp.a = null; _cmp.b = null; return; }
    if (list.indexOf(_cmp.a) < 0) _cmp.a = list[0];
    // B 기본: 지금 자리. 지금 자리가 A와 같으면 오픈 상황은 BTN(UTG에서 BTN까지 넓어지는 대비가 가장 크다), 그 밖에는 마지막 자리
    var far = (s.kind === 'rfi' && list.indexOf('BTN') >= 0 && _cmp.a !== 'BTN') ? 'BTN' : list[list.length - 1];
    if (list.indexOf(_cmp.b) < 0 || _cmp.b === _cmp.a) _cmp.b = (s.pos && s.pos !== _cmp.a) ? s.pos : (far !== _cmp.a ? far : list[1]);
  }
  function _cmpGridHTML(selA, selB, d, popNew) {
    var B = modelOf(selB), A = modelOf(selA), added = {}, gone = {}, both = {};
    d.added.forEach(function(l) { added[l] = true; }); d.gone.forEach(function(l) { gone[l] = true; }); d.both.forEach(function(l) { both[l] = true; });
    var h = '<div class="rl-grid rl-grid-cmp" aria-hidden="true">';
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) {
      var l = label(r, c), cls = 'rl-c gto-cell', txt = l;
      if (added[l]) { cls += ' gto-' + B.cells[r][c].action + ' is-new' + (popNew ? ' rl-pop' : ''); }
      else if (gone[l]) { cls += ' gto-' + A.cells[r][c].action + ' is-gone'; }
      else if (both[l]) { cls += ' gto-' + B.cells[r][c].action + ' is-both'; }
      else cls += ' gto-fold is-out';
      if (r === c) cls += ' is-p';
      h += '<i class="' + cls + '" data-l="' + l + '">' + txt + '</i>';
    }
    return h + '</div>';
  }
  function _cmpLegendHTML(d, a, b) {
    var ca = _combos(d.both) + _combos(d.gone), cb = _combos(d.both) + _combos(d.added);
    return '<div class="rl-legend rl-legend-cmp" role="note">' +
      '<span class="rl-lg"><i class="rl-sw rl-c gto-cell gto-raise is-both" aria-hidden="true"></i>둘 다 들어옴 <b>' + d.both.length + '칸</b></span>' +
      '<span class="rl-lg"><i class="rl-sw rl-c gto-cell gto-raise is-new" aria-hidden="true"></i>' + _esc(b) + '에서 새로 들어옴 <b>' + d.added.length + '칸</b><small>' + _combos(d.added) + '콤보</small></span>' +
      (d.gone.length ? '<span class="rl-lg"><i class="rl-sw rl-c gto-cell gto-raise is-gone" aria-hidden="true"></i>' + _esc(a) + '에만 있음 <b>' + d.gone.length + '칸</b></span>' : '') +
      '<span class="rl-lg rl-lg-top">' + (a ? _esc(a) + ' ' + Math.round(ca * 100 / 1326) + '% → ' : '') + _esc(b) + ' 참여 ' + Math.round(cb * 100 / 1326) + '%</span></div>';
  }
  function _compareHTML() {
    var s = normalize(_sel), list = validPos(s);
    var h = _pickersHTML(s, {});
    if (list.length < 2) {
      var why = s.kind === 'cold3bet' ? _esc(KIND_BY[s.kind].t) + '은 자리와 상관없이 같은 표예요. 오픈이나 상대 오픈 대응을 골라 자리끼리 비교해 보세요.' :
        _esc(s.opener || '') + ' 오픈 뒤에는 ' + _esc(list[0] || 'BB') + ' 한 자리만 남아요. 앞쪽 자리 오픈을 골라 뒤 자리끼리 비교해 보세요.';
      return h + '<div class="j-card"><div class="j-card-t">비교할 자리가 없어요</div><div class="j-card-d">' + why + '</div></div>';
    }
    _cmpDefaults(list);
    var anim = _cmp.step >= 0 && s.kind === 'rfi';
    var selA = anim ? _cmpSel(_cmp.step === 0 ? ANIM_SEQ[0] : ANIM_SEQ[_cmp.step - 1]) : _cmpSel(_cmp.a);
    var selB = anim ? _cmpSel(ANIM_SEQ[_cmp.step]) : _cmpSel(_cmp.b);
    var d = (anim && _cmp.step === 0) ? { both: [], added: playCells(modelOf(selB)), gone: [] } : diff(selA, selB);
    var A = modelOf(selA), B = modelOf(selB);
    h += '<div class="rl-cmp-rows">' +
      '<div class="rl-row"><span class="rl-row-l" id="rl-l-a">자리 A</span><span class="j-picks" role="group" aria-labelledby="rl-l-a">' +
      list.map(function(p) { return _chip('cmpa', p, p === _cmp.a, p); }).join('') + '</span></div>' +
      '<div class="rl-row"><span class="rl-row-l" id="rl-l-b">자리 B</span><span class="j-picks" role="group" aria-labelledby="rl-l-b">' +
      list.map(function(p) { return _chip('cmpb', p, p === _cmp.b, p); }).join('') + '</span></div></div>';
    if (!A || !B) return h + _emptyHTML(selB);
    var ta = anim ? (_cmp.step === 0 ? ANIM_SEQ[0] + ' 오픈 표' : ANIM_SEQ[_cmp.step - 1] + ' → ' + ANIM_SEQ[_cmp.step]) : _cmp.a + ' → ' + _cmp.b;
    h += '<div class="rl-chart rl-cmp' + (anim ? ' is-anim' : '') + '"><div class="rl-head"><div class="rl-head-t">' + _esc(spotTitle(selB).replace(selB.pos + ' ', '')) + ', ' + _esc(ta) + '</div>' +
      '<div class="rl-head-d">' + (anim ? '단계 ' + (_cmp.step + 1) + ' / ' + ANIM_SEQ.length + '. 새로 들어오는 칸이 ✚로 표시돼요.' :
        '두 자리를 겹쳤어요. 밝은 테두리와 ✚는 ' + _esc(_cmp.b) + '에서 새로 들어오는 손이에요.') + '</div></div>' +
      _cmpGridHTML(selA, selB, d, anim) + _cmpLegendHTML(d, anim ? (_cmp.step === 0 ? '' : ANIM_SEQ[_cmp.step - 1]) : _cmp.a, anim ? ANIM_SEQ[_cmp.step] : _cmp.b) +
      '<div class="rl-tagline">' + _tagChip() + '</div></div>';
    if (s.kind === 'rfi') {
      var playing = !!_cmp.timer;
      h += '<div class="j-card rl-anim"><div class="j-card-t">넓어지는 모습 보기</div><div class="j-card-d">UTG에서 BTN까지 자리가 뒤로 갈수록 여는 손이 늘어나요. 단계마다 새 칸이 들어와요.</div>' +
        '<div class="rl-acts">' +
        '<button type="button" class="j-btn j-primary" data-rl="play">' + (playing ? '⏸ 멈춤' : '▶ 처음부터 재생') + '</button>' +
        '<button type="button" class="j-btn" data-rl="next"' + (_cmp.step >= ANIM_SEQ.length - 1 ? ' disabled' : '') + '>⏭ 다음 단계</button>' +
        (_cmp.step >= 0 ? '<button type="button" class="j-btn j-ghost" data-rl="stop">↩ 비교로</button>' : '') + '</div>' +
        '<div class="rl-steps" aria-hidden="true">' + ANIM_SEQ.map(function(p, i) { return '<span class="rl-step' + (i === _cmp.step ? ' is-on' : (i < _cmp.step ? ' is-done' : '')) + '">' + p + '</span>'; }).join('<span class="rl-step-arrow">→</span>') + '</div></div>';
    }
    if (d.added.length) {
      h += '<div class="j-card"><div class="j-card-t">새로 들어오는 손 ' + d.added.length + '칸</div><div class="rl-list">' +
        d.added.map(function(l) { return '<button type="button" class="rl-tag gto-cell gto-' + B.cells[rcOf(l).r][rcOf(l).c].action + '" data-rl="look" data-v="' + l + '" data-p="' + _esc(selB.pos) + '">' + l + '</button>'; }).join('') +
        '</div><div class="j-card-d">칸을 누르면 ' + _esc(selB.pos) + ' 표에서 그 손의 설명을 봐요.</div></div>';
    }
    return h;
  }

  // 외우기 탭
  function _paintReady() { var RP = _m('RangePaint'); try { return !!(RP && _fn(RP, 'ready') && RP.ready()); } catch (e) { return false; } }
  function _ensurePaint() {
    var RP = _m('RangePaint'), ps = paintSpot(_sel);
    if (!RP || !ps || !_paintReady()) { _paint.st = null; _paint.key = null; return null; }
    if (_paint.st && _paint.key === ps) return _paint.st;
    _paint.st = RP.create(ps, { goal: 0.7 });
    _paint.key = _paint.st ? ps : null;
    _paint.peek = false;
    return _paint.st;
  }
  function _paintHTML() {
    var RP = _m('RangePaint'), ps = paintSpot(_sel), h = _pickersHTML(_sel, { kinds: ['rfi', 'vsRfi', 'vs3bet'] });
    var st = _ensurePaint();
    if (!ps || !st) {
      return h + '<div class="j-card"><div class="j-card-t">이 상황은 외우기 문항이 아직 없어요</div><div class="j-card-d">오픈, 상대 오픈에 대응, 3벳을 맞음 표에서 연습할 수 있어요.</div>' +
        '<div class="rl-list">' + CORE_SPOTS.map(function(k) { return '<button type="button" class="j-pick rl-pick" data-rl="spot" data-v="' + k + '">' + _esc(spotTitle(parseSpot(k))) + '</button>'; }).join('') + '</div></div>';
    }
    var model = modelOf(_sel), m = mastery(spotKey(_sel));
    h += '<div class="rl-head"><div class="rl-head-t">' + _esc(spotTitle(_sel)) + '</div><div class="rl-head-d">' +
      '참여하는 손(레이즈와 콜)을 빈 격자에 칠해요. 겹침 70% 이상이면 통과예요.' + (m.grades ? ' 지금까지 ' + m.grades + '번 채점, 최고 ' + m.best + '%.' : '') + '</div></div>';
    h += '<div class="rl-acts rl-acts-top"><button type="button" class="j-btn j-ghost" data-rl="peek" aria-pressed="' + (_paint.peek ? 'true' : 'false') + '">' + (_paint.peek ? '🙈 정답 가리기' : '👀 정답 잠깐 보기') + '</button></div>';
    if (_paint.peek && model) h += '<div class="rl-chart rl-peek">' + _gridHTML(model, _sel, null) + _legendHTML(model, _sel) + '</div>';
    if (st.graded) {
      var res = st.graded, wrong = res.missing.concat(res.extra);
      h += '<div class="rl-paint-box rl-graded">' + RP.resultHTML(st.spot, res, RP.cells(st), { score: true, note: true, listMax: 14 }) + '</div>' +
        '<div class="rl-acts">' +
        '<button type="button" class="j-btn j-primary" data-rl="again">✏ 이어서 칠하기</button>' +
        '<button type="button" class="j-btn" data-rl="reset">처음부터</button>' +
        (wrong.length ? '<button type="button" class="j-btn" data-rl="quizwrong">🔁 틀린 칸 퀴즈 ' + Math.min(QUIZ_MAX, wrong.length) + '칸</button>' : '') +
        '<button type="button" class="j-btn j-ghost" data-rl="tab" data-v="explore">📋 정답 표 보기</button></div>' +
        '<div class="j-card-d rl-foot">채점한 칸은 진도에 기록돼요. 틀린 칸은 내일부터 복습 퀴즈에 나와요.</div>';
    } else {
      h += '<div class="rl-paint-box">' + RP.html(st, { ctx: 'puzzle', head: false, acts: true, hint: true }) + '</div>';
    }
    return h;
  }

  // 진도 탭과 퀴즈
  function _barHTML(key, now) {
    var m = mastery(key, now), sel = parseSpot(key), on = sel && spotKey(sel) === spotKey(_sel);
    var state = !m.seen ? '아직 안 함' : (m.pct >= 90 ? '거의 외움' : m.pct >= 60 ? '익히는 중' : '시작');
    return '<li class="rl-pb' + (on ? ' is-on' : '') + '">' +
      '<div class="rl-pb-top"><b class="rl-pb-k">' + _esc(spotTitle(sel)) + '</b><span class="rl-pb-v">' + m.known + ' / ' + m.total + '칸 <small>' + _esc(state) + '</small></span></div>' +
      '<div class="rl-pb-track" role="img" aria-label="숙련도 ' + m.pct + '%"><i style="width:' + m.pct + '%"></i></div>' +
      '<div class="rl-pb-acts">' +
      (m.due ? '<button type="button" class="j-btn rl-pb-btn" data-rl="quiz" data-v="' + _esc(key) + '">🔁 복습 ' + m.due + '칸</button>' : '') +
      '<button type="button" class="j-btn rl-pb-btn' + (m.due ? '' : ' j-ghost') + '" data-rl="spotpaint" data-v="' + _esc(key) + '">✏ 외우기</button>' +
      '<button type="button" class="j-btn j-ghost rl-pb-btn" data-rl="spot" data-v="' + _esc(key) + '">📋 표</button></div></li>';
  }
  function _progressHTML(now) {
    if (_quiz) return _quizHTML();
    var t = _now(now), keys = spotsForProgress(), sum = 0, cnt = 0, due = dueCount(t);
    keys.forEach(function(k) { var m = mastery(k, t); if (m.seen) { sum += m.pct; cnt++; } });
    var h = '<div class="j-card rl-sum"><div class="j-card-t">📈 레인지 숙련도</div>' +
      '<div class="rl-sum-row"><span class="rl-sum-n"><b>' + (cnt ? Math.round(sum / cnt) : 0) + '%</b><small>연습한 표 ' + cnt + '개 평균</small></span>' +
      '<span class="rl-sum-n"><b>' + due + '칸</b><small>오늘 복습할 칸</small></span></div>' +
      '<div class="j-card-d">숙련도는 정답 칸 가운데 마지막에 맞힌 칸의 비율이에요. 맞힌 칸은 1, 3, 7, 21일 뒤에 다시 물어요.</div>' +
      (due ? '<div class="rl-acts"><button type="button" class="j-btn j-primary" data-rl="quiz" data-v="">🔁 복습 퀴즈 시작(' + Math.min(QUIZ_MAX, due) + '칸)</button></div>' :
        '<div class="rl-acts"><button type="button" class="j-btn j-primary" data-rl="tab" data-v="paint">✏ 외우기로 가기</button></div>') + '</div>';
    h += '<ul class="rl-pbs">' + keys.map(function(k) { return _barHTML(k, t); }).join('') + '</ul>';
    return h;
  }
  function startQuiz(items) {
    var list = (items || []).filter(function(x) { return x && parseSpot(x.spot) && rcOf(x.label) && modelOf(parseSpot(x.spot)); }).slice(0, QUIZ_MAX);
    if (!list.length) { _quiz = null; return false; }
    _quiz = { items: list, i: 0, right: 0, answered: null, done: false };
    _tab = 'progress';
    return true;
  }
  function answerQuiz(action, now) {
    if (!_quiz || _quiz.done || _quiz.answered) return null;
    var it = _quiz.items[_quiz.i], sel = parseSpot(it.spot), model = modelOf(sel), truth = actionOf(model, it.label);
    var ok = action === truth;
    _quiz.answered = { pick: action, truth: truth, ok: ok };
    if (ok) _quiz.right++;
    recordCells(it.spot, [{ label: it.label, ok: ok }], now);
    return _quiz.answered;
  }
  function nextQuiz() {
    if (!_quiz || !_quiz.answered) return false;
    _quiz.answered = null;
    if (_quiz.i + 1 >= _quiz.items.length) { _quiz.done = true; return true; }
    _quiz.i++;
    return true;
  }
  function _quizHTML() {
    var q = _quiz, N = _m('RangeNotes');
    if (q.done) {
      var n = q.items.length, good = q.right >= n * 0.8;
      return '<div class="j-card rl-quiz"><div class="j-card-t">' + (good ? '🎉 잘했어요' : '👍 수고했어요') + '</div>' +
        '<div class="rl-quiz-big">' + q.right + ' / ' + n + '칸</div><div class="j-card-d">맞힌 칸은 다음 간격에, 틀린 칸은 내일 다시 나와요.</div>' +
        '<div class="rl-acts"><button type="button" class="j-btn j-primary" data-rl="qquit">📈 진도로</button>' +
        '<button type="button" class="j-btn" data-rl="tab" data-v="paint">✏ 외우기</button></div></div>';
    }
    var it = q.items[q.i], sel = parseSpot(it.spot), model = modelOf(sel), cat = (N && _fn(N, 'category')) ? N.category(it.label) : null;
    var acts = actionsIn(model);
    var h = '<div class="j-card rl-quiz"><div class="rl-quiz-top"><span>복습 퀴즈 ' + (q.i + 1) + ' / ' + q.items.length + '</span>' +
      '<button type="button" class="j-btn j-ghost rl-quiz-x" data-rl="qquit" aria-label="퀴즈 그만">✕</button></div>' +
      '<div class="rl-quiz-sit">' + _esc(spotTitle(sel)) + '</div>' +
      '<div class="rl-quiz-hand"><b>' + it.label + '</b><small>' + _esc((N && N.CATS && cat) ? N.CATS[cat] : '') + '</small></div>';
    if (!q.answered) {
      h += '<div class="rl-quiz-q">이 손은 어떻게 할까요?</div><div class="rl-quiz-acts">' + acts.map(function(a) {
        return '<button type="button" class="j-btn rl-qa rl-act-' + a + '" data-rl="qans" data-v="' + a + '"><i class="rl-sw gto-cell gto-' + a + '" aria-hidden="true"></i>' + _esc(_word(a, sel)) + '</button>';
      }).join('') + '</div>';
    } else {
      var an = q.answered, c = ctxOf(sel); c.action = an.truth;
      var e = (N && _fn(N, 'explain')) ? N.explain(it.label, c) : null;
      h += '<div class="rl-quiz-res ' + (an.ok ? 'is-ok' : 'is-bad') + '">' + (an.ok ? '✔ 맞아요, ' : '✖ 아쉬워요, 정답은 ') + '<b>' + _esc(_word(an.truth, sel)) + '</b></div>' +
        (e ? e.why.map(function(w) { return '<p class="rl-note-p">' + _esc(w) + '</p>'; }).join('') : '') +
        '<div class="rl-tagline">' + _tagChip() + '</div>' +
        '<div class="rl-acts"><button type="button" class="j-btn j-primary" data-rl="qnext">' + (q.i + 1 >= q.items.length ? '결과 보기' : '다음 칸 ▶') + '</button></div>';
    }
    return h + '</div>';
  }

  function _tabsHTML() {
    return '<div class="rl-tabs" role="tablist" aria-label="학습실 탭">' + TABS.map(function(t) {
      var on = t[0] === _tab;
      return '<button type="button" role="tab" class="rl-tab' + (on ? ' is-on' : '') + '" aria-selected="' + (on ? 'true' : 'false') + '" data-rl="tab" data-v="' + t[0] + '">' +
        '<span aria-hidden="true">' + t[1] + '</span> ' + t[2] + '</button>';
    }).join('') + '</div>';
  }
  function _bodyHTML() {
    if (_tab === 'compare') return _compareHTML();
    if (_tab === 'paint') return _paintHTML();
    if (_tab === 'progress') return _progressHTML();
    return _exploreHTML(_sel);
  }
  // 순수: params를 반영한 전체 화면 문자열(상태도 맞춘다)
  function html(params) {
    _applyParams(params);
    if (!_sel) _sel = parseSpot(_db().last) || parseSpot(DEFAULT_SPOT);
    var body;
    try { body = _bodyHTML(); } catch (e) { body = '<div class="j-card"><div class="j-card-t">표를 그리지 못했어요</div><div class="j-card-d">' + _esc((e && e.message) || e) + '</div></div>'; }
    return '<div class="j-sub j-range-lab" data-tab="' + _tab + '">' +
      '<div class="j-sub-top"><button type="button" class="j-back" aria-label="여정 홈으로" data-rl="back">↩</button>' +
      '<h2 class="j-sub-t">🗺 레인지 학습실</h2></div>' + _tabsHTML() + '<div class="rl-body">' + body + '</div></div>';
  }
  function _applyParams(params) {
    if (params == null || params === '') return;
    var sel = null;
    if (typeof params === 'string') sel = parseSpot(params);
    var tab = (_isObj(params) && typeof params.tab === 'string' && TABS.some(function(t) { return t[0] === params.tab; })) ? params.tab : null;
    if (_isObj(params)) sel = fromModel(params);
    if (sel) { _setSel(sel); _tab = tab || 'explore'; }   // 스팟을 받아 열면 차트 탭(차트 시트의 '학습실에서 크게 보기')
    else if (tab) _tab = tab;
  }
  function _setSel(sel) {
    var next = normalize(sel), key = spotKey(next);
    if (!_sel || spotKey(_sel) !== key) { _cell = null; _rowOn = false; _cmp.step = -1; _stopTimer(); }
    _sel = next;
    _remember(key);
  }

  // ── DOM 연결 ───────────────────────────────────────────
  function _root() { return (_el && typeof _el.querySelector === 'function') ? _el.querySelector('.j-range-lab') : null; }
  function _alive() { return !_el || !!_root(); }   // 요소 없이(테스트) 쓰면 늘 살아 있음, 요소가 있으면 아직 학습실이 그려져 있을 때만
  function _stopTimer() { if (_cmp.timer) { try { clearTimeout(_cmp.timer); } catch (e) { /* 무시 */ } _cmp.timer = null; } }
  function _offPaint() { if (_paint.off) { try { _paint.off(); } catch (e) { /* 무시 */ } _paint.off = null; } }
  function _up(node, root) {
    while (node && node !== root && node.nodeType !== 9) {
      if (node.getAttribute && node.getAttribute('data-rl')) return node;
      node = node.parentNode;
    }
    return null;
  }
  function _bindPaint(root) {
    var RP = _m('RangePaint'), box = root && root.querySelector ? root.querySelector('.rl-paint-box') : null;
    _offPaint();
    if (!RP || !box || !_paint.st || _paint.st.graded) return;
    _paint.off = RP.bind(box, {
      state: function() { return (_paint.st && !_paint.st.graded) ? _paint.st : null; },
      render: function() { var b = _root() && _root().querySelector('.rl-paint-box'); if (b && _paint.st) b.innerHTML = RP.html(_paint.st, { ctx: 'puzzle', head: false, acts: true, hint: true }); },
      action: function(a) { act(a); }
    });
  }
  function _onClick(e) {
    var t = _up(e && e.target, _root());
    if (!t) return;
    var kind = t.getAttribute('data-rl');
    if (kind === 'c' || kind === 'z' || kind === 'up' || kind === 'down' || kind === 'look' || kind === 'tab' || kind === 'kind' || kind === 'pos' || kind === 'opener' ||
        kind === 'cmpa' || kind === 'cmpb' || kind === 'spot' || kind === 'spotpaint' || kind === 'quiz' || kind === 'qans' || kind === 'qnext' || kind === 'qquit' ||
        kind === 'play' || kind === 'next' || kind === 'stop' || kind === 'peek' || kind === 'again' || kind === 'reset' || kind === 'quizwrong' || kind === 'back' || kind === 'pickopen') {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      _focus = { k: kind, v: t.getAttribute('data-v'), l: t.getAttribute('data-l') };
      act(kind, t.getAttribute('data-v') != null ? t.getAttribute('data-v') : t.getAttribute('data-l'), t.getAttribute('data-p'));
    }
  }
  function _bind(el) {
    var root = _root();
    if (!root || typeof root.addEventListener !== 'function') return;
    root.addEventListener('click', _onClick);
    _bindPaint(root);
    if (_focus && root.querySelector) {
      try {
        var q = '[data-rl="' + _focus.k + '"]' + (_focus.v != null ? '[data-v="' + _focus.v + '"]' : (_focus.l != null ? '[data-l="' + _focus.l + '"]' : ''));
        var b = root.querySelector(q);
        if (b && typeof b.focus === 'function' && b.tagName === 'BUTTON') b.focus({ preventScroll: true });
      } catch (x) { /* 무시 */ }
      _focus = null;
    }
    // 칸을 고르면 설명 카드가 화면 아래에 가려져 있을 때만 그만큼 올린다(표를 누른 자리에서 설명이 바로 보이게)
    if (_scroll && root.querySelector) {
      try {
        var n = root.querySelector(_scroll);
        if (n && typeof n.scrollIntoView === 'function') n.scrollIntoView({ block: 'nearest', behavior: _reduced() ? 'auto' : 'smooth' });
      } catch (x2) { /* 무시 */ }
    }
    _scroll = null;
  }
  // 액션 처리(위임 클릭과 테스트가 부른다). 반환 true = 다시 그렸다
  function act(kind, v, extra) {
    var s = normalize(_sel);
    if (kind === 'back') { back(); return false; }
    if (kind === 'tab') { if (!TABS.some(function(t) { return t[0] === v; })) return false; _tab = v; if (v !== 'compare') { _cmp.step = -1; _stopTimer(); } if (v !== 'progress') _quiz = null; }
    else if (kind === 'pickopen') { _pickOpen = !_pickOpen; }
    else if (kind === 'kind') { if (!KIND_BY[v]) return false; _setSel({ kind: v, pos: s.pos, opener: s.opener }); _pickOpen = false; }
    else if (kind === 'pos') { if (posList(s.kind).indexOf(v) < 0) return false; _setSel({ kind: s.kind, pos: v, opener: s.opener }); }
    else if (kind === 'opener') { if (openerList(s.kind, s.pos).indexOf(v) < 0) return false; _setSel({ kind: s.kind, pos: s.pos, opener: v }); }
    else if (kind === 'spot' || kind === 'spotpaint') { var ps = parseSpot(v); if (!ps) return false; _setSel(ps); _tab = kind === 'spotpaint' ? 'paint' : 'explore'; _quiz = null; }
    else if (kind === 'c' || kind === 'z') { var rc = rcOf(v); if (!rc) return false; _cell = (kind === 'z' && _cell === v) ? null : v; _row = rc.r; _rowOn = true; _scroll = _cell ? '.rl-note' : null; }
    else if (kind === 'up' || kind === 'down') { var nr = _row + (kind === 'up' ? -1 : 1); if (nr < 0 || nr > 12) return false; _row = nr; _rowOn = true; }
    else if (kind === 'look') { var rc2 = rcOf(v); if (!rc2) return false; if (extra && posList(s.kind).indexOf(extra) >= 0) _setSel({ kind: s.kind, pos: extra, opener: s.opener }); _cell = v; _row = rc2.r; _rowOn = true; _tab = 'explore'; _cmp.step = -1; _stopTimer(); }
    else if (kind === 'cmpa' || kind === 'cmpb') { if (validPos(s).indexOf(v) < 0) return false; _cmp[kind === 'cmpa' ? 'a' : 'b'] = v; _cmp.step = -1; _stopTimer(); }
    else if (kind === 'play') { if (_cmp.timer) { _stopTimer(); } else { _cmp.step = 0; _schedule(); } }
    else if (kind === 'next') { _stopTimer(); if (_cmp.step >= ANIM_SEQ.length - 1) return false; _cmp.step++; }
    else if (kind === 'stop') { _stopTimer(); _cmp.step = -1; }
    else if (kind === 'peek') { _paint.peek = !_paint.peek; }
    else if (kind === 'grade') {
      var RP = _m('RangePaint'); if (!RP || !_paint.st) return false;
      if (!RP.cells(_paint.st).length) { _toast('먼저 칸을 칠해 보세요'); return false; }
      var res = RP.grade(_paint.st);
      if (!res) { _toast('채점기를 불러오지 못했어요'); return false; }
      recordGrade(spotKey(_sel), res);
      _toast(res.ok ? '통과! 겹침 ' + res.pct + '%' : '겹침 ' + res.pct + '%, 기준 ' + Math.round(res.goal * 100) + '%');
    }
    else if (kind === 'clear') {
      var RP2 = _m('RangePaint'); if (!RP2 || !_paint.st || !RP2.cells(_paint.st).length) return false;
      if (!_paint.st.armed) { _paint.st.armed = true; _toast('한 번 더 누르면 모두 지워요'); return false; }
      RP2.clear(_paint.st);
    }
    else if (kind === 'again') { if (_paint.st) _paint.st.graded = null; }
    else if (kind === 'reset') { var RP3 = _m('RangePaint'); if (RP3 && _paint.st) { RP3.clear(_paint.st); _paint.st.row = 0; } }
    else if (kind === 'quizwrong') {
      var g = _paint.st && _paint.st.graded; if (!g) return false;
      var key = spotKey(_sel);
      if (!startQuiz(g.missing.concat(g.extra).map(function(l) { return { spot: key, label: l }; }))) return false;
    }
    else if (kind === 'quiz') { if (!startQuiz(dueCells(v || null, null, QUIZ_MAX))) { _toast('지금 복습할 칸이 없어요'); return false; } }
    else if (kind === 'qans') { if (!answerQuiz(v)) return false; }
    else if (kind === 'qnext') { if (!nextQuiz()) return false; }
    else if (kind === 'qquit') { _quiz = null; _tab = 'progress'; }
    else return false;
    render();
    return true;
  }
  function _schedule() {
    _stopTimer();
    if (typeof setTimeout !== 'function') return;
    _cmp.timer = setTimeout(function() {
      _cmp.timer = null;
      if (!_alive() || _tab !== 'compare' || _cmp.step < 0) return;   // 다른 화면으로 떠났으면 그 화면을 덮어쓰지 않는다
      if (_cmp.step < ANIM_SEQ.length - 1) { _cmp.step++; if (_cmp.step < ANIM_SEQ.length - 1) _schedule(); }
      render();
    }, _reduced() ? ANIM_MS_REDUCED : ANIM_MS);
  }

  function render(el, params) {
    el = el || _el;
    var out = html(params);
    if (!el) return out;
    _el = el;
    _offPaint();
    el.innerHTML = out;
    _bind(el);
    return out;
  }
  function open(params, el) {
    if (!el) {
      var J = _m('JourneyUI');
      if (J && _fn(J, 'viewEl')) { try { el = J.viewEl(); } catch (e) { el = null; } }
    }
    _quiz = null;
    render(el, params);
    return true;
  }
  function back() {
    _stopTimer(); _offPaint();
    var J = _m('JourneyUI');
    if (J && _fn(J, 'back')) { J.back(); return; }
    var A = _m('App');
    if (A && _fn(A, 'showMenu')) A.showMenu();
  }
  // 테스트용 초기화(선택과 탭, 비교, 외우기, 퀴즈 상태를 처음으로)
  function _reset() {
    _stopTimer(); _offPaint();
    _el = null; _tab = 'explore'; _sel = null; _cell = null; _row = 0; _rowOn = false; _focus = null; _pickOpen = false; _scroll = null;
    _cmp = { a: null, b: null, step: -1, timer: null };
    _paint = { st: null, off: null, peek: false, key: null };
    _quiz = null; _mem = null;
  }
  function _get() { return { tab: _tab, sel: _sel ? normalize(_sel) : null, spot: _sel ? spotKey(_sel) : null, cell: _cell, row: _row, rowOn: _rowOn, pickOpen: _pickOpen, scroll: _scroll, cmp: { a: _cmp.a, b: _cmp.b, step: _cmp.step, playing: !!_cmp.timer }, peek: _paint.peek, quiz: _quiz }; }

  var api = {
    open: open, render: render, html: html, back: back, act: act,
    KINDS: KINDS, POS: POS, CORE_SPOTS: CORE_SPOTS, TABS: TABS, INTERVALS: INTERVALS, ANIM_SEQ: ANIM_SEQ,
    posList: posList, openerList: openerList, validPos: validPos, normalize: normalize, spotKey: spotKey, parseSpot: parseSpot, fromModel: fromModel, paintSpot: paintSpot, ctxOf: ctxOf, spotTitle: spotTitle,
    modelOf: modelOf, hasData: hasData, actionOf: actionOf, playCells: playCells, stats: stats, actionsIn: actionsIn, diff: diff, label: label, rcOf: rcOf, weight: weight,
    recordCells: recordCells, recordGrade: recordGrade, mastery: mastery, dueCells: dueCells, dueCount: dueCount, spotsForProgress: spotsForProgress,
    startQuiz: startQuiz, answerQuiz: answerQuiz, nextQuiz: nextQuiz,
    _engineAction: _engineAction, _reset: _reset, _get: _get, _paintState: function() { return _paint.st; }
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
