import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';

import { GameAnalyzer } from '../../src/analysis/GameAnalyzer';
import { PositionEvaluator } from '../../src/analysis/PositionEvaluator';

class PerspectiveMockService {
  public async evaluateFen(fen: string, _options?: { depth?: number }) {
    const board = new Chess(fen);
    const firstMove = board.moves({ verbose: true })[0];
    const bestMove = firstMove ? `${firstMove.from}${firstMove.to}${firstMove.promotion ?? ''}` : '0000';

    const sideToMove = fen.split(' ')[1];
    const score = sideToMove === 'b'
      ? { kind: 'cp' as const, value: 120 }
      : { kind: 'cp' as const, value: 30 };

    return {
      bestMove,
      info: {
        raw: 'info',
        depth: 8,
        score,
        pv: [bestMove],
      },
    };
  }
}

describe('GameAnalyzer black perspective', () => {
  it('normalizes evalBefore into mover perspective for black moves', async () => {
    const analyzer = new GameAnalyzer(new PositionEvaluator(new PerspectiveMockService()));
    const result = await analyzer.analyzePgn('1. e4 e5', { depth: 8, enableDeepPass: false });

    assert.equal(result.moves.length, 2);
    const blackMove = result.moves[1];
    assert.equal(blackMove.color, 'b');
    assert.deepEqual(blackMove.evalBefore, { kind: 'cp', value: -120 });
  });
});
