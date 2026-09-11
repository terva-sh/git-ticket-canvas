---
schema: 3
id: TKT-01M245JGN1A77WJASYMPSF19CM
title: Push store invalidations through a watcher and SSE
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - performance
  - live-updates
assignees: []
milestone: null
parent: null
origin: null
dependencies:
  - TKT-01M245HJ7GBGQ8G8JGGY5RW2DY
blocks_on: none
references:
  - ref: design:live-updates
    path: docs/live-updates-design.md
  - ref: code:api
    path: internal/api/server.go
  - ref: code:layout-store
    path: internal/layout/layout.go
  - ref: code:ticket-store
    path: web/src/platform/tickets/store.ts
  - ref: code:app
    path: web/src/ui/App.tsx
  - ref: doc:gesture-ownership
    path: docs/preact-canvas.md
  - ref: design:canvas-organization
    path: docs/canvas-organization-design.md
  - ref: evidence:conditional-board-reads
    path: docs/conditional-board-reads.md
  - ref: evidence:refresh-normal
    path: docs/refresh-measurements-updated/refresh-normal.json
  - ref: evidence:refresh-heavy
    path: docs/refresh-measurements-updated/refresh-body-heavy.json
  - ref: evidence:server-benchmark
    path: docs/refresh-measurements-updated/server-benchmark.txt
  - ref: evidence:live-update-implementation
    path: docs/live-update-implementation.md
  - ref: doc:live-update-harness
    path: docs/live-update-browser-harness.md
  - ref: code:live-coordinator
    path: internal/api/live.go
  - ref: code:live-client
    path: web/src/platform/tickets/live.ts
claim: null
archive: null
created_at: 2026-09-09T22:45:46Z
updated_at: 2026-09-10T01:02:30Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Implement step 2 of docs/live-updates-design.md after TKT-01M245HJ7GBGQ8G8JGGY5RW2DY (Add conditional board reads and stable client snapshots). Detect filesystem and API changes, reconcile shared authoritative snapshots, and send small SSE invalidations that trigger conditional reads. Keep mutations on existing HTTP endpoints.

### Promotion gate
Do not promote solely because the dependency is done. Attach baseline and step-1 measurements showing the remaining external-update latency or repeated server-work problem. Record a user-approved success target and deployment/recovery scope before introducing the long-lived protocol. Until then this ticket remains draft.

### Scope
Directory watching with bounded burst coalescing, rescan/recovery, shared validated generations, server-instance epochs, small scoped notifications, heartbeat/reconnect handling, bounded slow subscribers, and conditional polling fallback. Filesystem events are hints, not transactions. Preserve the last valid state and visible stale/error feedback during malformed or incomplete writes. Schedule time-derived changes without relying on filesystem events.

### Boundaries
No streamed full ticket bodies, field patches, durable event database, or delta protocol. Do not add dependencies to frames or pens. Write the implementation plan after promotion, claim, and code inspection.

## Acceptance criteria

- [x] The promotion record includes step-1 measurements, the demonstrated remaining problem, and a user-approved latency/server-work target plus streaming deployment/recovery scope.
- [x] Directory watching covers ticket creation, atomic saves, status moves, deletion, new directories, configuration, and board layouts; bounded coalescing handles bursts without indefinite starvation.
- [x] Filesystem hints and API writes converge through validated shared snapshots; duplicate hints do not publish duplicate generations, and multiple tabs do not each force a full store rebuild.
- [x] Overflow, uncertain events, lost watches, startup, and periodic safety reconciliation rescan authoritative state; malformed/incomplete reads preserve the last valid snapshot with visible stale/error feedback, and recovery publishes current data.
- [x] Readiness, short IDs, claim expiry, configuration, and layout changes invalidate observable snapshots even when an affected ticket file is unchanged; clock-driven expiry is not dependent on watcher activity.
- [x] SSE sends small generation/scope invalidations rather than full bodies; server epochs and initial-subscription reconciliation prevent missed initial changes or restart cursor collisions, and reconnect/gaps recover through authoritative reads.
- [x] Heartbeats, flushing, proxy buffering/timeouts, origin/access restrictions, resource bounds, slow-subscriber resynchronization, disconnect cleanup, and shutdown behavior are implemented and documented.
- [x] Connected clients use coalesced conditional reads instead of frequent polling; visibility recovery, slower safety checks, and degraded conditional-polling fallback with bounded retry/backoff keep state recoverable.
- [x] Notifications and responses preserve board/mutation ordering, inspector drafts, manual-save previews, and frozen gestures; local mutation echoes converge without duplicate publication or automatic movement.
- [x] Go, store, and browser tests cover watcher races, burst/rescan recovery, initial subscription, reconnect/restart, slow clients, multiple tabs, read-only mode, board switches, and drag-time updates; measurements demonstrate the approved target without weakening pointer-motion checks.

