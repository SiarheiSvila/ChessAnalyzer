import type { UciScore } from '../../engine/uci/UciTypes';
import type { MoveLabel } from '../Scoring';

export interface RawMoveAnalysis {
  ply: number;
  san: string;
  uciMove: string;
  color: 'w' | 'b';
  fenBefore: string;
  fenAfter: string;
  bestMove: string;
  evalBefore: UciScore;
  evalAfter: UciScore;
  pv: string[];
}

export interface AnalyzedMove extends RawMoveAnalysis {
  evalBestAfter: UciScore;
  cpl: number;
  label: MoveLabel;
  isCritical: boolean;
  criticalReasons: string[];
  evalSwingCp: number;
}

export interface RawAnalysisResult {
  pgn?: string;
  game: {
    event?: string;
    white?: string;
    black?: string;
    result?: string;
    headers: Record<string, string>;
  };
  settings: {
    depth: number;
    deepDepth: number;
    deepReanalyzedPlies: number;
    cache: {
      hits: number;
      misses: number;
      size: number;
    };
  };
  moves: AnalyzedMove[];
  summary: {
    accuracyWhite: number;
    accuracyBlack: number;
    counts: {
      white: {
        best: number;
        excellent: number;
        good: number;
        inaccuracy: number;
        mistake: number;
        blunder: number;
      };
      black: {
        best: number;
        excellent: number;
        good: number;
        inaccuracy: number;
        mistake: number;
        blunder: number;
      };
    };
    criticalMoments: number;
  };
}