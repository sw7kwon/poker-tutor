// journey/career/map-ui.js (채우는 작업: 클라우드 F3 커리어 지도, 장소, 트로피 룸 화면. 지시문 docs/cloud-tasks/F3.md)
// 계약: journey/career/contract.js 머리 주석의 map 인터페이스. CareerContract.register('map', api).
//   homeCard(jstate, now) → { html, emph:true } | null   홈 카드("🎰 커리어: 항구 카드룸, 1,240코인, 오늘 이벤트 해피아워 ▸"). core가 없으면 null.
//   open(params, el) → true                               params: 지역 id, 장소 id, 또는 { region, venue }(문자열이면 id로 본다)
//   render(el) → html                                     el이 없으면 마지막 요소(없으면 문자열만 돌려준다)
// 순수 함수(테스트용): html(opts{ state, now, region, stake }), model(state, now, opts), pct(p, done), fmt(n), coins(n)
// 화면 동작(onclick): setRegion(id), setStake(n), start(venueId), travel(regionId), resume(), buyHome(id), back()
// 숫자는 전부 core.state()와 balance 상수에서 읽는다(하드코딩 금지). 장소 해금 조건은 core.requirements(venueId)가 있으면 그것을,
// 없으면 balance의 unlock(자산, 평판, 여정 단계와 레슨)으로 같은 모양 [{ text, done, progress }]을 만든다.
// 다른 모듈(core, rivals, events, table, Journey, JourneyUI, App, CAST)은 전부 typeof 가드와 try로 부른다. core가 없으면 안내 카드.
// 표시는 색 + 글자 + 아이콘 3중(열림 🔓, 잠김 🔒, 지금 여기 📍, 완료 ✓), 누르는 요소는 44px 이상(css/career.css).
// 규약: 로드 시 DOM, 저장소 접근 없음. 문구는 해요체, 가운뎃점과 긴줄표 없음.
var CareerMap = (function() {
  var C = (typeof CareerContract !== 'undefined' && CareerContract) ? CareerContract : null;
  var SESSION_HANDS_FALLBACK = 10;
  var KIND_LABEL = { cash: '현금 게임', sng: '싯앤고', mtt: '토너먼트' };
  var KIND_ICON = { cash: '🪙', sng: '🥇', mtt: '🏆' };
  var TITLE_ICON = { newbie: '🌱', patron: '🍺', regular: '🪑', shark: '🦈', highroller: '💎', champion: '🏆', legend: '👑' };
  var HOME_META = {
    studio: { icon: '🛏', name: '스튜디오', text: '작지만 내 공간이에요.' },
    apartment: { icon: '🏢', name: '아파트', text: '창밖으로 강이 보여요. 후원금이 조금 늘어요.' },
    penthouse: { icon: '🏙', name: '펜트하우스', text: '도시가 발 아래예요. 후원금이 더 늘어요.' }
  };
  var LOG_ICON = { session: '🃏', win: '📈', loss: '📉', trophy: '🏆', title: '🏷', unlock: '🔓', travel: '🚗', stipend: '🎁', day: '📅', story: '💬', tourney: '🥇', lesson: '📘', home: '🏠',
    buyin: '🎟', bust: '💥', rep: '⭐', challenge: '🎯' };
  var MAX_LOG = 5;
  var MAX_FACES = 3;

  var _el = null;        // 마지막으로 그린 요소
  var _region = null;    // 보고 있는 지역 탭(null이면 지금 있는 지역)
  var _stake = null;     // 고른 스테이크(null이면 state.stake)
  var _field = null;     // (웨이브2 후속) MTT 인원(null이면 장소 players 배열의 첫 값)

  // ── 공용 헬퍼 ──────────────────────────────────────────
  function _warn(where, e) { if (typeof console !== 'undefined' && console && console.warn) console.warn('[CareerMap] ' + where, e && e.message ? e.message : e); }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function _num(v, d) { v = Number(v); return isFinite(v) ? v : (d || 0); }
  function _isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function _g(name) {
    var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : null);
    var o = G ? G[name] : undefined;
    return (o && (typeof o === 'object' || typeof o === 'function')) ? o : null;
  }
  function _mod(name) { return C ? C.mod(name) : null; }
  function _core() { return _mod('core'); }
  function _bal() { return _mod('balance') || _g('CareerBalance'); }
  function _try(obj, fn, args, fallback) {
    if (!obj || typeof obj[fn] !== 'function') return fallback;
    try { var r = obj[fn].apply(obj, args || []); return (r === undefined) ? fallback : r; }
    catch (e) { _warn(fn, e); return fallback; }
  }
  // 1240 → '1,240'
  function fmt(n) {
    n = Math.round(_num(n, 0));
    var neg = n < 0, s = String(Math.abs(n)), out = '';
    while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
    return (neg ? '-' : '') + s + out;
  }
  function coins(n) { return fmt(n) + ((C && C.CURRENCY) || '코인'); }
  // 진행률 0~1 → 0~100 정수. 아직 안 끝난 조건은 반올림으로 100%가 되지 않게 99%까지만
  function pct(p, done) {
    var v = Math.round(Math.max(0, Math.min(1, _num(p, 0))) * 100);
    if (done === false && v >= 100) v = 99;
    if (done === true) v = 100;
    return v;
  }
  function _day(now) { return C ? C.dayKey(now) : ''; }
  function _seed(now) { return C ? C.seedOf(_day(now)) : 1; }
  function _week(now) { return C ? C.weekKey(now) : ''; }
  function _dateShort(at) {
    var t = (typeof at === 'number') ? at : Date.parse(String(at || ''));
    if (!isFinite(t)) return '';
    var d = new Date(t), m = d.getMonth() + 1, dd = d.getDate();
    return (m < 10 ? '0' : '') + m + '.' + (dd < 10 ? '0' : '') + dd;
  }
  function _state(opts) {
    if (opts && _isObj(opts.state)) return opts.state;
    var st = _try(_core(), 'state', [], null);
    return _isObj(st) ? st : null;
  }
  function _journeyStage() {
    var J = _g('Journey');
    var sm = _try(J, 'summary', [], null);
    return _num(sm && sm.stage, 1) || 1;
  }

  // ── 모델(순수) ─────────────────────────────────────────
  function _titleModel(st, B) {
    var titles = (C && C.TITLES) || [], reps = (B && B.TITLE_REP) || [];
    var idx = -1, rep = _num(st.reputation, 0);
    // 칭호는 평판에서 정한다(core._titleFor와 같은 규칙). 문턱이 없을 때만 저장된 title을 본다
    if (reps.length) { for (var j = 0; j < titles.length && j < reps.length; j++) if (rep >= _num(reps[j], Infinity)) idx = j; }
    else for (var i = 0; i < titles.length; i++) if (titles[i].id === st.title) idx = i;
    if (idx < 0) idx = 0;
    var cur = _num(reps[idx], 0), next = (idx + 1 < reps.length) ? _num(reps[idx + 1], cur) : null;
    var p = (next === null) ? 1 : (next > cur ? (rep - cur) / (next - cur) : 1);
    return {
      id: titles[idx] ? titles[idx].id : 'newbie', name: titles[idx] ? titles[idx].name : '새내기', icon: TITLE_ICON[titles[idx] ? titles[idx].id : ''] || '🏷',
      rep: rep, cur: cur, next: next, nextName: (next !== null && titles[idx + 1]) ? titles[idx + 1].name : null,
      pct: pct(p, next === null ? true : undefined), max: next === null
    };
  }
  // 지역 해금 조건(balance.REGIONS[id].unlock) → [{ text, done, progress }]. 지역은 core.requirements가 장소용이라 여기서 만든다.
  function _regionReqs(id, st, B) {
    var cr = _try(_core(), 'regionRequirements', [id], null);
    if (Array.isArray(cr) && cr.length) return cr.map(function(x) { return { text: String(x && x.text || ''), done: !!(x && x.done), progress: _num(x && x.progress, x && x.done ? 1 : 0) }; });
    var R = B && B.REGIONS && B.REGIONS[id], u = (R && R.unlock) || {};
    var out = [], rep = _num(st.reputation, 0), bank = _num(st.bankroll, 0);
    if (_num(u.bankroll, 0) > 0) out.push({ text: '자산 ' + coins(u.bankroll), done: bank >= u.bankroll, progress: bank / u.bankroll });
    if (_num(u.rep, 0) > 0) out.push({ text: '평판 ' + fmt(u.rep), done: rep >= u.rep, progress: rep / u.rep });
    if (u.stage) { var sg = _journeyStage(); out.push({ text: '여정 ' + u.stage + '단계 도달', done: sg >= u.stage, progress: sg / u.stage }); }
    if (u.lesson) { var ok = !!(st.lessons && st.lessons[u.lesson]); out.push({ text: '커리어 레슨 ' + _lessonName(u.lesson) + ' 완료', done: ok, progress: ok ? 1 : 0 }); }
    return out;
  }
  function _lessonName(id) {
    var L = _g('CAREER_LESSONS');
    if (Array.isArray(L)) for (var i = 0; i < L.length; i++) if (L[i] && L[i].id === id && L[i].title) return String(L[i].title);
    return String(id || '');
  }
  function _venueReqs(id, st, B) {
    var core = _core();
    var r = _try(core, 'requirements', [id], null);
    if (Array.isArray(r) && r.length) return r.map(function(x) { return { text: String(x && x.text || ''), done: !!(x && x.done), progress: _num(x && x.progress, x && x.done ? 1 : 0) }; });
    var V = B && B.VENUES && B.VENUES[id], u = (V && V.unlock) || {};
    var out = [], rep = _num(st.reputation, 0), bank = _num(st.bankroll, 0);
    var needBank = _num(u.bankroll, 0);
    if (needBank <= 0 && V && V.kind === 'cash') needBank = _num(B.BUYIN_BB, 100) * _num(V.rate, 1) * _num(B.BUYIN_RULE, 20);
    out.push({ text: '자산 ' + coins(needBank), done: bank >= needBank, progress: needBank > 0 ? bank / needBank : 1 });
    out.push({ text: '평판 ' + fmt(_num(u.rep, 0)), done: rep >= _num(u.rep, 0), progress: u.rep > 0 ? rep / u.rep : 1 });
    if (u.lesson) { var ok = !!(st.lessons && st.lessons[u.lesson]); out.push({ text: '커리어 레슨 ' + _lessonName(u.lesson) + ' 완료', done: ok, progress: ok ? 1 : 0 }); }
    else if (u.stage) { var sg = _journeyStage(); out.push({ text: '여정 ' + u.stage + '단계 도달', done: sg >= u.stage, progress: sg / u.stage }); }
    else out.push({ text: '지역 ' + _regionName(V && V.region, B) + ' 도착', done: (st.unlocked && st.unlocked.regions || []).indexOf(V && V.region) >= 0, progress: (st.unlocked && st.unlocked.regions || []).indexOf(V && V.region) >= 0 ? 1 : 0 });
    return out;
  }
  // 남은 조건을 앞에(F6 보정 뒤 자산 조건은 대개 이미 채워져 있어, 막대 맨 위가 '완료'면 정작 남은 평판 줄이 아래로 밀린다). 같은 상태끼리는 원래 순서
  function _unmetFirst(list) {
    return list.map(function(r, i) { return { r: r, i: i }; })
      .sort(function(a, b) { return (a.r.done ? 1 : 0) - (b.r.done ? 1 : 0) || a.i - b.i; })
      .map(function(x) { return x.r; });
  }
  function _regionName(id, B) { var R = B && B.REGIONS && B.REGIONS[id]; return R && R.name ? R.name : String(id || ''); }

  // 라이벌 얼굴: rivals.faces(함수 또는 객체) → CAST의 같은 이름 face → 이모지 글자
  function _face(r) {
    var RV = _mod('rivals'), svg = null;
    if (RV && r.rivalId != null) {
      try {
        if (typeof RV.face === 'function') svg = RV.face(r.rivalId);
        if (typeof svg !== 'string' || svg.indexOf('<svg') !== 0) {
          var fm = (typeof RV.faces === 'function') ? RV.faces(r.rivalId, r) : RV.faces;
          if (typeof fm === 'string') svg = fm;
          else if (_isObj(fm)) svg = fm[r.rivalId];
        }
      } catch (e) { svg = null; }
    }
    if (typeof svg === 'string' && svg.indexOf('<svg') === 0) return svg;
    var cast = _g('CAST');
    if (Array.isArray(cast)) for (var i = 0; i < cast.length; i++) {
      var c = cast[i];
      if (c && (c.name === r.name || c.key === r.rivalId) && typeof c.face === 'string') return c.face;
    }
    return '<span class="j-career-face-ic" aria-hidden="true">' + _esc(r.icon || (r.name ? String(r.name).charAt(0) : '?')) + '</span>';
  }
  function _rivals(venueId, st, now) {
    var RV = _mod('rivals');
    var list = _try(RV, 'roster', [venueId, _seed(now), st], null);
    if (!Array.isArray(list)) return [];
    // (웨이브1 통합) 오늘 라이벌 출현 이벤트의 라이벌이 이 테이블에 앉으면 얼굴 맨 앞(이벤트 띠와 얼굴이 맞게)
    var evRival = (st.events && st.events.day === _day(now) && st.events.id === 'rival') ? st.events.rival : null;
    if (evRival) list = list.filter(function(r) { return r && r.rivalId === evRival && !r.hidden; }).concat(list.filter(function(r) { return !(r && r.rivalId === evRival && !r.hidden); }));
    return list.slice(0, MAX_FACES).map(function(r) {
      r = r || {};
      var hidden = !!r.hidden;
      return { name: hidden ? '손님' : String(r.name || '손님'), hidden: hidden, face: hidden ? '<span class="j-career-face-ic" aria-hidden="true">❓</span>' : _face(r), type: hidden ? '' : String(r.type || '') };
    });
  }
  // (웨이브1 통합) 오늘 적어 둔 이벤트(core.todayEvent, dayRoll이 기록)를 먼저, 아직 안 적었으면 events.today 예측(같은 상태면 같은 결과)
  function _event(st, now) {
    var EV = _mod('events');
    var rec = st.events && st.events.day === _day(now) ? st.events : null;
    if (rec && (!rec.id || rec.id === 'quiet')) return null;
    var e = rec ? _try(_core(), 'todayEvent', [st, now], null) : null;
    if (!_isObj(e)) e = _try(EV, 'today', [_seed(now), st], null);
    if (!_isObj(e)) return null;
    var used = !!(st.events && st.events.day === _day(now) && st.events.used && (!e.id || st.events.id === e.id));
    return { id: e.id || '', icon: String(e.icon || '🎉'), name: String(e.name || e.title || '오늘의 이벤트'), text: String(e.text || e.desc || ''), used: used };
  }
  function _challenges(st, now) {
    var EV = _mod('events');
    var list = _try(EV, 'challenges', [_week(now)], null);
    if (!Array.isArray(list)) return [];
    var mine = (st.challenges && st.challenges.weekKey === _week(now) && Array.isArray(st.challenges.items)) ? st.challenges.items : [];
    return list.slice(0, 3).map(function(c) {
      c = c || {};
      var rec = null;
      for (var i = 0; i < mine.length; i++) if (mine[i] && mine[i].id === c.id) rec = mine[i];
      var need = _isObj(c.need) ? c.need : {};
      var target = _num(c.target != null ? c.target : (c.goal != null ? c.goal : (c.n != null ? c.n : (need.n != null ? need.n : need.hands))), 1) || 1;
      var prog = _num(rec && rec.progress, 0);
      var done = !!(rec && rec.done) || prog >= target;
      var reward = [];
      if (_num(c.reward, 0) > 0) reward.push(coins(c.reward));
      else if (_isObj(c.reward)) { if (_num(c.reward.coins, 0) > 0) reward.push(coins(c.reward.coins)); if (_num(c.reward.rep, 0) > 0) reward.push('평판 ' + fmt(c.reward.rep)); }
      if (_num(c.rep, 0) > 0) reward.push('평판 ' + fmt(c.rep));
      return { id: c.id || '', icon: String(c.icon || '🎯'), name: String(c.name || c.title || c.text || '챌린지'), progress: Math.min(prog, target), target: target,
        done: done, pct: pct(target > 0 ? prog / target : 0, done), reward: reward.join(', ') };
    });
  }
  function _trophies(st) {
    var ids = (C && C.TROPHIES) || [], meta = (C && C.TROPHY_META) || {};
    var have = {};
    (Array.isArray(st.trophies) ? st.trophies : []).forEach(function(t) { if (t && t.id) have[t.id] = t.at || true; });
    return ids.map(function(id) {
      var m = meta[id] || { icon: '🏅', name: id, text: '' };
      return { id: id, icon: m.icon, name: m.name, text: m.text, got: !!have[id], at: have[id] && have[id] !== true ? _dateShort(have[id]) : '' };
    });
  }
  function _property(st, B) {
    var homes = (C && C.HOMES) || ['studio', 'apartment', 'penthouse'];
    var cur = (st.property && st.property.home) || homes[0];
    var curIdx = Math.max(0, homes.indexOf(cur));
    var cost = (B && B.HOME_COST) || {}, bonus = (B && B.HOME_STIPEND_BONUS) || {};
    var bank = _num(st.bankroll, 0);
    var canBuy = typeof (_core() || {}).buyHome === 'function';
    var inSession = _isObj(st.session);
    return {
      home: cur, meta: HOME_META[cur] || { icon: '🏠', name: cur, text: '' }, bonus: _num(bonus[cur], 0),
      items: Array.isArray(st.property && st.property.items) ? st.property.items.slice() : [],
      list: homes.map(function(id, i) {
        var m = HOME_META[id] || { icon: '🏠', name: id, text: '' }, c = _num(cost[id], 0);
        var status = (i <= curIdx) ? 'owned' : (bank >= c ? 'buyable' : 'locked');
        // (웨이브2 후속, 결정 49) core.buyHome이 있으면 다음 단계 집에 구매 버튼. 자산이 모자라거나 세션 중이면 비활성 + 이유
        var isNext = i === curIdx + 1;
        var why = !isNext ? '' : (inSession ? '세션 중에는 살 수 없어요' : (status === 'buyable' ? '' : coins(Math.max(0, c - bank)) + ' 더 필요'));
        return { id: id, icon: m.icon, name: m.name, text: m.text, cost: c, bonus: _num(bonus[id], 0), status: status, next: isNext,
          need: Math.max(0, c - bank), canBuy: canBuy && status === 'buyable' && isNext && !inSession, showBuy: canBuy && isNext, why: why };
      })
    };
  }
  function _log(st) {
    // 최신 먼저: at(ISO 또는 ms)이 있으면 그 시각순, 없으면 저장 순서(뒤가 최신)
    var L = (Array.isArray(st.log) ? st.log : []).map(function(x, i) { return { x: x || {}, i: i, t: (typeof (x && x.at) === 'number') ? x.at : Date.parse(String((x && x.at) || '')) }; });
    L.sort(function(a, b) { var ta = isFinite(a.t) ? a.t : -Infinity, tb = isFinite(b.t) ? b.t : -Infinity; return (tb - ta) || (b.i - a.i); });
    return L.slice(0, MAX_LOG).map(function(e) {
      var x = e.x;
      var d = (typeof x.delta === 'number' && isFinite(x.delta)) ? x.delta : null;
      return { at: _dateShort(x.at), icon: LOG_ICON[x.kind] || '•', text: String(x.text || ''), delta: d,
        deltaText: d === null ? '' : ((d > 0 ? '▲ +' : (d < 0 ? '▼ -' : '')) + fmt(Math.abs(d))) };
    });
  }
  function _venue(id, st, B, now, stake, inSession) {
    var V = (B && B.VENUES && B.VENUES[id]) || { name: id, region: '', kind: 'cash', rate: 1, unlock: {} };
    var unlocked = (st.unlocked && st.unlocked.venues || []).indexOf(id) >= 0;
    var core = _core();
    var ev = core ? _try(core, 'todayEvent', [st, now], null) : null;
    var invited = !unlocked && _isObj(ev) && ev.id === 'highroller' && _isObj(ev.effect) && ev.effect.invite === id && !ev.used;   // (웨이브1 통합) 하이롤러 초청
    var open = unlocked || invited;
    var kind = V.kind || 'cash';
    var buyBB = _num(B && B.BUYIN_BB, 100), rate = _num(V.rate, 1);
    var buyIn1 = kind === 'cash' ? buyBB * rate : _num(V.buyIn, 0);
    var buyIn2 = kind === 'cash' ? buyIn1 * 2 : buyIn1;
    if (core && typeof core.buyInCost === 'function') {   // (웨이브1 통합) 오늘 이벤트 할인이 들어간 바이인(core와 같은 값)
      var c1 = _try(core, 'buyInCost', [id, 1], null), c2 = kind === 'cash' ? _try(core, 'buyInCost', [id, 2], null) : c1;
      if (typeof c1 === 'number' && c1 > 0) buyIn1 = c1;
      if (typeof c2 === 'number' && c2 > 0) buyIn2 = c2;
    }
    var buyIn = kind === 'cash' ? (stake === 2 ? buyIn2 : buyIn1 * stake) : buyIn1;
    var afford = (core && typeof core.canAfford === 'function') ? _try(core, 'canAfford', [id, stake], false) === true : _num(st.bankroll, 0) >= buyIn;
    var tourneyMod = !!_mod('tourney');
    var reason = '';
    if (inSession) reason = '먼저 진행 중인 세션을 마쳐요';
    else if (!afford) reason = '코인이 부족해요(바이인 ' + coins(buyIn) + ')';
    else if (kind !== 'cash' && !tourneyMod) reason = '토너먼트는 다음 업데이트에서 열려요';
    var hiddenN = _num(V.hidden, 0);
    var players = Array.isArray(V.players) ? V.players.join('~') + '인' : (V.players ? V.players + '인' : '');
    var fields = Array.isArray(V.players) && V.players.length > 1 ? V.players.slice() : null;
    var field = fields ? (fields.indexOf(_field) >= 0 ? _field : fields[0]) : null;
    var payouts = Array.isArray(V.payouts) ? V.payouts.map(function(p) { return Math.round(p * 100); }).join('/') + '%' : '';
    return {
      id: id, name: String(V.name || id), icon: String(V.icon || '🎲'), kind: kind, kindLabel: KIND_LABEL[kind] || kind, kindIcon: KIND_ICON[kind] || '🎲',
      open: open, invited: invited, here: st.venue === id, rate: rate, buyIn1: buyIn1, buyIn2: buyIn2, buyIn: buyIn,
      inviteOnly: !!V.inviteOnly, adaptive: !!V.adaptive, hidden: hiddenN, players: players, payouts: payouts, fields: fields, field: field,
      reqs: open ? [] : _unmetFirst(_venueReqs(id, st, B)).map(function(r) { return { text: r.text, done: r.done, pct: pct(r.progress, r.done) }; }),
      rivals: open ? _rivals(id, st, now) : [],
      canStart: open && !reason, reason: reason
    };
  }
  // 화면 모델. opts.region(보는 지역 탭), opts.stake(고른 스테이크)
  function model(st, now, opts) {
    opts = opts || {};
    var B = _bal() || {};
    now = (now == null) ? Date.now() : now;
    var regions = ((C && C.REGIONS) || []).slice().sort(function(a, b) { return _num(B.REGIONS && B.REGIONS[a] && B.REGIONS[a].order, 0) - _num(B.REGIONS && B.REGIONS[b] && B.REGIONS[b].order, 0); });
    var unlockedR = (st.unlocked && st.unlocked.regions) || [];
    var sel = (opts.region && regions.indexOf(opts.region) >= 0) ? opts.region : (regions.indexOf(st.region) >= 0 ? st.region : regions[0]);
    var stakes = Array.isArray(B.STAKES) && B.STAKES.length ? B.STAKES : [1, 2];
    var stake = (stakes.indexOf(_num(opts.stake, 0)) >= 0) ? _num(opts.stake, 1) : (stakes.indexOf(_num(st.stake, 1)) >= 0 ? _num(st.stake, 1) : stakes[0]);
    var inSession = _isObj(st.session);
    var cost = _num(B.TRAVEL_COST && B.TRAVEL_COST[sel], 0);
    var selOpen = unlockedR.indexOf(sel) >= 0;
    var tabs = regions.map(function(id) {
      var R = (B.REGIONS && B.REGIONS[id]) || { name: id, icon: '📍' };
      return { id: id, name: String(R.name || id), icon: String(R.icon || '📍'), open: unlockedR.indexOf(id) >= 0, here: st.region === id, selected: id === sel };
    });
    var travelReason = '';
    if (!selOpen) travelReason = '잠김';
    else if (st.region === sel) travelReason = '지금 여기';
    else if (inSession) travelReason = '먼저 진행 중인 세션을 마쳐요';
    else if (st.daily && st.daily.travel && st.daily.day === _day(now)) travelReason = '여행은 하루 1번이에요. 내일 다시 갈 수 있어요';
    else if (_num(st.bankroll, 0) < cost) travelReason = '교통비가 부족해요(' + coins(cost) + ')';
    var ses = inSession ? {
      venue: String((B.VENUES && B.VENUES[st.session.venue] && B.VENUES[st.session.venue].name) || st.session.venue || ''), stake: _num(st.session.stake, 1),
      hands: _num(st.session.hands, 0), total: _num(B.SESSION_HANDS, SESSION_HANDS_FALLBACK), kind: KIND_LABEL[st.session.kind] || '', stack: _num(st.session.stack, 0),
      tourney: !!st.session.kind && st.session.kind !== 'cash'
    } : null;
    return {
      day: _day(now), bankroll: _num(st.bankroll, 0), title: _titleModel(st, B), stats: st.stats || {},
      hands: _num(B.SESSION_HANDS, SESSION_HANDS_FALLBACK), stakes: stakes, stake: stake, session: ses,
      tabs: tabs, region: { id: sel, name: _regionName(sel, B), icon: String((B.REGIONS && B.REGIONS[sel] && B.REGIONS[sel].icon) || '📍'), open: selOpen, here: st.region === sel,
        cost: cost, canTravel: !travelReason, travelReason: travelReason,
        reqs: selOpen ? [] : _regionReqs(sel, st, B).map(function(r) { return { text: r.text, done: r.done, pct: pct(r.progress, r.done) }; }) },
      venues: ((C && C.VENUES) || []).filter(function(id) { return B.VENUES && B.VENUES[id] && B.VENUES[id].region === sel; })
        .map(function(id) { return _venue(id, st, B, now, stake, inSession); }),
      event: _event(st, now), challenges: _challenges(st, now), trophies: _trophies(st), property: _property(st, B), log: _log(st), lessons: _lessons(st)
    };
  }

  // ── HTML(순수) ─────────────────────────────────────────
  function _bar(label, p, done, extra) {
    return '<div class="j-career-req' + (done ? ' is-done' : '') + '" role="group" aria-label="' + _esc(label) + ' ' + p + '%' + (done ? ' 완료' : '') + '">' +
      '<span class="j-career-req-t"><span class="j-career-req-ic" aria-hidden="true">' + (done ? '✓' : '○') + '</span> ' + _esc(label) + '</span>' +
      '<span class="j-career-bar" aria-hidden="true"><i style="width:' + p + '%"></i></span>' +
      '<span class="j-career-req-p">' + (done ? '완료' : p + '%') + (extra ? ' ' + _esc(extra) : '') + '</span></div>';
  }
  function _headHTML(m) {
    var t = m.title;
    var repText = t.max ? '최고 칭호예요' : '다음 칭호 ' + _esc(t.nextName) + '까지 ' + fmt(Math.max(0, t.next - t.rep));
    return '<section class="j-card j-career-head" aria-label="내 커리어">' +
      '<div class="j-career-head-row">' +
        '<div class="j-career-bank"><span class="j-career-k">💰 자산</span><b class="j-career-bank-v">' + _esc(coins(m.bankroll)) + '</b></div>' +
        '<div class="j-career-title"><span class="j-career-k">🏷 칭호</span><b>' + _esc(t.icon + ' ' + t.name) + '</b></div>' +
      '</div>' +
      '<div class="j-career-rep" role="group" aria-label="평판 ' + t.rep + ', ' + _esc(repText) + '">' +
        '<span class="j-career-k">⭐ 평판 <b>' + fmt(t.rep) + '</b></span>' +
        '<span class="j-career-bar is-rep" aria-hidden="true"><i style="width:' + t.pct + '%"></i></span>' +
        '<span class="j-career-rep-n">' + repText + '</span>' +
      '</div>' +
      '<div class="j-career-stats">세션 <b>' + fmt(m.stats.sessions) + '</b>회, 핸드 <b>' + fmt(m.stats.hands) + '</b>, 누적 <b class="' + (_num(m.stats.net, 0) >= 0 ? 'is-plus' : 'is-minus') + '">' +
        (_num(m.stats.net, 0) >= 0 ? '+' : '-') + _esc(coins(Math.abs(_num(m.stats.net, 0)))) + '</b></div>' +
      '</section>';
  }
  function _sessionHTML(m) {
    if (!m.session) return '';
    var s = m.session;
    return '<section class="j-card j-career-session" aria-label="진행 중인 세션">' +
      '<div class="j-card-t">⏳ 진행 중인 세션</div>' +
      '<div class="j-card-d">' + _esc(s.venue) + (s.kind ? ', ' + _esc(s.kind) : '') +
        (s.tourney ? ', ' + s.hands + '핸드째' : ', 스테이크 x' + s.stake + ', ' + s.hands + '/' + s.total + '핸드') +
        (s.stack ? ', 스택 ' + Math.round(s.stack) + 'bb' : '') + (s.tourney ? '. 끝까지 치면 순위대로 상금을 받아요.' : '. 마치면 자산에 정산돼요.') + '</div>' +
      '<div class="j-card-acts"><button type="button" class="j-btn j-primary j-career-resume" onclick="CareerMap.resume()">▶ 이어서 치기</button></div></section>';
  }
  function _tabsHTML(m) {
    return '<nav class="j-career-tabs" role="tablist" aria-label="지역">' + m.tabs.map(function(t) {
      var cls = 'j-career-tab' + (t.selected ? ' is-selected' : '') + (t.open ? ' is-open' : ' is-locked') + (t.here ? ' is-here' : '');
      var mark = t.here ? '📍' : (t.open ? '🔓' : '🔒');
      return '<button type="button" role="tab" class="' + cls + '" aria-selected="' + (t.selected ? 'true' : 'false') + '" data-region="' + _esc(t.id) + '" onclick="CareerMap.setRegion(\'' + _esc(t.id) + '\')">' +
        '<span class="j-career-tab-ic" aria-hidden="true">' + _esc(t.icon) + '</span><span class="j-career-tab-t">' + _esc(t.name) + '</span>' +
        '<span class="j-career-tab-s">' + mark + ' ' + (t.here ? '지금 여기' : (t.open ? '열림' : '잠김')) + '</span></button>';
    }).join('') + '</nav>';
  }
  function _regionHTML(m) {
    var r = m.region, body;
    if (!r.open) {
      body = '<div class="j-card-d">🔒 아직 잠긴 지역이에요. 조건을 채우면 여행할 수 있어요.</div>' +
        '<div class="j-career-reqs">' + r.reqs.map(function(q) { return _bar(q.text, q.pct, q.done); }).join('') + '</div>';
    } else if (r.here) {
      body = '<div class="j-card-d">📍 지금 여기 있어요. 아래 장소에서 세션을 시작해요.</div>';
    } else {
      body = '<div class="j-card-d">🚗 교통비 ' + _esc(coins(r.cost)) + '. 여행은 하루 1번이고, 도착하면 이 지역 장소에서 칠 수 있어요.</div>' +
        '<div class="j-card-acts"><button type="button" class="j-btn j-career-travel' + (r.canTravel ? ' j-primary' : '') + '"' + (r.canTravel ? '' : ' disabled') +
        ' onclick="CareerMap.travel(\'' + _esc(r.id) + '\')">🚗 여행하기<small>' + _esc(r.canTravel ? coins(r.cost) : r.travelReason) + '</small></button></div>';
    }
    return '<section class="j-card j-career-region' + (r.open ? ' is-open' : ' is-locked') + '" aria-label="지역 ' + _esc(r.name) + '">' +
      '<div class="j-card-t">' + _esc(r.icon + ' ' + r.name) + '</div>' + body + '</section>';
  }
  function _eventHTML(m) {
    var e = m.event;
    if (!e) return '<div class="j-career-event is-none" role="status"><span class="j-career-event-ic" aria-hidden="true">🌤</span><span class="j-career-event-t">오늘은 특별한 이벤트가 없어요. 평소처럼 치면 돼요.</span></div>';
    return '<div class="j-career-event' + (e.used ? ' is-used' : '') + '" role="status"><span class="j-career-event-ic" aria-hidden="true">' + _esc(e.icon) + '</span>' +
      '<span class="j-career-event-t"><b>오늘 이벤트: ' + _esc(e.name) + '</b>' + (e.text ? ' ' + _esc(e.text) : '') + (e.used ? ' (오늘 사용함 ✓)' : '') + '</span></div>';
  }
  function _facesHTML(v) {
    if (!v.rivals.length) return '';
    return '<div class="j-career-faces" aria-label="오늘 와 있는 라이벌"><span class="j-career-k">오늘 와 있어요</span>' + v.rivals.map(function(r) {
      return '<span class="j-career-face' + (r.hidden ? ' is-hidden' : '') + '" title="' + _esc(r.name) + '">' + r.face + '<span class="j-career-face-n">' + _esc(r.name) + '</span></span>';
    }).join('') + '</div>';
  }
  function _venueHTML(v, m) {
    var status = v.here ? '📍 지금 여기' : (v.invited ? '💌 오늘 초대' : (v.open ? '🔓 열림' : '🔒 잠김'));
    var meta = v.kind === 'cash'
      ? '1bb = ' + _esc(coins(v.rate)) + ', 바이인 <span class="j-career-nw">' + _esc(coins(v.buyIn1)) + '(x1)</span>, <span class="j-career-nw">' + _esc(coins(v.buyIn2)) + '(x2)</span>'
      : _esc(v.kindLabel) + (v.players ? ' ' + _esc(v.players) : '') + ', 바이인 ' + _esc(coins(v.buyIn1)) + (v.payouts ? ', 상금 ' + _esc(v.payouts) : '');
    var tags = [];
    if (v.hidden > 0) tags.push('🕶 유형 숨김 ' + (v.hidden >= 5 ? '전원' : v.hidden + '자리'));
    if (v.adaptive) tags.push('🧠 적응형 상대');
    if (v.inviteOnly) tags.push('✉ 초대 전용');
    var body;
    if (v.open) {
      var picks = v.kind === 'cash' ? '<div class="j-career-stakes" role="group" aria-label="스테이크">' + m.stakes.map(function(s) {
        var on = s === m.stake;
        return '<button type="button" class="j-pick j-career-stake' + (on ? ' is-on' : '') + '" aria-pressed="' + (on ? 'true' : 'false') + '" data-stake="' + s + '" onclick="CareerMap.setStake(' + s + ')">x' + s + '<small> ' + _esc(coins(s === 2 ? v.buyIn2 : v.buyIn1 * s)) + '</small></button>';
      }).join('') + '</div>' : '';
      // (웨이브2 후속) MTT 인원 고르기(18인, 36인): 상금 풀 = 인원 x 바이인
      if (v.fields) picks = '<div class="j-career-stakes" role="group" aria-label="참가 인원">' + v.fields.map(function(n) {
        var on = n === v.field;
        return '<button type="button" class="j-pick j-career-stake j-career-field' + (on ? ' is-on' : '') + '" aria-pressed="' + (on ? 'true' : 'false') + '" data-field="' + n + '" onclick="CareerMap.setField(' + n + ')">' + n + '인<small> 상금 풀 ' + _esc(coins(n * v.buyIn1)) + '</small></button>';
      }).join('') + '</div>';
      body = picks +
        '<button type="button" class="j-btn j-career-start' + (v.canStart ? ' j-primary' : '') + '"' + (v.canStart ? '' : ' disabled') + ' data-venue="' + _esc(v.id) + '" onclick="CareerMap.start(\'' + _esc(v.id) + '\')">' +
        '▶ 세션 시작(' + m.hands + '핸드)<small>' + _esc(v.canStart ? '바이인 ' + coins(v.buyIn) : v.reason) + '</small></button>';
    } else {
      body = '<div class="j-career-reqs">' + v.reqs.map(function(q) { return _bar(q.text, q.pct, q.done); }).join('') + '</div>';
    }
    return '<article class="j-card j-career-venue' + (v.open ? ' is-open' : ' is-locked') + (v.here ? ' is-here' : '') + '" data-venue="' + _esc(v.id) + '">' +
      '<div class="j-career-venue-h"><span class="j-career-venue-ic" aria-hidden="true">' + _esc(v.icon) + '</span>' +
        '<div class="j-career-venue-n"><b>' + _esc(v.name) + '</b><span>' + _esc(v.kindIcon + ' ' + v.kindLabel) + '</span></div>' +
        '<span class="j-career-status' + (v.here ? ' is-here' : (v.open ? ' is-open' : ' is-locked')) + '">' + status + '</span></div>' +
      '<div class="j-career-venue-m">' + meta + '</div>' +
      (tags.length ? '<div class="j-career-tags">' + tags.map(function(t) { return '<span class="j-career-tag">' + _esc(t) + '</span>'; }).join('') + '</div>' : '') +
      _facesHTML(v) + body + '</article>';
  }
  // (웨이브1 통합) 커리어 레슨 6편(CAREER_LESSONS): 장소와 지역 해금 조건의 레슨을 여기서 연다(전에는 여는 곳이 없었다)
  function _lessons(st) {
    var L = _g('CAREER_LESSONS');
    if (!Array.isArray(L)) return [];
    return L.filter(function(x) { return x && x.id; }).map(function(x) {
      return { id: String(x.id), title: String(x.title || x.id), est: _num(x.est, 0), done: !!(st.lessons && st.lessons[x.id]) };
    });
  }
  function _lessonsHTML(m) {
    if (!m.lessons || !m.lessons.length) return '';
    var done = m.lessons.filter(function(x) { return x.done; }).length;
    return '<section class="j-card j-career-lessons" aria-label="커리어 레슨"><div class="j-card-t">📘 커리어 레슨 <span class="j-career-count">' + done + '/' + m.lessons.length + '</span></div>' +
      '<div class="j-card-d">레슨을 마치면 새 지역과 토너먼트가 열려요.</div>' +
      '<div class="j-career-lesson-list">' + m.lessons.map(function(x) {
        return '<button type="button" class="j-btn j-career-lesson' + (x.done ? ' is-done' : '') + '" data-lesson="' + _esc(x.id) + '" onclick="CareerMap.lesson(\'' + _esc(x.id) + '\')">' +
          '<span class="j-career-lesson-t">' + (x.done ? '✓ ' : '▶ ') + _esc(x.title) + '</span><small>' + (x.done ? '완료, 다시 보기' : (x.est ? '약 ' + x.est + '분' : '')) + '</small></button>';
      }).join('') + '</div></section>';
  }
  function _challengesHTML(m) {
    var inner = m.challenges.length ? '<div class="j-career-ch3">' + m.challenges.map(function(c) {
      return '<div class="j-career-ch' + (c.done ? ' is-done' : '') + '" role="group" aria-label="' + _esc(c.name) + ' ' + c.progress + '/' + c.target + (c.done ? ' 완료' : '') + '">' +
        '<span class="j-career-ch-ic" aria-hidden="true">' + _esc(c.done ? '✓' : c.icon) + '</span><span class="j-career-ch-n">' + _esc(c.name) + '</span>' +
        '<span class="j-career-bar" aria-hidden="true"><i style="width:' + c.pct + '%"></i></span>' +
        '<span class="j-career-ch-p">' + (c.done ? '완료' : c.progress + '/' + c.target) + (c.reward ? ', ' + _esc(c.reward) : '') + '</span></div>';
    }).join('') + '</div>' : '<div class="j-card-d">이번 주 챌린지는 다음 업데이트에서 열려요.</div>';
    return '<section class="j-card j-career-weekly" aria-label="주간 챌린지"><div class="j-card-t">📅 이번 주 챌린지</div>' + inner + '</section>';
  }
  function _trophyHTML(m) {
    var got = m.trophies.filter(function(t) { return t.got; }).length;
    return '<section class="j-card j-career-trophies" aria-label="트로피 룸"><div class="j-card-t">🏆 트로피 룸 <span class="j-career-count">' + got + '/' + m.trophies.length + '</span></div>' +
      '<div class="j-career-tgrid">' + m.trophies.map(function(t) {
        return '<div class="j-career-trophy' + (t.got ? ' is-got' : ' is-locked') + '" role="img" aria-label="' + _esc(t.name) + (t.got ? ' 획득' + (t.at ? ' ' + t.at : '') : ' 미획득') + '" title="' + _esc(t.text) + '">' +
          '<span class="j-career-trophy-ic" aria-hidden="true">' + _esc(t.got ? t.icon : '○') + '</span><span class="j-career-trophy-n">' + _esc(t.name) + '</span>' +
          (t.got ? (t.at ? '<span class="j-career-trophy-d">' + _esc(t.at) + '</span>' : '') : '<span class="j-career-trophy-d">미획득</span>') + '</div>';
      }).join('') + '</div></section>';
  }
  function _propertyHTML(m) {
    var p = m.property;
    return '<section class="j-card j-career-home-sec" aria-label="내 공간"><div class="j-card-t">🏠 내 공간</div>' +
      '<div class="j-career-home-cur"><span class="j-career-home-ic" aria-hidden="true">' + _esc(p.meta.icon) + '</span><div><b>' + _esc(p.meta.name) + '</b><span class="j-card-d">' + _esc(p.meta.text) +
        (p.bonus > 0 ? ' 후원금 +' + _esc(coins(p.bonus)) + '.' : '') + '</span></div></div>' +
      '<div class="j-career-homes">' + p.list.map(function(h) {
        var mark = h.status === 'owned' ? '✓ 보유' : (h.status === 'buyable' ? '🔓 구매 가능' : '🔒 ' + coins(h.need) + ' 더 필요');
        var act = !h.showBuy ? '' : (h.canBuy
          ? '<button type="button" class="j-btn j-career-buy j-primary" onclick="CareerMap.buyHome(\'' + _esc(h.id) + '\')">구매<small>' + _esc(coins(h.cost)) + '</small></button>'
          : '<button type="button" class="j-btn j-career-buy" disabled aria-disabled="true">구매<small>' + _esc(h.why) + '</small></button>');
        return '<div class="j-career-home-row is-' + h.status + '"><span class="j-career-home-ic" aria-hidden="true">' + _esc(h.icon) + '</span>' +
          '<div class="j-career-home-t"><b>' + _esc(h.name) + '</b><span>' + (h.cost > 0 ? _esc(coins(h.cost)) + ', ' : '') + '후원금 +' + _esc(coins(h.bonus)) + '</span></div>' +
          '<span class="j-career-home-s">' + mark + '</span>' + act + '</div>';
      }).join('') + '</div>' +
      (p.items.length ? '<div class="j-card-d">외형: ' + _esc(p.items.join(', ')) + '</div>' : '') + '</section>';
  }
  function _logHTML(m) {
    var inner = m.log.length ? '<ul class="j-career-log">' + m.log.map(function(x) {
      return '<li class="j-career-log-row"><span class="j-career-log-d">' + _esc(x.at) + '</span><span class="j-career-log-ic" aria-hidden="true">' + _esc(x.icon) + '</span>' +
        '<span class="j-career-log-t">' + _esc(x.text) + '</span>' + (x.delta === null ? '' : '<span class="j-career-delta ' + (x.delta > 0 ? 'is-plus' : (x.delta < 0 ? 'is-minus' : '')) + '">' + _esc(x.deltaText) + '</span>') + '</li>';
    }).join('') + '</ul>' : '<div class="j-card-d">아직 기록이 없어요. 첫 세션을 시작하면 여기에 쌓여요.</div>';
    return '<section class="j-card j-career-recent" aria-label="최근 기록"><div class="j-card-t">📜 최근 기록</div>' + inner + '</section>';
  }
  function _topHTML() {
    return '<div class="j-sub-top"><button type="button" class="j-back" aria-label="여정 홈으로" onclick="CareerMap.back()">↩</button><h2 class="j-sub-t">🎰 커리어</h2></div>';
  }
  function _noCoreHTML() {
    return '<div class="j-sub j-career-view">' + _topHTML() +
      '<div class="j-card j-career-none"><div class="j-card-t">🚧 준비 중</div>' +
      '<div class="j-card-d">코인을 모아 여러 장소를 여행하며 라이벌과 치는 커리어 모드를 만들고 있어요. 다음 업데이트에서 열려요.</div>' +
      '<div class="j-card-acts"><button type="button" class="j-btn j-primary" onclick="CareerMap.back()">여정 홈으로</button></div></div></div>';
  }
  // opts: { state, now, region, stake }. state가 없으면 core.state(). core도 state도 없으면 안내 카드
  function html(opts) {
    opts = opts || {};
    var st = _state(opts);
    if (!st) return _noCoreHTML();
    var m = model(st, opts.now, { region: opts.region !== undefined ? opts.region : _region, stake: opts.stake !== undefined ? opts.stake : _stake });
    return '<div class="j-sub j-career-view" data-day="' + _esc(m.day) + '">' + _topHTML() +
      _headHTML(m) + _sessionHTML(m) + _tabsHTML(m) + _regionHTML(m) + _eventHTML(m) +
      '<section class="j-career-venues" aria-label="장소">' + (m.venues.length ? m.venues.map(function(v) { return _venueHTML(v, m); }).join('') : '<div class="j-card j-card-d">이 지역에는 아직 장소가 없어요.</div>') + '</section>' +
      _lessonsHTML(m) + _challengesHTML(m) + _trophyHTML(m) + _propertyHTML(m) + _logHTML(m) +
      '<div class="j-career-live" role="status" aria-live="polite"></div></div>';
  }

  // ── 화면 ─────────────────────────────────────────────
  function render(el, opts) {
    el = el || _el;
    var out = html(opts);
    if (!el) return out;
    _el = el;
    el.innerHTML = out;
    return out;
  }
  function _viewEl() {
    var JU = _g('JourneyUI');
    var el = _try(JU, 'viewEl', [], null);
    return (el && typeof el === 'object') ? el : null;
  }
  function open(params, el) {
    if (!el) el = _viewEl();
    var p = params;
    if (typeof p === 'string' && p) {
      if (C && C.REGIONS.indexOf(p) >= 0) p = { region: p };
      else if (C && C.VENUES.indexOf(p) >= 0) p = { venue: p };
      else p = {};
    }
    p = _isObj(p) ? p : {};
    var B = _bal();
    if (p.venue && B && B.VENUES && B.VENUES[p.venue]) p.region = B.VENUES[p.venue].region;
    _region = (p.region && C && C.REGIONS.indexOf(p.region) >= 0) ? p.region : null;
    if (p.stake != null) _stake = _num(p.stake, 0) || null;
    // (웨이브1 통합) 화면에 들어올 때 하루 처리: 후원금(자산이 가장 싼 바이인보다 적으면 하루 1회)과 오늘 이벤트 기록(라이벌 출현, 안개, 할인, 초대)
    _try(_core(), 'dayRoll', [Date.now()], null);
    render(el);
    return true;
  }
  function _live(msg) {
    if (!_el || !msg) return;
    try { var n = _el.querySelector ? _el.querySelector('.j-career-live') : null; if (n) n.textContent = msg; } catch (e) { /* noop */ }
  }
  function _toast(msg) {
    var JU = _g('JourneyUI');
    if (JU && typeof JU.toast === 'function') { try { JU.toast(msg); return; } catch (e) { /* noop */ } }
    _live(msg);
  }
  function setRegion(id) {
    if (!C || C.REGIONS.indexOf(id) < 0) return false;
    _region = id;
    if (_el) render(_el);
    return true;
  }
  function setStake(n) {
    var B = _bal() || {};
    var stakes = Array.isArray(B.STAKES) && B.STAKES.length ? B.STAKES : [1, 2];
    n = _num(n, 0);
    if (stakes.indexOf(n) < 0) return false;
    _stake = n;
    if (_el) render(_el);
    return true;
  }
  // (웨이브2 후속) MTT 인원 고르기: 그 장소 players 배열 안의 값만
  function setField(n) {
    var B = _bal() || {};
    n = _num(n, 0);
    var ok = Object.keys(B.VENUES || {}).some(function(id) { var P = B.VENUES[id].players; return Array.isArray(P) && P.indexOf(n) >= 0; });
    if (!ok) return false;
    _field = n;
    if (_el) render(_el);
    return true;
  }
  function _errText(r, fallback) {
    if (r && typeof r === 'object' && typeof r.error === 'string' && r.error) return r.error;
    if (r && typeof r === 'object' && typeof r.reason === 'string' && r.reason) return r.reason;
    return fallback;
  }
  // 세션 시작: 파사드 Career.startSession → table 모듈(core.buyIn 뒤 게임 화면). 실패 문구는 토스트
  function start(venueId) {
    var st = _state();
    if (!st) { _toast('커리어 모듈이 아직 준비되지 않았어요'); return false; }
    var B = _bal() || {};
    var V = B.VENUES && B.VENUES[venueId];
    if (!V) return false;
    if (_isObj(st.session)) { _toast('먼저 진행 중인 세션을 마쳐요'); return false; }
    var m = model(st, Date.now(), { region: _region, stake: _stake });
    var vm = null;
    m.venues.forEach(function(x) { if (x.id === venueId) vm = x; });
    var invitedNow = !!(vm && vm.invited) || (function() {   // 다른 지역 탭의 초대 장소(지역 탭 밖)도 core 기준으로 본다
      var ev = _try(_core(), 'todayEvent', [st, Date.now()], null);
      return _isObj(ev) && ev.id === 'highroller' && _isObj(ev.effect) && ev.effect.invite === venueId && !ev.used;
    })();
    if ((st.unlocked && st.unlocked.venues || []).indexOf(venueId) < 0 && !invitedNow) { _toast('아직 잠긴 장소예요'); return false; }
    var CR = _g('Career');
    if (!CR || typeof CR.startSession !== 'function' || !_mod('table')) { _toast('테이블 연결은 다음 업데이트에서 열려요'); return false; }
    var r = null;
    var fopt = (vm && vm.fields) ? { players: vm.field } : undefined;   // (웨이브2 후속) MTT 인원
    try { r = fopt ? CR.startSession(venueId, m.stake, V.kind || 'cash', fopt) : CR.startSession(venueId, m.stake, V.kind || 'cash'); } catch (e) { _warn('startSession', e); r = null; }
    if (!r || (typeof r === 'object' && r.error)) { _toast(_errText(r, '세션을 시작하지 못했어요. 코인과 조건을 확인해요')); if (_el) render(_el); return false; }
    return true;
  }
  // 진행 중 세션 이어 치기: table.resumeSession이 있으면 그것, 없으면 App.selectVillains('career')(table이 stacksFor/playersSpec으로 복원)
  function resume() {
    var st = _state();
    if (!st || !_isObj(st.session)) { if (_el) render(_el); return false; }
    var T = _mod('table');
    if (T && typeof T.resumeSession === 'function') { try { T.resumeSession(); return true; } catch (e) { _warn('resumeSession', e); } }
    // 토너먼트는 table.startSession이 같은 장소의 열린 세션을 이어 붙인다(tourney.attach, 새 바이인 없음)
    var CR = _g('Career'), ses = st.session;
    if (ses.kind && ses.kind !== 'cash' && T && CR && typeof CR.startSession === 'function') {
      var r = null;
      try { r = CR.startSession(ses.venue, ses.stake, ses.kind); } catch (e) { _warn('startSession', e); r = null; }
      if (r && !(typeof r === 'object' && r.error)) return true;
      _toast(_errText(r, '세션을 이어 치지 못했어요'));
      return false;
    }
    var A = _g('App');
    if (A && typeof A.selectVillains === 'function') { try { A.selectVillains('career'); return true; } catch (e) { _warn('selectVillains', e); } }
    _toast('이어 치기는 테이블 모듈이 있어야 해요');
    return false;
  }
  // (웨이브1 통합) 커리어 레슨 열기: 끝나면(또는 나가면) 커리어 지도로 돌아온다. 완료 기록은 LessonPlayer가 'lesson:done'으로 core에 알린다
  function lesson(id) {
    var LP = _g('LessonPlayer');
    if (!LP || typeof LP.start !== 'function') { _toast('레슨 플레이어가 아직 준비되지 않았어요'); return false; }
    try { return LP.start(String(id), 0, function() { var JU = _g('JourneyUI'); if (JU && typeof JU.view === 'function') JU.view('career'); }) !== false; }
    catch (e) { _warn('lesson', e); return false; }
  }
  function travel(regionId) {
    var st = _state();
    if (!st || !C || C.REGIONS.indexOf(regionId) < 0) return false;
    var core = _core();
    if (!core || typeof core.travel !== 'function') { _toast('여행은 다음 업데이트에서 열려요'); return false; }
    var r = null;
    try { r = core.travel(regionId); } catch (e) { _warn('travel', e); r = null; }
    var ok = r === true || (_isObj(r) && !r.error && r.ok !== false);
    if (ok) { _region = regionId; _toast('🚗 ' + _regionName(regionId, _bal()) + '에 도착했어요'); }
    else _toast(_errText(r, '지금은 여행할 수 없어요'));
    if (_el) render(_el);
    return ok;
  }
  // 집 구매: core.buyHome(id)(웨이브2 후속, 결정 49로 계약에 들어감)가 있을 때만 버튼이 보인다
  function buyHome(id) {
    var core = _core();
    if (!core || typeof core.buyHome !== 'function') { _toast('집 구매는 다음 업데이트에서 열려요'); return false; }
    var r = null;
    try { r = core.buyHome(id); } catch (e) { _warn('buyHome', e); r = null; }
    var ok = r === true || (_isObj(r) && !r.error && r.ok !== false);
    _toast(ok ? '🏠 ' + ((HOME_META[id] || {}).name || id) + '로 옮겼어요' : _errText(r, '아직 살 수 없어요'));
    if (_el) render(_el);
    return ok;
  }
  function back() {
    var JU = _g('JourneyUI');
    if (JU && typeof JU.back === 'function') { JU.back(); return; }
    var A = _g('App');
    if (A && typeof A.showMenu === 'function') A.showMenu();
  }

  // ── 홈 카드(H11 공급자, 파사드 Career.homeCard가 위임) ──
  // "🎰 커리어: 항구 카드룸, 1,240코인, 오늘 이벤트 해피아워 ▸" + 작은 줄(칭호, 평판, 세션 수). core가 없으면 null(홈에 카드 없음)
  function homeCard(jstate, now) {
    var st = _state();
    if (!st) return null;
    var B = _bal() || {};
    now = (now == null) ? Date.now() : now;
    var V = B.VENUES && B.VENUES[st.venue];
    var ev = _event(st, now);
    var t = _titleModel(st, B);
    var parts = [String((V && V.name) || st.venue || '커리어'), coins(st.bankroll)];
    if (ev) parts.push('오늘 이벤트 ' + ev.name);
    var sub = '칭호 ' + t.name + ', 평판 ' + fmt(t.rep) + ', 세션 ' + fmt(st.stats && st.stats.sessions) + '회';
    if (_isObj(st.session)) sub = '⏳ 진행 중인 세션이 있어요. ' + sub;
    return {
      html: '<button type="button" class="j-card j-career-card" onclick="JourneyUI.view(\'career\')" aria-label="커리어 열기">' +
        '<span class="j-career-card-t">🎰 커리어: ' + _esc(parts.join(', ')) + ' ▸</span><span class="j-career-card-s">' + _esc(sub) + '</span></button>',
      emph: true
    };
  }

  var api = {
    homeCard: homeCard, open: open, render: render, html: html, model: model, pct: pct, fmt: fmt, coins: coins,
    setRegion: setRegion, setStake: setStake, setField: setField, start: start, resume: resume, travel: travel, buyHome: buyHome, back: back, lesson: lesson,
    // 테스트용: 보고 있는 지역과 스테이크, 마지막 요소를 되돌린다
    _reset: function() { _el = null; _region = null; _stake = null; _field = null; }
  };
  if (C && typeof C.register === 'function') C.register('map', api);
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
