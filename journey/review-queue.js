// journey/review-queue.js (채우는 패키지: M5-P8, M5 그룹 REVIEW)
// 실수 핸드 SRS와 주간 리포트 집계(설계서 4.8절 3번, 5.8절 3번, 6.2절 2번, 9절 M5-P8, 로드맵 계약 F4 정본).
//
// 저장: poker_journey.review = { items: { key: item }, views: ['YYYY-Www'] }(Journey.load/save로만, Journey가 없으면 메모리).
//   item = { key, mode, heroPos, seed, street, at(ISO, 마지막으로 큐에 들어온 때), pattern, concept, light, evLoss, estimated,
//            box(0~4), due(ms, 졸업이면 null), n, ok, lastAt(ISO|null), lastOk(true|false|null), miss(선택, 연습에서 그 상황이 안 나온 연속 횟수) }
//   key = 'mode|heroPos|seed|street'(App.startPractice에 필요한 정보 전부, poker_mistakes 200캡과 독립). 항목 200개 상한.
//   Drills 'mistake' 항목은 만들지 않는다(F4: Leitner 상자 대신 이 모듈의 자체 일정).
// 일정: 큐에 들어오면 다음 날부터, 맞히면 3일, 7일, 21일 뒤, 21일 차에 맞히면 졸업(box 4). 틀리면 다음 날부터(box 0).
//   '며칠 뒤'는 24시간 배수가 아니라 로컬 날짜 + n일의 0시다(M7 TIME-07, _dueAt). 월요일 밤에 생긴 실수는 화요일 아침부터 기한이다.
//   이미 저장된 due는 그대로 두고, 다음에 기록할 때부터 새 식이 적용된다.
//   기한 전에 미리 맞힌 연습(주간 리포트의 다시 풀기 등)은 상자를 올리지 않고 기록(n, ok, lastAt)만 남긴다. 틀리면 기한과 상관없이 처음부터.
// 연습 연쇄: practice(items, opts)가 App.startPractice로 최대 5개를 차례로 연다. 핸드가 끝나면 Journey.onHandEnd가
//   onPracticeHandEnd(ctx)를 부르고(BOSS 연결), 결과바 ▶(App.nextRound)의 연습 종료 분기가 onPracticeExit()을 부른다(HUD 연결).
//   판정: 그 핸드의 seed, heroPos, mode가 진행 중 항목과 같고, 실수했던 스트리트의 결정이 모두 초록 또는 노랑이면 ok.
//   그 스트리트까지 가지 못한 핸드(상대 반응이 달라 일찍 끝남)와, 갔어도 패턴의 상황(상대 벳 직면 또는 공짜 체크, SPOT_KIND)이
//   다시 나오지 않은 핸드는 상자를 바꾸지 않고 기한만 1, 2, 4, 7일 뒤로 미룬다(miss, 같은 항목이 매일 맨 앞에 와서 다른 실수
//   핸드를 막지 않게). 같은 핸드 다시(🔁)는 첫 판정만 일정에 반영.
//   연습은 레이팅과 XP에 들어가지 않는다(Journey.afterDecision이 연습 결정을 거르고, 이 모듈은 XP를 주지 않는다).
// 주간 리포트: weekly(now) = { week, top(최근 7일에 들어온 실수 중 evLoss 큰 순 3, estimated는 '큰 실수' 라벨), concepts(JStats
//   최근 7일 대 그 앞 7일), added, fixed, due, graduated }. markReportView(now), reportWeeks()(ISO 주, M6 보스 weeks와 s6-05, s6-08).
// (M6-L6B, 로드맵 결정 15와 계약 H10) 복기 이월 두 가지:
//   1. weekly(now, { lastWeek:true }) = 지난 ISO 주 월요일 00:00 ~ 일요일 23:59:59.999(로컬) 범위의 리포트. top, added, fixed는
//      그 범위, concepts는 JStats 지난주 7일(월~일) 대 그 앞 주 7일, due와 graduated와 total은 지금 기준. 결과에 lastWeek:true,
//      week = 지난주 키, from과 to(ISO, 둘 다 범위 안 끝 시각). 월요일 강조 카드와 그 리포트(journey/views/weekly.js)가 쓴다.
//      markReportView(now)는 그대로 '본 주'(now의 ISO 주)를 기록하고 reportWeeks()와 F4 키 형식도 그대로다(M6 보스 weeks 조건).
//   2. 연습 연쇄(practice) 동안 코칭 레벨을 L1(결정 전 정답 가림)로 고정한다. 첫 핸드를 열기 전에 CoachUI.snapshot()을
//      poker_journey.review.coach = { snap, level:1, at }에 저장하고 CoachUI.setLevel(1). 연쇄가 끝나면(onDone 전, onPracticeExit 마지막과
//      다른 연습이 끼어든 뒤, abort, 새 연쇄로 바뀜, 시작 실패, 연쇄 중 일반 핸드의 실수가 들어옴 = 연쇄를 떠남) CoachUI.restore(snap)
//      뒤 저장본을 지운다. 새로고침이나 앱 종료로 연쇄가 사라지면 window load 뒤 restoreStale()이 저장본으로 되돌린다.
//      Boss가 코칭을 고정 중이면(poker_journey.boss.coachLock 또는 boss.active.coachSnap) 고정도 복원도 하지 않는다(복원은 보스가
//      풀린 뒤 restoreStale 또는 releaseCoach로). CoachUI.snapshot, restore, setLevel 중 하나라도 없으면 아무것도 하지 않는다.
// 로드 시 document, window(addEventListener 제외), localStorage, setTimeout에 접근하지 않는다. 다른 모듈(Journey, App, JStats, Coach,
//   CoachUI)은 typeof 가드.
var ReviewQueue = (function() {
  var DAY = 24 * 3600 * 1000;
  var INTERVALS = [1, 3, 7, 21];        // box 0~3의 다음 간격(일)
  var MISS_DAYS = [1, 2, 4, 7];          // 연습에서 그 상황이 안 나온 연속 1, 2, 3, 4회 이상일 때 기한 미룸(일)
  var GRAD_BOX = 4;                      // 졸업 상자
  var CAP = 200;                         // 항목 상한
  var PRACTICE_MAX = 5;                  // 연습 연쇄 한 번에 여는 핸드 수
  var VIEWS_MAX = 260;                   // 리포트 열람 주 기록 상한(5년)
  var TOP_N = 3;
  var LOCK_LEVEL = 1;                    // 연습 연쇄 동안 코칭 레벨(L1 먼저 판단 = 결정 전 정답 가림, 로드맵 결정 15)
  var STREET_KO = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버' };
  var COACH_CONCEPTS = ['rfi', 'vs_rfi', 'blind_defense', 'vs_3bet', 'pot_odds', 'draws', 'cbet', 'value_bluff', 'board_texture', 'turn_river', 'actions'];
  var CONCEPT_LABEL = { rfi: '오픈', vs_rfi: '상대 오픈 대응', blind_defense: '블라인드 방어', vs_3bet: '3벳 대응', pot_odds: '팟 오즈',
    draws: '드로우', cbet: 'c벳', value_bluff: '밸류와 블러프', board_texture: '보드 텍스처', turn_river: '턴, 리버', actions: '액션 기본' };

  var _mem = null;          // Journey가 없을 때의 메모리 상태
  var _run = null;          // 진행 중 연습 연쇄
  var _stale = null;        // 연쇄를 중간에 떠나 앱에 남아 있을 수 있는 연습 항목(같은 핸드면 App.practiceSame으로 다시 연다)
  var _seq = 0;
  var _probe = null;        // 테스트 주입: 현재 화면 id를 돌려주는 함수
  var _sink = null;         // 테스트 주입: 안내 토스트 기록 함수
  var _toastTimer = null;

  // ── 유틸 ──
  function _now(now) { return (typeof now === 'number' && isFinite(now)) ? now : Date.now(); }
  function _iso(t) { return new Date(t).toISOString(); }
  function _ms(v) { var t = (typeof v === 'number') ? v : Date.parse(v); return isFinite(t) ? t : NaN; }
  function _isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function _num(x, d) { x = Number(x); return isFinite(x) ? x : d; }
  function _fn(o, k) { return !!o && typeof o[k] === 'function'; }
  // TIME-07: 복습 기한 = t의 로컬 날짜 + n일의 0시. 정확히 24시간 배수로 밀면 저녁에 생긴 실수가 다음 날 아침 오늘의 5분에 안 나오고
  // 하는 시각이 들쭉날쭉할 때 간격마다 하루씩 밀린다. Date 생성자로 날짜를 더해 서머타임이 있는 지역에서도 0시가 밀리지 않는다.
  function _dueAt(t, n) {
    var d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
  }
  function _cmp(a, b) { a = String(a); b = String(b); return a < b ? -1 : (a > b ? 1 : 0); }
  function _copy(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function _warn(e) { try { if (typeof console !== 'undefined' && console.warn) console.warn('[ReviewQueue]', (e && e.message) || e); } catch (x) {} }

  // 로컬 날짜 기준 ISO 8601 주 키 'YYYY-Www'(JStats.weekKey와 같은 규칙: 월요일 시작, 1월 4일이 든 주가 1주)
  function weekKey(now) {
    var d = new Date(_now(now));
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dow = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dow);
    var y = t.getUTCFullYear();
    var wk = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / DAY + 1) / 7);
    return y + '-W' + (wk < 10 ? '0' : '') + wk;
  }

  // ── 저장 ──
  function _state() {
    if (typeof Journey !== 'undefined' && Journey && _fn(Journey, 'load')) {
      try { var st = Journey.load(); if (_isObj(st)) return st; } catch (e) { _warn(e); }
    }
    if (!_mem) _mem = {};
    return _mem;
  }
  function _q() {
    var st = _state();
    if (!_isObj(st.review)) st.review = { items: {}, views: [] };
    var r = st.review;
    if (!_isObj(r.items)) r.items = {};
    if (!Array.isArray(r.views)) r.views = [];
    return r;
  }
  function _save() {
    if (typeof Journey !== 'undefined' && Journey && _fn(Journey, 'save')) { try { Journey.save(); } catch (e) { _warn(e); } }
  }
  function _list() {
    var items = _q().items;
    return Object.keys(items).map(function(k) { return items[k]; }).filter(_isObj);
  }

  // ── 키 ──
  function _seedOf(seed) {
    if (seed === null || seed === undefined || seed === '') return null;
    var n = Number(seed);
    return isFinite(n) ? n : null;
  }
  function key(mode, heroPos, seed, street) {
    var s = _seedOf(seed);
    if (s === null) return null;
    return [mode == null ? '' : String(mode), heroPos == null ? '' : String(heroPos), String(s), street == null ? '' : String(street)].join('|');
  }
  function parseKey(k) {
    var p = String(k == null ? '' : k).split('|');
    if (p.length !== 4) return null;
    var s = _seedOf(p[2]);
    if (s === null) return null;
    return { key: String(k), mode: p[0] || null, heroPos: p[1] || null, seed: s, street: p[3] || null };
  }

  // 고정 벌점(차트, 가이드 판정, 공짜 체크 폴드)인지. info.estimated가 없으면(예전 호출) 방금 JStats에 기록된 같은 결정으로 판단
  function _estimated(info, street, t) {
    if (typeof info.estimated === 'boolean') return info.estimated;
    if (info.source === 'chart' || info.source === 'guide') return true;
    if (info.pattern === 'fold_free_check') return true;
    if (typeof JStats !== 'undefined' && JStats && _fn(JStats, 'recent')) {
      try {
        var last = (JStats.recent(null, 1) || [])[0];
        if (last && Math.abs(_num(last.t, -1e15) - t) < 10000 && (last.street || null) === (street || null) &&
            (last.pattern || null) === (info.pattern || null)) {
          return !!last.est || last.source === 'chart' || last.source === 'guide';
        }
      } catch (e) { /* 아래 기본값 */ }
    }
    return false;
  }

  // ── 큐 조작 ──
  // journey-core afterDecision이 red 결정마다 부른다. 같은 key면 갱신(일정은 처음부터, 비용 정보는 큰 쪽)
  function add(mode, heroPos, seed, street, info, now) {
    var k = key(mode, heroPos, seed, street);
    if (!k) return null;
    // 연습 핸드의 결정은 여기 오지 않는다(journey-core가 거름). 연쇄가 열려 있는데 일반 핸드의 실수가 들어오면 연쇄를 떠난 것이다:
    // 조용히 정리하고 코칭을 되돌린다(▶ 없이 메뉴로 나가 자유 게임을 친 경우 등, H10)
    if (_run && _run.launched) _leave();
    info = _isObj(info) ? info : {};
    var t = _now(now);
    var loss = Math.max(0, Math.round(Math.abs(_num(info.evLoss, 0)) * 100) / 100);
    var est = _estimated(info, street, t);
    var q = _q(), it = q.items[k];
    if (_isObj(it)) {
      if (loss >= _num(it.evLoss, 0)) {
        it.evLoss = loss; it.estimated = est;
        if (info.pattern !== undefined) it.pattern = info.pattern || null;
        if (info.concept !== undefined) it.concept = info.concept || null;
      }
      it.light = info.light || it.light || 'red';
    } else {
      it = q.items[k] = { key: k, mode: mode == null ? null : String(mode), heroPos: heroPos == null ? null : String(heroPos),
        seed: _seedOf(seed), street: street == null ? null : String(street), at: null, pattern: info.pattern || null,
        concept: info.concept || null, light: info.light || 'red', evLoss: loss, estimated: est, box: 0, due: null,
        n: 0, ok: 0, lastAt: null, lastOk: null };
    }
    it.at = _iso(t);
    it.box = 0;
    it.due = _dueAt(t, INTERVALS[0]);
    if (it.gradAt) delete it.gradAt;
    if (it.miss) delete it.miss;
    _prune(q, k);
    _save();
    return _copy(it);
  }
  // 200개를 넘으면 졸업 항목(오래된 순)부터, 그다음 오래된 항목부터 지운다. 방금 넣은 키(keep)는 지우지 않는다
  function _prune(q, keep) {
    var keys = Object.keys(q.items);
    if (keys.length <= CAP) return 0;
    var cand = keys.filter(function(k) { return k !== keep; }).map(function(k) {
      var it = q.items[k] || {};
      var grad = _num(it.box, 0) >= GRAD_BOX ? 0 : 1;
      var t = _ms(grad === 0 ? (it.lastAt || it.at) : it.at);
      return { k: k, g: grad, t: isFinite(t) ? t : 0 };
    }).sort(function(a, b) { return (a.g - b.g) || (a.t - b.t) || _cmp(a.k, b.k); });
    var drop = keys.length - CAP;
    for (var i = 0; i < drop && i < cand.length; i++) delete q.items[cand[i].k];
    return drop;
  }

  // 결과 기록: 맞히면 다음 상자(기한 전이면 그대로), 4면 졸업. 틀리면 상자 0, 1일 뒤
  function record(k, ok, now) {
    var q = _q(), it = q.items[k];
    if (!_isObj(it)) return null;
    var t = _now(now);
    ok = !!ok;
    it.n = _num(it.n, 0) + 1;
    if (ok) it.ok = _num(it.ok, 0) + 1;
    it.lastAt = _iso(t);
    it.lastOk = ok;
    if (it.miss) delete it.miss;
    var box = Math.max(0, Math.min(GRAD_BOX, Math.floor(_num(it.box, 0))));
    var due = (it.due == null) ? null : _num(it.due, null);
    if (!ok) {
      it.box = 0;
      it.due = _dueAt(t, INTERVALS[0]);
      if (it.gradAt) delete it.gradAt;
    } else if (box < GRAD_BOX && (due === null || due <= t)) {
      it.box = box + 1;
      if (it.box >= GRAD_BOX) { it.due = null; it.gradAt = _iso(t); }
      else it.due = _dueAt(t, INTERVALS[it.box]);
    }
    _save();
    return _copy(it);
  }

  // 연습에서 그 상황이 다시 나오지 않음(그 스트리트까지 못 감, 다른 상황): 상자와 기록(n, ok, lastAt)은 그대로 두고, 기한이 된
  // 항목이면 기한만 MISS_DAYS만큼 미룬다. 재현이 어려운 핸드(상대가 가끔만 벳)가 (box, due) 순에서 매일 맨 앞을 차지하지 않게
  function _miss(k, now) {
    var q = _q(), it = q.items[k];
    if (!_isObj(it)) return null;
    var t = _now(now);
    it.miss = Math.max(0, Math.floor(_num(it.miss, 0))) + 1;
    if (_isDue(it, t)) it.due = _dueAt(t, MISS_DAYS[Math.min(MISS_DAYS.length - 1, it.miss - 1)]);
    _save();
    return _copy(it);
  }

  function get(k) { var it = _q().items[k]; return _isObj(it) ? _copy(it) : null; }
  function count() { return _list().length; }
  function _isDue(it, t) { return _num(it.box, 0) < GRAD_BOX && it.due != null && _num(it.due, Infinity) <= t; }
  function _byDue(a, b) { return (_num(a.box, 0) - _num(b.box, 0)) || (_num(a.due, 0) - _num(b.due, 0)) || _cmp(a.key, b.key); }

  // 기한이 된 항목(box asc, due asc, key asc), limit개까지
  function due(now, limit) {
    var t = _now(now);
    var out = _list().filter(function(it) { return _isDue(it, t); }).sort(_byDue);
    if (limit != null && isFinite(limit)) out = out.slice(0, Math.max(0, Math.floor(limit)));
    return out.map(_copy);
  }

  // filter = 함수 또는 { pattern, concept, street, mode, heroPos, due:true(now 기준), graduated:bool, since(ms), until(ms), now }
  // 결과는 최근에 들어온 순(at desc, key asc)
  function items(filter) {
    var f = filter;
    var t = _isObj(f) ? _now(f.now) : Date.now();
    var out = _list().filter(function(it) {
      if (typeof f === 'function') return !!f(_copy(it));
      if (!_isObj(f)) return true;
      var ok = true;
      ['pattern', 'concept', 'street', 'mode', 'heroPos'].forEach(function(k) {
        if (f[k] !== undefined && f[k] !== null && it[k] !== f[k]) ok = false;
      });
      if (f.due === true && !_isDue(it, t)) ok = false;
      if (f.graduated === true && _num(it.box, 0) < GRAD_BOX) ok = false;
      if (f.graduated === false && _num(it.box, 0) >= GRAD_BOX) ok = false;
      var at = _ms(it.at);
      if (f.since != null && !(at >= _num(f.since, -Infinity))) ok = false;
      if (f.until != null && !(at <= _num(f.until, Infinity))) ok = false;
      return ok;
    });
    out.sort(function(a, b) { return (_ms(b.at) - _ms(a.at)) || _cmp(a.key, b.key); });
    return out.map(_copy);
  }

  // 한 패턴의 연습 후보: 졸업 전 먼저, 그다음 비싼 순, 최근 순. 기본 5개("이 패턴 5핸드 연습")
  function patternItems(pattern, limit) {
    var n = (limit == null) ? PRACTICE_MAX : Math.max(0, Math.floor(_num(limit, PRACTICE_MAX)));
    return _list().filter(function(it) { return it.pattern === pattern; }).sort(function(a, b) {
      var ga = _num(a.box, 0) >= GRAD_BOX ? 1 : 0, gb = _num(b.box, 0) >= GRAD_BOX ? 1 : 0;
      return (ga - gb) || (_num(b.evLoss, 0) - _num(a.evLoss, 0)) || (_ms(b.at) - _ms(a.at)) || _cmp(a.key, b.key);
    }).slice(0, n).map(_copy);
  }

  // ── 라벨 ──
  function _pattern(p) {
    if (!p || typeof Coach === 'undefined' || !Coach || !_isObj(Coach.PATTERNS)) return null;
    var d = Coach.PATTERNS[p];
    return _isObj(d) ? d : null;
  }
  // 손해 라벨: 고정 벌점이면 '큰 실수'(설계서 8.2절 6번, bb 숫자를 보이지 않음), EV 계산이면 '-1.5bb'
  function lossLabel(it) {
    if (!it) return '';
    if (it.estimated) return '큰 실수';
    return '-' + (Math.round(_num(it.evLoss, 0) * 10) / 10).toFixed(1) + 'bb';
  }
  function _decorate(it) {
    var o = _copy(it), pd = _pattern(it.pattern);
    o.label = lossLabel(it);
    o.streetLabel = STREET_KO[it.street] || (it.street || '');
    o.conceptLabel = CONCEPT_LABEL[it.concept] || (it.concept || '');
    o.patternLabel = pd ? pd.label : null;
    o.rule = pd ? pd.rule : null;
    o.goal = pd ? pd.goal : null;
    o.graduated = _num(it.box, 0) >= GRAD_BOX;
    return o;
  }

  // ── 주간 리포트 ──
  function _acc(c, t) {
    if (typeof JStats === 'undefined' || !JStats || !_fn(JStats, 'accuracy')) return null;
    try {
      var a = JStats.accuracy(c, 7, t);
      if (!a) return null;
      var n = Math.max(0, _num(a.n, 0));
      return { n: n, pct: (n > 0 && a.pct != null && isFinite(a.pct)) ? Math.round(Number(a.pct)) : null };
    } catch (e) { return null; }
  }
  // 개념별 정확도(초록 비율): end(JStats 7일 창의 마지막 날) 대 prevEnd. 둘 중 하나라도 결정이 있는 개념만, 결정 수가 많은 순
  function _concepts(end, prevEnd) {
    var out = [];
    COACH_CONCEPTS.forEach(function(c) {
      var a = _acc(c, end), b = _acc(c, prevEnd);
      if (!a || !b || (a.n === 0 && b.n === 0)) return;
      out.push({ concept: c, label: CONCEPT_LABEL[c] || c, now: a, prev: b,
        delta: (a.pct != null && b.pct != null) ? a.pct - b.pct : null });
    });
    out.sort(function(x, y) { return ((y.now.n + y.prev.n) - (x.now.n + x.prev.n)) || _cmp(x.concept, y.concept); });
    return out;
  }
  // 지난 ISO 주(로컬 날짜): from = 지난주 월요일 00:00, to = 이번 주 월요일 00:00(제외), sun = 지난주 일요일 정오(JStats 날짜 창의 끝)
  // 날짜 생성자로 하루씩 빼므로 서머타임이 있는 지역에서도 자정이 밀리지 않는다
  function lastWeekSpan(now) {
    var d = new Date(_now(now));
    var back = (d.getDay() + 6) % 7;                       // 월 0, 화 1, ... 일 6
    var y = d.getFullYear(), m = d.getMonth(), day = d.getDate() - back;
    return { from: new Date(y, m, day - 7).getTime(), to: new Date(y, m, day).getTime(),
      sun: new Date(y, m, day - 1, 12).getTime(), prevSun: new Date(y, m, day - 8, 12).getTime() };
  }
  function _report(all, t, win, week, from, to, conc) {
    var recent = all.filter(function(it) { return win(it.at); });
    var top = recent.slice().sort(function(a, b) {
      return (_num(b.evLoss, 0) - _num(a.evLoss, 0)) || (_ms(b.at) - _ms(a.at)) || _cmp(a.key, b.key);
    }).slice(0, TOP_N).map(_decorate);
    return {
      week: week, from: _iso(from), to: _iso(to),
      top: top,
      concepts: conc,
      added: recent.length,
      fixed: all.filter(function(it) { return it.lastOk === true && win(it.lastAt); }).length,
      due: all.filter(function(it) { return _isDue(it, t); }).length,
      graduated: all.filter(function(it) { return _num(it.box, 0) >= GRAD_BOX; }).length,
      total: all.length
    };
  }
  // opts.lastWeek(H10): 지난 ISO 주 월~일 범위(위 머리 주석 1번). 없으면 지금까지의 최근 7일(F4 그대로)
  function weekly(now, opts) {
    var t = _now(now), all = _list();
    if (_isObj(opts) && opts.lastWeek) {
      var sp = lastWeekSpan(t);
      var inWeek = function(v) { var x = _ms(v); return isFinite(x) && x >= sp.from && x < sp.to; };
      var r = _report(all, t, inWeek, weekKey(sp.from), sp.from, sp.to - 1, _concepts(sp.sun, sp.prevSun));
      r.lastWeek = true;
      return r;
    }
    var from = t - 7 * DAY;
    var inWin = function(v) { var m = _ms(v); return isFinite(m) && m > from && m <= t; };
    return _report(all, t, inWin, weekKey(t), from, t, _concepts(t, t - 7 * DAY));
  }
  function markReportView(now) {
    var q = _q(), wk = weekKey(_now(now));
    if (q.views.indexOf(wk) < 0) {
      q.views.push(wk);
      q.views.sort();
      if (q.views.length > VIEWS_MAX) q.views.splice(0, q.views.length - VIEWS_MAX);
      _save();
    }
    return q.views.slice();
  }
  function reportWeeks() { return _q().views.filter(function(w) { return typeof w === 'string'; }).slice().sort(); }

  // ── 연습 연쇄 ──
  function _screen() {
    if (typeof _probe === 'function') { try { return _probe(); } catch (e) { return null; } }
    try {
      if (typeof document === 'undefined' || !document || typeof document.querySelector !== 'function') return null;
      var el = document.querySelector('.screen.active');
      return (el && el.id) ? el.id : null;
    } catch (e) { return null; }
  }
  function _same(a, b) {
    return !!a && !!b && a.seed === b.seed && (a.heroPos || null) === (b.heroPos || null) && (a.mode || null) === (b.mode || null);
  }
  // 항목 목록 정규화: 키 문자열, 큐 항목, {mode, heroPos, seed, street} 모두 받는다. seed가 없으면 뺀다
  function _norm(list) {
    var out = [], seen = {};
    (Array.isArray(list) ? list : [list]).forEach(function(x) {
      var rec = null;
      if (typeof x === 'string') rec = get(x) || parseKey(x);
      else if (_isObj(x)) {
        var k = x.key || key(x.mode, x.heroPos, x.seed, x.street);
        rec = (k && get(k)) || (k ? parseKey(k) : null);
        if (rec && x.seed != null && rec.seed == null) rec.seed = _seedOf(x.seed);
      }
      if (!rec || rec.seed == null || !rec.key || seen[rec.key]) return;
      seen[rec.key] = true;
      out.push({ key: rec.key, mode: rec.mode || null, heroPos: rec.heroPos || null, seed: rec.seed, street: rec.street || null,
        pattern: rec.pattern || null });
    });
    return out;
  }
  // App.startPractice로 연다. 여정 화면에서 불렀는데 게임 화면으로 바뀌지 않았으면 앱에 끝나지 않은 연습이 남아
  // startPractice가 거절한 것이다. 그 연습이 같은 핸드(연쇄를 중간에 떠난 항목)면 App.practiceSame으로 다시 연다.
  function _launch(rec, inGame) {
    if (typeof App === 'undefined' || !App || !_fn(App, 'startPractice')) return false;
    var before = inGame ? 'screen-game' : _screen();
    try { App.startPractice({ seed: rec.seed, heroPos: rec.heroPos, mode: rec.mode }); } catch (e) { _warn(e); return false; }
    if (before === null || before === 'screen-game' || _screen() === 'screen-game') { _stale = null; return true; }
    if (_stale && _same(_stale, rec) && _fn(App, 'practiceSame')) {
      try { App.practiceSame(); } catch (e) { _warn(e); return false; }
      if (_screen() === 'screen-game') { _stale = null; return true; }
    }
    return false;
  }
  function _startAt(i, inGame) {
    var run = _run;
    if (!run || !run.list[i]) return false;
    run.i = i;
    run.judged = false;
    run.launched = false;
    if (!_launch(run.list[i], inGame)) return false;
    if (_run !== run) return true;
    run.launched = true;
    if (run.opts.toast !== false) _hint(run.list[i], i, run.list.length);
    return true;
  }
  // items: 키, 큐 항목, {mode, heroPos, seed, street}의 배열. opts = { onDone(res), onItem(r), limit(≤5), tag, toast }
  // 첫 핸드를 열면 true. 이미 진행 중인 연쇄는 조용히 끝낸다(onDone 없음).
  function practice(list, opts) {
    opts = _isObj(opts) ? opts : {};
    if (typeof App === 'undefined' || !App || !_fn(App, 'startPractice')) return false;
    var lim = Math.min(PRACTICE_MAX, Math.max(1, Math.floor(_num(opts.limit, PRACTICE_MAX))));
    var recs = _norm(list).slice(0, lim);
    if (!recs.length) return false;
    // ▶ 없이 떠난 연쇄(주간 리포트 연습 중 뒤로 등): 그 연습은 앱에 남아 있을 수 있어 abort처럼 _stale로 기억하고 조용히 끝낸다
    if (_run) { if (_run.launched && !_run.foreign) _stale = _run.list[_run.i]; _hideToast(); _finish(true, false); }
    _run = { id: ++_seq, list: recs, i: 0, n: 0, ok: 0, results: [], opts: opts, tag: opts.tag || null,
      judged: false, launched: false, foreign: false, failed: false };
    _lockCoach();                                            // 첫 핸드를 열기 전에(App.startPractice가 CoachUI.onNewHand를 부른다)
    if (!_startAt(0, false)) { _run = null; _releaseCoach(); return false; }
    return true;
  }

  // ── 연습 중 코칭 고정(H10, 머리 주석 2번) ──
  function _coachApi() {
    var C = (typeof CoachUI !== 'undefined') ? CoachUI : null;
    return (C && _fn(C, 'snapshot') && _fn(C, 'restore') && _fn(C, 'setLevel')) ? C : null;
  }
  // 보스(또는 코칭 고정 미션)가 코칭을 쥐고 있나(journey/boss.js coachLock, active.coachSnap)
  function _bossLocked() {
    var b = _state().boss;
    return !!(_isObj(b) && (b.coachLock || (_isObj(b.active) && b.active.coachSnap)));
  }
  function _lockCoach() {
    var C = _coachApi();
    if (!C) return false;
    try {
      if (_bossLocked()) return false;
      var q = _q();
      // 저장본이 이미 있으면(보스 때문에 미뤄진 복원 등) 그것이 원래 레벨이다. 지금 레벨(L1일 수 있음)을 다시 뜨지 않는다
      if (!_isObj(q.coach) || !_isObj(q.coach.snap)) {
        var snap = C.snapshot();
        if (!_isObj(snap)) return false;
        q.coach = { snap: _copy(snap), level: LOCK_LEVEL, at: _iso(Date.now()) };
        _save();                                             // 고정 전에 저장(새로고침 뒤 load에서 되돌린다)
      }
      C.setLevel(LOCK_LEVEL);
      return true;
    } catch (e) { _warn(e); return false; }
  }
  // 저장된 스냅샷으로 되돌리고 지운다. 연쇄가 진행 중이거나 보스가 코칭을 쥐고 있으면 그대로 둔다(false)
  function _releaseCoach() {
    try {
      var q = _q();
      if (!_isObj(q.coach)) return false;
      if (_run || _bossLocked()) return false;
      var C = _coachApi();
      if (!C) return false;
      var snap = q.coach.snap;
      delete q.coach;
      _save();
      if (_isObj(snap)) C.restore(_copy(snap));
      return true;
    } catch (e) { _warn(e); return false; }
  }
  // 연쇄를 떠났다(일반 핸드가 시작됨): 조용히 정리. 앱에 남은 연습이 없으므로 _stale도 비운다
  function _leave() {
    _run = null;
    _stale = null;
    _hideToast();
    _releaseCoach();
  }
  // 새로고침, 앱 종료 뒤(window load) 또는 여정 화면(WeeklyView)에서: 진행 중 연쇄가 없는데 남은 고정이 있으면 되돌린다
  function restoreStale() { return _run ? false : _releaseCoach(); }
  function coachLock() { var c = _q().coach; return _isObj(c) ? _copy(c) : null; }
  // 결정 목록에서 한 스트리트의 판정: 결정이 없으면 reached false. 결정 신호등은 light, 없으면 EV 차이(app.js _decLight와 같은 임계)
  function _light(d) {
    if (d && (d.light === 'green' || d.light === 'yellow' || d.light === 'red')) return d.light;
    var delta = _num(d && d.actualEV, 0) - _num(d && d.bestEV, 0);
    return delta >= -0.3 ? 'green' : (delta >= -1.5 ? 'yellow' : 'red');
  }
  // 패턴이 생긴 상황(Coach.PATTERNS spotTest의 콜 금액 조건): 'bet' = 상대 벳 직면(콜 금액 > 0), 'free' = 콜 금액 0.
  // 연습에서 상대 반응이 달라(포스트플랍 빌런은 확률로 벳) 그 스트리트에 이런 결정이 하나도 없으면 같은 실수를 다시 시험한 게 아니다.
  var SPOT_KIND = { call_below_odds: 'bet', fold_above_odds: 'bet', fold_free_check: 'free', bluff_no_reason: 'free' };
  var SPOT_LABEL = { bet: '상대가 벳한 상황', free: '공짜로 체크할 수 있는 상황' };
  function _spotMatch(d, kind) {
    var tc = d ? Number(d.toCall) : NaN;
    if (!kind || d == null || d.toCall == null || !isFinite(tc)) return true;    // 콜 금액을 모르면(예전 기록) 조건 없이
    return kind === 'bet' ? tc > 0 : tc === 0;
  }
  // pattern(선택)이 SPOT_KIND에 있으면 그 상황의 결정이 그 스트리트에 있어야 reached. ok는 그 스트리트 결정 전부가 빨강이 아님
  function judge(decisions, street, pattern) {
    var ds = (Array.isArray(decisions) ? decisions : []).filter(function(d) { return d && d.street === street; });
    if (!ds.length) return { reached: false, ok: false, lights: [] };
    var lights = ds.map(_light);
    var kind = SPOT_KIND[pattern] || null;
    if (kind && !ds.some(function(d) { return _spotMatch(d, kind); })) return { reached: false, ok: false, lights: lights, spot: kind };
    return { reached: true, ok: lights.indexOf('red') < 0, lights: lights };
  }
  // Journey.onHandEnd(ctx.practice)에서 불린다. ctx = { decisions, state{seed}, heroPos, mode, practice }
  function onPracticeHandEnd(ctx, now) {
    if (!_run || !_isObj(ctx) || ctx.practice === false) return null;
    var run = _run, rec = run.list[run.i];
    var st = _isObj(ctx.state) ? ctx.state : {};
    var seed = _seedOf(st.seed != null ? st.seed : ctx.seed);
    var hp = ctx.heroPos != null ? ctx.heroPos : null, md = ctx.mode != null ? ctx.mode : null;
    if (!rec || seed !== rec.seed || (rec.heroPos && hp && hp !== rec.heroPos) || (rec.mode && md && md !== rec.mode)) {
      run.foreign = true;                                    // 다른 연습이 끼어들었다: ▶에서 연쇄를 이어 가지 않는다
      return null;
    }
    var v = judge(ctx.decisions || st.decisions, rec.street, rec.pattern);
    var r = { key: rec.key, street: rec.street, reached: v.reached, ok: v.reached && v.ok, first: !run.judged, i: run.i, total: run.list.length };
    if (v.spot) r.spot = v.spot;                             // 그 스트리트까지 갔지만 같은 상황이 아니었다
    if (!run.judged) {
      run.judged = true;
      run.n++;
      if (r.ok) run.ok++;
      var it = v.reached ? record(rec.key, r.ok, now) : _miss(rec.key, now);
      if (it && v.reached) { r.box = it.box; r.due = it.due; r.graduated = _num(it.box, 0) >= GRAD_BOX; }
      run.results.push({ key: r.key, ok: r.ok, reached: r.reached });
      if (_fn(run.opts, 'onItem')) { try { run.opts.onItem(_copy(r)); } catch (e) { _warn(e); } }
      if (run.opts.toast !== false) _resultToast(r, _now(now));
    }
    return r;
  }
  // 결과바 ▶(App.nextRound 연습 종료, 앱의 연습 상태가 비워진 뒤)에서 불린다. 다음 항목을 열거나 onDone으로 화면을 넘기면 true
  function onPracticeExit() {
    var run = _run;
    if (!run) return false;
    _hideToast();
    if (run.foreign) { _run = null; _releaseCoach(); return false; }
    _stale = null;
    var next = run.i + 1;
    if (next < run.list.length) {
      if (_startAt(next, true)) return true;
      run.failed = true;
    }
    return _finish(false, true);
  }
  // 연쇄 끝: res = { done(끝까지), n, ok, aborted, failed, items }. silent가 아니면 onDone(res)을 부르고 true
  function _finish(silent, viaExit) {
    var run = _run;
    if (!run) return false;
    _run = null;
    _releaseCoach();                                          // onDone(다음 화면, 새 연쇄)보다 먼저 원래 코칭으로
    var res = _result(run, viaExit);
    if (!silent && _fn(run.opts, 'onDone')) {
      try { run.opts.onDone(res); } catch (e) { _warn(e); }
      return true;
    }
    return false;
  }
  function _result(run, viaExit) {
    var done = !!viaExit && !run.failed && run.i >= run.list.length - 1;
    return { done: done, n: run.n, ok: run.ok, aborted: !done && !run.failed, failed: !!run.failed,
      total: run.list.length, items: run.results.slice() };
  }
  // 연쇄를 중간에 정리한다(오늘의 5분 ↩, 뒤로로 여정에 돌아옴). onDone은 부르지 않고 결과를 돌려준다.
  // tag가 있으면 같은 tag의 연쇄만(tag 없는 연쇄, 예: 주간 리포트의 다시 풀기는 건드리지 않는다). 진행 중이던 연습은 앱에 남아
  // 있을 수 있어 _stale로 기억한다.
  function abort(tag) {
    var run = _run;
    if (!run) return null;
    if (tag && tag !== run.tag) return null;
    _run = null;
    _hideToast();
    if (run.launched && !run.foreign) _stale = run.list[run.i];
    _releaseCoach();
    return _result(run, false);
  }
  function status() {
    var run = _run;
    if (!run) return { active: false };
    var rec = run.list[run.i];
    return { active: true, i: run.i, total: run.list.length, n: run.n, ok: run.ok, key: rec ? rec.key : null, tag: run.tag, judged: run.judged };
  }

  // ── 안내 토스트(게임 화면 위쪽, App 토스트와 같은 모양). 게임 화면을 떠나면 바로 숨긴다 ──
  // guard(선택): 늦게 뜨는 안내를 보이기 직전에 다시 확인하는 함수. false면 보이지 않는다
  function _toast(msg, delay, ms, guard) {
    if (_sink) {                      // 테스트 주입: 예약 대신 { msg, delay, ok() } 기록(ok는 보이기 직전 판정)
      try { _sink({ msg: msg, delay: delay || 0, ok: function() { return typeof guard !== 'function' || !!guard(); } }); } catch (e) { /* 무시 */ }
      return true;
    }
    if (typeof document === 'undefined' || !document || !document.body || typeof document.createElement !== 'function') return false;
    var show = function() {
      try {
        if (typeof guard === 'function' && !guard()) return;
        var scr = _screen();
        if (scr !== null && scr !== 'screen-game') return;          // 늦게 뜨는 안내: 이미 게임 화면을 떠났으면 보이지 않는다
        var el = (typeof document.getElementById === 'function') ? document.getElementById('rq-toast') : null;
        if (!el || !el.parentNode) {
          el = document.createElement('div');
          el.id = 'rq-toast';
          el.setAttribute('role', 'status');
          el.setAttribute('aria-live', 'polite');
          el.style.cssText = 'position:fixed;top:14%;left:0;right:0;margin:0 auto;width:max-content;max-width:calc(100vw - 32px);' +
            'box-sizing:border-box;background:rgba(20,20,30,0.95);color:#e3b341;border:1px solid #e3b341;border-radius:6px;' +
            'padding:8px 14px;z-index:501;font-size:0.9rem;line-height:1.4;text-align:center;word-break:keep-all;pointer-events:none';
          document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.display = 'block';
        if (typeof clearTimeout === 'function' && _toastTimer) clearTimeout(_toastTimer);
        if (typeof setTimeout === 'function') _toastTimer = setTimeout(function() { _toastTimer = null; el.style.display = 'none'; }, ms || 2600);
      } catch (e) { /* 표시 실패는 무시 */ }
    };
    if (delay > 0 && typeof setTimeout === 'function') setTimeout(show, delay); else show();
    return true;
  }
  function _hideToast() {
    try {
      if (typeof clearTimeout === 'function' && _toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
      var el = (typeof document !== 'undefined' && document && typeof document.getElementById === 'function') ? document.getElementById('rq-toast') : null;
      if (el && el.style) el.style.display = 'none';
    } catch (e) { /* 무시 */ }
  }
  function hintText(rec, i, total) {
    var st = STREET_KO[rec.street] || '그 스트리트';
    var pd = _pattern(rec.pattern);
    return '🔁 실수 핸드 다시 풀기 ' + (i + 1) + '/' + total + ', 지난번 ' + st + ' 실수' + (pd ? ': "' + pd.label + '"' : '') +
      '. 이번엔 다르게 쳐 봐요';
  }
  function resultText(r, now) {
    var st = STREET_KO[r.street] || '그 스트리트';
    if (!r.reached && SPOT_LABEL[r.spot]) return 'ℹ 이번엔 ' + st + '에서 ' + SPOT_LABEL[r.spot] + '이 나오지 않았어요. 다음 복습에 다시 나와요';
    if (!r.reached) return 'ℹ 이번엔 ' + st + '까지 가지 않았어요. 다음 복습에 다시 나와요';
    if (!r.ok) return 'ℹ ' + st + ' 결정이 아직 빨강이에요. 내일 다시 나와요';
    if (r.graduated) return '✅ ' + st + ' 결정을 바로잡았어요. 이 핸드는 졸업!';
    // 기한은 로컬 날짜의 0시라(_dueAt) 날짜 차이로 센다. 21:30에 풀면 3일 뒤 0시까지 2.1일이어도 '3일 뒤'
    var d = (r.due != null) ? Math.max(1, Math.round((_dueAt(r.due, 0) - _dueAt(_now(now), 0)) / DAY)) : null;
    return '✅ ' + st + ' 결정을 바로잡았어요' + (d ? '. 다음 복습은 ' + d + '일 뒤' : '');
  }
  // App.startPractice 토스트(2.2초)가 끝난 뒤에 보인다. 그 사이 핸드가 끝나 판정이 났거나(빠른 폴드) 연쇄가 바뀌었으면
  // 보이지 않는다(결과 토스트 '바로잡았어요'를 시작 안내가 덮지 않게)
  function _hint(rec, i, total) {
    var run = _run;
    _toast(hintText(rec, i, total), 2300, 3200, function() { return !!run && _run === run && run.i === i && !run.judged; });
  }
  function _resultToast(r, now) { _toast(resultText(r, now), 0, 2800); }

  // ── 테스트 주입 ──
  function _setScreenProbe(fn) { _probe = (typeof fn === 'function') ? fn : null; }
  function _setToastSink(fn) { _sink = (typeof fn === 'function') ? fn : null; }
  // 테스트 정리: 남은 코칭 고정이 있으면 먼저 되돌린다(같은 vm의 실제 CoachUI가 다음 테스트에 L1로 남지 않게)
  function _reset() {
    _run = null;
    try { _releaseCoach(); } catch (e) { /* 무시 */ }
    _stale = null; _mem = null; _probe = null; _sink = null;
  }

  // 새로고침 뒤: 다른 load 처리(Boss.restoreStale 등)가 끝난 다음 차례에 남은 고정을 되돌린다(H10)
  if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
    window.addEventListener('load', function() {
      var go = function() { try { restoreStale(); } catch (e) { _warn(e); } };
      if (typeof setTimeout === 'function') setTimeout(go, 0); else go();
    });
  }

  var api = {
    INTERVALS: INTERVALS.slice(), MISS_DAYS: MISS_DAYS.slice(), GRAD_BOX: GRAD_BOX, CAP: CAP, PRACTICE_MAX: PRACTICE_MAX, STREET_KO: STREET_KO, CONCEPT_LABEL: CONCEPT_LABEL,
    LOCK_LEVEL: LOCK_LEVEL,
    key: key, parseKey: parseKey, add: add, record: record, get: get, count: count, due: due, items: items, patternItems: patternItems,
    practice: practice, onPracticeHandEnd: onPracticeHandEnd, onPracticeExit: onPracticeExit, abort: abort, status: status, judge: judge,
    weekly: weekly, lastWeekSpan: lastWeekSpan, markReportView: markReportView, reportWeeks: reportWeeks, weekKey: weekKey, lossLabel: lossLabel,
    hintText: hintText, resultText: resultText, restoreStale: restoreStale, releaseCoach: restoreStale, coachLock: coachLock,
    _setScreenProbe: _setScreenProbe, _setToastSink: _setToastSink, _reset: _reset
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
