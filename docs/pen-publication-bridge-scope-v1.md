# Approved test-only accepted-publication bridge

Status: approved by the user before code changes.

For TKT-01M2441T0PTXRFK6VC4FM1PET7 (Route automatic tickets to label-matching canvas pens).

The user approved the preceding proposal with:

> I approve the test-only accepted-publication bridge slice. Record the scope in a new document before changing code.

This records approval of the bounded integration below. This recording step stops before code changes. It does not claim implementation, passing integration tests, or permission to activate pen placement in the normal application.

This document supplements the unchanged [pure placement evidence](pen-placement-snapshots.md), [measurement scope](pen-measurement-scope-v1.md), and [measurement implementation evidence](pen-measurement-implementation.md). It supersedes earlier exclusions of publication/controller wiring only for this optional test/fixture connection. Reviewed specifications, plans, mockups, and evidence documents remain unchanged.

## Purpose and activation boundary

Connect App's real accepted-publication path and committed measurements to `PlacementSnapshots` through an optional injected bridge. Integration tests and a disposable browser fixture supply the bridge. The normal application entry point does not.

The bridge computes diagnostic snapshots only. It must not replace displayed positions, alter mutation requests, or run as an always-on second allocator. Default App operation must never invoke the bridge. Production activation requires a later proposal and approval; passing this slice's tests does not enable it automatically.

## Inspected starting point

Three existing boundaries make a direct position replacement too broad:

- `TicketStore` can accept a response while App defers publishing it during a gesture.
- Canvas calls `onBusy(false)` before installing a completed drop's pending-save preview. That callback alone is not a safe flush point.
- Measurement snapshots identify registrations but do not prove their heights were sampled after a newer ticket publication rendered.

The starting point is the original uncommitted `main` working tree at `12601fa808e8eaf06308630e70a20669ea3f4260`. The pure allocator/controller and measurement-only integration exist there. A fresh HEAD checkout lacks that uncommitted work. Automatic cards still use render-time status lanes.

## Approved integration behavior

### Observe published state

App supplies the complete state it publishes, not raw store changes or a filtered ticket collection. `layoutSchema === null` activates a board generation but is not an accepted placement input. Unchanged reads produce no new publication.

A store response accepted during a publication hold must not bypass that hold. A later 304 must not discard an already accepted state that App still needs to publish.

### Assign local lineage

Generate a baseline token for each published state and a monotonic placement-input revision. Measurement-only updates retain the published baseline and advance the input revision. These tokens identify local input lineage; they are not server CAS preimages.

Board-generation checks reject stale reports, including A-to-B-to-A switches. Old reports must not clear newer holds or provide measurements for a newer baseline.

### Track observed ticket lifetimes

Track ticket lifetimes separately from element registrations. Preserve identities across ordinary edits and board switches within the same store. Observed deletion/reappearance or changed creation identity creates a new lifetime.

Do not use ticket revision or DOM-registration symbols as incarnation IDs. This mechanism cannot detect a byte-identical delete/recreate hidden between accepted reads. Do not claim that it can.

### Require fresh commit-bound measurements

Canvas reports measurements tagged with the board generation and rendered baseline. Add an explicit post-commit sampling operation to `useMeasurements` so unchanged heights can still be confirmed for a new baseline. Relabelling an older snapshot as fresh is insufficient.

Bind reports to the current registrations and observed ticket lifetimes. Preserve the measurement-only distinction between immutable size publications and viewport redraw notifications. Rendering must not perform the sampling or invoke placement calculation.

### Accept only settled inputs

Hold the latest publication while a gesture, manual-save preview, or frame operation is active. Flush only after a matching committed measurement report confirms readiness, never directly from `onBusy(false)`.

Drop-preview installation must prevent premature flushing. Save success or failure resumes against actual accepted state. Pending previews are a hold condition in this slice, not inputs to a new preview-placement integration. Older reports cannot release newer holds.

### Keep results diagnostic-only

Use the controller's `activate` and `accept` operations, not `propose`. Allocation failures retain the controller's last-good snapshot with its original lineage and reach the injected test observer. They do not replace App's accepted data, move cards, or trigger persistence.

Fixtures supply explicit obstacle rectangles. Production frame/control obstacle derivation remains outside the slice; fixture geometry is not evidence that production obstacles are complete.

## File boundary

Allow:

- One new Preact-free publication adapter.
- Narrow optional wiring in `web/src/ui/App.tsx` and `web/src/ui/Canvas.tsx`.
- The explicit sampling operation in `web/src/ui/canvas/useMeasurements.ts`.
- Adjacent unit/component tests and a new implementation evidence document.

Keep allocator geometry and controller behavior unchanged. Concrete adapter symbols, token representation, report signatures, and test paths are implementation details to settle through inspection and tests before production edits. Bring back any need to expand this boundary rather than silently including it.

## Tests before implementation

Write and run failing tests before implementing the bridge and its callers. Prove:

- Initial load, changed publication, unchanged 200/304, and drag-deferred publication followed by 304.
- A-to-B-to-A isolation, stale measurement rejection, deletion/recreation, and metadata-only identity stability.
- Fresh same-height measurements without allocation when effective inputs are equivalent.
- No calculation during holds. Drop previews prevent premature flushing, and save success/failure resumes against actual accepted state.
- Failed allocation preserves old lineage and later valid input recovers.
- Default App operation never invokes the bridge. Enabling it in tests changes neither displayed positions nor mutation requests.

After implementation, run focused tests, the full frontend unit/component/boundary suite, strict TypeScript, whitespace checks, and strict ticket validation. Use a disposable browser fixture to verify the integration without rebuilding committed assets or touching user `.tickets/canvas/default.yml`. Keep fixture files and caches under terva scratch where needed.

Record genuine red phases, final results, and remaining limits in a new evidence document. This approval record is not passing test evidence. Keep the ticket in progress and all end-to-end acceptance criteria unchecked.

## Explicit exclusions and stopping point

No production activation, replacement of position consumers, pending-preview placement, production obstacle derivation, pen controls, or changes to frame/backend capture guards. Existing rendering, fit/focus/capture, gesture outcomes, and save behavior must remain unchanged; optional observation and readiness reporting do not authorize redesigning those algorithms.

No label changes, frame-membership changes, automatic-coordinate persistence, schema changes, browser instrumentation changes, or generated-asset regeneration. No `just check`, staging, commits, pushes, or releases. Keep user `.tickets/canvas/default.yml` unchanged and unstaged.

After test-only integration is verified, stop and propose the next bounded slice for review. Production use of controller snapshots requires separate authority and evidence for the remaining position consumers, previews, obstacles, and capture safeguards.

## Record provenance

Recorded before bridge code changes in session `20260910-180705-fd3659c9` with terva `0.134.6-0.20260910010245-6f36fa1e7be7`, commit `6f36fa1`, built `2026-09-10T01:05:08Z`. Extensions: index `0.8.2`, obsidian `0.2.0`, web `0.3.1`.
