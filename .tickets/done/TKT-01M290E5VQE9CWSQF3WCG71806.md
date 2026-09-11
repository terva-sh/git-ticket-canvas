---
schema: 3
id: TKT-01M290E5VQE9CWSQF3WCG71806
title: Size automatic row pitch for the active card density
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
created_at: 2026-09-11T19:52:13Z
updated_at: 2026-09-11T23:23:09Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

`autoPlace` stacks a status lane at a flat 340 px row pitch, written as `y: row * 340` in `web/src/platform/canvas/geometry.ts`. The tallest card on the reference board is 249 px at full density and 220 px at compact, so every row carries roughly 90 px of slack at full and 120 px at compact.

TKT-01M28ZMK8YJDW9CHSSC8BGZWB5 measured this while refuting its own premise, and named it as the lever that responds. Recomputing the arranged 30-card board with a row pitch of the tallest card plus 20:

- full: vertical span 8386 px to 6682 px, fit scale 0.120 to 0.150, up 25%
- compact: vertical span 8361 px to 5961 px, fit scale 0.121 to 0.168, up 39%

Compact gains more because its cards are shorter, which makes this density-relevant in the way the lane width was not. An arranged board is height-bound by roughly seven to one, so this is the dimension that decides how much of a board fits on screen.

### The part that is not arithmetic

`autoPlace` does not know how tall a card is. It takes items, pinned positions and statuses, and every item is `{id, status}`. The measurement above used heights read from the DOM after layout, which the derivation cannot do: heights arrive from `useMeasurements` after a render, and placement derivation must never run during render. So `tallest card plus 20` is a number a person can compute and a function cannot, at least not where the function runs today.

That leaves two shapes, and choosing between them is most of the work:

- A static pitch per density, picked from observed heights. Simple, pure, and it keeps the derivation where it is. The risk is a card taller than the pitch, which overlaps the row below. Today's 340 covers the tallest observed card with 91 px to spare, so any tighter number trades that margin for scale and needs a deliberate answer about what happens to an unusually tall card.
- A height-aware pass that packs each lane using measured heights. It removes the overlap risk and produces the tightest board, and it puts measurement in front of derivation, which is the architecture rule this repo has held to since frames. Considerably more work, and it wants its own design note before any code.

The inherited constraint from TKT-01M26Y3D0BAX6KGND8PYXXR918 applies unchanged. Derived automatic positions recompute on every accepted store update, so a density-aware pitch would leave the board alone on a density toggle and then relane it at the next unrelated update. Applying the pitch only in `Arrange` avoids that, since Arrange is explicit and already writes coordinates for every ticket, at the cost of automatic and arranged cards using different pitches on the same board.

### What the measurement did not check

The pitch is 340 because TKT-01M2440DW3PPHYBBC530T1M5TT raised it from 132 to fit the taller card hierarchy that readability v1 introduced. Anything tighter has to be verified against cards overlapping their neighbours, not only against the fit scale. The reference board is one shape and its tallest card is not the tallest card that can exist: a long title with many labels and a long blocker line will exceed it.

## Acceptance criteria

- [x] The row pitch approach is chosen and recorded: static per density, or height-aware packing, with the reason.
- [x] Where the pitch applies is decided and recorded, including what a density toggle followed by an unrelated store update does to automatic cards.
- [x] No card overlaps the card below it on the 30-card reference board at either density, asserted by a test rather than by inspection.
- [x] A test records the arranged vertical span and fit scale at both densities, so a later regression says which number moved.
- [x] Manual card positions are unchanged by any density change, and no density change writes board data.
- [x] docs/readability-v1.md records the outcome, superseding its current statement that nothing implements a tighter row pitch.

## Implementation plan

Written after the re-measurement, which is the note above. The plan is small; the sequencing question is the part that matters.

### The approach

A static flat pitch of 269 px, a module constant beside `LANE_CAP` in `geometry.ts`, replacing the literal 340. It is the tallest observed full-density card plus 20. One number for both densities.

Not a pitch per density, which this ticket's title proposes. A pitch that varies with density makes placement vary with density, and derived positions recompute on every accepted store update. The board would sit still on the toggle and then reflow at the next unrelated update, which is exactly the failure TKT-01M26Y3D0BAX6KGND8PYXXR918 ruled out and TKT-01M290N0GA1DBBRGR3HJJQVDY2 preserved.

Not height-aware packing, and the measurement is the reason rather than the effort. Packing each column by running height plus a 20 px gap reaches 0.6307 at full and 0.7174 at compact once empty lanes are dropped, against 0.605 and 0.614 for a static 269. The compact gain is real and it is also the problem: packing reads measured heights, those heights differ by density, so a packed board reflows on a density toggle by construction. Packing can therefore only live behind an explicit Arrange, never in the derivation path, and that is a different ticket with a design note in front of it. A static pitch keeps one pitch for automatic and arranged cards on the same board.

