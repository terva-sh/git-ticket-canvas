---
schema: 3
id: TKT-01M24411DDC98WXKT2MY2FMHQN
title: Add persistent canvas grouping frames
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
parent: null
origin: null
dependencies: []
blocks_on: none
references:
  - ref: design:canvas-organization
    path: docs/canvas-organization-design.md
  - ref: code:layout-store
    path: internal/layout/layout.go
  - ref: code:canvas
    path: web/src/ui/Canvas.tsx
  - ref: code:layout-types
    path: web/src/platform/tickets/types.ts
  - ref: doc:gesture-ownership
    path: docs/preact-canvas.md
claim: null
archive: null
created_at: 2026-09-09T22:18:45Z
updated_at: 2026-09-09T22:18:45Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Add named rectangular frames behind ticket cards so users can annotate an existing spatial arrangement. Follow the Frames section of docs/canvas-organization-design.md. Frames are board metadata and must not modify ticket Markdown.

### Scope
Provide rectangle creation, title editing, move/resize/delete controls, a muted color palette, and undo for frame operations. Persist frame identity, bounds, title, and appearance per board with deterministic serialization and compatibility for existing card-only layouts. Keep this independent of readability changes and leave label routing to its own ticket.

### Promotion check
Confirm the recommended visual-only scope with the user: moving a frame moves its boundary, not enclosed tickets. Confirm frame undo scope before promotion. Explicit membership, nested frames, collapse, group movement, and freehand drawing are not part of this draft. Write the implementation plan after claim and inspection.

## Acceptance criteria

- [ ] Users can create, name, recolor, move, resize, and delete rectangular frames behind cards using discoverable controls that remain usable by keyboard.
- [ ] Frame operations support the approved undo scope; cancellation and failed saves do not leave false persisted state.
- [ ] Frame IDs, titles, bounds, and appearance round-trip per board with deterministic serialization; existing card-only boards retain all saved ticket coordinates.
- [ ] Drawing, moving, resizing, and deleting frames never change ticket labels, relations, Markdown, or saved card positions; visual-only movement is explained in the UI.
- [ ] Frame controls coexist with card selection, pan, zoom, and dependency gestures; Fit includes frame geometry.
- [ ] Read-only mode prevents frame writes, and board switches or delayed saves cannot apply frame edits to the wrong board.
- [ ] Go, component, and browser tests cover persistence, compatibility, undo, cancellation, failed saves, board switching, and unchanged ticket data while preserving canvas responsiveness.

## Definition of done

- [ ] Record confirmed frame movement/undo semantics and layout compatibility behavior.
- [ ] Run just check and embedded browser checks; regenerate committed frontend assets through the existing build process.
