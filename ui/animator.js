// ui/animator.js
var Animator = (function() {
  function dealCards(state, cb) {
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
