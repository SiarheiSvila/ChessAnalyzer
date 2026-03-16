import type { UciScore } from '../engine/uci/UciTypes';

export type MoveLabel = 'Best' | 'Excellent' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder';

export interface SideSummary {
  accuracy: number;
  counts: {
    best: number;
    excellent: number;
    good: number;
    inaccuracy: number;
    mistake: number;
    blunder: number;
  };
}

function mateToCp(value: number): number {
  const sign = Math.sign(value) || 1;
  const magnitude = 100_000 - Math.min(99, Math.abs(value)) * 1_000;
  return sign * magnitude;
}

export function scoreToCp(score: UciScore): number {
  if (score.kind === 'cp') {
    return score.value;
  }

  return mateToCp(score.value);
}

export function moverPerspectiveAfterMove(scoreFromOppSideToMove: UciScore): number {
  return -scoreToCp(scoreFromOppSideToMove);
}

export function classifyMove(cpl: number): MoveLabel {
  if (cpl <= 10) {
    return 'Best';
  }

  if (cpl <= 30) {
    return 'Excellent';
  }

  if (cpl <= 60) {
    return 'Good';
  }

  if (cpl <= 100) {
    return 'Inaccuracy';
  }

  if (cpl <= 250) {
    return 'Mistake';
  }

  return 'Blunder';
}

export function calculateCpl(bestAfterMoverCp: number, actualAfterMoverCp: number): number {
  return Math.max(0, Math.round(bestAfterMoverCp - actualAfterMoverCp));
}

export function cplToAccuracy(cpl: number): number {
  const value = 100 * Math.exp(-cpl / 170);
  return Number(Math.max(0, Math.min(100, value)).toFixed(1));
}

function emptySummary(): SideSummary {
  return {
    accuracy: 0,
    counts: {
      best: 0,
      excellent: 0,
      good: 0,
      inaccuracy: 0,
      mistake: 0,
      blunder: 0,
    },
  };
}

export function summarizeBySide(moves: Array<{ color: 'w' | 'b'; cpl: number; label: MoveLabel }>): {
  white: SideSummary;
  black: SideSummary;
} {
  const white = emptySummary();
  const black = emptySummary();

  let whiteAccSum = 0;
  let blackAccSum = 0;
  let whiteCount = 0;
  let blackCount = 0;

  for (const move of moves) {
    const side = move.color === 'w' ? white : black;
    const accuracy = cplToAccuracy(move.cpl);
    if (move.color === 'w') {
      whiteAccSum += accuracy;
      whiteCount += 1;
    } else {
      blackAccSum += accuracy;
      blackCount += 1;
    }

    switch (move.label) {
      case 'Best':
        side.counts.best += 1;
        break;
      case 'Excellent':
        side.counts.excellent += 1;
        break;
      case 'Good':
        side.counts.good += 1;
        break;
      case 'Inaccuracy':
        side.counts.inaccuracy += 1;
        break;
      case 'Mistake':
        side.counts.mistake += 1;
        break;
      case 'Blunder':
        side.counts.blunder += 1;
        break;
    }
  }

  white.accuracy = whiteCount > 0 ? Number((whiteAccSum / whiteCount).toFixed(1)) : 0;
  black.accuracy = blackCount > 0 ? Number((blackAccSum / blackCount).toFixed(1)) : 0;

  return { white, black };
}