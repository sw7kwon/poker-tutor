// theater/theater-core.js (채우는 패키지: M4-P1)
//
// ===== M4 그룹 간 계약 정본 T1~T9 (M4-P0 사전 등록) =====
// 설계서(docs/JOURNEY_DESIGN.md 9절 M4, 7.3절, 부록 E)와 다르면 이 주석이 우선한다.
// 그룹: P1 엔진과 극장 코어, P2 캐스트와 계획과 극장 AI, P3 thinking.js, P4 띵킹 UI, P5 표와 도크와 극장 화면,
//       P6 명장면과 극장 시드 은행, P7 S2 레슨 후반, P8 여정 연결과 today 재미 블록, P9 정확성 이월(아이솔, lossLabel).
// 다른 그룹 모듈 호출은 전부 typeof 가드. 인자를 생략하면 기존 동작 그대로(하위 호환).
//
// T1 엔진(P1, engine/game-state.js)
//   buildInitialState(playersSpec, heroPos, seed, prevStacks, opts): opts.spectator===true면 Hero를 만들지 않는다
//     (players, names, stacks, holeCards에 Hero 없음). heroCards와 heroStack은 undefined, state.spectator=true,
//     heroPos는 무시한다.
//   applyVillainActions(state, opts): opts.stepOne이면 실제 액션 1개를 처리하고 바로 반환한다(폴드나 올인 좌석을
//     건너뛰는 것은 소비만 하고, 처리할 액션이 없으면 villainActions []). opts.decide(villain, state) →
//     {action, amount, phrase?, label?}가 있으면 Villain.getAction 대신 쓴다. villain.holeCards는 호출 전에 채우고,
//     금액 규칙과 강등은 기존과 같다. 각 항목의 potBefore, currentBetBefore, haveBefore는 유지한다.
//     (P1 보강) decide 결과 정규화: 'allin' → 스택 전부 레이즈(라벨 '올인'), 벳 직면 'check' → 'call',
//     공짜 'fold'나 'call' → 'check', 숫자가 아닌 금액 → 0(레이즈면 콜 강등), null이나 모르는 액션 → Villain.getAction.
//     기록 금액은 실제 이동 칩과 같다: 'call'은 min(콜 금액, 스택)(raise-to를 넘겨도), 'fold'와 'check'는 0.
//     올인 좌석 = 스택 0. 짧은 올인 뒤 누가 더 올려도 다시 묻지 않는다(기본 경로 포함, 스택이 다를 때만 차이).
//   resolveShowdown은 Hero가 없어도 돈다(payouts['Hero'] || 0, heroWon false).
//   인자를 생략하면 기존 동작 그대로다.
//
// T2 표와 도크(P5, ui/table.js, ui/mobile-ui.js)
//   state.revealAll이면 모든 좌석이 앞면이다. state.hideTypes면 (유형) 라벨과 _hudHTML style 칩을 숨긴다.
//   state.spectator면 히어로 좌석이 없다. Table.seatCardsHTML(state, name) → string은 순수 함수다.
//   MobileUI.openTab(key)는 'coach'|'chart'|'think'|'review'를 받고, 도크가 없으면 아무것도 하지 않는다.
//
// T3 캐스트와 계획(P2, journey/cast.js, theater/plans.js, ai/villain-profiles.js)
//   CAST 6항목 {key, type, name, icon, tail, bio, unlockStage,
//     theater{plan_weights{계획키:가중}, trap_freq, checkraise_freq, barrel, slowplay_freq, bluffcatch_freq}}.
//     key는 좌석 이름으로 교수 TAG, 불도저 LAG, 햇살 Fish, 바위 Nit, 카멜레온 Mixed, 콜마스터 Station이다
//     (journey-core DEFAULT_CAST와 같음).
//   THEATER_PLANS 9항목 {key, kor, needs{strength[], position?, aggressor?}, steps{flop, turn, river},
//     foreshadow[3개 이상], predictLabel}. key는 barrel3, trap_cr, slowplay, bet_fold, bluffcatch, value_max,
//     semi_push, pot_control, give_up이다.
//   VillainProfiles.Station을 추가한다.
//
// T4 극장 AI(P2, theater/cast-ai.js, Math.random 금지, 받은 rnd만 쓴다)
//   TheaterAI.assignPlans(state, castList, rnd) → {이름:{key, kor, switched:null}}
//   TheaterAI.decide(villain, state, plan, rnd) → {action, amount, phrase?, label?, planTurn:bool, switched:null|계획키}.
//     계획이 맞지 않는 노드에서는 Villain.getAction으로 폴백한다(호출자가 Math.random을 rnd로 바꿔 둔 범위 안에서).
//     계획 전환은 핸드당 1회다.
//   TheaterAI.foreshadow(planKey, street, rnd) → 문장
//   TheaterAI.options(state, name, planKey, rnd) → 계획키 4개(정답 포함, 순서 섞음)
//
// T5 Thinking(P3, engine/thinking.js, 결정론)
//   villainThought(state, name, action, amount, opts): opts.snapshot{potBefore, currentBetBefore, haveBefore}가 있으면
//     toCall = currentBetBefore - haveBefore, 팟 = potBefore로 계산한다. 대사 변형은 opts.rnd가 있으면 그것으로,
//     없으면 (이름, 스트리트, 보드, 액션) 해시로 고른다. 반환 {name, street, text('💭 이름: ' 접두 유지), intent, conf?}.
//   readOf(reader, target, state, opts{action, amount}) → {grade:'strong'|'medium'|'weak'|'air', text}.
//     보드가 3장 미만이면 null이다. state.hideTypes면 유형에 기대는 문구를 쓰지 않는다.
//   진실 등급은 Thinking.strength 기준이다: nut, strong → strong / medium → medium / weak-pair, draw → weak / air → air.
//   (M5-THEATER 보강, 로드맵 결정 사항 14번) opts.table === 'theater'면 극장 계획 AI 실측 읽기 표(Thinking.THEATER_READ)를
//     쓴다. opts.prev = 대상이 이 스트리트에서 먼저 한 액션들이고, 키 checkraise(체크 뒤 레이즈)와 betcall(벳 뒤 콜)을 더
//     나눈다. 실측 비율 45% 미만인 장면(과 리버 체크레이즈)은 null을 돌려준다(읽지 않음). table이 없으면 게임 표 그대로다.
//
// T6 극장 코어(P1, 이 파일)
//   Theater.newEpisode(spec{seed?, cast?, ai?(T4 모양을 주입, 없으면 TheaterAI.decide가 있을 때 그것, 없으면 계획 없이
//     Villain.getAction), now?}) → ep. seed가 없으면 THEATER_SEEDS.items에서 고른다. THEATER_SEEDS가 배열이거나
//     비어 있으면 Drills.rng로 시드를 만든다.
//   ep = {seed, state, cast:[{name, type, pos}], plans, intro:[{name, text}], log:[event], stops, tally{pred, hit, hitW},
//     done, result}
//   Theater.step(ep) → event|null. event = {i, kind:'action'|'street'|'showdown', street, name?, action?, amount?,
//     label?, before(액션 전 상태 사본), snap{potBefore, currentBetBefore, haveBefore, toCall}, pot, decisive,
//     reasons[], pMax, options?{actions[3], plans[4]}, planKey, planTurn, switched, thought{text, intent},
//     foreshadow?, read?{reader, grade, text}, misread?}
//   showdown 다음에는 ep.done=true, ep.result = {winners, payouts, pot, showdown, street, hands{이름:{desc, strength}}}.
//   decisive = (재표본 20회 pMax<0.85, 재표본 rnd는 Drills.rng(seed^k)라 본 스트림을 쓰지 않음)
//     또는 (팟 10bb 이상에서 벳 직면) 또는 planTurn. 핸드당 최대 4회.
//   Theater.predict(ep, event, guess{action?, plan?}) → {hitAction, hitPlan, w=1-p(실제 액션)}
//   Theater.withSeededRandom(seed|rnd, fn)은 try/finally로 Math.random을 되돌린다.
//   Theater.truthGrade(hole, board)는 T5 대응을 쓴다.
//   같은 seed면 log가 같다.
//   (P1 보강, 실제 구현 기준)
//   spec 추가 키: resample(재표본 수, 기본 20, 0이면 규칙 a 생략), readOf(함수 또는 false, 기본 Thinking.readOf),
//     ai:false(극장 AI 없이 Villain.getAction만), revealAll(기본 true → state.revealAll), hideTypes(→ state.hideTypes).
//   좌석: 캐스트 6인(spec.cast, 없으면 CAST 6인, 없으면 Journey.castList(), 없으면 기본 6인)을 Drills.rng(seed^0x3D3D)로
//     섞어 UTG, HJ, CO, BTN, SB, BB에 앉힌다. 좌석 이름 = 캐스트 key. state.players[이름].type은 엔진 프로필
//     (VillainProfiles에 없으면 Station은 Fish, 그 밖은 TAG), state.players[이름].castType과 ep.cast[].type은 설계 유형.
//   스트림: 결정 = Drills.rng(seed)(applyVillainActions 1회마다 Math.random을 이 rnd로 바꾸고 decide에도 같은 rnd),
//     계획 배정 = Drills.rng(seed^0x1F1F), 문장(intro, foreshadow, options) = Drills.rng(seed^0x2E2E),
//     재표본 j번째(1~20) = Drills.rng(seed^(0x10000*(i+1)+j)), i는 이벤트 번호. 재표본은 계획 사본으로 돌린다.
//   intro = 계획이 있는 좌석마다 ai.foreshadow(계획키, 'preflop', 문장 rnd). 계획이 없으면 빈 배열.
//   event 추가 필드: actionKey(예측 키), dist{키:비율}(재표본 분포), phrase(말), capped(규칙은 맞지만 상한 4회라 안 멈춤),
//     board(street와 showdown 이벤트), caption(계획 변경 자막 '계획 변경: A → B (사유)', 전환한 액션에만).
//     foreshadow는 계획이 있는 좌석이 포스트플랍 스트리트에서 처음 움직일 때 붙는다. 극장 AI decide가 line(그 걸음의
//     계획 대사)을 주면 그 말을 쓰고, 계획의 갈림길(planTurn)이면 같은 스트리트 두 번째 움직임에도 붙인다(M4 통합 검증).
//   예측 키(Theater.ACTION_KOR): fold, check, call, raise(이미 벳이 있을 때의 공격), bet_s와 bet_b(아무도 안 친
//     스트리트의 첫 벳, 넣은 칩이 직전 팟의 60% 미만이면 bet_s, 이상이면 bet_b. 60%는 Thinking.readOf와 proThought의
//     '큰 벳' 기준과 같다(같은 화면의 읽기 줄과 예측 칩이 엇갈리지 않게, M4 통합 검증). options.actions = 벳 직면이면
//     [fold, call, raise], 공짜면 [check, bet_s, bet_b], BB 옵션이면 [check, raise]. options.plans =
//     ai.options(액션 전 상태, 이름, 계획키, 문장 rnd), 없으면 [].
//   규칙 b(큰 팟 벳 직면)는 포스트플랍에서만 본다(프리플랍 3벳 팟의 자명한 폴드에서 멈추지 않게). reasons의 키는
//     'pmax', 'bigpot', 'plan'(Theater.REASON_KOR). Theater.isDecisive(info)는 상한 없는 순수 판정이다.
//   계획 전환: decide가 switched(계획키)를 돌려주면 ep.plans[이름]을 {key:새 키, kor, switched:새 키, from:이전 키}로
//     바꾼다(decide가 이미 key를 바꿨으면 그대로 둔다). event.planKey는 이 액션에 적용된 계획(전환 뒤면 새 계획).
//   read: 포스트플랍에서 bet과 raise는 다음에 응답할 상대가, call은 마지막 공격자가 읽는다. readOf opts = {action, amount, label,
//     table:'theater', prev(대상이 이 스트리트에서 먼저 한 액션들)}(M5-THEATER). readOf가 null이면 읽기와 배지가 없다.
//     misread = truthGrade(대상 카드, 보드) !== read.grade(배지는 실제 카드와 다를 때만, 그대로).
//   올인 런아웃: 칩이 남은 생존자가 1명 이하이고 그 사람이 낼 콜 금액이 없으면 남은 액션 없이 스트리트를 하나씩 연다.
//   result 추가: winners = 이번 핸드 순이익이 양수인 좌석, hands{이름:{desc, strength(Thinking.strength 원값), grade,
//     folded}}, board. tally 추가: planPred, planHit. predict는 decisive 액션 이벤트만, 이벤트당 1회만 tally에 넣는다.
//     guess.action 'bet'은 bet_s와 bet_b 둘 다 맞힌 것으로 본다.
//   Theater.run(ep 또는 spec) → ep(끝까지 step), Theater.actionKey(villainActions 항목) → 예측 키.
//   ep는 살아 있는 객체다(내부 상태 _x는 열거되지 않음). JSON 사본으로는 step하지 못하고, UI는 멈춤 동안
//     event.before를, 공개 뒤에는 ep.state를 그린다.
//   속도(node, Villain 경로): 재표본 20회 한 핸드 약 10ms, resample:0이면 약 1.5ms. 시드 은행은 이 값으로 범위를 정한다.
//
// T7 명장면과 은행(P6, theater/highlight.js, theater/seed-bank-data.js, tools/seed-bank.js 극장 부분)
//   Highlight.THRESHOLD=60, Highlight.summary(ep), Highlight.dramaScore(ep|summary) → {score 0~100, parts},
//   Highlight.pick(ep) → card|null(임계 미만이면 null).
//   card = {id:'th-<seed>', seed, title, cast[], board['As',...], pot, eq:[{name, eq}], plan{이름:키}, score}.
//     at은 Journey가 붙인다.
//   THEATER_SEEDS = {meta{version, engineHash, hashFiles, created, generator, range, top, threshold},
//     items:[{seed, score, street, pot}]}
//   CLI: node tools/seed-bank.js --theater, --verify-theater
//
// T8 극장 화면(P5, theater/theater-ui.js, css/theater.css)
//   TheaterUI.open(): 빠른 줄 🎭에서 1편을 보고 여정 홈으로 돌아간다.
//   TheaterUI.start({episodes, onDone(result|null)}): 열지 못하면 onDone(null).
//   TheaterUI.showCard({card, onDone}), TheaterUI.cardHTML(card) → string(순수), TheaterUI.active().
//   result = {episodes, predicted, hit, hitW, cards[]}. 편이 끝날 때마다 Journey.recordTheater를 typeof 가드로 부른다.
//   극장 중 뒤로는 Nav.setBack('screen-game', fn)과 Nav.view('theater')로 극장만 닫는다.
//
// T9 여정 연결(P8, journey/journey-core.js, journey/today.js)
//   Journey.recordTheater({seed, predicted, hit, hitW, card|null}, now) → {xp, card}. 누적한다. 카드는 id가 같으면
//     무시하고, 100장을 넘으면 오래된 것부터 지운다. addXp('theater')와 addXp('theaterHit', 2 x hit),
//     JStats.record('theater', {ep:1, pred, hit}), touchDay를 한다.
//   Journey.highlightOfDay(now) → card|null(날짜 시드).
//
// 머지 뒤 메인 통합 단계(병렬 그룹은 하지 않음): P1, P2, P6 머지 뒤 node tools/seed-bank.js --theater로 은행 500개를
//   만들고 --verify-theater를 돌려 커밋한다. 극장 AI 1000핸드 지표(포스트플랍 레이즈 8% 이상, 함정 3% 이상)는
//   관전 6인으로 다시 잰다. mobile-check에 theater 장면을 추가한다.
// ===== 계약 끝 =====
// 로드 시 DOM과 Math.random을 건드리지 않는다. 다른 모듈(GameState, Villain, Thinking, TheaterAI, Drills,
// THEATER_SEEDS, CAST, Journey, HandEval, Range)은 호출 시점에 typeof 가드로 찾는다.
var Theater = (function() {
  var POS6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var RESAMPLE = 20, PMAX = 0.85, BIG_POT_BB = 10, MAX_STOPS = 4, MAX_EVENTS = 400;
  var BIG_BET = 0.6;   // 크게 벳 기준(직전 팟 대비), Thinking.readOf와 같다
  var K_PLAN = 0x1F1F, K_TEXT = 0x2E2E, K_SEAT = 0x3D3D, K_RESAMPLE = 0x10000;
  var DEFAULT_CAST = [
    { key: '교수', type: 'TAG' }, { key: '불도저', type: 'LAG' }, { key: '햇살', type: 'Fish' },
    { key: '바위', type: 'Nit' }, { key: '카멜레온', type: 'Mixed' }, { key: '콜마스터', type: 'Station' }
  ];
  var TYPE_FALLBACK = { Station: 'Fish' }; // Station 프로필(M4-P2) 전에는 Fish로 둔다(journey-core와 같음)
  var ACTION_KOR = { fold: '폴드', check: '체크', call: '콜', raise: '레이즈', bet_s: '작게 벳', bet_b: '크게 벳' };
  var ACTION_HINT = { bet_s: '팟의 60%보다 작게', bet_b: '팟의 60% 이상' };
  var REASON_KOR = { pmax: '갈림길', bigpot: '큰 팟', plan: '계획의 순간' };
  var GRADE_OF = { nut: 'strong', strong: 'strong', medium: 'medium', 'weak-pair': 'weak', draw: 'weak', air: 'air' };
  var _pickCount = 0;

  function _has(o, k) { return !!o && typeof o[k] === 'function'; }
  function _clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function _r3(x) { return Math.round(x * 1000) / 1000; }

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

  // Math.random 교체는 이 함수 한 곳에서만, try/finally로 되돌린다.
  function withSeededRandom(seedOrRnd, fn) {
    var rnd = typeof seedOrRnd === 'function' ? seedOrRnd : _rng(Number(seedOrRnd) >>> 0);
    var saved = Math.random;
    Math.random = rnd;
    try { return fn(rnd); } finally { Math.random = saved; }
  }

  // ── 진실 등급(T5) ─────────────────────────────
  function _strength(hole, board) {
    if (!board || board.length < 3 || !hole || hole.length < 2) return null;
    if (typeof Thinking !== 'undefined' && _has(Thinking, 'strength')) return Thinking.strength(hole, board);
    var s = (typeof Villain !== 'undefined' && _has(Villain, '_handStrength')) ? Villain._handStrength(hole, board) : 'air';
    if (s === 'air' && typeof PostflopGuide !== 'undefined' && _has(PostflopGuide, 'hasDraw') && PostflopGuide.hasDraw(hole, board)) return 'draw';
    return s;
  }
  function truthGrade(hole, board) {
    var s = _strength(hole, board);
    return s ? (GRADE_OF[s] || 'air') : null;
  }

  // ── 예측 키 ──────────────────────────────────
  // a = villainActions 항목 {action, amount, potBefore, currentBetBefore, haveBefore}
  function actionKey(a) {
    if (!a) return null;
    var cb = a.currentBetBefore || 0, have = a.haveBefore || 0;
    var toCall = Math.max(0, cb - have);
    var act = a.action;
    if (act === 'fold') return 'fold';
    if (act === 'check') return 'check';
    if (act === 'call') return toCall > 0 ? 'call' : 'check';
    if (act === 'raise' || act === '3bet' || act === 'bet' || act === 'allin') {
      if (cb > 0) return 'raise';
      var added = (a.amount || 0) - have;
      return added >= BIG_BET * (a.potBefore || 0) ? 'bet_b' : 'bet_s';
    }
    return act || null;
  }
  function _actionOptions(snap) {
    if (snap.toCall > 0) return ['fold', 'call', 'raise'];
    if ((snap.currentBetBefore || 0) > 0) return ['check', 'raise'];
    return ['check', 'bet_s', 'bet_b'];
  }

  // 멈춤 판정(상한 없음, 순수). info = {pMax, street, potBefore, toCall, bigBlind, planTurn}
  function isDecisive(info) {
    info = info || {};
    var reasons = [];
    var bb = info.bigBlind || 1;
    if (info.pMax != null && info.pMax < PMAX) reasons.push('pmax');
    if (info.street && info.street !== 'preflop' && (info.toCall || 0) > 0 && (info.potBefore || 0) >= BIG_POT_BB * bb) reasons.push('bigpot');
    if (info.planTurn) reasons.push('plan');
    return { decisive: reasons.length > 0, reasons: reasons };
  }

  // ── 시드와 캐스트 ─────────────────────────────
  function _pickSeed(now) {
    _pickCount++;
    var base = (now != null && isFinite(Number(now))) ? Number(now) : Date.now();
    var r = _rng(((base % 4294967296) ^ Math.imul(_pickCount, 0x9E3779B1)) >>> 0);
    var bank = (typeof THEATER_SEEDS !== 'undefined') ? THEATER_SEEDS : null;
    var items = (bank && !Array.isArray(bank) && Array.isArray(bank.items))
      ? bank.items.filter(function(it) { return it && it.seed > 0; }) : [];
    if (items.length) return items[Math.floor(r() * items.length)].seed;
    return 1 + Math.floor(r() * 199999);
  }

  function _castSource(spec) {
    function norm(list) {
      var out = [], used = {};
      (list || []).forEach(function(c) {
        var name = c && (c.key || c.name);
        if (!name || !c.type || used[name] || out.length >= 6) return;
        used[name] = true;
        out.push({ name: String(name), type: c.type, src: c });
      });
      return out;
    }
    var src = Array.isArray(spec.cast) ? norm(spec.cast) : [];
    if (src.length < 2 && typeof CAST !== 'undefined' && Array.isArray(CAST)) {
      src = norm(CAST);
      if (src.length < 6) src = [];
    }
    if (src.length < 2 && typeof Journey !== 'undefined' && _has(Journey, 'castList')) src = norm(Journey.castList());
    if (src.length < 2) src = norm(DEFAULT_CAST);
    return src;
  }
  function _playable(type) {
    var P = (typeof VillainProfiles !== 'undefined' && VillainProfiles) ? VillainProfiles : null;
    if (!P) return type;
    if (P[type]) return type;
    return P[TYPE_FALLBACK[type]] ? TYPE_FALLBACK[type] : 'TAG';
  }
  function _seat(list, seed) {
    var arr = list.slice(), r = _rng((seed ^ K_SEAT) >>> 0);
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    var pos = arr.length === 2 ? ['BTN', 'BB'] : POS6.slice(6 - arr.length);
    return arr.map(function(c, i) { return { name: c.name, type: c.type, pos: pos[i], src: c.src }; });
  }

  function _resolveAI(spec) {
    if (spec.ai === false) return null;
    if (spec.ai && typeof spec.ai === 'object') return spec.ai;
    if (typeof TheaterAI !== 'undefined' && _has(TheaterAI, 'decide')) return TheaterAI;
    return null;
  }
  function _resolveRead(spec) {
    if (spec.readOf === false) return null;
    if (typeof spec.readOf === 'function') return spec.readOf;
    if (typeof Thinking !== 'undefined' && _has(Thinking, 'readOf')) return function(a, b, c, d) { return Thinking.readOf(a, b, c, d); };
    return null;
  }
  function _planKor(key) {
    var list = (typeof THEATER_PLANS !== 'undefined' && Array.isArray(THEATER_PLANS)) ? THEATER_PLANS : [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].key === key) return list[i].kor;
    return null;
  }

  // ── 에피소드 ─────────────────────────────────
  function newEpisode(spec) {
    spec = spec || {};
    if (typeof GameState === 'undefined') return null;
    var seed = (spec.seed != null && isFinite(Number(spec.seed))) ? Number(spec.seed) : _pickSeed(spec.now);
    var seats = _seat(_castSource(spec), seed);
    var playersSpec = seats.map(function(c) { return { name: c.name, type: _playable(c.type), pos: c.pos }; });
    var state = GameState.buildInitialState(playersSpec, null, seed, null, { spectator: true });
    state.revealAll = spec.revealAll !== false;
    if (spec.hideTypes) state.hideTypes = true;
    seats.forEach(function(c) { if (state.players[c.name]) state.players[c.name].castType = c.type; });
    var cast = state.names.map(function(n) {
      var p = state.players[n];
      return { name: n, type: p.castType || p.type, pos: p.pos };
    });

    var ai = _resolveAI(spec);
    var txt = _rng((seed ^ K_TEXT) >>> 0);
    var plans = {};
    if (ai && _has(ai, 'assignPlans')) {
      var castList = state.names.map(function(n) {
        var c = seats.filter(function(x) { return x.name === n; })[0] || {};
        var o = {};
        if (c.src && typeof c.src === 'object') Object.keys(c.src).forEach(function(k) { o[k] = c.src[k]; });
        o.name = n; o.key = o.key || n; o.type = c.type; o.pos = state.players[n].pos;
        return o;
      });
      try { plans = ai.assignPlans(_clone(state), castList, _rng((seed ^ K_PLAN) >>> 0)) || {}; } catch (e) { plans = {}; }
    }
    Object.keys(plans).forEach(function(n) {
      var p = plans[n];
      if (!p || typeof p !== 'object' || !p.key || !state.players[n]) { delete plans[n]; return; }
      if (p.switched === undefined) p.switched = null;
      if (!p.kor) p.kor = _planKor(p.key) || p.key;
    });
    var intro = [];
    state.names.forEach(function(n) {
      var p = plans[n];
      if (!p) return;
      var text = null;
      if (ai && _has(ai, 'foreshadow')) { try { text = ai.foreshadow(p.key, 'preflop', txt); } catch (e) { text = null; } }
      if (text) intro.push({ name: n, text: String(text) });
    });

    var ep = { seed: seed, state: state, cast: cast, plans: plans, intro: intro, log: [], stops: 0,
      tally: { pred: 0, hit: 0, hitW: 0, planPred: 0, planHit: 0 }, done: false, result: null };
    var start = {};
    state.names.forEach(function(n) { start[n] = state.stacks[n] + (state.playerBets[n] || 0); });
    Object.defineProperty(ep, '_x', { enumerable: false, value: {
      ai: ai, readOf: _resolveRead(spec), rnd: _rng(seed >>> 0), txt: txt,
      resample: spec.resample != null ? Math.max(0, Math.floor(spec.resample)) : RESAMPLE,
      start: start, moved: {}, acts: {}, predicted: {}
    } });
    return ep;
  }

  // 다음에 실제로 움직일 좌석(엔진의 건너뛰기 조건과 같음). 없으면 null
  function _peekActor(s) {
    var q = s.pendingQueue || [];
    for (var i = 0; i < q.length; i++) {
      var n = q[i];
      if (s.folded[n] || s.stacks[n] === 0) continue;
      return n;
    }
    return null;
  }
  function _active(s) { return s.names.filter(function(n) { return !s.folded[n]; }); }
  // 칩이 남은 생존자가 1명 이하이고 그 사람이 낼 콜 금액이 없으면 더 칠 사람이 없다
  function _runout(s) {
    var act = _active(s);
    if (act.length < 2) return false;
    var live = act.filter(function(n) { return s.stacks[n] > 0; });
    if (live.length > 1) return false;
    return live.every(function(n) { return (s.playerBets[n] || 0) >= s.currentBet; });
  }

  function _engineOpts(ep, plans, rnd, cap) {
    var ai = ep._x.ai;
    var o = { stepOne: true };
    if (ai && _has(ai, 'decide')) {
      o.decide = function(villain, st) {
        var r = null;
        try { r = ai.decide(villain, st, (plans && plans[villain.name]) || null, rnd); } catch (e) { r = null; }
        cap.r = r;
        return r;
      };
    }
    return o;
  }
  function _apply(ep, s, plans, rnd, cap) {
    return withSeededRandom(rnd, function(r) { return GameState.applyVillainActions(s, _engineOpts(ep, plans, r, cap)); });
  }

  function _actionEvent(ep, actor) {
    var x = ep._x, s = ep.state, i = ep.log.length;
    var before = _clone(s);
    var plansBefore = _clone(ep.plans);
    // 1) 실제 결정(본 스트림)
    var cap = { r: null };
    var res = _apply(ep, s, ep.plans, x.rnd, cap);
    var va = res.villainActions[0];
    if (!va) { ep.state = res.newState; return null; }
    var name = va.name;
    var decision = cap.r || {};
    var planTurn = !!decision.planTurn;
    var switched = (typeof decision.switched === 'string' && decision.switched) ? decision.switched : null;
    var plan = ep.plans[name] || null;
    if (switched && plan) {
      if (plan.key !== switched) { plan.from = plan.key; plan.key = switched; plan.kor = _planKor(switched) || switched; }
      if (plan.switched == null) plan.switched = switched;
    }
    // 2) 재표본(본 스트림을 쓰지 않음, 계획 사본)
    var key = actionKey(va);
    var counts = {}, taken = 0;
    for (var j = 1; j <= x.resample; j++) {
      var k = K_RESAMPLE * (i + 1) + j;
      var r2 = _apply(ep, s, _clone(plansBefore), _rng((ep.seed ^ k) >>> 0), { r: null });
      var v2 = r2.villainActions[0];
      if (!v2) continue;
      var k2 = actionKey(v2);
      counts[k2] = (counts[k2] || 0) + 1;
      taken++;
    }
    var dist = {}, pMax = null;
    if (taken) {
      var mx = 0;
      Object.keys(counts).sort().forEach(function(kk) { dist[kk] = _r3(counts[kk] / taken); if (counts[kk] > mx) mx = counts[kk]; });
      pMax = _r3(mx / taken);
    }
    var snap = { potBefore: va.potBefore, currentBetBefore: va.currentBetBefore, haveBefore: va.haveBefore,
      toCall: Math.max(0, va.currentBetBefore - va.haveBefore) };
    var judge = isDecisive({ pMax: pMax, street: s.street, potBefore: snap.potBefore, toCall: snap.toCall,
      bigBlind: s.bigBlind, planTurn: planTurn });
    var decisive = judge.decisive && ep.stops < MAX_STOPS;
    if (decisive) ep.stops++;
    var planNow = ep.plans[name] || null;
    var ai = x.ai;

    var ev = { i: i, kind: 'action', street: s.street, name: name, action: va.action, amount: va.amount,
      label: va.label || null, phrase: va.phrase != null ? va.phrase : null, before: before, snap: snap,
      pot: res.newState.pot, actionKey: key, dist: dist, pMax: pMax, decisive: decisive, reasons: judge.reasons,
      planKey: planNow ? planNow.key : null, planTurn: planTurn, switched: switched, thought: null };
    if (judge.decisive && !decisive) ev.capped = true;
    if (decisive) {
      var planOpts = [];
      if (ai && planNow && _has(ai, 'options')) {
        try { planOpts = ai.options(_clone(before), name, planNow.key, x.txt) || []; } catch (e) { planOpts = []; }
      }
      ev.options = { actions: _actionOptions(snap), plans: planOpts };
    }
    // 속마음(결정론, 본 스트림 미사용)
    if (typeof Thinking !== 'undefined' && _has(Thinking, 'villainThought')) {
      try {
        var th = Thinking.villainThought(before, name, va.action, va.amount,
          { snapshot: { potBefore: snap.potBefore, currentBetBefore: snap.currentBetBefore, haveBefore: snap.haveBefore } });
        if (th) ev.thought = { text: th.text, intent: th.intent };
      } catch (e) { ev.thought = null; }
    }
    // 계획 예고: 계획이 있는 좌석이 포스트플랍 스트리트에서 처음 움직일 때. 극장 AI가 이 걸음의 계획 대사(decision.line)를 주면
    //   그것을 쓴다(함정 발동 '걸렸다! 체크레이즈.', 벳폴드의 '계획대로 접는다', 배럴 멈춤처럼 실제 액션에 맞춘 말). 계획의 갈림길
    //   (planTurn)에서는 같은 스트리트 두 번째 움직임이어도 그 대사를 붙인다. 계획 변경 자막(decision.caption)은 ev.caption.
    var dLine = (typeof decision.line === 'string' && decision.line) ? decision.line : null;
    var firstMove = !x.moved[name + '|' + s.street];
    if (planNow && s.street !== 'preflop') {
      if (dLine && (firstMove || planTurn)) ev.foreshadow = dLine;
      else if (firstMove && ai && _has(ai, 'foreshadow')) {
        try { var fs = ai.foreshadow(planNow.key, s.street, x.txt); if (fs) ev.foreshadow = String(fs); } catch (e) { /* 생략 */ }
      }
    }
    if (switched && typeof decision.caption === 'string' && decision.caption) ev.caption = decision.caption;
    x.moved[name + '|' + s.street] = true;
    // 이 스트리트에서 이 사람이 먼저 한 액션들(극장 읽기 키 checkraise, betcall용, M5-THEATER)
    var actKey = name + '|' + s.street;
    var prevActs = (x.acts[actKey] || []).slice();
    (x.acts[actKey] = x.acts[actKey] || []).push(va.action);
    // 상대 읽기와 오독(포스트플랍만)
    if (x.readOf && s.street !== 'preflop' && (s.board || []).length >= 3) {
      var reader = null;
      var aggro = va.action === 'bet' || va.action === 'raise' || va.action === '3bet';
      if (aggro) {
        var ns = res.newState;
        reader = (ns.pendingQueue || []).filter(function(n) { return n !== name && !ns.folded[n] && ns.stacks[n] > 0; })[0] || null;
      } else if (va.action === 'call') {
        reader = (before.lastRaiser && before.lastRaiser !== name && !before.folded[before.lastRaiser]) ? before.lastRaiser : null;
      }
      if (reader) {
        var rd = null;
        // 라벨('올인')까지 넘긴다: 팟 절반짜리 올인을 '작은 벳'으로 읽지 않게(M4 통합 검증)
        // table 'theater'와 prev: 극장 계획 AI 실측 읽기 표(M5-THEATER). 확신이 낮은 장면은 readOf가 null이라 읽기가 없다.
        try {
          rd = x.readOf(reader, name, before, { action: va.action, amount: va.amount, label: va.label || null,
            table: 'theater', prev: prevActs });
        } catch (e) { rd = null; }
        if (rd && rd.grade) {
          ev.read = { reader: reader, grade: rd.grade, text: rd.text != null ? String(rd.text) : '' };
          ev.misread = truthGrade(before.holeCards[name], before.board) !== rd.grade;
        }
      }
    }
    ep.state = res.newState;
    ep.log.push(ev);
    return ev;
  }

  function _streetEvent(ep) {
    var before = _clone(ep.state);
    var ns = GameState.advanceStreet(ep.state);
    ep.state = ns;
    if (ns.street === 'showdown') return _showdown(ep, before);
    if (_runout(ns)) ns.pendingQueue = [];
    var ev = { i: ep.log.length, kind: 'street', street: ns.street, before: before, board: _clone(ns.board),
      cards: _clone(ns.board.slice(before.board.length)), pot: ns.pot, decisive: false, reasons: [] };
    ep.log.push(ev);
    return ev;
  }

  function _showdown(ep, beforeOpt) {
    var s = ep.state;
    var before = beforeOpt || _clone(s);
    var lastStreet = before.street === 'showdown' ? 'river' : before.street;
    var pot = s.pot;
    var res = GameState.resolveShowdown(s);
    var ns = res.newState;
    ep.state = ns;
    var payouts = res.payouts ? _clone(res.payouts) : {};
    if (!res.payouts && res.winner) payouts[res.winner] = pot;
    var start = ep._x.start, winners = [];
    ns.names.forEach(function(n) { if (ns.stacks[n] - (start[n] || 0) > 0.005) winners.push(n); });
    if (!winners.length && res.winner) winners.push(res.winner);
    var hands = {};
    ns.names.forEach(function(n) {
      var hole = ns.holeCards[n] || [];
      var board = ns.board || [];
      var desc = '';
      if (board.length >= 3 && hole.length === 2 && typeof HandEval !== 'undefined') desc = HandEval.describe(HandEval.evaluate(hole.concat(board)));
      else if (hole.length === 2 && typeof Range !== 'undefined' && _has(Range, 'handClass')) desc = Range.handClass(hole[0], hole[1]);
      hands[n] = { desc: desc, strength: _strength(hole, board), grade: truthGrade(hole, board), folded: !!ns.folded[n] };
    });
    var result = { winners: winners, payouts: payouts, pot: pot, showdown: !!res.showCards, street: lastStreet,
      hands: hands, board: _clone(ns.board) };
    var ev = { i: ep.log.length, kind: 'showdown', street: lastStreet, before: before, board: _clone(ns.board),
      pot: pot, result: result, decisive: false, reasons: [] };
    ep.log.push(ev);
    ep.done = true;
    ep.result = result;
    return ev;
  }

  function step(ep) {
    if (!ep || ep.done || !ep._x) return null;
    for (var guard = 0; guard < 64; guard++) {
      var s = ep.state;
      if (s.handOver || s.street === 'showdown' || ep.log.length >= MAX_EVENTS) return _showdown(ep);
      if (s.pendingQueue && s.pendingQueue.length > 0) {
        if (_runout(s)) { ep.state = _clone(s); ep.state.pendingQueue = []; continue; }
        var actor = _peekActor(s);
        if (!actor) {
          // 건너뛸 좌석만 남음: 엔진이 소비만 하게 둔다(결정 없음)
          ep.state = _apply(ep, s, ep.plans, ep._x.rnd, { r: null }).newState;
          continue;
        }
        var ev = _actionEvent(ep, actor);
        if (ev) return ev;
        continue;
      }
      if (GameState.needsStreetAdvance(s)) return _streetEvent(ep);
      return _showdown(ep);
    }
    return _showdown(ep);
  }

  function run(epOrSpec) {
    var ep = (epOrSpec && epOrSpec._x) ? epOrSpec : newEpisode(epOrSpec || {});
    if (!ep) return null;
    var guard = 0;
    while (!ep.done && guard++ < MAX_EVENTS + 10) step(ep);
    return ep;
  }

  // 예측 채점. w = 1 - p(실제 액션), p는 재표본 분포. decisive 액션 이벤트만, 이벤트당 1회만 tally에 넣는다.
  function predict(ep, ev, guess) {
    guess = guess || {};
    var key = ev ? ev.actionKey : null;
    var p = (ev && ev.dist && ev.dist[key] != null) ? ev.dist[key] : 0;
    var w = _r3(1 - p);
    var ga = guess.action != null ? String(guess.action) : null;
    var hitAction = !!(ga && key && (ga === key || (ga === 'bet' && (key === 'bet_s' || key === 'bet_b'))));
    var hitPlan = !!(guess.plan != null && ev && ev.planKey != null && guess.plan === ev.planKey);
    if (ep && ep._x && ep.tally && ev && ev.kind === 'action' && ev.decisive && !ep._x.predicted[ev.i] &&
        (ga || guess.plan != null)) {
      ep._x.predicted[ev.i] = true;
      if (ga) {
        ep.tally.pred++;
        if (hitAction) { ep.tally.hit++; ep.tally.hitW = _r3(ep.tally.hitW + w); }
      }
      if (guess.plan != null) {
        ep.tally.planPred = (ep.tally.planPred || 0) + 1;
        if (hitPlan) ep.tally.planHit = (ep.tally.planHit || 0) + 1;
      }
    }
    return { hitAction: hitAction, hitPlan: hitPlan, w: w };
  }

  var api = {
    RESAMPLE: RESAMPLE, PMAX: PMAX, BIG_POT_BB: BIG_POT_BB, MAX_STOPS: MAX_STOPS,
    ACTION_KOR: ACTION_KOR, ACTION_HINT: ACTION_HINT, REASON_KOR: REASON_KOR, DEFAULT_CAST: DEFAULT_CAST,
    newEpisode: newEpisode, step: step, run: run, predict: predict, isDecisive: isDecisive,
    withSeededRandom: withSeededRandom, truthGrade: truthGrade, actionKey: actionKey
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
