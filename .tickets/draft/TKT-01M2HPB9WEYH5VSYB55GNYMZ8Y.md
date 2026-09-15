---
schema: 3
id: TKT-01M2HPB9WEYH5VSYB55GNYMZ8Y
title: Serve many ticket stores from one canvas
type: epic
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - idea
  - canvas
  - config
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: children
references:
  - ref: design:multi-store-v1
    path: docs/multi-store-design-v1.md
claim: null
archive: null
created_at: 2026-09-15T04:49:03Z
updated_at: 2026-09-15T04:49:34Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

`git-ticket-canvas` serves one store. You pass `--store`, the process discovers
one `.tickets` directory, and everything below that assumes there is exactly
one: one actor, one read-only setting, one file watcher, one set of routes.

Anybody who keeps work in more than one repository runs more than one copy on
more than one port. This epic serves a list of stores from one process, and
makes a tree of them browsable, so planning across repositories is one page
instead of several.

The stores stay independent. No ticket references a ticket in another store, no
board spans two stores, and a store is still what it was. The canvas holds
several at once and switches between them.

The design, the decisions taken, and the alternatives rejected are in
docs/multi-store-design-v1.md. Read it before starting any child. Three facts
in it were measured rather than assumed, and each is recorded with the command
that reproduces it: the default depth of 4, the inotify instance budget that
forces lazy activation, and the verification that a `canvas:` key in
`.tickets/config.yml` survives `git ticket check --strict` and every write.

### Scope boundary

One store is visible on the canvas at a time. Rendering tickets from several
stores together was considered and rejected for this version, because it needs
namespaced ticket IDs, a decision about where a layout spanning two stores is
persisted, and a per-card origin badge. None of that is needed to stop running
several processes. The store key is in the URL path, so an aggregate view
remains possible later without changing the wire format.

## Acceptance criteria

- [ ] A single configured store behaves exactly as it does today, including the flat /api routes.
- [ ] Several stores are servable from one process, switchable in the UI, and independent of each other.
- [ ] A tree of stores is discoverable by walking a root, and the result is explainable per candidate.
- [ ] A store that cannot be opened is reported as unavailable without stopping the others.

## Definition of done

- [ ] docs/multi-store-design-v1.md matches what shipped, including any decision changed during implementation.
- [ ] just check passes, and the embedded browser checks cover switching stores.
