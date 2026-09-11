---
schema: 3
id: TKT-01M27ENKEA6WKJRM8P9Z5BN8NF
title: Choose a dependency or parent relationship when dragging a link
type: task
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
dependencies:
  - TKT-01M26VTNV4J86BN6ZAA4CHB10D
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-11T05:22:27Z
updated_at: 2026-09-11T05:35:53Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

The link drag has one relationship meaning. It always creates a `depends on` edge. The canvas already renders two kinds: dependency edges from `ticket.dependencies` and dashed `parent of` edges from `ticket.parent`. A user who wants to file a card under an epic has to open the inspector to do it.

Add a relationship choice to the drag interaction, with dependency and parent options. Dependency keeps its current direction, where the source is the prerequisite and the target is the dependent. Parent has no established direction in this gesture, so the interaction must show which ticket becomes the parent and which becomes the child before the drop commits, rather than deciding silently and leaving the user to read the result off the edge.

Split out of TKT-01M26VTNV (Repair drag-to-link dependency updates and persistence). That ticket repairs the save-and-reload path for the edge the gesture already creates. This one adds the second kind on top of a path that works.

## Acceptance criteria

- [ ] The drag interaction lets the user choose a dependency or parent relationship before committing.
- [ ] The interaction shows which ticket becomes the parent and which becomes the child before the drop commits.
- [ ] A parent relationship updates the correct ticket's parent field and renders as the existing parent edge after reload.
- [ ] Choosing a relationship kind is reachable from the keyboard and reports the current choice to a screen reader.
- [ ] A parent drag that would create a cycle or reparent across an existing epic is refused with a visible reason.

## Notes

**agent:terva/mieli** at 2026-09-11T05:35:53Z

From the repair this ticket depends on, TKT-01M26VTNV4J86BN6ZAA4CHB10D.

The dependency drop looked broken because `Relationships` defaults to `Selected` and `Edges.tsx` draws an edge only when the selection holds an endpoint. The link gesture selected nothing, so a saved edge was invisible. The fix was to select the dependent on success in `App.tsx` `link()`.

Parent edges go through the same mode filter, so a parent drag will look equally broken unless it selects one of its endpoints on success. Select the child, which is the ticket whose `parent` field the operation writes, matching what the dependency path does.

The regression guard for this is 'a dependency drag leaves the new edge visible in the default relationship mode' in `tests/browser/canvas.spec.ts`. A parent version of that test belongs with this work.
