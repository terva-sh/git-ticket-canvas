---
schema: 3
id: TKT-01M38QP373BAE8X6Q9F3G8E7SY
title: Keep a phone's board to panning, zooming and opening cards
type: task
status: ready
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

A phone is for viewing and triage, so its board does not write layout.

In the `phone` layout, a drag that starts on a card pans the board, and a tap opens the card. The link handle and the frame handles are not drawn. The hint line goes. On the first visit a one-line tip appears ("drag to move around · pinch to zoom · tap a card to open it"); tapping it closes it, and it is remembered with the display settings so it does not come back.

See `docs/mobile-design-v1.md`, "The board".

## Acceptance criteria

- [ ] On the emulated phone a drag from a card pans and saves nothing, with a test
- [ ] A tap on a card opens it
- [ ] No link or frame handle is drawn on a phone
- [ ] The first-visit tip shows once, closes when tapped, and stays closed after a reload
- [ ] Setting the layout to tablet by hand brings card drags, handles and the hint back
- [ ] The Manual placement control on a card does not hand the card back on a phone

## Notes

**agent:claude/t3code** at 2026-09-24T05:01:53Z

Groomed 2026-09-24 against main at 79b233f.

- `Canvas` does not receive `layout`. `App.tsx` passes `display.settings.inspector` and `fitFloor`, and `layout` has to be passed beside them. Read it through `latest.current` in the gesture code, as the other props are.
- On a phone, the card-drag branch of `startGesture` (Canvas.tsx) should start a `pan` rather than a `card` gesture. The tap-to-open path, `p.onSelect`, stays as it is.
- Cards carry a second layout-writing control the design missed: the "Manual" placement button in `CardView.tsx`, which hands a card back to automatic placement. On a phone it should read as a label, not act as a button, the same as the handles. There is a new criterion for that.
- The link handle is `.handle` in CardView. The frame handles are `.canvas-frame-title` and `.canvas-frame-resize` in Canvas.tsx; the title is also a button that selects the frame. On a phone, should tapping a frame title still open the frame panel? The panel offers only edits, so this ticket should decide and say.
- The hint is `#hint` in Canvas.tsx. Store the first-visit tip beside the display settings (`displayPreferences.ts`), as a key that `recall()` allowlists.
- Pinch is done (TKT-01M38QP2CZEJ120PFDKMK3WTP1), so two fingers already work on a phone. This ticket only changes what one finger does.
