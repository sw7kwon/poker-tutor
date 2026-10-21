// journey/hero-stats.js (채우는 패키지: M1-P2)
// 히어로 HUD 지표(순수): 결정 1회의 기회/성공 증분, 핸드 끝 쇼다운 지표, 차트 기준 목표 밴드, 표본 신뢰도.
// 호출 규약: Journey.afterDecision이 observe(ctx.state, ctx.executed, ctx.amount, ctx.heroPos) 결과를
// JStats.record('hero', delta)로, Journey.onHandEnd가 onHandEnd(...) 결과를 JStats.record('handEnd', ...)로 보낸다.
// action은 실제 실행된 액션(공짜 폴드가 체크로 바뀐 경우 'check')을 넘긴다.
//
// M5-HUD(거울 HUD, 운 미터, 세션 요약 블록). 설계서 1.3절 7번, 4.5절 끝, 5.7절, 8.2절, 계약 F1.
// 거울 HUD(순수)
//   mirror(totals, opts{bands, days, sessionHands}) → { rows:[행], hands, days, sessionHands, basis }
//     totals = JStats.heroTotals(30) 모양 { vpipOpp, vpip, pfrOpp, pfr, tbOpp, tb, f3Opp, f3, hands }
//     행 = { key('vpip'|'pfr'|'tb'|'f3'), label, desc, opp, n, value(% 소수 1자리|null), band{lo,mid,hi}|null(bandsFromChart 그대로),
//            conf('gray'|'provisional'|'firm'), confText, more(다음 단계까지 기회 수), zone('in'|'low'|'high'|'gray'),
//            icon, zoneText, hint(정보형 한 줄) }
//     영역: 신뢰도 gray(기회 30 미만, 3벳과 3벳에 폴드는 20 미만)면 'gray', 아니면 값 < lo 'low', 값 > hi 'high', 그 사이 'in'.
//     표시는 색(클래스 is-<zone>) + 글자(zoneText) + 아이콘(✓ ▼ ▲ ?) 3중. bandsFromChart의 출력은 바꾸지 않는다(s2-10 band calc가 쓴다).
// 운 미터(계약 F1). 저장 poker_journey.luck = { cards:[카드](최근 50), views:[{ at, id }](최근 100) }, Journey.load()/save()로만.
//   luckFromHand(ctx) → 카드|null(순수, 저장 안 함). ctx = app.js _showResult 훅 { decisions, result, state(정산 뒤), startStacks,
//     net, pot, practice, gtoMode, gtoRound, heroPos, mode, sessionId, hu, heroFolded, now }.
//     기록 조건: 연습, GTO 2회차, HU(2인) 제외. 쇼다운까지 갔고 히어로가 폴드하지 않았으며, 정산 전 칩이 남은 사람이 1명 이하
//     (히어로가 올인했거나 히어로가 상대 올인을 콜해 더 벳할 수 없는 상태). 메인 팟 금액까지 따라온 뒤 폴드한 사람이 있으면
//     올인 시점과 끝의 상대 구성이 달라 제외한다. 올인 시점 = 히어로가 마지막으로 돈을 넣은 결정
//     (콜, 벳, 레이즈, 올인)의 스트리트. 단 상대가 모두 올인한 뒤 아무도 받지 않은 포스트플랍 벳(돌려받는 돈)은 건너뛴다.
//     pot = 받은 팟(돌려받은 초과분 제외). 리버 올인은 남은 카드가 없어 운이 끼지 않으므로 기록하지 않는다(F1 street는 preflop, flop, turn).
//     에쿼티 = Highlight.equity(끝까지 남은 사람 전원, 그 스트리트 보드, seed): 보드 3장 이상은 남은 카드 전부 열거('엔진 계산'),
//     프리플랍은 시드 고정 모의 5000회('근사'). 결과 = 최종 보드 족보 비교(win, lose, split, split이면 share = 1/공동 승자 수).
//   카드 = { id, at(ISO), seed, heroPos, mode, street, eq(0~1, 소수 3자리), exact, result, net(bb), pot(bb),
//            share(0~1), light(그 결정의 코치 신호등|null), sid(세션 id), hole['As','Kd'], board[올인 시점], opp[[상대 카드 2장]...] }
//   recordLuck(ctx) → 카드|null(저장), luckCards(limit) → 최신순 복사, markLuckView(id, now) → 기록했으면 true
//     (같은 카드를 10분 안에 다시 그린 것은 세지 않는다. 화면을 다시 그릴 때 열람 수가 부풀지 않게),
//   luckViews(fromMs) → fromMs 이후 열람 수(생략하면 전체). Boss custom 'luckMeterViews'가 쓴다.
//   luckCardModel(card) → 화면 문구(정보형: '결정 좋음, 이번엔 28%가 왔음'. 결정 평가는 그 결정의 코치 신호등, 결과는 운).
//   luckSummary(cards) → { n, expect(승률 합), actual(실제 몫 합), diff, text }. 운이 좋았던/나빴던 편 판정 임계는 max(0.5승, 이항 표준편차
//     sqrt(합 eq(1-eq))), 올인 5번 미만이면 '아직 표본이 적어요'를 덧붙인다(M7 CO-18).
// 화면 조각(문자열): mirrorHTML(m, {compact}), luckCardHTML(card), sessionHTML(o). 클래스는 css/dashboard.css의 hs- 접두.
// renderSession(el, opts{sessionId, hands, now}): app.js _renderSessionSummary가 1줄로 부른다. 최근 30일 거울 HUD 칩과
//   이번 세션 운 미터 카드(최대 3장)를 붙이고, 카드가 화면에 보이면 markLuckView로 열람 기록(watchLuckViews).
// watchLuckViews(root, ids, now): IntersectionObserver로 카드가 절반 이상 보일 때 기록, 없으면 즉시 기록(대시보드도 쓴다).
// 테스트 주입: _setLuckSource(null = 전역 Journey | false = 메모리 | {load, save}).
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

  // ── 거울 HUD(M5-HUD) ──
  var METRICS = ['vpip', 'pfr', 'tb', 'f3'];
  var METRIC_LABEL = { vpip: 'VPIP', pfr: 'PFR', tb: '3벳', f3: '3벳에 폴드' };
  var METRIC_DESC = { vpip: '스스로 칩을 넣고 참여한 비율(블라인드만 낸 건 빼요)', pfr: '프리플랍에서 레이즈로 들어간 비율(오픈, 3벳 포함)', tb: '상대 오픈에 다시 레이즈한 비율',
    f3: '내 오픈이 3벳을 받았을 때 폴드한 비율' };
  var ZONE_ICON = { 'in': '✓', low: '▼', high: '▲', gray: '?' };
  var ZONE_TEXT = { 'in': '밴드 안', low: '밴드보다 낮음', high: '밴드보다 높음', gray: '아직 모름' };
  var CONF_TEXT = { gray: '아직 모름', provisional: '잠정', firm: '확정' };
  var HINT = {
    vpip: { low: '차트보다 적게 참여해요', high: '차트보다 많이 참여해요' },
    pfr: { low: '차트보다 레이즈가 적어요', high: '차트보다 레이즈가 많아요' },
    tb: { low: '차트보다 3벳이 적어요', high: '차트보다 3벳이 많아요' },
    f3: { low: '차트보다 3벳에 덜 접어요', high: '차트보다 3벳에 많이 접어요' }
  };
  var BASIS = '이 앱의 차트 기준';

  function _n(x) { var v = Number(x); return isFinite(v) ? v : 0; }
  function _isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function _thresh(metric) { return (metric === 'tb' || metric === 'f3') ? [20, 50] : [30, 100]; }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function mirror(totals, opts) {
    opts = opts || {};
    var t = totals || {};
    var bands = (opts.bands !== undefined) ? opts.bands : bandsFromChart();
    var rows = METRICS.map(function(k) {
      var opp = Math.max(0, Math.floor(_n(t[k + 'Opp'])));
      var n = Math.max(0, Math.min(opp, Math.floor(_n(t[k]))));
      var value = opp ? _r1(n / opp * 100) : null;
      var b = bands && bands[k];
      var band = (b && isFinite(Number(b.lo)) && isFinite(Number(b.hi))) ? { lo: Number(b.lo), mid: Number(b.mid), hi: Number(b.hi) } : null;
      var conf = confidence(opp, k);
      var th = _thresh(k);
      var zone = (conf === 'gray' || value === null || !band) ? 'gray' : value < band.lo ? 'low' : value > band.hi ? 'high' : 'in';
      var more = conf === 'gray' ? th[0] - opp : conf === 'provisional' ? th[1] - opp : 0;
      var confText = conf === 'gray' ? CONF_TEXT.gray + '(기회 ' + opp + '/' + th[0] + ')'
        : conf === 'provisional' ? CONF_TEXT.provisional + '(기회 ' + opp + '/' + th[1] + ')' : CONF_TEXT.firm + '(기회 ' + opp + ')';
      var hint = zone === 'gray' ? (band ? '기회 ' + more + '번 더 모이면 보여요' : '차트 밴드를 계산하지 못했어요')
        : zone === 'in' ? '차트 밴드 안이에요' : HINT[k][zone];
      return { key: k, label: METRIC_LABEL[k], desc: METRIC_DESC[k], opp: opp, n: n, value: value, band: band,
        conf: conf, confText: confText, more: more, zone: zone, icon: ZONE_ICON[zone], zoneText: ZONE_TEXT[zone], hint: hint };
    });
    return { rows: rows, hands: Math.max(0, Math.floor(_n(t.hands))), days: opts.days || 30,
      sessionHands: (opts.sessionHands == null) ? null : Math.max(0, Math.floor(_n(opts.sessionHands))), basis: BASIS };
  }

  // 지표별 그림 축(%): 밴드와 값이 한눈에 들어오게 고정 범위
  var SCALE_MAX = { vpip: 60, pfr: 60, tb: 30, f3: 100 };
  function _pctOf(v, max) { return Math.max(0, Math.min(100, v / max * 100)); }
  function _bandBar(row) {
    var max = SCALE_MAX[row.key] || 100;
    var parts = '';
    if (row.band) {
      var l = _pctOf(row.band.lo, max), h = _pctOf(row.band.hi, max);
      parts += '<span class="hs-band" style="left:' + l.toFixed(1) + '%;width:' + Math.max(1, h - l).toFixed(1) + '%"></span>';
    }
    if (row.value !== null) {
      parts += '<span class="hs-dot" style="left:' + _pctOf(row.value, max).toFixed(1) + '%"></span>';
    }
    return '<span class="hs-track" aria-hidden="true">' + parts + '</span>' +
      '<span class="hs-axis" aria-hidden="true"><span>0</span><span>' + max + '%</span></span>';
  }
  function _bandText(row) { return row.band ? '밴드 ' + row.band.lo + '~' + row.band.hi + '%' : '밴드 없음'; }

  // compact: 세션 요약 2x2 칩, 아니면 대시보드 행(밴드 막대 포함)
  function mirrorHTML(m, opts) {
    opts = opts || {};
    if (!m || !m.rows) return '';
    var compact = !!opts.compact;
    var items = m.rows.map(function(r) {
      var val = r.value === null ? '없음' : r.value + '%';
      var aria = r.label + ' ' + val + ', ' + r.zoneText + ', ' + _bandText(r) + ', ' + r.confText;
      if (compact) {
        return '<li class="hs-chip is-' + r.zone + '" aria-label="' + _esc(aria) + '">' +
          '<span class="hs-chip-top"><span class="hs-ic" aria-hidden="true">' + r.icon + '</span>' +
          '<span class="hs-k">' + _esc(r.label) + '</span><span class="hs-v">' + _esc(val) + '</span></span>' +
          '<span class="hs-z">' + _esc(r.zoneText) + '</span>' +
          '<span class="hs-b">' + _esc(_bandText(r)) + ', ' + _esc(CONF_TEXT[r.conf]) + '</span></li>';
      }
      return '<li class="hs-row is-' + r.zone + '" aria-label="' + _esc(aria) + '">' +
        '<span class="hs-row-top"><span class="hs-ic" aria-hidden="true">' + r.icon + '</span>' +
        '<span class="hs-k">' + _esc(r.label) + '</span><span class="hs-v">' + _esc(val) + '</span>' +
        '<span class="hs-z">' + _esc(r.zoneText) + '</span></span>' +
        _bandBar(r) +
        '<span class="hs-row-d">' + _esc(r.desc) + '. ' + _esc(_bandText(r)) + '. ' + _esc(r.hint) + '</span>' +
        '<span class="hs-conf is-' + r.conf + '">' + _esc(r.confText) + '</span></li>';
    });
    return '<ul class="hs-mirror' + (compact ? ' is-compact' : '') + '">' + items.join('') + '</ul>';
  }

  // ── 운 미터(계약 F1) ──
  var LUCK_CAP = 50, VIEW_CAP = 100, VIEW_GUARD_MS = 10 * 60 * 1000;
  var BOARD_N = { preflop: 0, flop: 3, turn: 4 };
  var MONEY = { call: 1, raise: 1, allin: 1, bet: 1, '3bet': 1 };
  var STREET_KOR = { preflop: '프리플랍', flop: '플랍', turn: '턴' };
  var _luckSrc = null;          // null = 전역 Journey, false = 메모리, {load, save}
  var _luckMem = null;

  function _cardStr(c) { return (c && c.rank && c.suit) ? String(c.rank) + String(c.suit) : null; }
  function _strs(list) { var out = []; (list || []).forEach(function(c) { var s = _cardStr(c); if (s) out.push(s); }); return out; }
  function _hasHL() { return typeof Highlight !== 'undefined' && !!Highlight && typeof Highlight.equity === 'function'; }

  // 최종 보드 족보 비교: { result, share } | null
  function _showdown(active, holes, board) {
    if (typeof HandEval === 'undefined' || !HandEval || typeof HandEval.evaluate !== 'function' || (board || []).length < 5) return null;
    var sc = {}, best = null;
    for (var i = 0; i < active.length; i++) {
      var h = holes[active[i]];
      if (!h || h.length < 2) return null;
      sc[active[i]] = HandEval.evaluate(h.concat(board));
      if (best === null || HandEval.compareHands(sc[active[i]], sc[best]) < 0) best = active[i];
    }
    var winners = active.filter(function(n) { return HandEval.compareHands(sc[n], sc[best]) === 0; });
    if (winners.indexOf('Hero') < 0) return { result: 'lose', share: 0 };
    if (winners.length === 1) return { result: 'win', share: 1 };
    return { result: 'split', share: _r3(1 / winners.length) };
  }
  function _r2(x) { return Math.round(x * 100) / 100; }
  function _r3(x) { return Math.round(x * 1000) / 1000; }
  // 포스트플랍에서 콜할 돈 0일 때 먼저 넣은 벳의 크기(raise-to = 이 스트리트 투입). 그 밖의 결정이나 toCall 기록이 없으면 0
  function _openBet(d) {
    if (!d || d.street === 'preflop' || typeof d.toCall !== 'number' || d.toCall > 0.005) return 0;
    if (d.action !== 'raise' && d.action !== 'allin' && d.action !== 'bet') return 0;
    var a = Number(d.amount);
    return isFinite(a) && a > 0 ? a : 0;
  }
  // 받은 팟: 전원 투입 합 - 가장 많이 넣은 사람의 받지 않은 초과분(resolveShowdown이 돌려주는 몫)
  function _contestedPot(tc) {
    var vals = Object.keys(tc || {}).map(function(n) { return _n(tc[n]); }).sort(function(a, b) { return b - a; });
    if (!vals.length) return 0;
    var sum = 0;
    vals.forEach(function(v) { sum += v; });
    return sum - Math.max(0, vals[0] - (vals.length > 1 ? vals[1] : 0));
  }

  function luckFromHand(ctx) {
    ctx = ctx || {};
    if (ctx.practice || (ctx.gtoMode && ctx.gtoRound === 2)) return null;
    var s = ctx.state, res = ctx.result;
    if (!s || !res || !res.showCards) return null;
    var names = Array.isArray(s.names) ? s.names : Object.keys(s.holeCards || {});
    var hu = (ctx.hu != null) ? !!ctx.hu : names.length === 2;
    if (hu || names.length < 3) return null;
    var folded = s.folded || {};
    if (folded.Hero || ctx.heroFolded) return null;
    var active = names.filter(function(n) { return !folded[n]; });
    if (active.length < 2 || active.indexOf('Hero') < 0) return null;
    // 정산 전 남은 칩: 시작 스택 - 핸드 누적 투입(없으면 정산 뒤 스택 - 받은 몫)
    var withChips = active.filter(function(n) {
      var left;
      if (ctx.startStacks && ctx.startStacks[n] != null && s.totalContrib) left = _n(ctx.startStacks[n]) - _n(s.totalContrib[n]);
      else left = _n(s.stacks && s.stacks[n]) - _n(res.payouts && res.payouts[n]);
      return left > 0.005;
    });
    if (withChips.length > 1) return null;                              // 아직 벳할 수 있는 사람이 둘 이상 = 올인 쇼다운 아님
    // 메인 팟 금액까지 따라온 뒤 폴드한 사람이 있으면 올인 시점의 상대 구성과 끝 구성이 달라 제외한다
    if (s.totalContrib) {
      var main = Math.min.apply(null, active.map(function(n) { return _n(s.totalContrib[n]); }));
      var late = names.some(function(n) { return folded[n] && main > 0 && _n(s.totalContrib[n]) >= main - 0.005; });
      if (late) return null;
    }
    var decs = Array.isArray(ctx.decisions) ? ctx.decisions : (s.decisions || []);
    // 상대가 모두 올인한 뒤에도 칩이 남은 히어로는 다음 스트리트에서 다시 벳할 수 있다(게임이 묻는다). 아무도 받지 않아
    // 돌려받는 그 벳은 올인 시점이 아니므로, 받지 않은 초과분(히어로 투입 - 남은 상대 최대 투입) 안에 드는
    // 포스트플랍 벳(콜할 돈 0에서 레이즈, 올인)은 뒤에서부터 건너뛴다. toCall이 없는 기록은 예전 규칙 그대로.
    var excess = 0;
    if (s.totalContrib) {
      var topOther = 0;
      active.forEach(function(n) { if (n !== 'Hero') topOther = Math.max(topOther, _n(s.totalContrib[n])); });
      excess = Math.max(0, _n(s.totalContrib.Hero) - topOther);
    }
    var last = null;
    for (var i = decs.length - 1; i >= 0; i--) {
      var d = decs[i];
      if (!(d && MONEY[d.action] && d.street)) continue;
      var lone = _openBet(d);
      if (lone > 0 && excess >= lone - 0.005) { excess -= lone; continue; }
      last = d; break;
    }
    if (!last || BOARD_N[last.street] == null) return null;             // 돈을 넣은 결정이 없거나 리버 올인
    var street = last.street;
    var holes = s.holeCards || {};
    var full = s.board || [];
    var board = full.slice(0, BOARD_N[street]);
    if (board.length < BOARD_N[street] || !_hasHL()) return null;
    var order = ['Hero'].concat(active.filter(function(n) { return n !== 'Hero'; }));
    var players = order.map(function(n) { return { name: n, cards: holes[n] }; });
    var eqs = null;
    try { eqs = Highlight.equity(players, board, s.seed); } catch (e) { eqs = null; }
    if (!eqs || eqs.length !== order.length) return null;
    var he = eqs.filter(function(x) { return x.name === 'Hero'; })[0];
    if (!he || !isFinite(Number(he.eq))) return null;
    var sd = _showdown(active, holes, full) || { result: res.heroWon ? 'win' : 'lose', share: res.heroWon ? 1 : 0 };
    var now = (typeof ctx.now === 'number' && isFinite(ctx.now)) ? ctx.now : Date.now();
    // 팟 = 받은 팟(돌려받은 초과분 제외). totalContrib가 없으면 app.js가 넘긴 정산 전 팟
    var pot = s.totalContrib ? _contestedPot(s.totalContrib) : (ctx.pot != null ? _n(ctx.pot) : 0);
    var seed = (s.seed == null) ? null : s.seed;
    return {
      id: 'lk-' + now.toString(36) + '-' + (seed == null ? 'x' : String(seed)),
      at: new Date(now).toISOString(), seed: seed, heroPos: ctx.heroPos || (s.players && s.players.Hero && s.players.Hero.pos) || null,
      mode: ctx.mode || null, street: street, eq: _r3(Number(he.eq)), exact: board.length >= 3,
      result: sd.result, share: sd.share, net: _r2(_n(ctx.net)), pot: _r2(pot),
      light: (last.light === 'green' || last.light === 'yellow' || last.light === 'red') ? last.light : null,
      sid: ctx.sessionId == null ? null : ctx.sessionId,
      hole: _strs(holes.Hero), board: _strs(board),
      opp: order.slice(1).map(function(n) { return _strs(holes[n]); })
    };
  }

  // 저장 위치(poker_journey.luck)
  function _ctx() {
    var src = _luckSrc;
    var st = null, save = null;
    if (src === null && typeof Journey !== 'undefined' && Journey && typeof Journey.load === 'function') {
      try { st = Journey.load(); save = function() { if (typeof Journey.save === 'function') Journey.save(); }; } catch (e) { st = null; }
    } else if (src && typeof src.load === 'function') {
      st = src.load(); save = function() { if (typeof src.save === 'function') src.save(st); };
    }
    if (!_isObj(st)) { if (!_luckMem) _luckMem = {}; st = _luckMem; save = function() {}; }
    if (!_isObj(st.luck)) st.luck = { cards: [], views: [] };
    if (!Array.isArray(st.luck.cards)) st.luck.cards = [];
    if (!Array.isArray(st.luck.views)) st.luck.views = [];
    return { lk: st.luck, save: save };
  }

  function recordLuck(ctx) {
    try {
      var card = luckFromHand(ctx);
      if (!card) return null;
      var c = _ctx();
      c.lk.cards.push(card);
      if (c.lk.cards.length > LUCK_CAP) c.lk.cards.splice(0, c.lk.cards.length - LUCK_CAP);
      c.save();
      return card;
    } catch (e) {
      try { if (typeof console !== 'undefined' && console.warn) console.warn('[HeroStats] 운 미터 기록 실패', (e && e.message) || e); } catch (x) {}
      return null;
    }
  }

  function luckCards(limit) {
    var arr = _ctx().lk.cards.slice().reverse();
    if (limit != null) arr = arr.slice(0, Math.max(0, Math.floor(_n(limit))));
    return JSON.parse(JSON.stringify(arr));
  }

  function _ms(iso) { var t = Date.parse(iso); return isFinite(t) ? t : NaN; }

  function markLuckView(id, now) {
    if (id == null || id === '') return false;
    now = (typeof now === 'number' && isFinite(now)) ? now : Date.now();
    var c = _ctx(), v = c.lk.views;
    for (var i = v.length - 1; i >= 0; i--) {
      if (v[i] && v[i].id === id) {
        var t = _ms(v[i].at);
        if (isFinite(t) && now - t >= 0 && now - t < VIEW_GUARD_MS) return false;
        break;
      }
    }
    v.push({ at: new Date(now).toISOString(), id: String(id) });
    if (v.length > VIEW_CAP) v.splice(0, v.length - VIEW_CAP);
    c.save();
    return true;
  }

  function luckViews(fromMs) {
    var v = _ctx().lk.views, from = (fromMs == null) ? -Infinity : Number(fromMs);
    if (isNaN(from)) from = -Infinity;
    var n = 0;
    v.forEach(function(x) { var t = x ? _ms(x.at) : NaN; if (isFinite(t) && t >= from) n++; });
    return n;
  }

  var DECISION_TEXT = { green: '결정 좋음', yellow: '결정 괜찮음', red: '결정 아쉬움' };
  var DECISION_ICON = { green: '🟢', yellow: '🟡', red: '🔴' };
  var RESULT_TEXT = { win: '이김', lose: '짐', split: '나눔' };
  var RESULT_ICON = { win: '🏆', lose: '💥', split: '🤝' };

  function luckCardModel(card) {
    if (!card) return null;
    var p = Math.max(0, Math.min(100, Math.round(_n(card.eq) * 100))), q = 100 - p;
    var res = RESULT_TEXT[card.result] ? card.result : 'lose';
    var luck;
    if (res === 'split') luck = '팟을 나눴음';
    else if (res === 'win') luck = p < 50 ? '이번엔 내 ' + p + '%가 왔음' : p === 50 ? '반반에서 이김' : '예상대로 내 ' + p + '%가 이김';
    else luck = p > 50 ? '이번엔 ' + q + '%가 왔음' : p === 50 ? '반반에서 짐' : '예상대로 상대 ' + q + '%가 이김';
    var light = DECISION_TEXT[card.light] ? card.light : null;
    var decision = light ? DECISION_TEXT[light] : '결정 판정 없음';
    var nOpp = Array.isArray(card.opp) ? card.opp.length : 1;
    var at = _ms(card.at), date = '';
    if (isFinite(at)) { var d = new Date(at); date = (d.getMonth() + 1) + '/' + d.getDate(); }
    return {
      id: card.id, head: decision + ', ' + luck, decision: decision, decisionIcon: light ? DECISION_ICON[light] : '⚪', light: light,
      luck: luck, eqPct: p, oppPct: q,
      sub: '올인 때 내 승률 ' + p + '%, ' + (nOpp > 1 ? '상대 ' + nOpp + '명 합쳐 ' : '상대 ') + q + '%',
      street: card.street, streetText: (STREET_KOR[card.street] || '') + ' 올인',
      exact: !!card.exact, label: card.exact ? '엔진 계산' : '근사',
      labelNote: card.exact ? '남은 카드를 전부 따져 본 값' : '같은 시드로 모의 5000판을 돌린 근사값',
      result: res, resultText: RESULT_TEXT[res], resultIcon: RESULT_ICON[res],
      lucky: (res === 'win' && p < 50) ? 'good' : (res === 'lose' && p > 50) ? 'bad' : 'even',   // 언더독 승리, 우세 패배
      net: _n(card.net), date: date, hole: card.hole || [], board: card.board || [], opp: card.opp || [],
      note: '칩 결과에는 운이 섞여요. 결정은 그 순간 코치 신호등으로 따로 봐요.'
    };
  }

  function luckSummary(cards) {
    var list = (cards || []).filter(function(c) { return c && isFinite(Number(c.eq)); });
    var expect = 0, actual = 0;
    list.forEach(function(c) {
      expect += Number(c.eq);
      actual += (c.share != null && isFinite(Number(c.share))) ? Number(c.share) : (c.result === 'win' ? 1 : c.result === 'split' ? 0.5 : 0);
    });
    var diff = _r1(actual - expect);
    var text;
    if (!list.length) text = '아직 올인 쇼다운 기록이 없어요';
    else {
      // CO-18: 표본이 작을수록 승수 차이는 우연으로도 크게 벌어진다. 이항 표준편차(합 eq(1-eq)의 제곱근)보다 작은 차이는 '거의 승률만큼'으로 읽고,
      // 올인 5번 미만이면 표본이 적다는 말을 덧붙인다(초보가 결과를 운으로 과대 귀속하지 않게, 설계서 4.7절 정보형 문구).
      var sd = Math.sqrt(list.reduce(function(a, c) { var e = Math.max(0, Math.min(1, Number(c.eq))); return a + e * (1 - e); }, 0));
      var thr = Math.max(0.5, sd);
      var tone = diff >= thr ? '운이 좋았던 편' : diff <= -thr ? '운이 나빴던 편' : '거의 승률만큼';
      if (list.length < 5) tone += ', 아직 표본이 적어요';
      text = '올인 쇼다운 ' + list.length + '번: 승률대로면 ' + _r1(expect) + '번 이길 판에서 실제 ' + _r1(actual) + '번 이김(' + tone + ')';
    }
    return { n: list.length, expect: _r1(expect), actual: _r1(actual), diff: diff, text: text };
  }

  function _cardsHTML(list) {
    var SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
    return (list || []).map(function(c) {
      var r = String(c).charAt(0), s = String(c).charAt(1);
      return '<span class="hs-card' + ((s === 'h' || s === 'd') ? ' is-red' : '') + '" data-suit="' + _esc(s) + '">' +
        (r === 'T' ? '10' : _esc(r)) + (SYM[s] || '') + '</span>';
    }).join('');
  }

  function luckCardHTML(card) {
    var m = luckCardModel(card);
    if (!m) return '';
    var oppCards = m.opp.map(function(o) { return '<span class="hs-hand">' + _cardsHTML(o) + '</span>'; }).join('');
    return '<div class="hs-luck is-' + m.result + '" data-id="' + _esc(m.id) + '">' +
      '<div class="hs-luck-top"><span class="hs-luck-t">🎲 운 미터</span>' +
        '<span class="hs-lbl ' + (m.exact ? 'is-exact' : 'is-approx') + '" title="' + _esc(m.labelNote) + '">' + (m.exact ? '✓ ' : '≈ ') + _esc(m.label) + '</span></div>' +
      '<div class="hs-luck-h">' + _esc(m.head) + '</div>' +
      '<div class="hs-meter" role="img" aria-label="' + _esc(m.sub + ', 결과 ' + m.resultText) + '">' +
        '<span class="hs-meter-fill" style="width:' + m.eqPct + '%"></span>' +
        '<span class="hs-meter-mid" aria-hidden="true"></span></div>' +
      '<div class="hs-meter-k" aria-hidden="true"><span>내 승률 ' + m.eqPct + '%</span><span>상대 ' + m.oppPct + '%</span></div>' +
      '<div class="hs-luck-row"><span class="hs-res is-' + m.result + '">' + m.resultIcon + ' ' + _esc(m.resultText) + '</span>' +
        '<span class="hs-luck-d">' + _esc(m.decisionIcon + ' ' + m.decision) + ', ' + _esc(m.streetText) + '</span></div>' +
      '<div class="hs-luck-cards"><span class="hs-hand is-hero">' + _cardsHTML(m.hole) + '</span><span class="hs-vs">vs</span>' + oppCards +
        (m.board.length ? '<span class="hs-board">' + _cardsHTML(m.board) + '</span>' : '') + '</div>' +
      '<div class="hs-luck-n">' + _esc(m.note) + '</div></div>';
  }

  // 세션 요약 블록(순수 문자열). o = { mirror(모델), cards(이번 세션 운 미터 카드), sessionHands }
  function sessionHTML(o) {
    o = o || {};
    var m = o.mirror;
    var html = '<div class="hs-session">';
    if (m) {
      html += '<div class="hs-sec-t">🪞 거울 HUD <span class="hs-basis">' + _esc(m.basis) + '</span></div>' +
        mirrorHTML(m, { compact: true }) +
        '<div class="hs-foot">최근 ' + m.days + '일 ' + m.hands + '핸드 기준' +
        (m.sessionHands != null ? ', 이번 세션 ' + m.sessionHands + '핸드' : '') +
        '. 밴드는 이 앱 차트대로 쳤을 때의 값 ±4%p예요. 기회가 적으면 아직 모름으로 둬요.</div>';
    }
    (o.cards || []).forEach(function(c) { html += luckCardHTML(c); });
    return html + '</div>';
  }

  function renderSession(el, opts) {
    opts = opts || {};
    try {
      var now = (typeof opts.now === 'number') ? opts.now : Date.now();
      var totals = (typeof JStats !== 'undefined' && JStats && typeof JStats.heroTotals === 'function') ? JStats.heroTotals(30, now) : {};
      var m = mirror(totals, { days: 30, sessionHands: opts.hands });
      var cards = [];
      if (opts.sessionId != null) cards = luckCards().filter(function(c) { return c.sid === opts.sessionId; }).slice(0, 3);
      var html = sessionHTML({ mirror: m, cards: cards });
      if (el && typeof document !== 'undefined' && document && typeof document.createElement === 'function') {
        var box = document.createElement('div');
        box.className = 'hs-session-wrap';
        box.innerHTML = html;
        el.appendChild(box);
        watchLuckViews(box, cards.map(function(c) { return c.id; }), now);
      }
      return { html: html, cards: cards.length };
    } catch (e) {
      try { if (typeof console !== 'undefined' && console.warn) console.warn('[HeroStats] 세션 블록 실패', (e && e.message) || e); } catch (x) {}
      return null;
    }
  }

  // 화면에 그린 운 미터 카드(.hs-luck[data-id])가 실제로 보이면 열람 기록. IntersectionObserver가 없거나 노드를 못 찾으면
  // (node 테스트, 옛 브라우저) 그린 즉시 기록한다. 반환 = 즉시 기록한 수
  function watchLuckViews(root, ids, now) {
    ids = (ids || []).filter(function(x) { return x != null && x !== ''; });
    if (!ids.length) return 0;
    var nodes = [];
    try { nodes = (root && typeof root.querySelectorAll === 'function') ? Array.prototype.slice.call(root.querySelectorAll('.hs-luck[data-id]')) : []; } catch (e) { nodes = []; }
    var IO = (typeof IntersectionObserver === 'function') ? IntersectionObserver : null;
    if (!IO || !nodes.length) {
      var n = 0;
      ids.forEach(function(id) { if (markLuckView(id, now)) n++; });
      return n;
    }
    var io = new IO(function(entries) {
      entries.forEach(function(en) {
        if (!en.isIntersecting) return;
        markLuckView(en.target.getAttribute('data-id'));
        io.unobserve(en.target);
      });
    }, { threshold: 0.5 });
    nodes.forEach(function(nd) { if (ids.indexOf(nd.getAttribute('data-id')) >= 0) io.observe(nd); });
    return 0;
  }

  function _setLuckSource(s) { _luckSrc = (s === false) ? false : (s && typeof s.load === 'function' ? s : null); _luckMem = null; }

  var api = { FIELDS: FIELDS, observe: observe, onHandEnd: onHandEnd, bandsFromChart: bandsFromChart, confidence: confidence,
    METRICS: METRICS, METRIC_LABEL: METRIC_LABEL, BASIS: BASIS, LUCK_CAP: LUCK_CAP, VIEW_CAP: VIEW_CAP, VIEW_GUARD_MS: VIEW_GUARD_MS,
    mirror: mirror, mirrorHTML: mirrorHTML,
    luckFromHand: luckFromHand, recordLuck: recordLuck, luckCards: luckCards, markLuckView: markLuckView, luckViews: luckViews,
    luckCardModel: luckCardModel, luckSummary: luckSummary, luckCardHTML: luckCardHTML,
    sessionHTML: sessionHTML, renderSession: renderSession, watchLuckViews: watchLuckViews, _setLuckSource: _setLuckSource };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
