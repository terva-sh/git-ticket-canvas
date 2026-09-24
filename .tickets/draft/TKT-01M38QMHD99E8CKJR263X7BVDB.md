---
schema: 3
id: TKT-01M38QMHD99E8CKJR263X7BVDB
title: Use the canvas from a phone or a tablet
type: epic
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - mobile
  - touch
  - ui
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references:
  - ref: design:mobile-design-v1
    path: docs/mobile-design-v1.md
claim: null
archive: null
created_at: 2026-09-24T03:34:06Z
updated_at: 2026-09-24T03:34:59Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

Make the canvas usable from a phone and comfortable from a tablet.

On a phone in portrait the header takes more than half the screen, every desk control stays visible, the hint line describes a mouse, and the board gets about a third of the height. The canvas takes one pointer at a time, has no pinch, and `#stage` sets no `touch-action`, so the browser can take a touch drag over and cancel it.

`docs/mobile-design-v1.md` is the design. What each size is for, as decided on 2026-09-24:

- **Phone:** view and triage. Pan, pinch, tap a card to open it in a bottom sheet, and change anything about a ticket there. There is a list view as well as the board. Moving cards, drawing frames and drag-to-link are not offered.
- **Tablet:** everything a desk can do, done by touch. Pinch and two-finger pan, long-press to select several cards, drags that survive touch, and nothing that needs hover.
- **Desk:** unchanged, apart from what the new pieces add everywhere (a way to add a relationship without dragging, and the list).

The children are ordered so each is useful alone. The gesture work comes first because every later phase depends on it.

## Acceptance criteria

- [ ] docs/mobile-design-v1.md is implemented or amended where it was wrong
- [ ] On a real phone a person can find a ticket, open it, and change its status, notes and checklist without zooming the page
- [ ] On a real tablet everything a desk can do can be done by touch
- [ ] A desk canvas behaves as it does today
