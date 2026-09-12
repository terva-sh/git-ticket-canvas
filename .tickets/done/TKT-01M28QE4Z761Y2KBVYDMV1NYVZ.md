---
schema: 3
id: TKT-01M28QE4Z761Y2KBVYDMV1NYVZ
title: Route or bundle canvas edges through dense crossings
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
references: []
claim: null
archive: null
created_at: 2026-09-11T17:14:55Z
updated_at: 2026-09-12T21:32:10Z
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

- [x] A measured crossing count for the reference scene, before and after, recorded on the ticket.
- [ ] Edges between the same pair of cards no longer draw on top of each other.
- [ ] The change keeps the 41 edges and 30 card positions the structural test asserts, and lands a new baseline entry saying what moved.
- [ ] Routing degrades predictably on a board where no clear corridor exists, rather than producing a worse path than the straight curve.

## Implementation plan

Written after claiming and after measuring, not at filing. The measurement changes what this ticket should do, so the plan is partly a recommendation to rescope it.

### What the numbers argue

26 crossing points, 25 of them in the named cluster, 25 of 41 edges crossing nothing, and ten edges carrying most of the mess while sharing endpoints. That is a fan-out problem at a few busy cards, not a board-wide routing problem. The ticket asks for this to be weighed rather than assumed, and the weighing says: do the cheap local thing, not the algorithm.

### Proposed order

1. Land the measurement as a committed spec before any behaviour changes. Criterion 1 wants before and after, and an "after" produced by a differently-written probe is not comparable with the "before" now on this ticket. This step is the one that makes the rest checkable.

2. Offset edges that share an anchor. `curve()` in `Edges.tsx` anchors every edge at the midpoint of a card side, so N edges leaving one card all start from the same pixel and immediately overlap. Spreading them along that side, ordered by the angle to the other endpoint, is local, deterministic, needs no knowledge of other cards, and cannot fail the way a router can. Re-measure and keep the number.

3. Stop and look. If step 2 takes the crossing count far enough down, the routing and bundling candidates in the description are not worth their failure modes and this ticket closes with that recorded. If it does not, the remaining crossings will have been narrowed to a shape worth designing against, with a number attached.

### The criteria need changing

Criterion 2 is unsatisfiable as written. The reference board has zero pairs of cards with more than one edge, so "no longer draw on top of each other" has nothing to demonstrate. Either build a small fixture with a duplicated relationship, or drop it and prove the anchor spread as a unit test on `curve()` in the platform layer, where the geometry is pure.

Criterion 4, on degrading predictably where no corridor exists, only applies if step 3 concludes that routing is worth doing. If the work stops at step 2 it should be removed rather than left unticked with no explanation.

### Gate

`tests/browser/canvas-density.spec.ts` keeps its 41 edges and 30 card positions. An anchor spread moves pixels and holds every count, so expect a new `baseline-history.json` entry rather than changed constants, regenerated with `npm run capture:canvas-baseline`.

## Notes

**agent:terva/mieli** at 2026-09-12T20:53:56Z

draft to ready: The user asked me to pick this up and measure the crossings first, which is the promotion.

**agent:terva/mieli** at 2026-09-12T20:56:59Z

Baseline crossing measurement, before any code change.

### Method

Loaded the dense scene at the reference viewport in relationship mode `all`, then sampled each rendered `.relationship` path with `getPointAtLength` at 160 points, in scene space. Crossings are segment intersections between polylines of two different edges, clustered within 3 px so one geometric crossing counts once however finely sampled. Two edges that share a card necessarily meet at that anchor, so an intersection within 4 px of a shared endpoint is not counted.

Measuring the rendered path matters here. Every edge is a cubic bezier from `curve()` in `Edges.tsx`, with control points offset by `max(40, |dx| * 0.45)`, so a straight-line idealisation would count a different set of crossings than the one on screen.

### Numbers

| measure | value |
| --- | --- |
| edges | 41 |
| cards | 30 |
| crossing points | 26 |
| edge pairs that cross | 23 |
| edges involved in any crossing | 16 of 41 |
| crossing points inside the right cluster | 25 of 26 |
| edges drawn across a non-endpoint card | 6, with 14 card incidences |
| pairs of cards with more than one edge | 0 |

Crossings per edge: 25 edges have none, 4 have one, 2 have two, 10 have three or more. The five worst:

