---
schema: 3
id: TKT-01M2K39FQJ84PT3WVFF9PN0S0R
title: Offer the move in the browser with its consequences shown first
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - ui
  - canvas
assignees: []
milestone: null
parent: TKT-01M2K38J5NGC6MNZKKEX285B61
origin: null
dependencies:
  - TKT-01M2K39FN01J4VENBHW9CP13ZB
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-15T17:54:29Z
updated_at: 2026-09-16T20:44:24Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

### What

A way to send a card to another store, showing what the target would impose before anything is written.

### Shape

Choosing the target reuses the store browser rather than growing a second list of stores. The consequences come from the preview endpoint and are shown grouped, with a count, because thirteen kinds of change listed flat is a wall rather than a warning.

Nothing is written until the person confirms. The preview writes nothing by construction, so the dialog can open, be read, and be abandoned at no cost, and it should say so.

### Keyboard

The dialog follows the store browser: focus moves in on open, Escape closes and abandons, focus returns to the card.

### Depends on the preview, not on the apply

The dialog is buildable and reviewable against the preview alone, showing a confirm button that is not yet wired. That order keeps a half-built write path out of the browser.

## Acceptance criteria

- [ ] A card can be sent to another store, with the target chosen from the existing store browser
- [ ] The changes the target would impose are shown grouped and counted before anything is written
- [ ] Abandoning the dialog writes nothing, and the dialog says that opening it is free
- [ ] Focus moves into the dialog on open, Escape abandons, and focus returns to the card
- [ ] Covered by a browser test against the two-store fixture
