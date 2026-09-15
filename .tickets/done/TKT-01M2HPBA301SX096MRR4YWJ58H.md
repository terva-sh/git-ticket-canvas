---
schema: 3
id: TKT-01M2HPBA301SX096MRR4YWJ58H
title: Walk a root for ticket stores with a bounded depth
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - discovery
assignees: []
milestone: null
parent: TKT-01M2HPB9WEYH5VSYB55GNYMZ8Y
origin: null
dependencies:
  - TKT-01M2HPB9XY067AWC768HT94143
blocks_on: none
references:
  - ref: design:multi-store-v1
    path: docs/multi-store-design-v1.md
claim: null
archive: null
created_at: 2026-09-15T04:49:03Z
updated_at: 2026-09-15T05:30:53Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

Walk a root and find the ticket stores under it, bounded by depth.

```
--root PATH        repeatable. Defaults to the --store directory.
-R, --recursive    optional depth. Default 4.
--depth N          the same setting, spelled so it cannot be misread.
```

From each root, examine directories level by level with the root at level 0. At
each directory, test for `.tickets/config.yml`. If the file exists and parses as
YAML, this directory is a store and the walk does not descend below it.
Otherwise, if the level is below the limit, examine the children that are
directories, are not symbolic links, and are not hidden.

### Two details that are easy to get wrong

`.tickets` is itself a hidden directory. "Do not descend into a hidden
directory" and "do look for a hidden `.tickets` child" are two separate rules,
and collapsing them into one hidden check finds nothing at all.

Symbolic links to directories are not followed. That makes the walk terminate
because it cannot revisit a directory, rather than because it notices that it
has.

### Why the default is 4, and why stopping at a store matters

A workspace laid out as forge/org/repo puts a store three levels below its
root, so 4 covers it with one level spare. Depth is not a speed setting: a
bounded walk over a workspace holding 22 stores takes about ten milliseconds.
It is about what gets picked up. On the workspace measured for
docs/multi-store-design-v1.md, depth 4 finds 22 stores and all 22 are real
projects, while going deeper finds three more that are all test fixtures
committed inside repositories. This repository's own fixture at
docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets is one of them.

Not descending below a store is what keeps those out at any depth. The depth
limit alone would not, because depth is a number somebody will raise.

### The flag trap

Go's flag package allows an optional-value flag to be written `-R` or `-R=3`,
never `-R 3`. Written with a space, `3` becomes a stray positional argument and
the depth silently stays at its default. Reject leftover positional arguments,
and provide `--depth` as the spelling that cannot be misread.

## Acceptance criteria

- [x] A walk from a root finds stores down to the depth limit and no further, with 4 as the default.
- [x] The walk does not descend into hidden directories, yet still finds the hidden .tickets child.
- [x] Symbolic links to directories are not followed, and a link that forms a cycle does not hang the walk.
- [x] A directory that is a store is not descended into, verified with a store nested inside a store.
- [x] A candidate qualifies only when .tickets/config.yml exists and parses.
- [x] -R and -R=3 are accepted; a leftover positional argument such as the 3 in -R 3 is rejected with a message.

## Definition of done

- [x] The walk is a function over a filesystem, tested without starting a server.

## Implementation plan

### Where it lives

A new `internal/discover` package. It takes `config.Root` values and returns
the stores it found plus one decision per candidate it considered. Walking a
filesystem is a different job from parsing configuration, and rescan will call
the walk again later without going near flags or files.

### The algorithm

From each root, breadth-first with the root at level 0. At each directory:

1. Test for `.tickets/config.yml`. If it exists and parses as YAML, record a
   store and do not descend.
2. Otherwise, if the level is below the depth limit, read the directory and
   enqueue each child that is a directory, is not a symbolic link, and is not
   hidden.

### One assumption, verified rather than remembered

`os.ReadDir` reports with Lstat semantics. A symbolic link to a directory comes
back with `IsDir()` false and `Type()&fs.ModeSymlink` set, confirmed by running
it. So a link is never descended even without a check, and the walk cannot
revisit a directory. Cycle safety is structural rather than a visited set. The
explicit symlink test exists only to record why the entry was skipped.

`.tickets` is itself hidden, so the hidden rule applies when enqueueing children
and never to the store test in step 1. Those are two separate rules and
collapsing them into one hidden check finds nothing at all.

### The validity gate, and what a broken store does

A candidate qualifies when `.tickets/config.yml` exists and parses. A directory
holding a `.tickets` whose config does not parse is not a discovered store, and
it is still a boundary: the directory belongs to somebody, so the walk does not
go underneath it looking for more. Naming such a store explicitly is how you see
its error, and the registry already reports that as `parse_error`.

### Flags

`--root` repeatable, `-R` with an optional depth, `--depth` as the spelling that
cannot be misread. Recursion is on when any of `-R`, `--depth`, `--root`, or a
`roots:` block in the configuration file is present. With recursion on and no
root named anywhere, the root is the `--store` directory, which is the working
directory by default.

Leftover positional arguments are rejected. That is what catches `-R 3`, where
Go's flag package silently takes the default depth and leaves `3` lying on the
floor.

### Wiring, and why it is not left for the merge ticket

