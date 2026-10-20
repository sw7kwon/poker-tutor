// lessons/lesson-core.js (채우는 패키지: M3-P1b, M4-P7이 calc outs, band와 potodds pctd, 아웃츠 표 검산을 더함,
//   M5-P0이 calc 등록부 L9와 bar kind 'pct'를 더함. M5에서 그룹은 이 파일을 고치지 않는다)
//
// 그룹 간 계약 정본 L1~L9 (M3 사전 등록, L9는 M5-P0). 각 패키지는 이 계약에 맞춰 구현한다. 설계서와 다르면 이 주석이 우선한다.
//
// L1 레슨 객체: LESSONS.push({ id, node, title, est, source, scenes }).
//   id = node = 노드 id(journey-data의 lesson 필드와 같음). est는 분(2~4), source는 1차 출처 또는 '엔진 계산'.
//   장면 6~9개, 마지막 장면은 sum 1개. LESSONS 선언은 stage1.js만, 다른 stageN.js는 push만.
//
// L2 장면(t). 공통 선택 필드: caption(80자 이내, 템플릿 {{이름}}), label:'참고'(approx 내용이면 필수), calc(L3).
//   say {text}.
//   sum {text}(노드 시트에 남는 한 문장, 숫자+%나 숫자+bb 쓰지 않음).
//   cards {cards[] | rows:[{label, cards[], note?, hl?, outs?, outCards?}], compare?}(기존).
//     (M4-P7) rows[].outs = 아웃츠 표 줄: cards는 내 손 2장 + 플랍 3장, 열거한 아웃츠 수가 outs와 같고, label의 첫 숫자(있으면)도 outs,
//     note의 숫자+% 두 개는 차례로 2장(턴과 리버), 1장(다음 카드) 정확값(L3 outs의 pct2, pct1)이어야 한다(check가 검산).
//     rows[].outCards = 아웃 카드 그림 줄: 같은 장면의 calc outs(hero, board)가 세는 아웃 카드와 같은 카드 묶음이어야 한다.
//   grid {pos, facing(false|true|'vs3bet'|'vs4bet'|'cold3bet'), opener?, highlight[], layers?[자리...], claim?{hand, action}}
//     (기존, 변수 pct = 참여 레인지 %).
//   ring {potTotal(상대 벳 포함), toCall, eq?}(기존).
//   table {heroPos, hero?[2], board?[], potTotal?, toCall?, seats:[{pos, name?, stack?, bet?, action?, active?, folded?}],
//     blinds?, order?('preflop'|'postflop', 자리마다 말하는 순서 번호), focus?('pot'|'toCall'|자리)}:
//     자리는 UTG, HJ, CO, BTN, SB, BB 6개 고정 배치, seats에 없는 자리는 빈 자리, 금액은 bb 숫자.
//   bar {kind:'amount', rows:[{label, bb}]}
//     | {kind:'equity', rows:[{label, precalc} | {label, exact:{hero, vs, board}}]}
//     | {kind:'compare', precalc | exact, need:{potTotal, toCall}}(같은 축에 내 승률 막대와 필요 승률, 콜/폴드 바늘),
//     변수 eq(첫 줄), need.
//     | {kind:'pct', rows:[{label, v, hl?}], calc}(M5-P0, L9): 줄 값 = 같은 장면 변수 v(0~100), 막대 길이 값/100, 글자 'n%'.
//   ask {id(레슨 안에서 유일, 예 'q1'), q, choices[2~4], answer(0부터), why(한 줄), calc?, pick?[], ref?}:
//     ref는 커리큘럼 문항 id('c4-1')를 가리키는 예약 필드로 M3 데이터에서는 쓰지 않는다.
//   compare {cols:[{who, text}] 3개, mine?}(S4 이상, 렌더만).
//   widget {name, params}(M6, 모듈이 없으면 플레이어가 '다음 업데이트' 카드). (M6-P0) name은 toyGame, varianceCone, rangePaint 중
//     하나, params는 객체(tests/j-lessons가 막는다). 위젯 모듈과 mount 계약은 docs/JOURNEY_ROADMAP.md M6 계약 H1.
//   렌더 분담: SceneRender.render가 cards, grid, ring, scene, table, bar, compare, sum(P1a가 table, bar, compare, sum을 추가),
//     LessonPlayer가 say, ask, widget과 모든 장면의 caption 줄과 label 칩.
//
// L3 calc 유형과 템플릿 변수. 표기: 퍼센트는 정수 반올림(Math.round), bb는 소수 둘째 자리까지 끝 0 제거(15, 7.5, 2.25).
//   아래는 내장 유형(BUILTIN_CALCS). M5부터 새 유형은 L9 등록부로 더한다.
//   예외(M4-P7): 설계 표가 소수 첫째 자리인 값(potodds pctd, outs pct1과 pct2, band lo와 mid와 hi)은 소수 첫째 자리.
//   potodds {potTotal, toCall} → pct = toCall/(potTotal+toCall), potTotal, toCall,
//     pctd = 같은 값의 소수 첫째 자리 문자열(27.3, 25.0, M4-P7, s2-09의 27.3% 링).
//   outs {hero[2], board[3|4]} | {n, unseen?(47 플랍 | 46 턴, 기본 47)} → outs(장 수), unseen, pct1(다음 1장 정확값),
//     pct2(플랍에서 턴과 리버 2장 안에 아웃이 1장 이상 올 정확값, 플랍만), x2 = 2 x outs, x4 = 4 x outs(플랍만), 퍼센트는 소수
//     첫째 자리 문자열(설계서 2.4절 세션 5: 4장 16.5/8.5, 8장 31.5/17.0, 9장 35.0/19.1, 12장 45.0/25.5, 15장 54.1/31.9).
//     아웃츠 정의(설계서 3.2절 출제 제외 5번): 남은 덱(플랍 47장, 턴 46장) 중 다음 1장으로 스트레이트 이상이 되는 카드 수,
//     HandEval 열거. 턴 보드에서 보드만으로 같은 족보가 되는 카드(보드 플레이)는 빼고, 이미 스트레이트 이상이면 오류(M4-P7).
//   band {metric:'vpip'|'pfr'|'tb'|'f3'} → lo, mid, hi(HeroStats.bandsFromChart()[metric] 그대로, 소수 첫째 자리, 밴드 = 차트 ±4),
//     pct = Math.round(mid)('약 n%' 문장용). 이 앱 차트 기준 값이라 문장에 '이 앱 차트'를 적는다(설계서 1.3절 7번, M4-P7).
//   tocall {currentBet, heroBet} → amt = currentBet - heroBet.
//   minraise {currentBet, lastRaise} → to = currentBet + lastRaise, inc = lastRaise(game-state.js:110 규칙, 첫 벳이면 lastRaise = 그 벳).
//   opensize {pos, limpers} → size = (SB면 3, 아니면 2.5) + limpers(ev.js:28-32, gen-basic opensize와 같은 표).
//   showdown {a[2], b[2], board[5]} → winner 'a'|'b'|'tie', handA, handB(HandEval.describe 이름).
//   order {street:'preflop'|'postflop', seats[남은 자리]} → first, last, list(쉼표로 이은 문자열),
//     프리플랍 UTG, HJ, CO, BTN, SB, BB 순, 포스트플랍 SB, BB, UTG, HJ, CO, BTN 순.
//   rangePct {pos, facing?, opener?} → pct = Math.round(Coach.rangePct(레이즈 배열 + 콜 배열) x 100)(SceneRender.rangeInfo total과 같음).
//   chart {pos, facing?, opener?, hand} → action = GtoChart.buildChartModel(pos, facing, opener) 셀('raise'|'call'|'fold').
//   eq {precalc:키} → eq = Math.round(PRECALC[키] x 100).
//   eqExact {hero[2], vs[2], board[3~4장]} → eq = 남은 카드 전부 열거(HandEval, 무승부 반),
//     SceneRender.eqExact(hero, vs, board) → 0~1(P1a)와 같은 값.
//   LessonCore.vars(scene) = SceneRender.vars(scene)(potTotal, toCall, need, pct, eq) 위에 calc 변수를 덮어쓴 것.
//   정의 안 된 변수는 화면에 '?'로 그리고 LessonCore.check(lesson)가 오류로 보고.
//
// L4 ask 정답: calc가 있으면 정답은 엔진값이다.
//   pick(보기마다 그 보기가 뜻하는 결과값, 예 showdown ['a','b','tie'], order ['BB','SB','BTN'], chart ['raise','call','fold'])이
//   있으면 pick[answer] === 결과값이고 다른 보기의 pick은 달라야 한다.
//   pick이 없으면 각 보기 문자열의 첫 숫자를 L3 표기의 결과값과 비교해 정확히 하나만 같고 그것이 answer.
//   calc 없는 ask는 개념 문항(숫자+%와 숫자+bb 금지). j-lessons(P5)가 독립 경로로 검산한다.
//   (M4-P7) outs와 band처럼 M4에 더한 유형의 ask는 calc.of를 늘 적는다(outs 'outs', band 'pct'). 레슨 복습 어댑터
//   puzzles/gen-lesson.js calcResult는 자기가 직접 계산하지 않는 유형을 LessonCore.calc로 넘기므로(M4-P7 리뷰 수정)
//   이 유형의 오답도 Leitner 복습으로 다시 나온다(j-lessons gen-lesson 6이 실제 레슨의 모든 ask 복원을 고정).
//
// L5 린트(numericTemplate는 M3-P5가 기본으로 켠다): caption, text, why의 숫자+%와 숫자+bb는 {{ }}로만 쓴다.
//   ask의 q와 choices는 같은 장면에 calc가 있을 때만 숫자 리터럴 허용. pot 필드 금지(potTotal만).
//   가운뎃점 U+00B7, 긴줄표 U+2014와 U+2013 대신 쉼표. 표기는 '팟 오즈'(띄어쓰기), '에쿼티', 콜/폴드 나열은 빗금이나 쉼표,
//   팟 문장은 '팟 X bb(상대 벳 Y bb 포함), 콜 Y bb'.
//
// L6 Leitner 유형 'lesson', 키 '<노드>|<qid>'.
//   레슨 ask: qid = ask.id, 오답이면 Drills.record('lesson', 키, false), 정답이면 이미 항목이 있을 때만 record(true).
//   커리큘럼 선택지 문항: CURRICULUM[k].quiz[j] = {q, a, choices[2~4], answer, why?, id:'c<세션>-<j+1>'},
//     키 노드 = CURRICULUM_MAP[세션][0], 기록 규칙은 레슨 ask와 같다.
//   복습 출제는 puzzles/gen-lesson.js(M3-P5)가 Puzzles.register('lesson', ...)의 fromKey(키)로 복원한다
//     (레이팅, 데일리 5, pickType, 약점 채움 제외, next는 null).
//
// L7 PRECALC(lessons/data/precalc.js): PRECALC['eq:<hero>:<board>:<vs>'] = 0~1(히어로 에쿼티, 무승부 반).
//   hero 'AhKd', board '' 또는 'Th7c2h', vs 'random' 또는 'range=<스팟>'(예 range=rfi|BTN, Gto.GTO_RANGES 배열).
//   특정 손 대 특정 손은 PRECALC 대신 eqExact(보드 3장 이상).
//   j-lessons가 Equity._mc(시드 Drills.rng(1)과 Drills.rng(2) 각 5000회) 평균과 ±4%p로 대조.
//   값 만들기(M4-P7): vs random은 Equity._mc(시드 1, 2 각 5000회) 평균. vs range는 같은 시드와 횟수의 균등 콤보 MC
//   (tools/seed-bank.js mcUniform) 평균. Equity._mc의 레인지 샘플러는 콤보를 고르게 뽑지 않아(실측 AKo 대 UTG 오픈 레인지
//   -3.1%p, KJo 대 UTG +4.2%p) 레인지 상대 값이 틀린다. 그래서 레슨에는 편향이 작은 레인지 키만 쓰고(±4%p 대조를 넘지 않게),
//   j-lessons가 모든 키를 독립 균등 콤보 MC(다른 시드)와 ±2%p로 한 번 더 대조한다. 화면의 반올림 정수가 고정밀 기준값
//   (균등 콤보 20만 회)의 반올림과 같은 키만 골랐다(precalc.js 머리 주석).
//
// L8 API.
//   LessonCore(순수, P1b): find(id) → lesson|null,
//     create(lesson, sceneIdx, deps{timer(fn, ms) → h, clear(h), record(evt)}) → core,
//     core.state() → {idx, n, scene, phase:'show'|'answered'|'done', picked, ok}, core.next(), core.prev(),
//     core.answer(i) → {ok, why}(정답은 바로 표시, 오답은 한 줄 해설 뒤 deps.timer로 1초 뒤 다음),
//     record evt = {kind:'scene', idx} | {kind:'answer', qid, key, ok, first} | {kind:'done'},
//     vars(scene), fill(text, scene), check(lesson) → [{scene, msg}].
//   LessonPlayer(DOM, P1b): start(lessonId, sceneIdx, onDone) → bool,
//     장면마다 Journey.completeLesson(node, idx, false), 끝에 completeLesson(node, 마지막, true) 뒤 onDone({done:true, scene}),
//     중간 종료(↩와 안드로이드 뒤로)는 onDone({done:false, scene}), 화면은 JourneyUI.mountView('lesson', html),
//     뒤로는 Nav.view('lesson', id) + Nav.setBack('j/lesson', fn),
//     호출자는 journey-ui _act('lesson')와 today-ui 레슨 블록(이미 연결됨).
//   SceneRender 추가(P1a): render가 table, bar, compare, sum 처리, supports(t), vars(scene)에 bar 변수, eqExact(hero, vs, board).
//   Boss와 CoachUI는 설계서 2.5절과 7.3절 9번(CoachUI.snapshot() → {auto, level, recent}, CoachUI.restore(s)) 그대로.
//
// L9 레슨 calc 등록부(M5-P0). L3 내장 유형 밖의 calc는 lessons/calc/<파일>.js가 로드 때 등록한다
//   (유형 소유 표는 docs/JOURNEY_ROADMAP.md M5 계약 F7, 다른 그룹 유형은 쓰지 않고 필요하면 자기 이름으로 새로 등록).
//   LessonCore.defineCalc(type, def) → boolean. type은 영문자로 시작하는 영숫자. 내장 L3 유형 이름, 이미 등록된 이름,
//     Object 기본 속성 이름이면 false(덮어쓰기 금지), def 형식이 틀려도 false.
//   def = { calc(c) → 변수 객체 | {error},
//     main: 정답 비교 기본 변수 이름(L4 결과값, 등록 때 CALC_MAIN에 더한다),
//     verify(c) → 변수 객체 | {error}: calc 코드를 부르지 않는 독립 경로(직접 열거, 다른 공식 형태, EV.calcOptions 같은 다른 엔진 함수).
//       j-lessons 검산기는 verify가 낸 변수만 정의된 것으로 보므로 장면과 질문이 쓰는 변수(main, 템플릿, pct 막대 v)는 verify도 낸다,
//     cases: [{ c(type 없이 입력만), want: { 변수: 값 }(main 포함) }] 손으로 확인한 값 2개 이상,
//     qNums?(c) → [ask.q에 꼭 나와야 하는 입력 숫자],
//     qCards?(c) → [ask.q의 카드와 같아야 하는 카드 문자열](빈 배열이 아니면 q에 카드가 없어도 불일치. 레슨 복습은 등록 유형 그림을
//       그리지 않고 질문 문장만 보이므로 카드가 필요한 질문은 q에 카드를 적는다),
//     chip?: 'exact'(기본, '엔진 계산') | 'chart'('이 앱 차트 기준', 차트 레인지에서 나온 값) | 'appdef'('이 앱의 분류 기준')
//       (calc가 있는 장면의 라벨 칩, 설계서 8.2절. approx 내용은 장면 label '참고'가 따로 붙는다) }.
//   입력에 pot 필드 금지(potTotal = 상대 벳 포함 팟, potBefore = 벳 전 팟). 표기(F7): 퍼센트 변수는 정수 반올림,
//     SPR은 소수 첫째 자리 문자열. 등록 유형 calc 결과가 객체가 아니거나 main 변수가 없으면 calc가 오류를 낸다.
//   calc, CALC_MAIN, wantKey, answerIndex, vars, fill, check(정의 안 된 변수, 정답 칸, pot 필드, 숫자 템플릿)는 등록 유형을
//     내장 유형과 똑같이 다룬다. puzzles/gen-lesson.js(wantOf, calcResult)도 등록 유형 main을 써서 오답을 Leitner 복습으로 복원한다.
//   tests/j-lessons.test.js: 등록 유형 calc는 def.verify로 검산하고, 장면마다 LessonCore.calc와 def.verify의 공통 변수가 같아야 하고,
//     모든 등록 유형 cases를 calc와 verify 둘 다로 대조하고, qNums와 qCards로 질문 문장을 대조한다(ask.q).
//   calcDef(type) → def | null(등록 유형만), calcTypes() → 등록 유형 이름 배열(등록 순서), BUILTIN_CALCS = 내장 유형 이름 배열,
//     _undefineCalc(type) → boolean은 테스트 전용(등록 유형만 지운다).
//   bar kind 'pct' 장면: { t:'bar', kind:'pct', rows:[{ label, v:'같은 장면 calc 변수 이름', hl? }], calc }.
//     줄 값 = 그 변수(0~100), 막대 길이 값/100, 글자 'n%'(레인지 적중 분포, MDF, 알파 막대, 설계서 3.1절 6번).
//     SceneRender.render(obj, vars)가 두 번째 인자로 값을 받고(없거나 모르는 변수면 '?'), LessonPlayer가 LessonCore.vars(scene)를 넘기고,
//     check가 rows, label(숫자+%와 숫자+bb 금지, 값은 v로), v 정의와 0~100 범위를 본다.
//
// 구현 메모(M3-P1b, 위 계약의 의미는 바꾸지 않고 구현에서 정한 것만 적는다)
//   M1 상태기계. phase 'show' → (ask에서 answer) 'answered' → (마지막 장면에서 next) 'done'.
//      답하지 않은 ask에서는 next가 false(넘어가지 않음). 답한 ask는 다시 와도 답한 상태 그대로(같은 실행 안에서 재시도 없음).
//      오답 뒤 deps.timer(1초)가 끝나기 전까지 state().ready가 false이고 next가 false다(오답 해설을 읽게 하는 속도 방지턱).
//      deps.autoNext가 true면 그 1초 뒤 next를 스스로 부른다(설계 5.4절 '1초 뒤 다음'의 다른 해석, 기본 false).
//      deps.timer가 없으면 기다림 없이 ready. state()는 계약 필드에 ready, last, canNext, canPrev, node, id를 더 준다.
//      record evt는 create 때 첫 장면에도 {kind:'scene', idx}를 한 번 낸다(이어 보기 위치 저장). core.destroy()는 타이머 정리.
//   M2 answer evt의 first = 이 실행에서 그 qid에 처음 답했는지. XP와 Leitner 기록 규칙은 LessonPlayer가 정한다.
//   M3 calc(spec) → 변수 객체 | {error}. bb 값은 숫자(소수 둘째 자리 반올림)라 String()이 15, 7.5, 2.25로 끝 0 없이 나온다.
//      rangePct와 chart는 SceneRender.rangeInfo, SceneRender.cellAction(격자와 같은 경로)을 쓴다. chart의 'none' 셀은 오류.
//      eqExact는 이 파일이 HandEval로 직접 열거한다(보드 3~5장, 무승부 반). eq는 PRECALC 상수.
//      vars는 SceneRender.vars 위에 calc 변수를 덮는다. bar 장면의 eq, need는 SceneRender.vars가 아직 주지 않으면
//      (P1a 병합 전) 여기서 같은 규칙(첫 줄 precalc 또는 exact, need 객체)으로 채운다.
//   M4 ask 정답 비교에 쓰는 결과값(j-lessons의 wantOf와 같은 규칙) = calc.of(결과 변수 이름)가 있으면 그 변수, 없으면 유형의 첫 변수
//      (potodds pct, tocall amt, minraise to, opensize size, showdown winner, order first, rangePct pct, chart action, eq eq,
//      eqExact eq, outs outs, band pct). answerIndex(ask)가 이 규칙으로 정답 칸을 구한다. order 질문이 '마지막', '맨 끝', '가장 늦게' 자리를 묻는데
//      calc.of가 없으면 check가 "calc.of = 'last'를 적어요"로 알린다(j-lessons ask.of와 같은 규칙, 추측해서 바꾸지 않는다).
//      calc potodds의 pct(와 SceneRender.vars가 없을 때의 need 대체 계산)는 Math.round(toCall x 100 / (potTotal + toCall))
//      (j-lessons와 같은 식, 14.5처럼 딱 반인 값이 toCall / (potTotal + toCall) x 100의 부동소수 오차로 14가 되지 않게).
//      opensize는 BB면 림퍼 1명 이상(아무도 안 들어오면 BB는 오픈할 일이 없다), potodds는 toCall이 0보다 커야 한다.
//   M5 check(lesson)은 L1, L2 필드, L4, L5(숫자 템플릿, 금지 문자, pot 필드, 80자), 정의 안 된 변수, sum의 템플릿 금지,
//      grid claim, PRECALC 키 존재를 본다. 반환 [{scene, msg}], scene -1은 레슨 전체. JOURNEY_NODES가 있으면 노드 연결도 본다.
//      (M4-P7) cards 장면의 아웃츠 표 줄(rows[].outs)과 아웃 카드 줄(rows[].outCards)도 열거로 검산한다(L2 cards).
//   M6(M4-P7) outsOf(hero, board) → {outs:[카드 문자열], unseen, cur(지금 족보 type)} | {error}. calc outs와 check가 같이 쓴다.
//      HandEval.evaluate(카드 객체) 경로. j-lessons는 evaluateIdx(정수 카드)와 2장 쌍 열거로 따로 센다.
//      band는 HeroStats.bandsFromChart()를 그대로 부른다(Gto, Coach 전역). j-lessons는 GtoChart 모델 셀로 따로 계산한다.
//   로드 시 DOM, window, localStorage에 손대지 않는다. HandEval, SceneRender, PRECALC, LESSONS, JOURNEY_NODES는 호출 때 typeof 가드.
var LessonCore = (function() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : this;
  var TYPES = ['say', 'table', 'cards', 'grid', 'ring', 'bar', 'ask', 'compare', 'widget', 'sum'];
  var CALC_MAIN = { potodds: 'pct', tocall: 'amt', minraise: 'to', opensize: 'size', showdown: 'winner', order: 'first',
    rangePct: 'pct', chart: 'action', eq: 'eq', eqExact: 'eq', outs: 'outs', band: 'pct' };
  var STRAIGHT = 6;   // HandEval type: 1 로열 플러시 ... 6 스트레이트 ... 10 하이카드(작을수록 강함)
  var BAND_METRICS = ['vpip', 'pfr', 'tb', 'f3'];
  var PRE = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var POST = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];
  var FACINGS = [false, true, 'vs3bet', 'vs4bet', 'cold3bet'];
  var WRONG_MS = 1000;
  var CAP_MAX = 80;
  var RANKS = 'AKQJT98765432';
  var SUITS = 'shdc';
  var FORBID = /[\u00b7\u2014\u2013]/;
  var NUM_UNIT = /\d+(?:\.\d+)?\s*(?:%|bb(?![A-Za-z]))/i;
  var TPL = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

  function _has(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function _isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function _fin(x) { return x !== null && x !== '' && x !== undefined && isFinite(Number(x)); }
  function _bb(x) { var v = Math.round(Number(x) * 100) / 100; return v === 0 ? 0 : v; }
  function _mod(name) { var o = G[name]; return (o && (typeof o === 'object' || typeof o === 'function')) ? o : null; }
  function _sr() { return _mod('SceneRender'); }
  function _lessons() { return (typeof LESSONS !== 'undefined' && Array.isArray(LESSONS)) ? LESSONS : []; }
  function _precalc() { return (typeof PRECALC !== 'undefined' && _isObj(PRECALC)) ? PRECALC : null; }

  // ── 카드 ──────────────────────────────────────────────
  function _card(x) {
    if (x && typeof x === 'object') x = String(x.rank || '') + String(x.suit || '');
    var s = String(x == null ? '' : x).trim();
    if (s.length === 3 && s.slice(0, 2) === '10') s = 'T' + s.charAt(2);
    if (s.length !== 2) return null;
    var r = s.charAt(0).toUpperCase(), u = s.charAt(1).toLowerCase();
    if (RANKS.indexOf(r) < 0 || SUITS.indexOf(u) < 0) return null;
    return { rank: r, suit: u };
  }
  // 카드 묶음 파싱. 같은 카드가 두 번 나오면 오류
  function _cards(groups) {
    var seen = {}, out = [];
    for (var g = 0; g < groups.length; g++) {
      var list = groups[g].list, want = groups[g].n;
      if (!Array.isArray(list)) return { error: groups[g].name + ' 카드 목록이 없어요' };
      if (want && (list.length < want[0] || list.length > want[1])) return { error: groups[g].name + ' 카드 수가 맞지 않아요(' + list.length + '장)' };
      var row = [];
      for (var i = 0; i < list.length; i++) {
        var c = _card(list[i]);
        if (!c) return { error: '카드를 읽을 수 없어요: ' + list[i] };
        var k = c.rank + c.suit;
        if (seen[k]) return { error: '같은 카드가 두 번 나와요: ' + k };
        seen[k] = true;
        row.push(c);
      }
      out.push(row);
    }
    return { groups: out, used: seen };
  }
  function _he() {
    var H = _mod('HandEval');
    return (H && typeof H.evaluate === 'function' && typeof H.compareHands === 'function') ? H : null;
  }

  // 히어로 vs 상대 손 에쿼티: 남은 카드 전부 열거(무승부 반). board 3~5장
  function eqExact(hero, vs, board) {
    var H = _he();
    if (!H) return null;
    var p = _cards([{ name: '내 손', list: hero, n: [2, 2] }, { name: '상대 손', list: vs, n: [2, 2] }, { name: '보드', list: board, n: [3, 5] }]);
    if (p.error) return null;
    var h = p.groups[0], v = p.groups[1], b = p.groups[2];
    var deck = [];
    for (var ri = 0; ri < 13; ri++) for (var si = 0; si < 4; si++) {
      var k = RANKS.charAt(ri) + SUITS.charAt(si);
      if (!p.used[k]) deck.push({ rank: RANKS.charAt(ri), suit: SUITS.charAt(si) });
    }
    var need = 5 - b.length, win = 0, tie = 0, tot = 0;
    var score = function(extra) {
      var full = b.concat(extra);
      var c = H.compareHands(H.evaluate(h.concat(full)), H.evaluate(v.concat(full)));
      tot++;
      if (c < 0) win++; else if (c === 0) tie++;
    };
    if (need === 0) score([]);
    else if (need === 1) for (var i = 0; i < deck.length; i++) score([deck[i]]);
    else for (var a = 0; a < deck.length; a++) for (var z = a + 1; z < deck.length; z++) score([deck[a], deck[z]]);
    return tot ? (win + tie / 2) / tot : null;
  }

  // 아웃츠 열거(L3 outs, 설계서 3.2절 출제 제외 5번): 남은 덱 중 다음 1장으로 스트레이트 이상이 되는 카드.
  // 턴 보드(4장)에 리버 1장을 더한 5장만으로 같은 족보가 되면(보드 플레이) 아웃이 아니다. 지금 이미 스트레이트 이상이면 오류.
  function outsOf(hero, board) {
    var H = _he();
    if (!H) return { error: 'HandEval이 없어요' };
    var p = _cards([{ name: '내 손', list: hero, n: [2, 2] }, { name: '보드', list: board, n: [3, 4] }]);
    if (p.error) return { error: p.error };
    var h = p.groups[0], b = p.groups[1], known = h.concat(b);
    var cur = H.evaluate(known);
    if (cur && cur.type <= STRAIGHT) {
      return { error: '지금 이미 ' + (typeof H.describe === 'function' ? H.describe(cur) + ', ' : '') + '스트레이트 이상이라 아웃츠를 세지 않아요' };
    }
    var outs = [], unseen = 0;
    for (var ri = 0; ri < 13; ri++) for (var si = 0; si < 4; si++) {
      var k = RANKS.charAt(ri) + SUITS.charAt(si);
      if (p.used[k]) continue;
      unseen++;
      var c = { rank: RANKS.charAt(ri), suit: SUITS.charAt(si) };
      var ev = H.evaluate(known.concat([c]));
      if (!ev || ev.type > STRAIGHT) continue;
      if (b.length + 1 >= 5) {
        var bv = H.evaluate(b.concat([c]));
        if (bv && H.compareHands(ev, bv) === 0) continue;
      }
      outs.push(k);
    }
    return { outs: outs, unseen: unseen, cur: cur ? cur.type : null };
  }
  // 퍼센트 소수 첫째 자리 문자열(19.1, 35.0)
  function _p1(x) { return (Math.round(x * 1000) / 10).toFixed(1); }
  // 아웃츠 n장, 남은 카드 u장 → 정확값과 어림(플랍이면 2장 확률과 x4도)
  function _outsVars(n, u) {
    var v = { outs: n, unseen: u, pct1: _p1(n / u), x2: 2 * n };
    if (u === 47) { v.pct2 = _p1(1 - (u - n) * (u - n - 1) / (u * (u - 1))); v.x4 = 4 * n; }
    return v;
  }

  // ── calc(L3) ─────────────────────────────────────────
  function _spot(c) {
    var s = { pos: c.pos, facing: _has(c, 'facing') && c.facing != null ? c.facing : false };
    if (c.opener) s.opener = c.opener;
    return s;
  }
  function _facingOk(f) { return FACINGS.indexOf(f) >= 0; }
  var CALCS = {
    potodds: function(c) {
      if (!_fin(c.potTotal) || !_fin(c.toCall)) return { error: 'potodds에는 potTotal과 toCall 숫자가 필요해요' };
      var p = Number(c.potTotal), t = Number(c.toCall);
      if (p < 0 || t <= 0) return { error: 'potodds 금액이 맞지 않아요(potTotal 0 이상, toCall 0보다 큼)' };
      return { pct: Math.round(t * 100 / (p + t)), pctd: (Math.round(t * 1000 / (p + t)) / 10).toFixed(1), potTotal: _bb(p), toCall: _bb(t) };
    },
    tocall: function(c) {
      if (!_fin(c.currentBet) || !_fin(c.heroBet)) return { error: 'tocall에는 currentBet과 heroBet 숫자가 필요해요' };
      var cb = Number(c.currentBet), hb = Number(c.heroBet);
      if (hb < 0 || cb < hb) return { error: 'tocall 금액이 맞지 않아요(currentBet < heroBet)' };
      return { amt: _bb(cb - hb) };
    },
    minraise: function(c) {
      if (!_fin(c.currentBet) || !_fin(c.lastRaise)) return { error: 'minraise에는 currentBet과 lastRaise 숫자가 필요해요' };
      var cb = Number(c.currentBet), lr = Number(c.lastRaise);
      if (cb <= 0 || lr <= 0) return { error: 'minraise 금액은 0보다 커야 해요' };
      return { to: _bb(cb + lr), inc: _bb(lr) };
    },
    opensize: function(c) {
      if (PRE.indexOf(c.pos) < 0) return { error: 'opensize 자리를 알 수 없어요: ' + c.pos };
      var n = c.limpers == null ? 0 : Number(c.limpers);
      if (!(n >= 0) || Math.floor(n) !== n) return { error: 'opensize limpers는 0 이상의 정수예요' };
      if (c.pos === 'BB' && n < 1) return { error: 'BB는 림퍼가 있을 때만 레이즈 크기를 물어요(limpers 1 이상)' };
      return { size: _bb((c.pos === 'SB' ? 3 : 2.5) + n) };
    },
    showdown: function(c) {
      var H = _he();
      if (!H || typeof H.describe !== 'function') return { error: 'HandEval이 없어요' };
      var p = _cards([{ name: 'a', list: c.a, n: [2, 2] }, { name: 'b', list: c.b, n: [2, 2] }, { name: '보드', list: c.board, n: [5, 5] }]);
      if (p.error) return { error: p.error };
      var sa = H.evaluate(p.groups[0].concat(p.groups[2])), sb = H.evaluate(p.groups[1].concat(p.groups[2]));
      var r = H.compareHands(sa, sb);
      return { winner: r < 0 ? 'a' : (r > 0 ? 'b' : 'tie'), handA: H.describe(sa), handB: H.describe(sb) };
    },
    order: function(c) {
      var ord = c.street === 'preflop' ? PRE : (c.street === 'postflop' ? POST : null);
      if (!ord) return { error: "order street는 'preflop' 또는 'postflop'이에요" };
      if (!Array.isArray(c.seats) || c.seats.length < 2) return { error: 'order seats는 두 자리 이상이에요' };
      var seen = {};
      for (var i = 0; i < c.seats.length; i++) {
        if (PRE.indexOf(c.seats[i]) < 0) return { error: '자리 이름을 알 수 없어요: ' + c.seats[i] };
        if (seen[c.seats[i]]) return { error: '같은 자리가 두 번 나와요: ' + c.seats[i] };
        seen[c.seats[i]] = true;
      }
      var list = ord.filter(function(p) { return seen[p]; });
      return { first: list[0], last: list[list.length - 1], list: list.join(', ') };
    },
    rangePct: function(c) {
      var S = _sr();
      if (PRE.indexOf(c.pos) < 0) return { error: 'rangePct 자리를 알 수 없어요: ' + c.pos };
      var sp = _spot(c);
      if (!_facingOk(sp.facing)) return { error: 'rangePct facing 값을 알 수 없어요: ' + sp.facing };
      var ri = (S && typeof S.rangeInfo === 'function') ? S.rangeInfo(sp) : null;
      if (!ri || !isFinite(ri.total)) return { error: '이 스팟의 레인지를 찾지 못했어요' };
      return { pct: Math.round(ri.total * 100) };
    },
    chart: function(c) {
      var S = _sr();
      if (PRE.indexOf(c.pos) < 0) return { error: 'chart 자리를 알 수 없어요: ' + c.pos };
      var sp = _spot(c);
      if (!_facingOk(sp.facing)) return { error: 'chart facing 값을 알 수 없어요: ' + sp.facing };
      var act = (S && typeof S.cellAction === 'function') ? S.cellAction(sp, c.hand) : null;
      if (act !== 'raise' && act !== 'call' && act !== 'fold') return { error: '차트 셀을 찾지 못했어요(' + c.hand + ', ' + act + ')' };
      return { action: act };
    },
    eq: function(c) {
      var P = _precalc();
      var v = (P && c.precalc != null && _has(P, c.precalc)) ? Number(P[c.precalc]) : NaN;
      if (!(v >= 0 && v <= 1)) return { error: 'PRECALC에 키가 없어요: ' + c.precalc };
      return { eq: Math.round(v * 100) };
    },
    eqExact: function(c) {
      if (!_he()) return { error: 'HandEval이 없어요' };
      var p = _cards([{ name: '내 손', list: c.hero, n: [2, 2] }, { name: '상대 손', list: c.vs, n: [2, 2] }, { name: '보드', list: c.board, n: [3, 5] }]);
      if (p.error) return { error: p.error };
      var e = eqExact(c.hero, c.vs, c.board);
      return e == null ? { error: 'eqExact 계산 실패' } : { eq: Math.round(e * 100) };
    },
    outs: function(c) {
      if (c.n != null) {
        if (c.hero != null || c.board != null) return { error: 'outs는 hero와 board, 또는 n 하나만 써요' };
        var u = c.unseen == null ? 47 : Number(c.unseen);
        if (u !== 47 && u !== 46) return { error: 'outs unseen은 47(플랍) 또는 46(턴)이에요' };
        var n = Number(c.n);
        if (!(n >= 1 && n < u) || Math.floor(n) !== n) return { error: 'outs n은 1 이상의 정수예요' };
        return _outsVars(n, u);
      }
      var o = outsOf(c.hero, c.board);
      if (o.error) return { error: o.error };
      if (!o.outs.length) return { error: '아웃츠가 0장이에요(드로우가 없는 스팟)' };
      return _outsVars(o.outs.length, o.unseen);
    },
    band: function(c) {
      if (BAND_METRICS.indexOf(c.metric) < 0) return { error: "band metric은 'vpip', 'pfr', 'tb', 'f3'이에요: " + c.metric };
      var HS = _mod('HeroStats');
      var all = (HS && typeof HS.bandsFromChart === 'function') ? HS.bandsFromChart() : null;
      var b = all ? all[c.metric] : null;
      if (!b || !_fin(b.lo) || !_fin(b.mid) || !_fin(b.hi)) return { error: '차트 밴드를 계산하지 못했어요(HeroStats.bandsFromChart)' };
      return { lo: Number(b.lo), mid: Number(b.mid), hi: Number(b.hi), pct: Math.round(Number(b.mid)) };
    }
  };
  var BUILTIN_CALCS = Object.keys(CALCS);

  // ── calc 등록부(L9) ──────────────────────────────────
  var REG = {}, REG_ORDER = [];
  var CHIPS = ['exact', 'chart', 'appdef'];
  var TYPE_RE = /^[A-Za-z][A-Za-z0-9]*$/;
  function _defOk(def) {
    if (!_isObj(def) || typeof def.calc !== 'function' || typeof def.verify !== 'function') return false;
    if (def.verify === def.calc) return false;
    if (typeof def.main !== 'string' || !TYPE_RE.test(def.main)) return false;
    if (!Array.isArray(def.cases) || def.cases.length < 2) return false;
    for (var i = 0; i < def.cases.length; i++) {
      var cs = def.cases[i];
      if (!_isObj(cs) || !_isObj(cs.c) || !_isObj(cs.want) || !_has(cs.want, def.main) || _hasPot(cs.c, 0)) return false;
    }
    if (def.qNums != null && typeof def.qNums !== 'function') return false;
    if (def.qCards != null && typeof def.qCards !== 'function') return false;
    if (def.chip != null && CHIPS.indexOf(def.chip) < 0) return false;
    return true;
  }
  function defineCalc(type, def) {
    if (typeof type !== 'string' || !TYPE_RE.test(type) || type in Object.prototype) return false;
    if (_has(CALCS, type) || _has(REG, type) || _has(CALC_MAIN, type)) return false;
    if (!_defOk(def)) return false;
    REG[type] = def;
    REG_ORDER.push(type);
    CALC_MAIN[type] = def.main;
    return true;
  }
  function calcDef(type) { return (typeof type === 'string' && _has(REG, type)) ? REG[type] : null; }
  function calcTypes() { return REG_ORDER.slice(); }
  // 테스트 전용: 등록 유형만 지운다(내장 유형은 false)
  function _undefineCalc(type) {
    if (!calcDef(type)) return false;
    delete REG[type];
    delete CALC_MAIN[type];
    REG_ORDER = REG_ORDER.filter(function(t) { return t !== type; });
    return true;
  }
  function _err(e) { return 'calc 계산 실패: ' + (e && e.message ? e.message : e); }

  function calc(c) {
    if (!_isObj(c) || !c.type) return { error: 'calc에 type이 없어요' };
    if (_has(c, 'pot')) return { error: 'pot 필드는 쓰지 않아요(potTotal만)' };
    if (_has(CALCS, c.type)) {
      try { return CALCS[c.type](c); } catch (e) { return { error: _err(e) }; }
    }
    var d = calcDef(c.type);
    if (!d) return { error: '알 수 없는 calc 유형: ' + c.type };
    var r;
    try { r = d.calc(c); } catch (e2) { return { error: _err(e2) }; }
    if (!_isObj(r)) return { error: c.type + ' calc 결과가 객체가 아니에요' };
    if (r.error) return { error: String(r.error) };
    if (!_has(r, d.main) || r[d.main] == null || r[d.main] === '') return { error: c.type + ' calc 결과에 ' + d.main + ' 값이 없어요' };
    return r;
  }

  // ── 템플릿 변수(L3) ──────────────────────────────────
  function _need(potTotal, toCall) {
    if (!_fin(potTotal) || !_fin(toCall)) return null;
    var p = Number(potTotal), t = Number(toCall);
    if (p < 0 || t < 0 || p + t <= 0) return null;
    return Math.round(t * 100 / (p + t));
  }
  function _eqFrac(e) {
    if (!_fin(e)) return null;
    e = Number(e);
    if (e > 1) e = e / 100;
    return (e >= 0 && e <= 1) ? e : null;
  }
  // SceneRender.vars가 없을 때(또는 bar 변수가 아직 없을 때) 같은 규칙으로 채우는 대체 경로
  function _baseVars(sc) {
    var out = {};
    if (_fin(sc.potTotal)) out.potTotal = _bb(sc.potTotal);
    if (_fin(sc.toCall)) out.toCall = _bb(sc.toCall);
    var nd = _need(sc.potTotal, sc.toCall);
    if (nd != null) { out.need = nd; out.pct = nd; }
    if (_isObj(sc.need)) { var n2 = _need(sc.need.potTotal, sc.need.toCall); if (n2 != null) out.need = n2; }
    var e = _eqFrac(sc.eq);
    if (e != null) out.eq = Math.round(e * 100);
    return out;
  }
  function _barEq(sc) {
    var src = null;
    if (sc.kind === 'compare') src = sc;
    else if (Array.isArray(sc.rows) && sc.rows.length) src = sc.rows[0];
    if (!src) return null;
    var r = null;
    if (src.precalc != null) r = calc({ type: 'eq', precalc: src.precalc });
    else if (_isObj(src.exact)) r = calc({ type: 'eqExact', hero: src.exact.hero, vs: src.exact.vs, board: src.exact.board });
    return (r && !r.error) ? r.eq : null;
  }
  function vars(scene) {
    var sc = _isObj(scene) ? scene : {};
    var out = {}, S = _sr(), k;
    var base = null;
    if (S && typeof S.vars === 'function') { try { base = S.vars(sc); } catch (e) { base = null; } }
    if (!_isObj(base)) base = _baseVars(sc);
    for (k in base) if (_has(base, k) && base[k] != null) out[k] = base[k];
    if (sc.t === 'bar') {
      if (out.eq == null) { var be = _barEq(sc); if (be != null) out.eq = be; }
      if (out.need == null && _isObj(sc.need)) { var bn = _need(sc.need.potTotal, sc.need.toCall); if (bn != null) out.need = bn; }
    }
    if (_isObj(sc.calc)) {
      var r = calc(sc.calc);
      if (!r.error) for (k in r) if (_has(r, k) && r[k] != null) out[k] = r[k];
    }
    return out;
  }
  function _fillV(text, v) {
    return String(text == null ? '' : text).replace(TPL, function(m, name) {
      return (_has(v, name) && v[name] != null && v[name] !== '') ? String(v[name]) : '?';
    });
  }
  function fill(text, scene) { return _fillV(text, vars(scene)); }
  function _tplNames(text) {
    var out = [], m;
    var re = new RegExp(TPL.source, 'g');
    while ((m = re.exec(String(text == null ? '' : text))) !== null) out.push(m[1]);
    return out;
  }

  // ── 찾기 ─────────────────────────────────────────────
  function find(id) {
    if (id == null || id === '') return null;
    var L = _lessons(), i;
    for (i = 0; i < L.length; i++) if (L[i] && L[i].id === id) return L[i];
    for (i = 0; i < L.length; i++) if (L[i] && L[i].node === id) return L[i];
    return null;
  }

  // ── L4 정답 칸 ───────────────────────────────────────
  function _same(a, b) {
    if (_fin(a) && _fin(b) && typeof a !== 'boolean' && typeof b !== 'boolean') return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
    return String(a) === String(b);
  }
  function _firstNum(s) {
    var m = /-?\d+(?:\.\d+)?/.exec(String(s == null ? '' : s));
    return m ? Number(m[0]) : null;
  }
  var LAST_Q = /마지막|맨 끝|가장 늦게/;
  // 결과 변수 이름(M4): calc.of가 있으면 그것, 없으면 유형의 첫 변수(j-lessons wantOf와 같은 규칙)
  function wantKey(ask) {
    var c = _isObj(ask) && _isObj(ask.calc) ? ask.calc : {};
    if (typeof c.of === 'string' && c.of) return c.of;
    return (typeof c.type === 'string' && _has(CALC_MAIN, c.type)) ? CALC_MAIN[c.type] : undefined;
  }
  // order 질문이 마지막 자리를 묻는데 calc.of가 없으면 첫 자리(first)와 비교하게 되므로 데이터 오류(j-lessons ask.of와 같은 규칙)
  function _lastWithoutOf(ask) {
    var c = _isObj(ask) && _isObj(ask.calc) ? ask.calc : null;
    return !!(c && c.type === 'order' && !c.of && LAST_Q.test(String(ask.q == null ? '' : ask.q)));
  }
  function answerValue(ask) {
    if (!_isObj(ask) || !_isObj(ask.calc)) return { error: 'calc 없음' };
    var r = calc(ask.calc);
    if (r.error) return r;
    var key = wantKey(ask);
    if (!_has(r, key)) return { error: 'calc 결과에 ' + key + ' 값이 없어요' };
    return { value: r[key], key: key, vars: r };
  }
  // calc가 있는 ask의 엔진 정답 칸(0부터) | {error}
  function answerIndex(ask) {
    var av = answerValue(ask);
    if (av.error) return av;
    var ch = Array.isArray(ask.choices) ? ask.choices : [];
    var hits = [], i;
    if (Array.isArray(ask.pick)) {
      if (ask.pick.length !== ch.length) return { error: 'pick 길이가 보기 수와 달라요' };
      for (i = 0; i < ask.pick.length; i++) if (_same(ask.pick[i], av.value)) hits.push(i);
    } else {
      if (!_fin(av.value)) return { error: '결과값이 숫자가 아니라 pick이 필요해요(' + av.key + ' = ' + av.value + ')' };
      var v = vars(ask);
      for (i = 0; i < ch.length; i++) { var n = _firstNum(_fillV(ch[i], v)); if (n != null && _same(n, av.value)) hits.push(i); }
    }
    if (hits.length !== 1) return { error: '엔진값(' + av.key + ' = ' + av.value + ')과 같은 보기가 ' + hits.length + '개예요(정확히 1개여야 해요)' };
    return { index: hits[0], value: av.value, key: av.key };
  }

  // ── 상태기계(L8) ─────────────────────────────────────
  function create(lesson, sceneIdx, deps) {
    deps = deps || {};
    var scenes = (lesson && Array.isArray(lesson.scenes)) ? lesson.scenes.filter(_isObj) : [];
    var n = scenes.length;
    var node = lesson ? String(lesson.node || lesson.id || '') : '';
    var lid = lesson ? String(lesson.id || lesson.node || '') : '';
    var start = Math.floor(_fin(sceneIdx) ? Number(sceneIdx) : 0);
    var idx = n ? Math.max(0, Math.min(n - 1, start)) : 0;
    var phase = n ? 'show' : 'done';
    var answers = {}, tried = {};
    var ready = true, timerH = null, dead = false;

    function emit(evt) {
      if (typeof deps.record !== 'function') return;
      try { deps.record(evt); } catch (e) { /* 기록 실패는 진행을 막지 않는다 */ }
    }
    function clearT() {
      if (timerH != null && typeof deps.clear === 'function') { try { deps.clear(timerH); } catch (e) { /* 무시 */ } }
      timerH = null;
    }
    function enter(i) {
      clearT();
      idx = i;
      phase = answers[i] ? 'answered' : 'show';
      ready = true;
      emit({ kind: 'scene', idx: i });
    }
    function _canNext() {
      if (phase === 'done' || !n || dead) return false;
      var sc = scenes[idx];
      if (sc.t === 'ask' && !answers[idx]) return false;
      return ready;
    }
    function state() {
      var a = answers[idx] || null;
      return { idx: idx, n: n, scene: scenes[idx] || null, phase: phase, picked: a ? a.picked : null, ok: a ? a.ok : null,
        ready: ready, last: idx === n - 1, canNext: _canNext(), canPrev: phase !== 'done' && idx > 0 && !dead, node: node, id: lid };
    }
    function next() {
      if (!_canNext()) return false;
      if (idx >= n - 1) { clearT(); phase = 'done'; emit({ kind: 'done' }); return true; }
      enter(idx + 1);
      return true;
    }
    function prev() {
      if (phase === 'done' || idx <= 0 || dead) return false;
      enter(idx - 1);
      return true;
    }
    function answer(i) {
      if (phase !== 'show' || dead) return null;
      var sc = scenes[idx];
      if (!sc || sc.t !== 'ask') return null;
      var ch = Array.isArray(sc.choices) ? sc.choices : [];
      i = Number(i);
      if (!(i >= 0 && i < ch.length) || Math.floor(i) !== i) return null;
      var ok = i === Number(sc.answer);
      var qid = String(sc.id != null && sc.id !== '' ? sc.id : 'q' + (idx + 1));
      var first = !tried[qid];
      tried[qid] = true;
      answers[idx] = { picked: i, ok: ok };
      phase = 'answered';
      var why = sc.why ? fill(sc.why, sc) : '';
      emit({ kind: 'answer', qid: qid, key: node + '|' + qid, ok: ok, first: first });
      if (!ok && typeof deps.timer === 'function') {
        ready = false;
        var at = idx;
        try {
          timerH = deps.timer(function() {
            timerH = null;
            if (dead || idx !== at || phase !== 'answered') return;
            ready = true;
            if (deps.autoNext) next();
          }, WRONG_MS);
        } catch (e) { ready = true; timerH = null; }
      }
      return { ok: ok, why: why };
    }
    function destroy() { clearT(); dead = true; }

    if (n) emit({ kind: 'scene', idx: idx });
    return { state: state, next: next, prev: prev, answer: answer, destroy: destroy };
  }

  // ── 검사(check) ──────────────────────────────────────
  function _strings(o, out, depth) {
    if (depth > 6 || o == null) return out;
    if (typeof o === 'string') { out.push(o); return out; }
    if (Array.isArray(o)) { o.forEach(function(x) { _strings(x, out, depth + 1); }); return out; }
    if (typeof o === 'object') Object.keys(o).forEach(function(k) { _strings(o[k], out, depth + 1); });
    return out;
  }
  function _hasPot(o, depth) {
    if (!o || typeof o !== 'object' || depth > 6) return false;
    if (Array.isArray(o)) return o.some(function(x) { return _hasPot(x, depth + 1); });
    if (_has(o, 'pot')) return true;
    return Object.keys(o).some(function(k) { return _hasPot(o[k], depth + 1); });
  }
  function _numOutsideTpl(s) { return NUM_UNIT.test(String(s).replace(new RegExp(TPL.source, 'g'), '')); }

  // (M4-P7) cards 장면의 아웃츠 표 줄(outs)과 아웃 카드 줄(outCards) 검산(L2 cards)
  function _checkOutsRows(sc, i, e) {
    sc.rows.forEach(function(r, k) {
      if (!_isObj(r)) return;
      var where = 'cards ' + (k + 1) + '번 줄';
      if (_has(r, 'outs')) {
        var list = Array.isArray(r.cards) ? r.cards : [];
        if (list.length !== 5) { e(i, where + ': 아웃츠 표 줄은 내 손 2장 + 플랍 3장(5장)이에요'); return; }
        var o = outsOf(list.slice(0, 2), list.slice(2));
        if (o.error) { e(i, where + ': ' + o.error); return; }
        if (o.outs.length !== Number(r.outs)) { e(i, where + ': 열거한 아웃츠 ' + o.outs.length + '장인데 outs는 ' + r.outs); return; }
        var ln = _firstNum(r.label);
        if (ln != null && ln !== o.outs.length) e(i, where + ': label 숫자 ' + ln + '가 아웃츠 ' + o.outs.length + '장과 달라요');
        var v = _outsVars(o.outs.length, o.unseen), got = [], m, re = /(\d+(?:\.\d+)?)\s*%/g;
        while ((m = re.exec(String(r.note == null ? '' : r.note))) !== null) got.push(Number(m[1]));
        if (got.length !== 2 || got[0] !== Number(v.pct2) || got[1] !== Number(v.pct1)) {
          e(i, where + ': note의 확률은 2장 ' + v.pct2 + '%, 1장 ' + v.pct1 + '% 차례여야 해요(지금 ' + got.join(', ') + ')');
        }
      }
      if (r.outCards) {
        var c = sc.calc;
        if (!_isObj(c) || c.type !== 'outs' || c.hero == null) { e(i, where + ': outCards 줄은 같은 장면에 calc outs(hero, board)가 필요해요'); return; }
        var oc = outsOf(c.hero, c.board);
        if (oc.error) return;   // calc 오류로 이미 보고
        var shown = (Array.isArray(r.cards) ? r.cards : []).map(function(x) { var cd = _card(x); return cd ? cd.rank + cd.suit : '?'; });
        var want = oc.outs.slice().sort().join(' '), have = shown.slice().sort().join(' ');
        if (want !== have) e(i, where + ': 아웃 카드 그림이 열거 결과(' + want + ')와 달라요');
      }
    });
  }

  function check(lesson) {
    var errs = [];
    function e(scene, msg) { errs.push({ scene: scene, msg: msg }); }
    if (!_isObj(lesson)) { e(-1, '레슨 객체가 아니에요'); return errs; }
    if (!lesson.id || typeof lesson.id !== 'string') e(-1, 'id가 없어요');
    if (!lesson.node || typeof lesson.node !== 'string') e(-1, 'node가 없어요');
    else if (lesson.id && lesson.id !== lesson.node) e(-1, 'id와 node가 달라요(L1: id = node)');
    if (!lesson.title || typeof lesson.title !== 'string') e(-1, 'title이 없어요');
    if (!(_fin(lesson.est) && Number(lesson.est) >= 2 && Number(lesson.est) <= 4)) e(-1, 'est는 2~4분이에요');
    if (!lesson.source || typeof lesson.source !== 'string') e(-1, 'source가 없어요');
    var nodes = (typeof JOURNEY_NODES !== 'undefined' && Array.isArray(JOURNEY_NODES)) ? JOURNEY_NODES : null;
    if (nodes && lesson.node) {
      var nd = nodes.filter(function(x) { return x && x.id === lesson.node; })[0];
      if (!nd) e(-1, '노드가 없어요: ' + lesson.node);
      else if (nd.lesson !== lesson.id) e(-1, '노드의 lesson 필드(' + nd.lesson + ')와 레슨 id가 달라요');
    }
    _strings({ title: lesson.title, source: lesson.source }, [], 0).forEach(function(s) { if (FORBID.test(s)) e(-1, '가운뎃점이나 긴줄표가 있어요: ' + s); });
    var scenes = Array.isArray(lesson.scenes) ? lesson.scenes : null;
    if (!scenes) { e(-1, 'scenes가 없어요'); return errs; }
    if (scenes.length < 6 || scenes.length > 9) e(-1, '장면은 6~9개예요(지금 ' + scenes.length + '개)');
    var sums = scenes.filter(function(s) { return _isObj(s) && s.t === 'sum'; }).length;
    if (sums !== 1) e(-1, 'sum 장면은 1개여야 해요(지금 ' + sums + '개)');
    if (!scenes.length || !_isObj(scenes[scenes.length - 1]) || scenes[scenes.length - 1].t !== 'sum') e(-1, '마지막 장면은 sum이에요');
    var qids = {};
    scenes.forEach(function(sc, i) {
      if (!_isObj(sc)) { e(i, '장면 객체가 아니에요'); return; }
      if (TYPES.indexOf(sc.t) < 0) { e(i, '알 수 없는 장면 유형: ' + sc.t); return; }
      _strings(sc, [], 0).forEach(function(s) { if (FORBID.test(s)) e(i, '가운뎃점이나 긴줄표가 있어요: ' + s); });
      if (_hasPot(sc, 0)) e(i, 'pot 필드는 쓰지 않아요(potTotal만)');
      if (_has(sc, 'label') && sc.label !== '참고') e(i, "label은 '참고'만 써요");
      var v = vars(sc);
      var tplCheck = function(field, s, allowNum) {
        if (s == null) return;
        if (typeof s !== 'string') { e(i, field + '는 문자열이에요'); return; }
        _tplNames(s).forEach(function(name) { if (!_has(v, name) || v[name] == null || v[name] === '') e(i, field + '의 {{' + name + '}}가 정의되지 않았어요'); });
        if (!allowNum && _numOutsideTpl(s)) e(i, field + '에 숫자+% 또는 숫자+bb는 {{ }} 템플릿으로만 써요: ' + s);
      };
      if (sc.caption != null) {
        tplCheck('caption', sc.caption, false);
        if (typeof sc.caption === 'string' && sc.caption.length > CAP_MAX) e(i, 'caption이 ' + CAP_MAX + '자를 넘어요(' + sc.caption.length + '자)');
      }
      var cr = null;
      if (_isObj(sc.calc) || _has(sc, 'calc')) {
        cr = calc(sc.calc);
        if (cr.error) e(i, 'calc: ' + cr.error);
      }
      switch (sc.t) {
        case 'say':
          if (!sc.text || typeof sc.text !== 'string') e(i, 'say에 text가 없어요');
          else { tplCheck('text', sc.text, false); if (sc.text.length > CAP_MAX) e(i, 'say text가 ' + CAP_MAX + '자를 넘어요'); }
          break;
        case 'sum':
          if (!sc.text || typeof sc.text !== 'string') e(i, 'sum에 text가 없어요');
          else {
            if (_tplNames(sc.text).length) e(i, 'sum에는 {{ }} 템플릿을 쓰지 않아요(노드 시트에 그대로 남아요)');
            if (NUM_UNIT.test(sc.text)) e(i, 'sum에는 숫자+% 또는 숫자+bb를 쓰지 않아요');
            if (sc.text.length > CAP_MAX) e(i, 'sum text가 ' + CAP_MAX + '자를 넘어요');
          }
          break;
        case 'ask': {
          var id = sc.id;
          if (id == null || id === '' || typeof id !== 'string') e(i, 'ask에 id가 없어요');
          else if (qids[id]) e(i, 'ask id가 겹쳐요: ' + id);
          else qids[id] = true;
          if (!sc.q || typeof sc.q !== 'string') e(i, 'ask에 q가 없어요');
          var ch = sc.choices;
          if (!Array.isArray(ch) || ch.length < 2 || ch.length > 4) e(i, 'choices는 2~4개예요');
          else ch.forEach(function(c, k) { if (typeof c !== 'string' || !c.trim()) e(i, k + 1 + '번 보기가 비었어요'); });
          var nch = Array.isArray(ch) ? ch.length : 0;
          if (!(_fin(sc.answer) && Math.floor(Number(sc.answer)) === Number(sc.answer) && Number(sc.answer) >= 0 && Number(sc.answer) < nch)) e(i, 'answer 칸 번호가 맞지 않아요');
          if (!sc.why || typeof sc.why !== 'string') e(i, 'ask에 why(한 줄 해설)가 없어요');
          else { tplCheck('why', sc.why, false); if (sc.why.length > CAP_MAX) e(i, 'why가 ' + CAP_MAX + '자를 넘어요'); }
          var hasCalc = _isObj(sc.calc);
          tplCheck('q', sc.q, hasCalc);
          if (Array.isArray(ch)) ch.forEach(function(c, k) { if (typeof c === 'string') tplCheck((k + 1) + '번 보기', c, hasCalc); });
          if (_has(sc, 'pick') && !Array.isArray(sc.pick)) e(i, 'pick은 배열이에요');
          if (hasCalc && cr && !cr.error && _lastWithoutOf(sc)) {
            e(i, "L4: 순서 문제가 마지막 자리를 물으면 calc.of = 'last'를 적어요(없으면 첫 자리와 비교해요)");
          } else if (hasCalc && cr && !cr.error) {
            var ai = answerIndex(sc);
            if (ai.error) e(i, 'L4: ' + ai.error);
            else if (ai.index !== Number(sc.answer)) e(i, 'L4: 엔진 정답은 ' + (ai.index + 1) + '번 보기인데 answer는 ' + (Number(sc.answer) + 1) + '번이에요');
          } else if (!hasCalc && _has(sc, 'pick')) e(i, 'pick은 calc가 있을 때만 써요');
          break;
        }
        case 'grid':
          if (PRE.indexOf(sc.pos) < 0 && !(Array.isArray(sc.layers) && sc.layers.length)) e(i, 'grid 자리를 알 수 없어요: ' + sc.pos);
          if (_has(sc, 'facing') && !_facingOk(sc.facing)) e(i, 'grid facing 값을 알 수 없어요: ' + sc.facing);
          if (_has(sc, 'highlight') && !Array.isArray(sc.highlight)) e(i, 'highlight는 배열이에요');
          if (_has(sc, 'claim')) {
            var cl = sc.claim, S = _sr();
            if (!_isObj(cl) || !cl.hand || !cl.action) e(i, 'claim은 {hand, action}이에요');
            else {
              var act = (S && typeof S.cellAction === 'function') ? S.cellAction(_spot(sc), cl.hand) : null;
              if (act !== cl.action) e(i, 'claim ' + cl.hand + ' ' + cl.action + '가 차트(' + act + ')와 달라요');
            }
          }
          break;
        case 'ring': {
          if (_need(sc.potTotal, sc.toCall) == null) e(i, 'ring에는 potTotal과 toCall 숫자가 필요해요');
          break;
        }
        case 'table':
          if (!Array.isArray(sc.seats)) e(i, 'table에 seats가 없어요');
          else {
            var seen = {};
            sc.seats.forEach(function(s) {
              if (!_isObj(s) || PRE.indexOf(s.pos) < 0) e(i, 'table 자리를 알 수 없어요: ' + (s && s.pos));
              else if (seen[s.pos]) e(i, 'table 자리가 겹쳐요: ' + s.pos);
              else seen[s.pos] = true;
            });
          }
          if (sc.heroPos != null && PRE.indexOf(sc.heroPos) < 0) e(i, 'heroPos를 알 수 없어요: ' + sc.heroPos);
          break;
        case 'bar': {
          var kind = sc.kind;
          var srcOk = function(src, where) {
            if (!_isObj(src)) { e(i, where + ' 항목이 없어요'); return; }
            if (src.precalc != null) { var r1 = calc({ type: 'eq', precalc: src.precalc }); if (r1.error) e(i, where + ': ' + r1.error); }
            else if (_isObj(src.exact)) { var r2 = calc({ type: 'eqExact', hero: src.exact.hero, vs: src.exact.vs, board: src.exact.board }); if (r2.error) e(i, where + ': ' + r2.error); }
            else e(i, where + '에 precalc 또는 exact가 필요해요');
          };
          if (kind === 'amount') {
            if (!Array.isArray(sc.rows) || !sc.rows.length) e(i, 'bar amount에 rows가 없어요');
            else sc.rows.forEach(function(r, k) { if (!_isObj(r) || !_fin(r.bb)) e(i, 'bar amount ' + (k + 1) + '번 줄에 bb 숫자가 없어요'); });
          } else if (kind === 'equity') {
            if (!Array.isArray(sc.rows) || !sc.rows.length) e(i, 'bar equity에 rows가 없어요');
            else sc.rows.forEach(function(r, k) { srcOk(r, 'bar equity ' + (k + 1) + '번 줄'); });
          } else if (kind === 'compare') {
            srcOk(sc, 'bar compare');
            if (!_isObj(sc.need) || _need(sc.need.potTotal, sc.need.toCall) == null) e(i, 'bar compare에 need{potTotal, toCall}가 필요해요');
          } else if (kind === 'pct') {
            // (M5-P0, L9) 줄 값 = 같은 장면 변수(0~100). 값은 v로만 오고 label에는 숫자+%를 쓰지 않는다
            if (!Array.isArray(sc.rows) || !sc.rows.length) e(i, 'bar pct에 rows가 없어요');
            else sc.rows.forEach(function(r, k) {
              var where = 'bar pct ' + (k + 1) + '번 줄';
              if (!_isObj(r) || typeof r.label !== 'string' || !r.label.trim()) { e(i, where + '에 label이 없어요'); return; }
              if (NUM_UNIT.test(r.label)) e(i, where + ' label에 숫자+% 또는 숫자+bb를 쓰지 않아요(값은 v 변수로): ' + r.label);
              if (typeof r.v !== 'string' || !r.v) { e(i, where + '에 v(같은 장면 변수 이름)가 없어요'); return; }
              if (!_has(v, r.v) || v[r.v] == null || v[r.v] === '') { e(i, where + '의 변수 ' + r.v + '가 정의되지 않았어요'); return; }
              var x = Number(v[r.v]);
              if (!_fin(v[r.v]) || typeof v[r.v] === 'boolean' || x < 0 || x > 100) e(i, where + '의 ' + r.v + ' = ' + v[r.v] + '는 0~100 숫자가 아니에요');
            });
          } else e(i, "bar kind는 'amount', 'equity', 'compare', 'pct'예요");
          break;
        }
        case 'cards':
          if (!Array.isArray(sc.cards) && !Array.isArray(sc.rows)) e(i, 'cards에 cards 또는 rows가 없어요');
          else if (Array.isArray(sc.rows)) _checkOutsRows(sc, i, e);
          break;
        case 'compare':
          if (!Array.isArray(sc.cols) || sc.cols.length !== 3) e(i, 'compare cols는 3개예요');
          break;
        case 'widget':
          if (!sc.name || typeof sc.name !== 'string') e(i, 'widget에 name이 없어요');
          break;
      }
    });
    return errs;
  }

  var api = {
    TYPES: TYPES.slice(), CALC_MAIN: CALC_MAIN, WRONG_MS: WRONG_MS, CAP_MAX: CAP_MAX, BUILTIN_CALCS: BUILTIN_CALCS.slice(),
    find: find, create: create, vars: vars, fill: fill, check: check,
    calc: calc, eqExact: eqExact, wantKey: wantKey, answerValue: answerValue, answerIndex: answerIndex, tplNames: _tplNames,
    outsOf: outsOf,
    defineCalc: defineCalc, calcDef: calcDef, calcTypes: calcTypes, _undefineCalc: _undefineCalc
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
