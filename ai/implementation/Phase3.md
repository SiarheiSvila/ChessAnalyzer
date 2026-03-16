# Phase 3 Implementation Log — Chess insight layer

Date: 2026-03-15

## Objective
Implement Phase 3 from `ai/plan.md`: convert raw engine output into human-useful insights by adding:
- side-normalized centipawn loss (CPL)
- move quality labels (Best → Blunder)
- critical moment detection
- game summary (accuracy + per-side counts)
- automated tests for boundary and integration behavior

## Step-by-step work log

### 1) Reviewed Phase 2 baseline
- Read current `GameAnalyzer` and analysis DTO.
- Confirmed output was raw-only (`bestMove`, eval before/after, PV), without CPL/labels/summary.

### 2) Implemented scoring module
Created `src/analysis/Scoring.ts` with:
- `scoreToCp(score)` for cp/mate normalization
- `moverPerspectiveAfterMove(score)` for side normalization after move
- `calculateCpl(bestAfterMoverCp, actualAfterMoverCp)`
- `classifyMove(cpl)` using thresholds from plan:
  - Best `0–10`
  - Excellent `11–30`
  - Good `31–60`
  - Inaccuracy `61–100`
  - Mistake `101–250`
  - Blunder `>250`
- `cplToAccuracy(cpl)` (bounded exponential score)
- `summarizeBySide(moves)` for per-side accuracy and label counters

### 3) Implemented critical moments module
Created `src/analysis/CriticalMoments.ts` with:
- `detectCriticalMoment({ evalBeforeForMover, evalAfterForMover, cpl })`
- Flags critical when at least one condition is true:
  - large eval swing (`>=150 cp`)
  - high CPL (`>=200`)
  - mate-score transition detected
- Returns:
  - `isCritical`
  - `reasons[]`
  - `evalSwingCp`

### 4) Extended analysis DTO for enriched output
Updated `src/analysis/dto/AnalysisResult.ts`:
- Added `AnalyzedMove` fields:
  - `evalBestAfter`
  - `cpl`
  - `label`
  - `isCritical`
  - `criticalReasons`
  - `evalSwingCp`
- Extended top-level result with `summary`:
  - `accuracyWhite`, `accuracyBlack`
  - per-side label counts
  - `criticalMoments`

### 5) Integrated Phase 3 logic into `GameAnalyzer`
Updated `src/analysis/GameAnalyzer.ts`:
- Added best-line comparison path per ply:
  1. Evaluate `fenBefore`
  2. Evaluate actual `fenAfter`
  3. Apply engine `bestMove` to `fenBefore`
  4. Evaluate resulting best-after position
- Added side-normalized calculations:
  - actual-after mover perspective
  - best-after mover perspective
  - CPL + label
- Added critical detection per move
- Added summary computation across all moves
- Added UCI move application helper (`applyUciMove`) via `chess.js`

### 6) Added Phase 3 smoke script
Created `src/scripts/phase3-smoke.ts`:
- Runs a longer PGN sample through enriched analyzer output
- Logs progress updates
- Prints:
  - move count
  - critical moments
  - accuracy white/black
  - first/last move labels + CPL
  - per-side counts

### 7) Added automated tests (unit + integration)
Updated `package.json` scripts:
- `phase3:smoke`
- `test` (`tsx --test tests/**/*.test.ts`)

Created unit tests:
- `tests/unit/Scoring.test.ts`
  - threshold boundary checks (10/11/30/31/60/61/100/101/250/251)
  - side normalization checks
  - mate-score conversion checks
  - CPL/accuracy behavior checks
  - summary aggregation checks
- `tests/unit/CriticalMoments.test.ts`
  - large swing detection
  - high CPL detection
  - mate transition detection
  - non-critical quiet move case

Created integration test:
- `tests/integration/Phase3.integration.test.ts`
  - runs analyzer on short PGN with Stockfish
  - validates move count, labels, non-negative CPL, summary fields
  - skips automatically if `STOCKFISH_PATH` is unavailable

### 8) Validation run
Executed:
- `npm run typecheck`
- `npm test`
- `npm run phase3:smoke`

Results:
- Typecheck passed.
- Tests passed: `10/10`.
- Smoke run passed with full progress and enriched output.

Observed smoke summary sample:
- `movesAnalyzed: 40`
- `criticalMoments: 1`
- `accuracyWhite: 87.7`
- `accuracyBlack: 86.8`
- move labels and side counts present and populated

## Files added in Phase 3
- `src/analysis/Scoring.ts`
- `src/analysis/CriticalMoments.ts`
- `src/scripts/phase3-smoke.ts`
- `tests/unit/Scoring.test.ts`
- `tests/unit/CriticalMoments.test.ts`
- `tests/integration/Phase3.integration.test.ts`
- `ai/implementation/Phase3.md`

## Files updated in Phase 3
- `src/analysis/dto/AnalysisResult.ts`
- `src/analysis/GameAnalyzer.ts`
- `package.json`

## Current verification status against Phase 3
- ✅ Side-normalized CPL calculation implemented
- ✅ Move quality classifier implemented with threshold boundary tests
- ✅ Critical moment detection implemented with unit coverage
- ✅ Game summary (accuracy + counts + critical moments) implemented
- ✅ Integration test verifies enriched end-to-end analyzer output
- ✅ Typecheck + test + smoke all passing

## Notes
- The analyzer now evaluates an additional best-after position per ply to produce meaningful CPL values.
- This increases per-ply engine calls but gives substantially better insight quality for Phase 3.
- Performance optimization for this extra evaluation remains in scope for later hardening phase.
