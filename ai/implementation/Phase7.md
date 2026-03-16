# Phase 7 Plan — Persistent analysis storage and reusable retrieval API

Date: 2026-03-16

## Objective
Introduce permanent local storage for completed game analyses in `storage/local`, keyed by `jobId`, and expose a reusable read API `GET /analysis/:jobId` so one analysis can be loaded multiple times.

## Requested behavior (confirmed)
- Analysis starts when PGN is submitted via existing flow.
- On successful completion, analysis result is persisted to project storage.
- Persisted entry key is the existing `jobId`.
- A separate API (`GET /analysis/:jobId`) returns previously stored analysis.
- Same `jobId` can be queried multiple times without re-running analysis.

## Current baseline
- Jobs and results are currently held in in-memory `JobStore` (`src/jobs/JobStore.ts`).
- Existing APIs:
  - `POST /api/analyze`
  - `GET /api/analyze/:jobId/status`
  - `GET /api/analyze/:jobId/result`
- Result fetch works while process is alive, but does not survive restart.

## Target architecture

### 1) Storage layer
Add dedicated storage module:
- `src/storage/AnalysisResultStore.ts` (interface)
- `src/storage/LocalAnalysisResultStore.ts` (filesystem adapter)

Responsibilities:
- Persist completed analysis record by `jobId`
- Read persisted analysis by `jobId`
- Return explicit not-found vs corrupt-record errors

Local path strategy:
- Root: `storage/local/analyses`
- File per analysis: `storage/local/analyses/<jobId>.json`

### 2) Persisted record schema
Persist wrapper object, not only raw result:

```json
{
  "jobId": "<uuid>",
  "createdAt": "<ISO>",
  "completedAt": "<ISO>",
  "analysisVersion": 1,
  "result": { "...": "RawAnalysisResult" }
}
```

Notes:
- `analysisVersion` allows future migrations.
- Keep `result` aligned with current `RawAnalysisResult` contract.

### 3) Job manager integration
Update `AnalysisJobManager` to persist immediately after successful analysis:
1. job enters `completed` state
2. save persisted record to `AnalysisResultStore`
3. if persistence fails, mark job as `failed` with storage error

Do not persist:
- failed jobs
- cancelled jobs

### 4) API layer
Add new endpoint:
- `GET /analysis/:jobId`

Behavior:
- first try in-memory completed result (fast path)
- if absent, read from `AnalysisResultStore`
- return `200` with `{ jobId, state: "completed", result }`
- return `404` for unknown `jobId`
- return `500` with structured `STORAGE_ERROR` for corrupt/unreadable persisted file

Compatibility:
- Keep current `/api/analyze/:jobId/result` behavior for existing UI/client flow.
- Optional (phase 7.2): reuse storage fallback in existing result endpoint too.

### 5) App bootstrapping
Wire storage dependencies in app composition:
- create single `LocalAnalysisResultStore` instance
- inject into `AnalysisJobManager` and/or controller read path

## Implementation plan (work breakdown)

1. Create storage contracts and local adapter
   - add typed interface and filesystem implementation
   - ensure directory creation with recursive mkdir

2. Add persistence hooks in job completion path
   - persist on successful completion
   - structured storage error mapping

3. Add retrieval API route/controller
   - new route outside `/api` namespace: `/analysis/:jobId`
   - handler reads memory first, then disk fallback

4. Keep current API compatibility
   - no breaking changes for existing `/api/analyze/*` endpoints
   - optionally add disk fallback to existing result endpoint

5. Add tests
   - unit tests for storage adapter and manager persistence behavior
   - integration tests for end-to-end persist + retrieval + restart scenario

6. Update docs
   - README API reference with new endpoint
   - release checklist blocker "persistent storage" marked complete after validation

## Test strategy

### Unit tests
- `LocalAnalysisResultStore` writes/reads valid payload
- missing file returns not-found semantics
- invalid JSON returns storage parse error
- `AnalysisJobManager` persists only on completion

### Integration tests
- submit analysis, wait completion, retrieve via `GET /analysis/:jobId`
- restart app (new manager/store instance), retrieve same `jobId` from disk
- invalid/unknown `jobId` returns `404`

## Acceptance criteria
- Completed analysis is persisted to `storage/local/analyses/<jobId>.json`
- Same `jobId` can be fetched repeatedly through `GET /analysis/:jobId`
- Retrieval works after server restart
- Existing async lifecycle endpoints continue to work
- New tests pass in CI

## Risks and mitigations
- Risk: partial write produces corrupt JSON
  - Mitigation: write to temp file then atomic rename
- Risk: disk growth over time
  - Mitigation: optional TTL/cleanup policy in follow-up phase
- Risk: schema drift
  - Mitigation: persist `analysisVersion` and validate shape on read

## Out of scope (this phase)
- Remote DB/object storage
- Multi-instance distributed locking
- Cleanup/retention policy UI and admin endpoints