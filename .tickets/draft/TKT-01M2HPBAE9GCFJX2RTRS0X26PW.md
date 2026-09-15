---
schema: 3
id: TKT-01M2HPBAE9GCFJX2RTRS0X26PW
title: Store favorites outside the repository, keyed by path
type: task
status: draft
status_reason: null
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
claim: null
archive: null
created_at: 2026-09-15T04:49:03Z
updated_at: 2026-09-15T04:49:29Z
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

- [ ] A favorite survives a restart and is stored outside every repository.
- [ ] Favorites and the last store used are keyed by absolute path, and survive a --root change that alters derived ids.
- [ ] PUT /api/favorites sets and clears a favorite.
- [ ] No canvas configuration file is rewritten by the tool.

## Definition of done

- [ ] go test ./... passes.
