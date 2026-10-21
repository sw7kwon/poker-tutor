// puzzles/puzzle-core.js (채우는 패키지: M2-P1, register/get/meta/has/types 시그니처 유지)
//
// 그룹 간 계약 정본 C1~C9 (M2 사전 등록). 각 패키지는 이 계약에 맞춰 구현한다.
//
// C1 생성기: Puzzles.register(type, gen, meta{stage, group:'preflop'|'math'|'other', concept})
//   gen은 다음 함수를 가진다.
//   - next(rnd, opts) -> q|null
//   - verify(q) -> boolean: next와 다른 독립 경로로 정답을 재계산한다.
//   - explain(q) -> {line(1~2줄), scene?}
//   - fromKey(key, rnd, opts) -> q|null: srs 유형은 필수. 같은 key로 다시 낸다.
//   - ready() -> boolean: 선택. 데이터 준비 여부.
//   opts = {variant, spots, stage, rating, noReview, now, bank}. 등록은 typeof Puzzles 가드로 한다.
//   confidence, rated, srs, base의 정본은 M2-P1의 Puzzles.TYPE_META(부록 C)다.
//
// C2 문항: q = {type, key, concept, difficulty, confidence, appDef, rated, srs, prompt, scene, options, answer, ui?, variant?, data?}
//   - key: srs면 문자열, once면 null. Drills.record(type, key)에 그대로 넘긴다.
//   - confidence: 'exact'|'chart'|'approx'. rated는 bool이고 자명 문항은 false. srs: 'srs'|'once'.
//   - prompt: 한국어 2줄 이내. scene: C3 또는 null.
//   - options: [{id, label, near?}]. near는 정답에 가까운 오답 표시로, 데일리 5의 '아쉬움' 등급에 쓴다.
//   - answer: 보기 id. ui: 'choice'가 기본, 'paint'도 있다. data: 재계산용 원자료.
//
// C3 장면: scene = {hero?['Ah','Kd'], board?[], potTotal?(bb, 상대 벳 포함), toCall?, stack?,
//   seats?[{pos, label?, active?, hero?}], range?{label, combos?['AhKh'], text?},
//   grid?{pos, facing, opener, highlight[]}, ring?{potTotal, toCall}, note?}
//   카드 문자열 = 랭크(2~9, T, J, Q, K, A) + 무늬(s, h, d, c).
//
// C4 SceneRender(M2-P4a), 전부 순수 문자열이다.
//   - cards(list, opts) -> html: 카드마다 class="card ..."와 data-suit.
//   - grid(spec, opts{mini}) -> html
//   - gridSelect(state, tap) -> state: 2단계 선택 순수 함수.
//   - ring({potTotal, toCall, eq?}) -> html
//   - scene(obj) -> html
//
// C5 PuzzleUI(M2-P4bc):
//   - start({type, count, set?, variant?, spots?, node?, rated?, title?, onDone(r)})
//   - review({items:[{type, key, box, fill?, concept?, spots?}], onDone(r)})
//   - can(typeOrSpec) -> boolean
//   - run(hooks)
//   r = {n, ok, xp, rated, ratingDelta}. Drills.record, JStats.record('puzzle'), Rating, XP, A11y.fx는
//   PuzzleUI가 처리한다. 호출자는 XP를 다시 주지 않는다.
//
// C6 PuzzleModes(M2-P4bc): rush(opts?), survival(opts?), daily5(opts?), daily5Status(now) -> {done, score|null}.
//   결과는 opts.onDone(r)로 받는다. 인자 없이 불러도 동작해야 한다.
//
// C7 Rating(M2-P1):
//   - update(player, results): 순수 Glicko-2.
//   - current() -> {r, rd, vol, n}
//   - label(rating?) -> '1000?': RD가 100을 넘으면 '?'를 붙인다.
//   - record(q, ok, now): 첫 시도이고 Puzzles.isRated(q)일 때만 pending에 넣는다(복습 q.review, 재도전 q.retry, 연습 q.practice 제외).
//   - commit(now) -> {r, rd, delta}. 저장 위치는 poker_journey.rating이다.
//
// C8 A11y(M2-P5): load(), save(patch), apply(settings), reduced(), fx('ok'|'bad'|'tap'|'done'),
//   supports() -> {vibrate, audio}. 키 poker_journey_settings는 JourneyUI._readSettings와 같이 쓴다.
//
// C9 오늘의 5분과 은행:
//   - Today.build의 채움 항목 = {type(등록된 퍼즐 유형), key:null, box:null, concept, fill:true, spots?}.
//     입력 ctx.puzzleTypes는 TodayUI.ctx가 채운다.
//   - eqbucket 은행: PUZZLE_SEEDS.eqbucket = {buckets:[0,0.30,0.50,0.70,1], items:[{id, hero:'9h8h',
//     board:'Th7c2h'|'', vs:{kind:'random'}|{kind:'range', spot:'rfi|BTN'}, eq}]}
//
// M2-P1 구현(계약 C1, C2, C7 위에 얹은 코어 API). register/get/meta/has/types 시그니처는 그대로다.
//   TYPE_META[type] = {confidence, appDef, rated, srs, stage, group, base, concept, ui?}: 부록 C 27유형의 정본.
//     stage = 그 유형이 처음 나오는 노드의 단계(부록 A). group은 데일리 5 구성용('preflop'|'math'|'other').
//     approx와 앱 정의(appDef) 유형은 rated:false. cbet2, intent, prescribe와 once 유형은 srs:'once'.
//     (M7, PZ-01) 유형 정본이 appDef false여도 문항이 appDef: true + rated: false로 나오면(minraise opensize 이 앱 표준 사이즈,
//     rangehit steps 이 앱의 지우기 규칙) 그 문항은 앱 정의다: q.appDef를 유지하고 label은 'appdef'(이 앱의 분류 기준). 레이팅 대상 문항에는 영향 없음.
//   register(type, gen, meta): TYPE_META를 정본으로 병합한다. 생성기가 넘긴 값과 다르면 TYPE_META를 따르고 console.warn.
//     그리고 Drills.keyPolicy(type, 'once'|'srs')를 맞춘다. 부록 C에 없는 유형(테스트용 '_t' 접두)은 넘긴 meta를 쓴다.
//   next(type, rnd, opts) -> q|null: gen.next를 부르고 confidence가 TYPE_META와 다르면 폐기, verify 실패면 재생성(최대 20회).
//   verify(q) -> bool: 형식 검사(보기, 정답, key) + gen.verify(q)(독립 재계산).
//   fromKey(type, key, rnd, opts) -> q|null(q.review = true: 복습이라 Rating.record가 레이팅에서 뺀다), available(type), isRated(q), explain(q) -> {line, scene?}
//   label(q) -> {kind:'engine'|'given-range'|'chart'|'appdef'|'approx'|'character'|'concept', text}: 설계서 8.2절 문구 그대로.
//     (M6-PAINT, 계약 H12) 유형 'lesson'(레슨 복습)만 q.labelKind('chart' | 'appdef' | 'approx'(레슨 장면 label '참고'), gen-lesson fromKey가 채움)를 따른다.
//     (M7, 결정 27) 'concept'(레슨 개념): calc 없는 레슨 개념 질문. 엔진이 검산한 값이 아니라 레슨에서 배운 개념 확인 문제다.
//     다른 유형은 q.labelKind가 있어도 무시한다(라벨은 유형 정본 TYPE_META가 정한다).
//   dailySeed(dayKey) -> uint32: 결정론 해시('YYYY-MM-DD', 'YYYYMMDD', 타임스탬프 모두 같은 날이면 같은 값).
//   daily5(dayKey, stage) -> q 5개: 단계+1 이하, 레이팅 대상 exact/chart만, opts.noReview:true로 생성.
//     구성 프리플랍 2, 수학 1, 그 외 2(S1은 그 외 2를 showdown/order/tocall로). 모자라면 가용 유형으로 채워 5문항 유지.
//   pickType(stage, rating, rnd, opts{concept, exclude, rated, paint}) -> type|null: 단계+1 이하에서 window(r) 근처 유형.
//     (M6-PAINT) ui 'paint' 유형(rangepaint)은 opts.paint가 true일 때만 후보다. 러시, 서바이벌, 구형 채움은 보기 문항만 고른다
//     (PuzzleUI.can('rangepaint')가 true가 되어도 점수 모드에 색칠 문항이 섞이지 않게).
//   window(r) -> [r-300, r-200]
//   preflop 어댑터: PreflopDrill.next/explain/parseKey를 감싸 'preflop'을 등록한다(key 'rfi|UTG|AJo' 그대로).
//     cold3bet|POS, vs4bet|POS 스팟(s3-05, s3-11)은 PreflopDrill이 다루지 않아 이 어댑터가 차트 모델로 직접 낸다.
//   설계서 7.1의 spot(spec)은 쓰는 곳이 없어 만들지 않았다.
var Puzzles = (function() {
  var MAX_TRIES = 20;
  var STAGE_MAX = 6;
  var GROUPS = ['preflop', 'math', 'other'];
  var CONFIDENCES = ['exact', 'chart', 'approx'];
  var META_KEYS = ['confidence', 'appDef', 'rated', 'srs', 'stage', 'group', 'base', 'concept'];

  // 설계서 8.2절 문구(화면 노출 라벨)
  var LABEL_TEXT = {
    engine: '엔진 계산',
    'given-range': '주어진 상대 레인지 기준 엔진 계산',
    chart: '이 앱의 차트 기준(입문용, 표준보다 UTG/HJ/CO가 2~8%p 타이트, SB RFI 32.1%와 vs3bet 표도 타이트)',
    appdef: '이 앱의 분류 기준',
    approx: '공개 솔버 통념을 근사한 참고값',
    character: '이 캐릭터의 생각이고 정답이 아님',
    concept: '레슨 개념'   // M7 결정 27: 설명은 '레슨에서 배운 개념 확인 문제'(puzzle-ui LABELS.concept.full)
  };
  var LABEL_KIND = { 'facingbet-river': 'given-range', intent: 'character' };
  var LESSON_LABEL = { chart: 'chart', appdef: 'appdef', approx: 'approx', concept: 'concept' };   // 계약 H12(+ '참고' 장면은 approx): 레슨 복습 문항이 따를 수 있는 라벨

  function _m(confidence, rated, srs, stage, group, base, concept, extra) {
    var o = { confidence: confidence, appDef: false, rated: rated, srs: srs, stage: stage, group: group, base: base, concept: concept };
    if (extra) Object.keys(extra).forEach(function(k) { o[k] = extra[k]; });
    return Object.freeze(o);
  }
  // 부록 C 표(기본 난이도 = 표의 하한). 단계는 부록 A의 첫 노드.
  var TYPE_META = Object.freeze({
    showdown:          _m('exact',  true,  'once', 1, 'other',   1000, 'showdown'),
    order:             _m('exact',  true,  'once', 1, 'other',   1000, 'order'),
    minraise:          _m('exact',  true,  'srs',  1, 'other',   1050, 'actions'),
    tocall:            _m('exact',  true,  'srs',  1, 'other',   1000, 'actions'),
    preflop:           _m('chart',  true,  'srs',  2, 'preflop', 1200, 'rfi'),
    potodds:           _m('exact',  true,  'srs',  2, 'math',    1200, 'pot_odds'),
    outs:              _m('exact',  true,  'srs',  2, 'math',    1300, 'outs'),
    'outs-x4':         _m('exact',  true,  'srs',  2, 'math',    1350, 'outs'),
    eqbucket:          _m('exact',  true,  'srs',  2, 'math',    1300, 'equity'),
    texture:           _m('exact',  false, 'srs',  3, 'other',   1450, 'board_texture', { appDef: true }),
    cbet2:             _m('approx', false, 'once', 3, 'other',   null, 'cbet'),
    'facingbet-river': _m('exact',  true,  'once', 3, 'other',   1500, 'turn_river'),
    'facingbet-next':  _m('exact',  true,  'once', 3, 'other',   1500, 'draws'),
    spr:               _m('exact',  true,  'srs',  3, 'math',    1450, 'spr'),
    combos:            _m('exact',  true,  'srs',  4, 'math',    1700, 'combos'),
    rangehit:          _m('exact',  true,  'once', 4, 'other',   1750, 'range'),
    mdf:               _m('exact',  true,  'srs',  4, 'math',    1700, 'mdf'),
    alpha:             _m('exact',  true,  'srs',  4, 'math',    1700, 'alpha'),
    bluffratio:        _m('exact',  true,  'srs',  4, 'math',    1700, 'value_bluff'),
    rangepaint:        _m('chart',  true,  'srs',  5, 'preflop', 2000, 'range', { ui: 'paint' }),
    rangeshape:        _m('exact',  false, 'srs',  5, 'other',   2000, 'range', { appDef: true }),
    toygame:           _m('exact',  true,  'srs',  5, 'math',    2000, 'value_bluff'),
    geosize:           _m('exact',  true,  'srs',  5, 'math',    2000, 'spr'),
    variance:          _m('exact',  true,  'srs',  6, 'math',    2000, 'variance'),
    intent:            _m('approx', false, 'once', 6, 'other',   null, 'read'),
    hudread:           _m('exact',  false, 'srs',  6, 'other',   2200, 'read', { appDef: true }),
    prescribe:         _m('approx', false, 'once', 6, 'other',   null, 'read')
  });

  // 약점 개념(게임 V.concept, 커리큘럼 key) -> 퍼즐 유형. TYPE_META.concept가 같은 유형도 함께 고른다.
  var CONCEPT_TYPES = Object.freeze({
    rfi: ['preflop'], vs_rfi: ['preflop'], blind_defense: ['preflop'], vs_3bet: ['preflop'],
    starting_hands: ['preflop'], preflop_summary: ['preflop'], exam_preflop: ['preflop'], position: ['order', 'preflop'],
    pot_odds: ['potodds'], draws: ['outs', 'outs-x4', 'facingbet-next'], outs: ['outs', 'outs-x4'],
    equity: ['eqbucket', 'facingbet-next', 'facingbet-river'], cbet: ['cbet2'], board_texture: ['texture'], texture: ['texture'],
    value_bluff: ['bluffratio', 'alpha', 'toygame'], turn_river: ['facingbet-river'], multiway: ['facingbet-river'],
    exam_postflop: ['facingbet-river', 'facingbet-next'], actions: ['minraise', 'tocall'], sizing: ['minraise', 'geosize'],
    hand_rankings: ['showdown'], showdown: ['showdown'], order: ['order'], combos: ['combos'], hand_reading: ['rangehit', 'combos'],
    range: ['rangehit', 'rangepaint', 'rangeshape'], mdf: ['mdf'], alpha: ['alpha'], spr: ['spr', 'geosize'],
    read: ['hudread', 'intent', 'prescribe'], villain_types: ['hudread', 'prescribe'], variance: ['variance'], bankroll: ['variance']
  });
  var S1_OTHER = ['showdown', 'order', 'tocall'];
  var DAILY_SLOTS = [['preflop', 2], ['math', 1], ['other', 2]];
  var DAILY_N = 5;
  var PICK_SIGMA = 100;

  var _reg = {};

  function _num(x, d) { x = Number(x); return isFinite(x) ? x : d; }
  function _warn() {
    try { if (typeof console !== 'undefined' && console.warn) console.warn.apply(console, ['[Puzzles]'].concat([].slice.call(arguments))); } catch (e) {}
  }
  function _copy(o) { var r = {}; Object.keys(o || {}).forEach(function(k) { r[k] = o[k]; }); return r; }
  function _clampStage(s) { return Math.max(1, Math.min(STAGE_MAX, Math.floor(_num(s, 1)))); }
  function _isTest(type) { return String(type).indexOf('_t') === 0; }

  // mulberry32(Drills.rng와 같은 식, 의존 없이 자체 사본)
  function _rng(seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function _pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length) % arr.length]; }
  function _shuffle(arr, rnd) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)) % (i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // ── 등록부 ──────────────────────────────────────────
  function _merge(type, given) {
    given = given || {};
    var canon = TYPE_META[type];
    var m = _copy(given);
    if (canon) {
      var diff = [];
      META_KEYS.forEach(function(k) {
        if (given[k] !== undefined && given[k] !== canon[k]) diff.push(k + '=' + given[k] + '(정본 ' + canon[k] + ')');
        m[k] = canon[k];
      });
      if (canon.ui) m.ui = canon.ui;
      if (diff.length) _warn(type + ' 생성기 meta가 TYPE_META와 다름, TYPE_META를 따름: ' + diff.join(', '));
      return m;
    }
    if (!_isTest(type)) _warn(type + ' 은(는) 부록 C에 없는 유형이라 넘긴 meta를 그대로 쓴다');
    m.confidence = CONFIDENCES.indexOf(given.confidence) >= 0 ? given.confidence : 'approx';
    m.appDef = given.appDef === true;
    m.rated = given.rated === true && m.confidence !== 'approx' && !m.appDef;
    m.srs = given.srs === 'once' ? 'once' : 'srs';
    m.stage = _clampStage(given.stage);
    m.group = GROUPS.indexOf(given.group) >= 0 ? given.group : 'other';
    m.base = isFinite(Number(given.base)) && given.base !== null ? Number(given.base) : null;
    m.concept = given.concept || null;
    return m;
  }
  function register(type, gen, meta) {
    if (!type || !gen || typeof gen.next !== 'function') return null;
    var m = _merge(type, meta);
    _reg[type] = { gen: gen, meta: m };
    if (typeof Drills !== 'undefined' && Drills && typeof Drills.keyPolicy === 'function') {
      try { Drills.keyPolicy(type, m.srs === 'once' ? 'once' : 'srs'); } catch (e) { _warn(e && e.message); }
    }
    return gen;
  }
  function get(t) { return _reg[t] ? _reg[t].gen : null; }
  function meta(t) { return _reg[t] ? _copy(_reg[t].meta) : null; }
  function has(t) { return !!_reg[t]; }
  function types() { return Object.keys(_reg).sort(); }
  function _metaOf(t) { return _reg[t] ? _reg[t].meta : (TYPE_META[t] || null); }
  function _ready(e) {
    if (!e) return false;
    if (typeof e.gen.ready !== 'function') return true;
    try { return !!e.gen.ready(); } catch (x) { return false; }
  }
  function available(type) { return _ready(_reg[type]); }

  // 테스트 전용: '_t' 접두 유형만 지운다(등록부 전체를 비우면 뒤 테스트가 깨진다)
  function _unregister(type) {
    if (!_isTest(type) || !_reg[type]) return false;
    delete _reg[type];
    if (typeof Drills !== 'undefined' && Drills && typeof Drills.keyPolicy === 'function') Drills.keyPolicy(type, 'srs');
    return true;
  }

  // ── 문항 검사와 생성 ────────────────────────────────
  // 생성기 출력에 TYPE_META 값을 채운다. confidence가 정본과 다르거나 형식이 틀리면 null(폐기)
  function _finish(type, q, m) {
    if (!q || typeof q !== 'object') return null;
    if (q.type == null) q.type = type;
    if (q.type !== type) return null;
    if (q.confidence !== m.confidence) return null;
    q.appDef = !!m.appDef || (q.appDef === true && q.rated === false);   // M7 PZ-01: 문항 단위 앱 정의(레이팅 제외)만 허용
    q.srs = m.srs;
    if (m.srs === 'once') q.key = null;
    q.rated = !!m.rated && q.rated !== false;
    if (!isFinite(Number(q.difficulty)) || q.difficulty === null) q.difficulty = m.base;
    if (!q.concept) q.concept = m.concept;
    if (!q.ui) q.ui = m.ui || 'choice';
    if (q.scene === undefined) q.scene = null;
    return q;
  }

  function verify(q) {
    if (!q || typeof q !== 'object' || !q.type) return false;
    var e = _reg[q.type];
    if (!e) return false;
    var m = e.meta;
    if (q.confidence !== m.confidence) return false;
    if (m.srs !== 'once' && !(typeof q.key === 'string' && q.key.length)) return false;
    if (typeof q.prompt !== 'string' || !q.prompt.length) return false;
    if ((q.ui || 'choice') === 'choice') {
      if (!Array.isArray(q.options) || q.options.length < 2) return false;
      var ids = {};
      for (var i = 0; i < q.options.length; i++) {
        var o = q.options[i];
        if (!o || o.id == null || typeof o.label !== 'string' || !o.label.length || ids[o.id]) return false;
        ids[o.id] = true;
      }
      if (!ids[q.answer]) return false;
    }
    if (typeof e.gen.verify !== 'function') return false;
    try { return !!e.gen.verify(q); } catch (x) { return false; }
  }

  function next(type, rnd, opts) {
    var e = _reg[type];
    if (!e || !_ready(e)) return null;
    rnd = (typeof rnd === 'function') ? rnd : Math.random;
    opts = opts || {};
    var warned = false;
    for (var i = 0; i < MAX_TRIES; i++) {
      var q = null;
      try { q = e.gen.next(rnd, opts); }
      catch (x) { if (!warned) { _warn(type + '.next 실패: ' + (x && x.message)); warned = true; } q = null; }
      q = _finish(type, q, e.meta);
      if (q && verify(q)) return q;
    }
    return null;
  }

  function fromKey(type, key, rnd, opts) {
    var e = _reg[type];
    if (!e || !_ready(e) || typeof e.gen.fromKey !== 'function' || key == null) return null;
    rnd = (typeof rnd === 'function') ? rnd : Math.random;
    for (var i = 0; i < 3; i++) {
      var q = null;
      try { q = e.gen.fromKey(key, rnd, opts || {}); } catch (x) { q = null; }
      q = _finish(type, q, e.meta);
      // 같은 key로 다시 낸 문항 = 복습. Rating.record가 첫 시도가 아니라고 보고 레이팅에서 뺀다
      if (q && (e.meta.srs === 'once' || q.key === String(key)) && verify(q)) { q.review = true; return q; }
    }
    return null;
  }

  function explain(q) {
    var e = q && _reg[q.type];
    if (!e || typeof e.gen.explain !== 'function') return { line: '' };
    try { var r = e.gen.explain(q); return (r && typeof r === 'object') ? r : { line: String(r == null ? '' : r) }; }
    catch (x) { return { line: '' }; }
  }

  function _ratedMeta(m) {
    return !!m && m.rated === true && !m.appDef && (m.confidence === 'exact' || m.confidence === 'chart');
  }
  function isRated(q) {
    if (!q || typeof q !== 'object' || !q.type) return false;
    var m = _metaOf(q.type);
    if (!_ratedMeta(m)) return false;
    if (q.confidence !== m.confidence) return false;
    return q.rated !== false && q.appDef !== true;
  }

  function label(q) {
    var t = q && q.type, m = t ? _metaOf(t) : null;
    var conf = m ? m.confidence : (q && q.confidence), appDef = m ? !!m.appDef : !!(q && q.appDef);
    if (q && q.appDef === true && q.rated === false) appDef = true;   // M7 PZ-01: 문항 단위 앱 정의(opensize, steps)
    var kind;
    if (conf === 'approx' || CONFIDENCES.indexOf(conf) < 0) kind = LABEL_KIND[t] === 'character' ? 'character' : 'approx';
    else if (appDef) kind = 'appdef';
    else if (conf === 'chart') kind = 'chart';
    else kind = LABEL_KIND[t] === 'given-range' ? 'given-range' : 'engine';
    if (t === 'lesson' && kind === 'engine' && q && Object.prototype.hasOwnProperty.call(LESSON_LABEL, q.labelKind)) kind = LESSON_LABEL[q.labelKind];
    return { kind: kind, text: LABEL_TEXT[kind] };
  }

  // ── 데일리 5 ────────────────────────────────────────
  function _dayStr(day) {
    if (day instanceof Date) day = day.getTime();
    if (typeof day === 'number' && isFinite(day)) {
      var t = new Date(day), mo = t.getMonth() + 1, d = t.getDate();
      return t.getFullYear() + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d;
    }
    var s = String(day == null ? '' : day).trim();
    var m8 = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    return m8 ? m8[1] + '-' + m8[2] + '-' + m8[3] : s;
  }
  function dailySeed(dayKey) {
    var s = 'daily5|' + _dayStr(dayKey);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
    return (h >>> 0) || 1;
  }
  function _dailyEligible(t, stage) {
    var m = _metaOf(t);
    return available(t) && _ratedMeta(m) && m.stage <= stage + 1 && m.ui !== 'paint';
  }
  // 순수: 가용 유형 목록 -> 유형 5개(프리플랍 2, 수학 1, 그 외 2). 모자란 칸은 가용 유형으로 채운다.
  function _plan(stage, rnd, list) {
    stage = _clampStage(stage);
    list = (list || []).slice().sort();
    if (!list.length) return [];
    var groups = { preflop: [], math: [], other: [] };
    list.forEach(function(t) { var m = _metaOf(t); groups[(m && groups[m.group]) ? m.group : 'other'].push(t); });
    if (stage <= 1) {
      var s1 = groups.other.filter(function(t) { return S1_OTHER.indexOf(t) >= 0; });
      if (s1.length) groups.other = s1;
    }
    var out = [];
    DAILY_SLOTS.forEach(function(slot) {
      var pool = _shuffle(groups[slot[0]], rnd);
      for (var i = 0; i < slot[1]; i++) out.push(pool.length ? pool[i % pool.length] : null);
    });
    var fill = _shuffle(list, rnd), k = 0;
    for (var j = 0; j < out.length; j++) {
      if (out[j]) continue;
      var unused = fill.filter(function(t) { return out.indexOf(t) < 0; });
      out[j] = unused.length ? unused[0] : fill[k++ % fill.length];
    }
    return _shuffle(out, rnd);
  }
  // 같은 문항 판정: srs는 key가 문항을 가른다. once(key null)는 지문이 같아도(예: '누가 이길까요?') 장면과 원자료가 다르면 다른 문항이다
  function _sig(q) {
    var parts = [q.type, q.key == null ? '' : q.key, q.prompt, JSON.stringify(q.answer)];
    if (q.key == null) parts.push(JSON.stringify(q.scene == null ? null : q.scene), JSON.stringify(q.data == null ? null : q.data));
    return parts.join('\u0001');
  }
  function _uniqueNext(t, rnd, opts, seen) {
    var fallback = null;
    for (var i = 0; i < 5; i++) {
      var q = next(t, rnd, _copy(opts));
      if (!q) return fallback;
      if (seen[_sig(q)]) continue;
      if (q.rated === false) { if (!fallback) fallback = q; continue; }   // 자명 문항은 되도록 피한다
      return q;
    }
    return fallback;
  }
  function daily5(dayKey, stage) {
    stage = _clampStage(stage);
    var rnd = _rng(dailySeed(dayKey));
    var list = types().filter(function(t) { return _dailyEligible(t, stage); });
    var plan = _plan(stage, rnd, list);
    var out = [], seen = {};
    var opts = { noReview: true, stage: stage, daily: true };
    function add(q) { if (q) { seen[_sig(q)] = true; out.push(q); return true; } return false; }
    plan.forEach(function(t) {
      if (add(_uniqueNext(t, rnd, opts, seen))) return;
      for (var i = 0; i < list.length; i++) if (list[i] !== t && add(_uniqueNext(list[i], rnd, opts, seen))) return;
    });
    for (var tries = 0; out.length < DAILY_N && list.length && tries < DAILY_N * 2; tries++) add(_uniqueNext(list[tries % list.length], rnd, opts, seen));
    return out.slice(0, DAILY_N);
  }

  // ── 다음 퍼즐 유형 ──────────────────────────────────
  function _window(r) {
    r = _num(r, 1000);
    return [r - 300, r - 200];
  }
  function _matchConcept(t, c) {
    var m = _metaOf(t);
    return (!!m && m.concept === c) || (CONCEPT_TYPES[c] || []).indexOf(t) >= 0;
  }
  function _baseOf(t, stage) {
    var m = _metaOf(t);
    if (m && isFinite(Number(m.base)) && m.base !== null) return Number(m.base);
    var st = (typeof JOURNEY_STAGES !== 'undefined' && JOURNEY_STAGES) ? JOURNEY_STAGES[(m ? m.stage : stage) - 1] : null;
    return (st && typeof st.baseRating === 'number') ? st.baseRating : 1000 + 250 * ((m ? m.stage : stage) - 1);
  }
  function _ratingNow() {
    if (typeof Rating !== 'undefined' && Rating && typeof Rating.current === 'function') {
      try { var c = Rating.current(); if (c && isFinite(c.r)) return c.r; } catch (e) {}
    }
    return 1000;
  }
  function pickType(stage, rating, rnd, opts) {
    opts = opts || {};
    stage = _clampStage(stage);
    rnd = (typeof rnd === 'function') ? rnd : Math.random;
    var r = isFinite(Number(rating)) && rating !== null ? Number(rating) : _ratingNow();
    var ex = Array.isArray(opts.exclude) ? opts.exclude : (opts.exclude ? [opts.exclude] : []);
    var base = types().filter(function(t) {
      var m = _metaOf(t);
      return available(t) && m && m.stage <= stage + 1 && ex.indexOf(t) < 0 && (m.ui !== 'paint' || opts.paint === true);
    });
    var pool = opts.rated === false ? base : base.filter(function(t) { return _ratedMeta(_metaOf(t)); });
    if (opts.concept) {
      var c = pool.filter(function(t) { return _matchConcept(t, opts.concept); });
      if (!c.length && opts.rated !== false) c = base.filter(function(t) { return _matchConcept(t, opts.concept); });
      pool = c;
    }
    if (!pool.length) return null;
    var w = _window(r), target = w[0] + rnd() * (w[1] - w[0]);
    var ws = pool.map(function(t) { var d = (_baseOf(t, stage) - target) / PICK_SIGMA; return Math.exp(-0.5 * d * d); });
    var sum = ws.reduce(function(a, b) { return a + b; }, 0);
    if (!(sum > 0)) {
      var best = pool[0];
      pool.forEach(function(t) { if (Math.abs(_baseOf(t, stage) - target) < Math.abs(_baseOf(best, stage) - target)) best = t; });
      return best;
    }
    var x = rnd() * sum;
    for (var i = 0; i < pool.length; i++) { x -= ws[i]; if (x < 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  // ── preflop 어댑터(PreflopDrill 감싸기) ──────────────
  var PF = (function() {
    var SUITS = ['s', 'h', 'd', 'c'];
    var KIND_BASE = { rfi: 1200, vsRfi: 1300, vs3bet: 1400, cold3bet: 1400, vs4bet: 1400 };
    var EXTRA_LABEL = { cold3bet: { raise: '레이즈(4벳)' }, vs4bet: { raise: '레이즈(5벳 올인)' } };
    var KOR = { fold: '폴드', call: '콜', raise: '레이즈' };
    var EXTRA_POS = { cold3bet: ['CO', 'BTN', 'SB', 'BB'], vs4bet: ['HJ', 'CO', 'BTN', 'SB', 'BB'] };
    var _gcache = {}, _vcache = {};

    function _deps() { return typeof PreflopDrill !== 'undefined' && typeof GtoChart !== 'undefined' && typeof Gto !== 'undefined' && typeof Range !== 'undefined'; }

    // PreflopDrill.parseSpot(rfi, vsRfi, vs3bet) + 이 어댑터가 다루는 cold3bet, vs4bet
    function _spot(s) {
      if (!s) return null;
      var sp = (typeof PreflopDrill !== 'undefined') ? PreflopDrill.parseSpot(s) : null;
      if (sp) { sp.drill = true; return sp; }
      var p = String(s).split('|');
      if ((p[0] !== 'cold3bet' && p[0] !== 'vs4bet') || !p[1] || p[1].indexOf('@') >= 0) return null;
      // 6인 프리플랍에서 실제로 나오는 자리만: 콜드 3벳은 앞에 오픈과 3벳 2명이 필요, 4벳 직면은 내가 3벳할 수 있어야 한다
      if (p[0] === 'cold3bet' && (EXTRA_POS.cold3bet.indexOf(p[1]) < 0 || !Gto.GTO_RANGES.vsCold3bet)) return null;
      if (p[0] === 'vs4bet' && (EXTRA_POS.vs4bet.indexOf(p[1]) < 0 || !(Gto.GTO_RANGES.vs4bet && Gto.GTO_RANGES.vs4bet[p[1]]))) return null;
      return { kind: p[0], pos: p[1], opener: null, facing: p[0], spot: p[0] + '|' + p[1], drill: false };
    }
    // 4벳 직면은 그 자리의 3벳 레인지(BB는 뒷자리 오픈 상대 넓은 표 포함) 안의 손만 낸다
    function _context(sp) {
      if (sp.kind !== 'vs4bet') return null;
      var R = Gto.GTO_RANGES, arr = [];
      if (R.vsRfi[sp.pos]) arr = arr.concat(R.vsRfi[sp.pos].threebet);
      if (sp.pos === 'BB' && R.vsRfiBB_LP) arr = arr.concat(R.vsRfiBB_LP.threebet);
      return arr.length ? Gto.rangeClassSet(arr) : null;
    }
    function _model(sp, cache) {
      if (cache[sp.spot]) return cache[sp.spot];
      var m = GtoChart.buildChartModel(sp.pos, sp.facing, sp.opener);
      var ctx = _context(sp);
      var playable = [], boundary = [], weight = 0, inW = 0;
      for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) {
        var a = m.cells[r][c].action;
        if (a === 'none' || (ctx && !ctx.has(m.cells[r][c].label))) continue;
        var w = r === c ? 6 : (r < c ? 4 : 12);
        playable.push({ r: r, c: c, w: w }); weight += w; if (a !== 'fold') inW += w;
        var nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
        for (var i = 0; i < 4; i++) {
          var nr = nb[i][0], nc = nb[i][1];
          if (nr < 0 || nr > 12 || nc < 0 || nc > 12) continue;
          var na = m.cells[nr][nc].action;
          if (na !== 'none' && na !== a && (!ctx || ctx.has(m.cells[nr][nc].label))) { boundary.push({ r: r, c: c }); break; }
        }
      }
      var en = playable.length ? { model: m, ctx: ctx, playable: playable, boundary: boundary, weight: weight, pct: weight ? inW / weight : 0 } : null;
      cache[sp.spot] = en;
      return en;
    }
    function _find(en, hand) {
      for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) if (en.model.cells[r][c].label === hand) return { r: r, c: c };
      return null;
    }
    function _isBoundary(en, cell) { return en.boundary.some(function(b) { return b.r === cell.r && b.c === cell.c; }); }
    // 상하좌우 이웃 셀의 액션(none과 문맥 밖 제외). 데일리 5 '아쉬움' 등급용 near 보기 판단에 쓴다
    function _neighborActs(en, cell) {
      var out = {};
      if (!cell) return out;
      [[cell.r - 1, cell.c], [cell.r + 1, cell.c], [cell.r, cell.c - 1], [cell.r, cell.c + 1]].forEach(function(rc) {
        if (rc[0] < 0 || rc[0] > 12 || rc[1] < 0 || rc[1] > 12) return;
        var x = en.model.cells[rc[0]][rc[1]];
        if (x.action !== 'none' && (!en.ctx || en.ctx.has(x.label))) out[x.action] = true;
      });
      return out;
    }
    function _cardsFor(label, rnd) {
      var s1 = _pick(SUITS, rnd), s2;
      if (label.length === 3 && label[2] === 's') s2 = s1;
      else s2 = _pick(SUITS.filter(function(s) { return s !== s1; }), rnd);
      return [{ rank: label[0], suit: s1 }, { rank: label[1], suit: s2 }];
    }
    function _concept(sp) {
      if (sp.kind === 'rfi') return 'rfi';
      if (sp.kind === 'vsRfi') return (sp.pos === 'BB' || sp.pos === 'SB') ? 'blind_defense' : 'vs_rfi';
      return 'vs_3bet';
    }
    function _prompt(sp) {
      if (sp.drill) return PreflopDrill.prompt(sp);
      if (sp.kind === 'cold3bet') return '앞에서 오픈과 3벳이 나옴 → 당신 ' + sp.pos + '(아직 액션 전)';
      return '당신 ' + sp.pos + ' 3벳 → 상대가 4벳';
    }
    function _actionLabel(sp, a) {
      var ex = EXTRA_LABEL[sp.kind];
      if (ex && ex[a]) return ex[a];
      if (sp.drill) return PreflopDrill.actionLabel({ kind: sp.kind }, a);
      return KOR[a] || a;
    }
    function _build(sp, hand, cards, answer, en, review) {
      var cell = _find(en, hand);
      var trivial = (hand === 'AA' || hand === 'KK') && answer === 'raise';
      var ids = sp.kind === 'rfi' ? ['fold', 'raise'] : ['fold', 'call', 'raise'];
      // near: 정답이 아닌데 가까운 보기(격자 이웃 셀의 액션이거나, 정답이 참여일 때 다른 참여 방식)
      var nb = _neighborActs(en, cell);
      var options = ids.map(function(a) {
        var o = { id: a, label: _actionLabel(sp, a) };
        if (a !== answer && (nb[a] || (answer !== 'fold' && a !== 'fold'))) o.near = true;
        return o;
      });
      var q = {
        type: 'preflop', key: sp.spot + '|' + hand, concept: _concept(sp),
        difficulty: KIND_BASE[sp.kind] + (cell && _isBoundary(en, cell) ? 100 : 0),
        confidence: 'chart', appDef: false, rated: !trivial, srs: 'srs',
        prompt: _prompt(sp),
        // 문항 장면에는 격자를 넣지 않는다: 색칠된 차트에 내 손이 강조되면 그 자체가 정답이다(SceneRender.scene은 grid를 그대로 그림).
        // 격자 미니맵은 해설(explain(q).scene)에만 둔다(설계 5.5절 해설 오버레이).
        scene: { hero: cards.map(function(c) { return c.rank + c.suit; }) },
        options: options,
        answer: answer, ui: 'choice',
        data: { spot: sp.spot, kind: sp.kind, pos: sp.pos, opener: sp.opener || null, facing: sp.facing, hand: hand }
      };
      if (review) q.review = true;
      return q;
    }
    function _stageSpots(stage) {
      if (typeof JOURNEY_NODES === 'undefined' || !Array.isArray(JOURNEY_NODES)) return null;
      var out = [];
      JOURNEY_NODES.forEach(function(nd) {
        if (!nd || !nd.drill || !(nd.stage <= stage + 1)) return;
        var d = nd.drill;
        var pre = d.type === 'preflop' || (d.type === 'mixed' && (d.set || []).some(function(s) { return s && s[0] === 'preflop'; }));
        if (!pre) return;
        (d.spots || PreflopDrill.BASE_SPOTS).forEach(function(s) { if (out.indexOf(s) < 0) out.push(s); });
      });
      return out.length ? out : null;
    }
    var CONCEPT_KINDS = { rfi: ['rfi'], vs_rfi: ['vsRfi'], blind_defense: ['vsRfi'], vs_3bet: ['vs3bet', 'cold3bet', 'vs4bet'] };
    function _conceptFilter(list, concept) {
      var kinds = CONCEPT_KINDS[concept];
      if (!kinds) return list;
      return list.filter(function(s) {
        var sp = _spot(s);
        if (!sp || kinds.indexOf(sp.kind) < 0) return false;
        if (concept === 'blind_defense') return sp.pos === 'BB' || sp.pos === 'SB';
        if (concept === 'vs_rfi') return sp.pos !== 'BB' && sp.pos !== 'SB';
        return true;
      });
    }
    function _spotList(opts) {
      var list = opts.spots || (opts.stage ? _stageSpots(_clampStage(opts.stage)) : null) || PreflopDrill.BASE_SPOTS;
      if (opts.concept && !opts.spots) {
        var c = _conceptFilter(list, opts.concept);
        if (!c.length) c = _conceptFilter(PreflopDrill.BASE_SPOTS.concat(['cold3bet|BTN', 'vs4bet|BTN']), opts.concept);
        if (c.length) list = c;
      }
      return list;
    }

    function next(rnd, opts) {
      if (!_deps()) return null;
      opts = opts || {};
      var drillSpots = [], extra = [];
      _spotList(opts).forEach(function(s) {
        var sp = _spot(s);
        if (!sp || !_model(sp, _gcache)) return;
        if (sp.drill) drillSpots.push(sp.spot); else extra.push(sp);
      });
      var total = drillSpots.length + extra.length;
      if (!total) return null;
      if (extra.length && rnd() < extra.length / total) {
        var sp = _pick(extra, rnd), en = _model(sp, _gcache);
        var cell = (rnd() < 0.5 && en.boundary.length) ? _pick(en.boundary, rnd) : null;
        if (!cell) {
          var t = rnd() * en.weight, acc = 0;
          cell = en.playable[en.playable.length - 1];
          for (var j = 0; j < en.playable.length; j++) { acc += en.playable[j].w; if (t < acc) { cell = en.playable[j]; break; } }
        }
        var c = en.model.cells[cell.r][cell.c];
        return _build(sp, c.label, _cardsFor(c.label, rnd), c.action, en, false);
      }
      var d = PreflopDrill.next(rnd, { spots: drillSpots, noReview: opts.noReview === true, now: opts.now, exclude: opts.exclude });
      if (!d) return null;
      var dsp = _spot(d.spot), den = dsp && _model(dsp, _gcache);
      if (!den) return null;
      return _build(dsp, d.hand, d.cards, d.answer, den, !!d.review);
    }

    function fromKey(key, rnd) {
      if (!_deps()) return null;
      var p = String(key).split('|');
      if (p.length < 3) return null;
      var sp = _spot(p[0] + '|' + p[1]);
      var en = sp && _model(sp, _gcache);
      if (!en) return null;
      var cell = _find(en, p[2]);
      if (!cell || (en.ctx && !en.ctx.has(p[2]))) return null;
      var a = en.model.cells[cell.r][cell.c].action;
      if (a === 'none') return null;
      return _build(sp, p[2], _cardsFor(p[2], rnd || Math.random), a, en, false);
    }

    // 독립 대조: 실제 카드로 (1) 새로 만든 buildChartModel의 handCell 셀, (2) Gto.gtoAction* 직접 판정
    function _gtoAct(sp, cards) {
      if (sp.kind === 'rfi') return Gto.gtoAction(sp.pos, cards);
      if (sp.kind === 'vsRfi') return Gto.gtoActionVsRfi(sp.pos, cards, sp.opener);
      if (sp.kind === 'vs3bet') return Gto.gtoActionVs3bet(sp.pos, cards);
      if (sp.kind === 'cold3bet') return Gto.gtoActionVsCold3bet(cards);
      if (sp.kind === 'vs4bet') return Gto.gtoActionVs4bet(sp.pos, cards);
      return null;
    }
    function _parseCard(s) {
      var m = /^([2-9TJQKA])([shdc])$/.exec(String(s || ''));
      return m ? { rank: m[1], suit: m[2] } : null;
    }
    function verify(q) {
      if (!_deps() || !q || !q.data || !q.scene || !Array.isArray(q.scene.hero) || q.scene.hero.length !== 2) return false;
      var sp = _spot(q.data.spot);
      if (!sp || q.data.hand == null || q.key !== sp.spot + '|' + q.data.hand) return false;
      var cards = q.scene.hero.map(_parseCard);
      if (!cards[0] || !cards[1] || q.scene.hero[0] === q.scene.hero[1]) return false;
      var en = _model(sp, _vcache);
      if (!en) return false;
      var hc = GtoChart.handCell(cards), cell = en.model.cells[hc.r][hc.c];
      if (cell.label !== q.data.hand || cell.action === 'none' || cell.action !== q.answer) return false;
      if (en.ctx && !en.ctx.has(cell.label)) return false;
      if (_gtoAct(sp, cards) !== q.answer) return false;
      var allowed = sp.kind === 'rfi' ? ['fold', 'raise'] : ['fold', 'call', 'raise'];
      var ids = (q.options || []).map(function(o) { return o && o.id; });
      return ids.length === allowed.length && allowed.every(function(a) { return ids.indexOf(a) >= 0; });
    }

    function explain(q) {
      var d = (q && q.data) || {};
      var sp = _spot(d.spot);
      var scene = sp ? { grid: { pos: sp.pos, facing: sp.facing, opener: sp.opener || null, highlight: [d.hand] } } : null;
      if (!sp) return { line: '이 스팟은 아직 차트가 없어요', scene: null };
      if (sp.drill) {
        var ex = PreflopDrill.explain({ spot: sp.spot, kind: sp.kind, pos: sp.pos, opener: sp.opener, hand: d.hand });
        return { line: ex.line, scene: scene };
      }
      var en = _model(sp, _gcache);
      if (!en) return { line: '이 스팟은 아직 차트가 없어요', scene: null };
      var me = en.model.cells, cell = _find(en, d.hand) || { r: 0, c: 0 }, mine = me[cell.r][cell.c], other = null;
      for (var k = 1; k < 13 && !other; k++) {
        [[cell.r, cell.c - k], [cell.r, cell.c + k], [cell.r - k, cell.c], [cell.r + k, cell.c]].forEach(function(rc) {
          if (other || rc[0] < 0 || rc[0] > 12 || rc[1] < 0 || rc[1] > 12) return;
          var a = me[rc[0]][rc[1]].action;
          if (a !== 'none' && a !== mine.action && (!en.ctx || en.ctx.has(me[rc[0]][rc[1]].label))) other = me[rc[0]][rc[1]];
        });
      }
      var name = sp.kind === 'cold3bet' ? sp.pos + ' 콜드 3벳 직면 참여 레인지' : sp.pos + ' 3벳 레인지 중 4벳에 계속하는 손';
      var line = name + ' = 약 ' + Math.round(en.pct * 100) + '% | 같은 줄: ' + mine.label + ' ' + _actionLabel(sp, mine.action) +
        (other ? ' / ' + other.label + ' ' + _actionLabel(sp, other.action) : '');
      return { line: line, scene: scene };
    }

    function parseKey(key) {
      var p = String(key || '').split('|');
      if (p.length < 3) return null;
      var sp = _spot(p[0] + '|' + p[1]);
      if (!sp) return null;
      sp.hand = p[2];
      return sp;
    }
    function clear() { _gcache = {}; _vcache = {}; }

    return { title: '🃏 프리플랍 레인지', next: next, verify: verify, explain: explain, fromKey: fromKey, parseKey: parseKey,
      ready: _deps, _clear: clear };
  })();
  register('preflop', PF, { stage: 2, group: 'preflop', concept: 'rfi' });

  var api = {
    TYPE_META: TYPE_META, LABEL_TEXT: LABEL_TEXT, CONCEPT_TYPES: CONCEPT_TYPES, MAX_TRIES: MAX_TRIES,
    register: register, get: get, meta: meta, has: has, types: types,
    next: next, verify: verify, fromKey: fromKey, available: available, isRated: isRated, explain: explain, label: label,
    dailySeed: dailySeed, daily5: daily5, pickType: pickType, window: _window,
    _plan: _plan, _unregister: _unregister, _clearCache: PF._clear
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
