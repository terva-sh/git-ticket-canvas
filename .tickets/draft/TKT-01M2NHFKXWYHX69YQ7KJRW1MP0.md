---
schema: 3
id: TKT-01M2NHFKXWYHX69YQ7KJRW1MP0
title: Choose canvas defaults from the viewport, and let them be overridden
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

The canvas is laid out for one shape of screen. Card width is a constant, the toolbar is a single row that runs off the side when there are enough controls, the inspector reserves a fixed 380px, and the starting zoom does not consider how much room there is. On a wide monitor that wastes the edges; on a laptop the toolbar crowds; on a tablet or a phone it is unusable rather than merely tight.

Pick sensible defaults from the viewport — its size, its aspect ratio, and whether it is a coarse pointer — and let somebody override each of them.

### What a default should be chosen from

- **Width and height**, for how many cards fit and whether the inspector can sit beside the board or has to cover it.
- **Aspect ratio**, because a wide short viewport wants a different starting frame from a tall narrow one even at the same area.
- **Pointer**, because drag targets, the frame handles and the card controls are sized for a mouse, and a finger needs more.

### What must stay true

An override is per person and lives in the browser, like the zoom level, not in the layout file. Two people on one board must not be able to change each other's toolbar.

A default is a starting point and never a lock: everything chosen automatically can be set by hand, and the choice is visible rather than mysterious, so somebody who dislikes it can find what to change.

### Related

`TKT-01M2NHFKWXXZQYG0MQ2V81MHD3` (the zoom control) owns the magnification half and its storage, and this should reuse whatever that establishes rather than inventing a second preference mechanism.

## Acceptance criteria

- [ ] Starting zoom, card density and inspector placement are chosen from viewport size and aspect ratio
- [ ] A coarse pointer gets targets sized for a finger
- [ ] Every automatic choice can be overridden by hand
- [ ] An override is per person and per browser, never in the layout file
- [ ] What was chosen automatically is visible, so somebody who dislikes it can find what to change
