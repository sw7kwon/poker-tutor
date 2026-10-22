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
    return { title: String(label).trim() + ', ' + CATS[cat], why: why, tag: tag, cat: cat };
  }

  // opensAt(label) → 이 앱 오픈 표에서 처음 여는 자리('UTG'|'HJ'|'CO'|'BTN') | null(버튼에서도 안 열거나 엔진 없음). 테스트와 학습실용
  function opensAt(label) {
    var p = _parse(label);
    if (!p) return null;
    for (var i = 0; i < RFI_SEQ.length; i++) { var r = _opens(RFI_SEQ[i], p); if (r === null) return null; if (r) return RFI_SEQ[i]; }
    return null;
  }

  var api = { category: category, explain: explain, posNote: posNote, kindText: kindText, actionWord: actionWord, opensAt: opensAt,
    CATS: CATS, TAG_TEXT: TAG_TEXT, ACT_KOR: ACT_KOR, TREND: TREND, POS_ORDER: POS_ORDER, POS_NAME: POS_NAME, RFI_SEQ: RFI_SEQ, _parse: _parse };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