## Definition of done

- [x] Document event/recovery contracts, chosen timing values, deployment requirements, and before/after measurements.
- [x] Run just check and embedded browser checks; regenerate committed frontend assets through the existing build process.

## Implementation plan

Introduce a server-owned live coordinator with immutable validated snapshots, fsnotify directory hints, bounded burst settling, API-write invalidation, claim-expiry scheduling, and 60-second safety reconciliation. Read and validate the complete authoritative state before publication; keep last valid data with stale/degraded metadata on failure. Board reads serialize/cache representations from shared snapshots instead of opening and listing the store per tab. Preserve existing HTTP mutations and request-local configuration. Give the coordinator an explicit lifecycle tied to application shutdown.

Use GET /api/events for same-origin SSE invalidations. Each ordinary message is JSON {epoch,generation,scopes,stale,degraded}, with a random server epoch, monotonically increasing generation, and scopes tickets/config/boards/layout:<name>. Send current state on subscription to close initial-read races; headers X-Canvas-Epoch, X-Canvas-Generation, X-Canvas-Stale, and X-Canvas-Degraded accompany board reads including 304. SSE has 15-second heartbeats, bounded subscribers and queues, write deadlines, reconnect reconciliation, and disconnect/shutdown cleanup. No ticket bodies or durable replay stream.

Add a Preact-free client live-update controller that coalesces notifications into serialized conditional refreshes, revalidates on initial subscription/reconnect and visibility, uses 60-second connected safety reads, and falls back to 12-second polling with bounded reconnect backoff. Preserve existing store epoch/generation guards and defer gesture-time publication; keep pending invalidations across writes and expose persistent stale/degraded feedback without modifying inspector drafts.

Test coordinator settling/deduplication, all file/layout/config and time-derived invalidations, malformed-state recovery, watcher loss/overflow, initial/reconnect/restart races, resource bounds, read-only use, multiple tabs, board switches, and gesture-time responses. Measure at least 30 external edits on each normal/body-heavy 120-card fixture with two tabs, p95 <=2 seconds, burst convergence <=3 seconds, and no tab-read-triggered rebuilds in a 25-second idle window. Measure fallback <=15 seconds and silent-event recovery <=65 seconds. Count safety scans separately. Record a new implementation/evidence document with Linux/WSL2 direct-local support and unverified reverse-proxy requirements. Rebuild dist and run just check, strict browser TypeScript, embedded browsers, and unchanged pointer-motion checks.

## Notes

**agent:terva/mieli** at 2026-09-09T23:58:41Z

### User-approved promotion targets
The user selected this draft for the next workstream and approved these targets in the continuation discussion on 2026-09-09. This records the promotion gate, not an implementation plan or completed implementation.

Remaining problem: docs/conditional-board-reads.md and its linked baseline/current artifacts show external changes taking nearly 12 seconds to appear. Conditional reads still construct the complete server response. The server benchmark shows no compute saving. Step 1 is committed at 548f346; this continuation reran just check, 66 embedded browser runs, and strict browser TypeScript successfully.

Measure normal and body-heavy 120-card fixtures with two tabs. Require p95 external-write-to-visible latency at most 2 seconds over at least 30 edits per fixture, burst convergence within 3 seconds of the final write, and zero full store rebuilds caused by idle tab reads during a 25-second window. Count scheduled safety scans separately. Preserve existing pointer-motion checks.

Verify direct local use on Linux/WSL2 with local filesystems. Document reverse-proxy buffering and timeout requirements, but do not claim tested proxy support. Preserve existing origin/access restrictions.

Use 12-second conditional-polling fallback, 60-second safety reconciliation, and 15-second stream heartbeats. Test convergence within 15 seconds in fallback and within 65 seconds after a silently missed filesystem event. Preserve the last valid snapshot during malformed writes and show stale/degraded state. Cover restart, reconnect, overflow/rescan, slow subscribers, and gesture/draft preservation.

The ticket remains draft while this target-definition step concludes. No protocol implementation or shipped design/evidence document was changed.

**agent:terva/mieli** at 2026-09-10T00:01:38Z

draft to ready: User explicitly approved promotion and implementation against the recorded latency, server-work, deployment, and recovery targets.

**agent:terva/mieli** at 2026-09-10T00:14:34Z

