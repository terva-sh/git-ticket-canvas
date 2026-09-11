---
schema: 3
id: TKT-01M27EQ3JAFD3YZCPKA7F1RK2G
title: Snap a dragged card to nearby ticket edges and centers
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
dependencies:
  - TKT-01M26TC30QBXM1CR445HC9EHB9
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-11T05:23:17Z
updated_at: 2026-09-11T05:23:17Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Add adjacent alignment as a third placement mode. While dragging, a card's edges or centers snap to matching x or y alignments from nearby tickets, so a row or column lines up without nudging every card by hand.

The snap applies to the live drag preview and to the coordinates saved on release. A multi-card drag preserves the selected cards' relative positions while the group aligns.

Decide during implementation whether the snap threshold scales with zoom, which is the part that makes this harder than grid snap. A fixed scene-unit threshold feels sticky when zoomed out and useless when zoomed in. Decide too whether a snap shows an alignment guide, since a snap the user cannot see is hard to tell from a drag that slipped.

Split out of TKT-01M26TC30 (Add grid and freeform placement modes for card drags), which builds the mode control and grid snap. This mode plugs into that control.

## Acceptance criteria

- [ ] Adjacent alignment appears as a third choice in the placement mode control.
- [ ] A dragged card aligns to a nearby ticket's matching edge or center within the documented threshold.
- [ ] The threshold behaves sensibly across the zoom range, by a documented rule.
- [ ] A multi-card drag preserves relative card positions while the group snaps.
- [ ] The user can see which alignment a snap engaged before releasing the pointer.
