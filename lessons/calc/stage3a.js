// lessons/calc/stage3a.js (채우는 그룹: M5-S3A)
// 레슨 calc 등록부(계약 L9, lessons/lesson-core.js 머리 주석)에 LessonCore.defineCalc로 등록하는 유형: betsize, texture.
// 유형 소유는 docs/JOURNEY_ROADMAP.md M5 계약 F7. 로드할 때 LessonCore.defineCalc만 부르고 DOM, window, localStorage에 손대지 않는다.
// 엔진(EV, Villain, PostflopTables)은 계산할 때 typeof 가드로 찾는다(node 러너에서 로드돼도 안전).
//
// betsize: 프리플랍 3벳과 4벳 크기(raise-to 총액, bb). 스택 100bb 기준(이 앱 게임의 시작 스택).
//   입력 { kind: '3bet' | '4bet', facing: 직면한 레이즈 총액 bb(3벳이면 상대 오픈, 4벳이면 상대 3벳), oop?: boolean }
//     oop = 플랍부터 먼저 말하는 자리. 이 앱은 블라인드(SB, BB)를 OOP로 본다(engine/ev.js calcOptions의 oop,
//     ai/villain.js:63의 SB, BB 판정과 같다). 3벳은 oop가 꼭 있어야 하고(true 또는 false), 4벳은 자리와 상관없이 배수가 같아
//     oop를 쓰지 않는다(적으면 boolean이어야 한다).
//   변수
//     size    히어로(이 앱 표준) 크기 = facing x mult를 0.1bb로 반올림(engine/ev.js calcOptions raiseHalfAmt의 clampTo와 같다)
//     mult    히어로 배수: 3벳 IP 3, OOP 4, 4벳 2.3(engine/ev.js:41-46)
//     ai      이 앱 AI 크기 = facing x aimult를 0.5bb로 반올림(ai/villain.js jamOr)
//     aimult  AI 배수: 3벳 IP 3, OOP 3.5(ai/villain.js:63), 4벳 2.3(ai/villain.js:70)
//     facing  입력 그대로(bb 숫자)
//   main 'size'. facing은 2bb 이상이고 size와 ai가 40bb 미만이어야 한다(100bb 스택의 40%부터 AI는 올인으로 바꾼다,
//     ai/villain.js jamOr). 밖이면 {error}.
//   verify: 상태를 만들어 EV.calcOptions(state, 0.5).raiseHalfAmt(size)와 Villain.getAction(TAG 프로필, AA)의 amount(ai)로
//     구한다. 배수(mult, aimult)는 같은 두 함수를 facing 10bb로 불러 10으로 나눈 값이다(반올림 영향 없음).
//   qNums(c) = [facing](레슨 복습은 질문 문장만 보이므로 q에 직면한 크기를 적는다). chip 'exact'('엔진 계산').
//
// texture: 플랍 3장의 날씨와 높이(설계서 3.2절 출제 제외 6번, 8.2절 3번 '이 앱의 분류 기준').
//   입력 { board: [카드 3장] }('Ks', 'Th' 또는 '10h' 형식, 서로 다른 카드)
//   변수
//     cls      PostflopTables.classifyFlop 7클래스('a-high-dry', 'broadway-dry', 'low-dry', 'mid-wet', 'low-wet', 'paired', 'monotone')
//     weather  '맑음'(dry 3종) | '비'(mid-wet, low-wet) | '구름'(paired) | '안개'(monotone)
//     height   '하이' | '미드' | '로우'. a-high-dry, broadway-dry 하이, mid-wet 미드, low-dry, low-wet 로우.
//              구름과 안개는 가장 높은 카드로 Q 이상 하이, 10과 J 미드, 9 이하 로우(puzzles/gen-postflop.js texture와 같은 규칙).
//              그래서 맑음은 하이와 로우(Q 이상이 하이, J 이하는 로우), 비는 미드와 로우(10 이상이 미드, 9 이하는 로우) 두 칸뿐이다.
//     axes     weather + ', ' + height(질문 보기 '날씨, 높이'용, 예 '비, 미드')
//     top      가장 높은 카드 숫자('A', 'K', 'Q', 'J', '10', '9' ... '2')
//   main 'weather'. verify: classifyFlop을 부르지 않는 독립 분류(무늬 가짓수, 같은 숫자, 가장 높은 카드와 낮은 카드의 차이로
//     다시 판정하고 cls까지 같은 이름으로 낸다).
//   qCards(c) = board(레슨 복습은 질문 문장만 보이므로 q에 보드 카드를 적는다). chip 'appdef'('이 앱의 분류 기준').
var LessonCalcS3A = (function() {
  function _isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function _fin(x) { return x !== null && x !== '' && x !== undefined && typeof x !== 'boolean' && isFinite(Number(x)); }
  function _bb(x) { var v = Math.round(Number(x) * 100) / 100; return v === 0 ? 0 : v; }
  var STACK = 100, JAM_AT = 0.4 * STACK;

  // ── betsize ──────────────────────────────────────────
  var HERO_MULT = { '3bet': { ip: 3, oop: 4 }, '4bet': { ip: 2.3, oop: 2.3 } };
  var AI_MULT = { '3bet': { ip: 3, oop: 3.5 }, '4bet': { ip: 2.3, oop: 2.3 } };
  function _betInput(c) {
    if (!_isObj(c)) return { error: 'betsize 입력이 없어요' };
    if (c.kind !== '3bet' && c.kind !== '4bet') return { error: "betsize kind는 '3bet' 또는 '4bet'이에요" };
    if (!_fin(c.facing) || Number(c.facing) < 2) return { error: 'betsize facing은 2bb 이상의 숫자예요' };
    if (c.kind === '3bet' && typeof c.oop !== 'boolean') return { error: '3벳 크기는 oop(true 또는 false)가 필요해요' };
    if (c.oop != null && typeof c.oop !== 'boolean') return { error: 'betsize oop는 true 또는 false예요' };
    return { kind: c.kind, facing: Number(c.facing), side: c.oop === true ? 'oop' : 'ip' };
  }
  function betsizeCalc(c) {
    var p = _betInput(c);
    if (p.error) return p;
    var m = HERO_MULT[p.kind][p.side], am = AI_MULT[p.kind][p.side];
    var size = Math.round(p.facing * m * 10) / 10;
    var ai = Math.round(p.facing * am * 2) / 2;
    if (size >= JAM_AT || ai >= JAM_AT) return { error: '100bb 스택의 40%를 넘는 크기는 이 앱 AI가 올인으로 바꿔요(facing을 줄여요)' };
    return { size: _bb(size), mult: m, ai: _bb(ai), aimult: am, facing: _bb(p.facing) };
  }
  // 독립 경로: 이 앱 엔진의 실제 함수(히어로 EV.calcOptions, AI Villain.getAction)로 같은 스팟을 다시 만든다
  function betsizeVerify(c) {
    if (!_isObj(c) || (c.kind !== '3bet' && c.kind !== '4bet')) return { error: 'kind가 맞지 않아요' };
    var f = Number(c.facing);
    if (!_fin(c.facing) || !(f >= 2)) return { error: 'facing이 맞지 않아요' };
    if (c.kind === '3bet' ? typeof c.oop !== 'boolean' : (c.oop != null && typeof c.oop !== 'boolean')) return { error: 'oop가 맞지 않아요' };
    if (typeof EV === 'undefined' || !EV || typeof EV.calcOptions !== 'function') return { error: 'EV.calcOptions가 없어요' };
    if (typeof Villain === 'undefined' || !Villain || typeof Villain.getAction !== 'function') return { error: 'Villain.getAction이 없어요' };
    var pos = c.oop === true ? 'BB' : 'BTN';
    var sbc = c.kind === '3bet' ? 1 : 2;
    var hero = function(x) {
      var st = { street: 'preflop', pot: x + 1.5, currentBet: x, bigBlind: 1, minRaise: x + 1, streetBetCount: sbc,
        lastRaiser: 'V', playerBets: { Hero: 0 }, stacks: { Hero: STACK }, players: { Hero: { pos: pos } } };
      return Number(EV.calcOptions(st, 0.5).raiseHalfAmt);
    };
    var bot = function(x) {
      var v = { name: 'V', pos: pos, type: 'TAG', holeCards: [{ rank: 'A', suit: 's' }, { rank: 'A', suit: 'h' }] };
      var st = { street: 'preflop', pot: x + 1.5, currentBet: x, bigBlind: 1, streetBetCount: sbc,
        playerBets: { V: 0 }, stacks: { V: STACK } };
      var a = Villain.getAction(v, st);
      return (a && a.action !== 'fold' && a.action !== 'call') ? Number(a.amount) : NaN;
    };
    var size = hero(f), ai = bot(f);
    if (!(size > f) || !(ai > f)) return { error: '엔진이 레이즈 크기를 내지 않았어요' };
    if (size >= JAM_AT || ai >= JAM_AT) return { error: '40bb 이상(AI 올인 구간)' };
    return { size: _bb(size), mult: Math.round(hero(10) * 10) / 100, ai: _bb(ai), aimult: Math.round(bot(10) * 10) / 100, facing: _bb(f) };
  }
  var betsize = {
    calc: betsizeCalc,
    verify: betsizeVerify,
    main: 'size',
    // 손으로 확인한 값: 3 x 3 = 9, 3 x 4 = 12와 3 x 3.5 = 10.5, 2.5 x 3.5 = 8.75 → AI 0.5 반올림 9, 9 x 2.3 = 20.7 → AI 20.5,
    // 7.5 x 2.3 = 17.25 → 히어로 0.1 반올림 17.3, AI 0.5 반올림 17.5
    cases: [
      { c: { kind: '3bet', facing: 3, oop: false }, want: { size: 9, mult: 3, ai: 9, aimult: 3, facing: 3 } },
      { c: { kind: '3bet', facing: 3, oop: true }, want: { size: 12, mult: 4, ai: 10.5, aimult: 3.5, facing: 3 } },
      { c: { kind: '3bet', facing: 2.5, oop: true }, want: { size: 10, mult: 4, ai: 9, aimult: 3.5, facing: 2.5 } },
      { c: { kind: '4bet', facing: 9 }, want: { size: 20.7, mult: 2.3, ai: 20.5, aimult: 2.3, facing: 9 } },
      { c: { kind: '4bet', facing: 7.5, oop: true }, want: { size: 17.3, mult: 2.3, ai: 17.5, aimult: 2.3, facing: 7.5 } }
    ],
    qNums: function(c) { return [Number(c.facing)]; },
    chip: 'exact'
  };

  // ── texture ──────────────────────────────────────────
  var RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  var SUITS = 'shdc';
  var CLS_WEATHER = { 'a-high-dry': '맑음', 'broadway-dry': '맑음', 'low-dry': '맑음', 'mid-wet': '비', 'low-wet': '비', paired: '구름', monotone: '안개' };
  var CLS_HEIGHT = { 'a-high-dry': '하이', 'broadway-dry': '하이', 'mid-wet': '미드', 'low-dry': '로우', 'low-wet': '로우' };
  function _rankText(r) { return r === 'T' ? '10' : r; }
  // 'Ks', 'Th', '10h' → {rank, suit} | null
  function _card(x) {
    var s = String(x == null ? '' : x).trim();
    if (s.length === 3 && s.slice(0, 2) === '10') s = 'T' + s.charAt(2);
    if (s.length !== 2) return null;
    var r = s.charAt(0).toUpperCase(), u = s.charAt(1).toLowerCase();
    return (RANKS.indexOf(r) >= 0 && SUITS.indexOf(u) >= 0) ? { rank: r, suit: u } : null;
  }
  function textureCalc(c) {
    if (!_isObj(c) || !Array.isArray(c.board) || c.board.length !== 3) return { error: 'texture board는 카드 3장이에요' };
    var b = [], seen = {};
    for (var i = 0; i < 3; i++) {
      var cd = _card(c.board[i]);
      if (!cd) return { error: '카드를 읽을 수 없어요: ' + c.board[i] };
      if (seen[cd.rank + cd.suit]) return { error: '같은 카드가 두 번 나와요: ' + cd.rank + cd.suit };
      seen[cd.rank + cd.suit] = true;
      b.push(cd);
    }
    if (typeof PostflopTables === 'undefined' || !PostflopTables || typeof PostflopTables.classifyFlop !== 'function') return { error: 'PostflopTables.classifyFlop이 없어요' };
    var cls = PostflopTables.classifyFlop(b);
    var w = CLS_WEATHER[cls];
    if (!w) return { error: '분류할 수 없는 보드예요: ' + cls };
    var top = Math.max.apply(null, b.map(function(x) { return RANKS.indexOf(x.rank); }));
    var h = CLS_HEIGHT[cls] || (top >= 10 ? '하이' : (top >= 8 ? '미드' : '로우'));
    return { weather: w, height: h, cls: cls, axes: w + ', ' + h, top: _rankText(RANKS[top]) };
  }
  // 독립 경로: classifyFlop을 부르지 않고 숫자 값(2~14)과 무늬 가짓수로 다시 판정한다
  function textureVerify(c) {
    var b = c && c.board;
    if (!Array.isArray(b) || b.length !== 3) return { error: 'board 3장이 아니에요' };
    var VAL = { A: 14, K: 13, Q: 12, J: 11, T: 10, '10': 10 };
    var vals = [], suits = [], keys = [];
    for (var i = 0; i < 3; i++) {
      var m = /^(10|[2-9TJQKA])([shdc])$/i.exec(String(b[i]));
      if (!m) return { error: '카드 형식: ' + b[i] };
      var r = m[1].toUpperCase(), v = VAL[r] || Number(r), s = m[2].toLowerCase();
      if (keys.indexOf(v + s) >= 0) return { error: '같은 카드: ' + b[i] };
      keys.push(v + s); vals.push(v); suits.push(s);
    }
    vals.sort(function(x, y) { return y - x; });
    var nSuit = suits.filter(function(s, k) { return suits.indexOf(s) === k; }).length;
    var hi = vals[0], lo = vals[2], cls, w, h;
    var tri = hi >= 12 ? '하이' : (hi >= 10 ? '미드' : '로우');
    if (nSuit === 1) { cls = 'monotone'; w = '안개'; h = tri; }
    else if (vals[0] === vals[1] || vals[1] === vals[2]) { cls = 'paired'; w = '구름'; h = tri; }
    else if (hi - lo <= 4 || nSuit === 2) { w = '비'; cls = hi >= 10 ? 'mid-wet' : 'low-wet'; h = hi >= 10 ? '미드' : '로우'; }
    else { w = '맑음'; cls = hi === 14 ? 'a-high-dry' : (hi >= 12 ? 'broadway-dry' : 'low-dry'); h = hi >= 12 ? '하이' : '로우'; }
    var topText = hi === 14 ? 'A' : hi === 13 ? 'K' : hi === 12 ? 'Q' : hi === 11 ? 'J' : String(hi);
    return { weather: w, height: h, cls: cls, axes: w + ', ' + h, top: topText };
  }
  var texture = {
    calc: textureCalc,
    verify: textureVerify,
    main: 'weather',
    // 손으로 분류한 값(설계서 3.2절 6번 규칙): 무늬 3가지 + 차이 11 → 맑음, K 하이 / 같은 무늬 2장 → 비, J라 미드 /
    // 같은 숫자 → 구름, 8이라 로우 / 세 장 하트 → 안개, Q라 하이 / 차이 2 → 비, 6이라 로우 / J 하이 마른 보드 → 맑음, 로우
    cases: [
      { c: { board: ['Ks', '7h', '2d'] }, want: { weather: '맑음', height: '하이', cls: 'broadway-dry', axes: '맑음, 하이', top: 'K' } },
      { c: { board: ['Jh', 'Th', '9d'] }, want: { weather: '비', height: '미드', cls: 'mid-wet', axes: '비, 미드', top: 'J' } },
      { c: { board: ['8s', '8d', '3c'] }, want: { weather: '구름', height: '로우', cls: 'paired', axes: '구름, 로우', top: '8' } },
      { c: { board: ['Qh', '7h', '3h'] }, want: { weather: '안개', height: '하이', cls: 'monotone', axes: '안개, 하이', top: 'Q' } },
      { c: { board: ['6c', '5d', '4h'] }, want: { weather: '비', height: '로우', cls: 'low-wet', axes: '비, 로우', top: '6' } },
      { c: { board: ['Js', '6d', '2c'] }, want: { weather: '맑음', height: '로우', cls: 'low-dry', axes: '맑음, 로우', top: 'J' } },
      { c: { board: ['10s', '9s', '6s'] }, want: { weather: '안개', height: '미드', cls: 'monotone', axes: '안개, 미드', top: '10' } }
    ],
    qCards: function(c) { return Array.isArray(c.board) ? c.board.slice() : []; },
    chip: 'appdef'
  };

  var ok = {};
  if (typeof LessonCore !== 'undefined' && LessonCore && typeof LessonCore.defineCalc === 'function') {
    ok.betsize = LessonCore.defineCalc('betsize', betsize);
    ok.texture = LessonCore.defineCalc('texture', texture);
  }
  var api = { betsize: betsize, texture: texture, registered: ok };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
