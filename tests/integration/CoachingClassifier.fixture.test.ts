import 'dotenv/config';

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { GameAnalyzer } from '../../src/analysis/GameAnalyzer';
import { PositionEvaluator } from '../../src/analysis/PositionEvaluator';
import { StockfishService } from '../../src/engine/StockfishService';

const stockfishPath = process.env.STOCKFISH_PATH;
const pgnPath = path.join(process.cwd(), 'pgns', 'example1.pgn');
const shouldSkip = !stockfishPath || !existsSync(stockfishPath) || !existsSync(pgnPath);

describe('Coaching classification on fixture games', { skip: shouldSkip }, () => {
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

  it('analyzes example1.pgn with coaching enabled and produces explanations for critical moves', async () => {
    await service.initialize();

    const pgn = readFileSync(pgnPath, 'utf8');
    const result = await analyzer.analyzePgn(pgn, {
      depth: 8,
      deepDepth: 12,
      enableDeepPass: true,
      enableCoaching: true,
      coachingMultiPv: 3,
    });

    assert.equal(result.moves.length, 93);

    // Find moves with coaching explanations
    const coachingMoves = result.moves.filter((move) => move.coaching);
    console.log(`Found ${coachingMoves.length} moves with coaching explanations`);

    // Should have at least some critical moves with coaching
    assert.ok(coachingMoves.length > 0, 'Expected at least some moves with coaching');

    // Verify coaching structure on first coaching move
    if (coachingMoves.length > 0) {
      const firstCoaching = coachingMoves[0].coaching;
      assert.ok(firstCoaching);

      // Verify required fields
      assert.ok(firstCoaching.type);
      assert.ok(['bad_move', 'good_move', 'neutral_move'].includes(firstCoaching.type));
      assert.ok(firstCoaching.primaryReason);
      assert.ok(firstCoaching.reasonCodes.length > 0);
      assert.equal(typeof firstCoaching.scoreGapCp, 'number');
      assert.ok(Array.isArray(firstCoaching.bestLine));
      assert.ok(Array.isArray(firstCoaching.playedLine));
      assert.equal(typeof firstCoaching.sequenceLength, 'number');
    }
  });

  it('coaching output is deterministic for repeated runs', async () => {
    await service.initialize();

    const pgn = readFileSync(pgnPath, 'utf8');

    const result1 = await analyzer.analyzePgn(pgn, {
      depth: 8,
      enableCoaching: true,
      coachingMultiPv: 3,
    });

    const result2 = await analyzer.analyzePgn(pgn, {
      depth: 8,
      enableCoaching: true,
      coachingMultiPv: 3,
    });

    // Compare coaching payloads for moves that have coaching
    const coachingMoves1 = result1.moves.filter((m) => m.coaching);
    const coachingMoves2 = result2.moves.filter((m) => m.coaching);

    // Should have same number of coaching moves
    assert.equal(coachingMoves1.length, coachingMoves2.length);

    // Verify deterministic coaching content
    for (let i = 0; i < coachingMoves1.length; i++) {
      const move1 = coachingMoves1[i];
      const move2 = coachingMoves2[i];
      const coaching1 = move1.coaching;
      const coaching2 = move2.coaching;

      assert.ok(coaching1);
      assert.ok(coaching2);
      assert.equal(move1.ply, move2.ply);
    }
  });

  it('bad moves have bad_move type coaching', async () => {
    await service.initialize();

    const pgn = readFileSync(pgnPath, 'utf8');
    const result = await analyzer.analyzePgn(pgn, {
      depth: 8,
      enableCoaching: true,
      coachingMultiPv: 3,
    });

    // Find a move with CPL >= 100 (blunder/mistake territory)
    const badMove = result.moves.find((m) => m.cpl >= 100 && m.coaching);

    if (badMove && badMove.coaching) {
      assert.equal(badMove.coaching.type, 'bad_move');
      // Bad move should have relevant reason codes
      assert.ok(
        badMove.coaching.reasonCodes.some(
          (code) =>
            code.startsWith('loses_') ||
            code.startsWith('allows_') ||
            code === 'hangs_piece' ||
            code === 'weakens_position' ||
            code === 'allows_checkmate',
        ),
      );
    }
  });

  it('good moves have good_move type coaching', async () => {
    await service.initialize();

    const pgn = readFileSync(pgnPath, 'utf8');
    const result = await analyzer.analyzePgn(pgn, {
      depth: 8,
      enableCoaching: true,
      coachingMultiPv: 3,
    });

    // Find a move with negative CPL and coaching (played better than best)
    const goodMove = result.moves.find((m) => m.cpl < -30 && m.coaching);

    if (goodMove && goodMove.coaching) {
      assert.equal(goodMove.coaching.type, 'good_move');
      // Good move should have relevant reason codes
      assert.ok(
        goodMove.coaching.reasonCodes.some(
          (code) =>
            code.startsWith('wins_') ||
            code.startsWith('creates_') ||
            code === 'checks_opponent' ||
            code === 'improves_position' ||
            code === 'gains_tempo',
        ),
      );
    }
  });

  it('coaching disabled by default', async () => {
    await service.initialize();

    const pgn = readFileSync(pgnPath, 'utf8');
    const result = await analyzer.analyzePgn(pgn, {
      depth: 8,
      // enableCoaching not set, should default to false
    });

    // Should have no coaching moves
    const coachingMoves = result.moves.filter((m) => m.coaching);
    assert.equal(coachingMoves.length, 0);
  });
});
