---
schema: 3
id: TKT-01M2HPBA301SX096MRR4YWJ58H
title: Walk a root for ticket stores with a bounded depth
type: task
status: draft
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

- [ ] A walk from a root finds stores down to the depth limit and no further, with 4 as the default.
- [ ] The walk does not descend into hidden directories, yet still finds the hidden .tickets child.
- [ ] Symbolic links to directories are not followed, and a link that forms a cycle does not hang the walk.
- [ ] A directory that is a store is not descended into, verified with a store nested inside a store.
- [ ] A candidate qualifies only when .tickets/config.yml exists and parses.
- [ ] -R and -R=3 are accepted; a leftover positional argument such as the 3 in -R 3 is rejected with a message.

## Definition of done

- [ ] The walk is a function over a filesystem, tested without starting a server.
