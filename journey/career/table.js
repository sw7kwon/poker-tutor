// journey/career/table.js (채우는 작업: 클라우드 F2 커리어 테이블 연결. 지시문 docs/cloud-tasks/F2.md)
// 커리어 세션을 엔진 테이블에 연결하는 table 모듈. 계약은 journey/career/contract.js 머리 주석의 table 인터페이스와 app.js 훅(config 'career').
//
// 흐름: startSession(venueId, stake, kind) → core.buyIn(바이인 차감, state.session 생성) → 좌석표(rivals.roster, 없으면 캐스트 폴백)를
//   session.roster에 저장 → Journey.startSession({ kind:'free', chunk: balance.SESSION_HANDS }) → App.selectVillains('career').
//   app.js는 핸드마다 playersSpec(좌석과 포지션 회전) → stacksFor(이어 칠 스택) → villainOpts(라이벌 성향 오버레이, 숨김 좌석 말풍선 제거)
//   → onHandEnd(bb 변동 x 환율을 'hand:end'로 emit, session.hands와 stack 갱신) → beforeNextHand(버스트 끝, 빌런 리바이) 순서로 부르고,
//   세션 분량이 차면 _renderSessionSummary가 sessionEnd(core.settle 뒤 정산 카드 HTML)를, 게임을 떠나면 leaveSession(열린 세션만 정산)을 부른다.
// 단위: 테이블은 bb(엔진 단위), 자산은 코인. 코인 = bb x balance.VENUES[id].rate x stake. 히어로 이름은 엔진 고정 'Hero'.
// 정산 약속(계약): sessionEnd가 정산하고 세션을 닫는다(state.session = null). leaveSession은 아직 열린 세션만 정산하고(현금 게임은 지금 스택으로),
//   두 번 불러도 한 번만 정산한다(멱등). 토너먼트는 핸드마다 저장되는 이어 치기라 leaveSession이 정산하지 않는다(tourney 모듈이 끝을 알린다).
// core.settle에 넘기는 값: { net(코인, 돌아온 코인 - 바이인), hands, bust, kind, venue, stake, returned(코인), stackBB, buyIn, tourney? }.
//   자산 보존: 세션 전 자산 - 바이인 + returned = 세션 뒤 자산. returned = 지금 스택(bb) x 환율 x 스테이크(토너먼트는 상금).
// 라이벌 성향: 좌석표의 overlay.fields가 있으면 VillainAdaptive._decide와 같은 방식(VillainProfiles[유형]을 오버레이 사본으로 잠시 바꿔
//   Villain.getAction을 부른 뒤 finally에서 되돌림). 숨김 좌석은 유형이 드러나는 말풍선(phrase)을 지우고 state.hideTypes를 건다(은닉 테이블과 같은 식).
// (웨이브2 후속, 6번) 토너먼트 띠: 테이블 펠트 안 핸드 번호 아래에 레벨, 다음 레벨까지 남은 핸드, 생존자 수를 상시 표시(#ct-band).
//   히어로가 탈락하거나 끝나면 순위와 상금. bandModel(ses)/bandHTML(ses)는 순수, syncBand(on)이 DOM을 맞춘다(playersSpec, onHandEnd,
//   정산, leaveSession, app.js가 커리어 아닌 게임을 시작할 때). MTT 인원은 startSession(venueId, stake, kind, { players })로 고른다
//   (balance.VENUES[id].players 배열 안의 값만, 없으면 첫 값).
// 규약: 로드 시 DOM, 저장소 접근 없음(typeof 가드). 엔진, ai, app.js, 다른 career 모듈은 고치지 않고 부르기만 한다.
var CareerTable = (function() {
  var SEATS = [0, 1, 2, 4, 5];                            // 히어로는 3번 좌석 고정(app.js sixmax, journey-core와 같은 배치)
  var POS6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var HERO = 'Hero';
  var HIDDEN_NAMES = ['손님A', '손님B', '손님C', '손님D', '손님E'];
  var MIXED_MAP = { preflop: 'TAG', flop: 'LAG', turn: 'TAG', river: 'Fish' };
  var TYPE_FALLBACK = { Station: 'Fish' };
  var TOURNEY_CHUNK = 999;                                // 토너먼트는 분량이 아니라 탈락과 종료로 끝난다

  var _ovCache = {};                                      // 라이벌 이름>프로필 키 → 오버레이 프로필(세션마다 비움)
  var _ovSid = null;

  function _warn(e) { try { if (typeof console !== 'undefined' && console && console.warn) console.warn('[CareerTable]', e && e.message ? e.message : e); } catch (x) {} }
  function _num(x, d) { x = Number(x); return isFinite(x) ? x : d; }
  function _r2(x) { return Math.round(x * 100) / 100; }
  function _r1(x) { return Math.round(x * 10) / 10; }
  function _isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function _G(name) { try { return (typeof globalThis !== 'undefined' && globalThis) ? globalThis[name] : undefined; } catch (e) { return undefined; } }
  function _C() { return (typeof CareerContract !== 'undefined' && CareerContract) ? CareerContract : null; }
  function _mod(name) { var C = _C(); return C ? C.mod(name) : null; }
  function _B() { return _mod('balance') || ((typeof CareerBalance !== 'undefined') ? CareerBalance : null); }
  function _can(M, fn) { return !!(M && typeof M[fn] === 'function'); }
  function _emit(evt, payload) { var C = _C(); if (C) { try { C.emit(evt, payload); } catch (e) { _warn(e); } } }
  // fn을 부르는 동안 evt가 emit됐는지(core가 이미 보낸 이벤트를 table이 다시 보내지 않게). → { value, emitted }
  function _watch(evt, fn) {
    var C = _C(), n = 0, off = null;
    if (C && typeof C.on === 'function') { try { off = C.on(evt, function() { n++; }); } catch (e) { off = null; } }
    try { return { value: fn(), emitted: n > 0 }; }
    finally { if (typeof off === 'function') { try { off(); } catch (e) {} } }
  }

  // ── 상태와 세션 ──
  function _state() {
    var core = _mod('core');
    if (!_can(core, 'state')) return null;
    try { var s = core.state(); return _isObj(s) ? s : null; } catch (e) { _warn(e); return null; }
  }
  function _session() { var s = _state(); return (s && _isObj(s.session)) ? s.session : null; }
  function _save() { var core = _mod('core'); if (_can(core, 'save')) { try { core.save(); } catch (e) { _warn(e); } } }
  function _venue(id) { var B = _B(); return (B && B.VENUES && _isObj(B.VENUES[id])) ? B.VENUES[id] : null; }
  function _stakeOf(s) { var B = _B(), st = Math.floor(_num(s, 1)); var ok = B && Array.isArray(B.STAKES) ? B.STAKES : [1, 2]; return ok.indexOf(st) >= 0 ? st : ok[0]; }
  // 코인/bb 환율(장소 환율 x 스테이크). 토너먼트 장소는 환율이 없으니 0
  function rateOf(venueId, stake) {
    var v = _venue(venueId);
    if (!v || v.kind !== 'cash') return 0;
    return _num(v.rate, 0) * _stakeOf(stake);
  }
  function coinsOf(bb, venueId, stake) { return _r2(_num(bb, 0) * rateOf(venueId, stake)); }
  function _buyInBB() { var B = _B(); return Math.max(1, _num(B && B.BUYIN_BB, 100)); }
  function _kindOf(venueId, kind) {
    if (kind === 'cash' || kind === 'sng' || kind === 'mtt') return kind;
    var v = _venue(venueId);
    return (v && (v.kind === 'sng' || v.kind === 'mtt')) ? v.kind : 'cash';
  }
  function _daySeed(at) {
    var C = _C();
    var t = Date.parse(at); if (!isFinite(t)) t = _num(at, Date.now());
    return C ? C.seedOf(C.dayKey(t)) : 1;
  }

  // ── 좌석표 ──
  function _playable(type) {
    var P = (typeof VillainProfiles !== 'undefined' && VillainProfiles) ? VillainProfiles : null;
    if (!P) return type || 'TAG';
    if (P[type]) return type;
    return P[TYPE_FALLBACK[type]] ? TYPE_FALLBACK[type] : 'TAG';
  }
  // 캐스트 폴백: 장소 regulars(캐스트 키) 먼저, 나머지는 CAST 순서. hidden만큼 뒤 좌석을 중립 이름의 숨김 좌석으로
  function _castRoster(venueId) {
    var v = _venue(venueId) || {};
    var cast = (typeof CAST !== 'undefined' && Array.isArray(CAST)) ? CAST.filter(function(c) { return c && c.key && c.type; }) : [];
    var byKey = {}; cast.forEach(function(c) { byKey[c.key] = c; });
    var out = [], used = {};
    function take(k) { var c = byKey[k]; if (c && !used[k] && out.length < 5) { used[k] = true; out.push({ name: c.key, type: c.type, rivalId: c.key, hidden: false }); } }
    (Array.isArray(v.regulars) ? v.regulars : []).forEach(take);
    cast.forEach(function(c) { take(c.key); });
    var fill = [{ name: '단골', type: 'TAG' }, { name: '뜨내기', type: 'LAG' }, { name: '구경꾼', type: 'Fish' }, { name: '조심이', type: 'Nit' }, { name: '콜쟁이', type: 'Station' }];
    for (var i = 0; out.length < 5 && i < fill.length; i++) out.push({ name: fill[i].name, type: fill[i].type, rivalId: null, hidden: false });
    var hidden = Math.max(0, Math.min(5, Math.floor(_num(v.hidden, 0))));
    for (var h = 0; h < hidden; h++) { var k = 4 - h; out[k] = { name: HIDDEN_NAMES[h], type: out[k].type, rivalId: null, hidden: true }; }
    return out;
  }
  function _rosterFor(venueId, at, state) {
    var R = _mod('rivals'), list = null;
    if (_can(R, 'roster')) { try { list = R.roster(venueId, _daySeed(at), state); } catch (e) { _warn(e); list = null; } }
    if (!Array.isArray(list) || list.length < 1) list = _castRoster(venueId);
    var seen = {};
    return list.slice(0, 5).map(function(r, i) {
      var name = String((r && r.name) || HIDDEN_NAMES[i]);
      if (name === HERO || seen[name]) name = name + (i + 1);
      seen[name] = true;
      var o = { name: name, type: String((r && r.type) || 'TAG'), rivalId: (r && r.rivalId != null) ? r.rivalId : null, hidden: !!(r && r.hidden) };
      if (r && _isObj(r.overlay) && _isObj(r.overlay.fields) && Object.keys(r.overlay.fields).length) o.overlay = { fields: JSON.parse(JSON.stringify(r.overlay.fields)) };
      return o;
    });
  }
  function _roster() {
    var ses = _session();
    if (ses && Array.isArray(ses.roster) && ses.roster.length) return ses.roster;
    var st = _state();
    return _rosterFor((st && st.venue) || 'backyard', (ses && ses.startedAt) || Date.now(), st);
  }
  // 좌석 0,1,2,4,5 + 포지션 회전(journey-core posFor와 같은 식: btnSeat = (6 - heroIdx) % 6, pos = POS[(seat - btnSeat + 3 + 6) % 6])
  function playersSpec(heroPos, POS) {
    syncBand(true);
    POS = (Array.isArray(POS) && POS.length === 6) ? POS : POS6;
    var heroIdx = POS.indexOf(heroPos); if (heroIdx < 0) heroIdx = POS.indexOf('BTN');
    var btnSeat = (6 - heroIdx) % 6;
    var posFor = function(seat) { return POS[(seat - btnSeat + 3 + 6) % 6]; };
    var ts = _tourneySeats(heroPos);
    if (ts) return ts;
    var roster = _roster();
    if (!roster.length) return null;
    var out = [];
    for (var i = 0; i < SEATS.length && i < roster.length; i++) {
      var r = roster[i];
      var o = { type: _playable(r.type), name: r.name, pos: posFor(SEATS[i]), hidden: !!r.hidden, castType: r.type };
      if (r.rivalId != null) o.rivalId = r.rivalId;
      out.push(o);
    }
    return out;
  }

  // 토너먼트 좌석: 탈락자를 빼고 MTT 합치기로 바뀐 히어로 테이블(tourney.seating)을 그대로 앉힌다. 세션 좌석표(roster)는 성향 오버레이와 숨김 표시에만 쓴다.
  //   tourney 모듈이 없거나 상태가 비었으면 null(위 현금 게임 좌석 경로)
  function _tourneySeats(heroPos) {
    var ses = _session(), T = _mod('tourney');
    if (!ses || ses.kind === 'cash' || !_isObj(ses.tourney) || !Array.isArray(ses.tourney.entrants) || !_can(T, 'seating')) return null;
    var seats;
    try { seats = T.seating(ses.tourney, heroPos); } catch (e) { _warn(e); return null; }
    if (!Array.isArray(seats) || !seats.length) return null;
    var byName = {};
    (Array.isArray(ses.roster) ? ses.roster : []).forEach(function(r) { if (r && r.name) byName[r.name] = r; });
    var out = [];
    seats.forEach(function(s) {
      if (!s || s.hero || s.name === HERO) return;
      var r = byName[s.name] || {};
      var castType = r.type || s.type;
      var o = { type: _playable(s.type), name: s.name, pos: s.pos, hidden: !!(r.hidden || s.hidden), castType: castType };
      var rid = r.rivalId != null ? r.rivalId : s.rivalId;
      if (rid != null) o.rivalId = rid;
      out.push(o);
    });
    return out.length ? out : null;
  }

  // ── 스택 ──
  function _tourneyStacks(ses) {
    var T = _mod('tourney');
    if (!_can(T, 'toEngineStacks') || !_isObj(ses.tourney)) return null;
    try { var s = T.toEngineStacks(ses.tourney); return _isObj(s) ? s : null; } catch (e) { _warn(e); return null; }
  }
  function stacksFor() {
    var ses = _session();
    if (!ses) return null;
    if (ses.kind !== 'cash') { var ts = _tourneyStacks(ses); if (ts) return ts; }
    var out = {};
    out[HERO] = _num(ses.stack, _buyInBB());
    if (!(out[HERO] > 0)) out[HERO] = _buyInBB();
    (Array.isArray(ses.roster) ? ses.roster : _roster()).forEach(function(r) {
      var v = _isObj(ses.villainStacks) ? _num(ses.villainStacks[r.name], 100) : 100;
      out[r.name] = v > 0 ? v : 100;
    });
    return out;
  }
  // 리바이 전: 히어로 HERO_BUST_BB 미만이면 끝, 빌런 VILLAIN_REBUY_BB 미만은 100으로. 세션이 없으면 null(app.js 기본 리바이)
  function beforeNextHand(stacks) {
    var ses = _session();
    if (!ses || !_isObj(stacks)) return null;
    var B = _B();
    var bust = _num(B && B.HERO_BUST_BB, 0.5), rebuy = _num(B && B.VILLAIN_REBUY_BB, 20);
    var hero = _num(stacks[HERO], 0);
    if (ses.kind !== 'cash') {
      var t = ses.tourney;
      var done = !!(_isObj(t) && (t.done === true || t.finished === true || t.heroOut === true || t.place != null));
      var ts = _tourneyStacks(ses);
      return { stacks: ts || JSON.parse(JSON.stringify(stacks)), end: done || !(hero > 0) };
    }
    if (hero < bust) return { stacks: JSON.parse(JSON.stringify(stacks)), end: true };
    var out = {}, vs = {};
    Object.keys(stacks).forEach(function(n) {
      var v = _num(stacks[n], 0);
      if (n !== HERO && v < rebuy) v = 100;
      out[n] = v;
      if (n !== HERO) vs[n] = v;
    });
    ses.villainStacks = vs;
    return { stacks: out, end: false };
  }

  // ── 라이벌 성향(오버레이)과 숨김 좌석 ──
  function _overlay(base, fields) {
    var VA = (typeof VillainAdaptive !== 'undefined' && VillainAdaptive) ? VillainAdaptive : null;
    if (_can(VA, 'overlay')) return VA.overlay(base, fields);
    var p = JSON.parse(JSON.stringify(base || {}));
    Object.keys(fields || {}).forEach(function(path) {
      var d = Number(fields[path]);
      if (!isFinite(d) || !d) return;
      var parts = path.split('.'), o = p;
      for (var i = 0; i < parts.length - 1; i++) { o = o && _isObj(o[parts[i]]) ? o[parts[i]] : null; if (!o) return; }
      var k = parts[parts.length - 1];
      if (!o || typeof o[k] !== 'number' || !isFinite(o[k])) return;
      var rg = path.indexOf('bet_sizing') === 0 ? [0.1, 3] : [0, 1];
      o[k] = _r2(Math.max(rg[0], Math.min(rg[1], o[k] + d)));
    });
    return p;
  }
  function _decideFor(roster) {
    var byName = {};
    roster.forEach(function(r) { byName[r.name] = r; });
    return function decide(villain, s) {
      if (!villain || !s || typeof Villain === 'undefined' || !Villain || typeof Villain.getAction !== 'function') return null;
      var r = byName[villain.name];
      if (!r) return null;
      var fields = (r.overlay && _isObj(r.overlay.fields)) ? r.overlay.fields : null;
      if (!fields && !r.hidden) return null;
      var out;
      var P = (typeof VillainProfiles !== 'undefined') ? VillainProfiles : null;
      var T = villain.type, key = T === 'Mixed' ? (MIXED_MAP[s.street] || 'TAG') : T;
      if (fields && P && P[key]) {
        var ck = r.name + '>' + key;
        var ov = _ovCache[ck] || (_ovCache[ck] = _overlay(P[key], fields));
        var orig = P[key];
        P[key] = ov;
        try { out = Villain.getAction(villain, s); }
        finally { P[key] = orig; }
      } else {
        out = Villain.getAction(villain, s);
      }
      if (!out || typeof out !== 'object') return null;
      if (r.hidden) { out = { action: out.action, amount: out.amount }; }
      return out;
    };
  }
  // app.js _villainOpts: 라이벌 오버레이나 숨김 좌석이 있을 때만 { decide }. 연습이거나 특별한 좌석이 없으면 null(기존 VillainAdaptive 경로)
  function villainOpts(ctx) {
    ctx = ctx || {};
    if (ctx.practice) return null;
    var ses = _session();
    // 토너먼트 후반(배수가 커서 1bb 미만 스택)에 블라인드를 내고 음수가 된 좌석을 가진 만큼만 낸 것으로 고친다(살아 있는 _state, 멱등)
    if (ses && ses.kind !== 'cash' && _isObj(ctx.state)) {
      var TT = _mod('tourney');
      if (_can(TT, 'fixShortBlinds')) { try { TT.fixShortBlinds(ctx.state); } catch (e) { _warn(e); } }
    }
    if (!ses || !Array.isArray(ses.roster) || !ses.roster.length) return null;
    var special = ses.roster.filter(function(r) { return r.hidden || (r.overlay && _isObj(r.overlay.fields) && Object.keys(r.overlay.fields).length); });
    if (!special.length) return null;
    var sid = ctx.sessionId == null ? null : ctx.sessionId;
    if (sid !== _ovSid) { _ovSid = sid; _ovCache = {}; }
    // 숨김 좌석이 있으면 은닉 테이블과 같이 유형 라벨과 성향 칩을 가린다(복제되는 상태 플래그, 그 핸드 끝까지)
    if (_isObj(ctx.state) && special.some(function(r) { return r.hidden; }) && !ctx.state.hideTypes) {
      ctx.state.hideTypes = true;
      var Tb = _G('Table');
      if (_can(Tb, 'render') && typeof document !== 'undefined' && document && typeof document.getElementById === 'function') {
        try { Tb.render(ctx.state); } catch (e) { _warn(e); }
      }
    }
    return { decide: _decideFor(ses.roster) };
  }

  // ── 핸드 끝 ──
  function _grantXp(n) {
    var core = _mod('core');
    if (_can(core, 'grantXp') && n > 0) { try { core.grantXp(n); } catch (e) { _warn(e); } }
  }
  function onHandEnd(ctx) {
    ctx = ctx || {};
    var ses = _session();
    if (!ses) return null;
    var st = ctx.state || {};
    var netBB = _r2(_num(ctx.net, 0));
    var heroStack = (st.stacks && st.stacks[HERO] != null) ? _num(st.stacks[HERO], NaN) : NaN;
    if (!isFinite(heroStack)) heroStack = _num(ses.stack, _buyInBB()) + netBB;
    var handsBefore = Math.floor(_num(ses.hands, 0)), handsAfter = handsBefore + 1;
    ses.stack = _r2(heroStack);
    if (_isObj(st.stacks)) {
      var vs = {};
      (Array.isArray(ses.roster) ? ses.roster : []).forEach(function(r) { if (st.stacks[r.name] != null) vs[r.name] = _r2(_num(st.stacks[r.name], 100)); });
      ses.villainStacks = vs;
    }
    var won = !!(ctx.result && ctx.result.heroWon);
    var B = _B();
    var T = _mod('tourney');
    // 저장된 session.tourney를 직접 넘긴다(앱을 다시 열면 tourney 모듈의 현재 토너먼트가 비어 있거나 다른 객체라서)
    if (ses.kind !== 'cash' && _can(T, 'onHandEnd')) {
      var tctx = {};
      Object.keys(ctx).forEach(function(k) { tctx[k] = ctx[k]; });
      if (_isObj(ses.tourney) && Array.isArray(ses.tourney.entrants)) tctx.tourney = ses.tourney;
      var wasFinal = !!(_isObj(ses.tourney) && ses.tourney.final), tr = null;
      try { tr = T.onHandEnd(tctx); } catch (e) { _warn(e); }
      // 레벨 전환과 파이널 테이블을 짧게 알린다(스택이 bb로 절반이 되는 까닭). 끝난 토너먼트는 세션 요약이 알린다
      if (_isObj(tr) && !tr.done && (tr.levelChanged || (tr.final && !wasFinal))) {
        var msg = [];
        if (tr.levelChanged) msg.push('⏫ 레벨 ' + tr.level + ', 블라인드가 ' + tr.mult + '배가 됐어요. 스택은 bb로 절반이 돼요');
        if (tr.final && !wasFinal) msg.push('🏁 파이널 테이블이에요');
        var alive = _isObj(ses.tourney) ? _num(ses.tourney.alive, 0) : 0;
        if (alive > 0) msg.push('남은 사람 ' + alive + '명');
        var JU = _G('JourneyUI');
        if (_can(JU, 'toast')) { try { JU.toast(msg.join(', ') + '.', 3200); } catch (e) { _warn(e); } }
      }
      syncBand(true);   // 레벨, 남은 핸드, 생존자(탈락이면 순위와 상금)
    }
    var rate = rateOf(ses.venue, ses.stake);
    var payload = {
      venue: ses.venue, stake: ses.stake, rate: rate, netBB: netBB, netCoins: _r2(netBB * rate), hands: handsAfter,
      rivals: (Array.isArray(ses.roster) ? ses.roster : []).map(function(r) { return r.rivalId; }).filter(function(id) { return id != null; }),
      won: won, ctx: ctx
    };
    _emit('hand:end', payload);
    // core(F1)는 'hand:end'를 받아 session.hands와 승리 핸드 XP를 센다. core가 세지 않았을 때만(구독 전, 가짜 core) 여기서 센다(이중 집계 방지)
    if (Math.floor(_num(ses.hands, 0)) === handsBefore) {
      ses.hands = handsAfter;
      if (won) _grantXp(_num(B && B.XP && B.XP.winHand, 1));
    }
    _save();
    return payload;
  }

  // ── 정산 ──
  // 현금 게임: 돌아오는 코인 = 지금 스택(bb) x 환율. 토너먼트: 상금(session.tourney.prize). bust = 스택이 HERO_BUST_BB 미만
  function _settleInfo(ses, stackBB) {
    var B = _B(), bust = _num(B && B.HERO_BUST_BB, 0.5);
    var buyIn = _r2(_num(ses.buyIn, 0));
    var stack = _r2(_num(stackBB, _num(ses.stack, _buyInBB())));
    var returned, isBust, tour = null;
    if (ses.kind === 'cash') {
      returned = coinsOf(stack, ses.venue, ses.stake);
      isBust = stack < bust;
    } else {
      var t = _isObj(ses.tourney) ? ses.tourney : {};
      // tourney 모듈 상태는 상금과 순위를 result(끝난 뒤)와 hero에 둔다. 예전 모양({ prize, place })도 그대로 읽는다
      var res = _isObj(t.result) ? t.result : null, hr = _isObj(t.hero) ? t.hero : null;
      var prize = res && res.prize != null ? res.prize : (hr && hr.prize != null ? hr.prize : t.prize);
      returned = _r2(Math.max(0, _num(prize, 0)));
      isBust = !(returned > 0);
      if (res || hr) {
        var place = res && res.place != null ? res.place : (hr ? hr.place : null);
        tour = { kind: t.kind, n: _num(res && res.n, _num(t.players, 0)), place: place, prize: returned, payouts: Array.isArray(t.payouts) ? t.payouts.slice() : undefined,
          hands: _num(res && res.hands, _num(t.handNo, 0)) };
      }
    }
    returned = _r1(returned);   // (결정 48) 코인 저장은 소수 1자리
    return { net: _r1(returned - buyIn), hands: Math.floor(_num(ses.hands, 0)), bust: isBust, kind: ses.kind, venue: ses.venue, stake: ses.stake,
      returned: returned, stackBB: stack, buyIn: buyIn, tourney: ses.kind === 'cash' ? undefined : (tour || ses.tourney || null) };
  }
  // 아직 열린 세션만 정산한다(멱등). → { session, info, result, before, after } | null
  var _settling = false;
  function _settle(stackBB) {
    var st = _state(), ses = _session();
    if (!st || !ses || _settling) return null;
    var core = _mod('core');
    var info = _settleInfo(ses, stackBB);
    // 카드의 '자산 전'은 바이인을 내기 전 자산(지금 자산 + 바이인). 바이인 뒤 값을 쓰면 '900 → 900, -100'처럼 앞뒤가 안 맞는다
    var before = _r2(_num(st.bankroll, 0) + info.buyIn), result = null, coreEmitted = false;
    var sesCopy = JSON.parse(JSON.stringify(ses));
    _settling = true;                                      // settle 안에서 다시 들어와도 두 번 정산하지 않게
    try {
      if (_can(core, 'settle')) {
        var w = _watch('session:end', function() { try { return core.settle(info); } catch (e) { _warn(e); return null; } });
        result = w.value; coreEmitted = w.emitted;
      }
    } finally { _settling = false; }
    if (!_isObj(result)) result = { bankroll: _num(st.bankroll, before), delta: info.net, trophies: [], title: st.title };
    st.session = null;                                     // 세션을 닫는다(core가 닫았어도 같다)
    syncBand(false);
    var B = _B();
    var after = _num(result.bankroll, _num(st.bankroll, before));
    // core(F1) settle이 세션 XP를 주고 'session:end'를 보낸다. core가 보내지 않았을 때만 여기서(이중 지급, 이중 이벤트 방지)
    if (!coreEmitted) {
      _grantXp(_num(B && B.XP && B.XP.session, 10));
      _emit('session:end', { session: sesCopy, netCoins: info.net, hands: info.hands, bust: info.bust });
    }
    _save();
    _ovCache = {}; _ovSid = null;
    return { session: sesCopy, info: info, result: result, before: before, after: after };
  }
  // (웨이브2 후속, 결정 48) 화면의 코인은 정수 반올림(지도 fmt, core _coins와 같은 값). 저장은 소수 1자리
  function _fmtCoins(n) {
    n = Math.round(_num(n, 0));
    var s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '-' : '') + s;
  }
  function _signedCoins(n) { n = Math.round(_num(n, 0)); return (n > 0 ? '+' : n < 0 ? '-' : '') + _fmtCoins(Math.abs(n)); }
  function _rivalLine(ses, net, st) {
    var R = _mod('rivals');
    if (!_can(R, 'line') || !Array.isArray(ses.roster)) return '';
    var r = null;
    for (var i = 0; i < ses.roster.length; i++) { if (ses.roster[i].rivalId != null && !ses.roster[i].hidden) { r = ses.roster[i]; break; } }
    if (!r) return '';
    try { var t = R.line(r.rivalId, net > 0 ? 'win' : 'lose', st); return typeof t === 'string' ? t : ''; } catch (e) { _warn(e); return ''; }
  }
  function _settleHTML(res, st) {
    var C = _C();
    var ses = res.session, info = res.info, r = res.result;
    var cur = (C && C.CURRENCY) || '코인';
    var v = _venue(ses.venue) || {};
    var name = v.name || ses.venue;
    var icon = info.net > 0 ? '📈' : info.net < 0 ? '📉' : '➖';
    var color = info.net > 0 ? '#3fb950' : info.net < 0 ? '#f85149' : '#c9d1d9';
    var head = info.bust ? '🪫 바이인을 다 잃었어요' : (info.net > 0 ? '🎉 수익 세션이에요' : (info.net < 0 ? '🙂 다음엔 더 잘될 거예요' : '🙂 본전으로 마쳤어요'));
    var stakeTxt = ses.kind === 'cash' ? ' x' + _stakeOf(ses.stake) : '';
    var body = '<div class="j-card j-career-settle" role="status">' +
      '<div class="j-card-t">🎰 커리어 정산, ' + _esc(name) + _esc(stakeTxt) + '</div>' +
      '<div class="j-card-d">' + _esc(head) + '</div>' +
      '<div class="j-career-settle-row" style="margin-top:6px">' +
        '<span class="j-career-settle-k">자산</span> ' +
        '<span class="j-career-settle-v">' + _esc(_fmtCoins(res.before)) + ' ' + _esc(cur) + ' → <b>' + _esc(_fmtCoins(res.after)) + ' ' + _esc(cur) + '</b></span> ' +
        '<span class="j-career-settle-delta" style="color:' + color + ';font-weight:700;white-space:nowrap">' + icon + ' ' + _esc(_signedCoins(Math.round(_num(res.after, 0)) - Math.round(_num(res.before, 0)))) + ' ' + _esc(cur) + '</span>' +
      '</div>';
    if (ses.kind === 'cash') {
      body += '<div class="j-card-d">바이인 ' + _esc(_fmtCoins(info.buyIn)) + ' ' + _esc(cur) + ', 돌아온 칩 ' + _esc(_fmtCoins(info.returned)) + ' ' + _esc(cur) +
        ' <span style="white-space:nowrap">(' + _esc(String(_r2(info.stackBB))) + 'bb x 환율 ' + _esc(String(rateOf(ses.venue, ses.stake))) + ')</span>, ' + info.hands + '핸드</div>';
    } else {
      var tp = _isObj(info.tourney) ? info.tourney : {};
      var placeTxt = (_num(tp.place, 0) > 0 && _num(tp.n, 0) > 0) ? (_num(tp.place, 0) === 1 ? '🏆 ' + tp.n + '명 중 우승, ' : '🏁 ' + tp.n + '명 중 ' + tp.place + '위, ') : '';
      body += '<div class="j-card-d">' + _esc(placeTxt) + '바이인 ' + _esc(_fmtCoins(info.buyIn)) + ' ' + _esc(cur) + ', 상금 ' + _esc(_fmtCoins(info.returned)) + ' ' + _esc(cur) + ', ' + info.hands + '핸드</div>';
    }
    var line = _rivalLine(ses, info.net, st);
    if (line) body += '<div class="j-career-settle-line j-card-d" style="margin-top:6px">💬 ' + _esc(line) + '</div>';
    var trophies = Array.isArray(r.trophies) ? r.trophies : [];
    if (trophies.length && C && C.TROPHY_META) {
      body += '<div class="j-career-settle-trophies" style="margin-top:6px">' + trophies.map(function(id) {
        var m = C.TROPHY_META[id] || { icon: '🏅', name: String(id) };
        return '<span class="j-career-trophy-chip" style="display:inline-block;margin:2px 6px 2px 0">' + _esc(m.icon) + ' ' + _esc(m.name) + '</span>';
      }).join('') + '</div>';
    }
    if (r.title && C && Array.isArray(C.TITLES) && r.title !== (res.titleBefore || r.title)) {
      var tt = null;
      C.TITLES.forEach(function(t) { if (t.id === r.title) tt = t; });
      if (tt) body += '<div class="j-card-d" style="margin-top:4px">🎖 새 칭호: ' + _esc(tt.name) + '</div>';
    }
    body += '<div class="j-card-acts"><button type="button" class="menu-btn j-career-back" onclick="JourneyUI.view(\'career\')">↩ 커리어로</button></div>' +
      '</div>';
    return body;
  }
  // _renderSessionSummary: 정산하고 세션을 닫은 뒤 정산 카드 HTML. 이미 닫혔으면 마지막 카드(같은 요약 화면을 다시 그릴 때), 없으면 ''
  var _lastHTML = '';
  var _lastSid = null;
  function sessionEnd(ctx) {
    ctx = ctx || {};
    var st = _state(), ses = _session();
    if (!st) return '';
    if (!ses) return (_lastSid != null && ctx.sessionId === _lastSid) ? _lastHTML : '';
    var titleBefore = st.title;
    var stackBB = (ses.stack != null) ? _num(ses.stack, NaN) : NaN;
    if (!isFinite(stackBB)) stackBB = _buyInBB() + _num(ctx.net, 0);
    var res = _settle(stackBB);
    if (!res) return '';
    res.titleBefore = titleBefore;
    var html = _settleHTML(res, _state());
    _lastHTML = html; _lastSid = (ctx.sessionId == null) ? null : ctx.sessionId;
    return html;
  }
  // 게임을 떠날 때: 아직 열린 현금 세션만 지금 스택으로 정산(멱등). 토너먼트는 이어 치기용으로 남겨 둔다
  function leaveSession() {
    syncBand(false);                                       // 게임을 떠나면 토너먼트 띠도 치운다(이어 치기 때 다시 그린다)
    var ses = _session();
    if (!ses) return null;
    if (ses.kind !== 'cash') return null;
    var r = _settle(_num(ses.stack, _buyInBB()));
    return r ? { net: r.info.net, bankroll: r.after, bust: r.info.bust, hands: r.info.hands } : null;
  }

  // ── 토너먼트 띠(웨이브2 후속, 6번) ──
  // bandModel(ses) → null(현금 게임, 토너먼트 상태 없음) | { done, level, mult, handsToLevel, alive, n, final, place, prize }
  function bandModel(ses) {
    ses = (ses === undefined) ? _session() : ses;
    if (!_isObj(ses) || ses.kind === 'cash' || !_isObj(ses.tourney) || !Array.isArray(ses.tourney.entrants)) return null;
    var T = _mod('tourney'), s = null;
    if (_can(T, 'status')) { try { s = T.status(ses.tourney); } catch (e) { _warn(e); s = null; } }
    if (!_isObj(s)) return null;
    return { done: !!s.done || s.place != null, level: _num(s.level, 1), mult: _num(s.mult, 1), handsToLevel: s.handsToLevel,
      alive: _num(s.alive, 0), n: _num(s.n, 0), final: !!s.final, place: s.place != null ? _num(s.place, 0) : null, prize: _num(s.prize, 0) };
  }
  function bandHTML(ses) {
    var m = bandModel(ses);
    if (!m) return '';
    var C = _C(), cur = (C && C.CURRENCY) || '코인';
    if (m.done && m.place) {
      var icon = m.place === 1 ? '🏆' : (m.prize > 0 ? '🥇' : '🏁');
      var head = m.place === 1 ? m.n + '명 중 우승' : m.n + '명 중 ' + m.place + '위로 끝났어요';
      return '<span><i class="ct-band-i" aria-hidden="true">' + icon + '</i> ' + _esc(head) + ',</span><span>' +
        (m.prize > 0 ? '상금 <b>' + _esc(_fmtCoins(m.prize)) + ' ' + _esc(cur) + '</b>' : '상금 없음') + '</span>';
    }
    var lv = '레벨 <b>' + m.level + '</b>' + (m.mult > 1 ? '(블라인드 x' + m.mult + ')' : '');
    var nx = (m.handsToLevel === Infinity || !isFinite(_num(m.handsToLevel, NaN))) ? '마지막 레벨' : '다음 레벨까지 <b>' + _num(m.handsToLevel, 0) + '</b>핸드';
    var al = (m.final ? '파이널, ' : '') + '남은 <b>' + m.alive + '</b>/' + m.n + '명';
    return '<span><i class="ct-band-i" aria-hidden="true">⏱</i> ' + lv + '</span><span>' + nx + '</span><span>' + al + '</span>';
  }
  // DOM: .poker-table .table-felt 안, #hand-info 바로 뒤의 #ct-band. on이 아니거나 토너먼트가 아니면 지운다
  function syncBand(on) {
    if (typeof document === 'undefined' || !document || typeof document.getElementById !== 'function') return false;
    try {
      var el = document.getElementById('ct-band');
      var html = on === false ? '' : bandHTML();
      if (!html) { if (el && el.parentNode) el.parentNode.removeChild(el); return false; }
      if (!el) {
        var felt = document.querySelector('.poker-table .table-felt');
        if (!felt) return false;
        el = document.createElement('div');
        el.id = 'ct-band'; el.className = 'ct-band';
        el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
        var hi = document.getElementById('hand-info');
        if (hi && hi.parentNode === felt) felt.insertBefore(el, hi.nextSibling); else felt.appendChild(el);
      }
      if (el.innerHTML !== html) el.innerHTML = html;
      return true;
    } catch (e) { _warn(e); return false; }
  }

  // ── 세션 시작 ──
  function startSession(venueId, stake, kind, opts) {
    var core = _mod('core');
    if (!_can(core, 'buyIn') || !_state()) return { error: '커리어 코어가 아직 준비되지 않았어요.' };
    venueId = String(venueId || (_state() && _state().venue) || 'backyard');
    stake = _stakeOf(stake);
    kind = _kindOf(venueId, kind);
    var T = _mod('tourney');
    if (kind !== 'cash' && !_can(T, 'create')) return { error: '토너먼트는 아직 준비 중이에요. 현금 게임 테이블을 골라 주세요.' };
    if (_can(core, 'dayRoll')) { try { core.dayRoll(Date.now()); } catch (e) { _warn(e); } }   // (웨이브1 통합) 오늘 이벤트 기록(좌석의 라이벌 출현, 안개)과 후원금
    var old = _session();
    var ses = null;
    if (old && old.kind !== 'cash' && old.venue === venueId && _isObj(old.tourney)) {
      ses = old;                                           // 이어 치기(토너먼트는 핸드마다 저장)
      if (_can(T, 'attach') && Array.isArray(old.tourney.entrants)) { try { T.attach(old.tourney); } catch (e) { _warn(e); } }
    } else {
      if (old) leaveSession();                             // 남아 있던 현금 세션은 지금 스택으로 먼저 정산
      var r, startEmitted = false;
      var wb = _watch('session:start', function() { try { return core.buyIn(venueId, stake, kind); } catch (e) { _warn(e); return { error: '바이인을 처리하지 못했어요.' }; } });
      r = wb.value; startEmitted = wb.emitted;
      if (!_isObj(r) || r.error) return _isObj(r) && r.error ? { error: String(r.error) } : { error: '바이인을 처리하지 못했어요.' };
      var st = _state();
      ses = _isObj(st.session) ? st.session : r;
      if (!_isObj(st.session)) st.session = ses;
      ses.kind = kind; ses.venue = venueId;
      if (kind === 'cash' || ses.stake == null) ses.stake = stake;      // 토너먼트는 core가 기록한 스테이크(1)를 둔다
      if (!ses.startedAt) ses.startedAt = new Date().toISOString();
      ses.hands = Math.floor(_num(ses.hands, 0));
      ses.roster = _rosterFor(venueId, ses.startedAt, st);
      ses.villainStacks = {};
      if (kind === 'cash') {
        ses.stack = _buyInBB();
        if (!_isObj(ses.tourney)) ses.tourney = {};
      } else {
        var v = _venue(venueId) || {};
        // (웨이브2 후속) MTT 인원 고르기: opts.players가 장소 players 배열 안에 있으면 그 값, 아니면 첫 값
        var want = (opts && opts.players != null) ? _num(opts.players, 0) : 0;
        var players = Array.isArray(v.players) ? (v.players.indexOf(want) >= 0 ? want : v.players[0]) : _num(v.players, 6);
        try {
          ses.tourney = T.create({ kind: kind, players: players, buyIn: _num(ses.buyIn, _num(v.buyIn, 0)), seed: _daySeed(ses.startedAt), roster: ses.roster });
        } catch (e) { _warn(e); ses.tourney = {}; }
        var ts = _tourneyStacks(ses);
        var B0 = _B(), startBB = _num(ses.stack, _num(B0 && B0.TOURNEY && B0.TOURNEY.START_BB, _buyInBB()));
        ses.stack = ts && ts[HERO] != null ? _num(ts[HERO], startBB) : startBB;
      }
      if (!startEmitted) _emit('session:start', { session: ses });   // core(F1) buyIn이 이미 보냈으면 다시 보내지 않는다
    }
    _ovCache = {}; _ovSid = null;
    _save();
    var B = _B();
    var J = _G('Journey');
    if (_can(J, 'startSession')) {
      try { J.startSession({ kind: 'free', chunk: kind === 'cash' ? Math.max(1, _num(B && B.SESSION_HANDS, 10)) : TOURNEY_CHUNK }); } catch (e) { _warn(e); }
    }
    var A = _G('App');
    if (_can(A, 'selectVillains')) { try { A.selectVillains('career'); } catch (e) { _warn(e); } }
    return ses;
  }

  var api = {
    SEATS: SEATS.slice(), HERO: HERO,
    playersSpec: playersSpec, stacksFor: stacksFor, beforeNextHand: beforeNextHand, villainOpts: villainOpts,
    onHandEnd: onHandEnd, sessionEnd: sessionEnd, startSession: startSession, leaveSession: leaveSession,
    rateOf: rateOf, coinsOf: coinsOf, bandModel: bandModel, bandHTML: bandHTML, syncBand: syncBand,
    _castRoster: _castRoster, _rosterFor: _rosterFor, _settleInfo: _settleInfo, _reset: function() { _ovCache = {}; _ovSid = null; _lastHTML = ''; _lastSid = null; }
  };
  if (typeof CareerContract !== 'undefined' && CareerContract && typeof CareerContract.register === 'function') CareerContract.register('table', api);
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
