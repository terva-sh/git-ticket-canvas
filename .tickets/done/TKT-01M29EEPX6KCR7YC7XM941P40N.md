---
schema: 3
id: TKT-01M29EEPX6KCR7YC7XM941P40N
title: Lower the lane cap from 6 to 5
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
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
created_at: 2026-09-11T23:57:10Z
updated_at: 2026-09-12T00:12:08Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

TKT-01M29E2EVNTD69ACSY0W6TRK52 (Measure the lane cap against board shapes other than the fixture) measured six board shapes and found `LANE_CAP` of 6 beaten by 5 on every one of them.

| shape | cards | fit at 6 | fit at 5 |
| --- | --- | --- | --- |
| even, 5 per status | 30 | 0.7219 | 0.7219 |
| even, 10 per status | 60 | 0.4181 | 0.4181 |
| 20 in one status | 30 | 0.5538 | 0.5538 |
| 15 and 15 | 30 | 0.6068 | 0.7073 |
| all 30 in one status | 30 | 0.6068 | 0.7219 |
| eight cards | 8 | 0.8911 | 0.8911 |

A cap of 5 ties on the flat shapes and wins 14% to 16% on the ones with a deep lane. The reference fixture agrees, at 0.707 against 0.605. A cap of 6 never wins on any shape measured.

Six was one screenful of rows when the row pitch was 340 and the fit was near 0.49. The pitch is 269 now and the fit near 0.72, so one screenful is five rows. The rule that chose the number is intact and its arithmetic is not.

### What this touches

One constant, and then the numbers it moves. `canvas-arrange.spec.ts` records the column positions, the depth per column, the row positions, the span at both densities and the fit budget ratio, and every one of those changes. That spec is the reason this is not a one-line change, and it is also what makes the change safe.

Re-measure rather than deriving the new expectations from the table above. Four separate measurements in this area have expired when a later layout change landed, including two of mine that were correct when written.

### The cost to weigh

A lane reflows when it crosses a multiple of the cap, so a cap of 5 reflows at 5, 10 and 15 tickets where 6 reflows at 6, 12 and 18. Slightly more often, on a board that already reflows when a status gains its first ticket.

## Acceptance criteria

- [x] LANE_CAP is 5 and its comment carries the measurement rather than the superseded screenful arithmetic.
- [x] canvas-arrange.spec.ts is re-measured in the browser, not derived from the recorded table, and its column, row, span and fit expectations updated.
- [x] No card overlaps another on the 30-card reference board at either density.
- [x] The render is looked at, not only the assertions, since a taller-than-expected card is what the thin pitch clearance risks.
- [x] docs/readability-v1.md records the new numbers and drops the note saying the code still says 6.

## Notes

**agent:terva/mieli** at 2026-09-12T00:03:51Z

draft to ready: The user asked me to pick this up and lower the cap, which is the promotion.

**agent:terva/mieli** at 2026-09-12T00:11:48Z

Implementation record.

Re-measured in Chromium rather than derived from the table in the description, and one thing the table could not have predicted. The annotation reads: full 2210x1302 aspect 1.697 fit 0.707; compact 2110x1277 aspect 1.652 fit 0.732; budget 1648x1023 binds width by width 0.7073 by height 0.7194.

The binding flipped. Trading a row for a column made width the binding dimension where height bound the board at a cap of 6. Two assertions in `canvas-arrange.spec.ts` rested on that: `bound.binds` was `'height'`, and `byWidth / byHeight > 1.1` asserted the width slack that any further empty-lane gap would come out of. There is no slack now. The two sides are 1.7% apart, so the spec asserts how far the fit sits from the knee, under 1.1 either way, and lets the annotation carry which dimension each run saw. Which side binds turns on measured card heights, and CI renders other fonts, so asserting the dimension would have been a font-dependent assertion dressed as a geometric one.

What that costs, measured: the four empty-lane gaps were free while height bound the board, and they now cost 1.7% of the fit scale, 0.7073 with them against the 0.7194 that dropping them reaches. Recorded in `docs/readability-v1.md` rather than reopened. A visible boundary between `draft` and `done` is worth 1.7%, and the render is the evidence for that, but the next gap will be charged the same way and the doc says so.

