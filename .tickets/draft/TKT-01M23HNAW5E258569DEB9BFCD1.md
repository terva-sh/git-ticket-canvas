---
schema: 3
id: TKT-01M23HNAW5E258569DEB9BFCD1
title: Convert canvas rendering and gestures to Preact
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels: []
assignees: []
milestone: null
parent: TKT-01M23HK5J08WDF7Q2EA9SG6C9V
origin: null
dependencies:
  - TKT-01M23HMQ1PGCP8XSJ7PDJGWD3E
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-09T16:57:47Z
updated_at: 2026-09-09T16:57:47Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Move ticket cards, dependency/parent edges, and canvas composition into Preact. Use refs and animation frames where needed for transient pointer motion, rather than rerendering forms on every movement. Preserve geometry semantics and remove the legacy manual renderer once Preact owns the canvas.

## Acceptance criteria

- [ ] Preact owns cards, edges, and canvas composition; the legacy renderer and duplicate global state are removed.
- [ ] Pan, cursor-centered zoom, fit, multi-selection drag, pinning, and dependency direction pass browser tests.
- [ ] Pointer capture, pointer cancellation, unmount cleanup, and measured card heights do not leave stuck gestures or misaligned edges.
- [ ] Dragging has a defined save/failure policy; polling and pending saves cannot overwrite an active gesture or write it to another board.
- [ ] Read-only mode cannot persist ticket or placement changes, and transient feedback does not imply a successful write.
- [ ] Representative-board browser checks record responsiveness and confirm pointer movement does not rerender the inspector each frame.
