---
schema: 3
id: TKT-01M29CY3EXY628WP4P0687PPTM
title: Give an empty status lane an 80px gap instead of no lane
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
created_at: 2026-09-11T23:30:38Z
updated_at: 2026-09-11T23:37:10Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

TKT-01M299VRP0Z2YBAE90DPP4XMV6 (Drop empty status lanes from an arranged board) gave a status with no tickets no lane at all. Its closing note measured the alternative and found it free: an empty lane rendered as a gap of up to 120 px costs nothing, because the board is bound by height once the row pitch tightens and the width a gap spends is width nobody is waiting on.

| empty lane | spanX full | fit full | fit compact |
| --- | --- | --- | --- |
| dropped | 1890 | 0.605 | 0.614 |
| 80 px gap | 2210 | 0.605 | 0.614 |
| full 322 px column | 3178 | 0.500 | 0.515 |

Two reasons to spend that free width. The render shows the first: with lanes dropped, `draft` and `done` sit flush against each other and the board reads as one block of cards rather than as status lanes. A gap puts the lane boundary back without paying a column for it.

The second is the reflow this layout was refused over twice. A status gaining its first ticket still moves every lane to its right, but by 322 minus the gap rather than by a full column. At 80 px that is 242 px instead of 322. Smaller, not gone, and it is worth being honest that this does not fix the objection.

### What to decide while implementing

Whether a run of empty statuses pays one gap or one gap each. Per lane is the measured option above and it keeps every status the same width when empty, at 80 px for each of the four empty statuses on the reference board.

Whether a leading empty lane gets a gap. Giving it one moves the whole board right by a margin that changes as the first statuses fill, for no gain, so the board's first occupied lane should probably stay at x 0.

## Acceptance criteria

- [x] An empty status lane occupies 80px rather than nothing, as a named constant beside LANE_W and ROW_PITCH.
- [x] The arranged span and fit scale are re-measured at both densities and recorded, confirming or refuting that the gap is free.
- [x] The reflow when a status gains its first ticket is measured and asserted: it should fall from 322px to 242px.
- [x] Whether a leading empty lane gets a gap is decided and asserted by a test.
- [x] No card overlaps another on the 30-card reference board at either density.
- [x] docs/readability-v1.md records the outcome, replacing the paragraph that says a status with no tickets gets no lane.

## Notes

**agent:terva/mieli** at 2026-09-11T23:30:41Z

draft to ready: The user asked for this work directly, which is the promotion.

**agent:terva/mieli** at 2026-09-11T23:36:49Z

Implemented at 80 px, and the prediction held.

Measured in the browser after the change: full 2210 x 1571, aspect 1.407, fit 0.605; compact 2110 x 1546, aspect 1.365, fit 0.614. Those fit scales are identical to the same board with the empty lanes dropped entirely, which is the claim this ticket rested on. The gap spends 320 px of width across four empty statuses and changes the scale by nothing, because height binds at 0.6050 against 0.7073 by width.

The render is the part no assertion covers, and it is the reason this was worth doing. With lanes dropped, `draft` and `done` sat flush and the board read as one block of cards. With the gap the draft lane reads as its own lane again, and the five `done` columns read as one group rather than as six unrelated columns.

Decisions the description left open. A run of empty statuses pays one gap each, so the four between `draft` and `done` cost 320 px together. A leading empty status pays nothing, so the first occupied lane stays at x 0; a gap in front of it would be a margin nobody can see that moves as the earliest statuses fill. Both are asserted in `geometry.test.ts`.

The reflow is smaller and it is not gone. A status gaining its first ticket moves every lane to its right by 242 px rather than 322, and the unit test asserts that exact number rather than describing it. Whoever objects to a board that reflows on a create is still right to object.

One thing changed that the description did not anticipate. The cap-5 comparison recorded on the row pitch ticket was measured with lanes dropped and no longer holds: with the gaps, a cap of 5 reaches 0.707 rather than 0.719 and turns the board width-bound, 0.7073 by width against 0.7194 by height. I re-measured it rather than leaving the old number in the docs. The conclusion is unchanged, because 25 cards dividing into five columns of five is arithmetic luck on this board.

