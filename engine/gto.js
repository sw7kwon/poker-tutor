// engine/gto.js — v1(skills/포커/browser/js/gto.js) 이식: 프리플랍 GTO 룩업 + 편차 리포트
// v2 Range 유틸 사용. 포지션 표기: v1 'MP' → v2 'HJ'.
var Gto = (function() {
  var GTO_RANGES = {
    rfi: {
      UTG: ['66+','ATs+','KTs+','QTs+','JTs','AJo+','KQo'],
      HJ:  ['55+','A9s+','KTs+','QTs+','JTs','T9s','ATo+','KJo+'],
      CO:  ['22+','A2s+','K9s+','Q9s+','J9s+','T8s+','97s+','87s','76s','ATo+','KTo+','QTo+','JTo'],
      BTN: ['22+','A2s+','K2s+','Q5s+','J7s+','T7s+','96s+','86s+','75s+','64s+','54s','A2o+','K9o+','Q9o+','J9o+','T8o+','98o'],
      SB:  ['22+','A2s+','K5s+','Q8s+','J8s+','T7s+','97s+','86s+','76s','65s','A7o+','K9o+','Q9o+','J9o+','T9o']
    },
    vsRfi: {
      UTG: { threebet: ['QQ+','AKs','AKo'], call: ['77-JJ','AQs','AJs','ATs','KQs','QJs','JTs','T9s','AQo'] },
      HJ:  { threebet: ['JJ+','AQs+','AKo'], call: ['66-TT','AJs-A9s','KQs','KJs','QJs','JTs','T9s','98s','AQo'] },
      CO:  { threebet: ['TT+','AQs+','A5s','AKo','AQo'], call: ['22-99','AJs-A9s','KQs','KJs','KTs','QJs','QTs','JTs','T9s','98s','87s','KQo'] },
      // BTN call: 이전엔 빈 배열 — BTN이 3벳/폴드밖에 못 하는 오류(실측 07-19). 포지션상 콜 레인지가 가장 넓은 자리라 채움.
      BTN: { threebet: ['88+','ATs+','A5s-A4s','KQs','KJs','AJo+','KQo'],
             call: ['22-88','A2s-ATs','K5s-KJs','Q8s-QJs','J8s-JTs','T8s-T9s','98s','87s','76s','65s','A9o+','KTo+','QTo+','JTo'] },
      BB:  { threebet: ['TT+','AQs+','A5s-A4s','AKo'], call: ['22-99','A2s+','K9s+','Q9s+','J9s+','T8s+','97s+','87s','76s','65s','ATo+','KJo+'] },
      // SB vs 오픈: OOP에서 콜하면 BB까지 뒤에 남아 불리 → 3벳 아니면 폴드(콜 표 비움). 8차 WP1.
      SB:  { threebet: ['TT+','AJs+','KQs','A5s-A4s','AQo+'], call: [] }
    },
    // BB vs 뒤쪽 자리(CO/BTN/SB) 오픈: 오프너 레인지가 넓고 BB는 1bb를 이미 냈으므로 훨씬 넓게 방어(약 49%). 8차 WP1.
    // 페어 대시는 반드시 오름차순('22-99') 표기 — range.js가 내림차순을 파싱하지 못함.
    vsRfiBB_LP: {
      threebet: ['TT+','A9s+','A5s-A3s','KTs+','QJs','AJo+','KQo','76s','65s'],
      call: ['22-99','A2s','A6s-A8s','K2s-K9s','Q4s-QTs','J6s-JTs','T6s-T9s','96s+','85s+','74s','75s','63s','64s','53s+','43s',
             'A2o-ATo','K7o-KJo','Q8o-QJo','J8o-JTo','T8o+','98o','87o']
    },
    // 콜드 3벳 직면: 내가 아직 아무 액션도 안 했는데 앞에서 오픈+3벳이 나온 상황 — 매우 좁게 참여. 8차 WP1.
    vsCold3bet: { fourbet: ['QQ+','AKs','AKo'], call: ['JJ','TT','AQs'] },
    // vs3bet: 오픈레이저 입장에서 3벳을 맞았을 때 반응(4벳/콜/폴드). 07-19 2차 패스 신규 추가.
    // 상대 3벳 포지션까지 세분화하지 않고 오프너 포지션 기준 단일 레인지로 근사(기존 rfi/vsRfi와 동일한 단순화 수준).
    vs3bet: {
      UTG: { fourbet: ['QQ+','AKs','AKo'], call: ['JJ','TT','AQs','AJs','KQs'] },
      HJ:  { fourbet: ['JJ+','AKs','AKo'], call: ['TT','99','AQs','AJs','KQs','KJs'] },
      CO:  { fourbet: ['TT+','AQs+','AKo'], call: ['99','88','AJs','ATs','KQs','KJs','QJs'] },
      BTN: { fourbet: ['99+','ATs+','A5s-A4s','KQs','AKo'], call: ['88','77','AJs','ATo+','KJs','KTs','QJs','JTs'] },
      // BTN 콜의 'ATo+'(ATo, AJo, AQo, AKo는 4벳이 먼저): 예전 'ATo'만 있어 AJo, AQo가 폴드인데 ATo는 콜인 역전이었다(M5 통합 검증)
      SB:  { fourbet: ['TT+','AQs+','AKo'], call: ['99','88','AJs','KQs','KJs'] },
      // BB는 오픈이 없어 림퍼 상대 아이솔 레이즈 뒤 재레이즈를 맞을 때만 이 표를 쓴다(M3-P4b).
      // 표가 없으면 AA도 폴드로 판정되던 빈칸이라, 같은 OOP 자리인 SB 표와 같은 값으로 근사한다.
      BB:  { fourbet: ['TT+','AQs+','AKo'], call: ['99','88','AJs','KQs','KJs'] }
    },
    // vs4bet: 3벳터가 4벳을 맞았을 때 반응(5벳 올인/콜/폴드). 07-20 6차 패스.
    // 동일한 근사 수준 — 표준 캐시 100bb 기준(KK+ 올인, QQ/AK 콜다운 위주, 후위 포지션은 소폭 확장).
    vs4bet: {
      UTG: { fivebet: ['KK+'], call: ['QQ','AKs','AKo'] },
      HJ:  { fivebet: ['KK+'], call: ['QQ','AKs','AKo'] },
      CO:  { fivebet: ['KK+','AKs'], call: ['QQ','JJ','AKo'] },
      BTN: { fivebet: ['QQ+','AKs'], call: ['JJ','TT','AKo','AQs'] },
      SB:  { fivebet: ['KK+','AKs'], call: ['QQ','AKo'] },
      BB:  { fivebet: ['KK+','AKs'], call: ['QQ','AKo'] }
    },
    // vsLimpBB: 림퍼만 있는 팟의 BB(M3-P4b). 체크가 공짜이고 플랍 뒤 내내 먼저 행동하므로
    // 체크하면 밸류를 놓치는 아주 강한 패만 '레이즈가 정답'. 66, JTs, KQo처럼 멀티웨이에서 체크도 표준인 손은
    // CO 오픈 표와 함께 '체크 또는 레이즈'(둘 다 정답)로 둔다(gtoActionVsLimp, vsLimpAlt).
    vsLimpBB: ['TT+','AQs+','AQo+']
  };

  function _in(holeCards, rangeArr) {
    if (!rangeArr || !rangeArr.length) return false;
    return Range.inRange(holeCards[0], holeCards[1], rangeArr.join(','));
  }

  // ── 레인지vs레인지 에쿼티용 (07-20 7차-3) ──
  // 압축 표기 레인지('66+','K5s-KJs'…) → 169 핸드클래스 라벨 Set ('AKs','77','QJo'…)
  // equity.js의 state.villainRange(rejection sampling)가 이 Set을 소비
  var _RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  function rangeClassSet(rangeArr) {
    var set = new Set();
    if (!rangeArr || !rangeArr.length) return set;
    var str = rangeArr.join(',');
    for (var i = 12; i >= 0; i--) {
      for (var j = i; j >= 0; j--) {
        var hi = _RANKS[i], lo = _RANKS[j];
        if (i === j) {
          if (Range.inRange({ rank: hi, suit: 's' }, { rank: lo, suit: 'h' }, str)) set.add(hi + lo);
        } else {
          if (Range.inRange({ rank: hi, suit: 's' }, { rank: lo, suit: 's' }, str)) set.add(hi + lo + 's');
          if (Range.inRange({ rank: hi, suit: 's' }, { rank: lo, suit: 'h' }, str)) set.add(hi + lo + 'o');
        }
      }
    }
    return set;
  }

  // 프리플랍 어그레서(빌런)의 추정 레인지 — 오픈/3벳/4벳 단계별 GTO_RANGES 근사.
  // 프리플랍에 1회 설정하면 상태에 남아 포스트플랍 MC에도 같은 진입 레인지가 유지된다.
  function villainRangeFor(state) {
    if (!state || state.street !== 'preflop') return null;
    var raiser = state.lastRaiser;
    if (!raiser || raiser === 'Hero') return null;
    var vpos = state.players && state.players[raiser] ? state.players[raiser].pos : null;
    if (!vpos) return null;
    var count = state.streetBetCount || 0;
    var arr;
    if (count >= 3) arr = (GTO_RANGES.vs3bet[vpos] || GTO_RANGES.vs3bet.CO).fourbet;      // 4벳터 근사
    else if (count === 2) arr = (GTO_RANGES.vsRfi[vpos] || GTO_RANGES.vsRfi.BB).threebet; // 3벳터 근사
    else arr = GTO_RANGES.rfi[vpos] || GTO_RANGES.rfi.BTN;                                // 오픈 레인지
    var set = rangeClassSet(arr);
    return set.size ? set : null;
  }

  // 콜러(패시브) 레인지 추정 v2 (07-20 7차-4): 히어로가 프리플랍 어그레서였고 빌런이 콜만 한 스팟 —
  // 포스트플랍 첫 계산 시점에 빌런의 "오픈 콜" 레인지(vsRfi[pos].call)를 반환. 멀티웨이는 첫 생존 빌런 기준 근사.
  function callerRangeFor(state) {
    if (!state || state.street === 'preflop' || state.street === 'showdown') return null;
    var ds = (state.decisions || []).filter(function(d) { return d.street === 'preflop'; });
    var heroRaised = ds.some(function(d) { return d.action === 'raise' || d.action === 'allin'; });
    if (!heroRaised) return null;
    var names = Object.keys(state.players || {});
    var live = names.filter(function(n) {
      return n !== 'Hero' && !(state.folded && state.folded[n]);
    });
    if (!live.length) return null;
    var vpos = state.players[live[0]].pos;
    var v = GTO_RANGES.vsRfi[vpos] || GTO_RANGES.vsRfi.BB;
    // SB는 콜 표가 비어 있음(3벳 or 폴드) — 그래도 실제로 콜했다면 BB 콜 표로 근사(기존 동작 보존)
    var callArr = (v.call && v.call.length) ? v.call : GTO_RANGES.vsRfi.BB.call;
    var set = rangeClassSet(callArr);
    return set.size ? set : null;
  }

  // 오픈 상황(앞에 레이즈 없음)의 GTO 액션
  function gtoAction(position, holeCards) {
    var rfi = GTO_RANGES.rfi[position];
    if (!rfi) return position === 'BB' ? 'check' : 'fold';
    return _in(holeCards, rfi) ? 'raise' : 'fold';
  }

  // 앞에 오픈 레이즈가 있는 상황의 GTO 액션
  // openerPos(선택): BB가 CO/BTN/SB 오픈을 맞으면 넓은 방어표(vsRfiBB_LP). 2인자 호출은 기존과 동일.
  function gtoActionVsRfi(position, holeCards, openerPos) {
    var v = (position === 'BB' && _isLateOpener(openerPos)) ? GTO_RANGES.vsRfiBB_LP : GTO_RANGES.vsRfi[position];
    if (!v) return 'fold';
    if (_in(holeCards, v.threebet)) return 'raise';
    if (_in(holeCards, v.call)) return 'call';
    return 'fold';
  }

  // 3벳을 맞은 오픈레이저의 GTO 액션 (07-19 2차 패스 신규)
  function gtoActionVs3bet(position, holeCards) {
    var v = GTO_RANGES.vs3bet[position];
    if (!v) return 'fold';
    if (_in(holeCards, v.fourbet)) return 'raise';
    if (_in(holeCards, v.call)) return 'call';
    return 'fold';
  }

  // 4벳을 맞은 3벳터의 GTO 액션 (07-20 6차 패스)
  function gtoActionVs4bet(position, holeCards) {
    var v = GTO_RANGES.vs4bet[position];
    if (!v) return 'fold';
    if (_in(holeCards, v.fivebet)) return 'raise';
    if (_in(holeCards, v.call)) return 'call';
    return 'fold';
  }

  // "히어로가 오픈했는데 빌런이 3벳으로 응수한 상황"인가 (07-20 3차 패스)
  // lastRaiser는 마지막 1명만 보관해 히어로 오픈 기록이 소실되므로 decisions에서 역추적.
  // streetBetCount: 블라인드 미포함 성립 레이즈 수 — 오픈=1, 3벳=2, 4벳=3.
  function isFacing3bet(state) {
    if (state.street !== 'preflop') return false;
    var heroOpened = (state.decisions || []).some(function(d) {
      return d.street === 'preflop' && d.action === 'raise';
    });
    return heroOpened
      && !!state.lastRaiser && state.lastRaiser !== 'Hero'
      && (state.streetBetCount || 0) >= 2;
  }

  // "히어로가 3벳했는데 빌런이 4벳으로 응수한 상황"인가 (07-20 6차 패스)
  // 히어로의 '마지막' 프리플랍 액션이 raise(=3벳)여야 함 — 콜로 물러선 경우 제외.
  function isFacing4bet(state) {
    if (state.street !== 'preflop') return false;
    var lastHero = null;
    var ds = state.decisions || [];
    for (var i = ds.length - 1; i >= 0; i--) {
      if (ds[i].street === 'preflop') { lastHero = ds[i]; break; }
    }
    return !!lastHero && lastHero.action === 'raise'
      && !!state.lastRaiser && state.lastRaiser !== 'Hero'
      && (state.streetBetCount || 0) >= 3;
  }

  function _isLateOpener(pos) { return pos === 'CO' || pos === 'BTN' || pos === 'SB'; }

  // 오픈(첫 레이즈)한 빌런의 포지션 — 프리플랍, 레이즈 1회(streetBetCount===1)일 때만. 그 외 null. (8차 WP1)
  function openerPos(state) {
    if (!state || state.street !== 'preflop' || !state.players) return null;
    var r = state.lastRaiser;
    if (!r || r === 'Hero' || (state.streetBetCount || 0) !== 1) return null;
    return (state.players[r] && state.players[r].pos) || null;
  }

  // "콜드 3벳 직면": 내가 프리플랍에 아직 아무 액션도 안 했는데 앞에서 오픈+3벳이 나온 상황 (8차 WP1)
  function isFacingCold3bet(state) {
    if (!state || state.street !== 'preflop') return false;
    var heroActed = (state.decisions || []).some(function(d) { return d.street === 'preflop'; });
    return !heroActed && (state.streetBetCount || 0) >= 2
      && !!state.lastRaiser && state.lastRaiser !== 'Hero';
  }

  // 콜드 3벳 직면 시 GTO 액션 (포지션 무관 단일 표)
  function gtoActionVsCold3bet(holeCards) {
    var v = GTO_RANGES.vsCold3bet;
    if (_in(holeCards, v.fourbet)) return 'raise';
    if (_in(holeCards, v.call)) return 'call';
    return 'fold';
  }

  // ── 림퍼 상대(vs-limp, M3-P4b) ──
  // 림퍼 수: 레이즈가 없고(lastRaiser 없음, 현재 벳 = 1bb) 팟이 블라인드 1.5bb보다 크면 그 차이를 1bb씩 센다.
  // engine/ev.js:28-32의 표준 사이즈 계산과 같은 셈이라 SB가 0.5bb를 채워 들어온 것도 림퍼 1명이다.
  function limperCount(state) {
    if (!state || state.street !== 'preflop' || state.lastRaiser) return 0;
    var bb = state.bigBlind || 1;
    if ((state.currentBet || 0) > bb + 1e-9 || (state.streetBetCount || 0) > 0) return 0;
    var pot = state.pot || 0;
    if (!(pot > 1.5 * bb + 1e-9)) return 0;
    return Math.max(0, Math.round((pot - 1.5 * bb) / bb));
  }

  // 아이솔 사이즈(raise-to, bb 단위 x bb): 그 자리 오픈 사이즈(SB 3bb, 나머지 2.5bb) + 림퍼당 1bb. ev.js:28-32 표와 같다.
  function isoSize(position, limpers, bb) {
    return ((position === 'SB' ? 3 : 2.5) + Math.max(0, limpers || 0)) * (bb || 1);
  }

  // 아이솔 기준 표의 자리(M4-P9, 로드맵 결정 사항 13): 림퍼 1명이면 그 자리 RFI 표, 2명 이상이면 한 칸 좁은 RFI 표.
  // 림퍼가 많을수록 아이솔해도 여럿이 따라와 멀티웨이가 되기 쉽고, 그중 누군가 강한 패로 림프했을 가능성도 커져 레인지를 좁힌다.
  // 좁은 표는 늘 원래 표의 부분집합이다(UTG ⊂ HJ, HJ ⊂ CO, CO ⊂ BTN, CO ⊂ SB, j-coach-ext 18이 고정). 그래서 두 표의 교집합 = 좁은 표.
  // 6인에서 HJ 앞 림퍼는 UTG 1명뿐이라 HJ→UTG는 쓰일 일이 없지만 규칙을 맞춰 둔다. 3명 이상이어도 한 칸만 좁힌다.
  // BB는 RFI 표 대신 vsLimpBB(+ CO 표 alt)를 쓰므로 null.
  var ISO_TIGHTER = { HJ: 'UTG', CO: 'HJ', BTN: 'CO', SB: 'CO' };
  function isoPos(position, limpers) {
    if (position === 'BB' || !GTO_RANGES.rfi[position]) return null;
    return (limpers || 0) >= 2 && ISO_TIGHTER[position] ? ISO_TIGHTER[position] : position;
  }

  // 림퍼 뒤 GTO 액션. 아이솔 = isoPos 표(표 안 레이즈, 밖 폴드, 따라 콜은 없음). limpers 생략은 1명(그 자리 RFI 표, 예전 2인자 호출과 같다).
  // BB는 RFI 표가 없고 콜할 돈이 0이라 레이즈 아니면 체크: 아주 강한 패(vsLimpBB)만 레이즈, 나머지는 체크.
  function gtoActionVsLimp(position, holeCards, limpers) {
    if (position === 'BB') return _in(holeCards, GTO_RANGES.vsLimpBB) ? 'raise' : 'check';
    var ip = isoPos(position, limpers == null ? 1 : limpers);
    if (!ip) return gtoAction(position, holeCards);
    // 그 자리 표와 좁은 표의 교집합(좁은 표가 부분집합이라 결과는 좁은 표와 같다)
    return (gtoAction(position, holeCards) === 'raise' && _in(holeCards, GTO_RANGES.rfi[ip])) ? 'raise' : 'fold';
  }

  // BB가 림퍼 상대로 체크가 정답인 손 중 CO 오픈 표 안의 손은 아이솔 레이즈도 괜찮다(둘 다 정답). 그 외 null.
  function vsLimpAlt(position, holeCards) {
    if (position !== 'BB' || gtoActionVsLimp(position, holeCards) !== 'check') return null;
    return _in(holeCards, GTO_RANGES.rfi.CO) ? 'raise' : null;
  }

  // 현재 상태 기준 프리플랍 GTO 권장 (라운드 2 힌트용)
  // facing: false(오픈) | true(vs오픈) | 'vs3bet'(내 오픈에 3벳 맞음) | 'vs4bet'(내 3벳에 4벳 맞음) | 'cold3bet'(콜드 3벳 직면)
  // opener: vs오픈일 때 오프너 포지션(없으면 null)
  // 림퍼 뒤(facing false, limpers ≥ 1)는 추가 필드 limpers, size(아이솔 raise-to), alt(BB만, 체크와 함께 정답인 레이즈),
  // isoPos(아이솔 기준 RFI 표의 자리, 림퍼 1명 = 내 자리, 2명 이상 = 한 칸 좁은 자리, BB는 null)를 준다.
  // facing은 false 그대로 둔다(app.js 힌트 문구는 오픈 상황 그대로, gto-chart.js는 isoPos 표를 그린다).
  function preflopHint(state, heroPos) {
    if (state.street !== 'preflop') return null;
    var facing4 = isFacing4bet(state);
    var facing3 = !facing4 && isFacing3bet(state);
    var cold3 = !facing4 && !facing3 && isFacingCold3bet(state);
    var facing = facing4 ? 'vs4bet' : facing3 ? 'vs3bet' : cold3 ? 'cold3bet'
      : !!(state.lastRaiser && state.currentBet > state.bigBlind);
    var opener = openerPos(state);
    var limpers = facing === false ? limperCount(state) : 0;
    var act = facing4 ? gtoActionVs4bet(heroPos, state.heroCards)
      : facing3 ? gtoActionVs3bet(heroPos, state.heroCards)
      : cold3 ? gtoActionVsCold3bet(state.heroCards)
      : facing ? gtoActionVsRfi(heroPos, state.heroCards, opener)
      : limpers > 0 ? gtoActionVsLimp(heroPos, state.heroCards, limpers)
      : gtoAction(heroPos, state.heroCards);
    var label = { raise: '레이즈', call: '콜', fold: '폴드', check: '체크' }[act] || act;
    var out = { action: act, label: label, facing: facing, opener: opener };
    if (limpers > 0) {
      out.limpers = limpers;
      out.size = isoSize(heroPos, limpers, state.bigBlind);
      out.alt = vsLimpAlt(heroPos, state.heroCards);
      out.isoPos = isoPos(heroPos, limpers);
    }
    return out;
  }

  var api = { GTO_RANGES, gtoAction, gtoActionVsRfi, gtoActionVs3bet, gtoActionVs4bet, gtoActionVsCold3bet, gtoActionVsLimp,
    isFacing3bet, isFacing4bet, isFacingCold3bet, openerPos, preflopHint, rangeClassSet, villainRangeFor, callerRangeFor,
    limperCount, isoSize, vsLimpAlt, isoPos };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
