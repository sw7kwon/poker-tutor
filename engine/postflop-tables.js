// engine/postflop-tables.js — 포스트플랍 정량 전략 테이블 (07-20 7차-3)
// ⚠ 실제 솔버 출력이 아니라, 공개 솔버 aggregate 리포트의 통념 수치를 근사한 참고 테이블.
// PostflopGuide(정성: 왜)와 역할 분리 — 여기는 "얼마나 자주, 얼마 크기로"(빈도·사이즈·MDF)만 다룬다.
var PostflopTables = (function() {

  var RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];

  // 플랍 텍스처 분류 — 6클래스
  function classifyFlop(board) {
    if (!board || board.length < 3) return null;
    var f = board.slice(0, 3);
    var suits = {};
    f.forEach(function(c) { suits[c.suit] = (suits[c.suit] || 0) + 1; });
    if (Object.keys(suits).length === 1) return 'monotone';
    var idx = f.map(function(c) { return RANKS.indexOf(c.rank); }).sort(function(a, b) { return b - a; });
    if (idx[0] === idx[1] || idx[1] === idx[2]) return 'paired';
    var connected = (idx[0] - idx[2]) <= 4;             // 상~하 스팬 4 이내 = 스트레이트 위협
    var twoTone = Object.keys(suits).length === 2;      // 플러시 드로우 존재
    var wet = connected || twoTone;
    var top = idx[0];
    if (!wet && top === 12) return 'a-high-dry';
    if (!wet && top >= 10) return 'broadway-dry';       // K/Q 하이 드라이
    if (wet && top >= 8) return 'mid-wet';              // T~A 포함 커넥티드/투톤
    if (wet) return 'low-wet';
    return 'low-dry';
  }

  // 플랍 c-bet 통념치 (인포지션 오픈레이저 기준): 빈도%·사이즈(팟 대비 %)
  var CBET = {
    'a-high-dry':   { freq: 75, size: 33, note: 'A하이 드라이, 레인지 우위 최대, 소액으로 자주' },
    'broadway-dry': { freq: 65, size: 33, note: 'K/Q하이 드라이, 소액으로 자주' },
    'paired':       { freq: 60, size: 33, note: '페어보드, 소액으로 자주 (양쪽 다 빗나감)' },
    'mid-wet':      { freq: 45, size: 66, note: '미들 웻, 빈도 낮추고 사이즈 키우기(드로우에 비싼 값 물리기)' },
    'low-wet':      { freq: 40, size: 66, note: '로우 웻, 콜러 레인지가 잘 맞는 보드라 골라서 벳' },
    'low-dry':      { freq: 55, size: 33, note: '로우 드라이, 중간 빈도로 소액' },
    'monotone':     { freq: 35, size: 33, note: '모노톤, 가끔만 소액 또는 체크' }
  };

  // MDF(최소 방어 빈도) = pot / (pot + bet) — 상대 벳 사이즈 대비 접으면 안 되는 비율
  function mdf(betPctOfPot) {
    if (!betPctOfPot || betPctOfPot <= 0) return 100;
    return Math.round(100 / (1 + betPctOfPot / 100));
  }

  // hint(state) → 라운드2 힌트에 덧붙일 정량 1줄 (해당 없으면 null)
  function hint(state) {
    if (!state || !state.board || state.board.length < 3 || state.street === 'showdown') return null;
    var cls = classifyFlop(state.board);
    if (!cls) return null;
    var toCall = Math.max(0, state.currentBet - ((state.playerBets && state.playerBets.Hero) || 0));
    if (toCall > 0) {
      // 벳을 마주함 — MDF 안내 (상대 벳 = toCall, 벳 이전 팟 = pot - toCall)
      var potBefore = Math.max(0.1, state.pot - toCall);
      var pct = Math.round(toCall / potBefore * 100);
      return '📐 통념: ' + pct + '%팟 벳에는 레인지의 약 ' + mdf(pct) + '%를 방어(MDF, 블러프를 섞는 균형 잡힌 상대 가정). 블러프를 거의 안 하는 상대에게는 그대로 따르지 않아요';
    }
    if (state.street === 'flop') {
      var t = CBET[cls];
      var aggr = (typeof PostflopGuide !== 'undefined') ? PostflopGuide.heroIsAggressor(state) : false;
      if (!aggr) return null;
      return '📐 통념(솔버 근사, IP 싱글 레이즈 팟 기준): ' + t.note + ', c-bet 약 ' + t.freq + '%, 크기 팟의 ' + t.size + '%';
    }
    // 턴/리버 일반 통념 (이니셔티브 보유 시). 리버 중간 패는 작게 치거나 체크(M7 감사: 레슨 s4-07 '씬 밸류는 작게'와 맞춤)
    if (typeof PostflopGuide !== 'undefined' && PostflopGuide.heroIsAggressor(state)) {
      return state.street === 'turn'
        ? '📐 통념: 턴 배럴은 약 50%, 내 레인지에 유리해진 카드(오버카드, 드로우 완성)에서 이어 가요'
        : '📐 통념: 리버는 양극화, 강한 밸류와 블러프는 크게, 중간 패는 작게(씬 밸류) 치거나 체크로 쇼다운';
    }
    return null;
  }

  if (typeof module !== 'undefined') module.exports = { classifyFlop, CBET, mdf, hint };
  return { classifyFlop: classifyFlop, CBET: CBET, mdf: mdf, hint: hint };
})();
