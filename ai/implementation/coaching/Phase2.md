# Coaching Phase 2 — Critical Move Coaching Model

**Status:** 📋 Design & Documentation (Pre-Implementation)  
**Prepared:** March 20, 2026

## Overview

Coaching Phase 2 transforms the raw MultiPV candidate lines (from Phase 1) into **actionable coaching explanations** with human-readable reason codes and message templates. When a critical move is selected on the board, users will see **specific hints** like:

- ❌ "Blunders into mate in 4" (bad move)
- ✅ "Converts advantage, leads to forced win" (good move)
- ⚠️ "Loses a piece to discovered attack" (bad move)
- 🎯 "Maintains advantage in sharp position" (good move)

**Goal:** Convert MultiPV output into classification (bad/good/neutral) + reason codes + human-readable message templates.

## Design: Coaching DTO Structure

### Core DTO Interface

```typescript
export interface CoachingExplanation {
  // Classification: what type of move is this?
  type: 'bad_move' | 'good_move' | 'neutral_move';

  // Human-readable primary reason for classification
  primaryReason: string;
  // e.g., "Loses piece to tactics", "Achieves forced mate", etc.

  // Structured reason codes for UI filtering/categorization
  reasonCodes: CoachingReasonCode[];
  // e.g., ['material_loss', 'tactical_oversight']

  // Score gap in centipawns between best move and played move
  scoreGapCp: number;
  // e.g., 250 means played move is 2.5 pawns worse

  // Best line from this position (rank-1 from MultiPV)
  bestLine: string[];
  // e.g., ['e2e4', 'e7e5', 'g1f3', 'b8c6']

  // Played line (continuation from actual game move)
  playedLine: string[];
  // e.g., ['a2a3', 'd2d4', ...] if a2a3 was played

  // Number of moves in comparison (usually 3-5)
  sequenceLength: number;

  // Optional: for mate scenarios, number of moves to mate
  mateInMoves?: number;
  // e.g., 5 means mate in 5 moves

  // Optional: why the played move fails or succeeds
  tacticalTheme?: {
    attackedPiece?: string;    // e.g., "knight on f3"
    theme: string;              // e.g., "pin", "fork", "skewer", "overloaded_defender"
  };
}

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
```

## Message Templates & Hints

### Bad Move Hints (❌)

| Reason Code | Hint Text | Example |
|-------------|-----------|---------|
| `loses_to_mate` | "Loses to mate" | "Loses to mate" |
| `loses_piece` | "Loses a {piece}" | "Loses a piece", "Loses a knight" |
| `loses_material` | "Loses material" | "Loses material" |
| `allows_fork` | "Allows a fork" | "Allows a fork" |
| `allows_pin` | "Allows a pin" | "Allows a pin" |
| `allows_skewer` | "Allows a skewer" | "Allows a skewer" |
| `allows_discovery` | "Allows a discovery" | "Allows a discovery" |
| `allows_back_rank_mate` | "Allows back rank mate" | "Allows back rank mate" |
| `hangs_piece` | "Hangs a {piece}" | "Hangs a piece", "Hangs the queen" |
| `allows_checkmate` | "Allows checkmate" | "Allows checkmate" |
| `weakens_position` | "Weakens the position" | "Weakens the position" |

### Good Move Hints (✅)

| Reason Code | Hint Text | Example |
|-------------|-----------|---------|
| `wins_mate` | "Wins a mate" | "Wins a mate" |
| `wins_piece` | "Wins a {piece}" | "Wins a piece", "Wins a knight" |
| `wins_material` | "Wins material" | "Wins material" |
| `creates_fork` | "Creates a fork" | "Creates a fork" |
| `creates_pin` | "Creates a pin" | "Creates a pin" |
| `creates_skewer` | "Creates a skewer" | "Creates a skewer" |
| `creates_discovery` | "Creates a discovery" | "Creates a discovery" |
| `creates_back_rank_mate_threat` | "Creates back rank mate threat" | "Creates back rank mate threat" |
| `checks_opponent` | "Checks opponent" | "Checks opponent" |
| `forces_favorable_trade` | "Forces favorable trade" | "Forces favorable trade" |
| `gains_tempo` | "Gains a tempo" | "Gains a tempo" |
| `improves_position` | "Improves the position" | "Improves the position" |

