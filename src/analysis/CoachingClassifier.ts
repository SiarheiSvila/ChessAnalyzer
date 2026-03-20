import type { UciScore } from '../engine/uci/UciTypes';
import type { AnalyzedMove } from './dto/AnalysisResult';
import type { CoachingExplanation, CoachingMoveType, CoachingReasonCode, TacticalThemeType } from './dto/CoachingExplanation';
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
    const tacticalTheme = this.detectTacticalTheme(bestLine, playedLine);
    const { type, reasonCodes } = this.classifyType(scoreGapCp, mateInMoves, tacticalTheme);

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
      tacticalTheme: tacticalTheme ? { theme: tacticalTheme } : undefined,
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

  /**
   * Detect if best vs played line contains a tactical pattern.
   * Returns tactical theme type if detected.
   */
  private detectTacticalTheme(bestLine: string[], playedLine: string[]): TacticalThemeType | undefined {
    if (bestLine.length === 0 || playedLine.length === 0) {
      return undefined;
    }

    // For now, use simple heuristics:
    // - If first move differs, it might be a tactical pattern from the position
    // - We'd need deep move analysis to detect exact tactics (beyond this MVP)
    // For Phase 2, we defer tactical detection to future phases with more context

    return undefined;
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

    // STAGE 2: Large score gaps indicate material or tactical loss
    if (scoreGapCp > 200) {
      // Significant disadvantage
      return {
        type: 'bad_move',
        reasonCodes: ['weakens_position', 'allows_checkmate'],
      };
    }

    if (scoreGapCp > 100) {
      // Material loss or major tactical blunder
      return {
        type: 'bad_move',
        reasonCodes: ['loses_material', 'weakens_position'],
      };
    }

    if (scoreGapCp >= 60) {
      // Tactical or positional oversight (boundary >= 60)
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
