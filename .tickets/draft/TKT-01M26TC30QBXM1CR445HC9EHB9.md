---
schema: 3
id: TKT-01M26TC30QBXM1CR445HC9EHB9
title: Add grid, adjacent alignment, and freeform snap modes
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
updated_at: 2026-09-10T23:27:44Z
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

Add a placement mode that lets the user choose one of three behaviors:

- Freeform, the current behavior. Cards follow the pointer without a placement snap.
- Grid snap. While dragging one or more cards, their preview positions snap to a configurable or documented grid spacing.
- Adjacent alignment snap. While dragging, card edges or centers snap to matching x or y alignments from nearby tickets, so a row or column can be lined up without manually nudging every card.

The mode should affect the live drag preview and the coordinates saved when the pointer is released. Multi-card drags should preserve the selected cards' relative positions while applying the snap. The current freeform behavior should remain available and should be the compatibility-safe default unless the setting is explicitly stored per board or per user.

Decide during implementation whether grid spacing follows the rendered grid spacing, whether adjacency snapping has a threshold that scales with zoom, and how the UI exposes the mutually exclusive modes. Show the active mode without requiring a drag to discover it.

## Acceptance criteria

- [ ] The user can select freeform, grid snap, or adjacent alignment snap, and the active mode is visible.
- [ ] Grid snap moves the drag preview and saved card positions to the documented grid spacing.
- [ ] Adjacent alignment snap aligns a dragged card to a nearby ticket's matching edge or center within the documented threshold.
- [ ] Multi-card dragging preserves relative card positions while applying the selected snap mode.
- [ ] Freeform remains available and retains the current unsnapped placement behavior.
