// ui/animator.js
// 모션 줄이기(M2-P5, 설계서 5.9절 4번): A11y.reduced()면 카드 페이드와 기다림 없이 다음 단계로(지연 0ms)
// 매끄러움(TABLE-04a): 보드는 Table.render가 새 카드에만 붙이는 .deal-anim 카드만 애니메이션한다(턴, 리버에서 기존 카드 깜빡임 없음).
//   대기는 300 + 80ms × (새 장수 - 1): 플랍 460, 턴과 리버 300. 히어로가 이미 폴드했으면 애니메이션 없이 150ms.
//   내 카드는 120ms 간격, 대기 350ms.
var Animator = (function() {
  function _reduced() {
    try { return typeof A11y !== 'undefined' && !!A11y && typeof A11y.reduced === 'function' && !!A11y.reduced(); }
    catch (e) { return false; }
  }

  function dealCards(state, cb) {
    if (_reduced()) { setTimeout(cb, 0); return; }
    var heroSeat = document.querySelector('.seat.hero');
    if (heroSeat) {
      heroSeat.querySelectorAll('.card').forEach(function(c,i) {
        c.style.opacity='0';
        setTimeout(function(){ c.classList.add('deal-anim'); c.style.opacity=''; }, i*120);
      });
    }
    setTimeout(cb, 350);
  }

  function dealBoard(state, cb) {
    if (_reduced()) { setTimeout(cb, 0); return; }
    var board = document.getElementById('board-cards');
    var cards = board ? board.querySelectorAll('.card.deal-anim') : [];
    if (state && state.folded && state.folded.Hero) {
      // 내가 이미 폴드한 핸드: 구경만 하는 중이라 짧게
      cards.forEach(function(c) { c.classList.remove('deal-anim'); });
      setTimeout(cb, 150);
      return;
    }
    cards.forEach(function(c,i) {
      c.classList.remove('deal-anim');   // 다시 붙여야 i*80ms 순서대로 시작한다
      c.style.opacity='0';
      setTimeout(function(){ c.classList.add('deal-anim'); c.style.opacity=''; }, i*80);
    });
    setTimeout(cb, cards.length ? 300 + 80*(cards.length-1) : 150);
  }

  if (typeof module !== 'undefined') module.exports = { dealCards, dealBoard };
  return { dealCards, dealBoard };
})();
