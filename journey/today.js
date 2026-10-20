// journey/today.js (채우는 패키지: M1-P1c, M2-P6 퍼즐 블록과 약점 채움)
// "▶ 오늘의 5분" 구성 알고리즘(설계서 4.1절, 9절 M1-P1c, M2-P6, 계약 C9). 순수 함수만 둔다.
// 로드 시와 호출 시 모두 DOM, 저장소, 타이머에 접근하지 않는다. 같은 ctx면 같은 plan(결정론).
//
// ctx = { now, weekday(0~6, 0=일), goalMinutes(5|10|15), stage, nextNode: {id, step, est}|null,
//         due: [{type, key, box, due}], weak: ['pot_odds', ...], avail: { puzzles, lessons, theater, daily5,
//         highlights, rush, weekly }, daily5Done, theaterEpisode: {...}|null, placementDone, nodesPassed,
//         prevPlan: plan|null, curriculumSession: n|null, rating: {r, rd}|null, puzzleTypes?: [...] }
//   puzzleTypes(C9, TodayUI.ctx가 채움) = 등록된 퍼즐 유형 ['potodds', ...] 또는 [{type, stage}].
//     단계가 없으면 TYPE_STAGE(부록 A 노드에서 그 유형이 처음 나오는 단계)를 쓴다. 없으면(undefined/null) M1 출력 그대로.
// plan = { day, blocks: [ review, learn, fun, wrap ], estMin, lessonNode, fillToday? }
//   lessonNode = 오늘 신규 레슨을 배정한 노드 id|null(같은 날 prevPlan에서 물려받아 하루 1개 상한 판정)
//   fillToday = 오늘 배정한 채움(신규) 퍼즐 누적 수(puzzleTypes가 있을 때만, 같은 날 prevPlan에서 이어 센다)
//   review { id:'review', items:[{type,key,box}], daily5, est }
//     채움 항목(C9) = { type(등록 유형), key:null, box:null, concept, fill:true, spots? }(spots는 preflop만)
//     puzzleTypes가 없을 때의 채움 항목은 M1 형식 { type:'puzzle', key:null, box:null, concept, fill:true }
//   learn  { id:'learn', kind:'placement'|'lesson'|'drill'|'mission'|'curriculum'|'gto', node, est, ... }
//     drill은 puzzleTypes가 있으면 노드 drill 명세의 set, variant, spots를 함께 싣는다.
//   fun    { id:'fun', kind:'theater'|'highlight'|'free'|'rush'|'weeklyIntro', est, hands? }
//   wrap   { id:'wrap' }
// est는 블록별 분(소수 1자리), estMin은 블록 초 합계를 분으로 바꾼 값.
var Today = (function() {
  // 추정 시간 단위(초): 레슨 장면 20, 퍼즐 25, 복습 드릴 10, 극장 1편 90, 게임 1핸드 60(4.1절).
  // 러시와 배치 고사는 이름 그대로 3분(5.5절 "3분 러시", 2.6절 "실력 확인 3분").
  var SEC = { scene: 20, puzzle: 25, review: 10, theater: 90, hand: 60, rush: 180, placement: 180 };
  // 복습 상한: 전체 8/15/25, 성숙(box 4 이상) 3/5/8
  var CAPS = { 5: { total: 8, mature: 3 }, 10: { total: 15, mature: 5 }, 15: { total: 25, mature: 8 } };
  var MATURE_BOX = 4;
  // due가 FILL_WHEN개 미만이면 약한 개념 퍼즐로 FILL_TO개까지 채운다(퍼즐 가용 시만).
  // FILL_TO = 4 x (1, 1.8, 2.6) 반올림, 5분 목표에서 복습 블록 1~2분(4 x 25초 = 100초).
  var FILL_WHEN = 3;
  var FILL_TO = { 5: 4, 10: 7, 15: 10 };
  var HANDS = { gto: 5, mission: 5, free: 3 };
  var DRILL_SET = 10;        // 드릴 세트 1회 = 노드 지정 유형 10문항(노드 count가 더 작으면 그 수)
  var DEFAULT_SCENES = 7;    // 레슨 장면 수를 모를 때(레슨 길이 6~9장면의 가운데)
  var DEFAULT_CURRICULUM_MIN = 3;
  var DAILY5_N = 5;
  // 하루 신규 레슨 1개, 신규 퍼즐 키 5개 상한(4.1절). 채움 퍼즐(key 없는 신규)도 이 상한으로 센다.
  var LIMITS = { newLessonsPerDay: 1, newPuzzleKeysPerDay: 5 };

  // ── 약점 채움(M2-P6, C9) ──
  // 개념(Coach V.concept, 부록 A concept) → 퍼즐 유형. 같은 개념 안에서는 레이팅 거리 순, 같으면 이 순서.
  // cbet은 approx(cbet2)로 채우지 않고 texture로. 공짜 스팟과 approx 유형은 채움에 쓰지 않는다(3.2절).
  var CONCEPT_TYPES = {
    pot_odds: ['potodds'],
    draws: ['outs', 'facingbet-next'],
    rfi: ['preflop'], vs_rfi: ['preflop'], blind_defense: ['preflop'], vs_3bet: ['preflop'],
    board_texture: ['texture'],
    value_bluff: ['bluffratio', 'mdf'],
    turn_river: ['facingbet-river'],
    actions: ['minraise', 'tocall'],
    cbet: ['texture'],
    // 여정 개념 키가 그대로 올 때(퍼즐 통계 등)
    showdown: ['showdown'], order: ['order'], outs: ['outs'], equity: ['eqbucket'], combos: ['combos'],
    mdf: ['mdf'], alpha: ['alpha'], spr: ['spr']
  };
  // preflop 채움의 스팟 힌트(PreflopDrill 스팟 키). coach.js: SB/BB가 오픈을 맞으면 blind_defense, 그 외 자리는 vs_rfi,
  // 3벳/4벳 직면은 vs_3bet(PreflopDrill이 아는 vs3bet 스팟만).
  var CONCEPT_SPOTS = {
    rfi: ['rfi|UTG', 'rfi|HJ', 'rfi|CO', 'rfi|BTN', 'rfi|SB'],
    vs_rfi: ['vsRfi|HJ@UTG', 'vsRfi|CO@HJ', 'vsRfi|BTN@CO', 'vsRfi|BTN@HJ'],
    blind_defense: ['vsRfi|BB@BTN', 'vsRfi|BB@CO', 'vsRfi|SB@BTN', 'vsRfi|BB@UTG'],
    vs_3bet: ['vs3bet|UTG', 'vs3bet|HJ', 'vs3bet|CO', 'vs3bet|BTN', 'vs3bet|SB']
  };
  // 유형이 처음 나오는 단계(부록 A 노드 drill 기준, j-today가 JOURNEY_NODES와 대조)
  var TYPE_STAGE = {
    showdown: 1, order: 1, minraise: 1, tocall: 1,
    preflop: 2, potodds: 2, outs: 2, 'outs-x4': 2, eqbucket: 2,
    texture: 3, cbet2: 3, 'facingbet-next': 3, spr: 3, 'facingbet-river': 3,
    combos: 4, rangehit: 4, mdf: 4, bluffratio: 4, alpha: 4,
    rangeshape: 5, toygame: 5, geosize: 5, rangepaint: 5,
    hudread: 6, prescribe: 6, variance: 6, intent: 6
  };
  // 유형 기본 난이도(부록 C, 범위는 가운데 값). 채움 유형 순서를 레이팅 범위 [Ru-300, Ru-200]의 가운데에 가까운 순으로.
  var TYPE_BASE = {
    showdown: 1000, order: 1000, minraise: 1050, tocall: 1000, preflop: 1300, potodds: 1200, outs: 1300, 'outs-x4': 1350,
    eqbucket: 1300, texture: 1450, 'facingbet-river': 1650, 'facingbet-next': 1650, spr: 1450, combos: 1700, rangehit: 1750,
    mdf: 1700, alpha: 1700, bluffratio: 1700, rangepaint: 2000, rangeshape: 2000, toygame: 2100, geosize: 2100, variance: 2100,
    hudread: 2200
  };
  var RATING_GAP = 250;      // 목표 난이도 = Ru - 250([Ru-300, Ru-200]의 가운데, 3.2절)

  function _num(x, d) { return (typeof x === 'number' && isFinite(x)) ? x : d; }
  function _cmp(a, b) { a = String(a); b = String(b); return a < b ? -1 : (a > b ? 1 : 0); }
  function _copy(o) { return (o && typeof o === 'object') ? JSON.parse(JSON.stringify(o)) : (o === undefined ? null : o); }

  function _goal(g) {
    g = Number(g);
    if (g >= 15) return 15;
    if (g >= 10) return 10;
    return 5;
  }

  function caps(goalMinutes) {
    var c = CAPS[_goal(goalMinutes)];
    return { total: c.total, mature: c.mature };
  }

  // 로컬 날짜 'YYYY-MM-DD'(drill-core와 같은 규칙)
  function _dayKey(now) {
    var t = new Date(now);
    var m = t.getMonth() + 1, d = t.getDate();
    return t.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  // 같은 box 안 유형 라운드로빈: due가 이른 항목의 유형부터 한 개씩 번갈아 꺼낸다.
  function _interleave(items) {
    var sorted = items.slice().sort(function(a, b) {
      return (a.due - b.due) || _cmp(a.type, b.type) || _cmp(a.key, b.key);
    });
    var order = [], queues = {};
    sorted.forEach(function(it) {
      if (!queues[it.type]) { queues[it.type] = []; order.push(it.type); }
      queues[it.type].push(it);
    });
    var out = [];
    while (out.length < sorted.length) {
      for (var i = 0; i < order.length; i++) {
        var q = queues[order[i]];
        if (q.length) out.push(q.shift());
      }
    }
    return out;
  }

  // 복습 큐 정렬: (box asc, due asc), box 0이 항상 먼저, 같은 box 안 유형 라운드로빈,
  // 성숙 항목(box 4 이상)은 c.mature까지, 전체는 c.total까지. now가 있으면 기한 전 항목은 뺀다.
  function orderReview(due, c, now) {
    if (typeof c === 'number') c = caps(c);
    c = c || CAPS[5];
    var total = _num(c.total, CAPS[5].total), matureCap = _num(c.mature, CAPS[5].mature);
    var hasNow = (typeof now === 'number' && isFinite(now));
    var seen = {}, boxes = {};
    (due || []).forEach(function(it) {
      if (!it || !it.type || it.key === undefined || it.key === null) return;
      var d = _num(it.due, 0);
      if (hasNow && d > now) return;
      var id = it.type + '|' + it.key;
      if (seen[id]) return;
      seen[id] = true;
      var b = Math.max(0, Math.floor(_num(it.box, 0)));
      (boxes[b] = boxes[b] || []).push({ type: it.type, key: it.key, box: b, due: d });
    });
    var out = [], mature = 0;
    Object.keys(boxes).map(Number).sort(function(a, b) { return a - b; }).forEach(function(b) {
      _interleave(boxes[b]).forEach(function(it) {
        if (out.length >= total) return;
        if (b >= MATURE_BOX) {
          if (mature >= matureCap) return;
          mature++;
        }
        out.push({ type: it.type, key: it.key, box: it.box });
      });
    });
    return out;
  }

  // 커리큘럼 역매핑: nodeId를 흡수한 첫(가장 작은) 세션 번호, 없으면 null
  function sessionFor(nodeId, map) {
    if (map === undefined) map = (typeof CURRICULUM_MAP !== 'undefined') ? CURRICULUM_MAP : null;
    if (!nodeId || !map || typeof map !== 'object') return null;
    var keys = Object.keys(map).map(Number).filter(function(n) { return isFinite(n); }).sort(function(a, b) { return a - b; });
    for (var i = 0; i < keys.length; i++) {
      var arr = map[keys[i]];
      if (arr && arr.indexOf && arr.indexOf(nodeId) >= 0) return keys[i];
    }
    return null;
  }

  function _validSession(n) {
    return (typeof n === 'number' && isFinite(n) && n >= 1 && Math.floor(n) === n) ? n : null;
  }

  function _nodeData(id) {
    if (typeof JOURNEY_NODES === 'undefined' || !JOURNEY_NODES || !JOURNEY_NODES.length) return null;
    for (var i = 0; i < JOURNEY_NODES.length; i++) if (JOURNEY_NODES[i] && JOURNEY_NODES[i].id === id) return JOURNEY_NODES[i];
    return null;
  }

  function _lessonScenes(lessonId) {
    if (typeof LESSONS === 'undefined' || !LESSONS || !LESSONS.length) return 0;
    for (var i = 0; i < LESSONS.length; i++) {
      var l = LESSONS[i];
      if (l && l.id === lessonId && l.scenes && l.scenes.length) return l.scenes.length;
    }
    return 0;
  }

  // ctx.puzzleTypes → { 유형: 단계 } 또는 null(없음 = M1 출력 그대로)
  function _typeStages(pt) {
    if (pt === undefined || pt === null) return null;
    var out = {};
    var put = function(t, st) {
      if (typeof t !== 'string' || !t) return;
      var s = _num(st, NaN);
      if (!isFinite(s)) s = Object.prototype.hasOwnProperty.call(TYPE_STAGE, t) ? TYPE_STAGE[t] : NaN;
      if (isFinite(s)) out[t] = s;
    };
    if (Array.isArray(pt)) {
      pt.forEach(function(e) {
        if (typeof e === 'string') put(e);
        else if (e && typeof e === 'object') put(e.type, e.stage);
      });
    } else if (typeof pt === 'object') {
      Object.keys(pt).forEach(function(t) { var v = pt[t]; put(t, (v && typeof v === 'object') ? v.stage : v); });
    }
    return out;
  }

  // 사용자 레이팅(없으면 단계 기준값 S1 1000 + 250씩, journey-data JOURNEY_STAGES.baseRating과 같은 값)
  function _userRating(ctx) {
    var r = (ctx.rating && typeof ctx.rating === 'object') ? _num(ctx.rating.r, NaN) : NaN;
    if (isFinite(r)) return r;
    var st = Math.max(1, Math.floor(_num(ctx.stage, 1)));
    if (typeof JOURNEY_STAGES !== 'undefined' && JOURNEY_STAGES && JOURNEY_STAGES[st - 1] && isFinite(JOURNEY_STAGES[st - 1].baseRating)) {
      return JOURNEY_STAGES[st - 1].baseRating;
    }
    return 1000 + 250 * (st - 1);
  }

  // 개념 하나의 채움 유형 후보: CONCEPT_TYPES 중 단계+1 이하이고 등록된 것, 목표 난이도에 가까운 순
  function conceptTypes(concept, stages, stage, rating) {
    var list = CONCEPT_TYPES[concept];
    if (!list || !stages) return [];
    var maxStage = Math.max(1, Math.floor(_num(stage, 1))) + 1;
    var target = _num(rating, 1000) - RATING_GAP;
    var cand = [];
    list.forEach(function(t, i) {
      if (Object.prototype.hasOwnProperty.call(stages, t) && stages[t] <= maxStage) {
        cand.push({ t: t, i: i, d: Math.abs(_num(TYPE_BASE[t], target) - target) });
      }
    });
    cand.sort(function(a, b) { return (a.d - b.d) || (a.i - b.i); });
    return cand.map(function(c) { return c.t; });
  }

  // 오늘 이미 배정한 채움 퍼즐 수(같은 날 prevPlan 누적)
  function _fillToday(prevPlan, day) {
    if (!prevPlan || prevPlan.day !== day) return 0;
    if (typeof prevPlan.fillToday === 'number' && isFinite(prevPlan.fillToday)) return Math.max(0, prevPlan.fillToday);
    var n = 0;
    (prevPlan.blocks || []).forEach(function(b) {
      if (b && b.id === 'review') (b.items || []).forEach(function(it) { if (it && it.fill) n++; });
    });
    return n;
  }

  // 약한 개념 퍼즐 채움(C9). 맞는 유형이 없는 개념은 건너뛰고 다음 약점으로, 개념은 최대 2개.
  // 한 개념에 유형이 여럿이면 번갈아 낸다(인터리빙). 하루 신규 상한(LIMITS.newPuzzleKeysPerDay)까지.
  function _typedFill(ctx, stages, need, used) {
    var room = Math.max(0, LIMITS.newPuzzleKeysPerDay - used);
    need = Math.min(need, room);
    var rating = _userRating(ctx), picked = [], seen = {};
    (ctx.weak || []).forEach(function(w) {
      if (!w || picked.length >= 2) return;
      w = String(w);
      if (seen[w]) return;
      seen[w] = true;
      var ts = conceptTypes(w, stages, ctx.stage, rating);
      if (ts.length) picked.push({ concept: w, types: ts, k: 0 });
    });
    var out = [];
    for (var i = 0; i < need && picked.length; i++) {
      var c = picked[i % picked.length];
      var t = c.types[c.k % c.types.length];
      c.k++;
      var it = { type: t, key: null, box: null, concept: c.concept, fill: true };
      if (t === 'preflop' && CONCEPT_SPOTS[c.concept]) it.spots = CONCEPT_SPOTS[c.concept].slice();
      out.push(it);
    }
    return out;
  }

  // ── 블록 1: 복습 ──
  function _reviewBlock(ctx, goal, now, fallback, avail, stages, fillUsed) {
    var items = orderReview(ctx.due, caps(goal), now);
    var added = 0;
    // M1 폴백(퍼즐 없음)은 due만, 채움 없음. 퍼즐이 있으면 약한 개념 2개로 채운다.
    if (!fallback && items.length < FILL_WHEN) {
      var need = FILL_TO[goal] - items.length;
      if (stages) {
        var fills = _typedFill(ctx, stages, need, fillUsed);
        added = fills.length;
        items = items.concat(fills);
      } else {
        // puzzleTypes 없음: M1-P1c 형식 그대로(type 'puzzle', 상한 없음)
        var weak = [];
        (ctx.weak || []).forEach(function(w) { if (w && weak.indexOf(w) < 0 && weak.length < 2) weak.push(String(w)); });
        for (var i = 0; i < need && weak.length; i++) {
          items.push({ type: 'puzzle', key: null, box: null, concept: weak[i % weak.length], fill: true });
        }
      }
    }
    return { block: { id: 'review', items: items, daily5: !!(avail.daily5 && !ctx.daily5Done), est: 0 }, added: added };
  }

  // ── 블록 2: 새 배움 ──
  function _gto() { return { id: 'learn', kind: 'gto', node: null, hands: HANDS.gto, est: 0 }; }

  // 오늘(같은 day) 신규 레슨(또는 커리큘럼)을 이미 배정한 노드 id, 없으면 null.
  // plan.lessonNode로 같은 날 계획에 계속 물려준다. 그래서 계획을 여러 번 다시 짜도
  // (레슨 A → A 드릴 → 다음 노드 B 레슨) 하루 1개 상한이 유지된다.
  function _lessonToday(prevPlan, day) {
    if (!prevPlan || prevPlan.day !== day) return null;
    if (prevPlan.lessonNode) return String(prevPlan.lessonNode);
    var blocks = prevPlan.blocks || [];
    for (var i = 0; i < blocks.length; i++) {
      var lb = blocks[i];
      if (lb && lb.id === 'learn') return ((lb.kind === 'lesson' || lb.kind === 'curriculum') && lb.node) ? String(lb.node) : null;
    }
    return null;
  }

  // 노드 drill 명세(set, variant, spots)를 드릴 블록에 싣는다(복사본, puzzleTypes가 있을 때만)
  function _drillSpec(b, drill) {
    if (!drill) return b;
    if (Array.isArray(drill.set)) b.set = _copy(drill.set);
    if (typeof drill.variant === 'string' && drill.variant) b.variant = drill.variant;
    if (Array.isArray(drill.spots)) b.spots = drill.spots.slice();
    return b;
  }

  function _learnBlock(ctx, fallback, avail, lessonToday, typed) {
    if (!ctx.placementDone && !(_num(ctx.nodesPassed, 0) > 0)) {
      return { id: 'learn', kind: 'placement', node: null, est: 0 };
    }
    var nn = ctx.nextNode;
    if (!nn || !nn.id) return _gto();
    var nd = _nodeData(nn.id);
    var capped = false;
    if (nn.step === 'lesson') {
      // 같은 노드 레슨 이어 하기는 상한 아님, 다른 노드면 상한
      capped = !!lessonToday && lessonToday !== nn.id;
      if (!capped) {
        if (avail.lessons) {
          var start = Math.max(0, Math.floor(_num(nn.scene, 0)));
          var lessonId = nn.lesson || (nd && nd.lesson) || nn.id;
          var total = _num(nn.scenes, 0) || _lessonScenes(lessonId) || DEFAULT_SCENES;
          return { id: 'learn', kind: 'lesson', node: nn.id, lesson: lessonId, scene: start, scenes: Math.max(1, total - start), est: 0 };
        }
        // 레슨 플레이어 전(M1, M2): 기존 커리큘럼 세션 페이지. ctx 값이 우선, 없으면 CURRICULUM_MAP 역매핑.
        var s = _validSession(ctx.curriculumSession) || sessionFor(nn.id);
        if (s) return { id: 'learn', kind: 'curriculum', node: nn.id, session: s, est: _num(nn.est, DEFAULT_CURRICULUM_MIN) };
      }
    }
    var b = null;
    if (!fallback) {
      var hasDrill = !!(nd && nd.drill), hasMission = !!(nd && nd.mission);
      if (nn.step === 'drill' || (nn.step === 'lesson' && hasDrill)) {
        var dc = hasDrill ? _num(nd.drill.count, DRILL_SET) : DRILL_SET;
        b = { id: 'learn', kind: 'drill', node: nn.id, type: hasDrill ? nd.drill.type : null, count: Math.min(DRILL_SET, dc), est: 0 };
        if (typed && hasDrill) _drillSpec(b, nd.drill);
      } else if (nn.step === 'mission' || (nn.step === 'lesson' && hasMission)) {
        b = { id: 'learn', kind: 'mission', node: nn.id, config: (hasMission && nd.mission.config) || 'sixmax-cast', hands: HANDS.mission, est: 0 };
      }
    }
    // M1 폴백(드릴, 미션, 보스, 매핑 없는 레슨)과 그 밖의 경우는 GTO 미러 5핸드
    b = b || _gto();
    if (capped) b.capped = true;
    return b;
  }

  // ── 블록 3: 재미 ──
  function _funBase(ctx, wd, goal, avail) {
    if ((wd === 0 || wd === 6) && avail.rush) return { kind: 'rush' };
    if (avail.theater) {
      return { kind: 'theater', episodes: ((wd === 3 || wd === 5) && goal >= 10) ? 2 : 1, episode: _copy(ctx.theaterEpisode) };
    }
    if (avail.highlights) return { kind: 'highlight' };
    return { kind: 'free', hands: HANDS.free };
  }

  function _funBlock(ctx, wd, goal, avail) {
    var base = _funBase(ctx, wd, goal, avail);
    var b;
    if (wd === 1 && avail.weekly) {
      // 월요일: 주간 챌린지 소개(와 우승 예측 카드)를 앞에 두고 원래 재미 블록을 이어 붙인다.
      base.est = 0;
      b = { id: 'fun', kind: 'weeklyIntro', follow: base };
    } else {
      b = { id: 'fun' };
      for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) b[k] = base[k];
    }
    b.est = 0;
    return b;
  }

  // 블록 1개의 추정 초
  function _sec(b) {
    if (!b || typeof b !== 'object') return 0;
    if (b.id === 'review') {
      var s = 0;
      (b.items || []).forEach(function(it) { s += (it && it.fill) ? SEC.puzzle : SEC.review; });
      if (b.daily5) s += DAILY5_N * SEC.puzzle;
      return s;
    }
    switch (b.kind) {
      case 'lesson': return _num(b.scenes, 0) * SEC.scene;
      case 'drill': return _num(b.count, 0) * SEC.puzzle;
      case 'mission': case 'gto': case 'free': return _num(b.hands, 0) * SEC.hand;
      case 'theater': return _num(b.episodes, 1) * SEC.theater;
      case 'highlight': return SEC.theater;
      case 'rush': return SEC.rush;
      case 'placement': return SEC.placement;
      case 'weeklyIntro': return _sec(b.follow);
      default: return _num(b.est, 0) * 60;   // curriculum 등은 블록 est(분)
    }
  }

  function _min(sec) { return Math.round(sec / 6) / 10; }

  function estimate(plan) {
    var s = 0;
    ((plan && plan.blocks) || []).forEach(function(b) { s += _sec(b); });
    return _min(s);
  }

  function build(ctx) {
    ctx = ctx || {};
    var now = _num(ctx.now, Date.now());
    var goal = _goal(ctx.goalMinutes);
    var avail = ctx.avail || {};
    var fallback = !avail.puzzles;
    var day = (typeof ctx.day === 'string' && ctx.day) ? ctx.day : _dayKey(now);
    var wd = ctx.weekday;
    if (!(typeof wd === 'number' && wd >= 0 && wd <= 6 && Math.floor(wd) === wd)) wd = new Date(now).getDay();
    var lessonToday = _lessonToday(ctx.prevPlan, day);
    var stages = _typeStages(ctx.puzzleTypes);
    var fillUsed = stages ? _fillToday(ctx.prevPlan, day) : 0;
    var learn = _learnBlock(ctx, fallback, avail, lessonToday, !!stages);
    var rv = _reviewBlock(ctx, goal, now, fallback, avail, stages, fillUsed);
    var blocks = [
      rv.block,
      learn,
      _funBlock(ctx, wd, goal, avail),
      { id: 'wrap' }
    ];
    blocks.forEach(function(b) {
      if (b.id === 'wrap') return;
      if (b.follow) b.follow.est = _min(_sec(b.follow));
      b.est = _min(_sec(b));
    });
    var newLesson = (learn.kind === 'lesson' || learn.kind === 'curriculum') && learn.node ? learn.node : null;
    var plan = { day: day, blocks: blocks, estMin: 0, lessonNode: newLesson || lessonToday };
    if (stages) plan.fillToday = fillUsed + rv.added;
    plan.estMin = estimate(plan);
    return plan;
  }

  var api = {
    build: build, caps: caps, orderReview: orderReview, estimate: estimate, sessionFor: sessionFor, conceptTypes: conceptTypes,
    SEC: SEC, CAPS: CAPS, LIMITS: LIMITS, HANDS: HANDS, MATURE_BOX: MATURE_BOX,
    CONCEPT_TYPES: CONCEPT_TYPES, CONCEPT_SPOTS: CONCEPT_SPOTS, TYPE_STAGE: TYPE_STAGE, TYPE_BASE: TYPE_BASE
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
