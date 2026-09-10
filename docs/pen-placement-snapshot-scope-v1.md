# Approved pure placement-snapshot slice

Status: approved by the user before code changes.

For TKT-01M2441T0PTXRFK6VC4FM1PET7 (Route automatic tickets to label-matching canvas pens).

The user approved the preceding proposal with:

> I approve the pure placement-snapshot slice and proposed geometry choices. Record the approved scope before changing code.

This records approval of the pure allocator and per-board snapshot controller described below. It does not claim implementation or verification of that engine. This recording step stops before code changes.

This document supplements the unchanged [pen specification](pen-specification-v1.md), [implementation plan](pen-implementation-plan-v1.md), [rule-authoring addendum](pen-rule-authoring-addendum-v1.md), and [TypeScript foundation evidence](pen-typescript-foundation.md). It selects the next bounded slice and its geometry choices without rewriting those reviewed artifacts. Earlier statements that placement awaits scope approval are superseded for this pure-engine slice only.

## Boundary and inspected starting point

Build Preact-free placement code under `web/src/platform/canvas`, with tests alongside it. The existing `evaluatePens` provides routing and explanations. Do not connect the new engine to the UI in this slice.

Inspection found that `Canvas.positions()` still calculates status-lane placement during rendering and serves fit, focus, gestures, and frame capture. `useMeasurements` publishes revisions for viewport changes as well as card-size changes. `App` owns accepted publications, deferred updates, and existing save gates. Combining those changes with allocator development would expand this slice into production integration.

The starting point is the original uncommitted `main` working tree based on `12601fa808e8eaf06308630e70a20669ea3f4260`. A fresh HEAD checkout lacks the uncommitted backend and TypeScript foundation.

## Explicit inputs and snapshot output

Supply these inputs explicitly:

- Board identity, generation, and baseline token.
- The complete ticket collection and authored routing.
- Persisted manual coordinates.
- Card dimensions in scene units.
- Obstacle rectangles for frame headers and pen/Inbox controls.
- Identity-owned pending manual previews, separate from persisted coordinates.

The engine must not inspect DOM elements or infer obstacles from CSS. Ordinary frame interiors remain available space, not containment constraints. Frame membership remains independent of routing and placement.

A snapshot contains positions, routing explanations, automatic assignments, overflow membership/counts, and input lineage together. It never produces a persistence request or changes ticket labels, frame membership, or authored coordinates.

## Stable collision-aware allocation

1. Reserve manual cards and pending manual previews. Do not move either to make room.
2. Retain valid automatic slots before allocating new ones. A retained slot must still belong to the same destination, fit its current dimensions, and avoid current obstacles.
3. Allocate new or invalidated cards deterministically. Process destinations in explicit rule order, then Inbox; process tickets by full ID.
4. Search interior slots near the arrival pin first. A card must fit fully inside the padded pen interior.
5. Place remaining cards in deterministic overflow outside the pen. Capacity never changes their routing destination.
6. Use one scene-wide spatial index to prevent collisions across destinations.

Stability wins over compaction. Removing a card does not pull existing valid cards into its hole; new arrivals may use that space. Filters do not free slots, remove obstacles, or exclude cards from automatic-assignment and overflow counts.

### Approved geometry choices

- Card gaps and pen padding are 24 scene units.
- Use existing `CARD_WIDTH = 280` with supplied measured heights.
- When measurement is unavailable, use a provisional `280 × 340` size and mark it provisional. It is not a guarantee that every rendered card fits that size.
- Overflow prefers below the pen. Search other sides in a fixed order when obstacles or coordinate limits prevent that.
- Inbox uses slots around its pin, with no interior-capacity boundary or overflow count.

Search must terminate. Coordinate or search-budget exhaustion returns a diagnostic failure, not overlapping cards, silent Inbox fallback, or a partially accepted snapshot.

The proposal did not name the secondary side order, candidate enumeration, or search-budget value. Specify those deterministic implementation details in tests without treating them as already approved numeric choices. Bring back any change to the approved geometry or behavior rather than expanding the scope silently.

## Separate accepted and proposed snapshots

The controller exposes explicit update operations. Reads and rendering do not trigger calculation.

- Accepted updates preserve reusable slots and discard deleted identities.
- Preview updates start from the accepted baseline and cannot modify its cache.
- Cancel discards only proposed state.
- A changed baseline invalidates an outstanding proposal.
- Board-generation tokens reject stale work, including A-to-B-to-A switches.
- Equivalent effective inputs reuse prepared results without matching or allocation.

No save completion automatically promotes a preview. Later integration must supply the actual accepted server state. This slice does not implement network saves, gesture freezes, publication wiring, or UI feedback for engine failures.

## Test-first implementation and verification

Write tests before implementing the allocator and controller. Cover:

- Deterministic reconstruction and stable slots across unrelated updates.
- Label changes, arrivals, deletion, unpinning, pen removal, and changed measurements.
- Filtered tickets retaining occupancy and contributing to counts.
- Variable-height and oversized cards, overlapping pens, manual obstacles, control/header obstacles, and overflow.
- Preview cancellation, baseline invalidation, and board-generation isolation.
- Coordinate limits and bounded-search failure.
- No input mutation or automatic-coordinate persistence.

Include a 120-card engine fixture with collision and operation-count assertions. This measures the engine, not browser responsiveness or the existing browser performance guard.

After implementation, run focused tests, the full frontend unit/component/import-boundary suite, and strict TypeScript checks. Record results in a new evidence document. Keep implementation acceptance criteria unchecked until their actual end-to-end requirements pass; this approval record is not test evidence.

## Explicit exclusions

Do not change `App`, `Canvas`, `useMeasurements`, UI controls, browser instrumentation, backend automatic-position capture guards, or generated assets in this slice. Leave existing geometry/frame algorithms and reviewed documents unchanged. Gesture freezing, measurement/publication integration, and production walkthroughs require separate reviewed slices.

No schema changes, automatic-coordinate persistence, pen UI, frame-history integration, browser-performance claims, staging, commits, pushes, or releases are included. User `.tickets/canvas/default.yml` remains unchanged and unstaged.

## Record provenance

Recorded before placement code changes in session `20260910-180705-fd3659c9` with terva `0.134.6-0.20260910010245-6f36fa1e7be7`, commit `6f36fa1`, built `2026-09-10T01:05:08Z`. Extensions: index `0.8.2`, obsidian `0.2.0`, web `0.3.1`.
