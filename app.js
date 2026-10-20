// app.js — 최상위 앱 컨트롤러
var App = (function() {
  var _state = null;
  var _villainConfig = null;
  var _round = 1;        // 누적 핸드 번호
  var _seed = null;
  var _gtoMode = false;
  var _gtoRound = 1;     // GTO 모드: 같은 seed 3회 반복 중 현재 회차 (1=일반, 2=힌트, 3=측정)
  var _baseSeed = null;  // GTO 모드: 3회 반복에 재사용하는 seed
  var _lastEV = null;
  var _lastEQ = 0;
  var _lastVerdict = null;
  var _lastView = null;
  var _sessionHands = [];
  var _carryoverStacks = null;
  var _heroPos = 'BTN';
  var _POS = ['UTG','HJ','CO','BTN','SB','BB'];
  var _sessionId = null; // selectVillains()에서 Date.now() — saveHandHistory meta로 전파
  var _practice = null;  // 활성 시: { seed, heroPos, config, attempts:[{n,delta}], resume:{...}|null }
  var _sessionNet = 0;

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
    document.getElementById(id).classList.add('active');
    if (typeof Nav !== 'undefined' && Nav.onShow) Nav.onShow(id);
  }

  function showMenu() {
    // 여정 진행 중(오늘의 5분, 미션/보스)이면 메뉴 대신 여정 홈 또는 진행 중 블록으로
    if (typeof Journey !== 'undefined' && Journey.active && Journey.active() && typeof JourneyUI !== 'undefined' && JourneyUI.resume) { JourneyUI.resume(); return; }
    showScreen('screen-menu');
  }

  function toggleEquity() {
    var panel = document.getElementById('equity-overlay');
    var btn   = document.getElementById('equity-toggle');
    if (!panel) return;
    var visible = panel.style.display !== 'none';
    panel.style.display = visible ? 'none' : 'flex';
    btn.classList.toggle('active', !visible);
    // 에쿼티 패널이 숨겨지면(visible=true였던 경우) gto-chart를 오른쪽 끝으로 붙임
    var chart = document.getElementById('gto-chart');
    if (chart) chart.classList.toggle('panel-closed', visible);
  }

  function startGame() { showScreen('screen-villain-select'); }

  function selectVillains(config) {
    _villainConfig = config;
    _gtoMode = (config === 'gto-mirror');
    _round = 1;
    _seed = Math.floor(Math.random() * 1000000);
    _gtoRound = 1;
    _baseSeed = _seed;
    _sessionHands = [];
    _carryoverStacks = null;
    _heroPos = 'BTN';
    _sessionId = Date.now();
    _practice = null;
    _sessionNet = 0; if (typeof VillainTracker !== 'undefined') VillainTracker.reset(_sessionId);
    // 초보자 코칭 패널(에쿼티 오버레이) 전 모드 기본 표시 — 원하면 📊 버튼으로 접기
    var panel = document.getElementById('equity-overlay');
    var toggleBtn = document.getElementById('equity-toggle');
    if (panel) panel.style.display = 'flex';
    if (toggleBtn) toggleBtn.classList.add('active');
    var chartEl = document.getElementById('gto-chart');
    if (chartEl) chartEl.classList.remove('panel-closed');
    _newHand();
  }

  function _newHand() {
    if (!_gtoMode && typeof GtoChart !== 'undefined') GtoChart.hide();
    var playersSpec = _buildPlayersSpec(_villainConfig);
    _state = GameState.buildInitialState(playersSpec, _heroPos, _seed, _carryoverStacks);
    // Hand#/Round 표시 갱신 (buildInitialState는 항상 1로 고정하는 버그가 있었음)
    _state.handNum = _round;
    _state.round = _gtoMode ? _gtoRound : 0;
    if (typeof ThinkingUI !== 'undefined') ThinkingUI.onNewHand(_state); // WP8
    showScreen('screen-game');
    Table.render(_state);
    HUD.clear();
    _lastEV = null;
    _lastVerdict = null; _lastView = null;
    if (typeof CoachUI !== 'undefined') CoachUI.onNewHand({handNum:_round, gtoMode:_gtoMode, gtoRound:_gtoRound, practice:!!_practice, sessionId:_sessionId, mode:_villainConfig});
    if (typeof Journey !== 'undefined' && Journey.onNewHand) Journey.onNewHand({ state: _state, handNum: _round, mode: _villainConfig, practice: !!_practice, gtoMode: _gtoMode, gtoRound: _gtoRound, sessionId: _sessionId, heroPos: _heroPos, hu: playersSpec.length === 1 });
    // 결과 배너 숨기기
    var banner = document.getElementById('result-banner');
    if (banner) banner.style.display = 'none';
    // 액션바 복원
    var actionBar = document.getElementById('action-bar');
    if (actionBar) actionBar.style.display = '';
    var resultBar = document.getElementById('result-actions-bar');
    if (resultBar) resultBar.style.display = 'none';
    // GTO 패널 초기화
    var commentary = document.getElementById('gto-commentary');
    if (commentary) { commentary.style.display = _gtoMode ? 'flex' : 'none'; commentary.innerHTML = ''; }
    var presetRow = document.getElementById('gto-preset-row');
    if (presetRow) presetRow.style.display = _gtoMode ? 'flex' : 'none';
    var sliderSection = document.getElementById('raise-slider-section');
    if (sliderSection) sliderSection.style.display = _gtoMode ? 'none' : '';
    var toggle = document.getElementById('gto-reason-toggle');
    if (toggle) toggle.textContent = '▶';
    // 팟 오즈 링 숨기기
    var ring = document.getElementById('pot-odds-ring');
    if (ring) ring.style.display = 'none';
    // 세로 폰 학습 도크: 패널 초기화가 끝난 뒤 탭/접힘 리셋 (총평 패널 비운 뒤라 탭 판정이 정확)
    if (typeof MobileUI !== 'undefined' && MobileUI.onNewHand) MobileUI.onNewHand();
    ActionBar.render(_state);
    Animator.dealCards(_state, function() {
      _processVillainActions();
    });
  }

  function _buildPlayersSpec(config) {
    // 여정 캐스트 구성('sixmax-cast', 'sixmax-cast-hidden')은 Journey가 만든다. 그 외 null → 기존 분기
    if (typeof Journey !== 'undefined' && Journey.playersSpec) {
      var js = Journey.playersSpec(config, _heroPos, _POS);
      if (js) return js;
    }
    if (config === 'headsup-tag') {
      return [{ type: 'TAG', name: 'Mike', pos: _heroPos === 'BTN' ? 'BB' : 'BTN' }];
    }
    if (config === 'mixed') {
      return [{ type: 'Mixed', name: 'Alex', pos: _heroPos === 'BTN' ? 'BB' : 'BTN' }];
    }
    if (config === 'sixmax' || config === 'gto-mirror') {
      // 6-max: 6개 시트(0~5)에 고정 착석, 버튼이 매 핸드 이동
      // heroSeat=3 고정, btnSeat = (6 - heroIdx) % 6
      // posForSeat(seat) = _POS[(seat - btnSeat + 3 + 6) % 6]
      var heroIdx = _POS.indexOf(_heroPos);
      var btnSeat = (6 - heroIdx) % 6;
      var posForSeat = function(seat) { return _POS[(seat - btnSeat + 3 + 6) % 6]; };
      return [
        { type: 'TAG',  name: 'Mike',   pos: posForSeat(0) },
        { type: 'TAG',  name: 'Sarah',  pos: posForSeat(1) },
        { type: 'LAG',  name: 'Carlos', pos: posForSeat(2) },
        { type: 'Fish', name: 'Jimmy',  pos: posForSeat(4) },
        { type: 'Nit',  name: 'David',  pos: posForSeat(5) }
      ];
    }
    return [];
  }

  function _processVillainActions() {
    if (_state.street === 'showdown') { _showResult(); return; }
    var result = GameState.applyVillainActions(_state);
    if (typeof ThinkingUI !== 'undefined') result.villainActions.forEach(function(a) { ThinkingUI.onVillainAction(_state, a.name, a.action, a.amount, a); }); // WP8 (액션 전 상태, a에 potBefore 등 스냅샷)
    _state = result.newState;
    if (!_practice && typeof VillainTracker !== 'undefined') VillainTracker.observe(_sessionId, _state, result.villainActions);
    Table.render(_state);
    if (result.villainActions.length > 0) {
      Table.updateVillainActions(result.villainActions);
    }
    if (_state.waitingForHero) {
      _computeEVAndShow();
    } else if (_state.handOver) {
      _showResult();
    } else if (GameState.needsStreetAdvance(_state)) {
      _state = GameState.advanceStreet(_state);
      Table.render(_state);
      Animator.dealBoard(_state, function() { _processVillainActions(); });
    } else {
      _showResult();
    }
  }

  function _computeEVAndShow() {
    // 레인지vs레인지: 프리플랍은 결정마다 빌런 레인지를 재계산(Array 저장 — Set은 JSON clone에서 {}로 깨짐)
    // 포스트플랍은 레인지가 비어 있을 때만 "오픈 콜" 레인지
    if (typeof Gto !== 'undefined') {
      if (_state.street === 'preflop') {
        var vr = Gto.villainRangeFor ? Gto.villainRangeFor(_state) : null;
        _state.villainRange = vr ? Array.from(vr) : null;
        _state.villainRangeLabel = vr ? _rangeLabel(_state, 'raiser') : null;
      } else if (!_state.villainRange && Gto.callerRangeFor) {
        var cr = Gto.callerRangeFor(_state);
        if (cr) {
          _state.villainRange = Array.from(cr);
          _state.villainRangeLabel = _rangeLabel(_state, 'caller');
        }
      }
    }
    Equity.calc(_state, function(eq) {
      var ev = EV.calcOptions(_state, eq);
      _lastVerdict = (typeof Coach !== 'undefined') ? Coach.verdict(_state, ev, eq, _heroPos, { mode: _villainConfig }) : null;
      var V = _lastVerdict;
      if (V) {
        ev.heuristicBest = ev.bestAction;
        ev.bestAction = V.evKey;
        ev.bestSource = V.source;
        ev.verdict = V;
      }
      _lastEV = ev;
      _lastEQ = eq;
      var view = (typeof CoachUI !== 'undefined' && CoachUI.beforeDecision)
        ? CoachUI.beforeDecision({ state: _state, ev: ev, eq: eq, verdict: V, heroPos: _heroPos, gtoMode: _gtoMode,
            gtoRound: _gtoRound, practice: !!_practice, sessionId: _sessionId })
        : null;
      if (!view) view = { level: 0, hide: false, hideEquity: false, hidePotOdds: false };
      _lastView = view;
      HUD.update(eq, ev, _state, _gtoMode ? _gtoRound : 0, view);
      if (typeof GtoChart !== 'undefined') {
        if (view.hide) GtoChart.hide();
        else GtoChart.update(_state, _heroPos, _gtoMode);
      }
      // 라운드 2(가이드): 프리플랍=GTO 레인지 룩업, 포스트플랍=전략 가이드(P5)
      // — street별 분기로 프리플랍 힌트가 포스트플랍에 잔류하던 스탈레 표시도 해소
      if (_gtoMode && _gtoRound === 2) {
        var gtoEl = document.getElementById('gto-hint');
        if (gtoEl) {
          if (_state.street === 'preflop') {
            var hint = Gto.preflopHint(_state, _heroPos);
            if (hint) {
              gtoEl.textContent = _gtoPreflopHintText(hint);
              gtoEl.style.display = 'block';
            }
          } else {
            var pfg = (typeof PostflopGuide !== 'undefined') ? PostflopGuide.guide(_state) : null;
            if (pfg) {
              var line = '👁 ' + pfg.meta + ' → ' + pfg.label + ' (' + pfg.reason + ')';
              // 정량 통념 테이블 1줄 (빈도·사이즈·MDF — 솔버 근사)
              var tbl = (typeof PostflopTables !== 'undefined') ? PostflopTables.hint(_state) : null;
              if (tbl) line += '\n' + tbl;
              gtoEl.textContent = line;
              gtoEl.style.display = 'block';
            } else {
              gtoEl.style.display = 'none';
            }
          }
        }
      }
      // 정답 가림: 'GTO 정답 세팅' 버튼도 정답을 보여 주므로 숨기고 사이즈는 슬라이더로 직접 선택
      if (_gtoMode && view.hide) {
        var presetRow = document.getElementById('gto-preset-row');
        if (presetRow) presetRow.style.display = 'none';
        var sliderSection = document.getElementById('raise-slider-section');
        if (sliderSection) sliderSection.style.display = '';
      }
      ActionBar.render(_state, ev, view);
      _updatePotOddsRing(_state, view);
      if (_gtoMode) {
        var lines = EV.buildGTOCommentary(_state, ev, eq);
        // L2/L3은 승률·팟 오즈도 가림 → 3번째 줄(에쿼티 | 팟 오즈 | 우위/부족)까지 숨김
        if (view.hide) lines = lines.slice(0, (view.hideEquity || view.hidePotOdds) ? 2 : 3);
        var commentary = document.getElementById('gto-commentary');
        if (commentary) {
          commentary.innerHTML =
            '<div class="gto-lines-left" id="gto-lines">' +
            lines.map(function(l){ return '<div class="gto-line">' + l + '</div>'; }).join('') +
            '</div>' +
            '<div class="gto-reason-panel" id="gto-reason" style="display:none"></div>';
        }
      }
      if (typeof ThinkingUI !== 'undefined') ThinkingUI.onHeroTurn(_state, _heroPos, eq, ev); // WP8
      if (typeof MobileUI !== 'undefined' && MobileUI.onHeroTurn) MobileUI.onHeroTurn(view, { gtoMode: _gtoMode, gtoRound: _gtoRound });
    });
  }

  // GTO 2회차 프리플랍 힌트 한 줄(순수 함수). 림퍼 뒤는 '(오픈)' 대신 림퍼 수와 아이솔 기준 표(isoPos)를 적는다(M4-P9).
  function _gtoPreflopHintText(hint) {
    if (!hint) return '';
    var n = hint.limpers || 0, sz = n > 0 ? String(Math.round((hint.size || 0) * 100) / 100) + 'bb' : '';
    var facingLabel = hint.facing === 'vs4bet' ? ' (vs 4벳)' : hint.facing === 'vs3bet' ? ' (vs 3벳)'
      : hint.facing === 'cold3bet' ? ' (vs 콜드 3벳)' : hint.facing ? ' (vs ' + (hint.opener ? hint.opener + ' ' : '') + '오픈)'
      : n > 0 ? ' (림퍼 ' + n + '명' + (hint.isoPos ? ', ' + hint.isoPos + ' 오픈 표 기준' + (hint.action === 'raise' ? ' 아이솔 ' + sz : '')
        : hint.action === 'raise' ? ', 아이솔 ' + sz : hint.alt === 'raise' ? ', 아이솔 ' + sz + ' 레이즈도 괜찮음' : '') + ')'
      : ' (오픈)';
    return '👁 GTO 프리플랍: ' + hint.label + facingLabel;
  }

  function heroAction(action) {
    if (!_state || !_state.waitingForHero) return; // 이중 클릭 가드
    if (typeof ThinkingUI !== 'undefined') ThinkingUI.onHeroAction(_state, action); // WP8
    var pre = _state;
    var heroBet = (pre.playerBets && pre.playerBets['Hero']) || 0;
    var toCall = Math.max(0, pre.currentBet - heroBet);
    var maxTo = heroBet + ((pre.stacks && pre.stacks['Hero']) || 0);
    var amount = 0;
    if (action === 'raise') {
      var amtEl = document.getElementById('raise-amount');
      amount = parseFloat(amtEl && amtEl.value) || 0;
    } else if (action === 'allin') {
      amount = maxTo;
    }
    var n = _normalizeHeroAction(action, toCall, amount, maxTo);
    if (n.converted) _showToast('🔴 콜할 돈이 0일 땐 폴드 대신 체크! 공짜로 다음 카드를 봐요. 체크로 바꿨어요');
    var next = GameState.applyHeroAction(pre, n.action, amount);
    // 검증 실패(민레이즈 미달 등) — 상태 불변, 토스트만 띄우고 계속 대기
    if (next.actionError) {
      _showToast('⚠ ' + next.actionError);
      return;
    }
    var V = _lastVerdict;
    var g = (V && typeof Coach !== 'undefined') ? Coach.grade(V, n.intended, _lastEV, pre) : null;
    _state = next;
    var dec = null;
    if (_lastEV && _state.decisions.length > 0) {
      dec = _state.decisions[_state.decisions.length - 1];
      var r3 = function(x) { return Math.round((x || 0) * 1000) / 1000; };
      dec.toCall = toCall;
      dec.potBefore = pre.pot;
      dec.eq = r3(_lastEQ);
      dec.gtoRound = _gtoMode ? _gtoRound : 0;
      dec.hidden = !!(_lastView && _lastView.hide);
      dec.intended = n.intended;
      if (V && g) {
        dec.bestEV = _lastEV[V.evKey] || 0;
        dec.actualEV = dec.bestEV + g.delta;
        dec.verdict = V.action;
        dec.light = g.light;
        dec.pattern = g.pattern;
        dec.why = g.why;
        dec.spot = V.concept;
        dec.source = V.source;
        // 고정 벌점(차트, 가이드 등) 여부(M4-P9): 결과 패널과 핸드 리뷰가 bb 숫자 대신 '큰 실수/작은 실수'로 보인다
        dec.estimated = !!g.estimated;
      } else {
        // 폴백(Coach 미로드): 기존 EV 키 방식
        var evKey;
        if (n.action === 'fold') evKey = 'fold';
        else if (n.action === 'call' || n.action === 'check') evKey = 'call';
        else if (n.action === 'allin') evKey = 'allin';
        else {
          var half = _lastEV.raiseHalfAmt || 0, potAmt = _lastEV.raisePotAmt || 0;
          evKey = Math.abs(amount - potAmt) <= Math.abs(amount - half) ? 'raise_pot' : 'raise_half';
        }
        dec.actualEV = _lastEV[evKey] != null ? _lastEV[evKey] : 0;
        dec.bestEV = _lastEV[_lastEV.bestAction] || 0;
      }
    }
    // 학습 기록: 연습 모드와 GTO 2회차(힌트 회차)는 제외
    var logIt = !_practice && !(_gtoMode && _gtoRound === 2);
    var cardStr = function(cs) { return (cs || []).map(function(c){ return c.rank + c.suit; }); };
    if (logIt && dec) {
      if (g) {
        var prog = Storage.getProgress();
        prog.weakSpots = prog.weakSpots || {};
        var key = V.concept;
        if (g.light !== 'green') {
          Storage.addMistake({
            type: 'game', street: pre.street, action: n.intended, bestAction: V.evKey, verdict: V.action,
            delta: Math.round(g.delta * 100) / 100, light: g.light, pattern: g.pattern, why: g.why, spot: V.concept,
            estimated: !!g.estimated,
            toCall: toCall, potOdds: Math.round((V.potOdds || 0) * 1000) / 1000, eq: Math.round((_lastEQ || 0) * 1000) / 1000,
            heroCards: cardStr(pre.heroCards), board: cardStr(pre.board),
            pot: pre.pot, date: new Date().toISOString(),
            seed: pre.seed, heroPos: _heroPos, mode: _villainConfig
          });
          prog.weakSpots[key] = (prog.weakSpots[key] || 0) + 1;
          Storage.saveProgress(prog);
        } else if ((prog.weakSpots[key] || 0) > 0) {
          prog.weakSpots[key] = Math.max(0, prog.weakSpots[key] - 0.25);
          Storage.saveProgress(prog);
        }
      } else {
        var delta = dec.actualEV - dec.bestEV;
        if (delta < -0.5) {
          Storage.addMistake({
            type: 'game', street: pre.street, action: n.action,
            bestAction: _lastEV.bestAction, delta: Math.round(delta * 100) / 100,
            heroCards: cardStr(pre.heroCards), board: cardStr(pre.board),
            pot: pre.pot, date: new Date().toISOString(),
            seed: pre.seed, heroPos: _heroPos, mode: _villainConfig
          });
          var prog2 = Storage.getProgress();
          var spotKey = _curriculumSpotKey(pre);
          prog2.weakSpots[spotKey] = (prog2.weakSpots[spotKey] || 0) + 1;
          Storage.saveProgress(prog2);
        }
      }
    }
    if (logIt && V && g && V.source === 'chart' && typeof Drills !== 'undefined' && Drills.recordFromGame) {
      Drills.recordFromGame(pre, _heroPos, V, g.light === 'green');
    }
    Table.render(_state);
    // 말풍선은 render 뒤에 — render가 좌석 innerHTML을 갈아 끼워 즉시 지워지던 문제
    Table.showHeroAction(n.action, amount, g ? g.light : null);
    HUD.clear();
    ActionBar.render(_state);
    if (typeof CoachUI !== 'undefined' && CoachUI.afterDecision) {
      CoachUI.afterDecision({ state: pre, verdict: V, grade: g, action: n.intended, executed: n.action, ev: _lastEV,
        eq: _lastEQ, view: _lastView, practice: !!_practice, gtoMode: _gtoMode, gtoRound: _gtoRound,
        sessionId: _sessionId, dec: dec });
    }
    if (typeof Journey !== 'undefined' && Journey.afterDecision) Journey.afterDecision({ state: pre, verdict: V, grade: g, action: n.intended, executed: n.action, amount: amount, dec: dec, practice: !!_practice, gtoMode: _gtoMode, gtoRound: _gtoRound, heroPos: _heroPos, mode: _villainConfig, hu: (pre.names || []).length === 2, hint: !!(_lastView && _lastView.hide === false && dec && dec.hidden === false) });
    if (typeof MobileUI !== 'undefined' && MobileUI.onAfterDecision) MobileUI.onAfterDecision();
    if (_state.handOver) {
      _showResult();
    } else if (GameState.needsStreetAdvance(_state)) {
      _state = GameState.advanceStreet(_state);
      Table.render(_state);
      Animator.dealBoard(_state, function() { _processVillainActions(); });
    } else {
      _processVillainActions();
    }
  }

  // 히어로 액션 정규화(순수): 콜 0 → 체크, 공짜 폴드 → 체크(자동 변환), 스택 전부 레이즈 → 올인
  function _normalizeHeroAction(action, toCall, amount, maxTo) {
    if (action === 'call' && toCall === 0) return { action: 'check', intended: 'check', converted: false };
    if (action === 'fold' && toCall === 0) return { action: 'check', intended: 'fold', converted: true };
    if (action === 'raise' && amount >= maxTo - 0.01) return { action: 'allin', intended: 'allin', converted: false };
    return { action: action, intended: action, converted: false };
  }

  // 승률 계산 기준 레인지 이름 (예: 'Mike(CO) 오픈 레인지', 'Sarah(BB) 콜 레인지')
  function _rangeLabel(state, kind) {
    var players = state.players || {};
    if (kind === 'raiser') {
      var lr = state.lastRaiser;
      if (!lr || lr === 'Hero' || !players[lr]) return '상대의 예상 레인지';
      var sbc = state.streetBetCount || 0;
      return lr + '(' + players[lr].pos + ') ' + (sbc >= 3 ? '4벳' : sbc === 2 ? '3벳' : '오픈') + ' 레인지';
    }
    var live = Object.keys(players).filter(function(nm) {
      return nm !== 'Hero' && !(state.folded && state.folded[nm]);
    });
    if (!live.length) return '상대의 예상 레인지';
    return live[0] + '(' + players[live[0]].pos + ') 콜 레인지';
  }

  // 인게임 실수 → 커리큘럼 약점 키 (data/curriculum.js 세션 키 체계 — 퀴즈 출제 가중치가 이 키를 읽음)
  // 구 'game:'+street 키는 커리큘럼 키와 불일치해 가중치 반영이 0이었음
  function _curriculumSpotKey(state) {
    if (state.street === 'preflop') {
      if (typeof Gto !== 'undefined') {
        if (Gto.isFacing4bet(state) || Gto.isFacing3bet(state)) return 'vs_3bet';
        if (state.lastRaiser && state.lastRaiser !== 'Hero' && state.currentBet > state.bigBlind) return 'vs_rfi';
      }
      return 'rfi';
    }
    if (state.street === 'flop') return 'cbet';
    return 'turn_river';
  }

  // 올인 가능한 최대 raise-to = 이번 스트리트에 이미 낸 칩 + 남은 스택
  function _maxTo() {
    if (!_state) return 100;
    return ((_state.playerBets && _state.playerBets.Hero) || 0) + ((_state.stacks && _state.stacks.Hero) || 0);
  }

  function _setRaiseAmount(amount) {
    var maxTo = _maxTo();
    document.getElementById('raise-amount').value = amount.toFixed(1);
    var pct = maxTo > 0 ? (amount / maxTo * 100).toFixed(0) : 0;
    document.getElementById('raise-stack-pct').textContent = '스택의 ' + pct + '%';
  }

  function updateRaiseSlider() {
    var slider = document.getElementById('raise-slider');
    var min = _state ? _state.minRaise : 2;
    var max = _maxTo();
    var val = min + (slider.value / 100) * (max - min);
    _setRaiseAmount(Math.min(max, val));
  }

  function setRaisePreset(fraction) {
    if (!_state) return;
    var pot = _state.pot;
    var maxTo = _maxTo();
    var toCall = Math.max(0, (_state.currentBet || 0) - ((_state.playerBets && _state.playerBets.Hero) || 0));
    var amount;
    if (fraction >= 999) amount = maxTo;
    else if (toCall > 0) amount = (_state.currentBet || 0) + fraction * (pot + toCall);
    else amount = pot * fraction;
    amount = Math.min(maxTo, Math.max(_state.minRaise, amount));
    _setRaiseAmount(amount);
    var slider = document.getElementById('raise-slider');
    var min = _state.minRaise, max = maxTo;
    slider.value = max > min ? ((amount - min) / (max - min)) * 100 : 100;
  }

  function _updatePotOddsRing(state, view) {
    var ringEl = document.getElementById('pot-odds-ring');
    var pctEl  = document.getElementById('pot-odds-pct');
    if (!ringEl || !state) return;
    var toCall = Math.max(0, state.currentBet - ((state.playerBets && state.playerBets['Hero']) || 0));
    if (toCall <= 0) { ringEl.style.display = 'none'; return; }
    if (view && view.hidePotOdds) {
      // 자기점검: 팟 오즈를 먼저 계산해 보게 숫자를 가림
      ringEl.style.setProperty('--ring-pct', '0%');
      ringEl.style.setProperty('--ring-color', '#8b949e');
      ringEl.style.display = 'flex';
      if (pctEl) pctEl.textContent = '?';
      ringEl.title = '팟 오즈를 먼저 계산해 보세요: 콜 ÷ (팟+콜)';
      return;
    }
    var pct = toCall / (state.pot + toCall) * 100;
    var color = pct < 25 ? '#52b75e' : pct < 40 ? '#e3b341' : '#f85149';
    ringEl.style.setProperty('--ring-pct', pct.toFixed(0) + '%');
    ringEl.style.setProperty('--ring-color', color);
    ringEl.style.display = 'flex';
    if (pctEl) pctEl.textContent = pct.toFixed(0) + '%';
    // 해석 1줄 (호버 툴팁) — 초보자용: 팟 오즈 = 콜에 필요한 최소 승률
    ringEl.title = '팟 오즈 ' + pct.toFixed(0) + '% = 콜 ' + toCall.toFixed(1) + 'bb ÷ (팟+콜), 내 승률이 '
      + pct.toFixed(0) + '% 이상이면 콜이 이득';
  }

  function applyGTOPreset() {
    if (!_lastEV || !_state) return;
    var best = _lastEV.bestAction;
    var amtMap = { raise_half: _lastEV.raiseHalfAmt, raise_pot: _lastEV.raisePotAmt, allin: _lastEV.allinAmt };
    if (amtMap[best] != null) {
      _setRaiseAmount(amtMap[best]);
      var slider = document.getElementById('raise-slider');
      var min = _state.minRaise, max = _maxTo();
      slider.value = max > min ? ((amtMap[best] - min) / (max - min)) * 100 : 0;
    }
    var targetId = best === 'fold' ? 'btn-fold' : best === 'call' ? 'btn-call' : 'btn-raise';
    ['btn-fold','btn-call','btn-raise'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove('gto-flash');
    });
    var target = document.getElementById(targetId);
    if (target) {
      target.classList.add('gto-flash');
      setTimeout(function(){ target.classList.remove('gto-flash'); }, 1200);
    }
    var reasons = EV.buildGTOReason(_state, _lastEV, _lastEQ);
    var reasonDiv = document.getElementById('gto-reason');
    if (reasonDiv && reasons.length) {
      reasonDiv.innerHTML = reasons.map(function(r){
        return '<div class="gto-reason-line">' + r + '</div>';
      }).join('');
      reasonDiv.style.display = 'block';
      var toggle = document.getElementById('gto-reason-toggle');
      if (toggle) toggle.textContent = '◀';
      var sliderSection = document.getElementById('raise-slider-section');
      if (sliderSection) sliderSection.style.display = '';
    }
  }

  function closeGTOReason() {
    var reasonDiv = document.getElementById('gto-reason');
    if (reasonDiv) reasonDiv.style.display = 'none';
    var toggle = document.getElementById('gto-reason-toggle');
    if (toggle) toggle.textContent = '▶';
  }

  function toggleGTOReason() {
    var reasonDiv = document.getElementById('gto-reason');
    var toggle = document.getElementById('gto-reason-toggle');
    if (!reasonDiv) return;
    var isHidden = reasonDiv.style.display === 'none';
    if (isHidden && !reasonDiv.innerHTML.trim()) return; // 아직 세팅 안 됨
    reasonDiv.style.display = isHidden ? 'block' : 'none';
    if (toggle) toggle.textContent = isHidden ? '◀' : '▶';
  }

  function syncRaiseFromInput() {
    if (!_state) return;
    var input = document.getElementById('raise-amount');
    var amount = parseFloat(input.value) || _state.minRaise;
    var maxTo = _maxTo();
    amount = Math.max(_state.minRaise, Math.min(amount, maxTo));
    var pct = maxTo > 0 ? (amount / maxTo * 100).toFixed(0) : 0;
    document.getElementById('raise-stack-pct').textContent = '스택의 ' + pct + '%';
    var slider = document.getElementById('raise-slider');
    var min = _state.minRaise, max = maxTo;
    slider.value = max > min ? ((amount - min) / (max - min)) * 100 : 0;
  }

  // 레이즈 금액 ±1bb 스테퍼 (세로 폰 액션바의 −/+ 버튼) — 범위는 민레이즈~올인
  function stepRaise(dir) {
    if (!_state) return;
    var input = document.getElementById('raise-amount');
    if (!input) return;
    var v = (parseFloat(input.value) || _state.minRaise) + (dir < 0 ? -1 : 1);
    input.value = Math.max(_state.minRaise, Math.min(_maxTo(), v)).toFixed(1);
    syncRaiseFromInput();
  }

  function nextRound() {
    if (_practice) {
      // 연습 모드 종료 — 추이 클리어 후 진행 중이던 상태로 원복
      HUD.updatePracticeTrend([]);
      var resume = _practice.resume;
      _practice = null;
      if (!resume) {
        HistoryUI.open('menu');
        return;
      }
      _state = resume.state;
      _villainConfig = resume.villainConfig;
      _gtoMode = resume.gtoMode;
      _gtoRound = resume.gtoRound;
      _baseSeed = resume.baseSeed;
      _seed = resume.seed;
      _heroPos = resume.heroPos;
      _carryoverStacks = resume.carryoverStacks;
      _round = resume.round;
      // 원복된 _round/_gtoRound 기준으로 아래 기존 로직이 그대로 이어짐(fall-through)
    }
    // 여정 세션(미션 5핸드, 자유 3핸드 등) 분량을 채우면 세션 요약으로. 연습 ▶(연습 종료 후 원래 세션 복귀)에도 같은 판정
    if (typeof Journey !== 'undefined' && Journey.shouldEndSession && Journey.shouldEndSession()) { showSessionSummary(); return; }
    _round++;
    if (_gtoMode && _gtoRound < 3) {
      // GTO 루프: 같은 seed 재플레이 (카드 동일 — 빌런 확률 분기는 비결정)
      // 라운드 간 비교를 위해 스택도 초기화, 포지션 유지
      _gtoRound++;
      _seed = _baseSeed;
      _carryoverStacks = null;
      _newHand();
      return;
    }
    if (_gtoMode) {
      // 3라운드 묶음 종료 → 새 seed로 다음 묶음
      _gtoRound = 1;
      _baseSeed = Math.floor(Math.random() * 1000000);
      _seed = _baseSeed;
      _carryoverStacks = null;
    } else {
      _seed = Math.floor(Math.random() * 1000000);
      _carryoverStacks = _state ? JSON.parse(JSON.stringify(_state.stacks)) : null;
      // 캐시게임 자동 리바이: 100bb 미만이면 100bb로 탑업(100 초과는 유지)
      if (_carryoverStacks) {
        Object.keys(_carryoverStacks).forEach(function(n) {
          if (!(_carryoverStacks[n] >= 100)) _carryoverStacks[n] = 100;
        });
      }
    }
    if (_buildPlayersSpec(_villainConfig).length === 1) {
      _heroPos = (_heroPos === 'BTN') ? 'BB' : 'BTN';
    } else {
      var idx = _POS.indexOf(_heroPos);
      _heroPos = _POS[(idx - 1 + 6) % 6]; // BTN→CO→HJ→UTG→BB→SB→BTN
    }
    _newHand();
  }

  function _showResult() {
    var finalPot = _state.pot;
    var heroCardsSnap = (_state.heroCards||[]).slice();
    var boardSnap = (_state.board||[]).slice();
    var decisionsSnap = (_state.decisions||[]).slice();
    // 핸드 시작 스택(블라인드 포함 투입 전) → 정산 후와 비교해 순손익 계산
    var startStacks = {};
    (_state.names || Object.keys(_state.stacks || {})).forEach(function(n) {
      startStacks[n] = ((_state.stacks && _state.stacks[n]) || 0) + ((_state.totalContrib && _state.totalContrib[n]) || 0);
    });
    var result = GameState.resolveShowdown(_state);
    _state = result.newState;
    var heroNet = Math.round((((_state.stacks && _state.stacks.Hero) || 0) - (startStacks.Hero || 0)) * 100) / 100;
    Table.renderShowdown(result);
    setTimeout(function() {
      // 신호등 + 핸드 복기는 총평 패널에 통합 (연습 모드에서도 동일하게 렌더)
      if (typeof CoachUI !== 'undefined' && CoachUI.onHandEnd) CoachUI.onHandEnd({decisions:decisionsSnap, practice:!!_practice, gtoMode:_gtoMode, gtoRound:_gtoRound, sessionId:_sessionId});
      if (typeof Journey !== 'undefined' && Journey.onHandEnd) Journey.onHandEnd({ decisions: decisionsSnap, result: result, state: _state, net: heroNet, practice: !!_practice, gtoMode: _gtoMode, gtoRound: _gtoRound, heroPos: _heroPos, mode: _villainConfig, heroFolded: !!(_state.folded && _state.folded.Hero) });
      _renderHandSummary(result);
      // 액션바 교체
      var actionBar = document.getElementById('action-bar');
      if (actionBar) actionBar.style.display = 'none';
      var resultBar = document.getElementById('result-actions-bar');
      if (resultBar) resultBar.style.display = 'flex';
      var presetRow = document.getElementById('gto-preset-row');
      if (presetRow) presetRow.style.display = 'none';
      // 연습 중엔 [🔁 같은 핸드 다시][▶ 다음 핸드=종료]만 노출 — 히스토리/세션종료 숨김
      var histBtn = document.getElementById('btn-history');
      var endBtn = document.getElementById('btn-session-end');
      if (histBtn) histBtn.style.display = _practice ? 'none' : '';
      if (endBtn) endBtn.style.display = _practice ? 'none' : '';
      if (typeof MobileUI !== 'undefined' && MobileUI.onHandEnd) MobileUI.onHandEnd(); // 총평 탭 자동 펼침
      if (_practice) {
        // 연습 핸드는 localStorage·세션 기록 어디에도 남기지 않고 추이만 갱신
        _practice.attempts.push(_practiceAttempt(_practice.attempts.length + 1, decisionsSnap));
        HUD.updatePracticeTrend(_practice.attempts);
      } else {
        Storage.saveHandHistory(_state, result, { sessionId: _sessionId, mode: _villainConfig, heroPos: _heroPos,
          pot: finalPot, net: heroNet, gtoRound: _gtoMode ? _gtoRound : 0 });
        _sessionNet += heroNet;
        _sessionHands.push({
          num: _round, gtoRound: _gtoMode ? _gtoRound : null,
          heroCards: heroCardsSnap, board: boardSnap,
          pot: finalPot, heroWon: result.heroWon, showCards: result.showCards,
          winner: result.winner, handDescriptions: result.handDescriptions||{},
          decisions: decisionsSnap,
          seed: _state.seed, heroPos: _heroPos, mode: _villainConfig, net: heroNet,
          delta: _calcHandDelta(decisionsSnap), heroFolded: !!(_state.folded && _state.folded.Hero)
        });
        if (_gtoMode && _gtoRound === 3) _renderGtoLoopReport();
      }
    }, 800);
  }

  // 핸드 1회의 EV 손실 합계(bb) — 연습 모드 추이 표시용 순수 함수
  function _calcHandDelta(decisions) {
    return (decisions || []).reduce(function(s, d) {
      return s + ((d.actualEV || 0) - (d.bestEV || 0));
    }, 0);
  }

  // ── 손해 표기(M4-P9, 설계서 8.2절 6번): 고정 벌점(d.estimated)은 '(큰 실수)/(작은 실수)', bb 숫자는 EV 계산값에만 ──
  // 규칙은 CoachUI.decLoss/lossTally/lossTallyText/lossTallyLight 한 곳. CoachUI가 없으면 전부 EV 값으로 보는 예전 표기.
  function _cuFn(name) {
    return (typeof CoachUI !== 'undefined' && CoachUI && typeof CoachUI[name] === 'function') ? CoachUI[name] : null;
  }
  function _decLossOf(d) {
    var f = _cuFn('decLoss');
    return f ? f(d) : { delta: ((d && d.actualEV) || 0) - ((d && d.bestEV) || 0), est: false, label: '' };
  }
  function _tallyOf(decisions) {
    var f = _cuFn('lossTally');
    return f ? f(decisions) : { ev: _calcHandDelta(decisions), big: 0, small: 0, n: (decisions || []).length };
  }
  function _tallyText(t, digits, prefix) {
    var f = _cuFn('lossTallyText');
    if (f) return f(t, digits, prefix);
    var ev = (t && t.ev) || 0;
    return (prefix || '') + (ev >= 0 ? '+' : '') + ev.toFixed(digits) + 'bb';
  }
  function _tallyLight(t) {
    var f = _cuFn('lossTallyLight');
    if (f) return f(t);
    var ev = (t && t.ev) || 0;
    return ev >= -0.3 ? 'green' : ev >= -1.5 ? 'yellow' : 'red';
  }

  // 손 총평의 합계 줄과 결정별 줄(순수 함수, M4-P9). estimated가 없는 옛 기록은 예전 표기('Δ-2.0bb') 그대로.
  // 돌려줌: { total: { value, color, light } | null(결정 0개), rows: [줄 문자열], counts: { 패턴: 수 } }
  //   value 예: '+0.00bb', '-1.20bb', '큰 실수 1', '-1.20bb, 큰 실수 1, 작은 실수 2'
  //   줄 예: '🔴 [프리플랍] 레이즈 2.5bb (큰 실수) 레인지 차트 정답은 폴드: ...', '🟡 [리버] 콜 (Δ-1.2bb) 필요 승률 ...'
  function _handSummaryLines(decisions) {
    decisions = decisions || [];
    var SK = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버' };
    var AK = { fold: '폴드', check: '체크', call: '콜', raise: '레이즈', allin: '올인', bet: '벳' };
    var LI = { green: '🟢', yellow: '🟡', red: '🔴' };
    var COLOR = { green: '#52b75e', yellow: '#e3b341', red: '#f85149' };
    var out = { total: null, rows: [], counts: {} };
    if (!decisions.length) return out;
    var t = _tallyOf(decisions), light = _tallyLight(t);
    out.total = { value: _tallyText(t, 2, ''), color: COLOR[light] || COLOR.green, light: light };
    decisions.forEach(function(d) {
      var L = _decLossOf(d), delta = L.delta;
      var icon;
      if (d.light && LI[d.light]) icon = LI[d.light];
      else if (!d.actualEV && !d.bestEV) icon = '⚪';
      else icon = delta >= -0.3 ? '🟢' : delta >= -1.5 ? '🟡' : '🔴';
      if (d.pattern) out.counts[d.pattern] = (out.counts[d.pattern] || 0) + 1;
      var amt = (d.amount > 0) ? ' ' + d.amount + 'bb' : '';
      var dl = L.est ? (L.label ? ' ' + L.label : '') : (delta < 0 ? ' (Δ' + delta.toFixed(1) + 'bb)' : '');
      var why = d.why ? String(d.why) : '';
      if (why.length > 50) why = why.slice(0, 49) + '…';
      // 콜 금액 0에서 누른 폴드는 체크로 처리되지만 판정은 폴드 기준이라 그 뜻을 함께 적는다(체크했는데 '체크하세요'로 읽히지 않게)
      var act = (d.intended === 'fold' && d.action === 'check') ? '폴드(체크로 처리)' : (AK[d.action] || '액션');
      out.rows.push(icon + ' [' + (SK[d.street] || '') + '] ' + act + amt + dl + (why ? ' ' + why : ''));
    });
    return out;
  }

  // 손 총평의 다음 핸드 목표(순수 함수, M4-P9 리뷰): coachGoal(CoachUI.currentGoal) → Coach.goalFor(이 손의 패턴) → 예전 조언.
  // 패턴이 없는 실수(림퍼 뒤 아이솔 손 폴드 등)만 있는 손에 '🟢 이번 핸드는 정답!'이 붙어 '큰 실수 1'과 어긋나지 않게,
  // 합계 신호등(lines.total.light)이 초록이 아니면 정답 문구 대신 고쳐 보기 안내를 쓴다.
  var MISS_GOAL = '추천과 다른 결정의 이유를 다시 읽고 🔁 같은 핸드 다시로 고쳐 보기';
  function _handGoalText(lines, coachGoal, totalDelta) {
    var missed = !!(lines && lines.total && lines.total.light && lines.total.light !== 'green');
    var goal = coachGoal || '';
    if (!goal && typeof Coach !== 'undefined' && Coach.goalFor) goal = Coach.goalFor((lines && lines.counts) || {}, {}) || '';
    if (missed && goal.indexOf('🟢') === 0) goal = '';
    if (!goal) {
      var td = totalDelta || 0;
      goal = missed ? MISS_GOAL
        : td < -3 ? '에쿼티, 팟 오즈 반복 훈련' : td < -1 ? '아슬아슬한 스팟 집중 연습' : '지금처럼 결정 전에 필요 승률 vs 내 승률 떠올리기';
    }
    return goal;
  }

  // 연습 추이 1회 기록(순수 함수, M4-P9 리뷰): delta는 예전처럼 전체 Δ 합, text와 light는 손 총평과 같은 표기
  //   (고정 벌점은 '큰 실수 1', EV 손해만 bb). HUD.updatePracticeTrend가 text가 있으면 그걸 쓴다.
  function _practiceAttempt(n, decisions) {
    var t = _tallyOf(decisions);
    return { n: n, delta: _calcHandDelta(decisions), text: _tallyText(t, 2, ''), light: _tallyLight(t) };
  }

  // 세션 요약 핸드 카드의 손해 표기(순수 함수, M4-P9): 고정 벌점이 없으면 예전 'EV -2.0bb', 있으면 'EV -1.2bb, 큰 실수 1' 또는 '큰 실수 1'
  function _handLossText(hand) {
    var t = _tallyOf(hand && hand.decisions);
    if (!(t.big || t.small)) return 'EV ' + _signed(_handDeltaOf(hand || {})) + 'bb';
    return _tallyText(t, 1, 'EV ');
  }

  // ── 같은 핸드 반복 연습 모드 ──

  function startPractice(record) {
    if (_practice) return; // 연습 중 재진입 시 resume 스냅샷 유실 방지
    if (!record || record.seed == null) return;
    var resume = null;
    if (_state) {
      resume = {
        state: _state, villainConfig: _villainConfig, gtoMode: _gtoMode, gtoRound: _gtoRound,
        baseSeed: _baseSeed, seed: _seed, heroPos: _heroPos,
        carryoverStacks: _carryoverStacks, round: _round
      };
    }
    var heroPos = record.heroPos || _heroPos || 'BTN';
    var config = record.mode || _villainConfig || 'sixmax';
    _practice = { seed: record.seed, heroPos: heroPos, config: config, attempts: [], resume: resume };
    _gtoMode = false; // 연습은 항상 일반 모드
    _seed = record.seed;
    _heroPos = heroPos;
    _villainConfig = config;
    _carryoverStacks = null; // 기본 100bb
    // 에쿼티 오버레이 강제 표시 (toggleEquity와 동일한 방식으로 상태 동기화)
    var panel = document.getElementById('equity-overlay');
    var toggleBtn = document.getElementById('equity-toggle');
    if (panel) panel.style.display = 'flex';
    if (toggleBtn) toggleBtn.classList.add('active');
    // GTO 차트 panel-closed 클래스 동기화 (패널 겹침 방지)
    var chartEl = document.getElementById('gto-chart');
    if (chartEl) chartEl.classList.remove('panel-closed');
    showScreen('screen-game');
    _newHand();
    _showToast('🔁 연습 모드, 같은 카드 반복 (빌런 반응은 달라질 수 있음)');
  }

  function practiceSame() {
    if (_practice) {
      // 재시도: 같은 seed로 다시
      _seed = _practice.seed;
      _carryoverStacks = null;
      _newHand();
    } else {
      // 비활성 상태에서 결과바 🔁 클릭 — 방금 끝난 핸드로 연습 진입
      startPractice({ seed: _state ? _state.seed : null, heroPos: _heroPos, mode: _villainConfig });
    }
  }

  function _showToast(msg) {
    var old = document.getElementById('app-toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.id = 'app-toast';
    t.textContent = msg;
    t.style.cssText = 'position:fixed;top:14%;left:50%;transform:translateX(-50%);background:rgba(20,20,30,0.95);color:#e3b341;border:1px solid #e3b341;border-radius:6px;padding:8px 18px;z-index:500;font-size:0.9rem;pointer-events:none';
    document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 2200);
  }

  // ── 핸드 리뷰 화면 진입 (ui/history.js HistoryUI가 렌더링 담당) ──
  function showHistory() {
    var from = document.getElementById('screen-game').classList.contains('active') ? 'game' : 'menu';
    HistoryUI.open(from);
  }

  // GTO 3회 반복 종료 리포트 — 같은 카드 3회의 라운드별 EV 편차 비교 (신호등)
  function _renderGtoLoopReport() {
    var panel = document.getElementById('gto-commentary');
    if (!panel) return;
    var rounds = _sessionHands.slice(-3);
    var labels = ['1회(일반)', '2회(가이드)', '3회(측정)'];
    var html = ['<div class="gto-loop-report" style="margin-top:8px;border-top:1px solid #30363d;padding-top:6px">',
      '<div><b>🔁 같은 카드 3회 반복 리포트</b></div>'];
    var ICON = { green: '🟢', yellow: '🟡', red: '🔴' };
    rounds.forEach(function(h, i) {
      // 고정 벌점은 '큰 실수/작은 실수'로 세고 EV 편차 bb는 EV 계산값만(M4-P9). 고정 벌점이 없으면 예전 표기와 같다.
      var t = _tallyOf(h.decisions);
      html.push('<div>' + ICON[_tallyLight(t)] + ' ' + (labels[i] || ('' + (i + 1) + '회')) + ': EV 편차 '
        + _tallyText(t, 2, '') + '</div>');
    });
    html.push('</div>');
    panel.innerHTML += html.join('');
    panel.style.display = 'flex';
  }

  function _renderHandSummary(result) {
    var panel = document.getElementById('gto-commentary');
    if (!panel) return;
    var decisions = _state.decisions || [];
    var totalDelta = decisions.reduce(function(s, d) { return s + ((d.actualEV || 0) - (d.bestEV || 0)); }, 0);

    var heroFolded = _state.folded && _state.folded['Hero'];
    var dotColor = heroFolded ? '#8b949e' : (result.heroWon ? '#52b75e' : '#f85149');
    var signalLabel = heroFolded ? '폴드' : (result.heroWon ? '승리' : '패배');

    // 카드 + 보드
    var cardsHtml = '히어로: ' + _renderCards(_state.heroCards || []);
    if (_state.board && _state.board.length > 0) {
      cardsHtml += ' <span style="color:#30363d;padding:0 4px">|</span> 보드: ' + _renderCards(_state.board);
    }

    // 쇼다운 시 양측 족보 표시
    var winnerHtml = '';
    if (result.showCards) {
      var heroHand = result.handDescriptions && result.handDescriptions['Hero'];
      var winnerHand = result.winner && result.handDescriptions && result.handDescriptions[result.winner];
      var descParts = [];
      if (heroHand) descParts.push('히어로: ' + heroHand);
      if (winnerHand && result.winner !== 'Hero') descParts.push(result.winner + ': ' + winnerHand);
      winnerHtml = '<div class="review-line" style="color:#8b949e;font-size:0.78rem">' +
        descParts.join(' vs ') + '</div>';
    }

    // 결정별 신호등 행 (영문 키 노출 금지, 전부 한국어로). 줄 문구는 순수 함수 _handSummaryLines(M4-P9)
    var lines = _handSummaryLines(decisions);
    var handCounts = lines.counts;
    var rows = '';
    if (!lines.total) {
      rows = '<div class="review-line" style="font-size:.8rem;line-height:1.5">상대가 모두 폴드해 내가 결정할 필요가 없던 핸드</div>';
    } else {
      rows += '<div class="review-line review-gto-line">정답 대비 <span style="color:' + lines.total.color + '">' +
        lines.total.value + '</span> (' + decisions.length + '회 결정)</div>';
      lines.rows.forEach(function(r) {
        rows += '<div class="review-line" style="font-size:.8rem;line-height:1.5">' + r + '</div>';
      });
    }

    // 다음 핸드 목표: CoachUI(WP3) → Coach.goalFor → 기존 조언(순수 함수 _handGoalText)
    var goal = _handGoalText(lines, (typeof CoachUI !== 'undefined' && CoachUI.currentGoal && CoachUI.currentGoal()) || '', totalDelta);

    panel.style.display = 'flex';
    panel.innerHTML =
      '<div class="hand-result-layout">' +
        '<div class="hand-result-signal">' +
          '<div class="result-dot-lg" style="background:' + dotColor + ';box-shadow:0 0 10px ' + dotColor + '"></div>' +
          '<div class="result-signal-label">' + signalLabel + '</div>' +
        '</div>' +
        '<div class="hand-result-review">' +
          '<div class="review-line review-cards-line">' + cardsHtml + '</div>' +
          winnerHtml +
          rows +
          '<div class="review-line review-advice-line">🎯 다음 핸드 목표: ' + goal + '</div>' +
        '</div>' +
      '</div>';
    if (typeof ThinkingUI !== 'undefined') ThinkingUI.onHandEnd(_state, result); // WP8 리플레이 append
  }

  function _renderCards(cards) {
    var SYM = { s:'♠', h:'♥', d:'♦', c:'♣' }, RED = { h:true, d:true };
    return (cards||[]).map(function(c) {
      var r = c.rank==='T'?'10':c.rank;
      return '<span style="color:'+(RED[c.suit]?'#f85149':'#e6edf3')+';font-weight:bold">'+r+SYM[c.suit]+'</span>';
    }).join(' ');
  }

  function _renderDecisions(decisions) {
    var sKor = { preflop:'PF', flop:'F', turn:'T', river:'R' };
    var aKor = { fold:'폴드', call:'콜', check:'체크', raise:'레이즈', allin:'올인', '3bet':'3벳', bet:'벳' };
    var byStreet = {};
    (decisions||[]).forEach(function(d) { (byStreet[d.street]=byStreet[d.street]||[]).push(aKor[d.action]||d.action); });
    var parts = ['preflop','flop','turn','river'].filter(function(s){ return byStreet[s]; })
      .map(function(s){ return sKor[s]+': '+byStreet[s].join('/'); });
    return parts.length ? parts.join(' → ') : '결정 없음';
  }

  function _handComment(hand) {
    var actions = (hand.decisions||[]).map(function(d){ return d.action; });
    var last = hand.decisions && hand.decisions[hand.decisions.length-1];
    var lastStreet = last ? last.street : 'preflop';
    var raiseCount = actions.filter(function(a){ return a==='raise'||a==='allin'||a==='3bet'; }).length;
    var sKor = { preflop:'프리플랍', flop:'플랍', turn:'턴', river:'리버' };
    var heroDesc = hand.handDescriptions && hand.handDescriptions['Hero'];
    var winnerDesc = hand.handDescriptions && hand.winner && hand.handDescriptions[hand.winner];
    if (hand.heroWon && !hand.showCards)
      return raiseCount>=1 ? '베팅 압박으로 상대 폴드 유도, 공격적 라인 성공' : '상대 폴드로 팟 쟁취';
    if (hand.heroWon && hand.showCards)
      return '쇼다운 승리'+(heroDesc?' ('+heroDesc+')':'')+', 밸류 추출 성공';
    if (!hand.heroWon && last && last.action==='fold')
      return (sKor[lastStreet]||lastStreet)+' 폴드, 에쿼티 부족 판단';
    if (!hand.heroWon && hand.showCards)
      return '쇼다운 패배'+(heroDesc?' ('+heroDesc+')':'')+(winnerDesc?' vs '+winnerDesc:'')+', 핸드 상성 불리';
    return hand.pot>=20 ? '빅팟 핸드, 핵심 의사결정 스팟' : '표준 플레이';
  }

  // 결정 1개의 신호등: light 우선, 없으면 Δ 임계(≥-0.3 green, ≥-1.5 yellow, 그 외 red)
  function _decLight(d) {
    if (d && (d.light === 'green' || d.light === 'yellow' || d.light === 'red')) return d.light;
    var delta = ((d && d.actualEV) || 0) - ((d && d.bestEV) || 0);
    return delta >= -0.3 ? 'green' : delta >= -1.5 ? 'yellow' : 'red';
  }

  // 세션 집계(순수 함수): 승/폴드/패 + 결정 신호등 분포 + EV 편차 + 칩 손익
  // M4-P9: evDelta는 EV로 계산한 결정만 더하고, 고정 벌점(d.estimated)은 big/small(큰 실수, 작은 실수 수)로 센다.
  function _sessionStats(hands) {
    var st = { hands: 0, showdownWins: 0, folds: 0, losses: 0, green: 0, yellow: 0, red: 0, decisions: 0, evDelta: 0, net: 0,
      big: 0, small: 0 };
    (hands || []).forEach(function(h) {
      st.hands++;
      if (h.heroWon) st.showdownWins++;
      else if (h.heroFolded) st.folds++;
      else st.losses++;
      (h.decisions || []).forEach(function(d) {
        st.decisions++;
        st[_decLight(d)]++;
      });
      var t = _tallyOf(h.decisions);
      st.evDelta += t.ev;
      st.big += t.big;
      st.small += t.small;
      st.net += (h.net || 0);
    });
    st.evDelta = Math.round(st.evDelta * 100) / 100;
    st.net = Math.round(st.net * 100) / 100;
    return st;
  }

  function _signed(v) { return (v > 0 ? '+' : v < 0 ? '-' : '±') + Math.abs(v).toFixed(1); }

  function _handDeltaOf(h) { return h.delta != null ? h.delta : _calcHandDelta(h.decisions); }

  // 세션 요약 통계 줄의 손해 부분(순수 함수, M4-P9): EV 편차(bb, EV 계산값만)와 고정 벌점 개수.
  // 고정 벌점이 없으면 예전 'EV 편차 -1.2bb', 있고 EV 편차가 0이면 bb 숫자를 뺀다(lossTallyText와 같은 규칙).
  function _sessionLossText(st) {
    st = st || {};
    var ev = st.evDelta || 0, parts = [];
    if (!(st.big || st.small) || Math.abs(ev) >= 0.05) parts.push('EV 편차 ' + _signed(ev) + 'bb');
    if (st.big) parts.push('큰 실수 ' + st.big);
    if (st.small) parts.push('작은 실수 ' + st.small);
    return parts.join(', ');
  }

  function _renderSessionSummary() {
    var statsEl = document.getElementById('summary-stats');
    var handsEl = document.getElementById('summary-hands');
    if (!handsEl) return;
    var st = _sessionStats(_sessionHands);
    var goal = (typeof CoachUI !== 'undefined' && CoachUI.currentGoal) ? CoachUI.currentGoal() : '';
    if (statsEl) {
      statsEl.innerHTML =
        (goal ? '<div style="color:#e3b341;font-size:0.9rem;margin-bottom:0.5rem">🎯 다음 목표: ' + goal + '</div>' : '') +
        '<div>' + st.hands + '핸드 | 승 ' + st.showdownWins + ', 폴드 ' + st.folds + ', 패 ' + st.losses +
        ' | 결정 🟢' + st.green + ' 🟡' + st.yellow + ' 🔴' + st.red +
        ' | ' + _sessionLossText(st) +
        ' | 칩 손익 ' + _signed(st.net) + 'bb</div>' +
        '<div style="font-size:0.75rem;margin-top:0.3rem">EV 편차는 추천 결정 대비 잃은 기대값의 합이에요(0에 가까울수록 좋아요). ' +
        (st.big || st.small ? '차트나 가이드로 판정한 실수는 bb 대신 큰 실수, 작은 실수로 셌어요. ' : '') +
        '칩 손익에는 운이 섞여 있어요.</div>';
    }
    if (!st.decisions) {
      handsEl.innerHTML = '<div style="text-align:center;color:#8b949e;padding:1rem">평가할 결정이 없었어요</div>';
      return;
    }
    var ICON = { green: '🟢', yellow: '🟡', red: '🔴' };
    var top = _sessionHands.filter(function(h) { return _handDeltaOf(h) < -0.001; })
      .sort(function(a, b) { return _handDeltaOf(a) - _handDeltaOf(b); })
      .slice(0, 3);
    if (!top.length) {
      handsEl.innerHTML = '<div style="text-align:center;color:#3fb950;padding:1rem">큰 실수 없이 끝난 세션이에요</div>';
      return;
    }
    handsEl.innerHTML = '<div style="color:#8b949e;font-size:0.8rem;margin-bottom:0.5rem">손실이 컸던 핸드 (같은 카드로 다시 풀어 보세요)</div>' +
      top.map(function(hand) {
        var wc = hand.heroWon ? '#ffd700' : (hand.heroFolded ? '#8b949e' : '#f85149');
        var wt = hand.heroWon ? '🏆 승리' : (hand.heroFolded ? '🏳 폴드' : '❌ 패배');
        var lights = (hand.decisions || []).map(function(d) { return ICON[_decLight(d)]; }).join('');
        var replay = (hand.seed != null)
          ? '<button class="menu-btn" style="margin-top:0.5rem;font-size:0.8rem;padding:0.4rem 0.8rem" onclick="App.startPractice({seed:' + Number(hand.seed) +
            ', heroPos:\'' + String(hand.heroPos || 'BTN').replace(/[^A-Z]/g, '') +
            '\', mode:\'' + String(hand.mode || 'sixmax').replace(/[^a-z0-9-]/g, '') + '\'})">🔁 이 핸드 다시 풀기</button>'
          : '';
        return '<div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:0.9rem;margin-bottom:0.9rem">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:0.4rem">' +
            '<span style="color:#8b949e;font-size:0.8rem">핸드 #' + hand.num + ' ' + lights + '</span>' +
            '<span style="color:' + wc + ';font-weight:bold;font-size:0.85rem">' + wt + '</span>' +
            '<span style="color:#f85149;font-size:0.8rem">' + _handLossText(hand) + '</span>' +
          '</div>' +
          '<div style="margin-bottom:0.3rem;font-size:0.9rem">히어로: ' + _renderCards(hand.heroCards) +
            (hand.board.length ? '  <span style="color:#8b949e">|</span>  보드: ' + _renderCards(hand.board) : '') +
          '</div>' +
          '<div style="color:#8b949e;font-size:0.78rem;margin-bottom:0.4rem">' + _renderDecisions(hand.decisions) + '</div>' +
          '<div style="color:#e3b341;font-size:0.82rem">💬 ' + _handComment(hand) + '</div>' +
          replay +
        '</div>';
      }).join('');
  }

  function showSessionSummary() {
    if (!_sessionHands.length) { showMenu(); return; }
    _renderSessionSummary();
    showScreen('screen-session-summary');
    _state = null; // 종료한 세션이 연습 resume으로 되살아나지 않게
  }

  function startScenario() {
    var progress = Storage.getProgress();
    if (!progress.currentSession || progress.currentSession < 2) {
      if (!confirm('먼저 세션 1~3을 완료하면 더 유익해요. 지금 진행할까요?')) return;
    }
    Quiz.start(progress);
    showScreen('screen-scenario');
  }

  function nextScenario() { Quiz.next(); }

  function startCurriculum() {
    var progress = Storage.getProgress();
    Session.load(progress.currentSession || 1);
    showScreen('screen-curriculum');
  }

  return {
    showMenu: showMenu,
    showScreen: showScreen,
    toggleEquity: toggleEquity,
    startGame: startGame,
    selectVillains: selectVillains,
    heroAction: heroAction,
    updateRaiseSlider: updateRaiseSlider,
    setRaisePreset: setRaisePreset,
    syncRaiseFromInput: syncRaiseFromInput,
    stepRaise: stepRaise,
    nextRound: nextRound,
    showHistory: showHistory,
    showSessionSummary: showSessionSummary,
    _sessionStats: _sessionStats,
    applyGTOPreset: applyGTOPreset,
    closeGTOReason: closeGTOReason,
    toggleGTOReason: toggleGTOReason,
    startScenario: startScenario,
    nextScenario: nextScenario,
    startCurriculum: startCurriculum,
    startPractice: startPractice,
    _normalizeHeroAction: _normalizeHeroAction,
    practiceSame: practiceSame,
    _calcHandDelta: _calcHandDelta,
    _handSummaryLines: _handSummaryLines,
    _gtoPreflopHintText: _gtoPreflopHintText,
    _handLossText: _handLossText,
    _sessionLossText: _sessionLossText,
    _practiceAttempt: _practiceAttempt,
    _handGoalText: _handGoalText,
    _curriculumSpotKey: _curriculumSpotKey
  };
})();
