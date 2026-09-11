---
schema: 3
id: TKT-01M28ZMK8YJDW9CHSSC8BGZWB5
title: Size automatic status lanes for the active card density
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
  - ref: doc:card-density
    path: docs/readability-v1.md
  - ref: code:auto-place
    path: web/src/platform/canvas/geometry.ts
claim: null
archive: null
created_at: 2026-09-11T19:38:15Z
updated_at: 2026-09-11T19:47:32Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Compact density narrows a card from 280 px to 180 px, but the automatic status lanes it sits in do not move. `autoPlace` in `web/src/platform/canvas/geometry.ts` lanes off its own constants, `LANE_W = 300` and `LANE_GAP = 22`, so the lane pitch is 322 px at every density and takes no width argument at all.

At full density that pitch is the card plus 42 px of gutter. At compact it is the card plus 142 px, so each lane wastes 100 px of horizontal space that the narrower card just freed. This store configures seven statuses, which puts the arranged span at 7 x 322 = 2254 px where a compact-sized pitch of 202 px would need 1414 px. Compact already buys 45% of the card area back, measured on the 30-card reference board, and none of that shows up in how far the board spreads sideways.

### The constraint that makes this awkward

TKT-01M26Y3D0BAX6KGND8PYXXR918 settled that a density change re-derives nothing: automatic cards stay exactly where they are, and compact only opens space between them. A browser test asserts it by toggling density and comparing every card's transform.

A density-aware lane pitch collides with that, and not obviously. Derived automatic positions are recomputed on every accepted store update, so if the pitch read the active density, a toggle would leave the board alone and then the next store update would silently relane it. That is worse than either honest answer, because the cards move at a moment unrelated to the action that caused it.

So this ticket is a decision before it is an implementation. The plausible answers:

- Give `Arrange` the active density's pitch and leave derived placement on the fixed 322. Arrange is an explicit action that already writes saved coordinates for every ticket, since `arrange()` calls `autoPlace` with an empty pinned map and saves the result. The cost is that an automatic card and an arranged board would use different pitches, so a board holding both looks inconsistent.
- Make derived placement density-aware and accept relaning on the next store update. Cheapest to write, and it contradicts the ruling above in a delayed and confusing way.
- Leave it, and record that compact trades horizontal space for vertical.

Whichever wins, manual positions must not move, and a density change must not write board data.

Worth measuring before choosing: whether the wasted 100 px per lane is visible on a real board, or whether the row pitch of 340 px dominates and the horizontal saving would not change what fits on screen. If it is the second, option three is the honest answer and this ticket closes as a decision rather than a change.

## Acceptance criteria

- [x] The lane pitch question is decided and recorded, including what happens on a density toggle followed by a store update.
- [x] Manual card positions are unchanged by any density change, and no density change writes board data.
- [ ] If the lane pitch becomes density-aware, a test measures the arranged lane span at both densities on the 30-card reference board.
- [x] docs/readability-v1.md records the outcome, replacing its current statement that compact does not re-lane the board.

## Implementation plan

Written after measuring, and the measurement is in the note above. The lane-width premise this ticket was filed on is refuted: a compact-sized lane pitch cuts the horizontal span by a third and moves the fit scale not at all, because an arranged board is height-bound by roughly seven to one.

So the work is no longer "make the lane pitch density-aware". These are the options, in the order I would take them.

1. Close this ticket as decided, with no change to the lane pitch. The number it was filed to improve does not respond, and `LANE_W` stays at 300 for both densities. `docs/readability-v1.md` gets one sentence: compact does not re-lane the board, and measurement says it should not, because the horizontal span is not what limits the view.

2. File the row pitch as its own ticket, because that is where the same idea actually pays. `autoPlace` stacks rows at a flat 340 px while the tallest card is 249 px at full and 220 px at compact. A pitch of the tallest card plus a gap raises the fit scale from 0.120 to 0.150 at full and from 0.121 to 0.168 at compact, so compact gains more and the change is density-relevant in the way this ticket wanted.

   That ticket inherits this one's hard part unchanged. Derived automatic positions recompute on every accepted store update, so a density-aware row pitch would leave the board alone on a density toggle and then relane it at the next unrelated update, which is the delayed surprise the density ticket ruled out. Doing it only in Arrange avoids that, at the cost of automatic and arranged cards using different pitches.

   It also needs a number this ticket did not measure: the row pitch was raised from 132 to 340 for TKT-01M2440DW3PPHYBBC530T1M5TT to fit the taller card hierarchy, so anything tighter has to be checked against cards overlapping their neighbours rather than only against the fit scale.

3. Treat lane depth as the real subject, which neither pitch touches. The deepest lane is 25 rows for 30 cards, because a status never wraps into a second column. That single column is the whole shape of an arranged board, and wrapping it would change the fit more than either pitch. This is a bigger change than either ticket describes and wants its own filing, with the manual-position guarantee front and centre.

If option 1 wins, this ticket closes with the note and the documentation sentence as its whole deliverable. That is a real outcome: the next person who looks at a 180 px card in a 300 px lane now finds the measurement instead of repeating it.

## Notes

**agent:terva/mieli** at 2026-09-11T19:41:32Z

draft to ready: The user asked for the measurement this ticket calls for before any change to autoPlace, which is the promotion.

**agent:terva/mieli** at 2026-09-11T19:43:25Z

Measured before touching `autoPlace`, and the measurement refutes this ticket's premise. Lane width is not what limits a compact board.

Method: load the 30-card reference fixture, accept the Arrange confirm and click Arrange, so every card carries a lane position rather than the fixture's saved one. Then read each card's `translate(x, y)` and `offsetHeight` at both densities, and run `fitView`'s own arithmetic with `inspectorWidth` 0, which is how Canvas calls it. Lane and row indices come back out of the positions, since Arrange writes `lane * 322` and `row * 340`, so a counterfactual pitch is arithmetic on the same boxes rather than a second layout run.

