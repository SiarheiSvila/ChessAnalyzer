# ChessAnalyzer — Project Specification

> A technical design reference. Documents intended behavior, data models, algorithmic approaches, and design rationale. Implementation structure (file names, class names, module boundaries) is left to the implementor — treat any examples as guidance, not mandates.

---

## Table of Contents

1. [Project Brief](#1-project-brief)
2. [User Personas](#2-user-personas)
3. [User Journeys](#3-user-journeys)
4. [Functional Requirements](#4-functional-requirements)
5. [System Architecture](#5-system-architecture)
6. [Data Model](#6-data-model)
7. [API Specification](#7-api-specification)
8. [Analysis Algorithm](#8-analysis-algorithm)
9. [Frontend Specification](#9-frontend-specification)
10. [Engine Integration](#10-engine-integration)
11. [Persistence Layer](#11-persistence-layer)
12. [Configuration & Environment](#12-configuration--environment)
13. [Tech Stack & Rationale](#13-tech-stack--rationale)
14. [Non-Functional Requirements](#14-non-functional-requirements)

---

## 1. Project Brief

### What It Is
ChessAnalyzer is a **self-hosted, Stockfish-powered chess game analysis web application**. It replicates the "analyze your game" feature found on Chess.com or Lichess but runs entirely on your own machine — no external API, no data leaving your system.

### Problem It Solves
Chess players want to review their games and understand:
- Which moves were mistakes and why
- What the best move was at each position
- How accurate their overall play was
- What tactical threats they missed or created

### Core Value Proposition
- Paste a PGN → get a full move-by-move engine analysis
- Visual board replay with evaluation bar and graph
- Optional coaching mode that explains *why* a move was bad and shows the engine's best response
- Admin dashboard to review game history

### Design Principles
- **No third-party chess board library** — board rendered with pure DOM and Unicode chess characters
- **No frontend framework** — vanilla HTML/CSS/JS only, no build step
- **Async-first** — analysis runs as a background job; UI polls for completion
- **Persistent storage** — completed analyses survive server restarts
- **Self-contained** — only external dependency is the Stockfish binary

---

## 2. User Personas

### Persona A: The Chess Player (primary)
Amateur to intermediate player (ELO 800–1800). Exports PGN from Chess.com or Lichess and pastes it in. Non-technical — interacts only through the browser UI.

### Persona B: The Admin (secondary)
The person hosting the app (likely the developer). Wants to browse a history of analyzed games, review past games, delete old ones. Sets `ADMIN_PLAYER_NAME` in the environment to identify "their" games.

### Persona C: The API Consumer (developer)
Building an integration or automation pipeline. Submits PGNs and retrieves structured results programmatically via the REST API.

---

## 3. User Journeys

### Journey 1: Analyze a New Game (Browser)

1. User opens the app at `http://localhost:3000`
2. Sees a landing page: large textarea for PGN input, optional settings (depth, coaching toggle), "Analyze" button
3. Pastes a PGN string, clicks "Analyze"
4. App sends `POST /api/analyze` with the PGN
5. Server validates and creates a background job, responds `202` with `jobId`
6. UI transitions to a loading state with a progress bar
7. UI polls `GET /api/analyze/:jobId/status` every 350ms; progress bar updates
8. When `state = 'completed'`, UI redirects to `/analysis/:jobId`
9. New page fetches `GET /api/analysis/:jobId` and renders the full analysis:
   - Chessboard at the starting position
   - Evaluation bar (white/black percentage)
   - Evaluation graph (eval over time)
   - Move list with color-coded move quality labels
   - Summary panel (White accuracy %, Black accuracy %, label counts)
10. User clicks a move or uses `←` `→` arrow keys to navigate
11. Board updates, eval bar updates, move detail panel shows: move played, quality label, centipawn loss, engine eval before/after, best move arrow
12. If coaching is enabled and the move is a `bad_move`: coaching panel shows the primary reason, a "Show best moves" button (steps through the engine's best continuation), and a "Show threats" button (steps through how the opponent can punish the move)
13. User can flip the board, use `Space` for autoplay

### Journey 2: Browse Game History (Admin)

1. Admin navigates to `http://localhost:3000/admin`
2. App fetches `GET /api/admin/games`
3. Admin sees a table of all analyzed games: player names (color dots), opponent, outcome, move count, date
4. Clicking "Review" navigates to `/analysis/:jobId` (same viewer as Journey 1)
5. Clicking "Delete" sends `DELETE /api/admin/games/:jobId`; row disappears
6. Admin can append `?player=NAME` to override the default player perspective

### Journey 3: API Integration (Async)

1. `POST /api/analyze` with `{ "pgn": "...", "settings": { "depth": 16, "coaching": { "enabled": true } } }`
2. Server responds `202 Accepted`: `{ "jobId": "abc-123" }`
3. Poll `GET /api/analyze/abc-123/status` until `state = 'completed'`
4. Fetch `GET /api/analysis/abc-123` for the persisted result (survives server restarts)

### Journey 4: API Integration (Synchronous)

1. `POST /api/analyze` with `{ "pgn": "...", "synchronous": true }`
2. Server blocks until analysis completes, responds `200` with the full result

---

## 4. Functional Requirements

### FR-01: PGN Input & Validation
- **FR-01.1** Accept a PGN string as the primary input for analysis
- **FR-01.2** Validate the PGN is non-empty; return `400 VALIDATION_ERROR` if empty
- **FR-01.3** Use `chess.js` to parse and validate PGN structure; return a clear error on parse failure
- **FR-01.4** Extract PGN headers: `Event`, `White`, `Black`, `Result`, `Date`, `WhiteElo`, `BlackElo`, and any others present
- **FR-01.5** Enforce a maximum input size (suggested: 200KB or 1000 plies) to prevent runaway jobs

### FR-02: Move Replay
For each ply, produce: 1-indexed ply number, move in SAN notation, move in UCI format (e.g., `e2e4`, `e1g1` for castling), side to move (`w`/`b`), FEN before the move, FEN after the move.

### FR-03: Position Evaluation
- **FR-03.1** Evaluate every position using Stockfish via the UCI protocol
- **FR-03.2** Default analysis depth: 12; configurable via `settings.depth` (range 1–40)
- **FR-03.3** Two-pass analysis:
  - **Fast pass** — evaluate all plies at the configured depth
  - **Deep pass** — re-evaluate critical plies at `min(depth + 6, 22)`
- **FR-03.4** Maintain an evaluation cache keyed by `fen|depth|movetime|multipv` to avoid redundant engine calls on transpositions
- **FR-03.5** Report cache hit/miss counts and total cache size in the analysis result

### FR-04: Move Quality Classification
- **FR-04.1** Compute CPL (centipawn loss) for each move as: `CPL = max(0, round(bestAfterMoverCp − actualAfterMoverCp))` where both scores are from the **mover's perspective**. See Section 8 for the exact perspective conversion required.
- **FR-04.2** Classify each move with a quality label based on CPL:
  - `Best`: 0–10 cp
  - `Excellent`: 11–30 cp
  - `Good`: 31–60 cp
  - `Inaccuracy`: 61–100 cp
  - `Mistake`: 101–250 cp
  - `Blunder`: > 250 cp
- **FR-04.3** For mate scores, convert to centipawns: `sign(mate) × (100,000 − min(99, |mate|) × 1,000)`. Special case: mate-in-0 (checkmate already delivered) → 100,000 cp. This ensures mate scores always outrank material advantages in comparisons.

### FR-05: Critical Moment Detection
- **FR-05.1** Flag a ply as a critical moment if any of these hold:
  - Eval swing ≥ 150 cp (absolute difference between eval-before and eval-after, both in mover's perspective)
  - CPL ≥ 200
  - Either eval-before or eval-after is a mate score
- **FR-05.2** Reason codes: `large_eval_swing`, `high_centipawn_loss`, `mate_score_transition`
- **FR-05.3** Store the computed `evalSwingCp` (the absolute eval swing value) on each analyzed move
- **FR-05.4** Critical plies are re-analyzed in the deep pass

### FR-06: Accuracy Calculation
- **FR-06.1** Per-move accuracy: `100 × exp(−CPL / 170)`, clamped to [0, 100], rounded to 1 decimal place
- **FR-06.2** Side accuracy: arithmetic mean of per-move accuracy for all moves of that side
- **FR-06.3** Result includes per-side counts of each label (best, excellent, good, inaccuracy, mistake, blunder)
- **FR-06.4** Result includes total count of critical moments

### FR-07: Coaching Explanations (Optional Feature)
- **FR-07.1** Coaching is opt-in per request via `settings.coaching.enabled: true`
- **FR-07.2** When enabled, evaluate each position with MultiPV (default 3, configurable via `settings.coaching.multiPv`, range 1–8)
- **FR-07.3** Classify each move as `bad_move`, `good_move`, or `neutral_move`:
  - `bad_move`: played move is ≥ 100 cp worse than the best option
  - `good_move`: played move is ≤ 20 cp worse than the best option AND involves a concrete improvement (material gain ≥ 100 cp, delivering check, or a mate threat)
  - `neutral_move`: everything else
- **FR-07.4** For each move, produce:
  - `scoreGapCp`: cp difference between best move and played move (negative = played was better)
  - `primaryReason`: human-readable English string (e.g., "Loses a piece")
  - `reasonCodes`: array of reason codes (see FR-07.5)
  - `bestLine`: engine's top PV from `fenBefore`, up to 8 UCI moves — the move the engine recommends
  - `playedLine`: engine's PV from `fenAfter`, up to 16 UCI moves — the engine's assessment of how the game should continue after the played move. This is **not** the continuation from the actual PGN game; it is a fresh engine evaluation.
  - `threatLine`: engine's best continuation from `fenAfter`, shown specifically for bad moves to illustrate how the opponent can punish the error. Semantically distinct from `playedLine` but may come from the same MultiPV evaluation. Optional on good/neutral moves.
  - `mateInMoves`: number of moves to mate, if applicable
  - `tacticalTheme`: optional structured theme (fork, pin, skewer, discovery, back-rank mate) with piece details
- **FR-07.5** Coaching reason codes:
  - **Bad**: `loses_to_mate`, `loses_piece`, `loses_material`, `allows_fork`, `allows_pin`, `allows_skewer`, `allows_discovery`, `allows_back_rank_mate`, `hangs_piece`, `allows_checkmate`, `weakens_position`
  - **Good**: `wins_mate`, `wins_piece`, `wins_material`, `creates_fork`, `creates_pin`, `creates_skewer`, `creates_discovery`, `creates_back_rank_mate_threat`, `checks_opponent`, `forces_favorable_trade`, `gains_tempo`, `improves_position`
  - **Neutral**: `equal_position`, `maintains_advantage`, `solid_move`, `natural_move`

### FR-08: Async Job System
- **FR-08.1** Analysis runs as an async background job by default
- **FR-08.2** Job lifecycle states: `queued → running → completed | failed`
- **FR-08.3** Job concurrency is configurable; a reasonable default is `max(1, floor(availableParallelism / 2))`. See Section 5 for the design choice on shared vs. per-job Stockfish instances and how this affects real parallelism.
- **FR-08.4** Job progress reported as 0–100 based on `currentPly / totalPlies × 100`
- **FR-08.5** Completed jobs are persisted to disk so results survive server restarts
- **FR-08.6** Synchronous mode: `synchronous: true` in the request body — server blocks until analysis completes and returns the full result directly

### FR-09: Persistence
- **FR-09.1** Each completed analysis is saved as a single JSON file
- **FR-09.2** File naming: `{jobId}.json`
- **FR-09.3** Writes are atomic: write to a temporary file then rename to the final path, preventing partial writes on crash
- **FR-09.4** Stored record includes: `jobId`, `createdAt` (ISO 8601), `completedAt` (ISO 8601), `analysisVersion` (read from `package.json` at startup — enables future migration of stored records), and the full analysis result
- **FR-09.5** System supports listing all stored analyses sorted by date descending
- **FR-09.6** System supports deleting a stored analysis by jobId

### FR-10: Board Orientation (Viewer Preference)
- **FR-10.1** When `ADMIN_PLAYER_NAME` env var is set, determine which color that player was in the game
- **FR-10.2** If the player played Black, default the board to flipped orientation
- **FR-10.3** Return a `viewer` object alongside the analysis result: `{ playerName, playerColor, boardFlipped }`
- **FR-10.4** If no player name is configured, the admin page can infer the most-frequently-appearing player name across all stored games as the default

### FR-11: Admin Interface
- **FR-11.1** Admin page lists all stored analyses as a sortable table
- **FR-11.2** Each row shows: player name (with color dot), opponent name (with color dot), outcome (Win/Loss/Draw), move count, date played
- **FR-11.3** Each row has a "Review" button (navigates to `/analysis/:jobId`) and a "Delete" button
- **FR-11.4** Query parameter `?player=NAME` overrides the default player perspective for the whole page

### FR-12: Frontend Board Viewer
- **FR-12.1** Board rendered as an 8×8 CSS grid using Unicode chess pieces; no third-party board library
- **FR-12.2** Board shows the position at the currently selected ply, re-rendered from FEN on every navigation
- **FR-12.3** Evaluation bar shows white/black advantage as a percentage. The input to the bar must be converted to White's perspective before display (see Section 9).
- **FR-12.4** Evaluation graph rendered as an SVG polyline with one point per ply, Y axis from White's perspective
- **FR-12.5** Move list shows every move with color-coded quality label badges; clicking a move navigates to that ply
- **FR-12.6** Keyboard navigation: `←` previous ply, `→` next ply, `Space` toggle autoplay (1-second interval)
- **FR-12.7** Board flip button toggles orientation
- **FR-12.8** SVG arrows overlaid on the board: red/orange arrow for the played move (on bad moves), green arrow for the best move
- **FR-12.9** Coaching panel shown when a move has coaching data: primary reason text, "Show best moves" button (steps through `bestLine` from `fenBefore`), "Show threats" button (steps through `threatLine` from `fenAfter`)

---

## 5. System Architecture

### Components

**HTTP Layer** — Express server that validates requests, routes them to the job manager or storage, and shapes responses. Serves static frontend files with `Cache-Control: no-cache, no-store` to prevent stale analysis results from being cached in the browser.

**Job Manager** — Accepts analysis requests, enqueues background jobs, tracks job state (queued/running/completed/failed) in memory, and manages concurrency. Provides both async (return jobId, poll later) and synchronous (block until done) modes.

**Analysis Pipeline** — Core logic: parses PGN, replays moves to produce per-ply FEN pairs, evaluates positions via Stockfish, computes CPL and quality labels, detects critical moments, runs the deep pass, optionally runs coaching classification, and builds the final result object.

**Engine Client** — Manages the Stockfish subprocess. Implements the UCI protocol (startup handshake, position + go commands, parsing info/bestmove output). Enforces a single in-flight command queue — only one `go` command active at a time. Handles restarts on crash or timeout.

**Storage** — Persists completed analysis results as JSON files. Supports read, list, delete. Defined behind an interface so the filesystem implementation can be swapped for a database later.

### Concurrency Design Choice

Two valid approaches for running multiple jobs in parallel:

- **Shared Stockfish instance (simpler):** One engine process, all jobs serialize engine commands through its queue. Concurrency > 1 only helps with non-engine work (PGN parsing, coaching logic). Real engine throughput is sequential.
- **Pool of Stockfish instances (parallel):** Spawn one process per concurrent job. `floor(availableParallelism / 2)` then genuinely maps to CPU capacity. More complex, but actually faster for multi-job workloads.

Pick one approach and be internally consistent — the default concurrency formula is only meaningful if each job gets its own engine instance.

### Data Flow Summary

```
POST /api/analyze
  → validate PGN and settings
  → enqueue job → return jobId (202)

[background job]
  → parse PGN → extract headers and moves
  → replay moves → produce (fenBefore, fenAfter, san, uciMove) per ply
  → fast pass: evaluate fenBefore and fenAfter for every ply
  → detect critical plies
  → deep pass: re-evaluate critical plies at deeper depth
  → compute CPL, label, evalSwingCp, isCritical for each ply
  → if coaching: classify each ply, build bestLine / playedLine / threatLine
  → compute accuracy summaries
  → save result to disk
  → update job state to 'completed'

GET /api/analysis/:jobId
  → read from disk → resolve viewer preference → return result
```

---

## 6. Data Model

### Per-Ply Data

Each analyzed ply carries:
- Basic replay data: ply index (1-based), SAN move, UCI move, side to move (`w`/`b`), FEN before the move, FEN after the move
- Raw engine data: `evalBefore` — engine score for `fenBefore`, in the **mover's perspective** (this is what Stockfish naturally returns). `evalAfter` — **raw** engine score for `fenAfter`, in the **opponent's perspective** (the new side to move after the move was played). To convert to mover's perspective for scoring: negate `evalAfter`. The best move from `fenBefore` (UCI string), and the principal variation.
- Computed scoring: `evalBestAfter` — the engine's score treating the best move as played (initially equals `evalBefore`; the deep pass may update it independently), `cpl`, quality label, `isCritical`, `criticalReasons`, `evalSwingCp`
- Optional coaching: see below

### Score Representation

Every engine score is either `{ kind: 'cp', value: N }` (centipawns, positive = good for side to move) or `{ kind: 'mate', value: N }` (mate in N, positive = mover wins). All score comparisons go through a `scoreToCp` conversion that handles both kinds and preserves correct ordering.

### Coaching Data Per Move

When coaching is enabled, each ply also carries: move type (`bad_move` / `good_move` / `neutral_move`), `scoreGapCp`, `primaryReason` (English string), `reasonCodes` array, `bestLine` (up to 8 UCI moves from `fenBefore`), `playedLine` (up to 16 UCI moves from `fenAfter` — engine continuation, not PGN continuation), `threatLine` (up to 8 UCI moves from `fenAfter` — opponent's best punishment, populated for bad moves), optional `mateInMoves`, optional `tacticalTheme`.

### Analysis Result

The top-level result contains:
- `game`: headers extracted from PGN (`white`, `black`, `result`, `event`, and the full headers map including `Date`, `WhiteElo`, `BlackElo`)
- `settings`: depth used, deep depth, count of plies that received deep re-analysis, cache stats (hits, misses, size)
- `moves`: array of analyzed plies (above)
- `summary`: `accuracyWhite`, `accuracyBlack`, per-side label counts (`best` through `blunder`), `criticalMoments` total count

### Stored Record

Wraps the analysis result with: `jobId`, `createdAt`, `completedAt`, `analysisVersion` (from `package.json`).

### Admin List Item

Derived from the stored record for display: `jobId`, player name + color + ELO, opponent name + color + ELO, outcome (`Win`/`Loss`/`Draw`/`Unknown`), move count (full moves = `ceil(plies / 2)`), date string from PGN header.

---

## 7. API Specification

Base URL: `http://localhost:{PORT}` (PORT defaults to 3000).

---

### `POST /api/analyze`
Submit a PGN for analysis.

**Request body fields:**
- `pgn` (string, required)
- `settings.depth` (number, 1–40, default 12)
- `settings.coaching.enabled` (boolean, default false)
- `settings.coaching.multiPv` (number, 1–8, default 3)
- `synchronous` (boolean, default false)

**Responses:**
- `202 Accepted` (async): `{ "jobId": "uuid-string" }`
- `200 OK` (synchronous): same shape as `GET /api/analysis/:jobId` response
- `400 Bad Request`: `{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }`
  - Empty PGN, invalid depth range, invalid boolean, invalid multiPv range, PGN parse failure
- `500 Internal Server Error`: `{ "error": { "code": "ANALYSIS_FAILED", "message": "..." } }` (synchronous mode only)

---

### `GET /api/analyze/:jobId/status`
Poll job progress.

**Response `200 OK`:** `jobId`, `state` (queued/running/completed/failed), `progress` (0–100), `currentPly`, `totalPlies`, `createdAt`, `updatedAt`, `error` (if failed)

**Response `404`:** `{ "error": { "code": "JOB_NOT_FOUND" } }`

---

### `GET /api/analyze/:jobId/result`
Get result from in-memory job store. **Caution:** returns `404` after a server restart even for completed jobs — prefer `GET /api/analysis/:jobId` for durable access.

**Responses:**
- `200 OK` (completed): full analysis result response
- `202 Accepted` (still running): `{ "jobId", "state", "progress" }`
- `404 Not Found`: job not in memory
- `500`: `ANALYSIS_FAILED` or `STORAGE_ERROR`

---

### `GET /api/analysis/:jobId`
Get persisted analysis result from disk. Survives server restarts. Canonical endpoint for the browser viewer.

**Response `200 OK`:** `{ "jobId", "state": "completed", "result": { ... }, "viewer": { "playerName", "playerColor", "boardFlipped" } }`

**Response `404`:** `JOB_NOT_FOUND`

**Response `500`:** `STORAGE_ERROR`

---

### `GET /api/admin/games`
List all stored analyses.

**Query params:** `player` (string, optional) — overrides `ADMIN_PLAYER_NAME` env var for perspective

**Response `200 OK`:** `{ "games": [ ...AdminGameListItem ] }` sorted by date descending

---

### `DELETE /api/admin/games/:jobId`
Delete a stored analysis.

**Responses:**
- `200 OK`: `{ "ok": true, "jobId": "..." }`
- `404 Not Found`: `JOB_NOT_FOUND`
- `501 Not Implemented`: `DELETE_NOT_SUPPORTED` (if storage backend doesn't support delete)
- `500`: `STORAGE_DELETE_ERROR`

---

### `GET /health`
Health check. Returns `200 OK` with any non-error body.

---

### Frontend Routes (HTML pages)

| Path | Serves |
|---|---|
| `/` | `public/index.html` (PGN input form) |
| `/analysis/:jobId` | `public/index.html` (analysis viewer) |
| `/admin` | `public/admin.html` |
| `/*` | Static files from `public/` |

---

## 8. Analysis Algorithm

### Step 1: Parse PGN
Use `chess.js` to parse the PGN string. Extract all headers and the move list in SAN notation.

### Step 2: Replay Moves
Walk through every move using `chess.js` to capture `fenBefore` and `fenAfter` for each ply. Derive the UCI move string from the verbose move history (handles castling, en passant, promotion correctly).

### Step 3: Fast Pass — Evaluate All Positions
For each ply, make two engine calls:
1. Evaluate `fenBefore` — Stockfish returns a score from the **mover's perspective**. Store as `evalBefore`. The best move and principal variation come from this same call.
2. Evaluate `fenAfter` — Stockfish returns a score from the **new side-to-move's perspective** (the opponent). Store this **raw** value as `evalAfter`.

`evalBestAfter` is initialized to `evalBefore` — they come from the same call. The deep pass may later update `evalBestAfter` independently.

### Step 4: Convert Scores and Compute CPL
To compute CPL, both scores must be in the mover's perspective:
- `bestAfterMoverCp = scoreToCp(evalBefore)` — already in mover's perspective
- `actualAfterMoverCp = −scoreToCp(evalAfter)` — **negate** to convert from opponent's perspective to mover's perspective
- `CPL = max(0, round(bestAfterMoverCp − actualAfterMoverCp))`

This negation step is critical. Forgetting it produces correct-looking but wrong CPL values on every other ply.

### Step 5: Mate Score Conversion
`scoreToCp` handles mate scores: `sign(mate) × (100,000 − min(99, |mate|) × 1,000)`.
- Mate in 1 → ±99,000 cp. Mate in 99 → ±1,000 cp.
- Mate in 0 (checkmate already on board) → +100,000 cp.
- This ensures forced mates always outrank material advantages in comparisons.

### Step 6: Detect Critical Moments
Using mover-perspective values:
- `evalBeforeForMover_cp = scoreToCp(evalBefore)`
- `evalAfterForMover_cp = −scoreToCp(evalAfter)`
- `evalSwingCp = |evalAfterForMover_cp − evalBeforeForMover_cp|`
- A ply is critical if: `evalSwingCp ≥ 150`, OR `CPL ≥ 200`, OR either score is a mate score

Store `evalSwingCp` on the analyzed move regardless of whether it is flagged as critical.

### Step 7: Deep Pass
For every critical ply, re-evaluate `fenBefore` and `fenAfter` at `deepDepth = min(depth + 6, 22)`. Update `evalBestAfter`, `evalAfter`, CPL, label, and critical flags with the deeper values.

### Step 8: Compute Accuracy
- Per-move accuracy: `100 × exp(−CPL / 170)`, clamped to [0, 100], rounded to 1 decimal
- Side accuracy: mean of per-move accuracy for all moves of that side

### Step 9: Coaching Classification (when enabled)
For each ply, evaluate `fenBefore` with MultiPV to get the top N candidate lines.

**Finding the played move's score:** Check if the played move appears in the candidate lines. If it does, use its score. If it does not appear (outside top N), run a separate single-PV evaluation forcing the played move to get its score.

**Classification thresholds:**
- `scoreGapCp = bestLineCp − playedMoveCp`
- `bad_move`: `scoreGapCp > 100`
- `good_move`: `scoreGapCp ≤ 20` AND the move involves a concrete improvement (material gain ≥ 100 cp, delivering check, or a mate threat)
- `neutral_move`: everything else

> The 100 cp and 20 cp thresholds are design choices. Chess.com uses similar heuristics. They can be tuned — tighter thresholds give fewer "good move" highlights; looser gives more. The key constraint is that `bad_move` and `good_move` must not overlap.

**Building the lines:**
- `bestLine`: PV from the rank-1 candidate of the `fenBefore` MultiPV evaluation, up to 8 moves
- `playedLine`: PV from a standard evaluation of `fenAfter`, up to 16 moves — shows how the engine continues from the played position
- `threatLine`: for bad moves, the rank-1 PV from `fenAfter` evaluation, up to 8 moves — shows how the opponent punishes the error

**Reason code assignment:** Based on mate scores, material delta between `fenBefore` and `fenAfter`, check patterns, and tactical motifs (forks, pins, skewers, discoveries).

---

## 9. Frontend Specification

### Pages

**`index.html`** serves two modes depending on the URL path:
- `/` — PGN input form with settings and Analyze button
- `/analysis/:jobId` — Analysis viewer; detects the mode from `window.location.pathname` on load

**`admin.html`** — standalone admin page

### Layout (3-column grid)

```
┌─────────────────┬──────────────────────────┬────────────────────┐
│  LEFT PANEL     │  CENTER PANEL            │  RIGHT PANEL       │
│                 │                          │                    │
│  [PGN textarea] │  [Evaluation Bar]        │  [Eval Graph SVG]  │
│  [Settings]     │  [Chess Board 8×8]       │  [Move List]       │
│  [Analyze btn]  │  [Nav: ◀ ▶ ⟳]           │                    │
│                 │  [Board Flip btn]        │                    │
│  ─────────────  │                          │                    │
│  [Move Detail]  │                          │                    │
│  [Coaching]     │                          │                    │
└─────────────────┴──────────────────────────┴────────────────────┘
```

### Chess Board Rendering
- 8×8 CSS grid; each square is a `div` with light/dark class
- Pieces are Unicode characters: white ♔♕♖♗♘♙, black ♚♛♜♝♞♟
- Board is fully re-rendered from FEN on every ply change
- FEN parsing: split placement string by `/`, expand digit runs into empty squares, map piece characters to Unicode

### SVG Arrow Overlay
- SVG positioned absolutely over the board with `viewBox="0 0 8 8"`
- UCI move format `e2e4`: file letter → column index (a=0 … h=7), rank digit → row index (1=7 … 8=0)
- Red/orange arrow for the played move (shown on bad moves), green arrow for the best move
- Arrows are suppressed when coaching mode is active

### Evaluation Bar
Displays white advantage as a fill percentage. Input must be the eval in **White's perspective** in centipawns. Mapping: ±0 cp → 50%, ±500 cp → ~100%/0% (clamp at 50 pawns on each side).

**Perspective conversion:** `evalAfter` is stored as the raw engine score from `fenAfter` — from the new side-to-move's (opponent's) perspective. To get White's perspective: if White just moved (move color = `w`), negate `evalAfter`; if Black just moved (move color = `b`), use `evalAfter` as-is. At the starting position (before any move), use `evalBefore` of move 1, which is already from White's perspective.

### Evaluation Graph
SVG polyline with one point per ply. X axis: ply index. Y axis: eval from **White's perspective**, normalized and clamped. Apply the same perspective conversion as the eval bar. Normalization: linear clamp (e.g., ±1000 cp → ±1.0) or sigmoid-style (e.g., tanh(cp / 600)) — the latter compresses large advantages more gracefully. A horizontal line at y=0 separates white/black advantage zones.

### Coaching Line Navigation
When the user clicks "Show best moves" or "Show threats", the board enters coaching mode: it steps through UCI moves one by one, starting from `fenBefore` (best line) or `fenAfter` (threat line). Stepping through coaching lines requires applying UCI moves to FEN strings without `chess.js` in the browser. A custom `applyUciMoveToFen` function must handle: standard moves, captures, en passant, castling (king moves two squares → rook must also move), and promotions (e.g., `e7e8q`).

### Move List
Rows paired by full move number. Each cell shows the SAN move and a colored quality badge:
- Best: deep blue / Excellent: light blue / Good: green / Inaccuracy: yellow / Mistake: orange / Blunder: red

### Admin Page Layout

```
┌────────────────────────────────────────────────────────────────┐
│  ADMIN — Game History                                          │
├────────┬──────────────┬──────────────┬──────┬────────┬────────┤
│ Date   │ Me           │ Opponent     │ Out  │ Moves  │Actions │
├────────┼──────────────┼──────────────┼──────┼────────┼────────┤
│ ...    │ ● PlayerName │ ○ Opponent   │ Win  │  42    │ [Rev]  │
│        │   (ELO)      │   (ELO)      │      │        │ [Del]  │
└────────┴──────────────┴──────────────┴──────┴────────┴────────┘
```

---

## 10. Engine Integration

### UCI Protocol Overview
UCI (Universal Chess Interface) is a text-based protocol. The server spawns Stockfish as a child process and communicates via stdin/stdout line by line.

**Startup handshake:** Send `uci`, wait for `uciok`. Then send `setoption` commands (Hash size, thread count), send `isready`, wait for `readyok`.

**Per-position analysis:** Send `position fen {fen}`, then `go depth {depth}`. Stockfish streams `info` lines with intermediate results. The final `bestmove` line signals completion.

**MultiPV analysis:** Before the `go` command, send `setoption name MultiPV value {n}`. Each `info` line will carry a `multipv` rank (1 = best line). Collect all info lines and take the highest-depth result for each rank.

### Info Line Parsing
Extract from each `info` line: `depth`, `seldepth`, `multipv` rank, `score cp N` or `score mate N`, `pv` (move list), `nodes`, `nps`, `time`. When MultiPV > 1, build candidate lines by keeping the deepest `info` line for each `multipv` rank.

### Command Queue
Only one `go` command may be active at a time. Subsequent requests queue and execute sequentially.

### Error Handling
- `UCI_TIMEOUT`: engine didn't respond within the configured timeout
- `UCI_PROCESS_EXIT`: process exited unexpectedly
- On timeout or unexpected exit: attempt restart up to N retries before propagating the error

### Graceful Shutdown
On SIGINT/SIGTERM: send `stop` if analysis is running, then `quit`, then wait for the process to exit (with timeout).

---

## 11. Persistence Layer

The storage component has a simple interface: `save(jobId, result, createdAt)`, `getByJobId(jobId)`, `listAll()`, `deleteByJobId(jobId)`. Defining this as an interface allows the filesystem implementation to be swapped for a database without changing the job manager.

**Local filesystem implementation:**
- Storage directory configured via `ANALYSIS_STORAGE_DIR` (default: `storage/local/analyses/`)
- One file per job: `{jobId}.json`
- Atomic write: write to `{jobId}.json.tmp`, then rename to `{jobId}.json` — prevents corrupt files on crash
- `listAll`: read and parse all `*.json` files in the directory
- `getByJobId`: parse the file; return `undefined` on `ENOENT`
- `deleteByJobId`: unlink the file; return `false` on `ENOENT`

No pagination is currently specified. For large game histories this may become necessary.

---

## 12. Configuration & Environment

| Variable | Required | Default | Description |
|---|---|---|---|
| `STOCKFISH_PATH` | **Yes** | — | Absolute path to Stockfish binary |
| `PORT` | No | `3000` | HTTP server port |
| `ANALYSIS_STORAGE_DIR` | No | `storage/local/analyses` | Directory for persisted analyses |
| `ADMIN_PLAYER_NAME` | No | `''` | Player name to identify as "you" in admin/viewer |

Loaded via `dotenv` at startup from a `.env` file (gitignored).

---

## 13. Tech Stack & Rationale

| Concern | Choice | Why |
|---|---|---|
| Runtime | Node.js 20 | Async I/O suits the engine subprocess model |
| Language | TypeScript 5 | Type safety for complex data models (analysis result, UCI types) |
| Dev runner | `tsx` | No compile step; runs TypeScript directly |
| Web framework | Express 5 | Minimal, well-understood |
| Chess logic | `chess.js` | Battle-tested PGN/FEN parsing, move validation, legal move generation |
| Frontend | Vanilla HTML/CSS/JS | No build step, no bundler, no framework |
| Storage | Local filesystem JSON | No database dependency; analyses are small and write-once |
| Testing | Node.js native test runner + Supertest | No extra framework dependency |
| Container | Docker multi-stage | Installs `stockfish` via `apt` in runtime image |

**Deliberately excluded:** React/Vue/Angular (not needed for a simple viewer), Redis/PostgreSQL (overkill for single-user storage), Jest (native runner is sufficient), webpack/vite (no bundling needed).

---

## 14. Non-Functional Requirements

### Performance
- A 40-move game should complete analysis at depth 12 in under 30 seconds on modern hardware
- The evaluation cache should prevent redundant engine calls for transpositions
- The frontend should render the board and eval graph with no perceptible lag on ply navigation (<100ms)

### Reliability
- Stockfish process restarted automatically on crash or timeout (up to N retries)
- File writes atomic to prevent corrupted analysis files on crash
- Server handles SIGINT/SIGTERM gracefully; Stockfish shut down cleanly

### Concurrency
- Multiple analysis jobs run concurrently, capped to avoid CPU contention (see Section 5 for design choice)
- The UCI client serializes all engine commands — only one analysis per Stockfish instance at a time

### Security
- PGN input validated and processed only by `chess.js`, never executed as code
- `STOCKFISH_PATH` read only from environment, never from user input
- File paths for storage constructed from jobId using safe path joining only
- Admin endpoints (`/admin`, `DELETE /api/admin/games/:jobId`) are **intentionally unauthenticated** — accepted trade-off for a self-hosted single-user tool. If the app is exposed beyond localhost, the operator is responsible for adding reverse-proxy authentication.

### Maintainability
- Analysis pipeline separated into pure functions (scoring, critical moment detection) independently testable
- Storage behind an interface, enabling database swap without touching the job manager
- UCI protocol parsing isolated with no side effects, testable with string fixtures

### Observability
- Every significant operation logged with jobId, ply counts, depths, and cache stats
- Analysis result includes cache hit/miss counts and deep re-analysis ply count

### Test Coverage (required, not optional)
- Unit tests: scoring formulas (CPL, label boundaries, accuracy, mate score conversion)
- Unit tests: critical moment detection (swing thresholds, CPL threshold, mate flag)
- Unit tests: UCI protocol parser (info line parsing, MultiPV accumulation, bestmove extraction)
- Unit tests: PGN parsing (valid games, malformed PGN, games with/without headers)
- Integration tests: full API flow (submit → poll → result)
- Integration tests: storage (save, read, list, delete, atomic write, ENOENT handling)
