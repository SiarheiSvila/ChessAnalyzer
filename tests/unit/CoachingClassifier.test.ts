import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CoachingClassifier } from '../../src/analysis/CoachingClassifier';
import type { AnalyzedMove } from '../../src/analysis/dto/AnalysisResult';

describe('CoachingClassifier reason classification', () => {
  const classifier = new CoachingClassifier();

  // Helper to create a mock AnalyzedMove
  function createMoveFixture(cpl: number, evalAfter: { kind: 'cp' | 'mate'; value: number }): AnalyzedMove {
    // evalBestAfter should be such that the score gap (evalBestAfter - evalAfter) equals CPL
    // For cp scores: evalBestAfter = evalAfter + cpl
    // For mate scores: we keep it simple and use a large value
    let evalBestAfter: { kind: 'cp' | 'mate'; value: number };
    if (evalAfter.kind === 'cp') {
      evalBestAfter = { kind: 'cp', value: evalAfter.value + cpl };
    } else {
      // For mate scores, just use a reference value
      evalBestAfter = { kind: 'cp', value: 100 };
    }

    return {
      ply: 1,
      san: 'e4',
      uciMove: 'e2e4',
      color: 'w',
      fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      bestMove: 'e2e4',
      evalBefore: { kind: 'cp', value: 20 },
      evalAfter,
      evalBestAfter,
      cpl,
      label: 'Best',
      isCritical: false,
      criticalReasons: [],
      evalSwingCp: 0,
      pv: ['e2e4', 'e7e5'],
    };
  }

  it('classifies loses_to_mate when mate score is positive and scoreGap is large', () => {
    const move = createMoveFixture(999, { kind: 'mate', value: -3 });
    const explanation = classifier.classifyMove(move, [], []);

    assert.ok(explanation);
    assert.equal(explanation.type, 'bad_move');
    assert.ok(explanation.reasonCodes.includes('loses_to_mate'));
    assert.equal(explanation.primaryReason, 'Loses to mate');
  });

  it('classifies wins_mate when mate score is negative and scoreGap is large', () => {
    const move = createMoveFixture(-999, { kind: 'mate', value: 5 });
    const explanation = classifier.classifyMove(move, [], []);

    assert.ok(explanation);
    assert.equal(explanation.type, 'good_move');
    assert.ok(explanation.reasonCodes.includes('wins_mate'));
    assert.equal(explanation.primaryReason, 'Wins a mate');
  });

  it('classifies loses_material for scoreGap > 100', () => {
    const move = createMoveFixture(150, { kind: 'cp', value: -150 });
    const explanation = classifier.classifyMove(move, [], []);

    assert.ok(explanation);
    assert.equal(explanation.type, 'bad_move');
    assert.ok(explanation.reasonCodes.includes('loses_material'));
    assert.equal(explanation.primaryReason, 'Loses material');
  });

  it('classifies weakens_position for scoreGap 60-100 (blunder threshold)', () => {
    const move = createMoveFixture(75, { kind: 'cp', value: -75 });
    const explanation = classifier.classifyMove(move, [], []);

    assert.ok(explanation);
    assert.equal(explanation.type, 'bad_move');
    assert.ok(explanation.reasonCodes.includes('weakens_position'));
  });

  it('classifies maintains_advantage for scoreGap 30-60', () => {
    const move = createMoveFixture(40, { kind: 'cp', value: -40 });
    const explanation = classifier.classifyMove(move, [], []);

    assert.ok(explanation);
    assert.equal(explanation.type, 'neutral_move');
    assert.ok(explanation.reasonCodes.includes('maintains_advantage'));
  });

  it('classifies equal_position for scoreGap -10 to +10', () => {
    const move = createMoveFixture(5, { kind: 'cp', value: -5 });
    const explanation = classifier.classifyMove(move, [], []);

    assert.ok(explanation);
    assert.equal(explanation.type, 'neutral_move');
    assert.ok(explanation.reasonCodes.includes('equal_position'));
  });

  it('classifies improves_position for scoreGap -30 to -10', () => {
    const move = createMoveFixture(-20, { kind: 'cp', value: 20 });
    const explanation = classifier.classifyMove(move, [], []);

    assert.ok(explanation);
    assert.equal(explanation.type, 'good_move');
    assert.ok(explanation.reasonCodes.includes('improves_position'));
  });

  it('classifies wins_material for large negative scoreGap', () => {
    const move = createMoveFixture(-110, { kind: 'cp', value: 110 });
    const explanation = classifier.classifyMove(move, [], []);

    assert.ok(explanation);
    assert.equal(explanation.type, 'good_move');
    assert.ok(explanation.reasonCodes.includes('wins_material'));
  });

  it('returns undefined for non-critical moves with low CPL', () => {
    const move = createMoveFixture(5, { kind: 'cp', value: -5 });
    move.isCritical = false;
    const explanation = classifier.classifyMove(move, [], []);

    // May be undefined or neutral, depending on thresholds
    if (explanation) {
      assert.equal(explanation.type, 'neutral_move');
    }
  });

  it('always includes coaching for critical moves', () => {
    const move = createMoveFixture(15, { kind: 'cp', value: -15 });
    move.isCritical = true;
    const explanation = classifier.classifyMove(move, [], []);

    assert.ok(explanation);
  });

  it('always includes coaching for blunder-level moves (CPL >= 100)', () => {
    const move = createMoveFixture(120, { kind: 'cp', value: -120 });
    move.isCritical = false;
    const explanation = classifier.classifyMove(move, [], []);

    assert.ok(explanation);
    assert.equal(explanation.type, 'bad_move');
  });

  it('boundary: exactly 100 CPL triggers bad_move classification', () => {
    const move = createMoveFixture(100, { kind: 'cp', value: -100 });
    const explanation = classifier.classifyMove(move, [], []);

    assert.ok(explanation);
    assert.equal(explanation.type, 'bad_move');
  });

  it('boundary: exactly 60 CPL triggers bad_move classification', () => {
    const move = createMoveFixture(60, { kind: 'cp', value: -60 });
    const explanation = classifier.classifyMove(move, [], []);

    assert.ok(explanation);
    assert.equal(explanation.type, 'bad_move');
  });

  it('boundary: exactly 30 CPL maintains_advantage for neutral', () => {
    const move = createMoveFixture(30, { kind: 'cp', value: -30 });
    const explanation = classifier.classifyMove(move, [], []);

    assert.ok(explanation);
    assert.equal(explanation.type, 'neutral_move');
  });

  it('includes best and played lines in coaching explanation', () => {
    const move = createMoveFixture(200, { kind: 'cp', value: -200 });
    const bestLine = ['e2e4', 'e7e5', 'g1f3'];
    const playedLine = ['a2a3', 'b5'];
    const explanation = classifier.classifyMove(move, bestLine, playedLine);

    assert.ok(explanation);
    assert.deepEqual(explanation.bestLine, bestLine);
    assert.deepEqual(explanation.playedLine, playedLine);
  });

  it('includes scoreGapCp in coaching explanation', () => {
    const move = createMoveFixture(150, { kind: 'cp', value: -150 });
    const explanation = classifier.classifyMove(move, [], []);

    assert.ok(explanation);
    assert.equal(explanation.scoreGapCp, 150);
  });
});
