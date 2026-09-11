---
schema: 3
id: TKT-01M290E5VQE9CWSQF3WCG71806
title: Size automatic row pitch for the active card density
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
created_at: 2026-09-11T19:52:13Z
updated_at: 2026-09-11T19:52:13Z
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

- [ ] The row pitch approach is chosen and recorded: static per density, or height-aware packing, with the reason.
- [ ] Where the pitch applies is decided and recorded, including what a density toggle followed by an unrelated store update does to automatic cards.
- [ ] No card overlaps the card below it on the 30-card reference board at either density, asserted by a test rather than by inspection.
- [ ] A test records the arranged vertical span and fit scale at both densities, so a later regression says which number moved.
- [ ] Manual card positions are unchanged by any density change, and no density change writes board data.
- [ ] docs/readability-v1.md records the outcome, superseding its current statement that nothing implements a tighter row pitch.
