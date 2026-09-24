---
schema: 3
id: TKT-01M38QP2CZEJ120PFDKMK3WTP1
title: Pinch to zoom and pan with two fingers on the board
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
  - TKT-01M38QP27PJBQQDFK8RNBATJE2
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-24T03:34:56Z
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

`Canvas.tsx` tracks one pointer: `pointerMove` and `pointerUp` return unless `event.isPrimary`, and zoom comes only from `wheel` and the toolbar. `#stage` sets no `touch-action`, so the browser can take over a touch drag and send `pointercancel` partway through.

Track the active pointers. One finger behaves as the mouse does now. When a second finger lands, whatever the first one started is cancelled without saving and the gesture becomes a pinch: the distance between the fingers sets the zoom, anchored at their midpoint, and the midpoint's travel pans. Lifting back to one finger pans; it does not resume a card drag. Pinch and wheel both go through `zoomAt`.

See `docs/mobile-design-v1.md`, "Gestures, for every layout".

## Acceptance criteria

- [ ] #stage sets touch-action: none, and the header, inspector and list still scroll natively
- [ ] Two fingers zoom about their midpoint and pan with it, through zoomAt
- [ ] A second finger landing during a card, link or frame drag cancels it without saving, and the card returns
- [ ] Lifting to one finger after a pinch pans rather than resuming a drag
- [ ] Mouse and wheel behaviour on a desk is unchanged, and the existing gesture tests pass
- [ ] Each of the above is a browser test on the emulated tablet