### Neutral Move Hints (🎯)

| Reason Code | Hint Text | Example |
|-------------|-----------|---------|
| `equal_position` | "Equal position" | "Equal position" |
| `maintains_advantage` | "Maintains advantage" | "Maintains advantage" |
| `solid_move` | "Solid move" | "Solid move" |
| `natural_move` | "Natural continuation" | "Natural continuation" |

## Classification Logic

### Algorithm: Determining Move Type

```
function classifyMove(move, scoreGapCp, evalBefore, evalAfter):
  
  // STAGE 1: Detect Mate Scenarios (highest priority)
  if scoreGapCp involves mate:
    if playedMove leads to checkmate:
      return 'good_move' + ['wins_mate']
    if playedMove allows opponent mate immediately:
      return 'bad_move' + ['loses_to_mate']
    if playedMove allows opponent back-rank mate:
      return 'bad_move' + ['allows_back_rank_mate']
    if playedMove creates back-rank mate threat:
      return 'good_move' + ['creates_back_rank_mate_threat']

  // STAGE 2: Material Evaluation (material > positional)
  materialDelta = evaluateMaterialDifference(bestLine, playedLine)
  if materialDelta > 0:
    if we win piece:
      return 'good_move' + ['wins_piece'] or ['wins_material']
    if we lose piece:
      return 'bad_move' + ['loses_piece'] or ['loses_material']

  // STAGE 3: Tactical Pattern Detection
  tacticalPattern = detectTacticalPattern(playedLine, bestLine)
  if tacticalPattern:
    if bad for us: return 'bad_move' + [f'allows_{pattern}']
    if good for us: return 'good_move' + [f'creates_{pattern}']
      // patterns: fork, pin, skewer, discovery, etc.

  // STAGE 4: Score-based Classification
  if scoreGapCp > 200:
    return 'bad_move' + ['weakens_position'] or ['allows_checkmate']
  else if scoreGapCp > 100:
    return 'bad_move' + ['loses_material'] or ['weakens_position']
  else if scoreGapCp > 60:
    return 'bad_move' + ['weakens_position']
  else if scoreGapCp > 30:
    return 'neutral_move' + ['maintains_advantage']
  else if scoreGapCp < -30:
    return 'good_move' + ['improves_position'] or ['gains_tempo']
  else:
    return 'neutral_move' + ['equal_position']
```

### Example Classifications

#### Example 1: Loses to Mate
```
Move: Na2 (played) vs best Nc3
Before eval: +0.5 (white slightly better)
Best line: Nc3 Qd8 Qh5 Kg8 Qf7# (mate in 4)
Played line: Na2 b5 Qh5 Kg8 Qf7# (mate in 4 for white)
But: other variations after Na2 lead to mate in 1 for black

Classification:
- type: 'bad_move'
- primaryReason: "Loses to mate"
- reasonCodes: ['loses_to_mate']
- scoreGapCp: 999 (mate loss)
```

#### Example 2: Wins Material / Loses Material
```
Move: Rxf7 (played) vs weaker alternative
Before eval: +0.8 
Played line takes rook on f7, best line also similar but slightly better after

Classification (if Rxf7 is best):
- type: 'good_move'
- primaryReason: "Wins material"
- reasonCodes: ['wins_material']
- scoreGapCp: -120 (net gain)

Classification (if missing better move):
- type: 'bad_move'
- primaryReason: "Loses material"
- reasonCodes: ['loses_material']
- scoreGapCp: +150
```

#### Example 3: Allows a Fork
```
Move: Bd3 (played) vs better Bc4
After Bd3, opponent plays Ne4 forking queen and rook

Classification:
- type: 'bad_move'
- primaryReason: "Allows a fork"
- reasonCodes: ['allows_fork']
- scoreGapCp: +200
- tacticalTheme: { theme: 'fork' }
```

