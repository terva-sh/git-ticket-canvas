---
schema: 3
id: TKT-01M38WN9EE8QVNR0E7B3B4QTZM
title: Hide the inspector's side resize handle when it is not beside the board
type: bug
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - touch
  - ui
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-24T05:01:53Z
updated_at: 2026-09-24T05:01:54Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

The inspector's resize handle, `.insp-resize` in `web/src/ui/Inspector.tsx` and `Inspector.css`, is a 10px column-resize strip along the inspector's left edge, with `touch-action: none`. It makes sense when the inspector sits beside the board. `Inspector.css` hides it under 700px, but not when a portrait tablet places the inspector as a sheet along the bottom (`html[data-inspector="bottom"]`, 820 CSS px wide). There it resizes the width of something that is already full width, and it swallows any touch that starts along the sheet's left edge, including a scroll.

Found while writing the inspector scroll test for TKT-01M38QP2CZEJ120PFDKMK3WTP1 (Pinch to zoom and pan with two fingers on the board): a drag started 6px from the sheet's left edge went to `.insp-resize` and scrolled nothing.

Hide it, or make it resize height, wherever the inspector is not beside the board. Key it on the inspector placement, not on a width media query.

## Acceptance criteria

- [ ] The resize handle is absent or inert wherever the inspector is not placed beside the board
- [ ] A touch drag starting at the left edge of a bottom sheet on the emulated tablet scrolls the inspector
- [ ] The beside placement keeps its resize handle, and its existing tests pass
