import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';

import { GameAnalyzer } from '../../src/analysis/GameAnalyzer';
import { PositionEvaluator } from '../../src/analysis/PositionEvaluator';

/**
 * Mock engine that returns distinct, position-specific PVs deterministically.
 *
 * - For any FEN we pick the first legal move as the "best" move.
 * - The PV is ["<bestMove>", "<secondMove>", "<thirdMove>"] derived from the
 *   position, so it is guaranteed to be different from a different position's PV.
 * - To drive a large CPL (triggering `bad_move` classification and making
 *   canShowThreats=true) we return a high score for `fenBefore` evaluations and
 *   a low score for `fenAfter` evaluations.  We distinguish by tracking which
 *   FENs were seen for each ply.
 */
class ThreatLineMockService {
  /** FENs registered as "before" positions; all others are treated as "after". */
  private readonly fenBeforeSet = new Set<string>();

  public registerFenBefore(fen: string): void {
    this.fenBeforeSet.add(fen);
  }

  public async evaluateFen(fen: string, options?: { depth?: number; multiPv?: number }) {
    const board = new Chess(fen);
    const legalMoves = board.moves({ verbose: true });

    // Build a determinstic 3-move PV from the position.
    const pv: string[] = [];
    let tempBoard = new Chess(fen);
    for (let i = 0; i < 3; i += 1) {
      const moves = tempBoard.moves({ verbose: true });
      if (moves.length === 0) break;
      const uci = `${moves[0].from}${moves[0].to}${moves[0].promotion ?? ''}`;
      pv.push(uci);
      tempBoard.move(moves[0]);
    }

    const bestMove = legalMoves.length > 0
      ? `${legalMoves[0].from}${legalMoves[0].to}${legalMoves[0].promotion ?? ''}`
      : '0000';

    // "Before" positions: engine says good (high score for the mover).
    // "After" positions: engine says poor (low/negative score), simulating a blunder.
    const scoreValue = this.fenBeforeSet.has(fen) ? 200 : -200;

    return {
      bestMove,
      info: {
        raw: 'info',
        depth: options?.depth ?? 12,
        score: { kind: 'cp' as const, value: scoreValue },
        pv,
      },
    };
  }
}

