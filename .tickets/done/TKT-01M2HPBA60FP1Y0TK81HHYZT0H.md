---
schema: 3
id: TKT-01M2HPBA60FP1Y0TK81HHYZT0H
title: Let a store declare child stores in its own config
type: task
status: done
status_reason: Declared children work, the checks that keep them safe are tested, and the feature is running against this repository's own store.
priority: normal
due_on: null
labels:
  - discovery
  - config
assignees: []
milestone: null
parent: TKT-01M2HPB9WEYH5VSYB55GNYMZ8Y
origin: null
dependencies:
  - TKT-01M2HPBA301SX096MRR4YWJ58H
blocks_on: none
references:
  - ref: design:multi-store-v1
    path: docs/multi-store-design-v1.md
claim:
  actor: agent:t3code/d30689a3
  branch: t3code/orient-upstream-review-tickets
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-d30689a3
  commit: c60a2b1ede2e63e9f067bdffd3278250bbbe0a25
  session: null
  claimed_at: 2026-09-15T05:40:47Z
  expires_at: null
archive: null
created_at: 2026-09-15T04:49:03Z
updated_at: 2026-09-15T05:48:16Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

Let a store declare that specific directories below it are also stores.

A repository that genuinely keeps a store inside a store can say so in its own
`.tickets/config.yml`. This is the opt-in that overrides the store-boundary
rule from TKT-01M2HPBA3 (Walk a root for ticket stores with a
bounded depth), for the
paths named and for nothing else. It applies whether the parent store was named
explicitly or found by a walk, because it describes the store rather than how
the store was reached.

```yaml
canvas:
  children:
    - path: docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets
      name: canvas-fixture
      readOnly: true
```

### Why the key is safe in config.yml

`git ticket` reports `unknown_field` as an error, which makes this look unsafe.
It is not: that finding applies to ticket files, not to the store
configuration. Verified against git-ticket v0.14.3 on a scratch store with a
`canvas:` key added. `git ticket check --strict` reports no problems, so does
`git ticket check --fix --dry-run --strict` which is what CI runs, `git ticket
create` succeeds with the key still present afterward, and `git ticket config`
has no flag that writes.

The key is tolerated rather than guaranteed, so keep everything under the one
`canvas:` key, which leaves a single thing to upstream if git-ticket ever
validates its configuration strictly. Treat it as optional: absent, empty, or
malformed means no children and must never make the store fail to open.

Do not put this in `.tickets/canvas/`. That directory holds board layouts and
`layout.Store.Boards` lists every `*.yml` in it, so a file there appears in the
board picker as a board.

### Rules on a declared path

This configuration comes from a repository you might not have written, so check
a declared path before using it. The path must be relative; reject an absolute
one. After normalization and after resolving symbolic links, it must still be
inside the declaring store's own directory, which rejects an escape through
`..` and an escape through a link as two separate cases. The child must pass
the same validity test as any other candidate. Bound a chain of children, three
deep by default, recording every path visited by absolute path so a cycle ends.

A declared child that fails a check is a warning on the parent, not a failure.
One bad entry must not hide the project that declared it.

## Acceptance criteria

- [x] A canvas.children entry in .tickets/config.yml exposes a named child store the walk would otherwise not descend to.
- [x] An absolute path, a path escaping through .., and a path escaping through a symbolic link are each rejected.
- [x] A chain of declared children is bounded, and a cycle terminates.
- [x] A declared child that fails a check produces a warning on the parent, and the parent still loads.
- [x] A store whose canvas key is absent, empty, or malformed loads normally with no children.

## Definition of done

- [x] A test store carrying the key still passes git ticket check --strict.

## Implementation plan

### The key, and what reads it

A store declares children in its own `.tickets/config.yml`:

```yaml
canvas:
  children:
    - path: docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets
      name: canvas-fixture
      readOnly: true
```

`storeAt` already reads that file to decide whether a directory is a store, and
its gate stays exactly as it is: exists and parses. Reading the `canvas` key is
a second, separate step, so a store whose key is absent, empty, or the wrong
shape is still a store. It loads with no children and a warning.

### Where it happens in the walk

The walk stops at a store. This is the targeted opt-in that reaches past that
stop, for the paths named and nothing else, so it runs when a store is recorded
rather than as part of the ordinary queue. The depth limit does not apply to a
declared child, because the parent named it rather than the walk finding it.

A chain of children is bounded at three by default, and the walk's existing
`seen` set, keyed by path, stops a cycle from repeating.

