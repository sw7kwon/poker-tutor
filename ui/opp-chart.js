// ui/opp-chart.js (n3-C, 상대 차례에 그 사람 입장의 콜, 레이즈 차트)
// 사용자 요청: 내 플레이어 말고 다른 플레이어 차례(탭으로 넘길 때)에도 콜 차트, 레이즈 차트를 볼 수 있게.
//   "그 자리, 그 상황이면 기준 차트는 이렇다"를 상대가 결정하는 순간에 보며 레인지를 익힌다.
// 흐름(탭 진행, Pacer.waiting과 'pace:wait'):
//   1. 대기(wait): 다음 좌석 X 입장 차트(머리줄 "CO 차례: UTG 오픈에 대응(CO 자리 차트)", 하늘색). 차트 칩이 켜져 있으면 자동으로 따라간다.
//   2. 결과(result): 누르면 X의 행동이 나오고 같은 차트에 결과 줄("CO가 콜했어요. CO 자리의 콜 범위는 이 칸들(14종, 이 앱 차트 기준)")과
//      그 액션 칸 윤곽. 차트가 보이는 동안의 다음 누름은 공개가 아니라 다음 좌석 차트로 넘기는 데 쓴다(Pacer.setGate). 차트가 접혀 있으면 1번 누름 = 1걸음 그대로.
//   3. 포스트플랍(post): 프리플랍 차트 대신 X가 프리플랍에 한 행동의 범위(예 CO가 UTG 오픈에 콜 → CO 콜 범위). 프리플랍 결정 기록은 핸드 동안 남긴다.
//   4. 관점 칩 줄(머리줄 위): 👤 내 차트, 방금: CO(마지막으로 행동이 공개된 상대 1명, 누르면 그 상대의 마지막 프리플랍 결정 차트). 시간 속도에서도 공개가 끝난 뒤 쓴다.
//      내 차례가 오면(GtoChart.update) 자동으로 내 차트. '👤 내 차트'를 누르면 이번 내 결정까지 따라가기를 멈춘다.
//   5. 완전 분석(App.omni())이면 X의 실제 손 칸(하늘색 테두리)과 "CO 실제 손 Q♥J♥ = QJs, 콜 칸". 일반 모드는 상대 카드를 모르므로 손 칸 없음.
//   6. 라벨 1줄 "이 자리의 기준 차트예요. 상대의 실제 성향은 다를 수 있어요". 이름 대신 자리만 쓰므로 유형 숨김 테이블에서도 성향이 드러나지 않는다.
//      승급 시험(Boss.active, GtoChart.update의 boss)은 차트가 꺼진 판이라 그대로 꺼 둔다.
// 상황 계산: seatSituation(state, name, acts)(순수) = Gto.preflopHint의 히어로 판정(오픈, 오픈 대응, 3벳 맞음, 4벳 맞음, 콜드 3벳, 림퍼 뒤)을 좌석 일반화한 것.
//   히어로는 acts를 생략하면 state.decisions로 같은 판정(tests/j-opp-chart.test.js가 엔진 판정과 맞춰 본다). 엔진은 고치지 않고 상태와 행동 기록으로만 센다.
// 기록: app.js의 핸드 로그 훅(_hl) 인자를 그대로 받는다(track: begin, villain, hero). 공개된 프레임은 shown(frame).
// 성능: 그리기는 다음 프레임(rAF, 결정 동기 블록 밖). 모델, 격자, 상대 차트 전체 HTML은 GtoChart 캐시(같은 상황 다시 오면 DOM 쓰기 0).
// 규약: 로드 때 DOM, 저장소 접근 없음(document.addEventListener만). 다른 모듈은 typeof 가드. 문구 해요체, 가운뎃점과 긴줄표 없음.
var OppChart = (function() {
  var POS6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var NOTE = '이 자리의 기준 차트예요. 상대의 실제 성향은 다를 수 있어요';
  var STREET_KOR = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버' };
  var _env = { sync: null, visible: null };   // 테스트 주입: sync(그리기 즉시), visible(차트 보임 판정 강제)
  var _h = null;        // 이번 핸드 { id, key, recs, acts, last, omni, hideTypes }
  var _hid = 0;
  var _view = null;     // 지금 보이는 상대 차트 { kind: 'wait' | 'result' | 'post' | 'last', rec, pf?, run? } | null(내 차트)
  var _pin = false;     // '👤 내 차트'를 눌러 이번 내 결정까지 따라가기를 멈춤
  var _paintQ = false;
  var _paints = 0;      // 실제 그리기 횟수(테스트)

  function _GC() { return (typeof GtoChart !== 'undefined' && GtoChart) ? GtoChart : null; }
  function _P() { return (typeof Pacer !== 'undefined' && Pacer) ? Pacer : null; }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; });
  }
  function _ga(pos) { return pos === 'BTN' ? '이' : '가'; }   // 버튼이, 씨오가
  function _keyOf(st) { return st ? ((st.handNum || '') + '|' + (st.seed || '')) : ''; }

  // ── 상황 계산(순수) ──
  // seatSituation(state, name, acts) → { pos, facing(false | true | 'vs3bet' | 'vs4bet' | 'cold3bet'), opener, limpers } | null
  //   state = name이 결정하기 직전 상태(프리플랍), acts = name의 이번 핸드 앞선 프리플랍 행동(정규화: 'raise' | 'call' | 'check' | 'fold').
  //   Gto.preflopHint와 같은 규칙: 마지막 내 행동이 레이즈이고 남이 다시 올려 3번째 이상이면 4벳 맞음, 내가 레이즈한 적 있고 남이 올려 2번째 이상이면 3벳 맞음,
  //   아직 행동 전인데 2번째 이상 레이즈면 콜드 3벳, 그 밖에 레이즈가 있으면 오픈 대응(오프너 = 1번째 레이즈한 자리), 없으면 오픈(림퍼 수 = Gto.limperCount)
  function seatSituation(state, name, acts) {
    if (!state || state.street !== 'preflop' || !state.players || !name || !state.players[name]) return null;
    var pos = state.players[name].pos;
    if (POS6.indexOf(pos) < 0) return null;
    if (!acts) acts = name === 'Hero' ? (state.decisions || []).filter(function(d) { return d && d.street === 'preflop'; }).map(function(d) { return d.action; }) : [];
    var lr = state.lastRaiser || null, sbc = state.streetBetCount || 0, other = !!lr && lr !== name;
    var last = acts.length ? acts[acts.length - 1] : null, raised = acts.indexOf('raise') >= 0;
    var f4 = last === 'raise' && other && sbc >= 3;
    var f3 = !f4 && raised && other && sbc >= 2;
    var c3 = !f4 && !f3 && !acts.length && other && sbc >= 2;
    var facing = f4 ? 'vs4bet' : f3 ? 'vs3bet' : c3 ? 'cold3bet' : !!(lr && (state.currentBet || 0) > (state.bigBlind || 1));
    var opener = (facing === true && other && sbc === 1 && state.players[lr]) ? (state.players[lr].pos || null) : null;
    var limpers = 0;
    if (facing === false && typeof Gto !== 'undefined' && Gto && typeof Gto.limperCount === 'function') { try { limpers = Gto.limperCount(state) || 0; } catch (e) { limpers = 0; } }
    return { pos: pos, facing: facing, opener: opener, limpers: limpers };
  }
  // 엔진 행동 → 'raise' | 'call' | 'check' | 'fold'(상태 차이로: 레이즈로 잡혔는가, 칩을 더 냈는가)
  function normAction(pre, post, name, raw) {
    if (raw === 'fold') return 'fold';
    if (post && post.lastRaiser === name && (post.streetBetCount || 0) > ((pre && pre.streetBetCount) || 0)) return 'raise';
    var b0 = (pre && pre.playerBets && pre.playerBets[name]) || 0, b1 = (post && post.playerBets && post.playerBets[name]) || 0;
    if (post && post.playerBets && b1 > b0 + 1e-9) return 'call';
    if (raw === 'raise' || raw === 'bet' || raw === '3bet' || raw === 'allin') return post ? 'call' : 'raise';
    return raw === 'call' ? 'call' : 'check';
  }
  // 그 자리 말투 상황(머리줄): 'UTG 오픈에 대응', '먼저 오픈할 차례', '림퍼 1명 뒤', '오픈했다가 3벳 맞음', '3벳했다가 4벳 맞음', '콜드 3벳에 대응'
  function sitText(sit) {
    if (!sit) return '';
    if (sit.facing === 'vs4bet') return '3벳했다가 4벳 맞음';
    if (sit.facing === 'vs3bet') return '오픈했다가 3벳 맞음';
    if (sit.facing === 'cold3bet') return '콜드 3벳에 대응';
    if (sit.facing === true) return (sit.opener ? sit.opener + ' 오픈' : '상대 오픈') + '에 대응';
    if (sit.limpers) return '림퍼 ' + sit.limpers + '명 뒤';
    return '먼저 오픈할 차례';
  }
  function _model(sit) { var GC = _GC(); return (GC && sit) ? GC.situationModel(sit) : null; }
  // 액션 낱말: 레이즈는 상황 단어(오픈, 3벳, 4벳, 5벳(올인), 아이솔 레이즈), 콜은 콜(림퍼 뒤 BB는 체크)
  function actWord(model, act) {
    var GC = _GC();
    if (!model || !GC) return act === 'raise' ? '레이즈' : act === 'fold' ? '폴드' : act === 'check' ? '체크' : '콜';
    if (act === 'raise') return model.limpers ? '아이솔 레이즈' : GC.viewWord(model, 'raise');
    if (act === 'fold') return '폴드';
    if (act === 'check') return '체크';
    return GC.callWord(model);
  }
  function _kinds(model, act) {
    var GC = _GC();
    if (!model || !GC || (act !== 'raise' && act !== 'call')) return 0;
    var vc = GC.viewCount(model)[act];
    return vc ? vc.n : 0;
  }
  // 차트 칸 쪽 액션: 체크(림퍼 뒤 BB)는 콜 색 칸
  function _hlOf(act) { return act === 'raise' ? 'raise' : (act === 'call' || act === 'check') ? 'call' : null; }
  // 결과 줄(순수): rec = { pos, act, sit }, run = 같은 걸음에 이어 폴드한 자리들
  function resultText(rec, model, run) {
    var pos = rec.pos, act = rec.act, ga = _ga(pos);
    if (act === 'fold') return pos + ga + ' 폴드했어요' + (run && run.length ? '(이어서 ' + run.join(', ') + '도 폴드)' : '') + '. 색칠된 범위 밖의 손이에요(이 앱 차트 기준)';
    var hl = _hlOf(act), n = _kinds(model, hl), w = actWord(model, act);
    var limp = act === 'call' && rec.sit && rec.sit.facing === false && !(rec.sit.limpers && rec.pos === 'BB');
    if (limp) w = '림프';
    if (!n) return pos + ga + ' ' + w + '했어요. 이 앱 차트에는 이 상황 ' + w + ' 칸이 없어요(차트 밖 행동이에요)';
    return pos + ga + ' ' + w + '했어요. ' + pos + ' 자리의 ' + w + ' 범위는 이 칸들(' + n + '종, 이 앱 차트 기준)';
  }
  // 포스트플랍 줄(순수): 'CO가 프리플랍에 UTG 오픈에 콜 → CO 콜 범위(14종, 이 앱 차트 기준)'
  function postText(pf, model) {
    var s = pf.sit || {}, act = pf.act, w = actWord(model, act), hl = _hlOf(act), n = _kinds(model, hl), lead;
    if (s.facing === true) lead = (s.opener ? s.opener + ' 오픈에 ' : '오픈에 ') + w;
    else if (s.facing === 'vs3bet') lead = '오픈했다가 3벳을 맞고 ' + w;
    else if (s.facing === 'vs4bet') lead = '3벳했다가 4벳을 맞고 ' + w;
    else if (s.facing === 'cold3bet') lead = '오픈과 3벳 뒤 ' + w;
    else if (s.limpers) lead = '림퍼 ' + s.limpers + '명 뒤 ' + (act === 'call' && pf.pos !== 'BB' ? '림프' : w);
    else lead = act === 'raise' ? '먼저 오픈' : act === 'call' ? '림프' : w;
    var tail = n ? pf.pos + ' ' + (act === 'call' && s.facing === false && !(s.limpers && pf.pos === 'BB') ? '림프' : w) + ' 범위(' + n + '종, 이 앱 차트 기준)' : '이 앱 차트에는 이 행동 칸이 없어요(차트 밖 행동)';
    return pf.pos + _ga(pf.pos) + ' 프리플랍에 ' + lead + ' → ' + tail;
  }
  // 완전 분석 실제 손 줄 재료: { pos, cards, label, word, r, c }
  function handInfo(rec, model) {
    var GC = _GC(), pre = rec.pre, cards = pre && pre.holeCards && pre.holeCards[rec.name];
    if (!GC || !model || !cards || cards.length < 2 || !cards[0] || !cards[1]) return null;
    var hc = GC.handCell(cards), cell = model.cells[hc.r] && model.cells[hc.r][hc.c];
    if (!cell) return null;
    var a = GC.primaryAction(cell), mx = GC.mixOf(cell);
    var word = mx ? '혼합 칸' : a === 'raise' ? actWord(model, 'raise') + ' 칸' : a === 'call' ? GC.callWord(model) + ' 칸' : a === 'fold' ? '폴드 칸' : '자료 없음';
    return { pos: rec.pos, cards: cards, label: cell.label, word: word, r: hc.r, c: hc.c };
  }

  // ── 핸드 기록(app.js _hl 훅 인자 그대로) ──
  function track(name, a1, a2, a3) {
    if (name === 'begin') {
      var st = a1 && a1.state;
      _h = { id: ++_hid, key: _keyOf(st), recs: [], acts: {}, last: null, omni: !!(a1 && a1.omni), hideTypes: !!(st && st.hideTypes), heroActed: false };
      _view = null; _pin = false;
      return true;
    }
    if (!_h) return false;
    if (name === 'villain') return !!_rec(a1 && a1.name, a2, a3, a1 && a1.action);
    if (name === 'hero') {
      var o = a1 || {};
      _pin = false;
      _h.heroActed = true;
      return !!_rec('Hero', o.pre, o.post, o.executed || o.intended);
    }
    return false;
  }
  function _rec(nm, pre, post, raw) {
    if (!_h || !nm || !pre || !pre.players || !pre.players[nm]) return null;
    var act = normAction(pre, post, nm, raw);
    var r = { seq: _h.recs.length, name: nm, pos: pre.players[nm].pos, street: pre.street, act: act, pre: pre, sit: null, shown: nm === 'Hero' };
    if (pre.street === 'preflop') {
      var acts = _h.acts[nm] || (_h.acts[nm] = []);
      r.sit = seatSituation(pre, nm, nm === 'Hero' ? null : acts.slice());
      acts.push(act);
    }
    _h.recs.push(r);
    return r;
  }
  function recOf(pre) {
    if (!_h || !pre) return null;
    for (var i = _h.recs.length - 1; i >= 0; i--) if (_h.recs[i].pre === pre) return _h.recs[i];
    return null;
  }
  // name의 마지막 프리플랍 결정 기록(상황이 있는 것)
  function lastPreflop(name) {
    if (!_h) return null;
    for (var i = _h.recs.length - 1; i >= 0; i--) { var r = _h.recs[i]; if (r.name === name && r.street === 'preflop' && r.sit) return r; }
    return null;
  }
  // 공개된 프레임(app.js 공개 훅): 마지막으로 행동이 보인 상대를 기억한다(방금: CO)
  function shown(frame) {
    var r = recOf(frame && frame.pre);
    if (!r) return false;
    r.shown = true;
    if (r.name !== 'Hero' && lastPreflop(r.name)) {
      var was = _h.last;
      _h.last = r;
      if (was !== r && !_view) _later();   // 내 차트를 보는 중이면 관점 칩 줄만 고친다(다음 프레임)
    }
    return true;
  }

  // ── 판정 ──
  function _bossOn() { try { return !!(typeof Boss !== 'undefined' && Boss && typeof Boss.active === 'function' && Boss.active()); } catch (e) { return false; } }
  function _enabled() { var GC = _GC(); return !!(GC && typeof GC.wanted === 'function' && GC.wanted()) && !_bossOn(); }
  function _visible() {
    if (_env.visible != null) return !!_env.visible;
    var GC = _GC();
    try { return !!(GC && typeof GC.visible === 'function' && GC.visible()); } catch (e) { return false; }
  }
  function _omniOn() {
    if (!_h || !_h.omni || _h.hideTypes) return false;
    try { return !!(typeof App === 'undefined' || !App || typeof App.omni !== 'function' || App.omni()); } catch (e) { return false; }
  }
  function _following() { return !!_h && !_pin && _enabled(); }

  // ── 'pace:wait'(Pacer 대기 좌석이 바뀔 때) ──
  function onWait(w) {
    if (!_h) return false;
    var prev = _view;
    // 앞 대기 좌석의 행동이 막 나왔다: 차트가 보이면 같은 차트에 결과를 잇고, 다음 누름에 다음 좌석으로(문 take)
    if (prev && prev.kind === 'wait' && prev.rec && prev.rec.shown && _following() && (_visible() || !w)) {
      _show({ kind: 'result', rec: prev.rec, run: _foldRun(prev.rec, w), hold: !w });
      return true;
    }
    // 대기가 끝나며(null) 띄운 결과(그 스트리트 마지막 상대의 행동)는 다음 스트리트 첫 대기가 곧바로 와도 그대로 둔다.
    //   바로 바꾸면 결과 줄이 한 프레임도 안 보인다(리뷰: 프리플랍 마지막 콜이 플랍 첫 대기 차트에 덮임). 다음 누름이 문(take)으로 그 좌석 차트를 연다
    if (prev && prev.kind === 'result' && prev.hold && w && !w.auto && w.seat !== 'Hero' && _following() && _visible()) return false;
    if (w && !w.auto && w.seat && w.seat !== 'Hero' && _following()) return _showWait(w);
    return false;
  }
  // 같은 걸음에 이어 폴드한 자리들(앞 대기 좌석 다음 기록부터 지금 대기 좌석 기록 앞까지)
  function _foldRun(rec, w) {
    if (!_h || rec.act !== 'fold') return null;
    var end = w ? recOf(w.state) : null, out = [];
    for (var i = rec.seq + 1; i < _h.recs.length; i++) {
      var r = _h.recs[i];
      if (end && r === end) break;
      if (r.act !== 'fold' || !r.shown || r.name === 'Hero') break;
      out.push(r.pos);
    }
    return out.length ? out : null;
  }
  function _showWait(w) {
    var rec = recOf(w && w.state);
    if (!rec || rec.name !== w.seat || rec.name === 'Hero') return false;
    if (rec.street === 'preflop') { if (!rec.sit) return false; return _show({ kind: 'wait', rec: rec }); }
    var pf = lastPreflop(rec.name);
    return pf ? _show({ kind: 'post', rec: rec, pf: pf }) : false;
  }
  function _same(a, b) { return !!(a && b && a.kind === b.kind && a.rec === b.rec && String(a.run || '') === String(b.run || '')); }
  function _show(v) {
    if (_same(_view, v)) return false;
    _view = v;
    _later();
    return true;
  }

  // ── 문(Pacer.setGate): 차트가 보이는 동안 지금 대기 좌석 차트가 아니면(결과, 방금 차트, 내 차트) 그 누름은 대기 좌석 차트로 넘기기 ──
  function _isWaitView(w) {
    var r = recOf(w && w.state);
    return !!(r && _view && (_view.kind === 'wait' || _view.kind === 'post') && _view.rec === r);
  }
  function take(how, w) {
    if (how !== 'step' || !w || w.auto || !_following() || !_visible()) return false;
    if (_isWaitView(w)) return false;
    var r = recOf(w.state);
    if (!r || r.name === 'Hero' || (r.street === 'preflop' && !r.sit) || (r.street !== 'preflop' && !lastPreflop(r.name))) return false;
    return _showWait(w);
  }
  function label(w, left) {
    if (!w || w.auto || !_following() || !_visible()) return null;
    var pos = w.pos || '', lt = ' <span class="pace-left">(남은 ' + left + ')</span>';
    if (_isWaitView(w)) return { html: '👆 <b>' + _esc(pos) + '</b> 행동 보기' + lt, aria: pos + ' 행동 보기, 남은 ' + left + '번' };
    return { html: '👆 다음: <b>' + _esc(pos) + '</b> 차트' + lt, aria: '다음 차례 ' + pos + ' 차트 보기, 남은 ' + left + '번' };
  }

  // ── 그리기 ──
  function _later() {
    if (_env.sync) { _paint(); return; }
    var raf = (typeof window !== 'undefined' && window && typeof window.requestAnimationFrame === 'function') ? window.requestAnimationFrame : null;
    if (!raf) { _paint(); return; }
    if (_paintQ) return;
    _paintQ = true;
    raf(function() { _paintQ = false; try { _paint(); } catch (e) { if (typeof console !== 'undefined' && console.error) console.error('[OppChart]', e); } });
  }
  // 관점 칩 줄 HTML(순수에 가깝다, 지금 상태로): 내 차트만 있고 방금 상대가 없으면 빈 줄
  function perspHTML() {
    if (!_h) return '';
    var GC = _GC(), last = _h.last, mine = !_view;
    var hasMe = !!(GC && typeof GC.hasHero === 'function' && GC.hasHero(_h.key));
    if (!last && (mine || !hasMe)) return '';   // 고를 것이 없으면(내 차트만, 또는 아직 내 차트도 방금 상대도 없음) 줄을 비운다
    var b = '<button type="button" class="oc-chip oc-me" data-oc="me" aria-pressed="' + (mine ? 'true' : 'false') + '"' +
      (hasMe ? '' : ' aria-disabled="true" title="내 차례가 오면 내 차트가 나와요"') + ' aria-label="내 차트 보기' + (hasMe ? '' : ', 내 차례가 오면 나와요') + '">👤 내 차트</button>';
    if (last) {
      var on = !!(_view && _view.kind === 'last' && _view.rec && _view.rec.name === last.name);
      b += '<button type="button" class="oc-chip oc-last" data-oc="last" aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="방금 행동한 ' + _esc(last.pos) + '의 프리플랍 결정 차트 보기">방금: ' + _esc(last.pos) + '</button>';
    }
    return '<div class="oc-persp" role="group" aria-label="누구 입장 차트를 볼지">' + b + '</div>';
  }
  // 지금 상대 차트 상황(GtoChart.seatView 인자). 순수(기록과 _view로만)
  function sitFor(v) {
    v = v || _view;
    if (!v || !v.rec) return null;
    var chartRec = (v.kind === 'post' || v.kind === 'last') ? (v.pf || lastPreflop(v.rec.name)) : v.rec;
    if (!chartRec || !chartRec.sit) return null;
    var sit = chartRec.sit, model = _model(sit), pos = chartRec.pos;
    if (!model) return null;
    var op = { head: '', post: '', res: '', hl: null, hand: null, note: NOTE, legend: [], short: '', key: '' };
    var st = v.kind === 'post' ? v.rec.street : 'preflop';
    var showRes = v.kind === 'result' || v.kind === 'post' || v.kind === 'last';
    if (v.kind === 'post') {
      op.head = pos + ' 차례(' + (STREET_KOR[st] || st) + '): 프리플랍 행동의 범위';
      op.post = '지금은 ' + (STREET_KOR[st] || st) + ', ' + pos + _ga(pos) + ' 프리플랍에 한 행동의 범위예요';
      op.res = postText(chartRec, model);
      op.short = (STREET_KOR[st] || st) + ', ' + pos + ' 프리플랍 ' + actWord(model, chartRec.act) + ' 범위';
    } else {
      op.head = (v.kind === 'last' ? '방금 ' + pos + ': ' : pos + ' 차례: ') + sitText(sit) + '(' + pos + ' 자리 차트)';
      op.short = (v.kind === 'last' ? '방금 ' : '') + pos + ' 차례: ' + sitText(sit);
      if (showRes) {
        // 방금 차트: 그 상대의 마지막 행동이 프리플랍 결정 그 자체면 결과 줄, 포스트플랍 행동이었으면 프리플랍 행동의 범위 줄
        op.res = (v.kind === 'last' && v.rec !== chartRec) ? postText(chartRec, model) : resultText(chartRec, model, v.kind === 'result' ? v.run : null);
        op.short = pos + ' ' + (chartRec.act === 'fold' ? '폴드' : actWord(model, chartRec.act) + ', ' + actWord(model, chartRec.act) + ' 범위');
      }
    }
    if (showRes) {
      var hl = _hlOf(chartRec.act);
      if (hl && _kinds(model, hl)) {
        op.hl = hl;
        op.legend.push((hl === 'call' ? '진한 윤곽' : '흰 윤곽') + ' = ' + pos + _ga(pos) + ' 한 행동(' + actWord(model, chartRec.act) + ')의 칸');
      }
    }
    if (_omniOn()) {
      op.hand = handInfo(chartRec, model);
      if (op.hand) op.legend.push('하늘색 테두리 = ' + pos + ' 실제 손');
    }
    op.key = _h.id + ':' + v.kind + ':' + v.rec.seq + ':' + chartRec.seq + ':' + String(v.run || '') + ':' + (op.hand ? 'h' : '') + ':' + (op.hl || '');
    return { pos: sit.pos, facing: sit.facing, opener: sit.opener, limpers: sit.limpers, street: 'preflop', label: '👀 ' + pos + ' 자리 차트', opp: op,
      open: !_h.heroActed };
  }
  function _paint() {
    var GC = _GC();
    if (!GC || typeof GC.seatView !== 'function') return false;
    _paints++;
    if (!_view || !_following()) {
      if (_view && !_following()) _view = null;
      if (typeof GC.setPersp === 'function') GC.setPersp(perspHTML());
      _repaintPill();
      return true;
    }
    var sit = sitFor(_view);
    if (!sit) { _view = null; GC.setPersp(perspHTML()); _repaintPill(); return false; }
    sit.persp = perspHTML();
    GC.seatView(sit);
    _repaintPill();
    return true;
  }
  function _repaintPill() { var P = _P(); if (P && typeof P.repaint === 'function' && P.busy && P.busy()) { try { P.repaint(); } catch (e) { /* noop */ } } }

  // ── GtoChart 알림 ──
  function _onChart(kind, data) {
    if (kind === 'hero') {   // 내 차례: 내 차트(관점 칩 줄만 맞춘다, 곧 GtoChart가 그린다)
      _view = null; _pin = false;
      var GC = _GC();
      if (GC && typeof GC.setPersp === 'function') GC.setPersp(_h && _keyOf(data) === _h.key ? perspHTML() : '');
      return;
    }
    if (kind === 'hide') { _view = null; _repaintPill(); return; }
    if (kind === 'refresh') {
      var P = _P(), w = (P && typeof P.waiting === 'function') ? P.waiting() : null;
      if (!_enabled()) { _view = null; _repaintPill(); return; }   // 칩을 끄면 알약 글도 원래대로('행동 보기' 대신 '눌러서 다음')
      if (w && !w.auto && _following() && !_view) _showWait(w);
      else _later();
      return;
    }
    if (kind === 'chip') onChip(data);
  }
  // 관점 칩 누름: 'me' 내 차트(대기 중이면 이번 내 결정까지 따라가기 멈춤), 'last' 방금 행동한 상대의 마지막 프리플랍 결정 차트
  function onChip(v) {
    var GC = _GC();
    if (!_h || !GC) return false;
    if (v === 'me') {
      if (!GC.hasHero(_h.key)) return false;
      _view = null;
      var P = _P();
      _pin = !!(P && typeof P.waiting === 'function' && P.waiting());
      GC.seatView(null, { persp: perspHTML() });
      _repaintPill();
      return true;
    }
    if (v === 'last') {
      var last = _h.last, pf = last ? lastPreflop(last.name) : null;
      if (!pf) return false;
      _pin = false;
      _view = { kind: 'last', rec: last, pf: pf };
      _paint();
      return true;
    }
    return false;
  }

  // ── 연결(로드 때 리스너만) ──
  if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
    document.addEventListener('pace:wait', function(e) { try { onWait(e ? e.detail : null); } catch (x) { if (typeof console !== 'undefined' && console.error) console.error('[OppChart]', x); } });
  }
  if (typeof GtoChart !== 'undefined' && GtoChart && typeof GtoChart.on === 'function') GtoChart.on(_onChart);
  if (typeof Pacer !== 'undefined' && Pacer && typeof Pacer.setGate === 'function') Pacer.setGate({ take: take, label: label });

  var api = { NOTE: NOTE, seatSituation: seatSituation, normAction: normAction, sitText: sitText, actWord: actWord, resultText: resultText, postText: postText,
    handInfo: handInfo, track: track, shown: shown, onWait: onWait, onChip: onChip, take: take, label: label, perspHTML: perspHTML, sitFor: sitFor,
    recOf: recOf, lastPreflop: lastPreflop,
    _onChart: _onChart, _paint: _paint,
    _setEnv: function(o) { if (!o) { _env = { sync: null, visible: null }; return _env; } Object.keys(o).forEach(function(k) { _env[k] = o[k]; }); return _env; },
    _state: function() { return { view: _view ? { kind: _view.kind, seat: _view.rec && _view.rec.name, pos: _view.rec && _view.rec.pos } : null, pin: _pin, hand: _h ? { id: _h.id, key: _h.key, recs: _h.recs.length, last: _h.last ? _h.last.pos : null, omni: _h.omni } : null, paints: _paints }; },
    _reset: function() { _h = null; _view = null; _pin = false; _paintQ = false; _paints = 0; } };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
