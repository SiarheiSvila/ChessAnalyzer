# Phase 1 Implementation Log — Engine foundation (UCI bridge)

Date: 2026-03-15

## Objective
Implement Phase 1 from `ai/plan.md`: a reliable Stockfish UCI communication layer with:
- UCI process lifecycle
- command queueing
- `info`/`score`/`pv`/`bestmove` parsing
- timeout/retry behavior
- smoke validation path

## Step-by-step work log

### 1) Inspected workspace state
- Checked workspace root.
- Found only one existing file under `ai/`: `plan.md`.
- Conclusion: scaffold Phase 1 codebase from scratch with minimal TypeScript setup.

### 2) Created Node/TypeScript project scaffold
Created `package.json` with scripts:
- `build` → `tsc -p tsconfig.json`
- `typecheck` → `tsc -p tsconfig.json --noEmit`
- `phase1:smoke` → `tsx src/scripts/phase1-smoke.ts`

Added dev dependencies:
- `typescript`
- `tsx`
- `@types/node`

Created `tsconfig.json` with strict mode and Node typing.

### 3) Added shared error primitives
Created:
- `src/shared/errors/AppError.ts`
- `src/shared/errors/EngineError.ts`

Purpose:
- Provide typed, structured errors with code and optional details.
- Use `EngineError` for process and protocol failures.

### 4) Added UCI domain types
Created `src/engine/uci/UciTypes.ts` with:
- `UciScore` (`cp` or `mate`)
- `UciInfo`
- `UciEvaluation`
- `UciAnalyzeOptions`
- `UciClientOptions`

Purpose:
- Keep parser/client/service strongly typed.

### 5) Implemented UCI protocol parsing utilities
Created `src/engine/uci/UciProtocol.ts` with:
- `parseBestMoveLine(line)`
- `parseInfoLine(line)`

Supported tokens in `info` parsing:
- `depth`, `seldepth`, `multipv`, `nodes`, `nps`, `time`, `score cp|mate`, `pv`

### 6) Implemented `UciClient` process bridge
Created `src/engine/uci/UciClient.ts` with:
- Process spawn + stdout/stderr handling
- Buffered line parsing
- Strict single in-flight command model with queue for concurrent callers
- Command timeout handling
- Handshake/lifecycle:
  - `uci` → wait `uciok`
  - `isready` → wait `readyok`
  - optional `setoption` for `Threads`/`Hash`
- Position evaluation:
  - `position fen <FEN>` (+ readiness sync)
  - `go depth N` or `go movetime M`
  - parse `bestmove`
  - keep best `info` (max depth)
- Restart and shutdown support (`start`, `stop`, `restart`)

### 7) Implemented `StockfishService` wrapper
Created `src/engine/StockfishService.ts` with:
- `initialize()` / `shutdown()` wrappers
- `evaluateFen(fen, options)`
- Retry once after restart for retryable errors:
  - `UCI_TIMEOUT`
  - `UCI_PROCESS_EXIT`
  - `UCI_PROCESS_ERROR`

This covers the Phase 1 acceptance requirement for transient failure recovery.

### 8) Added smoke validation script
Created `src/scripts/phase1-smoke.ts`:
- Reads `STOCKFISH_PATH` (default: `stockfish`)
- Reads `TEST_FEN` (default opening position)
- Initializes `StockfishService`
- Evaluates one FEN at depth 12
- Prints JSON with `bestMove`, `score`, `depth`, `pv`
- Always shuts down engine process in `finally`

### 9) Ran static validation and fixed environment dependency gap
Executed:
- `npm install`
- `npm run typecheck`

Result:
- Typecheck passed successfully.

### 10) Ran functional smoke script
Executed:
- `npm run phase1:smoke`

Result:
- Failed with `EngineError` code `UCI_PROCESS_ERROR`
- Root cause: `spawn stockfish ENOENT` (Stockfish binary not available in PATH)

Interpretation:
- The bridge error handling works and reports missing engine binary correctly.
- Functional evaluation is blocked until engine binary is installed or path is configured.

## Files added in Phase 1
- `package.json`
- `tsconfig.json`
- `src/shared/errors/AppError.ts`
- `src/shared/errors/EngineError.ts`
- `src/engine/uci/UciTypes.ts`
- `src/engine/uci/UciProtocol.ts`
- `src/engine/uci/UciClient.ts`
- `src/engine/StockfishService.ts`
- `src/scripts/phase1-smoke.ts`

## Current verification status against Phase 1
- ✅ UCI wrapper implemented (`UciClient`)
- ✅ Parsing implemented for `info`, `score`, `pv`, `bestmove`
- ✅ Timeout and typed error flow implemented
- ✅ Restart-once retry behavior implemented in `StockfishService`
- ✅ TypeScript compile/typecheck passes
- ⚠️ Live engine smoke test blocked by missing Stockfish executable

## How to unblock smoke test
Provide Stockfish binary path and rerun:

PowerShell example:
```powershell
$env:STOCKFISH_PATH = "C:\path\to\stockfish.exe"
npm run phase1:smoke
```

WSL/bash example:
```bash
export STOCKFISH_PATH=/path/to/stockfish
npm run phase1:smoke
```

## Suggested immediate next step (Phase 1 completion)
- Build/download Stockfish binary and set `STOCKFISH_PATH`.
- Re-run `npm run phase1:smoke`.
- Capture one successful output sample in this file as final Phase 1 evidence.

## Step 11) Configured `STOCKFISH_PATH` and re-validated
User requested exact variable value:
- `STOCKFISH_PATH=/mnt/c/Users/SiarheiSvila/Documents/Projects/stockfish/stockfish.exe`

Actions performed:
1. Verified executable exists at requested path (`FOUND`).
2. Ran smoke test with shell export:
   - `export STOCKFISH_PATH=/mnt/c/Users/SiarheiSvila/Documents/Projects/stockfish/stockfish.exe`
   - `npm run phase1:smoke`
3. Result: successful evaluation output returned.

## Step 12) Persisted env config in project
Created root file:
- `.env`

Content:
- `STOCKFISH_PATH=/mnt/c/Users/SiarheiSvila/Documents/Projects/stockfish/stockfish.exe`

To ensure `.env` is auto-loaded by scripts:
- Added `dotenv` dependency in `package.json`.
- Added `import 'dotenv/config';` at top of `src/scripts/phase1-smoke.ts`.

## Step 13) Verified persistent env flow (no manual export)
Executed:
- `npm install`
- `npm run phase1:smoke`

Result:
```json
{
  "bestMove": "e5d4",
  "score": {
    "kind": "cp",
    "value": -28
  },
  "depth": 12,
  "pv": [
    "e5d4",
    "f3d4",
    "g8f6",
    "d4c6",
    "b7c6",
    "f1d3",
    "d7d5",
    "e4d5",
    "c8g4"
  ]
}
```

Conclusion:
- Phase 1 smoke verification is now passing with configured `STOCKFISH_PATH`.
- The original `ENOENT` blocker is resolved.
