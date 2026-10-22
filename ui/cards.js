// ui/cards.js (P0 구현, 클라우드 H가 확장. 설계 원문 docs/NEXT_BATCH_DESIGN.md 7절 R8)
// 카드와 무늬 기호를 그리는 공용 헬퍼. 무늬 기호 렌더가 table.js, scene-render.js, puzzle-ui.js 등 여러 곳에 흩어져
// red/black 2색만 쓰던 것을 한 곳으로 모은다. 색은 css/cards.css의 :root 토큰(--suit-*-light, --suit-*-dark).
//   Cards.html(card, { tag:'div'|'span', cls, hero, box })
//     → '<div class="card <cls> red|black" data-suit="s" role="img" aria-label="스페이드 10"><span class="card-rank">10</span><span class="card-pip">♠</span></div>'
//     red/black 클래스는 기존 카드 CSS(.card.red, .card.black)와 4색 덱(html.four-color .card[data-suit])을 그대로 쓰기 위해 남긴다.
//     랭크와 무늬를 따로 감싸(card-rank .95em, card-pip 1.15em, css/cards.css) 2색 모드에서도 무늬 모양으로 구분한다. textContent는 '10♠' 그대로.
//     hero: true면 'hero-card'(금테) 클래스를 붙인다. cls는 공백으로 나뉜 클래스 이름(영숫자, -, _)만 받는다.
//     box: false면 기본 클래스를 'card'(흰 카드 상자) 대신 'card-face'로 쓴다. 자기 상자 CSS를 가진 작은 카드(퍼즐 pz-card, 운 미터 hs-card)가
//       색 규칙(red/black, 4색 덱 토큰)만 가져다 쓰는 용도. 색은 .card와 같은 토큰(흰 바탕 --suit-*-light).
//   Cards.glyph(card, { cls }) → '<span class="suit" data-suit="s">10♠</span>'(어두운 배경 글자용, 늘 4색). cls는 뒤에 덧붙는 클래스(기록 hist-card 등).
//   Cards.colorize(escapedText) → 이미 이스케이프된 문자열 안의 '(10|[2-9TJQKA])([♠♥♦♣])'와 단독 무늬 기호를
//     <span class="suit" data-suit="x">로 감싼다. 태그 안(속성)과 이미 감싼 .suit 구간은 건드리지 않는다(두 번 불러도 같다).
//     글자는 그대로 둔다(T♠는 T♠, 10♠는 10♠).
//   Cards.name(card) → '스페이드 10'(화면 읽기 프로그램용 이름)
//   card 입력: { rank, suit } 객체 또는 문자열('Ts', '10s', 'As'). 랭크 'T'는 화면에 '10'으로 쓴다. 잘못된 입력은 '' 반환.
// 규약: 로드 시 DOM 접근 없음, 순수 문자열 함수만. 시그니처는 고정(P0 인자는 그대로, H는 opts 키와 glyph의 opts만 더했다).
var Cards = (function() {
  var SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  var BY_SYM = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };
  var SUIT_KOR = { s: '스페이드', h: '하트', d: '다이아몬드', c: '클로버' };
  var RED = { h: true, d: true };
  var RANK_OK = /^(?:[2-9TJQKA]|10)$/;

  // 입력 정규화 → { rank:'T'|'A'..., suit:'s'|'h'|'d'|'c' } | null
  function _parse(card) {
    var rank = null, suit = null;
    if (card && typeof card === 'object') { rank = card.rank; suit = card.suit; }
    else if (typeof card === 'string') {
      var m = /^(10|[2-9TJQKAtjqka])([shdcSHDC]|[♠♥♦♣])$/.exec(card.trim());
      if (!m) return null;
      rank = m[1]; suit = m[2];
    } else return null;
    rank = String(rank == null ? '' : rank).toUpperCase();
    if (rank === '10') rank = 'T';
    suit = String(suit == null ? '' : suit);
    if (BY_SYM[suit]) suit = BY_SYM[suit];
    suit = suit.toLowerCase();
    if (!RANK_OK.test(rank) || !SYM[suit]) return null;
    return { rank: rank, suit: suit };
  }
  function _rankText(r) { return r === 'T' ? '10' : r; }
  function _cls(cls) {
    return String(cls == null ? '' : cls).split(/\s+/).filter(function(c) { return /^[A-Za-z0-9_-]+$/.test(c); }).join(' ');
  }

  function name(card) {
    var p = _parse(card);
    return p ? SUIT_KOR[p.suit] + ' ' + _rankText(p.rank) : '';
  }

  // 카드 안 글자: 랭크와 무늬를 따로 감싼다(크기 규칙은 css/cards.css .card-rank, .card-pip)
  function _face(p) {
    return '<span class="card-rank">' + _rankText(p.rank) + '</span><span class="card-pip">' + SYM[p.suit] + '</span>';
  }

  function html(card, opts) {
    var p = _parse(card);
    if (!p) return '';
    opts = opts || {};
    var tag = opts.tag === 'span' ? 'span' : 'div';
    var cls = [opts.box === false ? 'card-face' : 'card'];
    var extra = _cls(opts.cls);
    if (extra) cls.push(extra);
    if (opts.hero) cls.push('hero-card');
    cls.push(RED[p.suit] ? 'red' : 'black');
    return '<' + tag + ' class="' + cls.join(' ') + '" data-suit="' + p.suit + '" role="img" aria-label="' + name(p) + '">' +
      _face(p) + '</' + tag + '>';
  }

  function glyph(card, opts) {
    var p = _parse(card);
    if (!p) return '';
    var extra = _cls(opts && opts.cls);
    return '<span class="suit' + (extra ? ' ' + extra : '') + '" data-suit="' + p.suit + '">' + _rankText(p.rank) + SYM[p.suit] + '</span>';
  }

  // 글자 구간 하나에 감싸기 적용(태그 없음이 보장된 텍스트)
  var GLYPH_RE = /(10|[2-9TJQKA])?([♠♥♦♣])/g;
  function _wrapText(t) {
    return t.replace(GLYPH_RE, function(all, r, s) {
      return '<span class="suit" data-suit="' + BY_SYM[s] + '">' + (r || '') + s + '</span>';
    });
  }
  // 이미 이스케이프된 HTML 문자열: 태그와 글자로 나눠, data-suit가 붙은 요소(.suit 글자, Cards.html 카드) 밖의 글자에만 적용한다.
  // 태그 안(속성 값)은 건드리지 않고, 두 번 불러도 결과가 같다.
  var VOID = { br: 1, img: 1, hr: 1, input: 1, meta: 1, link: 1, wbr: 1, source: 1, area: 1, col: 1, embed: 1, track: 1, param: 1, base: 1 };
  function colorize(escaped) {
    var s = String(escaped == null ? '' : escaped);
    if (!/[♠♥♦♣]/.test(s)) return s;
    var parts = s.split(/(<[^>]*>)/);
    var out = '', stack = [], skip = 0;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p) continue;
      var tm = /^<(\/?)([A-Za-z][A-Za-z0-9-]*)\b[^>]*>$/.exec(p);
      if (tm) {
        out += p;
        var tag = tm[2].toLowerCase();
        if (tm[1]) {
          // 닫는 태그: 같은 이름이 나올 때까지 꺼낸다(짝이 안 맞는 HTML도 무너지지 않게)
          for (var j = stack.length - 1; j >= 0; j--) {
            if (stack[j].tag === tag) { while (stack.length > j) { if (stack.pop().suit) skip--; } break; }
          }
        } else if (!VOID[tag] && !/\/>$/.test(p)) {
          var isSuit = /\sdata-suit\s*=/.test(p);
          stack.push({ tag: tag, suit: isSuit });
          if (isSuit) skip++;
        }
        continue;
      }
      out += skip > 0 ? p : _wrapText(p);
    }
    return out;
  }

  var api = { html: html, glyph: glyph, colorize: colorize, name: name, SYM: SYM, SUIT_KOR: SUIT_KOR, _parse: _parse };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
