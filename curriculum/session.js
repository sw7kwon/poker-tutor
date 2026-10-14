// curriculum/session.js
var Session = (function() {
  function load(n) {
    var data = CURRICULUM.find(function(s){ return s.session===n; });
    if (!data) return;
    document.getElementById('session-nav').innerHTML =
      '<span>Phase '+data.phase+'</span> <span style="color:var(--gold)">세션 '+n+'/24</span> <span>'+data.topic+'</span>';
    var content = document.getElementById('session-content');
    content.className = 'session-content fadein';
    content.innerHTML =
      '<div class="session-section">'+
      '<h2 class="session-title">♠ 세션 '+n+' — '+data.topic+'</h2>'+
      '<div class="session-block"><h3>핵심</h3><p>'+data.summary+'</p></div>'+
      '<div class="session-block"><h3>공식/기준</h3><p>'+data.formula+'</p></div>'+
      '<div class="session-block"><h3>실전 예시</h3><p>'+data.example+'</p></div>'+
      '</div>';
    document.getElementById('session-actions').innerHTML =
      (data.quiz&&data.quiz.length ? '<button class="menu-btn" onclick="Session.startQuiz('+n+')">📝 확인 문제</button>' : '')+
      '<button class="menu-btn" onclick="Session.practice()">🎯 이 주제로 실습 (GTO 미러)</button>'+
      (n<24 ? '<button class="menu-btn secondary" onclick="Session.load('+(n+1)+')">다음 →</button>' : '')+
      '<button class="menu-btn secondary" onclick="App.showMenu()">메뉴로</button>';
  }

  // 커리큘럼 → 실습 직결: 배운 주제를 바로 GTO 미러(같은 카드 3회·해설)로 체화
  function practice() {
    App.selectVillains('gto-mirror');
  }

  function startQuiz(n) {
    var data = CURRICULUM.find(function(s){ return s.session===n; });
    if (!data||!data.quiz||!data.quiz.length) { alert('퀴즈 없음'); return; }
    Quiz.startForSession(data.quiz, n, data.key);
  }

  if (typeof module !== 'undefined') module.exports = { load, startQuiz, practice };
  return { load, startQuiz, practice };
})();
