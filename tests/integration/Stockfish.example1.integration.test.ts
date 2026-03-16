import 'dotenv/config';

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { GameAnalyzer } from '../../src/analysis/GameAnalyzer';
import { PositionEvaluator } from '../../src/analysis/PositionEvaluator';
import { StockfishService } from '../../src/engine/StockfishService';

const stockfishPath = process.env.STOCKFISH_PATH;
const pgnPath = path.join(process.cwd(), 'pgns', 'example1.pgn');
const shouldSkip = !stockfishPath || !existsSync(stockfishPath) || !existsSync(pgnPath);

describe('Stockfish + real PGN integration (example1.pgn)', { skip: shouldSkip }, () => {
  const service = new StockfishService({
    enginePath: stockfishPath as string,
    startupTimeoutMs: 10_000,
    commandTimeoutMs: 30_000,
    threads: 1,
    hashMb: 128,
  });

  const analyzer = new GameAnalyzer(new PositionEvaluator(service));

  after(async () => {
    await service.shutdown();
  });

  it('analyzes existing PGN and returns evaluated move-by-move output', async () => {
    await service.initialize();

    const pgn = readFileSync(pgnPath, 'utf8');
    const result = await analyzer.analyzePgn(pgn, {
      depth: 8,
      deepDepth: 12,
      enableDeepPass: true,
    });

    assert.equal(result.game.event, 'Live Chess');
    assert.equal(result.game.white, 'sergei1506');
    assert.equal(result.game.black, 'Zuvarna');
    assert.equal(result.game.result, '1-0');

    assert.equal(result.moves.length, 93);
    assert.ok(result.settings.cache.size > 0);

    for (const move of result.moves) {
      assert.ok(move.bestMove.length >= 4);
      assert.ok(move.pv.length > 0);
      assert.ok(move.evalBefore.kind === 'cp' || move.evalBefore.kind === 'mate');
      assert.ok(move.evalAfter.kind === 'cp' || move.evalAfter.kind === 'mate');
      assert.ok(Number.isFinite(move.cpl));
      assert.ok(move.cpl >= 0);
      assert.ok(['Best', 'Excellent', 'Good', 'Inaccuracy', 'Mistake', 'Blunder'].includes(move.label));
    }

    assert.ok(Number.isFinite(result.summary.accuracyWhite));
    assert.ok(Number.isFinite(result.summary.accuracyBlack));
    assert.ok(result.summary.criticalMoments >= 0);
  });
});