import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const helpers = require('../../public/ui-helpers.js');

describe('UI helpers', () => {
  it('buildMoveRows includes evaluation text for every move', () => {
    const moves = [
      { ply: 1, san: 'e4', color: 'w', label: 'Best', cpl: 0, evalAfter: { kind: 'cp', value: 34 } },
      { ply: 2, san: 'c5', color: 'b', label: 'Good', cpl: 42, evalAfter: { kind: 'cp', value: -28 } },
      { ply: 3, san: 'Nf3', color: 'w', label: 'Excellent', cpl: 12, evalAfter: { kind: 'mate', value: 3 } },
    ];

    const rows = helpers.buildMoveRows(moves);
    assert.equal(rows.length, moves.length);

    rows.forEach((row) => {
      assert.ok(typeof row.evalText === 'string' && row.evalText.length > 0);
      assert.ok(row.rowText.includes(row.evalText));
    });
  });

  it('stepView exposes eval display for each selected step', () => {
    const moves = [
      {
        san: 'e4',
        color: 'w',
        label: 'Best',
        cpl: 0,
        bestMove: 'e2e4',
        evalBefore: { kind: 'cp', value: 20 },
        evalAfter: { kind: 'cp', value: 34 },
      },
      {
        san: 'e5',
        color: 'b',
        label: 'Good',
        cpl: 55,
        bestMove: 'e7e5',
        evalBefore: { kind: 'cp', value: -10 },
        evalAfter: { kind: 'cp', value: -32 },
      },
    ];

    const first = helpers.stepView(moves[0], 0, moves.length);
    const second = helpers.stepView(moves[1], 1, moves.length);

    assert.equal(first.evalDisplay, 'Eval: +0.34');
    assert.equal(second.evalDisplay, 'Eval: -0.32');
    assert.equal(first.stepText, 'Step: 1/2');
    assert.equal(second.stepText, 'Step: 2/2');
  });

  it('normalizes eval values to selected player perspective', () => {
    const moves = [
      {
        ply: 1,
        san: 'e4',
        color: 'w',
        label: 'Best',
        cpl: 0,
        bestMove: 'e2e4',
        evalBefore: { kind: 'cp', value: 20 },
        evalAfter: { kind: 'cp', value: 35 },
      },
      {
        ply: 2,
        san: 'c5',
        color: 'b',
        label: 'Good',
        cpl: 25,
        bestMove: 'c7c5',
        evalBefore: { kind: 'cp', value: -35 },
        evalAfter: { kind: 'cp', value: -10 },
      },
    ];

    const whiteRows = helpers.buildMoveRows(moves, 'w');
    const blackRows = helpers.buildMoveRows(moves, 'b');
    assert.equal(whiteRows[0].evalText, '+0.35');
    assert.equal(whiteRows[1].evalText, '+0.10');
    assert.equal(blackRows[0].evalText, '-0.35');
    assert.equal(blackRows[1].evalText, '-0.10');

    const whiteStep = helpers.stepView(moves[0], 0, 2, 'w');
    const blackStep = helpers.stepView(moves[0], 0, 2, 'b');
    assert.equal(whiteStep.evalDisplay, 'Eval: +0.35');
    assert.equal(blackStep.evalDisplay, 'Eval: -0.35');
  });
});