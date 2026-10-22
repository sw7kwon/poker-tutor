// ui/range-notes.js (P0 스텁을 로컬 G5 RANGE LAB이 채움. 설계 원문 docs/NEXT_BATCH_DESIGN.md '1+' 절)
// 레인지 차트 칸 설명(RangeNotes): 손 분류와 분류별 이유 문장, 자리와 상황 설명. 차트 말풍선(G4, typeof 가드로 호출)과
// 레인지 학습실(journey/views/range-lab.js)이 같이 쓴다.
// 계약(P0 고정, 시그니처와 분류 이름은 바꾸지 않는다):
//   category(label) → 'pair'|'suited-ace'|'suited-broadway'|'offsuit-broadway'|'suited-connector'|'suited-gapper'|'offsuit-ace'|
//     'offsuit-other'|'suited-other' | null(모르는 표기). label은 GtoChart.comboLabel 표기('AA', 'AKs', 'AKo').
//     판정 순서: 페어 → 두 장 모두 T 이상이면 브로드웨이(수딧/오프수트) → A가 있으면 에이스(수딧/오프수트) →
//     수딧이면 숫자 차이 1 커넥터, 2~3 개퍼(한 칸, 두 칸 떨어짐), 그 밖 suited-other → 오프수트 나머지 offsuit-other.
//   explain(label, ctx{ pos, facing, opener, limpers, action, w, std }) → { title, why:[문장 2개], tag, cat } | null
//     title 예 'KJs, 수딧 브로드웨이'. why[0]은 분류 이유(손 모양에서 늘 맞는 사실), why[1]은 이 칸의 액션(차트 기준) + 짧은 까닭.
//     tag = 라벨 종류 키: 'chart'(이 앱 차트 기준, 기본) | 'chart-std'(표준 차트 기준, ctx.std가 참일 때). TAG_TEXT로 글자를 얻는다.
//     facing 값은 GtoChart 모델과 같다: false(오픈), true(상대 오픈에 대응), 'vs3bet', 'vs4bet', 'cold3bet'. ctx.limpers > 0이면 아이솔.
//   CATS{ 분류: 한국어 이름 }, TAG_TEXT{ 키: 글자 }
// G5 추가(읽기 전용 도우미, 전부 순수):
//   posNote(ctx{ pos, facing, opener, limpers }) → 이 자리와 상황이 왜 그렇게 넓거나 좁은지 1~2문장(학습실 머리글, 말풍선 꼬리).
//   kindText(ctx) → 상황 이름('오픈(앞 전원 폴드)', 'BTN 오픈에 대응', '3벳을 맞음', ...). actionWord(action, ctx) → 그 칸의 액션 낱말
//     ('오픈 레이즈', '3벳', '4벳', '5벳 올인', '아이솔 레이즈', '콜', '체크', '폴드'). ACT_KOR{ raise, call, fold }.
//   opensAt(label) → 이 앱 오픈 표에서 그 손을 처음 여는 자리('UTG'|'HJ'|'CO'|'BTN') | null. RFI_SEQ = 그 순서.
// 문장 규칙: 해요체, 초보 눈높이, 가운뎃점과 긴줄표 금지, 수치를 새로 만들지 않는다(빈도는 ctx.w에서만). 차트가 이 앱 기준이라는
//   것은 라벨(TAG_TEXT)로 보이고 문장 안에서 '표준'을 단정하지 않는다.
// 오픈 폴드 칸의 "어느 자리부터 여는지"는 엔진(Gto.gtoAction, typeof 가드, 읽기만)으로 그때그때 판정한다. 이 앱 오픈 표는
//   UTG ⊂ HJ ⊂ CO ⊂ BTN, CO ⊂ SB ⊂ BTN(tests/j-range-lab.test.js 11이 고정)이라 "X부터 열어요"가 한 자리로 정해진다.
//   분류 경향(TREND)은 오픈 표 이야기라 오픈과 림퍼 뒤(아이솔) 폴드 칸에만 붙인다. 엔진이 없으면 일반 문장으로 돌아간다.
// RL 추가(클라우드 작업 RL, 설명의 질과 양. 전부 순수, 읽기만):
//   situationOf(ctx) → 상황 키 7종 'rfi'|'vsRfi'|'bbDef'(BB가 상대 오픈을 맞음)|'vs3bet'|'vs4bet'|'cold3bet'|'iso'. SITS = 키 순서, SIT_NAME 한국어.
//   reason(label, ctx) → { sit, cat, basis:['승률','위치',...], text:[문장 2~3개], edge: 한 줄|null, mistake: 한 줄 } | null
//     text[0] = 분류 x 상황의 바탕 문장(DEEP[sit][cat].base), 그 뒤는 그 칸의 액션 문장(DEEP[sit][cat][action], 없으면 GENERIC[sit][action]).
//     액션 문장은 차트 판정(ctx.action)과 같은 낱말만 쓴다(레이즈 계열, 콜 또는 체크, 폴드 또는 접어요). tests/j-range-lab.test.js 13이 169칸 x 7상황을 검사.
//     edge = 경계 손(같은 줄에서 이웃 칸의 판정이 다른 칸)에만 붙는 "왜 여기서 선이 그어지나" 한 줄. 줄(lane)은 페어 줄, 수딧 X 줄, 오프수트 X 줄.
//     이웃 판정은 ctx.actionOf(label)(학습실이 모델에서 넘김)로, 없으면 엔진(Gto, typeof 가드)으로 판정한다. 엔진도 없으면 null.
//   explain()의 결과에 deep(= reason 결과)이 붙는다. why 배열 모양(2문장)은 그대로(P0 계약).
//   lanes() → [{ key:'p'|'sA'..|'oA'.., name:'페어'|'수딧 A'|'오프수트 A', cells:[강한 순] }], laneOf(label) → 그 줄 | null
//   rules(labels) → { items:[{ lane, name, from, to, text }], text:'페어 전부, 수딧 A 전부, 수딧 K는 K9s까지, ...' } 칸 집합을 줄별 연속 구간으로 압축.
//   expandRules(items) → 칸 배열(줄에서 from..to를 다시 펼침). tests 14: expandRules(rules(S).items) = S.
//   EDGE_WHY{ 분류: 선이 그어지는 까닭 }, BASIS 근거 이름 5개.
// 규약: 로드 시 DOM 접근 없음. 순수 함수만.
var RangeNotes = (function() {
  var ORDER = 'AKQJT98765432';
  var CATS = {
    'pair': '포켓 페어', 'suited-ace': '수딧 에이스', 'suited-broadway': '수딧 브로드웨이', 'offsuit-broadway': '오프수트 브로드웨이',
    'suited-connector': '수딧 커넥터', 'suited-gapper': '수딧 개퍼', 'offsuit-ace': '오프수트 에이스',
    'offsuit-other': '오프수트 기타', 'suited-other': '수딧 기타'
  };
  var TAG_TEXT = { 'chart': '이 앱 차트 기준', 'chart-std': '표준 차트 기준(참고)' };
  // 분류 이유(손 모양에서 늘 맞는 사실)
  var WHY = {
    'pair': '같은 숫자 두 장이라 이미 원페어예요. 플랍에서 같은 숫자가 한 장 더 나오면 셋이 되어 아주 강해져요.',
    'suited-broadway': '높은 카드 두 장에 무늬가 같아요. 탑페어, 플러시, 스트레이트를 모두 노릴 수 있어요.',
    'offsuit-broadway': '높은 카드 두 장이라 탑페어가 되면 킥커가 좋아요. 무늬가 달라 플러시는 기대하기 어려워요.',
    'suited-ace': '에이스에 무늬가 같아요. 플러시가 되면 가장 높은 플러시이고, 에이스가 맞으면 탑페어예요.',
    'offsuit-ace': '에이스 한 장에 낮은 킥커예요. 에이스가 맞아도 더 좋은 킥커의 에이스에게 지기 쉬워요.',
    'suited-connector': '이어진 숫자에 무늬가 같아요. 스트레이트와 플러시를 함께 노릴 수 있어 플랍에서 뒤집을 힘이 있어요.',
    'suited-gapper': '한두 칸 떨어진 숫자에 무늬가 같아요. 스트레이트가 되는 길이 커넥터보다 적어요.',
    'suited-other': '무늬는 같지만 숫자가 멀리 떨어져 있어요. 플러시 말고는 기대가 적어요.',
    'offsuit-other': '무늬가 다르고 숫자도 낮거나 떨어져 있어요. 맞아도 약한 경우가 많아요.'
  };
  // 분류별 짧은 꼬리말: 왜 이 분류가 자리에 따라 들어오고 빠지는지(차트 기준의 일반 경향)
  var TREND = {
    'pair': '페어는 뒤쪽 자리로 갈수록 작은 숫자까지 들어와요.',
    'suited-broadway': '수딧 브로드웨이는 거의 모든 자리에서 들어오는 기본 손이에요.',
    'offsuit-broadway': '오프수트 브로드웨이는 높은 두 장(AK, AQ, KQ)부터 들어오고 낮은 조합은 뒤쪽 자리에서만 들어와요.',
    'suited-ace': '수딧 에이스는 뒤쪽 자리로 갈수록 낮은 킥커까지 들어와요.',
    'offsuit-ace': '오프수트 에이스는 킥커가 높은 것부터 차례로 들어와요.',
    'suited-connector': '수딧 커넥터는 뒤쪽 자리에서 낮은 숫자까지 들어와요.',
    'suited-gapper': '수딧 개퍼는 커넥터보다 늦게, 뒤쪽 자리에서 들어와요.',
    'suited-other': '수딧 기타는 킹이나 퀸이 붙은 것부터 뒤쪽 자리에서 조금씩 들어와요.',
    'offsuit-other': '오프수트 기타는 대부분 폴드예요. 버튼에서도 높은 조합만 들어와요.'
  };
  var WHEEL = { '5': 1, '4': 1, '3': 1, '2': 1 };
  var ACT_KOR = { raise: '레이즈', call: '콜', fold: '폴드' };
  var POS_ORDER = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var POS_NAME = { UTG: '맨 앞 자리', HJ: '앞에서 두 번째 자리', CO: '버튼 바로 앞', BTN: '버튼', SB: '스몰 블라인드', BB: '빅 블라인드' };
  // 오픈 상황의 자리 설명(왜 이 자리는 이만큼 여는가)
  var RFI_NOTE = {
    UTG: '맨 앞 자리라 뒤에 다섯 명이 남아요. 누가 강한 손을 들었을지 몰라 좋은 손만 열어요.',
    HJ: '앞에서 두 번째 자리예요. 뒤에 네 명이 남아 아직 좁게 열어요.',
    CO: '버튼 바로 앞이에요. 뒤에 세 자리만 남아 꽤 넓게 열 수 있어요.',
    BTN: '가장 좋은 자리예요. 플랍 뒤 늘 마지막에 행동하니 가장 넓게 열어요.',
    SB: '뒤에 BB 한 명만 남았지만 플랍 뒤에는 내가 가장 먼저 행동해요. 그래서 버튼보다는 조금 좁게 열어요.',
    BB: '이미 1bb를 냈어요. 앞에서 아무도 들어오지 않으면 그냥 체크로 플랍을 봐요.'
  };

  // 'AKs' → { hi:'A', lo:'K', kind:'s'|'o'|'p' } | null
  function _parse(label) {
    var s = String(label == null ? '' : label).trim();
    var m = /^([AKQJT98765432])([AKQJT98765432])([so]?)$/.exec(s);
    if (!m) return null;
    var a = m[1], b = m[2];
    if (a === b) return m[3] ? null : { hi: a, lo: b, kind: 'p' };
    if (!m[3]) return null;
    if (ORDER.indexOf(a) > ORDER.indexOf(b)) { var t = a; a = b; b = t; }
    return { hi: a, lo: b, kind: m[3] };
  }
  function _broad(r) { return ORDER.indexOf(r) <= ORDER.indexOf('T'); }

  function category(label) {
    var p = _parse(label);
    if (!p) return null;
    if (p.kind === 'p') return 'pair';
    var suited = p.kind === 's';
    if (_broad(p.hi) && _broad(p.lo)) return suited ? 'suited-broadway' : 'offsuit-broadway';
    if (p.hi === 'A') return suited ? 'suited-ace' : 'offsuit-ace';
    if (!suited) return 'offsuit-other';
    var gap = ORDER.indexOf(p.lo) - ORDER.indexOf(p.hi);
    if (gap === 1) return 'suited-connector';
    if (gap === 2 || gap === 3) return 'suited-gapper';
    return 'suited-other';
  }

  function _pct(x) { return Math.round(Math.max(0, Math.min(1, Number(x) || 0)) * 100); }
  function _pos(c) { return (c && c.pos) ? String(c.pos) : ''; }
  function _late(p) { return p === 'CO' || p === 'BTN' || p === 'SB'; }

  // 엔진 오픈 판정(읽기만): 이 손을 pos에서 여는지. 엔진이 없거나 실패하면 null
  var RFI_SEQ = ['UTG', 'HJ', 'CO', 'BTN'];
  function _cards(p) {
    return [{ rank: p.hi, suit: 's' }, { rank: p.lo, suit: p.kind === 's' ? 's' : 'h' }];   // GtoChart.comboCards와 같은 대표 카드
  }
  function _opens(pos, p) {
    if (typeof Gto === 'undefined' || !Gto || typeof Gto.gtoAction !== 'function') return null;
    try { return Gto.gtoAction(pos, _cards(p)) === 'raise'; } catch (e) { return null; }
  }
  // 오픈 상황 폴드 칸: 어느 자리부터 여는지(엔진으로 판정). 반환 문장은 '이 자리에서 열기에는 약해요.' 뒤에 붙는다
  function _rfiFoldNote(pos, p) {
    var i = RFI_SEQ.indexOf(pos), q, r;
    if (pos === 'BTN') return '가장 넓게 여는 자리에서도 표 밖인 손이에요.';
    if (pos === 'SB') {
      r = _opens('BTN', p);
      if (r === null) return '가장 넓게 여는 자리에서도 표 밖인 손이에요.';
      return r ? '버튼에서는 열지만 SB는 플랍 뒤 가장 먼저 행동해서 조금 좁게 열어요.' : '버튼에서도 열지 않는 손이에요.';
    }
    if (i < 0) return '뒤쪽 자리에서는 들어올 수도 있어요.';
    for (q = i + 1; q < RFI_SEQ.length; q++) {
      r = _opens(RFI_SEQ[q], p);
      if (r === null) return '뒤쪽 자리에서는 들어올 수도 있어요.';
      if (r) return '뒤쪽 자리 ' + RFI_SEQ[q] + '부터는 열어요.';
    }
    return '버튼에서도 열지 않는 손이에요.';
  }

  // 상황 이름
  function kindText(ctx) {
    var c = ctx || {}, f = c.facing;
    if (c.limpers > 0) return _pos(c) === 'BB' ? '림퍼 뒤(체크 또는 레이즈)' : '림퍼 ' + c.limpers + '명 뒤(아이솔)';
    if (f === 'vs3bet') return _pos(c) === 'BB' ? '림퍼 뒤 내 레이즈에 3벳을 맞음' : '내 오픈에 3벳을 맞음';
    if (f === 'vs4bet') return '내 3벳에 4벳을 맞음';
    if (f === 'cold3bet') return '앞에서 오픈과 3벳이 나옴(콜드 3벳 직면)';
    if (f === true) return c.opener ? c.opener + ' 오픈에 대응' : '상대 오픈에 대응';
    return '오픈(앞 전원 폴드)';
  }

  // 그 칸의 액션 낱말
  function actionWord(action, ctx) {
    var c = ctx || {}, f = c.facing;
    if (action === 'raise') {
      if (c.limpers > 0) return '아이솔 레이즈';
      if (f === true) return '3벳';
      if (f === 'vs3bet' || f === 'cold3bet') return '4벳';
      if (f === 'vs4bet') return '5벳 올인';
      return '오픈 레이즈';
    }
    if (action === 'call') return (c.limpers > 0 && _pos(c) === 'BB') ? '체크' : '콜';
    if (action === 'fold') return '폴드';
    return '';
  }

  // 이 자리와 상황이 왜 이만큼 넓거나 좁은지
  function posNote(ctx) {
    var c = ctx || {}, pos = _pos(c), f = c.facing;
    if (c.limpers > 0) {
      if (pos === 'BB') return 'BB는 체크가 공짜예요. 아주 강한 손만 레이즈하고 나머지는 체크로 플랍을 봐요.';
      var base = '앞에서 림프(콜만)한 사람이 있어요. 림퍼는 보통 약해서, 오픈 표의 손으로 레이즈해 둘만 남게(아이솔) 해요.';
      return c.limpers >= 2 ? base + ' 림퍼가 둘 이상이면 여럿이 따라오기 쉬워 한 칸 앞 자리 표로 좁혀요.' : base;
    }
    if (f === 'vs3bet') {
      if (pos === 'BB') return 'BB는 오픈이 없어서, 림퍼 뒤에 레이즈했다가 3벳을 맞은 경우예요. 아주 강한 손은 4벳, 플랍을 볼 만한 손은 콜, 나머지는 폴드해요.';
      return '내가 오픈했는데 3벳을 맞았어요. 아주 강한 손은 4벳, 플랍을 볼 만한 손은 콜, 나머지는 폴드해요.';
    }
    if (f === 'vs4bet') return '내 3벳에 4벳이 돌아왔어요. 상대가 아주 강하다고 말한 셈이라 최고 손만 올인하고 그다음 손만 콜해요.';
    if (f === 'cold3bet') return '내가 아직 아무것도 안 했는데 앞에서 오픈과 3벳이 다 나왔어요. 두 명이 강하다고 말했으니 최고 손만 참여해요.';
    if (f === true) {
      if (pos === 'SB') return 'SB는 콜하면 뒤에 BB가 남고 플랍 뒤에는 가장 먼저 행동해요. 그래서 콜 없이 3벳 아니면 폴드예요.';
      if (pos === 'BB' && _late(c.opener)) return '뒤쪽 자리(' + c.opener + ') 오픈은 넓은 편이라 BB도 넓게 막아요. 이미 낸 1bb 덕에 콜 값이 싸요.';
      if (pos === 'BB') return '앞쪽 자리(' + (c.opener || 'UTG') + ') 오픈은 좁고 강해요. BB는 콜 값이 싸지만 좋은 손만 받아요.';
      var tail = pos === 'BTN' ? ' 버튼은 플랍 뒤 마지막에 행동해서 콜로 받는 손이 가장 넓어요.' : '';
      return '상대가 먼저 레이즈했어요. 그보다 강한 손은 3벳, 플랍에서 싸울 만한 손은 콜, 나머지는 폴드예요.' + tail;
    }
    return RFI_NOTE[pos] || '앞에서 아무도 들어오지 않았어요. 자리가 뒤로 갈수록 더 넓게 열어요.';
  }

  // 블러프 성격의 레이즈 후보: 낮은 수딧 에이스(A5s~A2s), 낮은 수딧 커넥터와 개퍼(9 이하), 수딧 기타. 값이 아니라 접게 하려는 3벳(4벳)이라 문장이 다르다
  function _bluffy(cat, p) {
    if (!p) return false;
    if (cat === 'suited-ace') return !!WHEEL[p.lo];
    if (cat === 'suited-connector' || cat === 'suited-gapper') return ORDER.indexOf(p.hi) >= ORDER.indexOf('9');
    return cat === 'suited-other';
  }
  // 림퍼 뒤 BB 체크 칸 중 레이즈도 정답인 손(엔진 Gto.vsLimpAlt, CO 오픈 표). 엔진이 없으면 false
  function _bbAlt(p) {
    if (!p || typeof Gto === 'undefined' || !Gto || typeof Gto.vsLimpAlt !== 'function') return false;
    try { return Gto.vsLimpAlt('BB', _cards(p)) === 'raise'; } catch (e) { return false; }
  }

  // 이 칸의 액션 문장(차트 기준). 빈도 숫자는 ctx.w에서만 쓴다. p = _parse(label)(오픈 폴드 칸과 BB 체크 칸의 엔진 판정용)
  function _actionLine(ctx, cat, p) {
    var c = ctx || {}, pos = _pos(c), f = c.facing;
    var where = pos ? '이 자리(' + pos + ')에서는 ' : '이 상황에서는 ';
    var w = c.w && typeof c.w === 'object' ? c.w : null;
    if (w) {
      var parts = ['raise', 'call', 'fold'].filter(function(k) { return Number(w[k]) > 0.0001; })
        .map(function(k) { return ACT_KOR[k] + ' ' + _pct(w[k]) + '%'; });
      if (parts.length > 1) return where + parts.join(', ') + '로 섞어요. 경계에 있는 손이라 한 가지로 정해져 있지 않아요.';
    }
    var a = c.action;
    if (a === 'raise') {
      var verb = (c.limpers > 0) ? '림퍼 뒤에 레이즈(아이솔)해요.'
        : f === true ? '3벳해요.' : (f === 'vs3bet' || f === 'cold3bet') ? '4벳해요.' : f === 'vs4bet' ? '5벳 올인해요.' : '오픈 레이즈해요.';
      var tail = '', bluff = _bluffy(cat, p);
      if (!f && !(c.limpers > 0) && RFI_NOTE[pos]) tail = ' ' + RFI_NOTE[pos];
      else if (f === true) tail = bluff
        ? ' 강해서 하는 3벳이 아니라 상대를 접게 하려는 3벳(블러프)이에요. 콜을 받아도 플러시나 스트레이트를 노릴 수 있어 가끔 섞어요.'
        : ' 상대 오픈 레인지보다 강한 쪽이라 먼저 힘을 보여요.';
      else if (f === 'vs3bet' || f === 'cold3bet') tail = bluff
        ? (cat === 'suited-ace'
          ? ' 강해서 하는 4벳이 아니라 접게 하려는 4벳(블러프)이에요. 에이스를 들고 있어 상대가 AA, AK일 가능성이 줄고, 접히면 바로 이겨요.'
          : ' 강해서 하는 4벳이 아니라 접게 하려는 4벳(블러프)이에요. 접히면 바로 이기고, 콜을 받아도 플러시나 스트레이트를 노려요.')
        : ' 3벳 레인지와도 싸울 수 있는 손이에요.';
      else if (f === 'vs4bet') tail = ' 4벳까지 온 상대에게도 밀리지 않는 최고 손이에요.';
      else if (c.limpers > 0) tail = ' 림퍼보다 강한 손으로 팟을 키우고 둘만 남게 해요.';
      return where + verb + tail;
    }
    if (a === 'call') {
      if (c.limpers > 0 && pos === 'BB') return where + '체크해요. 체크는 공짜라 플랍을 보고 판단해요.' + (_bbAlt(p) ? ' CO 오픈 표 안의 손이라 레이즈(아이솔)해도 괜찮아요.' : '');
      if (f === 'vs3bet') return where + '콜해요. 4벳은 과하지만 접기엔 아까워 플랍을 봐요.';
      if (f === 'vs4bet') return where + '콜해요. 올인까지 가기엔 부족하지만 접을 수 없는 강한 손이에요.';
      if (f === 'cold3bet') return where + '콜해요. 두 사람이 강하다고 했으니 플랍을 보고 조심스럽게 가요.';
      if (f === true) return where + '콜해요. 3벳할 만큼은 아니지만 플랍에서 싸울 가치가 있어요.' + (pos === 'BB' ? ' 이미 낸 1bb 덕에 콜 값이 싸요.' : '');
      return where + '콜해요.';
    }
    if (a === 'fold') {
      var why, open = !f;   // 오픈과 림퍼 뒤(아이솔)는 오픈 표 이야기라 분류 경향(TREND)을 붙인다
      if (c.limpers > 0) why = '림퍼를 상대로 레이즈할 만큼은 아니고, 콜로 따라가는 손은 이 앱 차트에 없어요.';
      else if (f === true && pos === 'SB') why = 'SB는 콜하면 뒤에 BB가 남고 플랍 뒤 가장 먼저 행동해서 콜 없이 3벳 아니면 폴드예요. 3벳할 만큼 강하지 않아 접어요.';
      else if (f === true || f === 'cold3bet') why = '상대가 먼저 힘을 보였으니 이 손으로는 물러나요.';
      else if (f === 'vs3bet' || f === 'vs4bet') why = '내가 먼저 레이즈했어도 더 큰 레이즈가 돌아오면 약한 쪽은 접어요.';
      else if (pos === 'BTN' || pos === 'SB') why = p ? _rfiFoldNote(pos, p) : '가장 넓게 여는 자리에서도 표 밖인 손이에요.';
      else why = '이 자리에서 열기에는 약해요. ' + (p ? _rfiFoldNote(pos, p) : '뒤쪽 자리에서는 들어올 수도 있어요.');
      return where + '폴드해요. ' + why + (open && cat && TREND[cat] ? ' ' + TREND[cat] : '');
    }
    return '';
  }

  function explain(label, ctx) {
    var cat = category(label);
    if (!cat) return null;
    var p = _parse(label);
    var why = [WHY[cat]];
    if (cat === 'suited-ace' && WHEEL[p.lo]) why[0] += ' 낮은 카드는 A-2-3-4-5 스트레이트에도 쓰여요.';
    var act = _actionLine(ctx, cat, p);
    if (act) why.push(act);
    var tag = (ctx && ctx.std) ? 'chart-std' : 'chart';
    var deep = null;
    try { deep = reason(label, ctx); } catch (e) { deep = null; }
    return { title: String(label).trim() + ', ' + CATS[cat], why: why, tag: tag, cat: cat, deep: deep };
  }

  // ── RL: 깊은 설명(분류 9종 x 상황 7종) ───────────────────────────────────────────
  var SITS = ['rfi', 'vsRfi', 'bbDef', 'vs3bet', 'vs4bet', 'cold3bet', 'iso'];
  var SIT_NAME = { rfi: '오픈', vsRfi: '상대 오픈에 대응', bbDef: 'BB 방어', vs3bet: '3벳을 맞음', vs4bet: '4벳을 맞음', cold3bet: '콜드 3벳 직면', iso: '림퍼 뒤(아이솔)' };
  var BASIS = ['승률', '블로커', '플레이 가능성', '위치', '스택 깊이'];
  function situationOf(ctx) {
    var c = ctx || {}, f = c.facing;
    if (c.limpers > 0) return 'iso';
    if (f === 'vs3bet' || f === 'vs4bet' || f === 'cold3bet') return f;
    if (f === true) return _pos(c) === 'BB' ? 'bbDef' : 'vsRfi';
    return 'rfi';
  }
  // 분류 x 상황: base(바탕 1문장), raise/call/fold(그 액션일 때 1~2문장), mistake(흔한 실수 1줄), basis(근거).
  // 액션 문장은 그 액션 낱말만 쓴다. 림퍼 뒤 call은 BB 체크(차트가 콜 색을 빌려 쓴다). 상황에 없는 조합은 GENERIC이 메운다.
  var DEEP = {
    rfi: {
      'pair': { basis: ['승률', '위치'],
        base: '페어는 플랍에서 셋을 맞히면 큰 팟을 이기고, 못 맞혀도 오버카드가 적으면 원페어로 버텨요.',
        raise: '이 자리에서 열 만큼 숫자가 높은 페어예요. 뒤에 남은 사람 수를 생각해도 먼저 레이즈해서 팟을 가져갈 힘이 있어요.',
        fold: '작은 페어는 셋을 못 맞히면 오버카드가 늘 깔려 힘이 없어요. 앞쪽 자리에서는 뒤에 사람이 많아 접고, 뒤쪽 자리에서만 열어요.',
        mistake: '작은 페어를 자리와 상관없이 늘 여는 실수예요. 앞자리에서 22를 열면 뒤에 다섯 명이 남아 쉽게 밀려요.' },
      'suited-ace': { basis: ['승률', '플레이 가능성'],
        base: '수딧 에이스는 가장 높은 플러시를 노리고, 에이스가 맞으면 탑페어가 돼요.',
        raise: '이 자리에서는 이 수딧 에이스를 열어요. 플러시와 탑페어 두 길이 있어 콜을 받아도 플랍에서 할 일이 많아요.',
        fold: '킥커가 낮은 수딧 에이스는 에이스가 맞아도 킥커 싸움에서 지기 쉬워요. 뒤에 사람이 많은 자리에서는 접고, 뒤쪽 자리에서 열어요.',
        mistake: '수딧 에이스는 무조건 연다고 외우는 실수예요. UTG와 HJ에서는 킥커가 낮은 것은 접어요.' },
      'suited-broadway': { basis: ['승률', '플레이 가능성'],
        base: '수딧 브로드웨이는 탑페어, 플러시, 스트레이트를 모두 노릴 수 있는 기본 손이에요.',
        raise: '어느 자리에서든 열어요. 뒤에 사람이 많아도 높은 두 장이라 맞으면 대부분 앞서요.',
        mistake: '수딧 브로드웨이를 콜로만 들어가는 실수예요. 앞에서 아무도 안 들어왔으면 먼저 레이즈해서 주도권을 잡아요.' },
      'offsuit-broadway': { basis: ['승률', '위치'],
        base: '오프수트 브로드웨이는 탑페어 킥커 싸움에서 이기는 손이지만, 플러시가 없어 뒤집을 길이 적어요.',
        raise: '이 조합은 두 장이 높아서 이 자리에서도 열어요. 맞으면 킥커로 이기고, 안 맞으면 쉽게 접을 수 있어요.',
        fold: '낮은 쪽 오프수트 브로드웨이는 맞아도 더 좋은 킥커에게 지기 쉬워요. 앞쪽 자리에서는 접고, 뒤쪽 자리에서 열어요.',
        mistake: '오프수트 브로드웨이를 수딧처럼 넓게 치는 실수예요. UTG에서는 KJo, QJo, JTo를 접어요.' },
      'suited-connector': { basis: ['플레이 가능성', '위치'],
        base: '수딧 커넥터는 스트레이트와 플러시를 함께 노려서 플랍에서 뒤집을 힘이 있어요.',
        raise: '이 자리에서는 이 수딧 커넥터를 열어요. 높은 숫자일수록 앞자리에서도 열고, 낮은 숫자는 뒤쪽 자리에서만 열어요.',
        fold: '수딧 커넥터는 맞을 때 크게 이기지만 자주 맞지는 않아요. 이 자리에서 이 숫자는 아직 표 밖이라 접어요.',
        mistake: '수딧 커넥터면 다 열린다고 생각하는 실수예요. UTG는 수딧 커넥터를 하나도 열지 않고, 낮은 숫자는 버튼과 SB에서만 열어요.' },
      'suited-gapper': { basis: ['플레이 가능성', '위치'],
        base: '수딧 개퍼는 커넥터보다 스트레이트 길이 적지만, 뒤쪽 자리에서는 열 만큼 가치가 있어요.',
        raise: '이 자리에서는 이 수딧 개퍼를 열어요. 위치가 좋아 플랍을 보고 싸게 결정할 수 있어요.',
        fold: '수딧 개퍼는 커넥터보다 늦게, 뒤쪽 자리에서만 들어와요. 이 자리에서 이 손은 아직 표 밖이에요.',
        mistake: '한 칸 떨어진 손을 커넥터와 같이 취급하는 실수예요. J9s는 CO부터, 커넥터 JTs는 모든 자리에서 열어요.' },
      'suited-other': { basis: ['플레이 가능성', '위치'],
        base: '수딧 기타는 플러시 말고는 기대가 적어서, 뒤쪽 자리에서 킹이나 퀸이 붙은 것부터 조금씩 들어와요.',
        raise: '이 자리에서는 이 손을 열어요. 위치가 좋고 상대가 적어서 플러시 가능성 하나로도 레이즈할 값어치가 있어요.',
        fold: '이 자리에서 이 손은 표 밖이에요. 무늬만 같고 숫자가 떨어져 있어 맞아도 약해요.',
        mistake: '무늬만 같으면 다 된다고 여기는 실수예요. K9s는 CO부터, K5s는 버튼과 SB에서, 낮은 Q나 J 수딧은 버튼에서만 열어요.' },
      'offsuit-ace': { basis: ['승률', '위치'],
        base: '오프수트 에이스는 에이스가 맞아도 킥커가 낮아 더 좋은 에이스에게 지기 쉬워요.',
        raise: '이 자리에서는 이 오프수트 에이스를 열어요. 뒤에 남은 사람이 적어 에이스 한 장으로도 자주 이겨요.',
        fold: '이 자리에서는 접어요. 에이스가 맞아도 킥커 싸움에서 지기 쉬워 뒤쪽 자리에서만 열어요.',
        mistake: '에이스만 보이면 어디서든 여는 실수예요. A9o부터 아래는 버튼과 SB에서만 열어요.' },
      'offsuit-other': { basis: ['승률', '위치'],
        base: '오프수트 기타는 무늬도 다르고 숫자도 낮아서 대부분 폴드예요.',
        raise: '이 자리에서는 이 높은 조합을 열어요. 뒤에 남은 사람이 적어 접히는 일이 많고, 맞으면 높은 킥커로 싸워요.',
        fold: '이 손은 접어요. 맞아도 약하고 뒤집을 길도 없어, 버튼에서도 높은 조합만 열어요.',
        mistake: '그림 카드 하나에 기대 오프수트 기타를 여는 실수예요. K8o, Q8o는 버튼에서도 접어요.' }
    },
    vsRfi: {
      'pair': { basis: ['승률', '위치'],
        base: '상대가 먼저 레이즈했을 때 페어는 숫자에 따라 역할이 갈려요.',
        raise: '높은 페어는 상대 오픈 레인지보다 앞서는 손이라 3벳으로 팟을 키워요. 콜을 받아도 대부분 앞서 있어요.',
        call: '중간과 작은 페어는 3벳하기엔 부족하지만, 콜해서 셋을 노리면 맞았을 때 크게 이겨요. 싸게 플랍을 보는 값어치가 있어요.',
        fold: '이 자리에서 이 페어는 접어요. 콜해서 셋을 노리기에는 뒤에 남은 사람이나 위치가 불리해 손해가 커요.',
        mistake: '작은 페어를 3벳하거나 반대로 아무 자리에서나 콜하는 실수예요. 셋 노리기 콜은 뒤에 사람이 적고 위치가 좋을 때만 해요.' },
      'suited-ace': { basis: ['블로커', '플레이 가능성'],
        base: '수딧 에이스는 에이스 블로커 덕에 상대가 AA나 AK일 가능성을 줄이고, 플러시로 뒤집을 수도 있어요.',
        raise: '낮은 수딧 에이스는 접게 하려는 3벳(블러프)으로 섞어요. 에이스 블로커가 있고, 콜을 받아도 플러시와 스트레이트 길이 남아요.',
        call: '이 수딧 에이스는 콜로 플랍을 봐요. 3벳할 만큼 강하진 않지만 플러시와 탑페어 가능성이 있어 접기엔 아까워요.',
        fold: '이 자리에서 이 수딧 에이스는 접어요. 콜하기엔 킥커가 약하고 블러프 3벳은 몇 장만 골라 하니, 나머지는 물러나요.',
        mistake: '수딧 에이스를 전부 3벳하거나 전부 콜하는 실수예요. 3벳은 A5s, A4s 같은 낮은 것만 골라 하고, 콜은 자리가 좋을수록 넓어져요.' },
      'suited-broadway': { basis: ['승률', '플레이 가능성'],
        base: '수딧 브로드웨이는 상대 오픈 레인지와 맞붙어도 승률이 나쁘지 않고, 플랍 뒤에도 할 일이 많아요.',
        raise: '이 수딧 브로드웨이는 3벳이에요. 상대 오픈 레인지보다 강한 쪽이라 먼저 팟을 키우고, 콜을 받아도 플러시와 탑페어로 싸워요.',
        call: '이 수딧 브로드웨이는 콜이에요. 3벳하기엔 조금 모자라지만 탑페어와 플러시 가능성이 있어 플랍을 볼 가치가 있어요.',
        fold: '이 자리에서 이 손은 접어요. 콜하기엔 상대 레인지에 밀리고, 3벳하기엔 약해요.',
        mistake: '수딧 브로드웨이를 자리와 상관없이 전부 콜하는 실수예요. HJ처럼 앞쪽 자리에서는 KTs, QTs도 접고, SB는 콜 없이 3벳 아니면 폴드예요.' },
      'offsuit-broadway': { basis: ['승률', '위치'],
        base: '오프수트 브로드웨이는 킥커로 이기는 손이지만 플러시가 없어, 상대 오픈을 콜하기엔 조심스러워요.',
        raise: 'AKo처럼 가장 높은 오프수트 브로드웨이는 3벳이에요. 상대 오픈 레인지보다 앞서고, 접게 해도 좋아요.',
        call: '이 손은 콜이에요. 3벳하기엔 부족하지만 위치가 좋아 탑페어를 맞히면 킥커로 이길 수 있어요.',
        fold: '이 자리에서는 접어요. 무늬가 달라 뒤집을 길이 적고, 맞아도 더 좋은 킥커에게 질 수 있어 상대 오픈을 받기엔 약해요.',
        mistake: '오프수트 브로드웨이를 수딧처럼 넓게 콜하는 실수예요. KJo, QJo 콜은 버튼처럼 위치가 좋을 때만 해요.' },
      'suited-connector': { basis: ['플레이 가능성', '위치'],
        base: '수딧 커넥터는 상대 오픈을 콜해서 플랍에서 뒤집는 데 쓰는 손이에요.',
        call: '위치가 좋으면 수딧 커넥터로 콜해요. 스트레이트와 플러시를 맞히면 상대의 높은 페어를 이겨 크게 받아요.',
        fold: '이 자리에서 이 커넥터는 접어요. 자주 맞지 않는 손이라 위치나 숫자가 받쳐 주지 않으면 콜 값이 아까워요.',
        mistake: '수딧 커넥터로 3벳 블러프를 아무 데서나 하는 실수예요. 이 앱 차트에서 커넥터는 콜 아니면 폴드예요.' },
      'suited-gapper': { basis: ['플레이 가능성', '위치'],
        base: '수딧 개퍼는 커넥터보다 약해서 상대 오픈에는 버튼에서만 몇 장 콜해요.',
        call: '버튼이라 콜해요. 플랍 뒤 늘 마지막에 행동하니 싸게 보고 맞으면 크게 받을 수 있어요.',
        fold: '이 자리에서는 접어요. 커넥터보다 스트레이트 길이 적어 상대 오픈을 콜하기엔 모자라요.',
        mistake: '개퍼를 커넥터처럼 넓게 콜하는 실수예요. 버튼이 아니면 전부 접어요.' },
      'suited-other': { basis: ['플레이 가능성', '위치'],
        base: '수딧 기타는 플러시 하나만 보고 들어가는 손이라 상대 오픈에는 버튼에서만 조금 콜해요.',
        call: '버튼이라 콜해요. 위치가 가장 좋아 플러시 드로우를 싸게 보고, 안 맞으면 쉽게 물러날 수 있어요.',
        fold: '이 자리에서는 접어요. 무늬만 같고 숫자가 떨어져 상대 오픈을 받기엔 약해요.',
        mistake: '같은 무늬 K나 Q를 아무 자리에서나 콜하는 실수예요. 버튼 말고는 접어요.' },
      'offsuit-ace': { basis: ['승률', '위치'],
        base: '오프수트 에이스는 상대 오픈 레인지의 에이스에게 킥커로 지기 쉬워요.',
        call: '버튼에서는 A9o를 콜해요. 위치가 가장 좋아 맞았을 때 조심스럽게 받을 수 있어요.',
        fold: '이 자리에서는 접어요. 에이스가 맞아도 더 좋은 킥커에게 지는 일이 많아 콜 값이 아까워요.',
        mistake: '에이스 하나만 보고 상대 오픈을 콜하는 실수예요. 버튼의 A9o 말고는 전부 접어요.' },
      'offsuit-other': { basis: ['승률'],
        base: '오프수트 기타는 상대 오픈을 받기엔 너무 약해요.',
        fold: '접어요. 맞아도 약하고 뒤집을 길이 없어, 어느 자리에서도 상대 오픈을 받지 않아요.',
        mistake: '버튼에서 열 수 있는 손이라고 상대 오픈까지 콜하는 실수예요. 여는 손과 받는 손은 달라요.' }
    },
    bbDef: {
      'pair': { basis: ['승률', '위치'],
        base: 'BB는 이미 1bb를 냈고 마지막에 말하니 콜 값이 싸서, 페어는 거의 다 지켜요.',
        raise: '높은 페어는 3벳이에요. 상대 오픈 레인지보다 앞서니 팟을 키우고, 뒤 자리 없이 둘이서 싸우게 해요.',
        call: '중간과 작은 페어는 콜해요. 싼 값에 플랍을 보고 셋을 맞히면 크게 받아요.',
        mistake: '작은 페어를 BB에서 접는 실수예요. 콜 값이 싸고 셋 한 번이면 본전이 넘어요.' },
      'suited-ace': { basis: ['블로커', '플레이 가능성'],
        base: '수딧 에이스는 에이스 블로커와 플러시 가능성이 있어 BB 방어의 단골이에요.',
        raise: '이 수딧 에이스는 3벳이에요. 높은 것은 값으로, 낮은 것(A5s~A3s)은 블로커를 살린 블러프로 섞어요.',
        call: '이 수딧 에이스는 콜이에요. 싼 값에 플랍을 보고 플러시나 탑페어를 노려요.',
        mistake: '수딧 에이스를 전부 3벳하는 실수예요. 중간 킥커(A8s~A6s)는 콜로 받아요.' },
      'suited-broadway': { basis: ['승률', '플레이 가능성'],
        base: '수딧 브로드웨이는 BB에서 넓게 지키는 손이고, 높은 것은 3벳까지 해요.',
        raise: '이 손은 3벳이에요. 상대 오픈 레인지보다 강하고 플러시와 탑페어로 플랍 뒤에도 싸울 수 있어요.',
        call: '이 손은 콜이에요. 3벳하기엔 조금 모자라지만, 싼 값에 플랍을 보면 탑페어와 플러시로 이길 길이 많아요.',
        mistake: 'KQs, QJs를 앞자리 오픈에도 3벳하는 실수예요. 앞자리 오픈은 레인지가 강해서 콜로 받아요.' },
      'offsuit-broadway': { basis: ['승률', '위치'],
        base: '오프수트 브로드웨이는 BB에서 높은 것만 지키고, 상대 자리가 뒤쪽일수록 더 넓게 받아요.',
        raise: '이 손은 3벳이에요. 상대 오픈 레인지보다 킥커가 앞서서 팟을 키울 수 있어요.',
        call: '이 손은 콜이에요. 플러시는 없지만 콜 값이 싸고 탑페어를 맞히면 킥커로 이겨요.',
        fold: '앞자리 오픈에는 이 손을 접어요. 상대 레인지가 강해 맞아도 더 좋은 킥커에게 지기 쉬워요.',
        mistake: 'QJo, JTo를 앞자리 오픈에도 콜하는 실수예요. 뒤쪽 자리 오픈에만 받아요.' },
      'suited-connector': { basis: ['플레이 가능성'],
        base: '수딧 커넥터는 BB에서 싸게 플랍을 보고 뒤집기 좋은 손이에요.',
        raise: '76s, 65s는 뒤쪽 자리 오픈에 블러프 3벳으로 섞어요. 접히면 바로 이기고, 콜을 받아도 스트레이트와 플러시 길이 있어요.',
        call: '이 커넥터는 콜이에요. 1bb를 이미 냈으니 싼 값에 플랍을 보고 맞으면 크게 받아요.',
        fold: '가장 낮은 커넥터는 접어요. 스트레이트가 돼도 낮은 쪽이 되기 쉽고 하이카드 힘이 없어요.',
        mistake: '커넥터면 32s까지 다 받는 실수예요. 맨 아래 커넥터는 접어요.' },
      'suited-gapper': { basis: ['플레이 가능성'],
        base: '수딧 개퍼는 BB에서 콜 값이 싸니 높은 것부터 받아요.',
        call: '이 개퍼는 콜이에요. 싼 값에 플랍을 보고 스트레이트나 플러시를 노려요.',
        fold: '이 개퍼는 접어요. 숫자가 낮거나 간격이 커서 싼 콜이라도 플랍에서 이길 길이 적어요.',
        mistake: '개퍼를 커넥터처럼 전부 받는 실수예요. 앞자리 오픈에는 Q9s, J9s, T8s, 97s만 받아요.' },
      'suited-other': { basis: ['플레이 가능성', '위치'],
        base: '수딧 기타는 뒤쪽 자리 오픈에만 콜 값이 싸다는 이유로 조금 받아요.',
        call: '이 손은 콜이에요. 1bb를 이미 내서 콜 값이 싸고, 플러시 길이 있어 플랍을 볼 만해요.',
        fold: '이 손은 접어요. 콜 값이 싸도 맞을 길이 적어 앞자리 오픈에는 거의 다 접고, 뒤쪽 오픈에도 가장 낮은 것은 접어요.',
        mistake: '같은 무늬면 BB에서 다 받는 실수예요. 앞자리 오픈에는 K9s 하나만 받아요.' },
      'offsuit-ace': { basis: ['승률', '위치'],
        base: '오프수트 에이스는 BB에서 뒤쪽 자리 오픈에만 받아요.',
        call: '뒤쪽 자리 오픈이라 콜해요. 상대 레인지가 넓어 에이스 하이로도 자주 앞서고 콜 값이 싸요.',
        fold: '앞자리 오픈에는 접어요. 상대 레인지에 높은 에이스가 많아 맞아도 킥커로 지기 쉬워요.',
        mistake: '에이스가 있다고 앞자리 오픈까지 받는 실수예요. UTG, HJ 오픈에는 ATo부터 받아요.' },
      'offsuit-other': { basis: ['위치'],
        base: '오프수트 기타는 BB에서 뒤쪽 자리 오픈에만 높은 것을 받아요.',
        call: '뒤쪽 자리 오픈이라 콜해요. 상대 레인지가 넓고 콜 값이 싸서 높은 킥커로도 플랍을 볼 만해요.',
        fold: '이 손은 접어요. 콜 값이 싸도 맞을 길이 적어 손해가 더 커요.',
        mistake: '콜 값이 싸다고 BB에서 아무 손이나 받는 실수예요. 뒤쪽 오픈에도 K7o, Q8o, J8o, T8o, 98o, 87o까지만 받아요.' }
    },
    vs3bet: {
      'pair': { basis: ['승률', '스택 깊이'],
        base: '3벳을 맞으면 페어는 숫자에 따라 4벳, 콜, 폴드로 갈려요.',
        raise: '높은 페어는 4벳이에요. 상대의 3벳 레인지와 싸워도 앞서니 팟을 더 키워요.',
        call: '이 페어는 콜이에요. 4벳하기엔 모자라지만 셋을 맞히면 큰 팟을 이기고, 100bb 스택이면 콜 값이 아깝지 않아요.',
        fold: '이 페어는 접어요. 3벳 레인지를 상대로 셋만 노리기엔 콜 값이 커서 손해예요.',
        mistake: 'JJ, TT 같은 중간 페어로 4벳하는 실수예요. 앞자리에서는 콜로 받고 뒤쪽 자리에서만 4벳해요.' },
      'suited-ace': { basis: ['블로커'],
        base: '수딧 에이스는 3벳을 맞으면 에이스 블로커 덕에 4벳 블러프 후보가 되지만, 콜로 받기엔 약해요.',
        raise: '버튼에서 A5s, A4s는 접게 하려는 4벳(블러프)이에요. 에이스 블로커로 상대가 AA, AK일 가능성이 줄고, 접히면 바로 이겨요.',
        fold: '이 수딧 에이스는 접어요. 3벳 레인지를 콜로 받기엔 킥커가 약하고, 블러프 4벳은 버튼에서 두 장만 해요.',
        mistake: '수딧 에이스로 3벳을 콜하는 실수예요. 이 앱 차트에서 수딧 에이스는 3벳을 콜하지 않아요.' },
      'suited-broadway': { basis: ['승률', '플레이 가능성'],
        base: '수딧 브로드웨이는 3벳 레인지와도 싸울 수 있어, 높은 것은 4벳하고 나머지는 콜하거나 접어요.',
        raise: '이 손은 4벳이에요. 3벳 레인지와 싸워도 밀리지 않고, 접히면 바로 이겨요.',
        call: '이 손은 콜이에요. 4벳은 과하지만 수딧이라 플러시와 탑페어 길이 있어 플랍을 볼 만해요.',
        fold: '이 손은 접어요. 3벳 레인지를 상대로는 탑페어를 맞혀도 지기 쉬워 콜 값이 아까워요.',
        mistake: 'KQs, QJs를 앞자리에서 4벳하는 실수예요. 버튼 말고는 K나 Q로 시작하는 수딧 브로드웨이는 콜 아니면 폴드예요.' },
      'offsuit-broadway': { basis: ['승률', '블로커'],
        base: '오프수트 브로드웨이는 3벳을 맞으면 AKo 말고는 대부분 접어요.',
        raise: 'AKo는 4벳이에요. 에이스와 킹 블로커로 상대가 AA, KK일 가능성이 줄고, 콜을 받아도 싸울 수 있어요.',
        call: '버튼에서는 이 손을 콜해요. 위치가 가장 좋아 플랍을 보고 결정할 수 있어요.',
        fold: '이 손은 접어요. 3벳 레인지에는 더 좋은 킥커가 많아 맞아도 지기 쉬워요.',
        mistake: 'AQo로 3벳을 4벳하는 실수예요. AQo는 버튼에서 콜, 다른 자리에서는 폴드예요.' },
      'suited-connector': { basis: ['플레이 가능성', '스택 깊이'],
        base: '수딧 커넥터는 3벳을 맞으면 접어요.',
        fold: '접어요. 콜 값이 커서 스트레이트나 플러시를 맞힐 때까지 버티기엔 손해가 커요.',
        mistake: '수딧 커넥터로 3벳을 콜하며 뒤집기를 노리는 실수예요. 100bb에서는 콜 값이 너무 커요.' },
      'suited-gapper': { basis: ['플레이 가능성', '스택 깊이'],
        base: '수딧 개퍼는 3벳을 맞으면 접어요.',
        fold: '접어요. 커넥터보다 약한 손이라 3벳 레인지와 싸울 이유가 없어요.',
        mistake: '개퍼로 3벳을 콜하는 실수예요. 열 수 있다고 3벳까지 받는 손은 아니에요.' },
      'suited-other': { basis: ['플레이 가능성'],
        base: '수딧 기타는 3벳을 맞으면 접어요.',
        fold: '접어요. 플러시 하나만 보고 큰 3벳을 콜하기엔 손해예요.',
        mistake: '같은 무늬 K나 Q로 3벳을 콜하는 실수예요. 열 때와 3벳을 받을 때는 기준이 달라요.' },
      'offsuit-ace': { basis: ['승률'],
        base: '오프수트 에이스는 3벳을 맞으면 접어요.',
        fold: '접어요. 3벳 레인지에는 더 좋은 에이스가 많아 맞아도 킥커로 져요.',
        mistake: '에이스가 있다고 3벳을 콜하는 실수예요. 버튼에서 연 A9o도 3벳을 맞으면 접어요.' },
      'offsuit-other': { basis: ['승률'],
        base: '오프수트 기타는 3벳을 맞으면 접어요.',
        fold: '접어요. 버튼에서 열었더라도 3벳 레인지에는 한참 밀려요.',
        mistake: '열었으니 지켜야 한다고 3벳을 콜하는 실수예요. 오픈은 자주 접히는 걸 기대하고 한 것이라 접어도 손해가 아니에요.' }
    },
    vs4bet: {
      'pair': { basis: ['승률', '스택 깊이'],
        base: '4벳까지 오면 상대 레인지가 아주 좁아서, 페어는 최고 숫자만 올인하고 그다음만 콜해요.',
        raise: '이 페어는 5벳 올인이에요. 4벳 레인지와 싸워도 앞서는 최고 손이라 남은 스택을 다 넣어요.',
        call: '이 페어는 콜이에요. 올인까지 가기엔 부족하지만 접기엔 너무 강해서, 플랍을 보고 결정해요.',
        fold: '이 페어는 접어요. 4벳 레인지에는 더 높은 페어가 많아 셋을 노리기엔 남은 스택이 모자라요.',
        mistake: 'QQ로 4벳에 올인하는 실수예요. 이 앱 차트에서 QQ는 버튼 말고는 콜이에요.' },
      'suited-ace': { basis: ['블로커', '스택 깊이'],
        base: '수딧 에이스는 4벳을 맞으면 접어요.',
        fold: '접어요. 블러프 3벳이 들켰을 뿐이고, 4벳 레인지를 상대로 버틸 승률이 없어요.',
        mistake: '블러프로 3벳한 A5s를 4벳에도 콜하는 실수예요. 접어야 블러프 비용이 작아요.' },
      'suited-broadway': { basis: ['승률', '블로커'],
        base: '수딧 브로드웨이는 4벳을 맞으면 AKs와 버튼의 AQs만 남고 나머지는 접어요.',
        raise: 'AKs는 5벳 올인이에요. 에이스와 킹 블로커로 상대가 AA, KK일 가능성이 줄고, 콜을 받아도 승률이 나쁘지 않아요.',
        call: '이 손은 콜이에요. 올인하기엔 부족하지만 접기엔 아까워서 플랍을 봐요.',
        fold: '이 손은 접어요. 4벳 레인지는 높은 페어 위주라 탑페어를 맞혀도 지기 쉬워요.',
        mistake: 'AJs, KQs로 4벳을 콜하는 실수예요. 3벳까지는 좋은 손이지만 4벳 레인지 앞에서는 한참 밀려요.' },
      'offsuit-broadway': { basis: ['승률', '블로커'],
        base: '오프수트 브로드웨이는 4벳을 맞으면 AKo만 콜하고 나머지는 접어요.',
        call: 'AKo는 콜이에요. 올인하기엔 수딧이 아니라 조금 모자라지만, 블로커가 있어 접지 않아요.',
        fold: '이 손은 접어요. 4벳 레인지에는 더 높은 손만 있어 맞아도 이기기 어려워요.',
        mistake: 'AKo로 4벳에 올인하는 실수예요. 이 앱 차트에서 AKo는 콜이에요.' },
      'suited-connector': { basis: ['스택 깊이'],
        base: '수딧 커넥터는 4벳을 맞으면 접어요.',
        fold: '접어요. 남은 스택에 비해 콜 값이 너무 커서 뒤집을 기회가 없어요.',
        mistake: '수딧 커넥터로 3벳한 뒤 4벳까지 받는 실수예요. 큰 팟일수록 뒤집기 손은 빨리 접어요.' },
      'suited-gapper': { basis: ['스택 깊이'],
        base: '수딧 개퍼는 4벳을 맞으면 접어요.',
        fold: '접어요. 남은 스택에 비해 콜 값이 커서 맞힐 때까지 버틸 수 없어요.',
        mistake: '개퍼로 4벳을 콜하는 실수예요. 뒤집기 손은 4벳 팟에 맞지 않아요.' },
      'suited-other': { basis: ['스택 깊이'],
        base: '수딧 기타는 4벳을 맞으면 접어요.',
        fold: '접어요. 플러시 하나만 보고 4벳을 받기엔 손해가 너무 커요.',
        mistake: '같은 무늬라고 4벳을 콜하는 실수예요.' },
      'offsuit-ace': { basis: ['승률'],
        base: '오프수트 에이스는 4벳을 맞으면 접어요.',
        fold: '접어요. 4벳 레인지의 에이스에게 킥커로 져요.',
        mistake: '에이스만 보고 4벳을 콜하는 실수예요.' },
      'offsuit-other': { basis: ['승률'],
        base: '오프수트 기타는 4벳을 맞으면 접어요.',
        fold: '접어요. 4벳 레인지를 상대로는 이길 길이 없어요.',
        mistake: '여기까지 왔으니 끝까지 간다는 실수예요. 큰 팟일수록 약한 손은 빨리 접어요.' }
    },
    cold3bet: {
      'pair': { basis: ['승률'],
        base: '두 사람이 강하다고 말했으니 페어는 최고 숫자만 4벳하고 그다음만 콜해요.',
        raise: '이 페어는 4벳이에요. 오픈과 3벳 레인지 둘 다를 상대로 앞서는 최고 손이에요.',
        call: '이 페어는 콜이에요. 4벳하기엔 모자라지만 셋을 맞히면 두 사람에게서 크게 받을 수 있어요.',
        fold: '이 페어는 접어요. 두 사람이 강한데 셋만 노리기엔 콜 값이 커요.',
        mistake: '99, 88로 콜드 3벳에 끼어드는 실수예요. 오픈 하나에는 콜해도 되지만 오픈과 3벳에는 접어요.' },
      'suited-ace': { basis: ['블로커'],
        base: '수딧 에이스는 콜드 3벳 앞에서는 접어요.',
        fold: '접어요. 두 사람이 강하다고 말한 팟에 블로커 하나로 끼어들 이유가 없어요.',
        mistake: '에이스 블로커만 믿고 콜드 3벳에 4벳하는 실수예요. 상대가 둘이라 블러프가 잘 안 통해요.' },
      'suited-broadway': { basis: ['승률', '블로커'],
        base: '수딧 브로드웨이는 콜드 3벳 앞에서 AKs만 4벳, AQs만 콜하고 나머지는 접어요.',
        raise: 'AKs는 4벳이에요. 블로커가 있고 두 사람의 레인지와 싸워도 밀리지 않아요.',
        call: 'AQs는 콜이에요. 4벳하기엔 모자라지만 접기엔 아까워 조심스럽게 플랍을 봐요.',
        fold: '이 손은 접어요. 두 사람이 강한데 탑페어로는 이기기 어려워요.',
        mistake: 'AJs, KQs로 콜드 3벳에 끼어드는 실수예요. 오픈 하나에는 좋은 손이지만 둘 앞에서는 접어요.' },
      'offsuit-broadway': { basis: ['승률', '블로커'],
        base: '오프수트 브로드웨이는 콜드 3벳 앞에서 AKo만 4벳하고 나머지는 접어요.',
        raise: 'AKo는 4벳이에요. 에이스와 킹 블로커로 상대들이 AA, KK일 가능성이 줄어요.',
        fold: '이 손은 접어요. 두 사람의 강한 레인지 앞에서는 킥커로도 이기기 어려워요.',
        mistake: 'AQo로 콜드 3벳을 콜하는 실수예요. AQo는 접어요.' },
      'suited-connector': { basis: ['플레이 가능성'],
        base: '수딧 커넥터는 콜드 3벳 앞에서 접어요.',
        fold: '접어요. 상대가 둘이고 팟이 커서 뒤집기 값이 너무 비싸요.',
        mistake: '여럿이 들어와 팟이 크다고 커넥터로 끼어드는 실수예요.' },
      'suited-gapper': { basis: ['플레이 가능성'],
        base: '수딧 개퍼는 콜드 3벳 앞에서 접어요.',
        fold: '접어요. 커넥터보다 약한 손이라 더더욱 끼어들 이유가 없어요.',
        mistake: '개퍼로 큰 팟에 끼어드는 실수예요.' },
      'suited-other': { basis: ['플레이 가능성'],
        base: '수딧 기타는 콜드 3벳 앞에서 접어요.',
        fold: '접어요. 플러시 하나로 두 사람의 강한 레인지와 싸울 수 없어요.',
        mistake: '같은 무늬라고 콜드 3벳에 콜하는 실수예요.' },
      'offsuit-ace': { basis: ['승률'],
        base: '오프수트 에이스는 콜드 3벳 앞에서 접어요.',
        fold: '접어요. 두 사람의 레인지에 더 좋은 에이스가 많아요.',
        mistake: '에이스만 보고 콜드 3벳에 콜하는 실수예요.' },
      'offsuit-other': { basis: ['승률'],
        base: '오프수트 기타는 콜드 3벳 앞에서 접어요.',
        fold: '접어요. 어떤 자리에서도 이 손으로는 끼어들지 않아요.',
        mistake: '팟이 크다고 아무 손이나 끼어드는 실수예요.' }
    },
    iso: {
      'pair': { basis: ['승률', '위치'],
        base: '림퍼는 보통 약해서, 페어는 오픈 표대로 레이즈해 둘만 남게 하면 좋아요.',
        raise: '이 페어는 림퍼 뒤에 레이즈(아이솔)해요. 림퍼보다 강한 손으로 팟을 키우고 둘이서 싸우게 해요.',
        call: 'BB는 체크가 공짜라 이 페어는 체크로 플랍을 봐요. 셋을 맞히면 여럿에게서 크게 받고, 못 맞히면 싸게 물러나요.',
        fold: '이 작은 페어는 접어요. 림퍼 뒤에서 콜로 따라가는 손은 이 앱 차트에 없고, 레이즈하기엔 약해요.',
        mistake: '림퍼 뒤에 작은 페어로 콜만 따라가는 실수예요. BB가 아니면 레이즈하거나 접어요.' },
      'suited-ace': { basis: ['플레이 가능성', '위치'],
        base: '수딧 에이스는 림퍼 뒤에서 오픈 표대로 레이즈하고, 표 밖이면 접어요.',
        raise: '이 수딧 에이스는 레이즈(아이솔)해요. 림퍼보다 강하고 플러시와 탑페어 길이 있어 둘이서 싸우면 유리해요.',
        call: 'BB는 체크가 공짜라 이 수딧 에이스는 체크로 플랍을 봐요. 플러시나 탑페어를 맞히면 그때 팟을 키워요.',
        fold: '이 수딧 에이스는 접어요. 이 자리의 오픈 표 밖이라 림퍼를 상대로도 레이즈하지 않아요.',
        mistake: '림퍼 뒤에 낮은 수딧 에이스로 콜만 하는 실수예요. 표 안이면 레이즈, 밖이면 폴드예요.' },
      'suited-broadway': { basis: ['승률', '위치'],
        base: '수딧 브로드웨이는 림퍼 뒤에서 BB 말고는 어느 자리든 레이즈(아이솔)하는 손이에요.',
        raise: '이 손은 레이즈(아이솔)해요. 림퍼보다 훨씬 강한 손이라 팟을 키우고 둘이서 싸워요.',
        call: 'BB는 체크가 공짜라 이 손은 체크로 플랍을 봐요. CO 오픈 표 안의 손이라 레이즈해도 괜찮아요.',
        mistake: '림퍼 뒤에 KQs, QJs로 콜만 따라가는 실수예요. 여럿이 보는 플랍보다 레이즈해서 둘이 싸우는 편이 나아요.' },
      'offsuit-broadway': { basis: ['승률', '위치'],
        base: '오프수트 브로드웨이는 림퍼 뒤에서 오픈 표대로 레이즈하고, 표 밖이면 접어요.',
        raise: '이 손은 레이즈(아이솔)해요. 림퍼의 약한 손보다 킥커가 앞서서 둘이 싸우면 유리해요.',
        call: 'BB는 체크가 공짜라 이 손은 체크로 플랍을 봐요. CO 오픈 표 안의 손은 레이즈해도 괜찮아요.',
        fold: '이 손은 접어요. 이 자리의 오픈 표 밖이라 림퍼를 상대로도 레이즈하지 않아요.',
        mistake: '림퍼가 약하다고 표 밖의 오프수트 브로드웨이까지 레이즈하는 실수예요. 아이솔도 오픈 표대로 해요.' },
      'suited-connector': { basis: ['플레이 가능성', '위치'],
        base: '수딧 커넥터는 림퍼 뒤에서 오픈 표 안이면 레이즈하고, 밖이면 접어요.',
        raise: '이 커넥터는 레이즈(아이솔)해요. 림퍼를 접게 하거나 둘이서 위치를 살려 싸워요.',
        call: 'BB는 체크가 공짜라 이 커넥터는 체크로 플랍을 봐요. 여럿이 보는 플랍에서 스트레이트나 플러시를 맞히면 크게 받아요.',
        fold: '이 커넥터는 접어요. 콜로 따라가는 손은 이 앱 차트에 없고, 이 자리 오픈 표 밖이라 레이즈도 하지 않아요.',
        mistake: '림퍼 뒤에 수딧 커넥터로 콜만 따라가는 실수예요. 이 앱 차트에는 림퍼 뒤 콜이 없어요.' },
      'suited-gapper': { basis: ['플레이 가능성', '위치'],
        base: '수딧 개퍼는 림퍼 뒤에서 오픈 표 안이면 레이즈하고, 밖이면 접어요.',
        raise: '이 개퍼는 레이즈(아이솔)해요. 위치가 좋은 자리의 오픈 표 안이라 림퍼를 상대로 팟을 키워요.',
        call: 'BB는 체크가 공짜라 이 개퍼는 체크로 플랍을 봐요. 맞으면 싸우고 안 맞으면 그냥 물러나요.',
        fold: '이 개퍼는 접어요. 이 자리 오픈 표 밖이고 림퍼 뒤 콜은 이 앱 차트에 없어요.',
        mistake: '림퍼가 있으면 싸게 본다고 개퍼로 콜하는 실수예요. 표 안이면 레이즈, 밖이면 폴드예요.' },
      'suited-other': { basis: ['플레이 가능성', '위치'],
        base: '수딧 기타는 림퍼 뒤에서 뒤쪽 자리의 오픈 표 안인 것만 레이즈해요.',
        raise: '이 손은 레이즈(아이솔)해요. 이 자리 오픈 표 안이라 림퍼 한둘을 상대로는 레이즈할 수 있어요.',
        call: 'BB는 체크가 공짜라 이 손은 체크로 플랍을 봐요. 플러시가 되면 그때 팟을 키워요.',
        fold: '이 손은 접어요. 무늬만 같고 숫자가 떨어져 림퍼를 상대로도 레이즈할 만큼은 아니에요.',
        mistake: '같은 무늬면 림퍼 뒤에 콜하는 실수예요. 이 앱 차트에는 림퍼 뒤 콜이 없어요.' },
      'offsuit-ace': { basis: ['승률', '위치'],
        base: '오프수트 에이스는 림퍼 뒤에서 오픈 표대로 하니 버튼처럼 넓은 자리에서만 레이즈해요.',
        raise: '이 손은 레이즈(아이솔)해요. 이 자리 오픈 표 안의 손이고 림퍼보다 에이스 하이로 앞서요.',
        call: 'BB는 체크가 공짜라 이 손은 체크로 플랍을 봐요. 에이스가 맞아도 킥커가 낮으니 크게 싸우지 않아요.',
        fold: '이 손은 접어요. 이 자리 오픈 표 밖이고 림퍼 뒤 콜은 이 앱 차트에 없어요.',
        mistake: '림퍼 뒤에 A5o 같은 손으로 콜만 하는 실수예요. 표 밖이면 접어요.' },
      'offsuit-other': { basis: ['승률', '위치'],
        base: '오프수트 기타는 림퍼 뒤에서 거의 접고, BB만 체크로 플랍을 봐요.',
        raise: '이 손은 레이즈(아이솔)해요. 이 자리 오픈 표 안의 높은 조합이라 림퍼를 상대로는 레이즈할 수 있어요.',
        call: 'BB는 체크가 공짜라 이 손은 체크로 플랍을 봐요. 맞아도 약하니 작게 가요.',
        fold: '이 손은 접어요. 맞아도 약하고 림퍼 뒤 콜은 이 앱 차트에 없어요.',
        mistake: '림퍼가 있으면 싸게 보겠다고 아무 손이나 콜하는 실수예요. BB가 아니면 콜 자체가 표에 없어요.' }
    }
  };
  // 상황에 없는 분류 x 액션 조합의 대체 문장(차트가 바뀌어도 설명이 비지 않게)
  var GENERIC = {
    rfi: { raise: '이 자리에서는 이 손을 열어요. 오픈 표 안의 손이에요.', call: '이 자리에서는 콜해요.', fold: '이 자리에서는 접어요. 오픈 표 밖의 손이에요.' },
    vsRfi: { raise: '이 손은 3벳이에요. 상대 오픈 레인지보다 강한 쪽이에요.', call: '이 손은 콜이에요. 플랍에서 싸울 가치가 있어요.', fold: '이 손은 접어요. 상대 오픈을 받기엔 약해요.' },
    bbDef: { raise: '이 손은 3벳이에요. 상대 오픈 레인지보다 강한 쪽이에요.', call: '이 손은 콜이에요. 1bb를 이미 내서 콜 값이 싸요.', fold: '이 손은 접어요. 콜 값이 싸도 받기엔 약해요.' },
    vs3bet: { raise: '이 손은 4벳이에요. 3벳 레인지와도 싸울 수 있어요.', call: '이 손은 콜이에요. 4벳은 과하지만 접기엔 아까워요.', fold: '이 손은 접어요. 3벳 레인지를 상대로는 약해요.' },
    vs4bet: { raise: '이 손은 5벳 올인이에요. 4벳 레인지와 싸워도 앞서요.', call: '이 손은 콜이에요. 올인하기엔 부족하지만 접을 수 없어요.', fold: '이 손은 접어요. 4벳 레인지를 상대로는 약해요.' },
    cold3bet: { raise: '이 손은 4벳이에요. 두 사람의 레인지와 싸워도 앞서요.', call: '이 손은 콜이에요. 조심스럽게 플랍을 봐요.', fold: '이 손은 접어요. 두 사람이 강하다고 말했어요.' },
    iso: { raise: '이 손은 림퍼 뒤에 레이즈(아이솔)해요. 이 자리 오픈 표 안의 손이에요.', call: 'BB는 체크가 공짜라 이 손은 체크로 플랍을 봐요.', fold: '이 손은 접어요. 오픈 표 밖이고 림퍼 뒤 콜은 이 앱 차트에 없어요.' }
  };
  // 경계 손: 왜 여기서 선이 그어지나(분류별 까닭). 앞에 엔진으로 만든 "X까지 ~, Y부터 ~" 문장이 붙는다
  var EDGE_WHY = {
    'pair': '페어는 숫자가 하나 내려갈 때마다 오버카드가 늘어 셋 없이 버티기 어려워져요. 그래서 상황마다 감당할 수 있는 숫자에 선이 그어져요.',
    'suited-ace': '수딧 에이스는 킥커가 한 장 낮아질수록 에이스가 맞아도 킥커 싸움에서 질 확률이 늘어요. 그 손해를 감당할 수 있는 킥커에 선이 그어져요.',
    'suited-broadway': '수딧 브로드웨이 안에서도 두 장의 높이에 따라 승률이 달라요. 상대 레인지와 견줘 앞서는 조합까지만 선이 그어져요.',
    'offsuit-broadway': '오프수트는 플러시가 없어 킥커 싸움으로만 이겨요. 킥커가 한 장 낮아지면 지는 경우가 크게 늘어 그 앞에서 선이 그어져요.',
    'suited-connector': '커넥터는 숫자가 낮을수록 스트레이트가 돼도 낮은 쪽이 되고, 하이카드로 이길 힘도 줄어요. 그래서 숫자에 선이 그어져요.',
    'suited-gapper': '개퍼는 간격이 넓고 숫자가 낮을수록 맞을 길이 줄어요. 위치와 상대 수에 따라 감당할 수 있는 곳에 선이 그어져요.',
    'suited-other': '수딧 기타는 플러시 말고는 기대가 적어, 높은 카드가 붙은 조합까지만 들어와요. 그다음부터는 플러시만으로 콜 값을 못 메워 선이 그어져요.',
    'offsuit-ace': '오프수트 에이스는 킥커가 낮아질수록 에이스가 맞아도 지는 일이 늘어요. 뒤에 남은 사람 수에 따라 킥커에 선이 그어져요.',
    'offsuit-other': '오프수트 기타는 두 장 모두 높아야 조금이라도 싸울 수 있어요. 둘 중 하나라도 낮아지면 선 밖으로 나가요.'
  };

  // ── 줄(lane): 페어 줄, 수딧 X 줄(X가 높은 카드), 오프수트 X 줄. 칸은 강한 순 ──
  var _lanes = null;
  function lanes() {
    if (_lanes) return _lanes;
    var out = [], i, j;
    var pairs = [];
    for (i = 0; i < ORDER.length; i++) pairs.push(ORDER[i] + ORDER[i]);
    out.push({ key: 'p', name: '페어', cells: pairs });
    ['s', 'o'].forEach(function(k) {
      for (i = 0; i < ORDER.length - 1; i++) {
        var cells = [];
        for (j = i + 1; j < ORDER.length; j++) cells.push(ORDER[i] + ORDER[j] + k);
        out.push({ key: k + ORDER[i], name: (k === 's' ? '수딧 ' : '오프수트 ') + ORDER[i], cells: cells });
      }
    });
    _lanes = out;
    return out;
  }
  function laneOf(label) {
    var p = _parse(label);
    if (!p) return null;
    var key = p.kind === 'p' ? 'p' : p.kind + p.hi, ls = lanes();
    for (var i = 0; i < ls.length; i++) if (ls[i].key === key) return ls[i];
    return null;
  }
  function _label(p) { return p.kind === 'p' ? p.hi + p.hi : p.hi + p.lo + p.kind; }
  // 엔진 판정(읽기만): ctx의 상황에서 이 칸의 액션. 엔진이 없으면 null
  function _engineAct(ctx, label) {
    var p = _parse(label);
    if (!p || typeof Gto === 'undefined' || !Gto) return null;
    var c = ctx || {}, pos = _pos(c), f = c.facing, cards = _cards(p);
    try {
      if (c.limpers > 0) { var a = Gto.gtoActionVsLimp(pos, cards, c.limpers); return a === 'check' ? 'call' : a; }
      if (f === 'vs3bet') return Gto.gtoActionVs3bet(pos, cards);
      if (f === 'vs4bet') return Gto.gtoActionVs4bet(pos, cards);
      if (f === 'cold3bet') return Gto.gtoActionVsCold3bet(cards);
      if (f === true) return Gto.gtoActionVsRfi(pos, cards, c.opener);
      return Gto.gtoAction(pos, cards);
    } catch (e) { return null; }
  }
  function _actOf(ctx) {
    var c = ctx || {};
    if (typeof c.actionOf === 'function') return function(l) { try { return c.actionOf(l); } catch (e) { return null; } };
    return function(l) { return _engineAct(c, l); };
  }
  // 받침 유무에 따라 '예요'와 '이에요'
  function _iyeyo(word) {
    var s = String(word || ''), ch = s.charCodeAt(s.length - 1);
    if (ch >= 0xAC00 && ch <= 0xD7A3) return ((ch - 0xAC00) % 28) ? '이에요' : '예요';
    return '예요';
  }
  // 줄 이름 뒤 '는'과 '은'(숫자 줄 3, 6, 7, 8은 받침이 있다. 글자 줄 A, K, Q, J, T는 '는')
  var _EUN = { '3': '은', '6': '은', '7': '은', '8': '은' };
  function _neun(name) { var s = String(name || ''); return _EUN[s.charAt(s.length - 1)] || '는'; }
  // 경계 한 줄: 같은 줄의 이웃 칸과 판정이 다르면 그 선을 말로 적는다. 아니면 null
  function edge(label, ctx) {
    var lane = laneOf(label), cat = category(label);
    if (!lane || !cat) return null;
    var act = _actOf(ctx), i = lane.cells.indexOf(label), a = act(label);
    if (!a || a === 'none') return null;
    var up = i > 0 ? lane.cells[i - 1] : null, dn = i < lane.cells.length - 1 ? lane.cells[i + 1] : null;
    var aUp = up ? act(up) : null, aDn = dn ? act(dn) : null, hi, lo, aHi, aLo;
    if (dn && aDn && aDn !== 'none' && aDn !== a) { hi = label; lo = dn; aHi = a; aLo = aDn; }
    else if (up && aUp && aUp !== 'none' && aUp !== a) { hi = up; lo = label; aHi = aUp; aLo = a; }
    else return null;
    var wHi = actionWord(aHi, ctx) || ACT_KOR[aHi], wLo = actionWord(aLo, ctx) || ACT_KOR[aLo];
    var line = lane.name + _neun(lane.name) + ' ' + hi + '까지 ' + wHi + ', ' + lo + '부터 ' + wLo + _iyeyo(wLo) + '.';
    return { lane: lane.key, name: lane.name, hi: hi, lo: lo, hiAction: aHi, loAction: aLo, text: line + ' ' + EDGE_WHY[cat] };
  }
  // 깊은 설명 묶음
  function reason(label, ctx) {
    var cat = category(label);
    if (!cat) return null;
    var c = ctx || {}, sit = situationOf(c), d = (DEEP[sit] || {})[cat], a = c.action;
    if (!d) return null;
    var text = [d.base];
    var actText = (a === 'raise' || a === 'call' || a === 'fold') ? (d[a] || (GENERIC[sit] || {})[a] || '') : '';
    if (actText) text.push(actText);
    var ed = null;   // 표준 차트(ctx.std)나 혼합 칸(ctx.w)은 엔진 이웃 판정과 다를 수 있어 경계 문장을 붙이지 않는다
    if ((a === 'raise' || a === 'call' || a === 'fold') && !c.std && !(c.w && typeof c.w === 'object')) { try { ed = edge(label, c); } catch (e) { ed = null; } }
    return { sit: sit, sitName: SIT_NAME[sit], cat: cat, basis: d.basis.slice(), text: text, edge: ed ? ed.text : null, edgeInfo: ed, mistake: d.mistake || '' };
  }

  // ── 한 줄 규칙: 칸 집합을 줄별 연속 구간으로 압축 ──
  function rules(labels) {
    var set = {}, items = [];
    (labels || []).forEach(function(l) { if (_parse(l)) set[_label(_parse(l))] = true; });
    lanes().forEach(function(ln) {
      var run = null;
      for (var i = 0; i <= ln.cells.length; i++) {
        var l = ln.cells[i], on = i < ln.cells.length && !!set[l];
        if (on && !run) run = { from: l, to: l, fromI: i, toI: i };
        else if (on) { run.to = l; run.toI = i; }
        if (!on && run) { items.push(_ruleItem(ln, run)); run = null; }
      }
    });
    return { items: items, text: items.map(function(x) { return x.text; }).join(', ') };
  }
  function _ruleItem(ln, run) {
    var n = ln.cells.length, text, nm = ln.name + _neun(ln.name);
    if (run.fromI === 0 && run.toI === n - 1) text = ln.name + ' 전부';
    else if (run.fromI === run.toI) text = nm + ' ' + run.from + '만';
    else if (run.fromI === 0) text = nm + ' ' + run.to + '까지';
    else text = nm + ' ' + run.from + '부터 ' + run.to + '까지';
    return { lane: ln.key, name: ln.name, from: run.from, to: run.to, n: run.toI - run.fromI + 1, top: run.fromI === 0, all: run.fromI === 0 && run.toI === n - 1, text: text };
  }
  function expandRules(items) {
    var out = [], ls = lanes();
    (items || []).forEach(function(it) {
      var ln = null;
      for (var i = 0; i < ls.length; i++) if (ls[i].key === it.lane) ln = ls[i];
      if (!ln) return;
      var a = ln.cells.indexOf(it.from), b = ln.cells.indexOf(it.to);
      if (a < 0 || b < 0) return;
      if (a > b) { var t = a; a = b; b = t; }
      for (var j = a; j <= b; j++) out.push(ln.cells[j]);
    });
    return out;
  }

  // opensAt(label) → 이 앱 오픈 표에서 처음 여는 자리('UTG'|'HJ'|'CO'|'BTN') | null(버튼에서도 안 열거나 엔진 없음). 테스트와 학습실용
  function opensAt(label) {
    var p = _parse(label);
    if (!p) return null;
    for (var i = 0; i < RFI_SEQ.length; i++) { var r = _opens(RFI_SEQ[i], p); if (r === null) return null; if (r) return RFI_SEQ[i]; }
    return null;
  }

  var api = { category: category, explain: explain, posNote: posNote, kindText: kindText, actionWord: actionWord, opensAt: opensAt,
    CATS: CATS, TAG_TEXT: TAG_TEXT, ACT_KOR: ACT_KOR, TREND: TREND, POS_ORDER: POS_ORDER, POS_NAME: POS_NAME, RFI_SEQ: RFI_SEQ, _parse: _parse,
    // RL
    situationOf: situationOf, reason: reason, edge: edge, lanes: lanes, laneOf: laneOf, rules: rules, expandRules: expandRules,
    SITS: SITS, SIT_NAME: SIT_NAME, BASIS: BASIS, EDGE_WHY: EDGE_WHY, DEEP: DEEP, GENERIC: GENERIC };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
