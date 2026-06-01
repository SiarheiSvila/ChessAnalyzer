# ChessAnalyzer — Functional Requirements

## What It Is
A Stockfish-powered chess game analysis web app that mirrors Chess.com's "analyze your game" feature. Users paste a PGN string and receive per-move analysis with quality labels, accuracy scores, and optional coaching explanations.

---

## Core Features

### 1. PGN Ingestion
- Accept a PGN string via browser textarea or API
- Validate and parse PGN using `chess.js` (headers + move history)
- Return errors on invalid/unparseable PGN

### 2. Move-by-Move Engine Analysis
- Replay every move to capture `fenBefore`/`fenAfter` per ply
- Evaluate each position with Stockfish at configurable depth (default 12)
- Two-pass analysis: fast pass for all plies, deep pass (depth+6, max 22) for critical plies
- FEN-level evaluation cache (keyed by `fen|depth|movetime|multipv`) to avoid redundant engine calls

### 3. Move Quality Classification
Centipawn-loss (CPL) thresholds:
- **Best**: CPL 0–10
- **Excellent**: CPL 11–30
- **Good**: CPL 31–60
- **Inaccuracy**: CPL 61–100
- **Mistake**: CPL 101–250
- **Blunder**: CPL > 250

### 4. Critical Moment Detection
A move is flagged "critical" if:
- Eval swing ≥ 150 centipawns
- CPL ≥ 200
- A mate-score transition occurs (e.g., moving into or out of forced mate)

### 5. Accuracy Summary
- Per-side accuracy using formula: `100 * exp(-cpl / 170)` averaged over all moves
- Per-side counts of each label (Best, Excellent, Good, Inaccuracy, Mistake, Blunder)

### 6. Coaching Explanations (optional, per-request toggle)
When `enableCoaching: true`:
- Each ply evaluated with MultiPV (default 3 lines)
- Move classified as `bad_move`, `good_move`, or `neutral_move`
- `scoreGapCp` between best and played move computed
- ~25 `reasonCodes` mapped (e.g., `loses_material`, `wins_mate`, `weakens_position`)
- Human-readable `primaryReason` string generated
- `bestLine`: engine's top continuation from pre-move position
- `playedLine`: continuation from actual game moves (up to 16 plies)
- `threatLine`: engine's best response from post-move position (shows how opponent punishes mistakes)

---

## API

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/analyze` | Create async job (202 + jobId) or sync (200 + result) |
| GET | `/api/analyze/:jobId/status` | Poll job state and progress (0–100%) |
| GET | `/api/analyze/:jobId/result` | Fetch final analysis result |
| GET | `/api/analysis/:jobId` | Fetch persisted result from disk |
| GET | `/api/admin/games` | List all persisted games sorted by date |
| DELETE | `/api/admin/games/:jobId` | Delete a persisted analysis |
| GET | `/health` | Health check |

---

## Async Job System
- Jobs have states: `queued → running → completed/failed`
- Concurrency: `os.availableParallelism() / 2` (min 1)
- Progress reported as 0–100% (currentPly / totalPlies)
- Completed jobs persisted to disk; survive process restarts

---

## Persistence
- One JSON file per analysis job stored under `ANALYSIS_STORAGE_DIR`
- Atomic writes (write to `.tmp`, rename to final)
- Jobs retrievable by jobId after restart

---

## Frontend (Browser UI)
- 3-column layout: left (PGN input + move detail + coaching panel), center (board + eval bar + navigation), right (eval graph + move list)
- Chess board rendered via pure DOM manipulation with Unicode pieces (no third-party board lib)
- SVG arrows: played move arrow (for bad moves), best-move arrow
- Eval bar and SVG polyline eval graph
- Coaching visualization:
  - "Show best moves": steps through `bestLine` from `fenBefore`
  - "Show threats": steps through `threatLine` from `fenAfter`
- Keyboard navigation: `←`/`→` prev/next move, `Space` autoplay (1s interval)
- Board flip button
- Polls analysis status every 350ms, redirects to result page on completion

---

## Admin Page
- Lists all stored games with player names (white/black colored dots), outcome (Win/Loss/Draw), move count, date
- "Review" link navigates to analysis viewer
- "Delete" removes analysis from storage
- `ADMIN_PLAYER_NAME` env var controls which player is highlighted as "you"

---

## Configuration

| Env Variable | Required | Default | Purpose |
|---|---|---|---|
| `STOCKFISH_PATH` | Yes | — | Path to Stockfish binary |
| `PORT` | No | `3000` | HTTP server port |
| `ANALYSIS_STORAGE_DIR` | No | `storage/local/analyses` | Analysis storage directory |
| `ADMIN_PLAYER_NAME` | No | `''` | Player name for admin board orientation |

---

## Tech Stack
- **Runtime**: Node.js 20, TypeScript 5, `tsx`
- **Framework**: Express 5
- **Chess Logic**: `chess.js`
- **Engine**: Stockfish (external binary, UCI protocol over stdin/stdout)
- **Frontend**: Vanilla HTML/CSS/JS (no framework, no bundler)
- **Storage**: Local filesystem JSON
- **Testing**: Node.js native test runner + Supertest
- **Container**: Docker (multi-stage, installs stockfish via apt)
