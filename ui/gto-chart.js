// ui/gto-chart.js, 큰 GTO 레인지 차트(13x13). 이 앱의 핵심 화면(설계 원문 docs/NEXT_BATCH_DESIGN.md 1절, '1+' 절 G4 CHART)
// 데이터 소스: Gto.GTO_RANGES(엔진 소비만, 수정 금지) + Range.inRange(카드 객체 {rank,suit} 2장)
// M4-P9: 림퍼 뒤는 아이솔 기준 표(buildIsoModel, 림퍼 2명 이상이면 한 칸 좁은 자리 표, BB는 vsLimpBB)를 그린다.
// R1(G4):
//   1. 모델 캐시 cachedModel(pos|facing|opener|limpers)와 격자 HTML 캐시. 같은 상황이면 DOM 쓰기 0, 상황이 바뀔 때만 innerHTML 1회.
//   2. 배치: 폰(mobile.css와 같은 미디어 조건)은 화면 폭 전체를 쓰는 하단 시트 #gto-sheet(이 모듈이 만든다, 액션바 위, 손잡이 탭이나
//      아래로 끌어 접기). 결정 뒤(reveal)에는 시트를 자동으로 접어 테이블과 코칭 판정이 보이게 하고 다음 프리플랍 결정에 다시 펼친다
//      (포스트플랍 결정은 차트가 참고라 접힌 채, 손잡이 줄에 스트리트를 적는다). 손으로 접은 시트는 손으로 펼칠 때까지 접힌 채다. 액션바와 결과바의 크기, 표시가 바뀌면(ResizeObserver, MutationObserver) 자리를 다시 잡는다.
//      데스크톱은 #gto-chart.big(왼쪽 아래 큰 패널, html.chart-big이 붙은 동안 테이블을 왼쪽 여백만큼 비켜 세운다).
//   3. 표시 조건: 📋 차트 칩(A11y showChart) 또는 GTO 미러 모드. 승급 시험(opts.boss)이면 숨김.
//   4. 가림: 코칭 뷰가 hide(L1 이상)면 차트 색은 보이고 내 손 표시(금테, 읽기 줄)만 가린다. 결정 뒤(shownForDecision 호출, reveal) 공개.
//   5. 읽기 줄 readout(model, heroCards, state, opts): "CO, BTN 오픈에 대응" + "내 손 K♠J♠ = KJs, 레이즈 칸 (3벳 범위 8% 안)".
//   6. 칸 형식 { label, action, w? }(w = { raise, call, fold } 합 1, GtoStd 표준 티어). 혼합 칸은 비율로 나눠 칠한다(--wr, --wc).
//   7. 칸 탭 말풍선(RangeNotes.explain, typeof 가드), 위치 비교 띠(누르면 그 자리 차트 미리보기), 포스트플랍 흐림 + 가이드 줄,
//      "학습실에서 크게 보기"(JourneyUI.view('rangeLab', { pos, facing, opener })).
//   8. update(state, heroPos, opts): 3번째 인자가 불리언이면 예전 의미(gtoMode), 객체면 { gtoMode, view, boss, el(테스트) }.
//      refresh()(칩 토글 뒤 다시 그림), shownForDecision()(이 결정에 차트가 보였나, 호출 = 결정 시점이라 내 손 공개), reveal().
// n2-G3(설계 docs/NEXT2_DESIGN.md 1절, 차트에서 내 손 찾기): 내 칸이 보일 때 격자에 has-hero와 --hr, --hc(css가 금색 줄과 칸 안내선을 그린다),
//   regionOf(model, r, c)(내 손이 속한 같은 주 액션 연속 영역, 4방향 flood fill, 폴드와 자료 없음은 null)의 경계 칸에 rg, rg-t/r/b/l(영역 밖과
//   맞닿은 변만, css가 흰 윤곽), 범례 1줄. 가림(L1 이상 결정 전)에는 금테와 함께 셋 다 없고 결정 뒤 reveal에서 같이 나온다. 격자 HTML 캐시는 그대로.
// n3-B(레이즈 차트, 콜 차트 따로 보기): 격자 위 보기 칩(전체, 3벳만, 콜만 등 상황 단어, viewChipsHTML). 칩은 격자와 범례의 gv-raise, gv-call 클래스만
//   바꾸고(격자 HTML 그대로) 해당하지 않는 칸은 css가 흐린다. 보기는 A11y chartView에 저장하고 차트 시트, 데스크톱 패널, 학습실, 완전 분석이 같이 쓴다.
//   콜이 없는 상황(오픈, SB 대응, BB가 아닌 자리의 림퍼 뒤)은 '콜만'이 aria-disabled(누르면 이유 말풍선), 저장값이 콜이어도 그 상황만 전체로 보인다.
//   히어로 좌석에 묶이지 않는 입구: normSituation, situationModel, chartHTML(순수), seatView(sit | null)(같은 시트에 다른 자리 입장 차트, 상대 차례용.
//   히어로가 아직 결정하지 않은 손에도 그리고, 스트리트는 sit.street(기본 프리플랍), 읽기 줄 아래에 그 자리 말투 상황 줄).
// n3-C(상대 차례에 그 사람 입장 차트, ui/opp-chart.js OppChart가 부른다): seatView(sit)의 sit.opp = { head, post, res, hl, hand, note, legend, short, key }면
//   하늘색 머리줄(👀, gto-opp-head)과 결과 줄, 그 액션 칸 윤곽(actionEdges, 영역 윤곽 .rg와 같은 css), 완전 분석 실제 손 칸(.opp-cell 하늘색 테두리)을 그린다.
//   sit.persp = 관점 칩 줄 HTML(👤 내 차트, 방금: CO), 호스트 맨 위 .gto-persp에 넣는다(격자 HTML 캐시와 따로, setPersp는 그 상자만 고친다). sit.open = 자동으로 접힌 시트를 편다.
//   on(fn) 알림(fn(kind, data): 'hero' 히어로 결정 update 직전, 'hide', 'refresh', 'chip' 관점 칩 누름), visible() 지금 사용자가 차트를 보고 있나,
//   wanted() 차트를 볼 설정인가, hasHero() 이번 손 히어로 차트가 있나. 상대 차트 HTML은 전체 문자열 캐시(같은 상황 다시 오면 문자열 조립 없음).
// 규약: 로드 시 DOM 접근 없음(window.addEventListener만). 문구는 해요체, 가운뎃점과 긴줄표 없음.
var GtoChart = (function() {
  var RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
  var POS6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var MQ = '(max-width: 600px), (orientation: portrait) and (max-width: 760px)';   // css/mobile.css, ui/mobile-ui.js와 같은 문자열
  var TOAST_KEY = 'poker_chart_toast_seen';
  var ACT_KOR = { raise: '레이즈', call: '콜', fold: '폴드', none: '자료 없음' };
  var SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };

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
    // r>c: 오프수트, 열(c)이 더 높은 랭크
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

  // 칸 콤보 수: 페어 6, 수딧 4, 오프수트 12(합 1326)
  function cellWeight(r, c) { return r === c ? 6 : (r < c ? 4 : 12); }

  // pos/facing → 13x13 액션 모델
  // facing=false     : rfi[pos] (in→raise, out→fold, 미등록 포지션은 전부 none)
  // facing=true      : vsRfi[pos] (threebet in→raise, call in→call, 그외 fold)
  // facing='vs3bet'  : vs3bet[pos] (fourbet in→raise, call in→call), 3차 패스에서 라이브 배선 완료
  // facing='vs4bet'  : vs4bet[pos] (fivebet in→raise(올인), call in→call), 07-20 6차 패스
  // facing='cold3bet': vsCold3bet(포지션 무관, fourbet in→raise, call in→call, 그외 fold), 8차 WP1
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

  // 림퍼 뒤 아이솔 모델(M4-P9): Gto.preflopHint의 vs-limp 판정과 칸마다 같은 표.
  //   BB 말고: 림퍼 1명 = 내 자리 RFI 표, 2명 이상 = 한 칸 좁은 자리(Gto.isoPos) RFI 표. 표 안 raise(아이솔), 밖 fold.
  //   BB: vsLimpBB만 raise, 나머지는 체크(콜 칸 색 'call'을 빌려 쓰고 범례에 체크로 적는다. CO 오픈 표 손은 레이즈도 괜찮다).
  // 예전에는 림퍼가 있어도 내 자리 RFI 표(BB는 '오픈 상황 없음')를 그려 림퍼 2명 이상 판정과 어긋났다.
  // BB의 체크 칸 중 CO 오픈 표 안의 손(엔진 Gto.vsLimpAlt가 'raise')은 레이즈도 정답이라 cell.alt = 'raise'로 표시한다(격자 ◢ 표시, 읽기 줄, 범례).
  function buildIsoModel(pos, limpers) {
    var n = Math.max(1, limpers || 1);
    var G = Gto.GTO_RANGES;
    var isoAt = typeof Gto.isoPos === 'function' ? Gto.isoPos(pos, n) : (pos === 'BB' ? null : pos);
    var arr = pos === 'BB' ? G.vsLimpBB : (isoAt && G.rfi[isoAt]) || null;
    var str = arr ? arr.join(',') : '';
    var altStr = (pos === 'BB' && G.rfi && G.rfi.CO) ? G.rfi.CO.join(',') : '';
    var cells = [];
    for (var r = 0; r < 13; r++) {
      var row = [];
      for (var c = 0; c < 13; c++) {
        var cards = comboCards(r, c), action;
        if (!arr) action = 'none';
        else if (Range.inRange(cards[0], cards[1], str)) action = 'raise';
        else action = pos === 'BB' ? 'call' : 'fold';
        var cell = { label: comboLabel(r, c), action: action };
        if (action === 'call' && pos === 'BB') {
          var alt = (typeof Gto.vsLimpAlt === 'function') ? (Gto.vsLimpAlt(pos, cards) === 'raise') : (!!altStr && Range.inRange(cards[0], cards[1], altStr));
          if (alt) cell.alt = 'raise';
        }
        row.push(cell);
      }
      cells.push(row);
    }
    return { pos: pos, facing: false, opener: null, limpers: n, isoPos: isoAt, cells: cells };
  }

  // ── 모델 캐시(R1): 같은 상황은 같은 객체. 첫 생성만 Range.inRange 169칸, 다음부터는 조회만 ──
  var _models = {};
  function modelKey(pos, facing, opener, limpers) {
    return pos + '|' + String(facing) + '|' + ((facing === true && opener) ? opener : '') + '|' + (limpers || 0);
  }
  function cachedModel(pos, facing, opener, limpers) {
    var k = modelKey(pos, facing, opener, limpers);
    var m = _models[k];
    if (m) return m;
    m = limpers ? buildIsoModel(pos, limpers) : buildChartModel(pos, facing, opener);
    m.key = k;
    _models[k] = m;
    return m;
  }
  // ── 임의 자리와 상황(n3-B, 히어로 좌석에 묶이지 않는 입구. 상대 차례 차트(C)와 완전 분석이 같이 쓴다) ──
  // sit = { pos, facing(false | true | 'vs3bet' | 'vs4bet' | 'cold3bet'), opener?, limpers? } → 정규화한 상황 또는 null(자리 모름).
  //   opener는 facing true일 때만, limpers는 facing false일 때만 남긴다(cachedModel 키 규칙과 같다)
  function normSituation(sit) {
    if (!sit || typeof sit !== 'object' || POS6.indexOf(sit.pos) < 0) return null;
    var f = sit.facing;
    if (f !== true && f !== 'vs3bet' && f !== 'vs4bet' && f !== 'cold3bet') f = false;
    var op = (f === true && POS6.indexOf(sit.opener) >= 0) ? sit.opener : null;
    var lim = f === false ? Math.max(0, Math.round(Number(sit.limpers) || 0)) : 0;
    return { pos: sit.pos, facing: f, opener: op, limpers: lim };
  }
  function situationModel(sit) {
    var s = normSituation(sit);
    return s ? cachedModel(s.pos, s.facing, s.opener, s.limpers) : null;
  }

  // 모델 셈(캐시): 액션별 콤보 수와 비율. w가 있는 칸은 비율만큼 나눠 센다
  function tally(model) {
    if (model._tally) return model._tally;
    var t = { raise: 0, call: 0, fold: 0, none: 0, total: 1326, mixed: 0 };
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) {
      var cell = model.cells[r][c], wt = cellWeight(r, c);
      if (cell.w && typeof cell.w === 'object') {
        var sum = 0, parts = 0;
        ['raise', 'call', 'fold'].forEach(function(k) { var v = Number(cell.w[k]) || 0; if (v > 0) { t[k] += wt * v; sum += v; parts++; } });
        if (parts > 1) t.mixed++;
        if (sum < 0.999) t.fold += wt * (1 - sum);
      } else t[cell.action] = (t[cell.action] || 0) + wt;
    }
    t.pct = function(k) { return Math.round(t[k] / t.total * 100); };
    model._tally = t;
    return t;
  }

  // 혼합 칸 여부와 분할 지점(누적 %): raise → call → fold 순으로 칠한다
  function mixOf(cell) {
    var w = cell && cell.w;
    if (!w || typeof w !== 'object') return null;
    var r = Math.max(0, Number(w.raise) || 0), c = Math.max(0, Number(w.call) || 0), f = Math.max(0, Number(w.fold) || 0);
    var n = (r > 0 ? 1 : 0) + (c > 0 ? 1 : 0) + (f > 0 ? 1 : 0);
    if (n < 2) return null;
    var sum = r + c + f || 1;
    return { raise: r / sum, call: c / sum, fold: f / sum, wr: Math.round(r / sum * 100), wc: Math.round((r + c) / sum * 100) };
  }
  // 혼합 칸 글자(색약 모드 R50 C50)
  function mixText(mx) {
    var out = [];
    if (mx.raise > 0) out.push('R' + Math.round(mx.raise * 100));
    if (mx.call > 0) out.push('C' + Math.round(mx.call * 100));
    if (mx.fold > 0 && out.length < 2) out.push('F' + Math.round(mx.fold * 100));
    return out.join(' ');
  }

  // (웨이브2 후속) 폰 색약 모드 혼합 칸 글자: 가장 큰 비율 하나만(같으면 레이즈, 콜, 폴드 순). 예 R50. 글자는 9px 이상(css/chart.css)
  function mixTop(mx) {
    var best = 'R', v = mx.raise;
    if (mx.call > v + 1e-9) { best = 'C'; v = mx.call; }
    if (mx.fold > v + 1e-9) { best = 'F'; v = mx.fold; }
    return best + Math.round(v * 100);
  }

  // ── 내 손이 속한 범위 영역(n2-G3, 순수) ──
  // 칸의 주 액션: 혼합 칸(w)은 가장 큰 비율(mixTop)의 액션, 그 밖은 cell.action
  var MIX_ACT = { R: 'raise', C: 'call', F: 'fold' };
  function primaryAction(cell) {
    if (!cell) return 'none';
    var mx = mixOf(cell);
    if (mx) return MIX_ACT[mixTop(mx).charAt(0)] || cell.action || 'none';
    return cell.action || 'none';
  }
  // regionOf(model, r, c) → { action, cells: ['r,c', ...], edges: { 'r,c': 'trbl 중 조합' }, size } 또는 null.
  //   (r,c) 칸과 같은 주 액션으로 4방향 이어진 연속 영역. 주 액션이 fold나 none이면 null(폴드 영역은 너무 커서 윤곽이 소음이 된다).
  //   edges는 영역 밖(격자 밖 포함)과 맞닿은 변이 있는 칸만, 변 글자는 t, r, b, l 순. 캐시: 모델 키가 있으면 _regions[key|r,c], 없으면 모델 객체에.
  //   한 영역은 객체 하나로 그 영역의 모든 칸에 같이 캐시한다(같은 영역의 다른 손은 조회만, 모델당 객체 수 = 영역 수라 메모리가 손 수에 비례해 늘지 않는다).
  //   169칸 flood fill은 0.1ms 안(테스트가 0.3ms 상한으로 고정). 학습실(range-lab) 등 다른 화면에서도 쓸 수 있는 공개 API
  var _regions = {};
  function regionOf(model, r, c) {
    if (!model || !model.cells || !model.cells[r] || !model.cells[r][c]) return null;
    var ck = r + ',' + c, store = null;
    if (model.key) store = _regions;
    else store = (model._regions = model._regions || {});
    var k = model.key ? (model.key + '|' + ck) : ck;
    if (Object.prototype.hasOwnProperty.call(store, k)) return store[k];
    var act = primaryAction(model.cells[r][c]);
    var out = null;
    if (act === 'raise' || act === 'call') {
      var seen = {}, stack = [[r, c]], cells = [], edges = {};
      seen[ck] = true;
      while (stack.length) {
        var cur = stack.pop(), cr = cur[0], cc = cur[1];
        cells.push(cr + ',' + cc);
        var e = '';
        // t, r, b, l 순서(css 변 변수와 같다)
        var nb = [[cr - 1, cc, 't'], [cr, cc + 1, 'r'], [cr + 1, cc, 'b'], [cr, cc - 1, 'l']];
        for (var i = 0; i < 4; i++) {
          var nr = nb[i][0], nc = nb[i][1];
          var inside = nr >= 0 && nr < 13 && nc >= 0 && nc < 13 && primaryAction(model.cells[nr][nc]) === act;
          if (!inside) { e += nb[i][2]; continue; }
          var nk = nr + ',' + nc;
          if (!seen[nk]) { seen[nk] = true; stack.push([nr, nc]); }
        }
        if (e) edges[cr + ',' + cc] = e;
      }
      cells.sort();
      out = { action: act, cells: cells, edges: edges, size: cells.length };
      for (var j = 0; j < cells.length; j++) store[model.key ? (model.key + '|' + cells[j]) : cells[j]] = out;
    } else store[k] = out;
    return out;
  }

  // ── 문구(순수) ──
  function facingLabel(model) {
    return model.facing === 'vs4bet' ? '(vs 4벳)' : model.facing === 'vs3bet' ? '(vs 3벳)'
      : model.facing === 'cold3bet' ? '(vs 콜드 3벳)'
      : model.facing ? (model.opener ? '(vs ' + model.opener + ' 오픈)' : '(vs 오픈)') : '(오픈)';
  }
  function raiseWord(model) {
    if (model.limpers) return '레이즈(아이솔)';
    return model.facing === 'vs4bet' ? '레이즈(5벳 올인)'
      : (model.facing === 'vs3bet' || model.facing === 'cold3bet') ? '레이즈(4벳)'
      : model.facing ? '레이즈(3벳)' : '레이즈(오픈)';
  }
  function callWord(model) {
    return (model.limpers && model.pos === 'BB') ? '체크' : '콜';
  }
  // 상황 한 줄(읽기 줄 1번째): "CO, BTN 오픈에 대응"
  function contextText(model) {
    var pos = model.pos;
    if (model.limpers) {
      var at = model.isoPos || model.pos;
      return pos + ', 림퍼 ' + model.limpers + '명 뒤' + (pos === 'BB' ? '' : (at === pos ? ' (내 자리 오픈 표 기준)' : ' (한 칸 좁은 ' + at + ' 오픈 표 기준)'));
    }
    if (model.facing === 'vs4bet') return pos + ', 내 3벳에 4벳 맞음';
    if (model.facing === 'vs3bet') return pos + ', 내 오픈에 3벳 맞음';
    if (model.facing === 'cold3bet') return pos + ', 콜드 3벳에 대응';
    if (model.facing === true) return pos + ', ' + (model.opener ? model.opener + ' 오픈에 대응' : '상대 오픈에 대응');
    return pos + ', 먼저 오픈할 차례';
  }
  // (n3b-review) 다른 자리 입장 차트의 상황 한 줄: contextText의 '내 오픈', '내 3벳'은 히어로 말투라 그 자리 말투로 바꾼다
  function seatContextText(model) {
    var pos = model.pos;
    if (model.limpers) return pos + ', 림퍼 ' + model.limpers + '명 뒤';
    if (model.facing === 'vs4bet') return pos + ', 3벳했다가 4벳 맞음';
    if (model.facing === 'vs3bet') return pos + ', 오픈했다가 3벳 맞음';
    return contextText(model);
  }
  function _isoLegend(model) {
    var n = model.limpers;
    if (model.pos === 'BB') {
      return '림퍼 ' + n + '명 뒤 BB 기준. 체크 칸의 ◢ 표시는 CO 오픈 표 손이라 레이즈(아이솔)해도 괜찮아요';
    }
    var at = model.isoPos || model.pos;
    return '레이즈(아이솔), 폴드, 림퍼 ' + n + '명이라 ' +
      (at === model.pos ? '내 자리(' + at + ')' : '한 칸 좁은 ' + at) + ' 오픈 표 기준';
  }
  function cardText(card) {
    if (!card) return '';
    var r = card.rank === 'T' ? '10' : card.rank;
    return r + (SUIT_SYM[card.suit] || '');
  }
  function cardHTML(card) {
    if (typeof Cards !== 'undefined' && Cards && typeof Cards.glyph === 'function') {
      try { var g = Cards.glyph(card); if (g) return g; } catch (e) {}
    }
    return '<span class="suit" data-suit="' + _esc(card.suit) + '">' + _esc(cardText(card)) + '</span>';
  }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 읽기 줄(순수): model = 지금 그리는 모델, opts { hidden, viewPos(미리보기 자리), heroPos }
  //   → { ctx, hand, action, label, cell, hidden, preview }
  //   hand(글자) 예: '내 손 K♠J♠ = KJs, 레이즈 칸 (3벳 범위 8% 안)', 혼합 칸 '레이즈 50% / 콜 50% 칸', 가림이면 '결정 뒤 내 손 위치를 표시해요'
  function readout(model, heroCards, state, opts) {
    opts = opts || {};
    var out = { ctx: contextText(model), hand: '', handHTML: '', action: null, label: null, cell: null, hidden: !!opts.hidden, preview: !!opts.viewPos };
    if (opts.viewPos) out.ctx = '👀 ' + opts.viewPos + ' 차트 미리보기 (내 자리는 ' + (opts.heroPos || model.pos) + ')';
    if (!heroCards || heroCards.length < 2) return out;
    var hc = handCell(heroCards);
    var cell = model.cells[hc.r] && model.cells[hc.r][hc.c];
    if (!cell) return out;
    out.cell = hc; out.label = cell.label; out.action = cell.action;
    var cardsTxt = cardText(heroCards[0]) + cardText(heroCards[1]);
    var cardsHTML = cardHTML(heroCards[0]) + cardHTML(heroCards[1]);
    if (opts.hidden) {
      // 내 카드는 답이 아니라 내 정보라 보이고, 차트 위치(칸, 액션)만 결정 뒤에 표시한다
      out.hand = '내 손 ' + cardsTxt + ', 🔒 차트 위치는 결정 뒤 표시해요';
      out.handHTML = '내 손 ' + cardsHTML + ', 🔒 차트 위치는 결정 뒤 표시해요';
      return out;
    }
    var t = tally(model), mx = mixOf(cell);
    var whereIs = opts.viewPos ? (opts.viewPos + '이라면 ') : '';
    var actText;
    if (mx) {
      var parts = [];
      if (mx.raise > 0) parts.push('레이즈 ' + Math.round(mx.raise * 100) + '%');
      if (mx.call > 0) parts.push(callWord(model) + ' ' + Math.round(mx.call * 100) + '%');
      if (mx.fold > 0) parts.push('폴드 ' + Math.round(mx.fold * 100) + '%');
      actText = parts.join(' / ') + ' 칸';
    } else if (cell.action === 'raise') actText = '레이즈 칸 (' + raiseWord(model).replace('레이즈', '').replace(/[()]/g, '') + ' 범위 ' + t.pct('raise') + '% 안)';
    else if (cell.action === 'call') actText = (model.limpers && model.pos === 'BB') ? '체크 칸 (아이솔 범위 밖' + (cell.alt ? ', 레이즈도 괜찮아요' : '') + ')' : callWord(model) + ' 칸 (' + callWord(model) + ' 범위 ' + t.pct('call') + '% 안)';
    else if (cell.action === 'fold') actText = '폴드 칸 (범위 밖)';
    else actText = '자료 없음';
    out.hand = '내 손 ' + cardsTxt + ' = ' + cell.label + ', ' + whereIs + actText;
    out.handHTML = '내 손 ' + cardsHTML + ' = <b>' + _esc(cell.label) + '</b>, ' + _esc(whereIs + actText);
    return out;
  }

  // ── HTML 조각 ──
  var _gridHtml = {};
  function gridHTML(model) {
    var k = model.key || null;
    if (k && _gridHtml[k]) return _gridHtml[k];
    var parts = [];
    for (var r = 0; r < 13; r++) {
      for (var c = 0; c < 13; c++) {
        var cell = model.cells[r][c], mx = mixOf(cell);
        var cls = 'gto-cell gto-' + cell.action + (mx ? ' gto-mix' : '') + (cell.alt ? ' gto-alt' : '');
        // (n3-B) data-pr, data-pc: 레이즈만, 콜만 보기에서 칸 안에 그 액션 비율을 적는다(css ::after)
        var extra = mx ? ' style="--wr:' + mx.wr + '%;--wc:' + mx.wc + '%" data-cb="' + mixText(mx) + '" data-cb1="' + mixTop(mx) + '" data-pr="' + Math.round(mx.raise * 100) + '" data-pc="' + Math.round(mx.call * 100) + '"' : '';
        parts.push('<div class="' + cls + '" data-r="' + r + '" data-c="' + c + '"' + extra + '>' + cell.label + '</div>');
      }
    }
    var html = parts.join('');
    if (k) _gridHtml[k] = html;
    return html;
  }
  function swatch(action) { return '<span class="gto-sw gto-' + action + '" aria-hidden="true"></span>'; }
  function legendHTML(model) {
    var t = tally(model);
    // (n3-B) 항목마다 data-lga(액션): 레이즈만, 콜만 보기에서 css가 그 액션 항목(과 혼합 칸 안내)만 남긴다
    function lg(a, html) { return '<span class="gto-lg-item" data-lga="' + a + '">' + html + '</span>'; }
    if (model.limpers) {
      var iso = _isoLegend(model);
      // BB: 체크 항목 안에 ◢ 견본(레이즈도 괜찮은 체크 칸)을 같이 둔다(항목은 2개 유지)
      return lg('raise', swatch('raise') + '레이즈(아이솔) ' + t.pct('raise') + '% (' + Math.round(t.raise) + '콤보)') +
        (model.pos === 'BB' ? lg('call', swatch('call') + '체크 ' + t.pct('call') + '% <span class="gto-sw gto-call gto-alt" aria-hidden="true"></span>레이즈도 괜찮음') : lg('fold', swatch('fold') + '폴드 ' + t.pct('fold') + '%')) +
        '<span class="gto-lg-note">' + _esc(iso) + '</span>';
    }
    var out = lg('raise', swatch('raise') + raiseWord(model) + ' ' + t.pct('raise') + '% (' + Math.round(t.raise) + '콤보)');
    if (t.call > 0) out += lg('call', swatch('call') + callWord(model) + ' ' + t.pct('call') + '% (' + Math.round(t.call) + '콤보)');
    out += lg('fold', swatch('fold') + '폴드 ' + t.pct('fold') + '%');
    if (t.mixed) out += lg('mix', '<span class="gto-sw gto-mix" style="--wr:50%;--wc:100%" aria-hidden="true"></span>혼합 칸은 비율로 나눠 칠해요');
    return out + '<span class="gto-lg-note">프리플랍 기준 ' + facingLabel(model) + '</span>';
  }
  // ── 보기 칩(n3-B): 전체, 레이즈만, 콜만. 저장은 A11y chartView('all' | 'raise' | 'call') ──
  // 칩 줄 .gv-bar는 격자(data-gvt) 바로 위, 통계 줄 .gv-stat은 격자 바로 아래에 있고, 칩을 누르면 같은 상자 안의 data-gvt 요소(격자, 범례) 클래스(gv-all, gv-raise, gv-call)와
  // 칩 aria-pressed, 통계 줄 글만 바꾼다(격자 HTML은 다시 만들지 않는다). 통계 글은 보기마다 미리 data-st-*에 넣어 두어 모델 없이 DOM만으로 바꾼다.
  // 해당하지 않는 칸은 css가 흐린다(혼합 칸은 그 액션 비율이 0보다 크면 해당 칸, data-cb의 R, C 글자로 가린다). 내 칸(금테)과 영역 윤곽은 늘 또렷하다.
  var VIEWS = ['all', 'raise', 'call'];
  var NO_CALL = {
    rfi: '오픈 상황엔 콜(림프) 칸이 없어요. 이 앱 차트는 레이즈 아니면 폴드예요',
    sb: 'SB는 3벳 아니면 폴드로 단순하게 가요(이 앱 차트 기준)',
    iso: '림퍼 뒤에는 아이솔 레이즈 아니면 폴드예요(이 앱 차트 기준)',
    other: '이 상황엔 콜 칸이 없어요(이 앱 차트 기준)'
  };
  function _isStd(model) { return /^std\|/.test(String((model && model.key) || '')); }
  // 칩과 통계 줄의 액션 낱말(상황 단어): 오픈, 3벳, 4벳, 5벳(올인), 레이즈(림퍼 뒤) / 콜, 체크(림퍼 뒤 BB)
  function viewWord(model, v) {
    if (v === 'call') return callWord(model);
    if (model.limpers) return '레이즈';
    return model.facing === 'vs4bet' ? '5벳(올인)' : (model.facing === 'vs3bet' || model.facing === 'cold3bet') ? '4벳'
      : model.facing ? '3벳' : '오픈';
  }
  // 보기별 칸 수(비율이 0보다 큰 칸, 혼합 칸 수)와 콤보 수(tally, 혼합 칸은 비율만큼). 모델 객체에 캐시
  function viewCount(model) {
    if (model._vcount) return model._vcount;
    var t = tally(model), out = { raise: { n: 0, mixed: 0, combos: Math.round(t.raise), pct: t.pct('raise') }, call: { n: 0, mixed: 0, combos: Math.round(t.call), pct: t.pct('call') } };
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) {
      var cell = model.cells[r][c], mx = mixOf(cell);
      if (mx) {
        if (mx.raise > 0) { out.raise.n++; out.raise.mixed++; }
        if (mx.call > 0) { out.call.n++; out.call.mixed++; }
      } else if (cell.action === 'raise' || cell.action === 'call') out[cell.action].n++;
    }
    model._vcount = out;
    return out;
  }
  // 콜이 없는 상황의 이유(말풍선). 콜이 있으면 null
  function noCallWhy(model) {
    if (viewCount(model).call.n > 0) return null;
    if (model.limpers) return NO_CALL.iso;
    if (!model.facing) return NO_CALL.rfi;
    if (model.facing === true && model.pos === 'SB') return NO_CALL.sb;
    return NO_CALL.other;
  }
  // 칩 3개: [{ v, label, disabled, why }]. 자료 없는 모델은 빈 배열
  function viewChips(model) {
    if (!model || !model.cells) return [];
    var t = tally(model);
    if (t.none >= t.total) return [];
    var why = noCallWhy(model);
    return [
      { v: 'all', label: '전체', disabled: false, why: null },
      { v: 'raise', label: viewWord(model, 'raise') + '만', disabled: viewCount(model).raise.n === 0, why: viewCount(model).raise.n ? null : '이 상황엔 레이즈 칸이 없어요(이 앱 차트 기준)' },
      { v: 'call', label: viewWord(model, 'call') + '만', disabled: !!why, why: why }
    ];
  }
  function _savedView() {
    var v = _settings().chartView;
    return VIEWS.indexOf(v) >= 0 ? v : 'all';
  }
  // 지금 보일 보기: 저장값이 그 상황에 없는 액션(콜 없는 상황의 '콜만')이면 그 상황만 '전체'(저장값은 그대로)
  function effView(model, saved) {
    var v = VIEWS.indexOf(saved) >= 0 ? saved : 'all';
    if (v === 'all') return v;
    var ch = viewChips(model);
    for (var i = 0; i < ch.length; i++) if (ch[i].v === v) return ch[i].disabled ? 'all' : v;
    return 'all';
  }
  // 통계 줄(순수): 전체 보기는 빈 문자열(범례가 다 적는다). 예 '콜 칸 14종, 콤보 52개(전체의 4%), 이 앱 차트 기준'
  function viewStat(model, v) {
    if (v !== 'raise' && v !== 'call') return '';
    var k = viewCount(model)[v];
    if (!k || !k.n) return '';
    var tag = _isStd(model) ? '표준 차트 기준(참고)' : '이 앱 차트 기준';
    return viewWord(model, v) + ' 칸 ' + k.n + '종' + (k.mixed ? '(혼합 ' + k.mixed + '종 포함)' : '') + ', 콤보 ' + (k.mixed ? '약 ' : '') + k.combos + '개(전체의 ' + k.pct + '%), ' + tag;
  }
  // 칩 줄 HTML(순수). v = 지금 보일 보기(effView 결과)
  function viewChipsHTML(model, v) {
    var ch = viewChips(model);
    if (!ch.length) return '';
    var sw = { all: '', raise: swatch('raise'), call: swatch('call') };
    var st = ' data-st-raise="' + _esc(viewStat(model, 'raise')) + '" data-st-call="' + _esc(viewStat(model, 'call')) + '"';
    var btns = ch.map(function(c) {
      return '<button type="button" class="gv-chip" data-gv="' + c.v + '" aria-pressed="' + (c.v === v ? 'true' : 'false') + '"' +
        (c.disabled ? ' aria-disabled="true" data-why="' + _esc(c.why) + '"' : '') + '>' + sw[c.v] + _esc(c.label) + '</button>';
    }).join('');
    return '<div class="gv-bar"' + st + (ch[2].disabled ? ' data-nocall="1"' : '') + '><div class="gv-chips" role="group" aria-label="차트 보기, 액션별로 따로 보기">' + btns + '</div></div>';
  }
  // 통계 줄 HTML(순수): 격자 바로 아래(칩을 눌러도 격자가 위아래로 움직이지 않게). 칩 줄과 같은 상자 안에 둔다. 칩이 없는 모델은 ''
  function viewStatHTML(model, v) {
    if (!viewChips(model).length) return '';
    return '<div class="gv-stat" aria-live="polite">' + _esc(viewStat(model, v)) + '</div>';
  }
  // 칩 줄 하나에 보기를 반영(DOM, 클래스와 글만). 같은 상자(칩 줄의 부모) 안 data-gvt 요소의 gv-* 클래스를 바꾼다
  function _applyBar(bar, saved) {
    if (!bar || !bar.getAttribute) return;
    var v = VIEWS.indexOf(saved) >= 0 ? saved : 'all';
    if (v === 'call' && bar.getAttribute('data-nocall') === '1') v = 'all';
    var chips = bar.querySelectorAll ? bar.querySelectorAll('.gv-chip') : [];
    for (var i = 0; i < chips.length; i++) {
      if (chips[i].getAttribute('data-gv') === v && chips[i].getAttribute('aria-disabled') === 'true') v = 'all';
    }
    for (var j = 0; j < chips.length; j++) chips[j].setAttribute('aria-pressed', chips[j].getAttribute('data-gv') === v ? 'true' : 'false');
    var box = bar.parentNode, tg = (box && box.querySelectorAll) ? box.querySelectorAll('[data-gvt]') : [];
    var stat = (box && box.querySelector) ? box.querySelector('.gv-stat') : null;
    if (stat) stat.textContent = v === 'all' ? '' : (bar.getAttribute('data-st-' + v) || '');
    for (var k = 0; k < tg.length; k++) {
      var cl = tg[k].classList;
      if (!cl) continue;
      if (!cl.contains('gv-' + v)) { cl.remove('gv-all'); cl.remove('gv-raise'); cl.remove('gv-call'); cl.add('gv-' + v); }
    }
  }
  // 문서(또는 root) 안의 모든 칩 줄에 저장된 보기를 반영
  function syncViews(root, saved) {
    var d = _doc(), r = root || d;
    if (!r || !r.querySelectorAll) return 0;
    var sv = saved || _savedView(), bars = r.querySelectorAll('.gv-bar');
    for (var i = 0; i < bars.length; i++) _applyBar(bars[i], sv);
    return bars.length;
  }
  var _tipTimer = null;
  function _closeTip(bar) {
    if (_tipTimer) { try { clearTimeout(_tipTimer); } catch (e) {} _tipTimer = null; }
    var d = _doc(), old = (bar && bar.querySelector) ? bar.querySelector('.gv-tip') : ((d && d.querySelector) ? d.querySelector('.gv-tip') : null);
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }
  // 칩 누름 처리(차트 시트, 데스크톱 패널, 학습실, 완전 분석이 같이 쓴다). 칩이 아니면 false
  //   비활성 칩: 말풍선으로 이유(3.5초 또는 다시 누르면 닫힘), 보기는 그대로. 그 밖: A11y.save({ chartView }) 뒤 문서의 칩 줄 전부에 반영
  function onViewChip(btn) {
    if (!btn || !btn.getAttribute || !btn.getAttribute('data-gv')) return false;
    var bar = btn.closest ? btn.closest('.gv-bar') : btn.parentNode && btn.parentNode.parentNode;
    if (btn.getAttribute('aria-disabled') === 'true') {
      var had = bar && bar.querySelector && bar.querySelector('.gv-tip');
      _closeTip(bar);
      if (had) return true;
      var d = _doc();
      if (!d || !d.createElement || !bar) return true;
      var tip = d.createElement('div');
      tip.className = 'gv-tip';
      tip.setAttribute('role', 'status');
      tip.textContent = btn.getAttribute('data-why') || NO_CALL.other;
      bar.appendChild(tip);
      if (typeof setTimeout === 'function') _tipTimer = setTimeout(function() { _closeTip(bar); }, 3500);
      return true;
    }
    _closeTip(bar);
    var v = btn.getAttribute('data-gv');
    if (VIEWS.indexOf(v) < 0) return true;
    try { if (typeof A11y !== 'undefined' && A11y && typeof A11y.save === 'function') A11y.save({ chartView: v }); } catch (e) {}
    if (!syncViews(null, v) && bar) _applyBar(bar, v);
    return true;
  }

  // 자리별 범위 크기(같은 상황). 쓸 수 없는 자리(앞자리, 자료 없음)는 na
  function stripData(model, heroPos) {
    var out = [];
    var oi = model.facing === true && model.opener ? POS6.indexOf(model.opener) : -1;
    POS6.forEach(function(p, i) {
      var na = false, m = null;
      if (model.limpers) { if (p === 'UTG') na = true; else m = cachedModel(p, false, null, model.limpers); }
      else {
        if (model.facing === true && oi >= 0 && i <= oi) na = true;
        if (!na) m = cachedModel(p, model.facing, model.opener, 0);
      }
      var pct = 0;
      if (m) {
        var t = tally(m);
        // 림퍼 뒤는 레이즈(아이솔) 칸만 범위(BB의 '콜' 색은 체크라 세지 않는다)
        if (t.none >= t.total) na = true; else pct = Math.round((model.limpers ? t.raise : t.raise + t.call) / t.total * 100);
      }
      out.push({ pos: p, pct: pct, na: na, cur: p === heroPos });
    });
    return out;
  }
  // 쓸 수 없는 자리의 짧은 표시: 오픈한 자리는 '오프너', 그 앞은 '앞자리'(그 오픈을 맞을 수 없다), 림퍼 뒤 UTG도 '앞자리', 오픈 상황의 BB는 '없음'
  function naLabel(model, pos) {
    if (model.facing === true && model.opener) {
      if (pos === model.opener) return '오프너';
      if (POS6.indexOf(pos) < POS6.indexOf(model.opener)) return '앞자리';
    }
    if (model.limpers && pos === 'UTG') return '앞자리';
    return '없음';
  }
  function stripHTML(model, heroPos, viewPos) {
    var rows = stripData(model, heroPos);
    var btns = rows.map(function(d) {
      var cls = 'gto-pos-btn' + (d.cur ? ' cur' : '') + (d.na ? ' na' : '') + (viewPos === d.pos ? ' sel' : '');
      var lab = d.na ? naLabel(model, d.pos) : d.pct + '%';
      var aria = d.na ? (lab === '오프너' ? '오픈한 자리' : lab === '앞자리' ? '오프너 앞 자리, 이 상황 없음' : '범위 없음') : '범위 ' + lab;
      return '<button type="button" class="' + cls + '" data-pos="' + d.pos + '"' + (d.na ? ' aria-disabled="true"' : '') +
        ' aria-label="' + d.pos + (d.cur ? ' (내 자리)' : '') + ' ' + aria + '"><span class="gto-pos-name">' + d.pos + '</span>' +
        '<span class="gto-pos-bar"><i style="width:' + (d.na ? 0 : d.pct) + '%"></i></span><span class="gto-pos-pct">' + lab + '</span></button>';
    }).join('');
    return '<div class="gto-pos-strip"><div class="gto-pos-title">자리별 범위 크기, 누르면 그 자리 차트</div><div class="gto-pos-row">' + btns + '</div></div>';
  }
  function emptyHTML(model) {
    var josa = model.pos === 'BTN' ? '은' : '는';
    if (!model.facing && !model.limpers && model.pos === 'BB') return '<div class="gto-chart-empty">BB는 오픈 상황 없음</div>';
    if (model.facing === 'vs4bet' && !Gto.GTO_RANGES.vs4bet[model.pos]) return '<div class="gto-chart-empty">' + model.pos + josa + ' vs4벳 차트 데이터 없음</div>';
    if (model.facing === 'vs3bet' && !Gto.GTO_RANGES.vs3bet[model.pos]) return '<div class="gto-chart-empty">' + model.pos + josa + ' vs3벳 차트 데이터 없음</div>';
    if (model.facing === true && !Gto.GTO_RANGES.vsRfi[model.pos]) return '<div class="gto-chart-empty">' + model.pos + josa + ' vs오픈 차트 데이터 없음</div>';
    return null;
  }

  // 전체 HTML(순수). o = { hidden, street, guide, viewPos, heroPos, flash, view, seatLabel }. 2인자 호출(테스트, 예전 호출)은 프리플랍 공개 상태
  //   heroPos = 이 차트의 '기준 자리'(위치 비교 띠의 cur). 히어로가 아니어도 된다(상대 자리 차트는 그 자리, 카드는 null).
  //   seatLabel(n3-B): 읽기 줄 1번째를 이 글로 바꾸고 미리보기처럼 금색으로(예 '👀 민수(BTN) 입장 차트'). view: 보기 강제(테스트)
  function _renderHTML(model, heroCards, o) {
    o = o || {};
    if (o.opp && !o.viewPos) return _oppHTML(model, o);
    var heroPos = o.heroPos || model.pos;
    var empty = emptyHTML(model);
    var ro = readout(model, heroCards, null, { hidden: o.hidden, viewPos: o.viewPos, heroPos: heroPos });
    if (o.seatLabel) { ro.ctx = String(o.seatLabel); ro.preview = true; }
    var post = o.street && o.street !== 'preflop';
    var head = '<div class="gto-chart-head">' +
      (post ? '<div class="gto-head-post">📌 지금은 ' + _esc(streetKor(o.street)) + ', 프리플랍 차트는 참고예요</div>' : '') +
      '<div class="gto-head-ctx' + (ro.preview ? ' is-preview' : '') + '">' + _esc(ro.ctx) + '</div>' +
      // (n3b-review) 다른 자리 입장 차트는 이름 줄 아래에 그 자리 상황을 적는다(이름만으로는 무슨 상황 차트인지 모른다)
      (o.seatLabel ? '<div class="gto-head-hand gto-head-sit"><span>상황: ' + _esc(seatContextText(model)) + '</span></div>' : '') +
      (ro.handHTML ? '<div class="gto-head-hand">' + (ro.action && !ro.hidden ? swatch(ro.action) : '') + '<span>' + ro.handHTML + '</span></div>' : '') +
      (post || o.viewPos || o.seatLabel ? '' : _bluffHTML(model)) +
      (post ? '<div class="gto-guide">' + (o.guide ? _esc(o.guide) : '') + '</div>' : '') +
      '</div>';
    if (empty) {
      return head + empty + (o.viewPos ? stripHTML(model, heroPos, o.viewPos) : stripHTML(model, heroPos, null)) + footHTML();
    }
    var hc = (!o.hidden && ro.cell) ? ro.cell : null;
    var kin = null;
    if (hc && typeof RangeNotes !== 'undefined' && RangeNotes && typeof RangeNotes.category === 'function') {
      try { kin = RangeNotes.category(model.cells[hc.r][hc.c].label); } catch (e) { kin = null; }
      // '나머지' 분류(suited-other, offsuit-other)는 칸이 너무 많아 강조하면 오히려 내 손이 묻힌다
      if (kin && /-other$/.test(String(kin))) kin = null;
    }
    var grid = gridHTML(model);
    var rg = hc ? regionOf(model, hc.r, hc.c) : null;   // n2-G3: 내 손이 속한 범위 영역(폴드, 자료 없음은 null)
    var edges = rg ? rg.edges : null;
    if (hc) {
      // 내 손 칸(금테, 반짝임)과 같은 분류 칸(옅은 강조), 영역 경계 칸(rg + 변 클래스)은 캐시된 격자 문자열에 클래스만 끼운다
      grid = grid.replace(/<div class="gto-cell ([^"]*)" data-r="(\d+)" data-c="(\d+)"/g, function(all, cls, r, c) {
        r = +r; c = +c;
        var add = '';
        var e = edges ? edges[r + ',' + c] : null;
        if (e) { add = ' rg'; for (var i = 0; i < e.length; i++) add += ' rg-' + e.charAt(i); }
        if (r === hc.r && c === hc.c) return '<div class="gto-cell ' + cls + ' hero-cell' + (o.flash === false ? '' : ' flash') + add + '" data-r="' + r + '" data-c="' + c + '"';
        if (kin) {
          var cat = null;
          try { cat = RangeNotes.category(model.cells[r][c].label); } catch (e2) { cat = null; }
          if (cat === kin) return '<div class="gto-cell ' + cls + ' kin-cell' + add + '" data-r="' + r + '" data-c="' + c + '"';
        }
        if (add) return '<div class="gto-cell ' + cls + add + '" data-r="' + r + '" data-c="' + c + '"';
        return all;
      });
    }
    // 내 칸이 보이면 격자에 has-hero와 내 칸 좌표(css가 금색 줄과 칸 안내선을 그린다), 범례에 안내 1줄
    // (n3-B) 보기: 칩 줄 + 격자와 범례의 gv-raise, gv-call 클래스(전체 보기는 클래스 없음, 칩을 누르면 _applyBar가 클래스만 바꾼다). o.view가 있으면 그 보기(테스트)
    var vw = effView(model, o.view || _savedView());
    var gvc = vw === 'all' ? '' : ' gv-' + vw;
    var gridAttr = (hc ? ' has-hero' + gvc + '" style="--hr:' + hc.r + ';--hc:' + hc.c + '"' : gvc + '"') + ' data-gvt="1"';
    var heroNote = hc ? '<span class="gto-lg-note gto-lg-hero">금색 선 = 내 손의 줄과 칸' +
      (rg ? ', ' + (rg.action === 'call' ? '진한 윤곽' : '흰 윤곽') + ' = 내 손이 속한 ' + (rg.action === 'call' ? callWord(model) : '레이즈') + ' 영역(' + rg.size + '칸)' : '') + '</span>' : '';
    return head + viewChipsHTML(model, vw) +
      '<div class="gto-chart-grid' + gridAttr + ' role="img" aria-label="' + _esc((o.seatLabel ? seatContextText(model) : contextText(model)) + ' 레인지 차트 13x13') + '">' + grid + '</div>' + viewStatHTML(model, vw) +
      '<div class="gto-chart-legend' + gvc + '" data-gvt="1">' + legendHTML(model) + heroNote + '</div>' +
      stripHTML(model, heroPos, o.viewPos || null) +
      footHTML();
  }
  // 임의 자리 차트 HTML(n3-B, 순수): sitOrModel = 상황({ pos, facing, opener, limpers }) 또는 모델, cards = 그 자리 카드(모르면 null).
  //   o는 _renderHTML과 같고 heroPos 기본은 그 자리. 자료가 없는 상황이면 ''
  function chartHTML(sitOrModel, cards, o) {
    var m = (sitOrModel && sitOrModel.cells) ? sitOrModel : situationModel(sitOrModel);
    if (!m) return '';
    var oo = {}, k;
    if (o) for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) oo[k] = o[k];
    if (!oo.heroPos) oo.heroPos = m.pos;
    return _renderHTML(m, (cards && cards.length >= 2) ? cards : null, oo);
  }
  // ── (n3-C) 상대 차례 차트 ──
  // actionEdges(model, act) → { edges: { 'r,c': 'trbl 조합' }, size }(순수, 모델에 캐시): 주 액션이 act인 칸 전체(연속이 아니어도)의 바깥 경계.
  //   상대가 방금 한 행동(콜이면 콜 칸)의 범위를 윤곽으로 보여 준다. 영역 윤곽(.rg)과 같은 css를 쓴다
  function actionEdges(model, act) {
    if (!model || !model.cells || (act !== 'raise' && act !== 'call')) return null;
    var store = model._acEdges || (model._acEdges = {});
    if (store[act]) return store[act];
    var edges = {}, n = 0;
    function same(r, c) { return r >= 0 && r < 13 && c >= 0 && c < 13 && primaryAction(model.cells[r][c]) === act; }
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) {
      if (!same(r, c)) continue;
      n++;
      var e = (same(r - 1, c) ? '' : 't') + (same(r, c + 1) ? '' : 'r') + (same(r + 1, c) ? '' : 'b') + (same(r, c - 1) ? '' : 'l');
      if (e) edges[r + ',' + c] = e;
    }
    store[act] = { edges: edges, size: n };
    return store[act];
  }
  // 상대 차트 HTML(순수): o.opp = { head, post?, res?, hl?, hand?({ pos, cards, label, word, r, c }), note, legend?: [글] }
  function _oppHTML(model, o) {
    var op = o.opp || {};
    var hand = op.hand && op.hand.cards && op.hand.cards.length >= 2 ? op.hand : null;
    var head = '<div class="gto-chart-head gto-opp-head">' +
      '<div class="gto-head-opp"><span class="gto-opp-ic" aria-hidden="true">👀</span>' + _esc(op.head || '') + '</div>' +
      (op.post ? '<div class="gto-head-post gto-opp-post">📌 ' + _esc(op.post) + '</div>' : '') +
      (op.res ? '<div class="gto-head-res">' + (op.hl ? swatch(op.hl) : '') + '<span>' + _esc(op.res) + '</span></div>' : '') +
      (hand ? '<div class="gto-head-hand gto-opp-hand"><span>' + _esc(hand.pos) + ' 실제 손 ' + cardHTML(hand.cards[0]) + cardHTML(hand.cards[1]) +
        ' = <b>' + _esc(hand.label) + '</b>, ' + _esc(hand.word) + '</span></div>' : '') +
      (op.note ? '<div class="gto-head-note">' + _esc(op.note) + '</div>' : '') +
      '</div>';
    var empty = emptyHTML(model);
    if (empty) return head + empty + stripHTML(model, model.pos, null) + footHTML();
    var ae = op.hl ? actionEdges(model, op.hl) : null;
    var hc = (hand && hand.r != null && hand.c != null) ? hand : null;
    var grid = gridHTML(model);
    if ((ae && ae.size) || hc) {
      grid = grid.replace(/<div class="gto-cell ([^"]*)" data-r="(\d+)" data-c="(\d+)"/g, function(all, cls, r, c) {
        var add = '', e = ae ? ae.edges[r + ',' + c] : null;
        if (e) { add = ' rg oc-hl'; for (var i = 0; i < e.length; i++) add += ' rg-' + e.charAt(i); }
        if (hc && +r === hc.r && +c === hc.c) add += ' opp-cell';
        return add ? '<div class="gto-cell ' + cls + add + '" data-r="' + r + '" data-c="' + c + '"' : all;
      });
    }
    var vw = effView(model, o.view || _savedView());
    var gvc = vw === 'all' ? '' : ' gv-' + vw;
    var notes = (op.legend || []).map(function(t) { return '<span class="gto-lg-note gto-lg-opp">' + _esc(t) + '</span>'; }).join('');
    return head + viewChipsHTML(model, vw) +
      '<div class="gto-chart-grid' + gvc + '" data-gvt="1" role="img" aria-label="' + _esc(seatContextText(model) + ' 레인지 차트 13x13, ' + (op.head || '')) + '">' + grid + '</div>' +
      viewStatHTML(model, vw) +
      '<div class="gto-chart-legend' + gvc + '" data-gvt="1">' + legendHTML(model) + notes + '</div>' +
      stripHTML(model, model.pos, null) + footHTML();
  }
  // 표준 티어 차트(키 'std|')의 3벳 블러프 후보 한 줄(설계 원문 4절 5번, 참고): GtoStd.bluffHints. 입문 차트와 오픈 차트는 빈 문자열
  function _bluffHTML(model) {
    if (!model || !/^std\|/.test(String(model.key || '')) || typeof GtoStd === 'undefined' || !GtoStd || typeof GtoStd.bluffHints !== 'function') return '';
    var t = '';
    try { t = GtoStd.bluffHints(model) || ''; } catch (e) { t = ''; }
    // (웨이브2 후속) 한 줄: 넘치면 말줄임(전체 문장은 title과 aria-label)
    return t ? '<div class="gto-head-bluff" title="' + _esc(t) + ' (표준 차트 참고)" aria-label="' + _esc(t) + ' (표준 차트 참고)">🃏 ' + _esc(t) + ' (참고)</div>' : '';
  }
  function footHTML() {
    return '<div class="gto-chart-foot"><button type="button" class="gto-lab-btn">🗺 학습실에서 크게 보기</button></div>';
  }
  function streetKor(s) { return s === 'flop' ? '플랍' : s === 'turn' ? '턴' : s === 'river' ? '리버' : s === 'showdown' ? '쇼다운' : s; }

  // 지금 상태에서 그릴 차트 모델(프리플랍): Gto.preflopHint와 같은 판정. 림퍼 뒤(facing false, limpers ≥ 1)는 아이솔 모델.
  // 표준 티어(GtoStd.active)면 GtoStd.modelFor(칸마다 w). 캐시된 객체를 돌려주므로 고치지 말 것.
  function modelFor(state, heroPos) {
    var h = Gto.preflopHint(state, heroPos);
    if (!h) return null;
    var std = _stdModel(state, heroPos);
    if (std) return std;
    return cachedModel(heroPos, h.facing, h.opener || null, (h.facing === false && h.limpers > 0) ? h.limpers : 0);
  }
  function _stdModel(state, heroPos) {
    try {
      if (typeof GtoStd === 'undefined' || !GtoStd || GtoStd.STUB || typeof GtoStd.active !== 'function' || !GtoStd.active(state)) return null;
      var m = typeof GtoStd.modelFor === 'function' ? GtoStd.modelFor(state, heroPos) : null;
      if (!m || !m.cells) return null;
      // 키는 내용 서명으로(같은 표면 같은 키): 격자 HTML 캐시가 재사용되고 _lastKey가 안 바뀌어 DOM 쓰기 0. 시각 기반 키는 매번 다시 그리고 캐시를 불린다
      if (!m.key) m.key = 'std|' + modelKey(m.pos || heroPos, m.facing, m.opener, m.limpers) + '|' + _cellsSig(m);
      return m;
    } catch (e) { return null; }
  }
  // 169칸 액션과 비율의 짧은 서명(캐시 키용)
  function _cellsSig(m) {
    var s = '';
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) {
      var cell = m.cells[r][c], mx = mixOf(cell);
      s += (cell.action || 'n').charAt(0) + (mx ? mx.wr + '.' + mx.wc : '');
    }
    return s;
  }

  // ── 화면 상태 ──
  var _cache = null;      // 프리플랍 결정 시점의 { pos, facing, opener, limpers, model }, 포스트플랍엔 그대로 유지
  var _last = null;       // 마지막 update 인자(refresh용)
  var _lastKey = null, _host = null, _writes = 0, _scrollKey = null;
  var _viewPos = null;    // 위치 비교 띠로 고른 미리보기 자리(기준 = _base(), 히어로 또는 seatView 자리)
  var _seat = null;       // (n3-B) seatView로 고른 다른 자리 상황 { pos, facing, opener, limpers, label, cards }. 없으면 히어로(_cache) 기준
  var _revealed = false;  // 결정 뒤 공개
  var _handKey = null;
  var _shown = false;     // 지금 차트가 보임(힌트 판정)
  var _peek = false;      // 폰 시트 접힘(손잡이만)
  var _autoPeek = false;  // 결정 뒤 자동으로 접은 상태(다음 결정에 다시 펼친다). 손으로 접으면 거짓
  var _sheet = null;
  var _bubbleAt = null;
  var _mqBound = false, _obsBound = false;
  var _soon = null;       // 다음 프레임에 할 레이아웃 읽기(시트 자리, 본문 스크롤 맨 위). { place, scrollHost }
  var _persp = '';        // (n3-C) 관점 칩 줄 HTML(OppChart가 준다). 호스트 맨 위 .gto-persp
  var _listeners = [];    // (n3-C) on(fn) 알림 받는 쪽
  var _emitting = false;
  var _htmlCache = {}, _htmlCacheN = 0;   // (n3-C) 상대 차트 전체 HTML(렌더 키 + 보기)

  function on(fn) { if (typeof fn === 'function' && _listeners.indexOf(fn) < 0) _listeners.push(fn); return _listeners.length; }
  function _emit(kind, data) {
    if (_emitting) return;
    _emitting = true;
    try { for (var i = 0; i < _listeners.length; i++) { try { _listeners[i](kind, data); } catch (e) { if (typeof console !== 'undefined' && console.error) console.error('[GtoChart.on]', e); } } }
    finally { _emitting = false; }
  }
  // 관점 칩 줄 바꾸기: 보이는 호스트의 .gto-persp만 고친다(querySelector가 없는 가짜 호스트는 마지막 본문과 함께 다시 쓴다). 알림 중에는 저장만(곧 그린다)
  var _lastBody = '';
  function setPersp(html) {
    html = html || '';
    if (html === _persp) return false;
    _persp = html;
    if (_emitting || !_host) return true;
    try {
      var box = _host.querySelector ? _host.querySelector('.gto-persp') : null;
      if (box) { if (box.innerHTML !== html) box.innerHTML = html; }
      else if (!_host.querySelector && _lastBody) { _host.innerHTML = _perspBox() + _lastBody; _writes++; }
    } catch (e) {}
    return true;
  }
  function _perspBox() { return '<div class="gto-persp">' + _persp + '</div>'; }

  function _settings() {
    try { return (typeof A11y !== 'undefined' && A11y && typeof A11y.load === 'function') ? A11y.load() : {}; } catch (e) { return {}; }
  }
  function _doc() { return (typeof document !== 'undefined' && document) ? document : null; }
  function _isPhone() {
    try { return typeof window !== 'undefined' && !!window.matchMedia && !!window.matchMedia(MQ).matches; } catch (e) { return false; }
  }
  function _handKeyOf(state) {
    var hc = state.heroCards || [];
    return (state.handNum || '') + '|' + (state.seed || '') + '|' + hc.map(function(c) { return c.rank + c.suit; }).join('');
  }
  function _guideLine(state, hidden) {
    if (hidden) return '🔒 플랍 가이드는 결정 뒤 공개';
    try {
      if (typeof PostflopGuide === 'undefined' || !PostflopGuide || typeof PostflopGuide.guide !== 'function') return '';
      var eq = state.seatEq && typeof state.seatEq.Hero === 'number' ? state.seatEq.Hero : undefined;
      var g = PostflopGuide.guide(state, { eq: eq });
      if (!g) return '';
      var reason = String(g.reason || '').trim();
      return '참고: ' + (g.label || ACT_KOR[g.action] || g.action) + (reason ? ', ' + reason : '');
    } catch (e) { return ''; }
  }

  // ── 폰 하단 시트(이 모듈이 만든다) ──
  // 요소는 createElement로 만들어 참조를 쥔다(querySelector 없는 node 러너에서도 같은 경로가 돈다)
  function _ensureSheet() {
    var d = _doc();
    if (!d || !d.createElement) return null;
    if (_sheet && _sheet.root && _sheet.root.parentNode) return _sheet;
    function mk(tag, cls, attrs, text) {
      var e = d.createElement(tag);
      e.className = cls;
      if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
      if (text) e.textContent = text;
      return e;
    }
    var root = mk('div', 'gto-sheet gto-big', { role: 'region', 'aria-label': '레인지 차트' });
    root.id = 'gto-sheet';
    var handle = mk('button', 'gto-sheet-handle', { type: 'button', 'aria-expanded': 'true', 'aria-label': '차트 접기' });
    var ctx = mk('span', 'gto-sheet-ctx');
    var arrow = mk('span', 'gto-sheet-arrow', { 'aria-hidden': 'true' }, '▾');
    var title = mk('span', 'gto-sheet-title', null, '📋 차트');
    handle.appendChild(mk('span', 'gto-sheet-grip', { 'aria-hidden': 'true' }));
    handle.appendChild(title);
    handle.appendChild(ctx);
    handle.appendChild(arrow);
    var body = mk('div', 'gto-sheet-body');
    // (n2b) 시트가 도크 위 액션 로그 줄과 ⏩ 속도 버튼을 덮으므로 손잡이 아래에 같은 줄(HandLogUI가 채우고 누름도 받는다, css/pace.css)
    var log = mk('div', 'hl-mirror gto-sheet-log', { role: 'group', 'aria-label': '이번 핸드 액션 기록과 속도' });
    root.appendChild(handle);
    root.appendChild(log);
    root.appendChild(body);
    var parent = (d.getElementById && d.getElementById('screen-game')) || d.body;
    if (parent && parent.appendChild) parent.appendChild(root);
    _sheet = { root: root, handle: handle, body: body, ctx: ctx, arrow: arrow, log: log, title: title };
    if (typeof HandLogUI !== 'undefined' && HandLogUI && typeof HandLogUI.render === 'function') { try { HandLogUI.render(); } catch (e) { /* 줄 사본은 다음 그리기에 */ } }
    _bindHandle(handle, root);
    _watchBars(d);
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', _replace);
    return _sheet;
  }
  function _sheetOn() { return !!(_sheet && _sheet.root && _sheet.root.style && _sheet.root.style.display !== 'none'); }
  function _replace() { if (_sheetOn() && _isPhone()) _placeSheet(); }
  // 액션바가 결과바로 바뀌거나(핸드 끝) 높이가 바뀌면(슬라이더 줄 표시) 시트 아래 끝을 따라가게 한다
  function _watchBars(d) {
    if (_obsBound || typeof window === 'undefined') return;
    _obsBound = true;
    try {
      var bars = ['action-bar', 'result-actions-bar'].map(function(id) { return d.getElementById ? d.getElementById(id) : null; }).filter(Boolean);
      if (typeof ResizeObserver !== 'undefined') { var ro = new ResizeObserver(_replace); bars.forEach(function(b) { ro.observe(b); }); }
      if (typeof MutationObserver !== 'undefined') { var mo = new MutationObserver(_replace); bars.forEach(function(b) { mo.observe(b, { attributes: true, attributeFilter: ['style'] }); }); }
    } catch (e) {}
  }
  // 손잡이: 탭이면 접기/펼치기, 아래로 60px 이상 끌면 접기, 접힌 상태에서 위로 끌면 펼치기
  function _bindHandle(handle, root) {
    var y0 = null, dy = 0, moved = false;
    function onDown(e) {
      y0 = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
      dy = 0; moved = false;
      root.classList.add('dragging');
    }
    function onMove(e) {
      if (y0 == null) return;
      var y = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
      dy = y - y0;
      if (Math.abs(dy) > 6) moved = true;
      if (!_peek && dy > 0) root.style.transform = 'translateY(' + dy + 'px)';
      else if (_peek && dy < 0) root.style.transform = 'translateY(calc(100% - 44px + ' + dy + 'px))';
      if (moved && e.cancelable && e.preventDefault) e.preventDefault();
    }
    function onUp() {
      if (y0 == null) return;
      root.classList.remove('dragging');
      root.style.transform = '';
      var wantPeek = _peek;
      if (!moved) wantPeek = !_peek;
      else if (!_peek && dy > 60) wantPeek = true;
      else if (_peek && dy < -40) wantPeek = false;
      y0 = null;
      _setPeek(wantPeek, false);   // 손으로 접고 펼친 것은 사용자 뜻(자동 펼침 대상 아님)
    }
    handle.addEventListener('touchend', function(e) { if (e && e.cancelable && e.preventDefault) e.preventDefault(); }, { passive: false });
    if (typeof window !== 'undefined' && 'onpointerdown' in (window.document || {})) {
      handle.addEventListener('pointerdown', function(e) { onDown(e); try { handle.setPointerCapture(e.pointerId); } catch (x) {} });
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    } else {
      handle.addEventListener('touchstart', onDown, { passive: true });
      handle.addEventListener('touchmove', onMove, { passive: false });
      handle.addEventListener('touchend', onUp);
      handle.addEventListener('click', function() { if (!moved) _setPeek(!_peek, false); });
    }
  }
  // 접기 상태 바꾸기. auto = 결정 뒤 자동 접기(다음 결정에 다시 펼친다). 손으로 바꾼 것은 auto 거짓
  function _setPeek(on, auto) {
    _peek = !!on;
    _autoPeek = !!(auto && _peek);
    _applyPeek();
  }
  function _applyPeek() {
    if (!_sheet || !_sheet.root) return;
    _sheet.root.classList.toggle('peek', _peek);
    if (_sheet.handle) {
      _sheet.handle.setAttribute('aria-expanded', _peek ? 'false' : 'true');
      _sheet.handle.setAttribute('aria-label', _peek ? '차트 펼치기' : '차트 접기');
    }
    if (_sheet.arrow) _sheet.arrow.textContent = _peek ? '▴' : '▾';
    // 접힌 시트는 안 보인 것이고 펼치면 보인 것(힌트 판정). 시트가 떠 있을 때만
    if (_sheetOn() && _isPhone()) _shown = !_peek;
    // (n3-C) 탭 대기 중이면 알약 자리(접힌 손잡이 위)와 글(차트가 보이면 '행동 보기', '다음 차트')을 다시 맞춘다
    try { if (typeof Pacer !== 'undefined' && Pacer && typeof Pacer.busy === 'function' && Pacer.busy() && typeof Pacer.repaint === 'function') Pacer.repaint(); } catch (e) {}
  }
  // 손잡이 줄 글: 미리보기 자리, 포스트플랍은 스트리트, 결정 뒤(공개)에는 내 손 칸도
  function _handleText(model, state, vp, hidden, street) {
    if (vp) return vp + ' 차트 미리보기';
    var ctx = contextText(model);
    if (street && street !== 'preflop') return streetKor(street) + ', 프리플랍 참고: ' + ctx;
    if (!_revealed || hidden || !state || !state.heroCards) return ctx;
    var ro = readout(model, state.heroCards, null, {});
    if (!ro.label || !ro.action || !ro.cell) return ctx;
    var mx = mixOf(model.cells[ro.cell.r][ro.cell.c]);
    var act = mx ? '혼합 칸' : ro.action === 'raise' ? '레이즈 칸' : ro.action === 'call' ? callWord(model) + ' 칸' : ro.action === 'fold' ? '폴드 칸' : ACT_KOR.none;
    return ro.label + ' = ' + act + ', ' + ctx;
  }
  // 레이아웃을 읽는 일(시트 자리 getBoundingClientRect, 스크롤 맨 위)은 결정 처리 중에 강제 레이아웃을 일으켜(4배 스로틀 실측
  // update 중앙 83ms 중 대부분) 다음 프레임 직전(rAF, 그리기 전이라 깜빡임 없음)으로 미룬다. rAF가 없으면(node 러너) 바로 한다
  function _later(place, scrollHost) {
    var raf = (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') ? window.requestAnimationFrame : null;
    if (!raf) {
      if (scrollHost) { try { if (scrollHost.scrollTop) scrollHost.scrollTop = 0; } catch (e) {} }
      if (place) _placeSheet();
      return;
    }
    if (_soon) { if (place) _soon.place = true; if (scrollHost) _soon.scrollHost = scrollHost; return; }
    _soon = { place: !!place, scrollHost: scrollHost || null };
    raf(function() {
      var j = _soon; _soon = null;
      if (!j) return;
      if (j.scrollHost) { try { if (j.scrollHost.scrollTop) j.scrollHost.scrollTop = 0; } catch (e) {} }
      if (j.place && _sheetOn() && _isPhone()) _placeSheet();
    });
  }
  // 시트 아래 끝 = 액션바(또는 결과바) 위 끝. 시트 위 끝은 화면 위에서 56px 아래까지만(승률 칩 줄)
  function _placeSheet() {
    if (!_sheet || !_sheet.root || typeof window === 'undefined') return;
    var d = _doc(), bar = null;
    ['action-bar', 'result-actions-bar'].forEach(function(id) {
      var b = d && d.getElementById ? d.getElementById(id) : null;
      if (b && b.style && b.style.display !== 'none' && b.offsetHeight > 0) bar = b;
    });
    var ih = window.innerHeight || 0, bottom = 0;
    if (bar && bar.getBoundingClientRect) bottom = Math.max(0, Math.round(ih - bar.getBoundingClientRect().top));
    _sheet.root.style.bottom = bottom + 'px';
    _sheet.root.style.maxHeight = Math.max(200, ih - bottom - 56) + 'px';
  }

  // ── 렌더 ──
  function _bind(host) {
    if (!host || host._gcBound || !host.addEventListener) return;
    host._gcBound = true;
    host.addEventListener('click', _onClick);
  }
  function _onClick(e) {
    var t = e && e.target;
    if (!t || !t.closest) return;
    var gv = t.closest('.gv-chip');
    if (gv) { _closeBubble(); onViewChip(gv); return; }
    var oc = t.closest('[data-oc]');   // (n3-C) 관점 칩(👤 내 차트, 방금: CO): OppChart가 처리
    if (oc && oc.getAttribute) { _closeBubble(); _emit('chip', oc.getAttribute('data-oc')); return; }
    var cell = t.closest('.gto-cell');
    if (cell && cell.dataset) { _toggleBubble(cell); return; }
    if (t.closest('.gto-bubble-close')) { _closeBubble(); return; }
    var pb = t.closest('.gto-pos-btn');
    if (pb && pb.dataset) { if (pb.getAttribute('aria-disabled') === 'true') return; previewPos(pb.dataset.pos); return; }
    if (t.closest('.gto-lab-btn')) { openLab(); return; }
    if (!t.closest('.gto-bubble')) _closeBubble();
  }
  // 위치 비교 띠: 그 자리 차트로 전환(내 자리를 누르면 원래대로)
  function previewPos(pos) {
    var b = _base();
    if (!b) return;
    _viewPos = (pos && pos !== b.pos && POS6.indexOf(pos) >= 0) ? pos : null;
    _bubbleAt = null;
    if (_last) _render(_last.state, _last.heroPos, _last.opts);
  }
  // 차트의 기준 상황: seatView로 고른 자리가 있으면 그 자리, 없으면 히어로(프리플랍 결정 시점 _cache)
  function _base() { return _seat || _cache; }
  // (n3-B) 다른 자리 입장 차트: sit = { pos, facing, opener?, limpers?, label?(읽기 줄 글), cards?(그 자리 카드, 보통 모름) } | null(히어로로 돌아가기).
  //   같은 시트와 패널에 그 자리 상황의 격자를 그리고, 위치 비교 띠와 미리보기는 그 자리를 기준으로 돈다. 히어로 결정(update)이나 새 핸드면 저절로 풀린다.
  //   보기 칩(전체, 레이즈만, 콜만)은 자리와 상관없이 저장된 보기를 그대로 쓴다. 바뀌었으면 true
  //   (n3-C) sit.opp(상대 차례 차트 내용, 키는 opp.key), sit.persp(관점 칩 줄 HTML), sit.open(자동으로 접힌 시트를 편다). seatView(null, { persp })도 된다
  function seatView(sit, o2) {
    var s = sit ? normSituation(sit) : null;
    if (s) {
      s.label = sit.label ? String(sit.label) : '👀 ' + s.pos + ' 입장 차트';
      s.cards = (sit.cards && sit.cards.length >= 2) ? sit.cards : null;
      s.street = SEAT_STREETS.indexOf(sit.street) >= 0 ? sit.street : 'preflop';
      s.opp = (sit.opp && typeof sit.opp === 'object') ? sit.opp : null;
    }
    var pp = (sit && typeof sit.persp === 'string') ? sit.persp : (o2 && typeof o2.persp === 'string') ? o2.persp : null;
    var before = _seat ? modelKey(_seat.pos, _seat.facing, _seat.opener, _seat.limpers) + '#' + _seat.label + '#' + _seat.street + '#' + (_seat.opp ? _seat.opp.key : '') : '';
    var after = s ? modelKey(s.pos, s.facing, s.opener, s.limpers) + '#' + s.label + '#' + s.street + '#' + (s.opp ? s.opp.key : '') : '';
    if (before === after && !!_seat === !!s) { if (pp != null) setPersp(pp); return false; }
    if (pp != null) _persp = pp;   // 곧 다시 그리므로 저장만
    if (s && sit.open && _autoPeek) { _peek = false; _autoPeek = false; }
    _seat = s; _viewPos = null; _bubbleAt = null;
    // (n3b-review) 히어로가 아직 결정하지 않은 손(새 핸드 첫 상대 차례, 세션 첫 손)에도 그린다: 히어로 상황(_cache)과 마지막 update 인자가 없어도 되고,
    //   그 자리 차트의 스트리트는 sit.street(기본 프리플랍)라 지난 손의 리버 상태가 '지금은 리버' 머리줄로 새지 않는다
    if (s) _renderSeat();
    else if (_last && _cache && _last.state && _last.state.heroCards) {
      var o = _last.opts || {};
      if (!!(o.gtoMode || _settings().showChart) && !o.boss) _render(_last.state, _last.heroPos, o);
    }
    return true;
  }
  // 고른 자리 차트를 그린다(차트를 볼 설정일 때만). 그렸으면 true
  function _renderSeat() {
    if (!_seat) return false;
    var o = (_last && _last.opts) || {};
    if (!(o.gtoMode || _settings().showChart) || o.boss) return false;
    _render((_last && _last.state) || { street: _seat.street }, _last ? _last.heroPos : _seat.pos, o);
    return true;
  }
  var SEAT_STREETS = ['preflop', 'flop', 'turn', 'river'];
  function openLab() {
    var c = _base() || {};
    if (typeof JourneyUI !== 'undefined' && JourneyUI && typeof JourneyUI.view === 'function') {
      try { JourneyUI.view('rangeLab', { pos: _viewPos || c.pos, facing: c.facing, opener: c.opener, limpers: c.limpers || 0 }); return true; } catch (e) {}
    }
    return false;
  }
  // 칸 말풍선: 손 분류와 이유(RangeNotes.explain, 없으면 액션만)
  function bubbleHTML(model, r, c) {
    var cell = model.cells[r][c], mx = mixOf(cell);
    var ctx = { pos: model.pos, facing: model.facing, opener: model.opener, action: cell.action, limpers: model.limpers || 0, w: mx ? { raise: mx.raise, call: mx.call, fold: mx.fold } : null, std: /^std\|/.test(String(model.key || '')) };
    var ex = null;
    if (typeof RangeNotes !== 'undefined' && RangeNotes && typeof RangeNotes.explain === 'function') {
      try { ex = RangeNotes.explain(cell.label, ctx); } catch (e) { ex = null; }
    }
    var title = ex && ex.title ? ex.title : cell.label;
    var why = ex && ex.why ? ex.why.slice() : [];
    if (!ex) {
      var a = cell.action === 'raise' ? raiseWord(model) : cell.action === 'call' ? callWord(model) : ACT_KOR[cell.action] || cell.action;
      why.push('이 자리(' + model.pos + ')에서는 ' + a + '예요.');
    }
    var tagKey = ex && ex.tag ? ex.tag : 'chart';
    var tagText = (typeof RangeNotes !== 'undefined' && RangeNotes && RangeNotes.TAG_TEXT && RangeNotes.TAG_TEXT[tagKey]) || '이 앱 차트 기준';
    var combos = cellWeight(r, c);
    var sw = mx ? '<span class="gto-sw gto-mix" style="--wr:' + mx.wr + '%;--wc:' + mx.wc + '%" aria-hidden="true"></span>' : swatch(cell.action);
    return '<div class="gto-bubble" role="dialog" aria-label="' + _esc(title) + '">' +
      '<button type="button" class="gto-bubble-close" aria-label="닫기">✕</button>' +
      '<div class="gto-bubble-top">' + sw + '<b>' + _esc(title) + '</b></div>' +
      why.map(function(w, i) { return '<div class="' + (i === why.length - 1 && why.length > 1 ? 'gto-bubble-act' : 'gto-bubble-why') + '">' + _esc(w) + '</div>'; }).join('') +
      '<div class="gto-bubble-tag">' + _esc(tagText) + ', 콤보 ' + combos + '개</div></div>';
  }
  function _closeBubble() {
    _bubbleAt = null;
    if (!_host || !_host.querySelector) return;
    var b = _host.querySelector('.gto-bubble');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }
  function _toggleBubble(cellEl) {
    var r = +cellEl.dataset.r, c = +cellEl.dataset.c;
    if (_bubbleAt && _bubbleAt.r === r && _bubbleAt.c === c) { _closeBubble(); return; }
    _closeBubble();
    var model = _shownModel();
    if (!model || !_host) return;
    var wrap = _doc().createElement('div');
    wrap.innerHTML = bubbleHTML(model, r, c);
    var b = wrap.firstChild;
    _host.appendChild(b);
    _bubbleAt = { r: r, c: c };
    // 자리: 칸이 위쪽 절반이면 칸 아래, 아래쪽이면 칸 위. 가로는 격자 안에 들어오게.
    // 좌표는 호스트 기준 사각형 차이(스크롤 포함)로 잰다. offsetTop은 칸의 offsetParent(격자가 아니라 position: relative인 본문)가 끼어
    // 격자 오프셋이 두 번 더해져 말풍선이 아래로 밀리고 아래쪽 칸은 말풍선이 그 칸을 덮었다(리뷰 실측)
    try {
      var hostW = _host.clientWidth || 0, bw = b.offsetWidth || 240, bh = b.offsetHeight || 120;
      var hr = _host.getBoundingClientRect(), cr = cellEl.getBoundingClientRect();
      var top = cr.top - hr.top + (_host.scrollTop || 0), left = cr.left - hr.left + (_host.scrollLeft || 0);
      var ch = cr.height || 24, cw = cr.width || 24;
      var x = Math.max(4, Math.min(left + cw / 2 - bw / 2, hostW - bw - 4));
      var y = (r < 7) ? top + ch + 6 : top - bh - 6;
      if (y < 0) y = top + ch + 6;
      b.style.left = x + 'px'; b.style.top = y + 'px';
    } catch (e) {}
  }
  function _shownModel() {
    var b = _base();
    if (!b) return null;
    if (_viewPos && _viewPos !== b.pos) return cachedModel(_viewPos, b.facing, b.opener, b.limpers);
    return (b === _cache && _cache.model) || cachedModel(b.pos, b.facing, b.opener, b.limpers);
  }

  function _hideAll() {
    var d = _doc();
    var el = (d && d.getElementById) ? d.getElementById('gto-chart') : null;
    if (el && el.style) el.style.display = 'none';
    if (_sheet && _sheet.root && _sheet.root.style) _sheet.root.style.display = 'none';
    if (d && d.documentElement && d.documentElement.classList) d.documentElement.classList.remove('chart-big');
    _shown = false;
    _bubbleAt = null;
  }

  function _render(state, heroPos, opts) {
    var d = _doc();
    if (!d) return;
    var s = _settings();
    var phone = !opts.el && _isPhone();
    var host = opts.el || (phone ? (_ensureSheet() || {}).body : d.getElementById('gto-chart'));
    if (!host) return;
    var model = _shownModel(), base = _base();
    if (!model || !base) return;
    var vp = (_viewPos && _viewPos !== base.pos) ? _viewPos : null;
    var seat = base === _cache ? null : base;   // (n3-B) 다른 자리 입장 차트: 그 자리 카드(보통 없음), 읽기 줄은 seat.label
    var view = opts.view || {};
    var street = seat ? (seat.street || 'preflop') : (state.street || 'preflop');   // (n3b-review) 그 자리 차트는 그 자리 스트리트(히어로의 지난 상태 말고)
    // 가림(L1 이상): 프리플랍 결정 중에만 내 손 표시를 가린다. 포스트플랍은 프리플랍 결정이 끝났으니 내 손 칸을 보이고, 플랍 가이드(지금 결정)만 가린다
    var guideHidden = !!view.hide && !_revealed;
    var hidden = !seat && guideHidden && street === 'preflop';
    var guide = (!seat && street !== 'preflop') ? _guideLine(state, guideHidden) : '';
    var op = (seat && !vp && seat.opp) ? seat.opp : null;   // (n3-C) 상대 차례 차트
    var key = [model.key || '', vp || '', street, hidden ? 1 : 0, _handKey, guide, phone ? 'p' : 'd', _revealed ? 1 : 0, seat ? 's:' + seat.pos + ':' + seat.label + (op ? ':' + op.key : '') : ''].join('#');
    if (key !== _lastKey || host !== _host) {
      var body = null, ck = op ? key + '#v' + _savedView() : null;
      if (ck && Object.prototype.hasOwnProperty.call(_htmlCache, ck)) body = _htmlCache[ck];
      if (body == null) {
        body = _renderHTML(model, seat ? seat.cards : state.heroCards, { hidden: hidden, street: street, guide: guide, viewPos: vp, heroPos: base.pos, seatLabel: (seat && !vp) ? seat.label : null, opp: op });
        if (ck) {
          if (++_htmlCacheN > 48) { _htmlCache = {}; _htmlCacheN = 1; }
          _htmlCache[ck] = body;
        }
      }
      host.innerHTML = _perspBox() + body;
      _lastBody = body;
      _lastKey = key; _host = host; _writes++; _bubbleAt = null;
      _bind(host);
      // 새 손이나 새 스트리트면 본문 스크롤을 맨 위로(읽기 줄이 먼저 보이게). 같은 손 안의 공개, 미리보기는 자리를 지킨다
      var sk = _handKey + '#' + street + '#' + (vp || '') + (seat ? '#s' + seat.pos : '');   // 다른 자리로 바뀌면 읽기 줄이 먼저 보이게
      if (sk !== _scrollKey) {
        _scrollKey = sk;
        if (opts.el) { try { if (host.scrollTop) host.scrollTop = 0; } catch (e) {} }   // 테스트와 끼워 넣은 표는 바로
        else _later(false, host);
      }
    }
    if (host.classList) host.classList.toggle('gto-dim', street !== 'preflop');
    if (opts.el) { _shown = true; return; }
    var el = d.getElementById('gto-chart');
    if (phone) {
      if (el && el.style) el.style.display = 'none';
      if (d.documentElement && d.documentElement.classList) d.documentElement.classList.remove('chart-big');
      var sh = _sheet;
      if (sh && sh.root) {
        sh.root.style.display = '';
        var ctxT = op ? String(op.short || op.head || '') : (seat && !vp) ? seat.label.replace(/^👀\s*/, '') : _handleText(model, seat ? null : state, vp, hidden, street);
        if (sh.ctx && sh.ctx.textContent !== ctxT) sh.ctx.textContent = ctxT;
        var ttl = op ? '👀 ' + seat.pos + ' 차트' : '📋 차트';
        if (sh.title && sh.title.textContent !== ttl) sh.title.textContent = ttl;
        if (sh.root.classList) sh.root.classList.toggle('is-opp', !!op);
        _applyPeek();
        _later(true, null);
      }
      _shown = !_peek;
    } else {
      if (_sheet && _sheet.root && _sheet.root.style) _sheet.root.style.display = 'none';
      if (el && el.style) { el.style.display = 'flex'; }
      if (el && el.classList) { el.classList.add('big'); el.classList.add('gto-big'); el.classList.toggle('is-opp', !!op); }
      if (d.documentElement && d.documentElement.classList) d.documentElement.classList.add('chart-big');
      _shown = true;
    }
  }

  // update(state, heroPos, opts). opts 불리언 = gtoMode(예전 호출). 객체 = { gtoMode, gtoRound, view, boss, el }
  function update(state, heroPos, opts) {
    if (typeof opts !== 'object' || opts === null) opts = { gtoMode: !!opts };
    _last = { state: state, heroPos: heroPos, opts: opts };
    if (_seat) { _seat = null; _viewPos = null; _bubbleAt = null; }   // (n3-B) 히어로 결정 = 히어로 차트로 돌아간다
    var s = _settings();
    var ok = !!state && !!state.heroCards;
    var want = ok && !!(opts.gtoMode || s.showChart) && !opts.boss;
    if (ok) {
      var hk = _handKeyOf(state);
      if (hk !== _handKey) { _handKey = hk; _viewPos = null; _bubbleAt = null; }
      if (state.street === 'preflop') {
        // facing 5값: false(오픈) | true(vs오픈) | 'vs3bet' | 'vs4bet' | 'cold3bet', Gto.preflopHint와 판정 통일(8차 WP1)
        // 림퍼 뒤는 limpers도 담아 아이솔 기준 표(isoPos)를 그린다(M4-P9)
        // 차트가 꺼져 있어도 프리플랍 상황은 기억한다(포스트플랍에 칩을 켜도 "먼저 오픈할 차례"가 아니라 실제 상황을 그리게). 모델은 그릴 때만 만든다
        var h = Gto.preflopHint(state, heroPos);
        if (h) {
          var lim = (h.facing === false && h.limpers > 0) ? h.limpers : 0;
          _cache = { pos: heroPos, facing: h.facing, opener: h.opener || null, limpers: lim,
            model: want ? (_stdModel(state, heroPos) || cachedModel(heroPos, h.facing, h.opener || null, lim)) : null };
        }
      }
    }
    _emit('hero', state);   // (n3-C) 내 차례 = 내 차트로 돌아온다(OppChart가 관점 칩 줄을 맞춘다, 그리기 전이라 쓰기 1번)
    if (!want) { _hideAll(); return; }
    _revealed = false;   // 결정마다 다시 가림(결정 뒤 shownForDecision이 공개)
    // 결정 뒤 자동으로 접은 시트는 다음 프리플랍 결정에 다시 펼친다. 포스트플랍 결정은 차트가 참고일 뿐이라 접힌 채 두고(코칭 판정이 보이게) 손잡이로 펼친다
    if (_autoPeek && state.street === 'preflop') { _peek = false; _autoPeek = false; }
    if (!_cache) _cache = { pos: heroPos, facing: false, opener: null, limpers: 0, model: cachedModel(heroPos, false, null, 0) };
    _render(state, heroPos, opts);
  }

  function hide() {
    _hideAll();
    _cache = null; _lastKey = null; _viewPos = null; _revealed = false; _seat = null; _persp = '';
    // (n3c 리뷰) hide는 GTO 미러가 아닌 새 핸드에서 불린다. 지난 미러 세션의 gtoMode가 _last에 남으면 wanted()와 _renderSeat가
    //   차트 칩이 꺼진 일반 판의 첫 상대 차례에 상대 차트를 띄운다(내 첫 결정 update 전까지). 미러 표시만 지운다(나머지 인자는 refresh용으로 둔다)
    if (_last && _last.opts && _last.opts.gtoMode) _last = { state: _last.state, heroPos: _last.heroPos, opts: Object.assign({}, _last.opts, { gtoMode: false }) };
    _emit('hide');
  }

  // 칩 토글 뒤: 설정을 다시 읽어 그리거나 숨긴다. 처음 켤 때 토스트 1회. 폰에서는 시트를 펼친다
  function refresh() {
    var s = _settings();
    var toast = false;
    if (s.showChart) { _peek = false; _autoPeek = false; toast = true; }
    try {
      if (_seat && !_cache) { _lastKey = null; if (!_renderSeat()) _hideAll(); return; }   // (n3b-review) 히어로 결정 전 다른 자리 차트
      if (!_last) { if (!s.showChart) _hideAll(); return; }
      _lastKey = null;
      var o = _last.opts;
      var want = !!(o.gtoMode || s.showChart) && !o.boss && !!_last.state && !!_last.state.heroCards;
      if (!want) { _hideAll(); return; }
      if (!_cache) { update(_last.state, _last.heroPos, o); return; }
      _render(_last.state, _last.heroPos, o);
    } finally {
      // 토스트는 그린 뒤에(폰 시트가 떠 있어야 액션바 위 자리를 잡는다)
      if (toast) _toastOnce();
      _emit('refresh', !!s.showChart);   // (n3-C) 칩을 켜면 지금 대기 중인 상대 차트로, 끄면 따라가기를 멈춘다
    }
  }
  // (n3-C) 차트를 볼 설정인가(📋 차트 칩 또는 GTO 미러, 승급 시험 아님). 마지막 update 인자 기준
  function wanted() {
    var o = (_last && _last.opts) || {};
    return !!(o.gtoMode || _settings().showChart) && !o.boss;
  }
  // 지금 사용자 눈에 차트가 보이나: 폰은 시트가 떠 있고 펼침, 데스크톱은 패널 표시
  function visible() {
    if (_isPhone()) return _sheetOn() && !_peek;
    var d = _doc(), el = (d && d.getElementById) ? d.getElementById('gto-chart') : null;
    return !!(_shown && el && el.style && el.style.display !== 'none');
  }
  // 이번 손(hk = 'handNum|seed', 생략하면 손 무관)의 히어로 차트가 있나(GTO 미러는 새 손에 hide가 없어 지난 손 상황이 남는다)
  function hasHero(hk) {
    var st = _last && _last.state;
    if (!(_cache && st && st.heroCards)) return false;
    return !hk || ((st.handNum || '') + '|' + (st.seed || '')) === hk;
  }
  function _toastOnce() {
    var ls = null;
    try { ls = (typeof localStorage !== 'undefined' && localStorage) ? localStorage : null; } catch (e) { ls = null; }
    try { if (ls && ls.getItem(TOAST_KEY)) return; } catch (e) {}
    try { if (ls) ls.setItem(TOAST_KEY, '1'); } catch (e) {}
    _toast('차트를 보고 결정하면 힌트로 기록돼요(XP 절반). 칸을 누르면 이유가 나와요');
  }
  function _toast(msg) {
    var d = _doc();
    if (!d || !d.body || !d.createElement) return;
    var old = d.getElementById ? d.getElementById('gto-toast') : null;
    if (old && old.remove) old.remove();
    var t = d.createElement('div');
    t.id = 'gto-toast';
    t.className = 'gto-toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    // 폰 시트가 떠 있으면 토스트를 액션바 바로 위(시트 아래쪽, 학습실 버튼 자리)에 둔다. 위쪽에 두면 읽기 줄과 격자 첫 줄을 가린다(QA 실측)
    try {
      if (_sheetOn() && _isPhone() && typeof window !== 'undefined') {
        var bar = null;
        ['action-bar', 'result-actions-bar'].forEach(function(id) { var b = d.getElementById ? d.getElementById(id) : null; if (b && b.style && b.style.display !== 'none' && b.offsetHeight > 0) bar = b; });
        var ih = window.innerHeight || 0, bottom = (bar && bar.getBoundingClientRect) ? Math.max(0, Math.round(ih - bar.getBoundingClientRect().top)) : 0;
        t.className += ' low';
        t.style.top = 'auto';
        t.style.bottom = (bottom + 10) + 'px';
      }
    } catch (e) {}
    d.body.appendChild(t);
    setTimeout(function() { if (t.remove) t.remove(); }, 3200);
  }

  // 이 결정에 차트가 보였나(폰에서 접힌 시트는 안 보인 것). 호출 = 결정 시점이므로 가렸던 내 손 표시를 공개한다
  function shownForDecision() {
    var r = !!_shown;
    reveal();
    return r;
  }
  function reveal() {
    if (!_cache || !_last) return;
    _revealed = true;
    // 폰: 결정 뒤에는 시트를 자동으로 접어 테이블과 코칭 판정(도크)이 보이게 한다. 다음 결정(update)에 다시 펼친다. 손으로 접은 상태면 그대로
    if (!_last.opts.el && _sheetOn() && _isPhone() && !_peek) _setPeek(true, true);
    if (_shown || (_sheet && _peek)) _render(_last.state, _last.heroPos, _last.opts);
  }

  // 로드 뒤 유휴 시간에 자주 쓰는 모델(오픈, vs 오픈)을 미리 만든다(약 60ms)
  function preheat() {
    POS6.forEach(function(p) {
      cachedModel(p, false, null, 0);
      cachedModel(p, true, null, 0);
    });
    cachedModel('BB', true, 'BTN', 0);
    cachedModel('BB', true, 'CO', 0);
    cachedModel('BB', true, 'SB', 0);
  }
  // 나머지 상황(오프너별 오픈 대응, 3벳, 4벳, 콜드 3벳, 아이솔) 모델도 한가할 때 조금씩 만들어 둔다. 처음 보는 상황의 모델과
  // 위치 비교 띠 6자리 모델을 결정 순간에 만들면 4배 스로틀에서 30~70ms가 걸려(검증 실측) 상황 전환 20ms 목표를 넘는다
  function preheatJobs() {
    var jobs = [];
    POS6.forEach(function(p, i) {
      for (var j = 0; j < i; j++) jobs.push([p, true, POS6[j], 0]);
      jobs.push([p, 'vs3bet', null, 0], [p, 'vs4bet', null, 0], [p, 'cold3bet', null, 0]);
      if (i > 0) jobs.push([p, false, null, 1]);
      if (i > 1) jobs.push([p, false, null, 2]);
    });
    return jobs;
  }
  function preheatIdle(idle) {
    var jobs = preheatJobs(), at = 0;
    function step(dl) {
      var t0 = Date.now();
      while (at < jobs.length) {
        var jb = jobs[at++];
        try { cachedModel(jb[0], jb[1], jb[2], jb[3]); } catch (e) {}
        var left = (dl && typeof dl.timeRemaining === 'function') ? dl.timeRemaining() : 8 - (Date.now() - t0);
        if (left < 4) break;
      }
      if (at < jobs.length) idle(step);
    }
    idle(step);
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('load', function() {
      var idle = (typeof window.requestIdleCallback === 'function') ? window.requestIdleCallback : function(f) { setTimeout(f, 800); };
      idle(function() { try { preheat(); } catch (e) {} try { preheatIdle(idle); } catch (e) {} });
      try {
        if (!_mqBound && window.matchMedia) {
          var m = window.matchMedia(MQ);
          var onChange = function() { _lastKey = null; if (_last) refresh(); };
          if (m.addEventListener) m.addEventListener('change', onChange); else if (m.addListener) m.addListener(onChange);
          _mqBound = true;
        }
      } catch (e) {}
    });
  }

  var api = {
    comboLabel: comboLabel, comboCards: comboCards, buildChartModel: buildChartModel, buildIsoModel: buildIsoModel, modelFor: modelFor,
    handCell: handCell, update: update, hide: hide, refresh: refresh, shownForDecision: shownForDecision, reveal: reveal,
    cachedModel: cachedModel, tally: tally, readout: readout, contextText: contextText, stripData: stripData, previewPos: previewPos, openLab: openLab,
    preheat: preheat, _preheatJobs: preheatJobs, cellWeight: cellWeight, mixOf: mixOf, POS6: POS6.slice(),
    regionOf: regionOf, primaryAction: primaryAction,   // n2-G3 공개 API(학습실 등 다른 화면도 쓸 수 있다)
    // n3-B 보기 칩(학습실, 완전 분석도 쓴다)
    VIEWS: VIEWS.slice(), NO_CALL: NO_CALL, viewChips: viewChips, viewCount: viewCount, viewStat: viewStat, viewWord: viewWord, effView: effView,
    viewChipsHTML: viewChipsHTML, viewStatHTML: viewStatHTML, onViewChip: onViewChip, syncViews: syncViews, noCallWhy: noCallWhy,
    // n3-B 임의 자리와 상황(히어로 좌석에 묶이지 않는 입구): 순수 normSituation, situationModel, chartHTML, 화면 seatView(sit | null)
    normSituation: normSituation, situationModel: situationModel, chartHTML: chartHTML, seatView: seatView,
    // n3-C 상대 차례 차트(OppChart): 알림, 관점 칩 줄, 보임 판정, 액션 칸 윤곽, 카드 글자
    on: on, setPersp: setPersp, wanted: wanted, visible: visible, hasHero: hasHero, actionEdges: actionEdges,
    cardText: cardText, cardHTML: cardHTML, callWord: callWord, seatContextText: seatContextText,
    _renderHTML: _renderHTML, _gridHTML: gridHTML, _legendHTML: legendHTML, _bubbleHTML: bubbleHTML,
    _setPeek: function(on) { _setPeek(on, false); },   // 손잡이 탭과 같다(테스트용)
    _sheet: function() { return _sheet; },
    _state: function() { return { shown: _shown, peek: _peek, autoPeek: _autoPeek, revealed: _revealed, viewPos: _viewPos, seat: _seat ? { pos: _seat.pos, facing: _seat.facing, opener: _seat.opener, limpers: _seat.limpers, label: _seat.label } : null, writes: _writes, lastKey: _lastKey, persp: _persp, opp: !!(_seat && _seat.opp), cache: _cache ? { pos: _cache.pos, facing: _cache.facing, opener: _cache.opener, limpers: _cache.limpers } : null }; },
    _reset: function() { _cache = null; _last = null; _lastKey = null; _host = null; _viewPos = null; _seat = null; _revealed = false; _handKey = null; _shown = false; _peek = false; _autoPeek = false; _bubbleAt = null; _writes = 0; _scrollKey = null; _persp = ''; _lastBody = ''; _htmlCache = {}; _htmlCacheN = 0; if (_sheet && _sheet.root && _sheet.root.style) _sheet.root.style.display = 'none'; }
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
