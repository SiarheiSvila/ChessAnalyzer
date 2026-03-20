import 'dotenv/config';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { StockfishService } from '../../src/engine/StockfishService';

const stockfishPath = process.env.STOCKFISH_PATH;
const shouldSkip = !stockfishPath || !existsSync(stockfishPath);

describe('UCI MultiPV integration', { skip: shouldSkip }, () => {
  it('returns 3 ranked candidate lines for one FEN when multiPv=3', async () => {
    const service = new StockfishService({
      enginePath: stockfishPath as string,
      startupTimeoutMs: 10_000,
      commandTimeoutMs: 30_000,
      threads: 1,
      hashMb: 128,
    });

    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 2 3';

    try {
      await service.initialize();
      const evaluation = await service.evaluateFen(fen, { depth: 12, multiPv: 3, timeoutMs: 30_000 });

      const candidateLines = evaluation.candidateLines ?? [];
      assert.equal(candidateLines.length, 3);
      assert.deepEqual(candidateLines.map((line) => line.rank), [1, 2, 3]);

      for (const line of candidateLines) {
        assert.ok((line.info.pv ?? []).length > 0);
        assert.ok(line.info.score);
      }

      assert.ok(evaluation.bestMove.length >= 4);
    } finally {
      await service.shutdown();
    }
  });
});