#### Example 4: Creates a Pin
```
Move: Be3 (played) vs weaker alternatives
After Be3, bishop pins opponent's knight to king

Classification:
- type: 'good_move'
- primaryReason: "Creates a pin"
- reasonCodes: ['creates_pin']
- scoreGapCp: -80
- tacticalTheme: { theme: 'pin' }
```

#### Example 5: Equal Position
```
Move: a3 (played), natural move that maintains position
No tactical themes, similar evaluation

Classification:
- type: 'neutral_move'
- primaryReason: "Equal position"
- reasonCodes: ['equal_position']
- scoreGapCp: +5
```

## Data Flow: Analyzing a Critical Move

```
Input:
- Analyzed move (from Phase 1/3 data)
- Best candidate lines (from Phase 1 MultiPV)
- Played continuation from the game

Process:
1. Extract rank-1 (best) line from candidateLines
2. Extract actual played moves as continuation from position
3. Evaluate score gap in centipawns
4. Check for mate transitions (best → mate or played → mate)
5. Classify move type using algorithm above
6. Generate primary reason text
7. Build tacticalTheme if applicable (e.g., fork, pin)
8. Bundle into CoachingExplanation DTO

Output:
- Coaching object attached to analyzed move
- UI queries this to populate "Show Best Moves" panel
```

## Integration with Analyzed Move

### Updated AnalyzedMove DTO

```typescript
export interface AnalyzedMove {
  ply: number;
  san: string;
  uciMove: string;
  color: 'w' | 'b';
  fenBefore: string;
  fenAfter: string;
  bestMove: string;
  evalBefore: UciScore;
  evalAfter: UciScore;
  evalBestAfter: UciScore;
  cpl: number;
  label: 'Best' | 'Excellent' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder';
  isCritical: boolean;
  criticalReasons: string[];
  evalSwingCp: number;
  pv: string[];
  
  // NEW: Coaching explanation (only for critical moves or high-CPL moves)
  coaching?: CoachingExplanation;
}
```

### When to Attach Coaching

Coaching payload is added when:
- Move is marked `isCritical` (eval swing > threshold), OR
- Move CPL >= 100 (mistake or blunder), OR
- Mate transition detected

Non-critical, non-blunder moves:
- Can omit coaching entirely (lighter JSON)
- Or include minimal coaching: `{ type: 'neutral_move', reasonCodes: [], scoreGapCp: <delta> }`

## Test Strategy

### Unit Tests: Reason Classification

**File:** `tests/unit/CoachingExplanation.classify.test.ts`

```typescript
describe('CoachingExplanation reason classification', () => {
  
  it('classifies blunder_into_mate when scoreGap indicates mate loss', () => {
    // Setup: best move is mate in 3, played move loses immediately
    const move = {...};
    const explanation = classifyMove(move, scoreGapCp: 999, isMate: true);
    
    assert.equal(explanation.type, 'bad_move');
    assert.ok(explanation.reasonCodes.includes('blunder_into_mate'));
    assert.equal(explanation.mateInMoves, 3);
  });

  it('classifies material_loss for scoreGap 100-250cp with material evaluation', () => {
    // Setup: score gap 150cp, material analysis suggests piece loss
    const explanation = classifyMove(move, scoreGapCp: 150, material: -150);
    
    assert.equal(explanation.type, 'bad_move');
    assert.ok(explanation.reasonCodes.includes('material_loss'));
  });

  it('classifies tactical_blow for wins_material + forcing sequence', () => {
    // Setup: best move wins rook via fork
    const explanation = classifyMove(move, scoreGapCp: -180, tacticalTheme: 'fork');
    
    assert.equal(explanation.type, 'good_move');
    assert.ok(explanation.reasonCodes.includes('tactical_blow'));
    assert.ok(explanation.reasonCodes.includes('wins_material'));
  });

  it('classifies neutral for moves preserving slight advantage', () => {
    // Setup: score gap 25cp, no tactics
    const explanation = classifyMove(move, scoreGapCp: 25);
    
    assert.equal(explanation.type, 'neutral_move');
    assert.ok(explanation.reasonCodes.includes('maintains_advantage'));
  });

  // Boundary tests for CPL thresholds
  it('boundary: exactly 100cp is considered material loss threshold', () => {...});
  it('boundary: exactly 200cp triggers tactical oversight', () => {...});
  it('boundary: exactly 30cp is maintain advantage cutoff', () => {...});
});
```

