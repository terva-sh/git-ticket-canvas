---
schema: 3
id: TKT-01M290N0GA1DBBRGR3HJJQVDY2
title: Wrap a deep status lane into more than one column
type: task
status: done
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
  - ref: doc:card-density
    path: docs/readability-v1.md
claim: null
archive: null
created_at: 2026-09-11T19:55:57Z
updated_at: 2026-09-11T22:37:14Z
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
- [x] The column strategy is chosen and recorded, including what decides the column count and why it does not read card width or height.
- [x] Fill order within a wrapped lane is chosen, recorded, and asserted by a test.
- [x] Pinning a card still does not move unrelated automatic cards, asserted by a test rather than by inspection.
- [x] A test records the arranged span, aspect ratio and fit scale at both densities, so a later change says which number moved.
- [x] No card overlaps another on the 30-card reference board at either density.
- [x] Manual card positions are unchanged by any density change, and no density change writes board data.
- [x] The relationship between lane wrapping and the pen placement path in placement.ts is stated, even if the answer is that they do not interact yet.
- [x] docs/readability-v1.md records the outcome.

## Implementation plan

Written after the attribution and the wrap-against-drop decision, both in the notes. Decision: wrap at a fixed row cap, recommended 6. Dropping empty lanes is rejected for now and returns only if a cap makes boards width-bound.

Measure a second board shape before fixing the constant. This fixture puts 25 of 30 tickets in one status, which is what makes it height-bound at more than four to one, and a store spread across seven statuses could be made worse by a cap of 6. The number in the table is defensible for this shape and unproven for any other.

1. `autoPlace` changes shape, not signature. It still takes `{id, status}` items, pinned positions and statuses, and it still reads no card width or height, which is what keeps a density toggle from reflowing the board.

   - A lane's column count becomes `ceil(occupancy / CAP)`, where occupancy counts every ticket in that status including pinned ones.
   - Lane origins stop being `index * (LANE_W + LANE_GAP)` and accumulate instead, because lanes now differ in width. Walk the configured statuses in order, carrying a running x.
   - Occupancy has to be counted in a first pass, since a lane's width is known only after every ticket is seen, and today's single pass assigns x while iterating.

2. Fill order is column-major: down to the cap, then start the next column to the right. A status stays readable top to bottom, which is how the lane reads today, and the id sort keeps it deterministic. Assert it in a test rather than leaving it implied, because row-major produces a board that looks reasonable and orders tickets differently.

3. The pinned slot reservation has to survive the rewrite. Today the row counter increments for a pinned ticket before the `continue` skips it, so pinning a frame's members never relocates unrelated automatic cards. With wrapping the same rule has to hold across a column boundary: a pinned ticket consumes its slot in its column, or pinning one card reflows the rest of its lane. This is the regression most likely to slip through, because nothing about it is visible until somebody pins a card in a deep lane.

4. `CAP` sits beside `LANE_W` and the row pitch as a module constant, with the measurement and the second-board caveat in a comment.

5. Tests. The arranged span, aspect ratio and fit scale at both densities, so a later change says which number moved. No card overlapping another. Pinning stability from point 3. Fill order from point 2. The existing `geometry.test.ts` cases assert exact coordinates from `lane * 322` and `row * 340`, so they will need rewriting against the new origins, and that rewrite is the moment to check that each one still asserts what it meant.

6. State the relationship to the pen placement path in `placement.ts`. Both decide where an automatic card goes, pens are not active in production, and the answer may well be that they do not interact yet. It needs saying either way.

7. `docs/readability-v1.md` records the outcome, replacing its current statement that nothing implements a tighter arrangement.

Not in scope. The row pitch is TKT-01M290E5VQE9CWSQF3WCG71806, and whichever of the two lands second has to re-measure, because both change the geometry the other was measured against.

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

**agent:terva/mieli** at 2026-09-11T22:15:05Z

Decided: wrap. Dropping empty lanes is rejected as a standalone change, and the arithmetic is not close.

Computed from the attributed board, 5 cards in lane 0 and 25 in lane 5, against the stage this app actually gets at the reference viewport: 2048 x 1023 after the toolbar, `fitView`'s 60 px padding on each side, a 340 px row pitch, a 322 px lane pitch and a tallest card of 249 px.

| option | spanX | spanY | fit scale | binds |
| --- | --- | --- | --- | --- |
| today | 1890 | 8409 | 0.120 | height |
| drop empty lanes | 602 | 8409 | 0.120 | height |
| wrap at 4 rows, 7 columns | 3822 | 1269 | 0.520 | width |
| wrap at 6 rows, 5 columns | 3178 | 1949 | 0.494 | height |
| wrap at 8 rows, 4 columns | 2856 | 2629 | 0.372 | height |
| wrap at 10 rows, 3 columns | 2534 | 3309 | 0.298 | height |
| wrap at 16 rows, 2 columns | 2212 | 5349 | 0.187 | height |
| wrap at 8 rows and drop empty lanes | 1568 | 2629 | 0.372 | height |

