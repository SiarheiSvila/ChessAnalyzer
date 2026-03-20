(function () {
  const unicodeMap = {
    p: '♟',
    r: '♜',
    n: '♞',
    b: '♝',
    q: '♛',
    k: '♚',
    P: '♙',
    R: '♖',
    N: '♘',
    B: '♗',
    Q: '♕',
    K: '♔',
  };

  function normalizeColor(color) {
    return color === 'w' || color === 'b' ? color : null;
  }

  function normalizeScoreForPerspective(score, perspectiveColor, moverColor) {
    if (!score) {
      return score;
    }

    const perspective = normalizeColor(perspectiveColor);
    const mover = normalizeColor(moverColor);
    if (!perspective || !mover || perspective === mover) {
      return score;
    }

    return {
      kind: score.kind,
      value: -score.value,
    };
  }

  function formatEval(score) {
    if (!score) {
      return '0.00';
    }

    if (score.kind === 'mate') {
      return score.value > 0 ? `#${score.value}` : `#-${Math.abs(score.value)}`;
    }

    const value = score.value / 100;
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}`;
  }

  function evalToNumber(score) {
    if (!score) {
      return 0;
    }

    if (score.kind === 'mate') {
      return score.value > 0 ? 10000 - Math.min(score.value, 99) * 100 : -10000 + Math.min(Math.abs(score.value), 99) * 100;
    }

    return score.value;
  }

  function evalToNumberForPerspective(score, perspectiveColor, moverColor) {
    return evalToNumber(normalizeScoreForPerspective(score, perspectiveColor, moverColor));
  }

  function whiteSharePercent(score, moverColor, maxAbs = 1000) {
    const rawEval = evalToNumberForPerspective(score, 'w', moverColor);
    const bounded = Math.max(-maxAbs, Math.min(maxAbs, rawEval));
    return ((maxAbs + bounded) / (2 * maxAbs)) * 100;
  }

  function boardFromFen(fen) {
    const [piecePlacement] = fen.split(' ');
    const rows = piecePlacement.split('/');
    const squares = [];

    for (const row of rows) {
      for (const token of row) {
        if (/\d/.test(token)) {
          const emptyCount = Number.parseInt(token, 10);
          for (let index = 0; index < emptyCount; index += 1) {
            squares.push('');
          }
        } else {
          squares.push(unicodeMap[token] ?? '');
        }
      }
    }

    return squares;
  }

  function buildMoveRows(moves, perspectiveColor) {
    const rows = [];
    for (let i = 0; i < moves.length; i += 2) {
      const whiteMove = moves[i];
      const blackMove = moves[i + 1];
      const moveNumber = Math.floor(i / 2) + 1;
      
      const whiteEval = formatEval(normalizeScoreForPerspective(whiteMove.evalAfter, perspectiveColor, whiteMove.color));
      const whiteData = {
        index: i,
        moveNumber,
        color: whiteMove.color,
        san: whiteMove.san,
        label: whiteMove.label,
        cpl: whiteMove.cpl,
        evalText: whiteEval,
        rowText: `${whiteMove.san} | ${whiteEval} | ${whiteMove.label}`,
      };
      
      let blackData = null;
      if (blackMove) {
        const blackEval = formatEval(normalizeScoreForPerspective(blackMove.evalAfter, perspectiveColor, blackMove.color));
        blackData = {
          index: i + 1,
          moveNumber,
          color: blackMove.color,
          san: blackMove.san,
          label: blackMove.label,
          cpl: blackMove.cpl,
          evalText: blackEval,
          rowText: `${blackMove.san} | ${blackEval} | ${blackMove.label}`,
        };
      }
      
      rows.push({
        moveNumber,
        white: whiteData,
        black: blackData,
      });
    }
    return rows;
  }

  function stepView(move, index, total, perspectiveColor) {
    return {
      stepText: `Step: ${index + 1}/${total}`,
      evalDisplay: `Eval: ${formatEval(normalizeScoreForPerspective(move.evalAfter, perspectiveColor, move.color))}`,
      details: {
        san: move.san,
        label: move.label,
        cpl: move.cpl,
        bestMove: move.bestMove,
        evalBefore: formatEval(normalizeScoreForPerspective(move.evalBefore, perspectiveColor, move.color)),
        evalAfter: formatEval(normalizeScoreForPerspective(move.evalAfter, perspectiveColor, move.color)),
      },
    };
  }

  const api = {
    formatEval,
    evalToNumber,
    evalToNumberForPerspective,
    whiteSharePercent,
    normalizeScoreForPerspective,
    boardFromFen,
    buildMoveRows,
    stepView,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (typeof window !== 'undefined') {
    window.UiHelpers = api;
  }
})();