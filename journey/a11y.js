// journey/a11y.js (채우는 패키지: M2-P5, M6-SEASON이 adaptive 키 추가)
// 접근성 설정(설계서 5.9절, 계약 C8): 글자 크기, 4색 덱, 색약 차트, 모션 줄이기, 효과음, 진동.
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
  var DEFAULTS = { v: 1, fontScale: 100, fourColor: false, cbChart: false, reduceMotion: null, sound: false, vibrate: false, adaptive: true };
  var BOOL_KEYS = ['fourColor', 'cbChart', 'sound', 'vibrate'];
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

  // 저장 형식 그대로 받아 이 모듈 필드만 정규화한다(다른 필드는 보존)
  function normalize(o) {
    var src = (o && typeof o === 'object') ? o : {};
    var out = {}, k;
    for (k in src) if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
    out.v = Number(src.v) > 0 ? Number(src.v) : 1;
    out.fontScale = ('fontScale' in src) ? _scale(src.fontScale) : DEFAULTS.fontScale;
    for (var i = 0; i < BOOL_KEYS.length; i++) out[BOOL_KEYS[i]] = !!src[BOOL_KEYS[i]];
    out.reduceMotion = _rm(src.reduceMotion);
    out.adaptive = _adaptive(src.adaptive);
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
    KEY: KEY, SCALES: SCALES.slice(), DEFAULTS: DEFAULTS,
    load: load, save: save, apply: apply, reduced: reduced, fx: fx, supports: supports, normalize: normalize, init: init,
    _resetAudio: function() { _ac = null; }
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
