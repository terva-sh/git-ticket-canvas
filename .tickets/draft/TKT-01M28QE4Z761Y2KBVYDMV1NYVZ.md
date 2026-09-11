---
schema: 3
id: TKT-01M28QE4Z761Y2KBVYDMV1NYVZ
title: Route or bundle canvas edges through dense crossings
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
parent: TKT-01M26YEEBGPYAFDNF6TTM2JVD7
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-11T17:14:55Z
updated_at: 2026-09-11T17:14:55Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

TKT-01M26Y32BZHJFXFGRYZ37TWYFP (Reduce relationship clutter in the all-edges view) reduced clutter by changing what edges paint: one label at a time, unrelated edges faded to 0.28, and a colour for parent edges. It deliberately did not change where edges go.

So the crossings are still there. On the reference board the right-side cluster has 16 of the 41 relationships landing on 7 cards, and every one of them is a bezier drawn straight from source to target with no awareness of the others. Tracing one of them through the cluster still means hovering it, which works with a pointer and does nothing for a reader looking at a screenshot or a printout.

The candidates the parent ticket listed and this one inherits: route edges around cards rather than across them, bundle edges that share an endpoint or a corridor, and offset parallel edges between the same pair so they do not draw on top of each other.

Weigh this against the alternative of not doing it. Hover plus fading already answers "which edge is this", and routing is the kind of change that trades a simple, predictable curve for a layout algorithm with its own failure modes. Worth doing only if the dense scene is still hard to read for someone who cannot hover.

`tests/browser/canvas-density.spec.ts` is the gate. Routing moves pixels and keeps counts, so expect a new `baseline-history.json` entry rather than changed constants. Pull the geometry recorded in `canvas-baseline.json` to measure crossings before and after, because a claim that routing helped should carry a number.

## Acceptance criteria

- [ ] A measured crossing count for the reference scene, before and after, recorded on the ticket.
- [ ] Edges between the same pair of cards no longer draw on top of each other.
- [ ] The change keeps the 41 edges and 30 card positions the structural test asserts, and lands a new baseline entry saying what moved.
- [ ] Routing degrades predictably on a board where no clear corridor exists, rather than producing a worse path than the straight curve.
