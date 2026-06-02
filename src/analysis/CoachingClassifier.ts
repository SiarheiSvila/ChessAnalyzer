import type { UciScore } from '../engine/uci/UciTypes';
import type { AnalyzedMove } from './dto/AnalysisResult';
import type { CoachingExplanation, CoachingMoveType, CoachingReasonCode, TacticalTheme, TacticalThemeType } from './dto/CoachingExplanation';
import { Chess } from 'chess.js';

export class CoachingClassifier {
  private static readonly COACHING_LINE_MAX_MOVES = 16;

  /**
   * Classify a move and generate coaching explanation.
   * Always returns coaching for any move; caller can filter based on type if desired.
   */
  public classifyMove(
    move: AnalyzedMove,
    bestLine: string[],
    playedLine: string[],
  ): CoachingExplanation | undefined {
    const scoreGapCp = this.computeScoreGap(move.evalBestAfter, move.evalAfter);
    const mateInMoves = this.extractMateInMoves(move.evalAfter);
    const tacticalTheme = this.detectTacticalTheme(move);
    const { type, reasonCodes } = this.classifyType(scoreGapCp, mateInMoves, tacticalTheme?.theme);

    const primaryReason = this.generatePrimaryReason(type, reasonCodes, scoreGapCp, mateInMoves);

    return {
      type,
      primaryReason,
      reasonCodes,
      scoreGapCp,
      bestLine: bestLine.slice(0, CoachingClassifier.COACHING_LINE_MAX_MOVES),
      playedLine: playedLine.slice(0, CoachingClassifier.COACHING_LINE_MAX_MOVES),
      sequenceLength: Math.max(bestLine.length, playedLine.length),
      mateInMoves,
      tacticalTheme,
    };
  }

  /**
   * Compute score gap in centipawns, accounting for side-to-move.
   * Positive gap = bad for us (best is better)
   * Negative gap = good for us (best is worse, we played better)
   */
  private computeScoreGap(bestScore: UciScore, actualScore: UciScore): number {
    const bestCp = this.scoreToCP(bestScore);
    const actualCp = this.scoreToCP(actualScore);
    return bestCp - actualCp;
  }

  /**
   * Convert engine score to centipawns from mover's perspective.
   */
  private scoreToCP(score: UciScore): number {
    if (score.kind === 'cp') {
      return score.value;
    }

    // Mate score: map to large CP value
    // Mate in N: score = N (positive for winner)
    if (score.kind === 'mate') {
      return score.value > 0 ? 50000 + score.value * 1000 : -50000 - Math.abs(score.value) * 1000;
    }

    return 0;
  }

  /**
   * Extract mate-in-N from score if applicable.
   */
  private extractMateInMoves(score: UciScore): number | undefined {
    if (score.kind === 'mate') {
      return Math.abs(score.value);
    }
    return undefined;
  }

  private detectTacticalTheme(move: AnalyzedMove): TacticalTheme | undefined {
    // Analyse fenAfter: what can the opponent do from this position?
    // We look one ply deep from the opponent's perspective using chess.js.
    try {
      const board = new Chess(move.fenAfter);
      const opponent = move.color === 'w' ? 'b' : 'w';

      // Back-rank mate threat: opponent has a rook/queen on the 7th rank attacking 8th rank
      // and our king is on the back rank with no escape squares.
      const backRankThreat = this.checkBackRankThreat(board, move.color);
      if (backRankThreat) return { theme: 'back_rank_mate' };

      // Try every opponent reply and test for fork / pin / skewer / discovery
      const replies = board.moves({ verbose: true });
      for (const reply of replies) {
        const child = new Chess(move.fenAfter);
        child.move(reply);

        const fork = this.checkFork(child, opponent);
        if (fork) return { theme: 'fork', attackedPiece: fork };

        const pin = this.checkPin(new Chess(move.fenAfter), reply.lan ?? `${reply.from}${reply.to}`);
        if (pin) return { theme: 'pin', attackedPiece: pin };

        const skewer = this.checkSkewer(new Chess(move.fenAfter), reply.lan ?? `${reply.from}${reply.to}`);
        if (skewer) return { theme: 'skewer', attackedPiece: skewer };
      }

      // Discovery: does the played move itself uncover an attack?
      const discovery = this.checkDiscovery(move);
      if (discovery) return { theme: 'discovery' };
    } catch {
      // chess.js errors on illegal positions — skip gracefully
    }

    return undefined;
  }

