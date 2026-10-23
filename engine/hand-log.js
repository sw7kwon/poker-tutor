// engine/hand-log.js (n2-P0 계약 스텁, 설계 원문 docs/NEXT2_DESIGN.md 5.2절, 6.1절 3번. 클라우드 L1이 저장과 조회를 채운다)
// 자유 게임 핸드마다 app.js 호출 지점 5곳이 이벤트를 보낸다: _newHand(begin), 빌런 걸음 루프(villain), heroAction(hero),
// 스트리트 전환 2곳(street), _showResult(end). 리바이는 note('rebuy', { name, add, manual? }).
// 로그 모양(v: 1): { v, id: sid:seed:handNum, sid, seed, handNum, mode, heroPos, omni, hidden, t0, bb: 1,
//   players: [{ name, pos, type(숨김이면 null), hero, stack0 }], hole: { 이름: ['As', 'Kd'] }, blinds: { sb, bb }, ev: [] }
// 이벤트: 액션 { k: 'a', st, n, act, amt, lbl, pre: { pot, cb, have, stack, sbc, lr, pfa, reopened, live }, post: { pot, stacks, bets }, ov, hero }
//         스트리트 { k: 's', st, board, pot }, 끝 { k: 'e', board, winner, payouts, desc, showdown, folded, stacks }, 메모 { k: 'n', kind, ... }
// begin은 연습, 커리어, GTO 미러, 미션과 보스 세션이면 null이고 그 뒤 훅은 전부 no-op(현재 로그가 없으면 no-op).
// 스텁(STUB: true): 메모리(_cur 현재, _last 직전)에만 둔다. 저장(KEY 링 버퍼 CAP개), hiddenUntil, list의 저장소 조회는 L1.
// 규약: 로드 때 DOM, localStorage 접근 없음. 엔진 상태는 읽기만 한다(사본을 적는다).
var HandLog = (function() {
  var KEY = 'poker_omni_log', CAP = 30;
  var _cur = null, _last = null;

  function _r2(x) { return Math.round((Number(x) || 0) * 100) / 100; }
  function _cs(cards) { return (cards || []).map(function(c) { return c ? (typeof c === 'string' ? c : c.rank + c.suit) : ''; }); }
  function _map2(o) { var out = {}; Object.keys(o || {}).forEach(function(k) { out[k] = _r2(o[k]); }); return out; }
  function _names(st) { return (st && (st.names || Object.keys(st.players || {}))) || []; }
  function _live(st) { var f = (st && st.folded) || {}; return _names(st).filter(function(n) { return !f[n]; }).length; }

  // ctx = { state, sid, mode, heroPos, omni, practice, gtoMode, sessionKind, career }
  function begin(ctx) {
    ctx = ctx || {};
    _cur = null;
    var st = ctx.state;
    if (!st || ctx.practice || ctx.career || ctx.gtoMode || ctx.sessionKind === 'mission' || ctx.sessionKind === 'boss') return null;
    var hidden = !!st.hideTypes;
    var players = _names(st).map(function(n) {
      var p = (st.players && st.players[n]) || {};
      return { name: n, pos: p.pos || null, type: hidden && n !== 'Hero' ? null : (p.type || null), hero: n === 'Hero',
        stack0: _r2(((st.stacks && st.stacks[n]) || 0) + ((st.totalContrib && st.totalContrib[n]) || 0)) };
    });
    var hole = {};
    _names(st).forEach(function(n) { hole[n] = _cs(st.holeCards && st.holeCards[n]); });
    var sid = ctx.sid != null ? ctx.sid : null;
    _cur = { v: 1, id: String(sid) + ':' + String(st.seed) + ':' + String(st.handNum), sid: sid, seed: st.seed, handNum: st.handNum,
      mode: ctx.mode || null, heroPos: ctx.heroPos || null, omni: !!ctx.omni, hidden: hidden,
      t0: new Date().toISOString(), bb: 1, players: players, hole: hole,
      blinds: { sb: _r2((st.bigBlind || 1) / 2), bb: _r2(st.bigBlind || 1) }, ev: [] };
    return _cur;
  }

  function _post(post) {
    return { pot: _r2(post && post.pot), stacks: _map2(post && post.stacks), bets: _map2(post && post.playerBets) };
  }
  function _pre(pre, n, snap) {
    pre = pre || {};
    snap = snap || {};
    return {
      pot: _r2(snap.potBefore != null ? snap.potBefore : pre.pot),
      cb: _r2(snap.currentBetBefore != null ? snap.currentBetBefore : pre.currentBet),
      have: _r2(snap.haveBefore != null ? snap.haveBefore : (pre.playerBets && pre.playerBets[n])),
      stack: _r2(pre.stacks && pre.stacks[n]), sbc: pre.streetBetCount || 0, lr: pre.lastRaiser || null,
      pfa: pre.pfAggressor || null, reopened: pre.reopened !== false, live: _live(pre)
    };
  }

  // a = 엔진 villainActions 한 개({ name, action, amount, label, potBefore, currentBetBefore, haveBefore }), pre/post = 걸음 앞뒤 상태
  function villain(a, pre, post, ov) {
    if (!_cur || !a) return null;
    var ev = { k: 'a', st: (pre && pre.street) || null, n: a.name, act: a.action, amt: _r2(a.amount), lbl: a.label || null,
      pre: _pre(pre, a.name, a), post: _post(post), ov: ov || null, hero: false };
    _cur.ev.push(ev);
    return ev;
  }

  // o = { pre, post, intended, executed, amount, dec, verdict, grade, eq }
  function hero(o) {
    if (!_cur || !o) return null;
    var pre = o.pre || {}, post = o.post || {}, act = o.executed || o.intended || null;
    var had = (pre.playerBets && pre.playerBets.Hero) || 0, now = (post.playerBets && post.playerBets.Hero);
    var amt = 0;
    if (act === 'call') amt = (now != null) ? now - had : 0;
    else if (act === 'raise' || act === 'allin' || act === 'bet') amt = (now != null) ? now : (o.amount || 0);
    var d = o.dec || {}, V = o.verdict || null, g = o.grade || null, h = { intended: o.intended || act };
    var put = function(k, v) { if (v !== undefined && v !== null) h[k] = v; };
    put('executed', o.executed);
    put('verdict', V && V.action);
    put('light', g && g.light);
    put('evKey', V && V.evKey);
    put('bestEV', d.bestEV != null ? _r2(d.bestEV) : undefined);
    put('actualEV', d.actualEV != null ? _r2(d.actualEV) : undefined);
    put('eq', o.eq != null ? Math.round(o.eq * 1000) / 1000 : undefined);
    if (d.chartShown) h.chartShown = true;
    put('source', V && V.source);
    put('spot', V && V.concept);
    var ev = { k: 'a', st: pre.street || null, n: 'Hero', act: act, amt: _r2(amt), lbl: null,
      pre: _pre(pre, 'Hero', null), post: _post(post), ov: null, hero: h };
    _cur.ev.push(ev);
    return ev;
  }

  function street(state) {
    if (!_cur || !state) return null;
    var ev = { k: 's', st: state.street || null, board: _cs(state.board), pot: _r2(state.pot) };
    _cur.ev.push(ev);
    return ev;
  }

  function note(kind, data) {
    if (!_cur) return null;
    var ev = { k: 'n', kind: String(kind || '') };
    if (data && typeof data === 'object') Object.keys(data).forEach(function(k) { if (k !== 'k' && k !== 'kind') ev[k] = data[k]; });
    if (ev.add != null) ev.add = _r2(ev.add);
    _cur.ev.push(ev);
    return ev;
  }

  // o = { settled(정산 그리기 사본: stacks, payouts(순이익), folded, board), result(resolveShowdown 결과), startStacks }
  function end(o) {
    if (!_cur) return null;
    o = o || {};
    var s = o.settled || {}, r = o.result || {};
    var folded = {};
    Object.keys(s.folded || {}).forEach(function(n) { if (s.folded[n]) folded[n] = true; });
    _cur.ev.push({ k: 'e', board: _cs(s.board), winner: r.winner != null ? r.winner : null, payouts: _map2(s.payouts),
      desc: r.handDescriptions || {}, showdown: !!r.showCards, folded: folded, stacks: _map2(s.stacks) });
    var done = _cur;
    _last = done;
    _cur = null;
    return done;
  }

  function current() { return _cur; }
  function last() { return _last; }
  function get(id) {
    if (id == null) return null;
    if (_cur && _cur.id === id) return _cur;
    if (_last && _last.id === id) return _last;
    return null;
  }
  function _summary(log) {
    if (!log) return null;
    var e = null;
    for (var i = log.ev.length - 1; i >= 0; i--) if (log.ev[i].k === 'e') { e = log.ev[i]; break; }
    var result = 'none';
    if (e) result = (e.folded && e.folded.Hero) ? 'fold' : ((e.payouts && e.payouts.Hero > 0) ? 'win' : 'loss');
    return { id: log.id, date: log.t0, mode: log.mode, heroPos: log.heroPos, heroCards: (log.hole && log.hole.Hero) || [], result: result };
  }
  // 저장된(끝난) 핸드 머리 요약, 최신이 앞. 스텁은 메모리의 직전 핸드만
  function list() { return _last ? [_summary(_last)] : []; }
  // 숨김 테이블 로그를 세션 끝 뒤 열 수 있게 한다(L1이 hiddenUntil과 저장소를 채운다). 바꾼 로그 수
  function releaseHidden(sid) {
    var n = 0;
    [_cur, _last].forEach(function(l) { if (l && l.hiddenUntil && (sid == null || l.sid === sid)) { delete l.hiddenUntil; n++; } });
    return n;
  }
  function _reset() { _cur = null; _last = null; }

  var api = { STUB: true, KEY: KEY, CAP: CAP, begin: begin, villain: villain, hero: hero, street: street, note: note, end: end,
    current: current, last: last, get: get, list: list, releaseHidden: releaseHidden, _summary: _summary, _reset: _reset };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
