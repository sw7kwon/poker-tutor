// lessons/scene-render.js (채우는 패키지: M2-P4a, M3-P1이 table/bar/compare/sum을 이어서 추가)
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
//   render(obj)             obj.t로 디스패치('cards', 'grid', 'ring', 'scene', t 없음은 scene). 그 밖의 t는 ''.
//   보조: need(potTotal, toCall), rangeInfo(spec), cellAction(spec, hand), handRC(hand), vars(obj), parseCard(x)
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

  function ring(spec, opts) {
    spec = spec || {};
    opts = opts || {};
    var nd = need(spec.potTotal, spec.toCall);
    if (!nd) return '';
    var p = Number(spec.potTotal), t = Number(spec.toCall);
    var pct = nd.pct;
    var eq = _eqFrac(spec.eq);
    var caps = '';
    if (opts.potLine !== false) {
      caps += '<p class="sr-cap">' + (t > 0 ? '팟(상대 벳 포함) ' + _num(p) + 'bb, 콜 ' + _num(t) + 'bb' : '팟 ' + _num(p) + 'bb, 콜 0bb') + '</p>';
    }
    if (t > 0) caps += '<p class="sr-cap sr-formula">필요 승률 = ' + _num(t) + ' ÷ (' + _num(p) + '+' + _num(t) + ') = ' + pct + '%</p>';
    else caps += '<p class="sr-cap sr-formula">낼 돈이 없어서 필요 승률은 0%예요(공짜로 볼 수 있어요)</p>';

    if (eq == null) {
      return '<div class="sr-ringbox is-solo" data-need="' + pct + '">' +
        '<svg class="sr-ring-svg" viewBox="0 0 120 120" role="img" aria-label="필요 승률 ' + pct + '%" xmlns="http://www.w3.org/2000/svg">' +
        _ringSVG(60, 58, 44, 12, pct, nd.need) + '</svg>' + caps + '</div>';
    }

    var eqPct = Math.round(eq * 100);
    // 낼 돈이 없으면(콜 0) 콜/폴드가 아니라 체크다. 공짜 스팟에서 폴드 구역을 보여 주지 않는다(fold_free_check 실수).
    var free = !(t > 0);
    var verdict = free ? 'check' : eqPct > pct ? 'call' : eqPct < pct ? 'fold' : 'even';
    var x0 = AXIS.x0, w = AXIS.w, x1 = x0 + w;
    var nx = x0 + w * nd.need, ex = x0 + w * eq;
    var vcls = 'sr-' + (free ? 'call' : verdict);
    var svg = _ringSVG(54, 58, 38, 11, pct, nd.need) +
      // 같은 축(0~100%) 위에 필요 승률 막대와 내 승률 막대를 나란히
      // 막대 이름은 오른쪽 끝에 붙인다(바늘은 필요 승률 자리라 팟에 상대 벳이 들어 있으면 50%를 넘지 않아 글자와 겹치지 않는다)
      '<text class="sr-ax-lb" x="' + x1 + '" y="20" text-anchor="end">필요 승률 ' + pct + '%</text>' +
      '<rect class="sr-track" x="' + x0 + '" y="26" width="' + w + '" height="12" rx="3"/>' +
      '<rect class="sr-needbar" x="' + x0 + '" y="26" width="' + _f(w * nd.need) + '" height="12" rx="3"/>' +
      '<text class="sr-ax-lb" x="' + x1 + '" y="58" text-anchor="end">내 승률 ' + eqPct + '%</text>' +
      '<rect class="sr-track" x="' + x0 + '" y="64" width="' + w + '" height="12" rx="3"/>' +
      '<rect class="sr-eqbar" x="' + x0 + '" y="64" width="' + _f(w * eq) + '" height="12" rx="3" data-eq="' + eqPct + '"/>' +
      (eq > nd.need ? '<rect class="sr-eqplus" x="' + _f(nx) + '" y="64" width="' + _f(ex - nx) + '" height="12"/>' : '') +
      (eq < nd.need ? '<rect class="sr-eqminus" x="' + _f(ex) + '" y="64.75" width="' + _f(nx - ex) + '" height="10.5"/>' : '') +
      // 콜/폴드 바늘: 필요 승률 자리. 내 승률 막대가 바늘을 넘으면 콜 쪽
      '<line class="sr-needle ' + vcls + '" x1="' + _f(nx) + '" y1="22" x2="' + _f(nx) + '" y2="86" stroke-width="3" data-x="' + _f(nx) + '"/>' +
      '<path class="sr-tip ' + vcls + '" d="M' + _f(nx - 5) + ' 94 L' + _f(nx + 5) + ' 94 L' + _f(nx) + ' 86 Z"/>' +
      // 구역 글자는 바늘 양옆에 붙인다. 바늘이 축 끝에 가까우면 화살표를 빼서 글자가 겹치지 않게 한다. 콜 0이면 구역이 없다.
      (free ? '' : '<text class="sr-zone sr-zone-fold" x="' + _f(nx - 7) + '" y="108" text-anchor="end">' + (nx - x0 >= ZONE_ROOM ? '← 폴드' : '폴드') + '</text>' +
      '<text class="sr-zone sr-zone-call" x="' + _f(Math.min(nx + 7, x1 - 26)) + '" y="108" text-anchor="start">' + (x1 - nx >= ZONE_ROOM ? '콜 →' : '콜') + '</text>') +
      '<text class="sr-tick" x="' + x0 + '" y="124" text-anchor="start">0</text>' +
      '<text class="sr-tick" x="' + _f(x0 + w / 2) + '" y="124" text-anchor="middle">50</text>' +
      '<text class="sr-tick" x="' + x1 + '" y="124" text-anchor="end">100%</text>';
    var vtxt = free ? '<span aria-hidden="true">✅</span> 체크: 낼 돈이 없으니 폴드하지 말고 공짜로 봐요'
      : verdict === 'call' ? '<span aria-hidden="true">✅</span> 콜이 이득: 내 승률 ' + eqPct + '% &gt; 필요 ' + pct + '%'
      : verdict === 'fold' ? '<span aria-hidden="true">✋</span> 폴드가 나아요: 내 승률 ' + eqPct + '% &lt; 필요 ' + pct + '%'
      : '<span aria-hidden="true">⚖</span> 본전: 내 승률 ' + eqPct + '% = 필요 ' + pct + '%';
    var vword = free ? '체크(공짜)' : verdict === 'call' ? '콜이 이득' : verdict === 'fold' ? '폴드가 나아요' : '본전';
    return '<div class="sr-ringbox is-axis" data-need="' + pct + '" data-eq="' + eqPct + '" data-verdict="' + verdict + '">' +
      '<svg class="sr-ring-svg" viewBox="0 0 340 130" role="img" aria-label="필요 승률 ' + pct + '%, 내 승률 ' + eqPct + '%, ' + vword + '" xmlns="http://www.w3.org/2000/svg">' +
      svg + '</svg>' + caps + '<p class="sr-verdict ' + vcls + '">' + vtxt + '</p></div>';
  }

  // ── 장면 조합(C3) ──
  function _row(cls, key, html) {
    return '<div class="sr-row ' + cls + '"><span class="sr-k">' + key + '</span>' + html + '</div>';
  }

  function _potLine(o) {
    var hasPot = o.potTotal != null && isFinite(Number(o.potTotal));
    var hasCall = o.toCall != null && isFinite(Number(o.toCall)) && Number(o.toCall) > 0;
    var hasStack = o.stack != null && isFinite(Number(o.stack));
    var bits = [];
    if (hasPot) bits.push(hasCall ? '팟(상대 벳 포함) ' + _num(o.potTotal) + 'bb, 콜 ' + _num(o.toCall) + 'bb' : '팟 ' + _num(o.potTotal) + 'bb');
    else if (hasCall) bits.push('콜 ' + _num(o.toCall) + 'bb');
    if (hasStack) bits.push('스택 ' + _num(o.stack) + 'bb');
    return bits.length ? '<p class="sr-line sr-pot">' + bits.join(', ') + '</p>' : '';
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

  var RENDERERS = {
    cards: _cardsScene,
    grid: function(o) {
      var opts = { mini: !!o.mini, legend: o.legend, head: o.head, blank: !!o.blank };
      if (_has(o, 'sel')) opts.sel = o.sel;
      if (o.pick) opts.pick = true;
      return grid(o, opts);
    },
    ring: function(o) { return ring(o); },
    scene: scene
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
    return out;
  }

  var api = {
    cards: cards, grid: grid, gridSelect: gridSelect, tapOf: tapOf, ring: ring, scene: scene, render: render,
    supports: supports, need: need, rangeInfo: rangeInfo, cellAction: cellAction, handRC: handRC, vars: vars,
    parseCard: parseCard, comboLabel: _label, RANKS: RANKS.slice(), ACTS: ACTS.slice(), AXIS: { x0: AXIS.x0, w: AXIS.w }
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
