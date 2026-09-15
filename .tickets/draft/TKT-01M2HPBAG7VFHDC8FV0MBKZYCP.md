---
schema: 3
id: TKT-01M2HPBAG7VFHDC8FV0MBKZYCP
title: Add a store browser view and a compact toolbar picker
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - ui
  - canvas
assignees: []
milestone: null
parent: TKT-01M2HPB9WEYH5VSYB55GNYMZ8Y
origin: null
dependencies:
  - TKT-01M2HPBACHAMZM2EMV5FMC8CEK
  - TKT-01M2HPBAE9GCFJX2RTRS0X26PW
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-15T04:49:04Z
updated_at: 2026-09-15T04:49:04Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

Make a tree of stores browsable.

A picker holding 22 entries is a list, not a menu. The toolbar keeps a compact
control showing the current store, its favorites, and recent stores. A
dedicated view holds the rest.

The view offers search, favorites first, grouping by root and then by the
leading segments of each path, and one row per store showing the path and
whether the store is available. A store declared as a child of another renders
under its parent, which its derived id already sorts it next to.

An unavailable store is visible with its reason rather than hidden, so a
misconfigured path is diagnosable from the page instead of the logs.

## Acceptance criteria

- [ ] The toolbar shows the current store with its favorites and recent stores, and opens the browser view.
- [ ] The browser view searches, groups by root and path segments, and lists favorites first.
- [ ] An unavailable store is shown with its reason instead of being hidden.
- [ ] A declared child store renders under its parent.
- [ ] Marking a favorite from the view persists it.

## Definition of done

- [ ] just web-test passes and the view is reachable by keyboard.
