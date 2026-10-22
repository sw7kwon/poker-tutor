// journey/views/career.js (채우는 작업: 클라우드 F3. 지시문 docs/cloud-tasks/F3.md)
// 🎰 커리어 화면(CareerView): JourneyUI.view('career')가 open(params, el)로 연다(VIEWS 등록은 클라우드 D').
//   화면 내용은 map 모듈(journey/career/map-ui.js, CareerMap)이 그린다. 파사드 Career.open(params, el)이 map으로 위임하고,
//   map이 없으면(스텁 상태) 여기 '준비 중' 안내 카드를 그린다. core가 없을 때의 안내 카드는 CareerMap이 맡는다.
//   html(opts) → 순수 문자열(테스트용, CareerMap.html에 위임), render(el) → el에 그린다, back() → 여정 홈.
// 규약: 로드 시 DOM 접근 없음. 다른 모듈은 typeof 가드.
var CareerView = (function() {
  var _el = null;
  function _map() {
    var M = (typeof CareerMap !== 'undefined' && CareerMap) ? CareerMap : null;
    return (M && typeof M.html === 'function') ? M : null;
  }
  function _stubHTML() {
    return '<div class="j-sub j-career-view">' +
      '<div class="j-sub-top"><button type="button" class="j-back" aria-label="여정 홈으로" onclick="CareerView.back()">↩</button>' +
      '<h2 class="j-sub-t">🎰 커리어</h2></div>' +
      '<div class="j-card"><div class="j-card-t">🚧 준비 중</div>' +
      '<div class="j-card-d">코인을 모아 여러 장소를 여행하며 라이벌과 치는 커리어 모드를 만들고 있어요. 다음 업데이트에서 열려요.</div></div></div>';
  }
  // opts는 CareerMap.html로 그대로 간다({ state, now, region, stake }, 테스트용)
  function html(opts) {
    var M = _map();
    if (M) { try { return M.html(opts); } catch (e) { if (typeof console !== 'undefined' && console.warn) console.warn('[CareerView] html', e); } }
    return _stubHTML();
  }
  function render(el, opts) {
    el = el || _el;
    var out = html(opts);
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
