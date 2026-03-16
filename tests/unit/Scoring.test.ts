import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateCpl,
  classifyMove,
  cplToAccuracy,
  moverPerspectiveAfterMove,
  scoreToCp,
  summarizeBySide,
} from '../../src/analysis/Scoring';

describe('Scoring', () => {
  it('classifies threshold boundaries exactly', () => {
    assert.equal(classifyMove(10), 'Best');
    assert.equal(classifyMove(11), 'Excellent');
    assert.equal(classifyMove(30), 'Excellent');
    assert.equal(classifyMove(31), 'Good');
    assert.equal(classifyMove(60), 'Good');
    assert.equal(classifyMove(61), 'Inaccuracy');
    assert.equal(classifyMove(100), 'Inaccuracy');
    assert.equal(classifyMove(101), 'Mistake');
    assert.equal(classifyMove(250), 'Mistake');
    assert.equal(classifyMove(251), 'Blunder');
  });

  it('normalizes side-to-move scores into mover perspective after move', () => {
    assert.equal(moverPerspectiveAfterMove({ kind: 'cp', value: 80 }), -80);
    assert.equal(moverPerspectiveAfterMove({ kind: 'cp', value: -35 }), 35);
  });

  it('converts mate scores with higher priority than centipawn', () => {
    const mateWin = scoreToCp({ kind: 'mate', value: 3 });
    const mateLoss = scoreToCp({ kind: 'mate', value: -2 });
    assert.ok(mateWin > 20_000);
    assert.ok(mateLoss < -20_000);
  });

  it('computes non-negative cpl and bounded accuracy', () => {
    assert.equal(calculateCpl(120, 140), 0);
    assert.equal(calculateCpl(120, -80), 200);
    assert.equal(cplToAccuracy(0), 100);
    assert.ok(cplToAccuracy(300) < 100);
    assert.ok(cplToAccuracy(300) > 0);
  });

  it('builds side summary with counts and average accuracy', () => {
    const summary = summarizeBySide([
      { color: 'w', cpl: 0, label: 'Best' },
      { color: 'w', cpl: 80, label: 'Inaccuracy' },
      { color: 'b', cpl: 20, label: 'Excellent' },
      { color: 'b', cpl: 300, label: 'Blunder' },
    ]);

    assert.equal(summary.white.counts.best, 1);
    assert.equal(summary.white.counts.inaccuracy, 1);
    assert.equal(summary.black.counts.excellent, 1);
    assert.equal(summary.black.counts.blunder, 1);
    assert.ok(summary.white.accuracy >= 0 && summary.white.accuracy <= 100);
    assert.ok(summary.black.accuracy >= 0 && summary.black.accuracy <= 100);
  });
});