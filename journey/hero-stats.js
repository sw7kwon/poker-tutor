// journey/hero-stats.js (채우는 패키지: M1-P2)
// 히어로 HUD 지표(순수): 결정 1회의 기회/성공 증분, 핸드 끝 쇼다운 지표, 차트 기준 목표 밴드, 표본 신뢰도.
// 호출 규약: Journey.afterDecision이 observe(ctx.state, ctx.executed, ctx.amount, ctx.heroPos) 결과를
// JStats.record('hero', delta)로, Journey.onHandEnd가 onHandEnd(...) 결과를 JStats.record('handEnd', ...)로 보낸다.
// action은 실제 실행된 액션(공짜 폴드가 체크로 바뀐 경우 'check')을 넘긴다.
var HeroStats = (function() {
  var POS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var FIELDS = ['vpipOpp', 'vpip', 'pfrOpp', 'pfr', 'tbOpp', 'tb', 'f3Opp', 'f3', 'cbetOpp', 'cbet'];

  function _zero() {
    var d = {};
    FIELDS.forEach(function(k) { d[k] = 0; });
    return d;
  }
  function _aggr(a) { return a === 'raise' || a === 'allin' || a === 'bet' || a === '3bet'; }
  function _vol(a) { return _aggr(a) || a === 'call'; }

  // preState = 히어로가 결정하기 직전 상태(GameState), action = 실행 액션
  function observe(preState, action, amount, heroPos) {
    var d = _zero();
    var s = preState;
    if (!s || !s.street) return d;
    var a = String(action || '');
    var decs = s.decisions || [];
    if (s.street === 'preflop') {
      var prev = decs.filter(function(x) { return x && x.street === 'preflop'; });
      var vpipBefore = prev.some(function(x) { return _vol(x.action); });
      var raisedBefore = prev.some(function(x) { return _aggr(x.action); });
      // VPIP/PFR 기회는 핸드당 1번(첫 프리플랍 결정), 성공도 핸드당 1번
      if (!prev.length) { d.vpipOpp = 1; d.pfrOpp = 1; }
      if (_vol(a) && !vpipBefore) d.vpip = 1;
      if (_aggr(a) && !raisedBefore) d.pfr = 1;
      var sbc = s.streetBetCount || 0;
      var lr = s.lastRaiser;
      var villainRaised = !!lr && lr !== 'Hero';
      // 3벳 기회: 상대 오픈(레이즈 1번)에 직면
      if (villainRaised && sbc === 1 && !raisedBefore) {
        d.tbOpp = 1;
        if (_aggr(a)) d.tb = 1;
      }
      // 폴드투3벳 기회: 내가 오픈했고(레이즈 1번째) 상대가 재레이즈(레이즈 2번째)
      if (villainRaised && sbc === 2 && raisedBefore) {
        d.f3Opp = 1;
        if (a === 'fold') d.f3 = 1;
      }
    } else if (s.street === 'flop') {
      var toCall = Math.max(0, (s.currentBet || 0) - ((s.playerBets && s.playerBets.Hero) || 0));
      var flopBefore = decs.some(function(x) { return x && x.street === 'flop'; });
      // c벳 기회: 프리플랍 마지막 레이저가 나이고 플랍에서 아직 벳이 없음
      if (s.pfAggressor === 'Hero' && toCall === 0 && !flopBefore) {
        d.cbetOpp = 1;
        if (_aggr(a)) d.cbet = 1;
      }
    }
    return d;
  }

  // 플랍 이상 본 핸드 기준: WTSD 기회 = 플랍을 봄, WTSD = 쇼다운까지 감, W$SD = 쇼다운 승리
  function onHandEnd(state, result, heroFolded) {
    var o = { wtsdOpp: 0, wtsd: 0, wsd: 0 };
    if (!state) return o;
    var decs = state.decisions || [];
    if (heroFolded == null) heroFolded = !!(state.folded && state.folded.Hero);
    var foldedPre = decs.some(function(x) { return x && x.street === 'preflop' && x.action === 'fold'; });
    var postDec = decs.some(function(x) { return x && x.street && x.street !== 'preflop'; });
    var sawFlop = !foldedPre && ((state.street && state.street !== 'preflop') || postDec);
    if (!sawFlop) return o;
    o.wtsdOpp = 1;
    if (!heroFolded && result && result.showCards) {
      o.wtsd = 1;
      if (result.heroWon) o.wsd = 1;
    }
    return o;
  }

  // ── 차트 기준 목표 밴드(백분율, 소수 1자리) ──
  var _bandCache = null, _bandKey = null;
  function _r1(x) { return Math.round(x * 10) / 10; }
  function _band(mid) {
    var m = _r1(mid * 100);
    return { lo: _r1(m - 4), mid: m, hi: _r1(m + 4) };
  }

  // gto: Gto 모듈(GTO_RANGES, rangeClassSet) 또는 GTO_RANGES 객체, coach: Coach(rangePct, 선택)
  function bandsFromChart(gto, coach) {
    var G = gto || (typeof Gto !== 'undefined' ? Gto : null);
    if (!G) return null;
    var R = G.GTO_RANGES || G;
    var classSet = G.rangeClassSet || (typeof Gto !== 'undefined' ? Gto.rangeClassSet : null);
    if (!R || !R.rfi || !R.vsRfi || !classSet) return null;
    if (_bandCache && _bandKey === R) return JSON.parse(JSON.stringify(_bandCache));
    var C = coach || (typeof Coach !== 'undefined' ? Coach : null);

    var setCache = {};
    function setOf(arr) {
      var k = (arr || []).join(',');
      if (!setCache[k]) setCache[k] = classSet(arr || []);
      return setCache[k];
    }
    function combos(set) {
      var n = 0;
      set.forEach(function(c) { n += c.length === 2 ? 6 : (c.charAt(2) === 's' ? 4 : 12); });
      return n;
    }
    function pct(arr) {
      if (!arr || !arr.length) return 0;
      if (C && C.rangePct) return C.rangePct(arr);
      return combos(setOf(arr)) / 1326;
    }
    function vsOpen(p, q) {
      var lp = q === 'CO' || q === 'BTN' || q === 'SB';
      var v = (p === 'BB' && lp && R.vsRfiBB_LP) ? R.vsRfiBB_LP : R.vsRfi[p];
      if (!v) return { join: 0, tb: 0 };
      var tb = v.threebet || [], call = v.call || [];
      return { join: pct(tb.concat(call)), tb: pct(tb) };
    }

    var rfi = POS.map(function(p) { return p === 'BB' ? 0 : pct(R.rfi[p]); });
    // noOpen[i] = 포지션 i 앞자리가 모두 폴드할 확률, openFirst[i] = 포지션 i가 첫 오프너일 확률
    var noOpen = [], openFirst = [];
    var acc = 1;
    for (var i = 0; i < POS.length; i++) {
      noOpen[i] = acc;
      openFirst[i] = acc * rfi[i];
      acc *= (1 - rfi[i]);
    }

    var vpipSum = 0, pfrSum = 0, tbNum = 0, tbDen = 0;
    for (var pi = 0; pi < POS.length; pi++) {
      var p = POS[pi];
      var vp = noOpen[pi] * rfi[pi], pf = noOpen[pi] * rfi[pi];
      for (var qi = 0; qi < pi; qi++) {
        var w = openFirst[qi];
        if (!w) continue;
        var o = vsOpen(p, POS[qi]);
        vp += w * o.join;
        pf += w * o.tb;
        tbNum += w * o.tb;
        tbDen += w;
      }
      vpipSum += vp;
      pfrSum += pf;
    }

    // 폴드투3벳: 오픈 레인지 중 vs3bet 표(4벳 + 콜)에 없는 비율, 오픈 빈도 가중 평균
    var f3Num = 0, f3Den = 0;
    for (var fi = 0; fi < POS.length; fi++) {
      var fp = POS[fi];
      var v3 = R.vs3bet && R.vs3bet[fp];
      if (!v3 || !R.rfi[fp] || !openFirst[fi]) continue;
      var open = setOf(R.rfi[fp]);
      var cont = setOf((v3.fourbet || []).concat(v3.call || []));
      var inter = new Set();
      cont.forEach(function(c) { if (open.has(c)) inter.add(c); });
      var oc = combos(open);
      if (!oc) continue;
      f3Num += openFirst[fi] * (1 - combos(inter) / oc);
      f3Den += openFirst[fi];
    }

    var out = {
      vpip: _band(vpipSum / POS.length),
      pfr: _band(pfrSum / POS.length),
      f3: _band(f3Den ? f3Num / f3Den : 0),
      tb: _band(tbDen ? tbNum / tbDen : 0)
    };
    _bandCache = out; _bandKey = R;
    return JSON.parse(JSON.stringify(out));
  }

  // 표본 신뢰도: 기본 30/100, 3벳과 폴드투3벳은 기회가 드물어 20/50
  function confidence(opp, metric) {
    var t = (metric === 'tb' || metric === 'f3') ? [20, 50] : [30, 100];
    var n = Number(opp) || 0;
    return n < t[0] ? 'gray' : n < t[1] ? 'provisional' : 'firm';
  }

  var api = { FIELDS: FIELDS, observe: observe, onHandEnd: onHandEnd, bandsFromChart: bandsFromChart, confidence: confidence };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
