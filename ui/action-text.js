// ui/action-text.js (n2-P0 계약, 설계 원문 docs/NEXT2_DESIGN.md 6.1절 2번)
// 액션 한 줄 문구, 아이콘, 색 클래스(순수). 핸드 로그 이벤트(HandLog ev)와 엔진 villainActions 모양을 둘 다 받는다.
//   line(ev, ctx): 액션 'UTG 레이즈 2.5bb', '나(BTN) 콜 2.5bb', 'CO 폴드', 'SB 올인 97.5bb'(라벨 3벳, 4벳, 올인 우선)
//                  스트리트 '플랍 A♥ 7♣ 2♦ (팟 9.5bb)'(Cards.colorize로 색을 입힐 수 있는 글자), 끝 '쇼다운, Mike 승 +12.5bb(투페어)',
//                  메모 '💰 자동 리바이 +87.5bb'. ctx = { log } | { players: {이름: {pos}} } | { pos: {이름: 'BTN'} }(이름 → 포지션)
//   icon(act): ▲ bet, raise, 3bet, 4bet / ● call / ✓ check / ✕ fold / ⚡ allin
//   cls(act): act-aggr, act-call, act-check, act-fold, act-allin
//   kor(act): 폴드, 체크, 콜, 벳, 레이즈, 3벳, 4벳, 올인
// 규약: 로드 때 DOM 접근 없음, 가운뎃점과 긴줄표 없음.
var ActionText = (function() {
  var KOR = { fold: '폴드', check: '체크', call: '콜', bet: '벳', raise: '레이즈', '3bet': '3벳', '4bet': '4벳', allin: '올인' };
  var ICON = { fold: '✕', check: '✓', call: '●', bet: '▲', raise: '▲', '3bet': '▲', '4bet': '▲', allin: '⚡' };
  var CLS = { fold: 'act-fold', check: 'act-check', call: 'act-call', bet: 'act-aggr', raise: 'act-aggr', '3bet': 'act-aggr', '4bet': 'act-aggr', allin: 'act-allin' };
  var LABEL_ACT = { '3벳': '3bet', '4벳': '4bet', '올인': 'allin' };
  var STREET = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버', showdown: '쇼다운' };
  var SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };

  function _act(a) { a = String(a == null ? '' : a); return KOR[a] ? a : ''; }
  function kor(act) { return KOR[_act(act)] || ''; }
  function icon(act) { return ICON[_act(act)] || ''; }
  function cls(act) { return CLS[_act(act)] || ''; }

  // bb 숫자: 소수 1자리, 정수면 소수점 없이(2.5, 3, 97.5)
  function fmt(v) {
    var n = Math.round((Number(v) || 0) * 10) / 10;
    return (n % 1 === 0) ? String(n) : n.toFixed(1);
  }
  function _signed(v) { var n = Math.round((Number(v) || 0) * 10) / 10; return (n > 0 ? '+' : n < 0 ? '-' : '±') + fmt(Math.abs(n)); }

  function _card(c) {
    if (!c) return '';
    var r, s;
    if (typeof c === 'string') { r = c.slice(0, -1); s = c.slice(-1); }
    else { r = c.rank; s = c.suit; }
    if (r === 'T') r = '10';
    return String(r || '') + (SYM[s] || '');
  }

  function _posOf(name, ctx) {
    if (!ctx || !name) return '';
    if (ctx.pos && ctx.pos[name]) return ctx.pos[name];
    var pl = (ctx.log && ctx.log.players) || ctx.players;
    if (Array.isArray(pl)) { for (var i = 0; i < pl.length; i++) if (pl[i] && pl[i].name === name) return pl[i].pos || ''; return ''; }
    if (pl && pl[name]) return pl[name].pos || '';
    return '';
  }
  function _who(name, ctx) {
    var pos = _posOf(name, ctx);
    if (name === 'Hero') return pos ? '나(' + pos + ')' : '나';
    return pos || String(name || '');
  }
  // 이벤트에서 표시용 액션 키: 라벨(3벳, 4벳, 올인)이 있으면 그쪽
  function actKey(ev) {
    if (!ev) return '';
    var a = _act(ev.act != null ? ev.act : ev.action);
    var lb = ev.lbl != null ? ev.lbl : ev.label;
    if (lb && LABEL_ACT[lb] && a !== 'fold' && a !== 'check' && a !== 'call') return LABEL_ACT[lb];
    return a;
  }

  function line(ev, ctx) {
    if (!ev || typeof ev !== 'object') return '';
    var k = ev.k || (ev.action != null ? 'a' : '');
    if (k === 'a') {
      var name = ev.n != null ? ev.n : ev.name;
      var a = actKey(ev);
      var amt = ev.amt != null ? ev.amt : ev.amount;
      var tail = (a && a !== 'fold' && a !== 'check' && Number(amt) > 0) ? ' ' + fmt(amt) + 'bb' : '';
      return _who(name, ctx) + ' ' + (KOR[a] || '액션') + tail;
    }
    if (k === 's') {
      var cards = (ev.board || []).map(_card).filter(Boolean);
      var nb = cards.length, st = STREET[ev.st] || (nb >= 5 ? '리버' : nb === 4 ? '턴' : nb >= 3 ? '플랍' : '프리플랍');
      // 새로 깔린 카드만 쓰지 않고 보드 전체를 적는다(줄 하나로 상황이 읽히게)
      return st + (cards.length ? ' ' + cards.join(' ') : '') + (ev.pot != null ? ' (팟 ' + fmt(ev.pot) + 'bb)' : '');
    }
    if (k === 'e') {
      var w = ev.winner, pay = ev.payouts || {};
      var wn = (w === 'Hero') ? '나' : String(w || '');
      var net = (w != null && pay[w] != null) ? ' ' + _signed(pay[w]) + 'bb' : '';
      var desc = (ev.desc && w != null && ev.desc[w]) ? '(' + ev.desc[w] + ')' : (ev.showdown ? '' : '(모두 폴드)');
      return (ev.showdown ? '쇼다운, ' : '') + (wn ? wn + ' 승' : '핸드 끝') + net + desc;
    }
    if (k === 'n') {
      if (ev.kind === 'rebuy') {
        var who = ev.name && ev.name !== 'Hero' ? _who(ev.name, ctx) + ' ' : '';
        return '💰 ' + who + (ev.manual ? '' : '자동 ') + '리바이 +' + fmt(ev.add) + 'bb';
      }
      return String(ev.text || '');
    }
    return '';
  }

  var api = { line: line, icon: icon, cls: cls, kor: kor, fmt: fmt, actKey: actKey, KOR: KOR };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
