// curriculum/quiz.js
var Quiz = (function() {
  var _qs=[], _idx=0, _correct=0, _sessionNum=0, _lastAns='';

  // 출제 풀: 진도 안의 세션 + 약점 키가 있는 세션(진도와 무관, 게임 실수 → 퀴즈 직결)
  function _buildPool(progress) {
    progress = progress || {};
    var cur = progress.currentSession||1;
    var ws = progress.weakSpots||{};
    var pool = [];
    if (typeof CURRICULUM === 'undefined') return pool;
    CURRICULUM.forEach(function(s) {
      if (!s.quiz || !s.quiz.length) return;
      var w0 = ws[s.key]||0;
      if (!(s.session<=cur || w0>0)) return;
      var w = 1+Math.min(4, Math.ceil(w0));
      for (var i=0;i<w;i++) pool.push(s);
    });
    return pool;
  }

  function start(progress) {
    var pool = _buildPool(progress||{});
    _qs=[]; _idx=0; _correct=0; _sessionNum=0;
    var used={};
    for (var i=0;i<pool.length*3&&_qs.length<3;i++) {
      var p=pool[Math.floor(Math.random()*pool.length)];
      var q=p.quiz[Math.floor(Math.random()*p.quiz.length)];
      if (!used[q.q]) { _qs.push({q:q.q,a:q.a,key:p.key}); used[q.q]=true; }
    }
    App.showScreen('screen-scenario');
    _show();
  }

  function startForSession(arr, n, key) {
    _qs=arr.map(function(q){ return {q:q.q,a:q.a,key:key||''}; });
    _idx=0; _correct=0; _sessionNum=n;
    App.showScreen('screen-scenario');
    _show();
  }

  function _show() {
    if (_idx>=_qs.length) { _results(); return; }
    var item=_qs[_idx];
    document.getElementById('scenario-feedback').style.display='none';
    document.getElementById('scenario-next').style.display='none';
    document.getElementById('scenario-board').innerHTML=
      '<div style="color:var(--text-dim);font-size:0.85rem">문제 '+(_idx+1)+'/'+_qs.length+'</div>'+
      '<div class="scenario-question">'+item.q+'</div>';
    document.getElementById('scenario-choices').innerHTML=
      '<textarea id="quiz-ans" rows="3" placeholder="먼저 머릿속으로 답해 보고 적어도 돼요" style="width:100%;background:#161b22;color:var(--text);border:1px solid var(--hud-border);border-radius:6px;padding:10px;font-size:0.9rem;"></textarea>'+
      '<button class="menu-btn" style="margin-top:10px" onclick="Quiz.submitAnswer()">제출하고 정답 보기</button>';
  }

  function _esc(t) {
    return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // 제출 = 정답 공개 → 스스로 채점(키워드 자동 채점은 정답도 오답 처리해서 폐기)
  function submitAnswer() {
    var el=document.getElementById('quiz-ans');
    _lastAns=((el&&el.value)||'').trim();
    var item=_qs[_idx];
    if (!item) return;
    var fb=document.getElementById('scenario-feedback');
    fb.className='scenario-feedback';
    fb.innerHTML=(_lastAns?'<div style="color:var(--text-dim);font-size:0.85rem">내 답: '+_esc(_lastAns)+'</div>':'')+
      '<strong>정답:</strong> '+item.a+
      '<div style="margin-top:8px;font-size:0.85rem;color:var(--text-dim)">내 답과 비교해서 스스로 채점해 보세요.</div>';
    fb.style.display='block';
    document.getElementById('scenario-next').style.display='none';
    document.getElementById('scenario-choices').innerHTML=
      '<button class="menu-btn" onclick="Quiz.selfGrade(true)">✅ 맞았어요</button>'+
      '<button class="menu-btn secondary" style="margin-left:10px" onclick="Quiz.selfGrade(false)">❌ 틀렸어요</button>';
  }

  // ✅: 정답 수 +1, 약점 -1 / ❌: 실수 기록 + 약점 +1
  function selfGrade(ok) {
    var item=_qs[_idx];
    if (!item || item._graded) return;
    item._graded=true;
    var p=Storage.getProgress();
    p.weakSpots=p.weakSpots||{};
    if (ok) {
      _correct++;
      if (item.key) p.weakSpots[item.key]=Math.max(0,(p.weakSpots[item.key]||0)-1);
    } else {
      Storage.addMistake({date:new Date().toISOString(),subtype:item.key,situation:item.q,myAnswer:_lastAns,correct:item.a});
      if (item.key) p.weakSpots[item.key]=(p.weakSpots[item.key]||0)+1;
    }
    if (item.key) Storage.saveProgress(p);
    var fb=document.getElementById('scenario-feedback');
    if (fb) fb.className='scenario-feedback '+(ok?'feedback-correct':'feedback-wrong');
    var ch=document.getElementById('scenario-choices');
    if (ch) ch.innerHTML='<div style="font-size:0.9rem">'+(ok?'✅ 맞았어요':'❌ 틀렸어요: 약점 복습 목록에 넣었어요')+'</div>';
    document.getElementById('scenario-next').style.display='block';
  }

  function next() { _idx++; _show(); }

  function _results() {
    document.getElementById('scenario-feedback').style.display='none';
    document.getElementById('scenario-next').style.display='none';
    document.getElementById('scenario-choices').innerHTML='';
    document.getElementById('scenario-board').innerHTML=
      '<div style="background:#161b22;padding:20px;border-radius:12px;">'+
      '<h3 style="color:var(--gold)">📊 결과: '+_correct+' / '+_qs.length+'</h3>'+
      '<button class="menu-btn" onclick="App.startScenario()" style="margin-top:12px">다시 풀기</button>'+
      '<button class="menu-btn secondary" onclick="App.showMenu()" style="margin-left:10px">메뉴로</button>'+
      '</div>';
    if (_sessionNum>0) {
      var p=Storage.getProgress();
      if (!p.completedSessions.includes(_sessionNum)) {
        p.completedSessions.push(_sessionNum);
        p.currentSession=Math.max(p.currentSession||1,_sessionNum+1);
        Storage.saveProgress(p);
      }
    }
  }

  if (typeof module !== 'undefined') module.exports = { start, startForSession, submitAnswer, selfGrade, next, _buildPool };
  return { start, startForSession, submitAnswer, selfGrade, next, _buildPool };
})();
