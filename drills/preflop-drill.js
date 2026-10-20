// drills/preflop-drill.js, 8차 WP6: 프리플랍 레인지 플래시카드
// 정답은 항상 런타임 GtoChart.buildChartModel 모델에서 읽는다(하드코딩 금지). 'none' 셀/스팟은 출제 제외.
var PreflopDrill = (function() {
  var SUITS = ['s', 'h', 'd', 'c'];
  var KOR = { fold: '폴드', call: '콜', raise: '레이즈' };
  var BASE_SPOTS = [
    'rfi|UTG', 'rfi|HJ', 'rfi|CO', 'rfi|BTN', 'rfi|SB',
    'vsRfi|HJ@UTG', 'vsRfi|CO@HJ', 'vsRfi|BTN@CO', 'vsRfi|SB@BTN', 'vsRfi|BB@BTN', 'vsRfi|BB@UTG',
    'vs3bet|UTG', 'vs3bet|HJ', 'vs3bet|CO', 'vs3bet|BTN', 'vs3bet|SB'
  ];
  var _cache = {};

  // 'vsRfi|BB@BTN' → {kind, pos, opener, facing}
  function parseSpot(spot) {
    var p = String(spot).split('|');
    var kind = p[0], posPart = p[1] || '';
    var at = posPart.split('@');
    var facing = kind === 'rfi' ? false : kind === 'vsRfi' ? true : kind === 'vs3bet' ? 'vs3bet' : null;
    if (facing === null || !at[0]) return null;
    return { kind: kind, pos: at[0], opener: at[1] || null, facing: facing, spot: kind + '|' + posPart };
  }

  // 'vsRfi|BB@BTN|K9o' → {spot..., hand}
  function parseKey(key) {
    var p = String(key).split('|');
    if (p.length < 3) return null;
    var s = parseSpot(p[0] + '|' + p[1]);
    if (!s) return null;
    s.hand = p[2];
    return s;
  }

  function _model(sp) {
    if (_cache[sp.spot]) return _cache[sp.spot];
    var entry = null;
    try {
      if (typeof GtoChart !== 'undefined') {
        var m = GtoChart.buildChartModel(sp.pos, sp.facing, sp.opener);
        var playable = [], boundary = [], weight = 0, inW = 0;
        for (var r = 0; r < 13; r++) {
          for (var c = 0; c < 13; c++) {
            var a = m.cells[r][c].action;
            if (a === 'none') continue;
            var w = r === c ? 6 : (r < c ? 4 : 12);
            playable.push({ r: r, c: c, w: w });
            weight += w;
            if (a !== 'fold') inW += w;
            var nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
            for (var i = 0; i < 4; i++) {
              var nr = nb[i][0], nc = nb[i][1];
              if (nr < 0 || nr > 12 || nc < 0 || nc > 12) continue;
              var na = m.cells[nr][nc].action;
              if (na !== 'none' && na !== a) { boundary.push({ r: r, c: c }); break; }
            }
          }
        }
        if (playable.length) entry = { model: m, playable: playable, boundary: boundary, weight: weight, pct: weight ? inW / weight : 0 };
      }
    } catch (e) { entry = null; }
    _cache[sp.spot] = entry;
    return entry;
  }

  function _pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length) % arr.length]; }

  function _cards(label, rnd) {
    var r1 = label[0], r2 = label[1];
    var s1 = _pick(SUITS, rnd);
    var s2;
    if (label.length === 3 && label[2] === 's') s2 = s1;
    else {
      var rest = SUITS.filter(function(s) { return s !== s1; });
      s2 = _pick(rest, rnd);
    }
    return [{ rank: r1, suit: s1 }, { rank: r2, suit: s2 }];
  }

  function _findCell(model, hand) {
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) {
      if (model.cells[r][c].label === hand) return { r: r, c: c };
    }
    return null;
  }

  function prompt(sp) {
    if (sp.kind === 'rfi') return '6인 100bb | 당신 ' + sp.pos + ' | 앞 전원 폴드';
    if (sp.kind === 'vsRfi') return (sp.opener || '상대') + '이(가) 2.5bb 오픈 → 당신 ' + sp.pos;
    return '당신 ' + sp.pos + ' 오픈 → 3벳을 맞음';
  }

  function _build(sp, cell, entry, rnd) {
    var label = entry.model.cells[cell.r][cell.c].label;
    var answer = entry.model.cells[cell.r][cell.c].action;
    return {
      type: 'preflop', key: sp.spot + '|' + label, spot: sp.spot, kind: sp.kind,
      pos: sp.pos, facing: sp.facing, opener: sp.opener, hand: label,
      cards: _cards(label, rnd), answer: answer,
      options: sp.kind === 'rfi' ? ['fold', 'raise'] : ['fold', 'call', 'raise'],
      prompt: prompt(sp)
    };
  }

  function _spots(opts) {
    var list = (opts && opts.spots) || BASE_SPOTS;
    return list.map(parseSpot).filter(function(sp) { return sp && _model(sp); });
  }

  // 출제: 30% 복습 대기, 50% 경계 셀, 20% 콤보 가중 균등
  // opts.noReview === true(데일리 5, 배치 고사): 복습 분기를 건너뛰어(roll 0.5) 복습 대기가 없는 새 사용자와 같은 문제열
  function next(rnd, opts) {
    rnd = rnd || Math.random;
    opts = opts || {};
    var spots = _spots(opts);
    if (!spots.length) return null;
    var roll = opts.dueFirst ? 0 : rnd();
    if (roll < 0.3 && opts.noReview === true) roll = 0.5;
    if (roll < 0.3 && typeof Drills !== 'undefined') {
      var dueKeys = Drills.due('preflop', opts.now, 20);
      if (opts.exclude) dueKeys = dueKeys.filter(function(k) { return opts.exclude.indexOf(k) < 0; });
      for (var i = 0; i < dueKeys.length; i++) {
        var k = parseKey(dueKeys[i]);
        if (!k) continue;
        var en = _model(k);
        if (!en) continue;
        var cell = _findCell(en.model, k.hand);
        if (!cell || en.model.cells[cell.r][cell.c].action === 'none') continue;
        var q = _build(k, cell, en, rnd);
        q.review = true;
        return q;
      }
      roll = 0.5; // 복습 대기가 없으면 경계 셀로 대체
    }
    var sp = _pick(spots, rnd);
    var entry = _model(sp);
    if (roll < 0.8 && entry.boundary.length) return _build(sp, _pick(entry.boundary, rnd), entry, rnd);
    var t = rnd() * entry.weight, acc = 0, chosen = entry.playable[entry.playable.length - 1];
    for (var j = 0; j < entry.playable.length; j++) {
      acc += entry.playable[j].w;
      if (t < acc) { chosen = entry.playable[j]; break; }
    }
    return _build(sp, chosen, entry, rnd);
  }

  function actionLabel(q, a) {
    if (a === 'raise' && q.kind === 'vsRfi') return '레이즈(3벳)';
    if (a === 'raise' && q.kind === 'vs3bet') return '레이즈(4벳)';
    return KOR[a] || a;
  }

  function spotName(q) {
    if (q.kind === 'rfi') return q.pos + ' 오픈 레인지';
    if (q.kind === 'vsRfi') return q.pos + ' vs ' + (q.opener || '상대') + ' 오픈 참여 레인지';
    return q.pos + ' 오픈 후 3벳 직면 계속 레인지';
  }

  // 해설: 'CO 오픈 레인지 = 상위 약 N% | 같은 줄: A9s 레이즈 / A8s 폴드'
  function explain(q) {
    var entry = _model(parseSpot(q.spot || ((q.kind || 'rfi') + '|' + q.pos + (q.opener ? '@' + q.opener : ''))));
    if (!entry) return { line: '이 스팟은 아직 차트가 없어요', model: null };
    var m = entry.model;
    var cell = _findCell(m, q.hand) || { r: 0, c: 0 };
    var me = m.cells[cell.r][cell.c];
    var best = null, bestD = 99;
    for (var d = 1; d < 13 && !best; d++) {
      var cand = [[cell.r, cell.c - d], [cell.r, cell.c + d], [cell.r - d, cell.c], [cell.r + d, cell.c]];
      for (var i = 0; i < cand.length; i++) {
        var r = cand[i][0], c = cand[i][1];
        if (r < 0 || r > 12 || c < 0 || c > 12) continue;
        var a = m.cells[r][c].action;
        if (a !== 'none' && a !== me.action && d < bestD) { best = m.cells[r][c]; bestD = d; break; }
      }
    }
    var pct = Math.round(entry.pct * 100);
    var head = spotName(q) + (q.kind === 'rfi' ? ' = 상위 약 ' : ' = 약 ') + pct + '%';
    var line = head + ' | 같은 줄: ' + me.label + ' ' + actionLabel(q, me.action) +
      (best ? ' / ' + best.label + ' ' + actionLabel(q, best.action) : '');
    return { line: line, model: m, cell: cell };
  }

  function _clearCache() { _cache = {}; }

  var gen = { title: '🃏 프리플랍 레인지', next: next, explain: explain, actionLabel: actionLabel };
  if (typeof Drills !== 'undefined') Drills.register('preflop', gen);
  var api = { BASE_SPOTS: BASE_SPOTS, parseSpot: parseSpot, parseKey: parseKey, next: next, explain: explain,
    actionLabel: actionLabel, prompt: prompt, _clearCache: _clearCache };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
