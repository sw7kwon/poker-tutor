// ai/villain-tracker.js — 빌런별 성향 통계(VPIP/PFR/3벳/AF/벳폴드), 세션 단위 메모리 집계
// localStorage 미사용. 히어로 액션은 추적하지 않음. 연습 핸드는 호출부(app)에서 제외.
var VillainTracker = (function() {
  var _sid = null;
  var _data = {}; // name -> { hands:{handKey:{vpip,pfr,tb}}, aggr, calls, folds, facing }

  function reset(sid) {
    _sid = (sid === undefined) ? null : sid;
    _data = {};
  }

  function _rec(name) {
    if (!_data[name]) _data[name] = { hands: {}, aggr: 0, calls: 0, folds: 0, facing: 0 };
    return _data[name];
  }

  function observe(sid, state, villainActions) {
    if (sid !== _sid) reset(sid);
    if (!state || !villainActions || !villainActions.length) return;
    var handKey = state.seed + '#' + state.handNum;
    var pre = state.street === 'preflop';
    villainActions.forEach(function(va) {
      if (!va || !va.name || va.name === 'Hero') return;
      var r = _rec(va.name);
      var a = va.action;
      if (pre) {
        var h = r.hands[handKey] || (r.hands[handKey] = { vpip: false, pfr: false, tb: false });
        if (a === 'call' || a === 'raise' || a === '3bet' || a === 'bet' || a === 'allin') h.vpip = true;
        if (a === 'raise' || a === '3bet' || a === 'bet' || a === 'allin') h.pfr = true;
        if (a === '3bet' || va.label === '3벳') h.tb = true;
      } else {
        if (a === 'bet' || a === 'raise' || a === 'allin') r.aggr++;
        else if (a === 'call') r.calls++;
        else if (a === 'fold') r.folds++;
        if (a === 'fold' || a === 'call' || a === 'raise') r.facing++;
      }
    });
  }

  function _round(v, d) { var m = Math.pow(10, d || 0); return Math.round(v * m) / m; }

  function stats(name) {
    var r = _data[name];
    if (!r) return null;
    var keys = Object.keys(r.hands);
    var n = keys.length;
    if (!n) return null;
    var v = 0, p = 0, t = 0;
    keys.forEach(function(k) { var h = r.hands[k]; if (h.vpip) v++; if (h.pfr) p++; if (h.tb) t++; });
    var vpip = _round(v / n * 100), pfr = _round(p / n * 100);
    var af = r.calls ? _round(r.aggr / r.calls, 1) : r.aggr;
    var foldToBet = r.facing ? r.folds / r.facing : null;
    var style = null;
    if (n >= 15) {
      var ratio = vpip > 0 ? pfr / vpip : 0;
      if (vpip >= 35 && ratio < 0.4) style = '🐟 루즈-패시브';
      else if (vpip >= 28 && ratio >= 0.65) style = '🔥 루즈-공격';
      else if (vpip <= 14) style = '🧊 타이트';
      else style = '⚖ 정석';
    }
    return { n: n, vpip: vpip, pfr: pfr, threeBet: _round(t / n * 100), af: af, foldToBet: foldToBet, style: style };
  }

  var TITLE = 'VPIP: 자발적으로 팟에 돈을 넣은 비율(높을수록 많이 참여) | PFR: 프리플랍 레이즈 비율 | AF: 벳, 레이즈 ÷ 콜(높을수록 공격적) | 벳폴드: 포스트플랍 벳을 맞고 접은 비율';

  function hudText(name) {
    var s = stats(name);
    var n = s ? s.n : 0;
    if (!s || n < 5) return { short: '관찰 중 (n=' + n + ')', title: TITLE, style: null };
    var ftb = s.foldToBet == null ? '-' : Math.round(s.foldToBet * 100) + '%';
    return {
      short: 'VPIP ' + s.vpip + ' | PFR ' + s.pfr + '<br>AF ' + s.af + ' | 벳폴드 ' + ftb + '<br>' + n + '핸드',
      title: TITLE,
      style: s.style
    };
  }

  if (typeof module !== 'undefined') module.exports = { reset: reset, observe: observe, stats: stats, hudText: hudText };
  return { reset: reset, observe: observe, stats: stats, hudText: hudText };
})();
