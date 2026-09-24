---
schema: 3
id: TKT-01M38QP373BAE8X6Q9F3G8E7SY
title: Keep a phone's board to panning, zooming and opening cards
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - mobile
  - touch
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies:
  - TKT-01M38QP2CZEJ120PFDKMK3WTP1
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

A phone is for viewing and triage, so its board does not write layout.

In the `phone` layout, a drag that starts on a card pans the board, and a tap opens the card. The link handle and the frame handles are not drawn. The hint line goes. On the first visit a one-line tip appears ("drag to move around · pinch to zoom · tap a card to open it"); tapping it closes it, and it is remembered with the display settings so it does not come back.

See `docs/mobile-design-v1.md`, "The board".

## Acceptance criteria

- [ ] On the emulated phone a drag from a card pans and saves nothing, with a test
- [ ] A tap on a card opens it
- [ ] No link or frame handle is drawn on a phone
- [ ] The first-visit tip shows once, closes when tapped, and stays closed after a reload
- [ ] Setting the layout to tablet by hand brings card drags, handles and the hint back
