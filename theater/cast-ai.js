// theater/cast-ai.js (채우는 패키지: M4-P2)
// 계획 선행 극장 AI(설계서 3.3절 핵심 설계 1~4, 부록 E, 계약 T4). 게임 모드 프로필(ai/villain-profiles.js)은 바꾸지 않는다.
// 규칙
//   1. Math.random을 부르지 않는다. 쓰는 난수는 받은 rnd와, 핸드 시작 때 rnd로 미리 굴려 둔 계획 주사위(plan.dice)뿐이다.
//      폴백 Villain.getAction은 그 안에서 Math.random을 쓰므로, rnd가 함수면 폴백 1회 동안만 Math.random을 rnd로 바꿔
//      두고(try/finally 복원) 부른다. rnd가 없으면 (이름, 노드) 해시로 만든 난수를 쓴다.
//   2. assignPlans: Thinking.preflopGrade 등급을 예상 강도(GRADE_CLASS)로 바꿔 계획의 needs.strength와 대조하고, 자리
//      (needs.position 'oop'는 BTN 제외, 'ip'는 SB 제외)로 거른 뒤 캐스트 plan_weights로 1개를 뽑는다(블라인드는 함정 가중에
//      TRAP_BONUS x trap_freq를 더함). 에어 등급(weak)에는 슬로플레이가 후보로 들어가지 않고, 포켓 페어에는 세미블러프
//      압박이 들어가지 않는다. 주사위 13개를 사전 롤한다.
//   3. decide(플랍 뒤): Thinking.strength(약한 페어는 weak)로 계획의 keep, 자리, 주도권을 대조한다. 벗어나면(또는 내 카드로
//      만든 투페어 이상인데 블러프캐치나 팟컨트롤이면, 보드 페어에 얹힌 원페어는 제외) 핸드당 1회 계획을 바꾼다.
//      새 계획은 지금 맞는 계획 중 plan_weights로 다시 뽑고(OOP 중간 이상이면 함정 가중 보너스, 드로우만 세미블러프 압박), 맞는 게 없으면 강도 기준 고정 대상(에어 → 포기,
//      중간과 약한 페어 → 팟컨트롤, 강함 → 밸류 극대화)이다. 기회 전환 1가지: 밸류 극대화가 플랍에서 OOP이고 프리플랍
//      레이저가 뒤에 있으면 주사위 0.65로 체크레이즈 함정으로 바꾼다. 바꾼 노드에서 switched와 '계획 변경' 자막(caption)을 낸다.
//      이미 한 번 바꿨는데 또 안 맞거나, 올인을 마주했으면 Villain.getAction으로 폴백한다(fallback:true, 대사 line은 OFF_LINES). 레이저의 플랍 c벳
//      자리에서 계획이 포기면 엔진 c벳 빈도로 폴백한다(c벳 한 번 뒤 포기).
//   4. decide(프리플랍): 엔진 정책(폴백) + 계획 예외 3가지. 프리미엄이 레이즈를 맞으면 슬로플레이(또는 slowplay_freq)는 콜,
//      주도권이 필요한 계획(3배럴, 벳폴드)은 림프 대신 오픈 레이즈, 3배럴은 CO, BTN, SB에서 폴드 대신 barrel 확률로 스틸.
//   5. 같은 rnd 스트림이면 같은 계획과 같은 결정이 나온다. 계획 노드의 확률 갈림(배럴 지속, 레이즈 여부 등)은 사전 롤
//      주사위를 쓰므로 같은 plan으로 rnd만 바꿔 재표본하면 같은 액션이 나온다. 정책 분포가 필요하면 resample을 쓴다.
//      갈림길(함정 발동, 배럴 지속 또는 멈춤, 리버 콜, 레이즈로 키움, 계획 변경)은 planTurn:true로 표시한다.
//   6. 계획 전환은 plan 객체에 기록하고(from, switched, switchNode, switchStreet, switchWhy), 같은 노드를 다시 물으면(재표본)
//      같은 switched를 돌려준다. 다른 노드에서는 switched가 null이다.
// API(계약 T4)
//   assignPlans(state, castList, rnd) → { 이름: { key, kor, switched:null, orig, grade, dice, p, w } }
//   decide(villain, state, plan, rnd) → { action, amount, phrase, label?, planTurn, switched, planKey, step, fallback,
//     line?, caption? }   (line = 이 걸음의 계획 대사, caption = 계획 변경 자막)
//   foreshadow(planKey, street, rnd) → 문장, options(state, name, planKey, rnd) → 계획키 4개(정답 포함, 섞음)
//   보조: resample(villain, state, plan, rnd), plan(key), classOf(hole, board), grade(hole), candidates(grade, pos, hole?),
//     fits(planKey, cls, ctx, street), context(state, name), paramsFor(castItem|name, type), switchCaption(from, to, why, cls),
//     PLAN_KEYS, GRADE_CLASS
var TheaterAI = (function() {
  var STREETS = ['preflop', 'flop', 'turn', 'river'];
  var POST_ORDER = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];
  var PLAN_KEYS = ['barrel3', 'trap_cr', 'slowplay', 'bet_fold', 'bluffcatch', 'value_max', 'semi_push', 'pot_control', 'give_up'];
  // 프리플랍 등급 → 플랍 뒤 예상 강도(후보 필터용). 에어 등급(weak)에는 nut이 없어 슬로플레이가 빠진다.
  var GRADE_CLASS = {
    premium: ['nut', 'strong', 'medium'],
    good: ['strong', 'medium', 'weak'],
    spec: ['strong', 'draw', 'weak', 'air'],
    weak: ['weak', 'air']
  };
  var DEFAULT_PARAMS = { trap_freq: 0.10, checkraise_freq: 0.08, barrel: 0.5, slowplay_freq: 0.05, bluffcatch_freq: 0.30 };
  var PARAM_KEYS = ['trap_freq', 'checkraise_freq', 'barrel', 'slowplay_freq', 'bluffcatch_freq'];
  // 예측 보기 채움 순서(상황 후보가 3개 미만일 때)
  var NEAR = {
    barrel3: ['semi_push', 'give_up', 'bet_fold', 'bluffcatch'],
    trap_cr: ['slowplay', 'value_max', 'pot_control', 'bluffcatch'],
    slowplay: ['trap_cr', 'value_max', 'pot_control', 'bluffcatch'],
    bet_fold: ['value_max', 'pot_control', 'bluffcatch', 'barrel3'],
    bluffcatch: ['pot_control', 'give_up', 'bet_fold', 'slowplay'],
    value_max: ['slowplay', 'trap_cr', 'bet_fold', 'pot_control'],
    semi_push: ['barrel3', 'give_up', 'pot_control', 'value_max'],
    pot_control: ['bluffcatch', 'bet_fold', 'give_up', 'slowplay'],
    give_up: ['barrel3', 'pot_control', 'bluffcatch', 'semi_push']
  };
  var WHY_KOR = { strength: '손이 바뀌었다', position: '자리가 맞지 않는다', aggressor: '주도권이 맞지 않는다',
    trap: '레이저가 뒤에 있다, 체크하면 벳이 온다', two: '투페어 이상이 됐다, 받기만 하기엔 너무 강하다' };
  var TRAP_BONUS = 100;        // 함정 가중 = plan_weights.trap_cr + TRAP_BONUS x trap_freq (블라인드 배정, OOP 전환)
  var CLS_KOR = { nut: '아주 강한 손이 됐다', strong: '강한 손이 됐다', medium: '중간 손이 됐다', weak: '약한 페어뿐이다',
    draw: '드로우가 생겼다', air: '맞은 게 없다' };

  // ── 데이터 접근(전역은 typeof 가드) ──
  function _plans() { return (typeof THEATER_PLANS !== 'undefined' && Array.isArray(THEATER_PLANS)) ? THEATER_PLANS : []; }
  function plan(key) {
    var list = _plans();
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].key === key) return list[i];
    return null;
  }
  function _castList() { return (typeof CAST !== 'undefined' && Array.isArray(CAST)) ? CAST : []; }
  function _profile(type) {
    if (typeof VillainProfiles === 'undefined' || !VillainProfiles) return null;
    return VillainProfiles[type] || VillainProfiles.TAG || null;
  }

  // ── 난수(rnd가 없을 때만 문자열 해시 시드, Math.random 미사용) ──
  function _hash(s) {
    s = String(s);
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function _mulberry(seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function _rnd(rnd, salt) { return typeof rnd === 'function' ? rnd : _mulberry(_hash(salt)); }
  function _u(rnd) {
    var x = Number(rnd());
    return (x >= 0 && x < 1) ? x : 0;
  }
  function _shuffle(arr, rnd) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(_u(rnd) * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // ── 강도와 상황 ──
  var _RI = '23456789TJQKA';
  function _localGrade(cards) { // Thinking.preflopGrade와 같은 규칙(로드 순서 폴백)
    if (!cards || cards.length < 2) return 'weak';
    var a = _RI.indexOf(cards[0].rank), b = _RI.indexOf(cards[1].rank);
    var hi = Math.max(a, b), lo = Math.min(a, b), suited = cards[0].suit === cards[1].suit;
    if (a === b) return hi >= 9 ? 'premium' : hi >= 5 ? 'good' : 'spec';
    if (hi === 12 && lo === 11) return 'premium';
    if (hi === 12 && lo === 10 && suited) return 'premium';
    if (lo >= 8) return 'good';
    if (hi === 12 && (suited || lo >= 7)) return suited ? 'spec' : 'good';
    if (suited && hi - lo <= 2 && lo >= 2) return 'spec';
    return 'weak';
  }
  function grade(hole) {
    if (typeof Thinking !== 'undefined' && Thinking && typeof Thinking.preflopGrade === 'function') return Thinking.preflopGrade(hole);
    return _localGrade(hole);
  }
  // 플랍 뒤 강도 등급: nut, strong, medium, weak(약한 페어), draw, air. 보드 3장 미만이면 null.
  function classOf(hole, board) {
    if (!board || board.length < 3 || !hole || hole.length < 2) return null;
    var s = null;
    if (typeof Thinking !== 'undefined' && Thinking && typeof Thinking.strength === 'function') s = Thinking.strength(hole, board);
    else if (typeof Villain !== 'undefined' && Villain && Villain._handStrength) s = Villain._handStrength(hole, board);
    if (s === 'weak-pair') return 'weak';
    return s || 'air';
  }
  // 상황: oop = 뒤에 행동할 수 있는 상대가 남음, isPfa = 프리플랍 레이저 본인,
  //   aggr(주도권) = 프리플랍 레이저이거나, 레이저가 없거나 폴드했거나, 마지막 자리에서 모두 체크로 넘겨받음
  //   facing = 이번 스트리트에 콜할 금액이 있음(주도권이 필요한 계획도 벳을 맞은 자리에서는 레이즈나 폴드로 이어 간다)
  function context(state, name) {
    var players = (state && state.players) || {}, folded = (state && state.folded) || {}, stacks = (state && state.stacks) || {};
    var me = players[name] || {};
    var myIdx = POST_ORDER.indexOf(me.pos);
    var names = (state && state.names) || Object.keys(players);
    var behind = names.some(function(n) {
      return n !== name && players[n] && !folded[n] && (stacks[n] == null || stacks[n] > 0) && POST_ORDER.indexOf(players[n].pos) > myIdx;
    });
    var pfa = (state && state.pfAggressor) || null;
    var bets = (state && state.playerBets) || {};
    var facing = ((state && state.currentBet) || 0) > (bets[name] || 0);
    var checkedTo = !behind && !facing;
    return { oop: behind, ip: !behind, facing: facing, isPfa: pfa === name, aggr: pfa === name || !pfa || !!folded[pfa] || checkedTo };
  }
  function _seatOk(P, pos) {
    var need = P.needs && P.needs.position;
    if (need === 'oop') return pos !== 'BTN';
    if (need === 'ip') return pos !== 'SB';
    return true;
  }
  // 핸드 시작 후보: 프리플랍 등급의 예상 강도와 needs.strength가 겹치고 자리가 맞는 계획
  //   hole(선택)이 포켓 페어면 플랍 뒤 강도가 거의 늘 페어 이상이라(보드 투페어에 묻히는 드문 경우만 에어) 예상 강도에서
  //   에어와 드로우를 뺀다(세미블러프 압박이 포켓 페어에 배정되지 않는다).
  function candidates(g, pos, hole) {
    var cls = GRADE_CLASS[g] || GRADE_CLASS.weak;
    if (hole && hole.length >= 2 && hole[0] && hole[1] && hole[0].rank === hole[1].rank) {
      cls = cls.filter(function(s) { return s !== 'air' && s !== 'draw'; });
    }
    return _plans().filter(function(P) {
      var need = (P.needs && P.needs.strength) || [];
      return need.some(function(s) { return cls.indexOf(s) >= 0; }) && _seatOk(P, pos);
    }).map(function(P) { return P.key; });
  }
  // 계획이 지금 맞는지: null이면 맞음, 아니면 이유('strength'|'position'|'aggressor')
  function fits(planKey, cls, ctx, street) {
    var P = typeof planKey === 'string' ? plan(planKey) : planKey;
    if (!P) return 'strength';
    var keep = (P.keep && P.keep[street]) || (P.needs && P.needs.strength) || [];
    if (keep.indexOf(cls) < 0) return 'strength';
    ctx = ctx || {};
    var need = P.needs || {};
    if (need.position === 'oop' && !ctx.oop) return 'position';
    if (need.position === 'ip' && !ctx.ip) return 'position';
    if (need.aggressor === true && !ctx.aggr && !ctx.facing) return 'aggressor'; // 벳을 맞은 자리는 레이즈로 주도권을 잡을 수 있다
    if (need.aggressor === false && ctx.isPfa) return 'aggressor';
    return null;
  }

  // ── 캐스트 파라미터 ──
  function _merge(th) {
    var out = { plan_weights: {} };
    PLAN_KEYS.forEach(function(k) {
      var w = th && th.plan_weights && th.plan_weights[k];
      out.plan_weights[k] = (typeof w === 'number' && w >= 0) ? w : 1;
    });
    PARAM_KEYS.forEach(function(k) {
      var v = th && th[k];
      out[k] = (typeof v === 'number' && v >= 0 && v <= 1) ? v : DEFAULT_PARAMS[k];
    });
    return out;
  }
  // castItem({key|name, type, theater?}) 또는 이름 → 극장 파라미터. 없으면 같은 유형의 CAST, 그래도 없으면 기본값.
  function paramsFor(item, type) {
    var name = (item && typeof item === 'object') ? (item.name || item.key) : item;
    if (item && typeof item === 'object' && item.theater) return _merge(item.theater);
    if (item && typeof item === 'object' && !type) type = item.castType || item.type;
    var list = _castList(), hit = null, i;
    for (i = 0; i < list.length && !hit; i++) if (list[i] && name && (list[i].key === name || list[i].name === name)) hit = list[i];
    for (i = 0; i < list.length && !hit; i++) if (list[i] && type && list[i].type === type) hit = list[i];
    return _merge(hit && hit.theater);
  }

  // ── 핸드 시작: 계획 배정과 주사위 사전 롤 ──
  function _pick(keys, weights, rnd) {
    if (!keys.length) return 'give_up';
    var total = 0;
    keys.forEach(function(k) { total += weights[k] || 0; });
    var x = _u(rnd);
    if (total <= 0) return keys[Math.floor(x * keys.length)];
    var acc = 0, t = x * total;
    for (var i = 0; i < keys.length; i++) {
      acc += weights[keys[i]] || 0;
      if (t < acc && (weights[keys[i]] || 0) > 0) return keys[i];
    }
    for (var j = keys.length - 1; j >= 0; j--) if ((weights[keys[j]] || 0) > 0) return keys[j];
    return keys[keys.length - 1];
  }
  function _roll(rnd) {
    var d = {};
    STREETS.forEach(function(s) { d[s] = [_u(rnd), _u(rnd), _u(rnd)]; });
    d.sw = _u(rnd);
    return d;
  }
  function assignPlans(state, castList, rnd) {
    var out = {};
    if (!state || !state.players) return out;
    rnd = _rnd(rnd, 'assign|' + (state.seed != null ? state.seed : ''));
    var list = (Array.isArray(castList) && castList.length) ? castList
      : (state.names || Object.keys(state.players)).map(function(n) { return { name: n, type: state.players[n] && state.players[n].type }; });
    var seen = {};
    list.forEach(function(c) {
      var name = c && (c.name || c.key);
      var p = name && state.players[name];
      if (!p || p.isHero || name === 'Hero' || seen[name]) return;
      seen[name] = true;
      var hole = (state.holeCards && state.holeCards[name]) || p.holeCards || [];
      var params = paramsFor(c, c.castType || c.type || p.type);
      var g = grade(hole);
      var seat = p.pos || c.pos;
      var wpick = {};
      PLAN_KEYS.forEach(function(k) { wpick[k] = params.plan_weights[k]; });
      if (seat === 'SB' || seat === 'BB') wpick.trap_cr = (wpick.trap_cr || 0) + TRAP_BONUS * params.trap_freq; // 블라인드는 포스트플랍에 거의 늘 OOP
      var key = _pick(candidates(g, seat, hole), wpick, rnd);
      var P = plan(key);
      var prm = {};
      PARAM_KEYS.forEach(function(k) { prm[k] = params[k]; });
      var wts = {};
      PLAN_KEYS.forEach(function(k) { wts[k] = params.plan_weights[k]; });
      out[name] = { key: key, kor: P ? P.kor : key, switched: null, orig: key, grade: g, dice: _roll(rnd), p: prm, w: wts };
    });
    return out;
  }

  // ── 금액 ──
  function _acct(state, name) {
    var have = (state.playerBets && state.playerBets[name]) || 0;
    var stack = (state.stacks && state.stacks[name]) || 0;
    var cb = state.currentBet || 0, pot = state.pot || 0;
    var toCall = Math.max(0, cb - have);
    return { pot: pot, have: have, stack: stack, cb: cb, toCall: toCall, maxTo: have + stack,
      price: toCall > 0 ? toCall / (pot + toCall) : 0, bb: state.bigBlind || 1 };
  }
  function _to(x, a) {
    var to = Math.round(x * 2) / 2;
    if (to >= 0.6 * a.maxTo) to = a.maxTo; // 스택 60% 이상이면 올인으로
    return Math.min(to, a.maxTo);
  }
  function BET(a, frac) { return { action: 'bet', amount: _to(Math.max(a.bb, a.pot * frac), a) }; }
  function RAISE(a, mult) { return { action: 'raise', amount: _to(Math.max(a.cb * mult, a.cb * 2), a) }; }
  function CALL(a) { return { action: 'call', amount: Math.min(a.toCall, a.stack) }; }
  var CHECK = { action: 'check', amount: 0 };
  var FOLD = { action: 'fold', amount: 0 };

  // ── 계획별 실행(플랍 뒤). c = { a, cls, ctx, street, plan, p, d(street, i) } → { r, step, planTurn } ──
  function _made(cls) { return cls === 'nut' || cls === 'strong'; }
  var RUN = {
    barrel3: function(c) {
      var a = c.a, s = c.street, b = c.p.barrel;
      var goTurn = c.d('turn', 0) < b, goRiver = goTurn && c.d('river', 0) < b;
      if (a.toCall === 0) {
        if (s === 'flop') return { r: BET(a, 0.5), step: 'barrel' };
        if (s === 'turn') return goTurn ? { r: BET(a, 0.6), step: 'barrel', planTurn: true } : { r: CHECK, step: 'barrel-stop', planTurn: true };
        return goRiver ? { r: BET(a, 0.75), step: 'barrel', planTurn: true } : { r: CHECK, step: 'barrel-stop', planTurn: goTurn };
      }
      if (a.have === 0 && c.d(s, 1) < b) return { r: RAISE(a, 3), step: 'barrel-raise', planTurn: true };
      if (c.cls === 'draw' && a.price <= 0.3) return { r: CALL(a), step: 'draw-call' };
      return { r: FOLD, step: a.have > 0 ? 'bluff-caught' : 'barrel-fold', planTurn: a.have > 0 };
    },
    trap_cr: function(c) {
      var a = c.a;
      if (a.toCall === 0) return c.street === 'river' ? { r: BET(a, c.cls === 'medium' ? 0.5 : 0.75), step: 'trap-lead' } : { r: CHECK, step: 'trap-check' };
      if (a.have === 0) return { r: RAISE(a, 3), step: 'trap-raise', planTurn: true };
      if (c.cls === 'nut') return { r: RAISE(a, 2.5), step: 'trap-reraise' };
      if (c.cls === 'medium' && a.price > 0.3) return { r: FOLD, step: 'trap-fold' };
      return { r: CALL(a), step: 'trap-call' };
    },
    slowplay: function(c) {
      var a = c.a;
      if (a.toCall === 0) return c.street === 'river' ? { r: BET(a, 0.75), step: 'slow-spring', planTurn: true } : { r: CHECK, step: 'slow-check' };
      if (c.street === 'river' && a.have === 0) return { r: RAISE(a, 3), step: 'slow-spring', planTurn: true };
      if (a.have > 0 && c.cls === 'nut') return { r: RAISE(a, 2.5), step: 'slow-reraise' };
      return { r: CALL(a), step: 'slow-call' };
    },
    bet_fold: function(c) {
      var a = c.a;
      if (a.toCall === 0) return c.street === 'flop' ? { r: BET(a, 0.5), step: 'bf-bet' } : { r: CHECK, step: 'bf-check' };
      if (a.have > 0) return { r: FOLD, step: 'bf-fold', planTurn: true };
      if (a.price <= 0.25) return { r: CALL(a), step: 'bf-call' };
      return { r: FOLD, step: 'bf-fold' };
    },
    bluffcatch: function(c) {
      var a = c.a;
      if (a.toCall === 0) return { r: CHECK, step: 'bc-check' };
      if (a.have > 0) return (c.cls === 'medium' && a.price <= 0.25) ? { r: CALL(a), step: 'bc-call' } : { r: FOLD, step: 'bc-fold' };
      if (a.price <= 0.3 || c.d(c.street, 1) < c.p.bluffcatch_freq) return { r: CALL(a), step: 'bc-call', planTurn: c.street === 'river' };
      return { r: FOLD, step: 'bc-fold', planTurn: true };
    },
    value_max: function(c) {
      var a = c.a, med = c.cls === 'medium';
      if (a.toCall === 0) return { r: BET(a, med ? 0.5 : (c.street === 'flop' ? 0.75 : 0.7)), step: 'vm-bet' };
      if (a.have === 0) {
        if (c.d(c.street, 1) < (c.two ? 0.6 : 0.3) + c.p.checkraise_freq) return { r: RAISE(a, 3), step: 'vm-raise', planTurn: true };
        return { r: CALL(a), step: 'vm-call' };
      }
      if (c.cls === 'nut') return { r: RAISE(a, 2.5), step: 'vm-reraise' };
      if (med && a.price > 0.3) return { r: FOLD, step: 'vm-fold', planTurn: true };
      return { r: CALL(a), step: 'vm-call' };
    },
    semi_push: function(c) {
      var a = c.a, s = c.street, cls = c.cls;
      if (_made(cls)) {
        var v = RUN.value_max(c);
        v.step = 'sp-made';
        return v;
      }
      if (a.toCall === 0) {
        if (cls === 'draw' && s !== 'river') return { r: BET(a, 0.6), step: 'sp-bet' };
        if (s === 'river' && cls === 'air') {
          return c.d('river', 0) < c.p.barrel ? { r: BET(a, 0.7), step: 'sp-bluff', planTurn: true } : { r: CHECK, step: 'sp-giveup', planTurn: true };
        }
        return { r: CHECK, step: 'sp-check' };
      }
      if (cls === 'draw' && s !== 'river') {
        if (a.have === 0 && c.d(s, 1) < 0.5 + 2 * c.p.checkraise_freq) return { r: RAISE(a, 3), step: 'sp-raise', planTurn: true };
        if (a.price <= 0.35) return { r: CALL(a), step: 'sp-call' };
        return { r: FOLD, step: 'sp-fold' };
      }
      if (cls === 'medium' && a.price <= 0.3) return { r: CALL(a), step: 'sp-call' };
      return { r: FOLD, step: 'sp-fold', planTurn: s === 'river' };
    },
    pot_control: function(c) {
      var a = c.a, cls = c.cls;
      if (a.toCall === 0) {
        if (c.street === 'flop' && c.ctx.isPfa && c.d('flop', 0) < c.cbet) return { r: BET(a, 0.33), step: 'pc-small' };
        if (c.street === 'river' && c.ctx.ip && cls === 'medium' && c.d('river', 0) < 0.5) return { r: BET(a, 0.33), step: 'pc-thin' };
        return { r: CHECK, step: 'pc-check' };
      }
      if (a.have > 0) return (cls === 'medium' && a.price <= 0.25) ? { r: CALL(a), step: 'pc-call' } : { r: FOLD, step: 'pc-fold' };
      if (a.price <= (cls === 'medium' ? 0.3 : 0.25)) return { r: CALL(a), step: 'pc-call' };
      if (cls === 'medium' && c.d(c.street, 1) < c.p.bluffcatch_freq) return { r: CALL(a), step: 'pc-call' };
      return { r: FOLD, step: 'pc-fold' };
    },
    give_up: function(c) {
      var a = c.a;
      if (a.toCall === 0) return { r: CHECK, step: 'gu-check' };
      if (c.cls === 'draw' && c.street !== 'river' && a.price <= 0.2) return { r: CALL(a), step: 'gu-call' };
      return { r: FOLD, step: 'gu-fold' };
    }
  };
  var STEP_LINE = { 'trap-raise': 'trigger', 'bf-fold': 'fold', 'barrel-stop': 'stop' };
  // 계획을 따르지 않는 걸음(올인 직면, 핸드당 1회 전환 뒤 또 어긋남)의 대사. 엔진 정책으로 치는데 계획 대사를 붙이면
  // '포기' 계획이 '더 넣지 않는다'고 하면서 밸류 벳을 하는 식으로 말과 행동이 엇갈린다(M4 통합 검증)
  var OFF_LINES = {
    allin: ['올인을 맞았다. 계획보다 지금 손으로 정한다.', '전부 걸라는 말이다. 손 세기로 답한다.', '올인 앞에서는 계획보다 카드가 먼저다.'],
    off: ['처음 생각과 달라졌다. 이제는 손 세기대로 간다.', '계획이 어긋났다. 지금 손에 맞게 친다.', '계획은 여기까지, 이제는 카드가 말하는 대로.']
  };
  function _offLine(kind, d, street) { var ls = OFF_LINES[kind]; return ls[Math.floor(d(street, 2) * ls.length) % ls.length]; }
  var CBET_FALLBACK = { give_up: true, bluffcatch: true };
  var TOO_STRONG = { bluffcatch: true, pot_control: true };
  var STEAL_SEATS = { CO: true, BTN: true, SB: true };

  // 계획 전환 대상: 지금 강도와 상황에 맞는 계획 중에서 캐스트 plan_weights로 다시 고른다(주사위 plan.dice.sw).
  //   OOP의 중간 이상 손은 체크레이즈 함정 가중에 TRAP_BONUS x trap_freq를 더한다. 세미블러프 압박은 드로우일 때만 대상이다.
  //   맞는 후보가 없으면 강도 기준 고정 대상(부록 E: 에어 → 포기, 중간과 약한 페어 → 팟컨트롤, 강함 → 밸류 극대화).
  function _target(cls, ctx, pl, p, street, two) {
    var w = pl.w || (p && p.plan_weights) || {};
    var made = cls === 'medium' || _made(cls);
    var keys = PLAN_KEYS.filter(function(k) {
      if (k === pl.key || !plan(k) || fits(k, cls, ctx, street)) return false;
      if (two && TOO_STRONG[k]) return false;
      return k !== 'semi_push' || cls === 'draw';
    });
    var weights = {};
    keys.forEach(function(k) { weights[k] = (typeof w[k] === 'number' && w[k] > 0) ? w[k] : 0; });
    if (made && ctx.oop && keys.indexOf('trap_cr') >= 0) weights.trap_cr += TRAP_BONUS * ((p && p.trap_freq) || 0);
    var live = keys.filter(function(k) { return weights[k] > 0; });
    if (live.length) {
      var x = (pl.dice && typeof pl.dice.sw === 'number') ? pl.dice.sw : 0.5;
      var total = 0;
      live.forEach(function(k) { total += weights[k]; });
      var acc = 0;
      for (var i = 0; i < live.length; i++) { acc += weights[live[i]]; if (x * total < acc) return live[i]; }
      return live[live.length - 1];
    }
    if (_made(cls)) return 'value_max';
    if (cls === 'medium' || cls === 'weak') return 'pot_control';
    if (cls === 'draw') return 'semi_push';
    return 'give_up';
  }
  // 기회 전환: 밸류 극대화가 플랍에서 OOP이고 프리플랍 레이저가 뒤에 남아 있으면(체크하면 c벳이 온다) 주사위 0.65로 함정으로 바꾼다
  function _pfaBehind(state, name) {
    var pfa = state.pfAggressor, players = state.players || {};
    if (!pfa || pfa === name || (state.folded && state.folded[pfa]) || !players[pfa] || !players[name]) return false;
    return POST_ORDER.indexOf(players[pfa].pos) > POST_ORDER.indexOf(players[name].pos);
  }
  function _trapChance(pl, P, cls, ctx, state, name, street, a) {
    if (street !== 'flop' || P.key !== 'value_max' || !ctx.oop || a.toCall > 0) return false;
    if (fits('trap_cr', cls, ctx, street) || !_pfaBehind(state, name)) return false;
    return !!(pl.dice && pl.dice.sw < 0.65);
  }
  // 두 페어 이상(Thinking.strength가 medium인 투페어와 트립스 포함): 벳을 맞았을 때 레이즈 여부와 전환 사유에 쓴다.
  //   내 카드가 만든 것만 센다. 보드 페어에 내 원페어를 더한 '투페어'(예: K9 on K77, AA on K77)는 원페어라 빼고,
  //   홀카드 두 장이 모두 보드와 짝을 이룬 투페어와 트립스 이상만 넣는다.
  function _twoPlus(cls, hole, board) {
    if (_made(cls)) return true;
    if (cls !== 'medium' || typeof HandEval === 'undefined' || !HandEval || !hole || hole.length < 2 || !board) return false;
    var t = HandEval.evaluate(hole.concat(board)).type;
    if (t <= 7) return true;
    if (t !== 8 || hole[0].rank === hole[1].rank) return false;
    var br = board.map(function(c) { return c.rank; });
    return br.indexOf(hole[0].rank) >= 0 && br.indexOf(hole[1].rank) >= 0;
  }
  function switchCaption(from, to, why, cls) {
    var A = plan(from), B = plan(to);
    var reason = why === 'strength' ? (CLS_KOR[cls] || WHY_KOR.strength) : (WHY_KOR[why] || '');
    return '계획 변경: ' + (A ? A.kor : from) + ' → ' + (B ? B.kor : to) + (reason ? ' (' + reason + ')' : '');
  }
  function _nodeKey(state, name) {
    return [state.street, (state.board || []).length, state.pot, state.currentBet,
      (state.playerBets && state.playerBets[name]) || 0, state.streetBetCount || 0].join('|');
  }
  function _facingAllIn(state, name) {
    var r = state.lastRaiser;
    return !!(r && r !== name && state.stacks && state.stacks[r] === 0);
  }
  function _phrase(type, action, label, rnd) {
    var prof = _profile(type);
    var key = label === '올인' ? 'allin' : action;
    var list = (prof && prof.phrases && prof.phrases[key]) || (action === 'bet' ? ['벳.'] : null);
    if (!list || !list.length) return '...';
    return list[Math.floor(_u(rnd) * list.length)];
  }
  function _fallbackRaw(villain, state, rnd) {
    if (typeof Villain === 'undefined' || !Villain || typeof Villain.getAction !== 'function') {
      var a = _acct(state, villain.name);
      return a.toCall > 0 ? FOLD : CHECK;
    }
    var swap = typeof rnd === 'function';
    var orig = Math.random;
    if (swap) Math.random = rnd;
    try { return Villain.getAction(villain, state); }
    finally { if (swap) Math.random = orig; }
  }

  // decide(villain, state, plan, rnd): 계획 노드면 계획대로, 아니면 Villain.getAction 폴백
  function decide(villain, state, pl, rnd) {
    var name = villain && villain.name;
    var street = (state && state.street) || 'preflop';
    rnd = _rnd(rnd, 'decide|' + name + '|' + _nodeKey(state || {}, name));
    var a = _acct(state, name);
    var P = pl && pl.key ? plan(pl.key) : null;
    var meta = { planTurn: false, switched: null, planKey: P ? pl.key : null, step: null, fallback: false };
    function finish(r, m) {
      var out = { action: r.action, amount: r.amount };
      var label = r.label || (((r.action === 'raise' || r.action === 'bet') && r.amount >= a.maxTo && a.maxTo > a.have) ? '올인' : null);
      out.phrase = r.phrase || _phrase(villain && villain.type, r.action, label, rnd);
      if (label) out.label = label;
      out.planTurn = !!m.planTurn;
      out.switched = m.switched || null;
      out.planKey = m.planKey;
      out.step = m.step;
      out.fallback = !!m.fallback;
      if (m.line) out.line = m.line;
      if (m.caption) out.caption = m.caption;
      return out;
    }
    function fb(step, m) {
      var r = _fallbackRaw(villain, state, rnd);
      m = m || meta;
      m.step = step; m.fallback = true;
      return finish(r, m);
    }
    if (!P) return fb('no-plan');
    var p = pl.p || paramsFor(name, villain && villain.type);
    var dice = function(s, i) {
      var arr = pl.dice && pl.dice[s];
      return (arr && typeof arr[i] === 'number') ? arr[i] : 0.5;
    };

    // 프리플랍: 엔진 정책 + 계획 예외 2가지
    if (street === 'preflop' || !state.board || state.board.length < 3) {
      var f = _fallbackRaw(villain, state, rnd);
      var sbc = state.streetBetCount || 0;
      var g = pl.grade || grade(villain.holeCards || (state.holeCards && state.holeCards[name]));
      if ((f.action === '3bet' || f.action === 'raise') && sbc >= 1 && f.label !== '올인' && g === 'premium' &&
          a.toCall > 0 && a.toCall <= 0.35 * a.stack && (P.key === 'slowplay' || dice('preflop', 0) < (p.slowplay_freq || 0))) {
        return finish(CALL(a), { planTurn: false, switched: null, planKey: pl.key, step: 'pf-flat', fallback: false });
      }
      if (sbc === 0 && f.action === 'call' && a.toCall > 0 && P.needs && P.needs.aggressor === true) {
        var limpers = Math.max(0, Math.round((a.pot - 1.5 * a.bb) / a.bb));
        var pos = (state.players && state.players[name] && state.players[name].pos) || villain.pos;
        var open = { action: 'raise', amount: _to(Math.max(a.cb * 2, (pos === 'BTN' ? 2.5 : 3) * a.bb + limpers * a.bb), a) };
        return finish(open, { planTurn: false, switched: null, planKey: pl.key, step: 'pf-open', fallback: false });
      }
      var spos = (state.players && state.players[name] && state.players[name].pos) || villain.pos;
      if (P.key === 'barrel3' && sbc === 0 && f.action === 'fold' && a.pot <= 1.5 * a.bb + 1e-9 && STEAL_SEATS[spos] &&
          dice('preflop', 1) < (p.barrel || 0)) {
        var steal = { action: 'raise', amount: _to((spos === 'BTN' ? 2.5 : 3) * a.bb, a) };
        return finish(steal, { planTurn: false, switched: null, planKey: pl.key, step: 'pf-steal', fallback: false });
      }
      meta.step = 'preflop'; meta.fallback = true;
      return finish(f, meta);
    }

    // 올인 직면(콜이 곧 올인이거나 상대가 이미 올인): 폴백
    if (a.toCall > 0 && (a.toCall >= a.stack || _facingAllIn(state, name))) { meta.line = _offLine('allin', dice, street); return fb('allin'); }

    var hole = villain.holeCards || (state.holeCards && state.holeCards[name]);
    var cls = classOf(hole, state.board);
    var ctx = context(state, name);
    var node = _nodeKey(state, name);
    if (!pl.switched) {
      var why = fits(P, cls, ctx, street), tgt = null;
      var two = _twoPlus(cls, hole, state.board);
      if (!why && two && TOO_STRONG[P.key]) why = 'two'; // 투페어 이상은 블러프캐치나 팟컨트롤로 두기엔 너무 강하다
      if (why) tgt = _target(cls, ctx, pl, p, street, two);
      else if (_trapChance(pl, P, cls, ctx, state, name, street, a)) { why = 'trap'; tgt = 'trap_cr'; }
      if (tgt) {
        if (tgt !== pl.key && plan(tgt)) {
          pl.from = pl.key;
          pl.key = tgt;
          pl.kor = plan(tgt).kor;
          pl.switched = tgt;
          pl.switchNode = node;
          pl.switchStreet = street;
          pl.switchWhy = why;
          pl.switchCls = cls;
          P = plan(tgt);
        }
      }
    }
    var now = (pl.switched && pl.switchNode === node) ? pl.switched : null;
    meta.planKey = pl.key;
    meta.switched = now;
    if (now) meta.caption = switchCaption(pl.from, pl.switched, pl.switchWhy, pl.switchCls);
    if (fits(P, cls, ctx, street)) { meta.line = _offLine('off', dice, street); return fb('off-plan', meta); } // 이미 한 번 바꿨는데 또 안 맞음
    // 프리플랍 레이저의 플랍 첫 행동(c벳 자리)에서 계획이 포기(또는 블러프캐치)면 엔진 c벳 빈도로 폴백(c벳 한 번 뒤 포기).
    // 팟컨트롤은 같은 c벳 빈도로 작게(팟의 33%) 친다.
    // c벳을 치면 그 걸음의 대사는 lines.cbet('한 번만 먼저 쳐 본다' 류, 계획 이름 '포기'와 벳이 한 화면에서 엇갈리지 않게),
    // 체크면 그 스트리트 대사(M4 통합 검증).
    if (street === 'flop' && ctx.isPfa && a.toCall === 0 && CBET_FALLBACK[P.key]) {
      var rc = _fallbackRaw(villain, state, rnd);
      var lc = (P.lines && P.lines[(rc.action === 'bet' || rc.action === 'raise') ? 'cbet' : 'flop']) || null;
      if (lc && lc.length) meta.line = lc[Math.floor(dice('flop', 2) * lc.length) % lc.length];
      meta.step = 'cbet'; meta.fallback = true;
      return finish(rc, meta);
    }

    var prof = _profile(villain && villain.type) || {};
    var wet = typeof Villain !== 'undefined' && Villain && Villain._isBoardWet && Villain._isBoardWet(state.board);
    var cbet = (prof.cbet && (wet ? prof.cbet.wet : prof.cbet.dry)) || 0.5;
    var res = RUN[P.key]({ a: a, cls: cls, ctx: ctx, street: street, plan: pl, p: p, d: dice, two: _twoPlus(cls, hole, state.board), cbet: cbet });
    var lineKey = STEP_LINE[res.step] || street;
    var lines = (P.lines && P.lines[lineKey]) || null;
    meta.step = res.step;
    meta.planTurn = !!res.planTurn || !!now;
    if (lines && lines.length) meta.line = lines[Math.floor(dice(street, 2) * lines.length) % lines.length];
    return finish(res.r, meta);
  }

  // resample(villain, state, plan, rnd): 계획 사본의 주사위를 rnd로 다시 굴려 decide 1회(원본 plan은 바꾸지 않음).
  //   decide는 계획 노드에서 사전 롤 주사위를 쓰므로 같은 plan으로 재표본하면 늘 같은 액션이 나온다. 관객 입장의
  //   불확실성(정책 분포)을 재려면 이 함수를 rnd만 바꿔 여러 번 부른다(극장 코어 pMax 판정용, 선택).
  function resample(villain, state, pl, rnd) {
    var copy = pl ? JSON.parse(JSON.stringify(pl)) : null;
    rnd = _rnd(rnd, 'resample|' + (villain && villain.name));
    if (copy) {
      var fresh = _roll(rnd);
      copy.dice = copy.dice || {};
      STREETS.forEach(function(s) { copy.dice[s] = fresh[s]; });
      if (!copy.switched) copy.dice.sw = fresh.sw;
    }
    return decide(villain, JSON.parse(JSON.stringify(state)), copy, rnd);
  }

  // foreshadow(planKey, street, rnd): 프리플랍(또는 생략)은 핸드 시작 예고, 플랍 뒤는 그 스트리트 예고
  function foreshadow(planKey, street, rnd) {
    var P = plan(planKey);
    if (!P) return '';
    var list = (street && street !== 'preflop' && P.lines && P.lines[street] && P.lines[street].length) ? P.lines[street] : P.foreshadow;
    if (!list || !list.length) return '';
    var i = typeof rnd === 'function' ? Math.floor(_u(rnd) * list.length) : 0;
    return list[i];
  }

  // options(state, name, planKey, rnd): 지금 스트리트에서 그럴듯한 계획 3개 + 정답, 순서 섞음
  function options(state, name, planKey, rnd) {
    rnd = _rnd(rnd, 'options|' + name + '|' + planKey);
    var ans = plan(planKey) ? planKey : null;
    var pool = [];
    var p = state && state.players && state.players[name];
    var hole = p && ((state.holeCards && state.holeCards[name]) || p.holeCards);
    if (p && hole && hole.length >= 2) {
      var board = state.board || [];
      if (board.length < 3 || state.street === 'preflop') pool = candidates(grade(hole), p.pos, hole);
      else {
        var cls = classOf(hole, board), ctx = context(state, name);
        pool = PLAN_KEYS.filter(function(k) { return !fits(k, cls, ctx, state.street); });
      }
    }
    pool = _shuffle(pool.filter(function(k) { return k !== ans && plan(k); }), rnd);
    var pickd = pool.slice(0, ans ? 3 : 4);
    var fill = (ans && NEAR[ans]) ? NEAR[ans].concat(PLAN_KEYS) : PLAN_KEYS;
    for (var i = 0; i < fill.length && pickd.length < (ans ? 3 : 4); i++) {
      if (fill[i] !== ans && pickd.indexOf(fill[i]) < 0 && plan(fill[i])) pickd.push(fill[i]);
    }
    if (ans) pickd.push(ans);
    return _shuffle(pickd, rnd);
  }

  var api = {
    PLAN_KEYS: PLAN_KEYS, GRADE_CLASS: GRADE_CLASS,
    assignPlans: assignPlans, decide: decide, resample: resample, foreshadow: foreshadow, options: options,
    plan: plan, classOf: classOf, grade: grade, candidates: candidates, fits: fits, context: context,
    paramsFor: paramsFor, switchCaption: switchCaption
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
