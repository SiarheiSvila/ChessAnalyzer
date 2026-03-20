# Chess Analyzer Implementation Plan

## Goal
Build a Chess.com-like game analysis feature that evaluates every move in a game using Stockfish and produces:
- Move-by-move evaluation (centipawn or mate)
- Best move recommendations
- Move quality labels (Best / Excellent / Good / Inaccuracy / Mistake / Blunder)
- Critical moments and summary insights

## Scope (MVP)
- Input: PGN game string or uploaded `.pgn` file
- Engine: Local Stockfish process (UCI protocol)
- Output: Structured analysis JSON + simple UI timeline/chart
- Modes:
  - **Fast pass** (lower depth, quick full-game scan)
  - **Deep pass** (higher depth on critical positions)
- Single game analysis first (batch later)

## High-Level Architecture
1. **Frontend (UI)**
   - PGN upload/paste
   - Board + move list
   - Eval graph over move number
   - Per-move explanation panel
2. **Backend API**
   - Accept PGN and analysis settings
   - Parse and validate game
   - Run asynchronous analysis job
   - Return progress + results
3. **Analysis Worker**
   - Replays game move by move
   - Calls Stockfish for each position
   - Computes deltas and move quality labels
4. **Storage (MVP optional)**
   - In-memory for single run
   - Add persistent DB if saved reports are needed

## Technology Recommendation (Node-centric)
- Runtime: Node.js + TypeScript
- Chess rules/parser: `chess.js`
- Stockfish integration: Spawn Stockfish binary and communicate via UCI
- API: Express or Fastify
- Queue (optional at MVP): in-process queue; later Redis + BullMQ
- Frontend: React (or existing app framework)
- Charts: lightweight line chart (evaluation vs move number)

## Stockfish Integration (UCI)
### Required UCI sequence
1. Start process
2. `uci` (wait for `uciok`)
3. `isready` (wait for `readyok`)
4. Set options (threads/hash)
5. For each position:
   - `position fen <FEN>`
   - `go depth <N>` (or `go movetime <ms>`)
   - Parse `info ... score cp|mate ... pv ...`
   - Capture `bestmove`
6. `quit`

### Engine settings (MVP defaults)
- Threads: 1–2 (configurable)
- Hash: 128–256 MB
- MultiPV: 1 for speed, optional 3 for better coaching
- Fast pass depth: 10–12
- Deep pass depth: 16–20 on selected critical moves

## Analysis Algorithm
For each ply (half-move):
1. Build position before played move (`FEN_before`)
2. Ask Stockfish best line from `FEN_before`
3. Record:
   - `eval_before` (cp or mate)
   - `bestmove`
   - `pv`
4. Apply actual move
5. Evaluate resulting position (`eval_after`)
6. Compute move loss:
   - If centipawn: `loss = eval_best_after - eval_actual_after` normalized for side-to-move
   - If mate score involved: map using mate-priority rules
7. Assign move label by thresholds
8. Mark tactical/critical moments when eval swing exceeds threshold

## Move Classification (Initial thresholds)
Use side-relative centipawn loss (`cpl`):
- Best: `0–10`
- Excellent: `11–30`
- Good: `31–60`
- Inaccuracy: `61–100`
- Mistake: `101–250`
- Blunder: `>250`

Notes:
- Tune thresholds by testing against sample games.
- Mate blunders should always map to Mistake/Blunder regardless of CPL.

## Data Model (Result JSON)
```json
{
  "game": {
    "event": "...",
    "white": "...",
    "black": "...",
    "result": "1-0"
  },
  "settings": {
    "depth": 12,
    "deepDepth": 18
  },
  "moves": [
    {
      "ply": 1,
      "san": "e4",
      "fenBefore": "...",
      "fenAfter": "...",
      "bestMove": "e2e4",
      "playedMove": "e2e4",
      "evalBefore": { "type": "cp", "value": 20 },
      "evalAfter": { "type": "cp", "value": 18 },
      "cpl": 2,
      "label": "Best",
      "pv": ["e2e4", "e7e5", "g1f3"],
      "isCritical": false
    }
  ],
  "summary": {
    "accuracyWhite": 84.2,
    "accuracyBlack": 78.5,
    "counts": {
      "white": { "inaccuracy": 2, "mistake": 1, "blunder": 0 },
      "black": { "inaccuracy": 3, "mistake": 2, "blunder": 1 }
    }
  }
}
```

