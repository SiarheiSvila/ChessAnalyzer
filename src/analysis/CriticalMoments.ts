import type { UciScore } from '../engine/uci/UciTypes';

import { scoreToCp } from './Scoring';

export interface CriticalMomentResult {
  isCritical: boolean;
  reasons: string[];
  evalSwingCp: number;
}

export function detectCriticalMoment(input: {
  evalBeforeForMover: UciScore;
  evalAfterForMover: UciScore;
  cpl: number;
}): CriticalMomentResult {
  const beforeCp = scoreToCp(input.evalBeforeForMover);
  const afterCp = scoreToCp(input.evalAfterForMover);
  const swing = Math.abs(afterCp - beforeCp);
  const reasons: string[] = [];

  if (swing >= 150) {
    reasons.push('large_eval_swing');
  }

  if (input.cpl >= 200) {
    reasons.push('high_centipawn_loss');
  }

  if (input.evalBeforeForMover.kind === 'mate' || input.evalAfterForMover.kind === 'mate') {
    reasons.push('mate_score_transition');
  }

  return {
    isCritical: reasons.length > 0,
    reasons,
    evalSwingCp: swing,
  };
}