  private checkBackRankThreat(board: Chess, movedColor: 'w' | 'b'): boolean {
    // movedColor just moved — check if their back rank king is trapped and under attack potential
    const backRank = movedColor === 'w' ? '1' : '8';
    const kingSquare = board
      .board()
      .flat()
      .find((sq) => sq && sq.type === 'k' && sq.color === movedColor)?.square;

    if (!kingSquare || !kingSquare.endsWith(backRank)) return false;

    // Check if all king escape squares are occupied by own pieces (no flight squares)
    const file = kingSquare.charCodeAt(0) - 97; // 0-7
    const rank = parseInt(kingSquare[1], 10);
    const adjacentSquares = [
      [file - 1, rank], [file + 1, rank],
      [file - 1, rank + (movedColor === 'w' ? 1 : -1)],
      [file, rank + (movedColor === 'w' ? 1 : -1)],
      [file + 1, rank + (movedColor === 'w' ? 1 : -1)],
    ].filter(([f, r]) => f >= 0 && f <= 7 && r >= 1 && r <= 8);

    const hasFlightSquare = adjacentSquares.some(([f, r]) => {
      const sq = `${String.fromCharCode(97 + f)}${r}` as Parameters<typeof board.get>[0];
      const piece = board.get(sq);
      return !piece || piece.color !== movedColor;
    });

    if (hasFlightSquare) return false;

    // Check if any opponent piece attacks the back rank (simplified: opponent has R or Q)
    const opponent = movedColor === 'w' ? 'b' : 'w';
    const flatBoard = board.board().flat();
    return flatBoard.some((sq) => sq && sq.color === opponent && (sq.type === 'r' || sq.type === 'q'));
  }

  private checkFork(boardAfterReply: Chess, attackingColor: 'w' | 'b'): string | undefined {
    // A fork: one piece attacks two or more valuable enemy pieces simultaneously
    const flatBoard = boardAfterReply.board().flat();
    const valuableTypes = new Set(['q', 'r', 'b', 'n', 'k']);
    const defender = attackingColor === 'w' ? 'b' : 'w';

    // Find all squares attacked by each attacker piece
    for (const sq of flatBoard) {
      if (!sq || sq.color !== attackingColor || sq.type === 'p') continue;
      // Use chess.js attacks() — available in chess.js v1+
      // Fallback: count how many valuable defender pieces this attacker targets
      const attacked = flatBoard.filter((target) => {
        if (!target || target.color !== defender || !valuableTypes.has(target.type)) return false;
        return boardAfterReply.isAttacked(target.square, attackingColor);
      });
      if (attacked.length >= 2) {
        // Return the highest-value attacked piece name
        const best = attacked.sort((a, b) => this.pieceValue(b!.type) - this.pieceValue(a!.type))[0];
        return this.pieceName(best!.type);
      }
    }
    return undefined;
  }

  private checkPin(boardBeforeReply: Chess, replyLan: string): string | undefined {
    // A pin: after the reply, a defender piece cannot move without exposing their king.
    // Only sliding pieces (bishop, rook, queen) can create pins.
    const from = replyLan.slice(0, 2);
    const to = replyLan.slice(2, 4);
    const promotion = replyLan.length > 4 ? replyLan[4] as 'q' | 'r' | 'b' | 'n' : undefined;

    try {
      boardBeforeReply.move({ from, to, promotion });
    } catch {
      return undefined;
    }

    const flatBoard = boardBeforeReply.board().flat();
    const attackingColor = boardBeforeReply.turn() === 'w' ? 'b' : 'w';
    const defender = attackingColor === 'w' ? 'b' : 'w';

    // The pinning piece is the one that just moved (at `to`)
    const pinningPiece = boardBeforeReply.get(to as Parameters<typeof boardBeforeReply.get>[0]);
    if (!pinningPiece || !['b', 'r', 'q'].includes(pinningPiece.type)) return undefined;

    const defenderKing = flatBoard.find((p) => p && p.color === defender && p.type === 'k');
    if (!defenderKing) return undefined;

    // Find defender pieces on the ray between `to` and the king
    for (const sq of flatBoard) {
      if (!sq || sq.color !== defender || sq.type === 'k') continue;
      if (!this.isOnRay(to, sq.square, defenderKing.square)) continue;
      // Verify the piece behind it (king) is more valuable — a real pin to the king
      // Only flag if the pinned piece is NOT a pawn or is at least a minor piece
      if (sq.type === 'p') continue;
      return this.pieceName(sq.type);
    }
    return undefined;
  }

