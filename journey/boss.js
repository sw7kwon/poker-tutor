// journey/boss.js (채우는 패키지: M3-P4a, M5-BOSS, M6-BOSS)
// 승급 시험(보스) v1과 미션 조건 판정. 설계서 2.2절(미션 판정 규약), 2.5절(보스 표, 코칭 고정), 6.1절 boss.active, 7.1절 7번.
// 조건 DSL 10종과 판정 창 해석의 정본은 journey/journey-data.js 머리 주석이다.
// M6-BOSS(로드맵 계약 H2, H4, H8, H9, H10): 다음 업데이트로 미뤘던 조건 4개를 판정한다.
//   identify {seats, min, minHands}: 은닉 배정(Journey.hiddenSeats, poker_journey.boss.hidden[노드])의 좌석마다 관찰 핸드
//     (JStats.castObs(이름, 배정 key).hands)가 minHands 이상이고, 맞히기 제출(boss.identify[노드] = { guesses{ 좌석: 분류 }, at, correct,
//     total, hands, early, key, ok })의 정답 수가 min 이상이면 ok. 보기는 H4 4분류(tight, standard, loose-aggr, loose-passive),
//     정답은 배정 프로필의 분류(VillainTracker.CLASS_OF_TYPE, 없으면 같은 표: Nit 타이트, TAG 정석, LAG 루즈-공격, Fish와 Station 루즈-패시브).
//     조기 제출(mission.earlySubmit, s6-boss): 좌석마다 EARLY_HANDS(30)핸드부터 minHands 전에 제출할 수 있다. 정답 수가 min 이상이면
//       minHands 없이 ok(관찰 핸드 기준을 갈음), earlySubmit이 없는 노드(s6-02)는 minHands가 되어야 제출할 수 있다.
//     제출이 min에 못 미치면 정답을 공개하고 좌석을 새로 섞는다(Journey.reshuffleHidden, 새 key라 관찰이 처음부터, 벌점 없음).
//       정답을 본 배정으로 다시 찍지 못하게 하는 규칙이라 재제출 횟수 제한은 따로 없다.
//     제출 뒤 Badges.note('identify', { node, correct, total }), 학습 노드는 Journey.checkNode, 보스 시도 중이면 judge.
//     은닉 보스(identify 조건이 있는 보스)의 실전 칸은 시도 카운터가 아니라 배정 뒤 은닉 테이블 핸드(배정.hands, 세션과 시도를 넘어 누적)이고
//       맞히기가 통과되면(조기 제출 포함) 채운 것으로 본다. 48시간이 지나 시도가 끝나도 배정, 관찰, 맞히기 기록은 이어진다.
//   weeks {what:'review', min}: ReviewQueue.reportWeeks()(없으면 state.review.views)의 ISO 주 중 지금 이어지는 연속 주 수.
//     이번 주나 지난주에 열었으면 이어지는 중(이번 주는 아직 끝나지 않았다), 그 전이 마지막이면 0. 이번 주를 이미 열었는데
//     모자라면 later(다음 주까지 기다리기만 남음, nextNode가 뒤로 미룬다).
//   overlap {puzzle:'rangepaint', spots, min}: 보스 색칠 드릴 결과 r.paint = [{ spot, overlap }](계약 H2)를 recordDrill이
//     boss.active.drill.paint(통과 기록은 boss.sets[노드].paint로 다음 시도에 이월)에 쌓고, overlap ≥ min인 항목 수가 spots 이상이면 ok.
//     r.paint가 없는 PuzzleUI(머지 전)는 드릴 기준(drill.overlap)이 min 이상일 때 rangepaint 정답 수로 갈음한다.
//   custom shortSession {min, maxHands}: 판정 창 안에서 사용자가 분량 전에 스스로 끝낸 Journey 세션(state.shortSessions,
//     journey-core endSession) 중 핸드 수 ≤ maxHands인 것의 수 ≥ min.
//   은닉 테이블 유형 가림(로드맵 M6 결정 8): onNewHand가 mode 'sixmax-cast-hidden'이면 ctx.state.hideTypes = true를 걸고 같은 호출 안에서
//     Table.render로 다시 그린다(좌석 (유형) 라벨, HUD style 칩, Thinking 말버릇과 rtype 문구가 이 플래그를 본다).
//   화면: sheetActions(노드 시트 '🕵 숨은 좌석 유형 맞히기'), openIdentify(좌석별 관찰 n, VPIP, PFR, AF만, 유형 노출 없음.
//     1곳 은닉이면 함께 앉은 캐스트의 누적 숫자와 분류를 비교용으로, 5곳이면 구성 1/1/1/2와 좌석끼리 비교 안내),
//     submitIdentify(순수에 가까운 제출 판정, 테스트 입구), identifyHTML(화면 문자열).
// M5-BOSS(로드맵 계약 F1~F4)
//   F2 필터 multiway, oop, potType은 결정 기록의 mw, oop, pt를 본다. 그 필드가 없는(null 포함) 예전 기록은 필터에 맞지 않는다.
//   F3 판정 전: 판정 창 안 핸드가 0개이거나 기회가 0인 롤링 항목(pattern, light, band, srsBoxRatio 카드 0장)은 wait: true,
//      have '판정 전'. ok와 pass 의미는 그대로(개수 상한은 위반 0이면 ok, 비율은 기회 미달이라 hold).
//   F1 custom 'luckMeterViews' {min}: 판정 창 시작 뒤 운 미터 카드를 연 횟수(HeroStats.luckViews(시작 ms), 없으면 state.luck.views).
//      둘 다 없으면(운 미터 기능 전) pending.
//   큰 드릴(PuzzleUI 세트 상한 20 초과, s4-boss 50문항): drill.set을 10~20문항 세트 여러 개로 나눠(chunks) 차례로 풀고 결과를
//      boss.active.drill.parts에 쌓는다(중간에 나가도 끝낸 세트는 남는다, 나간 세트만 처음부터). 세트가 끝날 때마다 puzzleSet 조건과
//      전체 기준(pass)에 아직 닿을 수 있는지 보고, 닿을 수 없으면 드릴 미달(24시간 재도전)로 끝낸다. 마지막 세트까지 모두 채우면
//      Journey.recordDrillSet(전체 n, ok)와 boss.sets[노드] = { byType, n, ok, at }(다음 시도의 드릴 이월)에 남긴다.
//   puzzleSet 조건이 있는 보스는 드릴 통과 = 전체 기준 AND puzzleSet 조건 전부(그 시도 또는 이월된 유형별 결과).
//
// 순수 판정(테스트는 opts로 recent, hseq, now, hero, bands, drillItems, sets를 직접 넣는다)
//   Boss.context(node, stats, state, opts) → ctx
//   Boss.evalCondition(cond, ctx) → item
//   Boss.evaluate(node, stats, state, opts) → { node, pass, cond, hold, pending, later, items, more, est, expired }
//     opts(M6-BOSS) hidden, identify, castObs{ 이름: 기록 }, reportWeeks[], paint[], shortSessions[]로 상태 대신 직접 넣을 수 있다.
//     node = 노드 객체 또는 id, stats = JStats(또는 recent/heroTotals/handSeq를 가진 가짜), state = poker_journey 상태
//     item = { kind, ok, have, need, opp, label, why, hold?, pending?, wait?, ref?, more?, est? }
//       have/need는 노드 시트의 롤링 줄 "label: have/need(기회 opp)"에 그대로 들어가는 표시값(숫자 또는 짧은 글). need가 null이면 숨김.
//       hold = 기회(minOpp) 미달이라 판정 보류(소표본 통과/실패 없음), pending = 이번 버전에서 판정할 수 없는 조건
//       (모르는 kind, 모르는 custom fn, 운 미터 기능 전의 luckMeterViews, 모르는 필터 키),
//       wait = 판정 창 안 핸드 0개 또는 기회 0(have '판정 전', 계약 F3), later = 지금 칠 것이 없고 다음 주까지 기다리기만 남음(weeks),
//       submit = 관찰은 됐고 맞히기 제출만 남음(identify),
//       ref = 참고 표시(통과 미반영), more = 이 항목을 채우는 데 더 필요한 핸드 수(est = 기회 비율로 어림한 값).
//     학습 노드: 조건 항목만(핸드 수는 Journey가 본다). pass = 참고가 아닌 조건 전부 ok.
//     보스 노드: 드릴 + 보스 카운터(이 시험의 실전 핸드) + 조건. pass = 전부 ok이고 시작 뒤 48시간 안.
//     이미 passed인 노드는 items 없이 pass(passed: true). 판정이 필요하면 opts.force.
//   판정 창(2.2절 1번): 노드가 열린 뒤(mission.openedAt, 잠긴 보스 점프는 시도 시작 뒤, 둘 다 없으면 지금부터)의 링 버퍼 결정
//     (JStats.recent, 300 한도).
//     pattern의 window는 핸드 수(JStats 'dec' 레코드의 h = 핸드 순번), light의 window는 결정 수, minOpp는 필터에 맞는 결정 수.
//     h가 없는 예전 결정(M3 전 기록)은 핸드 창 판정에서 뺀다.
// 보스 흐름(UI): Boss.start(id, now) → 안내 카드(JourneyUI.mountView('boss'), Nav.view('boss', id)) → 드릴 세트(PuzzleUI.start에 노드 drill)
//   → 6인 실전 5핸드씩(Journey.startSession({kind:'boss'}) + App.selectVillains(JourneyUI.missionConfig)) → 세션 요약에서 여정으로 돌아오면
//   Journey.endSession → Boss.onSessionEnd가 판정 → 결과 카드(통과: Journey.passNode로 단계 건너뜀 통과와 승급, 칭호 토스트 / 미달: 무엇이 몇 개 더).
// 규칙(2.2절 3번, 2.5절): 보스 카운터는 시도 시작 뒤 48시간 안에 채운다. 넘으면 카운터만 0(벌점 없음, 드릴 통과 기록은 남는다).
//   드릴 기준 미달이면 그 시도는 끝나고 다음 시도는 미달 24시간 뒤부터(틀린 문제 중 SRS 유형만 Leitner 0번 상자로 들어가
//   다음 날 먼저 나온다. showdown, order 같은 once 유형은 상자가 없어 안내 문구도 그 수만 말한다).
//   조건 미달은 시도를 끝내지 않는다(롤링이라 더 치면 바뀐다). 시도 안의 재판정은 세션이 끝날 때와 보스 화면을 열 때.
// 코칭 고정: 보스와 mission.coach가 있는 미션(s1-06 L0, s2-10 L1)은 세션 시작 때(onSessionStart) CoachUI.snapshot() 뒤 setLevel(n),
//   세션이 끝나거나(onSessionEnd) 다른 게임이 시작되면 restore. 스냅샷은 poker_journey.boss.coachLock(보스는 boss.active.coachSnap에도)에
//   저장해 새로고침 뒤에도 복원한다(load 때). CoachUI.snapshot/restore(M3-P4b)가 없으면 고정하지 않는다(setLevel만 쓰면 auto 이력이 지워짐).
// 상태(poker_journey.boss): { active: null|{ node, startedAt, hands, drill: null|{n, ok, at, byType, passed, carried, parts?, paint?}, coachSnap, seatTypes, seed },
//   last: { 노드 id: { startedAt, endedAt, result: 'pass'|'drill'|'expired'|'stopped', n?, ok?, srsWrong?, part?, parts? } },
//   coachLock: null|{ node, kind, level, snap, at }, sets: { 노드 id: { byType, n, ok, at, paint? } }(세트 기준이나 색칠 겹침 조건이 있는 보스의
//   통과한 마지막 드릴 결과), hidden: { 노드 id: 배정 }(journey-core), hiddenLast, identify: { 노드 id: 맞히기 제출 } }
//   drill.parts = [{ n, ok, byType, srsWrong, at }](세트 나눔 드릴에서 끝낸 세트, 통과 전까지 passed false)
// 로드 시 DOM 접근 없음(window.addEventListener('load')만). 다른 모듈은 전부 typeof 가드로 부른다.
var Boss = (function() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : this);
  var H = 3600 * 1000, DAY = 24 * H;
  var EXPIRE_MS = 48 * H;        // 보스 카운터를 채우는 기한
  var RETRY_MS = 24 * H;         // 드릴 미달 뒤 재도전 간격
  var MIN_OPP = 30;              // 비율 조건의 기본 기회 수(2.2절 1번, 부록 A 머리)
  var DEFAULT_WINDOW = 30;       // 개수 상한에 window도 minOpp도 없을 때(최근 30핸드)
  var SET_MAX = 20;              // PuzzleUI 세트 상한(이보다 큰 드릴은 세트 여러 개로 나눈다)
  var SET_MIN = 10;              // PuzzleUI 세트 하한(이보다 작은 세트는 PuzzleUI가 반복으로 채운다)
  var CHUNK = 5;                 // 실전 분할 단위(2.2절 3번)
  var KINDS = ['pattern', 'light', 'drillSet', 'puzzleSet', 'band', 'hands', 'identify', 'weeks', 'overlap', 'custom'];
  var PENDING_KIND = {};                                              // 이 버전에서 판정하지 못하는 kind(M6-BOSS로 전부 판정)
  var CUSTOM_PENDING = { luckMeterViews: '운 미터 카드 보기' };
  var CUSTOM_OK = { srsBoxRatio: 1, luckMeterViews: 1, shortSession: 1 };   // 이 버전에서 판정하는 custom fn
  // 숨은 좌석 맞히기(계약 H4 4분류, H9)
  var ID_CLASSES = ['tight', 'standard', 'loose-aggr', 'loose-passive'];
  var CLASS_LABEL = { tight: '🧊 타이트', standard: '⚖ 정석', 'loose-aggr': '🔥 루즈-공격', 'loose-passive': '🐟 루즈-패시브' };
  var CLASS_OF_TYPE = { Nit: 'tight', TAG: 'standard', LAG: 'loose-aggr', Fish: 'loose-passive', Station: 'loose-passive' };
  var EARLY_HANDS = 30;          // 조기 제출(mission.earlySubmit)을 열어 주는 좌석별 최소 관찰 핸드
  var OBS_RATE = 0.6;            // 은닉 좌석을 실제로 관찰하는 비율(핸드당) 어림: 히어로가 폴드하면 그 뒤 좌석은 액션이 없다(시뮬 약 0.55~0.6)
  var FILTER_OK = { street: 1, source: 1, concept: 1, pos: 1, marginal: 1, multiway: 1, oop: 1, potType: 1 };
  var FILTER_FIELD = { multiway: 'mw', oop: 'oop', potType: 'pt' };   // 계약 F2: 필터 키 → 결정 기록 필드
  var PT_LABEL = { limp: '림프 팟', srp: '싱글 레이즈 팟', '3bet': '3벳 팟', '4bet': '4벳 팟' };
  var WAIT_TXT = '판정 전';
  var LIGHT_LABEL = { green: '초록', yellow: '노랑', red: '빨강', marginal: '애매한 스팟' };
  var STREET_LABEL = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버' };
  var SOURCE_LABEL = { chart: '차트', potodds: '팟 오즈', guide: '가이드', ev: 'EV' };
  var CONCEPT_LABEL = { rfi: '오픈', vs_rfi: '상대 오픈 대응', blind_defense: '블라인드 방어', vs_3bet: '3벳 대응', pot_odds: '팟 오즈',
    draws: '드로우', cbet: 'c벳', value_bluff: '밸류와 블러프', board_texture: '보드 텍스처', turn_river: '턴, 리버', actions: '액션 기본' };
  var METRIC_LABEL = { vpip: 'VPIP', pfr: 'PFR', tb: '3벳', f3: '3벳에 폴드' };
  var COACH_NAME = { 0: '풀코칭', 1: '먼저 판단', 2: '예측', 3: '실전' };   // index.html 코칭 보조 선택지와 같은 이름
  var PATTERN_FALLBACK = { overlimp: '림퍼 뒤에 콜로 따라 들어가기', fold_free_check: '공짜 체크를 폴드', limp: '림프(레이즈 없이 콜로 참여)' };
  var TYPE_FALLBACK = { showdown: '쇼다운', order: '말하는 순서', minraise: '민레이즈', tocall: '콜 금액', preflop: '프리플랍 레인지',
    potodds: '팟 오즈', outs: '아웃츠', 'outs-x4': '아웃츠 x4 조건', texture: '보드 날씨', combos: '콤보 세기', mdf: 'MDF', alpha: '알파',
    'facingbet-river': '리버 콜/폴드', rangehit: '레인지 적중', rangepaint: '레인지 색칠', hudread: 'HUD 읽기', mixed: '혼합' };

  var _viewId = null;        // 지금 그려진 보스 화면의 노드 id
  var _backOff = null, _backNav = null, _backSet = null;
  var _nowOver = null;       // 테스트 주입 시각 함수
  var _laterOver = null;     // 테스트 주입 타이머(fn, ms)

  // ── 공용 헬퍼 ──────────────────────────────────────────
  function _m(name) { var o = G[name]; return (o && (typeof o === 'object' || typeof o === 'function')) ? o : null; }
  function _can(mod, fn) { var o = _m(mod); return !!(o && typeof o[fn] === 'function'); }
  function _call(mod, fn) {
    var o = _m(mod);
    if (!o || typeof o[fn] !== 'function') return undefined;
    try { return o[fn].apply(o, Array.prototype.slice.call(arguments, 2)); }
    catch (e) { _warn(mod + '.' + fn, e); return undefined; }
  }
  function _warn(where, e) { try { if (typeof console !== 'undefined' && console.warn) console.warn('[Boss] ' + where + ':', (e && e.message) || e); } catch (x) {} }
  function _isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function _num(x, d) { x = Number(x); return isFinite(x) ? x : d; }
  function _arr(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }
  function _now(now) {
    if (typeof now === 'number' && isFinite(now)) return now;
    return _nowOver ? _nowOver() : Date.now();
  }
  function _iso(t) { return new Date(t).toISOString(); }
  function _ms(iso) { if (iso == null) return NaN; var t = (typeof iso === 'number') ? iso : Date.parse(iso); return isFinite(t) ? t : NaN; }
  function _r1(x) { return Math.round(x * 10) / 10; }
  function _pct(x) { return String(_r1(x * 100)); }               // 0.725 → '72.5', 0.7 → '70'
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function _later(fn, ms) {
    if (_laterOver) return _laterOver(fn, ms);
    if (typeof setTimeout === 'function') return setTimeout(fn, ms || 0);
    fn(); return null;
  }

  // ── 노드와 상태 ────────────────────────────────────────
  function _node(id) {
    if (!id) return null;
    var J = _m('Journey');
    if (J && typeof J.node === 'function') { var n = null; try { n = J.node(id); } catch (e) { n = null; } if (n) return n; }
    var list = _m('JOURNEY_NODES');
    if (Array.isArray(list)) for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }
  function _nodeObj(node) { return (typeof node === 'string') ? _node(node) : (_isObj(node) ? node : null); }
  function _jst() { var s = _call('Journey', 'load'); return _isObj(s) ? s : null; }
  function _save(st) { if (st) _call('Journey', 'save', st); }
  function _bs(st) {
    if (!_isObj(st.boss)) st.boss = { active: null };
    if (st.boss.active === undefined) st.boss.active = null;
    if (!_isObj(st.boss.last)) st.boss.last = {};
    if (st.boss.coachLock === undefined) st.boss.coachLock = null;
    if (!_isObj(st.boss.sets)) st.boss.sets = {};
    return st.boss;
  }
  function _recOf(st, id) {
    var r = st && st.nodes && st.nodes[id];
    if (!_isObj(r)) return { status: 'locked', skipped: false, lesson: { scene: 0, done: false }, drill: { best: 0, n: 0 }, mission: { openedAt: null, hands: 0 } };
    return r;
  }
  function _drillCount(d) {
    if (!d) return 0;
    if (_num(d.count, 0) > 0) return _num(d.count, 0);
    if (Array.isArray(d.set)) return d.set.reduce(function(a, x) { return a + (Array.isArray(x) ? _num(x[1], 0) : 0); }, 0);
    return 0;
  }
  function _drillNeed(d) { var c = _drillCount(d); return c > 0 ? Math.min(c, Math.max(0, Math.floor(_num(d.pass, c)))) : 0; }
  function _drillMet(nd, rec) {
    if (!nd.drill) return true;
    var c = _drillCount(nd.drill);
    if (!(c > 0)) return true;
    return _num(rec.drill && rec.drill.best, 0) + 1e-9 >= _drillNeed(nd.drill) / c;
  }
  function _activeFor(st, id) {
    var a = st && st.boss && st.boss.active;
    return (_isObj(a) && a.node === id) ? a : null;
  }
  function _expiredAt(a, now) { var t = _ms(a && a.startedAt); return isFinite(t) && now - t > EXPIRE_MS; }

  // ── 숨은 좌석(M6-BOSS) 상태 조회 ────────────────────────
  function _condOf(nd, kind) {
    var cs = (nd && nd.mission && Array.isArray(nd.mission.conditions)) ? nd.mission.conditions : [];
    for (var i = 0; i < cs.length; i++) if (_isObj(cs[i]) && cs[i].kind === kind) return cs[i];
    return null;
  }
  function _idCond(nd) { return _condOf(nd, 'identify'); }
  function _hiddenOf(st, id) {
    var h = (st && _isObj(st.boss) && _isObj(st.boss.hidden)) ? st.boss.hidden[id] : null;
    return (_isObj(h) && _isObj(h.seats) && Array.isArray(h.names)) ? h : null;
  }
  function _idRecOf(st, id) {
    var r = (st && _isObj(st.boss) && _isObj(st.boss.identify)) ? st.boss.identify[id] : null;
    return _isObj(r) ? r : null;
  }
  // 배정 프로필 → H4 분류(READ의 VillainTracker.CLASS_OF_TYPE가 있으면 그것, 없으면 같은 표)
  function _classOf(type) {
    var VT = _m('VillainTracker');
    var m = (VT && _isObj(VT.CLASS_OF_TYPE)) ? VT.CLASS_OF_TYPE : null;
    return (m && m[type]) || CLASS_OF_TYPE[type] || null;
  }
  function _idNeed(nd, c) {
    var seats = Math.max(1, Math.floor(_num(c && c.seats, 1)));
    var min = Math.max(1, Math.min(seats, Math.floor(_num(c && c.min, seats))));
    var full = Math.max(1, Math.floor(_num(c && c.minHands, 100)));
    var early = !!(nd && nd.mission && nd.mission.earlySubmit);
    return { seats: seats, min: min, full: full, early: early, gate: early ? Math.min(EARLY_HANDS, full) : full };
  }
  // 좌석별 관찰 [{ name, n, vpip, pfr, tb, aggr, calls, folds, facing }](배정 이름 순). getter(name, key) → castObs 기록
  function _seatObs(asg, getter) {
    return (asg && Array.isArray(asg.names) ? asg.names : []).map(function(nm) {
      var o = null;
      try { o = getter(nm, asg.key); } catch (e) { o = null; }
      if (_isObj(o) && o.key != null && o.key !== asg.key) o = null;
      o = _isObj(o) ? o : {};
      return { name: nm, n: Math.max(0, Math.floor(_num(o.hands, 0))), vpip: _num(o.vpip, 0), pfr: _num(o.pfr, 0), tb: _num(o.tb, 0),
        aggr: _num(o.aggr, 0), calls: _num(o.calls, 0), folds: _num(o.folds, 0), facing: _num(o.facing, 0) };
    });
  }
  function _obsMin(list) { return list.length ? list.reduce(function(m, x) { return Math.min(m, x.n); }, Infinity) : 0; }
  function _jsCast(name, key) { return _call('JStats', 'castObs', name, key); }
  // 지금 배정에서 통과한 맞히기 제출인지(조기 제출은 earlySubmit 노드에서만 minHands를 갈음)
  function _idPassed(rec, asg, need) {
    if (!_isObj(rec) || !asg || rec.key !== asg.key) return false;
    if (_num(rec.correct, 0) < need.min) return false;
    return _num(rec.hands, 0) >= need.full || (need.early && !!rec.early);
  }

  // ── 라벨 ───────────────────────────────────────────────
  function _typeName(t) {
    var J = _m('JourneyUI');
    if (J && typeof J.typeName === 'function') { try { var n = J.typeName(t); if (n) return n; } catch (e) { /* 아래 폴백 */ } }
    return TYPE_FALLBACK[t] || t || '';
  }
  function _drillTxt(d) {
    if (!d) return '';
    var c = _drillCount(d);
    if (d.type === 'mixed' && Array.isArray(d.set)) return '혼합 ' + c + '문항(' + d.set.map(function(x) { return _typeName(x[0]) + ' ' + x[1]; }).join(', ') + ')';
    return _typeName(d.type) + ' ' + c + '문항';
  }
  function _patternLabel(k) {
    var C = _m('Coach'), P = C && C.PATTERNS && C.PATTERNS[k];
    return (P && P.label) || PATTERN_FALLBACK[k] || String(k || '');
  }
  function _list(v, map) { return _arr(v).map(function(x) { return (map && map[x]) || x; }).join(', '); }
  function _filterTxt(f) {
    f = f || {};
    var parts = [];
    if (f.street) parts.push(_list(f.street, STREET_LABEL));
    if (f.pos) parts.push(_list(f.pos));
    if (f.potType != null) parts.push(_list(f.potType, PT_LABEL));
    if (f.multiway != null) parts.push(f.multiway ? '3명 이상 팟' : '1:1 팟');
    if (f.oop != null) parts.push(f.oop ? '포지션 불리(OOP)' : '포지션 유리(IP)');
    if (f.marginal) parts.push('애매한 스팟');
    if (f.concept) parts.push(_list(f.concept, CONCEPT_LABEL));
    if (f.source) parts.push(_list(f.source, SOURCE_LABEL) + ' 판정');
    return parts.join(', ');
  }
  function _hoursTxt(ms) {
    ms = Math.max(0, ms);
    var h = Math.floor(ms / H), m = Math.ceil((ms - h * H) / 60000);
    if (m >= 60) { h += 1; m = 0; }
    if (h <= 0) return m + '분';
    return h + '시간' + (m ? ' ' + m + '분' : '');
  }

  // ── 세트 나눔 드릴(PuzzleUI 세트 상한 20 초과) ──────────
  // 드릴 → [{ set: [[유형, 문항 수], ...], count }]. 20문항 이하면 세트 1개. 앞에서부터 20문항씩 채우고(한 유형이 세트 경계에서
  // 나뉠 수 있다), 마지막 세트가 10문항보다 작으면 앞 세트 끝에서 옮겨 온다(PuzzleUI는 10문항 미만 세트를 반복으로 채운다).
  function _chunks(d) {
    if (!d) return [];
    var items = (Array.isArray(d.set) && d.set.length)
      ? d.set.filter(Array.isArray).map(function(x) { return [x[0], Math.max(0, Math.floor(_num(x[1], 0)))]; })
      : [[d.type, _drillCount(d)]];
    items = items.filter(function(x) { return x[0] && x[1] > 0; });
    var total = items.reduce(function(a, x) { return a + x[1]; }, 0);
    if (!total) return [];
    if (total <= SET_MAX) return [{ set: items, count: total }];
    var out = [], cur = [], n = 0;
    items.forEach(function(x) {
      var k = x[1];
      while (k > 0) {
        if (n >= SET_MAX) { out.push({ set: cur, count: n }); cur = []; n = 0; }
        var take = Math.min(k, SET_MAX - n);
        if (cur.length && cur[cur.length - 1][0] === x[0]) cur[cur.length - 1][1] += take; else cur.push([x[0], take]);
        n += take; k -= take;
      }
    });
    if (n) out.push({ set: cur, count: n });
    var last = out[out.length - 1], prev = out[out.length - 2];
    while (prev && last.count < SET_MIN && prev.count > SET_MIN) {
      var tail = prev.set[prev.set.length - 1];
      tail[1]--; prev.count--;
      if (!tail[1]) prev.set.pop();
      if (last.set[0] && last.set[0][0] === tail[0]) last.set[0][1]++; else last.set.unshift([tail[0], 1]);
      last.count++;
    }
    return out;
  }
  function _chunked(nd) { return !!(nd && nd.drill) && _chunks(nd.drill).length > 1; }
  // 유형별 결과 { 유형: { n, ok } } 합치기
  function _mergeBy(a, b) {
    var o = {};
    [a, b].forEach(function(x) {
      if (!_isObj(x)) return;
      Object.keys(x).forEach(function(t) {
        var s = x[t]; if (!_isObj(s)) return;
        var d = o[t] || (o[t] = { n: 0, ok: 0 });
        d.n += _num(s.n, 0); d.ok += _num(s.ok, 0);
      });
    });
    return o;
  }
  function _partsBy(dr) {
    var by = {};
    (dr && Array.isArray(dr.parts) ? dr.parts : []).forEach(function(p) { by = _mergeBy(by, p && p.byType); });
    return by;
  }
  function _copyBy(by) { return _mergeBy(by, null); }
  // 이 시도의 유형별 결과: 통과한 드릴(또는 이월) byType, 세트를 푸는 중이면 끝낸 세트의 합, 시도가 없으면 마지막 통과 기록
  function _attemptSets(st, nd, act) {
    var dr = act && act.drill;
    if (_isObj(dr)) {
      if (_isObj(dr.byType)) return dr.byType;
      if (Array.isArray(dr.parts) && dr.parts.length) return _partsBy(dr);
      return null;
    }
    if (act) return null;
    var keep = nd && st && st.boss && _isObj(st.boss.sets) ? st.boss.sets[nd.id] : null;
    return (_isObj(keep) && _isObj(keep.byType)) ? keep.byType : null;
  }
  // puzzleSet 조건(보스 드릴 세트 기준)
  function _setConds(nd) {
    var cs = (nd && nd.mission && Array.isArray(nd.mission.conditions)) ? nd.mission.conditions : [];
    return cs.filter(function(c) { return _isObj(c) && c.kind === 'puzzleSet'; });
  }
  // 이 보스의 통과 드릴 결과를 boss.sets에 남겨 다음 시도로 이월하는지(세트 기준 또는 색칠 겹침 조건)
  function _keepsSets(nd) { return _setConds(nd).length > 0 || !!_condOf(nd, 'overlap'); }
  // PuzzleUI 결과의 색칠 겹침(계약 H2 r.paint = [{ spot, overlap }]). 없거나 형식이 다르면 null
  function _paintOf(r) {
    if (!r || !Array.isArray(r.paint)) return null;
    return r.paint.filter(function(p) { return _isObj(p) && isFinite(Number(p.overlap)); })
      .map(function(p) { return { spot: p.spot != null ? String(p.spot) : null, overlap: Number(p.overlap) }; });
  }
  function _setSum(by, types) {
    var n = 0, ok = 0;
    types.forEach(function(t) { var s = by && by[t]; if (_isObj(s)) { n += _num(s.n, 0); ok += _num(s.ok, 0); } });
    return { n: n, ok: ok };
  }
  function _setsOk(nd, by) {
    return _setConds(nd).every(function(c) { return _setSum(by, _arr(c.type)).ok >= Math.floor(_num(c.pass, 0)); });
  }
  // 세트 나눔 드릴에서 지금까지의 결과(by, 전체 n과 ok)로는 더 이상 닿을 수 없는 기준 목록(빈 배열이면 아직 가능)
  function _unreachable(nd, chunks, by, n, ok) {
    var out = [];
    var planned = {};
    chunks.forEach(function(ch) { ch.set.forEach(function(x) { planned[x[0]] = (planned[x[0]] || 0) + x[1]; }); });
    _setConds(nd).forEach(function(c) {
      var types = _arr(c.type), s = _setSum(by, types);
      var plan = types.reduce(function(a, t) { return a + _num(planned[t], 0); }, 0);
      var pass = Math.floor(_num(c.pass, 0));
      if (s.ok + Math.max(0, plan - s.n) < pass) {
        out.push({ label: types.map(_typeName).join(', '), ok: s.ok, n: s.n, pass: pass, count: Math.floor(_num(c.count, plan)) });
      }
    });
    var count = _drillCount(nd.drill), need = _drillNeed(nd.drill);
    if ((n - ok) > count - need) out.push({ label: '드릴 전체', ok: ok, n: n, pass: need, count: count, all: true });
    return out;
  }
  // 보스 흐름의 드릴 통과: 노드 드릴 최고 기록 AND(puzzleSet 조건이 있으면) 그 시도나 이월 결과가 세트 기준 전부
  function _bossDrillMet(nd, st) {
    if (!nd || !nd.drill) return true;
    if (!_drillMet(nd, _recOf(st, nd.id))) return false;
    if (!_setConds(nd).length) return true;
    var a = _activeFor(st, nd.id);
    if (a && _isObj(a.drill) && a.drill.passed && _isObj(a.drill.byType)) return _setsOk(nd, a.drill.byType);
    var keep = st && st.boss && _isObj(st.boss.sets) ? st.boss.sets[nd.id] : null;
    return !!(_isObj(keep) && _isObj(keep.byType) && _setsOk(nd, keep.byType));
  }

  // ── 판정 컨텍스트 ───────────────────────────────────────
  function _midnight(t) { var d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function _dayDiff(a, b) { return Math.round((_midnight(b) - _midnight(a)) / DAY); }
  // ctx = { now, node, rec, active, since, hands, expired, recent(), hseq, handsSince(), hero(), bands(), drillItems(), sets }
  function context(node, stats, state, opts) {
    opts = opts || {};
    var nd = _nodeObj(node) || { id: null, kind: 'learn', mission: null };
    var now = _now(opts.now);
    if (stats === undefined) stats = _m('JStats');
    var st = _isObj(state) ? state : (_jst() || { nodes: {}, boss: { active: null } });
    var rec = _recOf(st, nd.id);
    var isBoss = nd.kind === 'boss';
    var act = isBoss ? _activeFor(st, nd.id) : null;
    var expired = !!(act && _expiredAt(act, now));
    var sinceRaw = (opts.since !== undefined) ? opts.since : ((rec.mission && rec.mission.openedAt) || (act && act.startedAt) || now);
    var since = _ms(sinceRaw);
    if (!isFinite(since)) since = null;
    var hands = isBoss ? ((act && !expired) ? _num(act.hands, 0) : 0) : _num(rec.mission && rec.mission.hands, 0);
    var _rc = null, _hs = null, _ht, _bd, _di;
    var ctx = {
      now: now, node: nd, rec: rec, active: act, since: since, hands: hands, expired: expired, stats: stats, state: st,
      sets: opts.sets || _attemptSets(st, nd, act)
    };
    ctx.recent = function() {
      if (_rc) return _rc;
      var all = Array.isArray(opts.recent) ? opts.recent : null;
      if (!all) {
        try { all = (stats && typeof stats.recent === 'function') ? (stats.recent() || []) : []; } catch (e) { all = []; }
      }
      _rc = (since != null) ? all.filter(function(e) { return e && e.t >= since; }) : all.filter(function(e) { return !!e; });
      return _rc;
    };
    // 완료한 핸드 수(JStats 'handEnd' 기준). 진행 중 핸드의 결정은 h === hseq
    var hseq = opts.hseq;
    if (hseq == null) {
      try { hseq = (stats && typeof stats.handSeq === 'function') ? stats.handSeq() : null; } catch (e) { hseq = null; }
    }
    if (hseq == null) {
      var mx = -1;
      ctx.recent().forEach(function(e) { if (typeof e.h === 'number' && e.h > mx) mx = e.h; });
      hseq = mx + 1;
    }
    ctx.hseq = Math.max(0, _num(hseq, 0));
    // 판정 창 안에서 친 핸드 수(기회 비율 어림용): 학습 노드는 롤링 미션 핸드, 그 밖에는 h 범위
    ctx.handsSince = function() {
      if (_hs != null) return _hs;
      if (!isBoss && rec.mission && _num(rec.mission.hands, 0) > 0) return (_hs = _num(rec.mission.hands, 0));
      var mn = null;
      ctx.recent().forEach(function(e) { if (typeof e.h === 'number' && (mn === null || e.h < mn)) mn = e.h; });
      _hs = (mn === null) ? Math.max(0, hands) : Math.max(hands, ctx.hseq - mn);
      return _hs;
    };
    ctx.hero = function() {
      if (_ht !== undefined) return _ht;
      if (opts.hero) return (_ht = opts.hero);
      if (!stats || typeof stats.heroTotals !== 'function') return (_ht = null);
      var days = (since != null) ? Math.max(1, _dayDiff(since, now) + 1) : 90;
      try { _ht = stats.heroTotals(days, now) || null; } catch (e) { _ht = null; }
      return _ht;
    };
    ctx.bands = function() {
      if (_bd !== undefined) return _bd;
      if (opts.bands) return (_bd = opts.bands);
      _bd = null;
      var HS = _m('HeroStats');
      if (HS && typeof HS.bandsFromChart === 'function') { try { _bd = HS.bandsFromChart() || null; } catch (e) { _bd = null; } }
      return _bd;
    };
    ctx.drillItems = function() {
      if (_di !== undefined) return _di;
      if (opts.drillItems) return (_di = opts.drillItems);
      _di = null;
      var D = _m('Drills');
      if (D && typeof D._load === 'function') { try { var d = D._load(); _di = (d && _isObj(d.items)) ? d.items : null; } catch (e) { _di = null; } }
      return _di;
    };
    // M6-BOSS: 은닉 배정, 맞히기 제출, 좌석 관찰, 주간 복기 주, 색칠 결과, 짧은 세션(테스트는 opts로 직접 넣는다)
    ctx.hidden = function() { return (opts.hidden !== undefined) ? opts.hidden : _hiddenOf(st, nd.id); };
    ctx.idRec = function() { return (opts.identify !== undefined) ? opts.identify : _idRecOf(st, nd.id); };
    ctx.castObs = function(name, key) {
      if (opts.castObs) { var o = opts.castObs[name]; return _isObj(o) ? o : null; }
      var S = (stats && typeof stats.castObs === 'function') ? stats : (stats === undefined ? _m('JStats') : null);
      if (!S || typeof S.castObs !== 'function') return null;
      try { return S.castObs(name, key) || null; } catch (e) { return null; }
    };
    ctx.weeks = function() {
      if (Array.isArray(opts.reportWeeks)) return opts.reportWeeks;
      if (_can('ReviewQueue', 'reportWeeks')) { var w = _call('ReviewQueue', 'reportWeeks'); if (Array.isArray(w)) return w; }
      var rv = st.review;
      return (_isObj(rv) && Array.isArray(rv.views)) ? rv.views : [];
    };
    ctx.paint = function() {
      if (Array.isArray(opts.paint)) return opts.paint;
      if (act && _isObj(act.drill)) return Array.isArray(act.drill.paint) ? act.drill.paint : null;
      if (act) return null;
      var keep = st.boss && _isObj(st.boss.sets) ? st.boss.sets[nd.id] : null;
      return (_isObj(keep) && Array.isArray(keep.paint)) ? keep.paint : null;
    };
    ctx.shorts = function() { return Array.isArray(opts.shortSessions) ? opts.shortSessions : (Array.isArray(st.shortSessions) ? st.shortSessions : []); };
    return ctx;
  }

  // 이 버전이 모르는 필터 키(있으면 그 조건은 pending)
  function _soonFilter(f) {
    if (!_isObj(f)) return null;
    var keys = Object.keys(f).filter(function(k) { return f[k] != null && !FILTER_OK[k]; });
    if (!keys.length) return null;
    return keys.join(', ');
  }
  // 필터 키 multiway, oop, potType은 기록 필드 mw, oop, pt를 본다(계약 F2). 필드가 없거나 null이면(예전 기록, 프리플랍 oop) 맞지 않음
  function _match(e, f) {
    if (!f) return true;
    for (var k in f) {
      if (!Object.prototype.hasOwnProperty.call(f, k)) continue;
      var v = f[k];
      if (v == null) continue;
      var fld = FILTER_FIELD[k] || k, x = e[fld];
      if (FILTER_FIELD[k] && x == null) return false;
      if (Array.isArray(v)) { if (v.indexOf(x) < 0) return false; }
      else if (typeof v === 'boolean') { if (!!x !== v) return false; }
      else if (x !== v) return false;
    }
    return true;
  }
  function _wait(it) { it.wait = true; it.have = WAIT_TXT; return it; }
  function _filtered(ctx, f) { return ctx.recent().filter(function(e) { return _match(e, f); }); }
  // 필터에 맞는 기회가 핸드당 몇 번 나오는지: 판정 창에서 5핸드 이상 쳤고 기회가 있으면 실측, 아니면 필터로 어림
  function _rate(ctx, f, nAll) {
    var hs = ctx.handsSince();
    if (hs >= 5 && nAll > 0) return Math.max(0.05, nAll / hs);
    f = f || {};
    var r = 1;
    if (f.pos) r *= Math.max(1, _arr(f.pos).length) / 6;
    if (f.street && _arr(f.street).indexOf('preflop') < 0) r *= 0.5;
    if (f.concept && _arr(f.concept).indexOf('rfi') < 0) r *= 0.4;
    if (f.source && _arr(f.source).indexOf('chart') < 0) r *= 0.5;
    if (f.marginal) r *= 0.3;
    if (f.multiway) r *= 0.3;                                   // 플랍 이후 3명 이상 팟
    if (f.oop) r *= 0.5;
    if (f.potType != null) r *= (_arr(f.potType).indexOf('srp') >= 0 || _arr(f.potType).indexOf('limp') >= 0) ? 0.5 : 0.1;   // 3벳 팟은 드묾
    return Math.max(0.05, r);
  }
  function _handsFor(opps, rate) { return Math.max(1, Math.ceil(opps / rate - 1e-9)); }
  function _pendingItem(c, label) {
    return { kind: c.kind, ok: false, pending: true, have: null, need: null, opp: null, label: label,
      why: label + ': 다음 업데이트에서 판정해요' };
  }
  // 기회 이름: 필터 글이 이미 "판정"으로 끝나면(차트 판정) 그대로 + 기회, 아니면 + 판정 기회
  function _oppName(head) { head = String(head || ''); return head ? head + (/판정$/.test(head) ? ' 기회' : ' 판정 기회') : '판정 기회'; }
  function _holdWhy(name, missing, more, extra) {
    return name + '가 ' + missing + '번 더 쌓이면 판정해요(핸드 약 ' + more + '개 더)' + (extra || '');
  }

  // ── 조건 10종 ──────────────────────────────────────────
  // pattern: { pattern, max, window? | minOpp?, filter?, ref? }. window = 최근 핸드 수, minOpp = 최근 기회 수(미달이면 보류)
  //   ref = 참고 표시(통과 미반영, light와 같은 처리: item.ref, label 뒤 '(참고, 통과 조건 아님)'). 가이드 휴리스틱 패턴(S6 마스터 시험)이 쓴다.
  function _pattern(c, ctx) {
    var it = _patternCore(c, ctx);
    if (c && c.ref && it) {
      it.ref = true;
      if (it.label) it.label += '(참고, 통과 조건 아님)';
    }
    return it;
  }
  function _patternCore(c, ctx) {
    var soon = _soonFilter(c.filter);
    if (soon) return _pendingItem(c, soon + ' 기록 "' + _patternLabel(c.pattern) + '"');
    var pl = '"' + _patternLabel(c.pattern) + '"';
    var max = Math.max(0, Math.floor(_num(c.max, 0)));
    var all = _filtered(ctx, c.filter);
    var pos = (c.filter && c.filter.pos) ? '(' + _list(c.filter.pos) + ')' : '';
    var it = { kind: 'pattern', pattern: c.pattern, max: max, opp: null };
    if (c.minOpp == null || c.window != null) {
      var W = Math.max(1, Math.floor(_num(c.window, DEFAULT_WINDOW)));
      var from = ctx.hseq - W;
      var inWin = all.filter(function(e) { return typeof e.h === 'number' && e.h >= from; });
      var viol = inWin.filter(function(e) { return e.pattern === c.pattern; });
      it.window = W; it.count = viol.length;
      it.ok = viol.length <= max;
      it.label = '최근 ' + W + '핸드' + pos + ' ' + pl;
      it.have = viol.length + '회'; it.need = '허용 ' + max + '회';
      if (!inWin.length && ctx.handsSince() === 0) _wait(it);                  // 판정 창 안 핸드 0개(ok는 그대로)
      if (!it.ok) {
        var hs = viol.map(function(e) { return e.h; }).sort(function(a, b) { return a - b; });
        var v = hs[hs.length - 1 - max];
        it.more = Math.max(1, v + W + 1 - ctx.hseq);
        it.why = '최근 ' + W + '핸드 안에 ' + pl + ' ' + viol.length + '회(허용 ' + max + '회). 이 기록이 최근 ' + W + '핸드 밖으로 밀려나려면 핸드 ' + it.more + '개 더(그동안 0회)';
      }
      return it;
    }
    var M = Math.max(1, Math.floor(_num(c.minOpp, 10)));
    var ft = _filterTxt(c.filter);
    if (all.length < M) {
      it.ok = false; it.hold = true; it.est = true;
      it.more = _handsFor(M - all.length, _rate(ctx, c.filter, all.length));
      it.label = pl + ' 판정 기회' + (ft ? '(' + ft + ')' : '');
      it.have = all.length; it.need = M;
      it.why = _holdWhy(pl + ' 판정 기회' + (ft ? '(' + ft + ')' : ''), M - all.length, it.more);
      if (!all.length) _wait(it);
      return it;
    }
    var last = all.slice(-M);
    var idx = [];
    last.forEach(function(e, i) { if (e.pattern === c.pattern) idx.push(i); });
    it.count = idx.length; it.opp = M;
    it.ok = idx.length <= max;
    it.label = '최근 기회 ' + M + '번' + pos + ' ' + pl;
    it.have = idx.length + '회'; it.need = '허용 ' + max + '회';
    if (!it.ok) {
      var drop = idx[idx.length - 1 - max] + 1;               // 이만큼 새 기회가 쌓이면 그 기록이 창에서 빠진다
      it.est = true;
      it.more = _handsFor(drop, _rate(ctx, c.filter, all.length));
      it.why = '최근 기회 ' + M + '번 중 ' + pl + ' ' + idx.length + '회(허용 ' + max + '회). 기회 ' + drop + '번 더(핸드 약 ' + it.more + '개 더) 실수 없이 치면 빠져요';
    }
    return it;
  }

  // light: { filter, light, min? | max? | maxCount?, minOpp, window?, per?, ref? }
  function _lightHit(toks) {
    return function(e) { return toks.some(function(t) { return t === 'marginal' ? !!e.marginal : e.light === t; }); };
  }
  function _ratioOk(cnt, n, c) {
    if (c.min != null) return cnt >= Math.ceil(_num(c.min, 0) * n - 1e-9);
    return cnt <= Math.floor(_num(c.max, 1) * n + 1e-9);
  }
  // 다음 판정 x번이 모두 기준 쪽(min이면 맞힘, max면 해당 신호 없음)일 때 기준에 닿는 최소 x
  function _ratioMore(cnt, n, c) {
    for (var x = 1; x <= 2000; x++) {
      if (c.min != null ? _ratioOk(cnt + x, n + x, c) : _ratioOk(cnt, n + x, c)) return x;
    }
    return null;
  }
  function _light(c, ctx) {
    var soon = _soonFilter(c.filter);
    var toks = _arr(c.light).length ? _arr(c.light) : ['green'];
    var tokTxt = toks.map(function(t) { return LIGHT_LABEL[t] || t; }).join(' 또는 ');
    var head = _filterTxt(c.filter);
    var oppN = _oppName(head);
    if (!head) head = '전체 결정';
    if (soon) { var p = _pendingItem(c, soon + ' 결정의 ' + tokTxt); if (c.ref) p.ref = true; return p; }
    var hit = _lightHit(toks);
    var all = _filtered(ctx, c.filter);
    var it = { kind: 'light', light: toks, opp: null };
    if (c.ref) it.ref = true;
    var refTxt = c.ref ? '(참고, 통과 조건 아님)' : '';
    var M;
    if (c.per === 'concept') {
      M = Math.max(1, Math.floor(_num(c.minOpp, MIN_OPP)));
      var pool = c.window ? all.slice(-Math.floor(c.window)) : all;
      var groups = {}, order = [];
      pool.forEach(function(e) { var k = e.concept || '기타'; if (!groups[k]) { groups[k] = { n: 0, c: 0 }; order.push(k); } groups[k].n++; if (hit(e)) groups[k].c++; });
      var judged = order.filter(function(k) { return groups[k].n >= M; });
      if (!judged.length) {
        var top = order.reduce(function(a, k) { return Math.max(a, groups[k].n); }, 0);
        it.ok = false; it.hold = true; it.est = true;
        it.more = _handsFor(M - top, _rate(ctx, c.filter, pool.length) / Math.max(1, order.length));
        it.label = oppN + '(유형별)' + refTxt; it.have = top; it.need = M;
        it.why = _holdWhy('한 유형의 ' + oppN, M - top, it.more);
        if (!pool.length) _wait(it);
        return it;
      }
      var bad = judged.filter(function(k) { return !_ratioOk(groups[k].c, groups[k].n, c); });
      var worst = judged.slice().sort(function(a, b) {
        var ra = groups[a].c / groups[a].n, rb = groups[b].c / groups[b].n;
        return c.min != null ? ra - rb : rb - ra;
      })[0];
      it.ok = !bad.length; it.opp = pool.length;
      it.label = head + ' 유형마다 ' + tokTxt + refTxt;
      it.have = _pct(groups[worst].c / groups[worst].n) + '%(' + (CONCEPT_LABEL[worst] || worst) + ')';
      it.need = c.min != null ? _pct(c.min) + '% 이상' : _pct(c.max) + '% 이하';
      if (!it.ok) {
        it.why = bad.map(function(k) { return (CONCEPT_LABEL[k] || k) + ' ' + tokTxt + ' ' + _pct(groups[k].c / groups[k].n) + '%'; }).join(', ') +
          '. 기준은 ' + it.need;
      }
      return it;
    }
    if (c.maxCount != null) {
      var maxC = Math.max(0, Math.floor(_num(c.maxCount, 0)));
      var needN = c.window ? Math.max(0, Math.floor(_num(c.minOpp, 0))) : Math.max(1, Math.floor(_num(c.minOpp, MIN_OPP)));
      var pool2 = c.window ? all.slice(-Math.floor(c.window)) : all.slice(-needN);
      if (pool2.length < needN || (c.window && all.length < needN)) {
        it.ok = false; it.hold = true; it.est = true;
        it.more = _handsFor(needN - pool2.length, _rate(ctx, c.filter, all.length));
        it.label = oppN + refTxt; it.have = pool2.length; it.need = needN;
        it.why = _holdWhy(oppN, needN - pool2.length, it.more);
        if (!pool2.length) _wait(it);
        return it;
      }
      var cnt2 = pool2.filter(hit).length;
      it.count = cnt2; it.ok = cnt2 <= maxC; it.opp = pool2.length;
      it.label = head + ' ' + tokTxt + ' 횟수(최근 기회 ' + pool2.length + '번)' + refTxt;
      it.have = cnt2 + '번'; it.need = '허용 ' + maxC + '번';
      if (!pool2.length) _wait(it);                                          // window만 있고 minOpp 0인 경우
      if (!it.ok) it.why = '최근 기회 ' + pool2.length + '번 중 ' + tokTxt + ' ' + cnt2 + '번(허용 ' + maxC + '번). 실수 없이 더 치면 오래된 기록부터 빠져요';
      return it;
    }
    // 비율
    M = Math.max(1, Math.floor(_num(c.minOpp, MIN_OPP)));
    var pool3 = c.window ? all.slice(-Math.floor(c.window)) : all;
    var n = pool3.length, cnt = pool3.filter(hit).length;
    it.n = n; it.count = cnt;
    if (n < M) {
      it.ok = false; it.hold = true; it.est = true;
      it.more = _handsFor(M - n, _rate(ctx, c.filter, all.length));
      it.label = oppN + refTxt; it.have = n; it.need = M;
      it.why = _holdWhy(oppN, M - n, it.more, n ? '. 지금 ' + tokTxt + ' ' + _pct(cnt / n) + '%' : '');
      if (!n) _wait(it);
      return it;
    }
    it.ratio = cnt / n;
    it.ok = _ratioOk(cnt, n, c);
    it.opp = n;
    it.label = head + ' ' + tokTxt + refTxt;
    it.have = _pct(cnt / n) + '%';
    it.need = c.min != null ? _pct(c.min) + '% 이상' : _pct(c.max) + '% 이하';
    if (!it.ok) {
      var x = _ratioMore(cnt, n, c);
      if (x) { it.est = true; it.more = _handsFor(x, _rate(ctx, c.filter, all.length)); }
      it.why = tokTxt + ' ' + it.have + ', 기준 ' + it.need + '.' +
        (x ? ' 다음 판정 ' + x + '번을 모두 ' + (c.min != null ? tokTxt + '(으)로 하면 넘어요' : tokTxt + ' 없이 넘기면 내려가요') : '');
    }
    return it;
  }

  // drillSet / puzzleSet: { type(유형 또는 배열), count, pass, tol? }. 이 시도의 드릴 결과(유형별 집계 ctx.sets) 또는 노드 드릴 최고 기록
  function _setStats(ctx, types) {
    var sets = ctx.sets;
    if (!_isObj(sets)) return null;
    var n = 0, ok = 0, any = false;
    types.forEach(function(t) { var s = sets[t]; if (_isObj(s)) { any = true; n += _num(s.n, 0); ok += _num(s.ok, 0); } });
    return any ? { n: n, ok: ok } : null;
  }
  function _set(c, ctx) {
    var types = _arr(c.type);
    var pass = Math.max(0, Math.floor(_num(c.pass, 0))), count = Math.max(0, Math.floor(_num(c.count, 0)));
    var s = _setStats(ctx, types);
    var nd = ctx.node;
    if (!s && c.kind === 'drillSet' && nd && nd.drill && types.length === 1 && nd.drill.type === types[0] && ctx.rec.drill && _num(ctx.rec.drill.n, 0) > 0) {
      s = { n: count || _drillCount(nd.drill), ok: Math.round(_num(ctx.rec.drill.best, 0) * (count || _drillCount(nd.drill))) };
    }
    var label = types.map(_typeName).join(', ') + ' ' + count + '문항' + (c.tol ? '(콤보 수 ±' + c.tol + ' 허용)' : '');
    var it = { kind: c.kind, label: label, need: pass + '개 이상', opp: null };
    if (!s) { it.ok = false; it.have = null; it.why = label + ' 세트를 풀어야 해요'; return it; }
    it.n = s.n; it.count = s.ok;
    it.ok = s.ok >= pass;
    it.have = s.ok + '개';
    if (!it.ok) it.why = label + ' 중 ' + s.ok + '개 정답, ' + pass + '개 이상 필요(' + (pass - s.ok) + '개 더)';
    return it;
  }

  // band: { metric:'vpip'|'pfr'|'tb'|'f3', tol, minOpp }. 판정 창(노드가 열린 날부터)의 히어로 지표 vs HeroStats.bandsFromChart 중간값 ± tol
  function _band(c, ctx) {
    var metric = String(c.metric || 'vpip'), ml = METRIC_LABEL[metric] || metric;
    var bands = ctx.bands();
    var b = bands && bands[metric];
    if (!b || !isFinite(Number(b.mid))) return _pendingItem(c, ml + ' 밴드(차트 계산)');
    var tol = _num(c.tol, 4), lo = _r1(Number(b.mid) - tol), hi = _r1(Number(b.mid) + tol);
    var tot = ctx.hero() || {};
    var opp = Math.max(0, _num(tot[metric + 'Opp'], 0)), val = Math.max(0, _num(tot[metric], 0));
    var M = Math.max(1, Math.floor(_num(c.minOpp, MIN_OPP)));
    var it = { kind: 'band', metric: metric, lo: lo, hi: hi, opp: null };
    if (opp < M) {
      it.ok = false; it.hold = true; it.est = true;
      it.more = Math.max(1, M - opp);                            // 기회는 핸드당 약 1번
      it.label = ml + ' 판정 기회'; it.have = opp; it.need = M;
      it.why = _holdWhy(ml + ' 판정 기회', M - opp, it.more);
      if (!opp) _wait(it);
      return it;
    }
    var pct = val / opp * 100;
    it.value = _r1(pct);
    it.ok = pct >= lo - 1e-9 && pct <= hi + 1e-9;
    it.opp = opp;
    it.label = ml + '(이 앱 차트 밴드)';
    it.have = _r1(pct) + '%'; it.need = lo + '~' + hi + '%';
    if (!it.ok) it.why = '내 ' + ml + ' ' + _r1(pct) + '%, 이 앱 차트 밴드 ' + lo + '~' + hi + '%보다 ' + (pct > hi ? '높아요' : '낮아요') + '. 차트대로 치면 밴드로 들어와요';
    return it;
  }

  // hands: { min }(체험 미션). 학습 노드는 롤링 미션 핸드, 보스는 보스 카운터
  function _handsCond(c, ctx) {
    var min = Math.max(0, Math.floor(_num(c.min, 0)));
    var it = { kind: 'hands', label: '실전 핸드', have: ctx.hands, need: min, opp: null, ok: ctx.hands >= min };
    if (!it.ok) { it.more = min - ctx.hands; it.why = '실전 핸드 ' + it.more + '개 더'; }
    return it;
  }

  // custom luckMeterViews(계약 F1): 판정 창 시작 뒤 운 미터 카드를 연 횟수 ≥ min. HeroStats.luckViews(시작 ms), 없으면 state.luck.views.
  //   둘 다 없으면 null(운 미터 기능 전)
  function _luckViews(ctx) {
    var from = (ctx.since != null) ? ctx.since : 0;
    if (_can('HeroStats', 'luckViews')) {
      var v = _call('HeroStats', 'luckViews', from);
      if (typeof v === 'number' && isFinite(v)) return Math.max(0, Math.floor(v));
    }
    var L = ctx.state && ctx.state.luck;
    if (!_isObj(L) || !Array.isArray(L.views)) return null;
    return L.views.filter(function(x) { var t = _ms(x && x.at); return isFinite(t) && t >= from; }).length;
  }
  function _luck(c, ctx) {
    var k = _luckViews(ctx);
    if (k == null) return _pendingItem(c, CUSTOM_PENDING.luckMeterViews);
    var min = Math.max(1, Math.floor(_num(c.min, 1)));
    var it = { kind: 'custom', fn: c.fn, label: '운 미터 카드 보기', have: k + '번', need: min + '번', opp: null, count: k, ok: k >= min };
    if (!it.ok) it.why = '운 미터 카드(올인 승부가 난 핸드 뒤에 생기는 카드)를 ' + (min - k) + '번 더 열어 봐요';
    return it;
  }
  // custom: srsBoxRatio = 복습 카드(type|keyPrefix) 중 box ≥ 기준 비율(카드 minOpp장부터 판정, 기본 30), luckMeterViews. 나머지 fn은 다음 업데이트
  function _custom(c, ctx) {
    if (c.fn === 'luckMeterViews') return _luck(c, ctx);
    if (c.fn === 'shortSession') return _shortSession(c, ctx);
    if (c.fn !== 'srsBoxRatio') return _pendingItem(c, CUSTOM_PENDING[c.fn] || ('조건 ' + (c.fn || '')));
    var items = ctx.drillItems();
    var pre = String(c.type || 'preflop') + '|' + String(c.keyPrefix || '');
    var box = Math.max(0, Math.floor(_num(c.box, 3)));
    var nm = (String(c.keyPrefix || '') === 'rfi|') ? '오픈 복습 카드' : '복습 카드';
    var N = 0, k = 0;
    if (_isObj(items)) Object.keys(items).forEach(function(id) {
      var x = items[id];
      if (id.indexOf(pre) !== 0 || !_isObj(x) || !(_num(x.n, 0) > 0)) return;
      N++; if (_num(x.box, 0) >= box) k++;
    });
    var M = Math.max(1, Math.floor(_num(c.minOpp, MIN_OPP)));
    var it = { kind: 'custom', fn: c.fn, n: N, count: k, opp: null };
    if (N < M) {
      it.ok = false; it.hold = true;
      it.label = nm + '(판정에 필요한 장 수)'; it.have = N; it.need = M;
      it.why = nm + '가 ' + (M - N) + '장 더 쌓이면 판정해요(드릴과 게임의 프리플랍 결정에서 쌓여요)';
      if (!N) _wait(it);
      return it;
    }
    var needK = Math.ceil(_num(c.min, 0) * N - 1e-9);
    it.ok = k >= needK;
    it.label = nm + ' ' + box + '단계 이상(카드 ' + N + '장)';
    it.have = _pct(k / N) + '%'; it.need = _pct(_num(c.min, 0)) + '% 이상';
    if (!it.ok) it.why = nm + ' ' + box + '단계 이상 ' + k + '장/' + N + '장. ' + (needK - k) + '장 더 ' + box + '단계로 올리면 넘어요(복습에서 맞힐 때마다 한 단계씩)';
    return it;
  }

  // ── M6-BOSS 조건 4개 ───────────────────────────────────
  // identify: 관찰(좌석마다 가장 적게 본 수) → 제출 → 통과. 머리 주석의 조기 제출, 다시 섞기 규칙
  function _identify(c, ctx) {
    var nd = ctx.node, need = _idNeed(nd, c);
    var asg = ctx.hidden(), rec = ctx.idRec();
    var who = need.seats > 1 ? '숨은 좌석 ' + need.seats + '곳' : '숨은 좌석';
    var it = { kind: 'identify', opp: null, seats: need.seats, min: need.min };
    if (_idPassed(rec, asg, need)) {
      it.ok = true; it.count = _num(rec.correct, 0);
      it.label = who + ' 유형 맞히기' + (rec.early ? '(조기 제출)' : '');
      it.have = rec.correct + '곳'; it.need = need.min + '곳 이상';
      return it;
    }
    var obs = asg ? _seatObs(asg, ctx.castObs) : [];
    var lo = obs.length ? _obsMin(obs) : 0;
    it.obs = lo;
    var prev = (_isObj(rec) && asg && rec.key !== asg.key) ? rec : null;           // 지난 배정에서 못 미친 제출(그 뒤 새로 섞음)
    if (lo < need.gate) {
      it.ok = false; it.hold = true;
      it.label = who + ' 관찰(가장 적게 본 좌석)';
      it.have = lo + '핸드'; it.need = need.full + '핸드';
      var tbl = asg ? Math.max(0, _num(asg.hands, 0)) : 0;
      var rate = (tbl >= 5 && lo > 0) ? Math.max(0.2, Math.min(1, lo / tbl)) : OBS_RATE;
      it.est = true; it.more = _handsFor(need.gate - lo, rate);
      it.why = (prev ? '지난 제출은 ' + _num(prev.total, need.seats) + '곳 중 ' + _num(prev.correct, 0) + '곳이라 좌석을 새로 섞었어요. ' : '') +
        '숨은 좌석을 좌석마다 ' + need.gate + '핸드 이상 지켜보면 유형 맞히기를 제출할 수 있어요(핸드 약 ' + it.more + '개 더' +
        (need.early ? ', 기준 ' + need.full + '핸드 전에 내는 조기 제출' : '') + ')';
      if (!lo) _wait(it);
      return it;
    }
    it.ok = false; it.submit = true;
    it.label = who + ' 유형 맞히기';
    it.have = '제출 전'; it.need = need.min + '곳 이상';
    it.why = '🕵 숨은 좌석 유형 맞히기에서 ' + (need.seats > 1 ? need.seats + '곳 중 ' + need.min + '곳 이상 맞히기' : '유형 고르고 제출하기') +
      (lo < need.full ? '(조기 제출, 기준 ' + need.full + '핸드 전)' : '');
    return it;
  }
  // ISO 주(로컬 날짜 기준, JStats.weekKey와 같은 식)
  function _weekKeyOf(t) {
    var JS = _m('JStats');
    if (JS && typeof JS.weekKey === 'function') { try { var k = JS.weekKey(t); if (k) return k; } catch (e) { /* 아래 */ } }
    var d = new Date(t);
    var u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dow = u.getUTCDay() || 7;
    u.setUTCDate(u.getUTCDate() + 4 - dow);
    var y = u.getUTCFullYear();
    var wk = Math.ceil(((u.getTime() - Date.UTC(y, 0, 1)) / DAY + 1) / 7);
    return y + '-W' + (wk < 10 ? '0' : '') + wk;
  }
  // 'YYYY-Www' → 그 주 월요일의 일 번호(UTC), 형식이 틀리면 null
  function _weekIdx(wk) {
    var m = /^(\d{4})-W(\d{2})$/.exec(String(wk || ''));
    if (!m) return null;
    var y = Number(m[1]), w = Number(m[2]);
    if (w < 1 || w > 53) return null;
    var jan4 = Date.UTC(y, 0, 4), dow = new Date(jan4).getUTCDay() || 7;
    return Math.round(jan4 / DAY) - (dow - 1) + (w - 1) * 7;
  }
  // 지금 이어지는 연속 주 수: 마지막으로 연 주가 이번 주나 지난주면 거기서 거꾸로 이어진 주 수, 그보다 오래면 0
  function weekStreak(weeks, now) {
    var cur = _weekIdx(_weekKeyOf(_now(now)));
    var idx = _arr(weeks).map(_weekIdx).filter(function(x) { return x != null && (cur == null || x <= cur); });
    idx = idx.filter(function(x, i) { return idx.indexOf(x) === i; }).sort(function(a, b) { return a - b; });
    if (!idx.length || cur == null) return { run: 0, thisWeek: false };
    var last = idx[idx.length - 1];
    if (last < cur - 7) return { run: 0, thisWeek: false };
    var run = 1;
    for (var i = idx.length - 2; i >= 0 && idx[i] === idx[i + 1] - 7; i--) run++;
    return { run: run, thisWeek: last === cur };
  }
  function _weeks(c, ctx) {
    var min = Math.max(1, Math.floor(_num(c.min, 1)));
    var s = weekStreak(ctx.weeks(), ctx.now);
    var it = { kind: 'weeks', opp: null, count: s.run, ok: s.run >= min, label: min > 1 ? '주간 복기 연속' : '주간 복기',
      have: s.run + '주', need: min + '주' + (min > 1 ? ' 연속' : '') };
    if (!it.ok) {
      if (s.thisWeek) {
        it.later = true;
        it.why = '이번 주 주간 리포트는 열었어요. 다음 주에도 열면 ' + (s.run + 1) + '주 연속(' + min + '주 필요)';
      } else {
        it.why = '이번 주 주간 리포트(홈 📅 카드 또는 📊)를 열어 보세요' + (min > 1 ? '. 매주 한 번씩 ' + min + '주 연속이면 채워요' : '');
      }
    }
    return it;
  }
  // overlap: 보스 색칠 드릴 r.paint(계약 H2)에서 겹침 ≥ min인 항목 수
  function _overlap(c, ctx) {
    var spots = Math.max(1, Math.floor(_num(c.spots, 3))), min = _num(c.min, 0.7);
    var it = { kind: 'overlap', opp: null, label: '레인지 색칠 겹침 ' + _pct(min) + '% 이상', need: spots + '스팟' };
    var list = ctx.paint(), k = null;
    if (Array.isArray(list)) {
      k = list.filter(function(p) { return _isObj(p) && _num(p.overlap, -1) + 1e-9 >= min; }).length;
    } else {
      // r.paint가 없는 결과(머지 전 PuzzleUI): 드릴 문항 기준(drill.overlap)이 min 이상이면 rangepaint 정답 수로 갈음
      var nd = ctx.node, dov = (nd && nd.drill && nd.drill.type === 'rangepaint') ? _num(nd.drill.overlap, 0.7) : null;
      var by = _isObj(ctx.sets) ? ctx.sets.rangepaint : null;
      if (dov != null && dov + 1e-9 >= min && _isObj(by)) k = Math.max(0, Math.floor(_num(by.ok, 0)));
    }
    if (k == null) { it.ok = false; it.have = null; it.why = '레인지 색칠 드릴 ' + spots + '스팟을 풀어야 해요(겹침 ' + _pct(min) + '% 이상)'; return it; }
    it.count = k; it.ok = k >= spots; it.have = k + '스팟';
    if (!it.ok) it.why = '겹침 ' + _pct(min) + '% 이상 ' + k + '스팟, ' + spots + '스팟 필요';
    return it;
  }
  // custom shortSession: 판정 창 안에서 분량 전에 스스로 끝낸 세션(핸드 1 ~ maxHands)
  function _shortSession(c, ctx) {
    var min = Math.max(1, Math.floor(_num(c.min, 1))), maxH = Math.max(1, Math.floor(_num(c.maxHands, 5)));
    var from = ctx.since;
    var k = ctx.shorts().filter(function(x) {
      if (!_isObj(x)) return false;
      var h = _num(x.hands, 0), t = _ms(x.at);
      return h >= 1 && h <= maxH && (from == null || (isFinite(t) && t >= from));
    }).length;
    var it = { kind: 'custom', fn: 'shortSession', opp: null, count: k, ok: k >= min,
      label: '스스로 일찍 끝낸 세션(' + maxH + '핸드 분량 전)', have: k + '번', need: min + '번' };
    if (!it.ok) it.why = '게임 중 세션 종료 버튼으로 ' + maxH + '핸드 분량이 끝나기 전에 세션을 끝내 보세요(멈출 신호를 느꼈다고 치고 연습)';
    return it;
  }

  function evalCondition(c, ctx) {
    if (!_isObj(c) || !c.kind) return { kind: 'unknown', ok: false, pending: true, have: null, need: null, opp: null, label: '알 수 없는 조건', why: '알 수 없는 조건' };
    switch (c.kind) {
      case 'pattern': return _pattern(c, ctx);
      case 'light': return _light(c, ctx);
      case 'drillSet': case 'puzzleSet': return _set(c, ctx);
      case 'band': return _band(c, ctx);
      case 'hands': return _handsCond(c, ctx);
      case 'custom': return _custom(c, ctx);
      case 'identify': return _identify(c, ctx);
      case 'weeks': return _weeks(c, ctx);
      case 'overlap': return _overlap(c, ctx);
      default:
        return _pendingItem(c, PENDING_KIND[c.kind] || ('조건 ' + c.kind));
    }
  }

  // 보스 전용 항목: 드릴(노드 drill 최고 기록)과 보스 카운터
  function _drillItem(nd, ctx) {
    var c = _drillCount(nd.drill), need = _drillNeed(nd.drill), r = ctx.rec, n = _num(r.drill && r.drill.n, 0);
    var a = ctx.active;
    var sets = _setConds(nd).length > 0;
    var ok = sets ? _bossDrillMet(nd, ctx.state) : _drillMet(nd, r);
    var have = (a && a.drill && a.drill.n) ? _num(a.drill.ok, 0) : (n > 0 ? Math.round(_num(r.drill.best, 0) * c) : null);
    var parts = (a && a.drill && !a.drill.passed && Array.isArray(a.drill.parts) && a.drill.parts.length) ? a.drill.parts : null;
    var haveTxt = have == null ? null : have + '개';
    if (parts) {                                                         // 세트 나눔 드릴을 푸는 중: 끝낸 세트의 정답 합
      var pok = parts.reduce(function(s, p) { return s + _num(p && p.ok, 0); }, 0);
      haveTxt = pok + '개(세트 ' + parts.length + '/' + _chunks(nd.drill).length + ')';
    }
    var it = { kind: 'drillSet', drill: true, ok: ok, label: '드릴 ' + _drillTxt(nd.drill), have: haveTxt, need: need + '개 이상', opp: null };
    if (parts) { it.part = parts.length + 1; it.parts = _chunks(nd.drill).length; }      // 다음에 풀 세트(지도 힌트용)
    if (!ok) {
      if (parts) it.why = '드릴 세트 ' + (parts.length + 1) + '/' + _chunks(nd.drill).length + '부터 이어서 풀기';
      else if (sets) it.why = '드릴 ' + _drillTxt(nd.drill) + '을 풀어 아래 유형별 기준을 모두 채우기';
      else it.why = (n > 0 && have != null) ? '드릴 ' + have + '개 정답, ' + need + '개 이상 필요' : '드릴 ' + _drillTxt(nd.drill) + ' 중 ' + need + '개 이상 맞히기';
    }
    return it;
  }
  function _handsItem(nd, ctx) {
    var need = Math.max(0, Math.floor(_num(nd.mission.hands, 0)));
    var ic = _idCond(nd);
    if (ic) {
      // 은닉 보스: 배정 뒤 은닉 테이블 핸드(세션과 시도를 넘어 누적). 맞히기 통과(조기 제출 포함)면 채운 것으로 본다
      var asg = ctx.hidden(), h = asg ? Math.max(0, Math.floor(_num(asg.hands, 0))) : 0;
      var idOk = _idPassed(ctx.idRec(), asg, _idNeed(nd, ic));
      var hi = { kind: 'hands', boss: true, ok: h >= need || idOk, label: '숨은 테이블 실전 핸드(여러 세션 합산)', have: h, need: need, opp: null };
      if (idOk && h < need) hi.label += ', 조기 제출로 채움';
      // 조기 제출로 갈음할 수 있어 '핸드 n개 더' 어림(more)은 맞히기 항목이 맡는다(waive)
      if (!hi.ok) { hi.waive = true; hi.why = '숨은 테이블 실전 핸드 ' + (need - h) + '개 더(5핸드씩, 확신이 서면 유형 맞히기 조기 제출로 갈음)'; }
      return hi;
    }
    var it = { kind: 'hands', boss: true, ok: ctx.hands >= need, label: '시험 실전 핸드(48시간 안)', have: ctx.hands, need: need, opp: null };
    if (!it.ok) { it.more = need - ctx.hands; it.why = '실전 핸드 ' + it.more + '개 더(5핸드씩)'; }
    return it;
  }

  function evaluate(node, stats, state, opts) {
    var nd = _nodeObj(node);
    var out = { node: nd ? nd.id : null, pass: false, cond: false, hold: false, pending: false, later: false, items: [], more: 0, est: false, expired: false };
    if (!nd) return out;
    var ctx = context(nd, stats, state, opts);
    // 이미 통과한 노드는 더 쌓을 것이 없다(되돌리지 않음, 시트의 롤링 줄도 비운다). opts.force면 그래도 판정
    if (ctx.rec.status === 'passed' && !(opts && opts.force)) { out.pass = true; out.cond = true; out.passed = true; return out; }
    var items = [];
    if (nd.kind === 'boss') {
      if (nd.drill) items.push(_drillItem(nd, ctx));
      if (nd.mission) items.push(_handsItem(nd, ctx));
    }
    var conds = (nd.mission && Array.isArray(nd.mission.conditions)) ? nd.mission.conditions : [];
    var condItems = conds.map(function(c) {
      try { return evalCondition(c, ctx); }
      catch (e) { _warn('evalCondition', e); return _pendingItem(c || { kind: 'unknown' }, '조건 판정 오류'); }
    });
    items = items.concat(condItems);
    var core = items.filter(function(it) { return !it.ref; });
    out.items = items;
    out.expired = ctx.expired;
    out.cond = condItems.filter(function(it) { return !it.ref; }).every(function(it) { return it.ok; });
    out.pass = core.every(function(it) { return it.ok; }) && !ctx.expired;
    out.hold = core.some(function(it) { return !!it.hold; });
    out.pending = core.some(function(it) { return !!it.pending; });
    // 못 미친 항목이 전부 기다리기(later, 다음 주 복기)뿐이면 later(지금 칠 것이 없음)
    var unmet = core.filter(function(it) { return !it.ok; });
    out.later = unmet.length > 0 && unmet.every(function(it) { return !!it.later; });
    core.forEach(function(it) {
      if (!it.ok && _num(it.more, 0) > out.more) { out.more = _num(it.more, 0); out.est = !!it.est; }
    });
    return out;
  }

  // ── 시도 상태(48시간, 24시간) ──────────────────────────
  function active() { var st = _jst(); return (st && st.boss && _isObj(st.boss.active)) ? st.boss.active : null; }
  // 기한(48시간)이 지난 시도는 카운터만 0으로 하고 끝낸다(벌점 없음). 끝냈으면 true
  function expire(now) {
    now = _now(now);
    var st = _jst(); if (!st) return false;
    var b = _bs(st), a = b.active;
    if (!_isObj(a) || !_expiredAt(a, now)) return false;
    var dr = a.drill;                                                    // 세트 나눔 드릴을 푸던 중이면 끝낸 세트 수를 남긴다(안내 문구)
    _endAttempt(st, a, 'expired', now, (_isObj(dr) && !dr.passed && Array.isArray(dr.parts) && dr.parts.length) ? { partsDone: dr.parts.length } : null);
    _save(st);
    return true;
  }
  function _endAttempt(st, a, result, now, extra) {
    var b = _bs(st);
    var rec = st.nodes && st.nodes[a.node];
    if (_isObj(rec) && _isObj(rec.mission) && result !== 'pass') rec.mission.hands = 0;      // 보스 카운터만 초기화
    var L = { startedAt: a.startedAt, endedAt: _iso(now), result: result, hands: _num(a.hands, 0) };
    if (extra) Object.keys(extra).forEach(function(k) { L[k] = extra[k]; });
    b.last[a.node] = L;
    if (b.active === a) b.active = null;
    if (b.coachLock && b.coachLock.node === a.node && b.coachLock.kind === 'boss') _unlock(st);
  }
  // 재도전까지 남은 시간(ms). 0이면 지금 시작 가능. 드릴 미달로 끝난 시도만 미달 시각(endedAt) + 24시간까지 막는다.
  //   세트 나눔 드릴(s4-boss)은 시도 시작 뒤 하루 넘게 걸쳐 끝날 수 있어 시작 시각 기준이면 대기가 0이 된다(M5-BOSS 리뷰)
  function retryWait(id, now) {
    now = _now(now);
    var st = _jst(); if (!st) return 0;
    var L = _bs(st).last[id];
    if (!_isObj(L) || L.result !== 'drill') return 0;
    var t = _ms(L.endedAt);
    if (!isFinite(t)) t = _ms(L.startedAt);                              // endedAt이 없는 예전 기록
    return isFinite(t) ? Math.max(0, t + RETRY_MS - now) : 0;
  }
  // 새 시도. 드릴 기준을 이미 채웠으면(지난 시도) 드릴은 건너뛴다(카운터만 새로)
  function begin(id, now) {
    now = _now(now);
    var st = _jst(), nd = _node(id);
    if (!st || !nd || nd.kind !== 'boss') return null;
    var b = _bs(st);
    if (_isObj(b.active) && b.active.node !== id) _endAttempt(st, b.active, 'stopped', now);
    if (_activeFor(st, id)) return b.active;
    var rec = st.nodes && st.nodes[id];
    var met = _bossDrillMet(nd, st);
    var carry = null;
    if (met && nd.drill) {
      carry = { carried: true, passed: true };
      var keep = b.sets[id];                                             // 세트 기준(또는 색칠 겹침)이 있는 보스는 통과한 결과도 이월
      if (_keepsSets(nd) && _isObj(keep) && _isObj(keep.byType)) { carry.byType = _copyBy(keep.byType); carry.n = keep.n; carry.ok = keep.ok; }
      if (_isObj(keep) && Array.isArray(keep.paint)) carry.paint = keep.paint.slice();
    }
    b.active = { node: id, startedAt: _iso(now), hands: 0, drill: carry,
      coachSnap: null, seatTypes: null, seed: Math.floor(now % 1000000) };
    if (_isObj(rec) && _isObj(rec.mission)) rec.mission.hands = 0;
    _save(st);
    // 은닉 보스: 좌석 배정(처음이면 지금 시드로 고정, 있으면 이어서)을 active.seatTypes에도 남긴다(설계서 6.1절)
    if (nd.mission && nd.mission.config === 'sixmax-cast-hidden' && _can('Journey', 'hiddenSeats')) {
      var asg = _call('Journey', 'hiddenSeats', id, now);
      st = _jst(); b = _bs(st);
      if (_isObj(asg) && _isObj(b.active) && b.active.node === id) {
        b.active.seatTypes = JSON.parse(JSON.stringify(asg.seats)); b.active.seed = asg.seed;
        _save(st);
      }
    }
    return b.active;
  }
  // PuzzleUI 결과 문항 → 유형별 { n, ok }와 복습 상자에 남는 오답 수(같은 카드를 두 번 틀려도 1장)
  function _tally(results, seen) {
    var byType = {}, wrongKeys = seen || {}, srsWrong = 0;
    (Array.isArray(results) ? results : []).forEach(function(x) {
      if (!x || !x.type) return;
      var s = byType[x.type] || (byType[x.type] = { n: 0, ok: 0 });
      s.n++; if (x.ok) s.ok++;
      var k = x.type + '|' + x.key;
      if (!x.ok && _srsKept(x) && !wrongKeys[k]) { wrongKeys[k] = 1; srsWrong++; }
    });
    return { byType: byType, srsWrong: srsWrong };
  }
  // 드릴 세트 결과 반영. r = PuzzleUI 결과 {n, ok, aborted, results}.
  //   → { status: 'pass'|'fail'|'incomplete'|'part', n, ok, need, count, srsWrong, part?, parts?, totalN?, totalOk?, unmet? }
  //   'part' = 세트 나눔 드릴에서 이번 세트를 끝냈고 다음 세트가 남음, unmet = 미달로 끝낸 기준 [{ label, ok, n, pass, count, all? }]
  function recordDrill(id, r, now) {
    now = _now(now);
    var st = _jst(), nd = _node(id);
    if (!st || !nd || !nd.drill) return { status: 'incomplete' };
    var a = _activeFor(st, id) || begin(id, now);
    st = _jst();
    a = _activeFor(st, id);
    var chunks = _chunks(nd.drill);
    if (chunks.length > 1) return _recordPart(id, nd, chunks, r, now);
    var count = _drillCount(nd.drill), need = _drillNeed(nd.drill);
    var n = Math.max(0, Math.floor(_num(r && r.n, 0))), ok = Math.max(0, Math.min(n, Math.floor(_num(r && r.ok, 0))));
    var res = { n: n, ok: ok, need: need, count: count };
    var aborted = !!(r && r.aborted);
    // 문항을 하나도 만들지 못한 세트(r.empty)는 미달이 아니다(다시 풀기)
    if (n === 0 || (r && r.empty)) { res.status = 'incomplete'; return res; }
    var t = _tally(r && r.results);
    // 중간에 나감: 이미 통과할 수 없게 틀렸으면 미달로 끝낸다(나가기로 피할 수 없게), 아니면 드릴을 다시 풀 수 있다
    var unmet = aborted ? _unreachable(nd, chunks, t.byType, n, ok) : [];
    if (aborted && !unmet.length) { res.status = 'incomplete'; return res; }
    if (!aborted && n > 0) _call('Journey', 'recordDrillSet', id, { n: n, ok: ok }, now);
    st = _jst(); a = _activeFor(st, id);
    var met = !aborted && n > 0 && _drillMet(nd, _recOf(st, id)) && ok >= Math.min(need, n) && _setsOk(nd, t.byType);
    res.srsWrong = t.srsWrong;
    if (met) {
      var paint = _paintOf(r);
      if (a) { a.drill = { n: n, ok: ok, at: _iso(now), byType: t.byType, passed: true }; if (paint) a.drill.paint = paint; }
      if (_keepsSets(nd)) { _bs(st).sets[id] = { byType: _copyBy(t.byType), n: n, ok: ok, at: _iso(now) }; if (paint) _bs(st).sets[id].paint = paint.slice(); }
      _save(st);
      res.status = 'pass';
      return res;
    }
    if (!aborted) unmet = _unreachable(nd, chunks, t.byType, n, ok);
    if (unmet.length) res.unmet = unmet;
    if (a) _endAttempt(st, a, 'drill', now, { n: n, ok: ok, srsWrong: t.srsWrong });
    _save(st);
    res.status = 'fail';
    return res;
  }
  // 세트 나눔 드릴의 세트 1개. 끝낸 세트는 active.drill.parts에 쌓고, 나간 세트는 버린다(그 세트만 처음부터).
  // 지금까지의 결과로 기준에 닿을 수 없으면(세트를 끝냈든 나갔든) 드릴 미달로 시도를 끝낸다.
  function _recordPart(id, nd, chunks, r, now) {
    var st = _jst(), a = _activeFor(st, id);
    var count = _drillCount(nd.drill), need = _drillNeed(nd.drill);
    var n = Math.max(0, Math.floor(_num(r && r.n, 0))), ok = Math.max(0, Math.min(n, Math.floor(_num(r && r.ok, 0))));
    var res = { n: n, ok: ok, need: need, count: count, parts: chunks.length };
    if (!a) { res.status = 'incomplete'; return res; }
    if (!_isObj(a.drill) || a.drill.passed || !Array.isArray(a.drill.parts)) a.drill = { parts: [], passed: false };
    var dr = a.drill, idx = dr.parts.length, ch = chunks[idx];
    res.part = idx + 1;
    if (!ch || n === 0 || (r && r.empty)) { res.status = 'incomplete'; return res; }
    var seen = {};
    dr.parts.forEach(function(p) { (p.wrongKeys || []).forEach(function(k) { seen[k] = 1; }); });
    var before = Object.keys(seen).length;
    var t = _tally(r && r.results, seen);
    var by = _mergeBy(_partsBy(dr), t.byType);
    var totN = dr.parts.reduce(function(s, p) { return s + _num(p.n, 0); }, 0) + n;
    var totOk = dr.parts.reduce(function(s, p) { return s + _num(p.ok, 0); }, 0) + ok;
    var srsWrong = dr.parts.reduce(function(s, p) { return s + _num(p.srsWrong, 0); }, 0) + t.srsWrong;
    res.totalN = totN; res.totalOk = totOk; res.srsWrong = srsWrong; res.byType = by;
    var aborted = !!(r && r.aborted);
    var unmet = _unreachable(nd, chunks, by, totN, totOk);
    if (unmet.length) {
      res.unmet = unmet;
      _endAttempt(st, a, 'drill', now, { n: totN, ok: totOk, srsWrong: srsWrong, part: idx + 1, parts: chunks.length });
      _save(st);
      res.status = 'fail';
      return res;
    }
    if (aborted) { res.status = 'incomplete'; return res; }
    var wk = Object.keys(seen).slice(before);
    var pp = _paintOf(r);
    dr.parts.push({ n: n, ok: ok, byType: t.byType, srsWrong: t.srsWrong, wrongKeys: wk, at: _iso(now) });
    if (pp) dr.parts[dr.parts.length - 1].paint = pp;
    if (dr.parts.length < chunks.length) { _save(st); res.status = 'part'; return res; }
    // 마지막 세트까지 끝. 생성기가 세트를 덜 채웠을 수도 있어 기준을 남은 문항 없이 다시 본다
    res.n = totN; res.ok = totOk;
    var parts = dr.parts;
    var left = _setConds(nd).filter(function(c) { return _setSum(by, _arr(c.type)).ok < Math.floor(_num(c.pass, 0)); }).map(function(c) {
      var s = _setSum(by, _arr(c.type));
      return { label: _arr(c.type).map(_typeName).join(', '), ok: s.ok, n: s.n, pass: Math.floor(_num(c.pass, 0)), count: Math.floor(_num(c.count, s.n)) };
    });
    if (totOk < need) left.push({ label: '드릴 전체', ok: totOk, n: totN, pass: need, count: count, all: true });
    // 세트 기준에 못 미친 시도는 노드 드릴 최고 기록(best)에 넣지 않는다(전체 비율만 높아 통과처럼 보이지 않게)
    if (!left.length) {
      _save(st);
      _call('Journey', 'recordDrillSet', id, { n: totN, ok: totOk }, now);
      st = _jst(); a = _activeFor(st, id);
    }
    if (left.length || !_drillMet(nd, _recOf(st, id))) {
      res.unmet = left;
      if (a) _endAttempt(st, a, 'drill', now, { n: totN, ok: totOk, srsWrong: srsWrong, part: parts.length, parts: chunks.length });
      _save(st);
      res.status = 'fail';
      return res;
    }
    var paintAll = null;
    parts.forEach(function(p) { if (p && Array.isArray(p.paint)) paintAll = (paintAll || []).concat(p.paint); });
    if (a) { a.drill = { n: totN, ok: totOk, at: _iso(now), byType: by, passed: true, parts: parts }; if (paintAll) a.drill.paint = paintAll; }
    _bs(st).sets[id] = { byType: _copyBy(by), n: totN, ok: totOk, at: _iso(now) };
    if (paintAll) _bs(st).sets[id].paint = paintAll.slice();
    _save(st);
    res.status = 'pass';
    return res;
  }
  // 틀린 문항이 복습 상자(Leitner)에 남는지: 키가 있고 유형 정책이 'once'가 아니어야 한다(showdown, order 등 once 유형은 상자 없음)
  function _srsKept(x) {
    if (!x || x.key == null) return false;
    return _call('Drills', 'policyOf', x.type) !== 'once';
  }
  // 판정: 통과면 Journey.passNode(단계 건너뜀 통과와 승급). → { pass, promoted, opened, eval, expired }
  function judge(id, now) {
    now = _now(now);
    var expired = expire(now);
    var st = _jst(), nd = _node(id);
    if (!st || !nd) return { pass: false, eval: null, expired: expired };
    var ev = evaluate(nd, _m('JStats'), st, { now: now });
    if (!ev.pass || !_activeFor(st, id)) return { pass: false, eval: ev, expired: expired };
    var out = _call('Journey', 'passNode', id, { skipped: false }, now) || {};
    st = _jst();
    var a = _activeFor(st, id);
    if (a) _endAttempt(st, a, 'pass', now);
    _save(st);
    return { pass: true, promoted: out.promoted || null, opened: out.opened || [], eval: ev, expired: false };
  }
  // 이 버전에서 이 보스 흐름을 끝까지 돌 수 있는지(조건 종류, 드릴 생성기와 세트 크기, 게임 시작)
  function supported(node) {
    var nd = _nodeObj(node);
    if (!nd || nd.kind !== 'boss') return { ok: false, why: '승급 시험 노드가 아니에요' };
    var why = [];
    if (nd.drill) {
      var chunks = _chunks(nd.drill);
      var bad = !_can('PuzzleUI', 'start') || !chunks.length;
      if (!bad && _can('PuzzleUI', 'can')) {
        // 세트를 나누는 드릴은 세트마다, 아니면 노드 드릴 그대로 PuzzleUI가 낼 수 있는지 본다
        bad = (chunks.length > 1)
          ? chunks.some(function(ch, i) { return !_call('PuzzleUI', 'can', _partSpec(nd, chunks, i)); })
          : !_call('PuzzleUI', 'can', _spec(nd));
      }
      if (bad) why.push(_typeName(nd.drill.type) + ' 퍼즐');
    }
    var m = nd.mission;
    if (m) {
      if (m.config === 'sixmax-cast-hidden' && !_can('Journey', 'hiddenSeats')) why.push('유형 숨김 테이블');
      (m.conditions || []).forEach(function(cd) {
        if (!_isObj(cd)) return;
        if (PENDING_KIND[cd.kind]) why.push(PENDING_KIND[cd.kind]);
        else if (cd.kind === 'custom' && !CUSTOM_OK[cd.fn]) why.push(CUSTOM_PENDING[cd.fn] || '추가 조건');
        else { var s = _soonFilter(cd.filter); if (s && !cd.ref) why.push(s + ' 기록'); }
      });
      if (!_can('App', 'selectVillains') || !_can('Journey', 'startSession')) why.push('실전 게임');
    }
    return { ok: !why.length, why: why.join(', ') };
  }
  function _spec(nd) {
    var s = _call('JourneyUI', 'puzzleSpec', nd);
    if (_isObj(s)) return s;
    var d = nd.drill || {};
    s = { type: d.type, count: _drillCount(d), node: nd.id };
    if (Array.isArray(d.set)) s.set = d.set.map(function(x) { return Array.isArray(x) ? x.slice() : x; });
    if (d.variant) s.variant = d.variant;
    if (Array.isArray(d.spots)) s.spots = d.spots.slice();
    if (d.tol != null) s.tol = d.tol;
    return s;
  }
  // 세트 나눔 드릴의 i번째 세트 spec(PuzzleUI.start). 노드 drill의 variant, spots, tol은 그대로 넘긴다
  function _partSpec(nd, chunks, i) {
    var d = nd.drill || {}, ch = chunks[i];
    if (!ch) return null;
    var s = { type: 'mixed', set: ch.set.map(function(x) { return x.slice(); }), count: ch.count, node: nd.id };
    if (d.variant) s.variant = d.variant;
    if (Array.isArray(d.spots)) s.spots = d.spots.slice();
    if (d.tol != null) s.tol = d.tol;
    return s;
  }

  // ── 코칭 고정(snapshot → setLevel → restore) ─────────────
  function _coachOk() { return _can('CoachUI', 'snapshot') && _can('CoachUI', 'restore') && _can('CoachUI', 'setLevel'); }
  function lockCoach(nodeId, kind, level, now) {
    now = _now(now);
    if (!_coachOk()) return false;
    var lv = Math.floor(_num(level, NaN));
    if (!(lv >= 0 && lv <= 3)) return false;
    var st = _jst(); if (!st) return false;
    var b = _bs(st);
    if (b.coachLock || (b.active && b.active.coachSnap)) _unlock(st);
    var snap = null;
    try {
      snap = G.CoachUI.snapshot();
      b.coachLock = { node: nodeId, kind: kind || 'mission', level: lv, snap: snap, at: _iso(now) };
      if (kind === 'boss' && _activeFor(st, nodeId)) b.active.coachSnap = snap;
      _save(st);
      G.CoachUI.setLevel(lv);
      return true;
    } catch (e) {
      _warn('lockCoach', e);
      if (b.coachLock) { _unlock(st); _save(st); }
      return false;
    }
  }
  function _unlock(st) {
    var b = _bs(st);
    var lock = b.coachLock;
    var snap = (lock && lock.snap) || (b.active && b.active.coachSnap) || null;
    if (!lock && !snap) return false;
    try { if (snap && _can('CoachUI', 'restore')) G.CoachUI.restore(snap); }
    catch (e) { _warn('restore', e); }
    finally {
      b.coachLock = null;
      if (b.active && b.active.coachSnap) b.active.coachSnap = null;
    }
    return true;
  }
  function unlockCoach() {
    var st = _jst(); if (!st) return false;
    var done = _unlock(st);
    if (done) _save(st);
    return done;
  }
  // 세션이 없는데 남은 고정(새로고침, 앱 종료)은 되돌린다
  function restoreStale() {
    var st = _jst(); if (!st) return false;
    var b = _bs(st);
    if (!b.coachLock && !(b.active && b.active.coachSnap)) return false;
    var ses = _call('Journey', 'session');
    if (ses && b.coachLock && ses.node === b.coachLock.node) return false;
    return unlockCoach();
  }

  // ── Journey 훅(journey-core가 typeof 가드로 부른다) ──────
  function onSessionStart(s) {
    if (!_isObj(s) || !s.node || (s.kind !== 'boss' && s.kind !== 'mission')) return;
    var nd = _node(s.node);
    var lv = nd && nd.mission ? nd.mission.coach : null;
    if (lv == null) return;
    lockCoach(nd.id, s.kind, lv);
  }
  // info.reason: 'end'(Journey.endSession), 'replaced'(새 세션이 시작됨), 'other'(다른 게임이 시작됨)
  function onSessionEnd(s, info) {
    var reason = (info && info.reason) || 'end';
    try {
      var st = _jst();
      if (st) { var b = _bs(st); if (b.coachLock || (b.active && b.active.coachSnap)) unlockCoach(); }
    } catch (e) { _warn('onSessionEnd', e); }
    if (!_isObj(s) || s.kind !== 'boss' || !s.node || reason !== 'end') return null;
    var res = judge(s.node, _now());
    var id = s.node;
    _later(function() { _afterGame(id, res); }, 0);
    return res;
  }
  // 은닉 테이블 유형 가림(로드맵 M6 결정 8): app.js가 첫 Table.render 뒤 같은 실행 안에서 Journey.onNewHand를 부르므로
  // 여기서 플래그를 걸고 다시 그리면 (유형) 라벨이 화면에 그려지지 않는다. 플래그는 GameState의 JSON 복제로 그 핸드 끝까지 남는다
  function _hideTypes(ctx) {
    if (!_isObj(ctx) || ctx.mode !== 'sixmax-cast-hidden' || !_isObj(ctx.state)) return false;
    ctx.state.hideTypes = true;
    if (_can('Table', 'render') && typeof document !== 'undefined' && document && typeof document.getElementById === 'function') {
      try { G.Table.render(ctx.state); } catch (e) { _warn('Table.render', e); }
    }
    return true;
  }
  function onNewHand(ctx) {
    try { _hideTypes(ctx); } catch (e0) { _warn('hideTypes', e0); }
    try {
      var st = _jst(); if (!st) return;
      var b = _bs(st);
      if (_isObj(b.active) && _expiredAt(b.active, _now())) expire(_now());
      if (b.coachLock) {
        var ses = _call('Journey', 'session');
        if (!ses || ses.node !== b.coachLock.node) unlockCoach();
      }
    } catch (e) { _warn('onNewHand', e); }
  }
  function afterDecision() { /* 판정은 JStats 링 버퍼를 읽는다(여기서 따로 쌓지 않음) */ }
  // 보스 세션의 핸드(연습, GTO 2회차, HU 제외)만 보스 카운터에 센다
  function onHandEnd(ctx, info) {
    try {
      if (info && info.excluded) return;
      var ses = _call('Journey', 'session');
      if (!_isObj(ses) || ses.kind !== 'boss' || !ses.node) return;
      var now = _now(info && info.now);
      var st = _jst(); if (!st) return;
      var a = _activeFor(st, ses.node);
      if (!a) return;
      if (_expiredAt(a, now)) { expire(now); return; }
      a.hands = _num(a.hands, 0) + 1;
      var rec = st.nodes && st.nodes[ses.node];
      if (_isObj(rec) && _isObj(rec.mission)) rec.mission.hands = a.hands;
      _save(st);
    } catch (e) { _warn('onHandEnd', e); }
  }

  // ── 화면 ───────────────────────────────────────────────
  function _bossXp() { var X = _m('JOURNEY_XP'); return (X && isFinite(Number(X.boss))) ? Number(X.boss) : 150; }
  function _stageTitle(n) {
    var S = _m('JOURNEY_STAGES');
    if (Array.isArray(S)) for (var i = 0; i < S.length; i++) if (S[i] && S[i].n === n) return S[i].title || '';
    return '';
  }
  function _stageName(n) {
    var S = _m('JOURNEY_STAGES');
    if (Array.isArray(S)) for (var i = 0; i < S.length; i++) if (S[i] && S[i].n === n) return S[i].name || '';
    return '';
  }
  function _top(nd) {
    return '<div class="j-sub-top"><button type="button" class="j-back" aria-label="뒤로" onclick="Boss.back()">↩</button>' +
      '<h2 class="j-sub-t">👑 ' + _esc(nd ? nd.title : '승급 시험') + '</h2></div>';
  }
  // 세트 나눔 드릴 안내: "세트 3개(20, 20, 10문항)로 나눠 풀기"
  function _chunkTxt(nd) {
    var ch = _chunks(nd.drill);
    if (ch.length < 2) return '';
    return '세트 ' + ch.length + '개(' + ch.map(function(x) { return x.count; }).join(', ') + '문항)로 나눠 풀기';
  }
  function _critHTML(nd) {
    var li = [];
    if (nd.drill) {
      var ct = _chunkTxt(nd);
      if (_setConds(nd).length) li.push('드릴: ' + _drillTxt(nd.drill) + (ct ? ', ' + ct : '') + '. 아래 유형별 기준을 모두 채우기');
      else li.push('드릴: ' + _drillTxt(nd.drill) + ' 중 ' + _drillNeed(nd.drill) + '개 이상' + (ct ? '(' + ct + ')' : ''));
      if (ct) li.push('중간에 나가도 끝낸 세트는 남아요(나간 세트만 처음부터)');
    }
    var m = nd.mission;
    if (m) {
      li.push(_idCond(nd) ? '숨은 테이블 6인 실전 ' + m.hands + '핸드(5핸드씩, 여러 세션과 시도 합산, 유형 맞히기를 조기 제출로 통과하면 갈음)'
        : '6인 실전 ' + m.hands + '핸드(5핸드씩, 시작 뒤 48시간 안에)');
      (m.conditions || []).forEach(function(c) { var t = _condText(c, nd); if (t) li.push(t); });
      if (m.coach != null) li.push('실전 중 코칭은 L' + m.coach + (COACH_NAME[m.coach] ? '(' + COACH_NAME[m.coach] + ')' : '') + '로 고정, 끝나면 원래대로');
    }
    return '<div class="j-crit"><div class="j-crit-t">통과 기준(모두 채우기)</div><ul>' + li.map(function(t) { return '<li>' + _esc(t) + '</li>'; }).join('') + '</ul></div>';
  }
  function _condText(c, nd) {
    if (!_isObj(c)) return '';
    if (c.kind === 'pattern') {
      var where = c.window ? '최근 ' + c.window + '핸드' : (c.minOpp ? '최근 기회 ' + c.minOpp + '번' : '최근 ' + DEFAULT_WINDOW + '핸드');
      var mx = _num(c.max, 0);
      return where + ((c.filter && c.filter.pos) ? '(' + _list(c.filter.pos) + ')' : '') + '에서 "' + _patternLabel(c.pattern) + '" ' + mx + '회' + (mx > 0 ? ' 이하' : '') + (c.ref ? ', 참고 표시(통과 조건 아님)' : '');
    }
    if (c.kind === 'light') {
      var toks = (_arr(c.light).length ? _arr(c.light) : ['green']).map(function(t) { return LIGHT_LABEL[t] || t; }).join(' 또는 ');
      var ft = _filterTxt(c.filter);
      var thr = c.maxCount != null ? toks + ' ' + c.maxCount + '번 이하' : (c.max != null ? toks + ' ' + _pct(c.max) + '% 이하' : toks + ' ' + _pct(c.min) + '% 이상');
      return (ft ? ft + ' ' : '') + '결정' + (c.per === 'concept' ? ' 유형마다 ' : '에서 ') + thr +
        '(기회 ' + _num(c.minOpp, MIN_OPP) + '번부터 판정)' + (c.ref ? ', 참고 표시(통과 조건 아님)' : '');
    }
    if (c.kind === 'custom' && c.fn === 'srsBoxRatio') {
      return (String(c.keyPrefix || '') === 'rfi|' ? '오픈 레인지' : '') + ' 복습 카드의 ' + _pct(_num(c.min, 0)) + '% 이상을 ' + _num(c.box, 3) + '단계 이상으로(카드 ' + _num(c.minOpp, MIN_OPP) + '장부터 판정)';
    }
    if (c.kind === 'band') return '내 ' + (METRIC_LABEL[c.metric] || c.metric) + '가 이 앱 차트 밴드 ±' + _num(c.tol, 4) + '%p 안(기회 ' + _num(c.minOpp, MIN_OPP) + '번부터)';
    if (c.kind === 'hands') return _num(c.min, 0) + '핸드 체험';
    if (c.kind === 'drillSet' || c.kind === 'puzzleSet') return _arr(c.type).map(_typeName).join(', ') + ' ' + c.count + '문항 중 ' + c.pass + '개 이상' + (c.tol ? '(콤보 수 ±' + c.tol + ' 허용)' : '');
    if (c.kind === 'custom' && c.fn === 'luckMeterViews') return '운 미터 카드 ' + _num(c.min, 1) + '번 열어 보기';
    if (c.kind === 'custom' && c.fn === 'shortSession') return '세션 종료 버튼으로 ' + _num(c.maxHands, 5) + '핸드 분량이 끝나기 전에 스스로 끝낸 세션 ' + _num(c.min, 1) + '번';
    if (c.kind === 'identify') {
      var need = _idNeed(nd, c);
      return '숨은 좌석 ' + need.seats + '곳' + (need.min < need.seats ? ' 중 ' + need.min + '곳' : '') + '의 유형 맞히기(좌석마다 관찰 ' + need.full + '핸드 뒤' +
        (need.early ? ', 확신이 서면 ' + need.gate + '핸드부터 조기 제출' : '') + ', 보기 4개: 타이트, 정석, 루즈-공격, 루즈-패시브)';
    }
    if (c.kind === 'weeks') return _num(c.min, 1) > 1 ? '주간 복기(주간 리포트 열기) ' + _num(c.min, 1) + '주 연속' : '주간 리포트 한 번 열어 보기(이번 주나 지난주)';
    if (c.kind === 'overlap') return '레인지 색칠 ' + _num(c.spots, 3) + '스팟 모두 겹침 ' + _pct(_num(c.min, 0.7)) + '% 이상';
    return (PENDING_KIND[c.kind] || CUSTOM_PENDING[c.fn] || '추가 조건') + '(다음 업데이트에서 판정)';
  }
  // 롤링 줄: ✓ 채움, ○ 아직, ⏳ 판정 전(계약 F3, 판정 창 안 핸드 0개 또는 기회 0), … 다음 업데이트
  function _lineOf(it) {
    if (it.pending) return '… ' + it.label + ': 다음 업데이트에서 판정';
    if (it.need == null) return '';
    // 판정 전은 노드 시트(JourneyUI 롤링 줄)와 같은 '판정 전(기준 n)' 꼴('판정 전/30'은 분수처럼 읽혔다, M5 통합 검증)
    if (it.wait) return '⏳ ' + it.label + ': ' + (it.have == null ? '판정 전' : it.have) + '(기준 ' + it.need + (it.opp != null ? ', 기회 ' + it.opp : '') + ')';
    return (it.ok ? '✓ ' : '○ ') + it.label + ': ' + (it.have == null ? '-' : it.have) + '/' + it.need + (it.opp != null ? '(기회 ' + it.opp + ')' : '');
  }
  function _statusHTML(ev, title) {
    var lines = (ev && ev.items || []).map(_lineOf).filter(Boolean);
    if (!lines.length) return '';
    return '<div class="j-crit"><div class="j-crit-t">' + _esc(title || '지금 상태') + '</div><ul>' +
      lines.map(function(t) { return '<li>' + _esc(t) + '</li>'; }).join('') + '</ul></div>';
  }
  // skipSets: 드릴을 아직 푸는 중이면 puzzleSet 항목은 드릴 줄 하나로 갈음한다(세트마다 "풀어야 해요"가 반복되지 않게)
  function _needHTML(ev, skipSets) {
    var lines = (ev && ev.items || []).filter(function(it) { return !it.ok && !it.ref && !(skipSets && it.kind === 'puzzleSet'); })
      .map(function(it) { return it.why || it.label; }).filter(Boolean);
    if (!lines.length) return '';
    return '<div class="j-crit"><div class="j-crit-t">더 필요한 것</div><ul>' + lines.map(function(t) { return '<li>' + _esc(t) + '</li>'; }).join('') + '</ul></div>';
  }
  // 드릴 미달 안내: 복습 상자에 실제로 들어간 문항만 말한다(once 유형인 쇼다운, 말하는 순서는 상자가 없음)
  function _boxTip(srsWrong) {
    var sw = Math.max(0, Math.floor(_num(srsWrong, 0)));
    return sw ? '틀린 문제 ' + sw + '개가 복습 상자에 들어가 다음 날 먼저 나와요. ' : '';
  }
  function _acts(btns) { return '<div class="j-acts">' + btns.join('') + '</div>'; }
  function _btn(label, onclick, primary) {
    return '<button type="button" class="j-btn' + (primary ? ' j-primary j-big' : '') + '" onclick="' + onclick + '">' + _esc(label) + '</button>';
  }
  function _q(id) { return "'" + String(id).replace(/[^A-Za-z0-9_-]/g, '') + "'"; }

  // 화면 모델: 지금 이 보스에 대해 무엇을 보여 줄지
  function _model(id, now) {
    var st = _jst() || { nodes: {}, boss: { active: null } };
    var nd = _node(id);
    var rec = _recOf(st, id);
    var b = _bs(st);
    return { nd: nd, st: st, rec: rec, active: _activeFor(st, id), other: (_isObj(b.active) && b.active.node !== id) ? b.active : null,
      last: b.last[id] || null, wait: retryWait(id, now), sup: supported(nd) };
  }
  // 최종 단계(마지막 승급 시험) 여부: JOURNEY_STAGES의 가장 큰 n
  function _isLastStage(stage) {
    var S = _m('JOURNEY_STAGES'), mx = 0;
    if (Array.isArray(S)) S.forEach(function(s) { if (s && s.n > mx) mx = s.n; });
    return mx > 0 && stage >= mx;
  }
  // 마지막 단계 통과 뒤 엔드게임 안내(FLOW-05): 이제부터 도는 고리(주간 리포트, 다시 풀기, 실전, 챌린지와 시즌)
  function _endgameHTML() {
    var li = [
      '월요일마다 📅 주간 리포트에서 지난주 비싼 실수 Top 3를 찾아요',
      '🧩 다시 풀기로 그 핸드를 같은 카드로 다시 쳐서 고쳐요(1일, 3일, 7일, 21일 뒤에 다시 나와요)',
      '🃏 6인 실전에서 고친 결정을 써요. 상대는 내 습관에 맞춰 조금씩 달라져요(설정에서 끌 수 있어요)',
      '🗓 주간 챌린지와 월간 시즌 퀘스트가 매주, 매달 새로 열려요'
    ];
    return '<div class="j-crit"><div class="j-crit-t">여기부터는 엔드게임 루프예요</div><ul>' +
      li.map(function(t) { return '<li>' + _esc(t) + '</li>'; }).join('') + '</ul></div>';
  }
  function viewHTML(id, opts) {
    opts = opts || {};
    var now = _now(opts.now);
    var m = _model(id, now), nd = m.nd;
    if (!nd) return '<div class="j-sub">' + _top(null) + '<div class="j-card"><div class="j-card-d">이 승급 시험 정보를 찾지 못했어요.</div></div></div>';
    var stage = nd.stage, nextTitle = _stageTitle(stage + 1);
    var body = [];
    var res = opts.result;
    if (res && res.pass) {
      var promo = res.promoted ? _stageTitle(res.promoted) : '';
      body.push('<div class="j-wrap-card"><div class="j-wrap-t">🎉 ' + (promo ? '승급! ' + _esc(promo) : '통과!') + '</div>' +
        '<div class="j-wrap-line">' + _esc(nd.title + ' 통과' + (res.promoted ? '. S' + res.promoted + ' ' + _stageName(res.promoted) + ' 단계가 열렸어요' : '')) + '</div>' +
        '<div class="j-wrap-stats"><span>+' + _bossXp() + ' XP</span>' +
        (res.opened && res.opened.length ? '<span>새 노드 ' + res.opened.length + '개</span>' : '') + '</div></div>');
      if (nd.kind === 'boss' && _isLastStage(stage)) body.push(_endgameHTML());
      body.push(_statusHTML(res.eval, '통과한 기준'));
      body.push(_acts([_btn('여정 홈으로', 'Boss.home()', true)]));
      return '<div class="j-sub">' + _top(nd) + body.join('') + '</div>';
    }
    if (opts.drill && opts.drill.status === 'fail') {
      var d = opts.drill;
      var setFail = (d.unmet && d.unmet.length) && (d.parts > 1 || _setConds(nd).length > 0);
      if (setFail) {
        // 세트 기준 보스: 어느 기준에 못 미쳤는지(아직 남은 문항이 있어도 닿을 수 없으면 거기서 끝)
        var tn = d.totalN != null ? d.totalN : d.n, tk = d.totalOk != null ? d.totalOk : d.ok;
        body.push('<div class="j-done-line">ℹ ' + _esc('드릴 ' + tk + '/' + tn + (d.parts > 1 ? '(세트 ' + d.part + '/' + d.parts + '까지)' : '') + ', 기준에 못 미쳤어요') + '</div>');
        body.push('<div class="j-crit"><div class="j-crit-t">못 미친 기준</div><ul>' + d.unmet.map(function(u) {
          return '<li>' + _esc(u.label + ' ' + u.ok + '개 정답(' + u.count + '문항 중 ' + u.pass + '개 이상 필요' + (u.n < u.count ? ', 남은 문항을 다 맞혀도 모자람' : '') + ')') + '</li>';
        }).join('') + '</ul></div>');
      } else {
        body.push('<div class="j-done-line">ℹ ' + _esc('드릴 ' + d.ok + '/' + d.n + ', 통과는 ' + d.need + '개 이상' + (d.need > d.ok ? '(' + (d.need - d.ok) + '개 더 필요했어요)' : '')) + '</div>');
      }
      body.push('<div class="j-sum">💡 ' + _esc('벌점은 없어요. ' + _boxTip(d.srsWrong) + '재도전은 약 ' + _hoursTxt(retryWait(id, now)) + ' 뒤에 열려요(드릴 기준에 못 미친 때부터 24시간).') + '</div>');
      body.push(_acts([_btn('여정 홈으로', 'Boss.home()', true)]));
      return '<div class="j-sub">' + _top(nd) + body.join('') + '</div>';
    }
    if (m.rec.status === 'passed') {
      body.push('<div class="j-done-line is-ok">✅ ' + _esc(m.rec.skipped ? '건너뜀으로 통과한 시험이에요' : '이미 통과한 시험이에요') + '</div>');
      body.push(_critHTML(nd));
      body.push(_acts([_btn('여정 홈으로', 'Boss.home()', true)]));
      return '<div class="j-sub">' + _top(nd) + body.join('') + '</div>';
    }
    if (!m.sup.ok) {
      body.push('<div class="j-card"><div class="j-card-t">🚧 다음 업데이트에서 열려요</div><div class="j-card-d">' +
        _esc('이 승급 시험에는 아직 이 버전에 없는 부분이 있어요(' + m.sup.why + '). 지금은 노드를 하나씩 통과하며 준비해요.') + '</div></div>');
      body.push(_critHTML(nd));
      body.push(_acts([_btn('돌아가기', 'Boss.back()', true)]));
      return '<div class="j-sub">' + _top(nd) + body.join('') + '</div>';
    }
    if (m.active) {
      var ev = opts.eval || evaluate(nd, _m('JStats'), m.st, { now: now });
      var left = EXPIRE_MS - (now - _ms(m.active.startedAt));
      var drillDone = _bossDrillMet(nd, m.st);
      var chunks = _chunks(nd.drill), multi = chunks.length > 1;
      var partN = (multi && _isObj(m.active.drill) && !m.active.drill.passed && Array.isArray(m.active.drill.parts)) ? m.active.drill.parts.length : 0;
      var lineTxt;
      if (opts.drill && opts.drill.status === 'pass') lineTxt = '✅ 드릴 ' + opts.drill.ok + '/' + opts.drill.n + ' 통과! 이제 6인 실전이에요';
      else if (opts.drill && opts.drill.status === 'part') lineTxt = '✅ 드릴 세트 ' + opts.drill.part + '/' + opts.drill.parts + ' 끝(' + opts.drill.ok + '/' + opts.drill.n + '). 다음 세트로 넘어가요';
      else if (opts.drill && opts.drill.status === 'incomplete') lineTxt = multi ? 'ℹ 이 세트를 끝까지 풀어야 다음으로 넘어가요(끝낸 세트는 남아요)' : 'ℹ 드릴을 끝까지 풀어야 실전으로 넘어가요';
      else if (!drillDone && partN > 0) lineTxt = 'ℹ 드릴 세트 ' + partN + '/' + chunks.length + '까지 끝냈어요';
      else if (opts.afterGame) lineTxt = 'ℹ 아직이에요' + (ev.more ? '. 핸드 ' + (ev.est ? '약 ' : '') + ev.more + '개 더' : '') + (ev.hold ? '(판정 기회 모으는 중)' : '');
      else lineTxt = 'ℹ 시험 진행 중';
      lineTxt += ', 남은 시간 ' + _hoursTxt(left) + (_idCond(nd) ? '(지나도 숨은 좌석 관찰은 이어져요)' : '');
      body.push('<div class="j-done-line' + (opts.drill && (opts.drill.status === 'pass' || opts.drill.status === 'part') ? ' is-ok' : '') + '">' + _esc(lineTxt) + '</div>');
      body.push(_statusHTML(ev, '지금 상태'));
      if (opts.afterGame || ev.items.some(function(it) { return !it.ok && !it.ref && !it.drill && !(!drillDone && it.kind === 'puzzleSet'); })) body.push(_needHTML(ev, !drillDone));
      var drillLabel = multi
        ? '▶ 드릴 세트 ' + (Math.min(partN, chunks.length - 1) + 1) + '/' + chunks.length + (opts.drill && opts.drill.status === 'incomplete' ? ' 다시' : (partN > 0 ? ' 이어서' : ' 시작'))
        : '▶ 드릴 ' + (opts.drill && opts.drill.status === 'incomplete' ? '처음부터 다시' : '시작');
      var primary = drillDone
        ? _btn('▶ ' + (_num(m.active.hands, 0) > 0 ? '이어서 ' : '') + '실전 5핸드', 'Boss._go(' + _q(id) + ')', true)
        : _btn(drillLabel, 'Boss._go(' + _q(id) + ')', true);
      var actBtns = [primary];
      if (drillDone && _idCond(nd)) actBtns.push(_btn('🕵 숨은 좌석 유형 맞히기', 'Boss.openIdentify(' + _q(id) + ')'));   // 은닉 보스(M6-BOSS)
      actBtns.push(_btn('나중에', 'Boss.back()'));
      body.push(_acts(actBtns));
      return '<div class="j-sub">' + _top(nd) + body.join('') + '</div>';
    }
    if (m.wait > 0) {
      body.push('<div class="j-done-line">⏳ ' + _esc('재도전은 ' + _hoursTxt(m.wait) + ' 뒤에 열려요') + '</div>');
      var lw = Math.max(0, Math.floor(_num(m.last && m.last.srsWrong, 0)));
      body.push('<div class="j-sum">💡 ' + _esc(lw > 0
        ? '지난 드릴에서 틀린 문제 ' + lw + '개가 복습 상자에 들어가 있어요. 오늘의 5분 복습에서 먼저 풀어 보세요.'
        : '기다리는 동안 여정 노드를 하나씩 풀며 준비해요.') + '</div>');
      body.push(_critHTML(nd));
      body.push(_acts([_btn('여정 홈으로', 'Boss.home()', true)]));
      return '<div class="j-sub">' + _top(nd) + body.join('') + '</div>';
    }
    // 안내 카드
    var locked = m.rec.status === 'locked';
    body.push('<div class="j-block-card"><div class="j-block-k">' + _esc('S' + stage + ' ' + _stageName(stage) + ', ' + (nd.goal || '')) + '</div>' +
      '<div class="j-block-t">' + _esc(nextTitle ? '통과하면 ' + nextTitle + ' 칭호' : '통과하면 엔드게임') + '</div>' +
      '<div class="j-block-d">' + _esc(locked
        ? '잠긴 시험에 바로 도전하는 건너뛰기예요. 통과하면 이 단계까지의 노드가 전부 건너뜀 통과가 돼요.'
        : '이 단계 노드를 모두 통과했어요. 드릴부터 풀고 6인 실전으로 마무리해요.') + '</div></div>');
    if (m.last && m.last.result === 'expired' && _idCond(nd)) {
      body.push('<div class="j-done-line">ℹ 지난 시도는 48시간이 지났어요. 숨은 좌석 관찰과 맞히기 기록은 그대로 이어져요(벌점 없음)</div>');
    } else if (m.last && m.last.result === 'expired') {
      body.push('<div class="j-done-line">ℹ ' + (m.last.partsDone
        ? '지난 시도는 드릴 세트 ' + m.last.partsDone + '개를 끝낸 채 48시간이 지났어요. 드릴 세트도 처음부터 다시 풀어요(벌점 없음)'
        : '지난 시도는 48시간이 지나 실전 핸드를 처음부터 다시 세요(벌점 없음)') + '</div>');
    }
    if (m.other) { var on = _node(m.other.node); body.push('<div class="j-why" style="margin:8px 2px 0">' + _esc('이 시험을 시작하면 진행 중인 시험(' + (on ? on.title : m.other.node) + ')은 멈춰요(벌점 없음)') + '</div>'); }
    body.push(_critHTML(nd));
    body.push('<div class="j-sum">💡 떨어져도 벌점은 없어요. 드릴 기준에 못 미치면 24시간 뒤에 다시 도전할 수 있고, 실전 조건은 핸드를 더 치면서 채우면 돼요.</div>');
    var go = _bossDrillMet(nd, m.st) ? '▶ 실전부터 시작(드릴 통과 기록 있음)' : '▶ 드릴부터 시작';
    body.push(_acts([_btn(go, 'Boss._go(' + _q(id) + ')', true), _btn('나중에', 'Boss.back()')]));
    return '<div class="j-sub">' + _top(nd) + body.join('') + '</div>';
  }

  function _ensureBack() {
    var N = _m('Nav');
    if (!N || typeof N.setBack !== 'function' || (_backNav === N && _backSet === N.setBack)) return;
    if (_backOff) { try { _backOff(); } catch (e) { /* 무시 */ } }
    _backNav = N; _backSet = N.setBack;
    // 시스템 뒤로: 보스 화면 기록을 걷어낸 뒤 부모(노드 시트 또는 홈)를 Nav가 다시 그린다(false = 기본 처리).
    // 맞히기 화면('<노드>~id', M6-BOSS)의 부모가 보스 화면이면 그 화면을 직접 다시 그린다(보스 뷰 해시는 새로고침 때 홈으로 가는 일시 뷰라서)
    try {
      _backOff = N.setBack('j/boss', function(key, p, parentKey) {
        _viewId = null;
        var pk = String(parentKey || '');
        if (String(key || '').indexOf('~id') >= 0 && pk.indexOf('j/boss/') === 0) {
          var pid = pk.slice(7);
          try { pid = decodeURIComponent(pid); } catch (e) { /* 그대로 */ }
          if (_node(pid)) { show(pid); return 'done'; }
        }
        return false;
      });
    } catch (e) { _backOff = null; }
  }
  function _navOpen(id) {
    if (!_can('Nav', 'view')) return;
    var want = '#j/boss/' + encodeURIComponent(String(id));
    if (typeof location !== 'undefined' && location && String(location.hash || '') === want) return;
    _call('Nav', 'view', 'boss', String(id));
  }
  function show(id, opts) {
    var html = viewHTML(id, opts);
    var v = _call('JourneyUI', 'mountView', 'boss', html);
    if (!v) return false;
    _viewId = id;
    _ensureBack();
    _navOpen(id);
    return true;
  }
  function _toast(msg, ms) { _call('JourneyUI', 'toast', msg, ms); }

  // 노드 시트의 "👑 승급 시험 도전"과 첫 카드 "보스로 건너뛰기"(시트 경유)가 부른다
  function start(id, now) {
    now = _now(now);
    var nd = _node(id);
    if (!nd || nd.kind !== 'boss') { _toast('승급 시험을 찾지 못했어요'); return false; }
    expire(now);
    var st = _jst();
    if (st && _activeFor(st, id)) {
      var j = judge(id, now);                                      // 롤링 조건이 그새 채워졌으면 여기서 통과
      if (j.pass) { _passToast(id, j); return show(id, { now: now, result: j }); }
      return show(id, { now: now, eval: j.eval });
    }
    return show(id, { now: now });                                 // 만료됐으면 안내 카드에 "지난 시도는 48시간이 지나" 줄
  }
  // 다음 단계 실행: 시도 시작 → 드릴(필요하면) → 실전 5핸드
  function _go(id) {
    var now = _now();
    var nd = _node(id);
    if (!nd) return;
    expire(now);
    var m = _model(id, now);
    if (m.rec.status === 'passed' || !m.sup.ok) { show(id, { now: now }); return; }
    if (!m.active) {
      if (m.wait > 0) { show(id, { now: now }); return; }
      if (m.other) { var on = _node(m.other.node); _toast('진행 중이던 시험' + (on ? '(' + on.title + ')' : '') + '은 멈췄어요(벌점 없음)', 2600); }
      begin(id, now);
    }
    var st = _jst();
    if (!_bossDrillMet(nd, st)) { _runDrill(id); return; }
    _runGame(id);
  }
  function _runDrill(id) {
    var nd = _node(id);
    var chunks = _chunks(nd.drill), spec;
    if (chunks.length > 1) {
      var st = _jst(), a = st ? _activeFor(st, id) : null;
      var idx = (a && _isObj(a.drill) && !a.drill.passed && Array.isArray(a.drill.parts)) ? a.drill.parts.length : 0;
      spec = _partSpec(nd, chunks, Math.min(idx, chunks.length - 1));
      spec.title = nd.title + ' 드릴 ' + (Math.min(idx, chunks.length - 1) + 1) + '/' + chunks.length;
    } else {
      spec = _spec(nd);
      spec.title = nd.title + ' 드릴';
    }
    var fired = false;
    spec.onDone = function(r) { if (fired) return; fired = true; _onDrill(id, r); };
    if (!_can('PuzzleUI', 'start')) { _toast('드릴 화면을 열 수 없어요'); show(id); return; }
    var ok = false;
    try { ok = G.PuzzleUI.start(spec) !== false; } catch (e) { _warn('PuzzleUI.start', e); ok = false; }
    if (!ok && !fired) { fired = true; _toast('드릴을 열지 못했어요. 잠시 뒤 다시 해 주세요'); show(id); }
  }
  function _onDrill(id, r) {
    var now = _now();
    if (!r) { show(id, { now: now }); return; }
    var res = recordDrill(id, r, now);
    if (res.status === 'pass') _toast('드릴 통과! 이제 6인 실전 5핸드씩', 2600);
    else if (res.status === 'part') _toast('세트 ' + res.part + '/' + res.parts + ' 끝! 다음 세트로', 2200);
    show(id, { now: now, drill: res });
  }
  function _runGame(id) {
    var nd = _node(id);
    if (!_can('App', 'selectVillains') || !_can('Journey', 'startSession')) { _toast('실전 게임을 열 수 없어요'); return; }
    _call('Journey', 'startSession', { kind: 'boss', node: id, chunk: CHUNK });   // onSessionStart가 코칭을 고정
    var cfg = _call('JourneyUI', 'missionConfig', nd) || (nd.mission && nd.mission.config) || 'sixmax';
    try {
      G.App.selectVillains(cfg);
      _call('JourneyUI', 'watchReturn', true);                                // 세션 요약에 "여정으로 돌아가기"(JourneyUI.hasPending이 보스 세션을 본다)
    }
    catch (e) {
      _warn('App.selectVillains', e);
      _call('Journey', 'endSession');                                         // 고정 해제(onSessionEnd)
      show(id);
    }
  }
  function _passToast(id, j) {
    var nd = _node(id);
    var t = j.promoted ? _stageTitle(j.promoted) : '';
    _toast(t ? '🎉 승급! ' + t + ' 단계 시작' : '★ 통과! ' + (nd ? nd.title : id), 3200);
  }
  // 실전 세션이 끝나 여정으로 돌아온 뒤(JourneyUI.resume이 시트를 연 다음) 결과 화면
  function _afterGame(id, res) {
    if (res && res.pass) _passToast(id, res);
    if (_can('TodayUI', 'hasPending') && _call('TodayUI', 'hasPending')) return;   // 오늘의 5분 블록이 화면을 쥐고 있으면 토스트만
    if (typeof document !== 'undefined' && document && typeof document.querySelector === 'function') {
      var scr = document.querySelector('.screen.active');                 // 그새 다른 화면으로 갔으면 끼어들지 않는다
      if (scr && scr.id && scr.id !== 'screen-journey') return;
    }
    var opts = { result: res && res.pass ? res : null, eval: res ? res.eval : null, afterGame: true };
    if (res && res.expired && !res.pass) {
      _toast(_idCond(_node(id)) ? '48시간이 지나 시험을 새로 시작해요. 숨은 좌석 관찰은 이어져요(벌점 없음)' : '48시간이 지나 실전 핸드를 처음부터 다시 세요(벌점 없음)', 3200);
    }
    show(id, opts);
  }

  // ── 숨은 좌석 유형 맞히기(M6-BOSS, 계약 H4, H8, H9) ──────
  var _idDraft = null;       // { node, key, guesses: { 좌석 이름: 분류 } }(화면에서 고른 것, 제출 전)
  var _idJudge = null;       // { node, res } 맞히기 제출로 보스 시험까지 통과한 판정(결과 화면 버튼)
  // AF 표기(로드맵 결정 30): 트래커 HUD와 같은 함수(VillainTracker.afText)를 쓴다. 없으면 같은 규칙의 복사본
  function _afTxt(o) {
    var V = _m('VillainTracker');
    if (V && typeof V.afText === 'function') return V.afText(o.aggr, o.calls);
    if (!o.aggr && !o.calls) return '-';
    return o.calls ? String(_r1(o.aggr / o.calls)) : '콜 없음';
  }
  function _obsTxt(o) {
    if (!o || !o.n) return '아직 관찰 0핸드';
    return '관찰 ' + o.n + '핸드: VPIP ' + Math.round(o.vpip / o.n * 100) + '%, PFR ' + Math.round(o.pfr / o.n * 100) + '%, AF ' + _afTxt(o);
  }
  // 은닉 유형 구성(정답 배정과 무관한 상수): 5곳이면 '타이트 1, 정석 1, 루즈-공격 1, 루즈-패시브 2'
  function _mixTxt(n) {
    var T = _m('Journey') && Array.isArray(G.Journey.HIDDEN_TYPES) ? G.Journey.HIDDEN_TYPES : ['TAG', 'LAG', 'Fish', 'Nit', 'Station'];
    if (n < T.length) return '';
    var cnt = {};
    T.forEach(function(t) { var k = _classOf(t); if (k) cnt[k] = (cnt[k] || 0) + 1; });
    return ID_CLASSES.filter(function(k) { return cnt[k]; }).map(function(k) { return CLASS_LABEL[k].replace(/^\S+\s/, '') + ' ' + cnt[k] + '명'; }).join(', ');
  }
  // 받침이 있으면 '과', 없으면 '와'(한글 음절이 아니면 '와')
  function _wa(word) {
    var s = String(word || ''), c = s.charCodeAt(s.length - 1);
    return (c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0) ? '과' : '와';
  }
  function _castKeyOf(type) {
    var list = _call('Journey', 'castList');
    if (Array.isArray(list)) for (var i = 0; i < list.length; i++) if (list[i] && list[i].type === type) return list[i].key;
    return null;
  }
  function _draftFor(id, asg) {
    var key = asg ? asg.key : null;
    if (!_idDraft || _idDraft.node !== id || _idDraft.key !== key) _idDraft = { node: id, key: key, guesses: {} };
    return _idDraft;
  }
  // 제출 판정(화면 없이도 쓰는 입구). guesses = { 좌석 이름: 'tight'|'standard'|'loose-aggr'|'loose-passive' }
  //   → { error: 'node'|'state'|'noassign'|'done'|'hands'|'incomplete', ... } 또는
  //     { pass, correct, total, min, answers{이름: 분류}, types{이름: 유형}, guesses, early, hands, obs[], reshuffled, passed?, judge? }
  function submitIdentify(id, guesses, now) {
    now = _now(now);
    var nd = _node(id), c = _idCond(nd);
    if (!nd || !c) return { error: 'node' };
    var st = _jst(); if (!st) return { error: 'state' };
    var asg = _hiddenOf(st, id);
    if (!asg) return { error: 'noassign' };
    var need = _idNeed(nd, c);
    if (_idPassed(_idRecOf(st, id), asg, need)) return { error: 'done' };
    var obs = _seatObs(asg, _jsCast), lo = _obsMin(obs);
    if (lo < need.gate) return { error: 'hands', hands: lo, gate: need.gate };
    guesses = _isObj(guesses) ? guesses : {};
    var miss = asg.names.filter(function(nm) { return ID_CLASSES.indexOf(guesses[nm]) < 0; });
    if (miss.length) return { error: 'incomplete', missing: miss };
    var answers = {}, types = {}, g = {}, correct = 0;
    asg.names.forEach(function(nm) {
      types[nm] = asg.seats[nm]; answers[nm] = _classOf(asg.seats[nm]); g[nm] = guesses[nm];
      if (g[nm] === answers[nm]) correct++;
    });
    var total = asg.names.length, early = lo < need.full, pass = correct >= need.min;
    var b = _bs(st);
    if (!_isObj(b.identify)) b.identify = {};
    b.identify[id] = { guesses: g, at: _iso(now), correct: correct, total: total, hands: lo, early: early, key: asg.key, ok: pass };
    _save(st);
    var out = { pass: pass, correct: correct, total: total, min: need.min, answers: answers, types: types, guesses: g, early: early,
      hands: lo, obs: obs, reshuffled: false, key: asg.key };
    _call('Badges', 'note', 'identify', { node: id, correct: correct, total: total }, now);
    if (!pass) {
      out.reshuffled = !!_call('Journey', 'reshuffleHidden', id, now);    // 정답을 본 배정으로 다시 찍지 못하게
    } else if (nd.kind !== 'boss') {
      var pr = _call('Journey', 'checkNode', id, now);
      out.passed = !!pr || _recOf(_jst(), id).status === 'passed';
    } else if (_activeFor(_jst(), id)) {
      out.judge = judge(id, now);
      out.passed = !!(out.judge && out.judge.pass);
    }
    return out;
  }
  // 1곳 은닉(s6-02): 함께 앉은 캐스트(성향을 아는 상대)의 누적 관찰 숫자(비교용, Journey.hiddenCast와 key 없는 JStats.castObs). 없으면 ''
  function _castCmpHTML(id) {
    var list = _call('Journey', 'hiddenCast', id);
    if (!Array.isArray(list) || !list.length) return '';
    var rows = list.map(function(c) {
      var o = _seatObs({ names: [c.name], key: null }, function(nm) { return _jsCast(nm); })[0];
      var cls = _classOf(c.type);
      return '<li>' + _esc(c.name + (cls ? '(' + CLASS_LABEL[cls] + ')' : '') + ': ' + _obsTxt(o)) + '</li>';
    });
    return '<div class="j-crit"><div class="j-crit-t">비교: 같은 테이블 캐스트(성향을 아는 상대, 누적)</div><ul>' + rows.join('') + '</ul></div>';
  }
  function _revealHTML(res) {
    return '<div class="j-crit"><div class="j-crit-t">좌석별 정답</div><ul>' + Object.keys(res.answers).map(function(nm) {
      var ok = res.guesses[nm] === res.answers[nm];
      var o = null; (res.obs || []).forEach(function(x) { if (x.name === nm) o = x; });
      var ck = _castKeyOf(res.types[nm]);
      return '<li>' + _esc((ok ? '✓ ' : '✗ ') + nm + ': 내 답 ' + (CLASS_LABEL[res.guesses[nm]] || '-') + ', 정답 ' + CLASS_LABEL[res.answers[nm]] +
        (ck ? '(' + ck + _wa(ck) + ' 같은 성향)' : '') + (o ? '. ' + _obsTxt(o) : '')) + '</li>';
    }).join('') + '</ul></div>';
  }
  // 판별 기준 한 줄(s6-02 레슨과 같은 VillainTracker.RULE, 로드맵 결정 21, 26의 엔진 실측 재보정 값). 트래커가 없으면 ''(M6 통합 검증)
  function _idRuleTxt() {
    var V = _m('VillainTracker'), R = V && V.RULE;
    if (!R || !isFinite(R.tightMax) || !isFinite(R.lpMin) || !isFinite(R.laMin)) return '';
    return ' 이 앱 기준: VPIP ' + R.tightMax + ' 이하면 타이트, ' + R.lpMin + ' 이상이고 PFR이 VPIP의 ' + R.lpRatio + '배 미만이면 루즈-패시브, ' +
      R.laMin + ' 이상이고 ' + R.laRatio + '배 이상이면 루즈-공격, 나머지 정석. 핸드가 적으면 숫자가 흔들려요.';
  }
  // 화면 문자열(유형 노출 없음: 제출 전 화면은 배정 유형과 무관하고 좌석별 관찰 숫자만 다르다)
  function identifyHTML(id, opts) {
    opts = opts || {};
    var nd = _node(id), c = _idCond(nd);
    var top = '<div class="j-sub-top"><button type="button" class="j-back" aria-label="뒤로" onclick="Boss._idBack(' + _q(id) + ')">↩</button>' +
      '<h2 class="j-sub-t">🕵 숨은 좌석 유형 맞히기</h2></div>';
    if (!nd || !c) return '<div class="j-sub">' + top + '<div class="j-card"><div class="j-card-d">이 노드에는 숨은 좌석이 없어요.</div></div></div>';
    var st = _jst() || { nodes: {}, boss: { active: null } };
    var asg = _hiddenOf(st, id), need = _idNeed(nd, c), rec = _idRecOf(st, id);
    var body = [];
    var res = opts.result;
    if (res && !res.error) {
      body.push('<div class="j-wrap-card"><div class="j-wrap-t">' + (res.pass ? '🎉 맞혔어요!' : '🔎 아쉬워요') + '</div>' +
        '<div class="j-wrap-line">' + _esc(res.total + '곳 중 ' + res.correct + '곳 정답(통과 기준 ' + res.min + '곳)' + (res.early ? ', 조기 제출' : '')) + '</div></div>');
      body.push(_revealHTML(res));
      var next;
      if (!res.pass) next = '좌석을 새로 섞었어요. 새 손님' + (need.seats > 1 ? '들' : '') + '을 처음부터 지켜봐요(벌점 없음). 오래 지켜볼수록 숫자가 믿을 만해져요.';
      else if (res.passed && nd.kind === 'boss') next = '맞히기와 함께 승급 시험 기준을 모두 채웠어요!';
      else if (res.passed) next = nd.title + ' 통과!';
      else next = nd.kind === 'boss' ? '맞히기 기준은 채웠어요. 시험의 다른 기준을 마저 채우면 통과해요.' : '맞히기 기준은 채웠어요. 남은 기준은 노드 시트에서 확인해요.';
      body.push('<div class="j-sum">💡 ' + _esc(next) + '</div>');
      body.push(_acts([_btn(res.passed && nd.kind === 'boss' ? '🎉 결과 보기' : '돌아가기', 'Boss._idDone(' + _q(id) + ')', true)]));
      return '<div class="j-sub">' + top + body.join('') + '</div>';
    }
    var mix = _mixTxt(need.seats);
    body.push('<div class="j-block-card"><div class="j-block-k">' + _esc(nd.title + ', 보기 4개: 타이트, 정석, 루즈-공격, 루즈-패시브') + '</div>' +
      '<div class="j-block-t">' + _esc(need.seats > 1 ? '숨은 좌석 ' + need.seats + '곳 중 ' + need.min + '곳 이상 맞히기' : '숨은 손님 1명의 유형 맞히기') + '</div>' +
      '<div class="j-block-d">' + _esc((mix ? '이 테이블에는 ' + mix + '이 앉아 있어요(누가 누구인지는 비밀). 좌석끼리 숫자를 나란히 비교해 보세요. '
        : '아래 같은 테이블 캐스트(성향을 아는 상대)의 누적 숫자와 나란히 비교해 보면 쉬워요. ') +
        'VPIP는 팟에 들어온 비율, PFR이 VPIP보다 한참 낮으면 콜 위주(패시브), AF가 높으면 벳과 레이즈가 많아요. 햇살과 콜마스터처럼 콜이 많은 상대는 둘 다 루즈-패시브예요.' +
        _idRuleTxt() + ' 경계 근처 숫자면 더 지켜봐요.') + '</div></div>');
    if (!asg) {
      body.push('<div class="j-card"><div class="j-card-t">아직 숨은 좌석을 본 적이 없어요</div><div class="j-card-d">' + _esc(nd.kind === 'boss'
        ? '승급 시험을 시작하고 숨은 테이블에서 실전을 치면 관찰이 쌓여요.'
        : '노드 시트의 🃏 실전 시작(5핸드씩)으로 숨은 손님이 앉은 테이블에서 치면 관찰이 쌓여요.') + '</div></div>');
      body.push(_acts([_btn('돌아가기', 'Boss._idBack(' + _q(id) + ')', true)]));
      return '<div class="j-sub">' + top + body.join('') + '</div>';
    }
    var obs = _seatObs(asg, _jsCast), lo = _obsMin(obs);
    if (_idPassed(rec, asg, need)) {
      body.push('<div class="j-done-line is-ok">✅ ' + _esc('맞히기 통과(' + rec.total + '곳 중 ' + rec.correct + '곳' + (rec.early ? ', 조기 제출' : '') + ')') + '</div>');
      var ans = {}, types = {};
      asg.names.forEach(function(nm) { types[nm] = asg.seats[nm]; ans[nm] = _classOf(asg.seats[nm]); });
      body.push(_revealHTML({ answers: ans, types: types, guesses: rec.guesses || {}, obs: obs }));
      body.push(_acts([_btn('돌아가기', 'Boss._idDone(' + _q(id) + ')', true)]));
      return '<div class="j-sub">' + top + body.join('') + '</div>';
    }
    if (_isObj(rec) && rec.key !== asg.key) {
      body.push('<div class="j-done-line">ℹ ' + _esc('지난 제출은 ' + rec.total + '곳 중 ' + rec.correct + '곳이었어요. 좌석을 새로 섞어 관찰을 처음부터 해요') + '</div>');
    }
    var guesses = (opts.draft && _isObj(opts.draft)) ? opts.draft : _draftFor(id, asg).guesses;
    obs.forEach(function(o, i) {
      var picks = ID_CLASSES.map(function(k) {
        var on = guesses[o.name] === k;
        return '<button type="button" class="j-pick' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" onclick="Boss._pick(' + _q(id) + ',' + i + ',\'' + k + '\')">' +
          _esc(CLASS_LABEL[k]) + '</button>';
      }).join('');
      body.push('<div class="j-card"><div class="j-card-t">' + _esc(o.name) + '</div><div class="j-card-d">' + _esc(_obsTxt(o)) + '</div>' +
        '<div class="j-set-row"><span class="j-picks" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr))">' + picks + '</span></div></div>');
    });
    body.push(_castCmpHTML(id));
    var all = asg.names.every(function(nm) { return ID_CLASSES.indexOf(guesses[nm]) >= 0; });
    var ready = lo >= need.gate;
    var rule = '좌석마다 ' + need.full + '핸드 지켜본 뒤 제출' + (need.early ? '(확신이 서면 ' + need.gate + '핸드부터 조기 제출)' : '') +
      '. 기준에 못 미치면 정답을 보여 주고 좌석을 새로 섞어요(벌점 없음).';
    var seen = (need.seats > 1 ? '가장 적게 본 좌석 ' : '관찰 ') + lo + '핸드';
    var state = ready
      ? (lo < need.full ? '지금 내면 조기 제출이에요(' + seen + '). ' : '관찰 충분(' + seen + '). ') + (all ? '' : (need.seats > 1 ? '모든 좌석을 고르면' : '유형을 고르면') + ' 제출할 수 있어요.')
      : seen + ', ' + need.gate + '핸드부터 제출할 수 있어요.';
    body.push('<div class="j-sum">💡 ' + _esc(state + ' ' + rule) + '</div>');
    var can = ready && all;
    body.push('<div class="j-acts"><button type="button" class="j-btn j-primary j-big"' + (can ? ' onclick="Boss._submit(' + _q(id) + ')"' : ' disabled aria-disabled="true"') + '>' +
      _esc(ready && lo < need.full ? '조기 제출하기' : '제출하기') + '</button>' + _btn('나중에', 'Boss._idBack(' + _q(id) + ')') + '</div>');
    return '<div class="j-sub">' + top + body.join('') + '</div>';
  }
  function _renderIdentify(id, opts) {
    var v = _call('JourneyUI', 'mountView', 'identify', identifyHTML(id, opts));
    if (!v) return false;
    _viewId = id;
    return true;
  }
  function _navIdentify(id) {
    if (!_can('Nav', 'view')) return;
    var want = '#j/boss/' + encodeURIComponent(String(id) + '~id');
    if (typeof location !== 'undefined' && location && String(location.hash || '') === want) return;
    _call('Nav', 'view', 'boss', String(id) + '~id');
  }
  // 노드 시트, 보스 화면의 '🕵 숨은 좌석 유형 맞히기'
  function openIdentify(id) {
    var nd = _node(id);
    if (!nd || !_idCond(nd)) return false;
    if (!_renderIdentify(id, {})) return false;
    _ensureBack();
    _navIdentify(id);
    return true;
  }
  function _pick(id, idx, cls) {
    var st = _jst(), asg = _hiddenOf(st, id);
    if (!asg || ID_CLASSES.indexOf(cls) < 0) return;
    var nm = asg.names[Math.floor(_num(idx, -1))];
    if (!nm) return;
    _draftFor(id, asg).guesses[nm] = cls;
    _renderIdentify(id, {});
  }
  var ID_ERR = { hands: '아직 관찰이 모자라요', incomplete: '모든 좌석의 유형을 골라 주세요', done: '이미 맞히기를 통과했어요', noassign: '아직 숨은 좌석을 본 적이 없어요' };
  function _submit(id) {
    var nd = _node(id);
    var st = _jst(), asg = _hiddenOf(st, id);
    var res = submitIdentify(id, asg ? _draftFor(id, asg).guesses : {}, _now());
    if (res.error) { _toast(ID_ERR[res.error] || '제출하지 못했어요'); _renderIdentify(id, {}); return res; }
    _idDraft = null;
    _idJudge = (res.judge && res.judge.pass) ? { node: id, res: res.judge } : null;
    if (_idJudge) _passToast(id, res.judge);
    else if (res.passed && nd) _toast('★ 통과! ' + nd.title, 3200);
    _renderIdentify(id, { result: res });
    return res;
  }
  // 결과 화면의 버튼: 보스는 시험 화면(맞히기로 통과했으면 결과 카드), 학습 노드는 노드 시트
  function _idDone(id) {
    var nd = _node(id);
    _viewId = null;
    if (nd && nd.kind === 'boss') {
      if (_idJudge && _idJudge.node === id) { var j = _idJudge; _idJudge = null; show(id, { result: j.res }); return; }
      start(id);
      return;
    }
    _call('JourneyUI', 'open');
    _call('JourneyUI', 'openNode', id);
  }
  // ↩, 나중에: 시스템 뒤로와 같다(Nav가 부모 화면을 다시 그린다). Nav가 없으면 결과 버튼과 같은 곳으로
  function _idBack(id) {
    _viewId = null;
    if (_can('Nav', 'back')) { _call('Nav', 'back'); return; }
    _idDone(id);
  }
  // 노드 시트 버튼 줄 뒤(계약 H11 b): 숨은 좌석 맞히기가 있는 노드에서만 버튼과 관찰 한 줄
  function sheetActions(nodeId, rec, state) {
    var nd = _node(nodeId), c = _idCond(nd);
    if (!nd || !c) return '';
    var st = _isObj(state) ? state : (_jst() || { nodes: {} });
    rec = _isObj(rec) ? rec : _recOf(st, nodeId);
    if (rec.status === 'passed') return '';
    var asg = _hiddenOf(st, nodeId);
    if (nd.kind !== 'boss' && rec.status === 'locked') return '';
    if (nd.kind === 'boss' && !asg && !_activeFor(st, nodeId)) return '';       // 은닉 보스는 시험을 시작해야 관찰이 시작된다
    var need = _idNeed(nd, c), rc = _idRecOf(st, nodeId), line;
    if (!asg) line = '숨은 테이블에서 실전을 치면 관찰이 쌓여요(좌석마다 ' + need.full + '핸드 뒤 제출' + (need.early ? ', 조기 제출은 ' + need.gate + '핸드부터' : '') + ')';
    else if (_idPassed(rc, asg, need)) line = '맞히기 통과(' + rc.total + '곳 중 ' + rc.correct + '곳)';
    else {
      var lo = _obsMin(_seatObs(asg, _jsCast));
      line = (lo >= need.gate ? '제출할 수 있어요' + (lo < need.full ? '(조기 제출)' : '') + '. ' : '') + '가장 적게 본 좌석 ' + lo + '핸드, 기준 ' + need.full + '핸드' +
        (need.early && lo < need.gate ? '(조기 제출은 ' + need.gate + '핸드부터)' : '') +
        ((_isObj(rc) && rc.key !== asg.key) ? '. 지난 제출 ' + rc.total + '곳 중 ' + rc.correct + '곳, 새로 섞은 좌석' : '');
    }
    return '<div class="j-acts"><button type="button" class="j-btn j-act" onclick="Boss.openIdentify(' + _q(nodeId) + ')">🕵 숨은 좌석 유형 맞히기</button>' +
      '<div class="j-why">' + _esc(line) + '</div></div>';
  }
  // ↩, 나중에: 한 단계 위(노드 시트 또는 홈)
  function back() {
    _viewId = null;
    if (_can('JourneyUI', 'back')) { _call('JourneyUI', 'back'); return; }
    _call('JourneyUI', 'open');
  }
  // 여정 홈으로: 기록을 홈까지 되감고 홈을 그린다
  function home() {
    _viewId = null;
    if (_can('App', 'showScreen')) _call('App', 'showScreen', 'screen-journey');
    else if (_can('Nav', 'onShow')) _call('Nav', 'onShow', 'screen-journey');
    _call('JourneyUI', 'open');
  }
  function current() { return _viewId; }

  // ── 테스트 주입 ────────────────────────────────────────
  function _setClock(fn) { _nowOver = (typeof fn === 'function') ? fn : null; }
  function _setLater(fn) { _laterOver = (typeof fn === 'function') ? fn : null; }

  if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
    window.addEventListener('load', function() { try { restoreStale(); } catch (e) { _warn('restoreStale', e); } });
  }

  var api = {
    KINDS: KINDS.slice(), EXPIRE_MS: EXPIRE_MS, RETRY_MS: RETRY_MS, MIN_OPP: MIN_OPP, CHUNK: CHUNK,
    context: context, evalCondition: evalCondition, evaluate: evaluate, supported: supported, drillChunks: _chunks,
    active: active, expire: expire, retryWait: retryWait, begin: begin, recordDrill: recordDrill, judge: judge,
    lockCoach: lockCoach, unlockCoach: unlockCoach, restoreStale: restoreStale,
    onSessionStart: onSessionStart, onSessionEnd: onSessionEnd, onNewHand: onNewHand, afterDecision: afterDecision, onHandEnd: onHandEnd,
    start: start, show: show, viewHTML: viewHTML, back: back, home: home, current: current,
    // M6-BOSS: 숨은 좌석 맞히기(계약 H9)와 주간 연속 계산
    sheetActions: sheetActions, openIdentify: openIdentify, submitIdentify: submitIdentify, identifyHTML: identifyHTML,
    weekStreak: weekStreak, classOf: _classOf, CLASSES: ID_CLASSES.slice(), CLASS_LABEL: CLASS_LABEL, EARLY_HANDS: EARLY_HANDS,
    _pick: _pick, _submit: _submit, _idDone: _idDone, _idBack: _idBack,
    _go: _go, _setClock: _setClock, _setLater: _setLater
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
