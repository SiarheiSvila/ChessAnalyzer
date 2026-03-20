import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildRankedCandidateLines, parseInfoLine } from '../../src/engine/uci/UciProtocol';

describe('UCI MultiPV parsing', () => {
  it('builds deterministic ranked candidate lines by multipv rank', () => {
    const info1 = parseInfoLine('info depth 14 multipv 1 score cp 28 pv e2e4 e7e5 g1f3');
    const info2 = parseInfoLine('info depth 14 multipv 2 score cp 20 pv d2d4 d7d5 c2c4');
    const info3 = parseInfoLine('info depth 14 multipv 3 score cp 12 pv c2c4 e7e5 b1c3');

    assert.ok(info1);
    assert.ok(info2);
    assert.ok(info3);

    const ranked = buildRankedCandidateLines([info1, info2, info3], 3);

    assert.equal(ranked.length, 3);
    assert.deepEqual(ranked.map((line) => line.rank), [1, 2, 3]);
    assert.deepEqual(ranked[0].info.pv, ['e2e4', 'e7e5', 'g1f3']);
    assert.deepEqual(ranked[1].info.pv, ['d2d4', 'd7d5', 'c2c4']);
    assert.deepEqual(ranked[2].info.pv, ['c2c4', 'e7e5', 'b1c3']);
  });

  it('keeps only rank-1 line when multipv set is incomplete', () => {
    const rank1Deep = parseInfoLine('info depth 16 multipv 1 score cp 34 pv e2e4 e7e5 g1f3');
    const rank1Shallow = parseInfoLine('info depth 10 multipv 1 score cp 18 pv e2e4 e7e5');
    const rank2Only = parseInfoLine('info depth 16 multipv 2 score cp 19 pv d2d4 d7d5 c2c4');

    assert.ok(rank1Deep);
    assert.ok(rank1Shallow);
    assert.ok(rank2Only);

    const ranked = buildRankedCandidateLines([rank1Shallow, rank2Only, rank1Deep], 3);

    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].rank, 1);
    assert.equal(ranked[0].info.depth, 16);
    assert.deepEqual(ranked[0].info.pv, ['e2e4', 'e7e5', 'g1f3']);
  });
});
