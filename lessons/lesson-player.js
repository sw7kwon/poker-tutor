// lessons/lesson-player.js (채우는 패키지: M3-P1b)
// 레슨 플레이어 DOM 레이어(설계서 3.1절 진행 규칙, 5.4절 화면, 5.9절 접근성, 8.3절 4번 '이상해요', 부록 D 용어 밑줄).
// 계약 L2(렌더 분담), L6(Leitner), L8(API)은 lessons/lesson-core.js 머리 주석. 상태기계는 LessonCore, 여기는 화면과 기록만.
//   start(lessonId, sceneIdx, onDone) → bool
//     장면마다 Journey.completeLesson(node, idx, false)로 이어 보기 위치 저장, 끝까지 보면 completeLesson(node, 마지막, true) 뒤
//     onDone({done:true, scene}). ↩, Esc, 안드로이드 뒤로는 같은 종료로 onDone({done:false, scene}).
//     레슨이 없으면 안내 토스트 뒤 onDone({done:false, scene, missing:true})와 false.
//     이미 끝낸 레슨을 마지막 장면 번호로 다시 열면(노드 시트 '다시 보기') 처음부터 보여 준다.
//   화면: JourneyUI.mountView('lesson', 셸) 안 .lp. 뒤로: Nav.view('lesson', id) + Nav.setBack('j/lesson').
//   진행: 하단 '다음' 버튼, 장면 탭(격자 장면 제외, 버튼이나 격자 칸, 용어를 누른 것은 제외), 좌우 스와이프(왼쪽 = 다음),
//     키보드 1~4(보기), Enter/Space(다음, 버튼에 포커스가 있으면 그 버튼), 화살표 좌우, Esc(종료).
//   ask: 정답은 바로 표시(✔ + 한 줄 해설), 오답은 정답 칸과 한 줄 해설을 보이고 1초 뒤 '다음'이 열린다(LessonCore 타이머).
//     오답 = Drills.record('lesson', '<노드>|<qid>', false), 정답은 항목이 이미 있을 때만 record(true)(L6).
//     XP(JOURNEY_XP.ask)는 첫 시도 정답만: 이 실행에서 처음 답했고, 그 키의 Leitner 항목이 없고(전에 틀린 적 없음),
//     아직 끝내지 않은 레슨일 때(다시 보기로 XP를 모으지 않게). 같은 페이지에서 나갔다 이어 볼 때도 문항당 1번.
//   장면 그림: say, ask, widget은 여기서, 나머지는 SceneRender.supports(t)일 때 SceneRender.render. 아직 없는 장면은 안내 카드
//     (sum은 문장 카드로 대신 그린다). 격자 장면은 줄을 누르면 그 줄이 커지는 2단계 선택(SceneRender.gridSelect)으로 둘러본다.
//     모든 장면의 caption 줄, label '참고' 회색 칩, calc가 있는 장면의 '엔진 계산'(chart, rangePct, band는 '이 앱 차트 기준') 칩.
//     (M5-P0) 등록 calc 유형(계약 L9)은 def.chip으로 칩을 고르고('appdef'는 '이 앱의 분류 기준'), SceneRender.render(obj, v)에
//     LessonCore.vars(scene)를 넘긴다(bar kind 'pct'의 줄 값). M5에서 그룹은 이 파일을 고치지 않는다.
//   (M6-P0, 계약 H1) widget 장면은 <div class="lp-widget" data-widget="이름" data-nogesture> 안에 LessonWidgets[이름].html(params).
//     DOM이 있으면 그 장면을 그린 뒤 mount(el, params, api)(있을 때, 장면에 들어올 때마다 1번), 장면을 떠날 때와 stop, exit,
//     완료 때 unmount()(있을 때). api = { note(kind, data) → Badges.note(kind, data, now)(typeof 가드), toast(msg) }.
//     [data-nogesture] 안의 touchstart는 스와이프 시작으로 보지 않고, click은 장면 탭 넘기기와 플레이어 버튼 동작에서 빼고,
//     키(숫자, Enter, 화살표)도 위젯 몫으로 둔다(Esc는 그대로 종료). M6에서 그룹은 이 파일을 고치지 않는다.
//   용어 밑줄: GLOSSARY {term, easy, same[]}가 있으면 caption과 say 문장에서 장면마다 용어별 첫 번째만 밑줄, 누르면 easy 팁.
//   '이상해요': Journey.load()의 flags[레슨 id]에 {at(ISO), scene} 추가 후 Journey.save(레슨당 최근 30개).
//   스타일은 css/journey.css 끝의 lp- 절(css/lesson.css는 장면 그림 sr- 전용).
// 로드 시 DOM 접근 없음. 다른 모듈은 호출 시점에 전역에서 찾는다(typeof 가드).
var LessonPlayer = (function() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : this);

  var FLAG_MAX = 30;
  var SWIPE_MIN = 56;          // 이만큼(px) 가로로 밀면 넘기기
  var SWIPE_MS = 900;
  var TAP_GUARD_MS = 400;      // 스와이프 직후 클릭 무시
  var PICK_GUARD_MS = 350;     // (M7, FLOW-03) 장면이 그려진 뒤 이 시간 안의 보기 탭은 무시(연타의 두 번째 탭이 방금 뜬 보기를 누르는 사고 방지). 키보드 1~4는 별개
  var LABELS = {
    ref: { cls: 'approx', icon: '≈', text: '참고', full: '공개 솔버 통념을 근사한 참고값이에요. 레이팅과 승급에는 넣지 않아요' },
    exact: { cls: 'exact', icon: '✔', text: '엔진 계산', full: '이 장면의 숫자는 엔진으로 다시 계산한 값이에요' },
    chart: { cls: 'chart', icon: '▦', text: '이 앱 차트 기준', full: '이 앱의 차트 기준(입문용, 표준보다 UTG/HJ/CO가 2~8%p 타이트, SB RFI 32.1%와 vs3bet 표도 타이트)' },
    appdef: { cls: 'appdef', icon: '◇', text: '이 앱의 분류 기준', full: '이 앱의 분류 기준. 레이팅과 데일리 5에는 넣지 않아요' }
  };
  var SCENE_NAME = { table: '테이블 그림', bar: '막대 그림', compare: '세 사람의 속마음 비교', widget: '체험 위젯', cards: '카드 그림',
    grid: '레인지 격자', ring: '팟 오즈 링', sum: '한 줄 요약' };

  var S = null;                // 진행 중 레슨(한 번에 1개)
  var _rootEl = null;          // .lp(DOM이 없으면 null, 테스트는 S.html을 본다)
  var _env = {};               // 테스트 주입 { now, setTimeout, clearTimeout }
  var _seq = 0;
  var _keysBound = false, _kbd = false;
  var _backNav = null, _backOff = null;
  var _touch = null, _swipeAt = 0;
  var _gloss = null, _glossSrc = null;
  var _askXp = {};             // 이 페이지에서 XP를 준 ask 키(중간에 나갔다 이어 볼 때 같은 문항 XP 두 번 방지)

  // ── 공용 헬퍼 ──────────────────────────────────────────
  function _m(name) { var o = G[name]; return (o && (typeof o === 'object' || typeof o === 'function')) ? o : null; }
  function _can(mod, fn) { var o = _m(mod); return !!(o && typeof o[fn] === 'function'); }
  function _call(mod, fn) {
    var o = _m(mod);
    if (!o || typeof o[fn] !== 'function') return undefined;
    try { return o[fn].apply(o, Array.prototype.slice.call(arguments, 2)); }
    catch (e) { _warn(mod + '.' + fn, e); return undefined; }
  }
  function _warn(where, e) { if (typeof console !== 'undefined' && console.warn) console.warn('[LessonPlayer] ' + where + ' 실패:', e && e.message ? e.message : e); }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function _num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function _now() { return typeof _env.now === 'function' ? _env.now() : Date.now(); }
  function _later(fn, ms) {
    if (typeof _env.setTimeout === 'function') return _env.setTimeout(fn, ms);
    return (typeof setTimeout === 'function') ? setTimeout(fn, ms) : null;
  }
  function _cancel(h) {
    if (h == null) return;
    if (typeof _env.clearTimeout === 'function') { _env.clearTimeout(h); return; }
    if (typeof clearTimeout === 'function') clearTimeout(h);
  }
  function _hasDom() { return typeof document !== 'undefined' && !!document && typeof document.getElementById === 'function'; }
  function _isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function _core() { return _m('LessonCore'); }
  function _toast(msg, ms) {
    if (_can('JourneyUI', 'toast')) { _call('JourneyUI', 'toast', msg, ms || 2400); return; }
    if (_can('Nav', 'toast')) _call('Nav', 'toast', msg, ms || 2400);
  }
  function _tip(text, owner) {
    if (_can('TouchUI', 'showTip')) { _call('TouchUI', 'showTip', text, owner); return; }
    _toast(text, 3200);
  }
  function _xpConst(k, d) { var X = _m('JOURNEY_XP'); return X && isFinite(X[k]) ? Number(X[k]) : d; }
  function _nodeRec(node) {
    var s = _call('Journey', 'load');
    return (s && s.nodes && s.nodes[node]) || null;
  }
  function _cb(fn, res) {
    if (typeof fn !== 'function') return;
    try { fn(res); } catch (e) { _warn('onDone', e); }
  }

  // ── 용어 사전(부록 D) ───────────────────────────────────
  function _reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function _glossary() {
    var list = _m('GLOSSARY');
    if (!Array.isArray(list) || !list.length) return null;
    if (_glossSrc === list && _gloss && _gloss.len === list.length) return _gloss;
    var words = [];
    list.forEach(function(it, i) {
      if (!it || !it.easy) return;
      [it.term].concat(Array.isArray(it.same) ? it.same : []).forEach(function(w) {
        w = String(w == null ? '' : w).trim();
        if (w && _esc(w) === w) words.push({ w: w, i: i });
      });
    });
    words.sort(function(a, b) { return b.w.length - a.w.length; });
    var byWord = {};
    words.forEach(function(x) { if (!(x.w in byWord)) byWord[x.w] = x.i; });
    _glossSrc = list;
    _gloss = { len: list.length, list: list, byWord: byWord,
      re: words.length ? new RegExp(words.map(function(x) { return _reEsc(x.w); }).join('|'), 'g') : null };
    return _gloss;
  }
  // 이스케이프된 문장에서 용어를 밑줄 버튼으로 감싼다(장면마다 용어별 첫 번째만, 앞 글자가 글자/숫자면 단어 중간이라 건너뜀)
  function termify(html, used) {
    var g = _glossary();
    if (!g || !g.re) return html;
    used = used || {};
    return String(html).replace(g.re, function(m, off, str) {
      var i = g.byWord[m];
      if (i == null || used[i]) return m;
      var prev = off > 0 ? str.charAt(off - 1) : '';
      if (prev && /[0-9A-Za-z\uac00-\ud7a3]/.test(prev)) return m;
      used[i] = true;
      return '<span class="lp-term" role="button" tabindex="0" data-act="term" data-term="' + i + '">' + m + '</span>';
    });
  }

  // ── 그리기(순수 문자열) ─────────────────────────────────
  function _chip(L) {
    return '<span class="lp-chip lp-chip--' + L.cls + '" title="' + _esc(L.full) + '"><span aria-hidden="true">' + L.icon + '</span> ' + _esc(L.text) + '</span>';
  }
  function _chips(sc) {
    var out = [];
    if (sc.label === '참고') out.push(_chip(LABELS.ref));
    // 승률 막대(bar equity, compare)는 SceneRender가 막대 아래에 '엔진 계산' 라벨을 직접 그린다(칩을 또 달면 두 번 보임)
    var ownTag = sc.t === 'bar' && (sc.kind === 'equity' || sc.kind === 'compare');
    // band(M4-P7, HeroStats.bandsFromChart)도 이 앱 차트에서 나온 값이라 차트 칩(설계서 8.2절 2번)
    var chartCalc = sc.calc && (sc.calc.type === 'chart' || sc.calc.type === 'rangePct' || sc.calc.type === 'band');
    // (M5-P0, L9) 등록 유형은 def.chip('exact' 기본, 'chart', 'appdef' = 이 앱의 분류 기준, 설계서 8.2절 3번)
    var C = _core(), def = (_isObj(sc.calc) && C && typeof C.calcDef === 'function') ? C.calcDef(sc.calc.type) : null;
    if (def && def.chip === 'chart') chartCalc = true;
    var appCalc = !!(def && def.chip === 'appdef');
    // (M7, S6-10) 장면 appdef: true(calc 없는 이 앱 규칙 질문)는 '이 앱의 분류 기준' 칩. 복습 카드(GenLesson.labelKind)와 같은 표기, 칩은 한 번만
    var appFlag = sc.appdef === true;
    if (appFlag) out.push(_chip(LABELS.appdef));
    if (_isObj(sc.calc) && sc.t !== 'grid' && !ownTag && !appFlag) out.push(_chip(appCalc ? LABELS.appdef : (chartCalc ? LABELS.chart : LABELS.exact)));
    return out.length ? '<div class="lp-meta">' + out.join('') + '</div>' : '';
  }
  // 받침이 있으면 '은', 없으면 '는'(한글이 아니면 '은')
  function _eun(word) {
    var c = String(word).charCodeAt(String(word).length - 1);
    return (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 === 0) ? '는' : '은';
  }
  function _soon(t) {
    var name = SCENE_NAME[t] || '이 장면';
    return '<div class="lp-soon" role="note"><span class="lp-soon-i" aria-hidden="true">🧩</span><b>' + _esc(name) + _eun(name) + ' 다음 업데이트에서 볼 수 있어요</b>' +
      '<span>지금은 아래 설명을 읽고 다음으로 넘어가요</span></div>';
  }
  // ── 위젯 장면(계약 H1, M6-P0) ──────────────────────────
  // LessonWidgets[name] = { html(params) → 순수 문자열, mount?(el, params, api), unmount?() }. html이 비거나 예외면 안내 카드.
  function _widgetDef(name) {
    var W = _m('LessonWidgets');
    if (!W || typeof name !== 'string' || !name || !Object.prototype.hasOwnProperty.call(W, name)) return null;
    var w = W[name];
    return (w && typeof w.html === 'function') ? w : null;
  }
  function _widgetParams(sc) { return _isObj(sc.params) ? sc.params : {}; }
  function _widgetHTML(sc) {
    var w = _widgetDef(sc.name);
    if (w) {
      try {
        var h = w.html(_widgetParams(sc));
        if (h) return '<div class="lp-widget" data-widget="' + _esc(sc.name) + '" data-nogesture>' + String(h) + '</div>';
      } catch (e) { _warn('widget ' + sc.name, e); }
    }
    return _soon('widget');
  }
  // mount의 세 번째 인자: 배지 기록(COLLECT의 Badges.note, 없으면 무시)과 토스트
  function _widgetApi() {
    return {
      note: function(kind, data) { return _call('Badges', 'note', kind, data, _now()); },
      toast: function(msg, ms) { _toast(String(msg == null ? '' : msg), ms); }
    };
  }
  function _widgetLeave() {
    var w = S && S.wg;
    if (!w) return;
    S.wg = null;
    if (w.def && typeof w.def.unmount === 'function') {
      try { w.def.unmount(); } catch (e) { _warn('widget ' + w.name + ' unmount', e); }
    }
  }
  // _render 뒤: 위젯 장면에 들어왔으면 mount 1번, 떠났으면 unmount. 같은 장면을 다시 그리면 mount한 위젯 DOM을 그대로 옮겨 둔다.
  function _widgetSync(st) {
    var sc = st.scene || {};
    var cur = sc.t === 'widget' ? st.idx : -1;
    if (S.wg && S.wg.idx !== cur) _widgetLeave();
    if (cur < 0 || !_rootEl || typeof _rootEl.querySelector !== 'function') return;
    var el = _rootEl.querySelector('.lp-widget');
    if (!el) return;                       // 위젯 모듈이 없거나 html이 비어 안내 카드를 그렸다
    if (S.wg) {
      var old = S.wg.el;
      if (old && old !== el && el.parentNode && typeof el.parentNode.replaceChild === 'function') {
        try { el.parentNode.replaceChild(old, el); } catch (e) { _warn('widget ' + S.wg.name + ' keep', e); }
      }
      return;
    }
    var def = _widgetDef(sc.name);
    S.wg = { idx: cur, name: sc.name, def: def, el: el };
    if (def && typeof def.mount === 'function') {
      try { def.mount(el, _widgetParams(sc), _widgetApi()); } catch (e) { _warn('widget ' + sc.name + ' mount', e); }
    }
  }
  // 장면 그림(L2 렌더 분담)
  function sceneHTML(sc, v, sel, used) {
    var C = _core();
    var fill = function(t) { return C ? _fillWith(t, v) : String(t == null ? '' : t); };
    if (sc.t === 'say') return '<div class="lp-say"><p>' + termify(_esc(fill(sc.text)), used) + '</p></div>';
    if (sc.t === 'ask') return '<div class="lp-ask"><span class="lp-ask-k">❓ 질문</span><p class="lp-q">' + _esc(fill(sc.q)) + '</p></div>';
    if (sc.t === 'widget') return _widgetHTML(sc);
    var SR = _m('SceneRender');
    var html = '';
    if (SR && typeof SR.supports === 'function' && SR.supports(sc.t) && typeof SR.render === 'function') {
      var obj = sc;
      if (sc.t === 'grid') {
        obj = {};
        Object.keys(sc).forEach(function(k) { obj[k] = sc[k]; });
        obj.pick = true;
        obj.sel = sel || null;
      }
      try { html = SR.render(obj, v) || ''; } catch (e) { _warn('SceneRender.render ' + sc.t, e); html = ''; }
    }
    if (html) return html;
    if (sc.t === 'sum' && sc.text) {
      return '<div class="lp-sum"><span class="lp-sum-k">📌 한 줄 요약</span><p>' + termify(_esc(sc.text), used) + '</p></div>';
    }
    return _soon(sc.t);
  }
  function _fillWith(text, v) {
    return String(text == null ? '' : text).replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, function(m, k) {
      return (v && Object.prototype.hasOwnProperty.call(v, k) && v[k] != null && v[k] !== '') ? String(v[k]) : '?';
    });
  }
  function _optCols(choices) {
    var n = choices.length, len = 0;
    choices.forEach(function(c) { len = Math.max(len, String(c).length); });
    if (n === 2) return len <= 14 ? 2 : 1;
    if (n === 3) return len <= 5 ? 3 : 1;
    return len <= 10 ? 2 : 1;
  }

  // 화면 전체(테스트와 하네스가 쓰는 순수 문자열). st = core.state(), x = { title, sel, kbdHint }
  function view(st, x) {
    x = x || {};
    var C = _core();
    var sc = st.scene || {};
    var v = C ? C.vars(sc) : {};
    var used = {};
    var n = st.n, idx = st.idx;
    var top = '<div class="lp-top">' +
      '<button type="button" class="j-back lp-exit" data-nav-back="1" data-act="exit" aria-label="레슨 나가기, 본 곳까지 저장돼요">↩</button>' +
      '<div class="lp-ttl">📖 ' + _esc(x.title || '') + '</div>' +
      '<button type="button" class="lp-flag" data-act="flag" aria-label="이 장면이 이상해요, 기록만 남아요" title="내용이 틀린 것 같으면 눌러 주세요. 이 장면 번호만 기록돼요">🤔 이상해요</button></div>';
    var dots = '';
    for (var i = 0; i < n; i++) dots += '<i class="lp-dot' + (i < idx ? ' is-done' : (i === idx ? ' is-cur' : '')) + '"></i>';
    var prog = '<div class="lp-prog" role="progressbar" aria-label="레슨 진행" aria-valuemin="1" aria-valuemax="' + n + '" aria-valuenow="' + (idx + 1) + '">' +
      '<div class="lp-dots" aria-hidden="true">' + dots + '</div><span class="lp-count">' + (idx + 1) + '/' + n + '</span></div>';
    var cap = sc.caption ? '<p class="lp-cap" aria-live="polite">' + termify(_esc(_fillWith(sc.caption, v)), used) + '</p>' : '';
    var body = sceneHTML(sc, v, x.sel, used);
    var stage = '<div class="lp-stage' + (sc.t === 'grid' ? ' is-grid' : '') + '" data-act="tap">' + _chips(sc) +
      '<div class="lp-scene lp-scene--' + _esc(sc.t || 'none') + '">' + body + '</div>' + cap + '</div>';

    var foot = '';
    var isAsk = sc.t === 'ask';
    var choices = isAsk && Array.isArray(sc.choices) ? sc.choices : [];
    if (isAsk) {
      var answered = st.phase === 'answered' && st.picked != null;
      var right = Number(sc.answer);
      if (answered) {
        var why = sc.why ? _fillWith(sc.why, v) : '';
        foot += st.ok
          ? '<div class="lp-feed is-ok" role="status"><b>✔ 정답!</b> ' + _esc(why) + '</div>'
          : '<div class="lp-feed is-bad" role="status"><b>✖ 아쉬워요.</b> 정답은 ' + _esc(_fillWith(choices[right], v)) + '. ' + _esc(why) + '</div>';
      }
      var cols = _optCols(choices.map(function(c) { return _fillWith(c, v); }));
      foot += '<div class="lp-opts lp-opts--c' + cols + '" role="group" aria-label="보기">';
      choices.forEach(function(c, k) {
        var cls = 'lp-opt', mark = '';
        if (answered) {
          if (k === right) { cls += ' is-ok'; mark = '<span class="lp-mark">✔ 정답</span>'; }
          else if (k === st.picked) { cls += ' is-bad'; mark = '<span class="lp-mark">✖ 내 선택</span>'; }
          else cls += ' is-dim';
        }
        foot += '<button type="button" class="' + cls + '"' + (answered ? ' aria-disabled="true" tabindex="-1"' : ' data-act="pick" data-i="' + k + '"') + '>' +
          (k < 4 ? '<span class="lp-key" aria-hidden="true">' + (k + 1) + '</span>' : '') + '<span class="lp-opt-t">' + _esc(_fillWith(c, v)) + '</span>' + mark + '</button>';
      });
      foot += '</div>';
    }
    var nextLabel = st.last ? '완료 ✓' : '다음 ▶';
    var showNext = !isAsk || st.phase === 'answered';
    var nextBtn = showNext
      ? '<button type="button" class="j-btn j-primary lp-next" data-act="next"' + (st.canNext ? '' : ' disabled aria-disabled="true"') + '>' +
        (st.canNext ? nextLabel : '해설을 읽어요') + '</button>'
      : '<span class="lp-wait">보기를 골라요</span>';
    foot += '<div class="lp-navrow"><button type="button" class="j-btn lp-prev" data-act="prev"' + (st.canPrev ? '' : ' disabled aria-hidden="true" tabindex="-1"') + ' aria-label="이전 장면">◀ 이전</button>' + nextBtn + '</div>';
    if (x.kbdHint) foot += '<div class="lp-hint">화면을 누르거나 옆으로 밀어도 넘어가요</div>';
    return top + prog + stage + '<div class="lp-foot">' + foot + '</div>';
  }

  // ── 진행 ──────────────────────────────────────────────
  function _render() {
    if (!S) return;
    var st = S.core.state();
    if (S.shownIdx !== st.idx) { S.shownIdx = st.idx; S.shownAt = _now(); }   // 장면이 바뀐 시각(FLOW-03 보기 탭 보호)
    var html = view(st, { title: S.lesson.title, sel: S.sel, kbdHint: st.idx === 0 && !S.wasDone });
    S.html = html;
    if (!_rootEl) return;
    if (S.wg && S.wg.idx !== st.idx) _widgetLeave();   // 위젯 장면을 떠날 때는 화면을 바꾸기 전에 unmount
    _rootEl.innerHTML = html;
    _rootEl.setAttribute('data-scene', String(st.idx));
    _rootEl.setAttribute('data-t', String((st.scene && st.scene.t) || ''));
    _widgetSync(st);
    if (S.scrollTop) {
      S.scrollTop = false;
      var scr = _hasDom() ? document.getElementById('screen-journey') : null;
      if (scr) scr.scrollTop = 0;
    }
    if (_kbd && typeof _rootEl.querySelector === 'function') {
      var f = _rootEl.querySelector('.lp-opt[data-act="pick"]') || _rootEl.querySelector('.lp-next:not([disabled])');
      if (f && f.focus) { try { f.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } }
    }
  }
  function _onRecord(token) {
    return function(evt) {
      if (!S || S.token !== token || !evt) return;
      if (evt.kind === 'scene') {
        S.sel = null;
        S.scrollTop = true;
        _call('Journey', 'completeLesson', S.node, evt.idx, false, _now());
        return;
      }
      if (evt.kind === 'answer') _onAnswer(evt);
    };
  }
  function _onAnswer(evt) {
    var prior = _call('Drills', 'item', 'lesson', evt.key);
    if (!evt.ok) _call('Drills', 'record', 'lesson', evt.key, false, undefined, _now());
    else if (prior) _call('Drills', 'record', 'lesson', evt.key, true, undefined, _now());
    if (_can('A11y', 'fx')) _call('A11y', 'fx', evt.ok ? 'ok' : 'bad');
    if (evt.ok && evt.first && !prior && !S.wasDone && !_askXp[evt.key]) {
      _askXp[evt.key] = true;
      var amt = _xpConst('ask', 2);
      if (amt > 0) {
        if (_can('JourneyUI', 'xp')) _call('JourneyUI', 'xp', 'ask', amt);
        else _call('Journey', 'addXp', 'ask', amt, _now());
        S.xp += amt;
      }
    }
  }
  function next() {
    if (!S) return false;
    if (!S.core.next()) {
      var st = S.core.state();
      if (st.scene && st.scene.t === 'ask' && st.phase === 'show') _toast('보기를 하나 골라요', 1600);
      return false;
    }
    if (S.core.state().phase === 'done') { _complete(); return true; }
    _render();
    return true;
  }
  function prev() {
    if (!S || !S.core.prev()) return false;
    _render();
    return true;
  }
  function answer(i) {
    if (!S) return null;
    var r = S.core.answer(i);
    if (r) _render();
    return r;
  }
  function _complete() {
    var last = S.n - 1, was = S.wasDone;
    _call('Journey', 'completeLesson', S.node, last, true, _now());
    if (_can('A11y', 'fx')) _call('A11y', 'fx', 'done');
    var xp = (was ? 0 : _xpConst('lesson', 15)) + S.xp;
    _toast('📖 레슨 완료' + (xp > 0 ? ', +' + xp + ' XP' : ''), 2400);
    _finish({ done: true, scene: last }, false);
  }
  // ↩, Esc, 안드로이드 뒤로: 본 곳까지(장면마다 저장됨)만 남기고 닫는다
  function exit(opts) {
    if (!S) return false;
    var st = S.core.state();
    _finish({ done: false, scene: st.idx }, !!(opts && opts.viaNav));
    return true;
  }
  function _finish(res, viaNav) {
    if (!S) return;
    var cb = S.onDone;
    _widgetLeave();
    S.core.destroy();
    S = null;
    _rootEl = null;
    if (!viaNav && _can('Nav', 'closeView')) _call('Nav', 'closeView', 'lesson');
    if (typeof cb === 'function') _cb(cb, res);
    else if (_can('JourneyUI', 'open')) _call('JourneyUI', 'open');
  }
  // 다른 화면이 여정 뷰를 덮어써 레슨 화면이 사라졌으면 조용히 내려놓는다(장면 위치는 이미 저장됨, onDone 없음)
  function _alive() {
    if (!S) return false;
    if (_rootEl && _rootEl.isConnected === false) { _widgetLeave(); S.core.destroy(); S = null; _rootEl = null; return false; }
    return true;
  }
  function stop() {
    if (!S) return false;
    _widgetLeave();
    S.core.destroy(); S = null; _rootEl = null;
    return true;
  }

  // ── '이상해요'(8.3절 4번) ──────────────────────────────
  function flag() {
    if (!S) return false;
    var idx = S.core.state().idx;
    if (S.flagged[idx]) { _toast('이 장면은 이미 알려 주셨어요. 고마워요', 2200); return false; }
    var s = _call('Journey', 'load');
    if (!s || typeof s !== 'object') { _toast('지금은 기록할 수 없어요', 2000); return false; }
    if (!_isObj(s.flags)) s.flags = {};
    var id = String(S.lesson.id || S.node);
    var list = Array.isArray(s.flags[id]) ? s.flags[id] : [];
    list.push({ at: new Date(_now()).toISOString(), scene: idx });
    if (list.length > FLAG_MAX) list = list.slice(list.length - FLAG_MAX);
    s.flags[id] = list;
    _call('Journey', 'save', s);
    S.flagged[idx] = true;
    _toast('고마워요! ' + (idx + 1) + '번째 장면을 다시 살펴볼게요', 2400);
    return true;
  }

  // ── 입력 ──────────────────────────────────────────────
  function _closest(el, sel) {
    if (!el || typeof el.closest !== 'function') return null;
    var hit = el.closest(sel);
    return (hit && (!_rootEl || typeof _rootEl.contains !== 'function' || _rootEl.contains(hit))) ? hit : null;
  }
  function _onClick(e) {
    if (!_alive()) return;
    var t = e && e.target;
    var tap = _closest(t, '[data-tap]');
    if (tap && S.core.state().scene && S.core.state().scene.t === 'grid') {
      var SR = _m('SceneRender');
      if (SR && typeof SR.gridSelect === 'function' && typeof SR.tapOf === 'function') {
        S.sel = SR.gridSelect(S.sel, SR.tapOf(tap.dataset || {}));
        _render();
      }
      return;
    }
    // 위젯 안([data-nogesture])의 탭은 위젯 몫이다. 장면 넘기기와 플레이어 버튼 동작에 쓰지 않는다(계약 H1)
    if (_closest(t, '[data-nogesture]')) return;
    var a = _closest(t, '[data-act]');
    if (!a) return;
    var act = a.getAttribute('data-act');
    _kbd = false;
    if (act === 'exit') { exit(); return; }
    if (act === 'flag') { flag(); return; }
    if (act === 'prev') { prev(); return; }
    if (act === 'next') { next(); return; }
    if (act === 'pick') {
      if (S.shownAt != null && _now() - S.shownAt < PICK_GUARD_MS) return;   // FLOW-03: 방금 그려진 장면의 보기 탭 무시
      answer(Number(a.getAttribute('data-i')));
      return;
    }
    if (act === 'term') { _termTip(a); return; }
    if (act === 'tap') {
      if (_now() - _swipeAt < TAP_GUARD_MS) return;
      if (_closest(t, 'button, a, input, select, textarea, [role="button"]')) return;
      var st = S.core.state();
      if (st.scene && st.scene.t === 'grid') return;     // 격자는 둘러보기 탭과 헷갈리지 않게 다음 버튼, 스와이프, 키로만
      if (!st.canNext) return;                          // 답 전이나 오답 1초 동안의 탭은 조용히 무시(안내 토스트는 스와이프, 키만)
      next();
    }
  }
  function _termTip(el) {
    var g = _glossary(), i = Number(el.getAttribute('data-term'));
    var it = g && g.list[i];
    if (it) _tip(String(it.term) + ': ' + String(it.easy), el);
  }
  function _onTouchStart(e) {
    if (!S || !e.touches || e.touches.length !== 1) { _touch = null; return; }
    var t = e.touches[0];
    if (_closest(e.target, '.sr-zcells, input, textarea, select, [data-nogesture]')) { _touch = null; return; }   // 위젯 드래그는 스와이프 아님
    _touch = { x: t.clientX, y: t.clientY, at: _now() };
  }
  function _onTouchEnd(e) {
    var st0 = _touch;
    _touch = null;
    if (!st0 || !_alive() || !e.changedTouches || !e.changedTouches.length) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - st0.x, dy = t.clientY - st0.y;
    if (_now() - st0.at > SWIPE_MS || Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    _swipeAt = _now();
    _kbd = false;
    if (dx < 0) next(); else prev();
  }
  function _screenOk() {
    if (!_hasDom() || typeof document.querySelector !== 'function') return true;
    var a = document.querySelector('.screen.active');
    return !a || a.id === 'screen-journey';
  }
  function _onKey(e) {
    if (!S || !e || e.ctrlKey || e.metaKey || e.altKey || !_screenOk() || !_alive()) return;
    var tg = e.target && e.target.tagName ? String(e.target.tagName).toLowerCase() : '';
    if (tg === 'input' || tg === 'textarea' || tg === 'select') return;
    var k = e.key;
    if (k === 'Escape') { e.preventDefault(); exit(); return; }
    if (_closest(e.target, '[data-nogesture]')) return;   // 위젯 안에 포커스가 있으면 숫자, Enter, 화살표는 위젯 몫
    var st = S.core.state();
    if (/^[1-4]$/.test(k)) {
      if (st.scene && st.scene.t === 'ask' && st.phase === 'show') { e.preventDefault(); _kbd = true; answer(Number(k) - 1); }
      return;
    }
    if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
      var role = e.target && e.target.getAttribute ? e.target.getAttribute('role') : null;
      if (tg === 'button' || tg === 'a' || role === 'button') return;   // 포커스된 버튼의 기본 동작(클릭)에 맡긴다
      e.preventDefault(); _kbd = true; next(); return;
    }
    if (k === 'ArrowRight') { e.preventDefault(); _kbd = true; next(); return; }
    if (k === 'ArrowLeft') { e.preventDefault(); _kbd = true; prev(); return; }
  }
  function _onTermKey(e) {
    if (!S || !e || (e.key !== 'Enter' && e.key !== ' ')) return;
    var a = _closest(e.target, '.lp-term');
    if (!a) return;
    e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    _termTip(a);
  }

  function _ensureKeys() {
    if (_keysBound || typeof window === 'undefined' || !window || typeof window.addEventListener !== 'function') return;
    window.addEventListener('keydown', _onKey);
    _keysBound = true;
  }
  function _ensureBack() {
    var N = _m('Nav');
    if (!N || typeof N.setBack !== 'function' || _backNav === N) return;
    if (_backOff) { try { _backOff(); } catch (e) { /* 무시 */ } }
    _backNav = N;
    try {
      _backOff = N.setBack('j/lesson', function() {
        if (!S) return false;
        exit({ viaNav: true });
        return 'done';
      });
    } catch (e) { _backOff = null; }
  }
  function _mount() {
    _rootEl = null;
    var v = _call('JourneyUI', 'mountView', 'lesson', '<div class="lp" data-lesson="' + _esc(S.lesson.id) + '"></div>');
    if (v && typeof v.querySelector === 'function') _rootEl = v.querySelector('.lp');
    if (_rootEl && typeof _rootEl.addEventListener === 'function') {
      _rootEl.addEventListener('click', _onClick);
      _rootEl.addEventListener('keydown', _onTermKey);
      _rootEl.addEventListener('touchstart', _onTouchStart, { passive: true });
      _rootEl.addEventListener('touchend', _onTouchEnd, { passive: true });
    }
  }
  function _navOpen(id) {
    if (!_can('Nav', 'view')) return;
    var want = '#j/lesson/' + encodeURIComponent(String(id));
    if (typeof location !== 'undefined' && location && String(location.hash || '') === want) return;
    _call('Nav', 'view', 'lesson', String(id));
  }

  // ── 시작 ──────────────────────────────────────────────
  function start(lessonId, sceneIdx, onDone) {
    var C = _core();
    var lesson = C && typeof C.find === 'function' ? C.find(lessonId) : null;
    var scenes = lesson && Array.isArray(lesson.scenes) ? lesson.scenes.filter(_isObj) : [];
    var at = Math.max(0, Math.floor(_num(sceneIdx, 0)));
    if (!lesson || !scenes.length || !C || typeof C.create !== 'function') {
      _toast('이 레슨은 다음 업데이트에서 열려요', 2400);
      _cb(onDone, { done: false, scene: at, missing: true });
      return false;
    }
    if (S) stop();
    var node = String(lesson.node || lesson.id);
    var rec = _nodeRec(node);
    var wasDone = !!(rec && rec.lesson && rec.lesson.done);
    var n = scenes.length;
    var idx = Math.min(n - 1, at);
    if (wasDone && at >= n - 1) idx = 0;      // 끝낸 레슨 다시 보기는 처음부터
    _seq++;
    var token = _seq;
    S = { token: token, lesson: lesson, node: node, onDone: onDone, wasDone: wasDone, n: n, sel: null, flagged: {}, xp: 0,
      html: '', scrollTop: true, startedAt: _now(), core: null, wg: null };
    S.core = C.create(lesson, idx, {
      timer: function(fn, ms) {
        return _later(function() { if (!S || S.token !== token) return; fn(); _render(); }, ms);
      },
      clear: _cancel,
      record: _onRecord(token)
    });
    _ensureBack();
    _ensureKeys();
    _mount();
    _navOpen(lesson.id);
    _render();
    return true;
  }

  // ── 테스트 전용 ────────────────────────────────────────
  function _setEnv(env) { _env = env || {}; }
  function _reset() {
    if (S) { _widgetLeave(); S.core.destroy(); }
    S = null; _rootEl = null; _env = {}; _kbd = false; _touch = null; _swipeAt = 0;
    if (_backOff) { try { _backOff(); } catch (e) { /* 무시 */ } }
    _backOff = null; _backNav = null; _gloss = null; _glossSrc = null; _askXp = {};
  }
  function state() {
    if (!S) return null;
    var st = S.core.state();
    return { id: S.lesson.id, node: S.node, idx: st.idx, n: st.n, phase: st.phase, picked: st.picked, ok: st.ok, ready: st.ready,
      canNext: st.canNext, wasDone: S.wasDone, xp: S.xp, sel: S.sel, html: S.html, t: st.scene ? st.scene.t : null };
  }
  function active() { return !!S; }

  var api = {
    FLAG_MAX: FLAG_MAX, LABELS: LABELS,
    start: start, next: next, prev: prev, answer: answer, exit: exit, stop: stop, flag: flag, state: state, active: active,
    view: view, sceneHTML: sceneHTML, termify: termify,
    _onKey: _onKey, _onClick: _onClick, _onTouchStart: _onTouchStart, _onTouchEnd: _onTouchEnd, _setEnv: _setEnv, _reset: _reset
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