Discovered stores are added to the registry under a name slugged from their path
relative to their root. A discovered store whose path or name is already
configured is skipped with a log line.

The full rule, that an explicit store is always listed and that the two merge on
resolved path with a hash breaking collisions, is
TKT-01M2HPBA9 (Merge explicitly named stores with discovered ones). The minimum
is wired here anyway, because a flag that parses and then does nothing is the
trap this project already hit once with per-store `readOnly`, and it is worse
than the small overlap.

### Tests

The walk is a function over a filesystem, so every case is a temporary tree and
no server starts. Depth found and not exceeded with 4 as the default. A hidden
directory not descended while the hidden `.tickets` is still found. A symbolic
link not followed, and a link that points at its own ancestor not hanging the
walk. A store nested inside a store, found only as the outer one. A `.tickets`
with no `config.yml`, and one whose `config.yml` does not parse, neither
qualifying. And the flag cases, including the leftover positional.

## Notes

**agent:t3code/d30689a3** at 2026-09-15T05:23:26Z

draft to ready: The user agreed it is the widest unblock. Its dependency, the configuration package, is done.

## Summary

`internal/discover` walks a root and finds the ticket stores under it, bounded
by depth. 15 tests, 100% statement coverage, no server involved. The flags
`--root`, `-R`, and `--depth` wire it into `main.go`.

### The bug that only real data found

The first working version reported **one** store under a 22-store workspace.

`/home/sothr/workspace/.tickets` is a symbolic link to `ledger/.tickets`, a
convenience shortcut. `storeAt` used `os.Stat`, which follows a link, so the
workspace root looked like a store, the boundary rule fired, and everything
below it was hidden.

Two things had concealed this. No temporary tree in the tests had that shape,
and the original survey used `find -type d -name .tickets`, which does not match
a symbolic link, so the count of 22 never included it.

The fix is `os.Lstat` and a real-directory check. A `.tickets` that is a link is
an alias for a store kept elsewhere, and the walk finds that store at its real
path. Following it would list one store twice under two names, and would turn
any directory holding such a shortcut into a boundary.

`TestASymlinkedTicketsIsNotAStoreAndDoesNotHideTheTree` carries the case, and
docs/multi-store-design-v1.md now states the rule with what went wrong.

### Measured against the real workspace

After the fix, and read-only so nothing could touch the repositories: 22 stores
at depth 4, and the same 22 at depth 8. Zero committed fixtures in either.

That second number is the one worth keeping. It proves the claim the design
rests on, that the store boundary excludes a project's own fixtures
structurally rather than because depth 4 happens to cut them off. The three
fixtures sit at depth 6 and 7 and stay out at depth 8.

### Rules, and which are separate from which

`.tickets` is itself hidden, so "do not descend into a hidden directory" and "do
look for a hidden `.tickets` child" are two rules. Collapsing them finds nothing
at all.

`os.ReadDir` reports with Lstat semantics, verified by running it: a link to a
directory arrives with `IsDir()` false. So a link is never descended even
without a check, and the walk terminates because it cannot revisit a directory
rather than because it noticed that it had. Cycle safety is structural. The
explicit symlink test only records why an entry was skipped.

A directory holding a `.tickets` that does not qualify, because `config.yml` is
missing or will not parse, is still a boundary. The directory belongs to
somebody. Naming such a store explicitly is how you see its error, which the
registry already reports as `parse_error`.

### Flags

`-R` and `-R=3` are accepted. `-R 3` is rejected with a message naming the
right spelling, because Go's flag package would otherwise keep the default depth
and drop the `3` on the floor. `--depth N` is the spelling that cannot be
misread. All four forms were checked against the built binary.

Searching turns on when any of `-R`, `--depth`, `--root`, or a `roots:` block is
present, since naming a root is itself the request. With searching on and no
root named, the root is the store directory, which is the working directory
unless `--store` said otherwise.

A discovered store is named by slugging its path relative to its root:
`git-local-sothr-com_terva-sh_ketju`. Every derived name is a valid URL segment,
which `TestSlugNameIsAlwaysValid` asserts across awkward inputs.

### Wiring, deliberately ahead of the merge ticket

Discovered stores are served now rather than parsed into nothing. A discovered
store whose path or name a configured one already holds is skipped with a log
line. The full rule, that an explicit store is always listed and that the two
sets merge on resolved path with a hash breaking collisions, is
TKT-01M2HPBA9 (Merge explicitly named stores with discovered ones).

A flag that parses and does nothing is the trap this project already hit once
with per-store `readOnly`, and it is worse than the small overlap.

### Verified

`just fmt-check`, `just vet`, `just test` with `-race`, `just go-only-check`,
`just tickets-check`, `just dist-verify`, `just web-typecheck`, and
`just web-test` at 476 tests all pass. `internal/discover` is at 100% coverage
and `internal/config` recovered to 90.0% after `AddRoots` and `SlugName` gained
tests. No test predating this work changed.

Also checked against the binary: no flags at all still serves this repository's
own store on the flat routes, and `-R` alone searches below the working
directory.

`just browser-test-embedded` did not run, because Chromium cannot start here
without `libnspr4.so`. Nothing in this change reaches the frontend.
