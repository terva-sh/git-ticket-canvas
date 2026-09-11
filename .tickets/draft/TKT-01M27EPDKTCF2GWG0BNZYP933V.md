---
schema: 3
id: TKT-01M27EPDKTCF2GWG0BNZYP933V
title: Override a card's color per board
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - idea
  - ui
  - canvas
  - labels
assignees: []
milestone: null
parent: null
origin: null
dependencies:
  - TKT-01M26XAVP3G516TPKSH1AW51BT
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-11T05:22:54Z
updated_at: 2026-09-11T05:22:54Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Let a card carry its own explicit color, stored in the board layout rather than on the ticket. The same ticket can then read differently on two boards, which is the point: a card that is background on one board can be the one you are watching on another.

The explicit card color wins over the inherited label color and over the status fallback. The top strip stays the status color. Clearing the override returns the card to inheritance, then to the status fallback.

Split out of TKT-01M26XAVP (Give labels project-wide colors and inherit them on cards), which supplies the palette, the custom-color control, the clear affordance, and the contrast rule this ticket reuses. It depends on that work rather than duplicating the color picker.

## Acceptance criteria

- [ ] A board-specific explicit card color overrides the inherited label color and the status fallback.
- [ ] The override is stored in the board layout, so the same ticket can carry different overrides on different boards.
- [ ] The override survives a reload and a board switch.
- [ ] Clearing the override returns the card to inherited color, then to the status fallback.
- [ ] The top strip remains the ticket's status color while the body uses the override.
- [ ] Card text and controls stay readable under the override, by the contrast rule the label-color ticket documents.
