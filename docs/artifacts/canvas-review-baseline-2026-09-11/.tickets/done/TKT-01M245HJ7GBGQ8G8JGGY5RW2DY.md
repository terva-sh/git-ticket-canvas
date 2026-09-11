---
schema: 3
id: TKT-01M245HJ7GBGQ8G8JGGY5RW2DY
title: Add conditional board reads and stable client snapshots
type: task
status: done
status_reason: All seven acceptance criteria and both definition-of-done items verified. Tests, measurements, review fix, generated assets, and remaining SSE evidence recorded in docs/conditional-board-reads.md.
priority: normal
due_on: null
labels:
  - performance
  - live-updates
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references:
  - ref: design:live-updates
    path: docs/live-updates-design.md
  - ref: code:board-api
    path: internal/api/server.go
  - ref: code:ticket-dto
    path: internal/api/dto.go
  - ref: code:ticket-client
    path: web/src/platform/tickets/client.ts
  - ref: code:ticket-store
    path: web/src/platform/tickets/store.ts
  - ref: code:app
    path: web/src/ui/App.tsx
  - ref: test:canvas-responsiveness
    path: tests/browser/canvas-performance.spec.ts
  - ref: doc:conditional-board-reads
    path: docs/conditional-board-reads.md
  - ref: doc:refresh-baseline
    path: docs/refresh-measurements.md
  - ref: evidence:refresh-normal
    path: docs/refresh-measurements-updated/refresh-normal.json
  - ref: evidence:refresh-heavy
    path: docs/refresh-measurements-updated/refresh-body-heavy.json
  - ref: evidence:refresh-embedded-normal
    path: docs/refresh-measurements-updated/embedded/refresh-normal.json
  - ref: evidence:refresh-embedded-heavy
    path: docs/refresh-measurements-updated/embedded/refresh-body-heavy.json
  - ref: evidence:server-benchmark
    path: docs/refresh-measurements-updated/server-benchmark.txt
  - ref: code:snapshot-reconciliation
    path: web/src/platform/tickets/reconcile.ts
  - ref: test:conditional-api
    path: internal/api/conditional_test.go
  - ref: test:board-benchmark
    path: internal/api/board_bench_test.go
  - ref: test:refresh-browser
    path: tests/browser/refresh-regressions.spec.ts
  - ref: test:refresh-measurements
    path: tests/browser/refresh-measurements.spec.ts
  - ref: test:app-refresh
    path: web/src/ui/App.test.tsx
claim: null
archive: null
created_at: 2026-09-09T22:45:15Z
updated_at: 2026-09-09T23:38:28Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Implement step 1 of docs/live-updates-design.md. Current 12-second polling sends full board bodies and replaces every ticket object even on unchanged reads. Reduce no-op transfer and publication before adding a watcher or protocol.

### Scope
Add board-scoped ETag/If-None-Match handling and an explicit 304 client result. Reconcile changed responses while preserving observably unchanged object and collection identities. Validators and equivalence checks must cover derived readiness, short IDs, claim expiry, layout, board list, and configuration, not just ticket file revisions. Preserve full-snapshot recovery and current mutation/gesture guards.

### Evidence for later promotion
Collect baseline and before/after results on the 120-card fixture and a documented body-heavy variant: idle requests/bytes, edit and burst bytes, server work, render/placement counts, and external-change latency. Distinguish wire bytes from payload bytes and renders from DOM changes. Computing the whole response before returning 304 does not establish a server-work saving. This evidence gates the separate SSE ticket.

### Boundaries
No watcher, SSE, delta protocol, or summary/detail split in this ticket. It does not depend on frames or pens. File an implementation plan only after promotion, claim, and inspection.

## Acceptance criteria

- [x] Board GET responses expose a deterministic representation validator; matching If-None-Match returns 304 without a body, while missing/nonmatching validators return a complete usable snapshot.
- [x] The client handles 304 without JSON parsing or error feedback, scopes cached snapshots/validators to the board, and recovers with a full read when the matching cache is unavailable or invalidated by local state changes.
- [x] Validators and equivalence checks include all observable state: ticket bodies, derived readiness, short IDs, claim expiry, layout, board list, configuration, and response metadata; private board data is not shared-cacheable.
- [x] A 304 or equivalent unchanged 200 preserves state/collection identities and causes no publication, card/inspector rerender, or placement calculation; changed responses retain observably unchanged ticket and layout-entry identities.
- [x] Read/write epochs, board-generation guards, pending manual-save previews, stale-revision behavior, inspector drafts, and read-only behavior remain correct through conditional reads and board switches.
- [x] Reproducible baseline and before/after measurements record fixture sizes, commands, fixed observation intervals, request/payload/wire bytes, server work, refresh renders/placement counts, and update latency without claiming unmeasured savings.
- [x] Go/API, store, component, and browser tests cover conditional reads, derived-only changes, time-dependent expiry, board/cache recovery, and stale responses while preserving the existing 120-card pointer-motion guard.

## Definition of done

- [x] Record measurement artifacts and remaining latency/server-work findings for the SSE promotion decision.
- [x] Run just check and embedded browser checks; regenerate committed frontend assets through the existing build process.

## Implementation plan

Build one deterministic complete board representation with a single claim-evaluation time, hash its bytes for an ETag, and support weak/list/wildcard If-None-Match comparisons with private revalidation headers. Keep the existing full store work and report that limitation. Add an explicit modified/not-modified board-read result using fetch cache:no-store so browser caching cannot conceal 304 from the application. Hold a validator only for the current accepted board snapshot; clear it on board changes and on both sides of all mutations, and update it only after existing read/write/generation guards pass. Reconcile full responses by observable deep equality, retaining ticket/layout entry and collection identity and returning false for true no-ops. Handle deferred UI publication independently from whether a second fetch was unchanged, preserving the existing drag race guarantees. Add server/client/store/browser regressions for derived-only state, claim expiry, recovery, drafts, board switches and writes. Collect comparable baseline/current browser measurements on 120-card normal/body-heavy fixtures and server benchmark results, with honest payload/wire and rendering distinctions. Run just check and embedded browser tests, regenerate dist, and record a new implementation/evidence document without rewriting the shipped designs.

## Notes

**agent:terva/mieli** at 2026-09-09T22:51:13Z

draft to ready: User requested pickup of this draft ticket.

**agent:terva/mieli** at 2026-09-09T23:38:08Z

in-progress to done: All seven acceptance criteria and both definition-of-done items verified. Tests, measurements, review fix, generated assets, and remaining SSE evidence recorded in docs/conditional-board-reads.md.

## Summary

Implemented full-representation SHA-256 ETags, private conditional board reads, cacheless-304 recovery, board/mutation-scoped validators, and observable-value reconciliation that preserves unchanged object and collection identities. App publishes deferred accepted state even after a follow-up 304. All API handlers now use current configuration and one request clock, fixing the review finding about board/schema/write disagreement. On 120-card fixtures, two idle polls drop from 175,734 normal or 4,234,462 body-heavy HTTP response bytes to 348, with zero payload, card/inspector renders, or placement work. Single edits render one card instead of 120; bursts render only changed cards. Poll latency remains near 12 seconds and server reads still construct full responses; no compute savings claimed. just check passes 99 frontend tests, 64 tooling checks, Go race tests/vet/format/store checks. Embedded browser suite passes 66 runs; four opt-in measurement cases passed separately. Dist regenerated. docs/conditional-board-reads.md and raw artifacts record reproduction and remaining SSE evidence; later tickets remain draft.
