---
schema: 3
id: TKT-01M2HPBAE9GCFJX2RTRS0X26PW
title: Store favorites outside the repository, keyed by path
type: task
status: done
status_reason: Favorites and the last store used survive a restart, are keyed by resolved path, and warm the registry at startup.
priority: normal
due_on: null
labels:
  - ui
  - config
assignees: []
milestone: null
parent: TKT-01M2HPB9WEYH5VSYB55GNYMZ8Y
origin: null
dependencies:
  - TKT-01M2HPBAB0C66Q3X3B1M27PS96
blocks_on: none
references: []
claim:
  actor: agent:t3code/d30689a3
  branch: t3code/orient-upstream-review-tickets
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-d30689a3
  commit: 63bcec5ba05b7c6b7750c0155727c9be4e0d8c28
  session: null
  claimed_at: 2026-09-15T06:27:12Z
  expires_at: null
archive: null
created_at: 2026-09-15T04:49:03Z
updated_at: 2026-09-15T06:32:33Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

Remember which stores matter and which one was open last.

Favorites live in a state file outside every repository, alongside the record
of the last store used. Do not write them into the canvas configuration file:
that file is written by hand, and a tool that rewrites it loses the comments
and the formatting.

Key both by absolute path, never by id. Changing `--root` changes every derived
id at once, and a favorite keyed by id would be lost.

Favorites are what TKT-01M2HPBAB (Open discovered stores lazily and evict idle
ones)
warms at startup, so this ticket supplies the list that one reads.

## Acceptance criteria

- [x] A favorite survives a restart and is stored outside every repository.
- [x] Favorites and the last store used are keyed by absolute path, and survive a --root change that alters derived ids.
- [x] PUT /api/favorites sets and clears a favorite.
- [x] No canvas configuration file is rewritten by the tool.

## Definition of done

- [x] go test ./... passes.

## Implementation plan

### Where the file goes, and why not the configuration

`internal/state` holds a small file at
`${XDG_STATE_HOME:-~/.local/state}/git-ticket-canvas/state.json`. State, not
configuration: the configuration file is written by hand and a tool that
rewrites it loses the comments and the ordering somebody put there. Nothing in
this ticket writes a configuration file, and a test asserts that by checking the
bytes of one are unchanged after a favorite is set.

Outside every repository, because a favorite is a fact about the person using
the canvas rather than about the project, and writing it into `.tickets` would
put one person's preferences into everybody's repository.

### Keyed by path

Both the favorites and the last store used are keyed by `discover.Key`, the
resolved store path, which is already what the merge treats as identity. An id
is derived from a path relative to a root, so changing `--root` renames every
store at once, and a favorite keyed by id would be lost by a flag that was meant
to change nothing about which stores exist.

The file holds paths. A response holds ids, because that is what a URL needs,
and the registry maps between them.

### Writing

`Save` writes to a temporary file in the same directory and renames it over the
target, so an interrupted write leaves the previous state rather than half of
the next one. A missing file is not an error: it is somebody's first run and it
reads as empty. A malformed file is a warning and also reads as empty, because
losing a canvas over a corrupted list of favorites is the wrong trade.

### The routes

`GET /api/favorites` returns the favorite paths and the last store used.
`PUT /api/favorites` takes `{"store": "<id>", "favorite": true}` and sets or
clears one, answering with the new list. The registry resolves the id to a path,
so the browser never has to know where a store is on disk.

The last store used is recorded by the registry when a request reaches a store
that is not the one already recorded, so it costs one write per switch rather
than one per request.

`StoreStatus` gains `favorite`, so the picker can order the list without a
second request.

### Filling the warm list

`main.go` loads the state before building the registry and passes the favorites
and the last store used as `RegistryOptions.Warm`, which
TKT-01M2HPBAB (Open discovered stores lazily and evict idle ones) left empty for
this ticket. That completes the criterion on that ticket which depended on this
one.

### Tests

A favorite written, the process restarted, and the favorite still there. A
favorite surviving a `--root` change that renames every store. Setting and
clearing through the route. A corrupted file loading as empty with a warning
rather than failing. A configuration file untouched, byte for byte. And the
warm list actually opening the favorite at startup, which is the first time
that mechanism is exercised with a real list.

## Notes

**agent:t3code/d30689a3** at 2026-09-15T06:27:12Z

draft to ready: Next in the run the user asked for. Its dependency, lazy activation, is done and left a warm list for this ticket to fill.

**agent:t3code/d30689a3** at 2026-09-15T06:32:33Z

in-progress to done: Favorites and the last store used survive a restart, are keyed by resolved path, and warm the registry at startup.

## Summary

The canvas now remembers which stores matter and which one was open last.

### The file

`internal/state` keeps
`${XDG_STATE_HOME:-~/.local/state}/git-ticket-canvas/state.json`, moved by
`--state`. Outside every repository, because a favorite is a fact about the
person using the canvas rather than about the project, and writing one into
`.tickets` would put one person's preferences into everybody's clone.

No configuration file is touched. That one is written by hand, and a tool that
rewrites it loses the comments and the ordering somebody put there. A test
holds the bytes of one unchanged across a favorite being set.

Writes go through a temporary name in the same directory and a rename, so an
interrupted write leaves the previous state rather than half of the next one. A
missing file is a first run and reads as empty. A malformed one warns, reads as
empty, and is repaired by the next write: losing a canvas over a corrupted list
of favorites would be the wrong trade.

### Keyed by path

Both the favorites and the last store used are keyed by `discover.Key`, the
resolved store path the merge already treats as identity. An id is derived from
a path relative to a root, so `--root` renames every store at once, and a
favorite keyed by id would be lost by a flag meant to change nothing about
which stores exist. A test serves one store under two roots, gets `org_repo`
and then `repo`, and finds the favorite still set.

The file holds paths. A response holds ids, because that is what a URL needs.
`GET /api/favorites` also returns the paths, including ones this canvas is not
serving, so a canvas started on a different root does not look as though it
lost them.

### The routes and the warm list

`GET /api/favorites` and `PUT /api/favorites` with `{"store": "<id>",
"favorite": true}`. `StoreStatus` gained `favorite`, so a picker orders the
list without a second request. The store last used is recorded when a request
reaches a store that is not the one already recorded, which is one write per
switch rather than one per request.

`main.go` passes the favorites and the last store used, the last store first,
as the `Warm` list that TKT-01M2HPBAB (Open discovered stores lazily and evict
idle ones) left empty. That completes the criterion on that ticket which
depended on this one.

### Verified

`just test` and `just vet` pass. `internal/state` is at 84.8% coverage and
`internal/api` at 88.8%, with 12 new tests across the two.
`just browser-test-embedded` passes: 68 passed, 6 skipped.

Run against the real workspace. Marking `ledger` wrote
`/home/sothr/workspace/ledger` into the state file under a temporary
`XDG_STATE_HOME`. Looking at `research` added it as the last store. On restart,
with 22 stores registered, exactly those two were open and the process held two
inotify instances, with `ledger` reported as both active and favorite.
