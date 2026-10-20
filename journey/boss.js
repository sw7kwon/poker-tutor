// journey/boss.js (채우는 패키지: M3-P4a)
// 승급 시험(보스) v1과 미션 조건 판정. 설계서 2.2절(미션 판정 규약), 2.5절(보스 표, 코칭 고정), 6.1절 boss.active, 7.1절 7번.
// 조건 DSL 10종과 판정 창 해석의 정본은 journey/journey-data.js 머리 주석이다.
//
// 순수 판정(테스트는 opts로 recent, hseq, now, hero, bands, drillItems, sets를 직접 넣는다)
//   Boss.context(node, stats, state, opts) → ctx
//   Boss.evalCondition(cond, ctx) → item
//   Boss.evaluate(node, stats, state, opts) → { node, pass, cond, hold, pending, items, more, est, expired }
//     node = 노드 객체 또는 id, stats = JStats(또는 recent/heroTotals/handSeq를 가진 가짜), state = poker_journey 상태
//     item = { kind, ok, have, need, opp, label, why, hold?, pending?, ref?, more?, est? }
//       have/need는 노드 시트의 롤링 줄 "label: have/need(기회 opp)"에 그대로 들어가는 표시값(숫자 또는 짧은 글). need가 null이면 숨김.
//       hold = 기회(minOpp) 미달이라 판정 보류(소표본 통과/실패 없음), pending = 이번 버전에서 판정할 수 없는 조건
//       (identify, weeks, overlap, custom의 luckMeterViews/shortSession, 기록이 아직 없는 필터 multiway/oop/potType),
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
//   드릴 기준 미달이면 그 시도는 끝나고 다음 시도는 그 시도 시작 24시간 뒤부터(틀린 문제 중 SRS 유형만 Leitner 0번 상자로 들어가
//   다음 날 먼저 나온다. showdown, order 같은 once 유형은 상자가 없어 안내 문구도 그 수만 말한다).
//   조건 미달은 시도를 끝내지 않는다(롤링이라 더 치면 바뀐다). 시도 안의 재판정은 세션이 끝날 때와 보스 화면을 열 때.
// 코칭 고정: 보스와 mission.coach가 있는 미션(s1-06 L0, s2-10 L1)은 세션 시작 때(onSessionStart) CoachUI.snapshot() 뒤 setLevel(n),
//   세션이 끝나거나(onSessionEnd) 다른 게임이 시작되면 restore. 스냅샷은 poker_journey.boss.coachLock(보스는 boss.active.coachSnap에도)에
//   저장해 새로고침 뒤에도 복원한다(load 때). CoachUI.snapshot/restore(M3-P4b)가 없으면 고정하지 않는다(setLevel만 쓰면 auto 이력이 지워짐).
// 상태(poker_journey.boss): { active: null|{ node, startedAt, hands, drill: null|{n, ok, at, byType, passed, carried}, coachSnap, seatTypes, seed },
//   last: { 노드 id: { startedAt, endedAt, result: 'pass'|'drill'|'expired'|'stopped', n?, ok?, srsWrong? } }, coachLock: null|{ node, kind, level, snap, at } }
// 로드 시 DOM 접근 없음(window.addEventListener('load')만). 다른 모듈은 전부 typeof 가드로 부른다.
var Boss = (function() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : this);
  var H = 3600 * 1000, DAY = 24 * H;
  var EXPIRE_MS = 48 * H;        // 보스 카운터를 채우는 기한
  var RETRY_MS = 24 * H;         // 드릴 미달 뒤 재도전 간격
  var MIN_OPP = 30;              // 비율 조건의 기본 기회 수(2.2절 1번, 부록 A 머리)
  var DEFAULT_WINDOW = 30;       // 개수 상한에 window도 minOpp도 없을 때(최근 30핸드)
  var SET_MAX = 20;              // PuzzleUI 세트 상한(이보다 큰 드릴은 이번 흐름에서 돌릴 수 없음)
  var CHUNK = 5;                 // 실전 분할 단위(2.2절 3번)
  var KINDS = ['pattern', 'light', 'drillSet', 'puzzleSet', 'band', 'hands', 'identify', 'weeks', 'overlap', 'custom'];
  var PENDING_KIND = { identify: '숨은 좌석 유형 맞히기', weeks: '주간 복기', overlap: '레인지 색칠 겹침' };
  var CUSTOM_PENDING = { luckMeterViews: '운 미터 카드 보기', shortSession: '짧게 끝낸 세션' };
  var FILTER_OK = { street: 1, source: 1, concept: 1, pos: 1, marginal: 1 };
  var FILTER_SOON = { multiway: '3명 이상 팟', oop: '포지션 불리(OOP)', potType: '3벳 팟' };
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
      now: now, node: nd, rec: rec, active: act, since: since, hands: hands, expired: expired, stats: stats,
      sets: opts.sets || (act && act.drill && act.drill.byType) || null
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
    return ctx;
  }

  function _soonFilter(f) {
    if (!_isObj(f)) return null;
    var keys = Object.keys(f).filter(function(k) { return f[k] != null && !FILTER_OK[k]; });
    if (!keys.length) return null;
    return keys.map(function(k) { return FILTER_SOON[k] || k; }).join(', ');
  }
  function _match(e, f) {
    if (!f) return true;
    for (var k in f) {
      if (!Object.prototype.hasOwnProperty.call(f, k)) continue;
      var v = f[k];
      if (v == null) continue;
      if (Array.isArray(v)) { if (v.indexOf(e[k]) < 0) return false; }
      else if (typeof v === 'boolean') { if (!!e[k] !== v) return false; }
      else if (e[k] !== v) return false;
    }
    return true;
  }
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
  // pattern: { pattern, max, window? | minOpp?, filter? }. window = 최근 핸드 수, minOpp = 최근 기회 수(미달이면 보류)
  function _pattern(c, ctx) {
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
      var viol = all.filter(function(e) { return typeof e.h === 'number' && e.h >= from && e.pattern === c.pattern; });
      it.window = W; it.count = viol.length;
      it.ok = viol.length <= max;
      it.label = '최근 ' + W + '핸드' + pos + ' ' + pl;
      it.have = viol.length + '회'; it.need = '허용 ' + max + '회';
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
        return it;
      }
      var cnt2 = pool2.filter(hit).length;
      it.count = cnt2; it.ok = cnt2 <= maxC; it.opp = pool2.length;
      it.label = head + ' ' + tokTxt + ' 횟수(최근 기회 ' + pool2.length + '번)' + refTxt;
      it.have = cnt2 + '번'; it.need = '허용 ' + maxC + '번';
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

  // custom: srsBoxRatio = 복습 카드(type|keyPrefix) 중 box ≥ 기준 비율(카드 minOpp장부터 판정, 기본 30). 나머지 fn은 다음 업데이트
  function _custom(c, ctx) {
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
      return it;
    }
    var needK = Math.ceil(_num(c.min, 0) * N - 1e-9);
    it.ok = k >= needK;
    it.label = nm + ' ' + box + '단계 이상(카드 ' + N + '장)';
    it.have = _pct(k / N) + '%'; it.need = _pct(_num(c.min, 0)) + '% 이상';
    if (!it.ok) it.why = nm + ' ' + box + '단계 이상 ' + k + '장/' + N + '장. ' + (needK - k) + '장 더 ' + box + '단계로 올리면 넘어요(복습에서 맞힐 때마다 한 단계씩)';
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
      default:
        return _pendingItem(c, PENDING_KIND[c.kind] || ('조건 ' + c.kind));
    }
  }

  // 보스 전용 항목: 드릴(노드 drill 최고 기록)과 보스 카운터
  function _drillItem(nd, ctx) {
    var c = _drillCount(nd.drill), need = _drillNeed(nd.drill), r = ctx.rec, n = _num(r.drill && r.drill.n, 0);
    var a = ctx.active;
    var ok = _drillMet(nd, r);
    var have = (a && a.drill && a.drill.n) ? _num(a.drill.ok, 0) : (n > 0 ? Math.round(_num(r.drill.best, 0) * c) : null);
    var it = { kind: 'drillSet', drill: true, ok: ok, label: '드릴 ' + _drillTxt(nd.drill), have: have == null ? null : have + '개', need: need + '개 이상', opp: null };
    if (!ok) it.why = (n > 0 && have != null) ? '드릴 ' + have + '개 정답, ' + need + '개 이상 필요' : '드릴 ' + _drillTxt(nd.drill) + ' 중 ' + need + '개 이상 맞히기';
    return it;
  }
  function _handsItem(nd, ctx) {
    var need = Math.max(0, Math.floor(_num(nd.mission.hands, 0)));
    var it = { kind: 'hands', boss: true, ok: ctx.hands >= need, label: '시험 실전 핸드(48시간 안)', have: ctx.hands, need: need, opp: null };
    if (!it.ok) { it.more = need - ctx.hands; it.why = '실전 핸드 ' + it.more + '개 더(5핸드씩)'; }
    return it;
  }

  function evaluate(node, stats, state, opts) {
    var nd = _nodeObj(node);
    var out = { node: nd ? nd.id : null, pass: false, cond: false, hold: false, pending: false, items: [], more: 0, est: false, expired: false };
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
    _endAttempt(st, a, 'expired', now);
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
  // 재도전까지 남은 시간(ms). 0이면 지금 시작 가능. 드릴 미달로 끝난 시도만 시작 시각 + 24시간까지 막는다
  function retryWait(id, now) {
    now = _now(now);
    var st = _jst(); if (!st) return 0;
    var L = _bs(st).last[id];
    if (!_isObj(L) || L.result !== 'drill') return 0;
    var t = _ms(L.startedAt);
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
    var met = _drillMet(nd, _recOf(st, id));
    b.active = { node: id, startedAt: _iso(now), hands: 0, drill: met && nd.drill ? { carried: true, passed: true } : null,
      coachSnap: null, seatTypes: null, seed: Math.floor(now % 1000000) };
    if (_isObj(rec) && _isObj(rec.mission)) rec.mission.hands = 0;
    _save(st);
    return b.active;
  }
  // 드릴 세트 결과 반영. r = PuzzleUI 결과 {n, ok, aborted, results}. → { status: 'pass'|'fail'|'incomplete', n, ok, need, count }
  function recordDrill(id, r, now) {
    now = _now(now);
    var st = _jst(), nd = _node(id);
    if (!st || !nd || !nd.drill) return { status: 'incomplete' };
    var a = _activeFor(st, id) || begin(id, now);
    st = _jst();
    a = _activeFor(st, id);
    var count = _drillCount(nd.drill), need = _drillNeed(nd.drill);
    var n = Math.max(0, Math.floor(_num(r && r.n, 0))), ok = Math.max(0, Math.min(n, Math.floor(_num(r && r.ok, 0))));
    var res = { n: n, ok: ok, need: need, count: count };
    var aborted = !!(r && r.aborted);
    // 문항을 하나도 만들지 못한 세트(r.empty)는 미달이 아니다(다시 풀기)
    if (n === 0 || (r && r.empty)) { res.status = 'incomplete'; return res; }
    // 중간에 나감: 이미 통과할 수 없게 틀렸으면 미달로 끝낸다(나가기로 피할 수 없게), 아니면 드릴을 다시 풀 수 있다
    if (aborted && (n - ok) <= count - need) { res.status = 'incomplete'; return res; }
    if (!aborted && n > 0) _call('Journey', 'recordDrillSet', id, { n: n, ok: ok }, now);
    st = _jst(); a = _activeFor(st, id);
    var met = !aborted && n > 0 && _drillMet(nd, _recOf(st, id)) && ok >= Math.min(need, n);
    var byType = {}, wrongKeys = {}, srsWrong = 0;
    (r && Array.isArray(r.results) ? r.results : []).forEach(function(x) {
      if (!x || !x.type) return;
      var s = byType[x.type] || (byType[x.type] = { n: 0, ok: 0 });
      s.n++; if (x.ok) s.ok++;
      var k = x.type + '|' + x.key;                            // 같은 카드를 두 번 틀려도 상자에는 1장
      if (!x.ok && _srsKept(x) && !wrongKeys[k]) { wrongKeys[k] = 1; srsWrong++; }
    });
    res.srsWrong = srsWrong;
    if (met) {
      if (a) { a.drill = { n: n, ok: ok, at: _iso(now), byType: byType, passed: true }; }
      _save(st);
      res.status = 'pass';
      return res;
    }
    if (a) _endAttempt(st, a, 'drill', now, { n: n, ok: ok, srsWrong: srsWrong });
    _save(st);
    res.status = 'fail';
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
      var c = _drillCount(nd.drill);
      var spec = _spec(nd);
      if (c > SET_MAX) why.push('드릴 ' + c + '문항 세트');
      else if (!_can('PuzzleUI', 'start') || (_can('PuzzleUI', 'can') && !_call('PuzzleUI', 'can', spec))) why.push(_typeName(nd.drill.type) + ' 퍼즐');
    }
    var m = nd.mission;
    if (m) {
      if (m.config === 'sixmax-cast-hidden') why.push('유형 숨김 테이블');
      (m.conditions || []).forEach(function(cd) {
        if (!_isObj(cd)) return;
        if (PENDING_KIND[cd.kind]) why.push(PENDING_KIND[cd.kind]);
        else if (cd.kind === 'custom' && cd.fn !== 'srsBoxRatio') why.push(CUSTOM_PENDING[cd.fn] || '추가 조건');
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
  function onNewHand(ctx) {
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
  function _critHTML(nd) {
    var li = [];
    if (nd.drill) li.push('드릴: ' + _drillTxt(nd.drill) + ' 중 ' + _drillNeed(nd.drill) + '개 이상');
    var m = nd.mission;
    if (m) {
      li.push('6인 실전 ' + m.hands + '핸드(5핸드씩, 시작 뒤 48시간 안에)');
      (m.conditions || []).forEach(function(c) { var t = _condText(c); if (t) li.push(t); });
      if (m.coach != null) li.push('실전 중 코칭은 L' + m.coach + (COACH_NAME[m.coach] ? '(' + COACH_NAME[m.coach] + ')' : '') + '로 고정, 끝나면 원래대로');
    }
    return '<div class="j-crit"><div class="j-crit-t">통과 기준(모두 채우기)</div><ul>' + li.map(function(t) { return '<li>' + _esc(t) + '</li>'; }).join('') + '</ul></div>';
  }
  function _condText(c) {
    if (!_isObj(c)) return '';
    if (c.kind === 'pattern') {
      var where = c.window ? '최근 ' + c.window + '핸드' : (c.minOpp ? '최근 기회 ' + c.minOpp + '번' : '최근 ' + DEFAULT_WINDOW + '핸드');
      var mx = _num(c.max, 0);
      return where + ((c.filter && c.filter.pos) ? '(' + _list(c.filter.pos) + ')' : '') + '에서 "' + _patternLabel(c.pattern) + '" ' + mx + '회' + (mx > 0 ? ' 이하' : '');
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
    if (c.kind === 'drillSet' || c.kind === 'puzzleSet') return _arr(c.type).map(_typeName).join(', ') + ' ' + c.count + '문항 중 ' + c.pass + '개 이상';
    return (PENDING_KIND[c.kind] || CUSTOM_PENDING[c.fn] || '추가 조건') + '(다음 업데이트에서 판정)';
  }
  function _lineOf(it) {
    if (it.pending) return '… ' + it.label + ': 다음 업데이트에서 판정';
    if (it.need == null) return '';
    return (it.ok ? '✓ ' : '○ ') + it.label + ': ' + (it.have == null ? '-' : it.have) + '/' + it.need + (it.opp != null ? '(기회 ' + it.opp + ')' : '');
  }
  function _statusHTML(ev, title) {
    var lines = (ev && ev.items || []).map(_lineOf).filter(Boolean);
    if (!lines.length) return '';
    return '<div class="j-crit"><div class="j-crit-t">' + _esc(title || '지금 상태') + '</div><ul>' +
      lines.map(function(t) { return '<li>' + _esc(t) + '</li>'; }).join('') + '</ul></div>';
  }
  function _needHTML(ev) {
    var lines = (ev && ev.items || []).filter(function(it) { return !it.ok && !it.ref; }).map(function(it) { return it.why || it.label; }).filter(Boolean);
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
      body.push(_statusHTML(res.eval, '통과한 기준'));
      body.push(_acts([_btn('여정 홈으로', 'Boss.home()', true)]));
      return '<div class="j-sub">' + _top(nd) + body.join('') + '</div>';
    }
    if (opts.drill && opts.drill.status === 'fail') {
      var d = opts.drill;
      body.push('<div class="j-done-line">ℹ ' + _esc('드릴 ' + d.ok + '/' + d.n + ', 통과는 ' + d.need + '개 이상' + (d.need > d.ok ? '(' + (d.need - d.ok) + '개 더 필요했어요)' : '')) + '</div>');
      body.push('<div class="j-sum">💡 ' + _esc('벌점은 없어요. ' + _boxTip(d.srsWrong) + '재도전은 약 ' + _hoursTxt(retryWait(id, now)) + ' 뒤에 열려요(시도 시작 24시간 뒤).') + '</div>');
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
      var drillDone = _drillMet(nd, m.rec);
      var lineTxt;
      if (opts.drill && opts.drill.status === 'pass') lineTxt = '✅ 드릴 ' + opts.drill.ok + '/' + opts.drill.n + ' 통과! 이제 6인 실전이에요';
      else if (opts.drill && opts.drill.status === 'incomplete') lineTxt = 'ℹ 드릴을 끝까지 풀어야 실전으로 넘어가요';
      else if (opts.afterGame) lineTxt = 'ℹ 아직이에요' + (ev.more ? '. 핸드 ' + (ev.est ? '약 ' : '') + ev.more + '개 더' : '') + (ev.hold ? '(판정 기회 모으는 중)' : '');
      else lineTxt = 'ℹ 시험 진행 중';
      lineTxt += ', 남은 시간 ' + _hoursTxt(left);
      body.push('<div class="j-done-line' + (opts.drill && opts.drill.status === 'pass' ? ' is-ok' : '') + '">' + _esc(lineTxt) + '</div>');
      body.push(_statusHTML(ev, '지금 상태'));
      if (opts.afterGame || ev.items.some(function(it) { return !it.ok && !it.ref && !it.drill; })) body.push(_needHTML(ev));
      var primary = drillDone
        ? _btn('▶ ' + (_num(m.active.hands, 0) > 0 ? '이어서 ' : '') + '실전 5핸드', 'Boss._go(' + _q(id) + ')', true)
        : _btn('▶ 드릴 ' + (opts.drill && opts.drill.status === 'incomplete' ? '처음부터 다시' : '시작'), 'Boss._go(' + _q(id) + ')', true);
      body.push(_acts([primary, _btn('나중에', 'Boss.back()')]));
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
    if (m.last && m.last.result === 'expired') body.push('<div class="j-done-line">ℹ 지난 시도는 48시간이 지나 실전 핸드를 처음부터 다시 세요(벌점 없음)</div>');
    if (m.other) { var on = _node(m.other.node); body.push('<div class="j-why" style="margin:8px 2px 0">' + _esc('진행 중인 ' + (on ? on.title : m.other.node) + '은(는) 이 시험을 시작하면 멈춰요(벌점 없음)') + '</div>'); }
    body.push(_critHTML(nd));
    body.push('<div class="j-sum">💡 떨어져도 벌점은 없어요. 드릴 기준에 못 미치면 24시간 뒤에 다시 도전할 수 있고, 실전 조건은 핸드를 더 치면서 채우면 돼요.</div>');
    var go = _drillMet(nd, m.rec) ? '▶ 실전부터 시작(드릴 통과 기록 있음)' : '▶ 드릴부터 시작';
    body.push(_acts([_btn(go, 'Boss._go(' + _q(id) + ')', true), _btn('나중에', 'Boss.back()')]));
    return '<div class="j-sub">' + _top(nd) + body.join('') + '</div>';
  }

  function _ensureBack() {
    var N = _m('Nav');
    if (!N || typeof N.setBack !== 'function' || (_backNav === N && _backSet === N.setBack)) return;
    if (_backOff) { try { _backOff(); } catch (e) { /* 무시 */ } }
    _backNav = N; _backSet = N.setBack;
    // 시스템 뒤로: 보스 화면 기록을 걷어낸 뒤 부모(노드 시트 또는 홈)를 Nav가 다시 그린다(false = 기본 처리)
    try { _backOff = N.setBack('j/boss', function() { _viewId = null; return false; }); } catch (e) { _backOff = null; }
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
      if (m.other) { var on = _node(m.other.node); _toast((on ? on.title : '진행 중인 시험') + '은(는) 멈췄어요(벌점 없음)', 2600); }
      begin(id, now);
    }
    var st = _jst();
    if (!_drillMet(nd, _recOf(st, id))) { _runDrill(id); return; }
    _runGame(id);
  }
  function _runDrill(id) {
    var nd = _node(id);
    var spec = _spec(nd);
    spec.title = nd.title + ' 드릴';
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
    if (res && res.expired && !res.pass) _toast('48시간이 지나 실전 핸드를 처음부터 다시 세요(벌점 없음)', 3200);
    show(id, opts);
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
    context: context, evalCondition: evalCondition, evaluate: evaluate, supported: supported,
    active: active, expire: expire, retryWait: retryWait, begin: begin, recordDrill: recordDrill, judge: judge,
    lockCoach: lockCoach, unlockCoach: unlockCoach, restoreStale: restoreStale,
    onSessionStart: onSessionStart, onSessionEnd: onSessionEnd, onNewHand: onNewHand, afterDecision: afterDecision, onHandEnd: onHandEnd,
    start: start, show: show, viewHTML: viewHTML, back: back, home: home, current: current,
    _go: _go, _setClock: _setClock, _setLater: _setLater
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
