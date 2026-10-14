// engine/ev.js
var EV = (function() {
  // 8차 WP1: raise-to(스트리트 총액) 기준 레이즈 EV — 순수 헬퍼(검산·테스트용 export)
  // pot=모든 베팅 포함 팟, X=현재 최고 베팅, h=내가 이번 스트리트에 이미 낸 칩, R=레이즈 총액(raise-to)
  // 폴드 받으면 팟을 가져가고, 콜 받으면 (팟 + 상대 추가 콜 R-X)을 걸고 내 추가 투입 R-h를 건다.
  function _raiseEVFor(pot, X, h, toCall, R, eqC, fe) {
    return fe * pot + (1 - fe) * (eqC * (pot + R - X) - (1 - eqC) * (R - h));
  }

  function calcOptions(state, equity) {
    var pot = state.pot;
    var X = state.currentBet || 0;
    var h = (state.playerBets && state.playerBets.Hero) || 0;
    var stack = (state.stacks && state.stacks.Hero) || 0;
    var toCall = Math.max(0, X - h);
    var maxTo = h + stack;
    var bb = state.bigBlind || 1;
    var minTo = state.minRaise || X + bb;
    var heroPos = (state.players && state.players.Hero && state.players.Hero.pos) || 'BTN';
    var sbc = state.streetBetCount || 0;
    var pre = state.street === 'preflop';
    var facingPost = !pre && toCall > 0;
    var oop = heroPos === 'SB' || heroPos === 'BB';
    var foldEV = 0;
    // EV(call) = eq × pot − (1−eq) × toCall  (pot은 콜 이전 팟 — toCall 이중산입 금지)
    var callEV = toCall === 0 ? 0 : equity * pot - (1 - equity) * toCall;

    // 표준 사이즈(raise-to): 오픈 2.5bb(SB 3, 림퍼당 +1), 3벳 IP 3x/OOP 4x, 4벳 2.3x,
    // 포스트플랍 벳 1/2팟·팟, 벳 직면 레이즈는 콜 후 팟 비례
    var half, potSz;
    if (pre && sbc === 0) {
      half = (heroPos === 'SB' ? 3 : 2.5) * bb;
      potSz = (heroPos === 'SB' ? 3.5 : 3) * bb;
      if (X === bb) {
        var limpers = Math.max(0, Math.round((pot - 1.5 * bb) / bb));
        half += limpers * bb;
        potSz += limpers * bb;
      }
    } else if (pre && sbc === 1) {
      half = X * (oop ? 4 : 3);
      potSz = X * (oop ? 4.5 : 3.5);
    } else if (pre) {
      half = X * 2.3;
      potSz = X * 2.6;
    } else if (toCall === 0) {
      half = pot * 0.5;
      potSz = pot;
    } else {
      half = X + 0.5 * (pot + toCall);
      potSz = X + (pot + toCall);
    }
    function clampTo(v) {
      v = Math.round(v * 10) / 10;
      return Math.min(maxTo, Math.max(minTo, v));
    }
    var raiseHalfAmt = clampTo(half);
    var raisePotAmt  = clampTo(potSz);
    var allinAmt     = maxTo;

    // v2 휴리스틱 (07-20) + 8차 보정: 여전히 솔버가 아닌 근사
    // ① 폴드에쿼티 = 추가 사이즈(R-X)/팟 비율의 함수 (+재레이즈 직면 시 절반, 포스트플랍 벳 직면 시 x0.6)
    // ② 콜 받은 가지 에쿼티 = 사이즈별 할인 — 큰 베팅을 콜하는 레인지는 강함
    // ③ 프리플랍 딥스택(15bb+) 오픈/3벳 스팟과 포스트플랍 깊은 SPR에선 올인을 추천 후보에서 제외
    var raisedAgainst = sbc >= 2 && state.lastRaiser && state.lastRaiser !== 'Hero';
    var feMul = (raisedAgainst ? 0.5 : 1) * (facingPost ? 0.6 : 1);
    function foldEqFor(R) {
      var base = pot + toCall;
      var ratio = base > 0 ? (R - X) / base : 1;
      return Math.max(0, Math.min(0.55, 0.18 + 0.14 * Math.min(ratio, 2.5))) * feMul;
    }
    var CALLED_EQ_MUL = { half: 0.93, pot: 0.87, allin: 0.75 };
    function raiseEV(R, eqMul) {
      var fe = foldEqFor(R);
      var eqC = Math.max(0.05, equity * eqMul);
      return _raiseEVFor(pot, X, h, toCall, R, eqC, fe);
    }
    var ev = {
      fold: foldEV,
      call: parseFloat(callEV.toFixed(2)),
      raise_half: parseFloat(raiseEV(raiseHalfAmt, CALLED_EQ_MUL.half).toFixed(2)),
      raise_pot:  parseFloat(raiseEV(raisePotAmt,  CALLED_EQ_MUL.pot).toFixed(2)),
      allin:      parseFloat(raiseEV(allinAmt,     CALLED_EQ_MUL.allin).toFixed(2)),
      raiseHalfAmt: raiseHalfAmt, raisePotAmt: raisePotAmt, allinAmt: allinAmt, equity: equity
    };
    var options = [
      { key: 'fold',       val: ev.fold       },
      { key: 'call',       val: ev.call       },
      { key: 'raise_half', val: ev.raise_half },
      { key: 'raise_pot',  val: ev.raise_pot  },
      { key: 'allin',      val: ev.allin      }
    ];
    var candidates = options;
    // 공짜 체크가 가능하면 폴드는 후보가 아님
    if (toCall === 0) candidates = candidates.filter(function(o){ return o.key !== 'fold'; });
    // ③ 딥스택 프리플랍 올인 배제 — Nash 푸시/폴드는 ~15bb 이하 영역, 그 위에선 표준 사이즈가 정석
    var excludeAllin = (pre && stack > 15 && sbc < 3)
      || (!pre && (maxTo - h) > 1.5 * (pot + toCall));
    if (excludeAllin) candidates = candidates.filter(function(o){ return o.key !== 'allin'; });
    ev.bestAction = candidates.reduce(function(a,b){ return b.val > a.val ? b : a; }).key;
    return ev;
  }

  // 부호 통일 포맷: +0.38bb / -0.38bb (이중 부호 '+-' 금지)
  function _fmt(v) { v = v || 0; return (v >= 0 ? '+' : '') + v.toFixed(2) + 'bb'; }
  function _pct(v) { return ((v || 0) * 100).toFixed(0) + '%'; }

  function buildCoaching(state, ev, equity) {
    var pot = state.pot;
    var toCall = Math.max(0, state.currentBet - ((state.playerBets && state.playerBets['Hero']) || 0));
    var potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
    var V = ev.verdict;
    if (V && V.source === 'chart') return '📋 레인지 차트: ' + V.label + ' / ' + V.why;
    if (V && V.source === 'potodds') {
      var need = V.need != null ? V.need : (V.potOdds != null ? V.potOdds : potOdds);
      return '내 승률 ' + _pct(equity) + ' vs 필요 승률 ' + _pct(need) + ' → ' + V.label;
    }
    if (V && V.source === 'guide') return V.label + ': ' + V.why;
    var best = ev.bestAction;
    var callLabel = toCall === 0 ? '체크' : '콜';
    if (best === 'fold') {
      if (toCall === 0) return '공짜로 볼 수 있어요: 체크 또는 벳';
      return '에쿼티 ' + _pct(equity) + ' < 팟 오즈 ' + _pct(potOdds) + ' → 폴드';
    }
    if (best === 'call') {
      if (toCall === 0) return '에쿼티 ' + _pct(equity) + ' → 체크 (공짜로 다음 카드 보기)';
      return '에쿼티 ' + _pct(equity) + ' > 팟 오즈 ' + _pct(potOdds) + ' → 콜 (' + _fmt(ev.call) + ')';
    }
    if (best.indexOf('raise') === 0) return '레이즈 EV ' + _fmt(ev[best]) + ' > ' + callLabel + ' EV ' + _fmt(ev.call) + ' → 레이즈 최선';
    if (best === 'allin') return '올인 EV ' + _fmt(ev.allin) + ' > ' + callLabel + ' EV ' + _fmt(ev.call) + ' → 올인 최선';
    return '';
  }

  function buildGTOCommentary(state, ev, equity) {
    var SUIT_SYM = { s:'♠', h:'♥', d:'♦', c:'♣' };
    var cards = state.heroCards || [];
    var handStr = cards.map(function(c){ return (c.rank==='T'?'10':c.rank) + SUIT_SYM[c.suit]; }).join(' ');
    var heroPos = state.players && state.players['Hero'] ? state.players['Hero'].pos : 'BTN';
    var posLabel = { UTG:'(가장 먼저 행동, 불리)', HJ:'(중간)', CO:'(뒤쪽, 유리)', BTN:'(마지막 행동, 최유리)', SB:'(포지션 불리)', BB:'(포지션 불리)' };
    var streetLabel = { preflop:'프리플랍', flop:'플랍', turn:'턴', river:'리버' };
    var pot = state.pot;
    var heroStack = (state.stacks && state.stacks['Hero']) || 100;
    var toCall = Math.max(0, state.currentBet - ((state.playerBets && state.playerBets['Hero']) || 0));
    var potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
    var spr = pot > 0 ? (heroStack / pot).toFixed(1) : '∞';
    var V = ev.verdict;
    var best = ev.bestAction;
    var bestLabel = { fold:'폴드', call: toCall===0?'체크':'콜', raise_half:'레이즈', raise_pot:'레이즈', allin:'올인' };
    var bestAmt = {
      fold:'', call: toCall>0 ? ' '+toCall.toFixed(1)+'bb' : '',
      raise_half:' '+ev.raiseHalfAmt.toFixed(1)+'bb',
      raise_pot:' '+ev.raisePotAmt.toFixed(1)+'bb',
      allin:' '+ev.allinAmt.toFixed(1)+'bb'
    };
    var bestEV = ev[best] || 0;
    var eqComment = toCall > 0 ? (equity > potOdds ? '✓ 에쿼티 우위' : '✗ 에쿼티 부족') : '체크 옵션';
    var reasons = {
      fold: '에쿼티가 팟 오즈 미달 — 폴드가 장기 기댓값 보호',
      call: toCall===0 ? '체크로 팟 컨트롤 + 다음 스트리트 정보 수집' : '팟 오즈 대비 에쿼티 충분 — 콜로 팟 가담',
      raise_half: '1/2팟 레이즈: 밸류 or 세미블러프, 상대 레인지 압박',
      raise_pot:  '팟 베팅: 강한 핸드 or 드로우, 폴드 에쿼티 + 밸류 극대화',
      allin:      '올인: 에쿼티 우위 확실, 스택 전부로 EV 극대화'
    };
    var SRC_LABEL = { chart:'레인지 차트 추천', potodds:'팟 오즈 판정', guide:'전략 가이드 추천', ev:'추정 EV 추천(근사)' };
    var recLabel = V ? (SRC_LABEL[V.source] || '추천') : '추정 EV 추천(휴리스틱)';
    var actLabel = V && V.label ? V.label : (bestLabel[best] || best);
    var showEV = !V || V.source === 'ev';
    return [
      '🃏 ' + handStr + '&nbsp;&nbsp;|&nbsp;&nbsp;' + heroPos + ' ' + (posLabel[heroPos]||'') + '&nbsp;&nbsp;|&nbsp;&nbsp;' + (streetLabel[state.street]||state.street||''),
      '💰 팟 ' + pot.toFixed(1) + 'bb&nbsp;&nbsp;|&nbsp;&nbsp;콜 ' + (toCall>0?toCall.toFixed(1)+'bb':'없음') + '&nbsp;&nbsp;|&nbsp;&nbsp;스택/팟 ' + spr + '배',
      '📊 에쿼티 <b>' + (equity*100).toFixed(0) + '%</b>&nbsp;&nbsp;|&nbsp;&nbsp;팟 오즈 ' + (potOdds*100).toFixed(0) + '%&nbsp;&nbsp;|&nbsp;&nbsp;' + eqComment,
      '✅ ' + recLabel + ': <b style="color:#d4af37">' + actLabel + (bestAmt[best]||'') + '</b>'
        + (showEV ? '&nbsp;&nbsp;EV <b>' + _fmt(bestEV) + '</b>' : ''),
      '💡 ' + (V && V.why ? V.why : (reasons[best]||''))
    ];
  }

  function buildGTOReason(state, ev, equity) {
    var pot = state.pot;
    var heroStack = (state.stacks && state.stacks['Hero']) || 100;
    var toCall = Math.max(0, state.currentBet - ((state.playerBets && state.playerBets['Hero']) || 0));
    var potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
    var spr = pot > 0 ? (heroStack / pot).toFixed(1) : '∞';
    var best = ev.bestAction;
    var fmt = _fmt;
    var eqPct = (equity * 100).toFixed(0);
    var oddsPct = (potOdds * 100).toFixed(0);

    if (best === 'fold') return [
      'EV: 폴드 0bb &gt; 콜 ' + fmt(ev.call) + ' &gt; 레이즈 ' + fmt(ev.raise_half),
      '에쿼티 ' + eqPct + '% &lt; 팟오즈 ' + oddsPct + '% → 콜 기댓값 음수',
      '어떤 액션도 수익 없음 — 폴드가 손실 최소화'
    ];
    if (best === 'call') return [
      'EV: ' + (toCall===0?'체크':'콜') + ' ' + fmt(ev.call) + ' &gt; 레이즈 ' + fmt(ev.raise_half),
      '에쿼티 ' + eqPct + '% &gt; 팟오즈 ' + oddsPct + '% — 수익 확보됨',
      '스택/팟 ' + spr + '배, 레이즈 EV 차이 미미해 팟 컨트롤 선택'
    ];
    if (best === 'raise_half') return [
      'EV: 1/2팟 레이즈 ' + fmt(ev.raise_half) + ' &gt; 팟 레이즈 ' + fmt(ev.raise_pot),
      '사이즈 비례 폴드에쿼티 + 에쿼티 ' + eqPct + '% 조합이 최적',
      '사이즈 키울수록 FE↑ 하지만 콜하는 레인지가 강해져 EV 감소'
    ];
    if (best === 'raise_pot') return [
      'EV: 팟 레이즈 ' + fmt(ev.raise_pot) + ' &gt; 1/2팟 ' + fmt(ev.raise_half),
      '에쿼티 ' + eqPct + '% 높아 팟 극대화 시 기대치 상승',
      '드로우·세컨페어 레인지 압박에 팟 사이즈 최적'
    ];
    if (best === 'allin') return [
      'EV: 올인 ' + fmt(ev.allin) + ' &gt; 팟 레이즈 ' + fmt(ev.raise_pot),
      '스택/팟 ' + spr + '배로 낮음 — 스택오프 EV가 작은 레이즈보다 높음',
      '에쿼티 ' + eqPct + '%, 남은 스택 전부 투입이 최선'
    ];
    return [];
  }

  // P4-T2: 초보자 눈높이 상황 풀이 — ui/hud.js가 소비하는 계약 함수
  // 줄 접두 이모지 계약(줄당 1개, 변경 금지): 📍 상황, 📊 승률 vs 팟오즈, ✅ 추천, 📐 레인지 안내, 💡 팁
  function buildBeginnerExplain(state, ev, equity) {
    var streetLabel = { preflop:'프리플랍', flop:'플랍', turn:'턴', river:'리버' };
    var pot = state.pot;
    var heroStack = (state.stacks && state.stacks['Hero']) || 100;
    var toCall = Math.max(0, state.currentBet - ((state.playerBets && state.playerBets['Hero']) || 0));
    var potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
    var spr = pot > 0 ? heroStack / pot : Infinity;
    var V = ev.verdict;
    var best = ev.bestAction;
    // buildGTOCommentary의 라벨 매핑과 동일하게 유지
    var bestLabel = { fold:'폴드', call: toCall===0?'체크':'콜', raise_half:'레이즈', raise_pot:'레이즈', allin:'올인' };
    var bestEV = ev[best] || 0;
    var eqPct = (equity * 100).toFixed(0);
    var streetName = streetLabel[state.street] || state.street || '';

    var lines = [];

    // 1. 상황 요약
    if (toCall === 0) {
      lines.push('📍 지금은 ' + streetName + ', 팟은 ' + pot.toFixed(1) + 'bb예요. 콜 없이 공짜로 체크 가능한 상황입니다.');
    } else {
      lines.push('📍 지금은 ' + streetName + ', 팟은 ' + pot.toFixed(1) + 'bb, 콜하려면 ' + toCall.toFixed(1) + 'bb가 필요해요.');
    }

    // 2. 에쿼티 vs 팟 오즈 (프리플랍 차트 판정이면 차트 기준 안내로 대체)
    if (state.street === 'preflop' && V && V.source === 'chart') {
      lines.push('📊 프리플랍은 승률 계산보다 레인지 차트(자리별로 정해 둔 참여 패 목록)가 기준이에요. 참고 승률 약 ' + eqPct + '%');
    } else if (toCall === 0) {
      lines.push('📊 내 승률(에쿼티)은 약 ' + eqPct + '%예요. 돈을 더 넣지 않고 다음 카드를 볼 수 있으니 손해볼 게 없는 상황이에요.');
    } else {
      var oddsPct = (potOdds * 100).toFixed(0);
      var verdictStr = equity > potOdds ? '콜이 이득이에요' : '콜이 손해예요';
      lines.push('📊 내 승률(에쿼티) 약 ' + eqPct + '% / 콜에 필요한 최소 승률(팟 오즈) ' + oddsPct + '% → ' + verdictStr + '.');
    }

    // 3. 추천 액션 + 근거
    var evStr = (bestEV >= 0 ? '+' : '') + bestEV.toFixed(1) + 'bb';
    if (V) {
      lines.push('✅ 추천: <b>' + V.label + '</b> (' + V.why + ')');
    } else if (best === 'fold' && toCall === 0) {
      lines.push('✅ 추천 액션: <b>체크</b>(무료) — 돈을 더 넣지 않고 다음 카드를 볼 수 있어요. 폴드할 이유가 없어요.');
    } else if (best === 'fold') {
      var reason = (equity <= potOdds)
        ? '에쿼티가 팟 오즈보다 낮아 콜하면 손해라서'
        : '내 카드가 약해 이길 확률이 낮아서';
      lines.push('✅ 추천 액션: <b>' + bestLabel[best] + '</b> (EV ' + evStr + ') — ' + reason + ' 폴드가 최선이에요.');
    } else {
      lines.push('✅ 추천 액션: <b>' + (bestLabel[best] || best) + '</b> (EV ' + evStr + ')이 가장 유리해요.');
    }

    // 4-0. 에쿼티 기준 안내 — 상대 레인지를 반영해 계산했을 때만 표시
    if (state.villainRange) {
      lines.push('📐 위 승률은 ' + (state.villainRangeLabel || '상대의 예상 레인지') + '를 기준으로 계산했어요.');
    }

    // 4. 상황 팁 (해당 시에만, 최대 1줄)
    if (spr < 2) {
      lines.push('💡 남은 스택이 팟의 2배도 안 돼요. 한 번 들어가면 올인까지 가는 스팟이에요.');
    } else if (equity >= 0.55) {
      lines.push('💡 승률이 높은 편이라 밸류를 극대화하는 방향(레이즈/콜)이 좋아요.');
    } else if (equity < 0.30 && toCall > 0) {
      lines.push('💡 승률이 낮은데 돈을 더 넣는 건 무리한 콜이 될 수 있어요, 주의하세요.');
    }

    return lines;
  }

  if (typeof module !== 'undefined') module.exports = { calcOptions, buildCoaching, buildGTOCommentary, buildGTOReason, buildBeginnerExplain, _raiseEVFor };
  return { calcOptions, buildCoaching, buildGTOCommentary, buildGTOReason, buildBeginnerExplain, _raiseEVFor };
})();
