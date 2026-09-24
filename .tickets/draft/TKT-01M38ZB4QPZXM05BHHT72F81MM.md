---
schema: 3
id: TKT-01M38ZB4QPZXM05BHHT72F81MM
title: Stop the phone's ticket sheet and keyboard from writing layout
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - mobile
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-24T05:48:47Z
updated_at: 2026-09-24T05:48:47Z
created_by:
  id: agent:claude/mobile-board
  name: ""
updated_by:
  id: agent:claude/mobile-board
  name: ""
extensions: {}
---

## Description

TKT-01M38QP373BAE8X6Q9F3G8E7SY (Keep a phone's board to panning, zooming and opening cards) took every layout write off the phone's board. Three writes are still reachable on the phone layout from outside the board:

- The ticket sheet's Placement section has "Return to automatic" (`web/src/ui/Placement.tsx`, `data-return-automatic`), which calls `Canvas.release` and removes the card's saved position.
- The sheet's frame membership section (`FrameMembership` in `web/src/ui/FramesPanel.tsx`) changes which frame a ticket belongs to, and its "Member of" button opens the frame panel, whose controls are all edits.
- The `u` key (`App.tsx`) calls `Canvas.releaseSelected`, for a phone with a keyboard attached.

The design says a phone does not write layout and that each write it leaves out has another way in on the same screen, but these are the sheet's and the keyboard's, not the board's, so the board ticket left them alone. A guard inside `Canvas.releaseCards` was considered there and rejected, because it would leave the sheet's buttons on screen doing nothing. The fix belongs where the controls are drawn: on `layout === 'phone'`, render the Placement state without its button, the membership as text, and skip `u`.