### Unit Tests: Message Template Generation

**File:** `tests/unit/CoachingExplanation.messages.test.ts`

```typescript
describe('CoachingExplanation message template generation', () => {
  
  it('generates "Loses to mate" for loses_to_mate', () => {
    const explanation = {
      type: 'bad_move',
      reasonCodes: ['loses_to_mate'],
      scoreGapCp: 999,
      ...
    };
    const msg = generatePrimaryReason(explanation);
    assert.equal(msg, 'Loses to mate');
  });

  it('generates "Loses a piece" for loses_piece', () => {
    const explanation = {
      type: 'bad_move',
      reasonCodes: ['loses_piece'],
      scoreGapCp: 150,
      ...
    };
    const msg = generatePrimaryReason(explanation);
    assert.equal(msg, 'Loses a piece');
  });

  it('generates "Allows a fork" for allows_fork', () => {
    const explanation = {
      type: 'bad_move',
      reasonCodes: ['allows_fork'],
      tacticalTheme: { theme: 'fork' },
      ...
    };
    const msg = generatePrimaryReason(explanation);
    assert.equal(msg, 'Allows a fork');
  });

  it('generates "Wins material" for wins_material', () => {
    const explanation = {
      type: 'good_move',
      reasonCodes: ['wins_material'],
      scoreGapCp: -150,
      ...
    };
    const msg = generatePrimaryReason(explanation);
    assert.equal(msg, 'Wins material');
  });

  it('generates "Creates a pin" for creates_pin', () => {
    const explanation = {
      type: 'good_move',
      reasonCodes: ['creates_pin'],
      tacticalTheme: { theme: 'pin' },
      ...
    };
    const msg = generatePrimaryReason(explanation);
    assert.equal(msg, 'Creates a pin');
  });

  it('generates "Equal position" for neutral moves', () => {
    const explanation = {
      type: 'neutral_move',
      reasonCodes: ['equal_position'],
      scoreGapCp: 5,
      ...
    };
    const msg = generatePrimaryReason(explanation);
    assert.equal(msg, 'Equal position');
  });

  it('generates "Maintains advantage" for neutral good position', () => {
    const explanation = {
      type: 'neutral_move',
      reasonCodes: ['maintains_advantage'],
      scoreGapCp: 25,
      ...
    };
    const msg = generatePrimaryReason(explanation);
    assert.equal(msg, 'Maintains advantage');
  });
});
```

### Integration Tests: Full Game Coaching

**File:** `tests/integration/CoachingExplanation.fixture.test.ts`

