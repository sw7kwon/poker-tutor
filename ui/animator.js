// ui/animator.js
// 모션 줄이기(M2-P5, 설계서 5.9절 4번): A11y.reduced()면 카드 페이드와 기다림 없이 다음 단계로(지연 0ms)
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
        setTimeout(function(){ c.classList.add('deal-anim'); c.style.opacity=''; }, i*150);
      });
    }
    setTimeout(cb, 500);
  }

  function dealBoard(state, cb) {
    if (_reduced()) { setTimeout(cb, 0); return; }
    var cards = document.getElementById('board-cards').querySelectorAll('.card');
    cards.forEach(function(c,i) {
      c.style.opacity='0';
      setTimeout(function(){ c.classList.add('deal-anim'); c.style.opacity=''; }, i*100);
    });
    setTimeout(cb, cards.length*100+300);
  }

  if (typeof module !== 'undefined') module.exports = { dealCards, dealBoard };
  return { dealCards, dealBoard };
})();
