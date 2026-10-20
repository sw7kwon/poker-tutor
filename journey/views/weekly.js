// journey/views/weekly.js (채우는 그룹: M5-WEEKLY, 설계서 9절 M5-P8 주간 리포트, 계약 F4 weekly/practice/patternItems/markReportView, F8)
// 주간 리포트 뷰. 설계서 3.4절 2번(리포트 카드: 비싼 실수 Top3, 개념별 정확도 변화, 실수 핸드 SRS), 4.7절(정보형 문구, 처벌 연출 없음,
// '실력 n% 향상' 같은 단정 문구 금지), 4.8절 3번(실수 핸드 SRS와 주간 리포트가 루프의 중심). 주간 챌린지 칸은 M6 안내만.
//   open(params, el)   JourneyUI.view('weekly')가 위임한다(F8). el = .j-view. 리포트 내용이 있을 때만 ReviewQueue.markReportView(now)
//                      (빈 리포트를 연 것은 주간 복기로 세지 않는다. M6 보스 weeks, s6-05, s6-08이 reportWeeks를 센다).
//   model(rq, now)     순수 모델. rq = ReviewQueue 모양 객체(테스트는 가짜 주입). 아래 '모델' 주석.
//   html(model)        순수 문자열.
//   cardInfo(rq, now)  홈 카드 정보 { show, emph, title, desc, week } | null(리포트 내용이 없으면 null). 월요일이고 이번 주에
//                      아직 리포트를 안 봤으면 emph(지난주 리포트 강조). 카드 HTML은 JourneyUI 카드 영역(weeklyCard)이 그린다.
//   🔁 다시 풀기 = ReviewQueue.practice([item], {onDone}), 🧩 이 패턴 n핸드 연습 = practice(patternItems(pattern, 5), {onDone}).
//   onDone(res{done, n, ok, aborted})이 오면 리포트로 돌아와(JourneyUI.view('weekly')) 결과 한 줄을 한 번 보인다.
// 모델: { ok(ReviewQueue.weekly 있음), now, week('YYYY-Www'), monday, range('10월 14일 ~ 10월 20일'),
//         top:[{ i, key, title, sub, loss, est, due, item }](최대 3, weekly().top 순서 그대로),
//         patterns:[{ i, pattern, label, rule, n }](Top3에 나온 패턴 순서, 최대 2, n = patternItems(pattern, 5) 수),
//         concepts:[{ concept, label, now:{n, pct}, prev:{n, pct}, diff }](pct 0~100 또는 null, 결정 0인 개념은 뺀다),
//         added, fixed, due, viewed(이번 주 리포트를 이미 봄), hasContent }
//   weekly().concepts의 pct 단위는 JStats.accuracy와 같은 0~100으로 본다. 목록의 값이 전부 1 이하이면 0~1 비율로 보고 100을 곱한다.
// 로드 시 DOM 접근 없음. ReviewQueue, JourneyUI, Coach, JStats는 호출 시점에 typeof 가드(병렬 구현 중 스텁이어도 안내 화면).
var WeeklyView = (function() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : this);
  var DAY = 86400000;
  var PRACTICE_MAX = 5;     // 이 패턴 연습은 최대 5핸드(F4 practice도 최대 5개)
  var TOP_MAX = 3, PATTERN_MAX = 2;
  var CONCEPT_LABEL = { rfi: '오픈', vs_rfi: '상대 오픈 대응', blind_defense: '블라인드 방어', vs_3bet: '3벳 대응', pot_odds: '팟 오즈',
    draws: '드로우', cbet: 'c벳', value_bluff: '밸류와 블러프', board_texture: '보드 텍스처', turn_river: '턴, 리버', actions: '액션 기본' };
  var STREET_LABEL = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버' };
  var MODE_LABEL = { sixmax: '6인 풀링', 'sixmax-cast': '6인 캐스트', 'sixmax-cast-hidden': '6인 캐스트(유형 숨김)',
    'headsup-tag': '헤즈업 TAG', mixed: 'Mixed 은닉', 'gto-mirror': 'GTO 미러' };
  var PATTERN_FALLBACK = { overlimp: '오버림프(림퍼 뒤에 콜로 따라 들어가기)' };

  var _env = {};                         // 테스트 주입 { rq, now, reopen, toast, screen }
  var _st = { model: null, last: null }; // 마지막으로 그린 모델(버튼 인덱스용), 연습 결과(다음 그리기에 한 번)

  // ── 헬퍼 ──────────────────────────────────────────────
  function _m(name) { var o = G[name]; return (o && (typeof o === 'object' || typeof o === 'function')) ? o : null; }
  function _isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function _num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function _now() { return typeof _env.now === 'function' ? _env.now() : Date.now(); }
  function _rq() { return _env.rq !== undefined ? _env.rq : _m('ReviewQueue'); }
  function _try(fn, d) { try { var r = fn(); return r === undefined ? d : r; } catch (e) { return d; } }
  function _ms(t) {
    if (typeof t === 'number') return isFinite(t) ? t : null;
    if (typeof t === 'string' && t) { var x = Date.parse(t); return isFinite(x) ? x : null; }
    return null;
  }
  function _md(t) { var d = new Date(t); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; }
  function _2(n) { return (n < 10 ? '0' : '') + n; }
  // ISO 주 키(JStats.weekKey가 있으면 그것, 없으면 같은 규칙)
  function weekKey(now) {
    var J = _m('JStats');
    if (J && typeof J.weekKey === 'function') { var k = _try(function() { return J.weekKey(now); }, null); if (typeof k === 'string' && k) return k; }
    var d = new Date(now), t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dow = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dow);
    var y = t.getUTCFullYear();
    return y + '-W' + _2(Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / DAY + 1) / 7));
  }
  function _patternInfo(k) {
    var C = _m('Coach'), P = C && C.PATTERNS && C.PATTERNS[k];
    return { label: (P && P.label) || PATTERN_FALLBACK[k] || String(k), rule: (P && P.rule) || '' };
  }
  function _conceptLabel(c, given) { return (typeof given === 'string' && given) || CONCEPT_LABEL[c] || String(c || '기타'); }

  // ── 모델(순수) ───────────────────────────────────────
  function _lossText(it) {
    if (it.estimated) return '큰 실수';
    var ev = _num(it.evLoss, 0);
    return ev > 0 ? '-' + (Math.round(ev * 10) / 10).toFixed(1) + 'bb' : '큰 실수';
  }
  function _dueText(it, now) {
    if (_num(it.box, 0) >= 4) return '복습 졸업';
    var due = _ms(it.due);
    if (due == null) return '';
    if (due <= now) return '오늘 다시 풀 차례';
    var days = Math.ceil((due - now) / DAY);
    return days <= 1 ? '내일 다시 풀 차례' : days + '일 뒤 다시 풀 차례';
  }
  function _topRow(it, i, now) {
    var pat = it.pattern ? _patternInfo(it.pattern).label : '';
    var title = pat || (it.concept ? _conceptLabel(it.concept) + ' 결정' : '빨간 결정');
    var at = _ms(it.at);
    var sub = [it.heroPos || '', STREET_LABEL[it.street] || it.street || '', MODE_LABEL[it.mode] || it.mode || '', at != null ? _md(at) : '']
      .filter(Boolean).join(', ');
    var tries = _num(it.n, 0);
    var due = _dueText(it, now);
    if (tries > 0) due = (due ? due + ', ' : '') + '다시 푼 ' + tries + '번 중 ' + Math.max(0, Math.min(tries, _num(it.ok, 0))) + '번 바로잡음';
    return { i: i, key: it.key || null, title: title, sub: sub, loss: _lossText(it), est: !!it.estimated || !(_num(it.evLoss, 0) > 0),
      due: due, pattern: it.pattern || null, item: it };
  }
  function _pctScale(list) {
    var vals = [];
    list.forEach(function(c) { [c.now, c.prev].forEach(function(x) { if (_isObj(x) && x.pct != null && isFinite(Number(x.pct))) vals.push(Number(x.pct)); }); });
    return (vals.length && vals.every(function(v) { return v >= 0 && v <= 1; }) && vals.some(function(v) { return v > 0 && v < 1; })) ? 100 : 1;
  }
  function _side(x, scale) {
    var n = Math.max(0, Math.floor(_num(_isObj(x) ? x.n : 0, 0)));
    var p = (_isObj(x) && x.pct != null && isFinite(Number(x.pct)) && n > 0) ? Math.max(0, Math.min(100, Number(x.pct) * scale)) : null;
    return { n: n, pct: p == null ? null : Math.round(p) };
  }
  function _concepts(list) {
    if (!Array.isArray(list)) return [];
    list = list.filter(_isObj);
    var scale = _pctScale(list);
    return list.map(function(c) {
      var a = _side(c.now, scale), b = _side(c.prev, scale);
      return { concept: c.concept || null, label: _conceptLabel(c.concept, c.label), now: a, prev: b,
        diff: (a.pct != null && b.pct != null) ? a.pct - b.pct : null };
    }).filter(function(c) { return c.now.n > 0 || c.prev.n > 0; });
  }

  function model(rq, now) {
    now = _num(now, Date.now());
    var d = new Date(now);
    var m = { ok: false, now: now, week: weekKey(now), monday: d.getDay() === 1,
      range: _md(now - 6 * DAY) + ' ~ ' + _md(now), top: [], patterns: [], concepts: [], added: 0, fixed: 0, due: 0,
      viewed: false, hasContent: false };
    if (!rq || typeof rq.weekly !== 'function') return m;
    var w = _try(function() { return rq.weekly(now); }, null);
    if (!_isObj(w)) return m;
    m.ok = true;
    if (typeof w.week === 'string' && w.week) m.week = w.week;
    m.top = (Array.isArray(w.top) ? w.top : []).filter(_isObj).slice(0, TOP_MAX).map(function(it, i) { return _topRow(it, i, now); });
    var seen = {};
    m.top.forEach(function(r) {
      if (!r.pattern || seen[r.pattern] || m.patterns.length >= PATTERN_MAX || typeof rq.patternItems !== 'function') return;
      seen[r.pattern] = true;
      var items = _try(function() { return rq.patternItems(r.pattern, PRACTICE_MAX); }, []);
      var n = Array.isArray(items) ? Math.min(PRACTICE_MAX, items.length) : 0;
      if (n < 1) return;
      var pi = _patternInfo(r.pattern);
      m.patterns.push({ i: m.patterns.length, pattern: r.pattern, label: pi.label, rule: pi.rule, n: n });
    });
    m.concepts = _concepts(w.concepts);
    m.added = Math.max(0, Math.floor(_num(w.added, 0)));
    m.fixed = Math.max(0, Math.floor(_num(w.fixed, 0)));
    m.due = Math.max(0, Math.floor(_num(w.due, 0)));
    if (typeof rq.reportWeeks === 'function') {
      var wk = _try(function() { return rq.reportWeeks(); }, []);
      m.viewed = Array.isArray(wk) && wk.indexOf(m.week) >= 0;
    }
    m.hasContent = m.top.length > 0 || m.added > 0 || m.fixed > 0 || m.concepts.some(function(c) { return c.now.n > 0; });
    return m;
  }

  // 홈 카드 정보(순수). 리포트 내용이 없으면 null(홈 출력이 그대로)
  function cardInfo(rq, now) {
    var m = model(rq, now);
    if (!m.ok || !m.hasContent) return null;
    var emph = m.monday && !m.viewed;
    var bits = [];
    if (m.top.length) bits.push('비싼 실수 ' + m.top.length + '개');
    if (m.fixed) bits.push('고친 실수 ' + m.fixed + '개');
    if (m.due) bits.push('다시 풀 차례 ' + m.due + '핸드');
    var nc = m.concepts.filter(function(c) { return c.now.n > 0; }).length;
    if (!bits.length && nc) bits.push('개념 ' + nc + '개의 정확도');
    return { show: true, emph: emph, week: m.week,
      title: emph ? '📅 지난주 리포트가 나왔어요' : '📅 주간 리포트',
      desc: (emph ? '새 주를 시작하기 전에 지난 7일을 돌아봐요. ' : '최근 7일 기록이에요. ') + bits.join(', ') };
  }

  // ── 그리기(순수 문자열) ───────────────────────────────
  // res.items[{ reached }](REVIEW 구현)가 있으면 실수했던 스트리트까지 가지 못한 핸드(상대 반응이 달라 일찍 끝남)는 판정에서 뺀다.
  // 그런 핸드와 기한 전에 미리 맞힌 핸드는 복습 일정이 바뀌지 않으므로(REVIEW record) '간격이 늘어나요' 같은 약속은 하지 않는다.
  // 틀린 핸드는 기한과 상관없이 하루 뒤로 돌아간다(F4).
  function _resultLine(last) {
    if (!last || !_isObj(last.res)) return '';
    var r = last.res, n = Math.max(0, Math.floor(_num(r.n, 0))), ok = Math.max(0, Math.min(n, Math.floor(_num(r.ok, 0))));
    var skip = Array.isArray(r.items) ? r.items.filter(function(x) { return _isObj(x) && x.reached === false; }).length : 0;
    skip = Math.min(skip, n - ok);
    var judged = n - skip, skipTxt = skip ? '. ' + skip + '핸드는 실수했던 스트리트까지 가지 않아 판정하지 않았어요' : '';
    var t;
    if (r.aborted && !n) t = '연습을 시작 전에 멈췄어요. 실수 핸드는 복습 목록에 그대로 있어요';
    else if (r.aborted) t = '연습을 ' + n + '핸드에서 멈췄어요(바로잡은 핸드 ' + ok + '). 남은 핸드는 복습 목록에 그대로 있어요';
    else if (n > 0 && judged === 0) t = '연습한 ' + n + '핸드가 실수했던 스트리트까지 가지 않아 이번엔 판정하지 않았어요. 실수 핸드는 복습 목록에 그대로 있어요';
    else if (ok === judged && judged > 0) t = judged + '핸드 모두 바로잡았어요' + skipTxt;
    else if (judged > 0) t = judged + '핸드 중 ' + ok + '핸드를 바로잡았어요. 못 바로잡은 핸드는 하루 뒤 다시 나와요' + skipTxt;
    else t = '연습을 마쳤어요';
    if (r.failed && !r.aborted) t += '. 다음 핸드를 열지 못해 여기서 마쳤어요';
    return '<div class="j-done-line' + (ok > 0 ? ' is-ok' : '') + '" role="status">🔁 ' + _esc(t) + '</div>';
  }
  function _head(title) {
    return '<div class="j-sub-top"><button type="button" class="j-back" aria-label="여정 홈으로" onclick="JourneyUI.back()">↩</button>' +
      '<h2 class="j-sub-t">' + _esc(title) + '</h2></div>';
  }
  function _homeBtn(primary) {
    return '<div class="j-card-acts"><button type="button" class="j-btn' + (primary ? ' j-primary' : ' j-ghost') + '" onclick="JourneyUI.back()">여정 홈으로</button></div>';
  }
  function _topHTML(m) {
    var body;
    if (!m.top.length) body = '<p class="j-wk-empty">최근 7일에는 빨간 결정이 없었어요. 실전에서 빨간 결정이 나오면 여기에 모여요.</p>';
    else {
      body = '<ol class="j-wk-top">' + m.top.map(function(r) {
        return '<li class="j-wk-item">' +
          '<div class="j-wk-item-h"><span class="j-wk-rank" aria-hidden="true">' + (r.i + 1) + '</span>' +
          '<b class="j-wk-item-t">' + _esc(r.title) + '</b><span class="j-wk-loss' + (r.est ? ' is-est' : '') + '">' + _esc(r.loss) + '</span></div>' +
          (r.sub ? '<div class="j-wk-item-s">' + _esc(r.sub) + '</div>' : '') +
          (r.due ? '<div class="j-wk-item-s">' + _esc(r.due) + '</div>' : '') +
          '<button type="button" class="j-btn j-wk-act" onclick="WeeklyView._retry(' + r.i + ')">🔁 다시 풀기</button></li>';
      }).join('') + '</ol>' +
      '<p class="j-wk-tip">다시 풀기는 그때와 같은 카드로 그 핸드를 다시 쳐요. 레이팅에는 넣지 않아요.</p>';
    }
    return '<section class="j-wk-sec" aria-label="비싼 실수 Top 3"><h3 class="j-wk-h">💸 비싼 실수 Top 3</h3>' + body + '</section>';
  }
  function _patternsHTML(m) {
    if (!m.patterns.length) return '';
    return '<section class="j-wk-sec" aria-label="같은 패턴 연습"><h3 class="j-wk-h">🧩 같은 패턴 모아 연습</h3>' + m.patterns.map(function(p) {
      return '<div class="j-wk-pat"><b class="j-wk-pat-t">' + _esc(p.label) + '</b>' +
        (p.rule ? '<span class="j-wk-pat-r">기준: ' + _esc(p.rule) + '</span>' : '') +
        '<button type="button" class="j-btn j-primary j-wk-act" onclick="WeeklyView._pattern(' + p.i + ')">🧩 이 패턴 ' + p.n + '핸드 연습</button></div>';
    }).join('') + '</section>';
  }
  function _bar(cls, label, s) {
    var w = s.pct == null ? 0 : s.pct;
    var txt = label + ' ' + (s.pct == null ? '기록 없음' : s.pct + '%') + (s.n ? '(결정 ' + s.n + ')' : '');
    return '<div class="j-wk-bar ' + cls + '"><span class="j-wk-bar-g" aria-hidden="true"><i style="width:' + w + '%"></i></span>' +
      '<span class="j-wk-bar-t">' + _esc(txt) + '</span></div>';
  }
  function _conceptsHTML(m) {
    var body;
    if (!m.concepts.length) body = '<p class="j-wk-empty">최근 14일에 판정된 결정이 없어요. 6인 실전이나 오늘의 5분 미션에서 결정이 쌓이면 보여요.</p>';
    else {
      body = '<div class="j-wk-cons">' + m.concepts.map(function(c) {
        var d = c.diff, dTxt = d == null ? (c.prev.n ? '' : '새로 기록') : (d > 0 ? '+' + d + '%p' : (d < 0 ? d + '%p' : '같음'));
        var dCls = d == null ? 'is-new' : (d > 0 ? 'is-up' : (d < 0 ? 'is-down' : 'is-same'));
        return '<div class="j-wk-con"><div class="j-wk-con-h"><b>' + _esc(c.label) + '</b>' +
          (dTxt ? '<span class="j-wk-diff ' + dCls + '">' + _esc(dTxt) + '</span>' : '') + '</div>' +
          _bar('is-prev', '그 앞 7일', c.prev) + _bar('is-now', '최근 7일', c.now) + '</div>';
      }).join('') + '</div>' +
      '<p class="j-wk-tip">초록 결정 비율이에요. 결정 수가 적으면 숫자가 크게 흔들리니 흐름만 참고해요.</p>';
    }
    return '<section class="j-wk-sec" aria-label="개념별 정확도"><h3 class="j-wk-h">📈 개념별 정확도</h3>' + body + '</section>';
  }
  function html(m) {
    m = m || {};
    var out = '<div class="j-sub j-wk">' + _head('📅 주간 리포트') + _resultLine(m.last);
    if (!m.ok) {
      return out + '<div class="j-card"><div class="j-card-t">🚧 주간 리포트를 준비하고 있어요</div>' +
        '<div class="j-card-d">실수 핸드 복습 기록이 생기면 이 화면에 한 주의 비싼 실수와 개념별 정확도가 모여요.</div>' + _homeBtn(true) + '</div></div>';
    }
    if (!m.hasContent) {
      return out + '<div class="j-card"><div class="j-card-t">아직 이번 주 기록이 없어요</div>' +
        '<div class="j-card-d">6인 실전에서 결정이 쌓이면 여기에 최근 7일의 비싼 실수 3개, 다시 풀기, 개념별 정확도가 모여요. 오늘의 5분이나 자유 게임으로 시작해 봐요.</div>' +
        _homeBtn(true) + '</div></div>';
    }
    out += (m.monday ? '<div class="j-wk-banner">🌅 새 주가 시작됐어요. 지난 7일을 돌아보고 이번 주를 시작해요.</div>' : '') +
      '<p class="j-wk-range">최근 7일(' + _esc(m.range) + '), 그 앞 7일과 비교</p>' +
      '<div class="j-wk-stats" role="list">' +
        '<div class="j-wk-stat" role="listitem"><b>' + m.added + '</b><span>새로 들어온 실수</span></div>' +
        '<div class="j-wk-stat" role="listitem"><b>' + m.fixed + '</b><span>고친 실수</span></div>' +
        '<div class="j-wk-stat" role="listitem"><b>' + m.due + '</b><span>다시 풀 차례</span></div>' +
      '</div>' +
      _topHTML(m) + _patternsHTML(m) + _conceptsHTML(m) +
      '<section class="j-wk-sec j-wk-soon" aria-label="주간 챌린지"><h3 class="j-wk-h">🏁 주간 챌린지</h3>' +
        '<p class="j-wk-empty">월요일마다 새 과제 3개가 열리는 칸이에요. 다음 업데이트에서 열려요.</p></section>' +
      _homeBtn(false);
    return out + '</div>';
  }

  // ── 열기와 버튼 ───────────────────────────────────────
  function open(params, el) {
    var now = _now(), rq = _rq();
    var m = model(rq, now);
    if (m.ok && m.hasContent && rq && typeof rq.markReportView === 'function') _try(function() { return rq.markReportView(now); }, null);
    m.last = _st.last;
    _st.last = null;
    _st.model = m;
    var h = html(m);
    if (el && typeof el === 'object') el.innerHTML = h;
    return h;
  }
  function _toast(msg) {
    if (typeof _env.toast === 'function') { _env.toast(msg); return; }
    var J = _m('JourneyUI');
    if (J && typeof J.toast === 'function') J.toast(msg, 2600);
  }
  function _activeScreen() {
    if (typeof _env.screen === 'function') return _env.screen();
    if (typeof document === 'undefined' || !document.querySelector) return '';
    var s = document.querySelector('.screen.active');
    return s ? s.id : '';
  }
  function _reopen() {
    if (typeof _env.reopen === 'function') { _env.reopen(); return; }
    var J = _m('JourneyUI');
    if (J && typeof J.view === 'function') J.view('weekly');
  }
  function _afterPractice(res, info) {
    _st.last = { res: _isObj(res) ? res : {}, info: info || null };
    // 연쇄가 끊긴 뒤 이미 다른 게임을 치고 있으면 화면을 빼앗지 않는다(결과 줄은 다음에 리포트를 열 때 보인다)
    if (_isObj(res) && res.aborted && _activeScreen() === 'screen-game') return;
    _reopen();
  }
  function _practice(items, info) {
    var rq = _rq();
    if (!rq || typeof rq.practice !== 'function') { _toast('다시 풀기를 준비하고 있어요'); return false; }
    var started = !!_try(function() { return rq.practice(items, { onDone: function(res) { _afterPractice(res, info); } }); }, false);
    if (!started) _toast('연습을 시작하지 못했어요. 잠시 뒤 다시 해 주세요');
    return started;
  }
  function _retry(i) {
    var m = _st.model, r = m && m.top && m.top[i];
    if (!r || !r.item) return false;
    return _practice([r.item], { kind: 'retry', key: r.key });
  }
  function _pattern(i) {
    var m = _st.model, p = m && m.patterns && m.patterns[i], rq = _rq();
    if (!p || !rq || typeof rq.patternItems !== 'function') return false;
    var items = _try(function() { return rq.patternItems(p.pattern, PRACTICE_MAX); }, []);
    if (!Array.isArray(items) || !items.length) { _toast('이 패턴의 실수 핸드가 지금은 없어요'); return false; }
    return _practice(items.slice(0, PRACTICE_MAX), { kind: 'pattern', pattern: p.pattern });
  }
  function _setEnv(e) { _env = _isObj(e) ? e : {}; _st = { model: null, last: null }; }

  var api = { open: open, model: model, html: html, cardInfo: cardInfo, weekKey: weekKey,
    PRACTICE_MAX: PRACTICE_MAX, _retry: _retry, _pattern: _pattern, _setEnv: _setEnv };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
