// ui/pacer.js (로컬 G2 PACE, 설계 원문 docs/NEXT2_DESIGN.md 4.2~4.5절, 계약 6.1절 5번)
// 빌런 액션 순차 공개. app.js _processVillainActions가 엔진 걸음 루프로 모은 프레임 [{ pre, action, post }]을
//   Pacer.run(frames, { frame(frame, i), done() }, ctx)로 넘기면 프레임마다 frame 훅(렌더와 말풍선)을 부르고 끝에 done을 부른다.
//   ctx = { practice, heroOut(히어로 폴드 뒤 빌런끼리, 모든 값 x0.5), next: 'hero' | 'street' | 'end'(끝난 뒤 이어질 일), speed(생략하면 설정) }
//   동기 조건(sync(ctx)): 게임 화면 DOM 없음(node, smoke), 속도 instant, 프레임 0개, 연습 재생이면 모두 즉시 동기로 끝낸다(예전 동작).
//   비동기면 setTimeout 체인. busy() 공개 중인가, finish() 남은 프레임을 즉시 처리하고 done 1회(빨리 감기),
//   cancel() 남은 프레임과 done을 버림(화면 이탈, 새 핸드). 공개 중 #action-bar에 .revealing, 테이블이나 액션바를 누르면 finish.
//   plan(frames, speed, ctx) → [{ i, delay }](순수, 4.3절 속도표). 배열의 tail 속성 = 마지막 프레임 뒤 done까지의 대기.
//     delay[0] = FIRST_MS(히어로 액션이나 보드 딜 뒤 첫 프레임), delay[i] = 앞 프레임이 머무는 시간(폴드 fold, 연속 폴드 foldRun, 그 밖 action).
//     tail = next가 'hero'면 0(바로 내 차례), 그 밖(스트리트 전환, 핸드 끝)은 street. 합이 cap을 넘으면 비례 축소.
//   speed() 현재 설정(A11y pace, 모르는 값은 tap), cycle() 탭 → 느림 → 보통 → 빠름 → 즉시 순환 저장.
//   (n3 탭 진행) 속도 'tap': 사용자가 누를 때마다 다음 걸음 1개(steps(frames): 프레임 1개 = 1걸음, 연속 폴드는 한 걸음).
//     plan(frames, 'tap', ctx) → [{ i, delay: 0, tap(걸음 시작이면 true) }], steps, tail(내 차례면 0, 스트리트 전환과 핸드 끝은 느림의 street).
//     heroOut이면 자동 진행(느림 속도표, x0.5 없음, 배열에 auto: true). step() 다음 1걸음(시간 모드는 finish와 같다).
//     대기 중에는 다음 좌석에 맥박 테두리(.pace-next, #screen-game[data-pace-next])와 액션바 위 알약 #pace-pill(👆 눌러서 다음, ⏭ 끝까지).
//     테이블, 액션바, 알약 = step, ⏭ = finish. 로그 줄, 승률 칩, 토글, 도크, 차트, 완전 분석, 기록 시트, 완전 분석 좌석 누름은 제 할 일.
//     탭으로 공개가 끝나 내 차례가 되면 GUARD_MS 동안 액션바 탭을 삼킨다(연타가 폴드 버튼에 닿지 않게).
//   migrate() 1회 이전(저장 키 poker_pace_tap_migrated, 기기 키라 백업 제외, poker_pace_toast_seen과 같은 규칙): 저장된 pace가 'normal'(예전 기본)이면
//     'tap'으로 바꾸고 안내 대기('p'). notice()는 그 안내나 첫 순차 공개 안내 글을 한 번 돌려준다(app.js가 토스트로 띄운다).
//   _setEnv({ hasDom, setTimeout, clearTimeout }) 테스트 주입(null이면 원래대로).
//   (n3-C) setGate({ take(how, waitInfo) → bool, label(waitInfo, left) → { html, aria } | null }): 상대 차례 차트(OppChart)가 탭 걸음 앞에 끼는 문.
//     take가 참이면 그 누름은 걸음 대신 차트 넘김(결과를 본 뒤 다음 좌석 차트로)으로 쓰고 공개는 그대로 기다린다. label은 알약과 시트 안 다음 버튼 글.
//     repaint() 알약과 사본 줄 다시 쓰기, mirrorHTML() 폰 차트 시트 .hl-mirror 줄 끝의 '👆 다음 (남은 n)'과 '⏭'(탭 대기일 때만, 누르면 알약과 같다).
// HandLogUI(같은 파일): 액션 로그 줄 #hand-log. app.js의 HandLog 훅 5곳을 그대로 받아(track) 화면용 이벤트를 따로 쌓는다
//   (미션, 보스, 커리어처럼 HandLog가 기록하지 않는 판에서도 보인다). hold() 뒤 reveal(n)은 hold 시점 + n개까지만 보이고
//   reveal()은 전부. 폰은 도크 상단부 첫 줄(36px, MobileUI TOP), 누르면 하단 시트. 데스크톱은 테이블 왼쪽 위 패널(최근 4줄, 누르면 펼침).
// 규약: 로드 때 DOM, localStorage 접근 없음(전부 typeof 가드). 가운뎃점과 긴줄표 없음.
var Pacer = (function() {
  // ms. action 일반 액션, fold 폴드, foldRun 연속 폴드 2번째부터, street 스트리트 전환, cap 한 묶음(한 스트리트 빌런 연속 액션) 합 상한
  var SPEEDS = {
    slow:    { action: 800, fold: 450, foldRun: 300, street: 600, cap: 5000 },
    normal:  { action: 450, fold: 250, foldRun: 180, street: 350, cap: 3000 },
    fast:    { action: 220, fold: 120, foldRun: 90,  street: 150, cap: 1500 },
    instant: { action: 0,   fold: 0,   foldRun: 0,   street: 0,   cap: 0 }
  };
  var ORDER = ['tap', 'slow', 'normal', 'fast', 'instant'];
  var LABEL = { tap: '탭', slow: '느림', normal: '보통', fast: '빠름', instant: '즉시' };
  var FIRST_MS = 150;     // 히어로 액션 뒤 첫 프레임(내 말풍선이 먼저 보이게)
  var HERO_OUT = 0.5;     // 히어로가 폴드한 뒤 빌런끼리 진행은 모든 값 x0.5
  var TOAST_KEY = 'poker_pace_toast_seen';
  // (n3) 탭 모드: 마지막 걸음 뒤 스트리트 전환과 핸드 끝은 느림의 street(마지막 행동을 보고 넘어가게), 히어로 폴드 뒤 자동 진행은 느림 속도표
  var TAP = { street: SPEEDS.slow.street, auto: 'slow', guardMs: 450 };
  var MIGRATE_KEY = 'poker_pace_tap_migrated';
  var SETTINGS_KEY = 'poker_journey_settings';
  var MSG = {
    migrated: '이제 상대 행동은 화면을 누를 때마다 하나씩 나와요. 기록 줄의 👆 탭 버튼으로 자동 속도로 바꿀 수 있어요',
    firstTap: '상대 행동은 화면을 누를 때마다 하나씩 나와요. 기록 줄의 👆 탭 버튼으로 자동 속도로 바꿀 수 있어요',
    first: '상대가 한 명씩 움직여요. 테이블을 누르면 빨리 넘겨요(속도는 ⏩)'
  };
  var POS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

  var _env = { hasDom: null, setTimeout: null, clearTimeout: null };
  var _job = null;        // 진행 중 공개 { frames, hooks, delays, tail, i, timer, mode('timed' | 'tap' | 'auto'), steps }
  var _tapBound = false;
  var _guardUntil = 0;    // 탭으로 공개가 끝나 내 차례가 된 직후 액션바 탭을 삼키는 시각(performance.now 기준, 가상 시계 Date와 무관)
  var _migChecked = false;
  var _seq = 0, _waitKey = '';   // 공개 일련번호, 마지막으로 알린 대기 키('pace:wait' 중복 방지)
  var _gate = null;       // (n3-C) setGate로 건 문 { take, label }

  function _setT(fn, ms) { var f = _env.setTimeout || (typeof setTimeout === 'function' ? setTimeout : null); return f ? f(fn, ms) : (fn(), null); }
  function _clearT(id) { var f = _env.clearTimeout || (typeof clearTimeout === 'function' ? clearTimeout : null); if (f && id != null) f(id); }
  function _setEnv(o) {
    if (!o) { _env = { hasDom: null, setTimeout: null, clearTimeout: null }; return _env; }
    Object.keys(o).forEach(function(k) { _env[k] = o[k]; });
    return _env;
  }
  // 실제 게임 화면이 있는가(node 러너와 smoke는 querySelector가 null)
  function _hasDom() {
    if (_env.hasDom != null) return !!_env.hasDom;
    try { return !!(typeof document !== 'undefined' && document && typeof document.querySelector === 'function' && document.querySelector('#screen-game .poker-table')); }
    catch (e) { return false; }
  }

  function speed() {
    var p = null;
    try { p = (typeof A11y !== 'undefined' && A11y && typeof A11y.load === 'function') ? A11y.load().pace : null; } catch (e) { p = null; }
    return ORDER.indexOf(p) >= 0 ? p : 'tap';
  }
  function label(spd) { return LABEL[spd] || LABEL.tap; }
  // 속도 버튼 앞 기호: 탭은 👆, 자동 속도는 ⏩
  function icon(spd) { return spd === 'tap' ? '👆' : '⏩'; }
  // 다음 속도로 저장하고 새 값을 돌려준다
  //   (n3) 공개 중에 바꾸면 남은 프레임을 새 속도로 이어 간다(즉시는 남은 것을 한 번에)
  function cycle() {
    var nx = ORDER[(ORDER.indexOf(speed()) + 1) % ORDER.length];
    try { if (typeof A11y !== 'undefined' && A11y && typeof A11y.save === 'function') A11y.save({ pace: nx }); } catch (e) { /* noop */ }
    _retime(nx);
    return nx;
  }

  function sync(ctx) {
    ctx = ctx || {};
    if (!_hasDom()) return true;
    if ((ctx.speed || speed()) === 'instant') return true;
    if (ctx.frames && ctx.frames.length === 0) return true;
    if (ctx.practice) return true;
    return false;
  }

  function _act(f) { return (f && f.action && f.action.action) || ''; }
  // 탭 걸음(순수): [[시작, 끝)]. 프레임 1개 = 1걸음, 연속 폴드는 한 걸음으로 묶는다
  function steps(frames) {
    frames = frames || [];
    var out = [], i = 0, n = frames.length;
    while (i < n) {
      var e = i + 1;
      if (_act(frames[i]) === 'fold') while (e < n && _act(frames[e]) === 'fold') e++;
      out.push([i, e]);
      i = e;
    }
    return out;
  }
  // 프레임 i가 화면에 머무는 시간(다음 프레임이나 done까지)
  function _stay(frames, i, sp) {
    if (_act(frames[i]) !== 'fold') return sp.action;
    return (i > 0 && _act(frames[i - 1]) === 'fold') ? sp.foldRun : sp.fold;
  }
  function plan(frames, spd, ctx) {
    frames = frames || [];
    ctx = ctx || {};
    if (spd !== 'tap' && !SPEEDS[spd]) spd = speed();
    if (spd === 'tap') {
      var st = steps(frames), out0;
      if (ctx.heroOut) {   // 히어로 폴드 뒤 빌런끼리: 느림 속도로 자동 진행(x0.5 없음), 누르면 다음 걸음
        out0 = plan(frames, TAP.auto, { next: ctx.next });
        out0.auto = true;
      } else {
        var starts = {};
        st.forEach(function(x) { starts[x[0]] = true; });
        out0 = frames.map(function(f, k) { return { i: k, delay: 0, tap: !!starts[k] }; });
        out0.tail = (frames.length && ctx.next !== 'hero') ? TAP.street : 0;
      }
      out0.steps = st;
      return out0;
    }
    var sp = SPEEDS[spd] || SPEEDS.normal;
    var k = ctx.heroOut ? HERO_OUT : 1;
    var out = [], tail = 0, sum = 0;
    if (sp.cap > 0 && frames.length) {
      for (var i = 0; i < frames.length; i++) out.push({ i: i, delay: (i === 0 ? FIRST_MS : _stay(frames, i - 1, sp)) * k });
      tail = ctx.next === 'hero' ? 0 : sp.street * k;
      out.forEach(function(p) { sum += p.delay; });
      sum += tail;
      var cap = sp.cap * k;
      if (sum > cap) {
        var r = cap / sum;
        out.forEach(function(p) { p.delay = p.delay * r; });
        tail = tail * r;
      }
      out.forEach(function(p) { p.delay = Math.round(p.delay); });
      tail = Math.round(tail);
    } else {
      for (var j = 0; j < frames.length; j++) out.push({ i: j, delay: 0 });
    }
    out.tail = tail;
    return out;
  }

  function _revealing(on) {
    if (typeof document === 'undefined' || !document || typeof document.getElementById !== 'function') return;
    var bar = document.getElementById('action-bar');
    if (bar && bar.classList) bar.classList.toggle('revealing', !!on);
    var sg = document.getElementById('screen-game');
    if (sg && sg.classList) sg.classList.toggle('pace-busy', !!on);
  }
  // 탭 좌표가 액션바 사각형 안인가. 공개 중 액션바는 ActionBar.render가 내 차례가 아닐 때 인라인 pointer-events: none을 두므로
  //   탭의 target이 액션바가 아니라 그 아래 #screen-game이 된다(실측). 좌표로 판정해야 "액션바를 누르면 빨리 감기"가 된다
  function _inActionBar(e) {
    if (!e || typeof e.clientX !== 'number' || typeof document === 'undefined' || !document || typeof document.getElementById !== 'function') return false;
    var bar = document.getElementById('action-bar');
    if (!bar || typeof bar.getBoundingClientRect !== 'function') return false;
    var r = bar.getBoundingClientRect();
    return !!(r && r.width > 0 && r.height > 0 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
  }
  // 누름 제외(제 할 일): 로그 줄, 승률 칩, 토글, 도크, 차트 시트, 완전 분석 시트와 화면, 기록 시트와 그 사본 줄
  //   (데스크톱은 테이블 안 패널: 차트 #gto-chart, 에쿼티 패널, 띵킹 패널과 피드도 읽는 자리라 넘기지 않는다)
  var EXCLUDE = '#hand-log, #eq-chips, #equity-toggle, #m-dock, #gto-sheet, #gto-chart, #equity-overlay, #thinking-panel, #thinking-feed, ' +
    '#omni-panel, #omni-root, #hand-log-sheet, .hl-mirror';
  function _now() {
    try { if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') return performance.now(); } catch (e) { /* noop */ }
    return Date.now();
  }
  // 완전 분석 세션의 좌석 누름은 좌석 시트를 연다(OmniUI). 걸음으로 쓰지 않는다
  function _omniSeat(t) {
    if (!t.closest('#screen-game .poker-table .seat')) return false;
    try { return !!(typeof App !== 'undefined' && App && typeof App.omni === 'function' && App.omni()); } catch (e) { return false; }
  }
  // 탭으로 공개가 끝나 내 차례가 된 직후의 액션바 탭은 삼킨다(빠른 연타가 폴드, 콜 버튼에 닿는 사고 방지)
  function _swallow(e) {
    if (!(_guardUntil > 0) || _now() >= _guardUntil) return false;
    var t = e && e.target;
    if (!(t && typeof t.closest === 'function' && t.closest('#action-bar')) && !_inActionBar(e)) return false;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    return true;
  }
  // 탭 1건 판정: 공개 중이고 테이블(.table-area)이나 액션바(요소 또는 좌표), 알약이면 시간 모드는 finish, 탭과 자동 모드는 step(⏭은 finish).
  //   EXCLUDE와 완전 분석 좌석은 제 할 일
  function _onTap(e) {
    if (!_job) return _swallow(e);
    var t = e && e.target;
    if (!t || typeof t.closest !== 'function') return false;
    var how = null;
    if (t.closest('#pace-pill')) how = t.closest('.pace-skip') ? 'finish' : 'step';
    else if (t.closest('.hl-pace')) how = t.closest('.hl-pace-skip') ? 'finish' : 'step';   // (n3-C) 차트 시트 안 사본 줄의 다음, ⏭
    // (n3 검증) 폰 도크(#m-dock)는 흐름 안 요소라, 길어지면 아래로 붙은 액션바(sticky, z 40) 밑으로 지나간다. 공개 중 액션바는 인라인
    //   pointer-events: none이라 흐린 폴드, 콜 버튼 자리를 눌러도 target이 그 밑 도크 글(용어 풀이 등)이 되어 넘기지 못하고 도크가 열렸다(실측 412x915).
    //   화면에 보이는 것은 액션바이므로, 액션바 사각형 안의 도크 누름은 액션바 누름으로 본다
    else if (t.closest('#m-dock') && _inActionBar(e)) how = _job.mode === 'timed' ? 'finish' : 'step';
    else if (t.closest(EXCLUDE) || _omniSeat(t)) return false;
    else if (!t.closest('#screen-game .table-area, #action-bar') && !_inActionBar(e)) return false;
    else how = _job.mode === 'timed' ? 'finish' : 'step';
    // 액션바와 알약 누름은 여기서 끝낸다(n3 리뷰): 키보드 Enter처럼 포커스된 버튼의 click이 오면 그 onclick(App.heroAction)이
    //   한 번 더 걸음을 넘기거나, 이 누름으로 공개가 끝난 직후 내 액션으로 쓰인다. 테이블 누름은 아래 요소의 자기 일을 그대로 둔다
    if (t.closest('#action-bar, #pace-pill, .hl-pace') || _inActionBar(e)) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    if (how === 'finish') finish(); else step();
    if (!_job) _guardUntil = _now() + TAP.guardMs;
    return true;
  }
  // 테이블이나 액션바 탭 = 빨리 감기(탭 모드는 다음 걸음). 한 번만 건다(캡처 단계, 아래 요소의 자기 일은 그대로 이어진다)
  function _bindTap() {
    if (_tapBound || typeof document === 'undefined' || !document || typeof document.addEventListener !== 'function') return;
    _tapBound = true;
    document.addEventListener('click', _onTap, true);
  }

  // ── 탭 대기 화면: 다음 좌석 맥박 테두리와 액션바 위 알약 #pace-pill(실제 게임 화면에서만) ──
  function _doc() { return (_hasDom() && typeof document !== 'undefined' && document && typeof document.getElementById === 'function' && typeof document.createElement === 'function') ? document : null; }
  function _posOf(f) {
    var a = f && f.action, nm = a && a.name, pre = f && f.pre;
    var p = (pre && pre.players && nm && pre.players[nm] && pre.players[nm].pos) || (a && a.pos) || null;
    return POS.indexOf(p) >= 0 ? p : null;
  }
  function _left(j) { var n = 0; (j.steps || []).forEach(function(s) { if (s[1] > j.i) n++; }); return n; }
  function _markSeat(d, pos) {
    var sg = d.getElementById('screen-game');
    if (sg && sg.setAttribute) { if (pos) sg.setAttribute('data-pace-next', pos); else if (sg.removeAttribute) sg.removeAttribute('data-pace-next'); }
    var olds = d.querySelectorAll ? d.querySelectorAll('#screen-game .seat.pace-next') : [];
    for (var i = 0; i < olds.length; i++) olds[i].classList.remove('pace-next');
    var el = pos ? d.getElementById('seat-' + pos) : null;
    if (el && el.classList) el.classList.add('pace-next');
  }
  function _pillEl(d) {
    var el = d.getElementById('pace-pill');
    if (el) return el;
    if (!d.body) return null;
    el = d.createElement('div');
    el.id = 'pace-pill';
    el.className = 'pace-pill';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', '상대 행동 넘기기');
    el.innerHTML = '<button type="button" class="pace-go" aria-live="polite"></button><button type="button" class="pace-skip" aria-label="상대 행동 끝까지 한 번에 보기">⏭ 끝까지</button>';
    el.style.display = 'none';
    d.body.appendChild(el);
    return el;
  }
  // 알약 자리: 보이는 액션바 바로 위(8px), 액션바 오른쪽 끝에 맞춘다(폰은 16px 여백, 데스크톱은 가운데 내 좌석을 피한다)
  //   레이아웃 읽기는 다음 프레임 직전(rAF)으로 미뤄 결정 동기 블록에 강제 레이아웃을 더하지 않는다(그리기 전이라 깜빡임 없음)
  var _placeQ = false;
  function _placeLater(d, el) {
    var raf = (typeof window !== 'undefined' && window && typeof window.requestAnimationFrame === 'function') ? window.requestAnimationFrame : null;
    if (!raf) { _placePill(d, el); return; }
    if (_placeQ) return;
    _placeQ = true;
    raf(function() { _placeQ = false; try { if (el.style.display !== 'none') _placePill(d, el); } catch (e) { /* noop */ } });
  }
  function _focusNow(d, go) {
    var ae = d.activeElement, el = d.getElementById('pace-pill');
    if (!el || el.style.display === 'none' || !el.contains || !el.contains(go)) return false;
    if (ae === go || typeof go.focus !== 'function') return false;
    if (ae && ae !== d.body && !(typeof ae.closest === 'function' && ae.closest('#action-bar'))) return false;
    try { go.focus({ preventScroll: true }); } catch (e) { return false; }
    return true;
  }
  function _focusLater(d, go) {   // 겹쳐 불러도 rAF마다 조건을 다시 보므로 한 번만 옮긴다(막힌 깃발이 남지 않게 묶지 않는다)
    var raf = (typeof window !== 'undefined' && window && typeof window.requestAnimationFrame === 'function') ? window.requestAnimationFrame : null;
    if (!raf) { _focusNow(d, go); return; }
    raf(function() { try { _focusNow(d, go); } catch (e) { /* noop */ } });
  }
  function _placePill(d, el) {
    if (typeof window === 'undefined' || !window || !window.innerHeight) return;
    var bar = d.getElementById('action-bar'), r = null;
    if (bar && bar.style && bar.style.display !== 'none' && bar.offsetHeight > 0 && bar.getBoundingClientRect) r = bar.getBoundingClientRect();
    var W = window.innerWidth || (d.documentElement && d.documentElement.clientWidth) || 0;
    // (n3-C) 폰 차트 시트가 접혀(손잡이 44px만) 액션바 바로 위에 있으면 알약을 손잡이 위로 올린다(시트 z 35가 알약 z 34를 덮던 자리).
    //   접힘 전환 애니메이션 중에도 맞게 사각형 대신 손잡이 높이(44px)로 센다. 펼친 시트는 시트 안 사본 줄의 다음 버튼을 쓴다
    var sh = d.getElementById('gto-sheet'), lift = 0;
    if (sh && sh.style && sh.style.display !== 'none' && sh.classList && sh.classList.contains('peek')) lift = 44;
    el.style.bottom = Math.max(8, Math.round(window.innerHeight - (r ? r.top : window.innerHeight) + 8 + lift)) + 'px';
    el.style.right = Math.max(16, Math.round(W - (r ? r.right : W) + 16)) + 'px';
  }
  // 대기 정보(C: 상대 차례에 그 사람 입장 차트가 쓴다). 탭 대기와 자동 진행(heroOut) 중 다음에 움직일 좌석, 끝났거나 시간 모드면 null
  //   seat = 그 좌석 이름, pos = 포지션, remaining = 남은 걸음 수(이번 걸음 포함), auto = 자동 진행 중, state = 그 좌석이 결정하기 직전 상태(엔진 상태, 바꾸지 말 것)
  function _waitInfo(j) {
    if (!j || j.mode === 'timed' || j.i >= j.frames.length) return null;
    var f = j.frames[j.i], a = (f && f.action) || {};
    return { seat: a.name || null, pos: _posOf(f), remaining: _left(j), auto: j.mode === 'auto', state: (f && f.pre) || null, index: j.i };
  }
  // 'pace:wait' 이벤트(document, detail = waiting()): 대기 좌석이 바뀌거나 대기가 끝날 때(null) 한 번씩
  function _emit(j) {
    var w = _waitInfo(j), key = w ? (j.id + ':' + w.index + ':' + (w.auto ? 'a' : 't')) : '';
    if (key === _waitKey) return false;
    _waitKey = key;
    try {
      if (typeof document === 'undefined' || !document || typeof document.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return false;
      document.dispatchEvent(new CustomEvent('pace:wait', { detail: w }));
    } catch (e) { return false; }
    return true;
  }
  function _ui(j) {
    _emit(j);
    var d;
    try { d = _doc(); } catch (e) { d = null; }
    if (!d) return false;
    try {
      var waiting = !!(j && j.mode !== 'timed' && j.i < j.frames.length);
      var pos = waiting ? _posOf(j.frames[j.i]) : null;
      _markSeat(d, pos);
      _mirrors();
      var el = waiting ? _pillEl(d) : d.getElementById('pace-pill');
      if (!el) return false;
      if (!waiting) { el.style.display = 'none'; return true; }
      var go = el.querySelector('.pace-go'), left = _left(j), lab = j.mode === 'tap' ? _gateLabel(j, left) : null;
      var html = j.mode === 'auto' ? '👆 자동 진행 중, 누르면 다음'
        : (lab && lab.html) || ('👆 눌러서 다음' + (pos ? ': <b>' + pos + '</b>' : '') + ' <span class="pace-left">(남은 ' + left + ')</span>');
      if (go && go.innerHTML !== html) go.innerHTML = html;
      if (go) go.setAttribute('aria-label', j.mode === 'auto' ? '상대끼리 자동 진행 중, 누르면 다음 행동' : (lab && lab.aria) || ('눌러서 다음 상대 행동 보기' + (pos ? ', ' + pos : '') + ', 남은 ' + left + '번'));
      el.classList.toggle('pace-auto', j.mode === 'auto');
      el.style.display = '';
      // 키보드: 방금 누른 액션 버튼(흐려져 못 쓰는 바 안)에 포커스가 남아 있거나, 앞 대기의 알약이 숨으며 포커스가 body로 빠졌으면
      //   알약의 다음 버튼으로 옮긴다(Enter, Space로 이어 넘기기). 다른 요소(기록 줄, 시트 등)를 보고 있으면 건드리지 않는다
      //   (n3 검증) focus()는 차트와 테이블을 막 고친 뒤라 스타일과 레이아웃을 강제해(412x915, CPU 4배: 결정 동기 블록 평균 35ms, p90 86ms로 예산 40 초과)
      //   알약 자리 잡기와 같은 다음 프레임 직전으로 미룬다. 그때 다시 조건을 본다(그사이 다른 곳을 눌렀으면 그대로)
      if (go) _focusLater(d, go);
      _placeLater(d, el);
      return true;
    } catch (e) { return false; }
  }

  // (n3-C) 문(OppChart)의 글. 없거나 실패면 null(원래 글)
  function _gateLabel(j, left) {
    if (!_gate || typeof _gate.label !== 'function') return null;
    try { return _gate.label(_waitInfo(j), left) || null; } catch (e) { return null; }
  }
  // 폰 차트 시트 안 사본 줄(.hl-mirror)을 다시 쓴다(HandLogUI가 줄 글 + mirrorHTML을 넣는다)
  function _mirrors() {
    try { if (typeof HandLogUI !== 'undefined' && HandLogUI && typeof HandLogUI.syncMirrors === 'function') HandLogUI.syncMirrors(); } catch (e) { /* noop */ }
  }
  // 사본 줄 끝의 다음, ⏭ 버튼(탭 대기일 때만). 누르면 _onTap이 알약과 같이 처리한다
  function mirrorHTML() {
    var j = _job;
    if (!j || j.mode !== 'tap' || j.i >= j.frames.length) return '';
    var left = _left(j), w = _waitInfo(j), lab = _gateLabel(j, left);
    var aria = (lab && lab.aria) || ('눌러서 다음 상대 행동 보기' + (w && w.pos ? ', ' + w.pos : '') + ', 남은 ' + left + '번');
    return '<span class="hl-pace" role="group" aria-label="상대 행동 넘기기"><button type="button" class="hl-pace-go" aria-label="' + aria + '">👆 다음 <span class="pace-left">(남은 ' + left + ')</span></button>' +
      '<button type="button" class="hl-pace-skip" aria-label="상대 행동 끝까지 한 번에 보기">⏭</button></span>';
  }
  function setGate(g) { _gate = (g && typeof g === 'object') ? g : null; return !!_gate; }
  function repaint() { return _ui(_job); }

  function _call(fn, a, b) {
    try { fn(a, b); } catch (e) { if (typeof console !== 'undefined' && console.error) console.error('[Pacer]', e); }
  }
  function _end() {
    var j = _job;
    if (!j) return;
    _clearT(j.timer);
    _job = null;
    _ui(null);
    _revealing(false);
    if (typeof j.hooks.done === 'function') j.hooks.done();
  }
  function _show(j, upTo) {
    while (j.i < upTo && _job === j) {
      var i = j.i++;
      if (typeof j.hooks.frame === 'function') _call(j.hooks.frame, j.frames[i], i);
    }
  }
  function _next() {
    var j = _job;
    if (!j) return;
    if (j.i >= j.frames.length) {
      if (j.mode !== 'timed') _ui(null);
      if (j.tail > 0) j.timer = _setT(function() { if (_job === j) _end(); }, j.tail);
      else _end();
      return;
    }
    if (j.mode === 'tap') { _ui(j); return; }   // 누를 때까지 기다린다
    if (j.mode === 'auto') _ui(j);
    j.timer = _setT(function() {
      if (_job !== j) return;
      _show(j, j.i + 1);
      _next();
    }, j.delays[j.i].delay);
  }
  // 걸음 끝(현재 j.i가 든 걸음의 끝 인덱스)
  function _stepEnd(j) {
    var st = j.steps || [];
    for (var k = 0; k < st.length; k++) if (j.i >= st[k][0] && j.i < st[k][1]) return st[k][1];
    return j.i + 1;
  }

  function run(frames, hooks, ctx) {
    frames = frames || [];
    hooks = hooks || {};
    ctx = ctx || {};
    if (_job) finish();   // 앞 공개가 남았으면(정상 흐름에서는 없음) 먼저 끝낸다
    var spd = ctx.speed || speed();
    if (sync({ frames: frames, practice: ctx.practice, speed: spd })) {
      for (var i = 0; i < frames.length; i++) if (typeof hooks.frame === 'function') hooks.frame(frames[i], i);
      if (typeof hooks.done === 'function') hooks.done();
      return true;
    }
    var p = plan(frames, spd, ctx);
    var mode = p.steps ? (p.auto ? 'auto' : 'tap') : 'timed';
    _job = { id: ++_seq, frames: frames, hooks: hooks, delays: p, tail: p.tail || 0, i: 0, timer: null, mode: mode, steps: p.steps || null, ctx: ctx };
    _guardUntil = 0;
    _revealing(true);
    _bindTap();
    _next();
    return true;
  }
  function busy() { return !!_job; }
  // 진행 중 공개를 새 속도로 다시 짠다(이미 보인 프레임은 그대로). 즉시면 finish
  function _retime(spd) {
    var j = _job;
    if (!j) return false;
    if (spd === 'instant') return finish();
    var p = plan(j.frames, spd, j.ctx || {});
    _clearT(j.timer);
    j.timer = null;
    j.delays = p; j.tail = p.tail || 0; j.steps = p.steps || null; j.mode = p.steps ? (p.auto ? 'auto' : 'tap') : 'timed';
    if (j.mode === 'timed') _ui(null);
    _next();
    return true;
  }
  // 대기 중인 다음 좌석 { seat, pos, remaining, auto, state, index } 또는 null(_waitInfo). 시간 모드와 마지막 걸음 뒤 대기(tail)는 null
  function waiting() { return _waitInfo(_job); }
  // 다음 1걸음(탭, 자동 모드). 시간 모드와 마지막 걸음 뒤 대기는 finish와 같다
  function step() {
    var j = _job;
    if (!j) return false;
    if (j.mode === 'timed' || j.i >= j.frames.length) return finish();
    if (j.mode === 'tap' && _gate && typeof _gate.take === 'function') {   // (n3-C) 이 누름은 차트 넘김(공개는 그대로 대기)
      var took = false;
      try { took = !!_gate.take('step', _waitInfo(j)); } catch (e) { took = false; }
      if (took) { _ui(j); return true; }
    }
    _clearT(j.timer);
    j.timer = null;
    _show(j, _stepEnd(j));
    if (_job === j) _next();
    return true;
  }
  function finish() {
    var j = _job;
    if (!j) return false;
    _clearT(j.timer);
    j.timer = null;
    _show(j, j.frames.length);
    if (_job === j) _end();
    return true;
  }
  function cancel() {
    var j = _job;
    if (!j) return false;
    _clearT(j.timer);
    _job = null;
    _ui(null);
    _revealing(false);
    return true;
  }
  function _ls() { try { return (typeof localStorage !== 'undefined' && localStorage) ? localStorage : null; } catch (e) { return null; } }
  // 첫 순차 공개 안내를 띄울 차례인가(한 번만 true, 저장 키 poker_pace_toast_seen)
  function toastOnce() {
    var ls = _ls();
    if (!ls) return false;
    try { if (ls.getItem(TOAST_KEY)) return false; ls.setItem(TOAST_KEY, '1'); return true; } catch (e) { return false; }
  }
  // (n3) 1회 이전: 저장된 pace가 'normal'(예전 기본)이고 이전 기록이 없으면 'tap'으로 바꾸고 안내 대기('p'). 느림, 빠름, 즉시를 고른 사람은 그대로.
  //   pace 값이 없고 예전 순차 공개 안내를 본 사람(예전 기본 보통을 겪음)은 값이 이미 새 기본(탭)이므로 안내만 대기. 새로 설치면 기록만 남긴다.
  //   한 페이지에서 한 번만 본다(브라우저는 DOMContentLoaded, node 테스트는 직접 부른다). → 'tap'(바꿨거나 안내 대기) | null
  function migrate() {
    if (_migChecked) return null;
    var ls = _ls();
    if (!ls) return null;
    _migChecked = true;
    try {
      if (ls.getItem(MIGRATE_KEY)) return null;
      var raw = null;
      try { raw = JSON.parse(ls.getItem(SETTINGS_KEY) || 'null'); } catch (e) { raw = null; }
      var old = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw.pace : undefined, moved = false;
      if (old === 'normal') {
        if (typeof A11y !== 'undefined' && A11y && typeof A11y.save === 'function') A11y.save({ pace: 'tap' });
        else { raw.pace = 'tap'; ls.setItem(SETTINGS_KEY, JSON.stringify(raw)); }
        moved = true;
      } else if (old == null && ls.getItem(TOAST_KEY)) moved = true;
      ls.setItem(MIGRATE_KEY, moved ? 'p' : '1');
      return moved ? 'tap' : null;
    } catch (e) { return null; }
  }
  // 이번 공개에 띄울 안내 글(한 번만): 이전 안내(아직 탭이면), 아니면 첫 순차 공개 안내(속도에 맞춘 글). 없으면 null
  function notice() {
    var ls = _ls();
    if (!ls) return null;
    try {
      if (ls.getItem(MIGRATE_KEY) === 'p') {
        ls.setItem(MIGRATE_KEY, '1');
        if (speed() === 'tap') { ls.setItem(TOAST_KEY, '1'); return MSG.migrated; }
      }
    } catch (e) { return null; }
    if (!toastOnce()) return null;
    return speed() === 'tap' ? MSG.firstTap : MSG.first;
  }
  if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') window.addEventListener('DOMContentLoaded', function() { migrate(); });

  var api = { SPEEDS: SPEEDS, ORDER: ORDER.slice(), LABEL: LABEL, FIRST_MS: FIRST_MS, HERO_OUT: HERO_OUT, TOAST_KEY: TOAST_KEY,
    TAP: TAP, MIGRATE_KEY: MIGRATE_KEY, MSG: MSG,
    speed: speed, label: label, icon: icon, cycle: cycle, sync: sync, plan: plan, steps: steps, run: run, busy: busy, waiting: waiting,
    step: step, finish: finish, cancel: cancel, toastOnce: toastOnce, migrate: migrate, notice: notice,
    setGate: setGate, repaint: repaint, mirrorHTML: mirrorHTML,
    _setEnv: _setEnv, _hasDom: _hasDom, _onTap: _onTap, _ui: _ui,
    _migrateReset: function() { _migChecked = false; }, _guardReset: function() { _guardUntil = 0; } };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();

// 액션 로그 줄 #hand-log(설계 4.4절 2~4번). 데이터는 app.js의 HandLog 훅 인자를 그대로 받아 화면용으로 따로 쌓는다
var HandLogUI = (function() {
  var _ev = [], _pos = {}, _shown = 0, _base = null, _open = false, _el = null, _sheet = null;
  var LIGHT = { green: '🟢', yellow: '🟡', red: '🔴' };
  var TRACK = { begin: 1, villain: 1, hero: 1, street: 1, note: 1, end: 1 };

  function _r1(x) { return Math.round((Number(x) || 0) * 10) / 10; }
  function _cs(cards) { return (cards || []).map(function(c) { return c ? (typeof c === 'string' ? c : c.rank + c.suit) : ''; }); }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; });
  }
  function _AT() { return (typeof ActionText !== 'undefined' && ActionText && typeof ActionText.line === 'function') ? ActionText : null; }
  function _color(h) { return (typeof Cards !== 'undefined' && Cards && typeof Cards.colorize === 'function') ? Cards.colorize(h) : h; }
  function _doc() { return (typeof document !== 'undefined' && document && typeof document.getElementById === 'function') ? document : null; }
  function _mobile() { try { return !!(typeof MobileUI !== 'undefined' && MobileUI && MobileUI.isMobile && MobileUI.isMobile()); } catch (e) { return false; } }

  // hold 중(공개 전)에 쌓이는 이벤트는 보이는 내용이 안 바뀌니 다시 그리지 않는다(결정 동기 블록 안에서 걸음 수만큼 innerHTML을 쓰지 않게)
  function _push(ev) {
    _ev.push(ev);
    if (_base == null) { _shown = _ev.length; render(); }
    return ev;
  }

  // app.js _hl(name, ...)과 같은 인자. 화면용 이벤트(ActionText.line 모양)를 쌓는다
  function track(name, a1, a2, a3) {
    if (!TRACK[name]) return null;
    if (name === 'begin') {
      var st = a1 && a1.state;
      _ev = []; _pos = {}; _shown = 0; _base = null;
      if (st && st.players) Object.keys(st.players).forEach(function(n) { var p = st.players[n]; if (p && p.pos) _pos[n] = p.pos; });
      if (st) return _push({ k: 's', st: 'preflop', board: [], pot: _r1(st.pot) });
      render();
      return null;
    }
    if (name === 'villain') {
      var v = a1 || {};
      return _push({ k: 'a', st: (a2 && a2.street) || null, n: v.name, act: v.action, amt: _r1(v.amount), lbl: v.label || null });
    }
    if (name === 'hero') {
      var o = a1 || {}, pre = o.pre || {}, post = o.post || {}, act = o.executed || o.intended || null;
      var had = (pre.playerBets && pre.playerBets.Hero) || 0, now = post.playerBets && post.playerBets.Hero, amt = 0;
      if (act === 'call') amt = now != null ? now - had : 0;
      else if (act === 'raise' || act === 'allin' || act === 'bet') amt = now != null ? now : (o.amount || 0);
      return _push({ k: 'a', st: pre.street || null, n: 'Hero', act: act, amt: _r1(amt), lbl: null, light: (o.grade && o.grade.light) || null });
    }
    if (name === 'street') {
      if (!a1) return null;
      return _push({ k: 's', st: a1.street || null, board: _cs(a1.board), pot: _r1(a1.pot) });
    }
    if (name === 'note') {
      var ev = { k: 'n', kind: String(a1 || '') };
      if (a2 && typeof a2 === 'object') Object.keys(a2).forEach(function(k) { if (k !== 'k' && k !== 'kind') ev[k] = a2[k]; });
      return _push(ev);
    }
    if (name === 'end') {
      var s = (a1 && a1.settled) || {}, r = (a1 && a1.result) || {};
      return _push({ k: 'e', winner: r.winner != null ? r.winner : null, payouts: s.payouts || {}, desc: r.handDescriptions || {}, showdown: !!r.showCards });
    }
    return null;
  }

  // 지금부터 쌓이는 이벤트는 reveal(n)이 풀 때까지 숨긴다(엔진은 먼저 끝났지만 화면 공개 전)
  function hold() { _base = _shown; return _base; }
  // reveal(n): hold 시점 + n개까지 보임. 인자 없으면 전부(hold 해제). 보이는 이벤트 수를 돌려준다
  function reveal(upTo) {
    if (upTo == null) { _base = null; _shown = _ev.length; }
    else _shown = Math.max(0, Math.min(_ev.length, (_base || 0) + upTo));
    render();
    return _shown;
  }
  function events() { return _ev.slice(0, _shown); }
  function pending() { return _ev.length - _shown; }   // 쌓였지만 아직 공개 안 된 이벤트 수
  function count() { var n = 0; for (var i = 0; i < _shown; i++) if (_ev[i].k === 'a') n++; return n; }

  function lineText(ev) { var AT = _AT(); return AT ? AT.line(ev, { pos: _pos }) : ''; }
  function rowHTML(ev) {
    var AT = _AT();
    if (!AT || !ev) return '';
    var txt = _color(_esc(lineText(ev)));
    if (ev.k === 's') return '<div class="hl-row hl-street">' + txt + '</div>';
    if (ev.k === 'e') return '<div class="hl-row hl-end">🏁 ' + txt + '</div>';
    if (ev.k === 'n') return '<div class="hl-row hl-note">' + txt + '</div>';
    var key = AT.actKey(ev);
    return '<div class="hl-row ' + (AT.cls(key) || '') + (ev.n === 'Hero' ? ' hl-hero' : '') + '"><span class="hl-ic" aria-hidden="true">' + AT.icon(key) + '</span>' +
      txt + (ev.light && LIGHT[ev.light] ? ' ' + LIGHT[ev.light] : '') + '</div>';
  }
  function listHTML() { return events().map(rowHTML).join(''); }
  // 접힌 줄: [횟수][마지막 공개 이벤트][⏩ 속도](탭 모드는 👆 탭). title이 참이면(데스크톱 패널, 아래 목록이 최근 줄을 보인다) 글은 제목만
  function lineHTML(title) {
    var ev = (!title && _shown > 0) ? _ev[_shown - 1] : null;
    var AT = _AT(), cls = '', ic = '';
    if (ev && ev.k === 'a' && AT) { var key = AT.actKey(ev); cls = AT.cls(key); ic = AT.icon(key); }
    var txt = ev ? _color(_esc(lineText(ev))) + (ev.light && LIGHT[ev.light] ? ' ' + LIGHT[ev.light] : '') : '이번 핸드 기록';
    var spd = Pacer.speed();
    return '<button type="button" class="hl-line" aria-expanded="' + (_open ? 'true' : 'false') + '" aria-label="이번 핸드 액션 기록 ' + (_open ? '접기' : '펼치기') + '">' +
      '<span class="hl-count" aria-hidden="true">' + count() + '</span>' +
      '<span class="hl-text ' + cls + '">' + (ic ? '<span class="hl-ic" aria-hidden="true">' + ic + '</span>' : '') + txt + '</span>' +
      '<span class="hl-arrow" aria-hidden="true">' + (_open ? '▴' : '▾') + '</span></button>' +
      '<button type="button" class="hl-speed" data-pace="' + spd + '" aria-label="상대 액션 속도 ' + Pacer.label(spd) + ', 누르면 바꿔요">' + Pacer.icon(spd) + ' ' + Pacer.label(spd) + '</button>';
  }

  // #hand-log를 만든다(없으면). 게임 화면 .table-area 안, 폰이면 MobileUI가 도크 상단부로 옮긴다
  function ensure() {
    var d = _doc();
    if (!d || !d.createElement || !Pacer._hasDom()) return null;
    var el = d.getElementById('hand-log');
    if (el && el.nodeType) { _el = el; return el; }
    var area = d.querySelector ? d.querySelector('#screen-game .table-area') : null;
    if (!area || !area.insertBefore) return null;
    el = d.createElement('div');
    el.id = 'hand-log';
    el.className = 'hand-log';
    el.setAttribute('role', 'log');
    el.setAttribute('aria-live', 'off');
    el.innerHTML = '<div class="hl-head"></div><div class="hl-list"></div>';
    area.insertBefore(el, area.firstChild);
    el.addEventListener('click', _onClick);
    _el = el;
    return el;
  }
  function _ensureSheet() {
    var d = _doc();
    if (!d || !d.body || !d.createElement) return null;
    if (_sheet && _sheet.parentNode) return _sheet;
    _sheet = d.getElementById('hand-log-sheet');
    if (_sheet) return _sheet;
    _sheet = d.createElement('div');
    _sheet.id = 'hand-log-sheet';
    _sheet.className = 'hl-sheet';
    _sheet.setAttribute('role', 'dialog');
    _sheet.setAttribute('aria-label', '이번 핸드 액션 기록');
    _sheet.innerHTML = '<button type="button" class="hl-sheet-handle" aria-label="기록 접기"><span class="hl-sheet-grip" aria-hidden="true"></span>' +
      '<span class="hl-sheet-title">이번 핸드 기록</span><span aria-hidden="true">▾</span></button><div class="hl-sheet-body"></div>';
    _sheet.style.display = 'none';
    d.body.appendChild(_sheet);
    _sheet.addEventListener('click', function(e) { if (e.target && e.target.closest && e.target.closest('.hl-sheet-handle')) toggle(false); });
    return _sheet;
  }

  function _onClick(e) {
    var t = e && e.target;
    if (!t || !t.closest) return;
    if (t.closest('.hl-speed')) { e.stopPropagation && e.stopPropagation(); speedTap(); return; }
    if (t.closest('.hl-line') || t.closest('.hl-list')) toggle();
  }
  function toggle(on) {
    _open = (on == null) ? !_open : !!on;
    render();
    return _open;
  }
  function speedTap() {
    var nx = Pacer.cycle();
    if (typeof App !== 'undefined' && App && typeof App.toast === 'function') { try { App.toast('진행 속도: ' + Pacer.label(nx)); } catch (e) { /* noop */ } }
    render();
    return nx;
  }

  // 그리기: 줄 + (데스크톱) 목록 + (폰, 펼침) 하단 시트. 게임 화면이 없으면(node) 아무 일 없음
  function render() {
    var el = _el && _el.parentNode ? _el : ensure();
    if (!el) return false;
    var head = el.querySelector ? el.querySelector('.hl-head') : null, list = el.querySelector ? el.querySelector('.hl-list') : null;
    var mob = _mobile();
    if (head) head.innerHTML = lineHTML(!mob);
    el.classList.toggle('hl-open', _open && !mob);
    if (list) {
      list.innerHTML = mob ? '' : listHTML();
      if (!mob) list.scrollTop = _open ? list.scrollTop : 1e6;   // 접힘은 최근 줄이 보이게 맨 아래
    }
    // 띵킹 피드(데스크톱 왼쪽 위)가 보이면 그 아래로
    var d = _doc(), feed = d && d.getElementById('thinking-feed');
    el.classList.toggle('has-feed', !mob && !!(feed && feed.style && feed.style.display !== 'none' && feed.innerHTML && feed.innerHTML.replace(/\s+/g, '')));
    _renderMirrors(d, mob);
    if (mob && _open) {
      var sh = _ensureSheet();
      if (sh) {
        sh.style.display = '';
        _placeSheet(sh);
        var b = sh.querySelector('.hl-sheet-body');
        if (b) { b.innerHTML = listHTML() || '<div class="hl-row hl-note">아직 기록이 없어요</div>'; b.scrollTop = 1e6; }
      }
    } else if (_sheet) _sheet.style.display = 'none';
    return true;
  }

  // (n2b) 같은 줄 사본(.hl-mirror): 폰 차트 시트(#gto-sheet)가 도크의 로그 줄과 속도 버튼을 덮으므로 시트 손잡이 아래에 같은 줄을 둔다
  //   (ui/gto-chart.js가 자리를 만든다). 누르면 원본과 같다(줄 = 기록 시트 펼치기, ⏩ = 속도 바꾸기). 데스크톱은 비운다
  function _renderMirrors(d, mob) {
    if (!d || typeof d.querySelectorAll !== 'function') return 0;
    var pace = mob ? Pacer.mirrorHTML() : '';   // (n3-C) 탭 대기면 줄 끝에 다음, ⏭(시트를 닫지 않고 넘긴다)
    var ms = d.querySelectorAll('.hl-mirror'), html = mob ? lineHTML(false) + pace : '';
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (!m) continue;
      if (m.innerHTML !== html) m.innerHTML = html;
      if (m.classList) m.classList.toggle('has-pace', !!pace);
      if (!m.__hlBound && typeof m.addEventListener === 'function') { m.__hlBound = true; m.addEventListener('click', _onClick); }
    }
    return ms.length;
  }

  // 시트 아래끝 = 보이는 액션바(또는 결과바) 위끝. 액션바를 덮지 않는다(mobile-check n05)
  function _placeSheet(sh) {
    var d = _doc();
    if (!d || typeof window === 'undefined' || !window.innerHeight) return;
    var bar = null;
    ['action-bar', 'result-actions-bar'].forEach(function(id) {
      var b = d.getElementById(id);
      if (b && b.style && b.style.display !== 'none' && b.offsetHeight > 0) bar = b;
    });
    var top = bar && bar.getBoundingClientRect ? bar.getBoundingClientRect().top : window.innerHeight;
    sh.style.bottom = Math.max(0, Math.round(window.innerHeight - top)) + 'px';
    sh.style.maxHeight = Math.max(160, Math.round(top - 8)) + 'px';
  }

  function onNewHand() { _open = false; render(); }

  var api = { track: track, hold: hold, reveal: reveal, events: events, pending: pending, count: count, lineText: lineText, rowHTML: rowHTML, listHTML: listHTML,
    lineHTML: lineHTML, ensure: ensure, toggle: toggle, speedTap: speedTap, render: render, onNewHand: onNewHand, renderMirrors: _renderMirrors,
    syncMirrors: function() { return _renderMirrors(_doc(), _mobile()); },
    _reset: function() { _ev = []; _pos = {}; _shown = 0; _base = null; _open = false; } };
  return api;
})();
