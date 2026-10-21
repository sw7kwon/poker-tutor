// journey/views/settings.js (채우는 패키지: M2-P5, M6-SEASON이 '상대가 내 성향에 적응' 행 추가)
// ⚙ 설정 화면(SettingsView, 설계서 5.9절, 계약 C8): JourneyUI.view('settings')가 open(params, el)로 연다.
// 항목 7개: 하루 목표(5/10/15분, POLISH UX-02: Journey 상태 goal.minutes에 저장), 글자 크기(100/115/130%), 4색 덱, 색약 차트, 움직임(시스템 따름/줄이기/보통), 효과음, 진동.
// M6(계약 H6): 🧠 상대 카드의 '상대가 내 성향에 적응'(키 adaptive, 기본 켜기)은 VillainAdaptive.unlocked()가 true일 때만(S5 승급 시험 통과 뒤).
//   html(settings, sup, opts)의 opts.adaptive(true/false)로 표시 여부를 직접 줄 수 있다(테스트용, 없으면 VillainAdaptive.unlocked()).
//   효과음은 WebAudio, 진동은 navigator.vibrate가 없으면 그 줄을 숨긴다. 둘 다 기본 꺼짐.
// 누르면 A11y.save(patch)로 바로 저장하고 적용한 뒤 다시 그린다. 맨 위 미리보기 줄(카드 4장, 차트 칸 3개)로 결과를 바로 본다.
// ↩는 JourneyUI.back. 클래스는 journey.css(.j-sub, .j-sub-top, .j-back, .j-card, .j-set-row, .j-picks, .j-pick, .j-btn) 재사용.
// 로드 시 DOM 접근 없음. html(settings, sup)은 순수 문자열(테스트용).
var SettingsView = (function() {
  var SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  var RED = { h: 1, d: 1 };
  var PREVIEW = [['A', 's'], ['K', 'h'], ['Q', 'd'], ['J', 'c']];
  var FALLBACK = { v: 1, fontScale: 100, fourColor: false, cbChart: false, reduceMotion: null, sound: false, vibrate: false, adaptive: true };
  var _el = null;

  function _a11y(fn) { return (typeof A11y !== 'undefined' && A11y && typeof A11y[fn] === 'function') ? A11y : null; }
  function _settings() { var A = _a11y('load'); try { return A ? A.load() : FALLBACK; } catch (e) { return FALLBACK; } }
  function _supports() { var A = _a11y('supports'); try { return A ? A.supports() : { vibrate: false, audio: false }; } catch (e) { return { vibrate: false, audio: false }; } }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function _val(v) { return v === null ? 'null' : String(v); }
  // 적응형 상대가 열렸나(H6: S5 승급 시험 통과). 모듈이 없거나 예외면 숨김
  function _adaptiveOpen() {
    try { return typeof VillainAdaptive !== 'undefined' && !!VillainAdaptive && typeof VillainAdaptive.unlocked === 'function' && VillainAdaptive.unlocked() === true; }
    catch (e) { return false; }
  }

  // 고르기 버튼 하나: data-k/data-v는 다시 그린 뒤 포커스를 되돌리는 데 쓴다
  function _pick(key, value, on, label) {
    var v = _val(value);
    return '<button type="button" class="j-pick' + (on ? ' is-on' : '') + '" aria-pressed="' + (on ? 'true' : 'false') + '"' +
      ' data-k="' + key + '" data-v="' + _esc(v) + '" onclick="SettingsView.set(\'' + key + '\', ' + (typeof value === 'string' ? '\'' + _esc(value) + '\'' : v) + ')">' +
      label + '</button>';
  }
  function _row(key, title, desc, picks) {
    var id = 'set-l-' + key;
    return '<div class="j-set-row" data-set="' + key + '">' +
      '<span class="j-set-l" id="' + id + '">' + title + '</span>' +
      '<span class="j-picks" role="group" aria-labelledby="' + id + '">' + picks.join('') + '</span>' +
      (desc ? '<span class="a11y-desc">' + desc + '</span>' : '') + '</div>';
  }
  function _onOff(key, on, offLabel, onLabel) {
    return [_pick(key, false, !on, offLabel || '끄기'), _pick(key, true, !!on, onLabel || '켜기')];
  }

  function _previewHTML() {
    var cards = PREVIEW.map(function(x) {
      return '<div class="card ' + (RED[x[1]] ? 'red' : 'black') + '" data-suit="' + x[1] + '">' + x[0] + SUIT_SYM[x[1]] + '</div>';
    }).join('');
    var cells = '<div class="gto-cell gto-raise">AA</div><div class="gto-cell gto-call">KQs</div><div class="gto-cell gto-fold">72o</div>';
    return '<div class="j-card a11y-preview" aria-label="미리보기">' +
      '<div class="j-card-t">미리보기</div>' +
      '<div class="a11y-prev-cards" aria-hidden="true">' + cards + '</div>' +
      '<div class="a11y-prev-cells" aria-hidden="true">' + cells + '</div>' +
      '<div class="j-card-d">레인지 차트 칸: 레이즈, 콜, 폴드. 바꾸면 이 줄이 바로 달라져요.</div></div>';
  }

  // (POLISH UX-02) 하루 목표(분): 여정 상태 goal.minutes(5, 10, 15, 그 밖은 5. today-ui.js _goal과 같은 규칙). A11y 설정이 아니라 Journey에 저장.
  function _journey(fn) { return (typeof Journey !== 'undefined' && Journey && typeof Journey[fn] === 'function') ? Journey : null; }
  function _goalOf(v) { var g = Number(v); return (g === 10 || g === 15) ? g : 5; }
  function _goalMin() {
    var J = _journey('load');
    try { var st = J ? J.load() : null; return _goalOf(st && st.goal && st.goal.minutes); } catch (e) { return 5; }
  }
  function _saveGoal(m) {
    var J = _journey('load');
    if (!J || typeof J.save !== 'function') return false;
    try { var st = J.load(); if (!st) return false; st.goal = st.goal || {}; st.goal.minutes = _goalOf(m); J.save(st); return true; }
    catch (e) { return false; }
  }

  // 순수: 설정과 지원 여부로 화면 문자열을 만든다. opts.goal(5, 10, 15)로 하루 목표 표시값을 직접 줄 수 있다(테스트용, 없으면 Journey.load().goal.minutes)
  function html(settings, sup, opts) {
    var s = settings || _settings();
    sup = sup || _supports();
    var showAdaptive = (opts && typeof opts.adaptive === 'boolean') ? opts.adaptive : _adaptiveOpen();
    var goal = (opts && opts.goal != null) ? _goalOf(opts.goal) : _goalMin();
    var goalCard = '<div class="j-card"><div class="j-card-t">🎯 하루 목표</div>' +
      _row('goal', '하루 목표', '오늘의 5분 길이가 달라져요(복습, 레슨, 재미 블록 수).',
        [5, 10, 15].map(function(m) { return _pick('goal', m, goal === m, m + '분'); })) + '</div>';
    var rm = (s.reduceMotion === true || s.reduceMotion === false) ? s.reduceMotion : null;
    var look = [
      _row('fontScale', '글자 크기', '앱 전체 글자가 커져요.',
        [100, 115, 130].map(function(n) { return _pick('fontScale', n, s.fontScale === n, n + '%'); })),
      _row('fourColor', '4색 덱', '♦는 파랑, ♣는 초록으로 보여 무늬를 헷갈리지 않아요.', _onOff('fourColor', s.fourColor, '보통', '4색')),
      _row('cbChart', '색약용 차트', '차트 칸에 R(레이즈), C(콜), F(폴드) 글자를 같이 쓰고 밝기 차이를 키워요.', _onOff('cbChart', s.cbChart))
    ];
    var motion = [
      _row('reduceMotion', '카드 돌리기와 화면 효과', '줄이면 카드와 화면이 기다림 없이 바로 나타나요. 시스템 따름은 폰의 동작 줄이기 설정을 따라요.',
        [_pick('reduceMotion', null, rm === null, '시스템 따름'), _pick('reduceMotion', true, rm === true, '줄이기'), _pick('reduceMotion', false, rm === false, '보통')])
    ];
    var foe = showAdaptive ? '<div class="j-card"><div class="j-card-t">🧠 상대</div>' +
      _row('adaptive', '상대가 내 성향에 적응', '켜면 자유 게임과 미션에서 상대가 내 플레이 습관(벳, 콜, 폴드를 얼마나 자주 하는지)을 읽고 조금씩 맞춰 와요. ' +
        '승급 시험, 은닉 테이블, 극장, 연습에서는 원래 성향 그대로예요. 끄면 내 습관에 맞춰 바꾸지 않아요(이번 달 시즌에 바뀐 성향은 그대로예요).', _onOff('adaptive', s.adaptive !== false)) + '</div>' : '';
    var fxRows = [];
    if (sup.audio) fxRows.push(_row('sound', '효과음', '정답, 오답 때 짧은 소리가 나요.', _onOff('sound', s.sound)));
    if (sup.vibrate) fxRows.push(_row('vibrate', '진동', '정답, 오답 때 폰이 짧게 떨려요.', _onOff('vibrate', s.vibrate)));
    return '<div class="j-sub j-settings-view">' +
      '<div class="j-sub-top"><button type="button" class="j-back" aria-label="여정 홈으로" onclick="SettingsView.back()">↩</button>' +
      '<h2 class="j-sub-t">⚙ 설정</h2></div>' +
      _previewHTML() + goalCard +
      '<div class="j-card"><div class="j-card-t">👀 보기</div>' + look.join('') + '</div>' +
      '<div class="j-card"><div class="j-card-t">🎬 움직임</div>' + motion.join('') + '</div>' + foe +
      '<div class="j-card"><div class="j-card-t">🔔 소리와 진동</div>' +
        (fxRows.length ? '<div class="j-card-d">처음에는 꺼져 있어요. 켜면 바로 한 번 울려요.</div>' + fxRows.join('')
          : '<div class="j-card-d">이 기기에서는 효과음과 진동을 쓸 수 없어요.</div>') + '</div>' +
      '<div class="j-card-d a11y-foot">바꾸면 바로 적용되고 이 기기에 저장돼요.</div>' +
      '<div class="a11y-live" role="status" aria-live="polite"></div>' +
      '</div>';
  }

  function render(el) {
    el = el || _el;
    var out = html();
    if (!el) return out;
    _el = el;
    el.innerHTML = out;
    return out;
  }

  function open(params, el) {
    if (!el && typeof JourneyUI !== 'undefined' && JourneyUI && typeof JourneyUI.viewEl === 'function') {
      try { el = JourneyUI.viewEl(); } catch (e) { el = null; }
    }
    render(el);
    return true;
  }

  var LIVE = { fontScale: '글자 크기를 바꿨어요', fourColor: '4색 덱을 바꿨어요', cbChart: '색약용 차트를 바꿨어요',
    reduceMotion: '움직임 설정을 바꿨어요', sound: '효과음을 바꿨어요', vibrate: '진동을 바꿨어요', adaptive: '상대 적응 설정을 바꿨어요',
    goal: '하루 목표를 바꿨어요' };

  // set(key, value): 바로 저장 + 적용 + 다시 그리기. 반환 = 저장된 설정
  // (UX-02) key 'goal'은 A11y가 아니라 Journey 상태(goal.minutes)에 저장. 반환은 { goal } (TodayUI.preview는 _cache.goal이 다르면 스스로 다시 계산)
  function set(key, value) {
    if (!LIVE[key]) return null;
    var patch = {}; patch[key] = value;
    var A = _a11y('save'), s;
    if (key === 'goal') s = _saveGoal(value) ? { goal: _goalMin() } : null;
    else { try { s = A ? A.save(patch) : null; } catch (e) { s = null; } }
    if (!s) return null;
    if ((key === 'sound' || key === 'vibrate') && value === true && _a11y('fx')) { try { A11y.fx('tap'); } catch (e) { /* noop */ } }
    if (_el && typeof document !== 'undefined') {
      render(_el);
      try {
        var b = _el.querySelector('[data-k="' + key + '"][data-v="' + _val(s[key]) + '"]');
        if (b && b.focus) b.focus({ preventScroll: true });
        var live = _el.querySelector('.a11y-live');
        if (live) live.textContent = LIVE[key];
      } catch (e) { /* noop */ }
    }
    return s;
  }

  function back() {
    if (typeof JourneyUI !== 'undefined' && JourneyUI && typeof JourneyUI.back === 'function') { JourneyUI.back(); return; }
    if (typeof App !== 'undefined' && App && typeof App.showMenu === 'function') App.showMenu();
  }

  var api = { open: open, render: render, html: html, set: set, back: back };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
