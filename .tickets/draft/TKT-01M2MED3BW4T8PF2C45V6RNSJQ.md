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
updated_at: 2026-09-16T15:36:48Z
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

## Notes

**agent:claude/t3code** at 2026-09-16T15:36:48Z

**Writes were switched on for the brokkr ledger deployment on 2026-09-16, on the maintainer's decision, to dogfood the tooling. This ticket is not settled by that and should not be closed by it.**

What was done: `-read-only=false` on `git-ticket-canvas.service`, serving `/home/sothr/workspace/ledger` at `https://ledger.brokkr.local.sothr.com`. Note that deleting the flag would have changed nothing; the served command defaults it to true.

What that turned on, verified in the tree at `41ecbe6` rather than assumed:

**Nothing authorizes a write per caller.** `api.Access` answers `Caller` and `CanRead` and has no `CanWrite`. The only write gate in the process is the `readOnly` boolean on the server. So anybody who can read a store can now edit it, and the `writer` role still grants nothing, because nothing asks. The grant vocabulary and the write path are not connected at either end.

**Every write is stamped with the store's own actor.** It is resolved once when the store opens and lives on the `*Server` (`actor: s.actor`), so it is `human:sothr` for this deployment regardless of who is signed in. The per-person binding that `TKT-01M2MECN07` built is written to `actors.json` and never consulted on a write. Today that is harmless because one person uses this canvas and the store's actor is that person. The day a second person writes, both sets of edits are recorded as the first, and nothing in the store will say otherwise.

**The canvas still never commits.** Edits accumulate as uncommitted changes in `/home/sothr/workspace/ledger`, which `git worktree list` shows is the main tree of a repository with two live agent worktrees. This is the live risk and it is not hypothetical: an agent running `git commit` in that tree sweeps up whatever the canvas has written, under its own message and actor.

So of this ticket's four options, what is deployed is closest to "the canvas commits nothing and somebody watches", which was not on the list because it is not a design. The option this makes most attractive is the third — a served canvas pointed at a working tree nothing else uses — because it is available today, costs one `git worktree add`, and removes the only risk of the three that can destroy work rather than merely mislabel it.

The acceptance criteria are untouched. Nothing here weighs the options, and the per-request actor question is not settled: the cost recorded in the description still stands, that the actor is part of the cached board response and making it per-request means either unsharing the snapshot cache or taking the actor out of the payload.
