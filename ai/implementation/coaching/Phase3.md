# Coaching Phase 3 — API and Persistence Integration

**Status:** ✅ Complete and validated  
**Date Completed:** March 20, 2026

## Goal
Expose coaching payload through API requests/results and ensure persisted analyses retain coaching data without breaking existing clients.

## Implemented

### 1) API contract extension (backward-compatible)
Updated `POST /api/analyze` request handling to accept optional coaching settings:

- `settings.enableCoaching: boolean`
- `settings.coachingMultiPv: number (1..8)`

Also supports nested aliases:

- `settings.coaching.enabled`
- `settings.coaching.multiPv`

Validation errors return existing `VALIDATION_ERROR` schema.

### 2) Job request pipeline wiring
Extended job request contract (`AnalysisRequest`) with:

- `enableCoaching?: boolean`
- `coachingMultiPv?: number`

These options are forwarded from controller → job manager → game analyzer.

### 3) Server integration
Server runner now passes coaching options to `GameAnalyzer.analyzePgn()`:

- `enableCoaching`
- `coachingMultiPv`

### 4) Persistence compatibility
No storage schema change required:

- `RawAnalysisResult` already includes moves payload
- `AnalyzedMove.coaching` is optional and serializes naturally
- Stored and reloaded analyses preserve coaching payload intact

## Files changed

- `src/app/controllers/analyze.controller.ts`
- `src/jobs/AnalysisJobManager.ts`
- `src/app/server.ts`
- `tests/integration/Phase3.coaching.api.integration.test.ts` (new)

## Tests added

### `tests/integration/Phase3.coaching.api.integration.test.ts`
1. Forwards coaching options from API request into runner
2. Persists and reloads coaching payload via `/api/analysis/:jobId`
3. Verifies legacy requests without coaching fields still work unchanged

## Validation

Executed test suites:

- `npx tsx --test tests/integration/Phase3.coaching.api.integration.test.ts` ✅ (3/3)
- `npx tsx --test tests/integration/Phase7.storage.integration.test.ts` ✅ (3/3 regression)

## Acceptance criteria mapping

- Coaching fields retrievable from in-memory and persisted analyses ✅
- No breaking schema changes for existing consumers ✅
- API + persistence test coverage added and passing ✅
