export type CoachingMoveType = 'bad_move' | 'good_move' | 'neutral_move';

export type CoachingReasonCode =
  // Bad move scenarios
  | 'loses_to_mate'
  | 'loses_piece'
  | 'loses_material'
  | 'allows_fork'
  | 'allows_pin'
  | 'allows_skewer'
  | 'allows_discovery'
  | 'allows_back_rank_mate'
  | 'hangs_piece'
  | 'allows_checkmate'
  | 'weakens_position'
  // Good move scenarios
  | 'wins_mate'
  | 'wins_piece'
  | 'wins_material'
  | 'creates_fork'
  | 'creates_pin'
  | 'creates_skewer'
  | 'creates_discovery'
  | 'creates_back_rank_mate_threat'
  | 'checks_opponent'
  | 'forces_favorable_trade'
  | 'gains_tempo'
  | 'improves_position'
  // Neutral scenarios
  | 'equal_position'
  | 'maintains_advantage'
  | 'solid_move'
  | 'natural_move';

export type TacticalThemeType = 'fork' | 'pin' | 'skewer' | 'discovery' | 'back_rank_mate';

export interface TacticalTheme {
  theme: TacticalThemeType;
  attackedPiece?: string; // e.g., "queen", "rook", "knight"
}

export interface CoachingExplanation {
  // Classification: what type of move is this?
  type: CoachingMoveType;

  // Human-readable primary reason for classification
  primaryReason: string;
  // e.g., "Loses a piece", "Creates a fork", "Equal position"

  // Structured reason codes for UI filtering/categorization
  reasonCodes: CoachingReasonCode[];
  // e.g., ['loses_material', 'weakens_position']

  // Score gap in centipawns between best move and played move
  scoreGapCp: number;
  // e.g., 250 means played move is 2.5 pawns worse
  // negative means played move is better

  // Best line from this position (rank-1 from MultiPV)
  bestLine: string[];
  // e.g., ['e2e4', 'e7e5', 'g1f3', 'b8c6']

  // Played line (continuation from actual game move)
  playedLine: string[];
  // e.g., ['a2a3', 'd2d4', ...] if a2a3 was played

  // Engine threat/punishment line after the played move (from fenAfter)
  threatLine?: string[];
  // e.g., ['d8h4', 'g2g3', 'h4e4'] after a weakening move

  // Number of moves in comparison (usually 3-5)
  sequenceLength: number;

  // Optional: for mate scenarios, number of moves to mate
  mateInMoves?: number;
  // e.g., 5 means mate in 5 moves

  // Optional: tactical theme details
  tacticalTheme?: TacticalTheme;
}
