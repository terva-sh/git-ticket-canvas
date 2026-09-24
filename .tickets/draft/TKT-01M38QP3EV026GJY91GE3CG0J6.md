---
schema: 3
id: TKT-01M38QP3EV026GJY91GE3CG0J6
title: Open a ticket in a bottom sheet on a phone
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - mobile
  - ui
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies:
  - TKT-01M38QP2NVPG01307B8V69C29M
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-24T03:34:57Z
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

On a portrait screen the inspector already becomes a bottom panel that takes a fixed share of the stage. On a phone it becomes a sheet with three heights: a peek showing the title, status and next action; half; and full. It moves between heights by dragging its handle, and dragging below the peek closes it. Above a peek or half sheet the board can still be panned, and tapping another card switches the sheet to that ticket without closing it.

The fields work as they do now.

See `docs/mobile-design-v1.md`, "The ticket sheet".

## Acceptance criteria

- [ ] The sheet opens at the peek and can be dragged to half and full, with a test on the emulated phone
- [ ] Dragging below the peek closes it
- [ ] Tapping another card while the sheet is open switches its ticket
- [ ] Status, priority, the checklist, notes and text fields can all be edited from the sheet at full height
- [ ] Tablet and desk inspector placement is unchanged