## API Design (MVP)
- `POST /api/analyze`
  - Body: `{ pgn, settings }`
  - Returns: `{ jobId }`
- `GET /api/analyze/:jobId/status`
  - Returns progress (`0..100`, current ply)
- `GET /api/analyze/:jobId/result`
  - Returns full analysis JSON

For a simple MVP, you can skip job queue and keep synchronous endpoint for short games.

## Skeleton Architecture
Recommended TypeScript project layout:

```text
src/
  app/
    server.ts                  # API bootstrap
    routes/
      analyze.routes.ts        # /analyze, /status, /result
    controllers/
      analyze.controller.ts    # request/response orchestration
  engine/
    uci/
      UciClient.ts             # process lifecycle, command queue, parser
      UciProtocol.ts           # low-level command/response helpers
      UciTypes.ts              # engine types (score, pv, bestmove)
    StockfishService.ts        # engine configuration and high-level evaluate() API
  analysis/
    GameAnalyzer.ts            # full game pipeline (fast pass + deep pass)
    PositionEvaluator.ts       # evaluate a FEN/position via StockfishService
    Scoring.ts                 # CPL, labels, accuracy formulas
    CriticalMoments.ts         # eval swing and phase-specific critical flags
    dto/
      AnalysisResult.ts        # result contracts returned to API/UI
  chess/
    PgnParser.ts               # PGN parsing and metadata extraction
    ReplayService.ts           # move-by-move replay and FEN generation
  jobs/
    AnalysisJobManager.ts      # job state/progress/cancellation (in-memory MVP)
    JobStore.ts                # map-based storage; swappable with Redis later
  shared/
    errors/
      AppError.ts
      EngineError.ts
    logging/
      logger.ts
    config/
      env.ts
      analysis.defaults.ts     # depth, movetime, thresholds
  tests/
    unit/
    integration/
    fixtures/
      pgn/
```

Data flow:
1. Route receives PGN and settings.
2. Controller creates job and calls `GameAnalyzer`.
3. `GameAnalyzer` replays moves and requests evaluations.
4. `Scoring` + `CriticalMoments` enrich move records.
5. Job manager exposes progress and final result.

## Implementation Phases
### Phase 1 — Engine foundation (UCI bridge)
**Goal:** Reliable Stockfish communication layer.

Deliverables:
- `UciClient` with strict command queue (single in-flight command model)
- Parsing for `info`, `score cp|mate`, `pv`, `bestmove`
- Engine lifecycle: start, `uci`, `isready`, set options, graceful `quit`
- Timeouts and typed engine errors

Phase tests:
- Unit: parse `info` lines into typed score/PV structures (cp and mate variants)
- Unit: queue behavior guarantees request-response ordering under concurrent calls
- Integration: spawn engine, run handshake (`uci`/`isready`), evaluate one known FEN
- Integration: force timeout scenario and verify one controlled restart + final error/report path

Acceptance criteria:
- Can evaluate a single FEN and return `{ bestMove, score, pv }`
- Recovers from transient timeout by restarting engine once
- Test gate: all Phase 1 unit + integration tests pass in CI

### Phase 2 — Core analysis pipeline
**Goal:** Move-by-move raw evaluation output.

Deliverables:
- PGN parse + replay service producing `fenBefore`/`fenAfter` per ply
- `GameAnalyzer` fast pass over all plies
- Per-move raw record: SAN, UCI move, eval before/after, best move, PV
- Progress callback support (`currentPly`, `%`)

Phase tests:
- Unit: PGN parser extracts headers, SAN list, and rejects malformed PGN
- Unit: replay service generates deterministic FEN sequence for fixture games
- Integration: analyze 1 short opening PGN and 1 tactical PGN; assert expected ply count and non-null evals
- Contract: progress updates are monotonic and finish at 100%

