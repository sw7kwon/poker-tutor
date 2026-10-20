// journey/seasons.js (채우는 그룹: M6-SEASON, 계약 H5, 설계서 3.4절 2, 3번, 4.3절, 4.8절 2, 4번, 6.1절)
// 주간 챌린지(월요일 00:00 초기화)와 월간 시즌(1일 00:00 초기화). 고정 데이터가 아니라 날짜 함수라 몇 년 뒤에도 공백이 없다.
//
// 날짜 키(로컬 시각 기준)
//   isoWeek(날짜|키) = 'YYYY-Www'(JStats.weekKey와 같은 ISO 8601 주, 월요일 시작), monthKey(날짜|키) = 'YYYY-MM'.
//   날짜 입력은 Date, ms, 'YYYY-MM-DD', ISO 문자열, 주 키, 월 키 모두 받는다. weekSpan(키), monthSpan(키) = { start, end }(ms, end 미포함).
//
// weekly(날짜|키, opts?) → { key, week, level, theme, icon, title, desc, conds[3], xp, from, to }(순수, 같은 입력이면 같은 결과)
//   테마 유형 6종(THEMES) x 임계 상승형. 테마는 절대 주 번호로 돌린다: 6주 묶음마다 6종이 한 번씩, 묶음 순서는 묶음 번호 시드로
//   섞고, 묶음 경계에서도 같은 테마가 두 주 연속 나오지 않는다.
//   week(주차) = opts.since(기본 EPOCH_WEEK)의 주부터 몇 번째 주인지(0부터). level = min(week, 10). 임계는 level로 오른다.
//   opts.start(ms)가 그 주 안이면 활동일 조건은 남은 날 수(그날 포함)를 넘지 않는다(sync가 처음 여는 주와 달에 넣는다. 시즌도 같다).
//   예: 블라인드 방어 주 조건 3 = 블라인드 방어 판단 🟢 비율 n% 이상, n = 70 + 2 x level(70 → 90).
//   조건 3개는 쉬운 것부터: 1 활동(활동일 또는 레이팅 퍼즐 수), 2 테마 판단 횟수, 3 테마 판단의 🟢 비율(기회가 조건 2의 횟수 이상일 때만 판정).
//   판단은 JStats 기록 중 exact/chart 소스만 센다: 게임 결정은 source 'chart'(프리플랍 차트)와 'potodds'(벳 직면 팟 오즈)만
//   (결정 사항 2, 보스 조건과 같은 목록), 퍼즐은 레이팅에 들어간 문항(Puzzles.isRated: exact/chart, 앱 정의와 approx 제외)만.
// season(날짜|'YYYY-MM', opts?) → { key, month, theme, icon, title, desc, tip, change, cast, focus, quests[3], xp, from, to }(순수)
//   cast = { 엔진 유형: { 프로필 필드: δ } }(|δ| ≤ 0.1, 0 아님). 필드는 ai/villain.js가 실제로 읽는 숫자 필드 bluff_freq, fold_to_cbet만.
//   유형은 TAG, LAG, Fish, Nit, Station(Mixed는 거리마다 다른 유형의 사본을 쓰므로 직접 바꾸지 않는다). 8가지 변형을 달마다 차례로
//   돌리고(이웃한 달은 유형이 다르다), 크기는 0.06~0.10. 2026-11은 '불도저(LAG) 블러프 빈도 +0.1'(설계서 3.4절 3번 예).
//   적용(오버레이)은 VillainAdaptive(H6, READ) 몫이고 극장 관전에는 쓰지 않는다. 퀘스트 3개도 쉬운 것부터(활동일, 초점 판단 횟수,
//   초점 판단 🟢 비율). 초점(focus)은 블러프 빈도 변형이면 'potodds'(벳 직면), 폴드 빈도 변형이면 'chart'(프리플랍 차트).
// collect(span, now) → 기간 집계(JStats 읽기만): { days, rated, puzzles, src:{ chart:{n,g}, potodds:{n,g} }, c:{ 개념:{n,g} } }
//   days, rated, src는 일별 집계(now가 든 날까지 전부), 개념별 c는 최근 결정 링(JStats.recent, now 시각까지, 소스 chart/potodds이고
//   그 개념의 판정 소스와 같을 때만. 링은 최근 300결정이라 한 주에 그보다 많이 치면 앞쪽이 빠진다)이다.
// progress(def, data) → { items[3], count, done, frac[3] }(순수, 입력을 바꾸지 않음)
//   item = { kind, ok, have, need, frac(0~1), short, text, value, n?, g?, pct?, judged? }.
// sync(now) → { weekly, season }(각 { key, def, pr, state, items, done, justDone, xp, prev })
//   여정 상태(Journey.load()) poker_journey.weekly와 season을 갱신한다. 모양은 설계서 6.1절 + doneAt + hist[{ key, done, n }](최근 12)
//   + seen(소개를 본 주/달 키) + params.start(이 기기에서 처음 연 주/달만, 그 시각 ms). progress[i]는 그 칸의 진행(0~1)이고 기간 안에서 줄지 않는다(한 번 채운 칸은 그 주 동안 ✓).
//   칸이 모두 1이 되면 done, doneAt, hist에 기록하고 Journey.addXp('weekly'|'season')를 한 번만 부른다(XP 60, 50).
//   주나 달이 바뀌면 지난 기간을 그 기간 전체 집계로 한 번 더 판정하고(미처 sync하지 못한 완료도 XP 1번), hist에 남긴 뒤 새로 연다.
// view(state, now): sync와 같은 결과를 계산만 한다(상태를 쓰지 않고 XP도 주지 않음).
// homeCard(state, now) → { html, emph } (계약 H11 a): 이번 주 챌린지 3칸과 이번 달 시즌 요약(펼치면 퀘스트 3칸).
//   state가 실제 여정 상태(Journey.load())면 먼저 sync(now)하고, 아니면 view만 한다. emph = 월요일에 이번 주 소개를 아직 안 봤거나
//   1일에 이번 달 시즌을 아직 안 봤을 때. 카드의 '확인했어요'는 ack(now)(seen 기록 뒤 홈 다시 그리기).
// 규약: 로드 시 DOM, 저장소, 타이머 접근 없음. Journey, JStats, CAST, VillainProfiles, JOURNEY_XP, JourneyUI는 typeof 가드.
// 문구 규칙: 가운뎃점과 긴줄표 대신 쉼표, 초보 눈높이, 처방은 '(참고)'.
var Seasons = (function() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : this);
  var DAY = 86400000;
  var EPOCH_WEEK = '2026-W43';    // since 기본값(주차 0): 시즌 도입 주
  var EPOCH_MONTH = '2026-10';
  var LEVEL_CAP = 10;             // 주간 임계 상승 상한(주차 10)
  var MONTH_CAP = 5;              // 시즌 임계 상승 상한(5개월)
  var HIST_MAX = 12;
  var SRC_OK = { chart: 1, potodds: 1 };   // exact/chart 소스
  // 개념별 판정 소스(engine/coach.js verdict): 프리플랍 차트 개념은 chart, 벳 직면은 potodds
  var CONCEPT_SRC = { rfi: 'chart', vs_rfi: 'chart', blind_defense: 'chart', vs_3bet: 'chart', pot_odds: 'potodds', draws: 'potodds' };
  var XP_DEFAULT = { weekly: 60, season: 50 };

  // ── 주간 테마 6종(임계 상승형 파라미터) ──
  // c1 = 활동 조건('days': 활동일 base + floor(L / 5), 'rated': 레이팅 퍼즐 base + L)
  // vol = [기본, 주차당] 테마 판단 횟수 = 기본 + floor(주차당 x L), rate = [기본 %, 주차당 %p] 🟢 비율 = 기본 + 주차당 x L
  // src = 'concept:키'(링, 소스 일치) | 'src:chart' | 'src:potodds' | 'src:exact'(chart + potodds, 일별 집계)
  var THEMES = [
    { id: 'open', icon: '🚪', title: '오픈 주', what: '오픈 판단', src: 'concept:rfi', c1: ['days', 3], vol: [8, 0.5], rate: [70, 2],
      desc: '앞에서 아무도 레이즈하지 않았을 때(모두 폴드했거나 림프만 했을 때) 레이즈로 먼저 들어갈지(오픈) 정하는 판단을 모아요. 게임의 차트 판정(이 앱 차트 기준)으로 세요.' },
    { id: 'bbdefense', icon: '🛡', title: '블라인드 방어 주', what: '블라인드 방어 판단', src: 'concept:blind_defense', c1: ['rated', 10], vol: [5, 0.5], rate: [70, 2],
      desc: '스몰, 빅 블라인드에서 앞사람 오픈을 맞았을 때 콜, 3벳, 폴드를 고르는 판단이에요. 게임의 차트 판정(이 앱 차트 기준)으로 세요.' },
    { id: 'vsopen', icon: '🎯', title: '오픈 대응 주', what: '오픈 대응 판단', src: 'concept:vs_rfi', c1: ['days', 3], vol: [5, 0.5], rate: [70, 2],
      desc: '블라인드가 아닌 자리에서 앞사람 오픈을 맞았을 때 콜, 3벳, 폴드를 고르는 판단이에요. 게임의 차트 판정(이 앱 차트 기준)으로 세요.' },
    { id: 'potodds', icon: '🧮', title: '팟 오즈 주', what: '벳 직면 판단', src: 'src:potodds', c1: ['rated', 10], vol: [6, 0.5], rate: [65, 2],
      desc: '상대 벳을 맞았을 때 필요 승률(팟 오즈)과 내 승률을 비교해 콜, 폴드를 정하는 판단이에요. 게임의 팟 오즈 판정으로 세요.' },
    { id: 'chart', icon: '📋', title: '프리플랍 차트 주', what: '프리플랍 차트 판단', src: 'src:chart', c1: ['days', 3], vol: [15, 1], rate: [70, 2],
      desc: '오픈, 오픈 대응, 블라인드 방어, 3벳 대응까지 프리플랍 차트 판단을 모두 모아요(이 앱 차트 기준).' },
    { id: 'steady', icon: '🧩', title: '꾸준함 주', what: '차트와 팟 오즈 판단', src: 'src:exact', c1: ['days', 4], vol: [15, 2], rate: [65, 2], volKind: 'rated',
      desc: '자주, 조금씩. 레이팅 퍼즐을 풀고 게임의 차트와 팟 오즈 판단을 고르게 쌓는 주예요.' }
  ];
  var THEME_BY_ID = {};
  THEMES.forEach(function(t, i) { THEME_BY_ID[t.id] = i; });

  // ── 월간 시즌 변형 8종(달마다 차례로, 이웃한 달은 유형이 다르다). sign x 크기 = δ ──
  var CAST_FALLBACK = { TAG: { name: '교수', icon: '🎓' }, LAG: { name: '불도저', icon: '🚜' }, Fish: { name: '햇살', icon: '🌞' },
    Nit: { name: '바위', icon: '🗿' }, Station: { name: '콜마스터', icon: '📞' } };
  // 자유 게임 6인 테이블(app.js _buildPlayersSpec 'sixmax')에서 그 유형으로 앉는 이름. TAG는 두 자리(Mike, Sarah),
  // Station(콜마스터)은 자유 게임에 없다(미션 캐스트 테이블에만). VillainProfiles.name_default('Ben' 등)는 실제 좌석과 달라 쓰지 않는다.
  var FREE_NAME = { TAG: 'Mike와 Sarah', LAG: 'Carlos', Fish: 'Jimmy', Nit: 'David' };
  // 엔진 프로필 값(그대로 '접는 확률'이 아니다: villain.js는 손 세기와 벳 크기에 따라 이 값에 배수를 곱한다)이라 '성향'으로 부른다
  var FIELD_LABEL = { bluff_freq: '블러프 성향', fold_to_cbet: '벳에 접는 성향' };
  var SEASONS = [
    { id: 'lag-bluff', type: 'LAG', field: 'bluff_freq', sign: 1, title: '불도저 블러프 시즌' },
    { id: 'nit-sticky', type: 'Nit', field: 'fold_to_cbet', sign: -1, title: '버티는 바위 시즌' },
    { id: 'fish-fold', type: 'Fish', field: 'fold_to_cbet', sign: 1, title: '접을 줄 아는 햇살 시즌' },
    { id: 'tag-bluff', type: 'TAG', field: 'bluff_freq', sign: 1, title: '교수의 반격 시즌' },
    { id: 'station-sticky', type: 'Station', field: 'fold_to_cbet', sign: -1, title: '끝까지 콜마스터 시즌' },
    { id: 'lag-fold', type: 'LAG', field: 'fold_to_cbet', sign: 1, title: '신중해진 불도저 시즌' },
    { id: 'nit-bluff', type: 'Nit', field: 'bluff_freq', sign: 1, title: '바위의 깜짝 블러프 시즌' },
    { id: 'tag-sticky', type: 'TAG', field: 'fold_to_cbet', sign: -1, title: '물러서지 않는 교수 시즌' }
  ];
  var MAGS = [0.10, 0.08, 0.06, 0.09, 0.07];   // 달마다 크기(8과 5가 서로소라 40개월 주기)
  var MONTH0 = 2026 * 12 + 10;                 // 2026-11 = SEASONS[0], MAGS[0]

  // ── 유틸 ──
  function _2(n) { return (n < 10 ? '0' : '') + n; }
  function _m(name) { var o = G[name]; return (o && (typeof o === 'object' || typeof o === 'function')) ? o : null; }
  function _fn(o, k) { return !!o && typeof o[k] === 'function'; }
  function _isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function _num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function _mod(a, n) { return ((a % n) + n) % n; }
  function _r2(x) { return Math.round(x * 100) / 100; }
  function _warn(e) { try { if (typeof console !== 'undefined' && console.warn) console.warn('[Seasons]', (e && e.message) || e); } catch (x) { /* noop */ } }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  var WEEK_RE = /^(\d{4})-W(\d{2})$/, MONTH_RE = /^(\d{4})-(\d{2})$/, DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  // 입력 → 로컬 Date(잘못된 값은 지금)
  function _date(x) {
    var d = null;
    if (x instanceof Date) d = x;
    else if (typeof x === 'number' && isFinite(x)) d = new Date(x);
    else if (typeof x === 'string') {
      var m = DAY_RE.exec(x);
      if (m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
      else { var t = Date.parse(x); if (isFinite(t)) d = new Date(t); }
    }
    return (d && !isNaN(d.getTime())) ? d : new Date();
  }
  function _ms(x) { return (typeof x === 'number' && isFinite(x)) ? x : _date(x).getTime(); }
  // UTC 날짜 일 번호(서머타임 무관)
  function _dayIdx(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / DAY); }
  function _ymdOfIdx(i) { var t = new Date(i * DAY); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; }
  function _ymdKey(p) { return p[0] + '-' + _2(p[1]) + '-' + _2(p[2]); }
  function _localIdx(t) { var d = new Date(t); return _dayIdx(d.getFullYear(), d.getMonth() + 1, d.getDate()); }

  // ISO 주의 월요일 일 번호(키가 아니면 null)
  function _mondayIdx(key) {
    var m = WEEK_RE.exec(String(key));
    if (!m) return null;
    var y = Number(m[1]), w = Number(m[2]);
    var jan4 = Date.UTC(y, 0, 4), dow = new Date(jan4).getUTCDay() || 7;
    return Math.round(jan4 / DAY) - (dow - 1) + (w - 1) * 7;
  }
  function _weekKeyOfIdx(i) {
    var p = _ymdOfIdx(i);
    var t = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    var dow = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dow);
    var y = t.getUTCFullYear();
    var wk = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / DAY + 1) / 7);
    return y + '-W' + _2(wk);
  }
  // 'YYYY-Www'(JStats.weekKey와 같은 형식). 주 키는 정규형(53주가 없는 해의 W53 같은 값은 실제 주로)으로, 월 키는 그 달 1일의 주
  function isoWeek(x) {
    if (typeof x === 'string') {
      var mi = _mondayIdx(x);
      if (mi !== null) return _weekKeyOfIdx(mi);
      var mm = MONTH_RE.exec(x);
      if (mm) return _weekKeyOfIdx(_dayIdx(Number(mm[1]), Number(mm[2]), 1));
    }
    var d = _date(x);
    return _weekKeyOfIdx(_dayIdx(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  }
  function monthKey(x) {
    if (typeof x === 'string') {
      var m = MONTH_RE.exec(x);
      if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return x;
      var mi = _mondayIdx(x);
      if (mi !== null) { var p = _ymdOfIdx(mi); return p[0] + '-' + _2(p[1]); }
    }
    var d = _date(x);
    return d.getFullYear() + '-' + _2(d.getMonth() + 1);
  }
  // 로컬 월요일 00:00 ~ 다음 월요일 00:00
  function weekSpan(x) {
    var key = isoWeek(x), mi = _mondayIdx(key), a = _ymdOfIdx(mi), b = _ymdOfIdx(mi + 7), e = _ymdOfIdx(mi + 6);
    return { key: key, start: new Date(a[0], a[1] - 1, a[2]).getTime(), end: new Date(b[0], b[1] - 1, b[2]).getTime(),
      from: _ymdKey(a), to: _ymdKey(e) };
  }
  function monthSpan(x) {
    var key = monthKey(x), m = MONTH_RE.exec(key), y = Number(m[1]), mo = Number(m[2]);
    var last = new Date(y, mo, 0).getDate();
    return { key: key, start: new Date(y, mo - 1, 1).getTime(), end: new Date(y, mo, 1).getTime(),
      from: key + '-01', to: key + '-' + _2(last), days: last };
  }
  // 절대 주 번호(1970-01-05 월요일 = 0), 절대 월 번호
  function _weekNo(key) { return Math.round((_mondayIdx(key) - 4) / 7); }
  function _monthNo(key) { var m = MONTH_RE.exec(key); return Number(m[1]) * 12 + Number(m[2]) - 1; }

  // mulberry32 + FNV-1a(의존 없이 자체 사본)
  function _hash(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
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
  // 6주 묶음 c의 테마 순서(묶음 번호 시드 셔플)
  function _perm(c) {
    var a = [0, 1, 2, 3, 4, 5], r = _rng(_hash('season-week-' + c));
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  // 절대 주 번호 → 테마 번호. 묶음 첫 주가 앞 묶음 마지막 주와 같으면 첫 두 주를 바꾼다(마지막 칸은 바꾸지 않으므로 앞 묶음 값이 고정)
  function themeIndex(A) {
    var c = Math.floor(A / 6), pos = A - c * 6, p = _perm(c);
    if (p[0] === _perm(c - 1)[5]) { var t = p[0]; p[0] = p[1]; p[1] = t; }
    return p[pos];
  }
  function _sinceWeek(opts) { return (opts && opts.since != null) ? isoWeek(opts.since) : EPOCH_WEEK; }
  function _sinceMonth(opts) { return (opts && opts.since != null) ? monthKey(opts.since) : EPOCH_MONTH; }
  // opts.start(ms, 처음 챌린지를 연 시각)가 기간 중간이면 활동일 조건은 남은 날 수(그날 포함)를 넘지 않는다(첫 기간도 채울 수 있게)
  function _capDays(need, opts, sp) {
    var t = opts && opts.start;
    if (typeof t !== 'number' || !isFinite(t) || !(t > sp.start && t < sp.end)) return need;
    return Math.max(1, Math.min(need, _localIdx(sp.end - 1) - _localIdx(t) + 1));
  }
  function _xp(kind) { var X = _m('JOURNEY_XP'); return (X && isFinite(X[kind])) ? Number(X[kind]) : XP_DEFAULT[kind]; }

  // ── 조건 만들기 ──
  function _cDays(need, scope) {
    return { kind: 'days', need: need, short: '활동 ' + need + '일', text: (scope === 'month' ? '이번 달 ' : '이번 주 ') + need + '일 이상 활동하기(블록, 퍼즐, 게임 무엇이든)' };
  }
  function _cRated(need) {
    return { kind: 'rated', need: need, short: '레이팅 퍼즐 ' + need + '문제', text: '레이팅에 들어가는 퍼즐(데일리 5, 드릴 세트) ' + need + '문제 풀기' };
  }
  function _cCount(src, what, need) {
    return { kind: 'count', src: src, need: need, short: what + ' ' + need + '번', text: '게임에서 ' + what + ' ' + need + '번 하기' };
  }
  function _cRate(src, what, need, minOpp) {
    return { kind: 'rate', src: src, need: need, minOpp: minOpp, short: '🟢 ' + need + '% 이상',
      text: what + '의 🟢(정답) 비율 ' + need + '% 이상(판단 ' + minOpp + '번이 쌓이면 판정)' };
  }

  // 주간 챌린지(순수)
  function weekly(x, opts) {
    var key = isoWeek(x), sp = weekSpan(key);
    var since = _sinceWeek(opts);
    var week = Math.max(0, _weekNo(key) - _weekNo(since));
    var L = Math.min(week, LEVEL_CAP);
    var ti = themeIndex(_weekNo(key)), T = THEMES[ti];
    var c1 = T.c1[0] === 'days' ? _cDays(_capDays(T.c1[1] + Math.floor(L / 5), opts, sp), 'week') : _cRated(T.c1[1] + L);
    var vol = T.vol[0] + Math.floor(T.vol[1] * L);
    var c2 = T.volKind === 'rated' ? _cRated(vol) : _cCount(T.src, T.what, vol);
    var minOpp = T.volKind === 'rated' ? 10 + L : vol;
    var c3 = _cRate(T.src, T.what, T.rate[0] + T.rate[1] * L, minOpp);
    return { key: key, week: week, level: L, since: since, theme: T.id, icon: T.icon, title: T.title, what: T.what, desc: T.desc,
      conds: [c1, c2, c3], xp: _xp('weekly'), from: sp.from, to: sp.to };
  }

  // ── 월간 시즌(순수) ──
  function _castInfo(type) {
    var C = _m('CAST'), out = { name: CAST_FALLBACK[type].name, icon: CAST_FALLBACK[type].icon };
    if (Array.isArray(C)) {
      for (var i = 0; i < C.length; i++) if (C[i] && C[i].type === type) { out.name = C[i].name || C[i].key || out.name; out.icon = C[i].icon || out.icon; break; }
    }
    return out;
  }
  function _freeName(type) { return FREE_NAME[type] || ''; }
  function _baseVal(type, field) {
    var P = _m('VillainProfiles');
    var v = P && P[type] ? Number(P[type][field]) : NaN;
    return isFinite(v) ? v : null;
  }
  function _pct(v) { return Math.round(v * 100) + '%'; }
  // 받침이 있으면 '이', 없으면 '가'(한글이 아니면 '이(가)')
  function _iga(word) {
    var c = String(word || '').charCodeAt(String(word || '').length - 1) - 0xAC00;
    if (!(c >= 0 && c <= 11171)) return '이(가)';
    return (c % 28) ? '이' : '가';
  }
  function season(x, opts) {
    var key = monthKey(x), sp = monthSpan(key);
    var since = _sinceMonth(opts);
    var month = Math.max(0, _monthNo(key) - _monthNo(since));
    var L = Math.min(month, MONTH_CAP);
    var off = _monthNo(key) - MONTH0;
    var S = SEASONS[_mod(off, SEASONS.length)];
    var delta = _r2(S.sign * MAGS[_mod(off, MAGS.length)]);
    var cast = {};
    cast[S.type] = {};
    cast[S.type][S.field] = delta;
    var ci = _castInfo(S.type), free = _freeName(S.type), base = _baseVal(S.type, S.field);
    var who = ci.name + '(' + S.type + (free ? ', 자유 게임에서는 ' + free : '') + ')' + _iga(ci.name);
    var nums = base !== null ? '(' + FIELD_LABEL[S.field] + ' ' + _pct(base) + ' → ' + _pct(Math.max(0, Math.min(1, base + delta))) + ')' : '';
    var desc, tip, focus;
    if (S.field === 'bluff_freq') {
      focus = 'potodds';
      desc = who + ' 이번 달엔 에어나 약한 페어로 벳하는 블러프가 늘어요' + nums + '. 벳을 맞았을 때 강한 손으로 레이즈하는 일도 조금 늘어요.';
      tip = '블러프가 늘어난 상대의 벳은 필요 승률(팟 오즈)과 내 승률을 비교해 콜을 따져 봐요(참고).';
    } else if (delta < 0) {
      focus = 'chart';
      desc = who + ' 이번 달엔 벳을 맞아도 약한 손을 덜 접어요' + nums + '.';
      tip = '잘 안 접는 상대에게는 블러프를 줄이고 좋은 손으로 밸류벳을 하는 게 기본이에요(참고). 좋은 손으로 들어가는 프리플랍 차트부터 지켜요.';
    } else {
      focus = 'chart';
      desc = who + ' 이번 달엔 벳을 맞으면 약한 손을 더 자주 접어요' + nums + '.';
      tip = '잘 접는 상대에게는 작은 벳도 자주 통해요(참고). 그 전에 프리플랍 차트대로 좋은 자리에서 들어가요.';
    }
    var what = focus === 'potodds' ? '벳 직면 판단' : '프리플랍 차트 판단';
    var vol = focus === 'potodds' ? 20 + 2 * L : 40 + 4 * L;
    var quests = [
      _cDays(_capDays(8 + L, opts, sp), 'month'),
      _cCount('src:' + focus, what, vol),
      _cRate('src:' + focus, what, (focus === 'potodds' ? 65 : 70) + 2 * L, vol)
    ];
    return { key: key, month: month, level: L, since: since, theme: S.id, icon: ci.icon, title: S.title, desc: desc, tip: tip,
      change: { type: S.type, field: S.field, delta: delta, cast: ci.name, base: base },
      cast: cast, focus: focus, quests: quests, xp: _xp('season'), from: sp.from, to: sp.to };
  }

  // ── 집계(JStats 읽기만) ──
  function _empty() { return { days: 0, rated: 0, puzzles: 0, src: { chart: { n: 0, g: 0 }, potodds: { n: 0, g: 0 } }, c: {} }; }
  function _add(b, x) { if (x) { b.n += _num(x.n, 0); b.g += _num(x.g, 0); } }
  function _active(r) {
    if (!r) return false;
    return _num(r.xp, 0) > 0 || _num(r.minutes, 0) > 0 || !!(r.dec && _num(r.dec.n, 0) > 0) || !!(r.puzzle && _num(r.puzzle.n, 0) > 0) ||
      !!(r.hero && _num(r.hero.hands, 0) > 0) || !!(r.theater && _num(r.theater.ep, 0) > 0);
  }
  // span = { start, end }(ms). now가 기간 안이면 now까지, 지난 기간이면 끝까지
  function collect(span, now) {
    var out = _empty(), J = _m('JStats');
    if (!span || !J || !_fn(J, 'range')) return out;
    var last = Math.min(span.end - 1, (typeof now === 'number' && isFinite(now)) ? now : span.end - 1);
    if (!(last >= span.start)) return out;
    var nDays = _localIdx(last) - _localIdx(span.start) + 1;
    var recs = [];
    try { recs = J.range(nDays, last) || []; } catch (e) { _warn(e); recs = []; }
    recs.forEach(function(r) {
      if (!_isObj(r)) return;
      if (_active(r)) out.days++;
      if (r.puzzle) { out.rated += _num(r.puzzle.rated, 0); out.puzzles += _num(r.puzzle.n, 0); }
      var by = r.dec && r.dec.bySrc;
      if (by) { _add(out.src.chart, by.chart); _add(out.src.potodds, by.potodds); }
    });
    if (_fn(J, 'recent')) {
      var ring = [];
      try { ring = J.recent({ since: span.start }) || []; } catch (e) { _warn(e); ring = []; }
      ring.forEach(function(e) {
        if (!e || !(e.t >= span.start && e.t < span.end && e.t <= last) || e.hu || !SRC_OK[e.source]) return;
        if (!e.concept || CONCEPT_SRC[e.concept] !== e.source) return;
        var b = out.c[e.concept] || (out.c[e.concept] = { n: 0, g: 0 });
        b.n++;
        if (e.light === 'green') b.g++;
      });
    }
    return out;
  }

  // ── 진행(순수) ──
  function _bucket(data, src) {
    var p = String(src || '').split(':'), z = { n: 0, g: 0 };
    if (p[0] === 'concept') { var c = data.c && data.c[p[1]]; return c ? { n: _num(c.n, 0), g: _num(c.g, 0) } : z; }
    var s = data.src || {};
    if (p[1] === 'exact') {
      var a = s.chart || z, b = s.potodds || z;
      return { n: _num(a.n, 0) + _num(b.n, 0), g: _num(a.g, 0) + _num(b.g, 0) };
    }
    var x = s[p[1]];
    return x ? { n: _num(x.n, 0), g: _num(x.g, 0) } : z;
  }
  function _item(c, data) {
    var it = { kind: c.kind, need: c.need, short: c.short, text: c.text, ok: false, have: 0, frac: 0, value: '' };
    if (c.kind === 'rate') {
      var b = _bucket(data, c.src), minOpp = Math.max(1, _num(c.minOpp, 1));
      it.n = b.n; it.g = b.g; it.minOpp = minOpp;
      it.judged = b.n >= minOpp;
      it.pct = b.n ? Math.floor(b.g * 1000 / b.n) / 10 : null;
      it.have = it.pct;
      it.ok = it.judged && b.g * 100 >= c.need * b.n;
      it.frac = it.ok ? 1 : it.judged ? Math.min(0.95, _r2(b.g * 100 / b.n / c.need)) : Math.min(0.5, _r2(0.5 * b.n / minOpp));
      it.value = it.judged ? '지금 ' + Math.floor(b.g * 100 / b.n) + '%(' + b.n + '번)' : '⏳ 판정 전, 판단 ' + b.n + '/' + minOpp + '번';
      return it;
    }
    var have = c.kind === 'days' ? _num(data.days, 0) : c.kind === 'rated' ? _num(data.rated, 0) : _bucket(data, c.src).n;
    it.have = have;
    it.ok = have >= c.need;
    it.frac = it.ok ? 1 : Math.min(0.99, _r2(have / Math.max(1, c.need)));
    it.value = Math.min(have, c.need) + '/' + c.need + (c.kind === 'days' ? '일' : c.kind === 'rated' ? '문제' : '번');
    return it;
  }
  function progress(def, data) {
    data = _isObj(data) ? data : {};
    var list = (def && (def.conds || def.quests)) || [];
    var items = list.map(function(c) { return _item(c, data); });
    var count = items.filter(function(it) { return it.ok; }).length;
    return { items: items, count: count, done: items.length > 0 && count === items.length, frac: items.map(function(it) { return it.frac; }) };
  }

  // ── 상태 동기화 ──
  function _validKey(kind, k) { return typeof k === 'string' && (kind === 'weekly' ? WEEK_RE.test(k) : MONTH_RE.test(k)); }
  function _upsert(hist, e) {
    var out = (Array.isArray(hist) ? hist : []).filter(function(h) { return h && typeof h.key === 'string' && h.key !== e.key; });
    out.push(e);
    out.sort(function(a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; });
    return out.slice(-HIST_MAX);
  }
  function _defOf(kind, key, since, start) {
    var o = { since: since };
    if (typeof start === 'number' && isFinite(start)) o.start = start;
    return kind === 'weekly' ? weekly(key, o) : season(key, o);
  }
  function _spanOf(kind, key) { return kind === 'weekly' ? weekSpan(key) : monthSpan(key); }
  function _sinceOf(st, kind) {
    var c = st && st.createdAt;
    if (c == null || !isFinite(Date.parse(c))) return kind === 'weekly' ? EPOCH_WEEK : EPOCH_MONTH;
    return kind === 'weekly' ? isoWeek(c) : monthKey(c);
  }
  // 저장된 칸 진행(줄지 않음)과 이번 계산을 합친 항목: 한 번 채운 칸은 ✓
  function _merge(prog, pr) {
    var items = pr.items.map(function(it, i) {
      var keep = Array.isArray(prog) ? _num(prog[i], 0) : 0;
      var o = {};
      Object.keys(it).forEach(function(k) { o[k] = it[k]; });
      if (keep >= 1 && !o.ok) { o.ok = true; o.kept = true; o.frac = 1; }
      else o.frac = Math.max(o.frac, Math.min(keep, 0.99));
      return o;
    });
    return items;
  }
  function _award(kind, now) {
    var J = _m('Journey');
    if (!_fn(J, 'addXp')) return 0;
    try { var r = J.addXp(kind, undefined, now); return (r && isFinite(r.granted)) ? Number(r.granted) : _xp(kind); }
    catch (e) { _warn(e); return 0; }
  }
  // write=false면 st[kind]의 사본만 고치고 XP를 주지 않는다(view)
  function _period(kind, st, now, write) {
    var key = kind === 'weekly' ? isoWeek(now) : monthKey(now);
    var cur = _isObj(st[kind]) ? st[kind] : null;
    if (!write && cur) cur = JSON.parse(JSON.stringify(cur));
    var hist = (cur && Array.isArray(cur.hist)) ? cur.hist.filter(function(h) { return h && _validKey(kind, h.key); }) : [];
    var res = { kind: kind, key: key, justDone: false, xp: 0, prev: null };
    var base = _sinceOf(st, kind);
    var first = !cur && !hist.length;      // 이 기기에서 처음 여는 주(달): 시작 시각을 남겨 활동일 조건을 남은 날로 자른다
    if (cur && cur.key !== key) {
      if (_validKey(kind, cur.key) && cur.key < key) {
        var pSince = (cur.params && _validKey(kind, cur.params.since)) ? cur.params.since : base;
        var pDef = _defOf(kind, cur.key, pSince, cur.params && cur.params.start), psp = _spanOf(kind, cur.key);
        var pItems = _merge(cur.progress, progress(pDef, collect(psp, psp.end - 1)));
        var pN = pItems.filter(function(it) { return it.ok; }).length;
        var pDone = cur.done === true || (pItems.length > 0 && pN === pItems.length);
        var pXp = 0;
        if (pDone && cur.done !== true && write) pXp = _award(kind, now);
        hist = _upsert(hist, { key: cur.key, done: pDone, n: pDone ? pItems.length : pN });
        res.prev = { key: cur.key, done: pDone, n: pDone ? pItems.length : pN, xp: pXp, title: pDef.title, icon: pDef.icon, justDone: pDone && cur.done !== true };
      }
      cur = null;
    }
    if (!cur) {
      var d0 = _defOf(kind, key, base);
      cur = { key: key, theme: d0.theme, params: { since: base }, progress: [0, 0, 0], done: false, doneAt: null, hist: hist, seen: null };
      if (first) cur.params.start = now;
    }
    if (!_isObj(cur.params)) cur.params = {};
    if (!_validKey(kind, cur.params.since)) cur.params.since = base;
    if (!Array.isArray(cur.progress)) cur.progress = [0, 0, 0];
    cur.hist = hist;
    var def = _defOf(kind, key, cur.params.since, cur.params.start);
    cur.theme = def.theme;
    cur.params.level = def.level;
    cur.params.needs = (def.conds || def.quests).map(function(c) { return c.need; });
    if (kind === 'weekly') cur.params.week = def.week; else cur.params.month = def.month;
    var pr = progress(def, collect(_spanOf(kind, key), now));
    var items = _merge(cur.progress, pr);
    cur.progress = items.map(function(it) { return it.ok ? 1 : _r2(it.frac); });
    if (cur.done === true) items.forEach(function(it) { if (!it.ok) { it.ok = true; it.kept = true; it.frac = 1; } });
    var allOk = items.length > 0 && items.every(function(it) { return it.ok; });
    if (allOk && cur.done !== true) {
      cur.done = true;
      cur.doneAt = new Date(now).toISOString();
      cur.hist = _upsert(cur.hist, { key: key, done: true, n: items.length });
      res.justDone = true;
      if (write) {
        st[kind] = cur;          // XP 저장(addXp의 save) 전에 완료 표시가 상태에 들어가 있어야 한 번만 준다
        res.xp = _award(kind, now);
      }
    }
    if (write) st[kind] = cur;
    res.def = def; res.pr = pr; res.items = items; res.state = cur;
    res.done = cur.done === true; res.count = items.filter(function(it) { return it.ok; }).length;
    return res;
  }
  function _journeyState() {
    var J = _m('Journey');
    if (!_fn(J, 'load')) return null;
    try { var s = J.load(); return _isObj(s) ? s : null; } catch (e) { _warn(e); return null; }
  }
  function sync(now) {
    now = _ms(now == null ? Date.now() : now);
    var st = _journeyState();
    if (!st) return null;
    var out = { now: now, weekly: _period('weekly', st, now, true), season: _period('season', st, now, true) };
    var J = _m('Journey');
    if (_fn(J, 'save')) { try { J.save(); } catch (e) { _warn(e); } }
    return out;
  }
  function view(state, now) {
    now = _ms(now == null ? Date.now() : now);
    var st = _isObj(state) ? state : {};
    return { now: now, weekly: _period('weekly', st, now, false), season: _period('season', st, now, false) };
  }
  function _isLive(state) {
    var J = _m('Journey');
    if (!_fn(J, 'load') || state == null) return state == null && _fn(J, 'load');
    try { return state === J.load(); } catch (e) { return false; }
  }
  // 소개를 봤다고 기록(seen = 이번 주 키, 이번 달 키). opts.render === false면 홈을 다시 그리지 않는다
  function ack(now, opts) {
    now = _ms(now == null ? Date.now() : now);
    var st = _journeyState();
    if (!st) return false;
    var r = sync(now);
    if (!r) return false;
    st.weekly.seen = r.weekly.key;
    st.season.seen = r.season.key;
    var J = _m('Journey');
    if (_fn(J, 'save')) { try { J.save(); } catch (e) { _warn(e); } }
    if (!(opts && opts.render === false)) {
      var U = _m('JourneyUI');
      if (_fn(U, 'render')) { try { U.render(); } catch (e) { _warn(e); } }
    }
    return true;
  }
  function seenWeek(state, now) {
    var s = _isObj(state) ? state : (_journeyState() || {});
    return !!(_isObj(s.weekly) && s.weekly.seen && s.weekly.seen === isoWeek(now == null ? Date.now() : now));
  }

  // ── 화면 문자열(순수) ──
  // 조건 칸 3개(.j-prog3 / .j-cell, 노드 시트와 같은 모양)
  function condsHTML(items, label) {
    items = Array.isArray(items) ? items : [];
    var n = items.filter(function(it) { return it && it.ok; }).length;
    return '<div class="j-prog3" role="group" aria-label="' + _esc((label || '조건') + ' ' + items.length + '개 중 ' + n + '개 달성') + '">' +
      items.map(function(it) {
        return '<div class="j-cell' + (it.ok ? ' is-ok' : '') + '"><span class="j-cell-n">' + (it.ok ? '✓ ' : '○ ') + _esc(it.short) + '</span>' +
          '<span class="j-cell-v">' + _esc(it.ok ? (it.kept ? '달성' : '달성, ' + it.value) : it.value) + '</span></div>';
      }).join('') + '</div>';
  }
  function _left(now, span) {
    var a = _localIdx(now), b = _localIdx(span.end - 1);
    return Math.max(1, b - a + 1);
  }
  function _monthName(key) { return Number(key.slice(5, 7)) + '월'; }
  function _emph(r, now, state) {
    var d = new Date(now);
    var w = r.weekly && r.weekly.state, s = r.season && r.season.state;
    if (d.getDay() === 1 && !(w && w.seen === r.weekly.key)) return true;
    if (d.getDate() === 1 && !(s && s.seen === r.season.key)) return true;
    return false;
  }
  function cardHTML(r, now, emph) {
    if (!r || !r.weekly || !r.weekly.def) return '';
    now = _ms(now == null ? r.now : now);
    var w = r.weekly, d = w.def, s = r.season;
    var wl = w.done ? '✅ 이번 주 챌린지 완료! XP +' + d.xp + (w.justDone ? ' 받았어요' : '')
      : '세 칸을 모두 채우면 XP +' + d.xp + '. 일요일 밤까지 ' + _left(now, weekSpan(w.key)) + '일 남았어요(오늘 포함).';
    var html = '<div class="j-card j-sz-card' + (emph ? ' is-emph' : '') + '" role="group" aria-label="이번 주 챌린지와 시즌"' +
      (emph ? ' style="border:2px solid var(--gold)"' : '') + '>' +
      '<div class="j-card-t">🏆 이번 주 챌린지: ' + _esc(d.icon + ' ' + d.title) + '</div>' +
      '<div class="j-card-d">' + _esc(wl) + '</div>' +
      '<div style="margin-top:8px">' + condsHTML(w.items, '이번 주 조건') + '</div>';
    if (s && s.def) {
      var sd = s.def;
      // 1일에 새 시즌을 아직 안 봤으면 펼친 채로(강조 이유가 새 시즌일 때 내용이 접혀 있지 않게). 요약 줄 끝 ▾는 펼칠 수 있다는 표시
      var sOpen = emph && new Date(now).getDate() === 1 && !(s.state && s.state.seen === s.key);
      html += '<details class="j-sz-season"' + (sOpen ? ' open' : '') + '><summary class="j-card-d" style="min-height:44px;display:flex;align-items:center;gap:8px;cursor:pointer">' +
        '<span>' + _esc('🗓 ' + _monthName(s.key) + ' 시즌: ' + sd.icon + ' ' + sd.title + ', 퀘스트 ' + s.count + '/' + s.items.length + (s.done ? ' 완료' : '')) + '</span>' +
        '<span aria-hidden="true" style="margin-left:auto">▾</span></summary>' +
        '<div class="j-card-d">' + _esc(sd.desc) + '</div>' +
        '<div class="j-card-d" style="margin-top:4px">' + _esc(sd.tip) + '</div>' +
        '<div style="margin-top:8px">' + condsHTML(s.items, '시즌 퀘스트') + '</div>' +
        '<div class="j-card-d">' + _esc(s.done ? '✅ 시즌 퀘스트 완료! XP +' + sd.xp : '퀘스트 3개를 모두 채우면 XP +' + sd.xp + '. 이번 달 말일까지 ' + _left(now, monthSpan(s.key)) + '일 남았어요.') + '</div>' +
        '</details>';
    }
    if (emph) html += '<div class="j-card-acts"><button type="button" class="j-btn j-primary" onclick="Seasons.ack()">확인했어요</button></div>';
    return html + '</div>';
  }
  function homeCard(state, now) {
    now = _ms(now == null ? Date.now() : now);
    var r = null, live = _isLive(state);
    if (live) r = sync(now);
    if (!r) { live = false; r = view(state, now); }
    if (!r || !r.weekly || !r.weekly.def) return null;
    var emph = _emph(r, now, state);
    // 실제로 XP를 준 sync에서만 알린다(view는 계산만)
    if (live && (r.weekly.justDone || (r.weekly.prev && r.weekly.prev.justDone) || r.season.justDone)) {
      var U = _m('JourneyUI'), msg = r.weekly.justDone ? '🏆 이번 주 챌린지 완료! XP +' + r.weekly.def.xp
        : r.season.justDone ? '🗓 시즌 퀘스트 완료! XP +' + r.season.def.xp : '🏆 지난주 챌린지 완료! XP +' + r.weekly.def.xp;
      if (_fn(U, 'toast')) { try { U.toast(msg, 3000); } catch (e) { _warn(e); } }
    }
    return { html: cardHTML(r, now, emph), emph: emph };
  }

  var api = {
    EPOCH_WEEK: EPOCH_WEEK, EPOCH_MONTH: EPOCH_MONTH, LEVEL_CAP: LEVEL_CAP, MONTH_CAP: MONTH_CAP, HIST_MAX: HIST_MAX,
    THEMES: THEMES, SEASONS: SEASONS, CONCEPT_SRC: CONCEPT_SRC,
    isoWeek: isoWeek, monthKey: monthKey, weekSpan: weekSpan, monthSpan: monthSpan, themeIndex: themeIndex,
    weekly: weekly, season: season, collect: collect, progress: progress,
    sync: sync, view: view, ack: ack, seenWeek: seenWeek, homeCard: homeCard, cardHTML: cardHTML, condsHTML: condsHTML
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
