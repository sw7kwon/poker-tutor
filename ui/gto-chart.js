// ui/gto-chart.js — P4-T7: GTO 레인지 차트 위젯 (13x13, GTO 모드 전용)
// 데이터 소스: Gto.GTO_RANGES(엔진 소비만, 수정 금지) + Range.inRange(카드 객체 {rank,suit} 2장)
var GtoChart = (function() {
  var RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];

  // 13x13 매트릭스 좌표(r,c) → 콤보 표기
  // r===c → 페어, r<c → 수티드(행 랭크가 더 높음), r>c → 오프수트(열 랭크가 더 높음)
  function comboLabel(r, c) {
    if (r === c) return RANKS[r] + RANKS[r];
    if (r < c) return RANKS[r] + RANKS[c] + 's';
    return RANKS[c] + RANKS[r] + 'o';
  }

  // 해당 콤보를 대표하는 카드 2장(Range.inRange 입력용 {rank,suit} 객체)
  function comboCards(r, c) {
    if (r === c) return [{ rank: RANKS[r], suit: 's' }, { rank: RANKS[r], suit: 'h' }];
    if (r < c) return [{ rank: RANKS[r], suit: 's' }, { rank: RANKS[c], suit: 's' }];
    // r>c: 오프수트 — 열(c)이 더 높은 랭크
    return [{ rank: RANKS[c], suit: 's' }, { rank: RANKS[r], suit: 'h' }];
  }

  // 히어로 카드 2장 → 매트릭스 좌표 {r,c}
  function handCell(heroCards) {
    var c1 = heroCards[0], c2 = heroCards[1];
    var i1 = RANKS.indexOf(c1.rank), i2 = RANKS.indexOf(c2.rank);
    if (i1 === i2) return { r: i1, c: i1 };
    var hi = Math.min(i1, i2), lo = Math.max(i1, i2); // hi=더 높은 랭크(작은 인덱스)
    var suited = c1.suit === c2.suit;
    return suited ? { r: hi, c: lo } : { r: lo, c: hi };
  }

  // pos/facing → 13x13 액션 모델
  // facing=false     : rfi[pos] (in→raise, out→fold, 미등록 포지션은 전부 none)
  // facing=true      : vsRfi[pos] (threebet in→raise, call in→call, 그외 fold)
  // facing='vs3bet'  : vs3bet[pos] (fourbet in→raise, call in→call) — 3차 패스에서 라이브 배선 완료
  // facing='vs4bet'  : vs4bet[pos] (fivebet in→raise(올인), call in→call) — 07-20 6차 패스
  // facing='cold3bet': vsCold3bet(포지션 무관, fourbet in→raise, call in→call, 그외 fold) — 8차 WP1
  // openerPos(선택): facing=true && pos='BB' && 오프너 CO/BTN/SB → vsRfiBB_LP(넓은 BB 방어표). 2인자 호출은 기존과 동일.
  function buildChartModel(pos, facing, openerPos) {
    var rfi = Gto.GTO_RANGES.rfi[pos];
    var lateOpener = openerPos === 'CO' || openerPos === 'BTN' || openerPos === 'SB';
    var vs = (facing === true && pos === 'BB' && lateOpener && Gto.GTO_RANGES.vsRfiBB_LP)
      ? Gto.GTO_RANGES.vsRfiBB_LP : Gto.GTO_RANGES.vsRfi[pos];
    var cold = Gto.GTO_RANGES.vsCold3bet;
    var coldRaiseStr = cold ? cold.fourbet.join(',') : '';
    var coldCallStr = cold ? cold.call.join(',') : '';
    var vs3 = Gto.GTO_RANGES.vs3bet[pos];
    var vs4 = Gto.GTO_RANGES.vs4bet[pos];
    var threebetStr = vs ? vs.threebet.join(',') : '';
    var callStr = vs ? vs.call.join(',') : '';
    var rfiStr = rfi ? rfi.join(',') : '';
    var fourbetStr = vs3 ? vs3.fourbet.join(',') : '';
    var vs3CallStr = vs3 ? vs3.call.join(',') : '';
    var fivebetStr = vs4 ? vs4.fivebet.join(',') : '';
    var vs4CallStr = vs4 ? vs4.call.join(',') : '';
    var cells = [];
    for (var r = 0; r < 13; r++) {
      var row = [];
      for (var c = 0; c < 13; c++) {
        var label = comboLabel(r, c);
        var cards = comboCards(r, c);
        var action;
        if (facing === 'cold3bet') {
          if (!cold) action = 'none';
          else if (Range.inRange(cards[0], cards[1], coldRaiseStr)) action = 'raise';
          else if (Range.inRange(cards[0], cards[1], coldCallStr)) action = 'call';
          else action = 'fold';
        } else if (facing === 'vs4bet') {
          if (!vs4) action = 'none';
          else if (Range.inRange(cards[0], cards[1], fivebetStr)) action = 'raise';
          else if (Range.inRange(cards[0], cards[1], vs4CallStr)) action = 'call';
          else action = 'fold';
        } else if (facing === 'vs3bet') {
          if (!vs3) action = 'none';
          else if (Range.inRange(cards[0], cards[1], fourbetStr)) action = 'raise';
          else if (Range.inRange(cards[0], cards[1], vs3CallStr)) action = 'call';
          else action = 'fold';
        } else if (!facing) {
          if (!rfi) action = 'none';
          else action = Range.inRange(cards[0], cards[1], rfiStr) ? 'raise' : 'fold';
        } else {
          if (!vs) action = 'none';
          else if (Range.inRange(cards[0], cards[1], threebetStr)) action = 'raise';
          else if (callStr && Range.inRange(cards[0], cards[1], callStr)) action = 'call';
          else action = 'fold';
        }
        row.push({ label: label, action: action });
      }
      cells.push(row);
    }
    return { pos: pos, facing: facing, opener: (facing === true && openerPos) ? openerPos : null, cells: cells };
  }

  // ── DOM 렌더 (GTO 모드 전용) ──
  var _cache = null; // 프리플랍 결정 시점의 { pos, facing, opener } — 포스트플랍엔 그대로 유지

  function _renderHTML(model, heroCards) {
    if (!model.facing && model.pos === 'BB') {
      return '<div class="gto-chart-empty">BB는 오픈 상황 없음</div>';
    }
    if (model.facing === 'vs4bet' && !Gto.GTO_RANGES.vs4bet[model.pos]) {
      return '<div class="gto-chart-empty">' + model.pos + '는 vs4벳 차트 데이터 없음</div>';
    }
    if (model.facing === 'vs3bet' && !Gto.GTO_RANGES.vs3bet[model.pos]) {
      return '<div class="gto-chart-empty">' + model.pos + '는 vs3벳 차트 데이터 없음</div>';
    }
    if (model.facing === true && !Gto.GTO_RANGES.vsRfi[model.pos]) {
      return '<div class="gto-chart-empty">' + model.pos + '는 vs오픈 차트 데이터 없음</div>';
    }
    var hc = handCell(heroCards);
    var gridHtml = model.cells.map(function(row, r) {
      return row.map(function(cell, c) {
        var hero = (r === hc.r && c === hc.c) ? ' hero-cell' : '';
        return '<div class="gto-cell gto-' + cell.action + hero + '">' + cell.label + '</div>';
      }).join('');
    }).join('');
    var facingLabel = model.facing === 'vs4bet' ? '(vs 4벳)' : model.facing === 'vs3bet' ? '(vs 3벳)'
      : model.facing === 'cold3bet' ? '(vs 콜드 3벳)'
      : model.facing ? (model.opener ? '(vs ' + model.opener + ' 오픈)' : '(vs 오픈)') : '(오픈)';
    var actionLabel = model.facing === 'vs4bet' ? '레이즈(5벳 올인)'
      : (model.facing === 'vs3bet' || model.facing === 'cold3bet') ? '레이즈(4벳)' : '레이즈(3벳)';
    return '<div class="gto-chart-grid">' + gridHtml + '</div>' +
      '<div class="gto-chart-legend">🟩 ' + actionLabel + ' · ⬜ 콜 · 🟥 폴드 — 프리플랍 기준 ' + facingLabel + '</div>';
  }

  function update(state, heroPos, gtoMode) {
    var el = document.getElementById('gto-chart');
    if (!el) return;
    if (!gtoMode || !state || !state.heroCards) { hide(); return; }

    if (state.street === 'preflop') {
      // facing 5값: false(오픈) | true(vs오픈) | 'vs3bet' | 'vs4bet' | 'cold3bet' — Gto.preflopHint와 판정 통일(8차 WP1)
      var h = Gto.preflopHint(state, heroPos);
      _cache = { pos: heroPos, facing: h.facing, opener: h.opener || null };
    }
    if (!_cache) _cache = { pos: heroPos, facing: false, opener: null };

    var model = buildChartModel(_cache.pos, _cache.facing, _cache.opener);
    el.innerHTML = _renderHTML(model, state.heroCards);
    el.style.display = 'flex';
  }

  function hide() {
    var el = document.getElementById('gto-chart');
    if (el) el.style.display = 'none';
    _cache = null;
  }

  if (typeof module !== 'undefined') {
    module.exports = { comboLabel, comboCards, buildChartModel, handCell, update, hide };
  }
  return { comboLabel, comboCards, buildChartModel, handCell, update, hide };
})();
