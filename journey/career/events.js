// journey/career/events.js (채우는 작업: 클라우드 F4 일일 이벤트와 주간 챌린지. 지시문 docs/cloud-tasks/F4.md, 설계 원문 5.1절 5번)
// 계약: journey/career/contract.js 머리 주석의 events 인터페이스. 로드 때 CareerContract.register('events', api).
//
// 일일 이벤트 6종(EVENTS, id 고정): 'happy-hour' 해피아워(바이인 배율 balance.EVENTS.happyHourBuyIn), 'rival' 라이벌 출현(그 라이벌이 오늘 자리에
//   앉는다, rivals.roster가 state.events.rival을 본다), 'fog' 안개 낀 날(모든 좌석 유형 숨김, roster가 state.events.id 'fog'를 본다),
//   'charity' 자선 토너먼트(토너먼트 바이인 절반, 입상하면 평판 보너스), 'highroller' 하이롤러 초청(아직 잠긴 다음 현금 장소에 오늘 1세션 초대),
//   'quiet' 조용한 날(이벤트 없음, today는 null).
//   today(daySeed, state) → { id, name, icon, text, effect } | null. 날짜 시드 = CareerContract.seedOf(CareerContract.dayKey(now)).
//     effect 필드: buyInMult(현금 바이인 배율), rival(라이벌 id), hideAll(true), tourneyBuyInMult, repBonus(입상 평판 보너스), invite(장소 id), sessions(초대 세션 수).
//     상태에 맞지 않는 이벤트는 바꿔 준다(초대할 장소가 없으면 조용한 날, 토너먼트 레슨 전이면 자선은 해피아워, 라이벌 출현은 지금 지역의 라이벌).
//     같은 daySeed와 같은 상태면 같은 결과(결정론). roll(daySeed) → 가중 추첨 id(상태 보정 전).
// 주간 챌린지(CHALLENGES 풀 9개 중 3개, weekKey 시드로 서로 다른 종류): challenges(weekKey) → [{ id, kind, name, text, need, reward:{ coins, rep }, venue? }]
//   evaluate(item, ctx) → { value, need, progress(0~1), done }(순수). ctx는 core F1이 이번 주 집계로 채우는 평범한 객체:
//   { hands, vpipHands, vpipIn, byVenue:{ venueId:{ hands, vpipHands, vpipIn } }, showdownWins, tourneyCashes, sessions, winSessions, rivalHands, netBB, lessons, travels }
//   빠진 값은 0. kind별 값: 'vpip' = venue(있으면 그 장소)에서 hands가 need.hands 이상이고 참여율(vpipIn/vpipHands x 100)이 need.vpipMax 이하,
//   'showdownWins' showdownWins, 'tourneyCash' tourneyCashes, 'sessions' sessions, 'winSessions' winSessions, 'rivalHands' rivalHands,
//   'netBB' netBB, 'lesson' lessons, 'travel' travels. 숫자 kind는 progress = min(1, value / need.n).
// 규약: 로드 시 DOM, 저장소 접근 없음(typeof 가드). 원작 이름, 문구는 쓰지 않는다.
var CareerEvents = (function() {
  var EVENTS = [
    { id: 'happy-hour', name: '해피아워', icon: '🍻', w: 22, text: '오늘은 현금 게임 바이인이 반값이에요. 가볍게 앉아 봐요.' },
    { id: 'rival', name: '라이벌 출현', icon: '⚔', w: 22, text: '오늘 {rival} 님이 이 지역에 와 있어요. 자리에서 만날 수 있어요.' },
    { id: 'fog', name: '안개 낀 날', icon: '🌫', w: 14, text: '안개가 짙어 상대 유형이 보이지 않아요. 핸드로 읽어야 해요.' },
    { id: 'charity', name: '자선 토너먼트', icon: '🎗', w: 12, text: '오늘 토너먼트는 바이인이 절반이고, 입상하면 평판이 더 올라요.' },
    { id: 'highroller', name: '하이롤러 초청', icon: '💌', w: 10, text: '{venue} 초대장이 왔어요. 잠겨 있어도 오늘 한 세션 앉을 수 있어요.' },
    { id: 'quiet', name: '조용한 날', icon: '☕', w: 20, text: '오늘은 특별한 일이 없어요. 평소처럼 쳐요.' }
  ];
  var CHALLENGES = [
    { id: 'home-vpip', kind: 'vpip', name: '홈 게임 단단하게', text: '뒷마당 홈 게임에서 30핸드를 치고 참여율(VPIP)을 25% 이하로 지켜요.',
      need: { hands: 30, vpipMax: 25 }, venue: 'backyard', reward: { coins: 150, rep: 5 } },
    { id: 'showdown-3', kind: 'showdownWins', name: '쇼다운 승 3회', text: '쇼다운까지 가서 3번 이겨요.', need: { n: 3 }, reward: { coins: 120, rep: 4 } },
    { id: 'tourney-cash', kind: 'tourneyCash', name: '토너먼트 입상', text: '토너먼트에서 상금을 1번 받아요.', need: { n: 1 }, reward: { coins: 300, rep: 8 } },
    { id: 'sessions-5', kind: 'sessions', name: '꾸준히 5세션', text: '이번 주에 세션을 5번 마쳐요.', need: { n: 5 }, reward: { coins: 100, rep: 4 } },
    { id: 'win-sessions-2', kind: 'winSessions', name: '수익 세션 2회', text: '수익을 내고 마친 세션을 2번 만들어요.', need: { n: 2 }, reward: { coins: 150, rep: 5 } },
    { id: 'rival-hands-20', kind: 'rivalHands', name: '라이벌과 20핸드', text: '라이벌이 앉은 테이블에서 20핸드를 쳐요.', need: { n: 20 }, reward: { coins: 100, rep: 4 } },
    { id: 'net-50', kind: 'netBB', name: '주간 순이익', text: '이번 주 현금 게임 순이익을 50bb 이상으로 만들어요.', need: { n: 50 }, reward: { coins: 200, rep: 6 } },
    { id: 'lesson-1', kind: 'lesson', name: '커리어 레슨 1편', text: '커리어 레슨을 1편 끝까지 봐요.', need: { n: 1 }, reward: { coins: 80, rep: 3 } },
    { id: 'travel-1', kind: 'travel', name: '여행', text: '다른 지역으로 1번 여행해요.', need: { n: 1 }, reward: { coins: 100, rep: 3 } }
  ];
  var WEEK_N = 3;
  var CASH_ORDER = ['backyard', 'tavern', 'harbor-room', 'riverside-casino', 'vip-room', 'highroller', 'legend'];

  function _cc() { return (typeof CareerContract !== 'undefined' && CareerContract) ? CareerContract : null; }
  function _balance() {
    var C = _cc();
    var B = C && typeof C.mod === 'function' ? C.mod('balance') : null;
    if (!B && typeof CareerBalance !== 'undefined') B = CareerBalance;
    return B || null;
  }
  function _rivals() {
    var C = _cc();
    var R = C && typeof C.mod === 'function' ? C.mod('rivals') : null;
    if (!R && typeof CareerRivals !== 'undefined') R = CareerRivals;
    return R || null;
  }
  function _seedOf(s) {
    var C = _cc();
    if (C && typeof C.seedOf === 'function') return C.seedOf(s);
    var h = 0x811c9dc5; s = String(s == null ? '' : s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0) || 1;
  }
  function _rng(seed) {
    var a = (seed >>> 0) || 1;
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function _isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function _n(x) { x = Number(x); return isFinite(x) ? x : 0; }
  function _meta(id) { for (var i = 0; i < EVENTS.length; i++) if (EVENTS[i].id === id) return EVENTS[i]; return null; }
  function _toSeed(daySeed) { return typeof daySeed === 'number' && isFinite(daySeed) ? (daySeed >>> 0) : _seedOf(String(daySeed == null ? '' : daySeed)); }

  // 가중 추첨(상태 보정 전)
  function roll(daySeed) {
    var rnd = _rng(_toSeed(daySeed) ^ 0x5bd1e995);
    var tot = 0;
    EVENTS.forEach(function(e) { tot += e.w; });
    var x = rnd() * tot;
    for (var i = 0; i < EVENTS.length; i++) { x -= EVENTS[i].w; if (x < 0) return EVENTS[i].id; }
    return EVENTS[EVENTS.length - 1].id;
  }

  function _unlockedVenues(state) {
    var u = state && _isObj(state.unlocked) && Array.isArray(state.unlocked.venues) ? state.unlocked.venues : ['backyard'];
    return u;
  }
  // 초대할 장소: 지금 지역(없으면 전체)의 현금 장소 중 환율 순으로 아직 잠긴 첫 곳(초대 전용 전설의 테이블 제외)
  function _inviteVenue(state) {
    var B = _balance();
    var V = B && _isObj(B.VENUES) ? B.VENUES : null;
    if (!V) return null;
    var unlocked = _unlockedVenues(state);
    var region = state && state.region ? state.region : null;
    var pick = function(onlyRegion) {
      for (var i = 0; i < CASH_ORDER.length; i++) {
        var id = CASH_ORDER[i], v = V[id];
        if (!v || v.kind !== 'cash' || v.inviteOnly) continue;
        if (onlyRegion && region && v.region !== region) continue;
        if (unlocked.indexOf(id) < 0) return id;
      }
      return null;
    };
    return pick(true) || pick(false);
  }
  // 출현 라이벌: 지금 지역에 다니는 라이벌 중 시드로 하나(없으면 전체에서)
  function _rivalFor(daySeed, state) {
    var R = _rivals();
    var all = R && Array.isArray(R.RIVALS) ? R.RIVALS : [];
    if (!all.length) return null;
    var region = state && state.region ? state.region : null;
    var cands = region ? all.filter(function(r) { return Array.isArray(r.regions) && r.regions.indexOf(region) >= 0; }) : [];
    if (!cands.length) cands = all;
    var k = _toSeed(daySeed) % cands.length;
    return cands[k].id;
  }
  function _lessonDone(state, id) {
    return !!(state && _isObj(state.lessons) && state.lessons[id]);
  }

  function today(daySeed, state) {
    var B = _balance();
    var id = roll(daySeed);
    if (id === 'charity' && !_lessonDone(state, 'c-05')) id = 'happy-hour';
    var invite = null;
    if (id === 'highroller') { invite = _inviteVenue(state); if (!invite) id = 'quiet'; }
    if (id === 'quiet') return null;
    var m = _meta(id);
    var ev = { id: m.id, name: m.name, icon: m.icon, text: m.text, effect: {} };
    if (id === 'happy-hour') {
      var mult = B && _isObj(B.EVENTS) ? Number(B.EVENTS.happyHourBuyIn) : NaN;
      ev.effect.buyInMult = (mult > 0 && mult <= 1) ? mult : 0.5;
    } else if (id === 'rival') {
      var rid = _rivalFor(daySeed, state);
      if (!rid) return null;
      ev.effect.rival = rid;
      ev.rival = rid;
      ev.text = m.text.replace('{rival}', rid);
    } else if (id === 'fog') {
      ev.effect.hideAll = true;
    } else if (id === 'charity') {
      ev.effect.tourneyBuyInMult = 0.5;
      ev.effect.repBonus = 5;
    } else if (id === 'highroller') {
      ev.effect.invite = invite;
      ev.effect.sessions = 1;
      var vn = B && B.VENUES && B.VENUES[invite] ? B.VENUES[invite].name : invite;
      ev.text = m.text.replace('{venue}', vn);
    }
    return ev;
  }

  // ── 주간 챌린지 ──
  function challenges(weekKey) {
    var rnd = _rng(_seedOf('week|' + String(weekKey == null ? '' : weekKey)));
    var pool = CHALLENGES.slice(), out = [], kinds = {};
    while (out.length < WEEK_N && pool.length) {
      var k = Math.floor(rnd() * pool.length) % pool.length;
      var c = pool.splice(k, 1)[0];
      if (kinds[c.kind]) continue;
      kinds[c.kind] = true;
      out.push({ id: c.id, kind: c.kind, name: c.name, text: c.text, need: _copyObj(c.need), reward: _copyObj(c.reward), venue: c.venue || null });
    }
    return out;
  }
  function _copyObj(o) { var out = {}; Object.keys(o || {}).forEach(function(k) { out[k] = o[k]; }); return out; }
  var NUM_KIND = { showdownWins: 'showdownWins', tourneyCash: 'tourneyCashes', sessions: 'sessions', winSessions: 'winSessions',
    rivalHands: 'rivalHands', netBB: 'netBB', lesson: 'lessons', travel: 'travels' };
  function evaluate(item, ctx) {
    ctx = _isObj(ctx) ? ctx : {};
    if (!_isObj(item) || !item.kind) return { value: 0, need: 0, progress: 0, done: false };
    var need = _isObj(item.need) ? item.need : {};
    if (item.kind === 'vpip') {
      var src = ctx;
      if (item.venue && _isObj(ctx.byVenue) && _isObj(ctx.byVenue[item.venue])) src = ctx.byVenue[item.venue];
      else if (item.venue) src = {};
      var hands = _n(src.hands), vh = _n(src.vpipHands), vi = _n(src.vpipIn);
      var rate = vh > 0 ? vi / vh * 100 : 0;
      var needH = Math.max(1, _n(need.hands)), maxV = _n(need.vpipMax);
      var ok = hands >= needH && vh > 0 && rate <= maxV;
      return { value: hands, need: needH, vpip: Math.round(rate * 10) / 10, progress: ok ? 1 : Math.min(0.99, Math.round(Math.min(1, hands / needH) * 100) / 100), done: ok };
    }
    var key = NUM_KIND[item.kind];
    if (!key) return { value: 0, need: 0, progress: 0, done: false };
    var v = _n(ctx[key]), n = Math.max(1, _n(need.n));
    var p = Math.max(0, Math.min(1, v / n));
    return { value: v, need: n, progress: Math.round(p * 100) / 100, done: v >= n };
  }

  var api = { EVENTS: EVENTS, CHALLENGES: CHALLENGES, WEEK_N: WEEK_N, roll: roll, today: today, challenges: challenges, evaluate: evaluate };
  if (typeof CareerContract !== 'undefined' && CareerContract && typeof CareerContract.register === 'function') CareerContract.register('events', api);
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