Dropping empty lanes removes 1288 px of horizontal emptiness and changes the fit scale by nothing. The board is height-bound by more than four to one and stays height-bound, so the width it frees is width nobody was waiting on. The last row is the same point from the other side: added to wrapping, it takes spanX from 2856 to 1568 and leaves the scale at 0.372.

That gives the conditional rather than a flat no. Dropping empty lanes pays only once the board is width-bound, which is exactly what a cap of 4 produces. If a later measurement lands on a cap that flips the binding dimension, this comes back as the next change rather than as a rejected idea.

Wrapping is the only option that moves the number, between 1.6x and 4.3x depending on the cap.

The cap I recommend is 6 rows, and the knee in that table is the reason. Between 4 and 6 the board crosses from height-bound to width-bound, so 4 buys 0.520 against 0.494 for 6, a 5% gain for spreading 25 cards across 7 columns instead of 5. Six also has a meaning rather than being a tuned constant: at the resulting scale of about 0.49, six rows of 340 px is 2040 scene px, which is close to 1023 device px of stage height, so the cap is one screenful of rows. It is a count, so it reads neither card width nor card height, which is what criterion 2 requires and what keeps a density toggle from reflowing the board.

The instability I raised when filing this applies to both options, and it is not a reason to prefer dropping. Wrapping makes a lane's width depend on how many tickets share that status, so a status crossing a multiple of the cap gains a column and shifts every lane to its right. Dropping makes a lane's position depend on whether a status has any tickets at all, so filing the first `ready` ticket shifts every lane to its right. Wrapping reflows at 6, 12, 18 tickets in a status; dropping reflows at 1. Wrapping pays four times the fit scale for its reflow, and dropping pays nothing for a more frequent one.

One board, one shape, and the caveat matters here more than usual. This store has 25 of 30 tickets in a single status, which is what makes it height-bound at all. A store spread evenly across seven statuses would be nearly square today, would gain far less from wrapping, and might be made worse by a cap of 6. Whoever implements this should measure a second board shape before choosing the constant, and the fixture is the wrong place to look for one.

Nothing is implemented. Criterion 2 is ticked for the decision and its record; the remaining criteria are the build.

**agent:terva/mieli** at 2026-09-11T22:15:47Z

in-progress to ready: The attribution and the wrap-against-drop decision are recorded, with criteria 1 and 2 ticked. The implementation needs a fresh context window, so it goes back on the queue rather than sitting in-progress unheld.

**agent:terva/mieli** at 2026-09-11T22:36:33Z

Implemented at a cap of 6. Two numbers in the decision note above are wrong, and the correction is the interesting part.

`autoPlace` now counts occupancy in a first pass, gives each lane `ceil(occupancy / 6)` columns, accumulates lane origins, and fills column-major. An empty lane keeps its one column, so occupied lanes sit exactly where they did before wrapping existed.

Measured on the reference board at the reference viewport, by the browser rather than by arithmetic:

| board | span | aspect | fit |
| --- | --- | --- | --- |
| unwrapped, full | 1890 x 8409 | 0.22 | 0.120 |
| wrapped, full | 3178 x 1926 | 1.65 | 0.500 |
| wrapped, compact | 3078 x 1901 | 1.62 | 0.506 |

The fit budget is 1648 x 1023, not the 2048 x 1023 stage the estimate assumed. `Canvas.viewport` reserves 400 px for an inspector that is not open, and `fitView` takes another 40 px of height. The estimate got 0.494 from the wrong width and the wrong height and landed within 1% of the right answer, which is luck rather than method.

The board lands on the knee, not beside it: 0.4997 by width against 0.5000 by height, three ten-thousandths apart, and compact tips it to height. So I did not assert which dimension binds, because no test should hold a property that thin. The suite asserts the balance between the two terms instead, which is what the cap was chosen for.

That balance retires the wrap-against-drop argument above. Dropping empty lanes was rejected because the board was height-bound by four to one and the width it freed was width nobody was waiting on. Width is now half of what binds, and the render shows why it matters: 1288 px of the 3178 is the void between the `draft` lane and the `done` lane, about a third of the board, with edges stretched across it. Filed as a follow-up rather than taken here.

Two things from the plan that did not hold. Point 5 expected the existing `geometry.test.ts` cases to need rewriting against new origins; none did, because every lane in them is under the cap and a one-column lane keeps `lane * 322`. And the deep-lane fixture never needed a second board shape to implement, only to settle the constant, which is still open.

Proved each new guard by making it fail. Moving the `continue` before the slot counter failed three tests, including one in `useMeasurements` I did not know covered placement. A row pitch of 200 made the overlap check name five colliding pairs. Registering the request listener before the arrange caught `PUT /api/layout`, so an empty list means no write rather than a listener watching nothing.

