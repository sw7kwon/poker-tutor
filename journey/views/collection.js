// journey/views/collection.js (채우는 그룹: M6-COLLECT, 계약 H8)
// 🗂 수집(CollectionView, 설계서 4.6절 2번, 5.7절 수집 탭): JourneyUI.view('collection', params)가 open(params, el)로 연다
// (대시보드 수집 탭의 '🗂 수집 열기', 홈 새 배지 카드). 전부 조건 해금이고 무작위 보상은 없다(4.7절 3번).
// 탭 5개(params로 첫 탭 지정: 'badges' | 'cards' | 'cast' | 'archive' | 'looks')
//   배지: 얻은 배지만(Badges.list, 조건은 미리 보이지 않음), 얻은 날짜와 정보형 한 줄
//   명장면: 극장 명장면 카드(poker_journey.theater.cards, 최대 100장) 최근 순, TheaterUI.cardHTML 요약 + '🔍 자세히'(TheaterUI.showCard)
//   도감: 캐스트 6인(CAST), 단계(unlockStage)에 이르면 페이지가 열린다. 얼굴, 자기소개, 말버릇, HUD 4분류(계약 H4 대응),
//         내가 본 기록(JStats.castObs, 15핸드부터 수치), 명장면 출연과 속마음 수
//   속마음: 명장면 카드 제목(속마음 한 줄, 'NAME: 대사')을 인물별로 모은 아카이브
//   외형: 레벨 해금(4.3절) 고르기. 자동(가장 높은 레벨에서 연 것, 기본값), 기본, 해금된 것. 잠긴 것은 'Ln에서 열려요'
// 라벨(설계서 8.2절): 명장면과 속마음 탭은 캐릭터 읽기 한 줄(5번, 보라, 요약 카드는 카드 안 라벨을 숨기므로 탭에 1번),
//   도감의 HUD 분류는 '이 앱의 분류 기준'(3번, 파란).
// 구조: model(state, now)이 평범한 객체를 모으고 html(model, tab, opts)이 순수 문자열을 만든다(tests/j-badges.test.js).
// 클래스는 css/collection.css의 cv- 접두와 journey.css 공용(j-sub, j-sub-top, j-back, j-card, j-pick, j-btn). 로드 시 DOM 접근 없음.
var CollectionView = (function() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : this);
  var TABS = [['badges', '🏅', '배지'], ['cards', '🎬', '명장면'], ['cast', '👥', '도감'], ['archive', '💭', '속마음'], ['looks', '🎨', '외형']];
  var PAGE = 12;                 // 명장면 카드 한 번에 보이는 수(더 보기로 12장씩)
  var CARD_CAP = 100;
  var OBS_MIN = 15;              // 계약 H4: 15핸드 미만은 분류하지 않는다
  var STAGE_NAME = { 1: '첫 카드', 2: '자리 지키기', 3: '주도권', 4: '콤보 읽기', 5: '밸런스', 6: '익스플로잇' };
  // 계약 H4 HUD 4분류 라벨과 은닉 정답 대응(VillainTracker.CLASS_OF_TYPE이 있으면 그것을 쓴다)
  var CLASS_LABEL = { tight: '🧊 타이트', standard: '⚖ 정석', 'loose-aggr': '🔥 루즈-공격', 'loose-passive': '🐟 루즈-패시브' };
  var CLASS_OF_TYPE = { Nit: 'tight', TAG: 'standard', LAG: 'loose-aggr', Fish: 'loose-passive', Station: 'loose-passive' };
  // 라벨(설계서 8.2절): 속마음은 캐릭터 읽기(5번, 보라, TheaterUI.CHAR_NOTE와 같은 문구), HUD 4분류는 앱 정의(3번, 파란)
  var CHAR_NOTE = '속마음은 이 캐릭터의 생각이고 정답이 아니에요';
  var APP_NOTE = 'HUD 분류는 이 앱의 분류 기준이에요. 캐릭터의 평소 성향이고, 판마다 다르게 칠 수 있어요.';
  var FALLBACK_CAST = [
    { key: '교수', type: 'TAG', name: '교수', icon: '🎓', unlockStage: 1 }, { key: '햇살', type: 'Fish', name: '햇살', icon: '🌞', unlockStage: 1 },
    { key: '콜마스터', type: 'Station', name: '콜마스터', icon: '📞', unlockStage: 2 }, { key: '불도저', type: 'LAG', name: '불도저', icon: '🚜', unlockStage: 3 },
    { key: '바위', type: 'Nit', name: '바위', icon: '🗿', unlockStage: 4 }, { key: '카멜레온', type: 'Mixed', name: '카멜레온', icon: '🦎', unlockStage: 5 }
  ];

  var _el = null, _tab = 'badges', _limit = PAGE;

  // ── 작은 도구 ──
  function _isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function _n(x, d) { var v = Number(x); return isFinite(v) ? v : (d === undefined ? 0 : d); }
  function _ms(iso) { var t = Date.parse(iso); return isFinite(t) ? t : NaN; }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function _date(iso) {
    var t = _ms(iso);
    if (!isFinite(t)) return '';
    var d = new Date(t);
    return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '.';
  }
  function _m(name) { var o = G[name]; return (o && (typeof o === 'object' || typeof o === 'function')) ? o : null; }
  function _can(mod, fn) { var o = _m(mod); return !!(o && typeof o[fn] === 'function'); }
  function _call(mod, fn) {
    var o = _m(mod);
    if (!o || typeof o[fn] !== 'function') return undefined;
    try { return o[fn].apply(o, Array.prototype.slice.call(arguments, 2)); }
    catch (e) { if (typeof console !== 'undefined' && console.warn) console.warn('[CollectionView] ' + mod + '.' + fn, e && e.message); return undefined; }
  }
  function _charNote() {
    var T = _m('TheaterUI');
    var t = (T && typeof T.CHAR_NOTE === 'string' && T.CHAR_NOTE) ? T.CHAR_NOTE : CHAR_NOTE;
    return '<p class="cv-note">💜 ' + _esc(t) + '.</p>';
  }
  function _tabOf(p) {
    p = String(p == null ? '' : p);
    for (var i = 0; i < TABS.length; i++) if (TABS[i][0] === p) return p;
    return 'badges';
  }

  // ── 순수 모델 ──
  function _cast() {
    var C = _m('CAST');
    var src = Array.isArray(C) ? C.filter(function(c) { return _isObj(c) && c.key; }) : [];
    return src.length ? src : FALLBACK_CAST;
  }
  function _classOf(type) {
    var VT = _m('VillainTracker');
    var map = (VT && _isObj(VT.CLASS_OF_TYPE)) ? VT.CLASS_OF_TYPE : CLASS_OF_TYPE;
    return map[type] || null;
  }
  // 명장면 카드 제목 'NAME: 대사' → { name, text }(이름이 없으면 name null)
  function splitTitle(title) {
    var t = String(title == null ? '' : title).trim();
    var m = /^([^:]{1,12}):\s*(.+)$/.exec(t);
    return m ? { name: m[1].trim(), text: m[2].trim() } : { name: null, text: t };
  }
  function _cards(st) {
    var t = _isObj(st) && _isObj(st.theater) ? st.theater : {};
    return (Array.isArray(t.cards) ? t.cards : []).filter(function(c) { return _isObj(c) && c.id != null && String(c.id) !== ''; })
      .map(function(c, i) { return { c: c, i: i }; })
      .sort(function(a, b) {
        var ta = _ms(a.c.at), tb = _ms(b.c.at);
        ta = isFinite(ta) ? ta : 0; tb = isFinite(tb) ? tb : 0;
        return (tb - ta) || (b.i - a.i);
      }).map(function(o) { return o.c; }).slice(0, CARD_CAP);
  }
  function _obs(name, castObs) {
    var o = null;
    if (_isObj(castObs)) o = castObs[name];
    else if (_can('JStats', 'castObs')) o = _call('JStats', 'castObs', name);
    if (!_isObj(o)) return null;
    var h = Math.max(0, Math.floor(_n(o.hands)));
    if (!h) return null;
    return { hands: h, vpip: h >= OBS_MIN ? Math.round(_n(o.vpip) / h * 100) : null, pfr: h >= OBS_MIN ? Math.round(_n(o.pfr) / h * 100) : null };
  }

  // model(state, now, opts?) → 화면 모델. opts.castObs = { 이름: {hands, vpip, pfr} }(테스트 주입, 없으면 JStats.castObs)
  function model(state, now, opts) {
    opts = opts || {};
    var st = _isObj(state) ? state : (_call('Journey', 'load') || {});
    var stage = Math.max(1, Math.floor(_n(st.stage, 1)));
    var badges = _can('Badges', 'list') ? (_call('Badges', 'list', st) || []) : [];
    var cards = _cards(st);
    var lines = {};
    cards.forEach(function(c) {
      var sp = splitTitle(c.title);
      var k = sp.name || '';
      (lines[k] || (lines[k] = [])).push({ text: sp.text, at: c.at || null, id: String(c.id) });
    });
    // 도감 쪽 순서: 열리는 단계 순(같은 단계는 CAST 순)
    var castList = _cast().map(function(c, i) { return { c: c, i: i }; }).sort(function(a, b) {
      return (Math.max(1, Math.floor(_n(a.c.unlockStage, 1))) - Math.max(1, Math.floor(_n(b.c.unlockStage, 1)))) || (a.i - b.i);
    }).map(function(o) { return o.c; });
    var castNames = {};
    var cast = castList.map(function(c) {
      castNames[c.key] = true;
      var open = stage >= Math.max(1, Math.floor(_n(c.unlockStage, 1)));
      var inCards = cards.filter(function(x) { return Array.isArray(x.cast) && x.cast.some(function(n) { return (_isObj(n) ? n.name : n) === c.key; }); }).length;
      return { key: c.key, name: c.name || c.key, icon: c.icon || '🙂', face: open ? (c.face || '') : '', type: c.type || null,
        cls: _classOf(c.type), bio: open ? (c.bio || '') : '', tail: open ? (c.tail || '') : '', unlockStage: Math.max(1, Math.floor(_n(c.unlockStage, 1))),
        open: open, cards: inCards, lines: (lines[c.key] || []).length, obs: open ? _obs(c.key, opts.castObs) : null };
    });
    var archive = cast.filter(function(c) { return (lines[c.key] || []).length; }).map(function(c) {
      return { key: c.key, name: c.name, icon: c.icon, lines: lines[c.key] };
    });
    var others = [];
    Object.keys(lines).forEach(function(k) { if (!castNames[k]) others = others.concat(lines[k]); });
    if (others.length) archive.push({ key: '', name: '그 밖의 장면', icon: '🎬', lines: others });
    var lk = _can('Badges', 'looks') ? _call('Badges', 'looks', st) : null;
    return { stage: stage, badges: badges, cards: cards, cast: cast, archive: archive,
      looks: _isObj(lk) ? lk : { level: Math.max(1, Math.floor(_n(st.level, 1))), kinds: [] } };
  }

  // 대시보드 수집 탭 요약(순수)
  function summary(state) {
    var md = model(state || {}, Date.now(), { castObs: {} });
    var opts = [];
    md.looks.kinds.forEach(function(k) { opts = opts.concat(k.options || []); });
    return { badges: md.badges.length, cards: md.cards.length, castOpen: md.cast.filter(function(c) { return c.open; }).length,
      castTotal: md.cast.length, looksOpen: opts.filter(function(o) { return o.unlocked; }).length, looksTotal: opts.length,
      lines: md.archive.reduce(function(s, a) { return s + a.lines.length; }, 0) };
  }

  // ── 화면 문자열(순수) ──
  function _badgesHTML(md) {
    if (!md.badges.length) {
      return '<section class="j-card cv-empty"><div class="j-card-t">🏅 아직 모은 배지가 없어요</div>' +
        '<div class="j-card-d">배지는 조건을 미리 알리지 않는 깜짝 인정이에요. 평소처럼 배우고 연습하다 보면 하나씩 나타나요.</div></section>';
    }
    return '<p class="cv-lead">모은 배지 <b>' + md.badges.length + '개</b>. 얻은 배지만 보여요.</p>' +
      '<ul class="cv-badges">' + md.badges.map(function(b) {
        return '<li class="cv-badge"><span class="cv-badge-ic" aria-hidden="true">' + b.icon + '</span>' +
          '<span class="cv-badge-tx"><b class="cv-badge-n">' + _esc(b.name) + '</b><span class="cv-badge-d">' + _esc(b.text) + '</span>' +
          (b.at ? '<span class="cv-badge-at">' + _esc(_date(b.at)) + '</span>' : '') + '</span></li>';
      }).join('') + '</ul>';
  }
  function _cardsHTML(md, opts) {
    var cards = md.cards;
    if (!cards.length) {
      return '<section class="j-card cv-empty"><div class="j-card-t">🎬 아직 모은 명장면 카드가 없어요</div>' +
        '<div class="j-card-d">속마음 극장에서 드라마가 큰 핸드가 나오면 카드가 생겨요(최대 ' + CARD_CAP + '장).</div></section>';
    }
    var limit = Math.max(1, Math.floor(_n(opts && opts.limit, PAGE)));
    var canHtml = _can('TheaterUI', 'cardHTML'), canShow = _can('TheaterUI', 'showCard');
    var shown = cards.slice(0, limit);
    return '<p class="cv-lead">모은 명장면 카드 <b>' + cards.length + '장</b>(최대 ' + CARD_CAP + '장), 최근 순이에요.</p>' + _charNote() +
      '<div class="cv-cards">' + shown.map(function(c) {
        var inner = canHtml ? _call('TheaterUI', 'cardHTML', c) : '';
        if (typeof inner !== 'string' || !inner) {
          inner = '<div class="th-card"><div class="th-card-title">“' + _esc(c.title || '이름 없는 장면') + '”</div></div>';
        }
        return '<div class="cv-card is-compact" data-id="' + _esc(c.id) + '">' + inner +
          '<div class="cv-card-foot"><span class="cv-card-at">' + _esc(_date(c.at)) + '</span>' +
          (canShow ? '<button type="button" class="j-btn cv-card-btn" data-id="' + _esc(c.id) + '" onclick="CollectionView.showCard(this.getAttribute(\'data-id\'))">🔍 자세히</button>' : '') +
          '</div></div>';
      }).join('') + '</div>' +
      (cards.length > shown.length ? '<button type="button" class="j-btn cv-more" onclick="CollectionView.more()">더 보기(남은 ' + (cards.length - shown.length) + '장)</button>' : '');
  }
  function _obsHTML(c) {
    if (!c.obs) return '<p class="cv-cast-obs">내가 본 기록: 아직 없어요.</p>';
    if (c.obs.vpip === null) return '<p class="cv-cast-obs">내가 본 기록: ' + c.obs.hands + '핸드(' + OBS_MIN + '핸드부터 수치를 보여요)</p>';
    return '<p class="cv-cast-obs">내가 본 기록: ' + c.obs.hands + '핸드, 참여(VPIP) ' + c.obs.vpip + '%, 프리플랍 레이즈(PFR) ' + c.obs.pfr + '%</p>';
  }
  function _castHTML(md) {
    var open = md.cast.filter(function(c) { return c.open; }).length;
    return '<p class="cv-lead">캐릭터 도감 <b>' + open + '/' + md.cast.length + '쪽</b>. 단계가 오르면 새 쪽이 열려요.</p>' +
      '<p class="cv-note is-app">🔷 ' + APP_NOTE + '</p>' +
      '<div class="cv-cast">' + md.cast.map(function(c) {
        if (!c.open) {
          return '<section class="cv-cast-pg is-locked" aria-label="잠긴 도감 쪽">' +
            '<div class="cv-cast-top"><span class="cv-face cv-face-lock" aria-hidden="true">?</span>' +
            '<div class="cv-cast-id"><b class="cv-cast-n">🔒 아직 모르는 얼굴</b>' +
            '<span class="cv-cast-t">S' + c.unlockStage + ' ' + _esc(STAGE_NAME[c.unlockStage] || '') + ' 단계에서 이 쪽이 열려요</span></div></div></section>';
        }
        var face = c.face ? '<span class="cv-face">' + c.face + '</span>' : '<span class="cv-face cv-face-ic" aria-hidden="true">' + c.icon + '</span>';
        return '<section class="cv-cast-pg" aria-label="' + _esc(c.name) + ' 도감 쪽">' +
          '<div class="cv-cast-top">' + face + '<div class="cv-cast-id"><b class="cv-cast-n">' + c.icon + ' ' + _esc(c.name) + '</b>' +
          '<span class="cv-cast-t">' + (c.cls ? 'HUD 분류 ' + _esc(CLASS_LABEL[c.cls] || c.cls) : '그때그때 바뀌는 혼합형') + '</span></div></div>' +
          (c.bio ? '<p class="cv-cast-bio">' + _esc(c.bio) + '</p>' : '') +
          (c.tail ? '<p class="cv-cast-tail">말버릇: “' + _esc(c.tail) + '”</p>' : '') +
          _obsHTML(c) +
          '<p class="cv-cast-meta">명장면 출연 ' + c.cards + '장, 모은 속마음 ' + c.lines + '줄</p></section>';
      }).join('') + '</div>' +
      '<p class="cv-note">💜 극장 캐릭터의 속마음은 캐릭터의 생각이에요. 코치 판정과는 따로 봐요.</p>';
  }
  function _archiveHTML(md) {
    if (!md.archive.length) {
      return '<section class="j-card cv-empty"><div class="j-card-t">💭 아직 모은 속마음이 없어요</div>' +
        '<div class="j-card-d">명장면 카드의 제목(그 순간의 속마음 한 줄)이 인물별로 여기 쌓여요.</div></section>';
    }
    return '<p class="cv-lead">명장면 카드에 남은 속마음을 인물별로 모았어요.</p>' + _charNote() +
      md.archive.map(function(a) {
        return '<section class="j-card cv-arch"><h3 class="cv-arch-h">' + a.icon + ' ' + _esc(a.name) + ' <span class="cv-arch-n">' + a.lines.length + '줄</span></h3>' +
          '<ul class="cv-arch-list">' + a.lines.map(function(l) {
            return '<li class="cv-arch-l"><span class="cv-arch-q">“' + _esc(l.text) + '”</span>' + (l.at ? '<span class="cv-arch-at">' + _esc(_date(l.at)) + '</span>' : '') + '</li>';
          }).join('') + '</ul></section>';
      }).join('');
  }
  function _swatch(kind, id) {
    var cls = 'cv-sw cv-sw-' + kind + ' is-' + _esc(id);
    if (kind === 'tableColor') return '<span class="' + cls + '" aria-hidden="true"></span>';
    if (kind === 'cardBack') return '<span class="' + cls + '" aria-hidden="true"><span class="card back cv-sw-card"></span></span>';
    if (kind === 'castFrame') return '<span class="' + cls + '" aria-hidden="true"><span class="cv-sw-face">🎓</span></span>';
    return '<span class="' + cls + '" aria-hidden="true"><span class="cv-sw-film">🎬</span></span>';
  }
  function _looksHTML(md) {
    var lk = md.looks;
    return '<p class="cv-lead">지금 레벨 <b>L' + lk.level + '</b>. 레벨이 오르면 외형이 열려요(전부 외형만 바뀌어요).</p>' +
      lk.kinds.map(function(k) {
        var btn = function(id, label, on, disabled, sw) {
          return '<button type="button" class="j-pick cv-look-b' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '"' + (disabled ? ' disabled' : '') +
            (disabled ? '' : ' data-kind="' + _esc(k.kind) + '" data-look="' + _esc(id) + '" onclick="CollectionView.setLook(this.getAttribute(\'data-kind\'), this.getAttribute(\'data-look\'))"') +
            '>' + (sw || '') + '<span>' + label + '</span></button>';
        };
        var cur = k.effective === 'default' ? k.defaultName : ((k.options.filter(function(o) { return o.id === k.effective; })[0] || {}).name || k.effective);
        return '<section class="j-card cv-look"><h3 class="cv-look-h">' + _esc(k.title) + ' <span class="cv-look-cur">지금: ' + _esc(cur) + '</span></h3>' +
          '<div class="j-picks cv-look-picks">' +
          btn('auto', '자동(가장 최근에 연 것)', k.chosen === 'auto', false) +
          btn('default', _esc(k.defaultName), k.chosen === 'default', false, _swatch(k.kind, 'default')) +
          k.options.map(function(o) {
            return o.unlocked ? btn(o.id, _esc(o.name), k.chosen === o.id, false, _swatch(k.kind, o.id))
              : btn(o.id, '🔒 ' + _esc(o.name) + ', L' + o.level + '에서 열려요', false, true, _swatch(k.kind, o.id));
          }).join('') + '</div></section>';
      }).join('');
  }
  function html(md, tab, opts) {
    md = _isObj(md) ? md : { badges: [], cards: [], cast: [], archive: [], looks: { level: 1, kinds: [] } };
    tab = _tabOf(tab);
    var body = tab === 'cards' ? _cardsHTML(md, opts) : tab === 'cast' ? _castHTML(md) : tab === 'archive' ? _archiveHTML(md)
      : tab === 'looks' ? _looksHTML(md) : _badgesHTML(md);
    var tabs = '<div class="cv-tabs" role="tablist" aria-label="수집 탭">' + TABS.map(function(t) {
      var on = t[0] === tab;
      return '<button type="button" role="tab" class="cv-tab' + (on ? ' is-on' : '') + '" aria-selected="' + on + '" id="cv-tab-' + t[0] + '"' +
        ' onclick="CollectionView.tab(\'' + t[0] + '\')"><span class="cv-tab-ic" aria-hidden="true">' + t[1] + '</span><span class="cv-tab-t">' + t[2] + '</span></button>';
    }).join('') + '</div>';
    return '<div class="j-sub cv-view">' +
      '<div class="j-sub-top"><button type="button" class="j-back" aria-label="여정 홈으로" onclick="CollectionView.back()">↩</button>' +
      '<h2 class="j-sub-t">🗂 수집</h2></div>' + tabs +
      '<div class="cv-panel" role="tabpanel" aria-labelledby="cv-tab-' + tab + '">' + body + '</div></div>';
  }

  // ── DOM ──
  function render(el) {
    el = el || _el;
    var md = model(null, Date.now());
    var out = html(md, _tab, { limit: _limit });
    if (!el) return out;
    _el = el;
    el.innerHTML = out;
    return out;
  }
  function open(params, el) {
    if (!el && _can('JourneyUI', 'viewEl')) el = _call('JourneyUI', 'viewEl');
    _tab = _tabOf(params);
    _limit = PAGE;
    if (_can('Badges', 'applyLooks')) _call('Badges', 'applyLooks');
    render(el || null);
    return true;
  }
  function _focus(sel) {
    if (!_el || typeof document === 'undefined') return;
    try { var b = _el.querySelector(sel); if (b && b.focus) b.focus({ preventScroll: true }); } catch (e) { /* noop */ }
  }
  function tab(name) {
    _tab = _tabOf(name);
    _limit = PAGE;
    render();
    _focus('#cv-tab-' + _tab);
    return _tab;
  }
  function more() {
    _limit += PAGE;
    render();
    return _limit;
  }
  function showCard(id) {
    var st = _call('Journey', 'load');
    var card = _cards(st).filter(function(c) { return String(c.id) === String(id); })[0];
    if (!card || !_can('TheaterUI', 'showCard')) return false;
    return _call('TheaterUI', 'showCard', { card: card, onDone: function() {} }) !== false;
  }
  function setLook(kind, id) {
    var ok = _can('Badges', 'setLook') ? _call('Badges', 'setLook', kind, id) === true : false;
    if (ok) { render(); _focus('.cv-look-b.is-on[data-kind="' + kind + '"]'); }
    return ok;
  }
  function back() {
    if (_can('JourneyUI', 'back')) { _call('JourneyUI', 'back'); return; }
    if (_can('App', 'showMenu')) _call('App', 'showMenu');
  }

  var api = {
    TABS: TABS, PAGE: PAGE,
    open: open, render: render, tab: tab, more: more, showCard: showCard, setLook: setLook, back: back,
    model: model, summary: summary, html: html, splitTitle: splitTitle
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
