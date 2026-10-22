// journey/badges.js (채우는 그룹: M6-COLLECT, 계약 H8. 클라우드 F4가 커리어 배지 3종을 더함)
// 배지 23종(설계서 4.6절 1번 목록 20종 순서 그대로 + 커리어 3종)과 레벨 해금 외형(4.3절). 배지는 조건을 미리 알리지 않는 깜짝 인정형이라
// 화면에는 얻은 배지만 보이고(목록, 홈 카드, 수집), 문구는 한 일을 알려 주는 정보형이다(4.7절 4번, 통제형 문구 없음).
// 무작위 보상은 없다(4.7절 3번): 배지와 외형은 전부 조건 해금이다.
//
// API(계약 H8)
//   BADGES: [{ id, icon, name, text }] 20종
//   evaluate(ctx) → [id] 지금 조건을 채운 배지(순수, BADGES 순, 얻었는지와 무관). ctx 모양은 context() 참고.
//   context(now, state?) → ctx: 전역 모듈(Journey, JStats, CoachUI)에서 모은 평범한 객체(typeof 가드)
//   note(kind, data, now) → 새 배지 [{ id, name, text }]. 이벤트를 badgeMeta에 쌓고 check(now). 새 배지는 바로 토스트(DOM이 있을 때).
//     'puzzle'      PuzzleUI 문항마다(H2) { type, ok, key, answer, overlap?, pick? }
//                   potodds 연속 정답, combos 연속 정답(오답이면 0부터), facingbet-river 콜 정답, rangepaint 겹침 최고
//     'rangePaint'  레인지 색칠 위젯(H1 api.note)이 퍼즐 대신 보낼 때 { overlap } (위 rangepaint와 같은 기록)
//     'varianceCone' 분산 콘 위젯을 열었을 때(H1)
//     'miniPick'    미니시즌이 끝났을 때 { hit }(H7)
//     'identify'    은닉 좌석 유형 맞히기 제출 { node, correct, total }(H9)
//     'backup'      기록 내보내기 성공(ui/backup-ui.js 1곳). 달 키('YYYY-MM')를 모은다
//     'career'      (F4) 커리어 { session: true }(세션 끝), { venue: id }(그 장소에 앉음), { cash: true } | { tourney: { prize } }(입상).
//                   CareerContract 'session:end'와 'tourney:end'도 onHome 때 한 번 구독해 같은 기록을 쌓는다(badgeMeta.career)
//   check(now) → 새 배지 [{ id, name, text }](멱등: 같은 now로 다시 부르면 []). 코칭 L3 유지 시작 시각도 여기서 관찰한다.
//   onHome(now)(H11 c): 외형 적용, check, 아직 알리지 않은 새 배지를 토스트 1번(정보형)
//   homeCard(state, now)(H11 a) → { html } | null: 최근 3일 안에 얻었거나 지금 막 조건을 채운 배지(최대 3개)와 '🗂 수집 열기'
//   list(state) → 얻은 배지 [{ id, icon, name, text, at }](최근 순)
//   looks(state) → 외형 모델 { level, kinds:[{ kind, title, chosen, effective, options:[{ id, name, level, unlocked }] }] }
//   setLook(kind, id) → bool(id = 'auto' | 'default' | 해금된 id), lookClasses(state) → html 클래스 배열, applyLooks(state?)
// 상태(poker_journey): badges[{ id, at }], badgeMeta(이벤트 기록), cosmetic{ tableColor, cardBack, castFrame, cardBorder }
//   badgeMeta = { run: { potodds: { cur, best }, combos: { cur, best } }, river, paint, cone, mini, identify: { correct, total } | null,
//                 backups: ['YYYY-MM'], l3Since: ISO | null, unseen: [id] }
//   cosmetic[kind] = null(자동: 가장 높은 레벨에서 연 것) | 'default'(기본) | 해금 id
// 외형은 html 클래스(cos-table-navy, cos-table-wine, cos-back-diamond, cos-frame-gold, cos-border-film)와 css/collection.css.
// window load에서 applyLooks(저장소 원문을 읽어 Journey 로드를 앞당기지 않는다), 홈을 그릴 때와 setLook 때 다시 적용한다.
// 로드 시 DOM 접근 없음(window.addEventListener만).
var Badges = (function() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : this);
  var DAY = 86400000;
  var KEY = 'poker_journey';
  var RECENT_DAYS = 3;          // 홈 카드에 '새 배지'로 보이는 기간
  var HOME_MAX = 3;
  var BACKUP_MONTHS_MAX = 36;

  // 4.6절 1번 목록 순서. text = 한 일을 그대로 알려 주는 정보형 한 줄(조건은 얻은 뒤에만 보인다)
  var BADGES = [
    { id: 'first-lesson', icon: '📖', name: '첫 레슨', text: '레슨 하나를 끝까지 마쳤어요.' },
    { id: 'streak-7', icon: '🔥', name: '7일 연속', text: '7일을 이어서 배웠어요.' },
    { id: 'first-boss', icon: '🏆', name: '첫 승급', text: '승급 시험을 처음으로 통과했어요.' },
    { id: 'river-catch', icon: '🎣', name: '리버 블러프캐치', text: '리버 벳에 콜이 맞는 블러프캐치 문제를 처음 맞혔어요.' },
    { id: 'potodds-20', icon: '🧮', name: '팟 오즈 20연속', text: '팟 오즈 퍼즐을 20문제 연속으로 맞혔어요.' },
    { id: 'think-10', icon: '🧠', name: '프로처럼 생각', text: '띵킹에서 프로와 같은 판단을 10번 골랐어요.' },
    { id: 'intent-25', icon: '🔮', name: '속마음 읽기', text: '결정적인 순간의 속마음을 25번 맞혔어요.' },
    { id: 'daily5-perfect', icon: '💯', name: '데일리 5 만점', text: '데일리 5에서 100점을 받았어요.' },
    { id: 'theater-10', icon: '🎭', name: '극장 단골', text: '속마음 극장을 10편 봤어요.' },
    { id: 'mini-pick', icon: '🥇', name: '우승 예측', text: '미니시즌 우승자를 시작 전에 맞혔어요.' },
    { id: 'backup-3', icon: '💾', name: '꼼꼼한 백업', text: '서로 다른 세 달에 기록을 백업했어요.' },
    { id: 'comeback', icon: '🌅', name: '다시 시작', text: '일주일 이상 쉰 뒤 다시 돌아왔어요. 습관은 하루로 깨지지 않아요.' },
    { id: 'paint-90', icon: '🎨', name: '레인지 화가', text: '레인지 색칠에서 겹침 90% 이상을 냈어요.' },
    { id: 'combos-50', icon: '🧩', name: '콤보 50', text: '콤보 퍼즐을 50문제 연속으로 맞혔어요.' },
    { id: 'variance-cone', icon: '📈', name: '분산 체험', text: '분산 콘으로 같은 실력도 결과가 얼마나 퍼지는지 봤어요.' },
    { id: 'detective', icon: '🕵', name: '프로필 탐정', text: '숨은 좌석 5곳 중 4곳 이상의 유형을 맞혔어요.' },
    { id: 'weekly-4', icon: '📅', name: '4주 연속 챌린지', text: '주간 챌린지를 4주 연속으로 완료했어요.' },
    { id: 'cards-30', icon: '🎬', name: '명장면 수집가', text: '명장면 카드를 30장 모았어요.' },
    { id: 'l3-30', icon: '🎯', name: '실전 30일', text: '코칭 실전(L3)으로 30일을 이어 왔어요.' },
    { id: 'master', icon: '👑', name: '마스터', text: '마스터 승급 시험(S6)을 통과했어요.' },
    // (F4) 커리어 배지 3종. 기록은 note('career', data)와 커리어 이벤트 버스(session:end, tourney:end)에서 쌓인다
    { id: 'career-first', icon: '🎟', name: '커리어 첫걸음', text: '커리어 세션을 처음 끝까지 마쳤어요.' },
    { id: 'career-cardroom', icon: '🍺', name: '카드룸 입성', text: '커리어에서 뒷마당을 벗어나 카드룸에 처음 앉았어요.' },
    { id: 'career-cash', icon: '🥉', name: '토너먼트 입상', text: '커리어 토너먼트에서 처음으로 상금을 받았어요.' }
  ];
  var _byId = {};
  BADGES.forEach(function(b) { _byId[b.id] = b; });

  var NEED = { streak: 7, potodds: 20, think: 10, intent: 25, theater: 10, backups: 3, comebackGap: 8, paint: 0.9, combos: 50,
    identify: 4, weekly: 4, cards: 30, l3Days: 30 };
  var MASTER_BOSS = 's6-boss';
  var CAREER_HOME = 'backyard';   // (F4) 첫 장소. 이 밖의 장소에 앉으면 '카드룸 입성'
  var CAREER_VENUES_MAX = 20;

  // ── 외형(4.3절, JOURNEY_UNLOCKS) ──
  var LOOK_KINDS = ['tableColor', 'cardBack', 'castFrame', 'cardBorder'];
  var LOOK_PREFIX = { tableColor: 'cos-table-', cardBack: 'cos-back-', castFrame: 'cos-frame-', cardBorder: 'cos-border-' };
  var LOOK_TITLE = { tableColor: '테이블 색', cardBack: '카드 뒷면', castFrame: '캐스트 아이콘 테두리', cardBorder: '명장면 카드 테두리' };
  var LOOK_DEFAULT = { tableColor: '초록(기본)', cardBack: '파란 체크(기본)', castFrame: '테두리 없음(기본)', cardBorder: '기본 테두리' };
  var LOOK_NAME = { 'tableColor:navy': '남색', 'tableColor:wine': '와인색', 'cardBack:diamond': '다이아 무늬', 'castFrame:gold': '금테',
    'cardBorder:film': '필름' };
  var DEFAULT_UNLOCKS = [ { level: 3, kind: 'tableColor', id: 'navy' }, { level: 6, kind: 'cardBack', id: 'diamond' },
    { level: 10, kind: 'castFrame', id: 'gold' }, { level: 15, kind: 'cardBorder', id: 'film' }, { level: 20, kind: 'tableColor', id: 'wine' } ];

  // ── 작은 도구 ──
  function _isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function _n(x, d) { var v = Number(x); return isFinite(v) ? v : (d === undefined ? 0 : d); }
  function _now(now) { return (typeof now === 'number' && isFinite(now)) ? now : Date.now(); }
  function _iso(t) { return new Date(t).toISOString(); }
  function _ms(iso) { var t = (typeof iso === 'number') ? iso : Date.parse(iso); return isFinite(t) ? t : NaN; }
  function _2(n) { return (n < 10 ? '0' : '') + n; }
  function _monthKey(now) { var d = new Date(_now(now)); return d.getFullYear() + '-' + _2(d.getMonth() + 1); }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function _warn(where, e) { try { if (typeof console !== 'undefined' && console.warn) console.warn('[Badges] ' + where, (e && e.message) || e); } catch (x) {} }
  function _m(name) { var o = G[name]; return (o && (typeof o === 'object' || typeof o === 'function')) ? o : null; }
  function _can(mod, fn) { var o = _m(mod); return !!(o && typeof o[fn] === 'function'); }
  function _call(mod, fn) {
    var o = _m(mod);
    if (!o || typeof o[fn] !== 'function') return undefined;
    try { return o[fn].apply(o, Array.prototype.slice.call(arguments, 2)); }
    catch (e) { _warn(mod + '.' + fn, e); return undefined; }
  }
  // 'YYYY-MM-DD' → 일 번호(UTC 자정 기준, 시간대와 무관)
  function _dayIdx(k) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(k));
    return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY) : null;
  }
  // ISO 주 'YYYY-Www' → 주 번호(연속 주는 1 차이). 1월 4일이 든 주가 1주
  function _weekIdx(k) {
    var m = /^(\d{4})-W(\d{2})$/.exec(String(k));
    if (!m) return null;
    var y = +m[1], w = +m[2];
    if (w < 1 || w > 53) return null;
    var jan4 = Date.UTC(y, 0, 4), dow = (new Date(jan4).getUTCDay() + 6) % 7;
    var mon = jan4 / DAY - dow + (w - 1) * 7;          // 그 주 월요일 일 번호(1970-01-05 월요일 = 4)
    return Math.round((mon - 4) / 7);
  }

  // ── 상태 ──
  function _state() {
    var s = _call('Journey', 'load');
    return _isObj(s) ? s : null;
  }
  function _save(st) { if (st && _can('Journey', 'save')) _call('Journey', 'save', st); }
  function _meta(st) {
    if (!_isObj(st.badgeMeta)) st.badgeMeta = {};
    var M = st.badgeMeta;
    if (!_isObj(M.run)) M.run = {};
    ['potodds', 'combos'].forEach(function(k) {
      if (!_isObj(M.run[k])) M.run[k] = { cur: 0, best: 0 };
      M.run[k].cur = Math.max(0, Math.floor(_n(M.run[k].cur))); M.run[k].best = Math.max(M.run[k].cur, Math.floor(_n(M.run[k].best)));
    });
    ['river', 'cone', 'mini'].forEach(function(k) { M[k] = Math.max(0, Math.floor(_n(M[k]))); });
    M.paint = Math.max(0, Math.min(1, _n(M.paint)));
    if (!_isObj(M.identify)) M.identify = null;
    if (!Array.isArray(M.backups)) M.backups = [];
    if (M.l3Since === undefined) M.l3Since = null;
    if (!Array.isArray(M.unseen)) M.unseen = [];
    if (!_isObj(M.career)) M.career = { sessions: 0, venues: [], cashes: 0 };
    M.career.sessions = Math.max(0, Math.floor(_n(M.career.sessions)));
    M.career.cashes = Math.max(0, Math.floor(_n(M.career.cashes)));
    if (!Array.isArray(M.career.venues)) M.career.venues = [];
    return M;
  }
  function _earned(st) {
    var out = {};
    (Array.isArray(st && st.badges) ? st.badges : []).forEach(function(b) { if (_isObj(b) && b.id != null) out[String(b.id)] = b; });
    return out;
  }

  // ── 조건 평가(순수) ──
  function _passedReal(r) { return _isObj(r) && r.status === 'passed' && !r.skipped; }
  function _isBossId(id, bosses) {
    if (Array.isArray(bosses) && bosses.length) return bosses.indexOf(id) >= 0;
    return /-boss$/.test(String(id));
  }
  function _active(d) { return _isObj(d) && (_n(d.xp) > 0 || _n(d.doneBlocks) > 0 || _n(d.minutes) > 0); }
  // 활동일 사이에 쉰 날이 7일 이상(일 번호 차이 8 이상)인 복귀가 한 번이라도 있었나
  function _comeback(daily) {
    if (!_isObj(daily)) return false;
    var idx = Object.keys(daily).filter(function(k) { return _active(daily[k]); }).map(_dayIdx)
      .filter(function(i) { return i !== null; }).sort(function(a, b) { return a - b; });
    for (var i = 1; i < idx.length; i++) if (idx[i] - idx[i - 1] >= NEED.comebackGap) return true;
    return false;
  }
  // 완료한 ISO 주 중 가장 긴 연속 주 수(weekly.hist[{key, done}] + 지금 주)
  function weeklyRun(w) {
    if (!_isObj(w)) return 0;
    var done = {};
    (Array.isArray(w.hist) ? w.hist : []).forEach(function(h) { if (_isObj(h) && h.done && typeof h.key === 'string') done[h.key] = true; });
    if (w.done && typeof w.key === 'string') done[w.key] = true;
    var idx = Object.keys(done).map(_weekIdx).filter(function(i) { return i !== null; }).sort(function(a, b) { return a - b; });
    var best = 0, run = 0;
    for (var i = 0; i < idx.length; i++) {
      if (i > 0 && idx[i] === idx[i - 1]) continue;
      run = (i > 0 && idx[i] === idx[i - 1] + 1) ? run + 1 : 1;
      if (run > best) best = run;
    }
    return best;
  }
  function _identifyOk(r) {
    if (!_isObj(r)) return false;
    var c = _n(r.correct), t = _n(r.total);
    return c >= NEED.identify && c * 5 >= t * 4;          // 5곳 중 4곳 이상(비율 80% 이상)
  }
  function evaluate(ctx) {
    ctx = _isObj(ctx) ? ctx : {};
    var J = _isObj(ctx.journey) ? ctx.journey : {};
    var M = _isObj(ctx.meta) ? ctx.meta : {};
    var T = _isObj(ctx.totals) ? ctx.totals : {};
    var nodes = _isObj(J.nodes) ? J.nodes : {};
    var ids = Object.keys(nodes);
    var streak = _isObj(J.streak) ? J.streak : {};
    var th = _isObj(J.theater) ? J.theater : {};
    var run = _isObj(M.run) ? M.run : {};
    var boss = _isObj(J.boss) ? J.boss : {};
    var daily = _isObj(J.daily) ? J.daily : {};
    var now = _n(ctx.now, NaN);
    var l3 = _ms(M.l3Since);
    var car = _isObj(M.career) ? M.career : {};
    var C = {
      'first-lesson': ids.some(function(id) { var r = nodes[id]; return _isObj(r) && _isObj(r.lesson) && r.lesson.done === true; }),
      'streak-7': Math.max(_n(streak.best), _n(streak.cur)) >= NEED.streak,
      'first-boss': ids.some(function(id) { return _isBossId(id, ctx.bosses) && _passedReal(nodes[id]); }),
      'river-catch': _n(M.river) >= 1,
      'potodds-20': _n(_isObj(run.potodds) ? run.potodds.best : 0) >= NEED.potodds,
      'think-10': _n(T.think) >= NEED.think,
      'intent-25': _n(th.hit) + _n(T.intent) >= NEED.intent,
      'daily5-perfect': Object.keys(daily).some(function(k) { var d = daily[k]; return _isObj(d) && _isObj(d.daily5) && _n(d.daily5.score) >= 100; }),
      'theater-10': _n(th.episodes) >= NEED.theater,
      'mini-pick': _n(M.mini) >= 1 || (Array.isArray(th.miniHist) && th.miniHist.some(function(h) { return _isObj(h) && h.hit === true; })),
      'backup-3': (Array.isArray(M.backups) ? M.backups.filter(function(k, i, a) { return typeof k === 'string' && a.indexOf(k) === i; }).length : 0) >= NEED.backups,
      'comeback': _comeback(daily),
      'paint-90': _n(M.paint) >= NEED.paint,
      'combos-50': _n(_isObj(run.combos) ? run.combos.best : 0) >= NEED.combos,
      'variance-cone': _n(M.cone) >= 1,
      'detective': _identifyOk(M.identify) || (_isObj(boss.identify) && Object.keys(boss.identify).some(function(k) { return _identifyOk(boss.identify[k]); })),
      'weekly-4': weeklyRun(J.weekly) >= NEED.weekly,
      'cards-30': (Array.isArray(th.cards) ? th.cards.filter(function(c) { return _isObj(c) && c.id != null; }).length : 0) >= NEED.cards,
      'l3-30': isFinite(l3) && isFinite(now) && now - l3 >= NEED.l3Days * DAY,
      'master': _passedReal(nodes[MASTER_BOSS]),
      'career-first': _n(car.sessions) >= 1,
      'career-cardroom': (Array.isArray(car.venues) ? car.venues : []).some(function(v) { return typeof v === 'string' && v && v !== CAREER_HOME; }),
      'career-cash': _n(car.cashes) >= 1
    };
    return BADGES.filter(function(b) { return C[b.id] === true; }).map(function(b) { return b.id; });
  }

  // ── 모으기(전역 모듈, typeof 가드) ──
  function _statTotals() {
    var out = { think: 0, intent: 0 };
    var S = null;
    try { S = _can('JStats', 'load') ? G.JStats.load() : null; } catch (e) { S = null; }
    if (!_isObj(S)) return out;
    [S.days, S.weeks].forEach(function(map) {
      if (!_isObj(map)) return;
      Object.keys(map).forEach(function(k) {
        var d = map[k];
        if (!_isObj(d)) return;
        if (_isObj(d.think)) out.think += _n(d.think.m);
        if (_isObj(d.intent)) out.intent += _n(d.intent.ok);
      });
    });
    return out;
  }
  function _readCoachRaw() {
    try {
      var raw = (typeof localStorage !== 'undefined' && localStorage) ? localStorage.getItem('poker_coach') : null;
      var o = raw ? JSON.parse(raw) : null;
      return _isObj(o) && isFinite(Number(o.level)) ? Number(o.level) : null;
    } catch (e) { return null; }
  }
  // 사용자가 고른 코칭 레벨(보스가 잠시 고정했으면 그 전 레벨)
  function coachLevel(st) {
    var b = _isObj(st) && _isObj(st.boss) ? st.boss : {};
    var snap = (_isObj(b.coachLock) && _isObj(b.coachLock.snap) && b.coachLock.snap) || (_isObj(b.active) && _isObj(b.active.coachSnap) && b.active.coachSnap) || null;
    if (snap && isFinite(Number(snap.level))) return Number(snap.level);
    if (_can('CoachUI', 'snapshot')) {
      var s = _call('CoachUI', 'snapshot');
      if (_isObj(s) && isFinite(Number(s.level))) return Number(s.level);
    }
    return _readCoachRaw();
  }
  function _bossIds() {
    var N = _m('JOURNEY_NODES');
    if (!Array.isArray(N)) return null;
    var out = N.filter(function(nd) { return _isObj(nd) && nd.kind === 'boss' && nd.id; }).map(function(nd) { return nd.id; });
    return out.length ? out : null;
  }
  function context(now, st) {
    now = _now(now);
    st = _isObj(st) ? st : (_state() || {});
    return { now: now, journey: st, meta: _isObj(st.badgeMeta) ? st.badgeMeta : {}, totals: _statTotals(),
      coachLevel: coachLevel(st), bosses: _bossIds() };
  }

  // ── 기록과 확인 ──
  function _info(id) { var b = _byId[id]; return b ? { id: b.id, name: b.name, text: b.text } : null; }
  function _observeCoach(M, lv, now) {
    if (lv === 3) { if (!M.l3Since) { M.l3Since = _iso(now); return true; } return false; }
    if (lv !== null && lv !== undefined && isFinite(lv) && M.l3Since) { M.l3Since = null; return true; }
    return false;
  }
  // (F4) 커리어 이벤트 버스 연결: 로드 순서와 무관하게 홈을 처음 그릴 때(onHome) 한 번 구독한다(core F1이 note('career')를 직접 불러도
  // 첫 1회 조건이라 두 번 세어도 결과는 같다). 구독 해제는 _unwireCareer(테스트용).
  var _careerOff = null;
  function _wireCareer() {
    if (_careerOff) return true;
    var CC = _m('CareerContract');
    if (!CC || typeof CC.on !== 'function') return false;
    var offs = [];
    var o1 = CC.on('session:end', function(p) {
      var s = _isObj(p) && _isObj(p.session) ? p.session : {};
      note('career', { session: true, venue: typeof s.venue === 'string' ? s.venue : null });
    });
    var o2 = CC.on('tourney:end', function(p) { if (_isObj(p) && _n(p.prize) > 0) note('career', { cash: true }); });
    if (o1) offs.push(o1);
    if (o2) offs.push(o2);
    if (!offs.length) return false;
    _careerOff = function() { offs.forEach(function(f) { try { f(); } catch (e) { /* 무시 */ } }); _careerOff = null; };
    return true;
  }
  function _unwireCareer() { if (_careerOff) { _careerOff(); return true; } return false; }

  function check(now) {
    now = _now(now);
    var st = _state();
    if (!st) return [];
    var M = _meta(st);
    var ctx = context(now, st);
    var changed = _observeCoach(M, ctx.coachLevel, now);
    ctx.meta = M;
    var have = _earned(st);
    if (!Array.isArray(st.badges)) st.badges = [];
    var news = [];
    evaluate(ctx).forEach(function(id) {
      if (have[id]) return;
      st.badges.push({ id: id, at: _iso(now) });
      if (M.unseen.indexOf(id) < 0) M.unseen.push(id);
      news.push(_info(id));
      changed = true;
    });
    if (changed) _save(st);
    return news;
  }

  function _run(M, k, ok) {
    var r = M.run[k];
    r.cur = ok ? r.cur + 1 : 0;
    if (r.cur > r.best) r.best = r.cur;
  }
  function _ratio(v) { v = _n(v, NaN); if (!isFinite(v)) return NaN; return v > 1 ? v / 100 : v; }
  function note(kind, data, now) {
    now = _now(now);
    var st = _state();
    if (!st) return [];
    var M = _meta(st);
    data = _isObj(data) ? data : {};
    var before = JSON.stringify(M);
    if (kind === 'puzzle') {
      var t = String(data.type || '');
      var ok = data.ok === true;
      if (t === 'potodds') _run(M, 'potodds', ok);
      else if (t === 'combos') _run(M, 'combos', ok);
      else if (t === 'facingbet-river') { if (ok && (data.answer === 'call' || data.pick === 'call')) M.river += 1; }
      else if (t === 'rangepaint') { var ov = _ratio(data.overlap); if (isFinite(ov)) M.paint = Math.max(M.paint, Math.min(1, ov)); }
    } else if (kind === 'rangePaint') {
      var ov2 = _ratio(data.overlap);
      if (isFinite(ov2)) M.paint = Math.max(M.paint, Math.min(1, ov2));
    } else if (kind === 'varianceCone') {
      M.cone += 1;
    } else if (kind === 'miniPick') {
      if (data.hit === true) M.mini += 1;
    } else if (kind === 'identify') {
      var c = Math.max(0, Math.floor(_n(data.correct))), tot = Math.max(c, Math.floor(_n(data.total)));
      var prev = M.identify;
      if (!prev || c > _n(prev.correct) || (c === _n(prev.correct) && tot < _n(prev.total))) M.identify = { correct: c, total: tot, node: data.node || null, at: _iso(now) };
    } else if (kind === 'backup') {
      var mk = _monthKey(now);
      if (M.backups.indexOf(mk) < 0) { M.backups.push(mk); if (M.backups.length > BACKUP_MONTHS_MAX) M.backups = M.backups.slice(-BACKUP_MONTHS_MAX); }
    } else if (kind === 'career') {
      // (F4) { session: true }(세션 1회 끝), { venue: id }(그 장소에 앉음), { cash: true } 또는 { tourney: { prize > 0 } }(토너먼트 입상)
      var CR = M.career;
      if (data.session === true) CR.sessions += 1;
      var ven = typeof data.venue === 'string' ? data.venue : null;
      if (ven && CR.venues.indexOf(ven) < 0) { CR.venues.push(ven); if (CR.venues.length > CAREER_VENUES_MAX) CR.venues = CR.venues.slice(-CAREER_VENUES_MAX); }
      var tp = _isObj(data.tourney) ? data.tourney : null;
      if (data.cash === true || (tp && _n(tp.prize) > 0)) CR.cashes += 1;
    }
    // 기록이 바뀌지 않은 이벤트(모르는 kind, 배지와 무관한 퍼즐 유형)는 저장도 확인도 하지 않는다(퍼즐 문항마다 불리므로 가볍게)
    if (JSON.stringify(M) === before) return [];
    _save(st);
    var news = check(now);
    if (news.length && _announce(news)) {
      var st2 = _state();
      if (st2) { var M2 = _meta(st2); news.forEach(function(b) { var i = M2.unseen.indexOf(b.id); if (i >= 0) M2.unseen.splice(i, 1); }); _save(st2); }
    }
    return news;
  }

  // 토스트 문구(정보형): 1개면 이름과 한 줄, 여러 개면 이름 목록
  function toastText(list) {
    list = (list || []).filter(Boolean);
    if (!list.length) return '';
    if (list.length === 1) return '🏅 새 배지: ' + list[0].name + '. ' + list[0].text;
    return '🏅 새 배지 ' + list.length + '개: ' + list.map(function(b) { return b.name; }).join(', ') + '. 수집에서 다시 볼 수 있어요.';
  }
  function _announce(list) {
    var msg = toastText(list);
    if (!msg || !_can('JourneyUI', 'toast')) return false;
    if (typeof document === 'undefined' || !document || !document.body) return false;
    _call('JourneyUI', 'toast', msg, 4200);
    return true;
  }

  // 홈(H11 c): 외형을 다시 적용하고, 배지를 확인하고, 아직 알리지 않은 배지를 한 번에 알린다
  function onHome(now) {
    now = _now(now);
    applyLooks();
    _wireCareer();
    check(now);
    var st = _state();
    if (!st) return [];
    var M = _meta(st), have = _earned(st);
    var list = M.unseen.filter(function(id) { return have[id]; }).map(_info).filter(Boolean);
    if (!list.length) { if (M.unseen.length) { M.unseen = []; _save(st); } return []; }
    if (_announce(list)) { M.unseen = []; _save(st); }
    return list;
  }

  function list(state) {
    var st = _isObj(state) ? state : (_state() || {});
    var seen = {};
    return (Array.isArray(st.badges) ? st.badges : []).filter(function(b) {
      if (!_isObj(b) || !_byId[b.id] || seen[b.id]) return false;
      seen[b.id] = true; return true;
    }).map(function(b, i) {
      var d = _byId[b.id];
      return { id: d.id, icon: d.icon, name: d.name, text: d.text, at: b.at || null, _i: i };
    }).sort(function(a, b) {
      var ta = _ms(a.at), tb = _ms(b.at);
      ta = isFinite(ta) ? ta : 0; tb = isFinite(tb) ? tb : 0;
      return (tb - ta) || (b._i - a._i);
    }).map(function(b) { delete b._i; return b; });
  }

  // 홈 카드(H11 a): 최근 3일 안에 얻은 배지 + 이번에 막 조건을 채운 배지(onHome이 곧 기록한다). 없으면 null
  function homeCard(state, now) {
    now = _now(now);
    var st = _isObj(state) ? state : _state();
    if (!st) return null;
    var have = _earned(st);
    var fresh = [];
    try {
      evaluate(context(now, st)).forEach(function(id) { if (!have[id]) fresh.push({ id: id, icon: _byId[id].icon, name: _byId[id].name, text: _byId[id].text, at: _iso(now) }); });
    } catch (e) { _warn('homeCard', e); }
    list(st).forEach(function(b) {
      var t = _ms(b.at);
      if (isFinite(t) && now - t <= RECENT_DAYS * DAY && now >= t - DAY) fresh.push(b);
    });
    if (!fresh.length) return null;
    var shown = fresh.slice(0, HOME_MAX);
    var more = fresh.length - shown.length;
    var html = '<div class="j-card cv-home" role="group" aria-label="새 배지">' +
      '<div class="j-card-t">🏅 새 배지</div>' +
      '<ul class="cv-home-list">' + shown.map(function(b) {
        return '<li class="cv-home-b"><span class="cv-home-ic" aria-hidden="true">' + b.icon + '</span><span class="cv-home-tx"><b>' + _esc(b.name) + '</b>' +
          '<span class="cv-home-d">' + _esc(b.text) + '</span></span></li>';
      }).join('') + '</ul>' +
      (more > 0 ? '<div class="j-card-d">그 밖에 ' + more + '개가 더 있어요.</div>' : '') +
      '<div class="j-card-acts"><button type="button" class="j-btn" onclick="JourneyUI.view(\'collection\')">🗂 수집 열기</button></div></div>';
    return { html: html };
  }

  // ── 외형 ──
  function _unlockData() {
    var U = _m('JOURNEY_UNLOCKS');
    return (Array.isArray(U) && U.length) ? U : DEFAULT_UNLOCKS;
  }
  function _level(st) {
    var xp = _n(st && st.xp);
    var lv = _call('Journey', 'levelFor', xp);
    if (isFinite(Number(lv))) return Number(lv);
    return Math.max(1, Math.floor(_n(st && st.level, 1)));
  }
  function looks(state) {
    var st = _isObj(state) ? state : (_state() || {});
    var lv = _level(st);
    var un = Array.isArray(st.unlocks) ? st.unlocks : [];
    var cos = _isObj(st.cosmetic) ? st.cosmetic : {};
    var data = _unlockData().filter(function(u) { return _isObj(u) && LOOK_PREFIX[u.kind] && u.id; })
      .slice().sort(function(a, b) { return _n(a.level) - _n(b.level); });
    return { level: lv, kinds: LOOK_KINDS.map(function(kind) {
      var options = data.filter(function(u) { return u.kind === kind; }).map(function(u) {
        var key = kind + ':' + u.id;
        return { id: String(u.id), name: LOOK_NAME[key] || String(u.id), level: _n(u.level), unlocked: un.indexOf(key) >= 0 || _n(u.level) <= lv };
      });
      var open = options.filter(function(o) { return o.unlocked; });
      var c = cos[kind];
      var chosen = (c === 'default' || open.some(function(o) { return o.id === c; })) ? c : 'auto';
      var effective = chosen === 'auto' ? (open.length ? open[open.length - 1].id : 'default') : chosen;
      return { kind: kind, title: LOOK_TITLE[kind], defaultName: LOOK_DEFAULT[kind], chosen: chosen, effective: effective, options: options };
    }) };
  }
  function lookClasses(state) {
    var out = [];
    looks(state).kinds.forEach(function(k) { if (k.effective && k.effective !== 'default') out.push(LOOK_PREFIX[k.kind] + k.effective); });
    return out;
  }
  function _allLookClasses() {
    var out = [];
    _unlockData().forEach(function(u) { if (_isObj(u) && LOOK_PREFIX[u.kind]) out.push(LOOK_PREFIX[u.kind] + u.id); });
    return out;
  }
  // 저장소 원문(window load 때: Journey.load로 첫 실행 이전을 앞당기지 않는다)
  function _rawState() {
    try {
      var raw = (typeof localStorage !== 'undefined' && localStorage) ? localStorage.getItem(KEY) : null;
      var o = raw ? JSON.parse(raw) : null;
      return _isObj(o) ? o : null;
    } catch (e) { return null; }
  }
  function applyLooks(state, raw) {
    var st = _isObj(state) ? state : (raw ? _rawState() : _state());
    var cls = st ? lookClasses(st) : [];
    var root = (typeof document !== 'undefined' && document) ? document.documentElement : null;
    if (!root || !root.classList) return cls;
    _allLookClasses().forEach(function(c) { if (cls.indexOf(c) < 0 && root.classList.contains(c)) root.classList.remove(c); });
    cls.forEach(function(c) { if (!root.classList.contains(c)) root.classList.add(c); });
    return cls;
  }
  function setLook(kind, id) {
    if (!LOOK_PREFIX[kind]) return false;
    var st = _state();
    if (!st) return false;
    id = String(id == null ? 'auto' : id);
    var k = looks(st).kinds.filter(function(x) { return x.kind === kind; })[0];
    var ok = id === 'auto' || id === 'default' || (k && k.options.some(function(o) { return o.id === id && o.unlocked; }));
    if (!ok) return false;
    if (!_isObj(st.cosmetic)) st.cosmetic = { tableColor: null, cardBack: null, castFrame: null, cardBorder: null };
    st.cosmetic[kind] = id === 'auto' ? null : id;
    _save(st);
    applyLooks(st);
    return true;
  }

  if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
    window.addEventListener('load', function() { try { applyLooks(null, true); } catch (e) { _warn('load', e); } });
  }

  var api = {
    BADGES: BADGES, NEED: NEED, LOOK_KINDS: LOOK_KINDS, RECENT_DAYS: RECENT_DAYS,
    evaluate: evaluate, context: context, coachLevel: coachLevel, weeklyRun: weeklyRun,
    note: note, check: check, onHome: onHome, homeCard: homeCard, list: list, toastText: toastText,
    looks: looks, lookClasses: lookClasses, applyLooks: applyLooks, setLook: setLook,
    info: function(id) { var b = _byId[id]; return b ? { id: b.id, icon: b.icon, name: b.name, text: b.text } : null; },
    _wireCareer: _wireCareer, _unwireCareer: _unwireCareer
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
