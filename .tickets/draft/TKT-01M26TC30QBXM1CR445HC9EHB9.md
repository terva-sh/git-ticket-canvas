---
schema: 3
id: TKT-01M26TC30QBXM1CR445HC9EHB9
title: Add grid and freeform placement modes for card drags
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - idea
  - ui
  - canvas
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-10T23:27:44Z
updated_at: 2026-09-11T05:23:25Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Dragging a card is freeform today. In `Canvas.tsx`, card movement stores the pointer delta in scene coordinates and rounds the final saved position on drop. The canvas draws a visual grid, but the grid does not affect placement. Frame movement already rounds its delta, which is separate from card placement.

Build the placement mode control and its first two modes:

- Freeform, the current behavior. Cards follow the pointer without a placement snap.
- Grid snap. While dragging one or more cards, their preview positions snap to a configurable or documented grid spacing.

The mode affects the live drag preview and the coordinates saved on release. A multi-card drag preserves the selected cards' relative positions while applying the snap. Freeform stays available and remains the default unless the setting is stored per board or per user.

Decide during implementation whether grid spacing follows the rendered grid spacing, and how the control exposes mutually exclusive modes. Show the active mode without requiring a drag to discover it.

Adjacent alignment snapping was split into TKT-01M27EQ3JAFD3YZCPKA7F1RK2G (Snap a dragged card to nearby ticket edges and centers), which depends on the control this ticket builds. The grid case is cheap because the grid is already drawn. The adjacency case needs a zoom-aware threshold, and it should not hold up the mode control.

## Acceptance criteria

- [ ] The user can select freeform or grid snap, and the active mode is visible without starting a drag.
- [ ] Grid snap moves the drag preview and saved card positions to the documented grid spacing.
- [ ] The mode control accepts a further mode without rework, since adjacent alignment snapping arrives separately.
- [ ] Multi-card dragging preserves relative card positions while applying the selected snap mode.
- [ ] Freeform remains available and retains the current unsnapped placement behavior.
