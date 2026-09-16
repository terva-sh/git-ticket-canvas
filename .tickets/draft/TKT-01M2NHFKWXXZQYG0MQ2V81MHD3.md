---
schema: 3
id: TKT-01M2NHFKWXXZQYG0MQ2V81MHD3
title: Give the canvas a zoom control that remembers where you left it
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - ui
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T16:40:59Z
updated_at: 2026-09-16T16:41:10Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

Zoom is scroll-only. There is no control that shows the current level, no way to get back to 1:1 without scrolling until it looks right, and the level is forgotten on every reload, so a board opened twice is a board at two sizes.

`Fit` exists and is a different thing: it frames everything, which is what you want when you have lost the board and not what you want when you have chosen a working magnification.

### What to add

A magnifier control in the toolbar: the current level, a way in and out, and a reset to 1:1 distinct from `Fit`.

Remember the level per board in browser storage. It is a view preference rather than anything about the work, so it belongs to the browser and not to the layout file: writing it to `.tickets/canvas/*.yml` would put a diff in the repository every time somebody scrolled, and would make two people looking at one board fight over one number.

### Relationship to TKT-01M2ND1RNXB8941M21MRZRJDN2

That ticket makes density follow zoom, so these two touch the same value from opposite ends. This one is the control and the memory; that one is what the cards do as it changes. Neither blocks the other, and whichever lands second should check that a restored zoom level applies the right density on the first paint rather than after the first scroll.

## Acceptance criteria

- [ ] A control shows the current zoom level and changes it
- [ ] Reset returns to 1:1, and is distinct from Fit
- [ ] The level is remembered per board across a reload
- [ ] The level is in browser storage and never in the layout file