The board, arranged: 30 cards across 6 lanes, stage 2048 x 1063.

| | full | compact |
| --- | --- | --- |
| card width | 280 | 180 |
| spanX | 1890 | 1790 |
| spanY | 8386 | 8361 |
| fit scale | 0.120 | 0.121 |
| spanX at a card-sized lane pitch | 1890 at 322 | 1190 at 202 |
| fit scale with that pitch | 0.120 | 0.121 |

A compact-sized lane pitch cuts the horizontal span by a third, from 1790 to 1190, and the fit scale does not move at all. Both densities are height-bound by a wide margin, and it is not close: 8361 tall against 1190 wide.

The reason is in one number the probe printed by accident. The deepest lane is 25 rows deep for 30 cards, so one status holds 25 of them. `autoPlace` stacks a status into a single column at a flat 340 px row pitch, and that column is the whole shape of an arranged board.

What does move the number is the row pitch, not the lane pitch. The tallest card is 249 px at full and 220 px at compact, against that flat 340. Recomputing with a row pitch of the tallest card plus 20:

- full: spanY 8386 to 6682, fit scale 0.120 to 0.150, up 25%
- compact: spanY 8361 to 5961, fit scale 0.121 to 0.168, up 39%

Compact gains more because its cards are shorter, so it is density-relevant in a way the lane width is not. The board stays height-bound in every variation, which points at the lever neither pitch touches: a 25-row column exists because a lane never wraps. Wrapping a deep status into more than one column would change the shape more than either pitch, and it is a bigger change than this ticket describes.

One caveat on all of it. This is one board. "Lane width does not matter" holds while a board is height-bound, which is true whenever any status is deep. A board with many shallow lanes would flip the binding dimension and with it the conclusion, so the finding is about this shape rather than about every store.

No acceptance criterion is ticked. Criterion 1 wants the question decided, and the decision is the user's rather than mine. Criterion 2 holds today and is asserted by the density ticket's browser test, but ticking it now would be against a state where `autoPlace` has not changed, so it has to be re-earned by whatever change lands.

The measurement was a throwaway spec, removed after this note. Nothing in the working tree changed.

**agent:terva/mieli** at 2026-09-11T19:47:29Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-45 The lane pitch question is decided and recorded, including what happens on a density toggle followed by a store update. — Decided as no change and recorded in the ticket note and in docs/readability-v1.md. A compact-sized lane pitch cuts spanX 1790 to 1190 and leaves the fit scale at 0.121, because the arranged board is 8361px tall against 1190px wide. A density toggle still re-derives nothing, since LANE_W is unchanged.
- [x] task-46 Manual card positions are unchanged by any density change, and no density change writes board data. — Satisfied by the no-change outcome: autoPlace is untouched, so a density change re-derives nothing and writes no board data. Asserted in tests/browser/canvas-density.spec.ts, which toggles density, compares every card's translate(x, y), and toggles back.
- [ ] task-47 (cancelled) ~~If the lane pitch becomes density-aware, a test measures the arranged lane span at both densities on the 30-card reference board.~~ — The condition never arose. The lane pitch does not become density-aware, so there is no arranged-span test to write. Criterion 3 stays unticked rather than ticked vacuously, and the ticket summary says why.
- [x] task-48 docs/readability-v1.md records the outcome, replacing its current statement that compact does not re-lane the board. — docs/readability-v1.md now records the measurement in the Card density section: the lane pitch stays 300px at both densities, the numbers behind that, and the row pitch as the lever that would respond, with the caveat that the finding holds only while a board is height-bound.

## Summary

Closed as no change. `LANE_W` stays at 300 px for both densities, and the deliverable is the measurement plus the record of it.

The premise was wrong, and measuring first is what caught it. On the 30-card reference board, arranged, a compact-sized lane pitch cuts the horizontal span from 1790 px to 1190 px and moves the fit scale from 0.121 to 0.121. Both densities are height-bound and not marginally: 8361 px tall against 1190 px wide, because `autoPlace` stacks a status into one column at a flat 340 px row pitch and the deepest lane holds 25 of the 30 cards. A third off the width buys nothing a person can see.

The row pitch is what would respond, which is the opposite of what this ticket was filed on. At a pitch of the tallest card plus 20 the fit scale goes 0.120 to 0.150 at full and 0.121 to 0.168 at compact, and compact gains more because its cards are shorter. That is not filed yet. It inherits the hard part of this ticket unchanged, because a density-aware pitch in derived placement relanes the board at the next unrelated store update rather than at the toggle, and it needs a check this measurement did not make: the pitch was raised from 132 px to 340 px for TKT-01M2440DW3PPHYBBC530T1M5TT to fit the taller card hierarchy, so anything tighter has to be tested for cards overlapping their neighbours.

The larger lever is lane depth, which neither pitch touches. A status never wraps into a second column, and that single column is the entire shape of an arranged board. Also unfiled, and a bigger change than either pitch.

`docs/readability-v1.md` carries the numbers in its Card density section, including the caveat that the finding holds only while a board is height-bound. A store with many shallow lanes would flip the binding dimension and the conclusion with it.

The description above is left as it was filed, so the reasoning that produced this ticket stays readable. Do not trust its arithmetic: it assumed seven lanes and a 2254 px span, while the board arranges into six lanes and 1890 px. The note and this summary are the corrected record.

Acceptance criterion 3 is deliberately unticked. It was conditional on the lane pitch becoming density-aware, that did not happen, and ticking it would claim a test that does not exist.

No code changed. The measurement ran from a throwaway spec that was removed.
