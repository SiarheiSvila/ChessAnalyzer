# MVP Release Checklist

Date: 2026-03-15

## 1) Build & Quality Gates
- [x] TypeScript compile passes (`npm run typecheck`)
- [x] Full automated test suite passes (`npm test`)
- [x] Unit tests cover parsing, scoring, critical moments, cache behavior, UI helpers
- [x] Integration tests cover analysis pipeline, API lifecycle, UI serving, performance, soak

## 2) Phase Completion Verification
- [x] Phase 1: UCI engine bridge stable
- [x] Phase 2: PGN parse + replay + raw move analysis
- [x] Phase 3: CPL, labels, critical moments, summary
- [x] Phase 4: API + job orchestration endpoints
- [x] Phase 5: Frontend analysis UI (input, board, moves, eval chart, details)
- [x] Phase 6: Hardening (two-pass deep analysis, cache, concurrency limit, performance/soak)

## 3) Runtime Smoke Checks
- [x] Server starts (`npm run phase4:server`)
- [x] Health endpoint responds (`GET /health`)
- [x] Static UI page loads (`GET /`)
- [x] Synchronous analysis returns full result payload (`POST /api/analyze` with `synchronous: true`)
- [x] Asynchronous flow works (`POST /api/analyze` + `GET /status` + `GET /result`)

## 4) MVP Functional Criteria
- [x] PGN can be submitted and analyzed end-to-end
- [x] Every move includes best move, eval, CPL, label
- [x] Summary includes both sides’ accuracy and count breakdown
- [x] UI supports move stepping and eval display at every step
- [x] Eval graph renders move-by-move evaluation trend

## 5) Performance & Reliability Criteria
- [x] Two-pass deep reanalysis enabled for critical/high-CPL plies
- [x] Position evaluation cache enabled and measurable (hits/misses)
- [x] Job concurrency limiting enabled
- [x] Benchmark integration test under budget (40-ply fixture)
- [x] Sequential soak integration test passes

## 6) Release Blockers
- [ ] Add deployment config (process manager/container) for target environment
- [ ] Configure production logging/monitoring destination
- [ ] Add persistent storage for job history (optional for MVP, required for multi-instance)
- [ ] Add cancellation endpoint/state transition for long-running jobs (recommended)

## 7) Security & Ops Checklist (MVP minimum)
- [x] Input validation for API request payloads
- [x] Error payloads are structured
- [ ] Add API rate limiting before public exposure
- [ ] Add request size and timeout policies at reverse-proxy level
- [ ] Confirm `.env` handling and secret management strategy in deployment platform

## 8) Release Decision
- **Readiness:** READY for controlled MVP release (single-instance deployment)
- **Conditions:** complete items in sections 6-7 for broader/public rollout
