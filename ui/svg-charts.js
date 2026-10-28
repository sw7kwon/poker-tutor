// ui/svg-charts.js (n4 G3 SEAT+GRAPH, 설계 docs/NEXT4_DESIGN.md 5절, 결정 65)
// SVG 문자열 그래프 4종(순수, DOM 없음, 외부 라이브러리 없음). 색은 css/svg-charts.css의 클래스(.sc-*)와 토큰으로만 준다(인라인 fill 금지).
//   모두 <div class="sc-wrap ..."><svg role="img" aria-label viewBox width="100%"><title>…</title>…</svg>(범례)(<table class="sr-only">같은 데이터</table>)</div>.
//   preserveAspectRatio="none"은 쓰지 않는다(글자 찌그러짐). 글자는 viewBox 기준 11px 이상, o.compact면 눈금 수를 줄인다(320 폭).
//   rangeCurve(points, o)  레인지 곡선(📈 분석 보기 격자 아래, G2가 부른다): points = [{ label, eq(0~100), action('raise' | 'call' | 'fold' | 'check' | 'none'), mine, weight }]
//     eq 내림차순(같으면 콤보 많은 쪽, 그다음 라벨)으로 세우고 x = 앞선 콤보 가중 누적 비율(첫 점 0, 마지막 점 100, 폭이 콤보 수에 비례), y = eq.
//     점 색 = 액션(색약 모드 html.cb는 점 모양: 레이즈 ●, 콜 ■, 폴드 ▲), 내 손 금색 고리와 "KJs 54%", o.need(0~1)면 가로 점선과 "필요 38%".
//   lines(series, o)       스트리트별 승률 선(완전 분석 손 탭): series = [{ name, pos, color('hero' | 'opp' | 'focus'), points: [{ x: 'preflop' | 'flop' | 'turn' | 'river', y: 0~100 | null }] }]
//     x 4칸 고정, y 0~100. null 점에서 선이 끊긴다(다음 점은 M으로 다시). 보는 사람(focus) 보라 2.5px, 나(hero) 금색 2px, 나머지 1.2px. 숫자는 focus와 hero만.
//   stackBar(segments, o)  범위 강도 누적 막대(좌석 시트 블록 2): segments = [{ key, label, pct, color? }] 순서대로, 8% 이상 조각만 안에 숫자.
//     o.marker = { pct(막대 위 0~100 자리), text }면 그 자리에 ▼(완전 분석 실제 손). 범례 6개는 막대 아래 HTML(두 줄 허용).
//   stackLine(points, o)   세션 스택 선(세션 요약 #session-chart, P2): points = [{ hand, stack, rebuy(bb | 0) }], o.base(바이인 기준선, 기본 첫 스택 또는 100)
// 성능: 169점 곡선 1ms 이하, 선 6개 0.5ms, 막대 0.2ms(tests/j-svg-charts.test.js). 움직임 없음.
// 규약: 로드 때 DOM 접근 없음. 가운뎃점과 긴줄표 없음.
var SvgCharts = (function() {
  // 전역 이름을 지역으로(node vm 러너는 전역 찾기가 느리고, 브라우저에서도 손해가 없다)
  var Math_ = Math, round = Math.round, max = Math.max, min = Math.min, Str = String, Num = Number, fin = isFinite, Inf = Infinity;
  var STREETS = ['preflop', 'flop', 'turn', 'river'];
  var STREET_KOR = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버' };
  var ACT_KOR = { raise: '레이즈', call: '콜', check: '체크', fold: '폴드', none: '자료 없음' };
  var ACT_CLS = { raise: 'raise', call: 'call', check: 'call', fold: 'fold' };

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }, ESC_RE = /[&<>"']/, ESC_G = /[&<>"']/g;
  function _escCh(ch) { return ESC[ch]; }
  function _esc(s) {
    s = Str(s == null ? '' : s);
    return ESC_RE.test(s) ? s.replace(ESC_G, _escCh) : s;
  }
  function _r(v) { return round(v * 10) / 10; }
  function _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function _svg(cls, w, h, label, body) {
    return '<svg class="sc-svg ' + cls + '" viewBox="0 0 ' + w + ' ' + h + '" width="100%" role="img" aria-label="' + _esc(label) + '" focusable="false">' +
      '<title>' + _esc(label) + '</title>' + body + '</svg>';
  }
  function _table(caption, head, rows) {
    return '<table class="sr-only"><caption>' + _esc(caption) + '</caption><thead><tr>' + head.map(function(h) { return '<th scope="col">' + _esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function(r) { return '<tr>' + r.map(function(c) { return '<td>' + _esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }

  // ── 1. 레인지 곡선 ──
  var RC = { w: 360, h: 120, l: 28, r: 352, t: 16, b: 98 };
  // 점 모양(색약 모드): 레이즈 원, 콜 네모, 폴드 세모. 기본 모드는 원(css가 둘 중 하나만 보인다)
  function _shape(cls, x, y) {
    if (cls === 'call') return '<rect class="sc-dot-s sc-' + cls + '" x="' + _r(x - 1.9) + '" y="' + _r(y - 1.9) + '" width="3.8" height="3.8"/>';
    if (cls === 'fold') return '<path class="sc-dot-s sc-' + cls + '" d="M' + _r(x) + ' ' + _r(y - 2.3) + 'L' + _r(x + 2.2) + ' ' + _r(y + 1.6) + 'L' + _r(x - 2.2) + ' ' + _r(y + 1.6) + 'Z"/>';
    return '<circle class="sc-dot-s sc-' + cls + '" cx="' + _r(x) + '" cy="' + _r(y) + '" r="1.9"/>';
  }
  // 정렬: 승률 내림차순, 같으면 콤보 많은 쪽, 그다음 라벨(숫자 키로 한 번에 비교, localeCompare는 느리다)
  function _orderPoints(points) {
    var dec = [], src = points || [];
    for (var i = 0; i < src.length; i++) {
      var p = src[i];
      if (!p || typeof p.eq !== 'number' || !fin(p.eq)) continue;
      dec.push({ p: p, e: p.eq, w: Num(p.weight) || 1, l: Str(p.label) });
    }
    dec.sort(function(a, b) { return (b.e - a.e) || (b.w - a.w) || (a.l < b.l ? -1 : a.l > b.l ? 1 : 0); });
    var out = new Array(dec.length);
    for (var j = 0; j < dec.length; j++) out[j] = dec[j].p;
    return out;
  }
  // 점 x(0~100, 순수): 앞선 콤보 가중 누적 / (전체 - 마지막 점 가중). 첫 점 0, 마지막 점 100
  function curveX(points) {
    var pts = _orderPoints(points), tot = 0, i;
    for (i = 0; i < pts.length; i++) tot += max(0, Num(pts[i].weight) || 1);
    var last = pts.length ? max(0, Num(pts[pts.length - 1].weight) || 1) : 0, den = tot - last, cum = 0, out = [];
    for (i = 0; i < pts.length; i++) {
      out.push({ label: pts[i].label, eq: pts[i].eq, action: pts[i].action, mine: !!pts[i].mine, weight: Num(pts[i].weight) || 1, x: den > 0 ? cum / den * 100 : 0 });
      cum += max(0, Num(pts[i].weight) || 1);
    }
    return out;
  }
  function rangeCurve(points, o) {
    o = o || {};
    var pts = curveX(points);
    if (!pts.length) return '';
    var W = RC.r - RC.l, H = RC.b - RC.t;
    function X(x) { return RC.l + x / 100 * W; }
    function Y(y) { return RC.b - _clamp(y, 0, 100) / 100 * H; }
    var body = '', ticks = o.compact ? [0, 50, 100] : [0, 25, 50, 75, 100];
    ticks.forEach(function(t) {
      body += '<line class="sc-grid" x1="' + RC.l + '" x2="' + RC.r + '" y1="' + _r(Y(t)) + '" y2="' + _r(Y(t)) + '"/>' +
        '<text class="sc-tick" x="' + (RC.l - 4) + '" y="' + _r(Y(t) + 3.8) + '" text-anchor="end">' + t + '</text>';
    });
    var d = '';
    pts.forEach(function(p, i) { d += (i ? 'L' : 'M') + _r(X(p.x)) + ' ' + _r(Y(p.eq)); });
    body += '<path class="sc-line" d="' + d + '"/>';
    var dots = '', shapes = '', mine = null;
    pts.forEach(function(p) {
      var cls = ACT_CLS[p.action] || 'none', x = X(p.x), y = Y(p.eq);
      dots += '<circle class="sc-dot sc-' + cls + '" cx="' + _r(x) + '" cy="' + _r(y) + '" r="1.6"/>';
      shapes += _shape(cls, x, y);
      if (p.mine && !mine) mine = { p: p, x: x, y: y };
    });
    body += '<g class="sc-dots">' + dots + '</g><g class="sc-shapes">' + shapes + '</g>';
    // (n4-merge) need는 0~1 비율 또는 0~100 퍼센트(GtoChart가 곡선 y와 같은 0~100으로 넘긴다). 1보다 크면 퍼센트로 읽는다
    var nv = (typeof o.need === 'number' && fin(o.need)) ? (o.need > 1 ? o.need / 100 : o.need) : null;
    var need = (nv != null && nv > 0 && nv < 1) ? nv : null;
    if (need != null) {
      var ny = Y(need * 100), np = round(need * 100);
      body += '<line class="sc-need" x1="' + RC.l + '" x2="' + RC.r + '" y1="' + _r(ny) + '" y2="' + _r(ny) + '"/>' +
        '<text class="sc-need-t" x="' + RC.r + '" y="' + _r(ny - 3) + '" text-anchor="end">필요 ' + np + '%</text>';
    }
    if (mine) {
      var tx = _clamp(mine.x, RC.l + 30, RC.r - 30), ty = mine.y - 6 < 11 ? mine.y + 15 : mine.y - 6;
      body += '<circle class="sc-mine" cx="' + _r(mine.x) + '" cy="' + _r(mine.y) + '" r="3.6"/>' +
        '<text class="sc-mine-t" x="' + _r(tx) + '" y="' + _r(ty) + '" text-anchor="middle">' + _esc(mine.p.label) + ' ' + round(mine.p.eq) + '%</text>';
    }
    body += '<text class="sc-axis" x="' + _r((RC.l + RC.r) / 2) + '" y="' + (RC.h - 6) + '" text-anchor="middle">승률 높은 손 → 낮은 손</text>';
    var lab = (o.title || '레인지 곡선') + ': ' + pts.length + '손을 승률 순서로 늘어놓은 선, 점 색은 차트 액션' +
      (mine ? ', 내 손 ' + mine.p.label + ' ' + round(mine.p.eq) + '%' : '') + (need != null ? ', 필요 승률 ' + round(need * 100) + '%' : '');
    var rows = pts.map(function(p, i) { return [Str(i + 1), p.label, round(p.eq) + '%', ACT_KOR[p.action] || '']; });
    return '<div class="sc-wrap sc-curve">' + _svg('sc-rc', RC.w, RC.h, lab, body) +
      '<div class="sc-note">' + _esc(o.note || "점 색은 차트 액션이에요. 폴드 점이 콜 점보다 위에 있는 곳이 '승률은 되지만 접는 손'이에요") + '</div>' +
      _table(o.title || '레인지 곡선', ['순위', '손', '승률', '차트 액션'], rows) + '</div>';
  }

  // ── 2. 스트리트별 승률 선 ──
  var LN = { w: 360, h: 140, l: 30, r: 340, t: 16, b: 112 };
  var LINE_ORDER = { opp: 0, hero: 1, focus: 2 };
  function lines(series, o) {
    o = o || {};
    var ss = (series || []).filter(function(s) { return s && Array.isArray(s.points); });
    if (!ss.length) return '';
    var W = LN.r - LN.l, H = LN.b - LN.t;
    function X(i) { return LN.l + i / 3 * W; }
    function Y(y) { return LN.b - _clamp(y, 0, 100) / 100 * H; }
    var body = '', ticks = o.compact ? [0, 50, 100] : [0, 25, 50, 75, 100];
    ticks.forEach(function(t) {
      body += '<line class="sc-grid" x1="' + LN.l + '" x2="' + LN.r + '" y1="' + _r(Y(t)) + '" y2="' + _r(Y(t)) + '"/>' +
        '<text class="sc-tick" x="' + (LN.l - 5) + '" y="' + _r(Y(t) + 3.8) + '" text-anchor="end">' + t + '</text>';
    });
    STREETS.forEach(function(st, i) {
      body += '<text class="sc-tick sc-xt" x="' + _r(X(i)) + '" y="' + (LN.h - 10) + '" text-anchor="' + (i === 0 ? 'start' : i === 3 ? 'end' : 'middle') + '">' + STREET_KOR[st] + '</text>';
    });
    var sorted = ss.slice().sort(function(a, b) { return (LINE_ORDER[a.color] || 0) - (LINE_ORDER[b.color] || 0); });
    var lineSvg = '', dotSvg = '', valSvg = '', focusTy = [];   // 보는 사람 숫자 자리(칸별): 내 숫자가 겹치면 반대쪽으로
    ss.forEach(function(s) {
      if (s.color !== 'focus') return;
      STREETS.forEach(function(st, i) {
        for (var k = 0; k < s.points.length; k++) {
          var p = s.points[k];
          if (p && p.x === st && typeof p.y === 'number' && fin(p.y)) { var t = Y(p.y) - 6; focusTy[i] = t < 10 ? Y(p.y) + 14 : t; }
        }
      });
    });
    sorted.forEach(function(s) {
      var col = LINE_ORDER.hasOwnProperty(s.color) ? s.color : 'opp', d = '', pen = false;
      var ys = STREETS.map(function(st) {
        for (var k = 0; k < s.points.length; k++) { var p = s.points[k]; if (p && p.x === st) return (typeof p.y === 'number' && fin(p.y)) ? p.y : null; }
        return null;
      });
      ys.forEach(function(y, i) {
        if (y == null) { pen = false; return; }
        d += (pen ? 'L' : 'M') + _r(X(i)) + ' ' + _r(Y(y));
        pen = true;
        dotSvg += '<circle class="sc-ldot sc-l-' + col + '" cx="' + _r(X(i)) + '" cy="' + _r(Y(y)) + '" r="' + (col === 'opp' ? 2 : 3) + '"/>';
        if (col !== 'opp') {
          var up = col === 'focus', ty = up ? Y(y) - 6 : Y(y) + 14;
          if (ty < 10) ty = Y(y) + 14;
          if (ty > LN.b + 10) ty = Y(y) - 6;
          if (col === 'hero' && focusTy[i] != null && Math.abs(ty - focusTy[i]) < 12) {
            var alt = ty > Y(y) ? Y(y) - 6 : Y(y) + 14;   // 반대쪽
            if (alt >= 10 && alt <= LN.b + 10 && Math.abs(alt - focusTy[i]) >= 12) ty = alt;
            else ty = focusTy[i] + (ty >= focusTy[i] ? 12 : -12);
          }
          valSvg += '<text class="sc-val sc-v-' + col + '" x="' + _r(_clamp(X(i), LN.l + 8, LN.r - 8)) + '" y="' + _r(ty) + '" text-anchor="middle">' + round(y) + '</text>';
        }
      });
      if (d) lineSvg += '<path class="sc-lline sc-l-' + col + '" d="' + d + '"/>';
    });
    body += lineSvg + dotSvg + valSvg;
    var lab = (o.title || '스트리트별 승률') + ': ' + ss.map(function(s) {
      var last = null;
      s.points.forEach(function(p) { if (p && typeof p.y === 'number') last = p; });
      return (s.label || s.pos || s.name) + (last ? ' ' + STREET_KOR[last.x] + ' ' + round(last.y) + '%' : '');
    }).join(', ');
    var legend = '<div class="sc-legend">' + sorted.slice().reverse().map(function(s) {
      var col = LINE_ORDER.hasOwnProperty(s.color) ? s.color : 'opp';
      return '<span class="sc-lg"><i class="sc-lg-line sc-l-' + col + '" aria-hidden="true"></i>' + _esc(s.label || s.pos || s.name) + '</span>';
    }).join('') + '</div>';
    var rows = ss.map(function(s) {
      return [s.label || s.pos || s.name].concat(STREETS.map(function(st) {
        for (var k = 0; k < s.points.length; k++) { var p = s.points[k]; if (p && p.x === st && typeof p.y === 'number') return round(p.y) + '%'; }
        return '';
      }));
    });
    return '<div class="sc-wrap sc-lines">' + _svg('sc-ln', LN.w, LN.h, lab, body) + legend +
      _table(o.title || '스트리트별 승률', ['사람'].concat(STREETS.map(function(st) { return STREET_KOR[st]; })), rows) + '</div>';
  }

  // ── 3. 범위 강도 누적 막대 ──
  var SB = { w: 360, h: 44, barY: 18, barH: 22 };
  function stackBar(segments, o) {
    o = o || {};
    var segs = (segments || []).filter(function(s) { return s && s.key; });
    if (!segs.length) return '';
    // 빈손 빗금은 <pattern id> 대신 선을 직접 그린다: 같은 id가 숨은 시트(display none)에 먼저 있으면 url(#id) 채움이 비어 보인다(실측)
    var body = '';
    var x = 0;
    segs.forEach(function(s) {
      var p = max(0, Num(s.pct) || 0), w = p * SB.w / 100;
      if (w > 0) {
        body += '<rect class="sc-seg sc-s-' + _esc(s.key) + '" x="' + _r(x) + '" y="' + SB.barY + '" width="' + _r(w) + '" height="' + SB.barH + '" data-pct="' + _r(p) + '"/>';
        if (s.key === 'air') body += _hatch(x, SB.barY, w, SB.barH);
        if (p >= 8) body += '<text class="sc-seg-t sc-st-' + _esc(s.key) + '" x="' + _r(x + w / 2) + '" y="' + (SB.barY + 15) + '" text-anchor="middle">' + round(p) + '</text>';
      }
      x += w;
    });
    body += '<rect class="sc-seg-frame" x="0.5" y="' + (SB.barY + 0.5) + '" width="' + (SB.w - 1) + '" height="' + (SB.barH - 1) + '"/>';
    var mk = o.marker && typeof o.marker.pct === 'number' && fin(o.marker.pct) ? o.marker : null;
    if (mk) {
      var mx = _clamp(mk.pct, 0, 100) * SB.w / 100, tx = _clamp(mx, 40, SB.w - 40);
      body += '<path class="sc-marker" d="M' + _r(mx - 5) + ' ' + (SB.barY - 9) + 'L' + _r(mx + 5) + ' ' + (SB.barY - 9) + 'L' + _r(mx) + ' ' + (SB.barY - 1) + 'Z"/>' +
        (mk.text ? '<text class="sc-marker-t" x="' + _r(tx) + '" y="' + (SB.barY - 10) + '" text-anchor="' + (mx < 40 ? 'start' : mx > SB.w - 40 ? 'end' : 'middle') + '">' + _esc(mk.text) + '</text>' : '');
    }
    var lab = (o.title || '범위 강도 분포') + ': ' + segs.map(function(s) { return (s.label || s.key) + ' ' + round(Num(s.pct) || 0) + '%'; }).join(', ') +
      (mk && mk.text ? ', ' + mk.text : '');
    var legend = '<div class="sc-legend sc-legend-bar">' + segs.map(function(s) {
      return '<span class="sc-lg"><i class="sc-lg-sw sc-sw-' + _esc(s.key) + '" aria-hidden="true"></i>' + _esc(s.label || s.key) + ' ' + round(Num(s.pct) || 0) + '%</span>';
    }).join('') + '</div>';
    return '<div class="sc-wrap sc-bar' + (mk ? ' has-marker' : '') + '">' + _svg('sc-sb', SB.w, SB.h, lab, body) + legend + '</div>';
  }

  // 사각형 안 45도 빗금(간격 6, 사각형 밖으로 나가지 않게 끝을 자른다), path 1개
  function _hatch(x0, y0, w, h) {
    var x1 = x0 + w, y1 = y0 + h, d = '';
    for (var c = x0 - h; c < x1; c += 6) {
      var ya = max(y0, y0 + x0 - c), yb = min(y1, y0 + x1 - c);
      if (yb - ya < 0.5) continue;
      d += 'M' + _r(c + ya - y0) + ' ' + _r(ya) + 'L' + _r(c + yb - y0) + ' ' + _r(yb);
    }
    return d ? '<path class="sc-hatch-ln" d="' + d + '"/>' : '';
  }

  // ── 4. 세션 스택 선 ──
  var SL = { w: 360, h: 120, l: 34, r: 350, t: 14, b: 96 };
  function stackLine(points, o) {
    o = o || {};
    var pts = (points || []).filter(function(p) { return p && typeof p.stack === 'number' && fin(p.stack); });
    if (pts.length < 2) return '';
    var base = (typeof o.base === 'number' && fin(o.base)) ? o.base : (pts[0].stack || 100);
    var max = base;
    pts.forEach(function(p) { if (p.stack > max) max = p.stack; });
    var top = max * 1.1 || 1, W = SL.r - SL.l, H = SL.b - SL.t, n = pts.length;
    function X(i) { return SL.l + (n > 1 ? i / (n - 1) : 0) * W; }
    function Y(v) { return SL.b - _clamp(v, 0, top) / top * H; }
    var body = '', step = top > 400 ? 200 : top > 200 ? 100 : 50;
    for (var t = 0; t <= top; t += step) {
      body += '<line class="sc-grid" x1="' + SL.l + '" x2="' + SL.r + '" y1="' + _r(Y(t)) + '" y2="' + _r(Y(t)) + '"/>' +
        '<text class="sc-tick" x="' + (SL.l - 4) + '" y="' + _r(Y(t) + 3.8) + '" text-anchor="end">' + t + '</text>';
    }
    body += '<line class="sc-base" x1="' + SL.l + '" x2="' + SL.r + '" y1="' + _r(Y(base)) + '" y2="' + _r(Y(base)) + '"/>';
    var d = '';
    pts.forEach(function(p, i) { d += (i ? 'L' : 'M') + _r(X(i)) + ' ' + _r(Y(p.stack)); });
    body += '<path class="sc-sline" d="' + d + '"/>';
    pts.forEach(function(p, i) {
      if (p.rebuy > 0) body += '<line class="sc-rebuy" x1="' + _r(X(i)) + '" x2="' + _r(X(i)) + '" y1="' + SL.t + '" y2="' + SL.b + '"/>' +
        '<text class="sc-rebuy-t" x="' + _r(X(i)) + '" y="' + (SL.t - 2) + '" text-anchor="middle">💰</text>';
    });
    body += '<text class="sc-axis" x="' + _r((SL.l + SL.r) / 2) + '" y="' + (SL.h - 6) + '" text-anchor="middle">핸드 1 → ' + n + ', 점선 = 시작 스택 ' + _r(base) + 'bb</text>';
    var last = pts[n - 1];
    var lab = (o.title || '세션 스택 변화') + ': ' + n + '핸드, 시작 ' + _r(base) + 'bb, 끝 ' + _r(last.stack) + 'bb' + (pts.some(function(p) { return p.rebuy > 0; }) ? ', 리바이 있음' : '');
    var rows = pts.map(function(p, i) { return [Str(p.hand != null ? p.hand : i + 1), _r(p.stack) + 'bb', p.rebuy > 0 ? '리바이 ' + _r(p.rebuy) + 'bb' : '']; });
    return '<div class="sc-wrap sc-stack">' + _svg('sc-sl', SL.w, SL.h, lab, body) + _table(o.title || '세션 스택 변화', ['핸드', '스택', '리바이'], rows) + '</div>';
  }

  return { STUB: false, STREETS: STREETS.slice(), rangeCurve: rangeCurve, lines: lines, stackBar: stackBar, stackLine: stackLine, curveX: curveX };
})();
