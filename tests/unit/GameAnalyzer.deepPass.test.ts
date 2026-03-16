import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';

import { GameAnalyzer } from '../../src/analysis/GameAnalyzer';
import { ReplayService } from '../../src/chess/ReplayService';
import { PositionEvaluator } from '../../src/analysis/PositionEvaluator';

class MockService {
  public callsByDepth = new Map<number, number>();
  private criticalFen = '';

  public setCriticalFen(fen: string): void {
    this.criticalFen = fen;
  }

  public async evaluateFen(fen: string, options?: { depth?: number }) {
    const depth = options?.depth ?? 0;
    this.callsByDepth.set(depth, (this.callsByDepth.get(depth) ?? 0) + 1);

    const board = new Chess(fen);
    const moves = board.moves({ verbose: true });
    const bestMove = moves.length > 0 ? `${moves[0].from}${moves[0].to}${moves[0].promotion ?? ''}` : '0000';

    const scoreValue = fen === this.criticalFen && depth === 8 ? 350 : 0;

    return {
      bestMove,
      info: {
        raw: 'info',
        depth,
        score: { kind: 'cp' as const, value: scoreValue },
        pv: [bestMove],
      },
    };
  }
}

describe('GameAnalyzer deep pass', () => {
  it('re-evaluates only flagged critical plies at deep depth', async () => {
    const pgn = '1. e4 e5 2. Nf3 Nc6';
    const replay = new ReplayService();
    const plies = replay.buildPlies(pgn);

    const service = new MockService();
    service.setCriticalFen(plies[plies.length - 1].fenAfter);

    const analyzer = new GameAnalyzer(new PositionEvaluator(service));
    const result = await analyzer.analyzePgn(pgn, {
      depth: 8,
      deepDepth: 14,
      enableDeepPass: true,
      criticalCplThreshold: 120,
    });

    assert.ok(result.settings.deepReanalyzedPlies >= 1);
    assert.ok((service.callsByDepth.get(14) ?? 0) >= result.settings.deepReanalyzedPlies);
    assert.equal(result.moves.length, 4);
  });

  it('skips deep pass when disabled', async () => {
    const service = new MockService();
    const analyzer = new GameAnalyzer(new PositionEvaluator(service));
    const result = await analyzer.analyzePgn('1. e4 e5 2. Nf3 Nc6', {
      depth: 8,
      deepDepth: 14,
      enableDeepPass: false,
    });

    assert.equal(result.settings.deepReanalyzedPlies, 0);
    assert.equal(service.callsByDepth.get(14) ?? 0, 0);
  });
});