---
schema: 3
id: TKT-01M2HPBA1C56KDB835JV0FYQSJ
title: Resolve actor and read-only per store, and isolate failures
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - api
  - config
assignees: []
milestone: null
parent: TKT-01M2HPB9WEYH5VSYB55GNYMZ8Y
origin: null
dependencies:
  - TKT-01M2HPB9ZNGE7YGDZ6RZHB4PFJ
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-15T04:49:03Z
updated_at: 2026-09-15T04:49:03Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

Resolve the actor and the read-only setting per store, and contain a failure to
the store that caused it.

`resolveActor` currently runs once in `main.go` against the single store. Each
store has its own `config.yml` with its own actors, so it has to run per store.
A per-store entry in the canvas configuration wins, and a global `--actor` is
the fallback for stores that need one.

The effective read-only setting is the global flag, or the per-store setting,
or the absence of any resolvable actor, whichever applies.

### The behavior that changes

Today a store that declares no actor stops the process from starting. That is
right for one store and wrong for a list: one stale entry would take down the
whole page. Such a store opens read-only instead, with the reason recorded and
served, and every other store carries on.

The same holds for a path that is missing and a store that will not parse.
Report `unavailable` with a reason rather than failing to start.

## Acceptance criteria

- [ ] Each store resolves its actor from its own config.yml; a per-store configured actor wins over the global --actor.
- [ ] A store with no resolvable actor opens read-only with that reason, instead of stopping startup.
- [ ] A missing or unparseable store is reported unavailable with a reason while the others serve.
- [ ] Requests to an unavailable store return 503 store_unavailable carrying the reason.
- [ ] Read-only can differ per store, and the board response reports the effective value.

## Definition of done

- [ ] A test starts a server with one good and one broken store and reads the good one.
