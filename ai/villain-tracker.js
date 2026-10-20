// ai/villain-tracker.js: 빌런별 성향 통계(VPIP/PFR/3벳/AF/벳폴드), 세션 단위 메모리 집계
// localStorage 미사용. 히어로 액션은 추적하지 않음. 연습 핸드는 호출부(app)에서 제외.
// M6-READ(계약 H4): HUD 4분류를 이 파일이 정본으로 가진다. 트래커 style 칩, hudread 퍼즐, S6 레슨과 보스가 같은 규칙을 쓴다.
//   classify({ vpip, pfr, n }) → 이 순서로 'tight'(VPIP ≤ 10), 'loose-passive'(VPIP ≥ 20이고 PFR/VPIP < 0.35),
//     'loose-aggr'(VPIP ≥ 18이고 PFR/VPIP ≥ 0.6), 'standard'(나머지). n < 15면 null(아직 모름). vpip, pfr는 % 정수(표시값).
//   CLASS_LABEL: 🧊 타이트, ⚖ 정석, 🔥 루즈-공격, 🐟 루즈-패시브. stats(name).style = 라벨(hudText 형식은 그대로).
//   CLASS_OF_TYPE: 은닉 정답 대응(Nit tight, TAG standard, LAG loose-aggr, Fish와 Station loose-passive).
//   RULE: 임계 상수 한 곳(재보정이 필요하면 여기 RULE0만 바꾼다. classify가 api.RULE을 그때그때 읽고,
//     puzzles/gen-read.js hudread의 생성 범위와 해설 문구도 같은 값에서 나온다).
//   M6 통합 검증 재보정(로드맵 결정 21): 처음 값(타이트 20 이하, 루즈-패시브 40 이상, 루즈-공격 30 이상)은 엔진 빌런의 실제 6인
//     숫자와 맞지 않아(은닉 테이블 실측 VPIP/PFR: Nit 6/5, TAG 13~15/11~14, LAG 19~23/16~21, Fish 33~36/3, Station 30~32/3)
//     엔진 빌런을 이 규칙으로 맞히는 비율이 25% 안팎이었다(LAG, Station 0%대). 지금 값은 그 실측에 맞춘 이 앱의 기준이고
//     (100핸드 관찰 좌석 정답 82~91%, 5좌석 중 4곳 이상 83~95%), tests/p8-reads-flow.test.js가 엔진 시뮬레이션으로 지킨다.
//   유형 가림(state.hideTypes)일 때 style 칩을 빼는 것은 표시 쪽(ui/table.js _hudHTML)이 맡는다(M4-P5).
var VillainTracker = (function() {
  var _sid = null;
  var _data = {}; // name -> { hands:{handKey:{vpip,pfr,tb}}, aggr, calls, folds, facing }

  // 판별 임계(설계서 2.5절, 계약 H4, 엔진 실측 재보정). 단위: VPIP, PFR은 % 정수, 비율은 PFR/VPIP
  var RULE0 = Object.freeze({ minN: 15, tightMax: 10, lpMin: 20, lpRatio: 0.35, laMin: 18, laRatio: 0.6 });
  var api = null;   // 아래에서 채운다(_rule이 api.RULE을 읽는다)
  var CLASSES = Object.freeze(['tight', 'standard', 'loose-aggr', 'loose-passive']);
  var CLASS_LABEL = Object.freeze({ tight: '🧊 타이트', standard: '⚖ 정석', 'loose-aggr': '🔥 루즈-공격', 'loose-passive': '🐟 루즈-패시브' });
  var CLASS_OF_TYPE = Object.freeze({ Nit: 'tight', TAG: 'standard', LAG: 'loose-aggr', Fish: 'loose-passive', Station: 'loose-passive' });

  // 규칙 판정(n 검사 없음). 테스트와 hudread가 n과 따로 부른다. 임계는 api.RULE을 그때그때 읽는다(재보정 시험용으로 바꿔 끼울 수 있게)
  function _rule(vpip, pfr) {
    var v = Number(vpip), p = Number(pfr);
    if (!isFinite(v) || !isFinite(p)) return null;
    var RULE = (api && api.RULE) || RULE0;
    var ratio = v > 0 ? p / v : 0;
    if (v <= RULE.tightMax) return 'tight';
    if (v >= RULE.lpMin && ratio < RULE.lpRatio) return 'loose-passive';
    if (v >= RULE.laMin && ratio >= RULE.laRatio) return 'loose-aggr';
    return 'standard';
  }

  // classify({vpip, pfr, n}) → 분류 id | null(n < 15 또는 숫자 아님). n이 없으면 표본 검사를 하지 않는다
  function classify(o) {
    if (!o || typeof o !== 'object') return null;
    if (o.n != null && !(Number(o.n) >= ((api && api.RULE) || RULE0).minN)) return null;
    return _rule(o.vpip, o.pfr);
  }
  function labelOf(cls) { return CLASS_LABEL[cls] || null; }

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
    // 정수 반올림은 k x 100 / n 순서로(k / n x 100은 29/200 = 14.4999...처럼 소수 오차로 반을 내린다). hudread 퍼즐과 같은 식
    var vpip = _round(v * 100 / n), pfr = _round(p * 100 / n);
    var af = r.calls ? Math.round(r.aggr * 10 / r.calls) / 10 : r.aggr;
    var foldToBet = r.facing ? r.folds / r.facing : null;
    // 표시값(정수 %)으로 분류한다: 화면 숫자와 칩이 같은 규칙으로 맞물리게(hudread 퍼즐과 같은 기준)
    var cls = classify({ vpip: vpip, pfr: pfr, n: n });
    return { n: n, vpip: vpip, pfr: pfr, threeBet: _round(t * 100 / n), af: af, foldToBet: foldToBet,
      cls: cls, style: cls ? CLASS_LABEL[cls] : null };
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

  api = { reset: reset, observe: observe, stats: stats, hudText: hudText,
    classify: classify, labelOf: labelOf, RULE: RULE0, CLASSES: CLASSES, CLASS_LABEL: CLASS_LABEL, CLASS_OF_TYPE: CLASS_OF_TYPE,
    _rule: _rule };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
