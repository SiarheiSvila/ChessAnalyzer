import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detectCriticalMoment } from '../../src/analysis/CriticalMoments';

describe('CriticalMoments', () => {
  it('flags large evaluation swings', () => {
    const result = detectCriticalMoment({
      evalBeforeForMover: { kind: 'cp', value: 20 },
      evalAfterForMover: { kind: 'cp', value: -180 },
      cpl: 80,
    });

    assert.equal(result.isCritical, true);
    assert.ok(result.reasons.includes('large_eval_swing'));
  });

  it('flags very high centipawn loss even without huge swing', () => {
    const result = detectCriticalMoment({
      evalBeforeForMover: { kind: 'cp', value: 5 },
      evalAfterForMover: { kind: 'cp', value: -20 },
      cpl: 240,
    });

    assert.equal(result.isCritical, true);
    assert.ok(result.reasons.includes('high_centipawn_loss'));
  });

  it('flags mate-score transitions', () => {
    const result = detectCriticalMoment({
      evalBeforeForMover: { kind: 'mate', value: 2 },
      evalAfterForMover: { kind: 'cp', value: 30 },
      cpl: 40,
    });

    assert.equal(result.isCritical, true);
    assert.ok(result.reasons.includes('mate_score_transition'));
  });

  it('keeps quiet moves non-critical', () => {
    const result = detectCriticalMoment({
      evalBeforeForMover: { kind: 'cp', value: 15 },
      evalAfterForMover: { kind: 'cp', value: -40 },
      cpl: 25,
    });

    assert.equal(result.isCritical, false);
    assert.equal(result.reasons.length, 0);
  });
});