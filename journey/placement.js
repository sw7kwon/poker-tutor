// journey/placement.js (채우는 패키지: M1-P7)
// 배치 고사(설계서 2.6절, 9절 M1-P7): 10문항 exact/chart(프리플랍 RFI 4, vs RFI/vs 3벳 3, 팟 오즈 3), 시드 고정, 복습 출제 없음.
// build/grade는 순수. apply만 Journey 상태를 바꾼다(Journey, JOURNEY_NODES, JOURNEY_STAGES는 함수 안에서 typeof 가드로 늦게 읽음).
var Placement = (function() {
  var SPOTS = { rfi: ['rfi|UTG', 'rfi|HJ', 'rfi|CO', 'rfi|BTN'], vs: ['vsRfi|BB@BTN', 'vsRfi|BTN@CO', 'vs3bet|CO'], potodds: 3 };
  var DEFAULT_SEED = 20261019;   // 화면용 고정 시드(모든 기기, 모든 사용자 같은 문항)
  var MAX_STAGE = 3;             // 배치 고사가 정하는 최고 단계(2.6절). 그 위는 보스 점프 테스트
  var SKIP = '?';                // 화면의 "모르겠어요" 답(항상 오답)
  // JOURNEY_STAGES가 비어 있을 때만 쓰는 폴백(2.1절 표, 3.2절 단계 기준 레이팅)
  var FALLBACK_STAGES = [
    { n: 1, key: 's1', name: '첫 카드', title: '새싹', baseRating: 1000, boss: 's1-boss' },
    { n: 2, key: 's2', name: '자리 지키기', title: '견습', baseRating: 1250, boss: 's2-boss' },
    { n: 3, key: 's3', name: '주도권', title: '레귤러', baseRating: 1500, boss: 's3-boss' },
    { n: 4, key: 's4', name: '콤보 읽기', title: '리더', baseRating: 1750, boss: 's4-boss' },
    { n: 5, key: 's5', name: '밸런스', title: '샤크', baseRating: 2000, boss: 's5-boss' },
    { n: 6, key: 's6', name: '익스플로잇', title: '마스터', baseRating: null, boss: 's6-boss' }
  ];
  var _deps = null;              // 테스트 주입 { journey, nodes, stages }

  // ── 의존성(늦은 조회) ──────────────────────────────
  function _J() {
    if (_deps && _deps.journey) return _deps.journey;
    return (typeof Journey !== 'undefined' && Journey && typeof Journey.load === 'function') ? Journey : null;
  }
  function _nodes() {
    if (_deps && _deps.nodes) return _deps.nodes;
    return (typeof JOURNEY_NODES !== 'undefined' && JOURNEY_NODES && JOURNEY_NODES.length) ? JOURNEY_NODES : [];
  }
  function _stages() {
    if (_deps && _deps.stages) return _deps.stages;
    return (typeof JOURNEY_STAGES !== 'undefined' && JOURNEY_STAGES && JOURNEY_STAGES.length) ? JOURNEY_STAGES : FALLBACK_STAGES;
  }
  function stageInfo(n) {
    var list = _stages();
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].n === n) return list[i];
    for (var j = 0; j < FALLBACK_STAGES.length; j++) if (FALLBACK_STAGES[j].n === n) return FALLBACK_STAGES[j];
    return null;
  }

  // ── 시드 RNG(Drills.rng와 같은 mulberry32, 순수 유지를 위해 자체 사본) ──
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
  // 문항마다 독립 스트림: 앞 문항의 난수 소비량이 뒤 문항을 바꾸지 않는다
  function _mix(seed, i, attempt) {
    var h = Math.imul((seed >>> 0) ^ 0x5bd1e995, 0x9e3779b1) >>> 0;
    h = (h ^ Math.imul(i + 1, 0x85ebca6b)) >>> 0;
    h = (h ^ Math.imul(attempt + 1, 0xc2b2ae35)) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  }

  // 프리플랍 1문항. noReview: 복습 출제 끔(3.2절 3번). now:0은 noReview를 모르는 구버전 PreflopDrill에서도
  // 복습 대기 목록을 비게 만드는 이중 가드(due ≤ 0인 항목은 없다).
  function _genPre(spot, seed, i, attempt) {
    if (typeof PreflopDrill === 'undefined' || !PreflopDrill.next) return null;
    return PreflopDrill.next(_rng(_mix(seed, i, attempt)), { spots: [spot], noReview: true, dueFirst: false, now: 0 });
  }
  function _genMath(seed, i, attempt) {
    if (typeof MathDrill === 'undefined' || !MathDrill.next) return null;
    return MathDrill.next(_rng(_mix(seed, i, attempt)), {});
  }

  // 그룹 안 정답이 전부 같으면(찍기 한 가지로 다 맞는 세트) 마지막 문항을 다른 정답이 나올 때까지 다시 뽑는다
  function _diversify(group, seed) {
    if (group.length < 2) return;
    var first = group[0].q && group[0].q.answer;
    var same = group.every(function(it) { return it.q && it.q.answer === first; });
    if (!same) return;
    var last = group[group.length - 1];
    for (var a = 1; a <= 40; a++) {
      var q = _genPre(last.spot, seed, last.i, a);
      if (q && q.answer !== first) { last.q = q; return; }
    }
  }

  // build(seed) → { seed, items:[{ i, group, q }] }, 10문항 순서 고정(rfi 4 → vs 3 → potodds 3)
  function build(seed) {
    seed = (typeof seed === 'number' && isFinite(seed)) ? Math.floor(seed) : DEFAULT_SEED;
    var items = [];
    var i = 0;
    var rfi = SPOTS.rfi.map(function(spot) { var it = { i: i, group: 'rfi', spot: spot, q: _genPre(spot, seed, i, 0) }; i++; return it; });
    var vs = SPOTS.vs.map(function(spot) { var it = { i: i, group: 'vs', spot: spot, q: _genPre(spot, seed, i, 0) }; i++; return it; });
    _diversify(rfi, seed);
    _diversify(vs, seed);
    var pot = [], seenKey = {}, seenPct = {};
    for (var k = 0; k < SPOTS.potodds; k++, i++) {
      var q = null;
      for (var a = 0; a < 40; a++) {
        var c = _genMath(seed, i, a);
        if (!c) break;
        var key = c.P + '|' + c.B;
        q = c;
        if (!seenKey[key] && !seenPct[c.answerPct]) break; // 같은 팟/벳, 같은 정답 %는 한 번만
      }
      if (q) { seenKey[q.P + '|' + q.B] = 1; seenPct[q.answerPct] = 1; }
      pot.push({ i: i, group: 'potodds', q: q });
    }
    rfi.concat(vs, pot).forEach(function(it) {
      if (it.q) items.push({ i: items.length, group: it.group, q: it.q });
    });
    return { seed: seed, items: items };
  }

  function _answerOf(answers, idx) {
    if (!answers) return null;
    var a = Array.isArray(answers) ? answers[idx] : answers[idx];
    return (a === undefined || a === null) ? null : String(a);
  }

  function stageFor(correct, vs) {
    if (correct <= 4) return 1;
    if (correct <= 7) return 2;
    return vs >= 2 ? 3 : 2;
  }

  // grade(items, answers) → { correct, byGroup:{rfi, vs, potodds}, stage }. answers는 배열 또는 { i: optionId }
  function grade(items, answers) {
    var byGroup = { rfi: 0, vs: 0, potodds: 0 };
    var correct = 0;
    (items || []).forEach(function(it, idx) {
      if (!it || !it.q) return;
      var key = (typeof it.i === 'number') ? it.i : idx;
      var a = _answerOf(answers, key);
      if (a !== null && a === String(it.q.answer)) {
        correct++;
        if (byGroup.hasOwnProperty(it.group)) byGroup[it.group]++;
      }
    });
    return { correct: correct, byGroup: byGroup, stage: stageFor(correct, byGroup.vs) };
  }

  // 목표 단계보다 아래 단계 노드 id(위상 순서: prereq가 항상 먼저)
  function skipList(stage) {
    var list = _nodes().filter(function(n) { return n && n.stage < stage; });
    var ids = {};
    list.forEach(function(n) { ids[n.id] = true; });
    var done = {}, out = [];
    var guard = list.length + 1;
    while (out.length < list.length && guard-- > 0) {
      for (var i = 0; i < list.length; i++) {
        var n = list[i];
        if (done[n.id]) continue;
        var ready = (n.prereq || []).every(function(p) { return done[p] || !ids[p]; });
        if (ready) { done[n.id] = true; out.push(n.id); }
      }
    }
    return out;
  }

  function _iso(now) {
    try { return new Date(typeof now === 'number' ? now : Date.now()).toISOString(); } catch (e) { return null; }
  }

  function isDone() {
    var J = _J();
    if (!J) return false;
    try {
      var st = J.load();
      return !!(st && st.placement && st.placement.done);
    } catch (e) { return false; }
  }

  // 결과 카드까지 본 답안(단계 선택 전). 결과 카드에는 문항별 정답이 나오고 시드가 고정이라, 선택 없이 나갔다가
  // 다시 치면 만점이 된다. 그래서 답안을 남겨 두고 다시 열면 같은 결과 카드로 돌아간다(2.6절 "다시 치지 않는다").
  // keys = 문항 key와 정답(차트나 생성기가 바뀌어 문항이 달라지면 남긴 답안은 버린다)
  function _setKeys(set) {
    return ((set && set.items) || []).map(function(it) { return it && it.q ? it.q.key + '=' + it.q.answer : ''; });
  }
  function savePending(set, answers, now) {
    var J = _J();
    if (!J || !set || !set.items) return false;
    try {
      var st = J.load();
      if (!st || (st.placement && st.placement.done)) return false;
      var pl = st.placement || { done: false, stage: null, correct: null, at: null };
      pl.pending = { seed: set.seed, keys: _setKeys(set),
        answers: set.items.map(function(it, i) { var a = answers && answers[i]; return (a === undefined || a === null) ? null : String(a); }),
        at: _iso(now) };
      st.placement = pl;
      if (typeof J.save === 'function') J.save(st);
      return true;
    } catch (e) { return false; }
  }
  // pending(set?) → 남긴 답안 배열 | null. set을 주면 문항(key=정답)이 같을 때만 돌려준다
  function pending(set) {
    var J = _J();
    if (!J) return null;
    try {
      var st = J.load();
      var pl = st && st.placement;
      var p = pl && !pl.done ? pl.pending : null;
      if (!p || typeof p.seed !== 'number' || !Array.isArray(p.answers) || !Array.isArray(p.keys)) return null;
      if (set) {
        if (set.seed !== p.seed) return null;
        var now = _setKeys(set);
        if (now.length !== p.keys.length || now.some(function(k, i) { return k !== p.keys[i]; })) return null;
      }
      return { seed: p.seed, answers: p.answers.slice(), at: p.at || null };
    } catch (e) { return null; }
  }

  // apply(result, now) → { stage, skippedNodes, rating:{r, rd} } | false(이미 배치 완료, 또는 Journey 미가동)
  function apply(result, now) {
    var J = _J();
    if (!J || typeof J.passNode !== 'function') return false;
    now = (typeof now === 'number') ? now : Date.now();
    var st = J.load();
    if (!st || (st.placement && st.placement.done)) return false;
    var stage = Math.max(1, Math.min(MAX_STAGE, Math.floor((result && result.stage) || 1)));
    var skipped = [];
    skipList(stage).forEach(function(id) {
      var status = (typeof J.nodeStatus === 'function') ? J.nodeStatus(id) : null;
      if (status === 'passed') return;            // 이미 통과한 노드는 건너뜀 표시로 덮지 않는다
      J.passNode(id, { skipped: true }, now);
      skipped.push(id);
    });
    st = J.load();
    if (stage > 1 && (st.stage || 1) < stage && typeof J.promote === 'function') { J.promote(stage, now); st = J.load(); }
    var info = stageInfo(stage);
    var base = (info && typeof info.baseRating === 'number') ? info.baseRating : 1000;
    var rt = st.rating || {};
    if (!rt.n) {                                  // 레이팅 기록이 이미 있으면 기준값으로 덮지 않는다
      rt.r = base; rt.rd = 350;
      if (typeof rt.vol !== 'number') rt.vol = 0.06;
      if (typeof rt.n !== 'number') rt.n = 0;
      if (!rt.pending) rt.pending = [];
      if (!rt.history) rt.history = [];
    }
    st.rating = rt;
    var pl = { done: true, stage: stage, correct: (result && typeof result.correct === 'number') ? result.correct : null, at: _iso(now) };
    if (result && typeof result.recommended === 'number') pl.recommended = result.recommended;
    if (result && result.byGroup) pl.byGroup = { rfi: result.byGroup.rfi | 0, vs: result.byGroup.vs | 0, potodds: result.byGroup.potodds | 0 };
    st.placement = pl;
    if (typeof J.save === 'function') J.save(st);
    return { stage: stage, skippedNodes: skipped, rating: { r: rt.r, rd: rt.rd } };
  }

  // 보스 점프 안내용: 그 단계 보스 노드 id
  function skipToBoss(stage) {
    var n = Math.max(1, Math.min(6, Math.floor(stage) || 1));
    var info = stageInfo(n);
    return (info && info.boss) || ('s' + n + '-boss');
  }

  function _setDeps(d) { _deps = d || null; }

  var api = {
    SPOTS: SPOTS, DEFAULT_SEED: DEFAULT_SEED, MAX_STAGE: MAX_STAGE, SKIP: SKIP,
    build: build, grade: grade, stageFor: stageFor, apply: apply, skipToBoss: skipToBoss,
    skipList: skipList, stageInfo: stageInfo, isDone: isDone, savePending: savePending, pending: pending, _setDeps: _setDeps
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
