// journey/career/contract.js (P0 계약 정본, 설계 원문 docs/NEXT_BATCH_DESIGN.md 5.2절)
// 커리어 모드의 등록부, 이벤트 버스, 상태 스키마(기본값 공장), 고정 id 목록과 파사드 Career.
// 이 파일은 계약이다. 클라우드 F1~F6과 로컬 그룹은 읽기만 하고, 바꿔야 하면 보고에 제안한다(필드 추가는 뒤로 호환되게).
//
// ── CareerContract ─────────────────────────────────────
//   VERSION 1, KEY 'poker_career'(localStorage 키, 이름 변경 금지), CURRENCY '코인'
//   register(name, api) → true|false: MODULES 이름만 받는다(다시 등록하면 바꿔 끼운다, 테스트용). api는 객체.
//   unregister(name)(테스트용), mod(name) → api | null, modules() → 등록된 이름 배열
//   on(evt, fn) → off 함수 | null(모르는 이벤트 이름이나 fn이 함수가 아님), off(evt, fn)
//   emit(evt, payload) → 부른 핸들러 수. 동기 호출, 핸들러 예외는 격리(console.warn 뒤 다음 핸들러 계속).
//     핸들러 목록은 emit 시작 때 복사한다(핸들러 안에서 on/off 해도 이번 emit은 그대로).
//   EVENTS(고정): 'session:start', 'hand:end', 'session:end', 'unlock', 'trophy', 'title', 'day', 'travel', 'story',
//     'tourney:level', 'tourney:bust', 'tourney:end', 'lesson:done'(F4 커리어 레슨 완료, 9.6절 3번)
//   payload 약속(보내는 쪽 기준):
//     session:start { session }                  hand:end { venue, stake, rate, netBB, netCoins, hands, rivals:[rivalId], won, ctx }
//     session:end { session, netCoins, hands, bust } unlock { kind:'region'|'venue', id }   trophy { id }   title { from, to }
//     day { day, stipend }   travel { from, to, cost }   story { rivalId, stage }   lesson:done { id }
//     tourney:level { level, mult }   tourney:bust { name, place }   tourney:end { place, prize, n }
//   defaults(now) → 상태 스키마 새 객체(아래). bankroll은 balance 모듈의 START_BANKROLL(없으면 1000).
//   normalize(raw, now) → 모르는 필드는 보존하고 빠진 필드만 기본값으로 채운 새 객체(깨진 값이면 defaults).
//   dayKey(now) → 'YYYY-MM-DD'(기기 현지 날짜), weekKey(now) → 'YYYY-Www'(ISO 주, 월요일 시작), seedOf(str) → 32비트 양의 정수(FNV-1a)
//   TROPHIES(16종 id, 순서 고정), TROPHY_META{ id: { icon, name, text } }(조건은 core F1이 판정, 문구는 맵 F3이 그림)
//   TITLES(7단계, 낮은 순): [{ id, name }]. 평판 문턱은 balance.TITLE_REP(같은 길이).
//   REGIONS(3), VENUES(9): 저장되는 id. 이름, 환율, 바이인, 해금 조건 같은 수치는 balance.js(F6이 보정).
//   MODULES: 'core'(F1), 'table'(F2), 'map'(F3, 파일 map-ui.js), 'rivals'(F4), 'events'(F4), 'tourney'(F5), 'balance'(F6, P0 기본값)
//
// ── 상태 스키마(poker_career, v 1) ──────────────────────
//   { v:1, createdAt, updatedAt(ISO 문자열), bankroll(코인), reputation(평판 점수), title(TITLES id), region(REGIONS id),
//     venue(VENUES id), stake(1|2), unlocked:{ regions:[], venues:[] }, trophies:[{ id, at }],
//     property:{ home:'studio'|'apartment'|'penthouse', items:[] }, story:{ rivalId:{ stage(0~3), at } },
//     challenges:{ weekKey, items:[{ id, progress, done }] }, events:{ day, id, used }, stats:{ hands, sessions, wins, bestNet, net,
//     byVenue:{ venueId:{ hands, sessions, net } }, byRival:{ rivalId:{ hands, net, met } }, tourney:{ played, cashes, wins } },
//     session: null | { kind:'cash'|'sng'|'mtt', venue, stake, buyIn(코인), startedAt, hands, stack(bb), roster:[{ name, type, rivalId, hidden }], tourney:{} },
//     daily:{ day, stipend(오늘 받았나), travel(오늘 여행했나) }, log:[{ at, kind, text, delta? }](최근 50), lessons:{ lessonId: doneAt } }
//
// ── 모듈 인터페이스(각 클라우드 작업이 한 모듈을 채우고 register) ──
//   core(F1):   state(), load(), save(), reset(), canAfford(venueId, stake), buyIn(venueId, stake, kind) → session | { error },
//               settle(result{ net, hands, bust, tourney? }) → { bankroll, delta, trophies:[], title }, requirements(venueId) → [{ text, done, progress }],
//               unlockCheck(), addTrophy(id), addReputation(n, why), title(), dayRoll(now), grantXp(n), travel(regionId)
//   table(F2):  playersSpec(heroPos, POS), stacksFor(), beforeNextHand(stacks) → { stacks, end }, villainOpts(ctx) → { decide } | null,
//               onHandEnd(ctx), sessionEnd(ctx) → html, startSession(venueId, stake, kind), leaveSession()
//   map(F3):    homeCard(jstate, now) → { html, emph } | null, open(params, el), render(el)
//   rivals(F4): roster(venueId, daySeed, state) → [{ name, type, rivalId, hidden, overlay:{ fields } }], line(rivalId, moment, state) → 문장,
//               story(rivalId, state), faces
//   events(F4): today(daySeed, state) → 이벤트 | null, challenges(weekKey) → [], evaluate(item, ctx)
//   tourney(F5): create(spec), onHandEnd(ctx), levelFor(hand), payouts(n), toEngineStacks(), fromEngineStacks(), simOtherTables(level, rnd)
//   balance(F6): 상수 객체(journey/career/balance.js)
//
// ── 파사드 Career(app.js와 journey-ui가 부르는 이름, 고정) ──
//   모듈이 없거나 함수가 없거나 예외가 나면 대체값을 돌려준다: 객체 → null, 불리언 → false, 문자열(html) → ''.
//   available() → core 등록 여부, active() → 진행 중인 커리어 세션이 있나(core.state().session),
//   state(), load(), save() → core / playersSpec, stacksFor, beforeNextHand, villainOpts, onHandEnd, sessionEnd, startSession, leaveSession → table /
//   homeCard, open → map.
//   app.js 훅(P0, 모두 config 'career'일 때만): _buildPlayersSpec → playersSpec(heroPos, POS), selectVillains → stacksFor()(이어 칠 스택),
//   _villainOpts → villainOpts({ state, sessionId, practice })(null이면 기존 VillainAdaptive 경로), nextRound 리바이 전 → beforeNextHand(stacks)
//   (end면 세션 요약, stacks가 있으면 그 스택, null이면 기존 리바이), _showResult 기록 블록 → onHandEnd({ decisions, result, state, net, startStacks,
//   heroPos, sessionId, round, heroFolded }), _renderSessionSummary → sessionEnd({ hands, net, sessionId, stats })의 html을 요약 위에 붙임,
//   showSessionSummary와 showMenu → leaveSession().
//   정산 약속: sessionEnd가 정산하고 세션을 닫는다. leaveSession은 아직 열린 세션만 정산한다(두 번 불러도 한 번만 정산, 멱등).
// 규약: 로드 시 DOM, 저장소 접근 없음. 순수 데이터와 함수만.
var CareerContract = (function() {
  var VERSION = 1;
  var KEY = 'poker_career';
  var CURRENCY = '코인';
  var EVENTS = ['session:start', 'hand:end', 'session:end', 'unlock', 'trophy', 'title', 'day', 'travel', 'story',
    'tourney:level', 'tourney:bust', 'tourney:end', 'lesson:done'];
  var MODULES = ['core', 'table', 'map', 'rivals', 'events', 'tourney', 'balance'];
  var REGIONS = ['harbor', 'riverside', 'highland'];
  var VENUES = ['backyard', 'tavern', 'harbor-room', 'riverside-casino', 'vip-room', 'weekend-sng', 'highroller', 'championship', 'legend'];
  var HOMES = ['studio', 'apartment', 'penthouse'];
  var TITLES = [
    { id: 'newbie', name: '새내기' }, { id: 'patron', name: '단골' }, { id: 'regular', name: '레귤러' }, { id: 'shark', name: '상어' },
    { id: 'highroller', name: '하이롤러' }, { id: 'champion', name: '챔피언' }, { id: 'legend', name: '전설' }
  ];
  var TROPHY_META = {
    'first-session': { icon: '🎟', name: '첫 출근', text: '커리어 세션을 처음 마쳤어요.' },
    'first-win': { icon: '💰', name: '첫 수익', text: '수익을 내고 세션을 마쳤어요.' },
    'cardroom': { icon: '🍺', name: '카드룸 입성', text: '선술집 카드룸에 처음 앉았어요.' },
    'harbor-room': { icon: '⚓', name: '항구의 단골', text: '항구 카드룸에 처음 앉았어요.' },
    'riverside': { icon: '🌉', name: '강변 도시 도착', text: '강변 도시로 처음 여행했어요.' },
    'vip': { icon: '🥂', name: 'VIP 손님', text: '카지노 VIP 룸에 처음 앉았어요.' },
    'highland': { icon: '🏔', name: '고원 리조트 도착', text: '고원 리조트로 처음 여행했어요.' },
    'sng-cash': { icon: '🥉', name: '싯앤고 입상', text: '주말 싯앤고에서 상금을 받았어요.' },
    'sng-win': { icon: '🥇', name: '싯앤고 우승', text: '주말 싯앤고에서 우승했어요.' },
    'mtt-final': { icon: '🎬', name: '파이널 테이블', text: '챔피언십 홀 파이널 테이블에 올랐어요.' },
    'mtt-win': { icon: '🏆', name: '챔피언', text: '챔피언십 홀에서 우승했어요.' },
    'legend-seat': { icon: '🗝', name: '전설의 자리', text: '전설의 테이블에 초대받아 앉았어요.' },
    'bankroll-10k': { icon: '💵', name: '1만 코인', text: '자산이 1만 코인을 넘었어요.' },
    'bankroll-100k': { icon: '💎', name: '10만 코인', text: '자산이 10만 코인을 넘었어요.' },
    'rival-final': { icon: '⚔', name: '결전 승리', text: '라이벌과의 결전 조건을 처음 이뤘어요.' },
    'comeback': { icon: '🌅', name: '재기', text: '후원금을 받은 뒤 다시 수익 세션을 만들었어요.' }
  };
  var TROPHIES = ['first-session', 'first-win', 'cardroom', 'harbor-room', 'riverside', 'vip', 'highland', 'sng-cash', 'sng-win',
    'mtt-final', 'mtt-win', 'legend-seat', 'bankroll-10k', 'bankroll-100k', 'rival-final', 'comeback'];

  var _mods = {};
  var _subs = {};

  function _warn(e) { if (typeof console !== 'undefined' && console && console.warn) console.warn('[Career]', e); }
  function _has(list, x) { return list.indexOf(x) >= 0; }

  function register(name, api) {
    if (!_has(MODULES, name) || !api || typeof api !== 'object') return false;
    _mods[name] = api;
    return true;
  }
  function unregister(name) { if (_mods[name]) { delete _mods[name]; return true; } return false; }
  function mod(name) { return Object.prototype.hasOwnProperty.call(_mods, name) ? _mods[name] : null; }
  function modules() { return MODULES.filter(function(n) { return !!_mods[n]; }); }

  function off(evt, fn) {
    var L = _subs[evt];
    if (!L) return false;
    var i = L.indexOf(fn);
    if (i < 0) return false;
    L.splice(i, 1);
    return true;
  }
  function on(evt, fn) {
    if (!_has(EVENTS, evt) || typeof fn !== 'function') return null;
    var L = _subs[evt] || (_subs[evt] = []);
    L.push(fn);
    return function() { return off(evt, fn); };
  }
  function emit(evt, payload) {
    if (!_has(EVENTS, evt)) return 0;
    var L = (_subs[evt] || []).slice(), n = 0;
    for (var i = 0; i < L.length; i++) {
      try { L[i](payload, evt); n++; } catch (e) { _warn(e); }
    }
    return n;
  }
  // 테스트용: 구독 전부 지우기(evt를 주면 그 이벤트만)
  function _clearSubs(evt) { if (evt) delete _subs[evt]; else _subs = {}; }

  function _iso(now) {
    var t = (typeof now === 'number' && isFinite(now)) ? now : (now instanceof Date ? now.getTime() : Date.now());
    return new Date(t).toISOString();
  }
  function _date(now) {
    if (now instanceof Date) return now;
    return new Date((typeof now === 'number' && isFinite(now)) ? now : Date.now());
  }
  function _p2(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(now) {
    var d = _date(now);
    return d.getFullYear() + '-' + _p2(d.getMonth() + 1) + '-' + _p2(d.getDate());
  }
  // ISO 주(월요일 시작, 그 주 목요일이 속한 해)
  function weekKey(now) {
    var d = _date(now);
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var wd = (t.getDay() + 6) % 7;            // 월 0 ... 일 6
    t.setDate(t.getDate() - wd + 3);          // 그 주 목요일
    var y = t.getFullYear();
    var jan4 = new Date(y, 0, 4);
    var w = 1 + Math.round(((t.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
    return y + '-W' + _p2(w);
  }
  function seedOf(str) {
    var s = String(str == null ? '' : str), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul ? Math.imul(h, 0x01000193) : (h * 0x01000193) | 0; }
    return (h >>> 0) || 1;
  }

  function _startBankroll() {
    var B = mod('balance');
    var n = B && Number(B.START_BANKROLL);
    return (n > 0 && isFinite(n)) ? n : 1000;
  }
  function defaults(now) {
    var at = _iso(now);
    return {
      v: VERSION, createdAt: at, updatedAt: at,
      bankroll: _startBankroll(), reputation: 0, title: TITLES[0].id,
      region: REGIONS[0], venue: VENUES[0], stake: 1,
      unlocked: { regions: [REGIONS[0]], venues: [VENUES[0]] },
      trophies: [],
      property: { home: HOMES[0], items: [] },
      story: {},
      challenges: { weekKey: null, items: [] },
      events: { day: null, id: null, used: false },
      stats: { hands: 0, sessions: 0, wins: 0, bestNet: 0, net: 0, byVenue: {}, byRival: {}, tourney: { played: 0, cashes: 0, wins: 0 } },
      session: null,
      daily: { day: null, stipend: false, travel: false },
      log: [],
      lessons: {}
    };
  }
  function _isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  // 기본값 위에 raw를 얹는다: 기본값이 객체인 필드는 한 단계 더 들어가 채우고, 배열과 값은 타입이 맞을 때만 raw를 쓴다
  // 키 순서: 기본값 키 먼저(스키마 순서), 그다음 raw의 모르는 키
  function _fill(def, raw) {
    if (!_isObj(raw)) return def;
    var out = {}, k;
    for (k in def) {
      if (!Object.prototype.hasOwnProperty.call(def, k)) continue;
      var d = def[k], r = raw[k];
      if (d === null) { out[k] = (r === undefined) ? null : r; continue; }
      if (Array.isArray(d)) { out[k] = Array.isArray(r) ? r : d; continue; }
      if (_isObj(d)) { out[k] = _fill(d, r); continue; }
      out[k] = (typeof r === typeof d && (typeof r !== 'number' || isFinite(r))) ? r : d;
    }
    for (k in raw) if (Object.prototype.hasOwnProperty.call(raw, k) && !Object.prototype.hasOwnProperty.call(def, k)) out[k] = raw[k];
    return out;
  }
  function normalize(raw, now) {
    var def = defaults(now);
    if (!_isObj(raw)) return def;
    var out = _fill(def, raw);
    out.v = VERSION;
    if (!_isObj(out.session)) out.session = null;
    if (out.log.length > 50) out.log = out.log.slice(out.log.length - 50);
    return out;
  }

  var api = {
    VERSION: VERSION, KEY: KEY, CURRENCY: CURRENCY,
    EVENTS: EVENTS.slice(), MODULES: MODULES.slice(), REGIONS: REGIONS.slice(), VENUES: VENUES.slice(), HOMES: HOMES.slice(),
    TITLES: TITLES.map(function(t) { return { id: t.id, name: t.name }; }),
    TROPHIES: TROPHIES.slice(), TROPHY_META: TROPHY_META,
    register: register, unregister: unregister, mod: mod, modules: modules,
    on: on, off: off, emit: emit, _clearSubs: _clearSubs,
    defaults: defaults, normalize: normalize, dayKey: dayKey, weekKey: weekKey, seedOf: seedOf
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();

// 파사드: 모듈이 없을 때도 부르는 쪽이 typeof 가드 하나로 끝나게 한다
var Career = (function() {
  var C = CareerContract;
  function _call(modName, fn, args, fallback) {
    var M = C.mod(modName);
    if (!M || typeof M[fn] !== 'function') return fallback;
    try {
      var r = M[fn].apply(M, args || []);
      return (r === undefined) ? fallback : r;
    } catch (e) {
      if (typeof console !== 'undefined' && console && console.warn) console.warn('[Career] ' + modName + '.' + fn, e);
      return fallback;
    }
  }
  function _str(v) { return typeof v === 'string' ? v : ''; }
  function _bool(v) { return v === true; }

  function available() { return !!C.mod('core'); }
  function state() { return _call('core', 'state', [], null); }
  function active() {
    var s = state();
    return !!(s && typeof s === 'object' && s.session && typeof s.session === 'object');
  }
  function load() { return _call('core', 'load', [], null); }
  function save() { return _bool(_call('core', 'save', [], false)); }

  function playersSpec(heroPos, POS) {
    var r = _call('table', 'playersSpec', [heroPos, POS], null);
    return (Array.isArray(r) && r.length) ? r : null;
  }
  function stacksFor() {
    var r = _call('table', 'stacksFor', [], null);
    return (r && typeof r === 'object') ? r : null;
  }
  function beforeNextHand(stacks) {
    var r = _call('table', 'beforeNextHand', [stacks], null);
    return (r && typeof r === 'object') ? r : null;
  }
  function villainOpts(ctx) {
    var r = _call('table', 'villainOpts', [ctx], null);
    return (r && typeof r === 'object' && typeof r.decide === 'function') ? r : null;
  }
  function onHandEnd(ctx) { return _call('table', 'onHandEnd', [ctx], null); }
  function sessionEnd(ctx) { return _str(_call('table', 'sessionEnd', [ctx], '')); }
  function startSession(venueId, stake, kind) { return _call('table', 'startSession', [venueId, stake, kind], null); }
  function leaveSession() { return _call('table', 'leaveSession', [], null); }

  function homeCard(jstate, now) {
    var r = _call('map', 'homeCard', [jstate, now], null);
    return (r && typeof r === 'object' && typeof r.html === 'string' && r.html) ? r : null;
  }
  function open(params, el) { return _bool(_call('map', 'open', [params, el], false)); }

  var api = {
    available: available, active: active, state: state, load: load, save: save,
    playersSpec: playersSpec, stacksFor: stacksFor, beforeNextHand: beforeNextHand, villainOpts: villainOpts,
    onHandEnd: onHandEnd, sessionEnd: sessionEnd, startSession: startSession, leaveSession: leaveSession,
    homeCard: homeCard, open: open
  };
  return api;
})();