  private checkSkewer(boardBeforeReply: Chess, replyLan: string): string | undefined {
    // A skewer: sliding piece attacks a valuable piece; after it moves, a lesser piece behind is taken.
    const from = replyLan.slice(0, 2);
    const to = replyLan.slice(2, 4);
    const promotion = replyLan.length > 4 ? replyLan[4] as 'q' | 'r' | 'b' | 'n' : undefined;

    try {
      boardBeforeReply.move({ from, to, promotion });
    } catch {
      return undefined;
    }

    const flatBoard = boardBeforeReply.board().flat();
    const attackingColor = boardBeforeReply.turn() === 'w' ? 'b' : 'w';
    const defender = attackingColor === 'w' ? 'b' : 'w';

    const pinningPiece = boardBeforeReply.get(to as Parameters<typeof boardBeforeReply.get>[0]);
    if (!pinningPiece || !['b', 'r', 'q'].includes(pinningPiece.type)) return undefined;

    for (const sq of flatBoard) {
      // Front piece must be a king or queen (high value — worth skewereing)
      if (!sq || sq.color !== defender || !['k', 'q'].includes(sq.type)) continue;
      if (!boardBeforeReply.isAttacked(sq.square, attackingColor)) continue;

      const behind = flatBoard.find((p) => {
        if (!p || p.color !== defender || p.square === sq.square) return false;
        return (
          this.isOnRay(to, sq.square, p.square) &&
          this.pieceValue(p.type) < this.pieceValue(sq.type)
        );
      });
      if (behind) return this.pieceName(sq.type);
    }
    return undefined;
  }

  private checkDiscovery(move: AnalyzedMove): boolean {
    // A discovered attack: the played move uncovers an attack by a piece behind it
    try {
      const boardBefore = new Chess(move.fenBefore);
      const boardAfter = new Chess(move.fenAfter);
      const attacker = move.color;
      const defender = attacker === 'w' ? 'b' : 'w';

      const flatBefore = boardBefore.board().flat();
      const flatAfter = boardAfter.board().flat();

      // Find pieces that were not attacking before but are attacking after (excluding the moved piece)
      const movedPieceTo = move.uciMove.slice(2, 4);

      for (const sq of flatBefore) {
        if (!sq || sq.color !== attacker || sq.square === move.uciMove.slice(0, 2)) continue;
        // Find defender pieces now newly attacked
        for (const target of flatAfter) {
          if (!target || target.color !== defender) continue;
          const wasAttackedBefore = boardBefore.isAttacked(target.square, attacker);
          const isAttackedAfter = boardAfter.isAttacked(target.square, attacker);
          // Newly attacked and the attacker is not the moved piece
          if (!wasAttackedBefore && isAttackedAfter && target.square !== movedPieceTo) {
            return true;
          }
        }
      }
    } catch {
      // ignore
    }
    return false;
  }

  private isOnRay(origin: string, middle: string, end: string): boolean {
    const oFile = origin.charCodeAt(0) - 97;
    const oRank = parseInt(origin[1], 10);
    const mFile = middle.charCodeAt(0) - 97;
    const mRank = parseInt(middle[1], 10);
    const eFile = end.charCodeAt(0) - 97;
    const eRank = parseInt(end[1], 10);

    const df1 = mFile - oFile;
    const dr1 = mRank - oRank;
    const df2 = eFile - mFile;
    const dr2 = eRank - mRank;

    if (df1 === 0 && df2 === 0 && dr1 !== 0 && Math.sign(dr1) === Math.sign(dr2)) return true;
    if (dr1 === 0 && dr2 === 0 && df1 !== 0 && Math.sign(df1) === Math.sign(df2)) return true;
    if (Math.abs(df1) === Math.abs(dr1) && Math.abs(df2) === Math.abs(dr2) &&
        Math.sign(df1) === Math.sign(df2) && Math.sign(dr1) === Math.sign(dr2)) return true;

    return false;
  }

  private pieceValue(type: string): number {
    switch (type) {
      case 'q': return 9;
      case 'r': return 5;
      case 'b': return 3;
      case 'n': return 3;
      case 'p': return 1;
      default: return 0;
    }
  }

  private pieceName(type: string): string {
    switch (type) {
      case 'q': return 'queen';
      case 'r': return 'rook';
      case 'b': return 'bishop';
      case 'n': return 'knight';
      case 'k': return 'king';
      default: return 'pawn';
    }
  }

