// engine/hand-log.js (n2-P0 계약, 클라우드 L1 구현. 설계 원문 docs/NEXT2_DESIGN.md 5.2절, 6.1절 3번, 지시문 docs/cloud-tasks/L1.md)
// 자유 게임 핸드마다 app.js 호출 지점 5곳이 이벤트를 보낸다: _newHand(begin), 빌런 걸음 루프(villain), heroAction(hero),
// 스트리트 전환 2곳(street), _showResult(end). 리바이는 note('rebuy', { name, add, manual? }).
// 로그 모양(v: 1): { v, id: sid:seed:handNum, sid, seed, handNum, mode, heroPos, omni, hidden, t0, bb: 1,
//   players: [{ name, pos, type(숨김이면 null), hero, stack0 }], hole: { 이름: ['As', 'Kd'] }, blinds: { sb, bb }, ev: [], hiddenUntil? }
// 이벤트: 액션 { k: 'a', st, n, act, amt, lbl, pre: { pot, cb, have, stack, sbc, lr, pfa, reopened, live }, post: { pot, stacks, bets }, ov, hero }
//         스트리트 { k: 's', st, board, pot }, 끝 { k: 'e', board, winner, payouts, desc, showdown, folded, stacks }, 메모 { k: 'n', kind, ... }
// begin은 연습, 커리어, GTO 미러, 미션과 보스 세션이면 null이고 그 뒤 훅은 전부 no-op(현재 로그가 없으면 no-op).
// 저장(L1): localStorage[KEY] = { v: 1, items: [압축 로그, 오래된 것부터] } 링 버퍼 CAP개. end에서만 1회 쓰기, 쓰기 실패는 조용히 무시.
//   압축(_pack, _unpack): 액션 이벤트의 post.stacks, post.bets와 끝 이벤트 stacks가 players 전원 키를 가지면 players 순서 배열로,
//   늘 비어 있는 값(lbl, ov, pre.lr, pre.pfa null, hero false)은 뺀다. 풀면 메모리 모양과 JSON까지 같다(tests/j-hand-log 검사).
//   hiddenUntil: 머리 hidden이 참이면 end 때 'sessionEnd'를 적고 releaseHidden(sid)(세션 요약이 부른다)가 지운다. UI는 이 값이 있으면 열지 않는다.
//   get(id)는 메모리(_cur, _last) → 저장소 순, list()는 저장된 머리 요약(최신이 앞, 저장에 실패한 _last도 앞에 둔다).
// 규약: 로드 때 DOM, localStorage 접근 없음(typeof 가드). 엔진 상태는 읽기만 한다(사본을 적는다). 성능 end 저장 1회 3ms 이하.
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
    if (_cur.hidden) _cur.hiddenUntil = 'sessionEnd';
    var done = _cur;
    _last = done;
    _cur = null;
    _save(done);
    return done;
  }

  // ── 저장소(링 버퍼) ──
  // 메모리 미러 _mem = { items: [압축 로그], strs: [항목별 JSON 문자열] }: 저장소는 처음 한 번만 파싱하고, 쓰기는 새 항목 1개만 직렬화해
  // 문자열을 이어 붙인다(end 저장이 저장소 크기에 비례해 다시 직렬화하지 않게, 30개 180KB에서 1ms 안). 읽기 실패는 캐시하지 않는다.
  var _mem = null;
  function _ls() {
    try { return (typeof localStorage !== 'undefined' && localStorage) ? localStorage : null; } catch (e) { return null; }
  }
  function _load() {
    if (_mem) return _mem;
    var ls = _ls(), empty = { items: [], strs: [] };
    if (!ls) return empty;
    try {
      var raw = ls.getItem(KEY);
      if (!raw) { _mem = empty; return _mem; }
      var o = JSON.parse(raw), items = (o && o.v === 1 && Array.isArray(o.items)) ? o.items.filter(function(x) { return x && x.id; }) : [];
      _mem = { items: items, strs: items.map(function(x) { return JSON.stringify(x); }) };
      return _mem;
    } catch (e) { return empty; }
  }
  // 저장소 항목(압축 로그 배열, 오래된 것부터). 없거나 깨졌으면 []
  function _items() { return _load().items; }
  function _write(m) {
    var ls = _ls();
    if (!ls) return false;
    try { ls.setItem(KEY, '{"v":1,"items":[' + m.strs.join(',') + ']}'); return true; } catch (e) { return false; }
  }
  // 끝난 로그 1개를 링 버퍼에 더한다(같은 id는 바꿔 넣기). 성공 여부
  function _save(log) {
    if (!log || !log.id) return false;
    var m = _load();
    for (var i = m.items.length - 1; i >= 0; i--) if (m.items[i].id === log.id) { m.items.splice(i, 1); m.strs.splice(i, 1); }
    var pk = _pack(log);
    m.items.push(pk); m.strs.push(JSON.stringify(pk));
    while (m.items.length > CAP) { m.items.shift(); m.strs.shift(); }
    return _write(m);
  }

  // 압축: players 전원 키를 가진 칩 맵은 배열로(stacks는 엔진 키 순서 _so, bets는 players 순서), 늘 비어 있는 값은 뺀다. 입력은 바꾸지 않는다.
  //   풀 때 키 순서까지 되돌리므로 JSON 문자열이 메모리 로그와 같다.
  function _pnames(log) { return (log.players || []).map(function(p) { return p.name; }); }
  function _keysEq(ks, order) {
    if (ks.length !== order.length) return false;
    for (var i = 0; i < ks.length; i++) if (ks[i] !== order[i]) return false;
    return true;
  }
  function _hasAll(m, names) {
    for (var i = 0; i < names.length; i++) if (!Object.prototype.hasOwnProperty.call(m, names[i])) return false;
    return true;
  }
  function _unpackMap(m, order) {
    if (!Array.isArray(m)) return m;
    var out = {};
    for (var i = 0; i < order.length && i < m.length; i++) out[order[i]] = m[i];
    return out;
  }
  function _pack(log) {
    var names = _pnames(log), so = null;
    function packStacks(m) {
      if (!m || typeof m !== 'object' || Array.isArray(m)) return m;
      var ks = Object.keys(m);
      if (so === null) { if (ks.length === names.length && _hasAll(m, names)) so = ks; else return m; }
      if (!_keysEq(ks, so)) return m;
      return so.map(function(n) { return m[n]; });
    }
    function packBets(m) {
      if (!m || typeof m !== 'object' || Array.isArray(m) || !_keysEq(Object.keys(m), names)) return m;
      return names.map(function(n) { return m[n]; });
    }
    var out = {}, street = 'preflop';
    Object.keys(log).forEach(function(k) { if (k !== 'ev' && k !== '_so') out[k] = log[k]; });
    out.ev = (log.ev || []).map(function(e) {
      if (!e) return e;
      if (e.k === 's') { if (e.st) street = e.st; return e; }
      if (e.k === 'a') {
        var a = { k: 'a', n: e.n, act: e.act, amt: e.amt };
        if (e.st !== street) a.st = e.st === undefined ? null : e.st;   // 직전 스트리트 이벤트와 같으면 생략
        if (e.lbl != null) a.lbl = e.lbl;
        if (e.pre) {
          // 자리 고정 배열 [pot, cb, have, stack, sbc, live, lr, pfa, reopened], 끝의 기본값(true, null, null)은 자른다
          var p = e.pre, q = [p.pot, p.cb, p.have, p.stack, p.sbc, p.live, p.lr == null ? null : p.lr, p.pfa == null ? null : p.pfa, p.reopened];
          if (q[8] === true) { q.length = 8; if (q[7] === null) { q.length = 7; if (q[6] === null) q.length = 6; } }
          a.pre = q;
        }
        if (e.post) a.post = [e.post.pot, packStacks(e.post.stacks), packBets(e.post.bets)];
        if (e.ov != null) a.ov = e.ov;
        if (e.hero) a.hero = e.hero;
        return a;
      }
      if (e.k === 'e') {
        var x = {};
        Object.keys(e).forEach(function(k) { x[k] = k === 'stacks' ? packStacks(e.stacks) : e[k]; });
        return x;
      }
      return e;
    });
    if (so && !_keysEq(so, names)) out._so = so;
    return out;
  }
  function _unpack(pk) {
    if (!pk || !Array.isArray(pk.ev)) return pk;
    var names = _pnames(pk), so = Array.isArray(pk._so) ? pk._so : names;
    var out = {}, street = 'preflop';
    Object.keys(pk).forEach(function(k) { if (k !== 'ev' && k !== '_so') out[k] = pk[k]; });
    out.ev = pk.ev.map(function(e) {
      if (!e) return e;
      if (e.k === 's') { if (e.st) street = e.st; return e; }
      if (e.k === 'a') {
        var p = Array.isArray(e.pre) ? e.pre : [], q = Array.isArray(e.post) ? e.post : [];
        return { k: 'a', st: Object.prototype.hasOwnProperty.call(e, 'st') ? e.st : street, n: e.n, act: e.act, amt: e.amt, lbl: e.lbl != null ? e.lbl : null,
          pre: { pot: p[0], cb: p[1], have: p[2], stack: p[3], sbc: p[4], lr: p.length > 6 && p[6] != null ? p[6] : null,
            pfa: p.length > 7 && p[7] != null ? p[7] : null, reopened: p.length > 8 ? p[8] : true, live: p[5] },
          post: { pot: q[0], stacks: _unpackMap(q[1], so), bets: _unpackMap(q[2], names) },
          ov: e.ov != null ? e.ov : null, hero: e.hero || false };
      }
      if (e.k === 'e') {
        var x = {};
        Object.keys(e).forEach(function(k) { x[k] = k === 'stacks' ? _unpackMap(e.stacks, so) : e[k]; });
        return x;
      }
      return e;
    });
    return out;
  }

  function current() { return _cur; }
  function last() { return _last; }
  function get(id) {
    if (id == null) return null;
    if (_cur && _cur.id === id) return _cur;
    if (_last && _last.id === id) return _last;
    var items = _items();
    for (var i = items.length - 1; i >= 0; i--) if (items[i] && items[i].id === id) return _unpack(items[i]);
    return null;
  }
  function _summary(log) {
    if (!log) return null;
    var e = null;
    for (var i = log.ev.length - 1; i >= 0; i--) if (log.ev[i].k === 'e') { e = log.ev[i]; break; }
    var result = 'none';
    if (e) result = (e.folded && e.folded.Hero) ? 'fold' : ((e.payouts && e.payouts.Hero > 0) ? 'win' : 'loss');
    var s = { id: log.id, date: log.t0, mode: log.mode, heroPos: log.heroPos, heroCards: (log.hole && log.hole.Hero) || [], result: result };
    if (log.hiddenUntil) s.hiddenUntil = log.hiddenUntil;
    return s;
  }
  // 저장된(끝난) 핸드 머리 요약, 최신이 앞. 저장에 실패한 직전 핸드(_last)는 메모리에서 맨 앞에 둔다
  function list() {
    var items = _items(), out = [], seen = {};
    if (_last && _last.id) { out.push(_summary(_last)); seen[_last.id] = true; }
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      if (!it || !it.id || seen[it.id]) continue;
      seen[it.id] = true;
      out.push(_summary(it));
    }
    return out;
  }
  // 숨김 테이블 로그를 세션 끝 뒤 열 수 있게 한다(세션 요약이 부른다). sid가 null이면 전부. 바꾼 로그 수(메모리와 저장소, 같은 로그는 1)
  function releaseHidden(sid) {
    var n = 0, done = {};
    [_cur, _last].forEach(function(l) {
      if (l && l.hiddenUntil && (sid == null || l.sid === sid)) { delete l.hiddenUntil; done[l.id] = true; n++; }
    });
    var m = _load(), dirty = false;
    m.items.forEach(function(it, i) {
      if (it && it.hiddenUntil && (sid == null || it.sid === sid)) { delete it.hiddenUntil; m.strs[i] = JSON.stringify(it); dirty = true; if (!done[it.id]) n++; }
    });
    if (dirty) _write(m);
    return n;
  }
  // 테스트용: 메모리(현재, 직전, 저장소 미러)와 저장소 키를 비운다(앱은 부르지 않는다)
  function _reset() {
    _cur = null; _last = null; _mem = null;
    var ls = _ls();
    if (ls) { try { ls.removeItem(KEY); } catch (e) {} }
  }

  function _testSetCur(log) { _cur = log || null; }   // 테스트용(성능 측정에서 끝 전 로그를 바꿔 넣는다)

  var api = { KEY: KEY, CAP: CAP, begin: begin, villain: villain, hero: hero, street: street, note: note, end: end,
    current: current, last: last, get: get, list: list, releaseHidden: releaseHidden, _summary: _summary, _reset: _reset,
    _pack: _pack, _unpack: _unpack, _items: _items, _save: _save, _testSetCur: _testSetCur };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