### Checking a declared path

This configuration comes from a repository somebody else may have written, so a
path is checked before it is used:

1. Reject an empty path and an absolute path.
2. Join it to the parent and require the result to still be under the parent.
   That catches an escape through `..`, and rejects the parent itself.
3. Resolve symbolic links on both the parent and the candidate, then require
   containment again. An escape through `..` and an escape through a link are
   different attacks and the lexical check alone does not catch the second.
4. Require the child to pass the same store gate every other candidate does.

A child that fails any check is a warning on the parent, not a failure. One bad
entry must not hide the project that declared it.

`Found.Path` stays the lexically joined path rather than the resolved one, so
every path the walk reports is in the same form. Resolving paths uniformly for
identity is TKT-01M2HPBA9 (Merge explicitly named stores with discovered ones).

### Precedence

An exclusion vetoes a declared child. The person running the canvas outranks the
project being served, and the matcher for the root is already at hand.

A declared `name` is used when it is valid, and a name that is not is a warning
with the derived name used instead. A URL has to be able to hold it.

### Testing the definition of done in process

The criterion is that a store carrying the key still passes
`git ticket check --strict`. The library exposes `Store.Check`, which returns
errors and warnings separately, and strict means warnings count too. So the test
builds a store, writes the key, runs `Check`, and asserts both lists are empty.
That needs no external binary and cannot drift from the version the module
already depends on.

### Tests

A child found that the walk would not otherwise descend to. Each rejection:
absolute, `..`, a symbolic link pointing outside, the parent itself, and a path
that is not a store. A chain three deep found and a fourth level refused. A
cycle terminating. An exclusion vetoing a child. A malformed `canvas` key
leaving the store loadable. And the `Check` test for the definition of done.

## Notes

**agent:t3code/d30689a3** at 2026-09-15T05:40:47Z

draft to ready: The user chose it next. Its dependency, the walk, is done, and finishing it makes --scan ready.

**agent:t3code/d30689a3** at 2026-09-15T05:48:16Z

in-progress to done: Declared children work, the checks that keep them safe are tested, and the feature is running against this repository's own store.

## Summary

A store now names the directories under it that are also stores, in its own
`.tickets/config.yml`, under one `canvas.children` key holding a `path` and an
optional `name` and `readOnly`. This is the only way past the store-boundary
rule, and it reaches the paths named and nothing else.

`internal/discover/children.go` holds it. `Declared` expands a store named on
the command line; the walk calls the same expansion the moment it records a
store, which is why a declaration works however the parent was reached. The
depth limit does not apply to a declared child, because the declaration rather
than the walk is what reached it.

A declared path is checked before it is used, since the configuration comes
from a repository you might not have written. The path must be relative, and
must sit strictly inside the declaring store both as written and with symbolic
links resolved. The second check is not redundant: a link pointing elsewhere
passes the first one. A path resolving back to the declaring store is refused
too. The child then faces the same `storeAt` gate every candidate faces, and an
exclusion vetoes it, asking about every directory between the child and the
root rather than the child's own name alone. A child declared inside
`node_modules` is kept out by its ancestor, which is the case a bare-name
exclusion exists for.

Nothing here can cost a parent its place. Every refusal is a warning carried on
`Result.Warnings` and logged at startup, and the chain is bounded at
`MaxChildDepth`, which is 3.

The `canvas` key is decoded from a held `yaml.Node` rather than as part of the
document, so a malformed value under it cannot fail the parse that `storeAt`
already made and cost the store its configuration. Absent and empty say
nothing; malformed says one warning.

### Verified

`just test` passes, including 12 new tests in `internal/discover`, which is at
94.8% coverage. `just vet` and `gofmt` are clean.

The definition of done is tested in process rather than by shelling out:
`ticket.Store.Check` returns errors and warnings separately, strict counts
both, and the test asserts both lists are empty for a store carrying the key.
That cannot drift from the `git-ticket` version this module depends on.

Run against real data, both ways. This repository's own store now declares its
review-baseline fixture as a read-only child named `review-baseline`, which is
the example the design document uses. Started with no flags, the canvas serves
two stores; started with `--root . -R`, the walk finds the parent and the same
child appears under the same name. `git ticket check --strict` on this store,
with the key present, reports no problems.

Not run: the visual suite. Chromium cannot load `libnspr4.so` on this machine
and installing the library needs a password. That is unchanged from the four
commits before this one.
