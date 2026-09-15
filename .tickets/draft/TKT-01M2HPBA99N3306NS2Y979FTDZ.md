---
schema: 3
id: TKT-01M2HPBA99N3306NS2Y979FTDZ
title: Merge explicitly named stores with discovered ones
type: task
status: draft
status_reason: null
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
references: []
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

Combine the stores named in configuration with the stores a walk found.

A store named explicitly is always in the list. Root, depth, exclusions, and
the store-boundary rule do not apply to it, because you named it. Being in the
list is not the same as being healthy: a named store that is no longer on disk
appears as unavailable with the reason, rather than vanishing.

The merge key is the absolute path after resolving symbolic links, so
`~/src/foo`, `/home/you/src/foo`, and a discovered `/home/you/src/foo` are one
store and not three.

When the two overlap, everything the explicit entry sets wins: its name, its
actor, and its read-only setting. Discovery contributes only the fact that the
store was also found.

### Naming a discovered store

An id appears in a URL, so it is restricted to letters, digits, `-`, and `_`,
the character set `validBoardName` already enforces. A named store uses its
name. A discovered store derives one from its path relative to its root, with
`/` becoming `_` and any other illegal character becoming `-`. A collision
between two roots is broken by a short hash of the path. A declared child
derives its id from its parent's id and its relative path, so children sort
next to their parent.

## Acceptance criteria

- [ ] An explicitly named store appears in the list regardless of root, depth, or exclusions.
- [ ] A named store missing from disk is listed as unavailable with a reason.
- [ ] A named store and a discovered store at the same resolved path produce one entry, and the named entry's fields win.
- [ ] Two paths that differ by a symbolic link or by ~ expansion merge into one store.
- [ ] A discovered store's id is URL-safe, derived from its path relative to its root, and stable across runs.

## Definition of done

- [ ] go test ./... passes.

## Notes

**agent:t3code/d30689a3** at 2026-09-15T05:30:53Z

Discovered stores are already wired into the registry, in
TKT-01M2HPBA3 (Walk a root for ticket stores with a bounded depth). That was
done there rather than left here so `-R` would not parse into nothing, which is
the trap this project already hit with per-store `readOnly`.

What exists is the minimum. A discovered store is named by
`config.SlugName`, and one whose path or name a configured store already holds
is skipped with a log line in `main.go`.

What this ticket still owns is the real rule. Merging on absolute path after
symbolic links are resolved, rather than on the configured path string, so that
`~/src/foo` and `/home/you/src/foo` are one store. An explicit entry winning
every field it sets. An explicit store staying in the list even when it is
outside every root or below a boundary. And a short hash breaking a collision
between two roots that slug to the same name, which the current skip would
silently drop instead.

Move that logic out of `main.go` while you are there. It belongs beside the
registry, because rescan will need it and `main.go` will not be running then.
