---
schema: 3
id: TKT-01M26Y32BZHJFXFGRYZ37TWYFP
title: Reduce relationship clutter in the all-edges view
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
created_at: 2026-09-11T00:32:43Z
updated_at: 2026-09-11T00:32:43Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

The screenshot shows 30 cards with Relationships set to All. The right-side cluster becomes difficult to trace because many solid dependency curves and dashed parent curves converge through the same area, and each edge carries a text label. `Toolbar.tsx` currently offers only All, Selected, and None, while `Edges.tsx` renders a label and curve for every visible relationship.

Improve the all-edges view without removing access to any relationship. Candidate behaviors include showing edge labels on hover or focus instead of on every edge, highlighting one edge and its endpoints while dimming unrelated edges, routing or bundling crossings where possible, and using a stronger visual distinction for dependency versus parent edges. Keep keyboard and screen-reader access to the relationship meaning, and keep the existing Selected and None modes useful for focused work.

Use the screenshot's dense right-side cluster as a regression fixture. The board should remain readable at the fit-to-view scale with 30 cards and the current relationship mix.

## Acceptance criteria

- [ ] The all-edges view remains usable at fit-to-view scale on a board with 30 cards and mixed dependency and parent relationships.
- [ ] Users can identify a relationship's source, target, and kind without reading overlapping labels on neighboring edges.
- [ ] The view provides a clear focus state for a hovered, keyboard-focused, or selected relationship and dims unrelated edges without hiding them permanently.
- [ ] Dependency and parent relationships remain distinguishable in the edge rendering and through an accessible text or semantic equivalent.
- [ ] Selected and None relationship modes continue to provide focused and hidden views without regressions.