### Where it applies

Everywhere `autoPlace` runs, which is the derivation path and Arrange alike. A density toggle moves nothing, because the constant does not read density. An unrelated store update after a toggle re-derives the same coordinates for the same reason. That is the whole argument for a constant over a measurement.

### Sequencing, which is the open question

Landing this alone buys nothing. At full density the fit scale stays at 0.4997 whether the pitch is 340 or 269, because the wrapped board is bound by width. At compact it moves 0.5062 to 0.5153. In exchange it spends 71 px of the 91 px clearance that stands between the tallest card and the row below.

It pays only with TKT-01M299VRP0Z2YBAE90DPP4XMV6 (Drop empty status lanes from an arranged board), which on its own is worth nothing either. Together they reach 0.605 and 0.614, a fifth of the board. Whichever lands first will measure as a wasted change, so the pair wants one decision rather than two.

### Steps, once the sequencing is decided

1. Replace `y: row * 340` with the `ROW_PITCH` constant at 269, carrying the measurement and the clearance it spends in its comment.
2. `canvas-arrange.spec.ts` already asserts no card overlaps another at either density, which covers the row-below case. Re-measure its recorded span and fit, and prove the overlap guard still fails when it should.
3. The same spec's second test already covers manual positions across a density change and the no-write rule. Confirm rather than duplicate.
4. `docs/readability-v1.md` replaces its row-pitch paragraph, which currently predicts 0.150 and 0.168 from the unwrapped board.

Not in scope: height-aware packing, the lane cap, and dropping empty lanes.

## Notes

**agent:terva/mieli** at 2026-09-11T22:57:32Z

draft to ready: The user asked me to pick this up and re-measure it against the wrapped board, which is the promotion.

**agent:terva/mieli** at 2026-09-11T23:00:11Z

Re-measured against the wrapped board, as the description's own warning required. The premise this ticket was filed on is gone, and what replaced it is more interesting than a bigger number.

Method. A throwaway probe arranged the reference board, read every card's height and position at both densities, and wrote them out. A model then reproduced the board from those heights and swept row pitch against lane cap. The model was validated before it was trusted: at pitch 340 and cap 6 it produces 3178 x 1926 and 0.4997 at full, and 3078 x 1901 and 0.5062 at compact, which are the numbers the browser measured to four decimal places. Nothing below is arithmetic against an assumed stage.

Each lever alone, at cap 6:

| change | full | compact |
| --- | --- | --- |
| today, pitch 340 | 0.4997 | 0.5062 |
| pitch 269 | 0.4997 | 0.5153 |
| drop empty lanes | 0.5000 | 0.5062 |
| pitch 269 and drop empty lanes | 0.6050 | 0.6140 |

The row pitch alone is worth nothing at full density and 1.8% at compact. It shortens the board from 1926 px to 1571 px and the fit scale does not move, because the wrapped board is bound by width at full and lands on the knee at compact. This ticket predicted 0.150 and 0.168, a gain of 25% and 39%. Those numbers were measured on a board that stacked 25 cards in one column, and wrapping deleted the condition that made them true.

Dropping empty lanes alone is worth nothing either, which corrects what I wrote when filing TKT-01M299VRP0Z2YBAE90DPP4XMV6. I argued there that width was half of what binds, so freeing 1288 px of it would pay. It does not: freeing the width hands the binding straight to height, and 0.4997 becomes 0.5000.

Together they are worth 21% at both densities. That is the finding. Two changes that each measure as worthless are worth a fifth of the board when they land together, because the board is balanced and only shrinking both dimensions moves the fit. Neither ticket can be judged on its own, and either one landing alone would look like a wasted change to whoever measured it afterwards.

Raising the cap is the third lever and it does not combine the same way. At cap 7 a pitch of 269 reaches 0.5219 at full, and dropping empty lanes on top adds exactly nothing, because cap 7 is height-bound. A pitch of 250 with cap 7 reaches 0.5542, and 250 leaves 1 px of clearance over the tallest card on this board, which is not a margin.

Overlap, since the ticket asks for it against something other than the fit scale. The tallest card is 249 px at full and 220 px at compact. Today's 340 leaves 91 px of slack. A pitch of 269 is the tallest full card plus 20 and leaves 20 px. The sweep reports the first overlap at a pitch of 230, where four cards of 249 px collide with the row below at full density. So 269 is safe on this board and on no board that anybody has measured, which is the same caveat the cap of 6 carries.</text>