```text
6  Upgrade Vite and Vitest to secure  -> Add the CI quality gate
6  Build a trustworthy automated test -> Add browser smoke tests for the ga
5  Build a trustworthy automated test -> Measure Python coverage and add st
5  Add the CI quality gate            -> Add frontend unit tests and a test
5  Build a trustworthy automated test -> Automate backup and container smok
```

The right cluster is defined exactly as `canvas-density.spec.ts` defines it, client-space x past the viewport midpoint, and the probe reproduces its asserted 7 cards and 16 edges. My first attempt used the board's own midpoint in scene space and got 11 cards and 22 edges, which is a different set and would not compare with the number the suite already asserts. Worth knowing before anyone quotes a cluster number.

### What this says about the ticket

Three things, and two of them cut against the work as scoped.

**The premise about where the clutter is holds, strongly.** 25 of 26 crossing points fall in the cluster this ticket names. The problem is real and it is local.

**The problem is smaller and narrower than "the crossings are still there" suggests.** 25 of 41 edges cross nothing at all. Ten edges carry most of the mess, and they share endpoints: three of the five worst start from the same card. That shape is addressed by offsetting or bundling edges at a shared anchor, which is local and predictable. It does not need a routing algorithm with its own failure modes, which is the cost this ticket asks to be weighed.

**Acceptance criterion 2 cannot be satisfied on this board.** There are zero pairs of cards with more than one edge between them, so "edges between the same pair of cards no longer draw on top of each other" has nothing to demonstrate against on the reference scene. It needs a fixture built for it, or it should be dropped and the claim tested as a unit test on `curve()` instead.

Routing edges around cards is also a smaller prize than it looked: 6 edges cross a non-endpoint card, 14 incidences.

### Reproducing the "after"

The probe was a throwaway and is deleted, so the numbers above are reproducible only by rebuilding it. If this work proceeds, the measurement should land as a committed spec first, because criterion 1 asks for before and after and an after that uses a differently-written probe is not comparable with this before.

**agent:terva/mieli** at 2026-09-12T21:12:57Z

The anchor spread was built and measured. It makes the crossing count worse, at every pitch tried.

### What was built

`web/src/platform/canvas/anchors.ts`, a pure planner with ten unit tests. It groups every relationship by the card side it uses, sorts each group by the other card's centre so the fan cannot cross itself as it leaves the card, and hands out slots at a fixed pitch, capped so the spread never exceeds 60% of the card side. `Edges.tsx` memoises the plan over the whole graph rather than over the edges the current mode draws, so selecting a card does not slide its neighbours' edges. Only the left and right sides spread, because a top or bottom anchor moves in x and `canvas-density.spec.ts` asserts that every anchor's x is a card's left edge, right edge or horizontal centre.

None of that is the problem. The planner does exactly what step 2 of the plan described.

### The measurement

Taken with `tests/browser/edge-crossings.spec.ts`, the committed spec, so every row is comparable with every other row.

| slot pitch | crossing points | crossing pairs | edges involved | edges over cards |
| --- | --- | --- | --- | --- |
| 0 (centred, shipped) | 26 | 23 | 16 | 6, 14 incidences |
| 2 | 40 | 36 | 17 | 6, 14 incidences |
| 8 | 34 | 33 | 17 | 6, 14 incidences |
| 16 | 32 | 32 | 17 | 6, 14 incidences |
| 32 | 33 | 32 | 17 | 6, 14 incidences |

Every non-zero pitch is worse than none. The best of them costs six extra crossings and nine extra crossing pairs.

### Why, which is the part worth keeping

Spreading anchors moves where an edge starts. It does not change which edges have to get past which. A crossing between `A -> D` and `B -> C`, where A sits above B and C above D, exists because of where the four cards are. No anchor position removes it, and a 16 px shift only decides whether a near miss becomes a crossing or the other way round. On this board it decides against.

The shape of the curve is the second half of it. A small pitch is the worst case, not the mildest: two edges leaving one card 2 px apart run nearly parallel for a long stretch and weave across each other several times before they separate, which is why pitch 2 scores 40 and pitch 32 scores 33. A spread has to be large enough to separate siblings cleanly or it should not exist.

The card-crossing numbers do not move at all. 6 edges over 14 cards at every pitch, because an anchor offset of at most 16 px does not steer an edge around a 280 px card.

