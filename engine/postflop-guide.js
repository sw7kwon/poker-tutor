// engine/postflop-guide.js — P5: 포스트플랍 전략 가이드 v1 (GTO 근사 휴리스틱)
// 데이터 소스: Villain._handStrength(5단계) + Villain._isBoardWet(텍스처) + state.decisions(이니셔티브 역추적)
// EV.buildGTOCommentary(에쿼티/팟오즈/SPR 수치)와 역할 분리 — 여기는 "왜"(텍스처·강도·이니셔티브)만 다룬다.
var PostflopGuide = (function() {
  var STREET_KOR = { flop: '플랍', turn: '턴', river: '리버' };

  // 이전 스트리트에서 히어로의 마지막 결정이 공격적(raise/bet/allin)이었는지 — 이니셔티브 보유 근사
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
    // 플러시드로우 — 무늬 4장, 그중 히어로 카드 1장 이상 포함
    var bySuit = {};
    all.forEach(function(c) { (bySuit[c.suit] = bySuit[c.suit] || []).push(c); });
    for (var s in bySuit) {
      if (bySuit[s].length === 4 && heroCards.some(function(c) { return c.suit === s; })) return true;
    }
    // OESD — 연속 4랭크 존재(히어로 카드 1장 이상 기여), 오픈엔드(양끝이 막히지 않음)
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

  // guide(state) → { action: 'bet'|'check'|'call'|'fold'|'raise', label, reason } | null
  function guide(state) {
    if (!state || state.street === 'preflop' || state.street === 'showdown') return null;
    if (!state.heroCards || !state.board || state.board.length < 3) return null;

    var strength = Villain._handStrength(state.heroCards, state.board);
    var wet = Villain._isBoardWet(state.board);
    var aggressor = heroIsAggressor(state);
    var draw = hasDraw(state.heroCards, state.board);
    var facing = state.currentBet > (state.playerBets && state.playerBets.Hero || 0);
    var texture = wet ? '웻보드(드로우 많음)' : '드라이보드(드로우 적음)';
    var streetKor = STREET_KOR[state.street] || state.street;
    var sizeHint = wet ? ' (사이징: 팟 66%+ 중대형)' : ' (사이징: 팟 33% 소액)';

    var action, reason;
    if (!facing) {
      // 내 차례에 벳 없음 — 벳/체크 결정
      if (aggressor) {
        // c-bet 상황
        if (strength === 'nut' || strength === 'strong') {
          action = 'bet'; reason = '이니셔티브+강한 핸드 — 밸류벳' + sizeHint;
        } else if (draw && (strength === 'air' || strength === 'weak-pair')) {
          action = 'bet'; reason = '드로우 보유 — 세미블러프 벳(폴드에쿼티+개선 아웃츠)' + sizeHint;
        } else if (!wet && (strength === 'medium' || strength === 'weak-pair' || strength === 'air')) {
          action = 'bet'; reason = '드라이보드 c-bet — 레인지 우위로 넓게 소액 벳' + sizeHint;
        } else if (wet && strength === 'medium') {
          action = 'bet'; reason = '웻보드 — 미디엄은 보호벳(에쿼티 거부)' + sizeHint;
        } else {
          action = 'check'; reason = '웻보드에서 약한 핸드 c-bet은 체크레이즈에 취약 — 체크';
        }
      } else {
        if (strength === 'nut' || strength === 'strong') {
          action = 'bet'; reason = '이니셔티브 없어도 강한 핸드는 밸류벳/도네벳 가능' + sizeHint;
        } else if (draw) {
          action = 'bet'; reason = '드로우 보유 — 세미블러프로 주도권 탈환 시도 가능(체크도 무방)' + sizeHint;
        } else {
          action = 'check'; reason = '이니셔티브 없음 — 체크 후 상대 액션 관찰';
        }
      }
    } else {
      // 벳을 마주함
      if (strength === 'nut') {
        action = 'raise'; reason = '넛급 — 레이즈로 팟 키우기';
      } else if (strength === 'strong') {
        action = 'call'; reason = '강한 핸드 — 콜로 약한 레인지 유지시키기';
      } else if (strength === 'medium') {
        action = 'call'; reason = wet ? '웻보드 미디엄 — 팟오즈 맞으면 1회 콜, 추가 압박 시 재평가' : '드라이보드 미디엄 — 블러프캐처로 콜 가능';
      } else if (draw) {
        action = 'call'; reason = '드로우 — 팟오즈/임플라이드 맞으면 콜(에쿼티 리포트 참조)';
      } else if (strength === 'weak-pair') {
        action = wet ? 'fold' : 'call'; reason = wet ? '웻보드 약페어 — 역임플라이드 위험, 폴드 우선' : '드라이보드 약페어 — 저렴하면 1회 콜';
      } else {
        action = 'fold'; reason = '에어 — 팟오즈 무관 폴드 (블러프레이즈는 리버 스토리 있을 때만)';
      }
    }

    var ACTION_KOR = { bet: '벳', check: '체크', call: '콜', fold: '폴드', raise: '레이즈' };
    return {
      action: action,
      label: ACTION_KOR[action] || action,
      reason: reason,
      meta: streetKor + ' · ' + texture + ' · ' + (aggressor ? '이니셔티브 보유' : '이니셔티브 없음')
        + ' · 강도 ' + strength + (draw ? '+드로우' : '')
    };
  }

  if (typeof module !== 'undefined') module.exports = { guide: guide, heroIsAggressor: heroIsAggressor, hasDraw: hasDraw };
  return { guide: guide, heroIsAggressor: heroIsAggressor, hasDraw: hasDraw };
})();
