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
//     대기 중에는 다음 좌석에 맥박 테두리(.pace-next, #screen-game[data-pace-next]). (n4) 진행 버튼은 하단 #next-bar(아래 n4 줄).
//     테이블, 액션바, 알약 = step, ⏭ = finish. 로그 줄, 승률 칩, 토글, 도크, 차트, 완전 분석, 기록 시트, 완전 분석 좌석 누름은 제 할 일.
//     탭으로 공개가 끝나 내 차례가 되면 GUARD_MS 동안 액션바 탭을 삼킨다(연타가 폴드 버튼에 닿지 않게).
//   migrate() 1회 이전(저장 키 poker_pace_tap_migrated, 기기 키라 백업 제외, poker_pace_toast_seen과 같은 규칙): 저장된 pace가 'normal'(예전 기본)이면
//     'tap'으로 바꾸고 안내 대기('p'). notice()는 그 안내나 첫 순차 공개 안내 글을 한 번 돌려준다(app.js가 토스트로 띄운다).
//   _setEnv({ hasDom, setTimeout, clearTimeout }) 테스트 주입(null이면 원래대로).
//   (n3-C) setGate({ take(how, waitInfo) → bool, label(waitInfo, left) → { html, aria } | null }): 상대 차례 차트(OppChart)가 탭 걸음 앞에 끼는 문.
//     take가 참이면 그 누름은 걸음 대신 차트 넘김(결과를 본 뒤 다음 좌석 차트로)으로 쓰고 공개는 그대로 기다린다. label은 알약과 시트 안 다음 버튼 글.
//     repaint() 알약과 사본 줄 다시 쓰기, mirrorHTML() 폰 차트 시트 .hl-mirror 줄 끝의 '👆 다음 (남은 n)'과 '⏭'(탭 대기일 때만, 누르면 알약과 같다).
//   (n4-P0, 설계 docs/NEXT4_DESIGN.md 2.3절, 6.1절 3번 8항) 계약: waiting()과 'pace:wait' detail에 kind('seat', 게이트 대기는 G1이 'street', 'showdown'),
//     hold(kind, info, resume) 프레임 없는 대기(스텁: 바로 resume, false), skipHand() 핸드 끝까지(스텁 false), skipping() 스텁 false,
//     armGuard(ms) 액션바 탭 삼킴 시각 세우기(완성, 기본 TAP.guardMs 450, ⏭은 TAP.skipGuardMs 600), labelFor(w) → { html, aria } 대기 글(지금 알약 글 모양).
//     EXCLUDE에 좌석 상자(좌석 누름은 걸음이 아니다, 4.1절, G3 SeatChart가 받는다)와 #next-bar(NextBar가 직접 처리)를 더했다.
//   (n4 G1 NAV, 설계 1.2절, 2.2~2.6절, 결정 59, 60, 66) 알약 #pace-pill과 시트 사본 줄의 다음, ⏭을 없애고 하단 주 진행 바 #next-bar(ui/next-bar.js NextBar)가 맡는다.
//     _ui는 좌석 표시와 사본 줄 글을 고친 뒤 NextBar.update(waiting())를 부른다(typeof 가드, 없으면 'pace:wait'만). mirrorHTML()은 늘 빈 문자열(호출 호환).
//     탭 걸음: 상대 행동(연속 폴드 묶음), 스트리트 전환과 쇼다운(app.js _gate → hold), 내 폴드 뒤 상대끼리도 자동 진행 없이 누른다(plan tap에 auto 없음).
//     tail(탭): 내 차례, 스트리트 전환(게이트가 받는다), 쇼다운으로 끝(ctx.showdown)은 0, 폴드로 끝나는 핸드만 600(마지막 폴드를 보고 넘어가게).
//     remaining = 앞으로 행동할 사람 수(남은 프레임의 서로 다른 좌석 수, 묶음 여부를 미리 드러내지 않는다).
//     hold(kind, info, resume): 프레임 없는 대기(kind 'street' | 'showdown'). step()과 finish()가 resume을 1회 부르고 cancel()은 버린다.
//     skipHand(): 이번 핸드를 내 차례나 끝까지 빠르게(뒤따르는 run과 hold는 동기, 내 차례가 오면 풀고 액션바 탭을 600ms 삼킨다). cancel()이 푼다(새 핸드).
//     armGuard(ms): 액션바 탭 삼킴 + #action-bar.guard(css/pace.css가 버튼을 흐린다), 끝나면 클래스를 지운다. 걸음이 내 차례에 닿으면 Pacer가 직접 세운다.
//     mode() 지금 작업 모양('tap' | 'timed' | null), tailing() 탭 마지막 걸음 뒤 대기 중, labelFor(w, { short }) → { html, sub, aria }(2.5절 표).
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
  var TAP = { street: SPEEDS.slow.street, auto: 'slow', guardMs: 450, skipGuardMs: 600 };   // (n4-P0) skipGuardMs: ⏭으로 내 차례에 닿았을 때 삼킴
  var MIGRATE_KEY = 'poker_pace_tap_migrated';
  var SETTINGS_KEY = 'poker_journey_settings';
  var MSG = {
    // (n4 G1) 진행은 하단 ▶ 버튼(#next-bar) 하나로 모였다(테이블 펠트 누름도 그대로 1걸음)
    migrated: '이제 상대 행동은 아래 ▶ 버튼을 누를 때마다 하나씩 나와요. 기록 줄의 👆 탭 버튼으로 자동 속도로 바꿀 수 있어요',
    firstTap: '상대 행동은 아래 ▶ 버튼을 누를 때마다 하나씩 나와요. 기록 줄의 👆 탭 버튼으로 자동 속도로 바꿀 수 있어요',
    first: '상대가 한 명씩 움직여요. 아래 ⏩ 버튼을 누르면 빨리 넘겨요(속도는 기록 줄 버튼)'
  };
  var POS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

  var _env = { hasDom: null, setTimeout: null, clearTimeout: null };
  var _job = null;        // 진행 중 공개 { frames, hooks, delays, tail, i, timer, mode('timed' | 'tap' | 'auto'), steps }
  var _tapBound = false;
  var _guardUntil = 0;    // 탭으로 공개가 끝나 내 차례가 된 직후 액션바 탭을 삼키는 시각(performance.now 기준, 가상 시계 Date와 무관)
  var _migChecked = false;
  var _seq = 0, _waitKey = '';   // 공개 일련번호, 마지막으로 알린 대기 키('pace:wait' 중복 방지)
  var _gate = null;       // (n3-C) setGate로 건 문 { take, label }
  var _skip = null;       // (n4) skipHand로 건 '핸드 끝까지' { key: 핸드 키 }. cancel()이 푼다
  var _guardTimer = null; // (n4) #action-bar.guard를 지우는 타이머

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
      // (n4, 결정 60) 내 폴드 뒤 상대끼리(heroOut)도 자동 진행 없이 누른다. tail은 게이트가 받는 자리(스트리트 전환, 쇼다운)와 내 차례면 0,
      //   폴드로 끝나는 핸드(next 'end', ctx.showdown 거짓)만 느림의 street(마지막 폴드를 보고 넘어가게)
      var st = steps(frames), starts = {};
      st.forEach(function(x) { starts[x[0]] = true; });
      var out0 = frames.map(function(f, k) { return { i: k, delay: 0, tap: !!starts[k] }; });
      var gated = ctx.next === 'hero' || ctx.next === 'street' || (ctx.next === 'end' && !!ctx.showdown);
      out0.tail = (frames.length && !gated) ? TAP.street : 0;
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
  //   (n4-P0) 좌석 상자(#screen-game .poker-table .seat)는 그 사람 좌석 시트(G3 SeatChart, 완전 분석은 OmniUI)라 걸음이 아니다. #next-bar는 NextBar가 직접 넘긴다(두 번 세지 않게)
  var EXCLUDE = '#hand-log, #eq-chips, #equity-toggle, #m-dock, #gto-sheet, #gto-chart, #equity-overlay, #thinking-panel, #thinking-feed, ' +
    '#omni-panel, #omni-root, #hand-log-sheet, .hl-mirror, #screen-game .poker-table .seat, #next-bar';
  function _now() {
    try { if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') return performance.now(); } catch (e) { /* noop */ }
    return Date.now();
  }
  // 완전 분석 세션의 좌석 누름은 좌석 시트를 연다(OmniUI). 걸음으로 쓰지 않는다
  function _omniSeat(t) {
    if (!t.closest('#screen-game .poker-table .seat')) return false;
    try { return !!(typeof App !== 'undefined' && App && typeof App.omni === 'function' && App.omni()); } catch (e) { return false; }
  }
  // (n4-P0) 삼킴 시각을 세운다: 지금부터 ms(기본 TAP.guardMs) 동안 액션바 탭을 삼킨다. 다음 바(NextBar)로 넘긴 걸음이 내 차례에 닿을 때 Pacer가 부른다(G1)
  //   (n4 G1, 결정 66) 삼키는 동안 #action-bar에 .guard(css/pace.css가 버튼을 흐린다), 시간이 지나면 지운다. 더 긴 삼킴이 걸려 있으면 줄이지 않는다
  function armGuard(ms) {
    var dur = (typeof ms === 'number' && ms > 0) ? ms : TAP.guardMs, until = _now() + dur;
    if (until < _guardUntil) return _guardUntil;
    _guardUntil = until;
    _guardCls(true);
    _clearT(_guardTimer);
    _guardTimer = _setT(function() { _guardTimer = null; if (_now() >= _guardUntil - 1) _guardCls(false); }, dur);
    return _guardUntil;
  }
  function _guardCls(on) {
    try {
      if (typeof document === 'undefined' || !document || typeof document.getElementById !== 'function') return;
      var bar = document.getElementById('action-bar');
      if (bar && bar.classList) bar.classList.toggle('guard', !!on);
    } catch (e) { /* noop */ }
  }
  // 지금 내 차례인가(App 공개 상태, 없으면 false)
  function _heroNow() {
    try { var st = (typeof App !== 'undefined' && App && typeof App.liveState === 'function') ? App.liveState() : null; return !!(st && st.waitingForHero && !st.handOver); }
    catch (e) { return false; }
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
    // (n4) 알약과 시트 사본 줄의 다음, ⏭은 없어졌다(하단 #next-bar가 맡고, EXCLUDE라 여기서 두 번 세지 않는다)
    // (n3 검증) 폰 도크(#m-dock)는 흐름 안 요소라, 길어지면 아래로 붙은 액션바(sticky, z 40) 밑으로 지나간다. 공개 중 액션바는 인라인
    //   pointer-events: none이라 흐린 폴드, 콜 버튼 자리를 눌러도 target이 그 밑 도크 글(용어 풀이 등)이 되어 넘기지 못하고 도크가 열렸다(실측 412x915).
    //   화면에 보이는 것은 액션바이므로, 액션바 사각형 안의 도크 누름은 액션바 누름으로 본다
    if (t.closest('#m-dock') && _inActionBar(e)) how = _job.mode === 'timed' ? 'finish' : 'step';
    else if (t.closest(EXCLUDE) || _omniSeat(t)) return false;
    else if (!t.closest('#screen-game .table-area, #action-bar') && !_inActionBar(e)) return false;
    else how = _job.mode === 'timed' ? 'finish' : 'step';
    // 액션바와 알약 누름은 여기서 끝낸다(n3 리뷰): 키보드 Enter처럼 포커스된 버튼의 click이 오면 그 onclick(App.heroAction)이
    //   한 번 더 걸음을 넘기거나, 이 누름으로 공개가 끝난 직후 내 액션으로 쓰인다. 테이블 누름은 아래 요소의 자기 일을 그대로 둔다
    if (t.closest('#action-bar') || _inActionBar(e)) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    if (how === 'finish') finish(); else step();
    if (!_job) armGuard(TAP.guardMs);
    return true;
  }
  // 테이블이나 액션바 탭 = 빨리 감기(탭 모드는 다음 걸음). 한 번만 건다(캡처 단계, 아래 요소의 자기 일은 그대로 이어진다)
  function _bindTap() {
    if (_tapBound || typeof document === 'undefined' || !document || typeof document.addEventListener !== 'function') return;
    _tapBound = true;
    document.addEventListener('click', _onTap, true);
  }

  // ── 탭 대기 화면: 다음 좌석 맥박 테두리(실제 게임 화면에서만), 진행 버튼은 하단 #next-bar(NextBar) ──
  function _doc() { return (_hasDom() && typeof document !== 'undefined' && document && typeof document.getElementById === 'function' && typeof document.createElement === 'function') ? document : null; }
  function _posOf(f) {
    var a = f && f.action, nm = a && a.name, pre = f && f.pre;
    var p = (pre && pre.players && nm && pre.players[nm] && pre.players[nm].pos) || (a && a.pos) || null;
    return POS.indexOf(p) >= 0 ? p : null;
  }
  // (n4) 앞으로 행동할 사람 수: 남은 프레임(지금 대기 포함)의 서로 다른 좌석 수. 같은 스트리트에서 두 번 행동하는 좌석은 1명
  function _left(j) {
    var seen = {}, n = 0, fr = (j && j.frames) || [];
    for (var k = j.i; k < fr.length; k++) { var nm = fr[k] && fr[k].action && fr[k].action.name; if (nm && !seen[nm]) { seen[nm] = 1; n++; } }
    return n;
  }
  function _markSeat(d, pos) {
    var sg = d.getElementById('screen-game');
    if (sg && sg.setAttribute) { if (pos) sg.setAttribute('data-pace-next', pos); else if (sg.removeAttribute) sg.removeAttribute('data-pace-next'); }
    var olds = d.querySelectorAll ? d.querySelectorAll('#screen-game .seat.pace-next') : [];
    for (var i = 0; i < olds.length; i++) olds[i].classList.remove('pace-next');
    var el = pos ? d.getElementById('seat-' + pos) : null;
    if (el && el.classList) el.classList.add('pace-next');
  }
  // 대기 정보(C: 상대 차례에 그 사람 입장 차트가 쓴다). 탭 대기와 자동 진행(heroOut) 중 다음에 움직일 좌석, 끝났거나 시간 모드면 null
  //   seat = 그 좌석 이름, pos = 포지션, remaining = 남은 걸음 수(이번 걸음 포함), auto = 자동 진행 중, state = 그 좌석이 결정하기 직전 상태(엔진 상태, 바꾸지 말 것)
  //   (n4) 게이트 대기(hold)는 { kind('street' | 'showdown'), info, seat: null, pos: null, remaining: 0, auto: false, state: null, index: -1 }
  function _waitInfo(j) {
    if (j && j.kind) return { kind: j.kind, info: j.info || {}, seat: null, pos: null, remaining: 0, auto: false, state: null, index: -1 };
    if (!j || j.mode === 'timed' || j.i >= j.frames.length) return null;
    var f = j.frames[j.i], a = (f && f.action) || {};
    return { kind: 'seat', seat: a.name || null, pos: _posOf(f), remaining: _left(j), auto: j.mode === 'auto', state: (f && f.pre) || null, index: j.i };
  }
  // 'pace:wait' 이벤트(document, detail = waiting()): 대기 좌석이 바뀌거나 대기가 끝날 때(null) 한 번씩
  function _emit(j) {
    var w = _waitInfo(j), key = w ? (j.id + ':' + (w.kind === 'seat' ? w.index : w.kind) + ':' + (w.auto ? 'a' : 't')) : '';
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
    if (d) {
      try {
        var waiting = !!(j && !j.kind && j.mode !== 'timed' && j.i < j.frames.length);
        _markSeat(d, waiting ? _posOf(j.frames[j.i]) : null);
        _mirrors();
      } catch (e) { /* noop */ }
    }
    _nb();
    return !!d;
  }
  // (n4) 하단 주 진행 바에 지금 대기를 알린다(typeof 가드). 라벨과 표시는 NextBar가 정한다
  function _nb() {
    try { if (typeof NextBar !== 'undefined' && NextBar && typeof NextBar.update === 'function') NextBar.update(_waitInfo(_job)); } catch (e) { /* noop */ }
  }

  // (n3-C) 문(OppChart)의 글. 없거나 실패면 null(원래 글)
  function _gateLabelW(w, left) {
    if (!_gate || typeof _gate.label !== 'function') return null;
    try { return _gate.label(w, left) || null; } catch (e) { return null; }
  }
  // (n4, 설계 2.5절) 대기 글: w = waiting() 모양, o.short(320 폭 짧은 글). → { html(주 글, <b>자리</b>), sub(작은 글, 없으면 ''), aria } | null(대기 없음).
  //   상대 좌석은 문(OppChart) 글이 있으면 그것이 먼저(👆는 ▶로, 남은 수는 사람 수로 고친다). 글에 가운뎃점과 긴줄표 없음
  var STREET_KO = { flop: '플랍', turn: '턴', river: '리버' };
  function labelFor(w, o) {
    if (!w) return null;
    var sh = !!(o && o.short), info = w.info || {};
    if (w.kind === 'street') {
      var nm = STREET_KO[info.street] || '다음 카드', n = info.cards || (info.street === 'flop' ? 3 : 1);
      return { html: '▶ ' + nm + (sh ? '' : ' 보기' + (info.street === 'flop' ? '(' + n + '장)' : '')), sub: '', aria: nm + ' ' + n + '장 보기' };
    }
    if (w.kind === 'showdown') {
      if (info.runout) return { html: sh ? '▶ 결과' : '▶ 결과 보기', sub: '', aria: '남은 카드와 결과 보기' };
      var live = info.live || 2;
      return { html: sh ? '▶ 쇼다운' : '▶ 쇼다운 보기(' + live + '명)', sub: sh ? '' : '누가 이길지 먼저 생각해 보세요', aria: '쇼다운 보기, ' + live + '명' };
    }
    var left = w.remaining, pos = w.pos || '', lab = w.auto ? null : _gateLabelW(w, left);
    var sub = sh ? '(' + left + '명)' : '남은 ' + left + '명';
    if (lab && lab.html) {
      var isWait = /행동 보기/.test(lab.html);
      var html = sh ? (isWait ? '▶ <b>' + pos + '</b> 행동' : '▶ 다음: <b>' + pos + '</b>')
        : String(lab.html).replace(/\s*<span class="pace-left">[^<]*<\/span>/, '').replace(/^👆\s*/, '▶ ');
      var aria = String(lab.aria || '').replace(/남은 (\d+)번/, '남은 $1명');
      return { html: html, sub: sub, aria: aria || html.replace(/<[^>]+>/g, '') };
    }
    return {
      html: sh ? '▶ 다음: <b>' + pos + '</b>' : '▶ 다음: <b>' + pos + '</b> 행동',
      sub: sub,
      aria: '다음 상대 행동 보기' + (pos ? ', ' + pos : '') + ', 남은 ' + left + '명'
    };
  }
  // 폰 차트 시트 안 사본 줄(.hl-mirror)을 다시 쓴다(HandLogUI가 줄 글을 넣는다)
  function _mirrors() {
    try { if (typeof HandLogUI !== 'undefined' && HandLogUI && typeof HandLogUI.syncMirrors === 'function') HandLogUI.syncMirrors(); } catch (e) { /* noop */ }
  }
  // (n4) 사본 줄 끝의 다음, ⏭은 없앴다(하단 #next-bar 하나로). 호출 호환을 위해 늘 빈 문자열
  function mirrorHTML() { return ''; }
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
    if (typeof j.resume === 'function') j.resume();   // (n4) 게이트 대기는 done 대신 resume
    else if (typeof j.hooks.done === 'function') j.hooks.done();
  }
  // (n4, 결정 66) 걸음이나 끝까지로 작업이 끝나 내 차례가 되었으면 액션바 탭을 삼킨다(다음 바와 액션 버튼이 같은 자리)
  function _guardIfHero(j, ms) {
    if (_job === j) return false;
    if (!((j && j.ctx && j.ctx.next === 'hero') || _heroNow())) return false;
    armGuard(ms || TAP.guardMs);
    return true;
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
    var spd = ctx.speed || speed(), skip = skipping();
    if (skip || sync({ frames: frames, practice: ctx.practice, speed: spd })) {
      for (var i = 0; i < frames.length; i++) if (typeof hooks.frame === 'function') hooks.frame(frames[i], i);
      // (n4) ⏭ 핸드 끝까지: 내 차례가 오면 풀고 액션바 탭을 삼킨다(손가락이 레이즈 자리에 그대로 있다)
      if (skip && ctx.next === 'hero') { _skip = null; armGuard(TAP.skipGuardMs); }
      if (typeof hooks.done === 'function') hooks.done();
      return true;
    }
    var p = plan(frames, spd, ctx);
    var mode = p.steps ? (p.auto ? 'auto' : 'tap') : 'timed';
    _job = { id: ++_seq, frames: frames, hooks: hooks, delays: p, tail: p.tail || 0, i: 0, timer: null, mode: mode, steps: p.steps || null, ctx: ctx };
    _guardUntil = 0;
    _guardCls(false);
    _revealing(true);
    _bindTap();
    _next();
    if (_job && _job.mode === 'timed') _nb();   // 시간 모드는 _ui를 부르지 않으므로 다음 바(⏩ 빨리 넘기기)에 따로 알린다
    return true;
  }
  function busy() { return !!_job; }
  // (n4) 지금 작업 모양: 'tap'(탭 대기, 게이트 포함) | 'timed'(시간 속도 공개) | null(작업 없음)
  function mode() { return _job ? _job.mode : null; }
  // (n4) 탭 tail(마지막 걸음 뒤 대기) 중인가: 대기 정보는 없지만 작업이 남았다
  function tailing() { var j = _job; return !!(j && !j.kind && j.mode !== 'timed' && j.i >= j.frames.length); }
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
  // 대기 중인 다음 좌석 { kind('seat'), seat, pos, remaining, auto, state, index } 또는 null(_waitInfo). 시간 모드와 마지막 걸음 뒤 대기(tail)는 null
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
    _guardIfHero(j);
    return true;
  }
  function finish() {
    var j = _job;
    if (!j) return false;
    _clearT(j.timer);
    j.timer = null;
    _show(j, j.frames.length);
    if (_job === j) _end();
    _guardIfHero(j);
    return true;
  }
  //   (n4) 게이트의 resume과 '핸드 끝까지'도 버린다(화면 이탈, 새 핸드)
  function cancel() {
    _skip = null;
    var j = _job;
    if (!j) return false;
    _clearT(j.timer);
    _job = null;
    _ui(null);
    _revealing(false);
    return true;
  }
  // ── (n4 G1, 설계 2.3절 3번, 5번) 게이트와 핸드 끝까지 ──
  // hold(kind('street' | 'showdown'), info, resume): 프레임 0개의 탭 대기. 탭 모드가 아니거나 DOM 없음(node, smoke), 연습(info.practice),
  //   skipping이면 resume()을 바로 부르고 false. 대기 중 step()과 finish()가 resume을 1회 부르고 작업을 끝낸다(_end), cancel()은 버린다.
  //   대기 정보는 waiting() = { kind, info, seat: null, ... }, 'pace:wait' 1회, 다음 바 라벨(플랍 보기, 쇼다운 보기)
  function hold(kind, info, resume) {
    if (typeof resume !== 'function') return false;
    info = info || {};
    if (speed() !== 'tap' || !_hasDom() || info.practice || skipping()) { resume(); return false; }
    if (_job) finish();
    _job = { id: ++_seq, kind: String(kind || 'street'), info: info, resume: resume, frames: [], hooks: {}, delays: [], tail: 0, i: 0, timer: null, mode: 'tap', steps: [], ctx: {} };
    _revealing(true);
    _bindTap();
    _ui(_job);
    return true;
  }
  function _handKey() {
    try {
      var st = (typeof App !== 'undefined' && App && typeof App.liveState === 'function') ? App.liveState() : null;
      return st ? String(st.seed) + ':' + String(st.handNum) + ':' + String(st.round || 0) : 'x';
    } catch (e) { return 'x'; }
  }
  // skipHand(): 이번 핸드를 내 차례나 끝까지 빠르게. 지금 작업은 finish, 뒤따르는 같은 핸드의 run과 hold는 동기로 끝낸다.
  //   내 차례가 오면 풀고 액션바 탭을 TAP.skipGuardMs(600) 삼킨다. 새 핸드(cancel)에서 풀린다. → true
  function skipHand() {
    _skip = { key: _handKey() };
    var toHero = !!(_job && _job.ctx && _job.ctx.next === 'hero');
    if (_job) finish();
    if (_skip && (toHero || _heroNow())) { _skip = null; armGuard(TAP.skipGuardMs); }
    _nb();
    return true;
  }
  // skipping(): 이번 핸드에 skipHand가 걸려 있는가(핸드 키가 바뀌면 거짓)
  function skipping() { return !!(_skip && _skip.key === _handKey()); }
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
    hold: hold, skipHand: skipHand, skipping: skipping, armGuard: armGuard, labelFor: labelFor, EXCLUDE: EXCLUDE,   // (n4-P0)
    mode: mode, tailing: tailing, STREET_KO: STREET_KO,   // (n4 G1)
    _setEnv: _setEnv, _hasDom: _hasDom, _onTap: _onTap, _ui: _ui, _swallow: _swallow,
    _migrateReset: function() { _migChecked = false; }, _guardReset: function() { _guardUntil = 0; _clearT(_guardTimer); _guardTimer = null; _guardCls(false); },
    _guardLeft: function() { return Math.max(0, _guardUntil - _now()); } };
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
  // (n4 G1) 보이는 마지막 이벤트부터 거꾸로 이어진 상대 폴드(같은 스트리트, 내 행동이나 스트리트 줄에서 끊음)의 자리 이름. 2명 이상이면 배열, 아니면 null
  function foldRun() {
    var out = [];
    for (var i = _shown - 1; i >= 0; i--) {
      var e = _ev[i];
      if (!e || e.k !== 'a' || e.n === 'Hero' || e.act !== 'fold') break;
      out.unshift(_pos[e.n] || String(e.n || ''));
    }
    return out.length >= 2 ? out : null;
  }
  // 접힌 줄: [횟수][마지막 공개 이벤트][⏩ 속도](탭 모드는 👆 탭). title이 참이면(데스크톱 패널, 아래 목록이 최근 줄을 보인다) 글은 제목만
  function lineHTML(title) {
    var ev = (!title && _shown > 0) ? _ev[_shown - 1] : null;
    var AT = _AT(), cls = '', ic = '';
    if (ev && ev.k === 'a' && AT) { var key = AT.actKey(ev); cls = AT.cls(key); ic = AT.icon(key); }
    var run = ev ? foldRun() : null;   // (n4 G1, 설계 2.2절 2번) 이어진 상대 폴드는 'UTG, HJ 폴드'로 묶어 적는다
    var txt = ev ? (run ? _esc(run.join(', ') + ' 폴드') : _color(_esc(lineText(ev))) + (ev.light && LIGHT[ev.light] ? ' ' + LIGHT[ev.light] : '')) : '이번 핸드 기록';
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
    // (n4 G1, 설계 1.4절, 결정 61) 머리줄 48px: 손잡이(그립 + 제목, 누르면 닫기) + 오른쪽 '✕ 닫기'(72x48). 머리줄을 아래로 끌어도 닫는다(SheetGesture)
    _sheet.innerHTML = '<div class="sheet-head hl-sheet-head"><button type="button" class="hl-sheet-handle" aria-label="기록 닫기"><span class="hl-sheet-grip" aria-hidden="true"></span>' +
      '<span class="hl-sheet-title sheet-title">이번 핸드 기록</span></button>' +
      '<button type="button" class="sheet-close hl-sheet-close" aria-label="기록 닫기"><span aria-hidden="true">✕</span><span class="sheet-close-t">닫기</span></button></div>' +
      '<div class="hl-sheet-body"></div>';
    _sheet.style.display = 'none';
    d.body.appendChild(_sheet);
    _sheet.addEventListener('click', function(e) { if (e.target && e.target.closest && e.target.closest('.hl-sheet-handle, .hl-sheet-close')) toggle(false); });
    var head = _sheet.querySelector ? _sheet.querySelector('.hl-sheet-head') : null;
    if (head && typeof SheetGesture !== 'undefined' && SheetGesture && typeof SheetGesture.bind === 'function') {
      SheetGesture.bind(_sheet, head, { onClose: function() { toggle(false); }, onTap: function() { toggle(false); } });
    }
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
    var pace = mob ? Pacer.mirrorHTML() : '';   // (n4) 늘 빈 문자열(진행은 하단 #next-bar), 호출은 호환으로 남긴다
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
    var ids = (typeof NextBar !== 'undefined' && NextBar && Array.isArray(NextBar.BARS)) ? NextBar.BARS : ['action-bar', 'result-actions-bar'];   // (n4-P0) 바 후보 공통 상수
    ids.forEach(function(id) {
      var b = d.getElementById(id);
      if (b && b.style && b.style.display !== 'none' && b.offsetHeight > 0) bar = b;
    });
    var top = bar && bar.getBoundingClientRect ? bar.getBoundingClientRect().top : window.innerHeight;
    sh.style.bottom = Math.max(0, Math.round(window.innerHeight - top)) + 'px';
    sh.style.maxHeight = Math.max(160, Math.round(top - 8)) + 'px';
  }

  function onNewHand() { _open = false; render(); }
  // (n4 G1) 하단 바가 바뀌면(액션바, 다음 바, 결과바) 열린 기록 시트의 바닥을 다시 맞춘다(NextBar가 부른다)
  function place() { if (_sheet && _sheet.style && _sheet.style.display !== 'none') { _placeSheet(_sheet); return true; } return false; }

  var api = { track: track, hold: hold, reveal: reveal, events: events, pending: pending, count: count, lineText: lineText, rowHTML: rowHTML, listHTML: listHTML,
    lineHTML: lineHTML, foldRun: foldRun, ensure: ensure, toggle: toggle, speedTap: speedTap, render: render, onNewHand: onNewHand, renderMirrors: _renderMirrors, place: place,
    syncMirrors: function() { return _renderMirrors(_doc(), _mobile()); },
    _reset: function() { _ev = []; _pos = {}; _shown = 0; _base = null; _open = false; } };
  return api;
})();
