// drills/math-drill.js, 8차 WP6: 팟 오즈 암산 4지선다
// 표기 규약(설계서 8.4): 팟(상대 벳 포함) X = P+B, 콜 Y = B, 필요 승률 = Y/(X+Y) = B/(P+2B).
// 내부 키 'f='(P = 벳 전 팟 대비 벳 비율)는 레거시 호환으로 유지. 함정 보기: 자기 콜 빼먹기 B/(P+B), B/P, 정답±8%p
var MathDrill = (function() {
  var POTS = [4, 6, 8, 10, 12, 15, 20, 30, 40];
  var FRACS = [
    { v: 1 / 4, k: '1/4' }, { v: 1 / 3, k: '1/3' }, { v: 1 / 2, k: '1/2' }, { v: 2 / 3, k: '2/3' },
    { v: 3 / 4, k: '3/4' }, { v: 1, k: '1' }, { v: 1.5, k: '1.5' }, { v: 2, k: '2' }
  ];

  function _pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length) % arr.length]; }
  // (M7, CO-16) 벳 B는 0.5bb 단위로 반올림되므로 P x f가 0.5의 배수가 아닌 조합(P 4와 1/3, P 15와 1/4 등)은 실제 B/P가 f와 달라진다.
  //   결과 화면의 스팟 라벨('벳 전 팟의 1/3 크기 벳')이 거짓이 되므로 그 조합은 같은 난수 하나로 맞는 비율을 다시 고른다.
  //   (난수 소비 횟수와 맞는 조합의 출제는 그대로, 12/72 조합만 바뀐다. 배치 고사의 시드 출제도 대부분 불변)
  function _fracOk(P, f) { var h = P * f.v * 2; return Math.abs(h - Math.round(h)) < 1e-9; }
  function _pickFrac(P, rnd) {
    var r = rnd();
    var F = FRACS[Math.floor(r * FRACS.length) % FRACS.length];
    if (_fracOk(P, F)) return F;
    var ok = FRACS.filter(function(f) { return _fracOk(P, f); });
    return ok[Math.floor(r * ok.length) % ok.length];
  }
  function _num1(x) { var v = Math.round(x * 10) / 10; return (v % 1 === 0) ? String(v) : v.toFixed(1); }
  function optLabel(p) { return _num1(1 / p) + '번에 1번 (' + Math.round(p * 100) + '%)'; }

  function next(rnd, opts) {
    rnd = rnd || Math.random;
    var P = _pick(POTS, rnd);
    var F = _pickFrac(P, rnd);
    var B = Math.round(P * F.v * 2) / 2;   // _pickFrac 덕에 P x F.v와 같다(CO-16)
    if (B <= 0) B = 0.5;
    var correct = B / (P + 2 * B);
    var cands = [B / (P + B), Math.min(B / P, 0.9), correct + 0.08, correct - 0.08, correct + 0.12, correct - 0.04, correct + 0.16, correct + 0.04];
    var used = [Math.round(correct * 100)];
    var wrong = [];
    for (var i = 0; i < cands.length && wrong.length < 3; i++) {
      var p = cands[i];
      var pr = Math.round(p * 100);
      if (!(p > 0.01 && p < 0.99) || used.indexOf(pr) >= 0) continue;
      var lab = optLabel(p);
      if (wrong.some(function(w) { return w.label === lab; }) || lab === optLabel(correct)) continue;
      used.push(pr);
      wrong.push({ p: p, label: lab });
    }
    var all = [{ p: correct, label: optLabel(correct), ok: true }].concat(wrong);
    // 셔플(Fisher-Yates, 시드 RNG)
    for (var j = all.length - 1; j > 0; j--) {
      var t = Math.floor(rnd() * (j + 1)) % (j + 1);
      var tmp = all[j]; all[j] = all[t]; all[t] = tmp;
    }
    var options = [], labels = {}, answer = '0';
    all.forEach(function(o, idx) {
      var id = String(idx);
      options.push(id);
      labels[id] = o.label;
      if (o.ok) answer = id;
    });
    var X = P + B;
    return {
      type: 'potodds', key: 'f=' + F.k, P: P, B: B, f: F.k, potTotal: X, toCall: B,
      answer: answer, answerPct: Math.round(correct * 100), options: options, labels: labels,
      prompt: '팟 ' + X + 'bb(상대 벳 ' + B + 'bb 포함), 콜 ' + B + 'bb. 콜하면 몇 번에 1번 이겨야 본전일까?'
    };
  }

  function explain(q) {
    var X = q.P + q.B, Y = q.B;
    var k = _num1((X + Y) / Y);
    var pct = Math.round(Y / (X + Y) * 100);
    var line = '팟 ' + X + 'bb, 콜 ' + Y + 'bb → 필요 승률 ' + Y + '/(' + X + '+' + Y + ') = ' + pct + '%. ' +
      '콜 ' + Y + 'bb로 ' + X + 'bb를 노림 = ' + _num1(X / Y) + '배 내기 → ' +
      k + '번에 1번(' + pct + '%) 이기면 본전. (콜하면 최종 팟 = 팟 ' + X + ' + 내 콜 ' + Y + ' = ' + (X + Y) + 'bb, 그중 내 콜 몫 ' + Y + 'bb)';
    return { line: line, model: null };
  }

  var gen = { title: '🧮 팟 오즈 암산', next: next, explain: explain };
  if (typeof Drills !== 'undefined') Drills.register('potodds', gen);
  var api = { next: next, explain: explain, optLabel: optLabel, _fracOk: _fracOk };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
