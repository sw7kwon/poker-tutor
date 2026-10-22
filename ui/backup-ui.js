// ui/backup-ui.js — 9차 A-4b: 기록 백업/복원 모달 (메뉴 "💾 기록 백업/복원" → BackupUI.open())
// 모달은 open() 때 body에 동적 생성(index.html 마크업 없음). 로드 시 DOM 접근 금지 → node 러너 안전.
// 순수 헬퍼(fileName, summarize, deviceLabel, formatDate)는 DOM 없이 테스트한다.
// M7: 공유 성공도 내보내기와 같은 경로로 '월 백업'에 센다(결정 29). homeCard(state, now) → { html, emph? } | null (홈 카드 공급자, 계약 H11 a):
//   저장 공간 사용량이 90% 이상이면 용량 경고 카드(emph), 아니면 이번 달 백업(내보내기 또는 공유)이 없을 때 월간 백업 카드.
//   가져오기 미리보기는 방식마다 공간 경고를 미리 보이고 모자라면 적용하기를 막는다(Storage.planImport). 되돌리기 사본은 30일 뒤 지워지고
//   되돌리기를 다시 되돌릴 수 있다(Storage.prevInfo().kind).
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
    var b = (typeof Storage !== 'undefined' && Storage && typeof Storage.brief === 'function') ? Storage.brief(d) : { xp: 0, passed: 0, review: 0 };
    return { hands: hist.length, mistakes: mis.length, drills: Object.keys(items).length,
      lastDate: isFinite(last) ? new Date(last).toISOString() : null, xp: b.xp, passed: b.passed, review: b.review, career: b.career || null };
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
  // 여정 기록 한 줄(DATA-02: 병합이 여정 필드를 버려도 사용자가 알 수 없던 문제). 값이 없으면 빈 문자열
  function _journeyText(c) {
    var parts = [];
    if (c && c.xp > 0) parts.push('여정 XP ' + c.xp);
    if (c && c.passed > 0) parts.push('통과 노드 ' + c.passed + '개');
    if (c && c.review > 0) parts.push('실수 복습 ' + c.review + '개');
    return parts.join(', ');
  }
  // (웨이브1 통합) 커리어 기록 줄: Storage.brief().career { bankroll, sessions, trophies }, 없으면 ''
  function _careerText(c) {
    var k = c && c.career;
    if (!_isObj(k)) return '';
    var coins = Math.round((Number(k.bankroll) || 0) * 10) / 10;
    var parts = ['자산 ' + coins.toLocaleString('ko-KR') + '코인', '세션 ' + (k.sessions || 0) + '회'];
    if (k.trophies > 0) parts.push('트로피 ' + k.trophies + '개');
    return parts.join(', ');
  }
  function _kbText(kb) { return kb >= 1024 ? (Math.round(kb / 102.4) / 10) + ' MB' : kb + ' KB'; }

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
          '<div class="bk-row"><button type="button" class="bk-btn" data-act="undo" id="bk-undo-btn">↩ 가져오기 전 기록으로 되돌리기</button>' +
            '<button type="button" class="bk-btn" data-act="dropundo">🗑 사본 지우기</button></div>' +
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
    _root.addEventListener('change', function(e) { if (e.target && e.target.name === 'bk-mode') _syncApply(); });
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
    else if (act === 'dropundo') _dropUndo();
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
      var undo = info.kind === 'undo';
      _$('bk-undo-help').textContent = undo
        ? '방금 되돌리기 직전' + (info.savedAt ? '(' + formatDate(info.savedAt) + ')' : '') + ' 상태로 다시 돌아갈 수 있어요. 되돌린 걸 취소하고 싶을 때 쓰세요. 사본은 30일 뒤 저절로 지워져요.'
        : '마지막으로 가져오기 직전' + (info.savedAt ? '(' + formatDate(info.savedAt) + ')' : '') +
          ' 상태로 돌아가요. 가져오기를 잘못했을 때 쓰세요. 사본은 30일 뒤 저절로 지워져요.';
      _$('bk-undo-btn').textContent = undo ? '↪ 되돌리기 취소(되돌리기 직전 기록으로)' : '↩ 가져오기 전 기록으로 되돌리기';
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
    var plans = _pending.plans || {};
    var merged = (plans.merge && plans.merge.next) || Storage.mergeData(Storage.exportAll().data, obj.data);
    var mergedSum = summarize({ data: merged });
    var jf = _journeyText(fileSum), jm = _journeyText(mergedSum);
    var cf = _careerText(fileSum), cm = _careerText(mergedSum);
    el.hidden = false;
    el.className = 'bk-preview';
    el.innerHTML =
      '<div class="bk-pv-title">📄 ' + _esc(_pending.name) + '</div>' +
      '<dl class="bk-pv">' +
        '<dt>내보낸 날짜</dt><dd>' + _esc(formatDate(v.exportedAt) || '알 수 없음') + '</dd>' +
        '<dt>내보낸 기기</dt><dd>' + _esc(deviceLabel(v.device)) + '</dd>' +
        '<dt>담긴 기록</dt><dd>' + _esc(_countsText(fileSum)) + '</dd>' +
        (jf ? '<dt>담긴 여정</dt><dd>' + _esc(jf) + '</dd>' : '') +
        (cf ? '<dt>담긴 커리어</dt><dd>' + _esc(cf) + '</dd>' : '') +
        (fileSum.lastDate ? '<dt>마지막 기록</dt><dd>' + _esc(formatDate(fileSum.lastDate)) + '</dd>' : '') +
      '</dl>' +
      '<fieldset class="bk-modes"><legend>어떻게 가져올까요?</legend>' +
        '<label class="bk-mode"><input type="radio" name="bk-mode" value="merge" checked>' +
          '<span><b>병합 (권장)</b><small>이 기기 기록과 파일 기록을 합쳐요. 같은 기록은 한 번만 남기고, 핸드와 실수는 최근 200건까지 보관해요. ' +
          '코칭, 띵킹 설정은 이 기기 것을 그대로 써요.<br>합친 결과: ' + _esc(_countsText(mergedSum)) + (jm ? '<br>합친 여정: ' + _esc(jm) : '') + (cm ? '<br>합친 커리어: ' + _esc(cm) : '') +
          _spaceNote(plans.merge) + '</small></span></label>' +
        '<label class="bk-mode"><input type="radio" name="bk-mode" value="replace">' +
          '<span><b>덮어쓰기</b><small>이 기기 기록을 지우고 파일 내용으로 바꿔요.<br>바꾼 결과: ' + _esc(_countsText(fileSum)) + (jf ? '<br>바꾼 여정: ' + _esc(jf) : '') + (cf ? '<br>바꾼 커리어: ' + _esc(cf) : '') +
          _spaceNote(plans.replace) + '</small></span></label>' +
      '</fieldset>' +
      '<div class="bk-help bk-space" id="bk-space" role="status" aria-live="polite"></div>' +
      '<div class="bk-row">' +
        '<button type="button" class="bk-btn primary" data-act="apply">적용하기</button>' +
        '<button type="button" class="bk-btn" data-act="cancel">취소</button>' +
      '</div>';
    _syncApply();
  }

  // 방식마다 가져온 뒤 필요한 공간(Storage.planImport). 계산이 안 되면 error만 담는다
  function _plans(obj) {
    var out = {};
    ['merge', 'replace'].forEach(function(m) {
      try { out[m] = Storage.planImport(obj, m); } catch (e) { out[m] = { error: (e && e.message) || String(e) }; }
    });
    return out;
  }
  function _spaceNote(plan) {
    if (!plan || !plan.space || plan.space.ok) return '';
    return '<br><span class="bk-warn" style="color:#f2cc60">⚠ 저장 공간이 부족해서 이 방식으로는 가져올 수 없어요(필요 ' +
      _esc(_kbText(plan.space.needKB)) + ', 여유 ' + _esc(_kbText(plan.space.freeKB)) + ')</span>';
  }
  // 고른 방식의 공간이 모자라면 적용하기를 막고 이유를 보인다. 공간 판정(Storage.spaceCheck)은 이미 있는 되돌리기 사본을 빼고 센다
  // (가져오기가 그 자리에 지금 기록의 사본을 새로 쓰므로). 그래서 사본을 지워도 이 판정은 바뀌지 않아 사본 지우기를 권하지 않는다
  function _syncApply() {
    if (!_root || !_pending) return;
    var btn = _root.querySelector('[data-act="apply"]'), box = _$('bk-space');
    if (!btn) return;
    var sel = _root.querySelector('input[name="bk-mode"]:checked');
    var plan = _pending.plans && _pending.plans[sel ? sel.value : 'merge'];
    var low = !!(plan && plan.space && !plan.space.ok);
    btn.disabled = low;
    if (box) {
      var other = _pending.plans && _pending.plans[(sel && sel.value === 'replace') ? 'merge' : 'replace'];
      var otherOk = !!(other && other.space && other.space.ok);
      box.textContent = low
        ? '가져오기 전 기록을 되돌리기용으로 함께 보관해야 해서, 이 방식으로 가져오면 이 기기 저장 한도를 넘어요. ' +
          (otherOk ? '다른 방식은 가져올 수 있어요.' : '지금 기록은 그대로 두었어요.')
        : '';
    }
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
    _pending = { obj: obj, v: v, name: name || '백업 파일', plans: _plans(obj) };
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

  // 여정 저장은 지연 쓰기(PERF-6, Journey.flush)라 저장소 원문을 읽거나 바꾸기 직전에 대기 중인 쓰기를 끝낸다.
  // 저장소를 직접 바꾼 직후에는 Journey._invalidate(캐시와 대기 쓰기를 버린다)로 옛 캐시가 가져온 기록을 덮지 않게 한다
  function _journey(fn) {
    var J = (typeof Journey !== 'undefined' && Journey) ? Journey : null;
    if (J && typeof J[fn] === 'function') { try { J[fn](); } catch (e) { /* 백업에 영향 없음 */ } }
    // (웨이브1 통합) 커리어 코어 캐시도 같이 버린다(가져온 poker_career를 옛 캐시가 다시 저장하지 않게)
    if (fn === '_invalidate' && typeof CareerContract !== 'undefined' && CareerContract && typeof CareerContract.mod === 'function') {
      var core = CareerContract.mod('core');
      if (core && typeof core._invalidate === 'function') { try { core._invalidate(); } catch (e) { /* 백업에 영향 없음 */ } }
    }
  }
  function _exportJson() { _journey('flush'); return JSON.stringify(Storage.exportAll()); }

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
      _noteBackup(name);
    } catch (e) {
      _msg('err', '내보내기에 실패했어요. (' + (e && e.message) + ')');
    }
  }

  // 백업이 끝났다고 알림(결정 29): 내보내기와 공유 성공이 같은 경로로 '월 백업 3회' 배지와 이번 달 백업 카드의 백업 1회로 센다.
  // 공유를 취소하거나 실패하면 부르지 않는다. 배지 기록 실패는 백업에 영향 없음(M6-COLLECT, 계약 H8)
  function _noteBackup(name) {
    if (typeof Badges !== 'undefined' && Badges && typeof Badges.note === 'function') {
      try { Badges.note('backup', { name: name }, Date.now()); } catch (e) { /* 무시 */ }
    }
  }

  // 사용자 제스처 안에서 바로 share 호출(안드로이드 공유 시트 요건)
  function _doShare() {
    var f = _shareFile(_exportJson(), fileName(new Date()));
    if (!f) { _msg('err', '이 브라우저는 파일 공유를 지원하지 않아요. "파일로 내보내기"를 써 주세요.'); return; }
    _nav().share({ files: [f], title: '포커 튜터 기록 백업' }).then(function() {
      _msg('ok', '공유했어요: ' + f.name);
      _noteBackup(f.name);
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
    _journey('flush');                                 // 되돌리기 사본과 병합에 이 창의 대기 중인 여정 변경까지 담는다
    try {
      Storage.importAll(_pending.obj, mode);
    } catch (e) {
      _msg('err', '가져오지 못했어요: ' + (e && e.message) + '. 기존 기록은 그대로예요.');
      return;
    }
    _journey('_invalidate');                           // 가져온 기록이 최신본: 새로고침 전까지 옛 캐시가 쓰이지 않게
    _pending = null;
    _msg('ok', '가져왔어요. 화면을 새로 불러올게요…');
    _reload();
  }

  // 사본으로 돌아갈 때 지금 기록에서 사라지는 것(지금이 사본보다 많은 항목)을 숫자로 알린다
  function _undoQuestion(info) {
    var undo = !!info && info.kind === 'undo';
    var head = undo ? '되돌리기 직전 기록으로 다시 돌아갈까요?' : '가져오기 직전 기록으로 되돌릴까요?';
    var when = (info && info.ageDays != null) ? (info.ageDays === 0 ? '오늘' : info.ageDays + '일 전') + ' 저장한 사본으로 돌아가요.' : '';
    var lost = [];
    if (info && info.current && info.prev) {
      var c = info.current, p = info.prev;
      if (c.xp > p.xp) lost.push('여정 XP ' + (c.xp - p.xp));
      if (c.passed > p.passed) lost.push('통과 노드 ' + (c.passed - p.passed) + '개');
      if (c.review > p.review) lost.push('실수 복습 ' + (c.review - p.review) + '개');
      if (c.hands > p.hands) lost.push('핸드 ' + (c.hands - p.hands) + '건');
    }
    var body = lost.length ? '사본보다 지금 더 있는 기록이 사라져요: ' + lost.join(', ') + '.' : '지금 기록에서 사라지는 것은 거의 없어요.';
    return head + '\n\n' + (when ? when + '\n' : '') + body + '\n\n되돌린 뒤에도 "되돌리기 취소"로 지금 기록으로 다시 올 수 있어요.';
  }
  function _undo() {
    if (_gameActive()) { _msg('err', '게임 중에는 되돌릴 수 없어요. 메뉴에서 다시 열어 주세요.'); return; }
    var info = Storage.prevInfo ? Storage.prevInfo() : null;
    if (typeof confirm === 'function' && !confirm(_undoQuestion(info))) return;
    _journey('flush');                                 // '되돌리기 취소'용 사본에 지금 기록을 온전히 담는다
    var ok = false;
    try { ok = Storage.restorePrev(); } catch (e) { ok = false; }
    if (!ok) { _msg('err', '되돌릴 기록이 없어요.'); _renderNow(); return; }
    _journey('_invalidate');
    _msg('ok', '되돌렸어요. 화면을 새로 불러올게요…');
    _reload();
  }

  function _dropUndo() {
    var info = Storage.prevInfo ? Storage.prevInfo() : null;
    if (!info) { _renderNow(); return; }
    if (typeof confirm === 'function' && !confirm('되돌리기용 사본을 지울까요?\n\n지우면 가져오기 전 기록으로 돌아갈 수 없어요. 저장 공간은 그만큼 늘어요.')) return;
    var ok = false;
    try { ok = Storage.dropPrev(); } catch (e) { ok = false; }
    _msg(ok ? 'ok' : 'err', ok ? '되돌리기 사본을 지웠어요.' : '사본을 지우지 못했어요.');
    _renderNow();
  }

  function open() {
    if (typeof document === 'undefined' || typeof Storage === 'undefined' || !Storage.exportAll) return;
    if (typeof Storage.expirePrev === 'function') { try { Storage.expirePrev(30); } catch (e) { /* 정리 실패는 열기에 영향 없음 */ } }
    _journey('flush');                                 // '이 기기에 저장된 기록' 요약, 병합 미리보기, 되돌리기 안내가 대기 중인 여정 변경까지 읽게
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

  // ── 홈 카드(M7-P5, 계약 H11 a): { html, emph? } | null ──
  // 1) 저장 공간 사용량이 90% 이상이면 용량 경고 카드(emph, 백업 권장). top: true라 홈의 지도 위(첫 화면)에 그린다(M7 통합 검증)
  // 2) 아니면 이번 달 백업(내보내기 또는 공유, state.badgeMeta.backups의 달 키)이 없고 기록이 있으면(xp > 0) 월간 백업 카드
  //    (M7 통합 검증) 여정을 시작한 지(state.createdAt) 7일이 안 됐으면 월간 카드는 보이지 않는다. 첫날부터 백업 안내가 뜨면
  //    처음 쓰는 사람에게는 할 일만 늘고 뜻도 와닿지 않는다. createdAt이 없거나 읽을 수 없으면 오래 쓴 기록으로 본다.
  // '나중에'는 기기에만 남기는 편의 기록(경고 1일, 월간 7일)이고 백업 파일에는 들어가지 않는다.
  var SNOOZE_KEY = 'poker_backup_card';
  var WARN_RATIO = 0.9;
  var SNOOZE_DAYS = { space: 1, monthly: 7 };
  var MONTHLY_MIN_AGE_DAYS = 7;
  function _youngJourney(state, now) {
    var c = _isObj(state) && typeof state.createdAt === 'string' ? Date.parse(state.createdAt) : NaN;
    return isFinite(c) && now - c < MONTHLY_MIN_AGE_DAYS * 86400000;
  }
  function _monthKey(now) { var d = new Date(now); return d.getFullYear() + '-' + _pad(d.getMonth() + 1); }
  function _snooze() {
    try {
      var o = JSON.parse(localStorage.getItem(SNOOZE_KEY));
      return _isObj(o) ? o : {};
    } catch (e) { return {}; }
  }
  function snooze(kind, now) {
    if (!SNOOZE_DAYS[kind]) return false;
    var t = (typeof now === 'number' && isFinite(now)) ? now : Date.now(), o = _snooze();
    o[kind] = t + SNOOZE_DAYS[kind] * 86400000;
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(o)); } catch (e) { return false; }
    if (typeof JourneyUI !== 'undefined' && JourneyUI && typeof JourneyUI.render === 'function') { try { JourneyUI.render(); } catch (e2) { /* 무시 */ } }
    return true;
  }
  function backedUpThisMonth(state, now) {
    var m = _isObj(state) && _isObj(state.badgeMeta) && Array.isArray(state.badgeMeta.backups) ? state.badgeMeta.backups : [];
    return m.indexOf(_monthKey(now)) >= 0;
  }
  function homeCard(state, now) {
    now = (typeof now === 'number' && isFinite(now)) ? now : Date.now();
    var sn = _snooze();
    var u = (typeof Storage !== 'undefined' && Storage && typeof Storage.usage === 'function') ? Storage.usage() : null;
    if (u && u.ratio >= WARN_RATIO && !(typeof sn.space === 'number' && sn.space > now)) {
      var pct = Math.min(100, Math.round(u.ratio * 100));
      var extra = u.prevKB >= 64 ? ' 가져오기 전 상태를 담은 되돌리기 사본이 ' + _kbText(u.prevKB) + '를 차지하고 있어요. 백업한 뒤 백업 창에서 지울 수 있어요.' : '';
      return { emph: true, top: true, html: '<div class="j-card bk-home bk-home-warn" role="group" aria-label="저장 공간 안내" style="border-color:#f2cc60">' +
        '<div class="j-card-t">⚠ 저장 공간이 거의 찼어요</div>' +
        '<div class="j-card-d">이 기기 저장 공간을 ' + pct + '% 썼어요. 가득 차면 새 기록이 저장되지 않을 수 있어요. 지금 파일로 백업해 두세요.' + _esc(extra) + '</div>' +
        '<div class="j-card-acts"><button type="button" class="j-btn j-primary" onclick="BackupUI.open()">💾 백업하기</button>' +
        '<button type="button" class="j-btn j-ghost" onclick="BackupUI.snooze(\'space\')">나중에</button></div></div>' };
    }
    var xp = _isObj(state) && typeof state.xp === 'number' ? state.xp : 0;
    if (xp > 0 && !backedUpThisMonth(state, now) && !_youngJourney(state, now) && !(typeof sn.monthly === 'number' && sn.monthly > now)) {
      return { html: '<div class="j-card bk-home" role="group" aria-label="기록 백업 안내">' +
        '<div class="j-card-t">💾 이번 달 기록 백업</div>' +
        '<div class="j-card-d">기록은 이 기기에만 있어요. 한 달에 한 번 파일로 남겨 두면 안심이에요. 이번 달에는 아직 백업하지 않았어요.</div>' +
        '<div class="j-card-acts"><button type="button" class="j-btn" onclick="BackupUI.open()">백업하기</button>' +
        '<button type="button" class="j-btn j-ghost" onclick="BackupUI.snooze(\'monthly\')">나중에</button></div></div>' };
    }
    return null;
  }

  return { open: open, close: close, isOpen: isOpen, homeCard: homeCard, snooze: snooze, backedUpThisMonth: backedUpThisMonth,
    fileName: fileName, summarize: summarize, deviceLabel: deviceLabel, formatDate: formatDate,
    _doShare: _doShare, _undoQuestion: _undoQuestion };
})();