  /**
   * Classify move type and reason codes based on score gap and mate status.
   */
  private classifyType(
    scoreGapCp: number,
    mateInMoves?: number,
    tacticalTheme?: TacticalThemeType,
  ): { type: CoachingMoveType; reasonCodes: CoachingReasonCode[] } {
    // STAGE 1: Mate scenarios (highest priority)
    if (mateInMoves !== undefined) {
      if (scoreGapCp > 0) {
        // We're worse => opponent has mate
        return {
          type: 'bad_move',
          reasonCodes: ['loses_to_mate'],
        };
      } else {
        // We're better => we have mate
        return {
          type: 'good_move',
          reasonCodes: ['wins_mate'],
        };
      }
    }

    // STAGE 2: Tactical themes refine reason codes for bad moves
    if (tacticalTheme && scoreGapCp >= 60) {
      const allowsCode: CoachingReasonCode = (() => {
        switch (tacticalTheme) {
          case 'fork': return 'allows_fork';
          case 'pin': return 'allows_pin';
          case 'skewer': return 'allows_skewer';
          case 'discovery': return 'allows_discovery';
          case 'back_rank_mate': return 'allows_back_rank_mate';
        }
      })();
      return { type: 'bad_move', reasonCodes: [allowsCode, 'weakens_position'] };
    }

    // STAGE 3: Large score gaps indicate material or tactical loss
    if (scoreGapCp > 200) {
      return {
        type: 'bad_move',
        reasonCodes: ['weakens_position', 'allows_checkmate'],
      };
    }

    if (scoreGapCp > 100) {
      return {
        type: 'bad_move',
        reasonCodes: ['loses_material', 'weakens_position'],
      };
    }

    if (scoreGapCp >= 60) {
      return {
        type: 'bad_move',
        reasonCodes: ['weakens_position'],
      };
    }

    if (scoreGapCp > 30) {
      // Minor advantage to best move
      return {
        type: 'neutral_move',
        reasonCodes: ['maintains_advantage'],
      };
    }

    if (scoreGapCp > 10) {
      // Slight advantage to best move
      return {
        type: 'neutral_move',
        reasonCodes: ['solid_move'],
      };
    }

    if (scoreGapCp >= -10) {
      // Roughly equal
      return {
        type: 'neutral_move',
        reasonCodes: ['equal_position'],
      };
    }

    if (scoreGapCp >= -30) {
      // Slight advantage to played move
      return {
        type: 'good_move',
        reasonCodes: ['improves_position'],
      };
    }

    if (scoreGapCp >= -60) {
      // Moderate advantage
      return {
        type: 'good_move',
        reasonCodes: ['gains_tempo', 'improves_position'],
      };
    }

    if (scoreGapCp >= -100) {
      // Good advantage
      return {
        type: 'good_move',
        reasonCodes: ['wins_material', 'improves_position'],
      };
    }

    // Significant material win
    return {
      type: 'good_move',
      reasonCodes: ['wins_material', 'wins_piece'],
    };
  }

  /**
   * Generate human-readable hint from move type and reason codes.
   */
  private generatePrimaryReason(
    type: CoachingMoveType,
    reasonCodes: CoachingReasonCode[],
    scoreGapCp: number,
    mateInMoves?: number,
  ): string {
    if (reasonCodes.length === 0) {
      return type === 'bad_move' ? 'Weaker move' : type === 'good_move' ? 'Good move' : 'Neutral move';
    }

    const primaryReason = reasonCodes[0];

    // Map reason codes to user-friendly hints
    const hints: Record<CoachingReasonCode, string> = {
      // Bad moves
      loses_to_mate: 'Loses to mate',
      loses_piece: 'Loses a piece',
      loses_material: 'Loses material',
      allows_fork: 'Allows a fork',
      allows_pin: 'Allows a pin',
      allows_skewer: 'Allows a skewer',
      allows_discovery: 'Allows a discovery',
      allows_back_rank_mate: 'Allows back rank mate',
      hangs_piece: 'Hangs a piece',
      allows_checkmate: 'Allows checkmate',
      weakens_position: 'Weakens the position',

      // Good moves
      wins_mate: 'Wins a mate',
      wins_piece: 'Wins a piece',
      wins_material: 'Wins material',
      creates_fork: 'Creates a fork',
      creates_pin: 'Creates a pin',
      creates_skewer: 'Creates a skewer',
      creates_discovery: 'Creates a discovery',
      creates_back_rank_mate_threat: 'Creates back rank mate threat',
      checks_opponent: 'Checks opponent',
      forces_favorable_trade: 'Forces favorable trade',
      gains_tempo: 'Gains a tempo',
      improves_position: 'Improves the position',

      // Neutral
      equal_position: 'Equal position',
      maintains_advantage: 'Maintains advantage',
      solid_move: 'Solid move',
      natural_move: 'Natural continuation',
    };

    return hints[primaryReason] || 'Good move';
  }
}
