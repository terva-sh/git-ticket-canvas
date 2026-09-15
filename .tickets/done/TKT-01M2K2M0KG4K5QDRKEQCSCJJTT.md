---
schema: 3
id: TKT-01M2K2M0KG4K5QDRKEQCSCJJTT
title: Update git-ticket from v0.14.3 to v0.18.1
type: chore
status: done
status_reason: null
priority: normal
due_on: null
labels: []
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-15T17:42:46Z
updated_at: 2026-09-15T17:46:02Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

### Why

`go.mod` pins `github.com/terva-sh/git-ticket v0.14.3`. The library is at
v0.18.1, four minor versions ahead, and the CLI installed on this machine is
already v0.17.1. A canvas built against an older library than the CLI writing
the same store is a compatibility gap waiting to be found by a write rather
than by a test.

### What is known before starting

- The store schema version is 3 in both v0.14.3 and v0.18.1, so no store
  migration is involved.
- No exported name in package `ticket` was removed or renamed between the two.
  The surface is additive, and includes import and export, a document reader,
  change kinds, and mbox parsing, none of which the canvas uses today.
- The canvas uses about a hundred exported names from the package, so a changed
  signature rather than a removed name is the likely break.

That makes this a bump and a compile rather than a port, but a 0.x minor is
where behaviour changes without a name changing, so the value is in what the
suite says after the bump and not in the diff of the surface.

### Scope

Update `go.mod` and `go.sum` to v0.18.1 and fix whatever the compiler and the
suite report. Do not adopt any of the new API in this ticket. Anything worth
using is its own piece of work, filed separately, so that a dependency bump
stays reviewable as a dependency bump.

Record any behaviour change the suite catches, because a change that alters
what the canvas writes into a store is worth a note even when it is correct.

## Acceptance criteria

- [x] go.mod requires github.com/terva-sh/git-ticket v0.18.1 and go.sum matches
- [x] The build passes with no source change, or every change it forced is recorded in the ticket
- [x] just check passes, including go test -race
- [x] just browser-test-embedded passes against a freshly built bundle
- [x] The canvas is run against the real workspace and a write is made through it
- [x] No new library API is adopted; anything worth using is filed separately

## Summary

`github.com/terva-sh/git-ticket` moves from v0.14.3 to v0.18.1. Two lines in
`go.mod` and `go.sum`, and no source change at all.

### Why it was only a version bump

The exported surface of package `ticket` is additive across the four minor
versions: nothing the canvas uses was removed, renamed, or given a new
signature. What v0.18.1 adds is import and export, a document reader, change
kinds, and mbox parsing, none of which the canvas touches. The store schema
version is 3 in both, so no store moved.

### What was actually run, rather than inferred

The compiler agreeing is the weakest evidence available here, so the version
gap was tested in the direction that motivated the ticket. A canvas built on
v0.18.1 created a ticket through its API into a throwaway store, and the CLI
installed on this machine, still at v0.17.1, listed that ticket and reported
`No problems found` over the store. The actor landed correctly as
`agent:t3code/d30689a3` in both `created_by` and `updated_by`.

Against the real workspace the canvas discovered 22 stores with 22 available
and read a real board of 134 tickets through the new library.

The write went into a throwaway store rather than into any repository in the
workspace. Those working trees are not this ticket's to change, and a write
into one proves nothing a temporary store does not.

### Verified

`just check` passes, including `go test -race`. `just browser-test-embedded`
passes with 72 tests. Coverage is unchanged: `internal/api` 88.8%,
`internal/config` 90.2%, `internal/discover` 90.1%, `internal/state` 84.8%.

### Not done here

No new API was adopted. `Export`, `PlanImport`, and `ReadDocument` look
relevant to a canvas that may one day move a ticket between stores, and that is
its own ticket rather than a rider on a dependency bump.
