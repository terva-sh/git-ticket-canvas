---
schema: 3
id: TKT-01M27EPDKKW6HGKNKS7A98EQER
title: Reorder a ticket's labels in the inspector
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - idea
  - ui
  - labels
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
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

A ticket's labels are an ordered `string[]`, but nothing in the UI lets a user set that order. The order currently falls out of however the labels were added.

Make the order editable in the ticket inspector, persist it, and use it everywhere labels are displayed, so the card, the inspector, and any future filter row agree. The first label is the ticket's primary label.

Split out of TKT-01M26XAVP (Give labels project-wide colors and inherit them on cards). That ticket makes the card body inherit the first label's color, which gives the order a visible consequence. The reordering control is useful on its own and does not need colors to ship.

## Acceptance criteria

- [ ] Users can reorder a ticket's labels in the inspector.
- [ ] The persisted order appears consistently in every label display, including the card and the inspector.
- [ ] The order survives a reload and a board switch.
- [ ] Reordering is reachable from the keyboard and announces the new position to a screen reader.
- [ ] Reordering writes only the label order and does not alter the label set.
