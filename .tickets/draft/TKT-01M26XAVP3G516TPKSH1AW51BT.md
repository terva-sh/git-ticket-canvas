---
schema: 3
id: TKT-01M26XAVP3G516TPKSH1AW51BT
title: Give labels project-wide colors and inherit them on cards
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
updated_at: 2026-09-11T05:22:40Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Give labels project-wide colors and let cards use those colors without losing the status signal. The ticket model exposes labels as an ordered `string[]`, and the canvas card has no body-color override today.

Add these rules:

- Each project-wide label definition can have a color. The setting applies wherever that label appears, on every board.
- If the ticket's first label has a color, the card body inherits that color. Do not scan later labels for a replacement color.
- If the first label has no color, or the ticket has no labels, the card body falls back to the status color.
- Keep the top strip of every card colored by status. The inherited or fallback color applies to the rest of the card body.
- Offer a shared accessible palette plus an advanced custom color. Provide a way to clear a color and return to the status fallback.

Colors must survive reloads and board changes. Define how contrast is checked for card text and controls, since an arbitrary custom color can make the current card text unreadable.

Two features were split out of this ticket. TKT-01M27EPDKKW6HGKNKS7A98EQER (Reorder a ticket's labels in the inspector) makes label order editable, which decides which label is first here. TKT-01M27EPDKTCF2GWG0BNZYP933V (Override a card's color per board) adds a per-board explicit card color that overrides this inheritance. This ticket assumes the existing array order and has no card-level override.

## Acceptance criteria

- [ ] Users can assign, clear, and edit a project-wide color for each label with a shared palette and an advanced custom color option.
- [ ] A card body uses only its first label's color for inheritance, then the status color when that label has no color or the ticket has no labels.
- [ ] A label color applies on every board wherever that label appears, and survives a reload and a board switch.
- [ ] The top strip remains the ticket's status color while the card body uses the inherited or fallback color.
- [ ] Text and controls remain readable for palette and custom colors, with a documented contrast rule and coverage for the fallback paths.
