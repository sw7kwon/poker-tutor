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
// RL 추가(클라우드 작업 RL, docs/cloud-tasks/RL.md). 탭 6개가 된다(차트, 비교, 외우기, 외우는 법, 퀴즈, 진도):
//   5. 🧠 외우는 법(memo): 지금 스팟의 "한 줄 규칙"(RangeNotes.rules, 엔진 칸 집합을 줄별 구간으로 압축. 레이즈와 콜 따로), 오픈 표의
//      "추가분 카드"(UTG → HJ → CO → BTN 순서로 새로 들어오는 칸만, diff로 계산), 기억법 3가지(경계선 외우기 = 줄마다 마지막 칸,
//      분류 덩어리 = 분류별 들어오는 칸 수와 목록, 반대로 외우기 = 접는 손 쪽 규칙). 전부 모델에서 그때그때 만든다(손으로 쓴 숫자 없음).
//   6. ❓ 퀴즈(quiz): 모드 3개. act = 손 하나를 보고 레이즈, 콜, 폴드(4초 제한은 켜고 끌 수 있고, 시간이 지나면 오답), pair = 두 손 중 더 먼저
//      들어가는 손(오픈 표는 어느 자리부터 여는지 RangeNotes.opensAt, 다른 상황은 레이즈 > 콜 > 폴드), edge = "이 줄은 어디까지?"(줄의 위에서부터
//      이어지는 참여 칸의 마지막 칸을 고른다). 출제는 시드 난수(quizItems(mode, keys, seed, n))라 같은 시드면 같은 문제. 채점은 기존 칸 숙련도
//      저장(recordCells)을 그대로 쓴다(틀린 칸은 상자 0, 내일 복습). 결과 화면은 상황별 정답률과 약한 분류, 틀린 칸 목록. "경로 5개 표 섞기"도 된다.
//   첫 화면(차트 탭 맨 위)에 "추천 순서" 카드: PATH_STEPS(UTG 오픈, BTN 오픈, BB 방어, vs 3벳, 아이솔) 각 단계 숙련도와 다음 할 일 한 줄.
//      시작점은 Journey.summary().stage(typeof 가드, 1~2단계 UTG 오픈, 3단계 BB 방어, 4단계 vs 3벳, 5단계부터 아이솔)에서 고르고,
//      숙련도 80% 이상이면 끝난 단계로 보고 다음 단계를 가리킨다(path(now)).
//   설명 카드에는 RangeNotes.reason(왜 이 액션인가 2~3문장, 근거 칩, 경계 손 한 줄, 흔한 실수)이 붙는다. 이웃 칸 판정은 모델에서 넘긴다(ctx.actionOf).
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
  var TABS = [['explore', '📋', '차트'], ['compare', '↔', '비교'], ['paint', '✏', '외우기'], ['memo', '🧠', '외우는 법'], ['quiz', '❓', '퀴즈'], ['progress', '📈', '진도']];
  var DEFAULT_SPOT = 'rfi|CO';
  // RL: 추천 순서(학습 경로)와 퀴즈 상수
  var PATH_STEPS = [
    { key: 'rfi|UTG', t: 'UTG 오픈', d: '가장 좁은 표예요. 손 모양과 분류 감각을 여기서 잡아요.' },
    { key: 'rfi|BTN', t: 'BTN 오픈', d: '가장 넓은 표예요. UTG에서 더해지는 손만 외우면 돼요.' },
    { key: 'vsRfi|BB@BTN', t: 'BB 방어', d: '가장 자주 겪는 자리예요. 3벳과 콜을 나눠 외워요.' },
    { key: 'vs3bet|BTN', t: 'vs 3벳', d: '내 오픈에 3벳을 맞았을 때 4벳, 콜, 폴드를 가려요.' },
    { key: 'iso1|CO', t: '아이솔', d: '림퍼 뒤에는 오픈 표대로 레이즈해요.' }
  ];
  var PATH_DONE = 80;                       // 이 숙련도(%)부터 끝난 단계
  var QZ_MODES = [['act', '⚡', '액션 고르기', '손 하나를 보고 레이즈, 콜, 폴드'], ['pair', '⚖', '둘 중 하나', '두 손 중 더 먼저 들어가는 손'], ['edge', '📏', '경계 찾기', '이 줄은 어디까지?']];
  var QZ_N = 10, QZ_TIME = 4000, QZ_WEAK = 60;
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
  // RL 상태: 추천 순서 카드 접힘, 퀴즈 v2(모드, 시드, 문항, 결과), 퀴즈 설정(모드, 시간 제한, 경로 섞기)
  var _pathOpen = true, _qz = null, _qzTimer = null, _qzOpt = { mode: 'act', timer: true, mix: false };

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
  // 설명용 ctx: 모델의 이웃 칸 판정(actionOf)을 RangeNotes에 넘겨 경계 문장이 표와 같게 한다
  function _noteCtx(sel, model, action) {
    var c = ctxOf(sel);
    c.action = action;
    c.actionOf = function(l) { return actionOf(model, l); };
    return c;
  }
  // 깊은 설명(RL): 왜 이 액션인가, 근거 칩, 경계 손, 흔한 실수
  function _deepHTML(d) {
    if (!d || !d.text || !d.text.length) return '';
    return '<div class="rl-deep"><div class="rl-deep-h"><b>왜 이 액션인가</b>' +
      (d.basis && d.basis.length ? '<span class="rl-basis">근거: ' + d.basis.map(function(b) { return '<i>' + _esc(b) + '</i>'; }).join('') + '</span>' : '') + '</div>' +
      d.text.map(function(w) { return '<p class="rl-note-p">' + _esc(w) + '</p>'; }).join('') +
      (d.edge ? '<div class="rl-deep-edge"><span aria-hidden="true">📏</span> <b>경계 손이에요.</b> ' + _esc(d.edge) + '</div>' : '') +
      (d.mistake ? '<div class="rl-deep-mis"><span aria-hidden="true">⚠</span> <b>흔한 실수</b> ' + _esc(d.mistake) + '</div>' : '') + '</div>';
  }
  function _noteHTML(sel, l) {
    var N = _m('RangeNotes'), model = modelOf(sel);
    if (!l || !model) {
      return '<div class="j-card rl-note rl-note-empty"><div class="j-card-d">표의 칸을 누르면 그 손이 왜 그 색인지 설명해요. 아래 크게 보기 줄에서 정확히 고를 수 있어요.</div></div>';
    }
    var action = actionOf(model, l), c = _noteCtx(sel, model, action);
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
      _deepHTML(e.deep) +
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
    var h = _pathHTML() + _pickersHTML(sel);
    if (!model) return h + _emptyHTML(sel);
    h += '<div class="rl-chart">' + _headHTML(sel) + _gridHTML(model, sel, _cell) + _readoutHTML(model, sel, _cell) + _legendHTML(model, sel) +
      '<div class="rl-tagline">' + _tagChip() + '</div></div>' + _zoomHTML(model, sel, _cell) + _noteHTML(sel, _cell) + _stripHTML(sel);
    var ps = paintSpot(sel);
    h += '<div class="rl-acts">' + (ps ? '<button type="button" class="j-btn j-primary" data-rl="tab" data-v="paint">✏ 이 표 외우기</button>' : '') +
      '<button type="button" class="j-btn" data-rl="tab" data-v="memo">🧠 외우는 법</button>' +
      '<button type="button" class="j-btn" data-rl="tab" data-v="quiz">❓ 퀴즈</button>' +
      '<button type="button" class="j-btn j-ghost" data-rl="tab" data-v="compare">↔ 다른 자리와 비교</button></div>';
    return h;
  }

  // ── RL: 학습 경로(추천 순서) ─────────────────────────────
  function _stage() {
    var J = _m('Journey');
    if (J && _fn(J, 'summary')) { try { var s = J.summary(); if (s && isFinite(Number(s.stage))) return Math.max(1, Math.floor(Number(s.stage))); } catch (e) { /* 아래 */ } }
    return 1;
  }
  function _stageStart(stage) { return stage <= 2 ? 0 : stage === 3 ? 2 : stage === 4 ? 3 : 4; }
  // 단계마다 { key, t, d, m(숙련도), state:'done'|'now'|'todo', next(한 줄) }, start(단계 시작점), cur(지금 할 단계, 전부 끝났으면 -1)
  function path(now) {
    var t = _now(now), stage = _stage(), start = _stageStart(stage), steps = PATH_STEPS.map(function(s) {
      var m = mastery(s.key, t);
      return { key: s.key, t: s.t, d: s.d, m: m, pct: m.pct, done: m.total > 0 && m.pct >= PATH_DONE, state: 'todo', next: '' };
    });
    var cur = -1, i;
    for (i = start; i < steps.length && cur < 0; i++) if (!steps[i].done) cur = i;
    for (i = 0; i < start && cur < 0; i++) if (!steps[i].done) cur = i;
    steps.forEach(function(s, k) {
      s.state = s.done ? 'done' : (k === cur ? 'now' : 'todo');
      if (!s.m.total) s.next = '이 표는 자료가 없어요.';
      else if (!s.m.seen) s.next = '표를 보고 한 줄 규칙부터 읽어요.';
      else if (s.m.due) s.next = '복습 ' + s.m.due + '칸이 기다려요. 퀴즈로 다져요.';
      else if (!s.done) s.next = '아직 ' + (s.m.total - s.m.known) + '칸이 남았어요. 퀴즈나 칠하기로 채워요.';
      else s.next = '다 외웠어요. 가끔 복습만 해요.';
    });
    return { stage: stage, start: start, cur: cur, steps: steps };
  }
  function _pathHTML() {
    var p = path(), curStep = p.cur >= 0 ? p.steps[p.cur] : null;
    var h = '<div class="j-card rl-path' + (_pathOpen ? '' : ' is-fold') + '"><div class="rl-path-top"><b class="rl-path-title">🧭 추천 순서</b><small>여정 ' + p.stage + '단계 기준</small>' +
      '<button type="button" class="rl-fold rl-path-fold" data-rl="pathfold" aria-expanded="' + (_pathOpen ? 'true' : 'false') + '">' + (_pathOpen ? '▴ 접기' : '▾ 펼치기') + '</button></div>';
    if (!_pathOpen) {
      return h + '<div class="rl-path-next">' + (curStep ? '다음 할 일: <b>' + _esc(curStep.t) + '</b> ' + _esc(curStep.next) : '다섯 단계를 다 외웠어요. 가끔 복습만 해요.') + '</div></div>';
    }
    h += '<ol class="rl-path-steps">' + p.steps.map(function(s, i) {
      var mark = s.state === 'done' ? '✓' : s.state === 'now' ? '▶' : String(i + 1);
      var on = spotKey(_sel) === s.key;
      return '<li><button type="button" class="rl-path-step is-' + s.state + (on ? ' is-here' : '') + '" data-rl="pstep" data-v="' + _esc(s.key) + '" aria-label="' + _esc(s.t) + ', 숙련도 ' + s.pct + '%' + (s.state === 'now' ? ', 지금 할 단계' : s.state === 'done' ? ', 끝' : '') + '">' +
        '<span class="rl-path-n" aria-hidden="true">' + mark + '</span><span class="rl-path-t">' + _esc(s.t) + '</span><span class="rl-path-pct">' + (s.m.seen ? s.pct + '%' : '아직') + '</span></button></li>';
    }).join('') + '</ol>';
    if (curStep) {
      h += '<div class="rl-path-next"><b>' + _esc(curStep.t) + '</b> ' + _esc(curStep.d) + '<br><span class="rl-path-todo">다음 할 일: ' + _esc(curStep.next) + '</span></div>' +
        '<div class="rl-acts rl-acts-top"><button type="button" class="j-btn j-primary" data-rl="pgo" data-v="' + _esc(curStep.key) + '">' + (curStep.m.seen ? '❓ 퀴즈로 다지기' : '📋 표 보기') + '</button></div>';
    } else h += '<div class="rl-path-next">다섯 단계를 다 외웠어요. 가끔 복습만 하고, 다른 자리 표도 둘러보세요.</div>';
    return h + '</div>';
  }

  // ── RL: 외우는 법 ─────────────────────────────────────────
  function _cellsBy(model, pred) {
    var out = [];
    if (model) for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) if (pred(model.cells[r][c])) out.push(model.cells[r][c].label);
    return out;
  }
  function _chips(labels, model, extra) {
    return labels.map(function(l) {
      var a = actionOf(model, l);
      return '<button type="button" class="rl-tag gto-cell gto-' + a + '" data-rl="look" data-v="' + l + '"' + (extra || '') + '>' + l + '</button>';
    }).join('');
  }
  function _ruleChips(items, model) {
    return '<div class="rl-rules">' + items.map(function(it) {
      var a = actionOf(model, it.to);
      return '<button type="button" class="rl-rule gto-cell gto-' + a + '" data-rl="look" data-v="' + it.to + '" title="' + _esc(it.name) + ' ' + it.n + '칸">' + _esc(it.text) + '</button>';
    }).join('') + '</div>';
  }
  // 한 줄 규칙: 액션별(레이즈, 콜. 림퍼 뒤 BB는 레이즈만, 체크는 나머지)
  function _rulesHTML(sel, model) {
    var N = _m('RangeNotes'), s = normalize(sel);
    if (!N || !_fn(N, 'rules')) return '';
    var parts = [], acts = _bbIso(model) ? ['raise'] : ['raise', 'call'];
    acts.forEach(function(a) {
      var set = _cellsBy(model, function(c) { return c.action === a; });
      if (!set.length) return;
      var ru = N.rules(set);
      parts.push('<div class="rl-rule-row"><div class="rl-rule-head"><i class="rl-sw gto-cell gto-' + a + '" aria-hidden="true"></i><b>' + _esc(_word(a, s)) + '</b> = <span class="rl-rule-n">' + set.length + '칸, ' + _combos(set) + '콤보</span></div>' +
        '<p class="rl-rule-text">' + _esc(ru.text) + '</p>' + _ruleChips(ru.items, model) + '</div>');
    });
    var tail = _bbIso(model) ? '나머지 칸은 전부 체크예요(공짜). ◢ 표시 칸은 레이즈도 괜찮아요.' : '적지 않은 손은 전부 폴드예요.';
    return '<div class="j-card rl-memo"><div class="j-card-t">📜 한 줄 규칙</div><div class="j-card-d">줄(페어, 수딧 X, 오프수트 X)마다 어디까지 들어오는지만 외우면 표 전체가 나와요. 엔진 표에서 바로 만든 문장이에요. 누르면 그 칸 설명으로 가요.</div>' +
      parts.join('') + '<div class="j-card-d rl-foot">' + tail + '</div></div>';
  }
  // 추가분 카드: 오픈 표가 UTG → HJ → CO → BTN으로 넓어질 때 새로 들어오는 칸만
  function _incrementsHTML(sel) {
    var N = _m('RangeNotes'), s = normalize(sel);
    if (!N || !_fn(N, 'rules')) return '';
    if (s.kind !== 'rfi') {
      return '<div class="j-card rl-memo"><div class="j-card-t">➕ 추가분 카드</div><div class="j-card-d">자리가 뒤로 갈수록 더해지는 손은 오픈 표에서 봐요. 오픈 상황을 고르면 UTG, HJ, CO, BTN 순서로 새로 들어오는 칸만 보여 줘요.</div>' +
        '<div class="rl-acts"><button type="button" class="j-btn" data-rl="spot" data-v="rfi|UTG" data-tab="memo">📋 UTG 오픈 표로</button></div></div>';
    }
    var h = '<div class="j-card rl-memo"><div class="j-card-t">➕ 추가분 카드</div><div class="j-card-d">UTG 표를 바탕으로, 자리가 하나 뒤로 갈 때마다 새로 들어오는 손만 외워요. 지금 자리(' + _esc(s.pos) + ')까지의 칸은 밝게, 그 뒤는 옅게 보여요.</div>';
    var prev = null, reached = true;
    ANIM_SEQ.forEach(function(p, i) {
      var cur = normalize({ kind: 'rfi', pos: p }), m = modelOf(cur);
      if (!m) return;
      var added = prev ? diff(prev, cur).added : playCells(m);
      var ru = N.rules(added), on = p === s.pos;
      h += '<div class="rl-inc' + (on ? ' is-on' : '') + (reached ? '' : ' is-later') + '"><div class="rl-inc-head"><b>' + (i === 0 ? p + ' 바탕' : ANIM_SEQ[i - 1] + ' → ' + p) + '</b><span class="rl-rule-n">' + (i === 0 ? '' : '+') + added.length + '칸, ' + (i === 0 ? '' : '+') + _combos(added) + '콤보</span></div>' +
        '<p class="rl-rule-text">' + _esc(ru.text) + '</p><div class="rl-list">' + _chips(added, m, ' data-p="' + p + '"') + '</div></div>';
      if (on) reached = false;
      prev = cur;
    });
    var sbD = diff(normalize({ kind: 'rfi', pos: 'BTN' }), normalize({ kind: 'rfi', pos: 'SB' }));
    if (sbD.gone.length) h += '<div class="j-card-d rl-foot">SB는 BTN 표에서 ' + sbD.gone.length + '칸을 뺀 표예요(플랍 뒤 가장 먼저 행동해서 조금 좁게). 빠지는 손: ' + _esc(N.rules(sbD.gone).text) + '</div>';
    return h + '</div>';
  }
  // 기억법 3가지: 경계선, 분류 덩어리, 반대로(접는 손)
  function _methodsHTML(sel, model) {
    var N = _m('RangeNotes');
    if (!N || !_fn(N, 'rules') || !_fn(N, 'lanes')) return '';
    var play = playCells(model), playSet = {};
    play.forEach(function(l) { playSet[l] = true; });
    // 1. 경계선: 줄마다 위에서 이어지는 참여 칸의 마지막 칸
    var edges = [], broken = [];
    N.lanes().forEach(function(ln) {
      var k = 0;
      while (k < ln.cells.length && playSet[ln.cells[k]]) k++;
      var rest = ln.cells.slice(k).filter(function(l) { return playSet[l]; });
      if (rest.length) broken.push(ln.name);
      if (k > 0) edges.push({ name: ln.name, last: ln.cells[k - 1], all: k === ln.cells.length });
    });
    var h = '<div class="j-card rl-memo"><div class="j-card-t">🧠 기억법 3가지</div>';
    h += '<div class="rl-method"><div class="rl-method-h"><b>1. 경계선 외우기</b><small>줄마다 마지막 칸 하나</small></div>' +
      '<div class="j-card-d">줄의 위쪽은 다 들어오니, 줄마다 "어디까지"의 마지막 칸 ' + edges.length + '개만 외워요.' + (broken.length ? ' ' + _esc(broken.join(', ')) + ' 줄은 중간이 끊겨 있어 한 줄 규칙에서 따로 봐요.' : '') + '</div>' +
      '<div class="rl-list">' + edges.map(function(e) { return '<button type="button" class="rl-tag rl-edge-tag gto-cell gto-' + actionOf(model, e.last) + '" data-rl="look" data-v="' + e.last + '"><small>' + _esc(e.name) + (e.all ? ' 전부' : '') + '</small>' + e.last + '</button>'; }).join('') + '</div></div>';
    // 2. 분류 덩어리
    var cats = Object.keys(N.CATS), rows = cats.map(function(cat) {
      var all = [];
      for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) if (N.category(label(r, c)) === cat) all.push(label(r, c));
      var ins = all.filter(function(l) { return playSet[l]; }), outs = all.filter(function(l) { return !playSet[l]; });
      return { cat: cat, name: N.CATS[cat], all: all, ins: ins, outs: outs };
    });
    h += '<div class="rl-method"><div class="rl-method-h"><b>2. 분류 덩어리</b><small>분류별로 몇 칸이 들어오나</small></div><ul class="rl-cat-list">' + rows.map(function(x) {
      var txt;
      if (!x.ins.length) txt = '전부 폴드';
      else if (x.ins.length === x.all.length) txt = '전부 들어와요';
      else if (x.ins.length <= 6) txt = '들어오는 칸: ' + x.ins.join(', ');
      else if (x.outs.length <= 6) txt = x.outs.join(', ') + ' 빼고 전부';
      else txt = N.rules(x.ins).text;
      return '<li><span class="rl-cat-n"><b>' + _esc(x.name) + '</b> ' + x.ins.length + ' / ' + x.all.length + '칸</span><span class="rl-cat-bar" aria-hidden="true"><i style="width:' + Math.round(x.ins.length * 100 / x.all.length) + '%"></i></span><small>' + _esc(txt) + '</small></li>';
    }).join('') + '</ul></div>';
    // 3. 반대로 외우기
    var folds = _cellsBy(model, function(c) { return !_isPlayIn(model, c.action); }), fr = N.rules(folds);
    var smaller = folds.length < play.length;
    h += '<div class="rl-method"><div class="rl-method-h"><b>3. 반대로 외우기</b><small>접는 손 쪽에서</small></div>' +
      '<div class="j-card-d">들어오는 손 ' + play.length + '칸, ' + (_bbIso(model) ? '체크하는 손' : '접는 손') + ' ' + folds.length + '칸이에요. ' +
      (smaller ? '접는 쪽이 더 적으니 "이것만 빼고 다 들어온다"로 외워요.' : '들어오는 쪽이 더 적으니 들어오는 손을 외우고, ' + (_bbIso(model) ? '체크하는' : '접는') + ' 손은 눈으로 한 번 훑어요.') + '</div>' +
      (folds.length ? '<p class="rl-rule-text">' + (_bbIso(model) ? '체크' : '폴드') + ' = ' + _esc(fr.text) + '</p>' : '') + '</div>';
    return h + '</div>';
  }
  function _memoHTML() {
    var s = normalize(_sel), model = modelOf(s), h = _pickersHTML(s);
    if (!model) return h + _emptyHTML(s);
    h += '<div class="rl-head"><div class="rl-head-t">' + _esc(spotTitle(s)) + ', 외우는 법</div><div class="rl-head-d">표를 통째로 외우지 말고 규칙 몇 줄로 줄여요. 아래 문장은 전부 이 앱 차트에서 자동으로 만들어서 표와 어긋나지 않아요.</div></div>';
    h += _rulesHTML(s, model) + _incrementsHTML(s) + _methodsHTML(s, model);
    h += '<div class="rl-acts"><button type="button" class="j-btn j-primary" data-rl="tab" data-v="quiz">❓ 퀴즈로 확인</button>' +
      (paintSpot(s) ? '<button type="button" class="j-btn" data-rl="tab" data-v="paint">✏ 빈 격자에 칠하기</button>' : '') +
      '<button type="button" class="j-btn j-ghost" data-rl="tab" data-v="explore">📋 표로</button></div>';
    return h;
  }

  // ── RL: 퀴즈(3모드, 시드 출제) ─────────────────────────────
  function _hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function _rng(seed) {
    var a = (_num(seed, 1) >>> 0) || 1;
    return function() { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function _shuffle(arr, rnd) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  // 경계 칸: 같은 줄의 이웃 칸과 판정이 다른 칸
  function _isEdgeCell(model, l) {
    var N = _m('RangeNotes'), ln = (N && _fn(N, 'laneOf')) ? N.laneOf(l) : null;
    if (!ln) return false;
    var i = ln.cells.indexOf(l), a = actionOf(model, l);
    return (i > 0 && actionOf(model, ln.cells[i - 1]) !== a) || (i < ln.cells.length - 1 && actionOf(model, ln.cells[i + 1]) !== a);
  }
  // 둘 중 하나 모드의 순위: 오픈 표는 처음 여는 자리(UTG 0 ~ BTN 3, 안 열면 4), 다른 상황은 레이즈 0, 콜 1, 폴드 2
  function _rank(sel, model, l) {
    var s = normalize(sel), N = _m('RangeNotes');
    if (s.kind === 'rfi' && N && _fn(N, 'opensAt')) { var at = N.opensAt(l); var i = at ? N.RFI_SEQ.indexOf(at) : -1; return i >= 0 ? i : N.RFI_SEQ.length; }
    var a = actionOf(model, l);
    return a === 'raise' ? 0 : a === 'call' ? 1 : 2;
  }
  function _rankText(sel, model, l) {
    var s = normalize(sel), N = _m('RangeNotes');
    if (s.kind === 'rfi' && N && _fn(N, 'opensAt')) { var at = N.opensAt(l); return at ? at + '부터 열어요' : '버튼에서도 안 열어요'; }
    return _word(actionOf(model, l), s) + ' 칸이에요';
  }
  // 대표 카드 2장(무늬는 시드로 골라 4색을 고루 보이게)
  var SUITS = ['s', 'h', 'd', 'c'];
  function _suitsFor(l, rnd) {
    var a = Math.floor(rnd() * 4), b = (a + 1 + Math.floor(rnd() * 3)) % 4;
    return l.length === 3 && l.charAt(2) === 's' ? [SUITS[a], SUITS[a]] : [SUITS[a], SUITS[b]];
  }
  // 문항 만들기(순수, 결정론): mode 'act'|'pair'|'edge', keys 스팟 키 배열, seed 숫자나 문자열, n 문항 수
  function quizItems(mode, keys, seed, n) {
    var list = (Array.isArray(keys) ? keys : [keys]).filter(function(k) { return parseSpot(k) && modelOf(parseSpot(k)); });
    n = Math.max(1, Math.floor(_num(n, QZ_N)));
    if (!list.length) return [];
    var rnd = _rng(_hash(mode + '|' + list.join(',') + '|' + String(seed == null ? 0 : seed))), out = [];
    var per = Math.ceil(n / list.length);
    list.forEach(function(key) {
      var sel = parseSpot(key), model = modelOf(sel), N = _m('RangeNotes');
      var cells = _cellsBy(model, function(c) { return c.action !== 'none'; });
      if (mode === 'act') {
        var pool = _shuffle(cells, rnd), edges = pool.filter(function(l) { return _isEdgeCell(model, l); }), rest = pool.filter(function(l) { return !_isEdgeCell(model, l); });
        var pick = edges.slice(0, Math.ceil(per / 2)).concat(rest).slice(0, per);
        pick.forEach(function(l) { out.push({ mode: 'act', spot: key, label: l, truth: actionOf(model, l), suits: _suitsFor(l, rnd) }); });
      } else if (mode === 'pair') {
        var pool2 = _shuffle(cells, rnd), used = {}, made = 0;
        for (var i = 0; i < pool2.length && made < per; i++) {
          var a = pool2[i];
          if (used[a]) continue;
          var ra = _rank(sel, model, a), b = null, catA = (N && _fn(N, 'category')) ? N.category(a) : null;
          for (var j = i + 1; j < pool2.length && !b; j++) {   // 같은 분류에서 순위가 다른 짝을 먼저 찾고, 없으면 아무 짝
            if (!used[pool2[j]] && _rank(sel, model, pool2[j]) !== ra && catA && N.category(pool2[j]) === catA) b = pool2[j];
          }
          for (j = i + 1; j < pool2.length && !b; j++) if (!used[pool2[j]] && _rank(sel, model, pool2[j]) !== ra) b = pool2[j];
          if (!b) continue;
          used[a] = used[b] = true; made++;
          var rb = _rank(sel, model, b), swap = rnd() < 0.5, A = swap ? b : a, B = swap ? a : b, rA = swap ? rb : ra, rB = swap ? ra : rb;
          out.push({ mode: 'pair', spot: key, a: A, b: B, truth: rA < rB ? 'a' : 'b', suitsA: _suitsFor(A, rnd), suitsB: _suitsFor(B, rnd) });
        }
      } else if (mode === 'edge' && N && _fn(N, 'lanes')) {
        var playSet = {};
        playCells(model).forEach(function(l) { playSet[l] = true; });
        var lanesOk = [];
        N.lanes().forEach(function(ln) {
          var k = 0;
          while (k < ln.cells.length && playSet[ln.cells[k]]) k++;
          var broken = ln.cells.slice(k).some(function(l) { return playSet[l]; });
          if (k > 0 && !broken) lanesOk.push({ lane: ln.key, name: ln.name, cells: ln.cells, truth: ln.cells[k - 1], k: k });
        });
        _shuffle(lanesOk, rnd).slice(0, per).forEach(function(x) { out.push({ mode: 'edge', spot: key, lane: x.lane, name: x.name, cells: x.cells, truth: x.truth, k: x.k }); });
      }
    });
    return _shuffle(out, rnd).slice(0, n);
  }
  function _qzKeys() {
    var cur = spotKey(_sel), keys = _qzOpt.mix ? PATH_STEPS.map(function(s) { return s.key; }) : [cur];
    if (_qzOpt.mix && keys.indexOf(cur) < 0) keys.unshift(cur);
    return keys;
  }
  // 퀴즈 시작(모드, 스팟 키 배열, 시드). 문항이 없으면 false
  function startQuiz2(mode, keys, seed, n) {
    if (!QZ_MODES.some(function(m) { return m[0] === mode; })) return false;
    var items = quizItems(mode, keys, seed, n);
    if (!items.length) { _qz = null; return false; }
    _qz = { mode: mode, keys: (Array.isArray(keys) ? keys : [keys]).slice(), seed: seed, items: items, i: 0, answered: null, results: [], right: 0, done: false, timer: !!_qzOpt.timer && mode === 'act' };
    _tab = 'quiz';
    return true;
  }
  // 답하기: act는 'raise'|'call'|'fold'|'timeout', pair는 'a'|'b', edge는 칸 라벨. 결과 { ok, truth, ... } | null
  function answerQuiz2(pick, now) {
    if (!_qz || _qz.done || _qz.answered) return null;
    var it = _qz.items[_qz.i], sel = parseSpot(it.spot), model = modelOf(sel), N = _m('RangeNotes'), ok, recs = [];
    if (it.mode === 'act') { ok = pick === it.truth; recs.push({ label: it.label, ok: ok }); }
    else if (it.mode === 'pair') { ok = pick === it.truth; recs.push({ label: it.a, ok: ok }); recs.push({ label: it.b, ok: ok }); }
    else { ok = pick === it.truth; recs.push({ label: it.truth, ok: ok }); if (!ok && rcOf(pick) && it.cells.indexOf(pick) >= 0) recs.push({ label: pick, ok: false }); }
    _stopQzTimer();
    var labels = recs.map(function(r) { return r.label; });
    var sit = (N && _fn(N, 'situationOf')) ? N.situationOf(ctxOf(sel)) : normalize(sel).kind;
    var cats = labels.map(function(l) { return (N && _fn(N, 'category')) ? N.category(l) : null; }).filter(Boolean);
    _qz.answered = { pick: pick, truth: it.truth, ok: ok, timeout: pick === 'timeout' };
    _qz.results.push({ spot: it.spot, sit: sit, mode: it.mode, labels: labels, cats: cats, ok: ok });
    if (ok) _qz.right++;
    recordCells(it.spot, recs, now);
    _bumpQuizStats(sit, ok);
    return _qz.answered;
  }
  function nextQuiz2() {
    if (!_qz || !_qz.answered) return false;
    _qz.answered = null;
    if (_qz.i + 1 >= _qz.items.length) { _qz.done = true; return true; }
    _qz.i++;
    return true;
  }
  // 누적 퀴즈 통계(poker_journey.rangeLab.quiz = { n, ok, bySit: { 상황: { n, ok } } }, 키 추가만이라 하위 호환)
  function _bumpQuizStats(sit, ok) {
    try {
      var d = _db();
      if (!_isObj(d.quiz)) d.quiz = { n: 0, ok: 0, bySit: {} };
      if (!_isObj(d.quiz.bySit)) d.quiz.bySit = {};
      d.quiz.n = _num(d.quiz.n, 0) + 1; if (ok) d.quiz.ok = _num(d.quiz.ok, 0) + 1;
      var b = d.quiz.bySit[sit]; if (!_isObj(b)) b = d.quiz.bySit[sit] = { n: 0, ok: 0 };
      b.n = _num(b.n, 0) + 1; if (ok) b.ok = _num(b.ok, 0) + 1;
      _save();
    } catch (e) { /* 무시 */ }
  }
  // 결과 집계: 상황별 정답률, 분류별 정답률(약한 분류 = 60% 미만, 낮은 순), 틀린 칸
  function quizSummary(results) {
    var N = _m('RangeNotes'), bySit = {}, byCat = {}, wrong = [], seen = {};
    (results || []).forEach(function(r) {
      var s = bySit[r.sit] = bySit[r.sit] || { sit: r.sit, name: (N && N.SIT_NAME && N.SIT_NAME[r.sit]) || r.sit, n: 0, ok: 0 };
      s.n++; if (r.ok) s.ok++;
      var done = {};
      (r.cats || []).forEach(function(c) {
        if (done[c]) return; done[c] = true;
        var x = byCat[c] = byCat[c] || { cat: c, name: (N && N.CATS && N.CATS[c]) || c, n: 0, ok: 0 };
        x.n++; if (r.ok) x.ok++;
      });
      if (!r.ok) (r.labels || []).forEach(function(l) { var k = r.spot + ':' + l; if (!seen[k]) { seen[k] = true; wrong.push({ spot: r.spot, label: l }); } });
    });
    function pct(x) { return x.n ? Math.round(x.ok * 100 / x.n) : 0; }
    var sits = Object.keys(bySit).map(function(k) { var x = bySit[k]; x.pct = pct(x); return x; });
    var cats = Object.keys(byCat).map(function(k) { var x = byCat[k]; x.pct = pct(x); return x; }).sort(function(a, b) { return a.pct - b.pct || b.n - a.n; });
    return { n: (results || []).length, ok: (results || []).filter(function(r) { return r.ok; }).length, bySit: sits, byCat: cats, weak: cats.filter(function(x) { return x.pct < QZ_WEAK; }), wrong: wrong };
  }
  function _cardsHTML(l, suits) {
    var C = _m('Cards'), r1 = l.charAt(0), r2 = l.charAt(1), s = suits || ['s', 'h'];
    function one(r, su) {
      if (C && _fn(C, 'glyph')) { try { var g = C.glyph({ rank: r, suit: su }); if (g) return g; } catch (e) { /* 아래 */ } }
      return '<span class="suit" data-suit="' + su + '">' + (r === 'T' ? '10' : r) + { s: '♠', h: '♥', d: '♦', c: '♣' }[su] + '</span>';
    }
    return '<span class="rl-qz-cards" aria-hidden="true">' + one(r1, s[0]) + one(r2, s[1]) + '</span>';
  }
  function _stopQzTimer() { if (_qzTimer) { try { clearTimeout(_qzTimer); } catch (e) { /* 무시 */ } _qzTimer = null; } }
  // 4초 제한: 그리기 뒤에 건다. 시간이 지나면 'timeout'으로 답한 것으로 치고 다시 그린다
  function _armQzTimer() {
    _stopQzTimer();
    if (!_qz || _qz.done || _qz.answered || !_qz.timer || typeof setTimeout !== 'function') return;
    var idx = _qz.i, q = _qz;
    _qzTimer = setTimeout(function() {
      _qzTimer = null;
      if (!_alive() || _tab !== 'quiz' || _qz !== q || q.done || q.answered || q.i !== idx) return;
      answerQuiz2('timeout');
      render();
    }, QZ_TIME);
  }
  function _qzSetupHTML() {
    var s = normalize(_sel), h = _pickersHTML(s), model = modelOf(s);
    if (!model) return h + _emptyHTML(s);
    var m = mastery(spotKey(s)), st = _db().quiz;
    h += '<div class="rl-head"><div class="rl-head-t">' + _esc(spotTitle(s)) + ', 퀴즈</div><div class="rl-head-d">' + QZ_N + '문제씩이에요. 맞힌 칸은 숙련도가 오르고, 틀린 칸은 내일 복습에 나와요.' +
      (m.seen ? ' 이 표 숙련도 ' + m.pct + '%.' : '') + (st && st.n ? ' 지금까지 퀴즈 ' + st.n + '문제 중 ' + st.ok + '개 정답.' : '') + '</div></div>';
    h += '<div class="j-card rl-qz-setup"><div class="j-card-t">모드 고르기</div><div class="rl-qz-modes" role="group" aria-label="퀴즈 모드">' + QZ_MODES.map(function(md) {
      var on = md[0] === _qzOpt.mode;
      return '<button type="button" class="rl-qz-mode' + (on ? ' is-on' : '') + '" data-rl="qzmode" data-v="' + md[0] + '" aria-pressed="' + (on ? 'true' : 'false') + '"><span class="rl-qz-mode-ic" aria-hidden="true">' + md[1] + '</span><b>' + md[2] + '</b><small>' + md[3] + '</small></button>';
    }).join('') + '</div>' +
      '<div class="rl-qz-opts">' +
      '<button type="button" class="j-pick rl-pick' + (_qzOpt.timer ? ' is-on' : '') + '" data-rl="qztimer" aria-pressed="' + (_qzOpt.timer ? 'true' : 'false') + '">⏱ 4초 제한<small>' + (_qzOpt.mode === 'act' ? (_qzOpt.timer ? '켬' : '끔') : '액션 고르기만') + '</small></button>' +
      '<button type="button" class="j-pick rl-pick' + (_qzOpt.mix ? ' is-on' : '') + '" data-rl="qzmix" aria-pressed="' + (_qzOpt.mix ? 'true' : 'false') + '">📚 경로 5개 표 섞기<small>' + (_qzOpt.mix ? '켬' : '이 표만') + '</small></button></div>' +
      '<div class="rl-acts"><button type="button" class="j-btn j-primary" data-rl="qzstart" data-v="' + _esc(_qzOpt.mode) + '">▶ 시작 (' + QZ_N + '문제)</button></div></div>';
    return h;
  }
  function _qzQuestionHTML() {
    var q = _qz, it = q.items[q.i], sel = parseSpot(it.spot), model = modelOf(sel), N = _m('RangeNotes'), s = normalize(sel);
    var h = '<div class="j-card rl-quiz rl-qz" data-mode="' + it.mode + '"><div class="rl-quiz-top"><span>' + _esc(QZ_MODES.filter(function(m) { return m[0] === it.mode; })[0][2]) + ' ' + (q.i + 1) + ' / ' + q.items.length + '<small class="rl-qz-score">맞힘 ' + q.right + '</small></span>' +
      '<button type="button" class="j-btn j-ghost rl-quiz-x" data-rl="qzquit" aria-label="퀴즈 그만">✕</button></div>' +
      '<div class="rl-quiz-sit">' + _esc(spotTitle(sel)) + '</div>';
    if (it.mode === 'act') {
      var cat = (N && _fn(N, 'category')) ? N.category(it.label) : null;
      h += '<div class="rl-quiz-hand rl-qz-hand">' + _cardsHTML(it.label, it.suits) + '<b>' + it.label + '</b><small>' + _esc((N && N.CATS && cat) ? N.CATS[cat] : '') + '</small></div>';
      if (!q.answered) {
        h += '<div class="rl-quiz-q">이 자리에서 이 손은 어떻게 할까요?</div>' +
          (q.timer ? '<div class="rl-qz-timer" role="img" aria-label="4초 안에 답해요"><i style="animation-duration:' + QZ_TIME + 'ms"></i></div>' : '') +
          '<div class="rl-quiz-acts">' + actionsIn(model).map(function(a) {
            return '<button type="button" class="j-btn rl-qa rl-act-' + a + '" data-rl="qzans" data-v="' + a + '"><i class="rl-sw gto-cell gto-' + a + '" aria-hidden="true"></i>' + _esc(_word(a, s)) + '</button>';
          }).join('') + '</div>';
      }
    } else if (it.mode === 'pair') {
      h += '<div class="rl-quiz-q">' + (s.kind === 'rfi' ? '둘 중 더 앞 자리부터 여는 손은?' : '둘 중 이 상황에서 더 세게 치는 손은? (' + actionsIn(model).map(function(a) { return _word(a, s); }).join(' > ') + ')') + '</div>';
      if (!q.answered) {
        h += '<div class="rl-qz-pair">' + [['a', it.a, it.suitsA], ['b', it.b, it.suitsB]].map(function(x) {
          var cat = (N && _fn(N, 'category')) ? N.category(x[1]) : null;
          return '<button type="button" class="j-btn rl-qz-opt" data-rl="qzans" data-v="' + x[0] + '">' + _cardsHTML(x[1], x[2]) + '<b>' + x[1] + '</b><small>' + _esc((N && N.CATS && cat) ? N.CATS[cat] : '') + '</small></button>';
        }).join('') + '</div>';
      }
    } else {
      var pw = s.kind === 'rfi' ? '열어요' : (_bbIso(model) ? '레이즈해요' : '들어가요(레이즈나 콜)');
      h += '<div class="rl-quiz-q">' + _esc(s.pos || '이 상황') + '에서 <b>' + _esc(it.name) + '</b> 줄은 어디까지 ' + _esc(pw) + '?</div>';
      if (!q.answered) {
        h += '<div class="j-card-d">위에서부터 이어지는 마지막 칸을 고르세요.</div><div class="rl-qz-lane" role="group" aria-label="' + _esc(it.name) + ' 줄">' + it.cells.map(function(l) {
          return '<button type="button" class="j-btn rl-qz-cell" data-rl="qzans" data-v="' + l + '">' + l + '</button>';
        }).join('') + '</div>';
      }
    }
    if (q.answered) {
      var an = q.answered, truthLabel, e;
      if (it.mode === 'act') {
        truthLabel = _word(an.truth, s);
        e = (N && _fn(N, 'explain')) ? N.explain(it.label, _noteCtx(sel, model, an.truth)) : null;
      } else if (it.mode === 'pair') {
        var win = an.truth === 'a' ? it.a : it.b, lose = an.truth === 'a' ? it.b : it.a;
        truthLabel = win + ' (' + _rankText(sel, model, win) + ', ' + lose + '는 ' + _rankText(sel, model, lose) + ')';
        e = (N && _fn(N, 'explain')) ? N.explain(win, _noteCtx(sel, model, actionOf(model, win))) : null;
      } else {
        truthLabel = it.truth + ' (' + it.k + '칸' + (it.k === it.cells.length ? ', 줄 전부' : '') + ')';
        e = (N && _fn(N, 'explain')) ? N.explain(it.truth, _noteCtx(sel, model, actionOf(model, it.truth))) : null;
      }
      h += '<div class="rl-quiz-res ' + (an.ok ? 'is-ok' : 'is-bad') + '" role="status"><span class="rl-qz-ic" aria-hidden="true">' + (an.ok ? '✔' : (an.timeout ? '⏱' : '✖')) + '</span> ' +
        (an.ok ? '맞아요, ' : (an.timeout ? '시간이 지났어요, 정답은 ' : '아쉬워요, 정답은 ')) + '<b>' + _esc(truthLabel) + '</b></div>';
      if (it.mode === 'edge') {
        h += '<div class="rl-qz-lane rl-qz-lane-ans" aria-hidden="true">' + it.cells.map(function(l, i) {
          return '<span class="rl-qz-cell gto-cell gto-' + actionOf(model, l) + (l === it.truth ? ' is-truth' : '') + (l === an.pick && !an.ok ? ' is-pick' : '') + '">' + l + (l === it.truth ? '<small>여기까지</small>' : '') + '</span>';
        }).join('') + '</div>';
      }
      if (e) h += e.why.map(function(w) { return '<p class="rl-note-p">' + _esc(w) + '</p>'; }).join('') + _deepHTML(e.deep);
      h += '<div class="rl-tagline">' + _tagChip() + '</div>' +
        '<div class="rl-acts"><button type="button" class="j-btn j-primary" data-rl="qznext">' + (q.i + 1 >= q.items.length ? '결과 보기' : '다음 ▶') + '</button></div>';
    }
    return h + '</div>';
  }
  function _qzResultHTML() {
    var q = _qz, sm = quizSummary(q.results), n = q.items.length, good = q.right >= n * 0.8;
    var h = '<div class="j-card rl-quiz rl-qz-result"><div class="j-card-t">' + (good ? '🎉 잘했어요' : q.right >= n * 0.5 ? '👍 수고했어요' : '💪 다시 한번') + '</div>' +
      '<div class="rl-quiz-big">' + q.right + ' / ' + n + '문제</div>';
    h += '<div class="rl-qz-sum"><div class="rl-qz-sum-h">상황별 정답률</div><ul class="rl-pbs">' + sm.bySit.map(function(x) {
      return '<li class="rl-pb"><div class="rl-pb-top"><b class="rl-pb-k">' + _esc(x.name) + '</b><span class="rl-pb-v">' + x.ok + ' / ' + x.n + ' <small>' + x.pct + '%</small></span></div><div class="rl-pb-track" role="img" aria-label="정답률 ' + x.pct + '%"><i style="width:' + x.pct + '%"></i></div></li>';
    }).join('') + '</ul></div>';
    h += '<div class="rl-qz-sum"><div class="rl-qz-sum-h">약한 분류</div>' + (sm.weak.length ?
      '<div class="j-card-d">정답률이 ' + QZ_WEAK + '% 아래인 분류예요. 외우는 법 탭의 분류 덩어리에서 다시 봐요.</div><div class="rl-list">' + sm.weak.map(function(x) { return '<span class="rl-weak"><b>' + _esc(x.name) + '</b> ' + x.ok + ' / ' + x.n + '</span>'; }).join('') + '</div>' :
      '<div class="j-card-d">약한 분류가 없어요. 모든 분류에서 ' + QZ_WEAK + '% 이상 맞혔어요.</div>') + '</div>';
    if (sm.wrong.length) {
      h += '<div class="rl-qz-sum"><div class="rl-qz-sum-h">틀린 칸 ' + sm.wrong.length + '개</div><div class="j-card-d">내일 복습 퀴즈에 나와요. 누르면 설명을 봐요.</div><div class="rl-list">' + sm.wrong.map(function(w) {
        var sel = parseSpot(w.spot), model = modelOf(sel);
        return '<button type="button" class="rl-tag gto-cell gto-' + actionOf(model, w.label) + '" data-rl="look" data-v="' + w.label + '" data-s="' + _esc(w.spot) + '">' + w.label + (q.keys.length > 1 ? '<small>' + _esc(sel.pos || '') + '</small>' : '') + '</button>';
      }).join('') + '</div></div>';
    }
    h += '<div class="rl-acts"><button type="button" class="j-btn j-primary" data-rl="qzagain">🔁 한 번 더</button>' +
      (sm.wrong.length ? '<button type="button" class="j-btn" data-rl="qzwrong">✖ 틀린 칸만 다시</button>' : '') +
      '<button type="button" class="j-btn j-ghost" data-rl="qzquit">모드 고르기로</button>' +
      '<button type="button" class="j-btn j-ghost" data-rl="tab" data-v="memo">🧠 외우는 법</button></div></div>';
    return h;
  }
  function _quizTabHTML() {
    if (!_qz) return _qzSetupHTML();
    return _qz.done ? _qzResultHTML() : _qzQuestionHTML();
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
    if (_tab === 'memo') return _memoHTML();
    if (_tab === 'quiz') return _quizTabHTML();
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
  function _endQz() { _stopQzTimer(); _qz = null; }

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
        kind === 'play' || kind === 'next' || kind === 'stop' || kind === 'peek' || kind === 'again' || kind === 'reset' || kind === 'quizwrong' || kind === 'back' || kind === 'pickopen' ||
        kind === 'pstep' || kind === 'pgo' || kind === 'pathfold' || kind === 'qzmode' || kind === 'qzstart' || kind === 'qzans' || kind === 'qznext' || kind === 'qzquit' ||
        kind === 'qztimer' || kind === 'qzmix' || kind === 'qzagain' || kind === 'qzwrong') {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      _focus = { k: kind, v: t.getAttribute('data-v'), l: t.getAttribute('data-l') };
      // look의 셋째 인자: data-p(자리) 또는 data-s(스팟 키). spot의 셋째 인자: data-tab(열 탭)
      act(kind, t.getAttribute('data-v') != null ? t.getAttribute('data-v') : t.getAttribute('data-l'), t.getAttribute('data-p') || t.getAttribute('data-s') || t.getAttribute('data-tab'));
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
    if (kind === 'tab') { if (!TABS.some(function(t) { return t[0] === v; })) return false; _tab = v; if (v !== 'compare') { _cmp.step = -1; _stopTimer(); } if (v !== 'progress') _quiz = null; if (v !== 'quiz') _endQz(); }
    else if (kind === 'pickopen') { _pickOpen = !_pickOpen; }
    else if (kind === 'kind') { if (!KIND_BY[v]) return false; _setSel({ kind: v, pos: s.pos, opener: s.opener }); _pickOpen = false; }
    else if (kind === 'pos') { if (posList(s.kind).indexOf(v) < 0) return false; _setSel({ kind: s.kind, pos: v, opener: s.opener }); }
    else if (kind === 'opener') { if (openerList(s.kind, s.pos).indexOf(v) < 0) return false; _setSel({ kind: s.kind, pos: s.pos, opener: v }); }
    else if (kind === 'spot' || kind === 'spotpaint' || kind === 'pstep') {
      var ps = parseSpot(v); if (!ps) return false; _setSel(ps); _quiz = null; _endQz();
      _tab = kind === 'spotpaint' ? 'paint' : (extra && TABS.some(function(t) { return t[0] === extra; }) ? extra : 'explore');
    }
    else if (kind === 'pgo') { var pg = parseSpot(v); if (!pg) return false; _setSel(pg); _quiz = null; _endQz(); _tab = mastery(v).seen ? 'quiz' : 'explore'; _qzOpt.mix = false; }
    else if (kind === 'pathfold') { _pathOpen = !_pathOpen; try { _db().pathFold = !_pathOpen; _save(); } catch (e) { /* 무시 */ } }   // 접은 상태를 기억(표가 첫 화면에 바로 보이게)
    else if (kind === 'c' || kind === 'z') { var rc = rcOf(v); if (!rc) return false; _cell = (kind === 'z' && _cell === v) ? null : v; _row = rc.r; _rowOn = true; _scroll = _cell ? '.rl-note' : null; }
    else if (kind === 'up' || kind === 'down') { var nr = _row + (kind === 'up' ? -1 : 1); if (nr < 0 || nr > 12) return false; _row = nr; _rowOn = true; }
    else if (kind === 'look') {
      var rc2 = rcOf(v); if (!rc2) return false;
      if (extra && parseSpot(extra)) _setSel(parseSpot(extra));   // 퀴즈 결과의 틀린 칸: 스팟 키로 이동
      else if (extra && posList(s.kind).indexOf(extra) >= 0) _setSel({ kind: s.kind, pos: extra, opener: s.opener });
      _cell = v; _row = rc2.r; _rowOn = true; _tab = 'explore'; _cmp.step = -1; _stopTimer(); _endQz(); _scroll = '.rl-note';
    }
    else if (kind === 'qzmode') { if (!QZ_MODES.some(function(m) { return m[0] === v; })) return false; _qzOpt.mode = v; }
    else if (kind === 'qztimer') { _qzOpt.timer = !_qzOpt.timer; try { _db().quizTimer = _qzOpt.timer; _save(); } catch (e) { /* 무시 */ } }
    else if (kind === 'qzmix') { _qzOpt.mix = !_qzOpt.mix; }
    else if (kind === 'qzstart') { var md = QZ_MODES.some(function(m) { return m[0] === v; }) ? v : _qzOpt.mode; _qzOpt.mode = md; if (!startQuiz2(md, _qzKeys(), _seed())) { _toast('이 표에는 낼 문제가 없어요'); return false; } }
    else if (kind === 'qzans') { if (!answerQuiz2(v)) return false; }
    else if (kind === 'qznext') { if (!nextQuiz2()) return false; }
    else if (kind === 'qzquit') { _endQz(); _tab = 'quiz'; }
    else if (kind === 'qzagain') { if (!_qz) return false; var q0 = _qz; if (!startQuiz2(q0.mode, q0.keys, _num(q0.seed, 0) + 1)) return false; }
    else if (kind === 'qzwrong') {
      if (!_qz) return false;
      var wr = quizSummary(_qz.results).wrong;
      if (!wr.length) return false;
      var items = wr.map(function(w) { var md2 = modelOf(parseSpot(w.spot)); return { mode: 'act', spot: w.spot, label: w.label, truth: actionOf(md2, w.label), suits: _suitsFor(w.label, _rng(_hash(w.label))) }; });
      _qz = { mode: 'act', keys: _qz.keys, seed: _qz.seed, items: items, i: 0, answered: null, results: [], right: 0, done: false, timer: !!_qzOpt.timer, wrongOnly: true };
    }
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
  // 퀴즈 시드: 날짜(일 단위)와 스팟으로. 테스트는 startQuiz2에 시드를 직접 준다
  function _seed() { return Math.floor(Date.now() / 86400000) * 7 + (_qz ? _num(_qz.seed, 0) + 1 : 0); }
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
    if (!el) { if (_tab === 'quiz') _armQzTimer(); return out; }
    _el = el;
    _offPaint();
    el.innerHTML = out;
    _bind(el);
    if (_tab === 'quiz') _armQzTimer(); else _stopQzTimer();
    return out;
  }
  function open(params, el) {
    if (!el) {
      var J = _m('JourneyUI');
      if (J && _fn(J, 'viewEl')) { try { el = J.viewEl(); } catch (e) { el = null; } }
    }
    _quiz = null; _endQz();
    try { var qt = _db().quizTimer; if (typeof qt === 'boolean') _qzOpt.timer = qt; } catch (e) { /* 무시 */ }
    try { var pf = _db().pathFold; if (typeof pf === 'boolean') _pathOpen = !pf; } catch (e) { /* 무시 */ }
    render(el, params);
    return true;
  }
  function back() {
    _stopTimer(); _offPaint(); _stopQzTimer();
    var J = _m('JourneyUI');
    if (J && _fn(J, 'back')) { J.back(); return; }
    var A = _m('App');
    if (A && _fn(A, 'showMenu')) A.showMenu();
  }
  // 테스트용 초기화(선택과 탭, 비교, 외우기, 퀴즈 상태를 처음으로)
  function _reset() {
    _stopTimer(); _offPaint(); _stopQzTimer();
    _el = null; _tab = 'explore'; _sel = null; _cell = null; _row = 0; _rowOn = false; _focus = null; _pickOpen = false; _scroll = null;
    _cmp = { a: null, b: null, step: -1, timer: null };
    _paint = { st: null, off: null, peek: false, key: null };
    _quiz = null; _mem = null;
    _pathOpen = true; _qz = null; _qzOpt = { mode: 'act', timer: true, mix: false };
  }
  function _get() { return { tab: _tab, sel: _sel ? normalize(_sel) : null, spot: _sel ? spotKey(_sel) : null, cell: _cell, row: _row, rowOn: _rowOn, pickOpen: _pickOpen, scroll: _scroll, cmp: { a: _cmp.a, b: _cmp.b, step: _cmp.step, playing: !!_cmp.timer }, peek: _paint.peek, quiz: _quiz,
    pathOpen: _pathOpen, qz: _qz, qzOpt: { mode: _qzOpt.mode, timer: _qzOpt.timer, mix: _qzOpt.mix }, qzTimerOn: !!_qzTimer }; }

  var api = {
    open: open, render: render, html: html, back: back, act: act,
    KINDS: KINDS, POS: POS, CORE_SPOTS: CORE_SPOTS, TABS: TABS, INTERVALS: INTERVALS, ANIM_SEQ: ANIM_SEQ,
    posList: posList, openerList: openerList, validPos: validPos, normalize: normalize, spotKey: spotKey, parseSpot: parseSpot, fromModel: fromModel, paintSpot: paintSpot, ctxOf: ctxOf, spotTitle: spotTitle,
    modelOf: modelOf, hasData: hasData, actionOf: actionOf, playCells: playCells, stats: stats, actionsIn: actionsIn, diff: diff, label: label, rcOf: rcOf, weight: weight,
    recordCells: recordCells, recordGrade: recordGrade, mastery: mastery, dueCells: dueCells, dueCount: dueCount, spotsForProgress: spotsForProgress,
    startQuiz: startQuiz, answerQuiz: answerQuiz, nextQuiz: nextQuiz,
    // RL
    PATH_STEPS: PATH_STEPS, PATH_DONE: PATH_DONE, QZ_MODES: QZ_MODES, QZ_N: QZ_N, QZ_TIME: QZ_TIME, QZ_WEAK: QZ_WEAK,
    path: path, quizItems: quizItems, startQuiz2: startQuiz2, answerQuiz2: answerQuiz2, nextQuiz2: nextQuiz2, quizSummary: quizSummary,
    _engineAction: _engineAction, _reset: _reset, _get: _get, _paintState: function() { return _paint.st; }, _stageStart: _stageStart
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
