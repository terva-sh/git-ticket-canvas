---
schema: 3
id: TKT-01M26Y3D0BAX6KGND8PYXXR918
title: Add a compact card density mode for large boards
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - idea
  - ui
  - canvas
  - readability
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-11T00:32:54Z
updated_at: 2026-09-11T00:32:54Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

The screenshot fits 30 cards on the canvas, but the cards become small while each one still shows the title, status, priority, blocker state, labels, ownership, acceptance progress, ticket ID, type, and placement mode. The full metadata is useful in the inspector, but it competes with the board-level task and relationship view.

Add a visible card density or detail setting for the canvas. A compact mode should keep the title, status, selection state, relationship target state, and enough label or blocker information to support scanning, while moving secondary metadata to the inspector or an expand/hover/focus view. Keep the setting independent from browser zoom and preserve the current full card presentation as an option.

Use the screenshot's 30-card fit-to-view board as a density regression fixture. Verify that compact cards remain distinguishable, readable, selectable, and compatible with relationship edges and the existing label disclosure control.

## Acceptance criteria

- [ ] The canvas exposes a visible density or detail control with full and compact presentations.
- [ ] Compact cards retain readable titles, status, selection and link-target states, and the metadata needed to identify blockers or labels during scanning.
- [ ] Secondary metadata remains available through the inspector or an explicit expand, hover, or focus interaction.
- [ ] The full presentation remains available and its current inspector and relationship behavior does not regress.
- [ ] A 30-card fit-to-view board remains distinguishable and usable in compact mode, including cards connected by dependency and parent edges.
