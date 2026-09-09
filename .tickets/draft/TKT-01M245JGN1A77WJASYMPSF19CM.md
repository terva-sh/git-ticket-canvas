---
schema: 3
id: TKT-01M245JGN1A77WJASYMPSF19CM
title: Push store invalidations through a watcher and SSE
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
claim: null
archive: null
created_at: 2026-09-09T22:45:46Z
updated_at: 2026-09-09T22:45:46Z
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

- [ ] The promotion record includes step-1 measurements, the demonstrated remaining problem, and a user-approved latency/server-work target plus streaming deployment/recovery scope.
- [ ] Directory watching covers ticket creation, atomic saves, status moves, deletion, new directories, configuration, and board layouts; bounded coalescing handles bursts without indefinite starvation.
- [ ] Filesystem hints and API writes converge through validated shared snapshots; duplicate hints do not publish duplicate generations, and multiple tabs do not each force a full store rebuild.
- [ ] Overflow, uncertain events, lost watches, startup, and periodic safety reconciliation rescan authoritative state; malformed/incomplete reads preserve the last valid snapshot with visible stale/error feedback, and recovery publishes current data.
- [ ] Readiness, short IDs, claim expiry, configuration, and layout changes invalidate observable snapshots even when an affected ticket file is unchanged; clock-driven expiry is not dependent on watcher activity.
- [ ] SSE sends small generation/scope invalidations rather than full bodies; server epochs and initial-subscription reconciliation prevent missed initial changes or restart cursor collisions, and reconnect/gaps recover through authoritative reads.
- [ ] Heartbeats, flushing, proxy buffering/timeouts, origin/access restrictions, resource bounds, slow-subscriber resynchronization, disconnect cleanup, and shutdown behavior are implemented and documented.
- [ ] Connected clients use coalesced conditional reads instead of frequent polling; visibility recovery, slower safety checks, and degraded conditional-polling fallback with bounded retry/backoff keep state recoverable.
- [ ] Notifications and responses preserve board/mutation ordering, inspector drafts, manual-save previews, and frozen gestures; local mutation echoes converge without duplicate publication or automatic movement.
- [ ] Go, store, and browser tests cover watcher races, burst/rescan recovery, initial subscription, reconnect/restart, slow clients, multiple tabs, read-only mode, board switches, and drag-time updates; measurements demonstrate the approved target without weakening pointer-motion checks.

## Definition of done

- [ ] Document event/recovery contracts, chosen timing values, deployment requirements, and before/after measurements.
- [ ] Run just check and embedded browser checks; regenerate committed frontend assets through the existing build process.
