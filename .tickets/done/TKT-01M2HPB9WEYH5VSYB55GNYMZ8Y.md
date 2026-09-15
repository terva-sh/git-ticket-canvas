---
schema: 3
id: TKT-01M2HPB9WEYH5VSYB55GNYMZ8Y
title: Serve many ticket stores from one canvas
type: epic
status: done
status_reason: All thirteen children are done, the design document matches what shipped, and just check plus the browser suite pass.
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
updated_at: 2026-09-15T07:02:29Z
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

- [x] A single configured store behaves exactly as it does today, including the flat /api routes.
- [x] Several stores are servable from one process, switchable in the UI, and independent of each other.
- [x] A tree of stores is discoverable by walking a root, and the result is explainable per candidate.
- [x] A store that cannot be opened is reported as unavailable without stopping the others.

## Definition of done

- [x] docs/multi-store-design-v1.md matches what shipped, including any decision changed during implementation.
- [x] just check passes, and the embedded browser checks cover switching stores.

## Notes

**agent:t3code/d30689a3** at 2026-09-15T07:02:29Z

draft to ready: Every child is done; the epic is being closed rather than picked up.

**agent:t3code/d30689a3** at 2026-09-15T07:02:29Z

ready to in-progress: Closing out the epic after its last child.

**agent:t3code/d30689a3** at 2026-09-15T07:02:29Z

in-progress to done: All thirteen children are done, the design document matches what shipped, and just check plus the browser suite pass.

## Summary

One `git-ticket-canvas` process now serves a tree of ticket stores, and the
browser switches between them. All thirteen children are done.

### What shipped

A store list from a configuration file, an environment variable, or repeatable
`--store` flags, merged per name rather than by whole-list replacement. A walk
of `--root` with `-R` and a bounded depth, stopping at a store, skipping hidden
directories and symbolic links. Exclusions as one mechanism covering both the
build directories nobody wants searched and the paths an operator names. A
store declaring its own child stores under one `canvas.children` key, which is
the only way past the boundary. `--scan`, which prints what discovery decided
about every candidate and exits. A merge on resolved store identity, where an
explicitly named store always wins.

Then the serving half. A registry routing by store key, each store with its own
server, watcher, actor, and lock, so a failure in one costs that one and not the
page. Lazy activation with idle eviction and an active-store limit. Favorites
and the store last used in a state file outside every repository. A browser
client scoped to one store, a compact toolbar picker, and a browser view with
search, grouping, and favorites.

### The numbers that decided things

Two measurements changed the design rather than confirming it. A walk of the
real workspace finds 22 stores, and the machine reports 128 inotify instances
shared with every editor on it, which turned eager activation into lazy
activation: 22 registered stores now hold zero watchers until somebody looks at
one. A store three levels down under `forge/org/repo` is why the default depth
is 4 rather than 3.

### Verified

`just check` passes: build, 500 frontend tests, tooling tests, formatting, vet,
the Go suite with the race detector, and the ticket store. Coverage is 88.7% in
`internal/api`, 90.2% in `internal/config`, 90.1% in `internal/discover`, and
84.8% in `internal/state`.

`just browser-test-embedded` passes with 72 tests, four of them the two-store
fixture that covers switching: the canvas rebuilt, the stream reconnected to the
new store, nothing of the first store surviving, and a configured store that is
not on disk listed with its reason.

Every step was run against the real 22-store workspace, not only against
fixtures, and that is where four bugs were found that the tests had not: a
symbolic link that hid 21 stores, a per-store `readOnly` that parsed and did
nothing, a lost `git-ticket init` hint, and the canvas writing favorites into
the state directory of whoever ran the browser suite.

### What this deliberately does not do

One store is visible at a time. Rendering tickets from several stores together
needs namespaced ticket IDs, a decision about where a layout spanning two stores
is persisted, and a per-card origin badge, and none of that is needed to stop
running several processes. The store key is in the URL path, so an aggregate
view stays possible without changing the wire format.

`docs/multi-store-design-v1.md` is the record, and it ends with a section
listing every decision the work overturned, including the two measurements
above.
