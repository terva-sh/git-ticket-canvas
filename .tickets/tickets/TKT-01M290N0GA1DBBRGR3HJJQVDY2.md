---
schema: 3
id: TKT-01M290N0GA1DBBRGR3HJJQVDY2
title: Wrap a deep status lane into more than one column
type: task
status: ready
status_reason: The attribution this ticket asked for first is done and criterion 1 is ticked. Nobody is holding the rest, and in-progress without a claim is a strict-check warning, so it goes back on the queue.
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
  - ref: doc:card-density
    path: docs/readability-v1.md
claim: null
archive: null
created_at: 2026-09-11T19:55:57Z
updated_at: 2026-09-11T20:43:36Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

`autoPlace` puts every ticket of one status in a single column. The lane index picks x, the row counter picks y, and nothing bounds the column's depth. On the 30-card reference board the deepest lane holds 25 cards, so an arranged board measures 8361 px tall against at most 1890 px wide.

That one column is the shape of an arranged board, and it is why both pitch levers barely move. TKT-01M28ZMK8YJDW9CHSSC8BGZWB5 closed as no change after a compact-sized lane pitch cut the width by a third and moved the fit scale from 0.121 to 0.121. TKT-01M290E5VQE9CWSQF3WCG71806 can raise the scale to 0.168 at compact by tightening the row pitch, which is real but still leaves a board that is roughly four times taller than it is wide. A viewport is wider than it is tall. Wrapping a deep lane is the only one of the three that changes the aspect ratio rather than the scale, so it is the one that changes what a board looks like.

Order does not matter between this and the row pitch ticket and neither blocks the other, but whichever lands second has to re-measure, because both change the arranged geometry the other was measured against.

### Check this before choosing a threshold

`autoPlace` resolves a lane with `Math.max(0, statuses.indexOf(item.status))`, so any ticket whose status is not in the configured list lands in lane 0 rather than being reported. Part of a deep lane 0 may therefore be unknown statuses rather than genuine volume in the first configured status. The 25-deep lane on the reference board has not been attributed, and a wrap threshold chosen without attributing it would be tuned against a bug.

### What the design has to answer

- What decides the column count. A fixed cap per lane, a budget derived from the viewport's aspect, or a target depth. A cap is the only one of those that stays pure and stable.
- Lane origins stop being arithmetic. Today x is `lane * (LANE_W + LANE_GAP)`, which works because every lane is one column wide. Once a lane can be several columns, the origin of each lane has to accumulate the widths of the lanes before it, and lane 0 no longer implies x = 0 for the second column.
- Fill order, and it should be recorded rather than left to fall out. Column-major keeps a status readable top to bottom before the eye moves right. Row-major does not, and the sort is by id, so the two produce genuinely different boards.
- The slot reservation must survive. `autoPlace` increments the row counter for pinned tickets too and only then skips them, so pinning a frame's members does not relocate unrelated automatic cards. Wrapping has to keep that: a pinned ticket still consumes its slot, or pinning one card would reflow a whole lane.
- Wrapping must not read the card width or height, or it reintroduces the problem TKT-01M26Y3D0BAX6KGND8PYXXR918 ruled out. Derived positions recompute on every accepted store update, so a density-sensitive wrap would leave the board alone on a density toggle and then reflow it at the next unrelated update. A density-independent threshold avoids that entirely.

### Not yet checked

Whether wrapping interacts with the pen placement path in `placement.ts`, which allocates positions inside label-matching pens and is not active in production. Two placement systems that both decide where an automatic card goes need a stated relationship before either changes shape.

## Acceptance criteria

- [x] The 25-deep lane on the reference board is attributed: how many of those cards carry a configured status, and how many fell into lane 0 through the indexOf fallback.
- [ ] The column strategy is chosen and recorded, including what decides the column count and why it does not read card width or height.
- [ ] Fill order within a wrapped lane is chosen, recorded, and asserted by a test.
- [ ] Pinning a card still does not move unrelated automatic cards, asserted by a test rather than by inspection.
- [ ] A test records the arranged span, aspect ratio and fit scale at both densities, so a later change says which number moved.
- [ ] No card overlaps another on the 30-card reference board at either density.
- [ ] Manual card positions are unchanged by any density change, and no density change writes board data.
- [ ] The relationship between lane wrapping and the pen placement path in placement.ts is stated, even if the answer is that they do not interact yet.
- [ ] docs/readability-v1.md records the outcome.

## Notes

**agent:terva/mieli** at 2026-09-11T20:42:15Z

draft to ready: The user asked me to promote this and attribute the deep lane, which is the promotion.

**agent:terva/mieli** at 2026-09-11T20:43:18Z

Criterion 1 answered, and my suspicion when filing this was wrong. Nothing fell through the `indexOf` fallback.

The fixture holds 30 tickets: 25 `done` and 5 `draft`. Both are configured statuses, at index 5 and index 0 of `draft, ready, in-progress, blocked, review, done, archived`. So the 25-deep column is lane 5, the genuine `done` lane, and no ticket landed in lane 0 by accident. A wrap threshold chosen from this board would be tuned against real volume rather than against a bug, which is what the criterion existed to establish.

Counted straight from the committed fixture rather than from a running board, with `grep '^status:'` over `docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/.tickets`, so the number does not depend on the app rendering anything.

The same counts expose something the earlier lane-width measurement recorded without explaining. Only two of the seven lanes are occupied, lane 0 and lane 5, and lanes 1, 2, 3, 4 and 6 are empty. Lane origins are `index * 322`, so the arranged span is:

- full: 5 x 322 + 280 = 1890
- compact: 5 x 322 + 180 = 1790

Those are exactly the spans TKT-01M28ZMK8YJDW9CHSSC8BGZWB5 measured, which means 1610 px of a 1890 px board is empty lane offset and the cards contribute the remainder. That also explains why a compact-sized lane pitch appeared to cut the span by a third there: 5 x 202 + 180 = 1190. The saving came from shrinking the offset of five empty slots, not from narrower cards.

So there is a cheaper option than wrapping, and it belongs in this ticket's decision rather than in a separate one: lay out only the statuses that hold tickets, and the `done` lane moves from x = 1610 to x = 322. It is tempting and it has a cost that wrapping does not. Lane position would then depend on which statuses are occupied, so filing the first `ready` ticket would shift every lane to its right, and derived positions recompute on every accepted store update. That is the same class of delayed surprise the density work ruled out, arriving on ticket creation instead of on a density toggle. Predictable-but-wasteful may be the better trade, and whoever takes this ticket should decide it deliberately rather than inherit it.

Still open here: every design question in the description. What bounds the column count, how lane origins accumulate once a lane spans several columns, fill order, preserving the pinned slot reservation, and the relationship to the pen placement path. Nothing in the code changed.

**agent:terva/mieli** at 2026-09-11T20:43:36Z

in-progress to ready: The attribution this ticket asked for first is done and criterion 1 is ticked. Nobody is holding the rest, and in-progress without a claim is a strict-check warning, so it goes back on the queue.
