// journey/a11y.js (채우는 패키지: M2-P5, M6-SEASON이 adaptive 키 추가)
// 접근성 설정(설계서 5.9절, 계약 C8): 글자 크기, 4색 덱(기본 켜짐, R8), 색약 차트, 모션 줄이기, 효과음, 진동.
// M6(계약 H6): adaptive = 상대가 내 성향에 적응(VillainAdaptive, S5 승급 시험 통과 뒤). 기본 true, false일 때만 끈다
//   (true/false 말고 다른 값은 true로 정규화. 0과 'false'도 끔). 읽는 쪽은 load().adaptive 또는 저장값 !== false.
// 저장 키 poker_journey_settings(6.1절)는 JourneyUI._readSettings/_writeSettings와 같이 쓴다.
//   save(patch)는 저장된 객체에 patch만 덮어써 다른 패키지 필드(thinkingReveal 등)를 지우지 않는다.
// apply(settings): html 루트에 인라인 font-size(100%면 지움)와 클래스 four-color, cb, reduce-motion(, motion-full)을 붙인다.
//   글자 배율은 루트 기준 크기(--root-fs, mobile.css의 작은 폰 15/14px)에 곱한다. 없으면 100%(브라우저 기본)에 곱한다.
// reduced(): reduceMotion true면 true, false면 false, null이면 시스템 설정(prefers-reduced-motion)을 따른다.
// fx(kind): 소리가 켜져 있으면 WebAudio 짧은 비프, 진동이 켜져 있으면 navigator.vibrate. 둘 다 기본 꺼짐.
// 규약: 로드 시 DOM, navigator, matchMedia 접근 없음(window.addEventListener만). 전부 typeof 가드.
var A11y = (function() {
  var KEY = 'poker_journey_settings';
  var SCALES = [100, 115, 130];
  // showEq: 게임 테이블 '내 승률' 칩(코칭 가림 해제 + 히어로 좌석 배지), showAllEq: '모두 승률'(카드 공개 상황의 좌석별 승률). 둘 다 기본 꺼짐
  // (P0, 다음 묶음) showChart: '📋 차트' 칩(R1 큰 GTO 차트), winChance: 액션별 이길 확률(R3b, 연구용). 둘 다 기본 꺼짐.
  //   chartTier: 프리플랍 차트 티어 'auto'(S3부터 표준) | 'beginner'(입문) | 'standard'(표준), 기본 'auto'. 판정은 GtoStd.active(클라우드 E)
  // (클라우드 H, R8) fourColor: 4색 덱은 새 설치 기본 켜짐. 저장값에 키가 없으면 true, 끄는 값(false, 0, 'false')일 때만 false.
  //   읽는 쪽은 load().fourColor(정규화 뒤 불리언). 글자 기호(.suit)는 설정과 상관없이 늘 4색(css/cards.css).
  // (웨이브2 후속) chipVisual: 게임 테이블 칩 그림(ui/chips.js). 기본 켜짐, fourColor와 같은 규칙(끄는 값만 false). 설정 '👀 보기'의 '칩 그림 보이기' 행.
  var DEFAULTS = { v: 1, fontScale: 100, fourColor: true, cbChart: false, reduceMotion: null, sound: false, vibrate: false, adaptive: true, showEq: false, showAllEq: false,
    showChart: false, winChance: false, chartTier: 'auto', chipVisual: true, pace: 'tap', omniMode: false, chartView: 'all' };
  // (n3-B) chartView: 레인지 차트 보기 칩(ui/gto-chart.js) 'all'(전체) | 'raise'(레이즈만) | 'call'(콜만) | 'analysis'(n4, 📈 분석), 모르는 값은 'all'.
  //   콜이 없는 상황(오픈, SB 대응)에서는 그 상황만 전체로 보이고 저장값은 그대로 둔다
  // (n2-P0) pace: 상대 액션 순차 공개 속도(ui/pacer.js), 모르는 값은 기본값. omniMode: 빌런 선택 화면의 완전 분석 오픈 모드 체크(기본 꺼짐)
  var BOOL_KEYS = ['cbChart', 'sound', 'vibrate', 'showEq', 'showAllEq', 'showChart', 'winChance', 'omniMode'];   // 기본 꺼짐(없으면 false)
  var CHART_TIERS = ['auto', 'beginner', 'standard'];
  // (n3) 'tap' = 누를 때마다 다음 행동(새 기본). 예전 기본 'normal'로 저장된 사람은 Pacer.migrate가 한 번 'tap'으로 옮긴다
  var PACES = ['tap', 'slow', 'normal', 'fast', 'instant'];
  // (n4-P0) 'analysis' = 📈 분석 보기(칸마다 승률 숫자와 위험도, ui/gto-chart.js G2). 예전 버전은 이 값을 모르는 값으로 보고 'all'로 돌린다(하위 호환)
  var CHART_VIEWS = ['all', 'raise', 'call', 'analysis'];
  var MQ = '(prefers-reduced-motion: reduce)';
  // 진동 패턴(ms)과 비프(주파수 Hz, 길이 s). 짧게: 결과 알림용, 연속 재생으로 귀찮지 않게
  var VIB = { ok: 15, bad: [30, 40, 30], tap: 8, done: [20, 40, 60] };
  var TONE = {
    ok: [{ f: 880, d: 0.08 }],
    bad: [{ f: 196, d: 0.14 }],
    tap: [{ f: 660, d: 0.03 }],
    done: [{ f: 660, d: 0.07 }, { f: 880, d: 0.07 }, { f: 1175, d: 0.12 }]
  };
  var _ac = null;          // AudioContext(첫 소리 때 생성, 사용자 탭 안에서 만들어야 재생됨)
  var _mqBound = false;

  function _ls() { try { return (typeof localStorage !== 'undefined' && localStorage) ? localStorage : null; } catch (e) { return null; } }
  function _raw() {
    var ls = _ls(), o = null;
    if (!ls) return {};
    try { var s = ls.getItem(KEY); if (s) o = JSON.parse(s); } catch (e) { o = null; }
    return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
  }
  function _scale(v) {
    var n = Number(v);
    if (!isFinite(n)) return 100;
    var best = SCALES[0];
    for (var i = 1; i < SCALES.length; i++) if (Math.abs(SCALES[i] - n) < Math.abs(best - n)) best = SCALES[i];
    return best;
  }
  function _rm(v) { return v === true || v === false ? v : null; }
  // 적응형 상대(H6): 끄는 값(false, 0, 'false')만 false, 나머지(없음 포함)는 기본 true
  function _adaptive(v) { return !(v === false || v === 0 || v === 'false'); }
  // 4색 덱(R8): 기본 켜짐. 끄는 값(false, 0, 'false')만 false(adaptive와 같은 규칙)
  function _fourColor(v) { return !(v === false || v === 0 || v === 'false'); }

  // 저장 형식 그대로 받아 이 모듈 필드만 정규화한다(다른 필드는 보존)
  function normalize(o) {
    var src = (o && typeof o === 'object') ? o : {};
    var out = {}, k;
    for (k in src) if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
    out.v = Number(src.v) > 0 ? Number(src.v) : 1;
    out.fontScale = ('fontScale' in src) ? _scale(src.fontScale) : DEFAULTS.fontScale;
    for (var i = 0; i < BOOL_KEYS.length; i++) out[BOOL_KEYS[i]] = !!src[BOOL_KEYS[i]];
    out.fourColor = _fourColor(src.fourColor);
    out.chipVisual = _fourColor(src.chipVisual);   // 같은 규칙: 기본 켜짐
    out.reduceMotion = _rm(src.reduceMotion);
    out.adaptive = _adaptive(src.adaptive);
    out.chartTier = CHART_TIERS.indexOf(src.chartTier) >= 0 ? src.chartTier : DEFAULTS.chartTier;
    out.pace = PACES.indexOf(src.pace) >= 0 ? src.pace : DEFAULTS.pace;
    out.chartView = CHART_VIEWS.indexOf(src.chartView) >= 0 ? src.chartView : DEFAULTS.chartView;
    return out;
  }

  function load() { return normalize(_raw()); }

  function save(patch) {
    var cur = _raw(), k;
    if (patch && typeof patch === 'object') for (k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) cur[k] = patch[k];
    var s = normalize(cur);
    var ls = _ls();
    if (ls) { try { ls.setItem(KEY, JSON.stringify(s)); } catch (e) { /* 저장 불가: 이번 화면에서만 적용 */ } }
    apply(s);
    return s;
  }

  function _sys() {
    try { if (typeof matchMedia === 'function') { var m = matchMedia(MQ); return !!(m && m.matches); } } catch (e) { /* noop */ }
    return false;
  }
  function reduced(s) {
    var rm = _rm((s && typeof s === 'object') ? s.reduceMotion : load().reduceMotion);
    if (rm !== null) return rm;
    return _sys();
  }

  function _cls(root, name, on) {
    if (!root.classList) return;
    if (on) root.classList.add(name); else root.classList.remove(name);
  }
  // 시스템 설정이 바뀌면(시스템 따름일 때) 다시 적용
  function _bindMq() {
    if (_mqBound) return;
    _mqBound = true;
    try {
      if (typeof matchMedia !== 'function') return;
      var m = matchMedia(MQ);
      var fn = function() { apply(); };
      if (m && typeof m.addEventListener === 'function') m.addEventListener('change', fn);
      else if (m && typeof m.addListener === 'function') m.addListener(fn);
    } catch (e) { /* noop */ }
  }

  function apply(settings) {
    var s = normalize(settings && typeof settings === 'object' ? settings : _raw());
    if (typeof document === 'undefined' || !document || !document.documentElement) return s;
    var root = document.documentElement;
    if (root.style) {
      root.style.fontSize = s.fontScale === 100 ? '' : 'calc(var(--root-fs, 100%) * ' + (s.fontScale / 100) + ')';
    }
    _cls(root, 'four-color', s.fourColor);
    _cls(root, 'cb', s.cbChart);
    _cls(root, 'reduce-motion', reduced(s));
    _cls(root, 'motion-full', s.reduceMotion === false);   // '보통'을 고르면 시스템 줄이기 규칙도 끈다(a11y.css)
    if (s.reduceMotion === null) _bindMq();
    return s;
  }

  function _audioCtor() {
    if (typeof AudioContext === 'function') return AudioContext;
    if (typeof webkitAudioContext === 'function') return webkitAudioContext;   // eslint-disable-line no-undef
    return null;
  }
  function supports() {
    var vib = false;
    try { vib = typeof navigator !== 'undefined' && !!navigator && typeof navigator.vibrate === 'function'; } catch (e) { vib = false; }
    return { vibrate: vib, audio: !!_audioCtor() };
  }

  function _beep(kind) {
    var C = _audioCtor();
    if (!C) return false;
    try {
      if (!_ac) _ac = new C();
      if (_ac.state === 'suspended' && typeof _ac.resume === 'function') { try { _ac.resume(); } catch (e) { /* noop */ } }
      var seq = TONE[kind] || TONE.tap;
      var t = Number(_ac.currentTime) || 0;
      for (var i = 0; i < seq.length; i++) {
        var o = _ac.createOscillator(), g = _ac.createGain();
        o.type = 'sine';
        if (o.frequency && typeof o.frequency.setValueAtTime === 'function') o.frequency.setValueAtTime(seq[i].f, t);
        else if (o.frequency) o.frequency.value = seq[i].f;
        if (g.gain && typeof g.gain.setValueAtTime === 'function') {
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + seq[i].d);
        }
        o.connect(g);
        g.connect(_ac.destination);
        o.start(t);
        o.stop(t + seq[i].d + 0.02);
        t += seq[i].d;
      }
      return true;
    } catch (e) { return false; }
  }

  // fx('ok'|'bad'|'tap'|'done') -> {sound, vibrate}: 실제로 낸 것
  function fx(kind) {
    var s = load(), out = { sound: false, vibrate: false };
    if (s.vibrate && supports().vibrate) {
      try { navigator.vibrate(VIB[kind] || VIB.tap); out.vibrate = true; } catch (e) { out.vibrate = false; }
    }
    if (s.sound) out.sound = _beep(kind);
    return out;
  }

  // 첫 그리기 전에 저장된 설정을 적용(JourneyUI.init이 load 때 한 번 더 부른다, 같은 결과)
  function init() { return apply(); }
  if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') window.addEventListener('DOMContentLoaded', init);

  var api = {
    KEY: KEY, SCALES: SCALES.slice(), DEFAULTS: DEFAULTS, CHART_TIERS: CHART_TIERS.slice(), PACES: PACES.slice(), CHART_VIEWS: CHART_VIEWS.slice(),
    load: load, save: save, apply: apply, reduced: reduced, fx: fx, supports: supports, normalize: normalize, init: init,
    _resetAudio: function() { _ac = null; }
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
