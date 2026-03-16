# Phase 2 Implementation Log — Core analysis pipeline

Date: 2026-03-15

## Objective
Implement Phase 2 from `ai/plan.md`: move-by-move raw evaluation output with:
- PGN parse + replay (`fenBefore` / `fenAfter`)
- Fast-pass full-ply analysis
- Per-move raw record (SAN, UCI, eval before/after, best move, PV)
- Progress callback support

## Step-by-step work log

### 1) Reviewed current project baseline
- Confirmed Phase 1 modules existed (`UciClient`, `StockfishService`, smoke script).
- Confirmed no existing chess parsing/replay modules yet.

### 2) Added dependency + script wiring
Updated `package.json`:
- Added dependency: `chess.js`
- Added script: `phase2:smoke` → `tsx src/scripts/phase2-smoke.ts`

### 3) Implemented PGN parser module
Created `src/chess/PgnParser.ts`:
- Added `PgnParser.parse(pgn)`
- Validates non-empty PGN
- Parses with `chess.js` using permissive mode (`strict: false`)
- Returns:
  - `headers`
  - SAN move list (`sanMoves`)
  - normalized `pgn`
- Throws typed `AppError` with code `PGN_EMPTY` / `PGN_INVALID`

### 4) Implemented replay + FEN generation module
Created `src/chess/ReplayService.ts`:
- Added `ReplayService.buildPlies(pgn)`
- Parses PGN (permissive mode)
- Replays moves on a fresh board
- Produces deterministic ply records:
  - `ply`
  - `san`
  - `uciMove`
  - `fenBefore`
  - `fenAfter`
  - `color`
- Converts move object to UCI notation (`from` + `to` + optional promotion)
- Throws typed errors for replay failures (`PGN_INVALID_REPLAY`, `PGN_REPLAY_APPLY_FAILED`)

### 5) Added analysis DTOs for Phase 2 raw output
Created `src/analysis/dto/AnalysisResult.ts`:
- `RawMoveAnalysis`
- `RawAnalysisResult`

Covers required raw fields for this phase:
- SAN/UCI
- FEN before/after
- best move
- eval before/after
- PV

### 6) Added position evaluation wrapper
Created `src/analysis/PositionEvaluator.ts`:
- Thin wrapper around `StockfishService.evaluateFen()`
- Keeps analyzer orchestration decoupled from engine service internals

### 7) Implemented main Phase 2 orchestrator
Created `src/analysis/GameAnalyzer.ts`:
- `analyzePgn(pgn, options)` pipeline:
  1. Parse PGN via `PgnParser`
  2. Build plies via `ReplayService`
  3. For each ply:
     - evaluate `fenBefore`
     - evaluate `fenAfter`
     - store raw move analysis record
     - report progress callback (`currentPly`, `totalPlies`, `percent`)
- Returns `RawAnalysisResult` with game metadata and all move records
- Default depth: `12` if not provided

### 8) Added Phase 2 smoke script
Created `src/scripts/phase2-smoke.ts`:
- Loads `.env` (`dotenv/config`)
- Uses `STOCKFISH_PATH`
- Builds `StockfishService` + `PositionEvaluator` + `GameAnalyzer`
- Runs a sample 10-move (20-ply) PGN in fast mode (depth 10)
- Logs periodic progress updates
- Prints summary JSON (`game`, `movesAnalyzed`, first/last move)

### 9) Validation run and issue encountered
Executed:
- `npm install`
- `npm run typecheck`
- `npm run phase2:smoke`

Initial result:
- TypeScript errors in parser/replay due to incorrect assumption that `chess.loadPgn()` returns boolean.
- Runtime parse failed as a side effect of that incorrect validation logic.

### 10) Fix applied
Updated both parser modules:
- Switched from boolean checks to `try/catch` around `loadPgn()`
- Used permissive parsing options (`strict: false`)
- Wrapped thrown parser errors into typed `AppError` payloads

### 11) Final validation
Executed:
- `npm run typecheck`
- `npm run phase2:smoke`

Result:
- Typecheck passed.
- Smoke run passed with full progress to `100%`.
- Analyzer returned `movesAnalyzed: 20` and valid first/last move records including:
  - SAN + UCI
  - FEN before/after
  - best move
  - eval scores
  - PV

## Files added in Phase 2
- `src/chess/PgnParser.ts`
- `src/chess/ReplayService.ts`
- `src/analysis/dto/AnalysisResult.ts`
- `src/analysis/PositionEvaluator.ts`
- `src/analysis/GameAnalyzer.ts`
- `src/scripts/phase2-smoke.ts`

## Files updated in Phase 2
- `package.json`

## Current verification status against Phase 2
- ✅ PGN parse + replay implemented
- ✅ Deterministic `fenBefore` / `fenAfter` per ply implemented
- ✅ Fast-pass full-game analyzer implemented
- ✅ Per-move raw records implemented (SAN, UCI, eval before/after, best move, PV)
- ✅ Progress callback implemented and verified in smoke output
- ✅ TypeScript compile/typecheck passes
- ✅ End-to-end smoke test passes with Stockfish

## Notes
- This phase currently uses sequential evaluation (`fenBefore` then `fenAfter` per ply) for correctness-first behavior.
- Performance optimizations (cache/two-pass/deep critical re-analysis) are intentionally deferred to later phases.