I also edited `geometry.ts` with `sed -i` while measuring that, which this workspace tells me not to do. The edit was a one-character constant flip and I reverted it with a proper edit, so the committed diff is clean, but the run is in the transcript.

Gates: `just check`, `just browser-test` 67 passed and 6 skipped, `just canvas-visual` 7 passed with the pixel baseline unchanged.</text>

**agent:terva/mieli** at 2026-09-11T23:37:06Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-65 An empty status lane occupies 80px rather than nothing, as a named constant beside LANE_W and ROW_PITCH. — EMPTY_LANE_GAP = 80 sits beside LANE_W, LANE_GAP and ROW_PITCH in geometry.ts, with the measurement and the condition it depends on in its comment. autoPlace adds it per empty lane while accumulating origins.
- [x] task-66 The arranged span and fit scale are re-measured at both densities and recorded, confirming or refuting that the gap is free. — Confirmed free. Browser annotation: full 2210x1571 aspect 1.407 fit 0.605; compact 2110x1546 aspect 1.365 fit 0.614; budget 1648x1023, by width 0.7073, by height 0.6050, binds height. The fit is identical to the dropped-lane board at 1890x1571, so 320px of width cost nothing.
- [x] task-67 The reflow when a status gains its first ticket is measured and asserted: it should fall from 322px to 242px. — geometry.test.ts asserts it directly: with draft wrapped to two columns and ready empty, done sits at 724; adding one ready ticket puts ready at 644 and done at 966, and the test asserts the difference is exactly 242, down from 322 with lanes dropped.
- [x] task-68 Whether a leading empty lane gets a gap is decided and asserted by a test. — Decided: a leading empty status gets no gap, so the first occupied lane sits at x 0. A leading gap would be a margin nobody can see that changes as the earliest statuses fill. geometry.test.ts 'gives a leading empty status no gap, so the board still starts at zero' places a lone done ticket behind two empty statuses and asserts x 0.
- [x] task-69 No card overlaps another on the 30-card reference board at either density. — canvas-arrange.spec.ts checks every card pair at both densities and passes. The gap changes x only, so the row geometry that the overlap check guards is untouched; that guard was proved to fail earlier today at a row pitch of 230.
- [x] task-70 docs/readability-v1.md records the outcome, replacing the paragraph that says a status with no tickets gets no lane. — docs/readability-v1.md: the empty-lane paragraph now records the 80px gap, the two ends it replaces and the 242px reflow it leaves; the table gains the gap rows showing 2210x1571 at the same 0.605; the binding paragraph reads 0.707 against 0.605; the cap-5 comparison is re-measured with the gap at 0.707 width-bound; the gates paragraph names the new unit tests.

## Summary

A status with no tickets occupies `EMPTY_LANE_GAP`, 80 px, instead of nothing. A leading empty status occupies nothing, so the first occupied lane still sits at x 0.

The gap is free, as the measurement said it would be. Full 2210 x 1571 at 0.605, compact 2110 x 1546 at 0.614, which are the same fit scales the board had with empty lanes dropped entirely at 1890 x 1571. Height binds at 0.6050 against 0.7073 by width, so the 320 px this spends across four empty statuses costs nothing.

What it buys is only visible in a render: `draft` and `done` no longer sit flush and read as one block of cards. That is why this reversed a change that landed an hour earlier rather than waiting for evidence to accumulate.

The reflow that this layout was refused over twice is smaller and not gone. A status gaining its first ticket moves every lane to its right by 242 px instead of 322, and `geometry.test.ts` asserts that number.

One side effect worth carrying forward: the cap-5 comparison on TKT-01M290E5VQE9CWSQF3WCG71806 (Size automatic row pitch for the active card density) was measured with lanes dropped and no longer holds. Re-measured with the gaps, a cap of 5 reaches 0.707 rather than 0.719 and turns the board width-bound. The docs carry the new number. The conclusion does not change, because a cap of 5 only wins here by dividing 25 cards into five columns of five.

Gates: `just check`, `just browser-test` 67 passed and 6 skipped, `just canvas-visual` 7 passed with the pixel baseline unchanged.