**agent:terva/mieli** at 2026-09-11T23:23:04Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-59 The row pitch approach is chosen and recorded: static per density, or height-aware packing, with the reason. — Recorded in the ticket plan: a static flat pitch of 269, the tallest full-density card plus 20, one number for both densities. Per-density pitch rejected because it reflows the board at the next store update after a toggle. Height-aware packing rejected on a measurement, not effort: it reaches 0.6307 full and 0.7174 compact against 0.605 and 0.614 for static 269, but it reads density-dependent heights, so a packed board reflows on a density toggle by construction and can only live behind an expl…
- [x] task-60 Where the pitch applies is decided and recorded, including what a density toggle followed by an unrelated store update does to automatic cards. — Recorded in the ticket plan: the pitch applies everywhere autoPlace runs, derivation path and Arrange alike, so both share one pitch on a board. A density toggle moves nothing and an unrelated store update after a toggle re-derives the same coordinates, because a constant reads no density. That is the argument for a constant over a measurement.
- [x] task-61 No card overlaps the card below it on the 30-card reference board at either density, asserted by a test rather than by inspection. — canvas-arrange.spec.ts checks every card pair at both densities and passes at pitch 269, where the clearance above the tallest card is 20px. Proved by making it fail: pitch 230 collides at full density, which is the first pitch the sweep predicted would overlap; restored to 269, both tests pass.
- [x] task-62 A test records the arranged vertical span and fit scale at both densities, so a later regression says which number moved. — canvas-arrange.spec.ts records span, aspect, fit and the fit budget as a test annotation at both densities. Measured after this change: full 1890x1571 aspect 1.203 fit 0.605; compact 1790x1546 aspect 1.158 fit 0.614; budget 1648x1023, by width 0.8199, by height 0.6050, binds height.
- [x] task-63 Manual card positions are unchanged by any density change, and no density change writes board data. — canvas-arrange.spec.ts 'a density change on an arranged board moves no card and writes nothing' passed at the new geometry: every card's translate is identical across full to compact to full, and the request listener recorded no non-GET request. The listener was proved to see writes earlier by registering it before the arrange, which caught PUT /api/layout.
- [x] task-64 docs/readability-v1.md records the outcome, superseding its current statement that nothing implements a tighter row pitch. — docs/readability-v1.md updated in four places: the row pitch paragraph now records 269 and the clearance it spends, the Lane depth table carries all five board states so the isolated levers are visible, the empty-lane paragraph records the dropped lane and its create-time reflow, and the v1 statement of 340 px row spacing is corrected. Gates paragraph names the new assertions.

## Summary

The automatic row pitch is 269 px, down from 340, as a module constant in `geometry.ts`. It is the tallest observed full-density card plus 20, and it is one number for both densities.

The title of this ticket proposes a pitch per density and the ruling is against it. A pitch that varies with density varies placement with density, and derived positions recompute on every accepted store update, so the board would sit still on the toggle and reflow at the next unrelated update. Height-aware packing is rejected for the same reason rather than for its cost: it reaches 0.6307 at full and 0.7174 at compact, against 0.605 and 0.614 for the static pitch, but it reads heights that differ by density, so a packed board reflows on a toggle by construction. It could only live behind an explicit Arrange.

This ticket predicted a 25% and 39% gain. Both numbers were measured on a board that stacked 25 cards in one column, and wrapping deleted the condition that made them true. Re-measured against the wrapped board, the pitch alone is worth nothing at full and 1.8% at compact, and dropping empty lanes alone is worth 0.0003. Together they take the fit scale from 0.500 to 0.605 at full and 0.506 to 0.614 at compact, so the pair landed as one change with TKT-01M299VRP0Z2YBAE90DPP4XMV6 (Drop empty status lanes from an arranged board).

The board is now bound by height with a third of the width in hand, at 0.8199 by width against 0.6050 by height, which the suite asserts. Whatever comes next should spend width.

The pitch buys its scale with clearance: 340 sat 91 px above the tallest card and 269 sits 20 px above it. A card taller than 269 overlaps the row below, and the reference board's tallest card is not the tallest that can exist. The overlap check in `canvas-arrange.spec.ts` is the guard, and it was proved by making it fail at a pitch of 230.

A cap of 5 measures better than 6 on this board, 0.719 against 0.605, and it is not worth taking. Twenty-five cards divide into five columns of five exactly, so the gain is arithmetic luck on one board and reverses at 26 cards. The Lane depth section records that so nobody re-derives it.

Gates: `just check`, `just browser-test` 67 passed and 6 skipped, `just canvas-visual` 7 passed with the pixel baseline unchanged. `frames.spec.ts` needed a fix: it sized a frame at a literal 700 px, which fell between rows at a pitch of 340 and captured all three cards at 269. It now derives that height from where the third card sits, so the next pitch change does not break it.