Acceptance criteria:
- Standard PGN (30–60 moves) returns complete move records without gaps
- Illegal PGN is rejected with clear validation error
- Test gate: fixture-based integration tests pass for both valid and invalid PGNs

### Phase 3 — Chess insight layer
**Goal:** Convert raw engine data into human-useful insights.

Deliverables:
- Side-normalized CPL calculation
- Move quality classifier (Best → Blunder)
- Critical moment detector (large swings, missed wins, mate threats)
- Game summary builder (accuracy, mistake counts, phase breakdown)

Phase tests:
- Unit: CPL normalization for white/black turns with cp and mate-aware scenarios
- Unit: boundary tests for label thresholds (exactly 10/11/30/31/60/61/100/101/250/251)
- Unit: critical moment detector flags large eval swings and missed mate events
- Integration: end-to-end scoring snapshot for a fixed analyzed game JSON fixture

Acceptance criteria:
- Every ply has a label
- Summary stats are deterministic across repeated runs with same settings
- Test gate: snapshot + boundary tests stable across repeated CI runs

### Phase 4 — API + job orchestration
**Goal:** Production-ready interaction pattern for UI.

Deliverables:
- Endpoints: `POST /api/analyze`, `GET /api/analyze/:jobId/status`, `GET /api/analyze/:jobId/result`
- In-memory `AnalysisJobManager` with states: queued/running/completed/failed/cancelled
- Request validation and error mapping
- Optional synchronous mode for short games

Phase tests:
- API integration: successful analyze request returns `jobId` and valid status lifecycle
- API integration: invalid payload returns 4xx with structured validation errors
- API integration: failed job returns stable error schema from result endpoint
- Unit: job manager state transitions (queued → running → completed/failed/cancelled)

Acceptance criteria:
- Frontend can poll status and fetch final result by `jobId`
- Failed jobs return structured error payloads
- Test gate: HTTP contract tests pass and state machine tests cover all terminal states

### Phase 5 — Frontend analysis experience
**Goal:** Usable Chess.com-like analysis screen.

Deliverables:
- PGN input (paste/upload)
- Board + move list synchronized with selected ply
- Eval graph (line chart)
- Move details panel (label, CPL, best move, PV)

Phase tests:
- Component tests: move list selection updates board FEN and details panel
- Component tests: eval graph highlights selected ply and handles mate scores
- E2E: user pastes PGN, starts analysis, waits for completion, navigates moves
- E2E: error state rendered for invalid PGN and recoverable retry path works

Acceptance criteria:
- User can analyze a game and navigate through all plies with matching board/eval state
- Test gate: critical E2E flow passes in headless CI browser run

### Phase 6 — Hardening and optimization
**Goal:** Stable performance and quality at scale.

Deliverables:
- Two-pass strategy (fast all-move pass + deep critical re-analysis)
- FEN cache to avoid duplicate engine calls
- Concurrency limits based on CPU cores
- Unit/integration regression suite with PGN fixtures

Phase tests:
- Performance benchmark: 40-move fixture game runtime stays within target budget in fast mode
- Unit: cache hit/miss behavior and cache key correctness on repeated FEN evaluations
- Integration: deep-pass only re-evaluates flagged critical plies
- Soak test: run multiple sequential analyses to verify no process leaks or queue deadlocks

Acceptance criteria:
- Runtime target met for a typical 40-move game in fast mode
- Regression tests protect score parsing and labeling logic
- Test gate: benchmark + soak tests pass within CI thresholds

### Phase 7 — Persistent analysis storage and reusable retrieval API
**Goal:** Persist completed analysis by `jobId` and allow repeated loading from disk-backed storage.

Deliverables:
- Local storage directory under project root: `storage/local/analyses/`
- Disk persistence for completed analyses keyed by `jobId` (one JSON file per job)
- New read API: `GET /analysis/:jobId`
- Compatibility path retained for current clients (`GET /api/analyze/:jobId/result`)
- Storage service abstraction (`AnalysisResultStore`) with local filesystem implementation
- Metadata fields in persisted record (`jobId`, `createdAt`, `completedAt`, `analysisVersion`)

