// journey/career/tourney.js (클라우드 F5 싯앤고와 MTT 구조. 지시문 docs/cloud-tasks/F5.md, 보고 docs/cloud-reports/F5.md)
// 계약: journey/career/contract.js 머리 주석의 tourney 인터페이스. 로드 끝에 CareerContract.register('tourney', api).
//
// ── 구조 ──
//   칩 단위 = 1레벨 bb. 시작 스택 START_BB(balance.TOURNEY, 기본 50)칩. 엔진 블라인드는 고정(1bb)이라 레벨 L에서는
//   칩 ÷ 2^(L-1)을 bb로 넘기고(toEngineStacks), 핸드가 끝나면 bb x 2^(L-1)로 돌려받는다(fromEngineStacks). 미니시즌과 같은 식.
//   레벨은 LEVEL_HANDS(기본 5)핸드마다 하나씩 오르고(levelFor(handNo), handNo는 1부터), 배수는 2의 거듭제곱(multFor).
//   상태는 순수 JSON(함수, 순환 없음)이라 핸드마다 그대로 저장되어 이어 칠 수 있다(table 모듈이 session.tourney에 두고 attach로 복원).
//   t = { v, kind:'sng'|'mtt', players(n), buyIn, pool, seed, tableSize, startChips, levelHands, payouts[비율], prizes[코인],
//         level, mult, handNo(히어로 테이블에서 친 핸드 수), alive, final(한 테이블만 남음), done,
//         entrants:[{ name, type, rivalId?, hidden?, chips, out:null|{ place, hand, level } }](0번은 'Hero'),
//         tables:[[이름 원형 순서], ...](0번이 히어로 테이블), simLevel(다른 테이블을 돌린 마지막 레벨),
//         hero:{ place, prize, bust }, result:null|{ place, prize, n, hands }, log:[{ hand, level, kind, text, name?, place? }](최근 40) }
//   MTT: 히어로 테이블(tables[0])만 실제 플레이. 레벨이 바뀔 때 다른 테이블은 그 레벨의 배수로 LEVEL_HANDS핸드를 GameState 관전
//   헤드리스 루프로 돌린다(Villain.getAction, Math.random을 Drills.rng(seed ^ level)로 바꾸고 try/finally로 되돌림). 그 뒤 테이블을 합치고
//   (ceil(생존 ÷ 6)개, 가장 작은 테이블을 깨서 채움) 크기 차가 2 이상이면 한 명씩 옮긴다. 한 테이블만 남으면 파이널 테이블(실제 플레이).
//   순위: 같은 핸드에 여럿이 떨어지면 핸드 전 칩이 적은 쪽이 낮은 순위. 히어로가 떨어지면 그 자리에서 끝(순위와 상금 확정).
//   이벤트: 'tourney:level' { level, mult }, 'tourney:bust' { name, place }, 'tourney:end' { place, prize, n }.
//   ICM(icm, icmNote)은 Malmuth-Harville 식(순열 20만 개 이하일 때만). 화면 문구는 '참고' 라벨.
// 결정론: 좌석 섞기 Drills.rng(seed ^ K_SEAT), 다른 테이블 시뮬 Drills.rng(seed ^ level), 합치기 Drills.rng(seed ^ K_BAL ^ handNo),
//   덱 시드는 (seed, level, 테이블, 핸드) 해시. simulate(spec, opts)는 히어로 테이블도 봇(Villain.getAction)으로 돌려 같은 시드면 같은 결과.
// 규약: 로드 시 DOM, 저장소 접근 없음(typeof 가드). engine/*, theater/*는 고치지 않는다.
var CareerTourney = (function() {
  var POS6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var TYPES = ['TAG', 'Fish', 'LAG', 'Nit', 'Station', 'Mixed'];
  var NAMES = ['바람', '노을', '파도', '등대', '갈매기', '소라', '조약돌', '모래알', '안개', '별빛', '달무리', '이슬',
    '단풍', '솔방울', '도토리', '산새', '여울', '물결', '나루터', '돛단배', '닻줄', '부표', '그물', '조개',
    '해초', '진주', '산호', '키잡이', '선장', '항해사', '갑판장', '망루', '뱃고동', '밀물', '썰물', '해풍'];
  var DEFAULT_T = { START_BB: 50, LEVEL_HANDS: 5, PAYOUTS: { 6: [0.5, 0.3, 0.2], 18: [0.5, 0.3, 0.2], 36: [0.4, 0.25, 0.15, 0.12, 0.08] }, TABLE_SIZE: 6 };
  var PLAYERS = { sng: [6], mtt: [18, 36] };
  var MAX_LEVEL = 10, LOG_KEEP = 40, HAND_GUARD = 400, ICM_MAX_PERMS = 200000;
  var K_SEAT = 0x7A11, K_HAND = 0x5EED, K_BAL = 0xBA1A, K_HERO = 0x4E40;
  var _cur = null, _quiet = false;

  function _has(o, k) { return !!o && typeof o[k] === 'function'; }
  function _r2(x) { return Math.round(x * 100) / 100; }
  function _clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function _warn(e) { if (typeof console !== 'undefined' && console && console.warn) console.warn('[CareerTourney]', e); }

  // Drills.rng(mulberry32)와 같은 수열. drill-core가 없어도 같은 결과가 나오게 사본을 둔다.
  function _rng(seed) {
    if (typeof Drills !== 'undefined' && _has(Drills, 'rng')) return Drills.rng(seed);
    var a = (seed >>> 0) || 0x9e3779b9;
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function _withRandom(seedOrRnd, fn) {
    if (typeof Theater !== 'undefined' && _has(Theater, 'withSeededRandom')) return Theater.withSeededRandom(seedOrRnd, fn);
    var rnd = typeof seedOrRnd === 'function' ? seedOrRnd : _rng(Number(seedOrRnd) >>> 0);
    var saved = Math.random;
    Math.random = rnd;
    try { return fn(rnd); } finally { Math.random = saved; }
  }
  function _seedOf(x) {
    if (typeof x === 'number' && isFinite(x)) return (Math.floor(x) >>> 0) || 1;
    if (typeof CareerContract !== 'undefined' && _has(CareerContract, 'seedOf')) return CareerContract.seedOf(x);
    var s = String(x == null ? '' : x), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0) || 1;
  }
  // (seed, a, b, c) → 덱 시드(1 이상의 31비트 정수)
  function _handSeed(seed, a, b, c) {
    var r = _rng(((seed >>> 0) ^ Math.imul((a * 4096 + b * 64 + c + 1) >>> 0, 0x9E3779B1) ^ K_HAND) >>> 0);
    return 1 + Math.floor(r() * 2147483646);
  }
  function _shuffle(arr, r) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  function _emit(evt, payload) {
    if (_quiet) return 0;
    if (typeof CareerContract !== 'undefined' && _has(CareerContract, 'emit')) return CareerContract.emit(evt, payload);
    return 0;
  }

  // ── 상수(balance.TOURNEY, 없으면 기본값) ──
  function _T() {
    var B = null;
    if (typeof CareerContract !== 'undefined' && _has(CareerContract, 'mod')) B = CareerContract.mod('balance');
    if (!B && typeof CareerBalance !== 'undefined') B = CareerBalance;
    var src = (B && B.TOURNEY && typeof B.TOURNEY === 'object') ? B.TOURNEY : {};
    var o = {};
    Object.keys(DEFAULT_T).forEach(function(k) { o[k] = src[k] != null ? src[k] : DEFAULT_T[k]; });
    o.START_BB = (Number(o.START_BB) > 0) ? Number(o.START_BB) : DEFAULT_T.START_BB;
    o.LEVEL_HANDS = Math.max(1, Math.floor(Number(o.LEVEL_HANDS)) || DEFAULT_T.LEVEL_HANDS);
    o.TABLE_SIZE = Math.max(2, Math.min(6, Math.floor(Number(o.TABLE_SIZE)) || DEFAULT_T.TABLE_SIZE));
    return o;
  }
  function _playable(type) {
    if (typeof VillainProfiles === 'undefined' || !VillainProfiles) return type || 'TAG';
    if (VillainProfiles[type]) return type;
    return type === 'Station' ? 'Fish' : 'TAG';
  }

  // ── 레벨과 환산 ──
  function levelFor(handNo, levelHands) {
    var h = Math.max(1, Math.floor(Number(handNo)) || 1);
    var per = Math.max(1, Math.floor(Number(levelHands)) || _T().LEVEL_HANDS);
    return Math.min(MAX_LEVEL, 1 + Math.floor((h - 1) / per));
  }
  function multFor(level) { return Math.pow(2, Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(level)) || 1)) - 1); }
  function _t(t) { return (t && typeof t === 'object' && Array.isArray(t.entrants)) ? t : _cur; }
  function _ent(t, name) {
    for (var i = 0; i < t.entrants.length; i++) if (t.entrants[i].name === name) return t.entrants[i];
    return null;
  }
  function _aliveNames(t, table) {
    return (table || []).filter(function(n) { var e = _ent(t, n); return e && !e.out && e.chips > 0; });
  }
  function _aliveCount(t) { return t.entrants.filter(function(e) { return !e.out; }).length; }
  // 히어로 테이블의 살아 있는 좌석 → { 이름: bb }(칩 ÷ 배수). 0인 좌석은 넣지 않는다(엔진은 없는 이름을 100bb로 앉히므로 좌석 목록은 seating()으로)
  function toEngineStacks(t) {
    t = _t(t);
    if (!t) return null;
    var out = {};
    _aliveNames(t, t.tables[0]).forEach(function(n) { out[n] = _ent(t, n).chips / t.mult; });
    return out;
  }
  // 엔진 스택 { 이름: bb } → { 이름: 칩 }(bb x 배수). 왕복(칩 → bb → 칩)은 배수가 2의 거듭제곱이라 정확하다. 0.005bb 미만 부스러기는 0(탈락).
  function fromEngineStacks(stacks, t) {
    t = _t(t);
    var mult = t ? t.mult : 1, out = {};
    Object.keys(stacks || {}).forEach(function(n) {
      var bb = Number(stacks[n]);
      out[n] = (isFinite(bb) && bb >= 0.005) ? bb * mult : 0;
    });
    return out;
  }
  // 1bb를 못 내는 짧은 스택이 블라인드를 내고 음수가 된 상태를 고친다(가진 만큼만 낸 것으로, 극장 _shortBlinds와 같은 식)
  function fixShortBlinds(state) {
    if (!state || !state.names) return state;
    state.names.forEach(function(n) {
      var st = state.stacks[n];
      if (!(st < 0)) return;
      var over = -st;
      state.stacks[n] = 0;
      state.playerBets[n] = Math.max(0, (state.playerBets[n] || 0) - over);
      if (state.totalContrib) state.totalContrib[n] = Math.max(0, (state.totalContrib[n] || 0) - over);
      state.pot = Math.max(0, state.pot - over);
    });
    return state;
  }

  // ── 상금 ──
  function payouts(n) {
    var P = _T().PAYOUTS, keys = Object.keys(P).map(Number).sort(function(a, b) { return a - b; });
    var k = keys[keys.length - 1];
    for (var i = 0; i < keys.length; i++) if (n <= keys[i]) { k = keys[i]; break; }
    return (P[k] || DEFAULT_T.PAYOUTS[6]).slice();
  }
  // prizeTable(n, buyIn) → 코인 배열(정수, 합 = n x buyIn. 반올림 잔돈은 1위에)
  function prizeTable(n, buyIn) {
    var pct = payouts(n), pool = Math.max(0, Math.round(Number(n) * Number(buyIn))) || 0;
    var out = pct.map(function(p) { return Math.floor(pool * p); });
    var sum = out.reduce(function(a, b) { return a + b; }, 0);
    if (out.length) out[0] += pool - sum;
    return out;
  }

  // ── ICM(Malmuth-Harville). stacks: 숫자 배열, pay: 비율 배열 → 상금 풀 대비 지분 배열 | null(너무 많아 계산하지 않음) ──
  function icm(stacks, pay) {
    var st = (stacks || []).map(Number), n = st.length, k = Math.min((pay || []).length, n);
    if (!n || !k || st.some(function(x) { return !(x >= 0) || !isFinite(x); })) return null;
    var perms = 1;
    for (var p = 0; p < k; p++) perms *= (n - p);
    if (perms > ICM_MAX_PERMS) return null;
    var eq = st.map(function() { return 0; });
    var total = st.reduce(function(a, b) { return a + b; }, 0);
    if (!(total > 0)) return eq;
    function rec(rem, prob, depth, sumRem) {
      if (depth >= k || !rem.length || !(sumRem > 0)) return;
      for (var i = 0; i < rem.length; i++) {
        var idx = rem[i];
        if (!(st[idx] > 0)) continue;
        var pi = prob * st[idx] / sumRem;
        eq[idx] += pi * pay[depth];
        if (depth + 1 < k) rec(rem.slice(0, i).concat(rem.slice(i + 1)), pi, depth + 1, sumRem - st[idx]);
      }
    }
    rec(st.map(function(_, i) { return i; }), 1, 0, total);
    return eq.map(function(x) { return Math.round(x * 1e6) / 1e6; });
  }
  function _pct(x) { return Math.round(x * 1000) / 10; }
  // icmNote(stacks{ 이름: 칩 } | 배열(0번이 나), payouts) → '(참고)' 문구. 같은 식으로 icmShares → { 이름: 지분 } | null
  function _stackList(stacks) {
    var names = [], vals = [];
    if (Array.isArray(stacks)) { stacks.forEach(function(v, i) { names.push(i === 0 ? 'Hero' : String(i)); vals.push(Number(v) || 0); }); }
    else if (stacks && typeof stacks === 'object') { Object.keys(stacks).forEach(function(n) { names.push(n); vals.push(Number(stacks[n]) || 0); }); }
    var keep = [];
    vals.forEach(function(v, i) { if (v > 0) keep.push(i); });
    return { names: keep.map(function(i) { return names[i]; }), vals: keep.map(function(i) { return vals[i]; }) };
  }
  function icmShares(stacks, pay) {
    var L = _stackList(stacks), eq = icm(L.vals, pay || payouts(L.vals.length));
    if (!eq) return null;
    var out = {};
    L.names.forEach(function(n, i) { out[n] = eq[i]; });
    return out;
  }
  function icmNote(stacks, pay) {
    var L = _stackList(stacks), hi = L.names.indexOf('Hero');
    if (hi < 0 || L.vals.length < 2) return '(참고) 아직 비교할 스택이 없어요.';
    var total = L.vals.reduce(function(a, b) { return a + b; }, 0), chipPct = _pct(L.vals[hi] / total);
    var eq = icm(L.vals, pay || payouts(L.vals.length));
    if (!eq) return '(참고) 자리가 많을 때는 칩 비중만 봐요. 내 칩 비중은 ' + chipPct + '%예요. ICM은 파이널 테이블부터 보여 드려요.';
    var eqPct = _pct(eq[hi]);
    var hint = chipPct > eqPct + 0.05 ? '큰 스택은 칩 하나의 상금 가치가 작아서 무리한 콜을 줄여요.'
      : (chipPct + 0.05 < eqPct ? '짧은 스택은 칩 하나의 상금 가치가 커서 버티는 것도 값어치가 있어요.' : '칩 비중과 상금 몫이 거의 같아요.');
    return '(참고) 내 칩 비중 ' + chipPct + '%, ICM 상금 몫은 ' + eqPct + '% 정도예요. ' + hint;
  }

  // ── 만들기 ──
  function _players(kind, want) {
    var list = PLAYERS[kind], n = Math.floor(Number(want));
    if (list.indexOf(n) >= 0) return n;
    return list[0];
  }
  function _roster(spec, n, r) {
    var used = { Hero: true }, out = [];
    (Array.isArray(spec.roster) ? spec.roster : []).forEach(function(p) {
      if (!p || typeof p !== 'object' || !p.name || used[p.name] || out.length >= n - 1) return;
      used[p.name] = true;
      var e = { name: String(p.name), type: _playable(p.type), chips: 0, out: null };
      if (p.rivalId != null) e.rivalId = p.rivalId;
      if (p.hidden) e.hidden = true;
      out.push(e);
    });
    var pool = _shuffle(NAMES.slice(), r), k = 0;
    for (var i = 0; i < pool.length && out.length < n - 1; i++) {
      if (used[pool[i]]) continue;
      used[pool[i]] = true;
      out.push({ name: pool[i], type: TYPES[k++ % TYPES.length], chips: 0, out: null });
    }
    for (var j = 1; out.length < n - 1; j++) {
      var nm = '손님 ' + j;
      if (used[nm]) continue;
      used[nm] = true;
      out.push({ name: nm, type: TYPES[k++ % TYPES.length], chips: 0, out: null });
    }
    return _shuffle(out, r);
  }
  function _build(spec) {
    spec = spec || {};
    var kind = spec.kind === 'mtt' ? 'mtt' : 'sng', T = _T();
    var n = _players(kind, spec.players != null ? spec.players : (kind === 'mtt' ? 18 : 6));
    var seed = _seedOf(spec.seed != null ? spec.seed : ('tourney-' + Date.now()));
    var buyIn = Math.max(0, Number(spec.buyIn)) || 0;
    var r = _rng((seed ^ K_SEAT) >>> 0);
    var entrants = [{ name: 'Hero', type: 'Hero', chips: T.START_BB, out: null }].concat(_roster(spec, n, r));
    entrants.forEach(function(e) { e.chips = T.START_BB; });
    var size = T.TABLE_SIZE, count = Math.ceil(n / size), tables = [];
    for (var i = 0; i < count; i++) tables.push([]);
    var others = entrants.slice(1).map(function(e) { return e.name; });
    var heroAt = Math.floor(r() * Math.min(size, n));
    var ring0 = [];
    for (var s = 0; s < Math.min(size, n); s++) ring0.push(s === heroAt ? 'Hero' : others.shift());
    tables[0] = ring0;
    for (var ti = 1; ti < count; ti++) {
      var per = Math.ceil(others.length / (count - ti));
      tables[ti] = others.splice(0, per);
    }
    var pct = payouts(n), prizes = prizeTable(n, buyIn);
    return { v: 1, kind: kind, players: n, buyIn: buyIn, pool: n * buyIn, seed: seed, tableSize: size,
      startChips: T.START_BB, levelHands: T.LEVEL_HANDS, payouts: pct, prizes: prizes,
      level: 1, mult: 1, handNo: 0, alive: n, final: count === 1, done: false,
      entrants: entrants, tables: tables, simLevel: 0,
      hero: { place: null, prize: 0, bust: false }, result: null, log: [] };
  }
  function create(spec) { _cur = _build(spec); return _cur; }
  function attach(state) {
    if (!state || typeof state !== 'object' || !Array.isArray(state.entrants) || !Array.isArray(state.tables)) return null;
    _cur = state;
    return _cur;
  }
  function current() { return _cur; }
  function detach() { _cur = null; }

  function _log(t, kind, text, extra) {
    var e = { hand: t.handNo, level: t.level, kind: kind, text: text };
    if (extra) Object.keys(extra).forEach(function(k) { e[k] = extra[k]; });
    t.log.push(e);
    if (t.log.length > LOG_KEEP) t.log.splice(0, t.log.length - LOG_KEEP);
    return e;
  }

  // ── 좌석(히어로 테이블) ──
  // seating(t, heroPos?) → [{ name, type, pos, chips, bb, hero, rivalId?, hidden? }](원형 순서, 히어로가 탈락했으면 []). heroPos가 없거나 그 인원에 없는 자리면
  //   버튼이 핸드마다 한 칸씩 도는 기본 회전(app.js와 같은 방향: BTN → CO → HJ → UTG → BB → SB).
  function _posList(n) { return n === 2 ? ['BTN', 'BB'] : POS6.slice(6 - n); }
  // 앱(app.js)은 히어로 포지션을 6칸으로 돌리므로 인원이 줄면 그 자리가 P에 없을 수 있다. 그때는 히어로 자리 + SB, BB(3명 이상이면 BTN)를
  //   반드시 넣고 남는 자리는 늦은 포지션(CO, HJ, UTG) 순으로 채운 목록을 쓴다(블라인드가 늘 있고 히어로 자리가 앱과 같다)
  function _posListFor(n, heroPos) {
    var P = _posList(n);
    if (!heroPos || P.indexOf(heroPos) >= 0 || POS6.indexOf(heroPos) < 0) return P;
    var want = [heroPos];
    (n === 2 ? [heroPos === 'BB' ? 'BTN' : 'BB'] : ['SB', 'BB', 'BTN', 'CO', 'HJ', 'UTG']).forEach(function(p) {
      if (want.length < n && want.indexOf(p) < 0) want.push(p);
    });
    return POS6.filter(function(p) { return want.indexOf(p) >= 0; });
  }
  function seating(t, heroPos) {
    t = _t(t);
    if (!t) return [];
    var ring = _aliveNames(t, t.tables[0]), n = ring.length;
    if (n < 2) return [];
    var P = _posListFor(n, heroPos), hi = ring.indexOf('Hero');
    if (hi < 0) return [];
    var hp = heroPos ? P.indexOf(heroPos) : -1;
    if (hp < 0) hp = (((P.indexOf('BTN') - t.handNo) % n) + n) % n;
    return ring.map(function(name, i) {
      var e = _ent(t, name), o = { name: name, type: e.type, pos: P[(hp + (i - hi) + 2 * n) % n], chips: e.chips, bb: e.chips / t.mult, hero: name === 'Hero' };
      if (e.rivalId != null) o.rivalId = e.rivalId;
      if (e.hidden) o.hidden = true;
      return o;
    });
  }
  // nextHand(t) → 다음 핸드 준비 { end, stacks(엔진 bb), seats, level, mult, handNo(다음 핸드 번호), handsToLevel }
  function nextHand(t) {
    t = _t(t);
    if (!t) return null;
    var next = t.handNo + 1, per = t.levelHands;
    return { end: !!t.done, stacks: toEngineStacks(t), seats: seating(t), level: t.level, mult: t.mult, handNo: next,
      handsToLevel: t.level >= MAX_LEVEL ? Infinity : per - ((next - 1) % per) };
  }

  // ── 핸드 반영 ──
  // 엔진 쇼다운이 남긴 잔돈의 임자. 엔진 resolveShowdown은 폴드한 사람의 기여가 생존자 최대 기여보다 클 때(짧은 올인 뒤 블라인드 폴드)
  //   그 초과분을 아무에게도 주지 않는다(engine/game-state.js는 수정 금지 파일, 보고에 제안). 규칙대로 최대 기여 생존자 중 최고 핸드에게 준다.
  //   판정할 수 없는 상태(가짜 상태, 보드 미완성)면 null → 그 테이블 최대 스택.
  function _leakWinners(s) {
    if (!s || !Array.isArray(s.names) || !s.totalContrib || !s.folded) return null;
    var active = s.names.filter(function(n) { return !s.folded[n]; });
    if (active.length < 2) return active.length ? active : null;
    var maxC = 0;
    active.forEach(function(n) { maxC = Math.max(maxC, Number(s.totalContrib[n]) || 0); });
    var elig = active.filter(function(n) { return Math.abs((Number(s.totalContrib[n]) || 0) - maxC) < 1e-9; });
    if (elig.length < 2 || typeof HandEval === 'undefined' || !_has(HandEval, 'evaluate') || !_has(HandEval, 'compareHands') ||
      !Array.isArray(s.board) || s.board.length < 5 || !s.holeCards) return elig;
    var scores = {}, best = null;
    try {
      elig.forEach(function(n) { scores[n] = HandEval.evaluate(s.holeCards[n].concat(s.board)); });
      elig.forEach(function(n) { if (best === null || HandEval.compareHands(scores[n], scores[best]) < 0) best = n; });
      return elig.filter(function(n) { return HandEval.compareHands(scores[n], scores[best]) === 0; });
    } catch (e) { return elig; }
  }
  // _settle(t, names, state) → 탈락 이름 배열(순위 낮은 순). 칩 = bb x 배수. 총량 차이(엔진 반올림 0.01bb 잔돈, 위 누수)는 임자에게 돌려 총량을 지킨다.
  function _settle(t, names, state) {
    var before = {};
    names.forEach(function(n) { var e = _ent(t, n); before[n] = e ? e.chips : 0; });
    var conv = fromEngineStacks(state.stacks, t);
    names.forEach(function(n) { var e = _ent(t, n); if (e && !e.out) e.chips = conv[n] != null ? conv[n] : 0; });
    var expected = t.players * t.startChips, actual = 0;
    t.entrants.forEach(function(e) { actual += e.chips; });
    var diff = expected - actual;
    if (Math.abs(diff) > 1e-9) {
      if (Math.abs(diff) > 1.5 * t.mult) _warn('칩 총량 어긋남 ' + diff);
      var to = (_leakWinners(state) || []).filter(function(n) { var e = _ent(t, n); return e && !e.out && names.indexOf(n) >= 0; });
      if (!to.length) {
        var top = null;
        names.forEach(function(n) { var e = _ent(t, n); if (e && e.chips > 0 && (!top || e.chips > top.chips)) top = e; });
        if (top) to = [top.name];
      }
      to.forEach(function(n) { _ent(t, n).chips += diff / to.length; });
    }
    var bust = names.filter(function(n) { var e = _ent(t, n); return e && !e.out && e.chips <= 0 && before[n] > 0; })
      .sort(function(a, b) { return (before[a] - before[b]) || (names.indexOf(a) - names.indexOf(b)); });
    var aliveNow = _aliveCount(t);
    bust.forEach(function(n, i) { _eliminate(t, n, aliveNow - i); });
    return bust;
  }
  function _eliminate(t, name, place) {
    var e = _ent(t, name);
    if (!e || e.out) return null;
    e.chips = 0;
    e.out = { place: place, hand: t.handNo, level: t.level };
    t.alive = _aliveCount(t);
    _log(t, 'bust', (name === 'Hero' ? '내가' : name + ' 님이') + ' ' + place + '위로 탈락했어요.', { name: name, place: place });
    _emit('tourney:bust', { name: name, place: place });
    return e.out;
  }
  function _dropDead(t) {
    t.tables = t.tables.map(function(tb) { return _aliveNames(t, tb); });
  }
  function _finish(t, place) {
    var prize = place >= 1 && place <= t.prizes.length ? t.prizes[place - 1] : 0;
    t.hero.place = place; t.hero.prize = prize; t.hero.bust = place !== 1;
    t.done = true;
    t.result = { place: place, prize: prize, n: t.players, hands: t.handNo };
    _log(t, 'end', place === 1 ? '우승이에요! 상금 ' + prize + '코인을 받았어요.' : place + '위로 마쳤어요.' + (prize ? ' 상금 ' + prize + '코인이에요.' : ''),
      { place: place, prize: prize });
    _emit('tourney:end', { place: place, prize: prize, n: t.players });
    return t.result;
  }

  // ── 테이블 합치기와 균형(MTT) ──
  function _balance(t, r) {
    _dropDead(t);
    var alive = _aliveCount(t), want = Math.max(1, Math.ceil(alive / t.tableSize));
    while (t.tables.length > want) {
      var bi = -1;
      for (var i = 1; i < t.tables.length; i++) if (bi < 0 || t.tables[i].length <= t.tables[bi].length) bi = i;
      if (bi < 0) break;
      var broken = t.tables.splice(bi, 1)[0];
      _shuffle(broken, r).forEach(function(name) {
        var dest = 0;
        for (var j = 1; j < t.tables.length; j++) if (t.tables[j].length < t.tables[dest].length) dest = j;
        t.tables[dest].splice(Math.floor(r() * (t.tables[dest].length + 1)), 0, name);
      });
      _log(t, 'merge', '테이블이 합쳐졌어요. 남은 테이블 ' + t.tables.length + '개.');
    }
    for (var guard = 0; guard < 64; guard++) {
      var big = 0, small = 0;
      for (var k = 0; k < t.tables.length; k++) {
        if (t.tables[k].length > t.tables[big].length) big = k;
        if (t.tables[k].length < t.tables[small].length) small = k;
      }
      if (t.tables[big].length - t.tables[small].length < 2) break;
      var cand = t.tables[big].filter(function(n) { return n !== 'Hero'; });
      if (!cand.length) break;
      var mv = cand[Math.floor(r() * cand.length)];
      t.tables[big].splice(t.tables[big].indexOf(mv), 1);
      t.tables[small].splice(Math.floor(r() * (t.tables[small].length + 1)), 0, mv);
    }
    var wasFinal = t.final;
    t.final = t.tables.length === 1;
    if (t.final && !wasFinal) _log(t, 'final', '파이널 테이블이에요. 남은 사람 ' + alive + '명.');
    return t;
  }

  // ── 관전 헤드리스 한 핸드(다른 테이블, 그리고 simulate의 히어로 테이블) ──
  function _playHeadless(state, heroBot) {
    var s = state, guard = 0;
    while (guard++ < 300) {
      if (s.handOver || s.street === 'showdown') break;
      if (s.pendingQueue && s.pendingQueue.length) {
        var act = s.names.filter(function(n) { return !s.folded[n]; });
        var live = act.filter(function(n) { return s.stacks[n] > 0; });
        if (act.length >= 2 && live.length <= 1 && live.every(function(n) { return (s.playerBets[n] || 0) >= s.currentBet; })) {
          s = _clone(s); s.pendingQueue = []; continue;
        }
        s = GameState.applyVillainActions(s).newState;
        if (s.waitingForHero) {
          if (!heroBot) throw new Error('관전 상태에 히어로 차례');
          s = heroBot(s);
        }
        continue;
      }
      if (GameState.needsStreetAdvance(s)) { s = GameState.advanceStreet(s); continue; }
      break;
    }
    return GameState.resolveShowdown(s).newState;
  }
  function _tableHand(t, ring, g, seed, heroBot, heroPos) {
    var n = ring.length, P = _posList(n), spec = [], prev = {}, hi = ring.indexOf('Hero');
    var hp = hi >= 0 ? P.indexOf(heroPos) : -1;
    if (hi >= 0 && hp < 0) hp = (((P.indexOf('BTN') - g) % n) + n) % n;
    ring.forEach(function(name, i) {
      var e = _ent(t, name);
      prev[name] = e.chips / t.mult;
      var pos = hi >= 0 ? P[(hp + (i - hi) + 2 * n) % n] : P[(i + g) % n];
      if (name !== 'Hero') spec.push({ name: name, type: _playable(e.type), pos: pos });
    });
    var state = hi >= 0 ? GameState.buildInitialState(spec, P[hp], seed, prev) : GameState.buildInitialState(spec, null, seed, prev, { spectator: true });
    fixShortBlinds(state);
    return _playHeadless(state, heroBot);
  }
  // simOtherTables(level, rnd?, t?) 또는 (t, level, rnd?): 히어로 테이블을 뺀 모든 테이블을 그 레벨 배수로 levelHands핸드 돌리고 탈락을 반영.
  //   Math.random은 rnd(없으면 Drills.rng(seed ^ level))로 바꾸고 끝나면 되돌린다. → { level, hands, busts:[이름] }
  function simOtherTables(a, b, c) {
    var t, level, rnd;
    if (a && typeof a === 'object') { t = a; level = b; rnd = c; } else { t = _cur; level = a; rnd = b; }
    t = _t(t);
    if (!t || typeof GameState === 'undefined' || typeof Villain === 'undefined') return null;
    level = Math.max(1, Math.floor(Number(level)) || t.level);
    var saved = { level: t.level, mult: t.mult }, busts = [], hands = 0;
    t.level = level; t.mult = multFor(level);
    try {
      _withRandom(typeof rnd === 'function' ? rnd : _rng((t.seed ^ level) >>> 0), function() {
        for (var ti = 1; ti < t.tables.length; ti++) {
          for (var h = 0; h < t.levelHands; h++) {
            var ring = _aliveNames(t, t.tables[ti]);
            if (ring.length < 2) break;
            var st = _tableHand(t, ring, h, _handSeed(t.seed, level, ti, h), null);
            hands++;
            busts = busts.concat(_settle(t, ring, st));
          }
        }
      });
    } finally { t.level = saved.level; t.mult = saved.mult; }
    t.simLevel = Math.max(t.simLevel || 0, level);
    _dropDead(t);
    return { level: level, hands: hands, busts: busts };
  }

  // onHandEnd(ctx{ state(엔진 끝 상태), tourney? }) → { state, busts:[이름], level, mult, levelChanged, final, done, place, prize } | null
  function onHandEnd(ctx) {
    var t = _t(ctx && ctx.tourney);
    if (!t || t.done) return null;
    var s = ctx && ctx.state;
    if (!s || !s.stacks) return null;
    var ring = _aliveNames(t, t.tables[0]);
    t.handNo += 1;
    var busts = _settle(t, ring, s);
    var out = { state: t, busts: busts, level: t.level, mult: t.mult, levelChanged: false, final: t.final, done: false, place: null, prize: 0 };
    var hero = _ent(t, 'Hero');
    if (hero.out) {
      _finish(t, hero.out.place);
      out.done = true; out.place = t.hero.place; out.prize = t.hero.prize;
      return out;
    }
    var r = _rng((t.seed ^ K_BAL ^ t.handNo) >>> 0);
    var nextLevel = levelFor(t.handNo + 1, t.levelHands);
    if (nextLevel > t.level) {
      if (t.kind === 'mtt' && t.tables.length > 1) simOtherTables(t, t.level, null);
      if (!hero.out) {
        t.level = nextLevel; t.mult = multFor(nextLevel);
        out.levelChanged = true; out.level = t.level; out.mult = t.mult;
        _log(t, 'level', '레벨 ' + t.level + '. 블라인드가 ' + t.mult + '배가 됐어요.', { mult: t.mult });
        _emit('tourney:level', { level: t.level, mult: t.mult });
      }
    }
    _balance(t, r);
    out.final = t.final;
    t.alive = _aliveCount(t);
    if (t.alive <= 1) {
      _finish(t, 1);
      out.done = true; out.place = 1; out.prize = t.hero.prize;
    }
    return out;
  }

  // ── 시뮬레이션(테스트, 보고, F6 밸런스): 히어로도 봇(Villain.getAction, 유형 opts.heroType 기본 'TAG')으로 끝까지 ──
  function _heroBot(type) {
    return function(s) {
      var toCall = Math.max(0, s.currentBet - (s.playerBets.Hero || 0));
      var v = { name: 'Hero', type: _playable(type), pos: s.players.Hero.pos, holeCards: s.holeCards.Hero };
      var r = null;
      try { r = Villain.getAction(v, s); } catch (e) { r = null; }
      var a = r && r.action;
      if (a === 'fold') return GameState.applyHeroAction(s, toCall > 0 ? 'fold' : 'check', 0);
      if (a === 'raise' || a === '3bet' || a === 'bet') {
        var ns = GameState.applyHeroAction(s, 'raise', Number(r.amount) || 0);
        if (!ns.actionError) return ns;
      }
      return GameState.applyHeroAction(s, toCall > 0 ? 'call' : 'check', 0);
    };
  }
  // simulate(spec, opts{ heroType?, silent?(기본 true, 이벤트를 내지 않음) }) → { state, hands, place, prize, level, levels[] }
  function simulate(spec, opts) {
    opts = opts || {};
    if (typeof GameState === 'undefined' || typeof Villain === 'undefined') return null;
    var t = _build(spec), bot = _heroBot(opts.heroType || 'TAG'), wasQuiet = _quiet, levels = [];
    _quiet = opts.silent !== false;
    try {
      for (var guard = 0; guard < HAND_GUARD && !t.done; guard++) {
        var ring = _aliveNames(t, t.tables[0]);
        if (ring.length < 2) { _balance(t, _rng((t.seed ^ K_BAL ^ t.handNo) >>> 0)); ring = _aliveNames(t, t.tables[0]); if (ring.length < 2) break; }
        var seed = _handSeed(t.seed, 0, 0, t.handNo);
        var st = _withRandom(_rng((seed ^ K_HERO) >>> 0), function() { return _tableHand(t, ring, t.handNo, seed, bot, null); });
        var res = onHandEnd({ state: st, tourney: t });
        if (res && res.levelChanged) levels.push(t.handNo);
      }
      if (!t.done) _finish(t, _ent(t, 'Hero').out ? _ent(t, 'Hero').out.place : 1);
    } finally { _quiet = wasQuiet; }
    return { state: t, hands: t.handNo, place: t.hero.place, prize: t.hero.prize, level: t.level, levels: levels };
  }

  // standings(t) → [{ name, chips, bb, place|null, hero }] 살아 있는 사람은 칩 많은 순, 탈락자는 순위 순
  function standings(t) {
    t = _t(t);
    if (!t) return [];
    var live = t.entrants.filter(function(e) { return !e.out; }).sort(function(a, b) { return b.chips - a.chips; });
    var out = t.entrants.filter(function(e) { return e.out; }).sort(function(a, b) { return a.out.place - b.out.place; });
    return live.concat(out).map(function(e) {
      return { name: e.name, chips: e.chips, bb: Math.round(e.chips / t.mult * 10) / 10, place: e.out ? e.out.place : null, hero: e.name === 'Hero' };
    });
  }
  // status(t) → 화면용 요약
  function status(t) {
    t = _t(t);
    if (!t) return null;
    var hero = _ent(t, 'Hero'), nh = nextHand(t);
    return { kind: t.kind, n: t.players, alive: _aliveCount(t), level: t.level, mult: t.mult, handNo: t.handNo, handsToLevel: nh.handsToLevel,
      tables: t.tables.length, final: t.final, done: t.done, heroChips: hero.chips, heroBB: Math.round(hero.chips / t.mult * 10) / 10,
      place: t.hero.place, prize: t.hero.prize, pool: t.pool, prizes: t.prizes.slice() };
  }

  var api = {
    MAX_LEVEL: MAX_LEVEL, NAMES: NAMES.slice(), TYPES: TYPES.slice(),
    create: create, attach: attach, current: current, detach: detach,
    levelFor: levelFor, multFor: multFor, toEngineStacks: toEngineStacks, fromEngineStacks: fromEngineStacks, fixShortBlinds: fixShortBlinds,
    payouts: payouts, prizeTable: prizeTable, icm: icm, icmShares: icmShares, icmNote: icmNote,
    seating: seating, nextHand: nextHand, onHandEnd: onHandEnd, simOtherTables: simOtherTables, simulate: simulate,
    standings: standings, status: status
  };
  if (typeof CareerContract !== 'undefined' && CareerContract && typeof CareerContract.register === 'function') {
    CareerContract.register('tourney', api);
  }
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