```typescript
describe('Coaching explanation on fixture games', () => {
  
  it('analyzes tactical.pgn and produces coaching payload for bad moves', async () => {
    const pgn = readFixture('tactical.pgn');
    const analysis = await analyzeWithCoaching(pgn, { depth: 14, multiPv: 3 });
    
    // Find a move that loses material
    const badMove = analysis.moves.find(m => m.coaching?.type === 'bad_move');
    
    assert.ok(badMove);
    assert.ok(badMove.coaching);
    assert.ok(badMove.coaching.reasonCodes.length > 0);
    // Reason should be one of: loses_piece, loses_material, allows_fork, etc.
    assert.ok(badMove.coaching.reasonCodes[0].startsWith('loses_') || badMove.coaching.reasonCodes[0].startsWith('allows_'));
  });

  it('analyzes example1.pgn and finds good moves', async () => {
    const pgn = readFixture('example1.pgn');
    const analysis = await analyzeWithCoaching(pgn, { depth: 14, multiPv: 3 });
    
    // Find a move that wins material
    const goodMove = analysis.moves.find(m => m.coaching?.type === 'good_move');
    
    assert.ok(goodMove);
    assert.ok(goodMove.coaching);
    assert.ok(goodMove.coaching.reasonCodes.length > 0);
    // Reason should be one of: wins_piece, wins_material, creates_fork, etc.
    assert.ok(goodMove.coaching.reasonCodes[0].startsWith('wins_') || goodMove.coaching.reasonCodes[0].startsWith('creates_'));
  });

  it('snapshot test: coaching output is deterministic for fixture game', async () => {
    const pgn = readFixture('example1.pgn');
    const analysis1 = await analyzeWithCoaching(pgn, { depth: 12, multiPv: 3 });
    const analysis2 = await analyzeWithCoaching(pgn, { depth: 12, multiPv: 3 });
    
    // Compare coaching payloads for critical moves
    const critical1 = analysis1.moves.filter(m => m.isCritical && m.coaching);
    const critical2 = analysis2.moves.filter(m => m.isCritical && m.coaching);
    
    for (let i = 0; i < critical1.length; i++) {
      assert.deepEqual(critical1[i].coaching, critical2[i].coaching);
    }
  });

  it('coaching persists through multiple runs: no flakiness', async () => {
    const pgn = readFixture('example1.pgn');
    
    for (let run = 0; run < 3; run++) {
      const analysis = await analyzeWithCoaching(pgn, { depth: 12 });
      const coachingMoves = analysis.moves.filter(m => m.coaching);
      
      // Verify consistent number of moves with coaching
      assert.ok(coachingMoves.length > 5, `Run ${run}: unexpected coaching count`);
    }
  });
});
```

## Acceptance Criteria

✅ **Every critical move has non-empty coaching payload**
- Moves with `isCritical: true` always have `coaching` object
- Moves with CPL >= 100 always have `coaching` object
- Mate transitions always detected and classified

✅ **Non-critical moves can omit coaching**
- Moves with `isCritical: false` and CPL < 100 may have `coaching: undefined`
- Reduces JSON size for games with few tactical moments
- No regressions in existing move navigation/display

✅ **Coaching DTO snapshot tests stable**
- Same game + same settings → identical coaching payloads
- Tests run 3+ times in a row produce identical output
- No randomness or floating-point drift

## Files to Create/Modify

| File | Type | Purpose |
|------|------|---------|
| `src/analysis/dto/CoachingExplanation.ts` | New | DTO interfaces + reason codes |
| `src/analysis/CoachingClassifier.ts` | New | Classification logic + message templates |
| `src/analysis/GameAnalyzer.ts` | Modify | Wire coaching into analysis pipeline |
| `tests/unit/CoachingExplanation.classify.test.ts` | New | Classification unit tests |
| `tests/unit/CoachingExplanation.messages.test.ts` | New | Message generation unit tests |
| `tests/integration/CoachingExplanation.fixture.test.ts` | New | Full-game integration tests |
| `ai/implementation/coaching/Phase2.md` | New | This documentation |

## Hints Preview: What Users Will See

**On a bad move (loses material):**
```
Move: Bd3 (played)
Board: [visualization of position]
Coaching hint: ❌ "Allows a fork"
```

**On a good move (wins material):**
```
Move: Rxf7 (played)
Board: [visualization of position]
Coaching hint: ✅ "Wins material"
```

**On a tactical move (creates pin):**
```
Move: Be3 (played)
Board: [visualization of position]
Coaching hint: ✅ "Creates a pin"
```

**On a quiet, equal move:**
```
Move: a3 (played)
Board: [visualization of position]
Coaching hint: 🎯 "Equal position"
```

**Other examples:**
- "Hangs a piece"
- "Loses to mate"
- "Weakens the position"
- "Improves the position"
- "Gains a tempo"
- "Checks opponent"
- "Creates back rank mate threat"
- "Allows back rank mate"

---

## Next Steps

→ [Ready to implement Phase 2?](../../../) Confirm structure and we'll build:
1. CoachingExplanation DTO with generic reason codes
2. CoachingClassifier with material/tactic detection
3. GameAnalyzer integration
4. Full test suite