Gates: `just check`, `just browser-test` 67 passed 6 skipped, `just canvas-visual` 7 passed. The pixel baseline is unchanged, because the reference scene is not arranged.</text>
</invoke>

**agent:terva/mieli** at 2026-09-11T22:37:11Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-52 Fill order within a wrapped lane is chosen, recorded, and asserted by a test. — Column-major fill implemented in autoPlace and asserted in geometry.test.ts ('wraps a lane deeper than the cap into further columns, column-major'): six down column one, the seventh at x 322 y 0. 475 web tests pass.
- [x] task-53 Pinning a card still does not move unrelated automatic cards, asserted by a test rather than by inspection. — geometry.test.ts 'keeps a pinned slot reserved across a column boundary' pins slot 6 of 7 and asserts every other card keeps its unpinned position. Proved by making it fail: moving the `continue` before the counter increment failed 3 tests (both pinned cases plus useMeasurements' position guard); restored, 475 pass.
- [x] task-54 A test records the arranged span, aspect ratio and fit scale at both densities, so a later change says which number moved. — tests/browser/canvas-arrange.spec.ts records span, aspect and fit at both densities against a measured fit budget. Run: full 3178x1926 aspect 1.65 fit 0.500; compact 3078x1901 aspect 1.62 fit 0.506; budget 1648x1023, by width 0.4997, by height 0.5000. Unwrapped the same board is 1890x8409 aspect 0.22 fit 0.120.
- [x] task-55 No card overlaps another on the 30-card reference board at either density. — canvas-arrange.spec.ts checks every card pair at full and compact: no overlaps. Proved by making it fail: ROW_PITCH 200 produced 5 overlapping pairs by name; restored to 340, both tests pass.
- [x] task-56 Manual card positions are unchanged by any density change, and no density change writes board data. — canvas-arrange.spec.ts 'a density change on an arranged board moves no card and writes nothing': every card's translate is identical across full to compact to full, and the request listener records no non-GET request. Proved the listener works by registering it before the arrange, which caught PUT /api/layout; moved back after, both tests pass.
- [x] task-57 The relationship between lane wrapping and the pen placement path in placement.ts is stated, even if the answer is that they do not interact yet. — Stated in docs/readability-v1.md under Lane depth: no module in the pen chain (placement.ts, snapshots.ts, publications.ts, scene.ts) imports autoPlace or the lane constants, CARD_WIDTH is the only shared symbol, and no UI module calls the pen path in production. Verified by grep over web/src excluding tests.
- [x] task-58 docs/readability-v1.md records the outcome. — docs/readability-v1.md gains a Lane depth subsection: the cap and its reasoning, the measured span/aspect/fit table, column-major fill, empty lanes keeping a column, accumulating origins, the pinned reservation, the two corrections to the estimate, the pens relationship, and the second-shape caveat. The lane-width and row-pitch paragraphs are marked as pre-wrap measurements.

## Summary

`autoPlace` wraps a status lane at six cards and starts another column to its right. Fill order is column-major, lane origins accumulate, an empty lane still holds one column, and a pinned ticket consumes its slot across a column boundary. The cap is a count, so it reads no card width or height and a density change still re-derives nothing.

On the 30-card reference board the arranged span goes from 1890 x 8409 to 3178 x 1926, the aspect from 0.22 to 1.65, and the fit scale from 0.120 to 0.500. Compact sits at 3078 x 1901 and 0.506. Every number was measured in the browser.

The estimate that chose the cap was right by accident. It assumed a 2048 px stage, and the real fit budget is 1648 x 1023, because the stage reserves 400 px for a closed inspector and `fitView` takes 40 px of height. It also predicted the board would stay height-bound; it lands on the knee at 0.4997 by width against 0.5000 by height, and compact tips it to height. The suite asserts the balance between the two terms rather than which one binds.

That balance re-opens the option this ticket had rejected. TKT-01M299VRP0Z2YBAE90DPP4XMV6 (Drop empty status lanes from an arranged board) is filed as a draft, because 1288 px of the 3178 is now the void between the two occupied lanes and width is half of what binds.

Gates: `just check`, `just browser-test` 67 passed and 6 skipped, `just canvas-visual` 7 passed with the pixel baseline unchanged. New guards: `tests/browser/canvas-arrange.spec.ts` for column positions, depth against the cap, overlaps, span, aspect, fit balance and the no-write density toggle; three cases in `geometry.test.ts` for fill order, accumulated origins and the pinned slot across a boundary. Each was proved by making it fail.

Left open: the cap of 6 rests on one board shape that puts 25 of 30 tickets in a single status, and a store spread across seven statuses could be made worse by it. `docs/readability-v1.md` says so under Lane depth, and TKT-01M290E5VQE9CWSQF3WCG71806 has to re-measure the row pitch against this geometry rather than the unwrapped one.
