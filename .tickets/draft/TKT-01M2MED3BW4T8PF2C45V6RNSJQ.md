---
schema: 3
id: TKT-01M2MED3BW4T8PF2C45V6RNSJQ
title: Settle uncommitted canvas writes before writer roles
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - auth
  - multiuser
assignees: []
milestone: null
parent: TKT-01M2MEAP8ED8NZYGJKN2002G6J
origin: null
dependencies:
  - TKT-01M2MEBNKV23GT9ATQ4PGZQSMB
blocks_on: none
references:
  - ref: doc:multiuser
    path: docs/multiuser-design-v1.md
claim: null
archive: null
created_at: 2026-09-16T06:27:56Z
updated_at: 2026-09-16T06:28:14Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

Multiuser mode ships read-only, and this is the ticket that says why and what would change it. It is deliberately not a dependency of the other phases.

The canvas writes ticket changes and never commits them. There is no git invocation in the write path. One person leaving uncommitted changes in a working tree is awkward and recoverable. Several people doing it concurrently, into a tree that agents are also using, produces a state where the next `git commit` sweeps up several people's edits under one name and no record says whose they were. A per-request actor labels the ticket store's own field correctly and cannot label a commit.

Options to weigh, none of them obviously right: the canvas commits each write itself; the canvas commits on a timer or on idle; the served canvas requires a store whose working tree nothing else uses; or writer roles stay off for served canvases and writing remains a desk-tool capability.

A cost worth knowing before planning the work. The actor is resolved once when a store opens and lives on the `*Server` (`internal/api/registry.go:291`), and it is part of the cached board response: `conditional_test.go` lists `actor` among the changes that invalidate a snapshot. Making the actor per-request means either the snapshot cache stops being shared between users, or the actor comes out of the board payload. Neither is hard; both are larger than they look.

See `docs/multiuser-design-v1.md`.

## Acceptance criteria

- [ ] The options are weighed in the ticket and one is chosen, with the rejected ones and their reasons recorded
- [ ] The per-request actor question is settled, including what happens to the snapshot cache
- [ ] Writer roles are either enabled under the chosen model or explicitly deferred with a reason
