// engine/postflop-guide.js, P5: 포스트플랍 전략 가이드 v1 (GTO 근사 휴리스틱)
// 데이터 소스: Villain._handStrength(5단계) + Villain._isBoardWet(텍스처) + state.decisions(이니셔티브 역추적)
// EV.buildGTOCommentary(에쿼티/팟 오즈/SPR 수치)와 역할 분리, 여기는 "왜"(텍스처, 강도, 이니셔티브)만 다룬다.
// 화면 문구(reason, meta)에는 가운뎃점과 긴줄표를 쓰지 않는다(설계서 8.4절 4번, M5-THEATER).
//
// guide(state, opts) → { action: 'bet'|'check'|'call'|'fold'|'raise', label, reason, meta, eqRule?, alt? } | null
//   M7: state.players(자리)와 state.folded가 있으면 말하는 순서와 남은 상대 수를 본다(seatInfo). 없으면 예전 그대로.
//     IP(마지막 순서)에서 상대가 체크로 넘긴 중간 패는 작게 밸류벳(CO-19), 주도권 없이 먼저 말하는 콜러가 강한 패면 체크(alt 벳)(CO-02),
//     상대가 둘 이상이면 약한 패 c벳은 체크(CO-05). alt는 둘 다 정답인 자리의 두 번째 액션.
//   opts.eq(0~1, 내 에쿼티)가 있고 벳 직면이 아니고 휴리스틱 결과가 체크이며 eq ≥ EQ_VALUE(0.65)면 action 'bet', eqRule:true,
//   reason에 승률(계약 F5, 설계서 10절 8번 끝: "에쿼티 73% 투페어 체크가 초록" 결함). opts가 없거나 eq가 0~1 숫자가 아니면
//   결과는 예전과 같다(극장 proThought는 opts 없이 부른다).
var PostflopGuide = (function() {
  var STREET_KOR = { flop: '플랍', turn: '턴', river: '리버' };
  var STRENGTH_KOR = { nut: '아주 강함', strong: '강함', medium: '중간', 'weak-pair': '약한 페어', air: '아무것도 없음' };
  var EQ_VALUE = 0.65;   // 이 에쿼티 이상이면 공짜 스팟에서 체크 대신 밸류벳(계약 F5)

  // 이전 스트리트에서 히어로의 마지막 결정이 공격적(raise/bet/allin)이었는지, 이니셔티브 보유 근사
  // decisions는 히어로 결정만 기록(isFacing3bet과 동일 역추적 기법). 이번 스트리트 결정은 제외.
  function heroIsAggressor(state) {
    var ds = state.decisions || [];
    for (var i = ds.length - 1; i >= 0; i--) {
      if (ds[i].street === state.street) continue;
      return ds[i].action === 'raise' || ds[i].action === 'bet' || ds[i].action === 'allin';
    }
    return false;
  }

  // 드로우 감지 (07-20 6차): 플러시드로우(히어로 카드 포함 동일무늬 4장) 또는 OESD(양차 스트레이트 드로우)
  var RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  function hasDraw(heroCards, board) {
    if (!heroCards || !board || board.length < 3 || board.length >= 5) return false; // 리버엔 드로우 없음
    var all = heroCards.concat(board);
    // 플러시드로우: 무늬 4장, 그중 히어로 카드 1장 이상 포함
    var bySuit = {};
    all.forEach(function(c) { (bySuit[c.suit] = bySuit[c.suit] || []).push(c); });
    for (var s in bySuit) {
      if (bySuit[s].length === 4 && heroCards.some(function(c) { return c.suit === s; })) return true;
    }
    // OESD: 연속 4랭크 존재(히어로 카드 1장 이상 기여), 오픈엔드(양끝이 막히지 않음)
    var idxSet = {};
    all.forEach(function(c) { idxSet[RANKS.indexOf(c.rank)] = true; });
    for (var start = 0; start <= 9; start++) {
      if (idxSet[start] && idxSet[start+1] && idxSet[start+2] && idxSet[start+3]) {
        var run = [start, start+1, start+2, start+3];
        var heroIn = heroCards.some(function(c) { return run.indexOf(RANKS.indexOf(c.rank)) !== -1; });
        var open = start > 0 || start + 4 <= 12; // 최소 한쪽이 열려 있음
        if (heroIn && open) return true;
      }
    }
    return false;
  }

  // 히어로의 가장 최근 이전 스트리트 결정 액션(없으면 null). heroIsAggressor와 같은 역추적.
  function _lastPriorAction(state) {
    var ds = state.decisions || [];
    for (var i = ds.length - 1; i >= 0; i--) {
      if (ds[i].street === state.street) continue;
      return ds[i].action;
    }
    return null;
  }

  // 자리 정보(M7 CO-19, CO-02, CO-05): 폴드 안 한 상대 수와, 히어로가 이번 스트리트에 그들보다 뒤(ip)/앞(oop)에 말하는지.
  //   포스트플랍 말하는 순서 SB, BB, UTG, HJ, CO, BTN(game-state의 큐와 같음). state.players가 없거나 자리를 모르는 상대가 있으면 null
  //   (예전 동작 그대로: 자리 정보 없이 판단). ip = 살아 있는 상대 전원이 히어로보다 앞, oop = 전원이 히어로보다 뒤.
  var POST_ORDER = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];
  function seatInfo(state) {
    var ps = state && state.players, hero = ps && ps.Hero;
    if (!hero || !hero.pos) return null;
    var hi = POST_ORDER.indexOf(hero.pos);
    if (hi < 0) return null;
    var opp = 0, before = 0, after = 0;
    var names = Object.keys(ps);
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (n === 'Hero' || (state.folded && state.folded[n])) continue;
      var oi = POST_ORDER.indexOf(ps[n] && ps[n].pos);
      if (oi < 0) return null;
      opp++;
      if (oi < hi) before++; else if (oi > hi) after++;
    }
    if (!opp) return null;
    return { opp: opp, ip: after === 0, oop: before === 0 };
  }

  // opts.eq가 0~1 사이 숫자면 그 값, 아니면 null
  function _eqOf(opts) {
    if (!opts || typeof opts.eq !== 'number' || !isFinite(opts.eq)) return null;
    return (opts.eq >= 0 && opts.eq <= 1) ? opts.eq : null;
  }

  // guide(state, opts) → { action: 'bet'|'check'|'call'|'fold'|'raise', label, reason, meta, eqRule? } | null
  function guide(state, opts) {
    if (!state || state.street === 'preflop' || state.street === 'showdown') return null;
    if (!state.heroCards || !state.board || state.board.length < 3) return null;

    var strength = Villain._handStrength(state.heroCards, state.board);
    var wet = Villain._isBoardWet(state.board);
    var aggressor = heroIsAggressor(state);
    var draw = hasDraw(state.heroCards, state.board);
    var facing = state.currentBet > (state.playerBets && state.playerBets.Hero || 0);
    var texture = wet ? '웨트 보드(드로우 많음)' : '드라이 보드(드로우 적음)';
    var streetKor = STREET_KOR[state.street] || state.street;
    var sizeHint = wet ? ' (크기: 팟의 66% 이상)' : ' (크기: 팟의 33% 정도)';
    var smallHint = ' (크기: 팟의 33% 정도)';
    var seat = seatInfo(state);                       // null이면 자리 정보 없음(예전 동작)
    var multi = !!(seat && seat.opp >= 2);            // 상대가 둘 이상 남은 멀티웨이
    var river = state.board.length >= 5;
    // 주도권 없는 콜러가 먼저 말하는 자리(프리플랍 콜 또는 이전 스트리트에서 벳을 콜): 체크가 기본, 벳은 드물게(동크)
    var oopCaller = !!(seat && seat.oop && !aggressor && !river && _lastPriorAction(state) === 'call');

    var action, reason, alt = null, eqRule = false;
    if (!facing) {
      // 내 차례에 벳 없음: 벳/체크 결정
      if (aggressor) {
        // c-bet 상황
        if (strength === 'nut' || strength === 'strong') {
          action = 'bet'; reason = '주도권+강한 패, 밸류벳(약한 패의 콜을 받아내요)' + sizeHint;
        } else if (multi && (strength === 'air' || strength === 'weak-pair')) {
          // 멀티웨이(M7 CO-05): 약한 패 c벳은 아낀다. 드로우는 세미블러프 벳도 가능
          action = 'check';
          if (draw) { alt = 'bet'; reason = '상대가 여럿이라 c벳은 아껴요, 드로우는 세미블러프 벳도 가능'; }
          else reason = '상대가 여럿(' + seat.opp + '명)이라 약한 패 c벳은 체크, 강한 패만 벳';
        } else if (draw && (strength === 'air' || strength === 'weak-pair')) {
          action = 'bet'; reason = '드로우 보유, 세미블러프 벳(접게 하거나 완성해서 이겨요)' + sizeHint;
        } else if (multi && strength === 'medium') {
          action = 'bet'; reason = '상대가 여럿(' + seat.opp + '명), 중간 패는 작게만 벳' + smallHint;
        } else if (!wet && (strength === 'medium' || strength === 'weak-pair' || strength === 'air')) {
          action = 'bet'; reason = '드라이 보드 c벳: 내 쪽이 강한 패가 더 많아 넓게 작게 벳' + sizeHint;
        } else if (wet && strength === 'medium') {
          action = 'bet'; reason = '웨트 보드 중간 패: 드로우가 따라오기 비싸게 벳' + sizeHint;
        } else {
          action = 'check'; reason = '웨트 보드에서 약한 패 c벳은 체크레이즈를 맞기 쉬워 체크';
        }
      } else {
        if ((strength === 'nut' || strength === 'strong') && oopCaller) {
          // M7 CO-02: 레이저가 뒤에 있는 자리에서 먼저 치는 동크는 드물다. 체크해서 상대 벳을 받아 체크레이즈나 콜(벳도 가능)
          action = 'check'; alt = 'bet';
          reason = '주도권 없이 먼저 말하는 자리, 체크하고 상대 벳에 체크레이즈나 콜(벳도 가능)';
        } else if (strength === 'nut' || strength === 'strong') {
          // M7 감사: 마지막 순서(상대가 체크로 넘김)에서 치는 벳은 동크가 아니다(용어 사전 '동크' = 앞 라운드 레이저보다 먼저 말하는 자리의 선제 벳)
          action = 'bet';
          reason = (seat && seat.ip ? '상대가 체크로 넘겼어요, 주도권 없어도 강한 패는 밸류벳' : '주도권 없어도 강한 패는 밸류벳(먼저 치는 동크도 가능)') + sizeHint;
        } else if (draw) {
          if (multi) { action = 'check'; alt = 'bet'; reason = '상대가 여럿이라 체크로 공짜 카드, 세미블러프 벳도 가능'; }
          else { action = 'bet'; reason = '드로우 보유, 세미블러프 벳으로 주도권을 가져올 수 있어요(체크도 괜찮아요)' + sizeHint; }
        } else if (strength === 'medium' && seat && seat.ip && !multi) {
          // M7 CO-19: 내가 마지막 순서이고 상대가 체크로 넘겼다. 중간 패는 작게 밸류벳이 표준
          action = 'bet'; reason = '상대가 체크로 넘겼어요, 중간 패는 작게 밸류벳' + smallHint;
        } else {
          action = 'check';
          reason = (seat && seat.ip) ? '주도권 없음, 마지막 순서라 체크로 다음 카드 보기' : '주도권 없음: 체크하고 상대 액션을 봐요';
        }
      }
      // 에쿼티 임계(계약 F5): 휴리스틱이 체크여도 내 에쿼티가 높으면 밸류벳.
      //   단 레이저가 뒤에 있는 콜러의 첫 말하기(oopCaller)는 체크가 표준이라 이 규칙을 쓰지 않는다(M7 CO-02, 'GTO 승률 규칙'이 동크를 권하던 것)
      var eq = _eqOf(opts);
      if (action === 'check' && !oopCaller && eq !== null && eq >= EQ_VALUE) {
        action = 'bet'; eqRule = true; alt = null;
        reason = '내 승률 ' + Math.round(eq * 100) + '%(' + Math.round(EQ_VALUE * 100) + '% 이상)라 체크보다 밸류벳' + sizeHint;
      }
    } else {
      // 벳을 마주함
      if (strength === 'nut') {
        action = 'raise'; reason = '아주 강한 패, 레이즈로 팟을 키워요';
      } else if (strength === 'strong') {
        action = 'call'; reason = '강한 패, 콜로 상대가 약한 패로 계속 치게 해요(레이즈도 좋아요)';
      } else if (strength === 'medium') {
        action = 'call'; reason = wet ? '웨트 보드 중간 패, 팟 오즈가 맞으면 한 번 콜하고 더 세게 나오면 다시 생각해요' : '드라이 보드 중간 패, 상대 블러프를 잡는 콜도 가능해요';
      } else if (draw) {
        action = 'call'; reason = '드로우, 팟 오즈가 맞거나 맞았을 때 크게 받을 수 있으면 콜';
      } else if (strength === 'weak-pair') {
        action = wet ? 'fold' : 'call'; reason = wet ? '웨트 보드 약한 페어, 지고도 더 잃기 쉬워 폴드가 우선' : '드라이 보드 약한 페어, 싸면 한 번 콜';
      } else {
        action = 'fold'; reason = '아무것도 없는 손, 팟 오즈와 상관없이 폴드(블러프 레이즈는 리버에서 이야기가 될 때만)';
      }
    }

    var ACTION_KOR = { bet: '벳', check: '체크', call: '콜', fold: '폴드', raise: '레이즈' };
    var out = {
      action: action,
      label: ACTION_KOR[action] || action,
      reason: reason,
      meta: streetKor + ', ' + texture + ', ' + (aggressor ? '주도권 있음' : '주도권 없음')
        + ', 내 패 ' + (STRENGTH_KOR[strength] || strength) + (draw ? ', 드로우 있음' : '')
    };
    if (eqRule) out.eqRule = true;
    if (alt) out.alt = alt;   // 둘 다 정답인 자리(M7 CO-02, CO-05): action이 기본, alt도 좋다
    return out;
  }

  var api = { guide: guide, heroIsAggressor: heroIsAggressor, hasDraw: hasDraw, seatInfo: seatInfo, EQ_VALUE: EQ_VALUE };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