describe('GameAnalyzer threatLine population', () => {
  it('populates coaching.threatLine from fenAfter engine PV', async () => {
    const pgn = '1. e4 e5 2. Nf3 Nc6';

    // Build expected FENs so we can register the "before" positions.
    const { ReplayService } = await import('../../src/chess/ReplayService');
    const plies = new ReplayService().buildPlies(pgn);

    const service = new ThreatLineMockService();
    for (const ply of plies) {
      service.registerFenBefore(ply.fenBefore);
    }

    const analyzer = new GameAnalyzer(new PositionEvaluator(service));
    const result = await analyzer.analyzePgn(pgn, {
      depth: 12,
      enableDeepPass: false,
      enableCoaching: true,
      coachingMultiPv: 3,
    });

    // Sanity: all 4 plies analyzed.
    assert.equal(result.moves.length, 4);

    for (const move of result.moves) {
      const coaching = move.coaching;
      assert.ok(coaching, `move ${move.san} should have coaching data`);

      // threatLine must be an array.
      assert.ok(
        Array.isArray(coaching.threatLine),
        `move ${move.san}: threatLine should be an array, got ${typeof coaching.threatLine}`,
      );

      // threatLine must be non-empty (our mock always returns a 3-move PV).
      assert.ok(
        coaching.threatLine.length > 0,
        `move ${move.san}: threatLine is empty — fenAfter was not evaluated with multiPv`,
      );

      // Every entry must be a non-empty string (valid UCI move).
      for (const uciMove of coaching.threatLine) {
        assert.ok(
          typeof uciMove === 'string' && uciMove.length >= 4,
          `move ${move.san}: threatLine entry "${uciMove}" is not a valid UCI move`,
        );
      }

      // The threatLine must be derived from fenAfter (opponent's turn), NOT from
      // fenBefore (mover's turn).  We verify by checking that the first move in the
      // threatLine is a legal move from fenAfter and that its moving piece belongs
      // to the side to move in fenAfter (i.e., the opponent).
      const boardAfter = new Chess(move.fenAfter);
      const sideToMoveAfter = boardAfter.turn(); // 'w' | 'b'
      const firstThreatMove = coaching.threatLine[0];
      const from = firstThreatMove.slice(0, 2);
      const piece = boardAfter.get(from as Parameters<Chess['get']>[0]);
      assert.ok(
        piece && piece.color === sideToMoveAfter,
        `move ${move.san}: first threatLine move "${firstThreatMove}" should move a ${sideToMoveAfter} piece from fenAfter`,
      );
    }
  });

  it('threatLine differs from bestLine (different starting FEN)', async () => {
    const pgn = '1. e4 e5';

    const { ReplayService } = await import('../../src/chess/ReplayService');
    const plies = new ReplayService().buildPlies(pgn);

    const service = new ThreatLineMockService();
    for (const ply of plies) {
      service.registerFenBefore(ply.fenBefore);
    }

    const analyzer = new GameAnalyzer(new PositionEvaluator(service));
    const result = await analyzer.analyzePgn(pgn, {
      depth: 12,
      enableDeepPass: false,
      enableCoaching: true,
      coachingMultiPv: 3,
    });

    for (const move of result.moves) {
      const coaching = move.coaching;
      assert.ok(coaching);

      assert.ok(Array.isArray(coaching.bestLine) && coaching.bestLine.length > 0, `${move.san}: bestLine is empty`);
      assert.ok(Array.isArray(coaching.threatLine) && coaching.threatLine.length > 0, `${move.san}: threatLine is empty`);

      // bestLine starts from fenBefore (current mover's best), threatLine from fenAfter
      // (opponent's best response).  Because fenBefore ≠ fenAfter the first moves differ.
      assert.notEqual(
        coaching.bestLine[0],
        coaching.threatLine[0],
        `move ${move.san}: bestLine[0] and threatLine[0] should differ because they start from different FENs`,
      );
    }
  });

  it('respects COACHING_PLAYED_LINE_MAX_MOVES cap on threatLine', async () => {
    // Build an extremely long PV (> 16 moves) to verify the cap.
    class LongPvMockService {
      public async evaluateFen(fen: string, _options?: { depth?: number; multiPv?: number }) {
        const board = new Chess(fen);
        const moves = board.moves({ verbose: true });
        const bestMove = moves.length > 0 ? `${moves[0].from}${moves[0].to}` : '0000';
        // Return an artificial 20-entry PV (just repeat bestMove — we only check length).
        const pv = Array.from({ length: 20 }, () => bestMove);
        return {
          bestMove,
          info: { raw: 'info', depth: 12, score: { kind: 'cp' as const, value: 0 }, pv },
        };
      }
    }

    const analyzer = new GameAnalyzer(new PositionEvaluator(new LongPvMockService()));
    const result = await analyzer.analyzePgn('1. e4 e5', {
      depth: 12,
      enableDeepPass: false,
      enableCoaching: true,
      coachingMultiPv: 3,
    });

    for (const move of result.moves) {
      const coaching = move.coaching;
      assert.ok(coaching);
      assert.ok(
        (coaching.threatLine?.length ?? 0) <= 16,
        `move ${move.san}: threatLine length ${coaching.threatLine?.length} exceeds the 16-move cap`,
      );
    }
  });

  it('threatLine is absent when coaching is disabled', async () => {
    class SimpleService {
      public async evaluateFen(fen: string, _options?: unknown) {
        const board = new Chess(fen);
        const moves = board.moves({ verbose: true });
        const bestMove = moves.length > 0 ? `${moves[0].from}${moves[0].to}` : '0000';
        return {
          bestMove,
          info: { raw: 'info', depth: 12, score: { kind: 'cp' as const, value: 0 }, pv: [bestMove] },
        };
      }
    }

    const analyzer = new GameAnalyzer(new PositionEvaluator(new SimpleService()));
    const result = await analyzer.analyzePgn('1. e4 e5', {
      depth: 12,
      enableDeepPass: false,
      enableCoaching: false,
    });

    for (const move of result.moves) {
      assert.equal(move.coaching, undefined, `move ${move.san}: coaching should be absent when disabled`);
    }
  });
});
