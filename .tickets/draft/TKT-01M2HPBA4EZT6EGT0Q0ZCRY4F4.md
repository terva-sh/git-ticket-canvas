---
schema: 3
id: TKT-01M2HPBA4EZT6EGT0Q0ZCRY4F4
title: Exclude paths and directories from the store walk
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
  - TKT-01M2HPBA301SX096MRR4YWJ58H
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

Let the operator keep paths out of the walk.

Exclusions and the list of build directories to skip are one mechanism, not
two. The built-in list becomes the default value of `exclude`, which you can
extend or replace. The default is `node_modules`, `vendor`, `target`, `dist`,
and `build`. A hidden directory such as `.git` is already skipped by the walk.

An exclusion is configurable at the top level, per root, and as a repeatable
`--exclude` flag. An exclusion under a root is relative to that root. One at
the top level is an absolute path or a pattern.

Apply an exclusion during the walk, so an excluded subtree costs nothing rather
than being filtered out afterward.

### Two precedence rules

An exclusion overrides a store that another store declares as its child. The
person running the canvas outranks the project being served.

An exclusion does not apply to a store named explicitly in the configuration. A
named store is never discovered, so there is nothing for an exclusion to act
on. Naming a store and excluding the same path contradicts itself: report a
configuration warning and keep the store.

## Acceptance criteria

- [ ] An excluded directory subtree is skipped during the walk, not filtered afterward.
- [ ] A glob pattern such as **/node_modules excludes matching directories at any level.
- [ ] The default exclusions are node_modules, vendor, target, dist, and build, and they can be extended or replaced.
- [ ] A per-root exclusion resolves relative to that root; a top-level one is absolute or a pattern.
- [ ] An exclusion does not remove an explicitly named store, and the contradiction is reported as a warning.

## Definition of done

- [ ] go test ./... passes.
