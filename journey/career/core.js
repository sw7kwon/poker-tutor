// journey/career/core.js (클라우드 F1: 커리어 코어. 상태, 경제, 해금, 트로피, 평판과 칭호, 하루 처리, XP, 여행. 지시문 docs/cloud-tasks/F1.md)
// 계약: journey/career/contract.js 머리 주석의 core 인터페이스. 로드 끝에 CareerContract.register('core', api).
// 수치는 전부 balance.js(CareerContract.mod('balance'))에서 읽는다(하드코딩 없음). 날짜 키와 시드는 CareerContract.dayKey, weekKey, seedOf.
//
// ── 규칙 요약 ──
//   바이인(코인): 현금 게임 = BUYIN_BB x venue.rate x stake(STAKES 안의 값만), 토너먼트(sng, mtt) = venue.buyIn(스테이크 없음, stake 1로 기록).
//   canAfford(venueId, stake) = 장소가 열려 있고 자산 >= 바이인. buyIn(venueId, stake, kind)은 세션이 없을 때만: 자산에서 바이인을 빼고 session을 만든다.
//     session { kind, venue, stake, buyIn, startedAt, hands, stack(bb: 현금 BUYIN_BB, 토너먼트 TOURNEY.START_BB), roster:[], tourney:{} }. 이벤트 'session:start'.
//   settle(result{ net(코인), hands, bust, tourney? }) = 자산 += buyIn + net. net은 -buyIn 아래로 못 내려간다(바이인보다 더 잃지 않음), bust이고 net이 없으면 -buyIn.
//     토너먼트는 net = 상금 - 바이인, tourney { place, n, prize? }. 입상(place가 상금 자리 안)이면 tourney.cashes, 1등이면 wins.
//     통계와 로그 갱신, 평판(REP.session, 수익이면 +REP.winSession, 입상 +REP.tourneyCash, 우승은 +REP.tourneyWin), XP(XP.session, 입상 +XP.tourneyCash),
//     트로피 판정, unlockCheck. 세션은 닫힌다(session = null). 이벤트 'session:end'. 세션이 없으면 { bankroll, delta:0, trophies:[], title }(멱등).
//   requirements(venueId) → [{ kind, text, done, progress 0~1 }]: 자산(unlock.bankroll), 평판(unlock.rep), 여정 단계(unlock.stage, Journey.summary().stage),
//     커리어 레슨(unlock.lesson, lessons[id]). 장소의 지역이 아직 잠겨 있으면 지역 조건 줄이 앞에 붙는다. 0이거나 null인 조건은 줄을 만들지 않는다.
//   unlockCheck() = 지역 먼저, 그다음 장소(지역이 열려야 장소가 열린다). 새로 열린 것마다 이벤트 'unlock' { kind, id }와 로그. 열린 것은 닫히지 않는다.
//   addTrophy(id) = TROPHIES에 있고 아직 없으면 trophies에 { id, at }, 평판 +REP.trophy, 이벤트 'trophy', 로그. 이미 있거나 모르는 id면 false.
//   addReputation(n, why) = 평판 += n(0 아래로 안 내려감). 칭호가 바뀌면 이벤트 'title' { from, to }와 로그. why가 있으면 로그 한 줄.
//   title() = TITLE_REP(오름차순) 중 평판이 넘는 가장 높은 단계의 TITLES id(7단계).
//   dayRoll(now) = 날짜가 바뀌면 daily를 새 날로(stipend, travel, xp 리셋). 후원금: 그날 아직 안 받았고 세션 중이 아니고 자산이 열린 장소 중 가장 싼 바이인
//     (1배 스테이크)보다 적으면 STIPEND + HOME_STIPEND_BONUS[집]을 준다(하루 1회). 날짜가 바뀌었거나 후원금을 줬으면 이벤트 'day' { day, stipend }.
//     (웨이브1 통합) 오늘 이벤트(events.today, 날짜 시드)를 state.events { day, id, used, name, icon, text, effect, rival?, invite? }에 적는다
//     (하루 1회, 조용한 날은 id 'quiet'. 그날 안에서는 상태가 바뀌어도 적어 둔 이벤트가 그대로).
//     rivals.roster가 state.events를 읽어 라이벌 출현과 안개 낀 날을 좌석에 반영한다. dayRoll은 지도 화면 진입(map open)과 세션 시작(table)이 부른다.
//   주간 챌린지(웨이브1 통합): challenges { weekKey, items:[{ id, progress, done }], ctx }. 주가 바뀌면 events.challenges(weekKey) 3개로 새로 만든다.
//     ctx는 events.evaluate가 읽는 이번 주 집계(hands, vpipHands, vpipIn, byVenue, showdownWins, tourneyCashes, sessions, winSessions, rivalHands,
//     netBB(현금 게임만), lessons, travels). hand:end, settle, 레슨 첫 완료, 여행 때 올리고, progress는 evaluate의 value(개수, 지도가 n/목표로 보임,
//     참여율 챌린지는 끝나기 전에는 목표 - 1까지만). 처음 끝낸 챌린지는 보상(코인, 평판)과 로그 1줄(하루, 주 단위로 한 번).
//   오늘 이벤트 효과(웨이브1 통합, 오늘 날짜의 state.events만): 해피아워 = 현금 바이인 x effect.buyInMult, 자선 토너먼트 = 토너먼트 바이인 x tourneyBuyInMult와
//     입상 평판 +repBonus, 하이롤러 초청 = 잠긴 초대 장소(invite)에 오늘 1세션 바이인 허용(바이인 때 used = true). todayEvent() → 오늘 이벤트 객체 | null.
//   grantXp(n) = 오늘 준 합계(daily.xp)가 XP_DAY_CAP을 넘지 않게 잘라 Journey.addXp('career', n). Journey가 없으면 세기만 한다. → { granted, capped }
//   travel(regionId) → { ok, cost, reason? }: 열린 지역, 지금 있는 지역이 아님, 세션 중 아님, 오늘 여행 안 함, 자산 >= TRAVEL_COST[지역]이면 이동.
//     region을 바꾸고 venue는 그 지역의 첫 열린 장소로, 비용을 빼고 daily.travel = true, 이벤트 'travel' { from, to, cost }. 여행 트로피 판정.
//   이벤트 수신: 'hand:end' { venue, netCoins, rivals:[rivalId], won } → stats.hands, byVenue[venue].hands, byRival[id](hands, net, met = 함께 앉은 세션 수),
//     session.hands. 이긴 핸드면 XP.winHand. 'lesson:done' { id } → lessons[id] = 완료 시각(처음만), 로그, unlockCheck.
//     'story' { rivalId, stage } → story[rivalId]는 stage 큰 쪽, 단계가 오를 때마다 REP.story, 3단계(결전)면 'rival-final' 트로피.
//     'session:end'는 settle이 보내는 이벤트라 받지 않는다(이중 집계 방지). 구독은 첫 load()와 buyIn()에서 세운다(로드 시점에는 안 한다).
//   트로피 판정 trophyCheck(state, ctx) → 새로 받을 id 배열(순수, 상태를 바꾸지 않는다). ctx { kind:'session'|'travel'|'story', venue, venueKind, net, bust,
//     tourney:{ place, n }, stipendSince, region, rivalFinal }. 규칙은 TROPHY_RULES(16종).
//   로그 log[{ at, kind, text, delta? }]는 최근 50개(LOG_CAP). stats.wins = 수익 세션 수, stats.net = 세션 순손익 합, bestNet = 세션 최고 순익.
// 저장: load()는 CareerContract.KEY를 읽어 normalize 뒤 캐시. save()는 쓰기 실패 때 _unsaved = true로 메모리 캐시를 지킨다(Journey와 같은 규칙).
//   _invalidate()는 마지막 저장이 성공했을 때만 캐시를 비운다(다른 창이 바꾼 뒤 다시 읽기).
// 규약: 로드 시 DOM, localStorage, navigator 접근 없음(전부 함수 안 typeof 가드). 테스트 주입 _setStore(s | false | null), _setNow(fn | null).
var CareerCore = (function() {
  var LOG_CAP = 50;
  var _cache = null;        // 상태 캐시
  var _unsaved = false;     // 마지막 저장 실패(메모리만 최신)
  var _storeOver = null;    // 테스트 주입 저장소(false = 저장소 없음)
  var _nowOver = null;      // 테스트 주입 시계
  var _xpLog = [];          // Journey가 없을 때 grantXp 기록(테스트용)
  var _subs = [];           // 버스 구독 해제 함수(첫 load()와 buyIn()에서 세운다)

  function _C() { return (typeof CareerContract !== 'undefined' && CareerContract) ? CareerContract : null; }
  function _B() { var C = _C(); return (C && C.mod('balance')) || ((typeof CareerBalance !== 'undefined') ? CareerBalance : null); }
  function _isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function _num(x, d) { x = Number(x); return isFinite(x) ? x : d; }
  function _warn(e) { try { if (typeof console !== 'undefined' && console && console.warn) console.warn('[CareerCore]', (e && e.message) || e); } catch (x) {} }
  function _now() {
    if (typeof _nowOver === 'function') { var t = Number(_nowOver()); if (isFinite(t)) return t; }
    return Date.now();
  }
  function _ms(now) { return (typeof now === 'number' && isFinite(now)) ? now : (now instanceof Date ? now.getTime() : _now()); }
  function _iso(t) { return new Date(t).toISOString(); }
  function _emit(evt, payload) { var C = _C(); if (C) { try { C.emit(evt, payload); } catch (e) { _warn(e); } } }
  function _dayKey(t) { var C = _C(); return C ? C.dayKey(t) : _iso(t).slice(0, 10); }

  // ── 저장소 ──
  function _store() {
    if (_storeOver === false) return null;
    if (_storeOver) return _storeOver;
    try { return (typeof localStorage !== 'undefined' && localStorage) ? localStorage : null; } catch (e) { return null; }
  }
  function _readRaw() {
    var s = _store(), C = _C(); if (!s || !C) return null;
    try { var raw = s.getItem(C.KEY); return raw == null ? null : JSON.parse(raw); } catch (e) { return null; }
  }
  function load() {
    if (_cache) return _cache;
    var C = _C();
    if (!C) return null;
    _cache = _fixup(C.normalize(_readRaw(), _now()));
    if (!_subs.length) _subscribe();
    return _cache;
  }
  function _st() { return _cache || load(); }
  function save() {
    var C = _C();
    if (!_cache || !C) return false;
    _cache.updatedAt = _iso(_now());
    var s = _store();
    if (!s) { _unsaved = true; return false; }
    try { s.setItem(C.KEY, JSON.stringify(_cache)); _unsaved = false; return true; }
    catch (e) { _unsaved = true; return false; }
  }
  function reset() {
    _cache = null; _unsaved = false; _xpLog = [];
    var s = _store(), C = _C();
    if (s && C) { try { s.removeItem(C.KEY); } catch (e) {} }
    return load();
  }
  function state() { return _st(); }
  function _invalidate() { if (!_unsaved) _cache = null; }
  // normalize가 못 채우는 정합: 첫 지역과 첫 장소는 늘 열려 있고, 자산과 평판은 0 이상, 칭호는 평판과 맞춘다
  function _fixup(st) {
    var C = _C();
    if (!C) return st;
    if (st.unlocked.regions.indexOf(C.REGIONS[0]) < 0) st.unlocked.regions.unshift(C.REGIONS[0]);
    if (st.unlocked.venues.indexOf(C.VENUES[0]) < 0) st.unlocked.venues.unshift(C.VENUES[0]);
    if (st.bankroll < 0) st.bankroll = 0;
    if (st.reputation < 0) st.reputation = 0;
    st.title = _titleFor(st.reputation);
    return st;
  }

  // ── balance 조회 ──
  function _venue(id) { var B = _B(); return (B && _isObj(B.VENUES) && _isObj(B.VENUES[id])) ? B.VENUES[id] : null; }
  function _region(id) { var B = _B(); return (B && _isObj(B.REGIONS) && _isObj(B.REGIONS[id])) ? B.REGIONS[id] : null; }
  function _stakes() { var B = _B(); return (B && Array.isArray(B.STAKES) && B.STAKES.length) ? B.STAKES : [1]; }
  function _rep(k) { var B = _B(); return (B && _isObj(B.REP)) ? _num(B.REP[k], 0) : 0; }
  function _xp(k) { var B = _B(); return (B && _isObj(B.XP)) ? _num(B.XP[k], 0) : 0; }
  function _isTourney(v) { return !!v && (v.kind === 'sng' || v.kind === 'mtt'); }
  // 바이인(코인). 현금 게임은 BUYIN_BB x rate x stake, 토너먼트는 고정 buyIn. 모르는 장소나 스테이크면 null
  // (웨이브1 통합) 오늘 이벤트 할인(해피아워, 자선)을 곱한다. 후원금 기준(_cheapestOpen)은 할인 전 값(_baseCost)
  function buyInCost(venueId, stake) { return _baseCost(venueId, stake, true); }
  function _baseCost(venueId, stake, withEvent) {
    var v = _venue(venueId), B = _B();
    if (!v || !B) return null;
    var mult = (withEvent && _cache) ? _evMult(v, _cache) : 1;
    if (_isTourney(v)) return _num(v.buyIn, 0) > 0 ? Math.round(_num(v.buyIn, 0) * mult * 100) / 100 : null;
    stake = _num(stake, 1);
    if (_stakes().indexOf(stake) < 0) return null;
    var c = Math.round(_num(B.BUYIN_BB, 0) * _num(v.rate, 0) * stake * mult * 100) / 100;
    return c > 0 ? c : null;
  }
  // (웨이브1 통합) 오늘 이벤트: state.events가 오늘 날짜면 적어 둔 그대로 { id, name, icon, text, effect, used }(그날 상태가 바뀌어도 같은 이벤트). 아니면 null
  function _evMod() { var C = _C(); return C ? C.mod('events') : null; }
  function todayEvent(st, now) {
    st = st || _st();
    var E = st && st.events;
    if (!_isObj(E) || E.day !== _dayKey(_ms(now)) || !E.id || E.id === 'quiet') return null;
    var eff = _isObj(E.effect) ? E.effect : {};
    var out = { id: E.id, name: String(E.name || ''), icon: String(E.icon || ''), text: String(E.text || ''), effect: {}, used: E.used === true };
    Object.keys(eff).forEach(function(k) { out.effect[k] = eff[k]; });
    if (E.rival && out.effect.rival == null) out.effect.rival = E.rival;
    if (E.invite && out.effect.invite == null) out.effect.invite = E.invite;
    return out;
  }
  // 오늘 이벤트의 바이인 배율(해피아워는 현금, 자선은 토너먼트). 없으면 1
  function _evMult(v, st) {
    var ev = st ? todayEvent(st) : null;
    if (!ev || !v) return 1;
    var m = _isTourney(v) ? _num(ev.effect.tourneyBuyInMult, 1) : _num(ev.effect.buyInMult, 1);
    return (m > 0 && m <= 1) ? m : 1;
  }
  // 하이롤러 초청: 오늘 아직 쓰지 않은 초대 장소면 true
  function _invited(st, venueId) {
    var ev = todayEvent(st);
    return !!(ev && ev.id === 'highroller' && ev.effect.invite === venueId && !ev.used);
  }
  // 열린 장소 중 가장 싼 바이인(1배 스테이크). 후원금 기준
  function _cheapestOpen(st) {
    var best = null;
    st.unlocked.venues.forEach(function(id) {
      var c = _baseCost(id, _stakes()[0], false);
      if (c !== null && (best === null || c < best)) best = c;
    });
    return best;
  }

  // ── 로그와 문구 ──
  function _log(st, kind, text, delta) {
    var e = { at: _iso(_now()), kind: kind, text: text };
    if (typeof delta === 'number' && isFinite(delta) && delta !== 0) e.delta = delta;
    st.log.push(e);
    if (st.log.length > LOG_CAP) st.log.splice(0, st.log.length - LOG_CAP);
    return e;
  }
  function _coins(n) {
    var s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '-' : '') + s + '코인';
  }
  function _signed(n) { return (n >= 0 ? '+' : '') + _coins(n); }
  function _vname(id) { var v = _venue(id); return v ? v.name : id; }
  function _rname(id) { var r = _region(id); return r ? r.name : id; }

  // ── 칭호와 평판 ──
  function _titleFor(rep) {
    var C = _C(), B = _B();
    if (!C) return 'newbie';
    var th = (B && Array.isArray(B.TITLE_REP)) ? B.TITLE_REP : [0];
    var idx = 0;
    for (var i = 0; i < C.TITLES.length && i < th.length; i++) if (_num(rep, 0) >= _num(th[i], Infinity)) idx = i;
    return C.TITLES[idx].id;
  }
  function _titleName(id) {
    var C = _C();
    for (var i = 0; C && i < C.TITLES.length; i++) if (C.TITLES[i].id === id) return C.TITLES[i].name;
    return id;
  }
  function title() { return _titleFor(_st().reputation); }
  // 공개 함수는 저장까지 한다. settle, travel, 이벤트 수신은 내부 _addRep, _addTrophy를 쓰고 끝에 한 번 저장한다
  function addReputation(n, why) {
    var st = _st(), r = _addRep(st, n, why);
    save();
    return r;
  }
  function _addRep(st, n, why) {
    n = _num(n, 0);
    if (!n) return st.reputation;
    var from = st.title;
    st.reputation = Math.max(0, st.reputation + n);
    if (why) _log(st, 'rep', '평판 ' + (n > 0 ? '+' : '') + n + ', ' + why);
    var to = _titleFor(st.reputation);
    if (to !== from) {
      st.title = to;
      _log(st, 'title', '칭호가 ' + _titleName(from) + '에서 ' + _titleName(to) + '(으)로 바뀌었어요');
      _emit('title', { from: from, to: to });
    }
    return st.reputation;
  }

  // ── 트로피 ──
  function _place(c) { return _isObj(c.tourney) ? _num(c.tourney.place, 0) : 0; }
  // 상금 자리 수: ctx.tourney.payouts > 장소 payouts > TOURNEY.PAYOUTS[n] > 3
  function _paid(c) {
    if (_isObj(c.tourney) && Array.isArray(c.tourney.payouts)) return c.tourney.payouts.length;
    var v = _venue(c.venue);
    if (v && Array.isArray(v.payouts)) return v.payouts.length;
    var B = _B(), n = _isObj(c.tourney) ? _num(c.tourney.n, 0) : 0;
    if (B && _isObj(B.TOURNEY) && _isObj(B.TOURNEY.PAYOUTS) && Array.isArray(B.TOURNEY.PAYOUTS[n])) return B.TOURNEY.PAYOUTS[n].length;
    return 3;
  }
  function _cashed(c) { var p = _place(c); return p > 0 && p <= _paid(c); }
  function _finalSize() { var B = _B(); return (B && _isObj(B.TOURNEY)) ? _num(B.TOURNEY.TABLE_SIZE, 6) : 6; }
  // 순수 판정 규칙(state, ctx) → true면 받는다
  var TROPHY_RULES = {
    'first-session': function(st, c) { return c.kind === 'session'; },
    'first-win': function(st, c) { return c.kind === 'session' && c.net > 0; },
    'cardroom': function(st, c) { return c.kind === 'session' && c.venue === 'tavern'; },
    'harbor-room': function(st, c) { return c.kind === 'session' && c.venue === 'harbor-room'; },
    'riverside': function(st, c) { return c.kind === 'travel' && c.region === 'riverside'; },
    'vip': function(st, c) { return c.kind === 'session' && c.venue === 'vip-room'; },
    'highland': function(st, c) { return c.kind === 'travel' && c.region === 'highland'; },
    'sng-cash': function(st, c) { return c.kind === 'session' && c.venueKind === 'sng' && _cashed(c); },
    'sng-win': function(st, c) { return c.kind === 'session' && c.venueKind === 'sng' && _place(c) === 1; },
    'mtt-final': function(st, c) { return c.kind === 'session' && c.venueKind === 'mtt' && _place(c) > 0 && _place(c) <= _finalSize(); },
    'mtt-win': function(st, c) { return c.kind === 'session' && c.venueKind === 'mtt' && _place(c) === 1; },
    'legend-seat': function(st, c) { return c.kind === 'session' && c.venue === 'legend'; },
    'bankroll-10k': function(st, c) { return st.bankroll >= 10000; },
    'bankroll-100k': function(st, c) { return st.bankroll >= 100000; },
    'rival-final': function(st, c) { return c.rivalFinal === true; },
    'comeback': function(st, c) { return c.kind === 'session' && c.net > 0 && c.stipendSince === true; }
  };
  function _hasTrophy(st, id) {
    for (var i = 0; i < st.trophies.length; i++) if (_isObj(st.trophies[i]) && st.trophies[i].id === id) return true;
    return false;
  }
  // 순수: 아직 없는 트로피 중 조건을 채운 id 목록(TROPHIES 순서). state와 ctx를 바꾸지 않는다
  function trophyCheck(st, ctx) {
    var C = _C();
    if (!C || !_isObj(st) || !Array.isArray(st.trophies)) return [];
    ctx = _isObj(ctx) ? ctx : {};
    var out = [];
    C.TROPHIES.forEach(function(id) {
      var rule = TROPHY_RULES[id];
      if (!rule || _hasTrophy(st, id)) return;
      try { if (rule(st, ctx) === true) out.push(id); } catch (e) { _warn(e); }
    });
    return out;
  }
  function addTrophy(id) {
    var ok = _addTrophy(_st(), id);
    if (ok) save();
    return ok;
  }
  function _addTrophy(st, id) {
    var C = _C();
    if (!C || C.TROPHIES.indexOf(id) < 0 || _hasTrophy(st, id)) return false;
    st.trophies.push({ id: id, at: _iso(_now()) });
    var m = C.TROPHY_META[id];
    _log(st, 'trophy', '트로피 ' + (m ? m.icon + ' ' + m.name : id) + '을(를) 받았어요');
    _addRep(st, _rep('trophy'), null);
    _emit('trophy', { id: id });
    return true;
  }
  function _grantTrophies(st, ctx) {
    var out = [];
    trophyCheck(st, ctx).forEach(function(id) { if (_addTrophy(st, id)) out.push(id); });
    return out;
  }

  // ── 해금 ──
  function _journeyStage() {
    if (typeof Journey === 'undefined' || !Journey || typeof Journey.summary !== 'function') return 0;
    try { var s = Journey.summary(); return _num(s && s.stage, 0); } catch (e) { return 0; }
  }
  function _lessonDone(st, id) { return !!id && _isObj(st.lessons) && st.lessons[id] != null; }
  function _lessonName(id) {
    if (typeof CAREER_LESSONS !== 'undefined' && Array.isArray(CAREER_LESSONS)) {
      for (var i = 0; i < CAREER_LESSONS.length; i++) if (CAREER_LESSONS[i] && CAREER_LESSONS[i].id === id) return CAREER_LESSONS[i].title || id;
    }
    return id;
  }
  function _ratio(have, need) { return need > 0 ? Math.max(0, Math.min(1, have / need)) : 1; }
  // unlock 조건 객체 → 조건 줄 목록
  function _reqLines(st, unlock, label) {
    var out = [];
    if (!_isObj(unlock)) return out;
    var br = _num(unlock.bankroll, 0), rep = _num(unlock.rep, 0), stage = _num(unlock.stage, 0), lesson = unlock.lesson || null;
    if (br > 0) out.push({ kind: 'bankroll', text: label + '자산 ' + _coins(br) + ' 이상', done: st.bankroll >= br, progress: _ratio(st.bankroll, br) });
    if (rep > 0) out.push({ kind: 'rep', text: label + '평판 ' + rep + ' 이상', done: st.reputation >= rep, progress: _ratio(st.reputation, rep) });
    if (stage > 0) {
      var js = _journeyStage();
      out.push({ kind: 'stage', text: label + '여정 ' + stage + '단계 이상', done: js >= stage, progress: _ratio(js, stage) });
    }
    if (lesson) {
      var ld = _lessonDone(st, lesson);
      out.push({ kind: 'lesson', text: label + '레슨 ' + _lessonName(lesson) + ' 완료', done: ld, progress: ld ? 1 : 0 });
    }
    return out;
  }
  function _allDone(lines) { for (var i = 0; i < lines.length; i++) if (!lines[i].done) return false; return true; }
  function requirements(venueId) {
    var st = _st(), v = _venue(venueId);
    if (!v) return [];
    var lines = [], r = _region(v.region);
    if (r && st.unlocked.regions.indexOf(v.region) < 0) lines = _reqLines(st, r.unlock, _rname(v.region) + ' 지역: ');
    return lines.concat(_reqLines(st, v.unlock, ''));
  }
  function regionRequirements(regionId) {
    var r = _region(regionId);
    return r ? _reqLines(_st(), r.unlock, '') : [];
  }
  function unlockCheck() {
    var C = _C(), st = _st();
    if (!C) return [];
    var opened = [];
    C.REGIONS.forEach(function(id) {
      if (st.unlocked.regions.indexOf(id) >= 0) return;
      var r = _region(id);
      if (!r || !_allDone(_reqLines(st, r.unlock, ''))) return;
      st.unlocked.regions.push(id);
      opened.push({ kind: 'region', id: id });
      _log(st, 'unlock', _rname(id) + ' 지역이 열렸어요');
    });
    C.VENUES.forEach(function(id) {
      if (st.unlocked.venues.indexOf(id) >= 0) return;
      var v = _venue(id);
      if (!v || st.unlocked.regions.indexOf(v.region) < 0 || !_allDone(_reqLines(st, v.unlock, ''))) return;
      st.unlocked.venues.push(id);
      opened.push({ kind: 'venue', id: id });
      _log(st, 'unlock', _vname(id) + '이(가) 열렸어요');
    });
    opened.forEach(function(u) { _emit('unlock', u); });
    return opened;
  }

  // ── 경제: 바이인과 정산 ──
  function canAfford(venueId, stake) {
    var st = _st(), cost = buyInCost(venueId, stake);
    if (cost === null || (st.unlocked.venues.indexOf(venueId) < 0 && !_invited(st, venueId))) return false;
    return st.bankroll >= cost;
  }
  function buyIn(venueId, stake, kind) {
    var st = _st(), v = _venue(venueId), B = _B();
    if (!v || !B) return { error: '모르는 장소예요' };
    if (st.session) return { error: '아직 진행 중인 세션이 있어요. 먼저 정산해 주세요' };
    var invited = st.unlocked.venues.indexOf(venueId) < 0 && _invited(st, venueId);
    if (st.unlocked.venues.indexOf(venueId) < 0 && !invited) return { error: _vname(venueId) + '은(는) 아직 잠겨 있어요' };
    var tourney = _isTourney(v);
    stake = tourney ? 1 : _num(stake, 1);
    if (!tourney && _stakes().indexOf(stake) < 0) return { error: '고를 수 없는 스테이크예요' };
    var k = tourney ? v.kind : 'cash';
    if (kind && kind !== k) return { error: '이 장소는 ' + (tourney ? '토너먼트' : '현금 게임') + ' 전용이에요' };
    var cost = buyInCost(venueId, stake);
    if (cost === null) return { error: '바이인을 계산할 수 없어요' };
    if (st.bankroll < cost) return { error: '코인이 부족해요(바이인 ' + _coins(cost) + ', 자산 ' + _coins(st.bankroll) + ')' };
    st.bankroll -= cost;
    if (invited) st.events.used = true;      // (웨이브1 통합) 초대는 1세션
    if (!invited) st.venue = venueId;        // 초대 장소는 지금 있는 곳을 바꾸지 않는다(잠긴 장소)
    st.stake = stake;
    if (v.region && st.unlocked.regions.indexOf(v.region) >= 0) st.region = v.region;
    st.session = { kind: k, venue: venueId, stake: stake, buyIn: cost, startedAt: _iso(_now()), hands: 0,
      stack: tourney ? _num(B.TOURNEY && B.TOURNEY.START_BB, 50) : _num(B.BUYIN_BB, 100), roster: [], tourney: {} };
    _log(st, 'buyin', _vname(venueId) + ' x' + stake + ' 바이인', -cost);
    _subscribe();
    save();
    _emit('session:start', { session: st.session });
    return st.session;
  }
  function _venueStat(st, venueId) {
    var bv = st.stats.byVenue[venueId];
    if (!_isObj(bv)) bv = st.stats.byVenue[venueId] = { hands: 0, sessions: 0, net: 0 };
    bv.hands = _num(bv.hands, 0); bv.sessions = _num(bv.sessions, 0); bv.net = _num(bv.net, 0);
    return bv;
  }
  function settle(result) {
    var st = _st();
    var ses = st.session;
    if (!_isObj(ses)) return { bankroll: st.bankroll, delta: 0, trophies: [], title: st.title };
    result = _isObj(result) ? result : {};
    var v = _venue(ses.venue);
    var buy = _num(ses.buyIn, 0);
    var bust = result.bust === true;
    var tour = _isObj(result.tourney) ? result.tourney : null;
    var net = (result.net == null && bust) ? -buy : _num(result.net, 0);
    if (net < -buy) net = -buy;
    var counted = Math.max(0, Math.floor(_num(ses.hands, 0)));                  // hand:end로 이미 센 핸드
    var hands = Math.max(counted, Math.floor(_num(result.hands, 0)));
    var extra = hands - counted;
    var back = buy + net;
    st.bankroll += back;
    var delta = net;
    // 통계
    st.stats.sessions += 1;
    st.stats.net = _num(st.stats.net, 0) + delta;
    if (delta > 0) st.stats.wins += 1;
    if (delta > _num(st.stats.bestNet, 0)) st.stats.bestNet = delta;
    if (extra > 0) st.stats.hands += extra;
    var bv = _venueStat(st, ses.venue);
    bv.hands += extra; bv.sessions += 1; bv.net += delta;
    var ctx = { kind: 'session', venue: ses.venue, venueKind: v ? v.kind : ses.kind, net: delta, won: delta > 0, bust: bust, tourney: tour,
      stipendSince: st.daily.comebackPending === true };
    var cashed = !!tour && _cashed(ctx);
    if (tour) {
      st.stats.tourney.played += 1;
      if (cashed) st.stats.tourney.cashes += 1;
      if (_place(ctx) === 1) st.stats.tourney.wins += 1;
    }
    _log(st, 'session', _vname(ses.venue) + ' 세션 끝(' + hands + '핸드), ' + _signed(delta), delta);
    if (bust) _log(st, 'bust', '칩을 다 잃었어요. 자산이 바이인보다 적으면 하루 한 번 후원금을 받아요');
    st.session = null;
    // 평판과 XP
    _addRep(st, _rep('session') + (delta > 0 ? _rep('winSession') : 0), null);
    if (cashed) _addRep(st, _place(ctx) === 1 ? _rep('tourneyWin') : _rep('tourneyCash'), null);
    var tev = cashed ? todayEvent(st) : null;   // (웨이브1 통합) 자선 토너먼트 입상 평판 보너스
    if (tev && tev.id === 'charity' && _num(tev.effect.repBonus, 0) > 0) _addRep(st, _num(tev.effect.repBonus, 0), '자선 토너먼트 입상 보너스');
    grantXp(_xp('session') + (cashed ? _xp('tourneyCash') : 0));
    var trophies = _grantTrophies(st, ctx);
    if (delta > 0 && st.daily.comebackPending) st.daily.comebackPending = false;
    _weeklyBump(st, function(c) { _inc(c, 'sessions'); if (delta > 0) _inc(c, 'winSessions'); if (cashed) _inc(c, 'tourneyCashes'); });   // (웨이브1 통합) 주간 챌린지
    unlockCheck();
    save();
    _emit('session:end', { session: ses, netCoins: delta, hands: hands, bust: bust });
    return { bankroll: st.bankroll, delta: delta, trophies: trophies, title: st.title };
  }

  // ── 하루 처리, XP, 여행 ──
  function _rollDay(st, day) {
    if (st.daily.day === day) return false;
    st.daily.day = day; st.daily.stipend = false; st.daily.travel = false; st.daily.xp = 0;
    return true;
  }
  function dayRoll(now) {
    var st = _st(), B = _B();
    var t = _ms(now), day = _dayKey(t);
    var changed = _rollDay(st, day);
    var stipend = 0;
    if (!_isObj(st.events) || st.events.day !== day) {   // (웨이브1 통합) 오늘 이벤트를 하루 1회 적는다
      var M = _evMod(), C = _C(), ev = null;
      if (M && typeof M.today === 'function' && C) { try { ev = M.today(C.seedOf(day), st); } catch (e) { _warn(e); ev = null; } }
      var rec = { day: day, id: _isObj(ev) && ev.id ? ev.id : 'quiet', used: false };
      if (_isObj(ev)) {
        rec.name = String(ev.name || ''); rec.icon = String(ev.icon || ''); rec.text = String(ev.text || '');
        rec.effect = {};
        if (_isObj(ev.effect)) Object.keys(ev.effect).forEach(function(k) { rec.effect[k] = ev.effect[k]; });
        if (rec.effect.rival) rec.rival = rec.effect.rival;
        if (rec.effect.invite) rec.invite = rec.effect.invite;
      }
      st.events = rec;
      changed = true;
    }
    if (!st.daily.stipend && !st.session && B) {
      var cheapest = _cheapestOpen(st);
      if (cheapest !== null && st.bankroll < cheapest) {
        var home = (st.property && st.property.home) || 'studio';
        stipend = _num(B.STIPEND, 0) + (_isObj(B.HOME_STIPEND_BONUS) ? _num(B.HOME_STIPEND_BONUS[home], 0) : 0);
        if (stipend > 0) {
          st.bankroll += stipend;
          st.daily.stipend = true;
          st.daily.comebackPending = true;
          _log(st, 'stipend', '후원금 ' + _coins(stipend) + '을(를) 받았어요', stipend);
          changed = true;
        }
      }
    }
    if (changed) {
      save();
      _emit('day', { day: day, stipend: stipend });
    }
    return { day: day, stipend: stipend, changed: changed };
  }
  function grantXp(n) {
    var st = _st(), B = _B();
    n = Math.max(0, Math.floor(_num(n, 0)));
    _rollDay(st, _dayKey(_now()));
    var cap = B ? _num(B.XP_DAY_CAP, Infinity) : Infinity;
    var used = _num(st.daily.xp, 0);
    var give = Math.min(n, Math.max(0, cap - used));
    if (give <= 0) return { granted: 0, capped: n > 0 };
    st.daily.xp = used + give;
    if (typeof Journey !== 'undefined' && Journey && typeof Journey.addXp === 'function') {
      try { Journey.addXp('career', give); } catch (e) { _warn(e); }
    } else _xpLog.push(give);
    return { granted: give, capped: give < n };
  }
  function travel(regionId) {
    var st = _st(), B = _B(), C = _C(), r = _region(regionId);
    var cost = (B && _isObj(B.TRAVEL_COST)) ? _num(B.TRAVEL_COST[regionId], 0) : 0;
    if (!r || !C) return { ok: false, cost: 0, reason: '모르는 지역이에요' };
    if (st.unlocked.regions.indexOf(regionId) < 0) return { ok: false, cost: cost, reason: _rname(regionId) + '은(는) 아직 잠겨 있어요' };
    if (st.region === regionId) return { ok: false, cost: 0, reason: '이미 ' + _rname(regionId) + '에 있어요' };
    if (st.session) return { ok: false, cost: cost, reason: '세션 중에는 여행할 수 없어요' };
    dayRoll(_now());
    if (st.daily.travel) return { ok: false, cost: cost, reason: '여행은 하루에 한 번이에요' };
    if (st.bankroll < cost) return { ok: false, cost: cost, reason: '교통비가 부족해요(' + _coins(cost) + ', 자산 ' + _coins(st.bankroll) + ')' };
    var from = st.region;
    st.bankroll -= cost;
    st.region = regionId;
    var first = null;
    C.VENUES.forEach(function(id) { var v = _venue(id); if (!first && v && v.region === regionId && st.unlocked.venues.indexOf(id) >= 0) first = id; });
    if (first) st.venue = first;
    st.daily.travel = true;
    _log(st, 'travel', _rname(regionId) + '(으)로 여행했어요', -cost);
    _weeklyBump(st, function(c) { _inc(c, 'travels'); });   // (웨이브1 통합) 주간 챌린지
    var trophies = _grantTrophies(st, { kind: 'travel', region: regionId });
    save();
    _emit('travel', { from: from, to: regionId, cost: cost });
    return { ok: true, cost: cost, from: from, to: regionId, trophies: trophies };
  }

  // ── 주간 챌린지(웨이브1 통합) ──
  function _weekly(st) {
    var C = _C(), M = _evMod();
    if (!C || !M || typeof M.challenges !== 'function') return null;
    var wk = C.weekKey(_now());
    var ch = st.challenges;
    if (!_isObj(ch) || ch.weekKey !== wk || !Array.isArray(ch.items)) {
      var list = [];
      try { list = M.challenges(wk) || []; } catch (e) { _warn(e); list = []; }
      ch = st.challenges = { weekKey: wk, items: list.filter(_isObj).map(function(c) { return { id: c.id, progress: 0, done: false }; }), ctx: {} };
    }
    if (!_isObj(ch.ctx)) ch.ctx = {};
    return ch;
  }
  function _inc(o, k, n) { o[k] = _num(o[k], 0) + (n == null ? 1 : n); }
  // fn(ctx)로 이번 주 집계를 올리고, 챌린지 진행과 첫 완료 보상을 반영한다
  function _weeklyBump(st, fn) {
    var ch = _weekly(st), M = _evMod();
    if (!ch) return;
    try { fn(ch.ctx); } catch (e) { _warn(e); }
    if (typeof M.evaluate !== 'function') return;
    var defs = {};
    try { (M.challenges(ch.weekKey) || []).forEach(function(c) { if (_isObj(c)) defs[c.id] = c; }); } catch (e) { _warn(e); }
    ch.items.forEach(function(it) {
      var d = _isObj(it) ? defs[it.id] : null;
      if (!d || it.done) return;
      var r = null;
      try { r = M.evaluate(d, ch.ctx); } catch (e) { _warn(e); r = null; }
      if (!_isObj(r)) return;
      var need = Math.max(1, _num(r.need, 1)), val = Math.max(0, _num(r.value, 0));
      it.progress = r.done ? Math.max(val, need) : Math.min(val, d.kind === 'vpip' ? need - 1 : val);
      if (!r.done) return;
      it.done = true;
      var rw = _isObj(d.reward) ? d.reward : {};
      var coins = Math.max(0, _num(rw.coins, 0)), repN = Math.max(0, _num(rw.rep, 0));
      if (coins > 0) st.bankroll += coins;
      _log(st, 'challenge', '주간 챌린지 ' + (d.name || d.id) + ' 완료' + (coins > 0 ? ', +' + _coins(coins) : ''), coins > 0 ? coins : undefined);
      if (repN > 0) _addRep(st, repN, null);
    });
  }

  // ── 이벤트 수신 ──
  function _onHandEnd(p) {
    if (!_isObj(p)) return;
    var st = _st();
    var ses = _isObj(st.session) ? st.session : null;
    var venueId = p.venue || (ses && ses.venue) || st.venue;
    var netCoins = _num(p.netCoins, 0);
    var won = p.won === true || (p.won === undefined && netCoins > 0);
    st.stats.hands += 1;
    _venueStat(st, venueId).hands += 1;
    if (ses) {
      ses.hands = _num(ses.hands, 0) + 1;
      if (!Array.isArray(ses.met)) ses.met = [];
    }
    (Array.isArray(p.rivals) ? p.rivals : []).forEach(function(rid) {
      if (rid == null) return;
      var br = st.stats.byRival[rid];
      if (!_isObj(br)) br = st.stats.byRival[rid] = { hands: 0, net: 0, met: 0 };
      br.hands = _num(br.hands, 0) + 1;
      br.net = _num(br.net, 0) + netCoins;
      if (ses) { if (ses.met.indexOf(rid) < 0) { ses.met.push(rid); br.met = _num(br.met, 0) + 1; } }
      else if (br.hands === 1) br.met = _num(br.met, 0) + 1;
    });
    if (won) grantXp(_xp('winHand'));
    // (웨이브1 통합) 주간 챌린지 집계: 핸드, 장소별 핸드, 프리플랍 자발 참여(콜, 레이즈), 쇼다운 승, 라이벌 핸드, 현금 게임 bb 손익
    var hctx = _isObj(p.ctx) ? p.ctx : {};
    var decs = Array.isArray(hctx.decisions) ? hctx.decisions : [];
    var vol = decs.some(function(d) { return _isObj(d) && d.street === 'preflop' && /^(call|raise|bet|allin)$/.test(String(d.action || '')); });
    var sd = !!(_isObj(hctx.result) && hctx.result.showCards) && won;
    var hasRival = (Array.isArray(p.rivals) ? p.rivals : []).some(function(r) { return r != null; });
    var cashNet = (!ses || ses.kind === 'cash') ? _num(p.netBB, 0) : 0;
    _weeklyBump(st, function(c) {
      _inc(c, 'hands'); _inc(c, 'vpipHands'); if (vol) _inc(c, 'vpipIn');
      if (!_isObj(c.byVenue)) c.byVenue = {};
      var bv = _isObj(c.byVenue[venueId]) ? c.byVenue[venueId] : (c.byVenue[venueId] = {});
      _inc(bv, 'hands'); _inc(bv, 'vpipHands'); if (vol) _inc(bv, 'vpipIn');
      if (sd) _inc(c, 'showdownWins');
      if (hasRival) _inc(c, 'rivalHands');
      if (cashNet) c.netBB = Math.round((_num(c.netBB, 0) + cashNet) * 100) / 100;
    });
    save();
  }
  function _onLessonDone(p) {
    if (!_isObj(p) || !p.id) return;
    var st = _st();
    if (!_isObj(st.lessons)) st.lessons = {};
    if (st.lessons[p.id] == null) {
      st.lessons[p.id] = _iso(_now());
      _log(st, 'lesson', '커리어 레슨 ' + _lessonName(p.id) + '을(를) 마쳤어요');
      _weeklyBump(st, function(c) { _inc(c, 'lessons'); });   // (웨이브1 통합) 주간 챌린지
    }
    unlockCheck();
    save();
  }
  function _onStory(p) {
    if (!_isObj(p) || p.rivalId == null) return;
    var st = _st();
    var stage = Math.max(0, Math.floor(_num(p.stage, 0)));
    var cur = _isObj(st.story[p.rivalId]) ? st.story[p.rivalId] : (st.story[p.rivalId] = { stage: 0, at: null });
    if (stage > _num(cur.stage, 0)) { cur.stage = stage; cur.at = _iso(_now()); }
    if (stage > _num(cur.rewarded, 0)) {
      cur.rewarded = stage;
      _addRep(st, _rep('story'), null);
      if (stage >= 3) _grantTrophies(st, { kind: 'story', rivalFinal: true });
    }
    save();
  }
  function _subscribe() {
    var C = _C();
    if (!C) return;
    _unsubscribe();
    _subs.push(C.on('hand:end', _onHandEnd));
    _subs.push(C.on('lesson:done', _onLessonDone));
    _subs.push(C.on('story', _onStory));
  }
  function _unsubscribe() { _subs.forEach(function(off) { if (typeof off === 'function') off(); }); _subs = []; }

  // ── 테스트 주입 ──
  function _setStore(s) { _storeOver = (s === false) ? false : (s || null); _cache = null; _unsaved = false; _xpLog = []; }
  function _setNow(fn) { _nowOver = (typeof fn === 'function') ? fn : null; }
  function _unsavedFlag() { return _unsaved; }
  function _xpGiven() { return _xpLog.slice(); }

  var api = {
    state: state, load: load, save: save, reset: reset,
    canAfford: canAfford, buyIn: buyIn, settle: settle, requirements: requirements, regionRequirements: regionRequirements,
    unlockCheck: unlockCheck, addTrophy: addTrophy, addReputation: addReputation, title: title, dayRoll: dayRoll, todayEvent: todayEvent, grantXp: grantXp, travel: travel,
    buyInCost: buyInCost, trophyCheck: trophyCheck, titleFor: _titleFor, LOG_CAP: LOG_CAP,
    _subscribe: _subscribe, _unsubscribe: _unsubscribe, _invalidate: _invalidate,
    _setStore: _setStore, _setNow: _setNow, _unsaved: _unsavedFlag, _xpGiven: _xpGiven
  };
  // 버스 구독은 로드 때가 아니라 첫 load()와 buyIn()에서 한다(P0 계약 테스트 j-career-contract 3이 'hand:end' 핸들러 수를 세고 _clearSubs로 비운다.
  // 세션이 시작될 때마다 구독을 다시 세우므로 운영에서는 늘 받는다).
  if (typeof CareerContract !== 'undefined' && CareerContract && typeof CareerContract.register === 'function') CareerContract.register('core', api);
  if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', function(e) {
      var C = _C();
      if (!e || e.key === null || e.key === undefined || (C && e.key === C.KEY)) _invalidate();
    });
  }
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
