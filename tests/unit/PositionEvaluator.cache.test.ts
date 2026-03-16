import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PositionEvaluator } from '../../src/analysis/PositionEvaluator';

class FakeEvalService {
  public calls = 0;

  public async evaluateFen(fen: string, options?: { depth?: number }) {
    this.calls += 1;
    return {
      bestMove: 'e2e4',
      info: {
        raw: 'info',
        depth: options?.depth,
        score: { kind: 'cp' as const, value: fen.length + (options?.depth ?? 0) },
        pv: ['e2e4'],
      },
    };
  }
}

describe('PositionEvaluator cache', () => {
  it('reuses cached result for same fen+depth and misses on depth change', async () => {
    const service = new FakeEvalService();
    const evaluator = new PositionEvaluator(service);
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    const first = await evaluator.evaluateFen(fen, { depth: 8 });
    const second = await evaluator.evaluateFen(fen, { depth: 8 });
    const third = await evaluator.evaluateFen(fen, { depth: 10 });

    assert.equal(first.info.score?.value, second.info.score?.value);
    assert.notEqual(second.info.score?.value, third.info.score?.value);

    const stats = evaluator.getCacheStats();
    assert.equal(service.calls, 2);
    assert.equal(stats.hits, 1);
    assert.equal(stats.misses, 2);
    assert.equal(stats.size, 2);
  });

  it('can bypass cache explicitly', async () => {
    const service = new FakeEvalService();
    const evaluator = new PositionEvaluator(service);
    const fen = '8/8/8/8/8/8/8/K6k w - - 0 1';

    await evaluator.evaluateFen(fen, { depth: 6 });
    await evaluator.evaluateFen(fen, { depth: 6, useCache: false });

    const stats = evaluator.getCacheStats();
    assert.equal(service.calls, 2);
    assert.equal(stats.hits, 0);
    assert.equal(stats.misses, 2);
  });
});