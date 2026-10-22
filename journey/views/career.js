// journey/views/career.js (스텁, 채우는 작업: 클라우드 F3. 지시문 docs/cloud-tasks/F3.md)
// 🎰 커리어 화면(CareerView): JourneyUI.view('career')가 open(params, el)로 연다(VIEWS 등록은 클라우드 D').
//   지금은 map 모듈(Career.open)이 있으면 그쪽에 맡기고, 없으면 '준비 중' 안내 카드를 그린다.
// 규약: 로드 시 DOM 접근 없음. html()은 순수 문자열(테스트용).
var CareerView = (function() {
  var _el = null;
  function html() {
    return '<div class="j-sub j-career-view">' +
      '<div class="j-sub-top"><button type="button" class="j-back" aria-label="여정 홈으로" onclick="CareerView.back()">↩</button>' +
      '<h2 class="j-sub-t">🎰 커리어</h2></div>' +
      '<div class="j-card"><div class="j-card-t">🚧 준비 중</div>' +
      '<div class="j-card-d">코인을 모아 여러 장소를 여행하며 라이벌과 치는 커리어 모드를 만들고 있어요. 다음 업데이트에서 열려요.</div></div></div>';
  }
  function render(el) {
    el = el || _el;
    var out = html();
    if (!el) return out;
    _el = el;
    el.innerHTML = out;
    return out;
  }
  function open(params, el) {
    if (!el && typeof JourneyUI !== 'undefined' && JourneyUI && typeof JourneyUI.viewEl === 'function') {
      try { el = JourneyUI.viewEl(); } catch (e) { el = null; }
    }
    if (typeof Career !== 'undefined' && Career && typeof Career.open === 'function' && Career.open(params, el)) { _el = el; return true; }
    render(el);
    return true;
  }
  function back() {
    if (typeof JourneyUI !== 'undefined' && JourneyUI && typeof JourneyUI.back === 'function') { JourneyUI.back(); return; }
    if (typeof App !== 'undefined' && App && typeof App.showMenu === 'function') App.showMenu();
  }
  var api = { open: open, render: render, html: html, back: back };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
