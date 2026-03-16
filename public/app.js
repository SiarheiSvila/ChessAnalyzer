(function () {
  const EVAL_PERSPECTIVE = 'w';

  const state = {
    analysis: null,
    selectedIndex: -1,
    viewerColor: null,
    playTimerId: null,
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

  function setStatus(text) {
    elements.statusText.textContent = text;
  }

  function setProgress(percent) {
    elements.progressBar.style.width = `${percent}%`;
  }

  function renderBoard(fen) {
    const squares = window.UiHelpers.boardFromFen(fen);
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    elements.board.innerHTML = '';

    for (let index = 0; index < squares.length; index += 1) {
      const row = Math.floor(index / 8);
      const col = index % 8;
      const square = document.createElement('div');
      square.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
      square.textContent = squares[index] || '';

      if (col === 0) {
        const rankLabel = document.createElement('span');
        rankLabel.className = 'coord-label rank-label';
        rankLabel.textContent = String(8 - row);
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
    
    // Positive = white advantage (bar fills), negative = black advantage (bar empties)
    const percentage = ((maxAbs + bounded) / (2 * maxAbs)) * 100;
    
    elements.evalBarFill.style.setProperty('--eval-percent', `${percentage}%`);
  }

  function renderMoveList(moves, selectedIndex) {
    const rows = window.UiHelpers.buildMoveRows(moves, state.viewerColor);
    elements.moveList.innerHTML = '';

    rows.forEach((row, rowIndex) => {
      const rowItem = document.createElement('li');
      rowItem.className = 'move-row';

      // White move
      const whiteMove = document.createElement('span');
      whiteMove.className = `move-item move-white ${row.white.index === selectedIndex ? 'active' : ''}`;
      whiteMove.textContent = `${row.moveNumber}. ${row.white.rowText}`;
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
        blackMove.className = `move-item move-black ${row.black.index === selectedIndex ? 'active' : ''}`;
        blackMove.textContent = row.black.rowText;
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

  function renderStep() {
    if (!state.analysis || state.selectedIndex < 0) {
      return;
    }

    const moves = state.analysis.moves;
    const move = moves[state.selectedIndex];
    const view = window.UiHelpers.stepView(move, state.selectedIndex, moves.length, state.viewerColor);

    elements.evalDisplay.textContent = view.evalDisplay;
    elements.detailSan.textContent = `SAN: ${view.details.san}`;
    elements.detailLabel.textContent = `Label: ${view.details.label}`;
    elements.detailCpl.textContent = `CPL: ${view.details.cpl}`;
    elements.detailBest.textContent = `Best Move: ${view.details.bestMove}`;
    elements.detailEvalBefore.textContent = `Eval Before: ${view.details.evalBefore}`;
    elements.detailEvalAfter.textContent = `Eval After: ${view.details.evalAfter}`;

    renderBoard(move.fenAfter);
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
        const resultResponse = await fetch(`/api/analyze/${jobId}/result`);
        const payload = await resultResponse.json();
        return payload.result;
      }

      await new Promise((resolve) => setTimeout(resolve, 350));
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
      const result = await pollResult(jobId);

      state.analysis = result;
      state.viewerColor = EVAL_PERSPECTIVE;
      state.selectedIndex = result.moves.length > 0 ? 0 : -1;

      if (state.selectedIndex >= 0) {
        setStatus('Analysis completed.');
        setProgress(100);
        renderStep();
      } else {
        setStatus('Analysis completed with no moves.');
        updateNavigationButtons(0);
      }
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
})();