### What this settles

Criterion 1 now has its before and after, and the after is worse. Anchor spreading is not the fix, and the ticket should not carry it.

The two candidates left from the description are routing around cards and reordering cards within a lane. Routing addresses the 6 edges over 14 cards and nothing else, which the earlier note already called a small prize. Reordering the cards in a lane by their neighbours' positions is the change that removes topological crossings, and it is placement work rather than edge work, so it belongs with the arrange ticket and not this one.

The measurement spec stays committed either way. It cost the price of one throwaway probe and it is what turned a plausible fix into a measured refusal.

**agent:terva/mieli** at 2026-09-12T21:32:08Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-109 A measured crossing count for the reference scene, before and after, recorded on the ticket. — Both halves are on the ticket. The before is the baseline note: 26 crossing points, 23 pairs, 16 of 41 edges, 25 of 26 in the right cluster, 6 edges over 14 non-endpoint cards. The after is the anchor-spread note, a table over five slot pitches showing 40, 34, 32 and 33 against the 26 of centred anchors. Both were taken with the same committed spec, tests/browser/edge-crossings.spec.ts.
- [ ] task-110 (cancelled) ~~Edges between the same pair of cards no longer draw on top of each other.~~ — Unsatisfiable on the reference board. tests/browser/edge-crossings.spec.ts asserts duplicatePairs is 0 exactly, so no pair of cards is joined by more than one edge and there is nothing to stop overlapping. Left unticked on the ticket.
- [ ] task-111 (cancelled) ~~The change keeps the 41 edges and 30 card positions the structural test asserts, and lands a new baseline entry saying what moved.~~ — No behaviour change shipped, so there is no baseline entry to land. canvas-visual passes against the committed baseline unchanged. Left unticked on the ticket.
- [ ] task-112 (cancelled) ~~Routing degrades predictably on a board where no clear corridor exists, rather than producing a worse path than the straight curve.~~ — Routing was never chosen. The measurement narrowed it to 6 edges over 14 non-endpoint cards, and the crossings it would not address are topological. Left unticked on the ticket.

## Summary

Closed on a measured refusal. No edge routing, bundling or anchor offset shipped, and the crossings on the reference board are exactly where they were: 26 crossing points, 23 pairs, 16 of 41 edges, 6 edges over 14 non-endpoint cards.

What did ship is `tests/browser/edge-crossings.spec.ts` at commit 47457ad, the measurement itself. It samples every rendered relationship path at 160 points in scene space, counts intersections between distinct edges, clusters within 3 px, and discards intersections within 4 px of a card the two edges share. Crossing counts are asserted as upper bounds with the exact figures in a test annotation, because card heights come from wrapped text and CI renders different fonts. The structural numbers are exact.

The anchor spread that the plan recommended was built in full, with a pure planner in the platform layer and ten unit tests, and it was reverted. Measured at slot pitches 2, 8, 16 and 32 it scored 40, 34, 32 and 33 crossings against the 26 of centred anchors. The reason is in the notes and it is the finding worth carrying: anchor position does not change which edges have to get past which, so a crossing that exists because of where four cards sit survives every offset. A small pitch is the worst case rather than the mildest, because two edges leaving a card 2 px apart weave across each other before they separate.

Criterion 1 is ticked. The other three are not, and each has a reason.

Criterion 2 has nothing to demonstrate. The spec asserts that no pair of cards on this board is joined by more than one edge, so overlapping duplicates do not occur here. It needs a fixture built for it or it should be dropped.

Criterion 3 asks for a baseline entry saying what moved. Nothing moved, `just canvas-visual` matches the committed baseline pixel for pixel, and an entry recording a change that did not ship would be false in the one file that exists to record what did.

Criterion 4 applies only to routing, which was not chosen. The measurement narrowed routing's prize to 6 edges over 14 cards and it addresses none of the crossings.

What is left for whoever picks this up: reordering cards within a lane by their neighbours' positions is the change that removes topological crossings, and it is placement work rather than edge work. It belongs with the arrange ticket. Routing around cards remains available and remains small. Both now have a committed instrument to be judged against, which this ticket did not have when it was filed.

Gates at close: `just check` green, `just browser-test` 68 passed and 6 skipped, `just canvas-visual` 7 passed.
