import 'dotenv/config';

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { GameAnalyzer } from '../../src/analysis/GameAnalyzer';
import { PositionEvaluator } from '../../src/analysis/PositionEvaluator';
import { StockfishService } from '../../src/engine/StockfishService';

const samplePgn = `
[Event "Phase3 Integration"]
[Site "Local"]
[Date "2026.03.15"]
[Round "1"]
[White "WhitePlayer"]
[Black "BlackPlayer"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 5. O-O O-O 6. Nc3 d6 1-0
`;

const stockfishPath = process.env.STOCKFISH_PATH;
const shouldSkip = !stockfishPath || !existsSync(stockfishPath);

describe('Phase3 integration', { skip: shouldSkip }, () => {
  const service = new StockfishService({
    enginePath: stockfishPath as string,
    startupTimeoutMs: 10_000,
    commandTimeoutMs: 20_000,
    threads: 1,
    hashMb: 128,
  });

  after(async () => {
    await service.shutdown();
  });

  it('returns labeled moves and summary', async () => {
    await service.initialize();
    const analyzer = new GameAnalyzer(new PositionEvaluator(service));

    const result = await analyzer.analyzePgn(samplePgn, { depth: 8 });

    assert.equal(result.moves.length, 12);
    assert.ok(typeof result.summary.accuracyWhite === 'number');
    assert.ok(typeof result.summary.accuracyBlack === 'number');
    assert.ok(result.summary.criticalMoments >= 0);

    for (const move of result.moves) {
      assert.ok(move.cpl >= 0);
      assert.ok(['Best', 'Excellent', 'Good', 'Inaccuracy', 'Mistake', 'Blunder'].includes(move.label));
      assert.ok(typeof move.isCritical === 'boolean');
    }
  });
});