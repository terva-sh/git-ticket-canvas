---
schema: 3
id: TKT-01M38QP3PT4ZNXV37720NSX424
title: Add a dependency or a parent from the inspector
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - ui
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-24T03:34:58Z
updated_at: 2026-09-24T03:34:58Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

The inspector can remove a dependency or a parent but cannot add one. The empty state reads "Drag a card's right handle onto another to add one". A phone does not offer that drag, and a keyboard user cannot perform it at all.

Add **Add dependency…** and **Set parent…** to the Relationships section. Each opens a picker that searches the store by ID and title, as Filter does, and leaves out the ticket itself and any ticket that would close a cycle. It uses the same write the drag uses. This is for every layout, and the drag stays.

See `docs/mobile-design-v1.md`, "Adding a relationship without a drag".

## Acceptance criteria

- [ ] A dependency can be added from the inspector by searching for the ticket, with a test
- [ ] A parent can be set the same way
- [ ] The ticket itself and any ticket that would close a cycle are not offered
- [ ] The controls are disabled when read-only
- [ ] Keyboard alone is enough to add one
