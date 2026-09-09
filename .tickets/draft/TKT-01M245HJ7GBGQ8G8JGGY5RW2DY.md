---
schema: 3
id: TKT-01M245HJ7GBGQ8G8JGGY5RW2DY
title: Add conditional board reads and stable client snapshots
type: task
status: draft
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
claim: null
archive: null
created_at: 2026-09-09T22:45:15Z
updated_at: 2026-09-09T22:45:15Z
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

- [ ] Board GET responses expose a deterministic representation validator; matching If-None-Match returns 304 without a body, while missing/nonmatching validators return a complete usable snapshot.
- [ ] The client handles 304 without JSON parsing or error feedback, scopes cached snapshots/validators to the board, and recovers with a full read when the matching cache is unavailable or invalidated by local state changes.
- [ ] Validators and equivalence checks include all observable state: ticket bodies, derived readiness, short IDs, claim expiry, layout, board list, configuration, and response metadata; private board data is not shared-cacheable.
- [ ] A 304 or equivalent unchanged 200 preserves state/collection identities and causes no publication, card/inspector rerender, or placement calculation; changed responses retain observably unchanged ticket and layout-entry identities.
- [ ] Read/write epochs, board-generation guards, pending manual-save previews, stale-revision behavior, inspector drafts, and read-only behavior remain correct through conditional reads and board switches.
- [ ] Reproducible baseline and before/after measurements record fixture sizes, commands, fixed observation intervals, request/payload/wire bytes, server work, refresh renders/placement counts, and update latency without claiming unmeasured savings.
- [ ] Go/API, store, component, and browser tests cover conditional reads, derived-only changes, time-dependent expiry, board/cache recovery, and stale responses while preserving the existing 120-card pointer-motion guard.

## Definition of done

- [ ] Record measurement artifacts and remaining latency/server-work findings for the SSE promotion decision.
- [ ] Run just check and embedded browser checks; regenerate committed frontend assets through the existing build process.
