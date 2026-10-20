// curriculum/quiz.js (M3-P3: 선택지 문항 자동 채점, Leitner 키 공유, _results onDone)
// 문항에 choices(2~4개)와 answer가 있으면 선택지를 그리고 바로 채점한다. 없으면 기존 자기 채점(정답 공개 → ✅/❌).
// 시나리오 모드(start)는 선택지 문항만 낸다. 세션 퀴즈(startForSession)가 끝나면 Session.complete(n)으로 진도와 여정 지도에 반영.
// Leitner(레슨 계약 L6): 유형 'lesson', 키 '<CURRICULUM_MAP[세션][0]>|<문항 id>'. 오답이면 record(false),
//   정답은 이미 항목이 있을 때만 record(true). 레슨 즉석 질문과 같은 규칙이라 두 곳에서 풀어도 상자 하나로 이어진다.
var Quiz = (function() {
  var _qs = [], _idx = 0, _correct = 0, _sessionNum = 0, _lastAns = '', _onDone = null;

  function _hasChoices(q) {
    return !!q && Array.isArray(q.choices) && q.choices.length >= 2 && q.choices.length <= 4 &&
      typeof q.answer === 'number' && q.answer >= 0 && q.answer < q.choices.length;
  }
  function _choiceQs(s) { return (s && Array.isArray(s.quiz)) ? s.quiz.filter(_hasChoices) : []; }

  // 출제 풀: 진도 안의 세션 + 약점 키가 있는 세션(진도와 무관, 게임 실수 → 퀴즈 직결). 선택지 문항이 있는 세션만.
  function _buildPool(progress) {
    progress = progress || {};
    var cur = progress.currentSession || 1;
    var ws = progress.weakSpots || {};
    var pool = [];
    if (typeof CURRICULUM === 'undefined') return pool;
    CURRICULUM.forEach(function(s) {
      if (!_choiceQs(s).length) return;
      var w0 = ws[s.key] || 0;
      if (!(s.session <= cur || w0 > 0)) return;
      var w = 1 + Math.min(4, Math.ceil(w0));
      for (var i = 0; i < w; i++) pool.push(s);
    });
    return pool;
  }

  function _item(q, session, key) {
    return {
      q: q.q, a: q.a, key: key || '', session: Number(session) || 0, id: q.id || null,
      choices: _hasChoices(q) ? q.choices.slice() : null, answer: _hasChoices(q) ? q.answer : null,
      why: q.why || '', label: q.label || null
    };
  }

  function _go() {
    if (typeof App !== 'undefined' && App && typeof App.showScreen === 'function') App.showScreen('screen-scenario');
    _show();
  }

  function start(progress, onDone) {
    var pool = _buildPool(progress || {});
    _qs = []; _idx = 0; _correct = 0; _sessionNum = 0; _onDone = (typeof onDone === 'function') ? onDone : null;
    var used = {};
    for (var i = 0; i < pool.length * 3 && _qs.length < 3; i++) {
      var p = pool[Math.floor(Math.random() * pool.length)];
      var list = _choiceQs(p);
      var q = list[Math.floor(Math.random() * list.length)];
      if (q && !used[q.q]) { _qs.push(_item(q, p.session, p.key)); used[q.q] = true; }
    }
    _go();
  }

  // opts: onDone 함수 또는 { onDone }. onDone(res) res = {session, correct, total, items:[{id, ok, picked}], complete}
  function startForSession(arr, n, key, opts) {
    var cb = (typeof opts === 'function') ? opts : (opts && typeof opts.onDone === 'function' ? opts.onDone : null);
    _qs = (arr || []).map(function(q) { return _item(q, n, key); });
    _idx = 0; _correct = 0; _sessionNum = Number(n) || 0; _onDone = cb;
    _go();
  }

  function _esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function _el(id) { return (typeof document !== 'undefined' && document.getElementById) ? document.getElementById(id) : null; }
  function _labelChip(item) {
    return item.label === '참고' ? '<div style="margin-top:6px;font-size:0.8rem;color:var(--text-dim)">참고: 공개 솔버 통념을 근사한 참고값</div>' : '';
  }
  var BTN_STYLE = 'display:block;width:100%;text-align:left;margin:8px 0 0;padding:12px 16px;font-size:1rem;min-height:48px;';

  function _choicesHTML(item) {
    var graded = !!item._graded;
    return item.choices.map(function(c, i) {
      var mark = '', style = BTN_STYLE;
      if (graded) {
        if (i === item.answer) { mark = '✅ '; style += 'border-color:var(--green);'; }
        else if (i === item.picked) { mark = '❌ '; style += 'border-color:var(--red);'; }
        style += 'cursor:default;pointer-events:none;';
      }
      return '<button class="menu-btn secondary quiz-choice" data-i="' + i + '" style="' + style + '"' +
        (graded ? ' disabled aria-disabled="true"' : ' onclick="Quiz.choose(' + i + ')"') + '>' +
        mark + (i + 1) + '. ' + _esc(c) + '</button>';
    }).join('');
  }

  function _show() {
    if (_idx >= _qs.length) { _results(); return; }
    var item = _qs[_idx];
    var fb = _el('scenario-feedback'), nx = _el('scenario-next'), board = _el('scenario-board'), ch = _el('scenario-choices');
    if (fb) fb.style.display = 'none';
    if (nx) nx.style.display = 'none';
    if (board) board.innerHTML =
      '<div style="color:var(--text-dim);font-size:0.85rem">문제 ' + (_idx + 1) + '/' + _qs.length + '</div>' +
      '<div class="scenario-question">' + _esc(item.q) + _labelChip(item) + '</div>';
    if (!ch) return;
    if (item.choices) { ch.innerHTML = _choicesHTML(item); return; }
    ch.innerHTML =
      '<textarea id="quiz-ans" rows="3" placeholder="먼저 머릿속으로 답해 보고 적어도 돼요" style="width:100%;background:#161b22;color:var(--text);border:1px solid var(--hud-border);border-radius:6px;padding:10px;font-size:0.9rem;"></textarea>' +
      '<button class="menu-btn" style="margin-top:10px" onclick="Quiz.submitAnswer()">제출하고 정답 보기</button>';
  }

  // 레슨 계약 L6 키: '<노드>|<문항 id>'. 세션이나 id가 없으면 null(기록 안 함)
  function lessonKey(item) {
    if (!item || !item.id || !item.session || typeof CURRICULUM_MAP === 'undefined' || !CURRICULUM_MAP) return null;
    var ids = CURRICULUM_MAP[item.session] || CURRICULUM_MAP[String(item.session)];
    return (Array.isArray(ids) && ids.length) ? ids[0] + '|' + item.id : null;
  }
  function _recordLeitner(item, ok) {
    if (typeof Drills === 'undefined' || !Drills || typeof Drills.record !== 'function') return null;
    var key = lessonKey(item);
    if (!key) return null;
    if (ok && !(typeof Drills.item === 'function' && Drills.item('lesson', key))) return null;
    try { return Drills.record('lesson', key, !!ok); } catch (e) { return null; }
  }

  // 채점 공통: ✅ 정답 수 +1, 약점 -1 / ❌ 실수 기록 + 약점 +1
  function _grade(item, ok, myAnswer) {
    item._graded = true; item.ok = !!ok;
    if (ok) _correct++;
    if (typeof Storage === 'undefined' || !Storage || typeof Storage.getProgress !== 'function') return;
    var p = Storage.getProgress();
    p.weakSpots = p.weakSpots || {};
    if (ok) {
      if (item.key) p.weakSpots[item.key] = Math.max(0, (p.weakSpots[item.key] || 0) - 1);
    } else {
      Storage.addMistake({ date: new Date().toISOString(), subtype: item.key, situation: item.q, myAnswer: myAnswer, correct: item.a });
      if (item.key) p.weakSpots[item.key] = (p.weakSpots[item.key] || 0) + 1;
    }
    if (item.key) Storage.saveProgress(p);
  }

  // 선택지 문항: 고르면 바로 채점(정답 표시 + 한 줄 해설). 반환 {ok, why} | null(이미 채점, 범위 밖)
  function choose(i) {
    var item = _qs[_idx];
    if (!item || !item.choices || item._graded) return null;
    i = Math.floor(Number(i));
    if (!(i >= 0 && i < item.choices.length)) return null;
    item.picked = i;
    var ok = i === item.answer;
    _grade(item, ok, item.choices[i]);
    _recordLeitner(item, ok);
    var fb = _el('scenario-feedback');
    if (fb) {
      fb.className = 'scenario-feedback ' + (ok ? 'feedback-correct' : 'feedback-wrong');
      fb.innerHTML = '<strong>' + (ok ? '✅ 정답' : '❌ 아쉬워요, 정답은 ' + _esc(item.choices[item.answer])) + '</strong>' +
        (item.why ? '<div style="margin-top:6px">' + _esc(item.why) + '</div>' : '') +
        (ok ? '' : '<div style="margin-top:6px;font-size:0.85rem;color:var(--text-dim)">약점 복습 목록에 넣었어요</div>') +
        _labelChip(item);
      fb.style.display = 'block';
    }
    var ch = _el('scenario-choices');
    if (ch) ch.innerHTML = _choicesHTML(item);
    var nx = _el('scenario-next');
    if (nx) nx.style.display = 'block';
    return { ok: ok, why: item.why };
  }

  // 자기 채점 문항: 제출 = 정답 공개 → 스스로 채점(키워드 자동 채점은 정답도 오답 처리해서 폐기)
  function submitAnswer() {
    var el = _el('quiz-ans');
    _lastAns = ((el && el.value) || '').trim();
    var item = _qs[_idx];
    if (!item) return;
    var fb = _el('scenario-feedback');
    fb.className = 'scenario-feedback';
    fb.innerHTML = (_lastAns ? '<div style="color:var(--text-dim);font-size:0.85rem">내 답: ' + _esc(_lastAns) + '</div>' : '') +
      '<strong>정답:</strong> ' + _esc(item.a) +
      '<div style="margin-top:8px;font-size:0.85rem;color:var(--text-dim)">내 답과 비교해서 스스로 채점해 보세요.</div>';
    fb.style.display = 'block';
    _el('scenario-next').style.display = 'none';
    _el('scenario-choices').innerHTML =
      '<button class="menu-btn" onclick="Quiz.selfGrade(true)">✅ 맞았어요</button>' +
      '<button class="menu-btn secondary" style="margin-left:10px" onclick="Quiz.selfGrade(false)">❌ 틀렸어요</button>';
  }

  function selfGrade(ok) {
    var item = _qs[_idx];
    if (!item || item._graded) return;
    _grade(item, !!ok, _lastAns);
    var fb = _el('scenario-feedback');
    if (fb) fb.className = 'scenario-feedback ' + (ok ? 'feedback-correct' : 'feedback-wrong');
    var ch = _el('scenario-choices');
    if (ch) ch.innerHTML = '<div style="font-size:0.9rem">' + (ok ? '✅ 맞았어요' : '❌ 틀렸어요: 약점 복습 목록에 넣었어요') + '</div>';
    _el('scenario-next').style.display = 'block';
  }

  function next() { _idx++; _show(); }

  // 세션 완료: Session.complete(진도 + 여정 지도). Session이 없으면 예전처럼 진도만.
  function _complete(n) {
    if (typeof Session !== 'undefined' && Session && typeof Session.complete === 'function') return Session.complete(n);
    if (typeof Storage === 'undefined' || !Storage || typeof Storage.getProgress !== 'function') return null;
    var p = Storage.getProgress();
    if (!p.completedSessions.includes(n)) {
      p.completedSessions.push(n);
      p.currentSession = Math.max(p.currentSession || 1, Math.min(24, n + 1));
      Storage.saveProgress(p);
    }
    return { session: n };
  }

  function _results() {
    var n = _sessionNum;
    var fb = _el('scenario-feedback'), nx = _el('scenario-next'), ch = _el('scenario-choices'), board = _el('scenario-board');
    if (fb) fb.style.display = 'none';
    if (nx) nx.style.display = 'none';
    if (ch) ch.innerHTML = '';
    var again = n > 0 ? 'Session.startQuiz(' + n + ')' : 'App.startScenario()';
    if (board) board.innerHTML =
      '<div style="background:#161b22;padding:20px;border-radius:12px;">' +
      '<h3 style="color:var(--gold)">📊 결과: ' + _correct + ' / ' + _qs.length + '</h3>' +
      (n > 0 ? '<div style="margin-top:6px;font-size:0.9rem;color:var(--text-dim)">세션 ' + n + ' 완료로 기록했어요</div>' : '') +
      '<button class="menu-btn" onclick="' + again + '" style="margin-top:12px">다시 풀기</button>' +
      (n > 0 ? '<button class="menu-btn secondary" onclick="Session.open(' + n + ')" style="margin-left:10px">세션으로</button>' : '') +
      '<button class="menu-btn secondary" onclick="App.showMenu()" style="margin-left:10px">메뉴로</button>' +
      '</div>';
    var res = {
      session: n, correct: _correct, total: _qs.length,
      items: _qs.map(function(q) { return { id: q.id, ok: !!q.ok, picked: (q.picked != null ? q.picked : null) }; }),
      complete: null
    };
    if (n > 0) res.complete = _complete(n);
    var cb = _onDone; _onDone = null;
    if (typeof cb === 'function') { try { cb(res); } catch (e) { /* 호출자 오류는 퀴즈 화면을 막지 않는다 */ } }
    return res;
  }

  // 문항 id('c4-1') → 문항 사본 {session, key, node, lessonKey, q, a, choices, answer, why, label, id} | null
  // 복습 출제(puzzles/gen-lesson.js의 fromKey)가 키에서 문항을 되살릴 때 쓴다.
  function find(id) {
    if (typeof CURRICULUM === 'undefined' || !id) return null;
    for (var i = 0; i < CURRICULUM.length; i++) {
      var s = CURRICULUM[i];
      var list = (s && Array.isArray(s.quiz)) ? s.quiz : [];
      for (var j = 0; j < list.length; j++) {
        if (list[j] && list[j].id === id) {
          var it = _item(list[j], s.session, s.key);
          it.lessonKey = lessonKey(it);
          it.node = it.lessonKey ? it.lessonKey.split('|')[0] : null;
          return it;
        }
      }
    }
    return null;
  }

  var api = { start: start, startForSession: startForSession, choose: choose, submitAnswer: submitAnswer, selfGrade: selfGrade,
    next: next, find: find, lessonKey: lessonKey, _buildPool: _buildPool, _state: function() { return { idx: _idx, total: _qs.length, correct: _correct, session: _sessionNum }; } };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
