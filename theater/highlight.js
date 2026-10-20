// theater/highlight.js (채우는 패키지: M4-P6)
// 주의: 브라우저 내장 전역 Highlight(CSS Custom Highlight API)를 이 var가 덮어쓴다. 존재 확인은 typeof Highlight 대신 Highlight.pick 같은 메서드로 한다.
var Highlight = (function() {
  var api = {};
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
