// drills/math-drill.js — 8차 WP6: 팟 오즈 암산 4지선다
// 필요 승률 = B/(P+2B) (콜 B로 P+B를 노림). 함정 보기: 자기 콜 빼먹기 B/(P+B), B/P, 정답±8%p
var MathDrill = (function() {
  var POTS = [4, 6, 8, 10, 12, 15, 20, 30, 40];
  var FRACS = [
    { v: 1 / 4, k: '1/4' }, { v: 1 / 3, k: '1/3' }, { v: 1 / 2, k: '1/2' }, { v: 2 / 3, k: '2/3' },
    { v: 3 / 4, k: '3/4' }, { v: 1, k: '1' }, { v: 1.5, k: '1.5' }, { v: 2, k: '2' }
  ];

  function _pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length) % arr.length]; }
  function _num1(x) { var v = Math.round(x * 10) / 10; return (v % 1 === 0) ? String(v) : v.toFixed(1); }
  function optLabel(p) { return _num1(1 / p) + '번에 1번 (' + Math.round(p * 100) + '%)'; }

  function next(rnd, opts) {
    rnd = rnd || Math.random;
    var P = _pick(POTS, rnd);
    var F = _pick(FRACS, rnd);
    var B = Math.round(P * F.v * 2) / 2;
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
    return {
      type: 'potodds', key: 'f=' + F.k, P: P, B: B, f: F.k,
      answer: answer, answerPct: Math.round(correct * 100), options: options, labels: labels,
      prompt: '팟 ' + P + 'bb에 상대가 ' + B + 'bb 벳. 콜하면 몇 번에 1번 이겨야 본전일까?'
    };
  }

  function explain(q) {
    var k = _num1((q.P + 2 * q.B) / q.B);
    var pct = Math.round(q.B / (q.P + 2 * q.B) * 100);
    var line = '콜 ' + q.B + 'bb로 ' + (q.P + q.B) + 'bb를 노림 = ' + _num1((q.P + q.B) / q.B) + '배 내기 → ' +
      k + '번에 1번(' + pct + '%) 이기면 본전. (최종 팟 = 팟 ' + q.P + ' + 상대 벳 ' + q.B + ' + 내 콜 ' + q.B + ' = ' + (q.P + 2 * q.B) + 'bb, 내 콜 몫 ' + q.B + 'bb)';
    return { line: line, model: null };
  }

  var gen = { title: '🧮 팟 오즈 암산', next: next, explain: explain };
  if (typeof Drills !== 'undefined') Drills.register('potodds', gen);
  var api = { next: next, explain: explain, optLabel: optLabel };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
