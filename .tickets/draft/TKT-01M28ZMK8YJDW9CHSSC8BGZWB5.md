---
schema: 3
id: TKT-01M28ZMK8YJDW9CHSSC8BGZWB5
title: Size automatic status lanes for the active card density
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
  - ref: doc:card-density
    path: docs/readability-v1.md
  - ref: code:auto-place
    path: web/src/platform/canvas/geometry.ts
claim: null
archive: null
created_at: 2026-09-11T19:38:15Z
updated_at: 2026-09-11T19:38:15Z
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

- [ ] The lane pitch question is decided and recorded, including what happens on a density toggle followed by a store update.
- [ ] Manual card positions are unchanged by any density change, and no density change writes board data.
- [ ] If the lane pitch becomes density-aware, a test measures the arranged lane span at both densities on the 30-card reference board.
- [ ] docs/readability-v1.md records the outcome, replacing its current statement that compact does not re-lane the board.
