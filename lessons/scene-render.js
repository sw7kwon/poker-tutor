// lessons/scene-render.js (채우는 패키지: M2-P4a, M3-P1a가 table/bar/compare/sum을 이어서 추가)
// 레슨 장면과 퍼즐 장면(계약 C3)을 그리는 순수 HTML 문자열 함수(계약 C4, puzzles/puzzle-core.js 머리 주석).
// 로드할 때도 호출할 때도 document, window, localStorage, matchMedia에 손대지 않는다.
// 다른 모듈(GtoChart, Gto, Coach)은 호출 시점에 typeof 가드로만 쓴다. 스타일은 css/lesson.css의 sr- 접두.
//
//   cards(list, opts)       카드 열. 'Ah', 'Td', '10d', {rank:'T', suit:'d'}를 받는다. 알 수 없는 값은 뒷면 카드.
//                           카드마다 class="card red|black", data-suit=s|h|d|c(소문자), 10은 '10'으로 쓴다.
//                           opts{hero, size:'sm'|'xs', slots(빈 자리 포함 총 칸 수), bare(감싸는 div 없음), cls}
//   grid(spec, opts)        13x13 격자. spec{pos, facing, opener, highlight[], layers?[포지션]}.
//                           셀 액션은 GtoChart.buildChartModel(pos, facing, opener) 그대로, 클래스는 기존 차트와 같은 gto-<action>.
//                           opts{mini(해설 오버레이용 축소판), sel(gridSelect 상태, 주면 선택 모드), pick, blank(색 없이), legend, head}
//   gridSelect(state, tap)  2단계 선택 순수 상태기계. null -> {row} -> {row, col, hand}.
//                           tap = {row} | {col} | {row, col} | {back:true} | {reset:true}
//   tapOf(dataset)          격자 요소의 data-tap, data-r, data-c를 tap 객체로 바꾼다(DOM 레이어 공용).
//   ring(spec, opts)        팟 오즈 링 SVG. spec{potTotal(상대 벳 포함), toCall, eq?(0~1, 1 초과는 %로 본다)}.
//                           필요 승률 = toCall / (potTotal + toCall)은 여기서 계산한다. eq가 있으면 같은 축에 막대와 콜/폴드 바늘.
//                           opts{potLine:false}면 '팟(상대 벳 포함) X, 콜 Y' 줄을 뺀다(scene이 이미 쓴 경우).
//   scene(obj)              C3 장면 조합: hero, board, 팟 줄, seats 줄, range 칩, grid, ring, note 순.
//   table(spec)             (M3-P1a) 세로 폰용 6인 테이블 그림(ui/table.js DOM을 쓰지 않는다). 계약 L2 table.
//                           spec{heroPos, hero?[2], board?[], potTotal?, toCall?, seats:[{pos, name?, stack?, bet?, action?, active?, folded?}],
//                           blinds?, order?('preflop'|'postflop'), focus?('pot'|'toCall'|자리)}.
//                           자리 배치는 고정: 위 줄 BB, UTG, HJ / 가운데 펠트(보드, 팟 줄) / 아래 줄 SB, BTN, CO(시계 방향 = 말하는 방향).
//                           seats에 없는 자리는 빈 자리(히어로 자리는 seats에 없어도 앉아 있다). 딜러 버튼은 늘 BTN.
//                           blinds면 앉아 있는 SB 0.5bb, BB 1bb 칩(그 자리에 bet이 있으면 bet). order면 앉아 있고 폴드하지 않은 자리에
//                           말하는 순서 번호(프리플랍 UTG, HJ, CO, BTN, SB, BB / 플랍부터 SB, BB, UTG, HJ, CO, BTN, 계약 L3 order와 같은 표).
//                           팟 줄 글은 scene의 _potLine과 같고(다만 toCall이 0이면 ring처럼 '콜 0bb'를 붙인다),
//                           focus 'pot'|'toCall'이면 그 부분만 강조, focus가 자리면 그 자리 강조.
//   bar(spec)               (M3-P1a) 막대. 계약 L2 bar.
//                           {kind:'amount', rows:[{label, bb, hl?}]}: 가장 큰 bb를 끝으로 한 bb 막대(팟, 스택, 콜 금액).
//                           {kind:'equity', rows:[{label, precalc} | {label, exact:{hero, vs, board}}]}: 0~100% 승률 막대, 값을 모르면 '?'.
//                           {kind:'compare', precalc | exact, need:{potTotal, toCall}, hero?, board?}: ring과 같은 축(AXIS)에
//                           필요 승률 막대, 내 승률 막대, 콜/폴드 바늘(판정 규칙도 ring과 같다). 이름표는 축 왼쪽(x0 - 8)에 붙는다.
//   compareScene(spec)      (M3-P1a) 세 사람의 속마음 3열. spec{cols:[{who, text}], mine?(열 번호 0부터 = 강조, 글 = 아래 줄)}. 렌더만.
//   sum(spec)               (M3-P1a) 한 줄 정리 카드. spec{text}. {{이름}}은 vars(spec)로 채우고 모르면 '?'.
//   eqExact(hero, vs, board) (M3-P1a) 특정 손 대 특정 손의 히어로 에쿼티 0~1. 보드 3~5장, 남은 카드 전부 열거(무승부 반).
//                           카드는 배열(['Ah','Kd'] 또는 {rank,suit}) 또는 이은 글자('AhKd'). HandEval이 없거나 입력이 틀리면 null.
//   render(obj)             obj.t로 디스패치('cards', 'grid', 'ring', 'scene', 'table', 'bar', 'compare', 'sum', t 없음은 scene).
//                           그 밖의 t(say, ask, widget 등, LessonPlayer 몫)는 ''. 캡션과 label 칩은 LessonPlayer가 그린다.
//   보조: need(potTotal, toCall), rangeInfo(spec), cellAction(spec, hand), handRC(hand), vars(obj), parseCard(x)
//   vars(obj)               ring: pct=need=필요 승률, grid: pct=레인지 %, bar: eq=첫 줄 승률 %(equity의 둘째 줄부터 eq2, eq3...),
//                           need=need 객체의 필요 승률, potTotal/toCall(need 객체에서), table: potTotal, toCall, need, pct.
var SceneRender = (function() {
  var RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
  var SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  var SYM_SUIT = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };
  var SUIT_KO = { s: '스페이드', h: '하트', d: '다이아', c: '클럽' };
  var RANK_KO = { A: '에이스', K: '킹', Q: '퀸', J: '잭', T: '10' };
  var RED = { h: true, d: true };
  var ACTS = ['raise', 'call', 'fold', 'none'];

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  // bb 숫자 표기: 소수 둘째 자리까지, 뒤의 0은 지운다(15, 7.5, 2.25)
  function _num(x) { var v = Math.round(Number(x) * 100) / 100; return String(v === 0 ? 0 : v); }
  function _has(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

  // ── 카드 ──
  function parseCard(x) {
    var rank, suit;
    if (!x) return null;
    if (typeof x === 'object') { rank = x.rank; suit = x.suit; }
    else if (typeof x === 'string') {
      var s = x.trim();
      if (s.length === 3 && s.slice(0, 2) === '10') { rank = 'T'; suit = s.charAt(2); }
      else if (s.length === 2) { rank = s.charAt(0); suit = s.charAt(1); }
      else return null;
    } else return null;
    rank = String(rank == null ? '' : rank).toUpperCase();
    if (rank === '10') rank = 'T';
    suit = String(suit == null ? '' : suit);
    suit = SYM_SUIT[suit] || suit.toLowerCase();
    if (RANKS.indexOf(rank) < 0 || !SUIT_SYM[suit]) return null;
    return { rank: rank, suit: suit };
  }

  function _rankText(r) { return r === 'T' ? '10' : r; }

  function _cardHTML(c, opts) {
    var cls = 'card sr-card' + (opts.size === 'sm' ? ' sr-sm' : opts.size === 'xs' ? ' sr-xs' : '') +
      (opts.cls ? ' ' + _esc(opts.cls) : '');
    if (!c) return '<div class="' + cls + ' back" role="img" aria-label="가린 카드"></div>';
    var name = (RANK_KO[c.rank] || c.rank) + ' ' + SUIT_KO[c.suit];
    return '<div class="' + cls + ' ' + (RED[c.suit] ? 'red' : 'black') + (opts.hero ? ' hero-card' : '') +
      '" data-suit="' + c.suit + '" role="img" aria-label="' + name + '">' + _rankText(c.rank) + SUIT_SYM[c.suit] + '</div>';
  }

  function cards(list, opts) {
    opts = opts || {};
    var arr = Array.isArray(list) ? list : (list == null ? [] : [list]);
    var html = arr.map(function(x) { return _cardHTML(parseCard(x), opts); }).join('');
    var empty = Math.max(0, (Number(opts.slots) || 0) - arr.length);
    var slotCls = 'sr-slot' + (opts.size === 'sm' ? ' sr-sm' : opts.size === 'xs' ? ' sr-xs' : '');
    for (var i = 0; i < empty; i++) html += '<div class="' + slotCls + '" aria-hidden="true"></div>';
    if (opts.bare) return html;
    return '<div class="sr-cards">' + html + '</div>';
  }

  // ── 13x13 격자 ──
  // GtoChart.comboLabel과 같은 규칙: r===c 페어, r<c 수딧(행 랭크가 높음), r>c 오프수트(열 랭크가 높음)
  function _label(r, c) {
    if (r === c) return RANKS[r] + RANKS[r];
    if (r < c) return RANKS[r] + RANKS[c] + 's';
    return RANKS[c] + RANKS[r] + 'o';
  }
  function _okIdx(x) { return typeof x === 'number' && isFinite(x) && x >= 0 && x <= 12 && Math.floor(x) === x; }

  function _rcOfCards(a, b) {
    var i1 = RANKS.indexOf(a.rank), i2 = RANKS.indexOf(b.rank);
    if (i1 === i2) return { r: i1, c: i1 };
    var hi = Math.min(i1, i2), lo = Math.max(i1, i2);
    return a.suit === b.suit ? { r: hi, c: lo } : { r: lo, c: hi };
  }

  // 'AKs' | 'AKo' | 'TT' | 'AhKd' | ['Ah','Kd'] | [{rank,suit},{rank,suit}] -> {r, c} | null
  function handRC(h) {
    if (Array.isArray(h)) {
      var a = parseCard(h[0]), b = parseCard(h[1]);
      return (a && b && h.length === 2) ? _rcOfCards(a, b) : null;
    }
    if (typeof h !== 'string') return null;
    var s = h.trim();
    var m = /^(10|[2-9TJQKA])([shdc])(10|[2-9TJQKA])([shdc])$/i.exec(s);
    if (m) {
      var c1 = parseCard(m[1] + m[2]), c2 = parseCard(m[3] + m[4]);
      return (c1 && c2) ? _rcOfCards(c1, c2) : null;
    }
    m = /^([2-9TJQKA])([2-9TJQKA])([so])?$/i.exec(s);
    if (!m) return null;
    var i1 = RANKS.indexOf(m[1].toUpperCase()), i2 = RANKS.indexOf(m[2].toUpperCase());
    var kind = (m[3] || '').toLowerCase();
    if (i1 === i2) return kind ? null : { r: i1, c: i1 };
    if (!kind) return null;
    var hi = Math.min(i1, i2), lo = Math.max(i1, i2);
    return kind === 's' ? { r: hi, c: lo } : { r: lo, c: hi };
  }

  function _chartOk() {
    return typeof GtoChart !== 'undefined' && GtoChart && typeof GtoChart.buildChartModel === 'function' &&
      typeof Gto !== 'undefined' && Gto && Gto.GTO_RANGES;
  }
  function _facing(spec) { return (spec && spec.facing !== undefined && spec.facing !== null) ? spec.facing : false; }

  function _model(spec) {
    if (!spec || !spec.pos || !_chartOk()) return null;
    return GtoChart.buildChartModel(spec.pos, _facing(spec), spec.opener || undefined);
  }

  function _allNone(model) {
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) if (model.cells[r][c].action !== 'none') return false;
    return true;
  }

  function _weight(r, c) { return r === c ? 6 : (r < c ? 4 : 12); }

  // 모델 셀을 콤보 수로 센다(1326 기준 비율)
  function _countModel(model) {
    var n = { raise: 0, call: 0, fold: 0, none: 0 };
    for (var r = 0; r < 13; r++) for (var c = 0; c < 13; c++) n[model.cells[r][c].action] += _weight(r, c);
    return { raise: n.raise / 1326, call: n.call / 1326, fold: n.fold / 1326, none: n.none / 1326 };
  }

  // spec의 레인지 배열(buildChartModel과 같은 선택 규칙, 퍼센트 계산의 독립 경로)
  function _arrays(spec) {
    if (typeof Gto === 'undefined' || !Gto || !Gto.GTO_RANGES || !spec || !spec.pos) return null;
    var G = Gto.GTO_RANGES, pos = spec.pos, f = _facing(spec);
    if (!f) return G.rfi[pos] ? { raise: G.rfi[pos], call: [] } : null;
    if (f === true) {
      var late = spec.opener === 'CO' || spec.opener === 'BTN' || spec.opener === 'SB';
      var vs = (pos === 'BB' && late && G.vsRfiBB_LP) ? G.vsRfiBB_LP : G.vsRfi[pos];
      return vs ? { raise: vs.threebet, call: vs.call } : null;
    }
    if (f === 'vs3bet') return G.vs3bet[pos] ? { raise: G.vs3bet[pos].fourbet, call: G.vs3bet[pos].call } : null;
    if (f === 'vs4bet') return G.vs4bet[pos] ? { raise: G.vs4bet[pos].fivebet, call: G.vs4bet[pos].call } : null;
    if (f === 'cold3bet') return G.vsCold3bet ? { raise: G.vsCold3bet.fourbet, call: G.vsCold3bet.call } : null;
    return null;
  }

  // 레인지 비율(0~1): total = 참여(레이즈+콜), raise, call. 숫자는 Coach.rangePct(설계서 3.1절 4번), 없으면 모델 셈.
  function rangeInfo(spec) {
    var arr = _arrays(spec);
    if (arr && typeof Coach !== 'undefined' && Coach && typeof Coach.rangePct === 'function') {
      var total = Coach.rangePct(arr.raise.concat(arr.call));
      var raise = Coach.rangePct(arr.raise);
      return { total: total, raise: raise, call: Math.max(0, total - raise) };
    }
    var m = _model(spec);
    if (!m || _allNone(m)) return null;
    var n = _countModel(m);
    return { total: n.raise + n.call, raise: n.raise, call: n.call };
  }

  function cellAction(spec, hand) {
    var m = _model(spec), rc = handRC(hand);
    return (m && rc) ? m.cells[rc.r][rc.c].action : null;
  }

  function _raiseWord(f) {
    if (!f) return '오픈';
    if (f === true) return '3벳';
    if (f === 'vs4bet') return '5벳 올인';
    return '4벳';
  }
  function _actWord(act, f) {
    if (act === 'raise') return _raiseWord(f);
    return { call: '콜', fold: '폴드', none: '차트 없음' }[act] || '';
  }

  function _headTitle(spec) {
    var pos = _esc(spec.pos), f = _facing(spec);
    if (!f) return pos + ' 오픈';
    if (f === true) return pos + ', ' + (spec.opener ? _esc(spec.opener) + ' 오픈을 맞음' : '상대 오픈을 맞음');
    if (f === 'vs3bet') return pos + ', 내 오픈에 3벳을 맞음';
    if (f === 'vs4bet') return pos + ', 내 3벳에 4벳을 맞음';
    if (f === 'cold3bet') return pos + ', 앞에서 오픈과 3벳이 나옴';
    return pos;
  }

  function _pctText(spec) {
    var ri = rangeInfo(spec);
    if (!ri) return '';
    var f = _facing(spec);
    var t = Math.round(ri.total * 100);
    if (!f) return '상위 약 ' + t + '%';
    var a = Math.round(ri.raise * 100), b = Math.max(0, t - a);
    var parts = '(' + _raiseWord(f) + ' ' + a + '%' + (ri.call > 0 ? ', 콜 ' + b + '%' : '') + ')';
    // 아직 행동하지 않은 자리(vs 오픈, 콜드 3벳)는 전체 손이 곧 내 레인지라 '참여 n%'가 그대로 빈도다.
    // vs3bet/vs4bet은 이미 오픈(3벳)한 손만 남아 있으므로 전체 손 기준임을 밝혀 '오픈한 손의 n%'로 오해하지 않게 한다.
    if (f === true || f === 'cold3bet') return '참여 약 ' + t + '%' + parts;
    return '전체 손의 약 ' + t + '%로 계속' + parts;
  }

  function _legendHTML(spec, layers) {
    var items;
    if (layers) {
      items = layers.map(function(p, k) {
        return '<span><i class="sr-sw sr-l' + k + '"></i>' + _esc(p) + '</span>';
      });
      items.push('<span><i class="sr-sw gto-fold"></i>폴드</span>');
    } else {
      var f = _facing(spec), ri = _arrays(spec);
      items = ['<span><i class="sr-sw gto-raise"></i>' + _raiseWord(f) + '</span>'];
      if (f && ri && ri.call && ri.call.length) items.push('<span><i class="sr-sw gto-call"></i>콜</span>');
      items.push('<span><i class="sr-sw gto-fold"></i>폴드</span>');
    }
    return '<div class="sr-legend">' + items.join('') + '</div>';
  }

  // spec.layers(오픈 포지션 목록, 좁은 자리부터): 셀마다 처음 오픈에 들어가는 층 번호. 없으면 -1(폴드).
  function _layerGrid(layers) {
    var models = layers.map(function(p) { return GtoChart.buildChartModel(p, false); });
    var out = [];
    for (var r = 0; r < 13; r++) {
      var row = [];
      for (var c = 0; c < 13; c++) {
        var k = -1;
        for (var i = 0; i < models.length; i++) if (models[i].cells[r][c].action === 'raise') { k = i; break; }
        row.push(k);
      }
      out.push(row);
    }
    return out;
  }

  function _zoomHTML(r, actAt, sel, f, blank) {
    var rk = RANKS[r] === 'T' ? 'T(10)' : RANKS[r];
    var h = '<div class="sr-zoom" data-row="' + r + '" role="group" aria-label="' + rk + ' 줄 크게 보기">' +
      '<div class="sr-zhead"><span>' + rk + ' 줄에서 손을 고르세요</span>' +
      '<button type="button" class="sr-zback" data-tap="back">닫기</button></div><div class="sr-zcells">';
    for (var c = 0; c < 13; c++) {
      var act = actAt(r, c);
      var on = !!(sel && sel.col === c);
      var lb = _label(r, c);
      h += '<button type="button" class="sr-zcell ' + (act ? 'gto-' + act : 'sr-blank') + (on ? ' sr-sel' : '') +
        '" data-tap="col" data-r="' + r + '" data-c="' + c + '" data-hand="' + lb + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<b>' + lb + '</b>' + (act && !blank ? '<small>' + _actWord(act, f) + '</small>' : '') + '</button>';
    }
    return h + '</div></div>';
  }

  function _normSel(s) {
    if (!s || typeof s !== 'object' || !_okIdx(s.row)) return null;
    if (_okIdx(s.col)) return { row: s.row, col: s.col, hand: _label(s.row, s.col) };
    return { row: s.row };
  }

  function grid(spec, opts) {
    spec = spec || {};
    opts = opts || {};
    var mini = !!opts.mini;
    var pick = !mini && (!!opts.pick || _has(opts, 'sel'));
    var sel = pick ? _normSel(opts.sel) : null;
    var layers = (Array.isArray(spec.layers) && spec.layers.length && _chartOk()) ? spec.layers.slice(0, 6) : null;
    var blank = !!opts.blank || (!spec.pos && !layers);
    var f = layers ? false : _facing(spec);
    var model = null, lay = null;
    if (!blank) {
      if (layers) lay = _layerGrid(layers);
      else {
        model = _model(spec);
        if (!model) return '';
        if (_allNone(model)) {
          var msg = (!f && spec.pos === 'BB') ? 'BB: 오픈 레인지가 없어요(모두 폴드하면 BB가 팟을 가져가요)'
            : _esc(spec.pos) + ': 이 상황의 차트가 없어요';
          return '<div class="sr-grid sr-grid-empty' + (mini ? ' sr-mini' : '') + '"><p>' + msg + '</p></div>';
        }
      }
    }
    var actAt = function(r, c) {
      if (blank) return null;
      if (lay) return lay[r][c] >= 0 ? 'raise' : 'fold';
      return model.cells[r][c].action;
    };

    var hl = {};
    (Array.isArray(spec.highlight) ? spec.highlight : []).forEach(function(h) {
      var rc = handRC(h);
      if (rc) hl[rc.r + ',' + rc.c] = true;
    });

    var cells = '';
    for (var r = 0; r < 13; r++) {
      for (var c = 0; c < 13; c++) {
        var act = actAt(r, c);
        var lb = _label(r, c);
        var k = lay ? lay[r][c] : -1;
        var cls = 'sr-cell gto-cell ' + (act ? 'gto-' + act : 'sr-blank') +
          (k >= 0 ? ' sr-l' + k + ' sr-lay' : '') +
          (hl[r + ',' + c] ? ' sr-hl' : '') +
          (sel && sel.row === r ? ' sr-on' : '') +
          (sel && sel.row === r && sel.col === c ? ' sr-sel' : '');
        cells += '<div class="' + cls + '" data-r="' + r + '" data-c="' + c + '" data-hand="' + lb + '"' +
          (act ? ' data-act="' + act + '"' : '') + (k >= 0 ? ' data-layer="' + k + '" style="--sr-l:' + k + '"' : '') +
          (pick ? ' data-tap="row"' : '') + '><span class="sr-lb">' + lb + '</span></div>';
      }
      if (sel && sel.row === r) cells += _zoomHTML(r, actAt, sel, f, blank);
    }

    var head = '';
    if (opts.head !== false) {
      if (layers) {
        head = '<div class="sr-ghead"><b>오픈 레인지가 자라는 순서</b><span class="sr-gpct">' +
          layers.map(function(p) { return _esc(p) + ' ' + Math.round((rangeInfo({ pos: p, facing: false }) || { total: 0 }).total * 100) + '%'; }).join(', ') +
          '</span><span class="sr-tag">이 앱 차트 기준</span></div>';
      } else if (!blank) {
        var pt = _pctText(spec);
        head = '<div class="sr-ghead"><b>' + _headTitle(spec) + '</b>' + (pt ? '<span class="sr-gpct">' + pt + '</span>' : '') +
          '<span class="sr-tag">이 앱 차트 기준</span></div>';
      }
    }
    var legend = (!blank && opts.legend !== false) ? _legendHTML(spec, layers) : '';
    var aria = blank ? '13x13 손 격자' : (layers ? '오픈 레인지 층 격자' : _headTitle(spec) + ' 13x13 격자');
    var gcls = 'sr-grid' + (mini ? ' sr-mini' : '') + (pick ? ' sr-pick' : '') + (sel ? ' sr-has-sel' : '') + (blank ? ' sr-blank-grid' : '');
    return '<div class="' + gcls + '"' + (spec.pos ? ' data-pos="' + _esc(spec.pos) + '"' : '') + ' data-facing="' + _esc(String(f)) + '">' +
      head +
      '<div class="sr-gcells" role="' + (pick ? 'group' : 'img') + '" aria-label="' + aria + (pick ? ', 줄을 누르면 그 줄이 커져요' : '') + '">' + cells + '</div>' +
      legend + '</div>';
  }

  // 2단계 선택(설계서 5.9절 6번). 입력 state는 바꾸지 않고 새 객체를 돌려준다.
  //   null + {row}           -> {row}
  //   {row} + {col}          -> {row, col, hand}
  //   {row, col} + {col}     -> 같은 줄에서 다른 열로
  //   아무 상태 + {row:다른 줄} -> {row:다른 줄}(같은 줄 다시 누르기는 그대로, 두 번 눌림 대비)
  //   null + {col}           -> null(줄을 먼저 골라야 한다)
  //   {row, col} + {back}    -> {row},  {row} + {back} -> null,  {reset} -> null
  //   {row, col} 동시        -> 바로 {row, col, hand}(데스크톱 정밀 클릭)
  function gridSelect(state, tap) {
    var st = _normSel(state);
    if (!tap || typeof tap !== 'object') return tap === 'back' ? gridSelect(st, { back: true }) : st;
    if (tap.reset) return null;
    if (tap.back) return (st && _okIdx(st.col)) ? { row: st.row } : null;
    var hasRow = _okIdx(tap.row), hasCol = _okIdx(tap.col);
    if (hasRow && hasCol) return { row: tap.row, col: tap.col, hand: _label(tap.row, tap.col) };
    if (hasRow) return (st && st.row === tap.row) ? st : { row: tap.row };
    if (hasCol) return st ? { row: st.row, col: tap.col, hand: _label(st.row, tap.col) } : null;
    return st;
  }

  // DOM 레이어가 클릭한 요소의 dataset을 넘기면 tap을 만든다. 확대 줄 버튼은 줄 번호까지 담아 오래된 상태에도 안전하다.
  function tapOf(ds) {
    if (!ds) return null;
    var r = parseInt(ds.r, 10), c = parseInt(ds.c, 10);
    if (ds.tap === 'row' && _okIdx(r)) return { row: r };
    if (ds.tap === 'col' && _okIdx(c)) return _okIdx(r) ? { row: r, col: c } : { col: c };
    if (ds.tap === 'back') return { back: true };
    return null;
  }

  // ── 팟 오즈 링 ──
  function need(potTotal, toCall) {
    var p = Number(potTotal), t = Number(toCall);
    if (potTotal == null || toCall == null || !isFinite(p) || !isFinite(t) || p < 0 || t < 0 || p + t <= 0) return null;
    var n = t / (p + t);
    return { need: n, pct: Math.round(t / (p + t) * 100) };
  }

  function _eqFrac(eq) {
    if (eq == null || eq === '') return null;
    var e = Number(eq);
    if (!isFinite(e) || e < 0) return null;
    if (e > 1) e = e / 100;
    return e > 1 ? null : e;
  }

  function _f(x) { return String(Math.round(x * 10) / 10); }

  function _ringSVG(cx, cy, rad, sw, pct, frac) {
    var C = 2 * Math.PI * rad;
    return '<circle class="sr-ring-bg" cx="' + cx + '" cy="' + cy + '" r="' + rad + '" fill="none" stroke-width="' + sw + '"/>' +
      '<circle class="sr-ring-fg" cx="' + cx + '" cy="' + cy + '" r="' + rad + '" fill="none" stroke-width="' + sw + '"' +
      ' stroke-dasharray="' + _f(C * frac) + ' ' + _f(C) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')" data-need="' + pct + '"/>' +
      '<text class="sr-ring-pct" x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle">' + pct + '%</text>' +
      '<text class="sr-ring-sub" x="' + cx + '" y="' + (cy + 20) + '" text-anchor="middle">필요 승률</text>';
  }

  // 축 상수(테스트가 바늘 위치를 재계산할 때도 쓴다)
  var AXIS = { x0: 114, w: 212 };
  var ZONE_ROOM = 46; // '← 폴드' 글자 폭(뷰박스 단위)과 여백

  // 링 아래 캡션 2줄: 팟 줄(potLine이 false면 뺀다)과 계산식 줄
  function _ringCaps(p, t, pct, potLine) {
    var caps = '';
    if (potLine !== false) {
      caps += '<p class="sr-cap">' + (t > 0 ? '팟(상대 벳 포함) ' + _num(p) + 'bb, 콜 ' + _num(t) + 'bb' : '팟 ' + _num(p) + 'bb, 콜 0bb') + '</p>';
    }
    if (t > 0) caps += '<p class="sr-cap sr-formula">필요 승률 = ' + _num(t) + ' ÷ (' + _num(p) + '+' + _num(t) + ') = ' + pct + '%</p>';
    else caps += '<p class="sr-cap sr-formula">낼 돈이 없어서 필요 승률은 0%예요(공짜로 볼 수 있어요)</p>';
    return caps;
  }

  // 같은 축(0~100%)의 필요 승률 막대, 내 승률 막대, 콜/폴드 바늘(ring과 bar compare가 같은 규칙으로 쓴다).
  //   ring: 막대 이름은 축 오른쪽 끝 위에 붙인다(바늘은 필요 승률 자리라 팟에 상대 벳이 들어 있으면 50%를 넘지 않아 글자와 겹치지 않는다).
  //   bar(left): 막대 이름은 축 왼쪽(x0 - 8)에 끝을 맞춰 붙인다(링이 없는 자리).
  //   eq가 null(모름)이면 내 승률 막대와 판정 없이 축과 바늘만 그린다.
  //   낼 돈이 없으면(free, 콜 0) 콜/폴드가 아니라 체크다. 공짜 스팟에서 폴드 구역을 보여 주지 않는다(fold_free_check 실수).
  function _axis(nd, eq, free, left) {
    var pct = nd.pct, known = eq != null;
    var eqPct = known ? Math.round(eq * 100) : null;
    var verdict = !known ? 'unknown' : free ? 'check' : eqPct > pct ? 'call' : eqPct < pct ? 'fold' : 'even';
    var x0 = AXIS.x0, w = AXIS.w, x1 = x0 + w;
    var nx = x0 + w * nd.need, ex = known ? x0 + w * eq : x0;
    var vcls = 'sr-' + (!known ? 'unk' : free ? 'call' : verdict);
    var lx = left ? x0 - 8 : x1, ly1 = left ? 36 : 20, ly2 = left ? 74 : 58;
    var svg = '<text class="sr-ax-lb" x="' + lx + '" y="' + ly1 + '" text-anchor="end">필요 승률 ' + pct + '%</text>' +
      '<rect class="sr-track" x="' + x0 + '" y="26" width="' + w + '" height="12" rx="3"/>' +
      '<rect class="sr-needbar" x="' + x0 + '" y="26" width="' + _f(w * nd.need) + '" height="12" rx="3"/>' +
      '<text class="sr-ax-lb" x="' + lx + '" y="' + ly2 + '" text-anchor="end">내 승률 ' + (known ? eqPct + '%' : '?') + '</text>' +
      '<rect class="sr-track" x="' + x0 + '" y="64" width="' + w + '" height="12" rx="3"/>' +
      (known ? '<rect class="sr-eqbar" x="' + x0 + '" y="64" width="' + _f(w * eq) + '" height="12" rx="3" data-eq="' + eqPct + '"/>' : '') +
      (known && eq > nd.need ? '<rect class="sr-eqplus" x="' + _f(nx) + '" y="64" width="' + _f(ex - nx) + '" height="12"/>' : '') +
      (known && eq < nd.need ? '<rect class="sr-eqminus" x="' + _f(ex) + '" y="64.75" width="' + _f(nx - ex) + '" height="10.5"/>' : '') +
      // 콜/폴드 바늘: 필요 승률 자리. 내 승률 막대가 바늘을 넘으면 콜 쪽
      '<line class="sr-needle ' + vcls + '" x1="' + _f(nx) + '" y1="22" x2="' + _f(nx) + '" y2="86" stroke-width="3" data-x="' + _f(nx) + '"/>' +
      '<path class="sr-tip ' + vcls + '" d="M' + _f(nx - 5) + ' 94 L' + _f(nx + 5) + ' 94 L' + _f(nx) + ' 86 Z"/>' +
      // 구역 글자는 바늘 양옆에 붙인다. 바늘이 축 끝에 가까우면 화살표를 빼서 글자가 겹치지 않게 한다. 콜 0이면 구역이 없다.
      (free ? '' : '<text class="sr-zone sr-zone-fold" x="' + _f(nx - 7) + '" y="108" text-anchor="end">' + (nx - x0 >= ZONE_ROOM ? '← 폴드' : '폴드') + '</text>' +
      '<text class="sr-zone sr-zone-call" x="' + _f(Math.min(nx + 7, x1 - 26)) + '" y="108" text-anchor="start">' + (x1 - nx >= ZONE_ROOM ? '콜 →' : '콜') + '</text>') +
      '<text class="sr-tick" x="' + x0 + '" y="124" text-anchor="start">0</text>' +
      '<text class="sr-tick" x="' + _f(x0 + w / 2) + '" y="124" text-anchor="middle">50</text>' +
      '<text class="sr-tick" x="' + x1 + '" y="124" text-anchor="end">100%</text>';
    var vtxt = !known ? ''
      : free ? '<span aria-hidden="true">✅</span> 체크: 낼 돈이 없으니 폴드하지 말고 공짜로 봐요'
      : verdict === 'call' ? '<span aria-hidden="true">✅</span> 콜이 이득: 내 승률 ' + eqPct + '% &gt; 필요 ' + pct + '%'
      : verdict === 'fold' ? '<span aria-hidden="true">✋</span> 폴드가 나아요: 내 승률 ' + eqPct + '% &lt; 필요 ' + pct + '%'
      : '<span aria-hidden="true">⚖</span> 본전: 내 승률 ' + eqPct + '% = 필요 ' + pct + '%';
    var vword = !known ? '내 승률 모름' : free ? '체크(공짜)' : verdict === 'call' ? '콜이 이득' : verdict === 'fold' ? '폴드가 나아요' : '본전';
    var aria = '필요 승률 ' + pct + '%, ' + (known ? '내 승률 ' + eqPct + '%, ' + vword : vword);
    return { svg: svg, eqPct: eqPct, verdict: verdict, vcls: vcls, vtxt: vtxt, aria: aria };
  }

  function ring(spec, opts) {
    spec = spec || {};
    opts = opts || {};
    var nd = need(spec.potTotal, spec.toCall);
    if (!nd) return '';
    var p = Number(spec.potTotal), t = Number(spec.toCall);
    var pct = nd.pct;
    var eq = _eqFrac(spec.eq);
    var caps = _ringCaps(p, t, pct, opts.potLine);

    if (eq == null) {
      return '<div class="sr-ringbox is-solo" data-need="' + pct + '">' +
        '<svg class="sr-ring-svg" viewBox="0 0 120 120" role="img" aria-label="필요 승률 ' + pct + '%" xmlns="http://www.w3.org/2000/svg">' +
        _ringSVG(60, 58, 44, 12, pct, nd.need) + '</svg>' + caps + '</div>';
    }

    var ax = _axis(nd, eq, !(t > 0), false);
    return '<div class="sr-ringbox is-axis" data-need="' + pct + '" data-eq="' + ax.eqPct + '" data-verdict="' + ax.verdict + '">' +
      '<svg class="sr-ring-svg" viewBox="0 0 340 130" role="img" aria-label="' + ax.aria + '" xmlns="http://www.w3.org/2000/svg">' +
      _ringSVG(54, 58, 38, 11, pct, nd.need) + ax.svg + '</svg>' + caps + '<p class="sr-verdict ' + ax.vcls + '">' + ax.vtxt + '</p></div>';
  }

  // ── 장면 조합(C3) ──
  function _row(cls, key, html) {
    return '<div class="sr-row ' + cls + '"><span class="sr-k">' + key + '</span>' + html + '</div>';
  }

  // 팟 줄 조각(설계서 8.4절 표기, scene과 table이 같은 글을 쓴다). k: 'pot' | 'call' | 'stack'
  function _potParts(o) {
    var hasPot = o.potTotal != null && isFinite(Number(o.potTotal));
    var hasCall = o.toCall != null && isFinite(Number(o.toCall)) && Number(o.toCall) > 0;
    var hasStack = o.stack != null && isFinite(Number(o.stack));
    var parts = [];
    if (hasPot) {
      parts.push({ k: 'pot', s: (hasCall ? '팟(상대 벳 포함) ' : '팟 ') + _num(o.potTotal) + 'bb' });
      if (hasCall) parts.push({ k: 'call', s: '콜 ' + _num(o.toCall) + 'bb' });
    } else if (hasCall) parts.push({ k: 'call', s: '콜 ' + _num(o.toCall) + 'bb' });
    if (hasStack) parts.push({ k: 'stack', s: '스택 ' + _num(o.stack) + 'bb' });
    return parts;
  }

  function _potLine(o) {
    var parts = _potParts(o);
    return parts.length ? '<p class="sr-line sr-pot">' + parts.map(function(p) { return p.s; }).join(', ') + '</p>' : '';
  }

  function _seatsHTML(seats) {
    var chips = seats.filter(function(s) { return s && s.pos; }).map(function(s) {
      return '<span class="sr-seat' + (s.active ? ' is-active' : '') + (s.hero ? ' is-hero' : '') + '">' +
        (s.active ? '<span aria-hidden="true">▶</span>' : '') + '<b>' + _esc(s.pos) + '</b>' + (s.hero ? '(나)' : '') +
        (s.label ? ' ' + _esc(s.label) : '') + '</span>';
    });
    return chips.length ? _row('sr-seats', '자리', '<div class="sr-chips">' + chips.join('') + '</div>') : '';
  }

  function _pairOf(x) {
    var s = typeof x === 'string' ? x.trim() : '';
    var m = /^(10|[2-9TJQKA])([shdc])(10|[2-9TJQKA])([shdc])$/i.exec(s);
    var a = m && parseCard(m[1] + m[2]), b = m && parseCard(m[3] + m[4]);
    return (a && b && (a.rank !== b.rank || a.suit !== b.suit)) ? [a, b] : null;
  }
  function _ck(a, b) { var x = a.rank + a.suit, y = b.rank + b.suit; return x < y ? x + y : y + x; }

  // 칩 1개가 나타내는 실제 카드 조합(내 손과 보드 카드는 뺀다). 'AhKd' 1개, 'KQs' 최대 4, 'KQo' 12, 'QQ' 6.
  // 해석할 수 없는 글자(예: 'AQs+')는 null이라 콤보 수를 세지 않는다(틀린 숫자를 보이지 않기 위해).
  function _comboKeys(x, dead) {
    var p = _pairOf(x);
    if (p) return (dead[p[0].rank + p[0].suit] || dead[p[1].rank + p[1].suit]) ? [] : [_ck(p[0], p[1])];
    var m = typeof x === 'string' ? /^([2-9TJQKA])([2-9TJQKA])([so])?$/i.exec(x.trim()) : null;
    if (!m) return null;
    var r1 = m[1].toUpperCase(), r2 = m[2].toUpperCase(), kind = (m[3] || '').toLowerCase();
    if ((r1 === r2) === !!kind) return null;
    var S4 = ['s', 'h', 'd', 'c'], out = [];
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
      if (r1 === r2 ? j <= i : (kind === 's' ? i !== j : i === j)) continue;
      var a = { rank: r1, suit: S4[i] }, b = { rank: r2, suit: S4[j] };
      if (!dead[r1 + S4[i]] && !dead[r2 + S4[j]]) out.push(_ck(a, b));
    }
    return out;
  }

  function _comboHTML(x, dead) {
    var p = _pairOf(x);
    if (p) {
      var gone = dead[p[0].rank + p[0].suit] || dead[p[1].rank + p[1].suit];
      return '<span class="sr-combo' + (gone ? ' is-dead" title="내 손이나 보드와 겹쳐 불가능한 조합' : '') + '">' +
        cards(p, { size: 'xs', bare: true }) + '</span>';
    }
    return '<span class="sr-combo sr-ctext">' + _esc(typeof x === 'string' ? x.trim() : x) + '</span>';
  }

  function _rangeHTML(rg, deadList) {
    var combos = Array.isArray(rg.combos) ? rg.combos : [];
    var dead = {};
    (deadList || []).forEach(function(c) { var pc = parseCard(c); if (pc) dead[pc.rank + pc.suit] = true; });
    var inner = '';
    if (combos.length) {
      var seen = {}, n = 0, ok = true;
      combos.forEach(function(x) {
        var ks = _comboKeys(x, dead);
        if (!ks) { ok = false; return; }
        ks.forEach(function(k) { if (!seen[k]) { seen[k] = 1; n++; } });
      });
      inner += '<div class="sr-chips">' + combos.map(function(x) { return _comboHTML(x, dead); }).join('') + '</div>' +
        (ok ? '<span class="sr-cnt">콤보 ' + n + '개</span>' : '');
    }
    if (rg.text) inner += '<span class="sr-rtext">' + _esc(rg.text) + '</span>';
    if (!inner) return '';
    return _row('sr-range', _esc(rg.label || '상대 레인지'), inner);
  }

  function scene(obj) {
    obj = obj || {};
    var parts = [];
    if (obj.hero && obj.hero.length) parts.push(_row('sr-hero', '내 손', cards(obj.hero, { hero: true })));
    if (Array.isArray(obj.board)) {
      var n = obj.board.length;
      parts.push(_row('sr-board', '보드', n ? cards(obj.board, { slots: (n >= 3 && n < 5) ? 5 : 0 })
        : '<span class="sr-none">아직 없음(프리플랍)</span>'));
    }
    var pl = _potLine(obj);
    if (pl) parts.push(pl);
    if (Array.isArray(obj.seats) && obj.seats.length) parts.push(_seatsHTML(obj.seats));
    if (obj.range && typeof obj.range === 'object') parts.push(_rangeHTML(obj.range, [].concat(obj.hero || [], obj.board || [])));
    if (obj.grid && typeof obj.grid === 'object') {
      var gs = {};
      Object.keys(obj.grid).forEach(function(k) { gs[k] = obj.grid[k]; });
      if (!Array.isArray(gs.highlight) && obj.hero && obj.hero.length === 2) gs.highlight = [obj.hero];
      parts.push(grid(gs, { mini: !!gs.mini, legend: gs.legend }));
    }
    if (obj.ring) {
      var rs = obj.ring === true ? {} : obj.ring;
      var spec = {
        potTotal: rs.potTotal != null ? rs.potTotal : obj.potTotal,
        toCall: rs.toCall != null ? rs.toCall : obj.toCall,
        eq: rs.eq != null ? rs.eq : obj.eq
      };
      var same = Number(spec.potTotal) === Number(obj.potTotal) && Number(spec.toCall) === Number(obj.toCall) && pl.indexOf('팟') >= 0;
      parts.push(ring(spec, { potLine: !same }));
    }
    if (obj.note) parts.push('<p class="sr-note">' + _esc(obj.note) + '</p>');
    return '<div class="sr-scene">' + parts.join('') + '</div>';
  }

  // { t:'cards', cards:[...] } 또는 { t:'cards', rows:[{label, cards, note?, hl?}], compare? } (족보 사다리, 비교 2열)
  function _cardsScene(o) {
    if (Array.isArray(o.rows)) {
      var rows = o.rows.map(function(row) {
        row = row || {};
        return '<div class="sr-crow' + (row.hl ? ' is-hl' : '') + '">' +
          (row.label ? '<span class="sr-k">' + _esc(row.label) + '</span>' : '') +
          cards(row.cards || [], { size: 'sm' }) +
          (row.note ? '<span class="sr-cnote">' + _esc(row.note) + '</span>' : '') + '</div>';
      });
      return '<div class="sr-cardscene ' + (o.compare ? 'sr-ccmp' : 'sr-ladder') + '">' + rows.join('') + '</div>';
    }
    return '<div class="sr-cardscene">' + cards(o.cards || o.list || [], { hero: !!o.hero }) + '</div>';
  }

  // ── 테이블 그림(M3-P1a) ──
  var SEATS6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  // 말하는 순서(계약 L3 order와 같은 표)
  var ORDER = { preflop: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'], postflop: ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'] };
  // 고정 배치: 위 줄 왼쪽부터, 아래 줄 왼쪽부터. 시계 방향으로 UTG, HJ, CO, BTN, SB, BB가 이어진다.
  var TABLE_TOP = ['BB', 'UTG', 'HJ'], TABLE_BOT = ['SB', 'BTN', 'CO'];
  var BLIND = { SB: 0.5, BB: 1 };

  function _isNum(x) { return x != null && x !== '' && isFinite(Number(x)); }

  function _seatMap(seats) {
    var m = {};
    (Array.isArray(seats) ? seats : []).forEach(function(s) {
      if (s && typeof s === 'object' && SEATS6.indexOf(s.pos) >= 0 && !m[s.pos]) m[s.pos] = s;
    });
    return m;
  }

  // 말하는 순서 번호: 앉아 있고 폴드하지 않은 자리만 센다
  function _orderNums(street, map, heroPos) {
    var list = ORDER[street];
    if (!list) return null;
    var out = {}, n = 0;
    list.forEach(function(p) {
      var s = map[p];
      if ((s || p === heroPos) && !(s && s.folded)) out[p] = ++n;
    });
    return out;
  }

  function _seatHTML(pos, spec, map, nums, row) {
    var s = map[pos], hero = pos === spec.heroPos, sat = !!s || hero;
    var folded = !!(s && s.folded), active = !!(s && s.active) && !folded, focus = spec.focus === pos;
    var cls = 'sr-tseat sr-t' + row + (hero ? ' is-hero' : '') + (sat ? '' : ' is-empty') + (folded ? ' is-folded' : '') +
      (active ? ' is-active' : '') + (focus ? ' is-focus' : '');
    var head = '<div class="sr-tsh">' +
      (nums && nums[pos] ? '<span class="sr-ord" aria-label="말하는 순서 ' + nums[pos] + '번">' + nums[pos] + '</span>' : '') +
      (active ? '<span class="sr-tact" aria-label="차례">▶</span>' : '') +
      '<b class="sr-tpos">' + pos + '</b>' +
      (hero ? '<span class="sr-me">나</span>' : '') +
      (pos === 'BTN' ? '<span class="sr-dealer" role="img" aria-label="딜러 버튼">D</span>' : '') + '</div>';
    var body = '';
    if (!sat) body += '<div class="sr-tname sr-tempty">빈 자리</div>';
    // 히어로 자리는 머리 줄의 '나' 표시가 이름 역할을 하므로 name '나'를 한 번 더 쓰지 않는다(S1 데이터가 name '나'를 적음)
    if (s && s.name != null && s.name !== '' && !(hero && String(s.name).trim() === '나')) body += '<div class="sr-tname">' + _esc(s.name) + '</div>';
    if (hero && Array.isArray(spec.hero) && spec.hero.length) body += cards(spec.hero, { hero: true, size: 'sm' });
    if (s && _isNum(s.stack)) body += '<div class="sr-tstack">스택 ' + _num(s.stack) + 'bb</div>';
    if (s && s.action != null && s.action !== '') body += '<div class="sr-say">' + _esc(s.action) + '</div>';
    else if (folded) body += '<div class="sr-say sr-sfold">폴드</div>';
    var bet = null, blind = false;
    if (s && _isNum(s.bet) && Number(s.bet) > 0) bet = Number(s.bet);
    else if (spec.blinds && sat && !folded && BLIND[pos] != null) { bet = BLIND[pos]; blind = true; }
    if (bet != null) {
      body += '<div class="sr-tbet' + (blind ? ' sr-blind' : '') + '" data-bb="' + _num(bet) + '"' +
        (blind ? ' aria-label="' + (pos === 'SB' ? '스몰' : '빅') + ' 블라인드 ' + _num(bet) + 'bb"' : '') + '>' +
        '<i class="sr-chipi" aria-hidden="true"></i>' + _num(bet) + 'bb</div>';
    }
    return '<div class="' + cls + '" data-pos="' + pos + '">' + head + body + '</div>';
  }

  function table(spec) {
    spec = spec || {};
    var map = _seatMap(spec.seats);
    var heroPos = SEATS6.indexOf(spec.heroPos) >= 0 ? spec.heroPos : null;
    var sp = {};
    Object.keys(spec).forEach(function(k) { sp[k] = spec[k]; });
    sp.heroPos = heroPos;
    var street = (spec.order === 'preflop' || spec.order === 'postflop') ? spec.order : null;
    var nums = street ? _orderNums(street, map, heroPos) : null;
    var seatRow = function(list, row) {
      return '<div class="sr-trow sr-trow-' + row + '">' + list.map(function(p) { return _seatHTML(p, sp, map, nums, row); }).join('') + '</div>';
    };
    // 펠트: 보드와 팟 줄(_potLine과 같은 글, focus면 그 부분 강조)
    var felt = '';
    if (Array.isArray(spec.board)) {
      var n = spec.board.length;
      felt += n ? cards(spec.board, { size: 'sm', slots: (n >= 3 && n < 5) ? 5 : 0 }) : '<span class="sr-none">보드 없음(프리플랍)</span>';
    }
    var parts = _potParts({ potTotal: spec.potTotal, toCall: spec.toCall });
    // 낼 돈이 0이라고 적은 장면(체크할 수 있는 자리)은 '콜 0bb'도 쓴다. ring의 공짜 줄('팟 Xbb, 콜 0bb')과 같은 표기이고
    // focus 'toCall'이 강조할 자리가 생긴다(scene의 _potLine은 0이면 콜을 빼지만 테이블은 콜 금액을 보여 주는 그림이다).
    if (_isNum(spec.toCall) && Number(spec.toCall) === 0) parts.push({ k: 'call', s: '콜 0bb' });
    if (parts.length) {
      var fk = spec.focus === 'pot' ? 'pot' : spec.focus === 'toCall' ? 'call' : null;
      felt += '<p class="sr-line sr-pot sr-tpot">' + parts.map(function(p) {
        return '<span class="sr-p' + p.k + (fk === p.k ? ' is-focus' : '') + '">' + p.s + '</span>';
      }).join(', ') + '</p>';
    }
    var extra = '';
    if (!heroPos && Array.isArray(spec.hero) && spec.hero.length) extra += _row('sr-hero', '내 손', cards(spec.hero, { hero: true }));
    if (street) {
      extra += '<p class="sr-tnote"><span aria-hidden="true">↻</span> 번호는 말하는 순서(' + (street === 'preflop' ? '프리플랍' : '플랍부터') +
        '), 시계 방향으로 돌아요</p>';
    }
    return '<div class="sr-table" role="group" aria-label="6인 테이블' + (heroPos ? ', 나는 ' + heroPos : '') + '"' +
      (street ? ' data-order="' + street + '"' : '') + '>' +
      seatRow(TABLE_TOP, 'top') + '<div class="sr-felt">' + felt + '</div>' + seatRow(TABLE_BOT, 'bot') + extra + '</div>';
  }

  // ── 정확 에쿼티(M3-P1a): 특정 손 대 특정 손, 남은 카드 전부 열거 ──
  var EQ_RANKS = '23456789TJQKA', EQ_SUITS = 'shdc';
  function _cardList(x) {
    var out = [];
    if (Array.isArray(x)) {
      for (var i = 0; i < x.length; i++) { var c = parseCard(x[i]); if (!c) return null; out.push(c); }
      return out;
    }
    if (typeof x !== 'string') return null;
    var s = x.replace(/[\s,]+/g, ''), re = /^(10|[2-9TJQKA])([shdc♠♥♦♣])/i, m;
    while (s.length) {
      m = re.exec(s);
      if (!m) return null;
      var pc = parseCard(m[1] + m[2]);
      if (!pc) return null;
      out.push(pc);
      s = s.slice(m[0].length);
    }
    return out;
  }
  function _ci(c) { return EQ_RANKS.indexOf(c.rank) * 4 + EQ_SUITS.indexOf(c.suit); }
  var _eqCache = {}, _eqCacheN = 0;

  function eqExact(hero, vs, board) {
    if (typeof HandEval === 'undefined' || !HandEval || typeof HandEval.evaluateIdx !== 'function' ||
      typeof HandEval.compareHands !== 'function') return null;
    var h = _cardList(hero), v = _cardList(vs), b = _cardList(board);
    if (!h || !v || !b || h.length !== 2 || v.length !== 2 || b.length < 3 || b.length > 5) return null;
    var all = h.concat(v, b).map(_ci), dead = {};
    for (var i = 0; i < all.length; i++) { if (dead[all[i]]) return null; dead[all[i]] = 1; }
    var key = all.slice(0, 2).sort().join('.') + '|' + all.slice(2, 4).sort().join('.') + '|' + all.slice(4).sort().join('.');
    if (_has(_eqCache, key)) return _eqCache[key];
    var rest = [];
    for (var c = 0; c < 52; c++) if (!dead[c]) rest.push(c);
    var bi = all.slice(4), need = 5 - bi.length;
    var H = [all[0], all[1]].concat(bi), V = [all[2], all[3]].concat(bi);
    var evalIdx = HandEval.evaluateIdx, cmp = HandEval.compareHands, win = 0, tie = 0, tot = 0;
    var one = function() {
      var r = cmp(evalIdx(H), evalIdx(V));
      if (r < 0) win++; else if (r === 0) tie++;
      tot++;
    };
    // 손 2장 + 보드 = 7장. 플랍이면 [5], [6] 두 장, 턴이면 [6] 한 장을 남은 카드 전부로 채운다.
    if (need === 0) one();
    else if (need === 1) {
      for (var a = 0; a < rest.length; a++) { H[6] = V[6] = rest[a]; one(); }
    } else {
      for (var x = 0; x < rest.length; x++) for (var y = x + 1; y < rest.length; y++) {
        H[5] = V[5] = rest[x]; H[6] = V[6] = rest[y]; one();
      }
    }
    var eq = (win + tie / 2) / tot;
    if (_eqCacheN > 500) { _eqCache = {}; _eqCacheN = 0; }
    _eqCache[key] = eq; _eqCacheN++;
    return eq;
  }

  // ── 막대(M3-P1a) ──
  function _precalc(key) {
    if (typeof PRECALC === 'undefined' || !PRECALC || typeof key !== 'string' || !_has(PRECALC, key)) return null;
    var v = Number(PRECALC[key]);
    return (isFinite(v) && v >= 0 && v <= 1) ? v : null;
  }
  // 줄 하나(precalc | exact)의 승률 0~1, 모르면 null
  function _eqOf(o) {
    if (!o || typeof o !== 'object') return null;
    if (o.precalc != null) return _precalc(o.precalc);
    if (o.exact && typeof o.exact === 'object') return eqExact(o.exact.hero, o.exact.vs, o.exact.board);
    return null;
  }
  function _barEqs(o) {
    if (o.kind === 'compare') return [_eqOf(o)];
    if (o.kind === 'equity' && Array.isArray(o.rows)) return o.rows.map(_eqOf);
    return [];
  }
  function _w(frac) { return String(Math.round(Math.max(0, Math.min(1, frac)) * 1000) / 10); }

  function _brow(label, val, frac, cls, extra) {
    return '<div class="sr-brow' + (cls || '') + '"' + (extra || '') + '>' +
      '<div class="sr-bhead"><span class="sr-blb">' + _esc(label == null ? '' : label) + '</span><b class="sr-bv">' + val + '</b></div>' +
      '<div class="sr-btrack">' + (frac != null ? '<i class="sr-bfill" style="width:' + _w(frac) + '%"></i>' : '') + '</div></div>';
  }

  // 맥락 줄(내 손, 상대 손, 보드): bar compare와 equity가 hero/board 필드를 주거나 compare exact일 때
  function _ctxRows(o) {
    var hero = o.hero, vs = null, board = o.board;
    if (o.exact && typeof o.exact === 'object') {
      if (!hero) hero = o.exact.hero;
      vs = o.exact.vs;
      if (!board) board = o.exact.board;
    }
    var h = _cardList(hero), v = _cardList(vs), b = _cardList(board), out = '';
    if (h && h.length) out += _row('sr-hero', '내 손', cards(h, { hero: true, size: 'sm' }));
    if (v && v.length) out += _row('sr-vs', '상대 손', cards(v, { size: 'sm' }));
    if (b && b.length) out += _row('sr-board', '보드', cards(b, { size: 'sm' }));
    return out;
  }

  function bar(spec) {
    spec = spec || {};
    var kind = spec.kind;
    if (kind === 'amount') {
      var rows = Array.isArray(spec.rows) ? spec.rows : [];
      var max = 0;
      rows.forEach(function(r) { if (r && _isNum(r.bb) && Number(r.bb) > max) max = Number(r.bb); });
      var html = rows.map(function(r) {
        r = r || {};
        var ok = _isNum(r.bb) && Number(r.bb) >= 0;
        return _brow(r.label, ok ? _num(r.bb) + 'bb' : '?', ok ? (max > 0 ? Number(r.bb) / max : 0) : null,
          r.hl ? ' is-hl' : '', ok ? ' data-bb="' + _num(r.bb) + '"' : '');
      }).join('');
      return '<div class="sr-bars sr-bamount" role="group" aria-label="bb 막대">' + html + '</div>';
    }
    if (kind === 'equity') {
      var er = Array.isArray(spec.rows) ? spec.rows : [];
      var eqs = er.map(_eqOf), any = false;
      var eh = er.map(function(r, k) {
        r = r || {};
        var e = eqs[k];
        if (e != null) any = true;
        return _brow(r.label, e != null ? Math.round(e * 100) + '%' : '?', e, r.hl ? ' is-hl' : '',
          e != null ? ' data-eq="' + Math.round(e * 100) + '"' : '');
      }).join('');
      return '<div class="sr-bars sr-bequity" role="group" aria-label="승률 막대">' + _ctxRows(spec) +
        '<div class="sr-bscale" aria-hidden="true"><span>0</span><span>50</span><span>100%</span></div>' + eh +
        (any ? '<p class="sr-bfoot"><span class="sr-tag sr-tag-eng"><span aria-hidden="true">✓</span> 엔진 계산</span></p>' : '') + '</div>';
    }
    if (kind === 'compare') {
      var nd = spec.need && typeof spec.need === 'object' ? need(spec.need.potTotal, spec.need.toCall) : null;
      var eq = _eqOf(spec);
      var ctx = _ctxRows(spec);
      if (!nd) {
        // 필요 승률을 모르면 바늘 없이 내 승률 막대 하나
        return '<div class="sr-bars sr-bequity" role="group" aria-label="승률 막대">' + ctx +
          _brow('내 승률', eq != null ? Math.round(eq * 100) + '%' : '?', eq, '', '') + '</div>';
      }
      var p = Number(spec.need.potTotal), t = Number(spec.need.toCall);
      var ax = _axis(nd, eq, !(t > 0), true);
      return '<div class="sr-barcmp" data-need="' + nd.pct + '"' + (eq != null ? ' data-eq="' + ax.eqPct + '"' : '') + ' data-verdict="' + ax.verdict + '">' +
        ctx +
        // 좌표는 ring과 같다(AXIS). 이름표가 축 왼쪽이라 위쪽 16은 비어 있어 잘라 낸다.
        '<svg class="sr-ring-svg sr-bar-svg" viewBox="0 16 340 114" role="img" aria-label="' + ax.aria + '" xmlns="http://www.w3.org/2000/svg">' +
        ax.svg + '</svg>' + _ringCaps(p, t, nd.pct, true) +
        (ax.vtxt ? '<p class="sr-verdict ' + ax.vcls + '">' + ax.vtxt + '</p>' : '') +
        (eq != null ? '<p class="sr-bfoot"><span class="sr-tag sr-tag-eng"><span aria-hidden="true">✓</span> 엔진 계산</span></p>' : '') + '</div>';
    }
    return '';
  }

  // ── 세 사람의 속마음 3열(M3-P1a, S4 이상) ──
  function compareScene(spec) {
    spec = spec || {};
    var cols = (Array.isArray(spec.cols) ? spec.cols : []).filter(function(c) { return c && typeof c === 'object'; });
    if (!cols.length) return '';
    var mine = spec.mine;
    var mi = (typeof mine === 'number' && isFinite(mine) && mine >= 0 && mine < cols.length && Math.floor(mine) === mine) ? mine : -1;
    var html = cols.map(function(c, k) {
      return '<div class="sr-ccol' + (k === mi ? ' is-mine' : '') + '" data-i="' + k + '">' +
        '<b class="sr-who">' + _esc(c.who == null ? '' : c.who) + '</b>' +
        '<p class="sr-said">' + _esc(c.text == null ? '' : c.text) + '</p>' +
        (k === mi ? '<span class="sr-mine"><span aria-hidden="true">✔</span> 내 선택</span>' : '') + '</div>';
    }).join('');
    var me = (typeof mine === 'string' && mine.trim()) ? '<p class="sr-cme"><span class="sr-k">내 선택</span>' + _esc(mine.trim()) + '</p>' : '';
    return '<div class="sr-cmp" role="group" aria-label="세 사람의 속마음">' +
      '<div class="sr-ccols" style="--sr-n:' + Math.min(3, cols.length) + '">' + html + '</div>' + me + '</div>';
  }

  // {{이름}} 채우기(sum 전용, 모르는 이름은 '?', 계약 L3)
  function _fill(text, v) {
    return String(text == null ? '' : text).replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, function(all, k) {
      return _has(v, k) ? String(v[k]) : '?';
    });
  }

  // ── 한 줄 정리(M3-P1a) ──
  function sum(spec) {
    spec = spec || {};
    var t = _fill(spec.text, vars(spec));
    if (!t.trim()) return '';
    return '<div class="sr-sum"><span class="sr-sumk"><span aria-hidden="true">📌</span> 한 줄 정리</span>' +
      '<p class="sr-sumt">' + _esc(t) + '</p></div>';
  }

  var RENDERERS = {
    cards: _cardsScene,
    grid: function(o) {
      var opts = { mini: !!o.mini, legend: o.legend, head: o.head, blank: !!o.blank };
      if (_has(o, 'sel')) opts.sel = o.sel;
      if (o.pick) opts.pick = true;
      return grid(o, opts);
    },
    ring: function(o) { return ring(o); },
    scene: scene,
    table: table,
    bar: bar,
    compare: compareScene,
    sum: sum
  };

  function render(obj) {
    if (!obj || typeof obj !== 'object') return '';
    if (obj.t == null) return scene(obj);
    return _has(RENDERERS, obj.t) ? RENDERERS[obj.t](obj) : '';
  }
  function supports(t) { return _has(RENDERERS, t); }

  // 캡션 템플릿 {{ }}용 값(같은 장면의 필드에서 계산). ring: pct=need=필요 승률, grid: pct=레인지 %(Coach.rangePct).
  function vars(obj) {
    obj = obj || {};
    var out = {};
    if (obj.potTotal != null) out.potTotal = _num(obj.potTotal);
    if (obj.toCall != null) out.toCall = _num(obj.toCall);
    var nd = need(obj.potTotal, obj.toCall);
    if (nd) { out.need = nd.pct; out.pct = nd.pct; }
    if (obj.need && typeof obj.need === 'object') {
      var n2 = need(obj.need.potTotal, obj.need.toCall);
      if (n2) out.need = n2.pct;
    }
    var e = _eqFrac(obj.eq);
    if (e != null) out.eq = Math.round(e * 100);
    if (obj.t === 'grid' && obj.pos) {
      var ri = rangeInfo(obj);
      if (ri) out.pct = Math.round(ri.total * 100);
    }
    // bar(M3-P1a): eq = 첫 줄(compare는 그 값) 승률 %, equity 둘째 줄부터 eq2, eq3..., need 객체의 팟과 콜
    if (obj.t === 'bar') {
      var eqs = _barEqs(obj);
      if (eqs.length) {
        delete out.eq;
        eqs.forEach(function(x, k) { if (x != null) out[k ? 'eq' + (k + 1) : 'eq'] = Math.round(x * 100); });
      }
      if (obj.need && typeof obj.need === 'object' && need(obj.need.potTotal, obj.need.toCall)) {
        if (out.potTotal == null) out.potTotal = _num(obj.need.potTotal);
        if (out.toCall == null) out.toCall = _num(obj.need.toCall);
      }
    }
    return out;
  }

  var api = {
    cards: cards, grid: grid, gridSelect: gridSelect, tapOf: tapOf, ring: ring, scene: scene, render: render,
    supports: supports, need: need, rangeInfo: rangeInfo, cellAction: cellAction, handRC: handRC, vars: vars,
    parseCard: parseCard, comboLabel: _label, RANKS: RANKS.slice(), ACTS: ACTS.slice(), AXIS: { x0: AXIS.x0, w: AXIS.w },
    table: table, bar: bar, compareScene: compareScene, sum: sum, eqExact: eqExact,
    SEATS: SEATS6.slice(), ORDER: { preflop: ORDER.preflop.slice(), postflop: ORDER.postflop.slice() },
    TABLE_LAYOUT: { top: TABLE_TOP.slice(), bot: TABLE_BOT.slice() }
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
