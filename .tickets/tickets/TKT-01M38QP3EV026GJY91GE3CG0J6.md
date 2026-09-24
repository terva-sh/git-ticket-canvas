---
schema: 3
id: TKT-01M38QP3EV026GJY91GE3CG0J6
title: Open a ticket in a bottom sheet on a phone
type: task
status: ready
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
updated_at: 2026-09-24T05:01:54Z
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
- [ ] The phone sheet keys on the phone layout, and only one mechanism positions a portrait inspector

## Notes

**agent:claude/t3code** at 2026-09-24T05:01:53Z

Groomed 2026-09-24 against main at 79b233f. A portrait inspector is laid out today by two independent mechanisms, and this ticket should leave one:

- `web/index.html`: `html[data-inspector="bottom"] #inspector` is an absolutely positioned sheet at 55% of the stage, sliding up with `transform`.
- `web/src/ui/Inspector.css`: `@media (max-width: 700px)` turns `#stage` into a two-row grid (35% board, 65% inspector) whenever the inspector is open, and hides `#hint` and `.insp-resize`.

A 390px phone gets the media query; a portrait tablet gets the data attribute. The phone sheet should key on `html[data-layout="phone"]`, which is the choice a person can override, not on a width media query they cannot. The 700px rule should then go, or be scoped so that it cannot fight the sheet.

Found while testing the pinch work: the inspector's `.insp-resize` handle is a column-resize strip along the left edge, with `touch-action: none`. It is hidden under 700px but not in the tablet's bottom placement, where it resizes nothing sensible and swallows touches along the sheet's left edge. It is filed separately as a small bug, so it does not wait on the phone sheet.

The drag handle for the sheet's heights needs `touch-action: none` of its own, and a test on the emulated phone that drags it through the three heights using `touchSteps`.
