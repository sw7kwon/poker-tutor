// puzzles/puzzle-ui.js (채우는 패키지: M2-P4b)
// 퍼즐 세트 화면과 해설 오버레이(설계서 5.5절, 4.3절 XP, 4.5절 레이팅, 5.9절 접근성). 계약 C5는 puzzles/puzzle-core.js 머리 주석.
//   start(spec)   세트 10~20문항, 레이팅 반영(spec.rated === false면 미반영).
//                 spec = {type, count, set?[[type, n]], variant?, spots?, node?, rated?, title?, onDone(r)}
//   review(spec)  복습 블록(레이팅 미반영). spec = {items:[{type, key, box, fill?, concept?, spots?}], onDone(r)}
//                 srs 항목은 Puzzles.fromKey로 같은 key를 다시 내고, 채움 항목(fill)은 레이팅 창을 넣어 Puzzles.next로 만든다.
//                 type이 'puzzle'인 구형 채움 항목은 concept로 Puzzles.pickType을 불러 유형을 정한다.
//   can(typeOrSpec) 모든 유형이 Puzzles.available이고, ui 'paint' 유형은 색칠 화면(RangePaint, lessons/widgets/range-paint.js)과
//                 채점기(Puzzles.get(type).check, score)가 있을 때만 true(M6-PAINT, 계약 H2: can('rangepaint') true).
//   run(hooks)    PuzzleModes(러시, 서바이벌, 데일리 5)가 같이 쓰는 러너. hooks 명세는 run 위 주석.
//   r = {n, ok, xp, rated, ratingDelta, mode, aborted, results:[{type, key, ok, ms, pick, near, rated}]}
//       rated = 레이팅에 들어간 문항 수, ratingDelta = Rating.commit 결과의 delta(없으면 null).
// 기록(문항마다): Drills.record(type, key, ok, ms), JStats.record('puzzle', {ok, rated}), XP(JourneyUI.xp, 없으면 Journey.addXp),
//   Badges.note('puzzle', {type, ok, key, answer, overlap?}, now)(M6, 계약 H2와 H8, answer = 정답 보기 id, 색칠 문항은 스팟 키,
//   이미 푼 문항 연습 hooks.noRecord는 기록과 같이 빼다), 효과 A11y.fx. 레이팅 세트에서만 Rating.record(q, ok, now), 끝 또는 중간 나가기에서 Rating.commit(now) 1회(세트 1회 = 레이팅 기간 1회).
// 화면: #screen-journey 안 JourneyUI.mountView('puzzle', html). Nav.view('puzzle', 이름)와 Nav.setBack('j/puzzle')로 ↩와 안드로이드 뒤로를
//   처리하고, 중간에 나가면 그때까지의 결과만 반영한다(끝 카드 없이 onDone).
// 장면: 문제 단계에서는 scene.ring(필요 승률을 계산해 그리는 해설 그림, 팟 오즈 정답과 같다)을 빼고 해설 오버레이에서만 그린다.
// 한 문항도 만들지 못한 세트는 빈 끝 카드 대신 안내 후 onDone(r: n 0, empty true).
// (M6-PAINT, 계약 H2) 색칠 문항(q.ui 'paint', 유형 rangepaint): 보기 대신 RangePaint 격자(줄 탭 → 크게 보기 줄에서 손가락으로 끌어
//   칠하기와 지우기)와 하단 엄지 영역의 '지우기', '채점하기'. 채점 = Puzzles.get(type).check(q, 칠한 칸)의 score(= .score, Jaccard),
//   문항 ok = 겹침 ≥ 기준(spec.overlap → q.data.overlap, 기본 0.7). 채점 뒤에는 늘 해설 오버레이(겹침 %, 맞게 칠함, 놓친 칸,
//   넘친 칸 격자와 '이 앱 차트 기준'). start({type:'rangepaint', count})는 count를 10~20으로 늘리지 않고 그대로(1~20, 기본 3) 쓴다.
//   r.paint = [{spot, overlap}](색칠 문항을 푼 차례, 없으면 []), r.results 항목에도 overlap, spot. 보스는 r.paint를 쌓아 판정한다.
//   (M7, FLOW-03) 문항이 그려진 뒤 350ms 안의 보기, 채점 탭(_onClick)은 무시한다. (M7, FLOW-07) _end는 푼 문항이 있으면 Journey.noteActivity(now, 분)를 부른다
//   (노드, 보스 드릴과 데일리 5는 분을 다른 곳에서 세므로 분 0 = 활동일만).
//   API: grade() → info | null, paint(칸|[칸], on?) → 칠한 칸 수, paintRow(r), paintClear(), paintState() → {spot, cells, row, n} | null.
//   Puzzles.pickType은 paint 유형을 기본으로 빼므로(opts.paint) 러시, 서바이벌, 데일리 5에는 색칠 문항이 섞이지 않는다.
// 로드 시 DOM 접근 없음. 다른 모듈은 호출 시점에 전역에서 찾는다(typeof 가드, 병렬 구현 중 스텁이어도 화면이 깨지지 않음).
var PuzzleUI = (function() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : this);

  var SET_MIN = 10, SET_MAX = 20, SET_DEFAULT = 10;
  var PAINT_DEFAULT = 3;    // 색칠 문항 세트 기본 문항 수
  var PAINT_GOAL = 0.7;     // 색칠 겹침 기준 기본값(gen-range PAINT_OVERLAP과 같은 값)
  var AUTO_MS = 700;        // 정답 표시 뒤 다음 문항까지
  var TAP_GUARD_MS = 350;   // (M7, FLOW-03) 문항이 그려진 뒤 이 시간 안의 보기, 채점 탭은 무시(연타의 두 번째 탭이 방금 뜬 보기를 누르는 사고 방지). 키보드 answer, 러시 자동 다음과는 별개
  var ACTIVITY_MIN_CAP = 20;   // (M7, FLOW-07) Journey.noteActivity에 넘기는 분(오래 켜 둔 화면이 목표 링을 채우지 않게)
  var FLASH_MS = 1300;      // 오답 플래시(러시) 표시 시간
  var TRIES = 4;            // 문항 1개를 만들 때 생성기 재시도 횟수
  var SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
  var SUIT_NAME = { s: '스페이드', h: '하트', d: '다이아', c: '클럽' };
  var RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
  var POS_ORDER = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  // 라벨 3중 표시(색 + 글자 + 아이콘, 설계서 8.2절). 짧은 글자는 배지, 긴 문장은 title(길게 누르기/마우스).
  var LABELS = {
    exact:  { icon: '✔', text: '엔진 계산', full: '엔진으로 다시 계산한 정답' },
    given:  { icon: '✔', text: '주어진 상대 레인지 기준 엔진 계산', full: '문제에 적힌 상대 레인지를 기준으로 엔진이 계산한 정답' },
    chart:  { icon: '▦', text: '이 앱 차트 기준', full: '이 앱의 차트 기준(입문용, 표준보다 UTG/HJ/CO가 2~8%p 타이트, SB RFI 32.1%와 vs3bet 표도 타이트)' },
    appdef: { icon: '◇', text: '이 앱의 분류 기준', full: '이 앱의 분류 기준. 레이팅과 데일리 5에는 넣지 않아요' },
    approx: { icon: '≈', text: '참고/근사', full: '공개 솔버 통념을 근사한 참고값. 레이팅과 승급에는 넣지 않아요' },
    read:   { icon: '💭', text: '캐릭터 읽기', full: '이 캐릭터의 생각이고 정답이 아님' },
    concept: { icon: '📖', text: '레슨 개념', full: '레슨에서 배운 개념 확인 문제. 레이팅에는 넣지 않아요' }   // M7 결정 27: calc 없는 레슨 질문
  };
  var LABEL_ALIAS = { engine: 'exact', check: 'exact', range: 'given', 'exact-range': 'given', 'given-range': 'given', app: 'appdef', 'app-def': 'appdef', appDef: 'appdef',
    ref: 'approx', reference: 'approx', character: 'read', intent: 'read', lesson: 'concept' };

  var S = null;             // 진행 중 세션(한 번에 1개)
  var _rootEl = null;       // .pz 루트(DOM이 없으면 null, 테스트는 S.html을 본다)
  var _timer = null;
  var _env = {};            // 테스트 주입 { now, setTimeout, clearTimeout }
  var _keysBound = false, _kbd = false;
  var _backNav = null, _backOff = null;
  var _seq = 0;

  // ── 공용 헬퍼 ──────────────────────────────────────────
  function _m(name) { var o = G[name]; return (o && (typeof o === 'object' || typeof o === 'function')) ? o : null; }
  function _can(mod, fn) { var o = _m(mod); return !!(o && typeof o[fn] === 'function'); }
  function _call(mod, fn) {
    var o = _m(mod);
    if (!o || typeof o[fn] !== 'function') return undefined;
    try { return o[fn].apply(o, Array.prototype.slice.call(arguments, 2)); }
    catch (e) { _warn(mod + '.' + fn, e); return undefined; }
  }
  function _warn(where, e) { if (typeof console !== 'undefined' && console.warn) console.warn('[PuzzleUI] ' + where + ' 실패:', e && e.message ? e.message : e); }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function _txt(s) { return _esc(s).replace(/\n/g, '<br>'); }
  function _num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function _now() { return typeof _env.now === 'function' ? _env.now() : Date.now(); }
  function _later(fn, ms) {
    if (typeof _env.setTimeout === 'function') return _env.setTimeout(fn, ms);
    return (typeof setTimeout === 'function') ? setTimeout(fn, ms) : null;
  }
  function _cancel(id) {
    if (id == null) return;
    if (typeof _env.clearTimeout === 'function') { _env.clearTimeout(id); return; }
    if (typeof clearTimeout === 'function') clearTimeout(id);
  }
  function _hasDom() { return typeof document !== 'undefined' && !!document && typeof document.getElementById === 'function'; }
  function _xpConst(k, d) { var X = _m('JOURNEY_XP'); return X && X[k] != null ? X[k] : d; }
  function _dayKey(t) {
    var k = _call('Journey', 'dayKey', t);
    if (typeof k === 'string' && k) return k;
    var d = new Date(t), m = d.getMonth() + 1, dd = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
  }
  function _toast(msg, ms) { _call('JourneyUI', 'toast', msg, ms); }
  function _typeName(t) {
    var n = _call('JourneyUI', 'typeName', t);
    return (typeof n === 'string' && n) ? n : String(t || '퍼즐');
  }

  // mulberry32(Drills.rng와 같은 식). 테스트와 재현용 시드를 받는다.
  function rng(seed) {
    if (_can('Drills', 'rng')) { var r = _call('Drills', 'rng', seed); if (typeof r === 'function') return r; }
    var a = (seed >>> 0) || 0x9e3779b9;
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function _seed() { return ((_now() & 0x7fffffff) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0; }

  // ── 퍼즐 모듈 접근(전부 typeof 가드) ─────────────────────────
  function _P() { return _m('Puzzles'); }
  function _meta(t) {
    var P = _P(); if (!P) return null;
    var tm = P.TYPE_META && typeof P.TYPE_META === 'object' ? P.TYPE_META[t] : null;
    var mm = null;
    if (typeof P.meta === 'function') { try { mm = P.meta(t); } catch (e) { mm = null; } }
    if (!tm && !mm) return null;
    var o = {}, k;
    if (mm) for (k in mm) if (Object.prototype.hasOwnProperty.call(mm, k)) o[k] = mm[k];
    if (tm) for (k in tm) if (Object.prototype.hasOwnProperty.call(tm, k)) o[k] = tm[k];   // TYPE_META가 정본(C1)
    return o;
  }
  function _uiOf(t) {
    var mt = _meta(t);
    if (mt && mt.ui) return mt.ui;
    return t === 'rangepaint' ? 'paint' : 'choice';
  }
  function available(t) {
    var P = _P();
    if (!P || !t || t === 'mixed' || t === 'puzzle') return false;
    if (typeof P.available === 'function') { try { return !!P.available(t); } catch (e) { return false; } }
    if (typeof P.next !== 'function' || typeof P.has !== 'function' || !P.has(t)) return false;
    var g = typeof P.get === 'function' ? P.get(t) : null;
    if (g && typeof g.ready === 'function') { try { return !!g.ready(); } catch (e) { return false; } }
    return true;
  }
  // 색칠 문항(M6-PAINT): 색칠 화면 부품과 그 유형의 채점기가 있어야 낼 수 있다
  function _rp() {
    var R = _m('RangePaint');
    return (R && typeof R.create === 'function' && typeof R.html === 'function' && typeof R.cells === 'function' &&
      typeof R.resultHTML === 'function') ? R : null;
  }
  function _paintGen(t) {
    var P = _P(), g = null;
    if (!P || typeof P.get !== 'function') return null;
    try { g = P.get(t); } catch (e) { g = null; }
    return (g && typeof g.check === 'function' && typeof g.score === 'function') ? g : null;
  }
  function _paintReady(t) { return !!_rp() && !!_paintGen(t); }
  function _usable(t) { return available(t) && (_uiOf(t) !== 'paint' || _paintReady(t)); }
  function _isPaint(q) { return !!q && q.ui === 'paint'; }
  function _valid(q) {
    if (_isPaint(q)) {
      if (!q.type || !q.data || typeof q.data.spot !== 'string' || !q.data.spot || !_paintReady(q.type)) return false;
      try { return !!_rp().create(q.data.spot, { goal: q.data.overlap }); } catch (e) { return false; }
    }
    if (!q || typeof q !== 'object' || !Array.isArray(q.options) || q.options.length < 2) return false;
    if (q.ui && q.ui !== 'choice') return false;
    for (var i = 0; i < q.options.length; i++) if (q.options[i] && String(q.options[i].id) === String(q.answer)) return true;
    return false;
  }
  // 문항 서명(같은 세트 안 반복 판정): 유형, 키, 지문, 장면, 보기, 정답이 모두 같아야 같은 문항
  function qSig(q) {
    if (!q) return '';
    var sc = '', op = '';
    try { sc = JSON.stringify(q.scene == null ? null : q.scene); } catch (e) { sc = ''; }
    try { op = (q.options || []).map(function(o) { return o ? o.id + '=' + o.label : ''; }).join('\u0002'); } catch (e) { op = ''; }
    return [q.type, q.key == null ? '' : q.key, q.prompt || '', sc, op, q.answer].join('\u0001');
  }
  function _genNext(type, rnd, opts) {
    var P = _P(); if (!P || typeof P.next !== 'function') return null;
    try { var q = P.next(type, rnd, opts || {}); return _valid(q) ? q : null; }
    catch (e) { _warn('Puzzles.next(' + type + ')', e); return null; }
  }
  function _genFromKey(type, key, rnd, opts) {
    var P = _P(); if (!P) return null;
    var q = null;
    try {
      if (typeof P.fromKey === 'function') q = P.fromKey(type, key, rnd, opts || {});
      else {
        var g = typeof P.get === 'function' ? P.get(type) : null;
        if (g && typeof g.fromKey === 'function') q = g.fromKey(key, rnd, opts || {});
      }
    } catch (e) { _warn('Puzzles.fromKey(' + type + ')', e); q = null; }
    return _valid(q) ? q : null;
  }
  function _explain(q) {
    var P = _P(), e = null;
    try {
      if (P && typeof P.explain === 'function') e = P.explain(q);
      if (!e && P && typeof P.get === 'function') {
        var g = P.get(q.type);
        if (g && typeof g.explain === 'function') e = g.explain(q);
      }
    } catch (x) { _warn('explain(' + (q && q.type) + ')', x); e = null; }
    if (typeof e === 'string') e = { line: e };
    if (!e || typeof e !== 'object') e = {};
    if (!e.line) e.line = '정답은 ' + _optLabel(q, q.answer) + '이에요.';
    return e;
  }
  function _optLabel(q, id) {
    var o = _opt(q, id);
    return o ? String(o.label) : String(id);
  }
  function _opt(q, id) {
    if (!q || !Array.isArray(q.options)) return null;
    for (var i = 0; i < q.options.length; i++) if (q.options[i] && String(q.options[i].id) === String(id)) return q.options[i];
    return null;
  }
  function isRated(q) {
    if (!q) return false;
    var P = _P();
    if (P && typeof P.isRated === 'function') { try { return !!P.isRated(q); } catch (e) { return false; } }
    return q.rated !== false && !q.appDef && (q.confidence === 'exact' || q.confidence === 'chart');
  }
  function _stage() {
    var s = _call('Journey', 'load');
    return Math.max(1, Math.min(6, Math.floor(_num(s && s.stage, 1))));
  }
  function _rating() {
    var c = _call('Rating', 'current');
    if (c && isFinite(c.r)) return Number(c.r);
    var s = _call('Journey', 'load');
    if (s && s.rating && isFinite(s.rating.r)) return Number(s.rating.r);
    return 1000 + 250 * (_stage() - 1);
  }
  // 다음 퍼즐 레이팅 범위 [Ru-300, Ru-200](설계서 3.2절)
  function ratingWindow(r) { r = _num(r, 1000); return [r - 300, r - 200]; }

  // ── 라벨(설계서 8.2절) ─────────────────────────────────
  function labelOf(q) {
    var raw = null, P = _P();
    if (P && typeof P.label === 'function') { try { raw = P.label(q); } catch (e) { raw = null; } }
    var key = null, text = null, icon = null, full = null;
    if (typeof raw === 'string' && raw) {
      text = raw;
      if (raw.indexOf('레인지 기준') >= 0) key = 'given';
      else if (raw.indexOf('엔진') >= 0) key = 'exact';
      else if (raw.indexOf('차트') >= 0) key = 'chart';
      else if (raw.indexOf('분류') >= 0) key = 'appdef';
      else if (raw.indexOf('캐릭터') >= 0) key = 'read';
      else if (raw.indexOf('참고') >= 0 || raw.indexOf('근사') >= 0) key = 'approx';
    } else if (raw && typeof raw === 'object') {
      key = raw.kind || raw.key || raw.id || raw.cls || null;
      text = raw.text || raw.label || raw.short || null;
      icon = raw.icon || null;
      full = raw.full || raw.title || raw.long || null;
    }
    if (key && LABEL_ALIAS[key]) key = LABEL_ALIAS[key];
    if (!key || !LABELS[key]) {
      if (!q) key = 'exact';
      else if (q.type === 'lesson' && (q.labelKind === 'chart' || q.labelKind === 'appdef' || q.labelKind === 'approx' || q.labelKind === 'concept')) key = q.labelKind;   // 계약 H12, '참고' 장면
      else if (q.type === 'intent') key = 'read';
      else if (q.confidence === 'approx') key = 'approx';
      else if (q.appDef) key = 'appdef';
      else if (q.confidence === 'chart') key = 'chart';
      else if (q.type === 'facingbet-river') key = 'given';
      else key = 'exact';
    }
    var L = LABELS[key];
    return { key: key, icon: icon || L.icon, text: text || L.text, full: full || L.full };
  }
  function _labelHTML(q) {
    var L = labelOf(q);
    return '<span class="pz-label pz-label--' + L.key + '" title="' + _esc(L.full) + '"><span class="pz-label-i" aria-hidden="true">' +
      _esc(L.icon) + '</span>' + _esc(L.text) + '</span>';
  }

  // ── 장면(SceneRender가 없으면 텍스트 대체) ──────────────────
  function cardHTML(c) {
    c = String(c || '');
    var r = c.charAt(0).toUpperCase(), s = c.charAt(1).toLowerCase();
    if (!SUIT[s]) return '<span class="pz-card">' + _esc(c) + '</span>';
    var red = (s === 'h' || s === 'd');
    return '<span class="pz-card' + (red ? ' pz-card--red' : '') + '" data-suit="' + s + '" aria-label="' + _esc(SUIT_NAME[s] + ' ' + (r === 'T' ? '10' : r)) + '">' +
      (r === 'T' ? '10' : _esc(r)) + SUIT[s] + '</span>';
  }
  function _cardsHTML(list) {
    if (!Array.isArray(list) || !list.length) return '';
    return '<span class="pz-cards">' + list.map(cardHTML).join('') + '</span>';
  }
  function _bb(v) { var n = Number(v); return isFinite(n) ? (Math.round(n * 100) / 100) + 'bb' : ''; }
  function sceneFallback(sc) {
    if (!sc || typeof sc !== 'object') return '';
    var out = [];
    if (Array.isArray(sc.seats) && sc.seats.length) {
      out.push('<div class="pz-seats">' + sc.seats.map(function(x) {
        if (!x) return '';
        var cls = 'pz-seat' + (x.hero ? ' is-hero' : '') + (x.active ? ' is-act' : '');
        return '<span class="' + cls + '">' + _esc(x.pos || '') + (x.hero ? ' (나)' : '') + (x.label ? ' ' + _esc(x.label) : '') + '</span>';
      }).join('') + '</div>');
    }
    if (Array.isArray(sc.hero) && sc.hero.length) out.push('<div class="pz-row"><span class="pz-k">내 손</span>' + _cardsHTML(sc.hero) + '</div>');
    if (Array.isArray(sc.board) && sc.board.length) out.push('<div class="pz-row"><span class="pz-k">보드</span>' + _cardsHTML(sc.board) + '</div>');
    var money = [];
    if (sc.potTotal != null && isFinite(sc.potTotal)) money.push('팟(상대 벳 포함) ' + _bb(sc.potTotal));
    if (sc.toCall != null && isFinite(sc.toCall)) money.push('콜 ' + _bb(sc.toCall));
    if (sc.stack != null && isFinite(sc.stack)) money.push('스택 ' + _bb(sc.stack));
    if (money.length) out.push('<div class="pz-row pz-money">' + _esc(money.join(', ')) + '</div>');
    if (sc.range && typeof sc.range === 'object') {
      var rg = sc.range, body = '';
      if (Array.isArray(rg.combos) && rg.combos.length) {
        body = rg.combos.map(function(cb) {
          cb = String(cb);
          return (cb.length === 4) ? '<span class="pz-combo-c">' + cardHTML(cb.slice(0, 2)) + cardHTML(cb.slice(2, 4)) + '</span>' : '<span class="pz-combo-c">' + _esc(cb) + '</span>';
        }).join('');
      } else if (rg.text) body = _esc(rg.text);
      out.push('<div class="pz-range"><span class="pz-k">' + _esc(rg.label || '상대 레인지') + '</span><div class="pz-range-b">' + body + '</div></div>');
    }
    if (sc.grid && typeof sc.grid === 'object') { var gh = miniGrid(sc.grid); if (gh) out.push(gh); }
    if (sc.note) out.push('<div class="pz-note">' + _txt(sc.note) + '</div>');
    return out.join('');
  }
  // 문제 단계의 장면: 링(필요 승률 = 콜 ÷ (팟+콜)을 계산해 그리는 해설 그림)은 정답을 드러내므로 빼고,
  // 결정 뒤 해설 오버레이에서만 그린다(설계서 3.1절 "먼저 결정 → 그림 해설"). 팟과 콜 숫자는 그대로 보인다.
  function questionScene(sc) {
    if (!sc || typeof sc !== 'object' || !sc.ring) return sc || null;
    var o = {}, k, n = 0;
    for (k in sc) if (Object.prototype.hasOwnProperty.call(sc, k) && k !== 'ring') { o[k] = sc[k]; if (sc[k] != null) n++; }
    if (o.potTotal == null && sc.ring.potTotal != null) { o.potTotal = sc.ring.potTotal; n++; }
    if (o.toCall == null && sc.ring.toCall != null) { o.toCall = sc.ring.toCall; n++; }
    return n ? o : null;
  }
  function _sceneHTML(sc) {
    if (!sc) return '';
    var h = null;
    if (_can('SceneRender', 'scene')) h = _call('SceneRender', 'scene', sc);
    if (typeof h === 'string' && h) return h;
    return sceneFallback(sc);
  }
  function _handLabel(r, c) {
    if (r === c) return RANKS[r] + RANKS[r];
    if (r < c) return RANKS[r] + RANKS[c] + 's';
    return RANKS[c] + RANKS[r] + 'o';
  }
  // 격자 미니맵: SceneRender.grid(spec, {mini:true}) 우선, 없으면 GtoChart.buildChartModel로 13x13 축소 그림
  function miniGrid(spec) {
    if (!spec || typeof spec !== 'object') return '';
    if (_can('SceneRender', 'grid')) {
      var h = _call('SceneRender', 'grid', spec, { mini: true });
      if (typeof h === 'string' && h) return h;
    }
    var model = null;
    if (spec.pos && _can('GtoChart', 'buildChartModel')) model = _call('GtoChart', 'buildChartModel', spec.pos, spec.facing === undefined ? false : spec.facing, spec.opener || null);
    var hl = {};
    (Array.isArray(spec.highlight) ? spec.highlight : []).forEach(function(x) { hl[String(x)] = true; });
    if (!model || !Array.isArray(model.cells)) return '';
    var cells = [], seen = {};
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) {
      var cell = (model.cells[r] && model.cells[r][c]) || {};
      var a = cell.action || 'none', lab = cell.label || _handLabel(r, c);
      seen[a] = true;
      cells.push('<i class="pz-m pz-m--' + _esc(a) + (hl[lab] ? ' is-hl' : '') + '"></i>');
    }
    var leg = [['raise', 'R', '레이즈'], ['call', 'C', '콜'], ['fold', 'F', '폴드']].filter(function(x) { return seen[x[0]]; }).map(function(x) {
      return '<span class="pz-leg"><i class="pz-m pz-m--' + x[0] + '"></i>' + x[1] + ' ' + x[2] + '</span>';
    }).join('');
    var hls = Object.keys(hl);
    return '<div class="pz-mini-wrap"><div class="pz-mini" role="img" aria-label="' + _esc((spec.pos || '') + ' 차트 미니맵' + (hls.length ? ', 표시 ' + hls.join(', ') : '')) + '">' +
      cells.join('') + '</div><div class="pz-legs">' + leg + (hls.length ? '<span class="pz-leg"><i class="pz-m is-hl"></i>이 손</span>' : '') + '</div></div>';
  }

  // ── 순수 규칙 ─────────────────────────────────────────
  function clampCount(n) {
    n = Math.floor(_num(n, SET_DEFAULT));
    return Math.max(SET_MIN, Math.min(SET_MAX, n));
  }
  // 색칠 문항 세트(계약 H2 'count 그대로'): 1~20, 기본 3(노드 s5-09와 s5-boss가 3스팟)
  function clampPaint(n) {
    n = Math.floor(_num(n, PAINT_DEFAULT));
    return Math.max(1, Math.min(SET_MAX, n));
  }
  function _shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  // 세트 계획: set [[type, n]]을 펼쳐 섞는다. 합이 10~20 밖이면 자르거나 앞에서부터 다시 채운다.
  function planTypes(spec, rnd) {
    spec = spec || {};
    rnd = rnd || Math.random;
    var list = [];
    if (Array.isArray(spec.set) && spec.set.length) {
      spec.set.forEach(function(x) {
        var t = Array.isArray(x) ? x[0] : (x && x.type), k = Math.max(0, Math.floor(_num(Array.isArray(x) ? x[1] : (x && x.n), 0)));
        for (var i = 0; i < k; i++) list.push({ type: t, variant: (x && x.variant) || spec.variant, spots: (x && x.spots) || spec.spots });
      });
      var want = clampCount(spec.count != null ? spec.count : list.length);
      if (!list.length) return [];
      var base = list.slice(), i2 = 0;
      while (list.length < want) list.push(base[i2++ % base.length]);
      _shuffle(list, rnd);
      return list.slice(0, want);
    }
    if (!spec.type) return [];
    // 노드 드릴(spec.node)이 10문항보다 적게 정한 세트(부록 A: s5-04 토이 게임 5/5, s6-06 분산 5/5)는 그 수 그대로.
    // 10으로 늘리면 통과 비율 1.0 때문에 10/10이 필요해진다(M6 통합 검증). 그 밖의 세트는 10~20
    var cnt = Math.floor(_num(spec.count, 0));
    var n = _uiOf(spec.type) === 'paint' ? clampPaint(spec.count)
      : (spec.node && cnt >= 1 && cnt < SET_MIN ? cnt : clampCount(spec.count));
    for (var j = 0; j < n; j++) list.push({ type: spec.type, variant: spec.variant, spots: spec.spots });
    return list;
  }
  // 퍼즐 정답 XP 티어(S1~S5: 0, 2, 4, 6, 8): 유형의 단계(meta.stage), 없으면 난이도 구간
  function tierOf(q) {
    var tiers = _xpConst('puzzleTier', [0, 2, 4, 6, 8]);
    if (!Array.isArray(tiers) || !tiers.length) tiers = [0, 2, 4, 6, 8];
    var mt = q ? _meta(q.type) : null, idx;
    if (mt && isFinite(mt.stage)) idx = Math.floor(mt.stage) - 1;
    else {
      var d = _num(q && q.difficulty, 1000);
      idx = d >= 2000 ? 4 : d >= 1750 ? 3 : d >= 1500 ? 2 : d >= 1250 ? 1 : 0;
    }
    idx = Math.max(0, Math.min(tiers.length - 1, idx));
    return _num(tiers[idx], 0);
  }
  // 문항 1개의 XP(설계서 4.3절). 복습(srs 재출제) 정답 2, 같은 날 같은 키는 1. 퍼즐 정답 5 + 티어, 오답 1(참여).
  function xpFor(q, ok, ctx) {
    ctx = ctx || {};
    if (ctx.review) {
      if (!ok) return null;
      return ctx.repeat ? { src: 'reviewRepeat', amount: _num(_xpConst('reviewRepeat', 1), 1) } : { src: 'review', amount: _num(_xpConst('review', 2), 2) };
    }
    if (ok) return { src: 'puzzle', amount: _num(_xpConst('puzzle', 5), 5) + tierOf(q) };
    return { src: 'puzzleWrong', amount: _num(_xpConst('puzzleWrong', 1), 1) };
  }
  // 보기 배치: 짧은 보기 2~3개는 한 줄, 4개는 2열, 길면 1열
  function optCols(q) {
    var o = (q && q.options) || [], n = o.length;
    var maxLen = 0;
    o.forEach(function(x) { maxLen = Math.max(maxLen, String(x && x.label || '').length); });
    if (n <= 3 && maxLen <= 6) return n;
    if (n === 4 && maxLen <= 12) return 2;
    if (n === 2 && maxLen <= 14) return 2;
    return 1;
  }
  function _sameDay(t, now) { return isFinite(t) && t > 0 && _dayKey(t) === _dayKey(now); }

  // ── 기록 ──────────────────────────────────────────────
  function _grant(x) {
    if (!x || !(x.amount > 0)) return 0;
    var r;
    if (_can('JourneyUI', 'xp')) r = _call('JourneyUI', 'xp', x.src, x.amount);
    else if (_can('Journey', 'addXp')) r = _call('Journey', 'addXp', x.src, x.amount, _now());
    else return 0;
    if (r && isFinite(r.granted)) return Number(r.granted);
    return (r === undefined || r === null) ? 0 : x.amount;
  }
  function _record(q, ok, ms, now) {
    var D = _m('Drills');
    if (D && typeof D.record === 'function') {
      try {
        if (q.srs === 'once' && typeof D.policyOf === 'function' && D.policyOf(q.type) !== 'once' && typeof D.keyPolicy === 'function') D.keyPolicy(q.type, 'once');
        D.record(q.type, q.srs === 'once' ? null : q.key, !!ok, ms, now);
      } catch (e) { _warn('Drills.record', e); }
    }
  }

  // 배지 기록(계약 H2, H8): 문항마다 1번. answer = 정답 보기 id, 색칠 문항은 스팟 키(정답 칸 목록 대신), overlap은 색칠 문항만
  function _note(q, ok, overlap, now) {
    if (!_can('Badges', 'note')) return;
    var d = { type: q.type, ok: !!ok, key: q.key == null ? null : q.key, answer: _isPaint(q) ? (q.data && q.data.spot) || q.key || null : q.answer };
    if (overlap != null && isFinite(overlap)) d.overlap = overlap;
    _call('Badges', 'note', 'puzzle', d, now);
  }

  // ── 러너 ──────────────────────────────────────────────
  // hooks = {
  //   mode, title, navParam(Nav.view('puzzle', navParam), 기본 mode), total(숫자 = 고정 문항 수, null = over()까지),
  //   rated(bool, 레이팅 세트 여부), review(bool, 복습 XP 규칙), noRecord(bool, Drills/JStats 기록 생략: 이미 푼 문항 연습),
  //   next(i, S) -> q|null                 필수. i번째(0부터) 문항.
  //   xp(q, ok, S, info) -> {src, amount}|null   생략 시 xpFor 규칙
  //   rateable(q, S) -> bool               생략 시 rated && !q._review && Puzzles.isRated(q)
  //   feedback(q, ok, S, info) -> 'auto'|'overlay'|'flash'   생략 시 정답 auto, 오답 overlay
  //   onAnswer(q, ok, S, info)             info = {pick, opt, near, ms, rated, xp}
  //   over(S) -> bool                      정답 처리 뒤와 다음 문항 전에 확인(서바이벌 3스트라이크, 러시 시간)
  //   hud(S) -> html                       상단 보조 정보(시간 막대, 목숨). PuzzleUI.refresh()로 다시 그림
  //   overlayHead(q, ok, S, info) -> html  해설 오버레이 머리(데일리 5 등급)
  //   endTitle, hideStats(끝 카드의 문항/정답/XP/레이팅 줄 숨김), autoMs, flashMs,
  //   endHTML(r, S) -> html, endActions(r, S) -> [{id, label, primary?}], onAction(id, r, S) -> true면 처리됨
  //   onEnd(r, S) -> r                     끝 카드 전에 결과 가공(최고 기록 저장 등)
  //   onStop(S)                            세션이 닫힐 때(타이머 정리)
  //   onDone(r)                            없으면 여정 홈으로
  // }
  function run(hooks) {
    if (!hooks || typeof hooks.next !== 'function') return null;
    // 끝 카드에서 다른 모드로 바로 넘어갈 때(러시 → 서바이벌) 이전 퍼즐 기록을 새 것으로 바꾼다(뒤로가 헛돌지 않게)
    var prevNav = S ? S.navParam : null;
    if (S) _stopQuiet();
    _seq++;
    S = {
      token: _seq, hooks: hooks, mode: hooks.mode || 'set', title: hooks.title || '퍼즐', rated: !!hooks.rated,
      total: (hooks.total == null) ? null : Math.max(0, Math.floor(_num(hooks.total, 0))),
      i: 0, q: null, qAt: 0, phase: 'load', pick: null, info: null, exp: null,
      n: 0, ok: 0, xp: 0, combo: 0, best: 0, ratedN: 0, ratingDelta: null, rating: null,
      results: [], ended: false, aborted: false, r: null, html: '', startedAt: _now(), data: hooks.data || {},
      paint: [], pt: null
    };
    S.navParam = String(hooks.navParam || S.mode);
    _ensureBack();
    _ensureKeys();
    _mountShell();
    if (prevNav != null && prevNav !== S.navParam) _navSwap(S.navParam);
    else _navOpen(S.navParam);
    _advance();
    return S ? api : null;
  }
  function _mountShell() {
    _unbindPaint();
    _rootEl = null;
    var shell = '<div class="pz pz--' + _esc(S.mode) + '" data-mode="' + _esc(S.mode) + '"></div>';
    var v = _call('JourneyUI', 'mountView', 'puzzle', shell);
    if (v && typeof v.querySelector === 'function') _rootEl = v.querySelector('.pz');
    if (_rootEl && typeof _rootEl.addEventListener === 'function') _rootEl.addEventListener('click', _onClick);
    _bindPaint();
  }
  // 색칠 격자 입력(위임): 줄 탭, ▲▼, 크게 보기 줄 끌기. 칠하기는 문제 단계에서만 받는다
  var _paintOff = null;
  function _bindPaint() {
    var R = _rp();
    if (!R || typeof R.bind !== 'function' || !_rootEl) return;
    _paintOff = R.bind(_rootEl, {
      state: function() { return (S && !S.ended && S.phase === 'q' && _isPaint(S.q) && S.pt) ? S.pt : null; },
      render: function() { _paintRender(); },
      changed: function(what) { _paintChanged(what); }
    });
  }
  function _unbindPaint() { if (_paintOff) { try { _paintOff(); } catch (e) { /* 무시 */ } _paintOff = null; } }
  function _navOpen(param) {
    if (!_can('Nav', 'view')) return;
    var want = '#j/puzzle/' + encodeURIComponent(String(param));
    if (typeof location !== 'undefined' && location && String(location.hash || '') === want) return;
    _call('Nav', 'view', 'puzzle', String(param));
  }
  // 맨 위 퍼즐 기록을 걷어내고 새 이름으로 다시 연다(Nav가 되감기 중이면 순서대로 처리)
  function _navSwap(param) {
    if (!_can('Nav', 'view')) return;
    if (_can('Nav', 'closeView')) _call('Nav', 'closeView', 'puzzle');
    _call('Nav', 'view', 'puzzle', String(param));
  }
  function _ensureBack() {
    var N = _m('Nav');
    if (!N || typeof N.setBack !== 'function' || _backNav === N) return;
    if (_backOff) { try { _backOff(); } catch (e) { /* 무시 */ } }
    _backNav = N;
    try {
      _backOff = N.setBack('j/puzzle', function() {
        if (!S) return false;
        exit({ viaNav: true });
        return 'done';
      });
    } catch (e) { _backOff = null; }
  }
  function _ensureKeys() {
    if (_keysBound || typeof window === 'undefined' || !window || typeof window.addEventListener !== 'function') return;
    window.addEventListener('keydown', _onKey);
    window.addEventListener('pointerdown', function() { _kbd = false; }, true);
    _keysBound = true;
  }

  function _advance() {
    if (!S || S.ended) return;
    _cancel(_timer); _timer = null;
    var h = S.hooks;
    if ((S.total != null && S.i >= S.total) || _over()) { _end(false); return; }
    var q = null;
    for (var t = 0; t < 3 && !q; t++) {
      var c = null;
      try { c = h.next(S.i, S); } catch (e) { _warn('next', e); c = null; }
      if (_valid(c)) q = c;
      if (!S || S.ended) return;
      if (S.total != null && !q) break;       // 고정 문항 수: 만들지 못한 문항은 건너뛴다
    }
    if (!q) {
      if (S.total != null && S.i + 1 < S.total) { S.i++; S.skipped = (S.skipped || 0) + 1; _advance(); return; }
      if (S.total != null && S.total > 0 && S.n === 0) S.empty = true;   // 한 문항도 만들지 못함: 빈 끝 카드 대신 안내 후 닫기
      _end(false); return;
    }
    S.q = q; S.i++; S.qAt = _now(); S.phase = 'q'; S.pick = null; S.info = null; S.exp = null;
    S.pt = _isPaint(q) ? _rp().create(q.data.spot, { goal: _paintNeed(q) }) : null;   // _valid가 스팟을 이미 확인했다
    S.paintArm = false;
    _render(true);
  }
  function _over() {
    if (!S || typeof S.hooks.over !== 'function') return false;
    try { return !!S.hooks.over(S); } catch (e) { return false; }
  }

  function answer(id) {
    if (!S || S.ended || S.phase !== 'q' || !S.q || _isPaint(S.q)) return null;
    var q = S.q, opt = _opt(q, id);
    if (!opt) return null;
    return _settle(q, String(opt.id) === String(q.answer), opt, null);
  }
  // 색칠 문항 채점(계약 H2): 겹침 = Puzzles.get(type).check(q, 칠한 칸).score(= .score(spot, cells), Jaccard), ok = 겹침 ≥ 기준
  function _paintNeed(q) {
    var v = q && q.data ? _num(q.data.overlap, NaN) : NaN;
    return (v > 0 && v <= 1) ? v : PAINT_GOAL;
  }
  function grade() {
    if (!S || S.ended || S.phase !== 'q' || !_isPaint(S.q) || !S.pt) return null;
    var q = S.q, g = _paintGen(q.type), R = _rp();
    if (!g || !R) return null;
    var mine = R.cells(S.pt), chk = null;
    try { chk = g.check(q, mine); } catch (e) { _warn('check(' + q.type + ')', e); chk = null; }
    if (!chk || !isFinite(chk.score)) return null;
    var need = _paintNeed(q), overlap = chk.score, ok = overlap >= need - 1e-9;
    S.pt.graded = { score: overlap, pct: R.pct ? R.pct(overlap) : Math.floor(overlap * 100), ok: ok, goal: need,
      missing: (chk.missing || []).slice(), extra: (chk.extra || []).slice(), cells: mine };
    return _settle(q, ok, null, overlap);
  }
  // 문항 1개 결과 반영(보기 문항 opt, 색칠 문항 overlap). 레이팅, XP, 기록, 배지, 다음 단계(자동 다음 또는 해설 오버레이)
  function _settle(q, ok, opt, overlap) {
    var h = S.hooks, paint = _isPaint(q);
    var now = _now(), ms = Math.max(0, now - S.qAt);
    // 레이팅: 레이팅 세트의 첫 시도이고 Puzzles.isRated(q)일 때만(재출제 복습은 제외)
    var rated = false;
    if (S.rated) {
      if (typeof h.rateable === 'function') { try { rated = !!h.rateable(q, S); } catch (e) { rated = false; } }
      else rated = !q._review && isRated(q);
    }
    // XP는 기록 전에 정한다(같은 날 같은 키 판정이 Drills.item의 마지막 시각을 본다)
    var repeat = false;
    if (q._review && q.key != null) {
      var it = _call('Drills', 'item', q.type, q.key);
      repeat = !!(it && _sameDay(_num(it.last, 0), now));
    }
    // Rating.record가 false를 돌려주면(같은 기간에 이미 넣은 문항 등) 레이팅 문항으로 세지 않는다
    if (rated) {
      if (!_can('Rating', 'record')) rated = false;
      else if (_call('Rating', 'record', q, ok, now) === false) rated = false;
      else S.ratedN++;
    }
    var info = { pick: opt ? opt.id : null, opt: opt, near: !!(opt && opt.near), ms: ms, rated: rated, ok: ok, repeat: repeat };
    if (paint) info.overlap = overlap;
    var xr = null;
    if (typeof h.xp === 'function') { try { xr = h.xp(q, ok, S, info); } catch (e) { xr = null; } }
    else xr = xpFor(q, ok, { review: !!(h.review && q._review), repeat: repeat });
    if (!h.noRecord) {                         // 연습 다시 풀기(데일리 5)는 Leitner와 통계에 넣지 않는다
      _record(q, ok, ms, now);
      if (_can('JStats', 'record')) _call('JStats', 'record', 'puzzle', { ok: ok, rated: rated }, now);
      _note(q, ok, paint ? overlap : null, now);
    }
    var got = _grant(xr);
    info.xp = got;
    S.xp += got;
    S.n++;
    if (ok) { S.ok++; S.combo++; if (S.combo > S.best) S.best = S.combo; } else S.combo = 0;
    var res = { type: q.type, key: q.key == null ? null : q.key, ok: ok, ms: ms, pick: info.pick, near: info.near, rated: rated };
    if (paint) { res.overlap = overlap; res.spot = q.data.spot; S.paint.push({ spot: q.data.spot, overlap: overlap }); }
    S.results.push(res);
    S.pick = info.pick; S.info = info;
    if (typeof h.onAnswer === 'function') { try { h.onAnswer(q, ok, S, info); } catch (e) { _warn('onAnswer', e); } }
    if (!S || S.ended) return info;
    if (_can('A11y', 'fx')) _call('A11y', 'fx', ok ? 'ok' : 'bad');
    var fb = ok ? 'auto' : 'overlay';
    if (typeof h.feedback === 'function') { try { fb = h.feedback(q, ok, S, info) || fb; } catch (e) { /* 기본값 */ } }
    if (paint) fb = 'overlay';   // 색칠은 맞아도 놓친 칸과 넘친 칸을 보여 준다
    if (paint) S.paintArm = false;
    S.overAfter = _over();
    if (fb === 'overlay') {
      S.phase = 'overlay';
      S.exp = paint ? _paintExplain(q) : _explain(q);
      _render(false);
    } else {
      S.phase = fb === 'flash' ? 'flash' : 'done';
      if (fb === 'flash') S.exp = _explain(q);
      _render(false);
      var tok = S.token, step = S.i;
      var wait = (fb === 'flash') ? _num(h.flashMs, FLASH_MS) : _num(h.autoMs, AUTO_MS);
      _timer = _later(function() { if (S && S.token === tok && S.i === step && !S.ended && S.phase !== 'q') _advance(); }, wait);
    }
    return info;
  }
  // 오버레이 "다음", 정답 표시 중 Enter
  function next() {
    if (!S || S.ended) return false;
    if (S.phase === 'overlay' || S.phase === 'done' || S.phase === 'flash') { _advance(); return true; }
    return false;
  }
  // ── 색칠 문항 조작(계약 H2). 화면 입력은 RangePaint.bind가 같은 상태(S.pt)를 바꾼다 ──
  function _paintOn() { return !!(S && !S.ended && S.phase === 'q' && _isPaint(S.q) && S.pt && _rp()); }
  // paint('AKs') 뒤집기, paint(['AA', 'KK'], true) 칠하기, paint(list, false) 지우기 → 칠한 칸 수 | null
  function paint(cells, on) {
    if (!_paintOn()) return null;
    var R = _rp(), list = Array.isArray(cells) ? cells : [cells], changed = false;
    list.forEach(function(l) { if (R.setCell(S.pt, l, on === undefined ? !S.pt.on[l] : !!on)) changed = true; });
    if (changed) { S.paintArm = false; _paintRender(); }
    return R.cells(S.pt).length;
  }
  function paintRow(r) {
    if (!_paintOn()) return false;
    var ok = _rp().setRow(S.pt, r);
    if (ok) _paintRender();
    return ok;
  }
  // 모두 지우기: 화면 버튼은 두 번 눌러야 지운다(실수로 다 지우지 않게). force면 바로
  function paintClear(force) {
    if (!_paintOn() || !_rp().cells(S.pt).length) return false;
    if (!force && !S.paintArm) { S.paintArm = true; _paintRender(); return false; }
    _rp().clear(S.pt);
    S.paintArm = false;
    _paintRender();
    return true;
  }
  function paintState() {
    if (!S || !S.pt || !_rp()) return null;
    var R = _rp();
    return { spot: S.pt.spot, cells: R.cells(S.pt), row: S.pt.row, n: R.cells(S.pt).length, graded: S.pt.graded || null };
  }
  function _paintHTML() { var R = _rp(); return (R && S && S.pt) ? R.html(S.pt, { ctx: 'puzzle', head: false, hint: true }) : ''; }
  function _paintActsHTML() {
    var R = _rp(), n = (R && S.pt) ? R.cells(S.pt).length : 0, off = S.phase !== 'q' || !n;
    return '<div class="pz-opts pz-opts--c2 pz-pacts" role="group" aria-label="색칠 마치기">' +
      '<button type="button" class="pz-pbtn' + (S.paintArm ? ' is-arm' : '') + '" data-pz="pclear"' + (off ? ' disabled' : '') + '>' +
      (S.paintArm ? '한 번 더 누르면 지워요' : '모두 지우기') + '</button>' +
      '<button type="button" class="pz-pbtn pz-pbtn--go" data-pz="pgrade"' + (off ? ' disabled' : '') + '>✔ 채점하기</button></div>';
  }
  // 색칠 영역과 하단 버튼만 다시 그린다(문항 전체를 다시 그리면 스크롤과 포커스가 튄다)
  function _paintRender() {
    if (!S) return;
    S.html = _innerHTML();
    if (!_rootEl || typeof _rootEl.querySelector !== 'function') return;
    var host = _rootEl.querySelector('.pz-paint'), acts = _rootEl.querySelector('.pz-pacts');
    if (!host || !acts) { _render(false); return; }
    host.innerHTML = _paintHTML();
    if (typeof acts.outerHTML === 'string') acts.outerHTML = _paintActsHTML();
  }
  // 끄는 동안(RangePaint가 칸 클래스만 바꿈): 하단 버튼 상태와 S.html만 맞춘다
  function _paintChanged(what) {
    if (!S) return;
    if (what === 'cells' && S.paintArm) S.paintArm = false;
    S.html = _innerHTML();
    if (what === 'row' || !_rootEl || typeof _rootEl.querySelector !== 'function') return;
    var acts = _rootEl.querySelector('.pz-pacts');
    if (acts && typeof acts.outerHTML === 'string') acts.outerHTML = _paintActsHTML();
  }
  function _paintExplain(q) {
    var g = _paintGen(q.type), cells = (S.pt && S.pt.graded && S.pt.graded.cells) || [], e = null;
    try { if (g && typeof g.explain === 'function') e = g.explain(q, cells); } catch (x) { _warn('explain(' + q.type + ')', x); e = null; }
    if (!e || typeof e !== 'object') e = {};
    if (!e.line) e.line = '겹침 = 같이 칠한 칸 ÷ 둘 중 하나라도 칠한 칸(이 앱 차트 기준)';
    return e;
  }

  // 외부(러시 시계)에서 세션을 끝낸다
  function stop() { if (S && !S.ended) _end(false); }
  function refresh() {
    if (!S) return;
    if (_rootEl && typeof _rootEl.querySelector === 'function') {
      var hud = _rootEl.querySelector('.pz-hud');
      if (hud) { hud.innerHTML = _hudHTML(); return; }
    }
    _render(false);
  }

  function _result(aborted) {
    return {
      mode: S.mode, n: S.n, ok: S.ok, xp: S.xp, rated: S.ratedN, ratingDelta: S.ratingDelta, rating: S.rating,
      best: S.best, aborted: !!aborted, results: S.results.slice(), node: S.hooks.node || null, data: S.data,
      paint: S.paint.map(function(x) { return { spot: x.spot, overlap: x.overlap }; })
    };
  }
  function _end(aborted) {
    if (!S || S.ended) return;
    S.ended = true; S.aborted = !!aborted;
    _cancel(_timer); _timer = null;
    // 세트 1회 = 레이팅 기간 1회: 반영할 문항이 있을 때만 commit
    if (S.rated && S.ratedN > 0 && _can('Rating', 'commit')) {
      var c = _call('Rating', 'commit', _now());
      if (c && isFinite(c.delta)) S.ratingDelta = Number(c.delta);
      if (c && isFinite(c.r)) S.rating = { r: Number(c.r), rd: _num(c.rd, null) };
    }
    // (M7, FLOW-07) 푼 문항이 있으면 오늘 학습 활동으로 센다(스트릭과 목표 링). API는 journey-core(flow 그룹), 없으면 건너뜀. 중간에 나가도 푼 만큼은 활동이다
    //   노드, 보스 드릴 세트(hooks.node: Journey.recordDrillSet이 문항 수로 분을 셈)와 데일리 5(PuzzleModes가 첫 완주의 분을 셈)는
    //   분을 다른 곳에서 이미 세므로 여기서는 활동일만(분 0) 넘긴다. 분이 두 번 더해져 목표 링이 두 배로 차지 않게
    if (S.n > 0 && _can('Journey', 'noteActivity')) {
      var actNow = _now(), elsewhere = !!S.hooks.node || S.mode === 'daily5';
      var actMin = elsewhere ? 0 : Math.max(0, Math.min(ACTIVITY_MIN_CAP, Math.round((actNow - _num(S.startedAt, actNow)) / 60000)));
      _call('Journey', 'noteActivity', actNow, actMin);
    }
    var r = _result(aborted);
    if (typeof S.hooks.onEnd === 'function') { try { r = S.hooks.onEnd(r, S) || r; } catch (e) { _warn('onEnd', e); } }
    S.r = r;
    if (typeof S.hooks.onStop === 'function') { try { S.hooks.onStop(S); } catch (e) { /* 무시 */ } }
    if (aborted) return;
    if (S.empty) { r.empty = true; _toast('문제를 만들지 못했어요. 다른 퍼즐부터 해 주세요', 2600); _done(false); return; }
    if (_can('A11y', 'fx')) _call('A11y', 'fx', 'done');
    S.phase = 'end';
    _render(true);
  }
  // ↩, Esc, 안드로이드 뒤로. 진행 중이면 그때까지의 결과만 반영하고(끝 카드 없음) 닫는다.
  function exit(opts) {
    if (!S) return false;
    var viaNav = !!(opts && opts.viaNav);
    if (!S.ended) _end(true);
    _done(viaNav);
    return true;
  }
  function _done(viaNav) {
    if (!S) return;
    var hooks = S.hooks, r = S.r || _result(true);
    S = null;
    _unbindPaint();
    _rootEl = null;
    _cancel(_timer); _timer = null;
    if (!viaNav && _can('Nav', 'closeView')) _call('Nav', 'closeView', 'puzzle');
    if (typeof hooks.onDone === 'function') { try { hooks.onDone(r); } catch (e) { _warn('onDone', e); } }
    else if (_can('JourneyUI', 'open')) _call('JourneyUI', 'open');
  }
  function _stopQuiet() {
    if (!S) return;
    if (!S.ended) _end(true);
    S = null; _unbindPaint(); _rootEl = null;
  }
  function _action(id) {
    if (!S) return false;
    if (id === 'done') { exit(); return true; }
    var h = S.hooks;
    if (typeof h.onAction === 'function') {
      try { if (h.onAction(id, S.r, S)) return true; } catch (e) { _warn('onAction', e); }
    }
    return false;
  }

  // ── 렌더 ──────────────────────────────────────────────
  function _hudHTML() {
    if (!S || typeof S.hooks.hud !== 'function') return '';
    try { return String(S.hooks.hud(S) || ''); } catch (e) { return ''; }
  }
  function _topHTML() {
    var prog = S.total != null ? (Math.min(S.i, S.total) + '/' + S.total) : (S.i + '번째');
    var combo = S.combo >= 2 ? '<span class="pz-combo" aria-label="연속 정답 ' + S.combo + '개">🔥 콤보 ' + S.combo + '</span>' : '';
    return '<div class="pz-top">' +
      '<button type="button" class="j-back pz-back" data-pz="back" aria-label="그만하고 나가기(푼 데까지 저장)">↩</button>' +
      '<div class="pz-ttl">' + _esc(S.title) + '</div>' +
      (S.phase === 'end' ? '' : '<span class="pz-prog" aria-label="문항 진행">' + _esc(prog) + '</span>' + combo) +
      '</div>' + (S.phase === 'end' ? '' : '<div class="pz-hud">' + _hudHTML() + '</div>');
  }
  function _optsHTML(q) {
    var cols = optCols(q), done = S.phase !== 'q';
    var html = '<div class="pz-opts pz-opts--c' + cols + '" role="group" aria-label="보기, 숫자 키 1~' + Math.min(9, q.options.length) + '">';
    q.options.forEach(function(o, i) {
      if (!o) return;
      var id = String(o.id), cls = 'pz-opt', mark = '';
      if (done) {
        if (id === String(q.answer)) { cls += ' is-ok'; mark = '<span class="pz-mark">✔ 정답</span>'; }
        else if (id === String(S.pick)) { cls += ' is-bad'; mark = '<span class="pz-mark">✖ 내 선택</span>'; }
        else cls += ' is-dim';
      }
      html += '<button type="button" class="' + cls + '" data-pz="opt" data-id="' + _esc(id) + '"' + (done ? ' aria-disabled="true"' : '') + '>' +
        (i < 9 ? '<span class="pz-key" aria-hidden="true">' + (i + 1) + '</span>' : '') +
        '<span class="pz-opt-t">' + _txt(o.label) + '</span>' + mark + '</button>';
    });
    return html + '</div>';
  }
  function _feedHTML() {
    if (S.phase === 'done' && S.info) {
      return '<div class="pz-feed is-ok" role="status">✔ 정답!' + (S.info.xp > 0 ? ' +' + S.info.xp + ' XP' : '') + '</div>';
    }
    if (S.phase === 'flash' && S.exp) {
      var okf = S.info && S.info.ok;
      return '<div class="pz-feed ' + (okf ? 'is-ok' : 'is-bad') + '" role="status">' + (okf ? '✔ 정답! ' : '✖ 오답, ') + _txt(S.exp.line) + '</div>';
    }
    return '';
  }
  function _overlayHTML() {
    var q = S.q, ok = !!(S.info && S.info.ok), e = S.exp || {};
    var head = null;
    if (typeof S.hooks.overlayHead === 'function') { try { head = S.hooks.overlayHead(q, ok, S, S.info); } catch (x) { head = null; } }
    if (_isPaint(q)) return _paintOverlayHTML(q, ok, e, head);
    if (!head) {
      head = ok ? '<span class="pz-ov-i" aria-hidden="true">✔</span> 정답'
        : '<span class="pz-ov-i" aria-hidden="true">✖</span> 오답, 정답은 <b>' + _esc(_optLabel(q, q.answer)) + '</b>';
    }
    var sc = e.scene || null, grid = (sc && sc.grid) || (q.scene && q.scene.grid) || null;
    var mini = grid ? miniGrid(grid) : '';
    if (!mini && sc) mini = _sceneHTML(sc);
    if (!mini && q.scene && q.scene.ring) mini = _sceneHTML({ ring: q.scene.ring });   // 문제에서 뺀 링은 해설에서 보인다
    var last = S.overAfter || (S.total != null && S.i >= S.total);
    return '<div class="pz-ov' + (ok ? ' is-ok' : ' is-bad') + '" role="dialog" aria-modal="true" aria-labelledby="pz-ov-h">' +
      '<div class="pz-ov-card"><div class="pz-ov-h" id="pz-ov-h">' + head + '</div>' +
      '<div class="pz-ov-line">' + _txt(e.line) + '</div>' +
      (mini ? '<div class="pz-ov-mini">' + mini + '</div>' : '') +
      '<button type="button" class="j-btn j-primary pz-next" data-pz="next">' + (last ? '결과 보기 ▶' : '다음 ▶') + '</button></div></div>';
  }
  // 색칠 채점 오버레이: 겹침 %, 이 앱 차트 기준, 채점 격자(맞게 칠함, 놓친 칸, 넘친 칸), 해설 두 줄, 다음
  function _paintOverlayHTML(q, ok, e, head) {
    var R = _rp(), gr = (S.pt && S.pt.graded) || { score: 0, pct: 0, goal: _paintNeed(q), cells: [] };
    var p = gr.pct, goal = Math.round(gr.goal * 100);
    if (!head) {
      head = ok ? '<span class="pz-ov-i" aria-hidden="true">✔</span> 통과! 겹침 <b>' + p + '%</b>'
        : '<span class="pz-ov-i" aria-hidden="true">✖</span> 겹침 <b>' + p + '%</b>, 통과 기준은 ' + goal + '%';
    }
    var body = R ? R.resultHTML(q.data.spot, { score: gr.score, ok: ok, goal: gr.goal }, gr.cells, { score: false, note: false }) : '';
    var last = S.overAfter || (S.total != null && S.i >= S.total);
    return '<div class="pz-ov pz-ov--paint' + (ok ? ' is-ok' : ' is-bad') + '" role="dialog" aria-modal="true" aria-labelledby="pz-ov-h">' +
      '<div class="pz-ov-card"><div class="pz-ov-h" id="pz-ov-h">' + head + '</div>' +
      '<div class="pz-ov-sub">' + (R && R.chipHTML ? R.chipHTML() : '') + ' 기준 겹침 ' + goal + '% 이상이면 통과</div>' +
      (body ? '<div class="pz-ov-mini pz-ov-paint">' + body + '</div>' : '') +
      '<div class="pz-ov-line">' + _txt(e.line) + '</div>' +
      '<button type="button" class="j-btn j-primary pz-next" data-pz="next">' + (last ? '결과 보기 ▶' : '다음 ▶') + '</button></div></div>';
  }
  // 유형별 정답(정보형 피드백)과 복습 안내. 틀린 srs 문항은 Drills가 box 0, 10분 뒤 복습으로 넣는다.
  function breakdownHTML(results) {
    if (!Array.isArray(results) || !results.length) return '';
    var by = {}, order = [], wrongSrs = 0;
    results.forEach(function(x) {
      if (!by[x.type]) { by[x.type] = { n: 0, ok: 0 }; order.push(x.type); }
      by[x.type].n++; if (x.ok) by[x.type].ok++;
      if (!x.ok && x.key != null) wrongSrs++;
    });
    return '<div class="pz-break" role="list" aria-label="유형별 정답">' + order.map(function(t) {
      var b = by[t], all = b.ok === b.n;
      return '<div class="pz-break-r" role="listitem"><span class="pz-break-t">' + _esc(_typeName(t)) + '</span>' +
        '<b class="' + (all ? 'is-ok' : 'is-part') + '">' + (all ? '✔ ' : '') + b.ok + '/' + b.n + '</b></div>';
    }).join('') + '</div>' + _paintBreakHTML(results) +
      (wrongSrs ? '<div class="pz-end-note">틀린 ' + wrongSrs + '문항은 복습 목록에 넣었어요(10분 뒤부터 다시 나와요)</div>' : '');
  }
  // 색칠 문항의 스팟별 겹침(계약 H2 r.paint와 같은 값)
  function _paintBreakHTML(results) {
    var list = results.filter(function(x) { return x && x.overlap != null && isFinite(x.overlap); });
    if (!list.length) return '';
    var R = _rp();
    return '<div class="pz-break pz-break--paint" role="list" aria-label="색칠 겹침">' + list.map(function(x) {
      var name = (R && typeof R.spotLabel === 'function') ? R.spotLabel(x.spot) : String(x.spot || '');
      var p = (R && typeof R.pct === 'function') ? R.pct(x.overlap) : Math.floor(x.overlap * 100);
      return '<div class="pz-break-r" role="listitem"><span class="pz-break-t">🖌 ' + _esc(name) + '</span>' +
        '<b class="' + (x.ok ? 'is-ok' : 'is-part') + '">' + (x.ok ? '✔ ' : '') + p + '%</b></div>';
    }).join('') + '</div>';
  }
  function _endHTML() {
    var r = S.r || _result(false), h = S.hooks;
    var rate;
    if (!S.rated) rate = '레이팅에는 반영하지 않는 모드예요';
    else if (r.ratingDelta == null) rate = r.rated > 0 ? '레이팅 반영 대기' : '이번에는 레이팅에 들어간 문항이 없어요';
    else {
      var d = Math.round(r.ratingDelta), lab = _call('Rating', 'label');
      rate = '레이팅 ' + (d > 0 ? '+' : '') + d + (typeof lab === 'string' && lab ? ' (지금 ' + _esc(lab) + ')' : '');
    }
    var extra = '';
    if (typeof h.endHTML === 'function') { try { extra = String(h.endHTML(r, S) || ''); } catch (e) { extra = ''; } }
    else extra = breakdownHTML(r.results);
    var acts = [{ id: 'done', label: '완료', primary: true }];
    if (typeof h.endActions === 'function') { try { var a = h.endActions(r, S); if (Array.isArray(a) && a.length) acts = a; } catch (e) { /* 기본 */ } }
    return '<div class="pz-end" role="region" aria-label="결과">' +
      '<div class="pz-end-t">' + _esc(h.endTitle || '🏁 끝!') + '</div>' +
      (h.hideStats ? '' : '<div class="pz-end-stats">' +
      '<div class="pz-stat"><b>' + r.n + '</b><span>문항</span></div>' +
      '<div class="pz-stat"><b>' + r.ok + '</b><span>정답</span></div>' +
      '<div class="pz-stat"><b>+' + r.xp + '</b><span>XP</span></div></div>' +
      '<div class="pz-end-rate">' + rate + '</div>') + extra +
      '<div class="pz-end-acts">' + acts.map(function(x) {
        return '<button type="button" class="j-btn' + (x.primary ? ' j-primary' : '') + '" data-pz="act" data-id="' + _esc(x.id) + '">' + _esc(x.label) + '</button>';
      }).join('') + '</div></div>';
  }
  function _innerHTML() {
    if (!S) return '';
    var html = _topHTML();
    if (S.phase === 'end') return html + _endHTML();
    var q = S.q;
    if (!q) return html + '<div class="pz-body"><div class="pz-prompt">문제를 준비하고 있어요</div></div>';
    if (_isPaint(q)) {
      html += '<div class="pz-body pz-body--paint"><div class="pz-meta">' + _labelHTML(q) + '</div>' +
        '<div class="pz-prompt">' + _txt(q.prompt) + '</div><div class="pz-paint">' + _paintHTML() + '</div>' + _feedHTML() + '</div>' + _paintActsHTML();
      if (S.phase === 'overlay') html += _overlayHTML();
      return html;
    }
    var qs = questionScene(q.scene);
    html += '<div class="pz-body"><div class="pz-meta">' + _labelHTML(q) + '</div>' +
      (qs ? '<div class="pz-scene">' + _sceneHTML(qs) + '</div>' : '') +
      '<div class="pz-prompt">' + _txt(q.prompt) + '</div>' + _feedHTML() + '</div>' + _optsHTML(q);
    if (S.phase === 'overlay') html += _overlayHTML();
    return html;
  }
  function _render(fresh) {
    if (!S) return;
    var html = _innerHTML();
    S.html = html;
    if (!_rootEl) return;
    _rootEl.innerHTML = html;
    if (_rootEl.setAttribute) _rootEl.setAttribute('data-phase', S.phase);
    if (fresh && _hasDom()) { var sc = document.getElementById('screen-journey'); if (sc) sc.scrollTop = 0; }
    _focus();
  }
  function _focus() {
    if (!_rootEl || typeof _rootEl.querySelector !== 'function') return;
    var el = null;
    if (S.phase === 'overlay') el = _rootEl.querySelector('.pz-next');
    else if (S.phase === 'end') el = _rootEl.querySelector('.pz-end-acts .j-primary') || _rootEl.querySelector('.pz-end-acts .j-btn');
    else if (S.phase === 'q' && _kbd) el = _isPaint(S.q) ? _rootEl.querySelector('.rp-z') : _rootEl.querySelector('.pz-opt');
    if (el && typeof el.focus === 'function') { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
  }

  // ── 입력 ──────────────────────────────────────────────
  function _closest(el, sel) {
    while (el && el.nodeType === 1) {
      if (el.matches ? el.matches(sel) : false) return el;
      el = el.parentNode;
    }
    return null;
  }
  function _onClick(e) {
    var el = _closest(e && e.target, '[data-pz]');
    if (!el) return;
    var a = el.getAttribute('data-pz'), id = el.getAttribute('data-id');
    // (M7, FLOW-03) '▶ 시작', '다음 ▶'을 두 번 누르면 두 번째 탭이 방금 그려진 문항의 보기 자리에 떨어진다. 갓 그려진 문항의 보기, 채점 탭은 무시
    if ((a === 'opt' || a === 'pgrade') && S && S.phase === 'q' && _now() - S.qAt < TAP_GUARD_MS) return;
    if (a === 'opt') answer(id);
    else if (a === 'next') next();
    else if (a === 'back') exit();
    else if (a === 'act') _action(id);
    else if (a === 'pgrade') grade();
    else if (a === 'pclear') paintClear();
  }
  // 키보드는 여정 화면이 보일 때만(다른 화면이 활성이면 무시)
  function _screenOk() {
    if (!_hasDom() || typeof document.querySelector !== 'function') return true;
    var a = document.querySelector('.screen.active');
    return !a || a.id === 'screen-journey';
  }
  function _onKey(e) {
    if (!S || !e || e.ctrlKey || e.metaKey || e.altKey || !_screenOk()) return;
    var tag = (e.target && e.target.tagName) ? String(e.target.tagName).toLowerCase() : '';
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    _kbd = true;
    if (e.key === 'Escape') { e.preventDefault(); exit(); return; }
    if (typing) return;
    if (S.phase === 'q' && /^[1-9]$/.test(e.key)) {
      var o = S.q && S.q.options[Number(e.key) - 1];
      if (o) { e.preventDefault(); answer(o.id); }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (S.phase === 'overlay' || S.phase === 'done' || S.phase === 'flash') { e.preventDefault(); next(); return; }
      if (S.phase === 'end' && !(e.target && e.target.tagName && String(e.target.tagName).toLowerCase() === 'button')) {
        e.preventDefault();
        var acts = S.hooks.endActions ? S.hooks.endActions(S.r, S) : null;
        var p = Array.isArray(acts) ? acts.filter(function(x) { return x.primary; })[0] : null;
        _action(p ? p.id : 'done');
      }
    }
  }

  // ── 세트(start)와 복습(review) ─────────────────────────
  function _typesOf(x) {
    if (typeof x === 'string') return [x];
    if (!x || typeof x !== 'object') return [];
    if (Array.isArray(x)) return x.map(function(it) { return Array.isArray(it) ? it[0] : (it && it.type); });
    if (Array.isArray(x.set) && x.set.length) return x.set.map(function(it) { return Array.isArray(it) ? it[0] : (it && it.type); });
    if (Array.isArray(x.items)) return x.items.map(function(it) { return it && it.type; });
    return x.type ? [x.type] : [];
  }
  function can(typeOrSpec) {
    var ts = _typesOf(typeOrSpec);
    if (!ts.length) return false;
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i];
      if (t === 'puzzle') { if (!_pickFor(null)) return false; continue; }   // 구형 채움 항목: 고를 유형이 있어야
      if (!_usable(t)) return false;
    }
    return true;
  }
  function _refuse(spec) {
    _toast('이 퍼즐은 다음 업데이트에서 열려요', 2400);
    if (spec && typeof spec.onDone === 'function') { try { spec.onDone(null); } catch (e) { _warn('onDone', e); } }
    return false;
  }
  // spec.node가 있으면 노드 drill 데이터(type, set, spots, variant, count)로 빈 칸을 채운다(JourneyUI 노드 시트 호출 대응)
  function _withNode(spec) {
    if (!spec.node) return spec;
    var nd = _call('JourneyUI', 'node', spec.node);
    if (!nd) {
      var list = _m('JOURNEY_NODES');
      if (Array.isArray(list)) for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === spec.node) { nd = list[i]; break; }
    }
    var d = nd && nd.drill;
    if (!d) return spec;
    var o = {}, k;
    for (k in spec) if (Object.prototype.hasOwnProperty.call(spec, k)) o[k] = spec[k];
    if (!o.type) o.type = d.type;
    if (o.type === d.type) {
      if (!o.set && Array.isArray(d.set)) o.set = d.set;
      if (o.spots == null && d.spots != null) o.spots = d.spots;
      if (o.variant == null && d.variant != null) o.variant = d.variant;
      if (o.count == null && d.count != null) o.count = d.count;
      if (o.overlap == null && d.overlap != null) o.overlap = d.overlap;   // 색칠 겹침 기준(s5-09, s5-boss)
    }
    if (!o.title && nd.title) o.title = String(nd.title);
    return o;
  }
  function start(spec) {
    spec = _withNode(spec || {});
    if (!can(spec)) return _refuse(spec);
    var rnd = rng(spec.seed != null ? spec.seed : _seed());
    var plan = planTypes(spec, rnd);
    if (!plan.length) return _refuse(spec);
    var seen = {};
    var title = spec.title || (_typeName(spec.type === 'mixed' || !spec.type ? 'mixed' : spec.type) + ' 퍼즐');
    var ok = run({
      mode: 'set', title: title, navParam: spec.type || 'set', total: plan.length, rated: spec.rated !== false, node: spec.node || null,
      endTitle: '🏁 세트 끝!',
      next: function(i) {
        var it = plan[i]; if (!it) return null;
        var stage = _stage(), r = _rating(), dup = null, fails = 0;
        // 같은 세트 안에서 같은 문항(장면과 정답까지 같은 것) 반복 금지. 키만 같고 장면이 다르면(아웃츠 9장, 보드가 다름) 다른 문항이다.
        // 생성기가 낼 수 있는 문항이 적어 새 문항을 못 찾으면 세트를 줄이지 않고 반복을 허용한다(노드 통과에는 10문항 이상이 필요).
        // 고를 스팟이 적으면(노드 drill은 3스팟) 무작위 재시도 8번으로는 마지막 새 스팟을 놓칠 수 있어(약 4%) 스팟 수에 비례해 늘린다.
        var maxT = TRIES * 2;
        if (it.spots && it.spots.length) maxT = Math.max(maxT, it.spots.length * 8);
        for (var t = 0; t < maxT; t++) {
          var go = { variant: it.variant, spots: it.spots, stage: stage, rating: r, window: ratingWindow(r), now: _now(), node: spec.node || null };
          if (spec.overlap != null) go.overlap = spec.overlap;   // 색칠 겹침 기준 → q.data.overlap(계약 H2)
          var q = _genNext(it.type, rnd, go);
          if (!q) { if (++fails >= TRIES) break; continue; }
          var k = qSig(q);
          if (seen[k]) { if (!dup) dup = q; continue; }
          seen[k] = true;
          return q;
        }
        return dup;
      },
      onDone: spec.onDone
    });
    return !!ok;
  }
  // 구형 채움 항목(type 'puzzle'): concept로 유형을 고른다. Puzzles.pickType(stage, rating, rnd, {concept})가
  // 개념 → 유형 매핑(blind_defense → preflop 등)을 알므로 그 결과를 쓰고, 없을 때만 meta.concept가 같은 유형에서 고른다.
  function _pickFor(concept, rnd) {
    var P = _P(); if (!P) return null;
    var stage = _stage(), r = _rating(), t = null;
    if (typeof P.pickType === 'function') {
      try { t = P.pickType(stage, r, rnd || Math.random, concept ? { concept: concept } : {}); } catch (e) { t = null; }
      if (t && typeof t === 'object') t = t.type || null;
    }
    if (t && _usable(t)) return t;
    var list = (typeof P.types === 'function' ? P.types() : []).filter(function(x) {
      var mt = _meta(x) || {};
      return _usable(x) && (!isFinite(mt.stage) || mt.stage <= stage + 1) && mt.confidence !== 'approx';
    });
    var byC = concept ? list.filter(function(x) { return _conceptOk(x, concept); }) : [];
    var pool = byC.length ? byC : list;
    if (!pool.length) return null;
    return pool[Math.floor((rnd || Math.random)() * pool.length) % pool.length];
  }
  function _conceptOk(t, concept) { var mt = _meta(t); return !!mt && mt.concept === concept; }
  function review(spec) {
    spec = spec || {};
    var items = Array.isArray(spec.items) ? spec.items.filter(Boolean) : [];
    var rnd = rng(spec.seed != null ? spec.seed : _seed());
    var list = [];
    items.forEach(function(it) {
      if (it.type === 'puzzle' || it.fill) { if (it.type === 'puzzle' ? !!_pickFor(it.concept, rnd) : _usable(it.type)) list.push(it); }
      else if (it.key != null && _usable(it.type)) list.push(it);
    });
    if (!list.length) {
      if (typeof spec.onDone === 'function') { try { spec.onDone({ mode: 'review', n: 0, ok: 0, xp: 0, rated: 0, ratingDelta: null, aborted: false, results: [] }); } catch (e) { _warn('onDone', e); } }
      return false;
    }
    var ok = run({
      mode: 'review', title: spec.title || '🔁 복습', navParam: 'review', total: list.length, rated: false, review: true,
      endTitle: '🏁 복습 끝!',
      next: function(i) {
        var it = list[i]; if (!it) return null;
        var stage = _stage(), r = _rating(), opts = { stage: stage, rating: r, window: ratingWindow(r), now: _now(), spots: it.spots };
        if (!it.fill && it.type !== 'puzzle') {
          var q = _genFromKey(it.type, it.key, rnd, opts);
          if (q) { q._review = true; if (q.key == null) q.key = it.key; }
          return q;
        }
        var t = it.type === 'puzzle' ? _pickFor(it.concept, rnd) : it.type;
        if (!t) return null;
        for (var k = 0; k < TRIES; k++) { var f = _genNext(t, rnd, opts); if (f) { f._fill = true; return f; } }
        return null;
      },
      onDone: spec.onDone
    });
    return !!ok;
  }

  // ── 테스트 전용 ────────────────────────────────────────
  function _setEnv(env) { _env = env || {}; }
  function _reset() {
    _cancel(_timer); _timer = null;
    S = null; _unbindPaint(); _rootEl = null; _env = {};
    if (_backOff) { try { _backOff(); } catch (e) { /* 무시 */ } }
    _backOff = null; _backNav = null;
  }
  function state() {
    if (!S) return null;
    return { mode: S.mode, phase: S.phase, i: S.i, total: S.total, n: S.n, ok: S.ok, xp: S.xp, combo: S.combo, best: S.best,
      ratedN: S.ratedN, q: S.q, info: S.info, ended: S.ended, html: S.html, results: S.results.slice(), r: S.r, data: S.data,
      paint: S.paint.slice(), pt: S.pt };
  }
  function active() { return !!S; }

  var api = {
    SET_MIN: SET_MIN, SET_MAX: SET_MAX, AUTO_MS: AUTO_MS, FLASH_MS: FLASH_MS, LABELS: LABELS,
    start: start, review: review, can: can, run: run,
    answer: answer, next: next, exit: exit, stop: stop, refresh: refresh, state: state, active: active,
    grade: grade, paint: paint, paintRow: paintRow, paintClear: paintClear, paintState: paintState,
    available: available, isRated: isRated, rng: rng, ratingWindow: ratingWindow, stage: _stage, rating: _rating,
    core: { clampCount: clampCount, clampPaint: clampPaint, planTypes: planTypes, tierOf: tierOf, xpFor: xpFor, labelOf: labelOf, optCols: optCols, qSig: qSig, questionScene: questionScene,
      sceneFallback: sceneFallback, miniGrid: miniGrid, cardHTML: cardHTML, breakdownHTML: breakdownHTML },
    _onKey: _onKey, _onClick: _onClick, _action: _action, _setEnv: _setEnv, _reset: _reset
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
