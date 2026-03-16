(function () {
  const EVAL_PERSPECTIVE = 'w';

  const state = {
    analysis: null,
    selectedIndex: -1,
    viewerColor: null,
    playTimerId: null,
    boardFlipped: false,
  };

  const elements = {
    pgnInput: document.getElementById('pgnInput'),
    depthInput: document.getElementById('depthInput'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    statusText: document.getElementById('statusText'),
    progressBar: document.getElementById('progressBar'),
    board: document.getElementById('board'),
    moveList: document.getElementById('moveList'),
    evalChart: document.getElementById('evalChart'),
    evalDisplay: document.getElementById('evalDisplay'),
    evalBarFill: document.getElementById('evalBarFill'),
    flipBoardBtn: document.getElementById('flipBoardBtn'),
    boardPlayerTop: document.getElementById('boardPlayerTop'),
    boardPlayerBottom: document.getElementById('boardPlayerBottom'),
    firstBtn: document.getElementById('firstBtn'),
    prevBtn: document.getElementById('prevBtn'),
    playBtn: document.getElementById('playBtn'),
    nextBtn: document.getElementById('nextBtn'),
    lastBtn: document.getElementById('lastBtn'),
    detailSan: document.getElementById('detailSan'),
    detailLabel: document.getElementById('detailLabel'),
    detailCpl: document.getElementById('detailCpl'),
    detailBest: document.getElementById('detailBest'),
    detailEvalBefore: document.getElementById('detailEvalBefore'),
    detailEvalAfter: document.getElementById('detailEvalAfter'),
  };

  function resolvePlayerInfo(result) {
    const game = result?.game ?? {};
    const headers = game.headers ?? {};
    const white = (game.white ?? headers.White ?? 'Unknown').toString().trim() || 'Unknown';
    const black = (game.black ?? headers.Black ?? 'Unknown').toString().trim() || 'Unknown';
    const whiteElo = (headers.WhiteElo ?? game.whiteElo ?? '').toString().trim();
    const blackElo = (headers.BlackElo ?? game.blackElo ?? '').toString().trim();
    return {
      white,
      black,
      whiteElo: whiteElo.length > 0 ? whiteElo : '-',
      blackElo: blackElo.length > 0 ? blackElo : '-',
    };
  }

  function renderBoardPlayers(result) {
    if (!elements.boardPlayerTop || !elements.boardPlayerBottom) {
      return;
    }

    const playerInfo = resolvePlayerInfo(result);
    if (state.boardFlipped) {
      elements.boardPlayerTop.textContent = `${playerInfo.white} (${playerInfo.whiteElo})`;
      elements.boardPlayerBottom.textContent = `${playerInfo.black} (${playerInfo.blackElo})`;
      return;
    }

    elements.boardPlayerTop.textContent = `${playerInfo.black} (${playerInfo.blackElo})`;
    elements.boardPlayerBottom.textContent = `${playerInfo.white} (${playerInfo.whiteElo})`;
  }

  function getJobIdFromPath() {
    const match = window.location.pathname.match(/^\/analysis\/([a-zA-Z0-9-]+)$/);
    return match ? match[1] : null;
  }

  function buildProcessedPgnFromMoves(moves) {
    if (!Array.isArray(moves) || moves.length === 0) {
      return '';
    }

    const parts = [];
    for (let index = 0; index < moves.length; index += 1) {
      const move = moves[index];
      if (!move || typeof move.san !== 'string' || move.san.trim().length === 0) {
        continue;
      }

      if (index % 2 === 0) {
        parts.push(`${Math.floor(index / 2) + 1}. ${move.san.trim()}`);
      } else {
        parts.push(move.san.trim());
      }
    }

    return parts.join(' ').trim();
  }

  function applyAnalysisResult(result, viewer) {
    state.analysis = result;
    state.viewerColor = EVAL_PERSPECTIVE;
    state.selectedIndex = result.moves.length > 0 ? 0 : -1;
    state.boardFlipped = viewer?.boardFlipped === true;
    renderBoardPlayers(result);

    if (typeof result.pgn === 'string' && result.pgn.trim().length > 0) {
      elements.pgnInput.value = result.pgn;
    } else {
      const processedPgn = buildProcessedPgnFromMoves(result.moves);
      if (processedPgn) {
        elements.pgnInput.value = processedPgn;
      }
    }

    if (state.selectedIndex >= 0) {
      setProgress(100);
      renderStep();
      return;
    }

    setStatus('Analysis completed with no moves.');
    updateNavigationButtons(0);
  }

  function setStatus(text) {
    elements.statusText.textContent = text;
  }

  function setProgress(percent) {
    elements.progressBar.style.width = `${percent}%`;
  }

  function landingSquareFromUci(uciMove) {
    if (typeof uciMove !== 'string' || uciMove.length < 4) {
      return null;
    }

    const toSquare = uciMove.slice(2, 4).toLowerCase();
    return /^[a-h][1-8]$/.test(toSquare) ? toSquare : null;
  }

  function boardIndexFromSquare(square) {
    if (!square || square.length !== 2) {
      return -1;
    }

    const file = square.charCodeAt(0) - 97;
    const rank = Number.parseInt(square[1], 10);
    if (file < 0 || file > 7 || rank < 1 || rank > 8) {
      return -1;
    }

    const row = 8 - rank;
    return row * 8 + file;
  }

  function squaresFromUci(uciMove) {
    if (typeof uciMove !== 'string' || uciMove.length < 4) {
      return null;
    }

    const fromSquare = uciMove.slice(0, 2).toLowerCase();
    const toSquare = uciMove.slice(2, 4).toLowerCase();
    if (!/^[a-h][1-8]$/.test(fromSquare) || !/^[a-h][1-8]$/.test(toSquare)) {
      return null;
    }

    return { fromSquare, toSquare };
  }

  function boardHighlightClassFromLabel(label) {
    if (!label) {
      return '';
    }

    const normalized = label.trim().toLowerCase();
    if (normalized === 'blunder') {
      return 'move-land-blunder';
    }

    if (normalized === 'mistake') {
      return 'move-land-mistake';
    }

    if (normalized === 'inaccuracy') {
      return 'move-land-inaccuracy';
    }

    if (normalized === 'excellent' || normalized === 'exccelent') {
      return 'move-land-excellent';
    }

    return '';
  }

  function renderBoard(fen, highlightSquare, highlightFromSquare, highlightClass, bestMoveSquares) {
    const squares = window.UiHelpers.boardFromFen(fen);
    const files = state.boardFlipped
      ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']
      : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const highlightIndex = boardIndexFromSquare(highlightSquare);
    const highlightFromIndex = boardIndexFromSquare(highlightFromSquare);
    const bestFromIndex = boardIndexFromSquare(bestMoveSquares?.fromSquare ?? null);
    const bestToIndex = boardIndexFromSquare(bestMoveSquares?.toSquare ?? null);
    elements.board.innerHTML = '';

    for (let displayIndex = 0; displayIndex < squares.length; displayIndex += 1) {
      const row = Math.floor(displayIndex / 8);
      const col = displayIndex % 8;
      const sourceRow = state.boardFlipped ? 7 - row : row;
      const sourceCol = state.boardFlipped ? 7 - col : col;
      const sourceIndex = sourceRow * 8 + sourceCol;
      const square = document.createElement('div');
      square.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;

      if (highlightIndex === sourceIndex && highlightClass) {
        square.classList.add(highlightClass);
      }

      if (highlightFromIndex === sourceIndex && highlightClass) {
        square.classList.add(highlightClass);
      }

      if (bestFromIndex === sourceIndex) {
        square.classList.add('move-best-from');
      }

      if (bestToIndex === sourceIndex) {
        square.classList.add('move-best-to');
      }

      square.textContent = squares[sourceIndex] || '';

      if (col === 0) {
        const rankLabel = document.createElement('span');
        rankLabel.className = 'coord-label rank-label';
        rankLabel.textContent = String(state.boardFlipped ? row + 1 : 8 - row);
        square.appendChild(rankLabel);
      }

      if (row === 7) {
        const fileLabel = document.createElement('span');
        fileLabel.className = 'coord-label file-label';
        fileLabel.textContent = files[col];
        square.appendChild(fileLabel);
      }

      elements.board.appendChild(square);
    }
  }

  function renderChart(moves, selectedIndex) {
    const width = 600;
    const height = 180;
    const maxAbs = 1000;
    const points = moves.map((move, index) => {
      const x = moves.length === 1 ? width / 2 : (index / (moves.length - 1)) * width;
      const rawY = window.UiHelpers.evalToNumberForPerspective(move.evalAfter, state.viewerColor, move.color);
      const bounded = Math.max(-maxAbs, Math.min(maxAbs, rawY));
      const y = ((maxAbs - bounded) / (2 * maxAbs)) * height;
      return `${x},${y}`;
    });

    const selectedMove = moves[selectedIndex];
    const selectedX = moves.length === 1 ? width / 2 : (selectedIndex / (moves.length - 1)) * width;
    const selectedYRaw = window.UiHelpers.evalToNumberForPerspective(
      selectedMove.evalAfter,
      state.viewerColor,
      selectedMove.color,
    );
    const selectedYBounded = Math.max(-maxAbs, Math.min(maxAbs, selectedYRaw));
    const selectedY = ((maxAbs - selectedYBounded) / (2 * maxAbs)) * height;

    elements.evalChart.innerHTML = `
      <line x1="0" y1="90" x2="600" y2="90" stroke="#6b7280" stroke-width="1"></line>
      <polyline fill="none" stroke="#22c55e" stroke-width="2" points="${points.join(' ')}"></polyline>
      <circle cx="${selectedX}" cy="${selectedY}" r="4" fill="#f59e0b"></circle>
    `;
  }

  function updateEvalBar(move) {
    const maxAbs = 1000;
    const rawEval = window.UiHelpers.evalToNumberForPerspective(move.evalAfter, state.viewerColor, move.color);
    const bounded = Math.max(-maxAbs, Math.min(maxAbs, rawEval));

    // Positive = white advantage in normal orientation, inverted when board is flipped.
    const normalPercentage = ((maxAbs + bounded) / (2 * maxAbs)) * 100;
    const percentage = state.boardFlipped ? 100 - normalPercentage : normalPercentage;

    elements.evalBarFill.style.setProperty('--eval-percent', `${percentage}%`);
  }

  function toggleBoardOrientation() {
    state.boardFlipped = !state.boardFlipped;

    if (state.analysis) {
      renderBoardPlayers(state.analysis);
    }

    if (state.analysis && state.selectedIndex >= 0) {
      renderStep();
    }
  }

  function qualityClassFromLabel(label) {
    if (!label) {
      return '';
    }

    const normalized = label.trim().toLowerCase();
    const map = {
      blunder: 'blunder',
      mistake: 'mistake',
      inaccuracy: 'inaccuracy',
      excellent: 'excellent',
      exccelent: 'excellent',
      best: 'best',
      good: 'good',
    };

    return map[normalized] ?? '';
  }

  function renderMoveList(moves, selectedIndex) {
    const rows = window.UiHelpers.buildMoveRows(moves, state.viewerColor);
    elements.moveList.innerHTML = '';

    rows.forEach((row, rowIndex) => {
      const rowItem = document.createElement('li');
      rowItem.className = 'move-row';

      // White move
      const whiteMove = document.createElement('span');
      const whiteQuality = qualityClassFromLabel(row.white.label);
      whiteMove.className = `move-item move-white ${whiteQuality ? `move-quality-${whiteQuality}` : ''} ${row.white.index === selectedIndex ? 'active' : ''}`;
      whiteMove.innerHTML = `<span class="move-number">${row.moveNumber}.</span><span class="move-pill">${row.white.san}</span><span class="move-meta">| ${row.white.evalText} | ${row.white.label}</span>`;
      whiteMove.dataset.moveIndex = row.white.index;
      whiteMove.addEventListener('click', () => {
        stopAutoplay();
        state.selectedIndex = row.white.index;
        renderStep();
      });
      rowItem.appendChild(whiteMove);

      // Black move (if exists)
      if (row.black) {
        const blackMove = document.createElement('span');
        const blackQuality = qualityClassFromLabel(row.black.label);
        blackMove.className = `move-item move-black ${blackQuality ? `move-quality-${blackQuality}` : ''} ${row.black.index === selectedIndex ? 'active' : ''}`;
        blackMove.innerHTML = `<span class="move-pill">${row.black.san}</span><span class="move-meta">| ${row.black.evalText} | ${row.black.label}</span>`;
        blackMove.dataset.moveIndex = row.black.index;
        blackMove.addEventListener('click', () => {
          stopAutoplay();
          state.selectedIndex = row.black.index;
          renderStep();
        });
        rowItem.appendChild(blackMove);
      }

      elements.moveList.appendChild(rowItem);
    });

    requestAnimationFrame(() => {
      centerActiveMoveInList(selectedIndex);
    });
  }

  function centerActiveMoveInList(selectedIndex) {
    if (selectedIndex < 0) {
      return;
    }

    const activeItem = document.querySelector(`span[data-move-index="${selectedIndex}"]`);
    if (!activeItem) {
      return;
    }

    const listRect = elements.moveList.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();
    const relativeItemTop = itemRect.top - listRect.top + elements.moveList.scrollTop;
    const targetTop = relativeItemTop - (elements.moveList.clientHeight / 2 - activeItem.clientHeight / 2);
    const maxTop = Math.max(0, elements.moveList.scrollHeight - elements.moveList.clientHeight);
    const clampedTop = Math.max(0, Math.min(targetTop, maxTop));
    elements.moveList.scrollTop = clampedTop;
  }

  function stopAutoplay() {
    if (state.playTimerId !== null) {
      clearInterval(state.playTimerId);
      state.playTimerId = null;
    }
  }

  function updateNavigationButtons(movesLength) {
    const hasMoves = movesLength > 0 && state.selectedIndex >= 0;
    const atStart = !hasMoves || state.selectedIndex <= 0;
    const atEnd = !hasMoves || state.selectedIndex >= movesLength - 1;

    elements.firstBtn.disabled = atStart;
    elements.prevBtn.disabled = atStart;
    elements.nextBtn.disabled = atEnd;
    elements.lastBtn.disabled = atEnd;
    elements.playBtn.disabled = !hasMoves;
    elements.playBtn.textContent = state.playTimerId === null ? '▶' : '⏸';
  }

  function playMoves() {
    if (!state.analysis || state.analysis.moves.length === 0) {
      return;
    }

    if (state.selectedIndex >= state.analysis.moves.length - 1) {
      state.selectedIndex = 0;
      renderStep();
    }

    if (state.playTimerId !== null) {
      stopAutoplay();
      updateNavigationButtons(state.analysis.moves.length);
      return;
    }

    state.playTimerId = setInterval(() => {
      if (!state.analysis || state.selectedIndex >= state.analysis.moves.length - 1) {
        stopAutoplay();
        renderStep();
        return;
      }

      state.selectedIndex += 1;
      renderStep();
    }, 1000);

    updateNavigationButtons(state.analysis.moves.length);
  }

  function isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    const tagName = target.tagName.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || target.isContentEditable;
  }

  function handleKeyboardNavigation(event) {
    if (isTypingTarget(event.target) || !state.analysis) {
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (state.selectedIndex > 0) {
        stopAutoplay();
        state.selectedIndex -= 1;
        renderStep();
      }
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (state.selectedIndex < state.analysis.moves.length - 1) {
        stopAutoplay();
        state.selectedIndex += 1;
        renderStep();
      }
      return;
    }

    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      playMoves();
    }
  }

  function renderStep() {
    if (!state.analysis || state.selectedIndex < 0) {
      return;
    }

    const moves = state.analysis.moves;
    const move = moves[state.selectedIndex];
    const view = window.UiHelpers.stepView(move, state.selectedIndex, moves.length, state.viewerColor);
    const playedMoveSquares = squaresFromUci(move.uciMove);
    const landingSquare = playedMoveSquares?.toSquare ?? landingSquareFromUci(move.uciMove);
    const landingClass = boardHighlightClassFromLabel(move.label);
    const hintLabels = new Set(['inaccuracy', 'mistake', 'blunder']);
    const shouldShowBestMoveHint = move.label && hintLabels.has(move.label.trim().toLowerCase());
    const highlightFromSquare = shouldShowBestMoveHint ? playedMoveSquares?.fromSquare ?? null : null;
    const bestMoveSquares = shouldShowBestMoveHint ? squaresFromUci(move.bestMove) : null;

    elements.evalDisplay.textContent = view.evalDisplay;
    elements.detailSan.textContent = `SAN: ${view.details.san}`;
    elements.detailLabel.textContent = `Label: ${view.details.label}`;
    elements.detailCpl.textContent = `CPL: ${view.details.cpl}`;
    elements.detailBest.textContent = `Best Move: ${view.details.bestMove}`;
    elements.detailEvalBefore.textContent = `Eval Before: ${view.details.evalBefore}`;
    elements.detailEvalAfter.textContent = `Eval After: ${view.details.evalAfter}`;

    renderBoard(move.fenAfter, landingSquare, highlightFromSquare, landingClass, bestMoveSquares);
    renderMoveList(moves, state.selectedIndex);
    renderChart(moves, state.selectedIndex);
    updateEvalBar(move);
    updateNavigationButtons(moves.length);
  }

  async function pollResult(jobId) {
    for (;;) {
      const statusResponse = await fetch(`/api/analyze/${jobId}/status`);
      const status = await statusResponse.json();
      setProgress(status.progress ?? 0);
      setStatus(`State: ${status.state} (${status.progress ?? 0}%)`);

      if (status.state === 'failed') {
        throw new Error(status.error?.message ?? 'Analysis failed');
      }

      if (status.state === 'completed') {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  async function loadPersistedAnalysis(jobId) {
    const persistedResponse = await fetch(`/api/analysis/${jobId}`);

    if (persistedResponse.ok) {
      const payload = await persistedResponse.json();
      return {
        result: payload.result,
        viewer: payload.viewer ?? null,
      };
    }

    if (persistedResponse.status !== 404) {
      const payload = await persistedResponse.json().catch(() => ({}));
      throw new Error(payload?.error?.message ?? 'Failed to load persisted analysis');
    }

    const resultResponse = await fetch(`/api/analyze/${jobId}/result`);
    if (resultResponse.status === 202) {
      await pollResult(jobId);
      return loadPersistedAnalysis(jobId);
    }

    const payload = await resultResponse.json();
    if (!resultResponse.ok || !payload.result) {
      throw new Error(payload?.error?.message ?? 'Analysis was not found');
    }

    return {
      result: payload.result,
      viewer: payload.viewer ?? null,
    };
  }

  async function loadAnalysisFromPath(jobId) {
    elements.analyzeBtn.disabled = true;
    setStatus(`Loading analysis ${jobId}...`);
    setProgress(0);

    try {
      const loadedAnalysis = await loadPersistedAnalysis(jobId);
      applyAnalysisResult(loadedAnalysis.result, loadedAnalysis.viewer);
      setStatus(`Analysis loaded: ${jobId}`);
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      updateNavigationButtons(0);
    } finally {
      elements.analyzeBtn.disabled = false;
    }
  }

  async function runAnalysis() {
    const pgn = elements.pgnInput.value.trim();
    const depth = Number.parseInt(elements.depthInput.value, 10);

    if (!pgn) {
      setStatus('Please paste PGN first.');
      return;
    }

    elements.analyzeBtn.disabled = true;
    stopAutoplay();
    setStatus('Submitting analysis...');
    setProgress(0);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pgn,
          settings: { depth },
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json();
        throw new Error(errorPayload.error?.message ?? 'Failed to create analysis job');
      }

      const { jobId } = await response.json();
      await pollResult(jobId);
      setStatus('Analysis completed. Redirecting...');
      window.location.assign(`/analysis/${jobId}`);
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      elements.analyzeBtn.disabled = false;
    }
  }

  elements.analyzeBtn.addEventListener('click', () => {
    void runAnalysis();
  });

  elements.prevBtn.addEventListener('click', () => {
    if (!state.analysis || state.selectedIndex <= 0) {
      return;
    }

    stopAutoplay();
    state.selectedIndex -= 1;
    renderStep();
  });

  elements.nextBtn.addEventListener('click', () => {
    if (!state.analysis || state.selectedIndex >= state.analysis.moves.length - 1) {
      return;
    }

    stopAutoplay();
    state.selectedIndex += 1;
    renderStep();
  });

  elements.firstBtn.addEventListener('click', () => {
    if (!state.analysis || state.analysis.moves.length === 0) {
      return;
    }

    stopAutoplay();
    state.selectedIndex = 0;
    renderStep();
  });

  elements.lastBtn.addEventListener('click', () => {
    if (!state.analysis || state.analysis.moves.length === 0) {
      return;
    }

    stopAutoplay();
    state.selectedIndex = state.analysis.moves.length - 1;
    renderStep();
  });

  elements.playBtn.addEventListener('click', () => {
    playMoves();
  });

  elements.flipBoardBtn?.addEventListener('click', () => {
    toggleBoardOrientation();
  });

  document.addEventListener('keydown', handleKeyboardNavigation);

  const jobIdFromPath = getJobIdFromPath();
  if (jobIdFromPath) {
    void loadAnalysisFromPath(jobIdFromPath);
  }
})();