Phase tests:
- Unit: local storage adapter writes, reads, and handles missing/corrupt files
- Unit: `AnalysisJobManager` persists on completion and does not persist failed jobs
- API integration: `GET /analysis/:jobId` returns completed analysis after job completion
- API integration: analysis remains retrievable after process restart (disk-backed behavior)

Acceptance criteria:
- Completed analyses survive process restart and can be fetched multiple times by `jobId`
- `GET /analysis/:jobId` returns `200` with persisted payload for existing analysis
- Missing `jobId` returns `404` with structured error payload
- Existing async flow (`POST /api/analyze`, status polling, result fetch) remains functional
- Test gate: new Phase 7 unit + integration suites pass in CI

## Performance Considerations
- Full game at depth 18 is expensive; use two-pass strategy.
- Parallel analysis should be limited by CPU cores.
- Add cancellation support for running jobs.
- Cache by FEN to avoid duplicate evaluations in transpositions.

## Reliability and Edge Cases
- Invalid PGN / illegal move sequences
- Timeouts from engine process
- Engine binary missing or unsupported platform
- Mate score normalization near checkmates
- Drawish positions and oscillating evals

## Testing Strategy
1. Unit tests
   - UCI line parsing
   - Eval normalization
   - Move label assignment
2. Integration tests
   - Analyze short known PGNs and assert expected blunder/mistake counts
3. Snapshot tests
   - Stable JSON output shape
4. Performance tests
   - Target max runtime for 40-move game in fast mode

## Technical Instructions (Build Order)
1. Create module `engine/UciClient` (spawn, command queue, parser).
2. Create module `analysis/GameAnalyzer` (PGN replay + per-ply evaluation).
3. Create module `analysis/Scoring` (CPL, labels, accuracy).
4. Create API handlers for analyze/status/result.
5. Implement frontend analysis page (upload, run, navigate, chart).
6. Add logging and diagnostics around engine calls.
7. Add tests and golden PGN fixtures.

## Definition of Done (MVP)
- Can submit a PGN and receive complete move-by-move analysis.
- Each move has best move, evaluation, CPL, and label.
- Summary includes both sides’ accuracy and mistake counts.
- UI allows stepping through moves and seeing eval graph.
- End-to-end analysis is stable for standard 40-move games.

## Next Enhancements (Post-MVP)
- Opening book tagging and novelty detection
- MultiPV explanation candidates
- Coach-like natural language explanations
- Cloud workers for concurrent large-scale analysis
- User history and saved reports

## Coaching
Goal: implement enhanced coaching (Plan B) so critical moves include concrete winning/losing continuation sequences and clear "why good/bad" explanations.

### Coaching Phase 1 — MultiPV engine foundation
**Goal:** Enable multiple principal variations for coaching-grade comparison.

Deliverables:
- Extend UCI analyze options to support `multiPv`.
- Configure engine with `setoption name MultiPV value N` for coaching analysis paths.
- Return structured multiple lines per position (ranked by `multipv`, score, PV).
- Keep default game-wide flow on fast single-PV to control runtime.

Phase tests:
- Unit: parse and group `info ... multipv ... pv ...` lines by PV rank.
- Unit: ensure fallback to single-PV when engine does not emit complete MultiPV set.
- Integration: evaluate one FEN with `multiPv=3` and assert 3 ranked candidate lines.

Acceptance criteria:
- Engine adapter can return deterministic ranked candidate lines for one position.
- Existing single-PV analysis behavior remains unchanged when `multiPv` is omitted.
- Test gate: MultiPV parser + integration tests pass.

### Coaching Phase 2 — Critical move coaching model
**Goal:** Convert MultiPV output into actionable continuation explanations.

Deliverables:
- Add coaching DTO on analyzed move (e.g., `coaching.type`, `reasonCodes`, `playedLine`, `bestLine`, `scoreGapCp`).
- For bad moves: compute punishment sequence from move position and best alternative sequence from pre-move position.
- For good moves: compute conversion/maintenance sequence showing how advantage is kept or increased.
- Add mate-priority logic so mate swings produce explicit tactical reason codes.