User requested a fresh-session handoff during implementation. Main checkout has uncommitted client controller/metadata/App integration and tests; npm run build and all 120 frontend tests pass. Existing embedded browser suite passes 33 cases with two opt-in skips against the OLD server, so this is fallback compatibility evidence only, not integrated SSE acceptance. No live-update latency measurements have run and no acceptance criteria were checked.

Go coordinator worker implement-go-server-port-407850 remains active in its separate worktree, with implementation present and existing Go tests passing per its transcript; new recovery/transport tests are still in progress. Browser worker own-independent-browser-389905 finished four new harness/doc files in its separate worktree; strict TypeScript and discovery passed, integrated execution did not run. Neither worker's content has been applied to main. Preserve their worktrees and inspect their final reports before integration. Ignore the runtime's aggregate in-flight count, which includes older work.

Resume from /home/sothr/.local/state/terva/handoffs/2026-09-09-git-ticket-canvas-sse-in-progress.md. Ticket stays in-progress; parent claim is released for the next session. No commit or push was made. Do not touch the user's untracked .tickets/canvas/.

Provenance: session 20260909-235236-f4a0fe8f, terva 0.134.5-0.20260908184005-01e3a6719b46, commit 01e3a67, built 2026-09-08T18:49:46Z; index 0.8.2, obsidian 0.2.0, web 0.3.1.

**agent:terva/mieli** at 2026-09-10T00:17:13Z

in-progress to ready: User-requested handoff of partial implementation. Parent claim released; return to ready to avoid in_progress_unclaimed strict-check warning. Supersedes the handoff note's statement that status stays in-progress. Worker files and review steps are recorded in the handoff; next session should claim and resume.

**agent:terva/mieli** at 2026-09-10T00:49:34Z

Integrated both worker deliverables into main byte-identical: Go coordinator/SSE (internal/api/live.go, snapshot.go, events.go, live_test.go, plus server.go/main.go/go.mod/go.sum and test updates) and the browser harness (tests/browser/live-update-*.ts, docs/live-update-browser-harness.md). On integrated main: go test -race ./... -count=3 passes, npm run test:unit 120/120 passes.

Resolved the two old refresh-test assumptions the browser worker flagged: the two-tab refresh regression now blocks /api/events in both tabs so it keeps verifying fallback-mode independent snapshots, and the held-drag refresh regression installs its interception before the mutation so SSE cannot win the race.

One worker test was broken by construction. The reconnect regression used page.context().setOffline() to disconnect an established stream, but an instrumented run proved Chromium's offline emulation never errors an established EventSource: the stream stays open and the held event arrives after going online, so no reconnect ever occurs and the test cannot pass. Rewrote it around a real server restart on the same port (tests/browser/fixtures.ts gained app.restart(whileDown)), which kills the socket, changes the epoch, and genuinely misses an edit while down. The test now asserts reconnection within 15s, epoch change, convergence to the missed edit, and a subsequent event-driven edit within 3s. It passes in 2.5s. This supersedes the harness doc's description of the reconnect case's offline mechanism; the doc file is kept as delivered.

All 8 live-update regressions, the pointer-motion guard, and all 4 refresh regressions pass against the integrated server. Measurements not yet run.

## Summary

Implemented end to end and verified. The server owns a live coordinator (internal/api/live.go, snapshot.go, events.go): fsnotify directory watching with bounded settling, validated immutable snapshots, synchronous API-write reconciliation, claim-expiry scheduling, 60-second safety reconciliation, and GET /api/events streaming {epoch, generation, scopes, stale, degraded} invalidations with health/diagnostic headers on all board reads. The client controller (web/src/platform/tickets/live.ts, sync.ts) coalesces notifications into serialized conditional reads, falls back to 12-second polling, keeps a 60-second healthy safety read, and surfaces stale/degraded/connection feedback in App.

Both swarm worker deliverables were reviewed and integrated byte-identical; the reconnect browser regression was rewritten around a real server restart after proving Chromium offline emulation cannot disconnect an EventSource, and rebuild-counter assertions now attribute safety-scan rebuilds (details in the 2026-09-10 note).

Evidence: docs/live-update-implementation.md plus JSON artifacts in docs/live-update-measurements{,-embedded}/. Measured p95 external-write-to-visible 183-287 ms against the approved 2-second target (baseline ~12 s), burst convergence 169-269 ms against 3 s, zero idle tab reads and zero non-safety rebuilds over 25 s, pointer guard unchanged at p95 33.5 ms. go test -race -count=3, 120 unit tests, just check, and 82 embedded browser passes over two repeats are green. All work is uncommitted in the main checkout per the session's no-commit instruction; proxy deployment remains documented but untested.
