import 'dotenv/config';

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { GameAnalyzer } from '../../src/analysis/GameAnalyzer';
import { PositionEvaluator } from '../../src/analysis/PositionEvaluator';
import { StockfishService } from '../../src/engine/StockfishService';

const benchmarkPgn = `
[Event "Phase6 Benchmark"]
[Site "Local"]
[Date "2026.03.15"]
[Round "1"]
[White "WhitePlayer"]
[Black "BlackPlayer"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. Nc3 Qc7 13. Be3 Bb7 14. Rc1 Rfe8 15. cxb5 axb5 16. Nxb5 Qb8 17. Nc3 Bf8 18. Ng5 Re7 19. f4 h6 20. Nf3 exf4 1-0
`;

const soakPgn = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 1-0';

const stockfishPath = process.env.STOCKFISH_PATH;
const shouldSkip = !stockfishPath || !existsSync(stockfishPath);

describe('Phase6 performance', { skip: shouldSkip }, () => {
  const service = new StockfishService({
    enginePath: stockfishPath as string,
    startupTimeoutMs: 10_000,
    commandTimeoutMs: 20_000,
    threads: 1,
    hashMb: 128,
  });

  const analyzer = new GameAnalyzer(new PositionEvaluator(service));

  after(async () => {
    await service.shutdown();
  });

  it('completes benchmark game within runtime budget', async () => {
    await service.initialize();
    const start = Date.now();

    const result = await analyzer.analyzePgn(benchmarkPgn, {
      depth: 8,
      deepDepth: 12,
      enableDeepPass: true,
    });

    const durationMs = Date.now() - start;

    assert.equal(result.moves.length, 40);
    assert.ok(durationMs < 60_000);
  });

  it('runs sequential analyses in soak test without deadlocks', async () => {
    await service.initialize();

    const iterations = 3;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const result = await analyzer.analyzePgn(soakPgn, {
        depth: 8,
        deepDepth: 12,
        enableDeepPass: true,
      });

      assert.equal(result.moves.length, 12);
      assert.ok(result.settings.cache.size > 0);
    }
  });
});