Phase tests:
- Unit: reason classification for `bad_move` vs `good_move` vs `neutral` using CPL and score gap.
- Unit: mate-transition cases produce expected reason codes and message templates.
- Unit: continuation builder outputs bounded sequence length and stable shape.
- Integration: fixed PGN fixture snapshots include coaching payload on critical plies.

Acceptance criteria:
- Every critical move has a non-empty coaching payload with at least one continuation line.
- Non-critical moves can omit coaching payload or include lightweight summary without regressions.
- Test gate: coaching DTO snapshot tests are stable across repeated runs.

### Coaching Phase 3 — API and persistence integration
**Goal:** Expose and persist coaching data without breaking current clients.

Deliverables:
- Include coaching payload in analysis result contracts and persisted job files.
- Preserve backward compatibility for existing response fields.
- Optional on-demand endpoint for deep coaching recalculation by `jobId` + `ply` (for future performance scaling).

Phase tests:
- API integration: `GET /api/analyze/:jobId/result` includes coaching object for flagged plies.
- API integration: persisted/reloaded analysis retains identical coaching payload.
- Contract tests: old clients reading legacy fields continue to function.

Acceptance criteria:
- Coaching fields are retrievable both from in-memory and persisted analyses.
- No breaking schema changes for existing consumers.
- Test gate: API compatibility and persistence tests pass.

### Coaching Phase 4 — UI coaching panel
**Goal:** Present coaching as board-first visualization (not move-list text) for why a move is good or bad.

Deliverables:
- Add a dedicated coaching control block with a `Show best moves` button for the selected move.
- Visualize coaching sequence directly on board (arrows/step-through overlay for best and played continuation).
- Keep coaching visualization separate from existing move list (no insertion of coaching lines into main game move list).
- Provide lightweight side summary in details panel (score gap + reason tags), while sequence itself is board-driven.
- Graceful empty/disabled state when selected move has no coaching payload.

UI/UX constraints (minimal but informative):
- Place coaching controls only in the existing Move Details panel; do not add coaching controls inside Move List.
- Use a compact control row: primary action `Show best moves`, secondary `Hide` state when active.
- Show only compact text metadata (`reason`, `scoreGap`, `sequenceLength`) and keep full continuation visualized on board.
- Limit simultaneous coaching overlays to two lines (played vs best) to prevent board clutter.
- Automatically clear coaching overlay when selected move changes; keep navigation behavior unchanged.
- Reuse existing move-quality color language and avoid introducing new visual themes.
- On narrow screens, keep same behavior (controls remain in details panel; no extra board control rows).

Phase tests:
- UI unit/component: `Show best moves` appears and is enabled only when coaching payload exists.
- UI unit/component: activating coaching renders board overlay/sequence and does not mutate main move list rows.
- UI unit/component: missing coaching payload keeps control disabled and renders placeholder state without errors.
- E2E: navigate to a critical move, click `Show best moves`, and verify board visualization updates with current move.
- E2E: moving to next/previous move resets coaching overlay state without breaking autoplay or keyboard navigation.

Acceptance criteria:
- User can understand "why" from board visualization plus compact coaching summary.
- Coaching sequence is fully separated from existing game move list representation.
- No regressions in move navigation, chart updates, and board rendering.
- Test gate: Phase 5 UI tests extended with coaching assertions pass.

### Coaching Phase 5 — quality tuning and performance guardrails
**Goal:** keep coaching strong while preserving acceptable analysis runtime.

Deliverables:
- Run deep coaching only on critical/high-CPL plies by threshold.
- Add configurable caps (`maxCoachingPlies`, `coachingDepth`, `coachingMultiPv`).
- Tune reason thresholds using fixture games and compare output stability.

Phase tests:
- Performance integration: runtime impact stays within defined budget versus baseline Phase 6 flow.
- Soak integration: repeated analyses with coaching enabled show no queue deadlocks or engine leaks.
- Regression snapshots: coaching reason codes and sequence shape remain deterministic for fixtures.

Acceptance criteria:
- Coaching mode remains within agreed runtime envelope for typical 40-move games.
- Deterministic coaching outputs for fixed fixtures under fixed settings.
- Test gate: performance + soak + snapshot suites pass in CI.
