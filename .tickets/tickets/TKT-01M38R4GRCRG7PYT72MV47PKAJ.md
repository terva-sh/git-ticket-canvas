---
schema: 3
id: TKT-01M38R4GRCRG7PYT72MV47PKAJ
title: Refuse a dependency drag that would close a cycle
type: task
status: ready
status_reason: null
priority: normal
due_on: null
labels:
  - ui
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies:
  - TKT-01M38QP3PT4ZNXV37720NSX424
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-24T03:42:50Z
updated_at: 2026-09-24T03:42:50Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

Dragging a card's link handle onto another card sends `addDependency` through `link()` in `web/src/ui/App.tsx` without checking for a cycle. `git-ticket` v0.23.0 refuses only a self-reference, so dragging can close a cycle through three tickets today. Only `git ticket check` reports it, as `dependency_cycle`, and every ticket in the cycle then stays unready for good.

Use the cycle predicate that TKT-01M38QP3PT4ZNXV37720NSX424 (Add a dependency or a parent from the inspector) adds, so the drag and the picker cannot disagree. While the link is being dragged, a target that would close a cycle is shown as refused, the way a non-card target is now. Dropping on it writes nothing and names the cycle.

This changes behaviour for desk users. The maintainer accepted that on 2026-09-24: a cycle is never what somebody meant, and the drag and the picker should agree.

## Acceptance criteria

- [ ] Dropping a link that would close a cycle writes nothing and says which tickets form the cycle, with a browser test
- [ ] The drag and the inspector picker use the same predicate
- [ ] While dragging, a cycle-closing target is shown as refused before the drop
- [ ] A link that closes no cycle behaves exactly as it does today
