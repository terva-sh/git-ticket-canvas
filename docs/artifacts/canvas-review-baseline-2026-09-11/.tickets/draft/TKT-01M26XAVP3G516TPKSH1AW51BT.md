---
schema: 3
id: TKT-01M26XAVP3G516TPKSH1AW51BT
title: Color cards from ordered labels with board overrides
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - idea
  - ui
  - labels
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
created_at: 2026-09-11T00:19:30Z
updated_at: 2026-09-11T00:19:30Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Give labels project-wide colors and let cards use those colors without losing the status signal. The current ticket model exposes labels as an ordered `string[]`, while the board card layout stores position and display fields. The canvas card currently has no body-color override.

Add these rules:

- Each project-wide label definition can have a color. The setting applies wherever that label appears, on every board.
- Users can reorder a ticket's labels in the inspector. Persist that order and use it everywhere labels are displayed. The first label is the primary label for color inheritance.
- If the first label has a color, the card body inherits that color. Do not scan later labels for a replacement color.
- If the first label has no color, or the ticket has no labels, the card body falls back to the status color.
- A card can set its own explicit color. Store that override in the board layout, so the same ticket can have different overrides on different boards. The explicit card color wins over inherited label color and status fallback.
- Keep the top strip of every card colored by status. The chosen or inherited color applies to the rest of the card body.
- Offer a shared accessible palette plus an advanced custom color for both label colors and card overrides. Provide a way to clear a color and return to inheritance or status fallback.

The implementation should preserve colors and label order through reloads and board changes. It should define how contrast is checked for card text and controls, since arbitrary custom colors can make the current card text unreadable.

## Acceptance criteria

- [ ] Users can assign, clear, and edit a project-wide color for each label with a shared palette and an advanced custom color option.
- [ ] Users can reorder labels in the ticket inspector, and the persisted order appears consistently in every label display.
- [ ] A card body uses only its first label's color for inheritance, then the status color when that label has no color or the ticket has no labels.
- [ ] A board-specific explicit card color overrides inherited and fallback colors, survives reload, and can differ for the same ticket on different boards.
- [ ] The top strip remains the ticket's status color while the card body uses the explicit, inherited, or fallback color.
- [ ] Text and controls remain readable for palette and custom colors, with a documented contrast rule and coverage for the fallback paths.
