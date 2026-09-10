# Approved measurement-only integration slice

Status: approved by the user before code changes.

For TKT-01M2441T0PTXRFK6VC4FM1PET7 (Route automatic tickets to label-matching canvas pens).

The user approved the preceding proposal with:

> I approve the measurement-only slice. Record the scope in a new document before changing code.

This records the approved measurement-publication boundary. This recording step stops before code changes. It does not claim that measurement integration is implemented or verified.

This document supplements the unchanged [placement scope](pen-placement-snapshot-scope-v1.md) and [placement implementation evidence](pen-placement-snapshots.md). It supersedes the earlier exclusion of measurement changes only for the bounded work below. Reviewed specifications, plans, mockups, and evidence documents remain unchanged.

## Inspected starting point

`useMeasurements` currently uses one revision for card measurements, stage resizing, and window resizing. Feeding that revision directly into placement would make viewport events trigger placement updates even when card heights stayed unchanged.

`Canvas.positions()` supplies rendering, fit/focus, gesture snapshots, and frame capture/movement. Replacing it now would also require publication, preview, gesture, and frame safeguards. This slice prepares the measurement source without replacing that function or changing where cards appear.

The starting point is the original uncommitted `main` working tree at `12601fa808e8eaf06308630e70a20669ea3f4260`. The pure allocator and snapshot controller exist there but have no production UI caller. A fresh checkout at HEAD lacks that uncommitted work.

## Approved production boundary

Limit production edits to:

- `web/src/ui/canvas/useMeasurements.ts`.
- Its registration interface in `web/src/ui/canvas/CardView.tsx`.
- Necessary measurement wiring in `web/src/ui/Canvas.tsx`.

Add focused hook/component tests alongside the affected code. Preserve existing measurement consumers and status-lane placement. Do not call `PlacementSnapshots` or add another allocator running alongside the existing placement code.

## Measurement publications

1. Separate card-size publications from viewport redraw notifications. Publish a new immutable height snapshot only when effective card heights or registration membership change.
2. Preserve viewport notifications for grid redraws. A viewport event alone must not publish a new card-size snapshot when effective measurements are unchanged.
3. Measure border-box card heights in scene units, not zoomed client bounds. Publish only valid positive heights. Missing measurements remain explicitly unavailable for the later allocator; this hook does not invent provisional placement geometry.
4. Give each element registration an owner token. An old cleanup or queued observer callback must not remove or overwrite a newer registration for the same ticket ID.
5. Coalesce size changes into one publication per animation frame. Cancel pending work on unmount, including board switches. Previously published snapshots must remain unchanged.
6. Keep filtered cards measured. Filtering must not remove their measurement registrations or free placement slots.

Registration ownership is not ticket incarnation identity. Deriving allocator identities and accepted-baseline tokens remains part of a later publication slice. This approval does not select those token contracts.

The exact hook return shape and registration cleanup signature are implementation details to settle in tests. They must preserve the behavior above and existing consumers without expanding the production file boundary.

## Test-first implementation and verification

Write focused tests before implementation. Demonstrate:

- Repeated observations with identical heights produce no card-size publication.
- Viewport resizing still requests redraw, but produces no card-size publication unless an actual card height changes.
- Actual height changes, including label disclosure, publish updated measurements.
- Multiple changes in one frame produce one immutable snapshot, and previous snapshots remain unchanged.
- Removal, same-ID re-registration, stale cleanup, and unmount cannot leak old measurements.
- Filtered cards remain measured.

Run the focused tests, the full frontend unit/component/boundary suite, strict TypeScript, whitespace checks, and strict ticket validation after implementation. Record genuine red phases and final results in a new evidence document, not in reviewed artifacts.

Any browser check must use a disposable fixture. It must not rebuild committed assets or touch user `.tickets/canvas/default.yml`. Browser instrumentation changes and browser-performance claims are outside this slice. Do not run `just check`, which rebuilds frontend assets.

This approval record is not passing test evidence. Keep the ticket in progress and all end-to-end acceptance criteria unchecked.

## Explicit exclusions and stopping point

No App publication changes, pen placement activation, shadow allocator, pen controls, gesture/save behavior changes, frame algorithms, backend guards, browser instrumentation changes, or asset regeneration.

Do not alter the pure allocator/controller or their approved geometry. Existing render-time status-lane calculations remain; this slice does not claim to eliminate them. No label, membership, or authored-coordinate changes are included.

No staging, commits, pushes, or releases. Keep user `.tickets/canvas/default.yml` unchanged and unstaged.

After this measurement-only implementation is verified, propose the accepted-publication/controller integration separately for review. Do not treat measurement approval as permission to connect the placement controller or replace position consumers.

## Record provenance

Recorded before measurement code changes in session `20260910-180705-fd3659c9` with terva `0.134.6-0.20260910010245-6f36fa1e7be7`, commit `6f36fa1`, built `2026-09-10T01:05:08Z`. Extensions: index `0.8.2`, obsidian `0.2.0`, web `0.3.1`.