One unit test changed more than its numbers. `keeps a pinned slot reserved across a column boundary` pinned the sixth ticket, which was the last slot of the first column at a cap of 6 and is the first slot of the second at a cap of 5. Updating only the expected coordinates would have left it pinning inside a column and still passing, so it pins the fifth ticket now and tests what its name says.

The height-aware packing comparison in the doc, 0.6307 and 0.7174 against 0.605 and 0.614, was measured at a cap of 6 on both sides. The static pitch now reaches 0.707 and 0.732, past both packing numbers, but nobody has measured packing at the new cap. The doc marks that comparison stale rather than reversed.

Gates: `just web-test` 476 passed, `just check` clean including `git ticket check --fix --dry-run --strict`, `just browser-test` 67 passed and 6 skipped, `just canvas-visual` 7 passed. The pixel baseline scene is not arranged, so placement does not reach it.

**agent:terva/mieli** at 2026-09-12T00:12:05Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-76 LANE_CAP is 5 and its comment carries the measurement rather than the superseded screenful arithmetic. — LANE_CAP = 5 in web/src/platform/canvas/geometry.ts, comment rewritten to carry the six-shape measurement. Three unit tests updated for the new column boundary; just web-test 476 passed / 30 files.
- [x] task-77 canvas-arrange.spec.ts is re-measured in the browser, not derived from the recorded table, and its column, row, span and fit expectations updated. — Re-measured in Chromium via just browser-test tests/browser/canvas-arrange.spec.ts (2 passed). Annotation reads: full 2210x1302 aspect 1.697 fit 0.707; compact 2110x1277 aspect 1.652 fit 0.732; budget 1648x1023 binds width by width 0.7073 by height 0.7194. Depth [5,5,5,5,5,5], rows [0,269,538,807,1076], columns unchanged. The binding flipped from height to width, so the old binds/ratio pair is replaced by a knee-distance assertion.
- [x] task-78 No card overlaps another on the 30-card reference board at either density. — canvas-arrange.spec.ts asserts overlaps(full) and overlaps(compact) are both empty on the 30-card reference board, and both passed in the run above. The overlap check compares measured card heights, so it is the clearance test the 269 pitch needs.
- [x] task-79 The render is looked at, not only the assertions, since a taller-than-expected card is what the thin pitch clearance risks. — Captured the arranged reference board in Chromium at the reference viewport and viewed the PNG. Six columns of five, even row clearance, no card touching the one below it, the 320px draft-to-done gap visible as the wide column break, and the bottom row clear of the hint text. Throwaway spec and PNG deleted.
- [x] task-80 docs/readability-v1.md records the new numbers and drops the note saying the code still says 6. — docs/readability-v1.md: Lane depth now says five, the measurement table gains the cap-5 rows (2210x1302 at 0.707 full, 2110x1277 at 0.732 compact), the empty-lane gap is recorded as costing 1.7% now that width binds, the knee paragraph carries 0.7073 against 0.7194, the height-aware packing comparison is marked as measured at cap 6 and stale, and "The code still says 6" is replaced by what landed. No line over 84 characters, no em dashes, no curly quotes.

## Summary

`LANE_CAP` in `web/src/platform/canvas/geometry.ts` is 5. On the reference board that is six columns of five in place of five columns of six and a stray: spanY 1571 down to 1302, fit 0.605 up to 0.707 at full and 0.614 up to 0.732 at compact, with the column positions unchanged. Measured in Chromium, not derived from the sweep the ticket was filed on.

Trading a row for a column made width the binding dimension, which the sweep could not show. `canvas-arrange.spec.ts` had two assertions resting on height binding with width slack to spare; there is no slack now, the two sides are 1.7% apart, and the spec asserts distance from the knee instead. The four empty-lane gaps were free under the old binding and now cost 1.7% of the scale. That price is recorded in `docs/readability-v1.md`, along with the cap-5 rows of the measurement table and a note that the height-aware packing comparison was measured at the old cap.

Three geometry unit tests moved. One of them, the pinned-slot test, pins the fifth ticket now rather than the sixth, because the sixth is no longer on a column boundary and the test is named for crossing one.
