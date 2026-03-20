(function () {
  const EVAL_PERSPECTIVE = 'w';
  const COACHING_UI_MAX_MOVES = 16;

  const state = {
    analysis: null,
    selectedIndex: -1,
    viewerColor: null,
    playTimerId: null,
    boardFlipped: false,
    coaching: {
      active: false,
      mode: null,
      sourceMoveIndex: -1,
      stepIndex: 0,
    },
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
    coachingToggleBtn: document.getElementById('coachingToggleBtn'),
    coachingThreatBtn: document.getElementById('coachingThreatBtn'),
    coachingReason: document.getElementById('coachingReason'),
    coachingScoreGap: document.getElementById('coachingScoreGap'),
    coachingSequence: document.getElementById('coachingSequence'),
    coachingTags: document.getElementById('coachingTags'),
    coachingEmpty: document.getElementById('coachingEmpty'),
    coachingPrevBtn: document.getElementById('coachingPrevBtn'),
    coachingNextBtn: document.getElementById('coachingNextBtn'),
  };

  function deactivateCoachingVisualization() {
    state.coaching.active = false;
    state.coaching.mode = null;
    state.coaching.sourceMoveIndex = -1;
    state.coaching.stepIndex = 0;
  }

  function readSelectedMoveCoaching(move) {
    if (!move || typeof move !== 'object') {
      return null;
    }

    const coaching = move.coaching;
    if (!coaching || typeof coaching !== 'object') {
      return null;
    }

    const bestLine = Array.isArray(coaching.bestLine) ? coaching.bestLine.filter((value) => typeof value === 'string') : [];
    const playedLine = Array.isArray(coaching.playedLine) ? coaching.playedLine.filter((value) => typeof value === 'string') : [];

    return {
      value: coaching,
      bestLine,
      playedLine,
    };
  }

  function coachingTotalSteps(bestLine, sequenceLength) {
    const boundedSequence = Number.isInteger(sequenceLength) && sequenceLength >= 0
      ? sequenceLength
      : bestLine.length;
    return Math.max(0, Math.min(COACHING_UI_MAX_MOVES, boundedSequence, bestLine.length));
  }

  function normalizeMoveLabel(label) {
    return typeof label === 'string' ? label.trim().toLowerCase() : '';
  }

  function buildThreatLine(move, playedLine) {
    if (!Array.isArray(playedLine) || playedLine.length === 0) {
      return [];
    }

    if (playedLine[0] === move.uciMove) {
      return playedLine.slice(1);
    }

    return playedLine;
  }

  function squareToCoords(square) {
    if (typeof square !== 'string' || !/^[a-h][1-8]$/.test(square)) {
      return null;
    }

    const file = square.charCodeAt(0) - 97;
    const rank = Number.parseInt(square[1], 10);
    return { row: 8 - rank, col: file };
  }

  function coordsToSquare(row, col) {
    if (row < 0 || row > 7 || col < 0 || col > 7) {
      return null;
    }

    const file = String.fromCharCode(97 + col);
    const rank = String(8 - row);
    return `${file}${rank}`;
  }

  function parseFenParts(fen) {
    const parts = String(fen || '').split(' ');
    return {
      placement: parts[0] || '8/8/8/8/8/8/8/8',
      activeColor: parts[1] || 'w',
      castling: parts[2] || '-',
      enPassant: parts[3] || '-',
      halfmove: Number.parseInt(parts[4] ?? '0', 10) || 0,
      fullmove: Number.parseInt(parts[5] ?? '1', 10) || 1,
    };
  }

  function parseFenPlacement(placement) {
    const rows = placement.split('/');
    const board = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));

    for (let row = 0; row < 8; row += 1) {
      let col = 0;
      for (const token of rows[row] ?? '') {
        if (/\d/.test(token)) {
          col += Number.parseInt(token, 10);
          continue;
        }

        if (col >= 0 && col < 8) {
          board[row][col] = token;
        }
        col += 1;
      }
    }

    return board;
  }

  function boardToFenPlacement(board) {
    const rows = [];

    for (let row = 0; row < 8; row += 1) {
      let fenRow = '';
      let emptyCount = 0;

      for (let col = 0; col < 8; col += 1) {
        const piece = board[row][col];
        if (!piece) {
          emptyCount += 1;
          continue;
        }

        if (emptyCount > 0) {
          fenRow += String(emptyCount);
          emptyCount = 0;
        }
        fenRow += piece;
      }

      if (emptyCount > 0) {
        fenRow += String(emptyCount);
      }

      rows.push(fenRow || '8');
    }

    return rows.join('/');
  }

  function removeCastlingFlags(castling, flags) {
    if (!castling || castling === '-') {
      return '-';
    }

    const toRemove = new Set(flags.split(''));
    const kept = castling.split('').filter((flag) => !toRemove.has(flag));
    return kept.length > 0 ? kept.join('') : '-';
  }

  function applyUciMoveToFen(fen, uciMove) {
    if (typeof fen !== 'string' || typeof uciMove !== 'string' || uciMove.length < 4) {
      return fen;
    }

    const fenParts = parseFenParts(fen);
    const board = parseFenPlacement(fenParts.placement);
    const fromSquare = uciMove.slice(0, 2).toLowerCase();
    const toSquare = uciMove.slice(2, 4).toLowerCase();
    const promotion = uciMove.length > 4 ? uciMove[4].toLowerCase() : null;
    const from = squareToCoords(fromSquare);
    const to = squareToCoords(toSquare);

    if (!from || !to) {
      return fen;
    }

    const piece = board[from.row][from.col];
    if (!piece) {
      return fen;
    }

    const isWhite = piece === piece.toUpperCase();
    const pieceType = piece.toLowerCase();
    const targetPiece = board[to.row][to.col];
    const isPawnMove = pieceType === 'p';
    const isCapture = Boolean(targetPiece);
    const isEnPassantCapture = isPawnMove && from.col !== to.col && !targetPiece;

    if (isEnPassantCapture) {
      const captureRow = isWhite ? to.row + 1 : to.row - 1;
      if (captureRow >= 0 && captureRow < 8) {
        board[captureRow][to.col] = null;
      }
    }

    board[from.row][from.col] = null;

    let pieceToPlace = piece;
    if (promotion && isPawnMove) {
      pieceToPlace = isWhite ? promotion.toUpperCase() : promotion;
    }

    board[to.row][to.col] = pieceToPlace;

    if (pieceType === 'k' && Math.abs(to.col - from.col) === 2) {
      if (to.col === 6) {
        const rook = board[from.row][7];
        board[from.row][7] = null;
        board[from.row][5] = rook;
      } else if (to.col === 2) {
        const rook = board[from.row][0];
        board[from.row][0] = null;
        board[from.row][3] = rook;
      }
    }

    let castling = fenParts.castling;

    if (piece === 'K') {
      castling = removeCastlingFlags(castling, 'KQ');
    } else if (piece === 'k') {
      castling = removeCastlingFlags(castling, 'kq');
    } else if (piece === 'R' && from.row === 7 && from.col === 0) {
      castling = removeCastlingFlags(castling, 'Q');
    } else if (piece === 'R' && from.row === 7 && from.col === 7) {
      castling = removeCastlingFlags(castling, 'K');
    } else if (piece === 'r' && from.row === 0 && from.col === 0) {
      castling = removeCastlingFlags(castling, 'q');
    } else if (piece === 'r' && from.row === 0 && from.col === 7) {
      castling = removeCastlingFlags(castling, 'k');
    }

    if (targetPiece === 'R' && to.row === 7 && to.col === 0) {
      castling = removeCastlingFlags(castling, 'Q');
    } else if (targetPiece === 'R' && to.row === 7 && to.col === 7) {
      castling = removeCastlingFlags(castling, 'K');
    } else if (targetPiece === 'r' && to.row === 0 && to.col === 0) {
      castling = removeCastlingFlags(castling, 'q');
    } else if (targetPiece === 'r' && to.row === 0 && to.col === 7) {
      castling = removeCastlingFlags(castling, 'k');
    }

    let enPassant = '-';
    if (isPawnMove && Math.abs(to.row - from.row) === 2) {
      const middleRow = Math.floor((to.row + from.row) / 2);
      enPassant = coordsToSquare(middleRow, from.col) ?? '-';
    }

    const halfmove = isPawnMove || isCapture || isEnPassantCapture ? 0 : fenParts.halfmove + 1;
    const fullmove = fenParts.activeColor === 'b' ? fenParts.fullmove + 1 : fenParts.fullmove;
    const activeColor = fenParts.activeColor === 'w' ? 'b' : 'w';

    return `${boardToFenPlacement(board)} ${activeColor} ${castling} ${enPassant} ${halfmove} ${fullmove}`;
  }

  function getCoachingStepState(move) {
    const coachingData = readSelectedMoveCoaching(move);
    const coaching = coachingData?.value;
    const hasCoaching = Boolean(coaching);
    const bestLine = coachingData?.bestLine ?? [];
    const playedLine = coachingData?.playedLine ?? [];
    const threatLine = buildThreatLine(move, playedLine);
    const totalBestSteps = hasCoaching ? coachingTotalSteps(bestLine, coaching.sequenceLength) : 0;
    const threatSequenceLength = Number.isInteger(coaching?.sequenceLength)
      ? Math.max(0, coaching.sequenceLength - 1)
      : threatLine.length;
    const totalThreatSteps = hasCoaching ? coachingTotalSteps(threatLine, threatSequenceLength) : 0;
    const normalizedLabel = normalizeMoveLabel(move.label);
    const isBadMove = coaching?.type === 'bad_move'
      || normalizedLabel === 'inaccuracy'
      || normalizedLabel === 'mistake'
      || normalizedLabel === 'blunder';
    const canShowBest = totalBestSteps > 0;
    const canShowThreats = isBadMove && totalThreatSteps > 0;
    const isActiveForMove = state.coaching.active && state.coaching.sourceMoveIndex === state.selectedIndex;
    const activeMode = isActiveForMove ? state.coaching.mode : null;
    const activeLine = activeMode === 'threat' ? threatLine : bestLine;
    const activeTotalSteps = activeMode === 'threat' ? totalThreatSteps : totalBestSteps;
    const safeStepIndex = isActiveForMove ? Math.max(0, Math.min(state.coaching.stepIndex, activeTotalSteps)) : 0;

    return {
      coaching,
      bestLine,
      threatLine,
      totalBestSteps,
      totalThreatSteps,
      canShowBest,
      canShowThreats,
      isActiveForMove,
      activeMode,
      activeLine,
      activeTotalSteps,
      safeStepIndex,
    };
  }

  function updateCoachingPanel(move) {
    const coachingState = getCoachingStepState(move);

    if (!coachingState.coaching) {
      elements.coachingReason.textContent = 'Reason: -';
      elements.coachingScoreGap.textContent = 'Score Gap: -';
      elements.coachingSequence.textContent = 'Sequence: -';
      elements.coachingTags.textContent = 'Tags: -';
      elements.coachingEmpty.textContent = 'No coaching data for selected move.';
      elements.coachingToggleBtn.disabled = true;
      elements.coachingToggleBtn.textContent = 'Show best moves';
      elements.coachingThreatBtn.disabled = true;
      elements.coachingThreatBtn.textContent = 'Show threats';
      elements.coachingPrevBtn.disabled = true;
      elements.coachingNextBtn.disabled = true;
      return;
    }

    const tags = Array.isArray(coachingState.coaching.reasonCodes) ? coachingState.coaching.reasonCodes : [];
    const sequenceLabel = coachingState.isActiveForMove
      ? `${coachingState.activeMode === 'threat' ? 'Threats' : 'Best'}: Step ${coachingState.safeStepIndex + 1}/${coachingState.activeTotalSteps + 1}`
      : `Best: ${coachingState.totalBestSteps} | Threats: ${coachingState.canShowThreats ? coachingState.totalThreatSteps : 0}`;

    elements.coachingReason.textContent = `Reason: ${coachingState.coaching.primaryReason || '-'}`;
    elements.coachingScoreGap.textContent = `Score Gap: ${Number.isFinite(coachingState.coaching.scoreGapCp) ? coachingState.coaching.scoreGapCp : '-'}`;
    elements.coachingSequence.textContent = `Sequence: ${sequenceLabel}`;
    elements.coachingTags.textContent = `Tags: ${tags.length > 0 ? tags.join(', ') : '-'}`;
    elements.coachingEmpty.textContent = coachingState.isActiveForMove
      ? (coachingState.activeMode === 'threat'
        ? 'Threat mode active. Use < and > to step through consequences after your move.'
        : 'Best line mode active. Use < and > to step through best continuation from rollback position.')
      : 'Choose Show best moves or Show threats.';
    elements.coachingToggleBtn.disabled = !coachingState.canShowBest;
    elements.coachingToggleBtn.textContent = coachingState.isActiveForMove && coachingState.activeMode === 'best'
      ? 'Hide best moves'
      : 'Show best moves';
    elements.coachingThreatBtn.disabled = !coachingState.canShowThreats;
    elements.coachingThreatBtn.textContent = coachingState.isActiveForMove && coachingState.activeMode === 'threat'
      ? 'Hide threats'
      : 'Show threats';
    elements.coachingPrevBtn.disabled = !coachingState.isActiveForMove || coachingState.safeStepIndex <= 0;
    elements.coachingNextBtn.disabled = !coachingState.isActiveForMove || coachingState.safeStepIndex >= coachingState.activeTotalSteps;
  }

  function getCoachingBoardState(move) {
    const coachingState = getCoachingStepState(move);
    if (!coachingState.coaching || !coachingState.isActiveForMove || coachingState.activeTotalSteps === 0) {
      return {
        boardFen: move.fenAfter,
        moveArrowSquares: null,
        bestArrowSquares: null,
      };
    }

    let boardFen = coachingState.activeMode === 'threat' ? move.fenAfter : move.fenBefore;
    for (let index = 0; index < coachingState.safeStepIndex; index += 1) {
      const stepMove = coachingState.activeLine[index];
      if (!stepMove) {
        break;
      }
      boardFen = applyUciMoveToFen(boardFen, stepMove);
    }

    const arrowMoveIndex = coachingState.safeStepIndex === 0
      ? 0
      : coachingState.safeStepIndex - 1;
    const arrowMove = coachingState.activeLine[arrowMoveIndex] ?? null;

    return {
      boardFen,
      moveArrowSquares: null,
      bestArrowSquares: arrowMove ? squaresFromUci(arrowMove) : null,
    };
  }

  function toggleCoachingVisualization(mode) {
    if (!state.analysis || state.selectedIndex < 0) {
      return;
    }

    const move = state.analysis.moves[state.selectedIndex];
    const coachingState = getCoachingStepState(move);
    const canActivate = mode === 'threat' ? coachingState.canShowThreats : coachingState.canShowBest;
    if (!canActivate) {
      deactivateCoachingVisualization();
      renderStep();
      return;
    }

    const isActiveForSameMode = coachingState.isActiveForMove && coachingState.activeMode === mode;
    if (isActiveForSameMode) {
      deactivateCoachingVisualization();
      renderStep();
      return;
    }

    state.coaching.active = true;
    state.coaching.mode = mode;
    state.coaching.sourceMoveIndex = state.selectedIndex;
    state.coaching.stepIndex = 0;

    renderStep();
  }

  function stepCoaching(delta) {
    if (!state.analysis || state.selectedIndex < 0 || !state.coaching.active || state.coaching.sourceMoveIndex !== state.selectedIndex) {
      return;
    }

    const move = state.analysis.moves[state.selectedIndex];
    const coachingState = getCoachingStepState(move);
    const nextStep = Math.max(0, Math.min(coachingState.activeTotalSteps, coachingState.safeStepIndex + delta));
    if (nextStep === coachingState.safeStepIndex) {
      return;
    }

    state.coaching.stepIndex = nextStep;
    renderStep();
  }

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
    deactivateCoachingVisualization();
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

  function displayPositionFromSquare(square) {
    const sourceIndex = boardIndexFromSquare(square);
    if (sourceIndex < 0) {
      return null;
    }

    const sourceRow = Math.floor(sourceIndex / 8);
    const sourceCol = sourceIndex % 8;
    const row = state.boardFlipped ? 7 - sourceRow : sourceRow;
    const col = state.boardFlipped ? 7 - sourceCol : sourceCol;

    return { row, col };
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

  function shouldShowPlayedMoveArrow(label) {
    if (!label) {
      return false;
    }

    const normalized = label.trim().toLowerCase();
    return normalized === 'blunder'
      || normalized === 'mistake'
      || normalized === 'inaccuracy'
      || normalized === 'excellent'
      || normalized === 'exccelent';
  }

  function appendArrowToOverlay(arrowOverlay, boardSize, cellSize, fromPosition, toPosition, opacityScale = 1) {
    const fromX = (fromPosition.col + 0.5) * cellSize;
    const fromY = (fromPosition.row + 0.5) * cellSize;
    const toX = (toPosition.col + 0.5) * cellSize;
    const toY = (toPosition.row + 0.5) * cellSize;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const length = Math.hypot(dx, dy);
    if (length < 1) {
      return;
    }

    const ux = dx / length;
    const uy = dy / length;
    const px = -uy;
    const py = ux;
    const headLength = Math.min(Math.max(14, cellSize * 0.34), length * 0.62);
    const headWidth = Math.max(11, cellSize * 0.30);
    const headBaseX = toX - ux * headLength;
    const headBaseY = toY - uy * headLength;
    const gapToHead = -Math.max(0.5, cellSize * 0.01);
    const shaftEndX = headBaseX - ux * gapToHead;
    const shaftEndY = headBaseY - uy * gapToHead;
    const leftX = headBaseX + px * (headWidth / 2);
    const leftY = headBaseY + py * (headWidth / 2);
    const rightX = headBaseX - px * (headWidth / 2);
    const rightY = headBaseY - py * (headWidth / 2);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(fromX));
    line.setAttribute('y1', String(fromY));
    line.setAttribute('x2', String(shaftEndX));
    line.setAttribute('y2', String(shaftEndY));
    line.setAttribute('stroke', `rgba(34, 197, 94, ${0.5 * opacityScale})`);
    line.setAttribute('stroke-width', String(Math.max(3.2, cellSize * 0.11)));
    line.setAttribute('stroke-linecap', 'butt');
    arrowOverlay.appendChild(line);

    const head = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    head.setAttribute('d', `M ${leftX} ${leftY} L ${toX} ${toY} L ${rightX} ${rightY} Q ${headBaseX} ${headBaseY} ${leftX} ${leftY} Z`);
    head.setAttribute('fill', `rgba(34, 197, 94, ${0.5 * opacityScale})`);
    arrowOverlay.appendChild(head);
  }

  function renderBoard(fen, highlightSquare, highlightFromSquare, highlightClass, bestMoveSquares, moveArrowSquares, correctMoveArrowSquares) {
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

    const hasPlayedArrow = Boolean(moveArrowSquares?.fromSquare && moveArrowSquares?.toSquare);
    const hasCorrectArrow = Boolean(correctMoveArrowSquares?.fromSquare && correctMoveArrowSquares?.toSquare);
    if (!hasPlayedArrow && !hasCorrectArrow) {
      return;
    }

    const boardSize = elements.board.clientWidth || elements.board.offsetWidth;
    const cellSize = boardSize / 8;
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      return;
    }

    const arrowOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrowOverlay.setAttribute('class', 'board-move-arrow');
    arrowOverlay.setAttribute('viewBox', `0 0 ${boardSize} ${boardSize}`);
    arrowOverlay.setAttribute('aria-hidden', 'true');

    if (hasPlayedArrow) {
      const fromPosition = displayPositionFromSquare(moveArrowSquares.fromSquare);
      const toPosition = displayPositionFromSquare(moveArrowSquares.toSquare);
      if (fromPosition && toPosition) {
        appendArrowToOverlay(arrowOverlay, boardSize, cellSize, fromPosition, toPosition, 0.85);
      }
    }

    if (hasCorrectArrow) {
      const fromPosition = displayPositionFromSquare(correctMoveArrowSquares.fromSquare);
      const toPosition = displayPositionFromSquare(correctMoveArrowSquares.toSquare);
      if (fromPosition && toPosition) {
        appendArrowToOverlay(arrowOverlay, boardSize, cellSize, fromPosition, toPosition, 1);
      }
    }

    elements.board.appendChild(arrowOverlay);
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

    // Align bar with the player on bottom: invert when board is flipped (black on bottom).
    const whitePerspectivePercentage = ((maxAbs + bounded) / (2 * maxAbs)) * 100;
    const percentage = state.boardFlipped ? 100 - whitePerspectivePercentage : whitePerspectivePercentage;

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
    if (state.coaching.active && state.coaching.sourceMoveIndex !== state.selectedIndex) {
      deactivateCoachingVisualization();
    }

    const view = window.UiHelpers.stepView(move, state.selectedIndex, moves.length, state.viewerColor);
    const playedMoveSquares = squaresFromUci(move.uciMove);
    const isCoachingActiveForMove = state.coaching.active && state.coaching.sourceMoveIndex === state.selectedIndex;
    const landingSquare = isCoachingActiveForMove ? null : (playedMoveSquares?.toSquare ?? landingSquareFromUci(move.uciMove));
    const landingClass = isCoachingActiveForMove ? '' : boardHighlightClassFromLabel(move.label);
    const highlightFromSquare = null;
    const coachingBoardState = getCoachingBoardState(move);
    const boardFen = coachingBoardState.boardFen;
    const moveArrowSquares = isCoachingActiveForMove
      ? coachingBoardState.moveArrowSquares
      : (shouldShowPlayedMoveArrow(move.label) ? playedMoveSquares : null);
    const correctMoveArrowSquares = coachingBoardState.bestArrowSquares;

    elements.evalDisplay.textContent = view.evalDisplay;
    elements.detailSan.textContent = `SAN: ${view.details.san}`;
    elements.detailLabel.textContent = `Label: ${view.details.label}`;
    elements.detailCpl.textContent = `CPL: ${view.details.cpl}`;
    elements.detailBest.textContent = `Best Move: ${view.details.bestMove}`;
    elements.detailEvalBefore.textContent = `Eval Before: ${view.details.evalBefore}`;
    elements.detailEvalAfter.textContent = `Eval After: ${view.details.evalAfter}`;
    updateCoachingPanel(move);

    renderBoard(
      boardFen,
      landingSquare,
      highlightFromSquare,
      landingClass,
      null,
      moveArrowSquares,
      correctMoveArrowSquares,
    );
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
          settings: {
            depth,
            enableCoaching: true,
            coachingMultiPv: 3,
          },
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

  elements.coachingToggleBtn?.addEventListener('click', () => {
    toggleCoachingVisualization('best');
  });

  elements.coachingThreatBtn?.addEventListener('click', () => {
    toggleCoachingVisualization('threat');
  });

  elements.coachingPrevBtn?.addEventListener('click', () => {
    stepCoaching(-1);
  });

  elements.coachingNextBtn?.addEventListener('click', () => {
    stepCoaching(1);
  });

  document.addEventListener('keydown', handleKeyboardNavigation);

  const jobIdFromPath = getJobIdFromPath();
  if (jobIdFromPath) {
    void loadAnalysisFromPath(jobIdFromPath);
  }
})();