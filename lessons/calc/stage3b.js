// lessons/calc/stage3b.js (채우는 그룹: M5-S3B)
// 레슨 calc 등록부(계약 L9, lessons/lesson-core.js 머리 주석)에 LessonCore.defineCalc로 등록할 유형: cbet, spr, eqMulti.
// 유형 소유는 로드맵 M5 계약 F7. 입력에 pot 필드는 쓰지 않는다(potTotal = 상대 벳 포함 팟). 퍼센트는 정수 반올림, SPR은 소수 첫째 자리 문자열.
// calc와 verify는 서로 다른 경로로 같은 값을 낸다(verify는 calc 코드를 부르지 않는다). tests/j-lessons.test.js가 둘을 대조한다.
//
// cbet {board[3], aggressor?} (main 'freq', 칩 'appdef')
//   board = 플랍 3장. aggressor = 프리플랍 마지막 레이저 자리('UTG' | 'HJ' | 'CO' | 'BTN', 기본 'BTN').
//   engine/postflop-tables.js CBET 표가 '인포지션 오픈 레이저 기준'이라 SB, BB 레이저는 오류로 거른다.
//   → freq(레인지 전체 c벳 빈도 %), size(칠 때 사이즈, 팟 대비 %), weather('맑음' | '비' | '구름' | '안개'),
//     axis('often-small' | 'often-big' | 'rarely-small' | 'rarely-big', 빈도 50 이상이면 often, 사이즈 50 이상이면 big),
//     axisKo('자주, 작게' 같은 문장 조각), cls(classifyFlop 7클래스 이름), aggressor.
//   값은 공개 솔버 통념을 근사한 참고 표라서 이 유형을 쓰는 장면은 label '참고'를 단다(설계서 8.2절 4번).
//   날씨 매핑은 설계서 3.2절 출제 제외 6번(S3A texture와 같은 매핑을 이 파일 안에서 따로 구현): 맑음 = a-high-dry, broadway-dry,
//     low-dry, 비 = mid-wet, low-wet, 구름 = paired, 안개 = monotone.
//   비 보드 중 서로 붙지 않았거나(최고와 최저 차이 5 이상) 가장 높은 카드가 Q 이상인 보드는 오류로 거른다
//     (puzzles/gen-postflop.js _cbBoardOk와 같은 규칙: 무늬 두 장 때문에 비로 분류돼도 통념상 자주, 작게 치는 보드라 표와 어긋난다).
//   calc = PostflopTables.classifyFlop(카드 객체) → 클래스 → 날씨 표. verify = 카드 문자열에서 무늬 수, 페어, 간격, 최고 카드로
//     날씨와 클래스를 직접 정한다(classifyFlop을 부르지 않음). 빈도와 사이즈는 둘 다 같은 CBET 표(이 표가 원천)에서 읽는다.
//
// spr {stack, potTotal} (main 'spr', 칩 'exact')
//   stack = 플랍 시작 때 남은 유효 스택(두 사람 중 작은 쪽, bb), potTotal = 플랍 팟(bb).
//   → spr(stack ÷ potTotal을 소수 첫째 자리 문자열로, 예 '17.7', '4.5'), stack, potTotal(bb 숫자).
//   calc = 나눗셈 뒤 반올림, verify = 0.01bb 단위 정수로 바꿔 나눈다. 커밋 구간(약 4 이하, 약 10 이상) 해석은 참고라 변수로 내지 않는다.
//
// eqMulti {hero[2], vs:[[2], ...](1~3명), board[3~4]} (main 'eq', 칩 'exact')
//   → eq(남은 카드 전부 열거, 무승부는 이긴 사람 수로 나눈 팟 지분 %), n(상대 수), fair(공평한 몫 = 100 ÷ (n + 1) 반올림),
//     eq1 ~ eq<n>(앞에서부터 상대 k명만 있을 때의 내 지분 %, 뒤 상대 카드는 덱에 남는다. eq<n> = eq).
//   calc = HandEval.evaluate(카드 객체) + compareHands, verify = 정수 카드(r x 4 + s) + HandEval.evaluateIdx와 이 파일의 비교 함수.
//
// 로드 때 LessonCore가 없으면 아무것도 하지 않는다. DOM, window, localStorage에 손대지 않는다.
(function() {
  var LC = (typeof LessonCore !== 'undefined' && LessonCore) ? LessonCore : null;
  if (!LC || typeof LC.defineCalc !== 'function') return;

  var RANKS = '23456789TJQKA';
  var SUITS = 'shdc';
  var IP_SEATS = ['UTG', 'HJ', 'CO', 'BTN'];
  var CLASS_WEATHER = { 'a-high-dry': '맑음', 'broadway-dry': '맑음', 'low-dry': '맑음', 'mid-wet': '비', 'low-wet': '비',
    paired: '구름', monotone: '안개' };
  var AXIS_KO = { 'often-small': '자주, 작게', 'often-big': '자주, 크게', 'rarely-small': '덜 자주, 작게', 'rarely-big': '덜 자주, 크게' };

  function _isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function _fin(x) { return x !== null && x !== '' && x !== undefined && typeof x !== 'boolean' && isFinite(Number(x)); }
  function _bb(x) { var v = Math.round(Number(x) * 100) / 100; return v === 0 ? 0 : v; }
  // 'Ah', 'Td', '10d' → 'Ah' 형식 | null
  function _norm(x) {
    var s = String(x == null ? '' : x).trim();
    if (s.length === 3 && s.slice(0, 2) === '10') s = 'T' + s.charAt(2);
    if (s.length !== 2) return null;
    var r = s.charAt(0).toUpperCase(), u = s.charAt(1).toLowerCase();
    return (RANKS.indexOf(r) >= 0 && SUITS.indexOf(u) >= 0) ? r + u : null;
  }
  // 카드 묶음 읽기: [{name, list, min, max}] → { groups:[['Ah',...]], seen } | { error }
  function _read(specs) {
    var seen = {}, out = [];
    for (var g = 0; g < specs.length; g++) {
      var sp = specs[g];
      if (!Array.isArray(sp.list)) return { error: sp.name + ' 카드 목록이 없어요' };
      if (sp.list.length < sp.min || sp.list.length > sp.max) return { error: sp.name + ' 카드 수가 맞지 않아요(' + sp.list.length + '장)' };
      var row = [];
      for (var i = 0; i < sp.list.length; i++) {
        var c = _norm(sp.list[i]);
        if (!c) return { error: '카드를 읽을 수 없어요: ' + sp.list[i] };
        if (seen[c]) return { error: '같은 카드가 두 번 나와요: ' + c };
        seen[c] = true;
        row.push(c);
      }
      out.push(row);
    }
    return { groups: out, seen: seen };
  }
  function _aggr(c) {
    var a = c.aggressor == null ? 'BTN' : c.aggressor;
    if (IP_SEATS.indexOf(a) < 0) return { error: 'cbet aggressor는 BB 상대 인포지션 레이저 자리(UTG, HJ, CO, BTN)만 써요: ' + a + '(c벳 표가 인포지션 오픈 레이저 기준)' };
    return { seat: a };
  }
  function _tableRow(cls) {
    var T = (typeof PostflopTables !== 'undefined' && PostflopTables && PostflopTables.CBET) ? PostflopTables.CBET : null;
    var t = T ? T[cls] : null;
    return (t && _fin(t.freq) && _fin(t.size)) ? t : null;
  }
  function _axisOf(freq, size) { return (freq >= 50 ? 'often' : 'rarely') + '-' + (size >= 50 ? 'big' : 'small'); }

  // ── cbet ─────────────────────────────────────────────
  function cbetCalc(c) {
    var p = _read([{ name: '플랍', list: c.board, min: 3, max: 3 }]);
    if (p.error) return { error: p.error };
    var ag = _aggr(c);
    if (ag.error) return ag;
    var P = (typeof PostflopTables !== 'undefined' && PostflopTables && typeof PostflopTables.classifyFlop === 'function') ? PostflopTables : null;
    if (!P) return { error: 'PostflopTables가 없어요' };
    var objs = p.groups[0].map(function(s) { return { rank: s.charAt(0), suit: s.charAt(1) }; });
    var cls = P.classifyFlop(objs);
    var weather = CLASS_WEATHER[cls];
    var t = _tableRow(cls);
    if (!weather || !t) return { error: 'c벳 표에 없는 보드 클래스예요: ' + cls };
    if (weather === '비') {
      var rk = objs.map(function(o) { return RANKS.indexOf(o.rank); }).sort(function(x, y) { return y - x; });
      if (rk[0] - rk[2] > 4 || rk[0] > RANKS.indexOf('J')) {
        return { error: '무늬 두 장 때문에 비로 분류됐지만 통념상 자주, 작게 치는 보드라 c벳 표(덜 자주, 크게)와 어긋나요: ' + p.groups[0].join('') };
      }
    }
    var freq = Number(t.freq), size = Number(t.size), axis = _axisOf(freq, size);
    return { freq: freq, size: size, weather: weather, axis: axis, axisKo: AXIS_KO[axis], cls: cls, aggressor: ag.seat };
  }
  // 독립 경로: 카드 문자열의 무늬 수, 같은 숫자, 높낮이 차이, 최고 카드로 날씨를 먼저 정하고 클래스는 그 안에서 고른다
  function cbetVerify(c) {
    var b = c.board;
    if (!Array.isArray(b) || b.length !== 3) return { error: '플랍은 3장이에요' };
    var cards = [], i;
    for (i = 0; i < 3; i++) {
      var s = String(b[i] == null ? '' : b[i]).trim();
      if (/^10[shdcSHDC]$/.test(s)) s = 'T' + s.charAt(2);
      if (!/^[2-9TJQKAtjqka][shdcSHDC]$/.test(s)) return { error: '카드 표기 오류: ' + b[i] };
      s = s.charAt(0).toUpperCase() + s.charAt(1).toLowerCase();
      if (cards.indexOf(s) >= 0) return { error: '같은 카드 중복: ' + s };
      cards.push(s);
    }
    var seat = c.aggressor === undefined || c.aggressor === null ? 'BTN' : c.aggressor;
    if (!(seat === 'UTG' || seat === 'HJ' || seat === 'CO' || seat === 'BTN')) return { error: '인포지션 레이저 자리만: ' + seat };
    var suitSet = {};
    cards.forEach(function(x) { suitSet[x.charAt(1)] = 1; });
    var nSuit = Object.keys(suitSet).length;
    var v = cards.map(function(x) { return '23456789TJQKA'.indexOf(x.charAt(0)) + 2; });   // 2~14
    var hi = Math.max(v[0], v[1], v[2]), lo = Math.min(v[0], v[1], v[2]);
    var pair = v[0] === v[1] || v[1] === v[2] || v[0] === v[2];
    var weather, cls;
    if (nSuit === 1) { weather = '안개'; cls = 'monotone'; }
    else if (pair) { weather = '구름'; cls = 'paired'; }
    else if (hi - lo <= 4 || nSuit === 2) {
      weather = '비';
      cls = hi >= 10 ? 'mid-wet' : 'low-wet';
      if (hi - lo > 4 || hi > 11) return { error: '비 보드지만 붙지 않았거나 Q 이상 하이(c벳 표와 어긋남)' };
    } else {
      weather = '맑음';
      cls = hi === 14 ? 'a-high-dry' : (hi >= 12 ? 'broadway-dry' : 'low-dry');
    }
    var row = (typeof PostflopTables !== 'undefined' && PostflopTables && PostflopTables.CBET) ? PostflopTables.CBET[cls] : null;
    if (!row) return { error: 'CBET 표 없음: ' + cls };
    var often = row.freq >= 50, big = row.size >= 50;
    var axis = (often ? 'often' : 'rarely') + '-' + (big ? 'big' : 'small');
    return { freq: row.freq, size: row.size, weather: weather, axis: axis,
      axisKo: (often ? '자주' : '덜 자주') + ', ' + (big ? '크게' : '작게'), cls: cls, aggressor: seat };
  }

  // ── spr ──────────────────────────────────────────────
  function sprCalc(c) {
    if (!_fin(c.stack) || !_fin(c.potTotal)) return { error: 'spr에는 stack과 potTotal 숫자가 필요해요' };
    var st = Number(c.stack), pt = Number(c.potTotal);
    if (!(st > 0) || !(pt > 0)) return { error: 'spr stack과 potTotal은 0보다 커야 해요' };
    return { spr: (Math.round(st / pt * 10) / 10).toFixed(1), stack: _bb(st), potTotal: _bb(pt) };
  }
  // 독립 경로: 0.01bb 단위 정수로 바꿔 나누고 10을 곱한 몫을 반올림한 뒤 정수 몫과 나머지로 문자열을 만든다
  function sprVerify(c) {
    var st = Number(c.stack), pt = Number(c.potTotal);
    if (typeof c.stack === 'boolean' || typeof c.potTotal === 'boolean' || c.stack === '' || c.potTotal === '' ||
        c.stack == null || c.potTotal == null || !isFinite(st) || !isFinite(pt) || st <= 0 || pt <= 0) return { error: 'stack, potTotal은 양수' };
    var sc = Math.round(st * 100), pc = Math.round(pt * 100);
    var tenth = Math.round(sc * 10 / pc);
    var spr = Math.floor(tenth / 10) + '.' + (tenth % 10);
    return { spr: spr, stack: sc / 100, potTotal: pc / 100 };
  }

  // ── eqMulti ──────────────────────────────────────────
  function _vsList(c) {
    if (!Array.isArray(c.vs) || c.vs.length < 1 || c.vs.length > 3) return { error: 'eqMulti vs는 상대 손 1~3개 배열이에요' };
    for (var i = 0; i < c.vs.length; i++) if (!Array.isArray(c.vs[i])) return { error: 'eqMulti vs의 ' + (i + 1) + '번째 손이 배열이 아니에요' };
    return { list: c.vs };
  }
  function _HE() {
    var H = (typeof HandEval !== 'undefined' && HandEval) ? HandEval : null;
    return (H && typeof H.evaluate === 'function' && typeof H.compareHands === 'function' && typeof H.evaluateIdx === 'function') ? H : null;
  }
  // 객체 카드 경로: 히어로 지분(0~1)
  function _shareObj(H, hero, opps, board, dead) {
    var deck = [];
    for (var ri = 0; ri < 13; ri++) for (var si = 0; si < 4; si++) {
      var k = RANKS.charAt(ri) + SUITS.charAt(si);
      if (!dead[k]) deck.push({ rank: RANKS.charAt(ri), suit: SUITS.charAt(si) });
    }
    var players = [hero].concat(opps), need = 5 - board.length, sum = 0, tot = 0;
    function run(extra) {
      var full = board.concat(extra), ev = [], best = null, j;
      for (j = 0; j < players.length; j++) {
        ev.push(H.evaluate(players[j].concat(full)));
        if (best === null || H.compareHands(ev[j], best) < 0) best = ev[j];
      }
      var top = 0;
      for (j = 0; j < ev.length; j++) if (H.compareHands(ev[j], best) === 0) top++;
      tot++;
      if (H.compareHands(ev[0], best) === 0) sum += 1 / top;
    }
    if (need === 1) for (var a = 0; a < deck.length; a++) run([deck[a]]);
    else for (var x = 0; x < deck.length; x++) for (var y = x + 1; y < deck.length; y++) run([deck[x], deck[y]]);
    return tot ? sum / tot : null;
  }
  function eqMultiCalc(c) {
    var H = _HE();
    if (!H) return { error: 'HandEval이 없어요' };
    var vl = _vsList(c);
    if (vl.error) return vl;
    var specs = [{ name: '내 손', list: c.hero, min: 2, max: 2 }];
    vl.list.forEach(function(h, i) { specs.push({ name: '상대 ' + (i + 1), list: h, min: 2, max: 2 }); });
    specs.push({ name: '보드', list: c.board, min: 3, max: 4 });
    var p = _read(specs);
    if (p.error) return { error: p.error };
    var toObj = function(row) { return row.map(function(s) { return { rank: s.charAt(0), suit: s.charAt(1) }; }); };
    var hero = toObj(p.groups[0]), board = toObj(p.groups[p.groups.length - 1]);
    var opps = p.groups.slice(1, p.groups.length - 1).map(toObj);
    var out = { n: opps.length, fair: Math.round(100 / (opps.length + 1)) };
    for (var k = 1; k <= opps.length; k++) {
      var dead = {};
      p.groups[0].concat(p.groups[p.groups.length - 1]).forEach(function(s) { dead[s] = true; });
      for (var j = 0; j < k; j++) p.groups[1 + j].forEach(function(s) { dead[s] = true; });
      var sh = _shareObj(H, hero, opps.slice(0, k), board, dead);
      if (sh == null) return { error: 'eqMulti 계산 실패' };
      out['eq' + k] = Math.round(sh * 100);
    }
    out.eq = out['eq' + opps.length];
    return out;
  }
  // 독립 경로: 정수 카드(r x 4 + s, Deck idx와 같은 규칙) + evaluateIdx, 비교는 이 함수 안의 족보 순서(type 작을수록 강함, 다음 tiebreakers)
  function eqMultiVerify(c) {
    var H = _HE();
    if (!H) return { error: 'HandEval 없음' };
    if (!Array.isArray(c.vs) || c.vs.length < 1 || c.vs.length > 3) return { error: 'vs 1~3명' };
    var idx = function(s) {
      s = String(s == null ? '' : s).trim();
      if (/^10[shdc]$/i.test(s)) s = 'T' + s.charAt(2);
      if (s.length !== 2) return -1;
      var r = '23456789TJQKA'.indexOf(s.charAt(0).toUpperCase()), u = 'shdc'.indexOf(s.charAt(1).toLowerCase());
      return (r < 0 || u < 0) ? -1 : r * 4 + u;
    };
    var hands = [c.hero].concat(c.vs), used = {}, ints = [], i, j;
    for (i = 0; i < hands.length; i++) {
      if (!Array.isArray(hands[i]) || hands[i].length !== 2) return { error: '손은 2장' };
      ints.push(hands[i].map(idx));
    }
    if (!Array.isArray(c.board) || c.board.length < 3 || c.board.length > 4) return { error: '보드 3~4장' };
    var bd = c.board.map(idx);
    var allC = bd.concat.apply(bd, ints);
    for (i = 0; i < allC.length; i++) {
      if (allC[i] < 0) return { error: '카드 표기 오류' };
      if (used[allC[i]]) return { error: '카드 중복' };
      used[allC[i]] = 1;
    }
    var cmp = function(a, b) {   // < 0 이면 a가 강함
      if (a.type !== b.type) return a.type - b.type;
      for (var t = 0; t < Math.max(a.tiebreakers.length, b.tiebreakers.length); t++) {
        var x = a.tiebreakers[t] || 0, y = b.tiebreakers[t] || 0;
        if (x !== y) return y - x;
      }
      return 0;
    };
    var res = { n: c.vs.length, fair: Math.round(100 / (c.vs.length + 1)) };
    for (var k = 1; k <= c.vs.length; k++) {
      var live = ints.slice(0, k + 1), dead = {};
      bd.forEach(function(x) { dead[x] = 1; });
      live.forEach(function(h) { dead[h[0]] = 1; dead[h[1]] = 1; });
      var rest = [];
      for (var d = 0; d < 52; d++) if (!dead[d]) rest.push(d);
      // 지분을 12로 곱한 정수로 센다(1명, 2명, 3명, 4명 공동 1등의 몫 12, 6, 4, 3)
      var num = 0, runs = 0;
      var score = function(run) {
        var b5 = bd.concat(run), best = null, ev = [];
        for (var q = 0; q < live.length; q++) {
          var e = H.evaluateIdx(live[q].concat(b5));
          ev.push(e);
          if (best === null || cmp(e, best) < 0) best = e;
        }
        runs++;
        if (cmp(ev[0], best) !== 0) return;
        var ties = 0;
        for (q = 0; q < ev.length; q++) if (cmp(ev[q], best) === 0) ties++;
        num += 12 / ties;
      };
      if (bd.length === 4) for (i = 0; i < rest.length; i++) score([rest[i]]);
      else for (i = 0; i < rest.length; i++) for (j = i + 1; j < rest.length; j++) score([rest[i], rest[j]]);
      res['eq' + k] = Math.round(num * 100 / (12 * runs));
    }
    res.eq = res['eq' + c.vs.length];
    return res;
  }

  var ok = [];
  ok.push(LC.defineCalc('cbet', {
    calc: cbetCalc, verify: cbetVerify, main: 'freq', chip: 'appdef',
    // 손으로 확인한 값: A♠7♥2♦ = A 하이 드라이(맑음, 75/33), 8♥7♠6♦ = 로우 웻(비, 40/66), K♠K♦5♣ = 페어(구름, 60/33),
    // Q♥8♥3♥ = 모노톤(안개, 35/33), 10♣9♦7♣ = 미드 웻(비, 45/66, 차이 3, J 이하)
    cases: [
      { c: { board: ['As', '7h', '2d'], aggressor: 'BTN' }, want: { freq: 75, size: 33, weather: '맑음', axis: 'often-small', axisKo: '자주, 작게', cls: 'a-high-dry' } },
      { c: { board: ['8h', '7s', '6d'] }, want: { freq: 40, size: 66, weather: '비', axis: 'rarely-big', axisKo: '덜 자주, 크게', cls: 'low-wet', aggressor: 'BTN' } },
      { c: { board: ['Ks', 'Kd', '5c'], aggressor: 'CO' }, want: { freq: 60, size: 33, weather: '구름', axis: 'often-small', cls: 'paired' } },
      { c: { board: ['Qh', '8h', '3h'] }, want: { freq: 35, size: 33, weather: '안개', axis: 'rarely-small', cls: 'monotone' } },
      { c: { board: ['Tc', '9d', '7c'] }, want: { freq: 45, size: 66, weather: '비', axis: 'rarely-big', cls: 'mid-wet' } }
    ],
    qCards: function(c) { return Array.isArray(c.board) ? c.board.slice() : []; }
  }));
  ok.push(LC.defineCalc('spr', {
    calc: sprCalc, verify: sprVerify, main: 'spr', chip: 'exact',
    // 손으로 확인한 값: 97.5 ÷ 5.5 = 17.72 → 17.7, 90 ÷ 20 = 4.5, 92.5 ÷ 16.5 = 5.60 → 5.6, 82.5 ÷ 36.5 = 2.26 → 2.3
    cases: [
      { c: { stack: 97.5, potTotal: 5.5 }, want: { spr: '17.7', stack: 97.5, potTotal: 5.5 } },
      { c: { stack: 90, potTotal: 20 }, want: { spr: '4.5' } },
      { c: { stack: 92.5, potTotal: 16.5 }, want: { spr: '5.6' } },
      { c: { stack: 82.5, potTotal: 36.5 }, want: { spr: '2.3' } }
    ],
    qNums: function(c) { return [c.stack, c.potTotal]; }
  }));
  ok.push(LC.defineCalc('eqMulti', {
    calc: eqMultiCalc, verify: eqMultiVerify, main: 'eq', chip: 'exact',
    // 손으로 센 값(턴, 리버 1장):
    //   A♠K♠ 대 Q♣Q♦, 보드 K♥7♣2♦9♥: Q♣Q♦는 남은 Q 2장(Q♥, Q♠)으로만 이긴다 → 44장 중 42장 = 95%.
    //   여기에 J♥10♥를 더하면 J♥10♥가 하트 9장 + Q♠ + 8 세 장(8♥은 하트로 이미 셈) = 13장에 이기고(Q가 와도 스트레이트라
    //   Q♣Q♦보다 높다) Q♣Q♦는 이길 카드가 없다 → 42장 중 29장 = 69%.
    //   A♥K♥ 대 A♦K♦, 보드 2♣3♦4♠9♥: 리버에 무엇이 와도 두 손 족보가 같다(어느 무늬도 4장을 넘지 못해 플러시 불가) → 50%.
    //   A♣K♣를 더해도 셋 다 같다(클럽도 A♣K♣2♣ + 리버 1장 = 4장) → 33%.
    cases: [
      { c: { hero: ['As', 'Ks'], vs: [['Qc', 'Qd']], board: ['Kh', '7c', '2d', '9h'] }, want: { eq: 95, eq1: 95, n: 1, fair: 50 } },
      { c: { hero: ['As', 'Ks'], vs: [['Qc', 'Qd'], ['Jh', 'Th']], board: ['Kh', '7c', '2d', '9h'] }, want: { eq: 69, eq1: 95, eq2: 69, n: 2, fair: 33 } },
      { c: { hero: ['Ah', 'Kh'], vs: [['Ad', 'Kd']], board: ['2c', '3d', '4s', '9h'] }, want: { eq: 50, n: 1 } },
      { c: { hero: ['Ah', 'Kh'], vs: [['Ad', 'Kd'], ['Ac', 'Kc']], board: ['2c', '3d', '4s', '9h'] }, want: { eq: 33, eq1: 50, eq2: 33, fair: 33 } }
    ],
    qCards: function(c) {
      var out = [].concat(Array.isArray(c.hero) ? c.hero : []);
      (Array.isArray(c.vs) ? c.vs : []).forEach(function(h) { if (Array.isArray(h)) out = out.concat(h); });
      return out.concat(Array.isArray(c.board) ? c.board : []);
    }
  }));
  if (ok.indexOf(false) >= 0 && typeof console !== 'undefined' && console.warn) {
    console.warn('[lessons/calc/stage3b] 등록 실패: ' + ['cbet', 'spr', 'eqMulti'].filter(function(t, i) { return !ok[i]; }).join(', '));
  }
})();
