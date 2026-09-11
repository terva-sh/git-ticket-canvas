---
schema: 3
id: TKT-01M245KD7WVBWTWMB86C8CE6CH
title: Reduce changed-board payloads after live-update measurements
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
  - TKT-01M245JGN1A77WJASYMPSF19CM
blocks_on: none
references:
  - ref: design:live-updates
    path: docs/live-updates-design.md
  - ref: code:api
    path: internal/api/server.go
  - ref: code:ticket-dto
    path: internal/api/dto.go
  - ref: code:ticket-types
    path: web/src/platform/tickets/types.ts
  - ref: code:ticket-client
    path: web/src/platform/tickets/client.ts
  - ref: code:ticket-store
    path: web/src/platform/tickets/store.ts
  - ref: code:inspector
    path: web/src/ui/Inspector.tsx
  - ref: code:card-view
    path: web/src/ui/canvas/CardView.tsx
claim: null
archive: null
created_at: 2026-09-09T22:46:15Z
updated_at: 2026-09-09T22:46:15Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Implement step 3 of docs/live-updates-design.md only if post-SSE measurements justify a smaller board representation. Depends on TKT-01M245JGN1A77WJASYMPSF19CM (Push store invalidations through a watcher and SSE).

### Promotion gate
Attach measurements after conditional reads and SSE showing a remaining changed-response bandwidth, parsing, or publication cost. Have the user choose generation-based deltas or board summaries with lazy ticket details, and approve a measurable success target and compatibility/recovery contract. Do not implement both by default. If measurements do not justify either, leave this draft or archive it with the finding.

### Candidate approaches
Generation deltas send complete changed records, deleted IDs, and changed board/configuration metadata, including derived-state changes. Bound retained history and fall back to a full snapshot for incompatible bases, expired cursors, restart, or gaps. Avoid field-level patches initially.

Summary/detail splitting keeps card information on the board and fetches inspector bodies on demand. Preserve description search, acceptance progress, readiness, labels, and relationships; define their data path before selecting this design. Revision-aware detail caches must handle deletion, selection/board races, and unsaved inspector text.

### Boundaries
Preserve authoritative full-state recovery, unchanged object identity, mutation ordering, manual placement, read-only behavior, and gesture deferral. No dependency on frames or pens. Write the implementation plan only after promotion, claim, and inspection.

## Acceptance criteria

- [ ] The promotion record contains post-SSE measurements, the remaining cost, a user-approved choice of deltas or summary/detail, and a measurable success target and compatibility/recovery contract.
- [ ] The selected representation reduces the documented cost on the baseline and body-heavy fixtures; reports distinguish payload/wire bytes, server work, parsing/publication work, and actual UI updates.
- [ ] The selected approach implements its approved consistency and recovery contract: deltas use atomic board/server-scoped generations, explicit deletions, bounded history, and full-snapshot fallback; summary/detail uses revision-aware detail caches with update/deletion invalidation and late-response protection. Only the chosen approach is required.
- [ ] The selected representation preserves description search, acceptance progress, card metadata, relationships, and inspector editing without losing drafts or supplying stale revisions to writes.
- [ ] Derived readiness, short IDs, claim expiry, layout, board list, and configuration changes remain correct even when ticket file revisions alone do not identify affected UI records.
- [ ] Stable unchanged identities, no-op publication suppression, stale-response guards, manual-save previews, read-only behavior, and drag-time deferral survive the new representation.
- [ ] Tests demonstrate delta/full-snapshot equivalence or summary/detail/search parity for the selected design, plus deletion, reconnect/resynchronization, stale caches, mutations, and board switches; existing 120-card responsiveness checks remain intact.

## Definition of done

- [ ] Document the approved representation, its consistency/recovery contract, and why the measured cost justified it.
- [ ] Record measured results against the approved target, run just check and embedded browser checks, and regenerate committed frontend assets through the existing build process.
