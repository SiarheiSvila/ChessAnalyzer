# Phase 6 Implementation Log — Hardening and optimization

Date: 2026-03-15

## Objective
Implement Phase 6 from `ai/plan.md` with:
- two-pass strategy (fast pass + deep critical re-analysis)
- FEN cache to reduce duplicate engine calls
- concurrency limits for analysis jobs
- benchmark and soak testing

## Step-by-step work log

### 1) Implemented evaluator cache
Updated `src/analysis/PositionEvaluator.ts`:
- Added in-memory cache keyed by:
  - FEN
  - depth
  - movetime
- Added support for bypassing cache (`useCache: false`)
- Added cache stats API:
  - `getCacheStats()`
  - `clearCache()`
- Added typed interfaces:
  - `FenEvaluationService`
  - `PositionEvaluateOptions`
  - `PositionEvaluatorCacheStats`

Result:
- repeated evaluations for same position/settings now return from cache.

### 2) Implemented two-pass analysis flow
Updated `src/analysis/GameAnalyzer.ts`:
- Added Phase 6 options:
  - `deepDepth`
  - `enableDeepPass`
  - `criticalCplThreshold`
- Added fast first pass over all plies (depth `depth`)
- Added deep second pass only for flagged plies:
  - selected if move is critical OR CPL above threshold
- Added helper `analyzePly(...)` to avoid duplicate logic
- Added progress scaling:
  - pass 1: 0–80%
  - pass 2: 80–100%

Result:
- deep re-evaluation is targeted instead of full-game high-depth rerun.

### 3) Exposed optimization metadata in result settings
Updated `src/analysis/dto/AnalysisResult.ts`:
- Extended `settings` with:
  - `deepDepth`
  - `deepReanalyzedPlies`
  - `cache` (`hits`, `misses`, `size`)

Result:
- API/UI and tests can inspect optimization behavior explicitly.

### 4) Added job concurrency limits
Updated `src/jobs/AnalysisJobManager.ts`:
- Added queue + dispatcher for jobs
- Added `maxConcurrentJobs` option
- Default concurrency based on CPU parallelism (`availableParallelism()/2`, min 1)
- Jobs now remain queued until slots are available

Result:
- prevents uncontrolled parallel analysis saturation.

### 5) Updated existing tests for new settings schema
Updated fixtures in:
- `tests/unit/AnalysisJobManager.test.ts`
- `tests/integration/Phase4.api.integration.test.ts`
- `tests/integration/Phase5.ui.integration.test.ts`

Reason:
- `settings` now includes deep/cache metadata.

### 6) Added new Phase 6 tests
Created `tests/unit/PositionEvaluator.cache.test.ts`:
- verifies cache hit/miss behavior
- verifies depth-specific cache keys
- verifies cache bypass behavior

Created `tests/unit/GameAnalyzer.deepPass.test.ts`:
- verifies deep pass re-analysis occurs for flagged plies
- verifies deep pass can be disabled entirely

Extended `tests/unit/AnalysisJobManager.test.ts`:
- added concurrency-limit test (`maxConcurrentJobs: 1`)

Created `tests/integration/Phase6.performance.integration.test.ts`:
- benchmark test for 40-ply game runtime budget
- soak test running sequential analyses to catch deadlocks/leaks
- auto-skips only if Stockfish path is unavailable

### 7) Validation run
Executed:
- `npm run typecheck`
- `npm test`

Final results:
- Typecheck: passed
- Tests: passed (`26/26`)
- New Phase 6 suites passed:
  - `Phase6 performance`
  - `GameAnalyzer deep pass`
  - `PositionEvaluator cache`
  - concurrency-limit test in `AnalysisJobManager`

## Files updated in Phase 6
- `src/analysis/PositionEvaluator.ts`
- `src/analysis/GameAnalyzer.ts`
- `src/analysis/dto/AnalysisResult.ts`
- `src/jobs/AnalysisJobManager.ts`
- `tests/unit/AnalysisJobManager.test.ts`
- `tests/integration/Phase4.api.integration.test.ts`
- `tests/integration/Phase5.ui.integration.test.ts`

## Files added in Phase 6
- `tests/unit/PositionEvaluator.cache.test.ts`
- `tests/unit/GameAnalyzer.deepPass.test.ts`
- `tests/integration/Phase6.performance.integration.test.ts`
- `ai/implementation/Phase6.md`

## Current verification status against Phase 6
- ✅ Two-pass strategy implemented (fast + deep critical re-analysis)
- ✅ FEN cache implemented and tested
- ✅ Concurrency limits implemented and tested
- ✅ Benchmark + soak integration tests implemented and passing
- ✅ Full suite green after Phase 6 changes

## Notes
- Deep pass currently re-evaluates only selected critical/high-CPL plies.
- Cache stats are now returned in result settings for observability.
- Concurrency control is configurable and defaults to a safe CPU-based value.
