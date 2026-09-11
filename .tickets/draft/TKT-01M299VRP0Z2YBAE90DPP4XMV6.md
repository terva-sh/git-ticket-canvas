---
schema: 3
id: TKT-01M299VRP0Z2YBAE90DPP4XMV6
title: Drop empty status lanes from an arranged board
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
references:
  - ref: code:auto-place
    path: web/src/platform/canvas/geometry.ts
  - ref: doc:lane-depth
    path: docs/readability-v1.md
claim: null
archive: null
created_at: 2026-09-11T22:36:55Z
updated_at: 2026-09-11T22:36:55Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

`autoPlace` gives every configured status a lane whether or not any ticket carries that status, and an empty lane still occupies a full column of 322 px. On the 30-card reference board only `draft` and `done` hold tickets, so 1288 px of the arranged board's 3178 px span is the void between them. The render shows it as roughly a third of the board, empty, with dependency edges stretched across it.

This was considered and rejected inside TKT-01M290N0GA1DBBRGR3HJJQVDY2 (Wrap a deep status lane into more than one column), and that rejection was conditional. The board was then height-bound by more than four to one, so dropping the empty lanes changed the fit scale by exactly nothing: it freed width nobody was waiting on. The note said it would come back if a cap ever made a board width-bound.

Wrapping at six did that. Measured after implementation, the arranged board fits at 0.4997 by width against 0.5000 by height. Width is now half of what binds, so freeing 1288 px of it is no longer free of effect. That is the whole reason this ticket exists, and it is worth re-measuring rather than assuming: taking a third off the width when the two terms are even moves the binding to height, and the gain is bounded by how much slack height has.

### The cost that was named against it

Lane position would depend on which statuses hold tickets, so filing the first `ready` ticket would shift every lane to its right. Derived positions recompute on every accepted store update, so a person would see a board reflow on ticket creation. Wrapping has the same class of instability but a longer period: it reflows when a status crosses 6, 12 or 18 tickets, where dropping reflows when a status crosses 0 to 1.

That trade was judged not worth making for a gain of zero. It has to be judged again against a gain that is not zero, and the answer may still be no. Measure first.

### Worth considering instead

Reserving a narrow gap for an empty lane rather than a full column, so an occupied lane's position still moves when a status fills but moves by less. That keeps some of the positional stability and takes most of the void. Nobody has measured it.

## Acceptance criteria

- [ ] The fit scale, span and binding dimension are measured for the arranged board with empty lanes dropped, at both densities, against the same 1648x1023 budget the wrapping work used.
- [ ] The reflow cost is stated as a measurement rather than a prediction: how far lanes move when a status gains its first ticket, on the reference board.
- [ ] A narrow-gap alternative to dropping entirely is measured or explicitly ruled out with a reason.
- [ ] If the change lands, the empty-lane paragraph in docs/readability-v1.md under Lane depth is corrected rather than left contradicting the code.
- [ ] If the change does not land, the measurement is recorded on this ticket so the next person does not repeat it.
