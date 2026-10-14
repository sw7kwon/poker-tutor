// ui/backup-ui.js — 9차 A-4b: 기록 백업/복원 모달 (메뉴 "💾 기록 백업/복원" → BackupUI.open())
// 모달은 open() 때 body에 동적 생성(index.html 마크업 없음). 로드 시 DOM 접근 금지 → node 러너 안전.
// 순수 헬퍼(fileName, summarize, deviceLabel, formatDate)는 DOM 없이 테스트한다.
var BackupUI = (function() {
  var MAX_FILE_BYTES = 8 * 1024 * 1024;   // 파일 크기 1차 차단(내용 검증은 Storage.validateBackup의 4MB 기준)
  var _root = null;        // #backup-modal
  var _pending = null;     // {obj, v, name} 검증 통과한 가져오기 후보
  var _prevFocus = null;
  var _downOnBackdrop = false; // 배경에서 누르기 시작한 탭만 닫기(텍스트 드래그가 배경에서 끝나도 안 닫힘)

  // ── 순수 헬퍼 ──
  function _pad(n) { return (n < 10 ? '0' : '') + n; }

  function fileName(date) {
    var d = (date instanceof Date && !isNaN(date.getTime())) ? date : new Date();
    return 'poker-tutor-backup-' + d.getFullYear() + _pad(d.getMonth() + 1) + _pad(d.getDate()) +
      '-' + _pad(d.getHours()) + _pad(d.getMinutes()) + '.json';
  }

  function formatDate(v) {
    if (v == null || v === '') return '';
    var d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate()) + ' ' + _pad(d.getHours()) + ':' + _pad(d.getMinutes());
  }

  function _isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  // 내보내기 객체(또는 {data}) → {hands, mistakes, drills, lastDate(ISO|null)}
  function summarize(obj) {
    var d = (_isObj(obj) && _isObj(obj.data)) ? obj.data : {};
    var hist = Array.isArray(d.poker_game_history) ? d.poker_game_history : [];
    var mis = Array.isArray(d.poker_mistakes) ? d.poker_mistakes : [];
    var items = (_isObj(d.poker_drills) && _isObj(d.poker_drills.items)) ? d.poker_drills.items : {};
    var last = -Infinity;
    function see(v) {
      if (v == null || v === '') return;
      var t = typeof v === 'number' ? v : Date.parse(v);
      if (isFinite(t) && t > last) last = t;
    }
    hist.forEach(function(h) { if (_isObj(h)) see(h.date); });
    mis.forEach(function(m) { if (_isObj(m)) see(m.date); });
    Object.keys(items).forEach(function(k) { if (_isObj(items[k])) see(items[k].last); });
    return { hands: hist.length, mistakes: mis.length, drills: Object.keys(items).length,
      lastDate: isFinite(last) ? new Date(last).toISOString() : null };
  }

  // device {ua, platform, standalone} → "Android, 삼성 인터넷 (설치 앱)"
  function deviceLabel(dev) {
    if (!_isObj(dev)) return '알 수 없는 기기';
    var ua = String(dev.ua || '');
    var os = /Android/i.test(ua) ? 'Android' :
      /iPhone|iPad|iPod/i.test(ua) ? 'iPhone/iPad' :
      /Windows/i.test(ua) ? 'Windows PC' :
      /Macintosh|Mac OS X/i.test(ua) ? 'Mac' :
      /CrOS/i.test(ua) ? 'Chromebook' :
      /Linux/i.test(ua) ? 'Linux PC' : (dev.platform ? String(dev.platform) : '');
    var br = /SamsungBrowser/i.test(ua) ? '삼성 인터넷' :
      /Edg(A|iOS)?\//.test(ua) ? 'Edge' :
      /Whale\//.test(ua) ? '웨일' :
      /Firefox|FxiOS/.test(ua) ? 'Firefox' :
      /Chrome|CriOS/.test(ua) ? 'Chrome' :
      /Safari/.test(ua) ? 'Safari' : '';
    var label = [os, br].filter(Boolean).join(', ');
    if (!label) return '알 수 없는 기기';
    return label + (dev.standalone ? ' (설치 앱)' : '');
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function _countsText(c) { return '핸드 ' + c.hands + '건, 실수 ' + c.mistakes + '건, 드릴 ' + c.drills + '개'; }

  // ── 환경 ──
  function _version() { return (typeof PWA !== 'undefined' && PWA && PWA.version) || 'dev'; }
  function _nav() { return (typeof navigator !== 'undefined') ? navigator : null; }
  function _$(id) { return document.getElementById(id); }

  // canShare 통과하는 File(.json 우선, 안드로이드 크롬은 json 공유를 막아서 .txt 대안)
  function _shareFile(json, name) {
    var nav = _nav();
    if (!nav || typeof nav.canShare !== 'function' || typeof nav.share !== 'function' || typeof File === 'undefined') return null;
    var cands = [[name, 'application/json'], [name.replace(/\.json$/, '.txt'), 'text/plain']];
    for (var i = 0; i < cands.length; i++) {
      try {
        var f = new File([json], cands[i][0], { type: cands[i][1] });
        if (nav.canShare({ files: [f] })) return f;
      } catch (e) { /* 다음 후보 */ }
    }
    return null;
  }

  // ── 모달 ──
  var HTML =
    '<div class="bk-dialog" role="dialog" aria-modal="true" aria-labelledby="bk-title" tabindex="-1">' +
      '<div class="bk-head">' +
        '<h2 id="bk-title">💾 기록 백업/복원</h2>' +
        '<button type="button" class="bk-close" data-act="close" aria-label="닫기">✕</button>' +
      '</div>' +
      '<div class="bk-body">' +
        '<section class="bk-now" aria-label="이 기기에 저장된 기록">' +
          '<div class="bk-now-title">이 기기에 저장된 기록</div>' +
          '<div class="bk-stats" id="bk-now-stats"></div>' +
          '<div class="bk-now-last" id="bk-now-last"></div>' +
        '</section>' +
        '<section class="bk-sec">' +
          '<h3>📤 내보내기</h3>' +
          '<p class="bk-help">기록 전체를 파일 하나로 저장해요. 폰을 바꾸거나 PC와 폰을 오갈 때 이 파일을 옮기면 돼요.</p>' +
          '<div class="bk-row">' +
            '<button type="button" class="bk-btn primary" data-act="export">📤 파일로 내보내기</button>' +
            '<button type="button" class="bk-btn" data-act="share" id="bk-share" hidden>📲 공유하기</button>' +
          '</div>' +
          '<p class="bk-help bk-help-after" id="bk-share-help" hidden>공유하기를 누르면 카카오톡 \'나에게\'나 드라이브로 바로 보낼 수 있어요.</p>' +
        '</section>' +
        '<section class="bk-sec">' +
          '<h3>📥 가져오기</h3>' +
          '<p class="bk-help">다른 기기에서 내보낸 백업 파일을 골라요. 바로 바뀌지 않고 파일 내용을 먼저 보여 줘요.</p>' +
          '<div class="bk-row"><button type="button" class="bk-btn primary" data-act="pick">📥 백업 파일 고르기</button></div>' +
          '<input type="file" id="bk-file" accept="application/json,.json,text/plain,.txt" hidden>' +
          '<details class="bk-paste" id="bk-paste">' +
            '<summary>파일 목록에 안 보이면: 내용 붙여넣기</summary>' +
            '<textarea id="bk-paste-text" rows="4" spellcheck="false" autocomplete="off" autocapitalize="off" ' +
              'placeholder="백업 파일 내용을 통째로 복사해서 붙여넣으세요"></textarea>' +
            '<div class="bk-row"><button type="button" class="bk-btn" data-act="paste">붙여넣은 내용 확인</button></div>' +
          '</details>' +
          '<div class="bk-preview" id="bk-preview" hidden></div>' +
        '</section>' +
        '<section class="bk-sec" id="bk-undo-sec" hidden>' +
          '<h3>↩ 되돌리기</h3>' +
          '<p class="bk-help" id="bk-undo-help"></p>' +
          '<div class="bk-row"><button type="button" class="bk-btn" data-act="undo">↩ 가져오기 전 기록으로 되돌리기</button></div>' +
        '</section>' +
      '</div>' +
      '<div class="bk-msg" id="bk-msg" role="status" aria-live="polite"></div>' +
      '<div class="bk-foot">앱 버전 <span id="bk-ver"></span>, 저장소 보호 <span id="bk-persist">확인 중</span></div>' +
    '</div>';

  function _build() {
    _root = document.createElement('div');
    _root.id = 'backup-modal';
    _root.className = 'bk-overlay';
    _root.hidden = true;
    _root.innerHTML = HTML;
    document.body.appendChild(_root);
    _root.addEventListener('pointerdown', function(e) { _downOnBackdrop = e.target === _root; });
    _root.addEventListener('click', _onClick);
    _$('bk-file').addEventListener('change', _onFile);
  }

  function _onClick(e) {
    if (e.target === _root) { if (_downOnBackdrop) close(); _downOnBackdrop = false; return; }   // 바깥(어두운 배경) 탭 → 닫기
    var btn = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!btn || !_root.contains(btn)) return;
    var act = btn.getAttribute('data-act');
    if (act === 'close') close();
    else if (act === 'export') _doExport();
    else if (act === 'share') _doShare();
    else if (act === 'pick') { _msg('', ''); _$('bk-file').click(); }
    else if (act === 'paste') _handleText(_$('bk-paste-text').value, '붙여넣은 내용');
    else if (act === 'apply') _apply();
    else if (act === 'cancel') { _pending = null; _renderPreview(); _msg('', ''); _focusDialog(); }
    else if (act === 'undo') _undo();
  }

  // 닫힌 <details> 안(자기 summary 제외)은 크롬에서 레이아웃 박스가 남아 offsetParent가 있어도 Tab으로 못 감 → 제외
  function _inClosedDetails(el) {
    var d = el.closest ? el.closest('details:not([open])') : null;
    while (d) {
      if (!(el.tagName === 'SUMMARY' && el.parentElement === d)) return true;
      d = d.parentElement ? d.parentElement.closest('details:not([open])') : null;
    }
    return false;
  }

  function _focusables() {
    return Array.prototype.filter.call(
      _root.querySelectorAll('button, [href], input, textarea, select, summary, [tabindex]:not([tabindex="-1"])'),
      function(el) { return !el.disabled && !el.hidden && el.offsetParent !== null && !_inClosedDetails(el); });
  }

  function _focusDialog() {
    var dlg = _root && _root.querySelector('.bk-dialog');
    if (!dlg) return;
    try { dlg.focus({ preventScroll: true }); } catch (e) { dlg.focus(); }
  }

  // 열려 있는 동안 document에서 받음(버튼이 다시 그려져 포커스가 body로 빠져도 Esc·Tab 동작)
  function _onKey(e) {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    var f = _focusables();
    if (!f.length) { e.preventDefault(); return; }
    // 목록 밖(대화상자 자체, 배경, body)에서 누르면 양 끝으로 감싸서 배경 요소로 새지 않게
    var idx = f.indexOf(document.activeElement);
    if (e.shiftKey && idx <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (idx < 0 || idx === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  }

  function _msg(kind, text) {
    var el = _$('bk-msg');
    if (!el) return;
    el.className = 'bk-msg' + (kind ? ' ' + kind : '');
    el.textContent = text || '';
  }

  function _renderNow() {
    var s = summarize(Storage.exportAll());
    _$('bk-now-stats').innerHTML =
      '<div class="bk-stat"><b>' + s.hands + '</b><span>핸드</span></div>' +
      '<div class="bk-stat"><b>' + s.mistakes + '</b><span>실수</span></div>' +
      '<div class="bk-stat"><b>' + s.drills + '</b><span>드릴 항목</span></div>';
    _$('bk-now-last').textContent = s.lastDate ? '마지막 기록: ' + formatDate(s.lastDate) : '아직 저장된 기록이 없어요';
    var info = Storage.prevInfo ? Storage.prevInfo() : null;
    _$('bk-undo-sec').hidden = !info;
    if (info) {
      _$('bk-undo-help').textContent = '마지막으로 가져오기 직전' + (info.savedAt ? '(' + formatDate(info.savedAt) + ')' : '') +
        ' 상태로 돌아가요. 가져오기를 잘못했을 때 쓰세요.';
    }
    var nav = _nav();
    var canShare = !!_shareFile('{}', 'probe.json');
    _$('bk-share').hidden = !canShare;
    _$('bk-share-help').hidden = !canShare;
    _$('bk-ver').textContent = _version();
    var ps = _$('bk-persist');
    ps.textContent = '확인 불가';
    try {
      if (nav && nav.storage && typeof nav.storage.persisted === 'function') {
        nav.storage.persisted().then(function(p) {
          ps.textContent = p ? '켜짐' : '꺼짐 (가끔 내보내기로 보관해 두세요)';
        }, function() {});
      }
    } catch (e) { /* 확인 불가 유지 */ }
  }

  function _renderPreview(errors) {
    var el = _$('bk-preview');
    if (errors) {
      el.hidden = false;
      el.className = 'bk-preview err';
      el.innerHTML = '<div class="bk-pv-title">⚠ 이 파일은 가져올 수 없어요</div><ul class="bk-errs">' +
        errors.map(function(t) { return '<li>' + _esc(t) + '</li>'; }).join('') + '</ul>' +
        '<div class="bk-row"><button type="button" class="bk-btn" data-act="cancel">닫기</button></div>';
      return;
    }
    if (!_pending) { el.hidden = true; el.innerHTML = ''; el.className = 'bk-preview'; return; }
    var v = _pending.v, obj = _pending.obj;
    var fileSum = summarize(obj);
    var merged = Storage.mergeData(Storage.exportAll().data, obj.data);
    var mergedSum = summarize({ data: merged });
    el.hidden = false;
    el.className = 'bk-preview';
    el.innerHTML =
      '<div class="bk-pv-title">📄 ' + _esc(_pending.name) + '</div>' +
      '<dl class="bk-pv">' +
        '<dt>내보낸 날짜</dt><dd>' + _esc(formatDate(v.exportedAt) || '알 수 없음') + '</dd>' +
        '<dt>내보낸 기기</dt><dd>' + _esc(deviceLabel(v.device)) + '</dd>' +
        '<dt>담긴 기록</dt><dd>' + _esc(_countsText(fileSum)) + '</dd>' +
        (fileSum.lastDate ? '<dt>마지막 기록</dt><dd>' + _esc(formatDate(fileSum.lastDate)) + '</dd>' : '') +
      '</dl>' +
      '<fieldset class="bk-modes"><legend>어떻게 가져올까요?</legend>' +
        '<label class="bk-mode"><input type="radio" name="bk-mode" value="merge" checked>' +
          '<span><b>병합 (권장)</b><small>이 기기 기록과 파일 기록을 합쳐요. 같은 기록은 한 번만 남기고, 핸드와 실수는 최근 200건까지 보관해요. ' +
          '코칭, 띵킹 설정은 이 기기 것을 그대로 써요.<br>합친 결과: ' + _esc(_countsText(mergedSum)) + '</small></span></label>' +
        '<label class="bk-mode"><input type="radio" name="bk-mode" value="replace">' +
          '<span><b>덮어쓰기</b><small>이 기기 기록을 지우고 파일 내용으로 바꿔요.<br>바꾼 결과: ' + _esc(_countsText(fileSum)) + '</small></span></label>' +
      '</fieldset>' +
      '<div class="bk-row">' +
        '<button type="button" class="bk-btn primary" data-act="apply">적용하기</button>' +
        '<button type="button" class="bk-btn" data-act="cancel">취소</button>' +
      '</div>';
  }

  function _handleText(text, name) {
    _pending = null;
    var src = String(text == null ? '' : text).replace(/^﻿/, '').trim();
    if (!src) { _renderPreview(['내용이 비어 있어요']); return; }
    var obj;
    try { obj = JSON.parse(src); }
    catch (e) { _renderPreview(['백업 파일 형식(JSON)이 아니에요. 포커 튜터에서 내보낸 파일인지 확인해 주세요']); return; }
    var v = Storage.validateBackup(obj);
    if (!v.ok) { _renderPreview(v.errors); return; }
    _pending = { obj: obj, v: v, name: name || '백업 파일' };
    _renderPreview();
    _msg('', '');
    var pv = _$('bk-preview');
    if (pv && pv.scrollIntoView) { try { pv.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {} }
  }

  function _readFile(file) {
    if (typeof file.text === 'function') return file.text();
    return new Promise(function(resolve, reject) {
      var r = new FileReader();
      r.onload = function() { resolve(String(r.result)); };
      r.onerror = function() { reject(r.error); };
      r.readAsText(file);
    });
  }

  function _onFile(e) {
    var input = e.target;
    var file = input.files && input.files[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { input.value = ''; _pending = null; _renderPreview(['파일이 너무 커요. 포커 튜터 백업 파일이 맞는지 확인해 주세요']); return; }
    _readFile(file).then(function(text) { _handleText(text, file.name); },
      function() { _pending = null; _renderPreview(['파일을 읽지 못했어요. 다시 골라 주세요']); })
      .then(function() { input.value = ''; });   // 같은 파일을 다시 골라도 change가 오도록
  }

  function _exportJson() { return JSON.stringify(Storage.exportAll()); }

  function _doExport() {
    try {
      var name = fileName(new Date());
      var url = URL.createObjectURL(new Blob([_exportJson()], { type: 'application/json' }));
      var a = document.createElement('a');
      a.href = url; a.download = name; a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function() { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 2000);
      _msg('ok', '파일을 저장했어요: ' + name + '. 다운로드 폴더(브라우저 다운로드 목록)에서 찾을 수 있어요.');
    } catch (e) {
      _msg('err', '내보내기에 실패했어요. (' + (e && e.message) + ')');
    }
  }

  // 사용자 제스처 안에서 바로 share 호출(안드로이드 공유 시트 요건)
  function _doShare() {
    var f = _shareFile(_exportJson(), fileName(new Date()));
    if (!f) { _msg('err', '이 브라우저는 파일 공유를 지원하지 않아요. "파일로 내보내기"를 써 주세요.'); return; }
    _nav().share({ files: [f], title: '포커 튜터 기록 백업' }).then(function() {
      _msg('ok', '공유했어요: ' + f.name);
    }, function(err) {
      if (err && err.name === 'AbortError') return;   // 사용자가 취소
      _msg('err', '공유하지 못했어요. "파일로 내보내기"를 써 주세요.');
    });
  }

  function _gameActive() {
    var g = _$('screen-game');
    return !!(g && g.classList.contains('active'));
  }

  function _reload() {
    setTimeout(function() { try { location.reload(); } catch (e) {} }, 250);
  }

  function _apply() {
    if (!_pending) return;
    if (_gameActive()) { _msg('err', '게임 중에는 가져올 수 없어요. 메뉴에서 다시 열어 주세요.'); return; }
    var sel = _root.querySelector('input[name="bk-mode"]:checked');
    var mode = sel ? sel.value : 'merge';
    var q = mode === 'merge'
      ? '이 기기 기록에 파일 기록을 합칠까요?\n\n지금 상태는 자동으로 보관돼서, 잘못되면 "되돌리기"로 돌아갈 수 있어요.'
      : '이 기기 기록을 지우고 파일 내용으로 바꿀까요?\n\n지금 상태는 되돌리기용으로 한 번만 보관돼요.';
    if (typeof confirm === 'function' && !confirm(q)) return;
    try {
      Storage.importAll(_pending.obj, mode);
    } catch (e) {
      _msg('err', '가져오지 못했어요: ' + (e && e.message) + '. 기존 기록은 그대로예요.');
      return;
    }
    _pending = null;
    _msg('ok', '가져왔어요. 화면을 새로 불러올게요…');
    _reload();
  }

  function _undo() {
    if (_gameActive()) { _msg('err', '게임 중에는 되돌릴 수 없어요. 메뉴에서 다시 열어 주세요.'); return; }
    if (typeof confirm === 'function' && !confirm('가져오기 직전 기록으로 되돌릴까요?\n\n가져온 뒤에 새로 쌓인 기록은 사라져요.')) return;
    var ok = false;
    try { ok = Storage.restorePrev(); } catch (e) { ok = false; }
    if (!ok) { _msg('err', '되돌릴 기록이 없어요.'); _renderNow(); return; }
    _msg('ok', '되돌렸어요. 화면을 새로 불러올게요…');
    _reload();
  }

  function open() {
    if (typeof document === 'undefined' || typeof Storage === 'undefined' || !Storage.exportAll) return;
    if (!_root || !_root.parentNode) _build();
    _pending = null;
    _msg('', '');
    var pt = _$('bk-paste-text'); if (pt) pt.value = '';
    var pd = _$('bk-paste'); if (pd) pd.open = false;
    _renderPreview();
    _renderNow();
    _prevFocus = document.activeElement;
    _root.hidden = false;
    var body = _root.querySelector('.bk-body'); if (body) body.scrollTop = 0;
    document.removeEventListener('keydown', _onKey, true);
    document.addEventListener('keydown', _onKey, true);
    _focusDialog();
  }

  function close() {
    if (!_root) return;
    _root.hidden = true;
    _pending = null;
    document.removeEventListener('keydown', _onKey, true);
    if (_prevFocus && typeof _prevFocus.focus === 'function') { try { _prevFocus.focus(); } catch (e) {} }
    _prevFocus = null;
  }

  function isOpen() { return !!(_root && !_root.hidden); }

  return { open: open, close: close, isOpen: isOpen,
    fileName: fileName, summarize: summarize, deviceLabel: deviceLabel, formatDate: formatDate };
})();
