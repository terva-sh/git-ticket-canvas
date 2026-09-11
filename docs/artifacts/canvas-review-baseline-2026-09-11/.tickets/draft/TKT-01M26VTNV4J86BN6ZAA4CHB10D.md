---
schema: 3
id: TKT-01M26VTNV4J86BN6ZAA4CHB10D
title: Repair drag-to-link updates and support parent relationships
type: bug
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - idea
  - ui
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
created_at: 2026-09-10T23:53:11Z
updated_at: 2026-09-10T23:53:11Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Dragging the connection handle from one ticket onto another does not reliably update the visible relationship or persist it. Reloading the page still leaves the child ticket without the connection. The canvas calls `onLink(gesture.from, gesture.to)` after drop, and `App.tsx:236-241` currently patches the target with `{ op: 'addDependency', id: from }`, but the result does not leave the board in the state the user just edited.

The drag operation also has only one relationship meaning. It always creates a `depends on` edge. The canvas already renders two relationship kinds: dependency edges from `ticket.dependencies` and dashed `parent of` edges from `ticket.parent`. A user needs a way to choose which kind of relationship a drag creates, including setting the dropped ticket's parent rather than adding a dependency.

Repair the full path: show the new edge and updated ticket metadata immediately after a successful drop, save the relationship through the API, surface a failure instead of silently leaving a ghost or stale card, and confirm that a reload reconstructs the same edge. Add a relationship choice to the drag interaction, with dependency and parent options, while preserving the existing source-to-target direction for `depends on`: the source is the prerequisite and the target is the dependent. For a parent relationship, define and show which ticket becomes the parent and which becomes the child before committing.

## Acceptance criteria

- [ ] A successful dependency drag updates the affected ticket and visible edge without a page reload.
- [ ] A dependency created by dragging persists through the API and is present after reloading the board.
- [ ] A failed relationship save reports an error and does not leave the UI claiming that the edge was saved.
- [ ] The drag interaction lets the user choose a dependency or parent relationship before committing.
- [ ] A parent relationship updates the correct ticket's parent field and renders as the existing parent edge after reload.
