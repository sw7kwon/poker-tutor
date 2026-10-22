// engine/gto-std.js (채우는 작업: 클라우드 E 표준 차트 티어와 승률 시뮬. 지시문 docs/cloud-tasks/E.md, 설계 원문 4절 R4)
// 표준 근사 프리플랍 차트(GtoStd). engine/gto.js(입문 차트, 은행 해시)는 그대로 두고 자유 게임 코칭과 차트 패널에서만 쓴다.
// 계약(P0 고정, E가 구현):
//   RANGES: 스팟 키는 Gto.GTO_RANGES와 같고 값은 { raise:[], call:[], mix:{ 'A5s': { raise:.5, fold:.5 } } }
//     raise = 늘 레이즈(오픈, 3벳, 4벳, 5벳 올인), call = 늘 콜(BB vs 림프는 체크), mix = 손마다 빈도(합 1). 세 곳에 같은 손이 겹치지 않는다.
//     페어 대시는 오름차순('22-99'). 콤보 가중 빈도(freq)는 tests/j-gto-std.test.js가 목표(±2%p)로 고정한다:
//     RFI UTG 17, HJ 21, CO 27, BTN 44, SB 42%. BB vs 뒤쪽 오픈(vsRfiBB_LP) 55%(3벳 12, 콜 43), BB vs 앞쪽 오픈(vsRfi.BB) 30%.
//     오프너 vs 3벳 계속 = 오픈 레인지 대비 50%(4벳 11, 콜 39). 3벳 블러프 A5s-A2s 50%, K9s/Q9s 25%, 76s/65s/54s 50%(BTN, SB, BB 표).
//   tier() → 'auto'|'beginner'|'standard'(A11y 설정 chartTier, 기본 'auto')
//   active(state) → 불리언. 'standard'면 참, 'auto'면 Journey.summary().stage ≥ 3이고 자유 게임일 때만.
//     Boss.active()이거나 Journey.session() kind가 boss/mission이면 늘 거짓(승급과 레이팅은 입문 차트).
//   modelFor(state, heroPos) → ui/gto-chart.js 모델 모양({ pos, facing, opener, limpers?, isoPos?, cells[13][13], std:true })
//     칸은 { label, action, w }. w = { raise, call, fold }(합 1)는 섞는 칸에만 있고 순수 칸은 null. action은 가장 큰 빈도의 액션.
//   preflopHint(state, heroPos) → Gto.preflopHint 필드 + w(이 손의 빈도), ok(빈도 0.25 이상인 액션 목록), std:true | null
//     스팟 판정(facing, opener, limpers, size, isoPos)은 Gto.preflopHint 그대로 쓴다(입문과 표준이 같은 상황을 본다).
//   bluffHints(model) → '3벳 블러프 후보: A5s~A2s, 76s, 65s, 54s(50%), K9s, Q9s(25%)' 같은 한 줄 | ''(vs 오픈 모델이 아니면)
//   weights(spot, label) → { raise, call, fold }, freq(spot) → { raise, call, total }(콤보 가중, 1326 기준), tableFor(pos, facing, opener, limpers)
// GtoChart.modelFor는 typeof GtoStd !== 'undefined' && GtoStd.active(state)면 GtoStd.modelFor를 쓴다(G4). 라벨 종류 'chart-std'.
// 수치 출처: 공개 솔버 통념(6-max 100bb, 오픈 2.5x, 3벳 IP 3x OOP 4x)을 이 앱 표 형식으로 근사한 참고값이다(README 라벨 규칙 4번, 회색 '참고').
//   승급 시험, 레이팅, 퍼즐, 레슨, 드릴은 이 표를 쓰지 않는다. 입문 표와 다른 점: UTG/HJ/CO 오픈이 3~7%p 넓고, SB 오픈 42%,
//   BB 방어가 넓고(vs 앞쪽 30%, vs 뒤쪽 55%), 3벳과 4벳에 블러프 섞기(A5s-A2s, K9s/Q9s, 76s/65s/54s)가 있다.
// 규약: 로드 시 DOM, 저장소 접근 없음(typeof 가드). 다른 모듈(Gto, Range, A11y, Journey, Boss)은 호출 때만 본다.
var GtoStd = (function() {
  var TIERS = ['auto', 'beginner', 'standard'];
  var RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

  var RANGES = {
    rfi: {
      UTG: { raise: ['55+', 'A5s+', 'K9s+', 'QTs+', 'JTs', 'T9s', '98s', 'AJo+', 'KQo'], call: [],
        mix: { '22': { raise: .5, fold: .5 }, '33': { raise: .5, fold: .5 }, '44': { raise: .5, fold: .5 },
          A4s: { raise: .5, fold: .5 }, A3s: { raise: .5, fold: .5 }, A2s: { raise: .5, fold: .5 },
          K8s: { raise: .5, fold: .5 }, Q9s: { raise: .5, fold: .5 }, J9s: { raise: .5, fold: .5 }, '87s': { raise: .5, fold: .5 }, '76s': { raise: .5, fold: .5 },
          ATo: { raise: .5, fold: .5 }, KJo: { raise: .5, fold: .5 }, QJo: { raise: .25, fold: .75 } } },
      HJ: { raise: ['22+', 'A2s+', 'K9s+', 'Q9s+', 'J9s+', 'T9s', '98s', '87s', 'ATo+', 'KJo+', 'QJo'], call: [],
        mix: { K8s: { raise: .5, fold: .5 }, T8s: { raise: .5, fold: .5 }, '97s': { raise: .5, fold: .5 }, '76s': { raise: .5, fold: .5 }, '65s': { raise: .5, fold: .5 },
          KTo: { raise: .5, fold: .5 }, QTo: { raise: .25, fold: .75 } } },
      CO: { raise: ['22+', 'A2s+', 'K6s+', 'Q8s+', 'J8s+', 'T8s+', '97s+', '86s+', '76s', '65s', 'ATo+', 'KTo+', 'QTo+', 'JTo'], call: [],
        mix: { K5s: { raise: .5, fold: .5 }, Q7s: { raise: .5, fold: .5 }, J7s: { raise: .5, fold: .5 }, T7s: { raise: .5, fold: .5 }, '75s': { raise: .5, fold: .5 }, '54s': { raise: .5, fold: .5 },
          A9o: { raise: .5, fold: .5 }, K9o: { raise: .5, fold: .5 }, Q9o: { raise: .25, fold: .75 } } },
      BTN: { raise: ['22+', 'A2s+', 'K2s+', 'Q4s+', 'J6s+', 'T6s+', '96s+', '85s+', '75s+', '64s+', '53s+', '43s', 'A2o+', 'K8o+', 'Q9o+', 'J9o+', 'T9o'], call: [],
        mix: { Q3s: { raise: .5, fold: .5 }, K7o: { raise: .25, fold: .75 }, Q8o: { raise: .25, fold: .75 }, J8o: { raise: .25, fold: .75 }, T8o: { raise: .25, fold: .75 },
          '98o': { raise: .5, fold: .5 } } },
      // SB는 레이즈 아니면 폴드(림프 없음)
      SB: { raise: ['22+', 'A2s+', 'K2s+', 'Q5s+', 'J7s+', 'T7s+', '96s+', '86s+', '75s+', '65s', '54s', 'A2o+', 'K9o+', 'Q9o+', 'J9o+', 'T9o'], call: [],
        mix: { Q4s: { raise: .5, fold: .5 }, J6s: { raise: .5, fold: .5 }, T6s: { raise: .5, fold: .5 }, '95s': { raise: .5, fold: .5 }, '64s': { raise: .5, fold: .5 },
          K8o: { raise: .5, fold: .5 }, Q8o: { raise: .5, fold: .5 }, J8o: { raise: .5, fold: .5 }, T8o: { raise: .5, fold: .5 }, '98o': { raise: .5, fold: .5 } } }
    },
    // 상대 오픈 직면. raise = 3벳. 앞쪽 자리(UTG, HJ, CO)는 블러프 3벳을 A5s/A4s만 섞고, BTN/SB/BB는 목표 빈도의 블러프 손을 다 섞는다.
    vsRfi: {
      UTG: { raise: ['QQ+', 'AKs', 'AKo'], call: ['77-JJ', 'AQs', 'AJs', 'KQs', 'QJs', 'JTs', 'AQo'],
        mix: { A5s: { raise: .5, fold: .5 }, A4s: { raise: .5, fold: .5 }, ATs: { call: .5, fold: .5 }, T9s: { call: .5, fold: .5 }, '66': { call: .5, fold: .5 } } },
      HJ: { raise: ['QQ+', 'AKs', 'AKo'], call: ['66-JJ', 'AQs', 'AJs', 'ATs', 'KQs', 'KJs', 'QJs', 'JTs', 'T9s', '98s', 'AQo'],
        mix: { A5s: { raise: .5, fold: .5 }, A4s: { raise: .5, fold: .5 }, KTs: { call: .5, fold: .5 }, '87s': { call: .5, fold: .5 }, '55': { call: .5, fold: .5 }, KQo: { call: .5, fold: .5 } } },
      CO: { raise: ['JJ+', 'AQs+', 'AKo'], call: ['55-TT', 'AJs', 'ATs', 'KJs', 'KTs', 'QJs', 'QTs', 'JTs', 'T9s', '98s', '87s'],
        mix: { A5s: { raise: .5, fold: .5 }, A4s: { raise: .5, fold: .5 }, KQs: { raise: .25, call: .75 }, AQo: { raise: .5, call: .5 }, KQo: { call: .5, fold: .5 },
          A9s: { call: .5, fold: .5 }, '76s': { call: .5, fold: .5 }, '44': { call: .5, fold: .5 } } },
      BTN: { raise: ['TT+', 'AJs+', 'KQs', 'AQo+'],
        call: ['22-99', 'A6s-ATs', 'KTs-KJs', 'QTs-QJs', 'J9s-JTs', 'T8s-T9s', '98s', '87s', 'AJo', 'KQo'],
        mix: { A5s: { raise: .5, call: .5 }, A4s: { raise: .5, call: .5 }, A3s: { raise: .5, call: .5 }, A2s: { raise: .5, call: .5 },
          K9s: { raise: .25, call: .75 }, Q9s: { raise: .25, call: .75 }, '76s': { raise: .5, call: .5 }, '65s': { raise: .5, call: .5 }, '54s': { raise: .5, call: .5 },
          ATo: { call: .5, fold: .5 }, KJo: { call: .5, fold: .5 }, QJo: { call: .5, fold: .5 } } },
      // SB vs 오픈: 3벳 아니면 폴드(입문 표와 같은 원칙)
      SB: { raise: ['99+', 'ATs+', 'KJs+', 'QJs', 'AQo+'], call: [],
        mix: { '88': { raise: .5, fold: .5 }, KQo: { raise: .5, fold: .5 }, AJo: { raise: .5, fold: .5 },
          A5s: { raise: .5, fold: .5 }, A4s: { raise: .5, fold: .5 }, A3s: { raise: .5, fold: .5 }, A2s: { raise: .5, fold: .5 },
          K9s: { raise: .25, fold: .75 }, Q9s: { raise: .25, fold: .75 }, '76s': { raise: .5, fold: .5 }, '65s': { raise: .5, fold: .5 }, '54s': { raise: .5, fold: .5 } } },
      // BB vs 앞쪽(UTG, HJ) 오픈 약 30%
      BB: { raise: ['QQ+', 'AKs', 'AKo'],
        call: ['22-TT', 'A6s-AJs', 'A3s', 'A2s', 'K2s-KQs', 'Q6s-QJs', 'J7s+', 'T7s+', '96s+', '85s+', '74s+', '64s+', '54s', 'A9o-AQo', 'KTo+', 'QTo+', 'JTo'],
        mix: { JJ: { raise: .5, call: .5 }, AQs: { raise: .5, call: .5 }, A5s: { raise: .5, call: .5 }, A4s: { raise: .5, call: .5 } } }
    },
    // BB vs 뒤쪽(CO, BTN, SB) 오픈 약 55%(3벳 12, 콜 43)
    vsRfiBB_LP: {
      raise: ['TT+', 'ATs+', 'KTs+', 'QJs', 'AQo+', 'AJo'],
      call: ['22-77', 'K2s-K8s', 'Q2s-Q8s', 'J4s-J9s', 'T5s-T8s', '95s-97s', '84s-86s', '74s-75s', '63s-64s', '53s', '43s',
        'A2o-ATo', 'K4o-KTo', 'Q8o-QTo', 'J8o-JTo', 'T8o+', '98o', '87o'],
      mix: { '99': { raise: .5, call: .5 }, '88': { raise: .5, call: .5 }, JTs: { raise: .5, call: .5 }, T9s: { raise: .25, call: .75 }, '98s': { raise: .5, call: .5 }, '87s': { raise: .5, call: .5 },
        A9s: { raise: .5, call: .5 }, A8s: { raise: .5, call: .5 }, A7s: { raise: .5, call: .5 }, A6s: { raise: .5, call: .5 },
        A5s: { raise: .5, call: .5 }, A4s: { raise: .5, call: .5 }, A3s: { raise: .5, call: .5 }, A2s: { raise: .5, call: .5 },
        K9s: { raise: .25, call: .75 }, Q9s: { raise: .25, call: .75 }, '76s': { raise: .5, call: .5 }, '65s': { raise: .5, call: .5 }, '54s': { raise: .5, call: .5 },
        KQo: { raise: .5, call: .5 }, KJo: { raise: .5, call: .5 }, QJo: { raise: .5, call: .5 }, '97o': { call: .5, fold: .5 }, '76o': { call: .5, fold: .5 }, '65o': { call: .5, fold: .5 } }
    },
    // 콜드 3벳 직면(아직 아무 액션 안 함): raise = 4벳
    vsCold3bet: { raise: ['QQ+', 'AKs'], call: ['JJ', 'TT', 'AQs'],
      mix: { AKo: { raise: .5, call: .5 }, '99': { call: .5, fold: .5 }, AJs: { call: .5, fold: .5 }, KQs: { call: .5, fold: .5 } } },
    // 오프너가 3벳을 맞음. raise = 4벳. 계속하는 손은 모두 그 자리 오픈 표 안에 있다(BB는 SB 표 기준, 입문 표와 같은 근사).
    vs3bet: {
      UTG: { raise: ['QQ+', 'AKs'], call: ['JJ', 'TT', 'AQs', 'AJs', 'KQs', 'KJs', 'QJs', 'JTs', 'AQo'],
        mix: { AKo: { raise: .5, call: .5 }, '99': { call: .5, fold: .5 }, '88': { call: .5, fold: .5 }, '77': { call: .5, fold: .5 }, ATs: { call: .5, fold: .5 }, KTs: { call: .5, fold: .5 },
          T9s: { call: .5, fold: .5 }, KQo: { call: .5, fold: .5 }, AJo: { call: .5, fold: .5 }, A5s: { call: .5, fold: .5 }, A4s: { call: .5, fold: .5 } } },
      HJ: { raise: ['QQ+', 'AKs'], call: ['99-JJ', 'AQs', 'AJs', 'ATs', 'KQs', 'KJs', 'KTs', 'QJs', 'JTs', 'T9s', 'AQo'],
        mix: { AKo: { raise: .5, call: .5 }, A5s: { raise: .5, fold: .5 }, A4s: { raise: .5, fold: .5 }, '88': { call: .5, fold: .5 }, '77': { call: .5, fold: .5 },
          A9s: { call: .5, fold: .5 }, QTs: { call: .5, fold: .5 }, '98s': { call: .5, fold: .5 }, '87s': { call: .5, fold: .5 }, T8s: { call: .25, fold: .75 },
          KQo: { call: .5, fold: .5 }, AJo: { call: .5, fold: .5 }, KJo: { call: .25, fold: .75 }, ATo: { call: .25, fold: .75 } } },
      CO: { raise: ['QQ+', 'AQs+'], call: ['88-TT', 'AJs', 'ATs', 'A9s', 'KQs', 'KJs', 'KTs', 'QJs', 'QTs', 'JTs', 'T9s', '98s', '87s', 'AQo', 'AJo', 'KQo'],
        mix: { JJ: { raise: .5, call: .5 }, AKo: { raise: .5, call: .5 }, A5s: { raise: .5, fold: .5 }, A4s: { raise: .5, fold: .5 }, '77': { call: .5, fold: .5 }, '66': { call: .5, fold: .5 },
          A8s: { call: .5, fold: .5 }, K9s: { call: .5, fold: .5 }, '76s': { call: .5, fold: .5 }, KJo: { call: .5, fold: .5 }, QJo: { call: .5, fold: .5 }, JTo: { call: .25, fold: .75 } } },
      BTN: { raise: ['TT+', 'AQs+', 'AKo'],
        call: ['22-99', 'A6s-ATs', 'K8s-KJs', 'Q9s-QJs', 'J9s-JTs', 'T8s-T9s', '98s', '87s', '54s', 'AJo', 'ATo', 'KQo', 'KJo', 'QJo'],
        mix: { AJs: { raise: .5, call: .5 }, AQo: { raise: .5, call: .5 }, KQs: { raise: .5, call: .5 }, A5s: { raise: .5, call: .5 }, A4s: { raise: .5, call: .5 },
          A3s: { raise: .5, call: .5 }, A2s: { raise: .5, call: .5 }, '76s': { raise: .25, call: .75 }, '65s': { raise: .25, call: .75 },
          K7s: { call: .5, fold: .5 }, Q8s: { call: .5, fold: .5 }, J8s: { call: .5, fold: .5 }, A9o: { call: .5, fold: .5 }, KTo: { call: .5, fold: .5 }, QTo: { call: .25, fold: .75 } } },
      SB: { raise: ['TT+', 'AQs+', 'AKo'],
        call: ['22-99', 'A6s-AJs', 'K9s-KJs', 'QTs-QJs', 'J9s-JTs', 'T8s-T9s', '98s', '87s', '76s', '65s', 'AJo', 'ATo', 'KQo', 'KJo', 'QJo'],
        mix: { AQo: { raise: .5, call: .5 }, KQs: { raise: .5, call: .5 }, A5s: { raise: .5, call: .5 }, A4s: { raise: .5, call: .5 }, A3s: { raise: .5, call: .5 }, A2s: { raise: .5, call: .5 },
          K8s: { call: .5, fold: .5 }, Q9s: { call: .5, fold: .5 }, '54s': { call: .5, fold: .5 }, A9o: { call: .5, fold: .5 }, KTo: { call: .5, fold: .5 } } },
      BB: { raise: ['TT+', 'AQs+', 'AKo'],
        call: ['22-99', 'A6s-AJs', 'K9s-KJs', 'QTs-QJs', 'J9s-JTs', 'T8s-T9s', '98s', '87s', '76s', '65s', 'AJo', 'ATo', 'KQo', 'KJo', 'QJo'],
        mix: { AQo: { raise: .5, call: .5 }, KQs: { raise: .5, call: .5 }, A5s: { raise: .5, call: .5 }, A4s: { raise: .5, call: .5 }, A3s: { raise: .5, call: .5 }, A2s: { raise: .5, call: .5 },
          K8s: { call: .5, fold: .5 }, Q9s: { call: .5, fold: .5 }, '54s': { call: .5, fold: .5 }, A9o: { call: .5, fold: .5 }, KTo: { call: .5, fold: .5 } } }
    },
    // 3벳터가 4벳을 맞음. raise = 5벳 올인
    vs4bet: {
      UTG: { raise: ['KK+'], call: ['QQ', 'AKo'], mix: { AKs: { raise: .5, call: .5 }, JJ: { call: .5, fold: .5 }, A5s: { raise: .25, fold: .75 } } },
      HJ: { raise: ['KK+'], call: ['QQ', 'AKo'], mix: { AKs: { raise: .5, call: .5 }, JJ: { call: .5, fold: .5 }, A5s: { raise: .25, fold: .75 } } },
      CO: { raise: ['KK+', 'AKs'], call: ['QQ', 'AKo'], mix: { JJ: { call: .5, fold: .5 }, AQs: { call: .5, fold: .5 }, A5s: { raise: .25, fold: .75 } } },
      BTN: { raise: ['QQ+', 'AKs'], call: ['JJ', 'AKo', 'AQs'], mix: { TT: { call: .5, fold: .5 }, AQo: { call: .5, fold: .5 }, A5s: { raise: .25, fold: .75 }, A4s: { raise: .25, fold: .75 } } },
      SB: { raise: ['KK+', 'AKs'], call: ['QQ', 'AKo'], mix: { JJ: { call: .5, fold: .5 }, AQs: { call: .5, fold: .5 }, A5s: { raise: .25, fold: .75 } } },
      BB: { raise: ['KK+', 'AKs'], call: ['QQ', 'AKo'], mix: { JJ: { call: .5, fold: .5 }, AQs: { call: .5, fold: .5 }, A5s: { raise: .25, fold: .75 } } }
    },
    // 림퍼만 있는 팟의 BB: raise = 아이솔 레이즈, 나머지는 체크(call 자리의 뜻이 체크)
    vsLimpBB: { raise: ['TT+', 'AQs+', 'AQo+'], call: [],
      mix: { '99': { raise: .5, call: .5 }, '88': { raise: .5, call: .5 }, AJs: { raise: .5, call: .5 }, KQs: { raise: .5, call: .5 }, AJo: { raise: .5, call: .5 } } }
  };

  function _combos(label) { return label.length === 2 ? 6 : label.charAt(2) === 's' ? 4 : 12; }
  function _parse(arr) {
    if (!arr || !arr.length || typeof Range === 'undefined' || !Range.parse) return new Set();
    return Range.parse(arr.join(','));
  }
  // 스팟 표 → { raise:Set, call:Set, mix } (표 객체마다 1회 파싱)
  var _parsed = typeof WeakMap === 'function' ? new WeakMap() : null;
  function _table(sp) {
    if (!sp) return null;
    var t = _parsed ? _parsed.get(sp) : null;
    if (t) return t;
    t = { raise: _parse(sp.raise), call: _parse(sp.call), mix: sp.mix || {} };
    if (_parsed) _parsed.set(sp, t);
    return t;
  }
  function _norm(w) {
    var r = Math.max(0, Number(w && w.raise) || 0), c = Math.max(0, Number(w && w.call) || 0), f = Math.max(0, Number(w && w.fold) || 0);
    var s = r + c + f;
    if (!(s > 0)) return { raise: 0, call: 0, fold: 1 };
    return { raise: r / s, call: c / s, fold: f / s };
  }
  // 표(spot 객체)에서 손 라벨('A5s')의 빈도. 표 밖은 폴드 1
  function weights(spot, label) {
    var t = _table(spot);
    if (!t || !label) return { raise: 0, call: 0, fold: 1 };
    if (t.raise.has(label)) return { raise: 1, call: 0, fold: 0 };
    if (t.call.has(label)) return { raise: 0, call: 1, fold: 0 };
    if (Object.prototype.hasOwnProperty.call(t.mix, label)) return _norm(t.mix[label]);
    return { raise: 0, call: 0, fold: 1 };
  }
  function _mixed(w) { return !!w && ((w.raise > 0 && w.raise < 1) || (w.call > 0 && w.call < 1) || (w.fold > 0 && w.fold < 1)); }
  function actionOf(w) {
    if (!w) return 'fold';
    if (w.raise >= w.call && w.raise >= w.fold && w.raise > 0) return 'raise';
    if (w.call >= w.fold && w.call > 0) return 'call';
    return 'fold';
  }
  // 콤보 가중 빈도(1326 기준). raise, call, total
  function freq(spot) {
    var t = _table(spot);
    if (!t) return { raise: 0, call: 0, total: 0 };
    var r = 0, c = 0;
    t.raise.forEach(function(l) { r += _combos(l); });
    t.call.forEach(function(l) { c += _combos(l); });
    Object.keys(t.mix).forEach(function(l) {
      if (t.raise.has(l) || t.call.has(l)) return;
      var w = _norm(t.mix[l]), n = _combos(l);
      r += n * w.raise; c += n * w.call;
    });
    return { raise: r / 1326, call: c / 1326, total: (r + c) / 1326 };
  }

  function _lateOpener(pos) { return pos === 'CO' || pos === 'BTN' || pos === 'SB'; }
  function _isoPos(pos, limpers) {
    if (typeof Gto !== 'undefined' && Gto && typeof Gto.isoPos === 'function') return Gto.isoPos(pos, limpers);
    return pos === 'BB' ? null : pos;
  }
  // 상황 → 표. { spot, kind, isoPos, narrow } | null. kind: 'rfi'|'iso'|'isoBB'|'vsRfi'|'vs3bet'|'vs4bet'|'cold3bet'. BB 미오픈(림퍼 없음)은 null(체크).
  //   아이솔(림퍼 뒤, BB 제외)은 Gto.isoPos 표(림퍼 2명 이상이면 한 칸 좁은 자리)와 내 자리 표의 작은 쪽 빈도(narrow)를 쓴다.
  function tableFor(pos, facing, opener, limpers) {
    if (facing === 'vs4bet') return RANGES.vs4bet[pos] ? { spot: RANGES.vs4bet[pos], kind: 'vs4bet' } : null;
    if (facing === 'vs3bet') return RANGES.vs3bet[pos] ? { spot: RANGES.vs3bet[pos], kind: 'vs3bet' } : null;
    if (facing === 'cold3bet') return { spot: RANGES.vsCold3bet, kind: 'cold3bet' };
    if (facing === true) {
      if (pos === 'BB' && _lateOpener(opener)) return { spot: RANGES.vsRfiBB_LP, kind: 'vsRfi' };
      return RANGES.vsRfi[pos] ? { spot: RANGES.vsRfi[pos], kind: 'vsRfi' } : null;
    }
    if (limpers > 0) {
      if (pos === 'BB') return { spot: RANGES.vsLimpBB, kind: 'isoBB', isoPos: null };
      var ip = _isoPos(pos, limpers);
      if (!ip || !RANGES.rfi[ip]) return null;
      return { spot: RANGES.rfi[ip], kind: 'iso', isoPos: ip, narrow: RANGES.rfi[pos] || null };
    }
    return RANGES.rfi[pos] ? { spot: RANGES.rfi[pos], kind: 'rfi' } : null;
  }
  // 표 선택 결과와 손 라벨 → 빈도(아이솔은 두 표의 작은 쪽)
  function _weightsAt(tb, label) {
    var w = weights(tb.spot, label);
    if (tb.narrow && tb.narrow !== tb.spot) {
      var w2 = weights(tb.narrow, label);
      var r = Math.min(w.raise, w2.raise);
      w = { raise: r, call: 0, fold: 1 - r };
    }
    return w;
  }

  function tier() {
    try {
      var s = (typeof A11y !== 'undefined' && A11y && typeof A11y.load === 'function') ? A11y.load() : null;
      var t = s && s.chartTier;
      return TIERS.indexOf(t) >= 0 ? t : 'auto';
    } catch (e) { return 'auto'; }
  }
  // 승급 시험(Boss.active)이나 보스/미션 세션이면 참: 입문 차트로만 판정한다
  function _locked(state) {
    try {
      if (state && state.boss === true) return true;
      if (typeof Boss !== 'undefined' && Boss && typeof Boss.active === 'function' && Boss.active()) return true;
      if (typeof Journey !== 'undefined' && Journey && typeof Journey.session === 'function') {
        var s = Journey.session();
        if (s && (s.kind === 'boss' || s.kind === 'mission')) return true;
      }
    } catch (e) { return true; }
    return false;
  }
  function _stage() {
    try {
      if (typeof Journey !== 'undefined' && Journey && typeof Journey.summary === 'function') {
        var n = Number(Journey.summary().stage);
        return isFinite(n) ? n : 0;
      }
    } catch (e) { /* 아래 */ }
    return 0;
  }
  function active(state) {
    var t = tier();
    if (t === 'beginner') return false;
    if (_locked(state)) return false;
    if (t === 'standard') return true;
    return _stage() >= 3;
  }

  function _comboLabel(r, c) {
    if (r === c) return RANKS[r] + RANKS[r];
    if (r < c) return RANKS[r] + RANKS[c] + 's';
    return RANKS[c] + RANKS[r] + 'o';
  }
  function _hint0(state, heroPos) {
    if (!state || state.street !== 'preflop' || typeof Gto === 'undefined' || !Gto || typeof Gto.preflopHint !== 'function') return null;
    try { return Gto.preflopHint(state, heroPos); } catch (e) { return null; }
  }
  // 입문 모델과 같은 모양. 칸 { label, action, w }. 표가 없는 상황(BB 미오픈 등)은 action 'none'
  function modelFor(state, heroPos) {
    var h = _hint0(state, heroPos);
    if (!h) return null;
    var limpers = (h.facing === false && h.limpers > 0) ? h.limpers : 0;
    var tb = tableFor(heroPos, h.facing, h.opener || null, limpers);
    var cells = [];
    for (var r = 0; r < 13; r++) {
      var row = [];
      for (var c = 0; c < 13; c++) {
        var label = _comboLabel(r, c), action = 'none', w = null;
        if (tb) {
          var ww = _weightsAt(tb, label);
          action = actionOf(ww);
          w = _mixed(ww) ? ww : null;
        }
        row.push({ label: label, action: action, w: w });
      }
      cells.push(row);
    }
    var m = { pos: heroPos, facing: h.facing, opener: (h.facing === true && h.opener) ? h.opener : null, cells: cells, std: true };
    if (limpers > 0) { m.limpers = limpers; m.isoPos = tb ? tb.isoPos : null; }
    return m;
  }
  var KOR = { raise: '레이즈', call: '콜', fold: '폴드', check: '체크' };
  // Gto.preflopHint 필드 + w, ok, std. BB vs 림프의 '콜' 빈도는 체크다.
  function preflopHint(state, heroPos) {
    var h = _hint0(state, heroPos);
    if (!h) return null;
    var limpers = (h.facing === false && h.limpers > 0) ? h.limpers : 0;
    var tb = tableFor(heroPos, h.facing, h.opener || null, limpers);
    var label = (state.heroCards && state.heroCards.length === 2 && typeof Range !== 'undefined') ? Range.handClass(state.heroCards[0], state.heroCards[1]) : null;
    var out = { action: h.action, label: h.label, facing: h.facing, opener: h.opener, std: true };
    if (limpers > 0) { out.limpers = h.limpers; out.size = h.size; out.alt = null; out.isoPos = h.isoPos; }
    var w, act;
    if (!tb || !label) {
      // 표가 없으면 입문 판정 그대로(BB 미오픈 체크 등)
      act = h.action;
      w = act === 'raise' ? { raise: 1, call: 0, fold: 0 } : (act === 'call' || act === 'check') ? { raise: 0, call: 1, fold: 0 } : { raise: 0, call: 0, fold: 1 };
    } else {
      w = _weightsAt(tb, label);
      act = actionOf(w);
      if (tb.kind === 'isoBB' && act !== 'raise') act = 'check';
      else if (act === 'fold' && heroPos === 'BB' && h.facing === false) act = 'check';
    }
    out.action = act;
    out.label = KOR[act] || act;
    out.w = w;
    // ok: 빈도 0.25 이상인 액션 이름. BB vs 림프의 '콜' 자리는 체크, 표가 없는 BB 미오픈도 체크, BB 미오픈의 폴드 자리는 체크(콜할 돈 0)
    var ok = [], callName = ((tb && tb.kind === 'isoBB') || (!tb && act === 'check')) ? 'check' : 'call';
    var foldName = (heroPos === 'BB' && h.facing === false) ? 'check' : 'fold';
    if (w.raise >= 0.25) ok.push('raise');
    if (w.call >= 0.25) ok.push(callName);
    if (w.fold >= 0.25 && ok.indexOf(foldName) < 0) ok.push(foldName);
    out.ok = ok;
    if (limpers > 0 && heroPos === 'BB' && w.raise >= 0.25 && w.call >= 0.25) out.alt = act === 'raise' ? 'check' : 'raise';
    return out;
  }

  function _pct(x) { return Math.round(x * 100); }
  function _broad(r) { return RANKS.indexOf(r) <= RANKS.indexOf('T'); }
  // 손 목록을 'A5s~A2s' 같은 묶음으로(같은 높은 카드, 같은 종류, 낮은 카드가 이어질 때)
  function _runs(labels) {
    var out = [], i = 0;
    while (i < labels.length) {
      var j = i;
      while (j + 1 < labels.length && labels[j + 1].charAt(0) === labels[i].charAt(0) && labels[j + 1].charAt(2) === labels[i].charAt(2) &&
        RANKS.indexOf(labels[j + 1].charAt(1)) === RANKS.indexOf(labels[j].charAt(1)) + 1) j++;
      out.push(j - i >= 2 ? labels[i] + '~' + labels[j] : labels.slice(i, j + 1).join(', '));
      i = j + 1;
    }
    return out;
  }
  // vs 오픈 모델의 섞는 3벳 손(페어와 브로드웨이 두 장은 밸류 쪽이라 뺀다) → 한 줄
  // (웨이브2 후속) 콜과 섞는 칸(레이즈 + 콜)은 블러프가 아니라 콜 범위의 손이라 뺀다. 순수 3벳 블러프 칸(레이즈와 폴드만 섞음)만.
  //   BB 방어처럼 섞는 칸이 모두 콜과 섞이면 빈 문자열(줄을 보이지 않는다)
  function bluffHints(model) {
    if (!model || model.facing !== true || !model.cells) return '';
    var groups = {}, order = [];
    for (var r = 0; r < 13; r++) {
      for (var c = 0; c < 13; c++) {
        var cell = model.cells[r] && model.cells[r][c];
        if (!cell || !cell.w || !(cell.w.raise > 0 && cell.w.raise < 1)) continue;
        if (cell.w.call > 0) continue;
        var l = cell.label;
        if (l.length === 2 || (_broad(l.charAt(0)) && _broad(l.charAt(1)))) continue;
        var p = _pct(cell.w.raise);
        if (!groups[p]) { groups[p] = []; order.push(p); }
        groups[p].push(l);
      }
    }
    if (!order.length) return '';
    order.sort(function(a, b) { return b - a; });
    return '3벳 블러프 후보: ' + order.map(function(p) { return _runs(groups[p]).join(', ') + '(' + p + '%)'; }).join(', ');
  }

  var api = { RANGES: RANGES, TIERS: TIERS.slice(), tier: tier, active: active, modelFor: modelFor, preflopHint: preflopHint, bluffHints: bluffHints,
    weights: weights, freq: freq, tableFor: tableFor, actionOf: actionOf };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
