---
schema: 3
id: TKT-01M38QP47G7VBHRBVYR8MMKN8K
title: Select several cards on a touch screen by holding one
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - touch
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies:
  - TKT-01M38QP2CZEJ120PFDKMK3WTP1
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-24T03:34:58Z
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

Selecting several cards needs shift-click, and a touch screen has no shift key.

Holding a card for 450 ms without moving more than 8 px adds it to the selection and enters selection mode. The header shows the mode, a count and Done. In selection mode a tap toggles a card, and a drag from any selected card moves them all, as a shift-selection drag does now. Done, or a tap on empty board, leaves the mode. On a phone, holding a card only selects it; nothing gets dragged, because a phone does not move cards.

See `docs/mobile-design-v1.md`, "Tablet".

## Acceptance criteria

- [ ] A long press enters selection mode and selects the card, with a test on the emulated tablet
- [ ] Moving more than 8 px before the press completes pans rather than selecting
- [ ] In selection mode a tap toggles and a drag moves every selected card
- [ ] Done and a tap on empty board both leave selection mode
- [ ] Shift-click on a desk is unchanged
