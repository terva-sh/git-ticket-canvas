# Approved committed sampling probe scope

For TKT-01M2441T0PTXRFK6VC4FM1PET7 (Route automatic tickets to label-matching canvas pens).

## Approval and status

The user approved the committed sampling probe slice and requested a new scope document before code changes. This document records that approval. It supersedes the proposal's unapproved status for this bounded slice only; previously delivered documents remain unchanged.

This is a scope record, not implementation or test evidence. This recording step stops before code changes. Default activation remains blocked even if every opt-in test passes. Passing sampling tests does not authorize placement consumers or spatial submissions.

## Deliverable

Add a separate optional test-only committed sampling probe for cards and ordinary-frame controls. Produce validated immutable measurement receipts for an exact committed publication. Tests and disposable real-source browser fixtures may inject it. Preserve the diagnostic-only PublicationBridge and its contract unchanged.

The normal entry point stays disconnected. No main.ts injection, URL flag, saved preference, default allocator or shadow placement calculation is permitted.

## Source-inspected boundary

- web/src/ui/canvas/useMeasurements.ts exposes immutable height and registration-owner snapshots. Its generic sample(token) reads fresh heights but does not prove publication identity, expected-set completeness or ticket incarnation.
- web/src/ui/canvas/CardView.tsx owns registration cleanup. Element registration ownership must remain distinct from ticket incarnation.
- web/src/ui/Canvas.tsx samples the diagnostic bridge after commit and checks local gestures, previews, layoutBusy and publicationReady. It has no frame-control registrations or noninteractive staging path. Existing rendering continues using legacy positions.
- web/src/ui/App.tsx uses published.current === store.state to detect unpublished accepted state. Generation, pending saves and frame requests also constrain readiness.
- web/src/ui/FrameCanvas.css positions title and resize controls outside frame interiors. Current title markup includes a variable filtered count that can change wrapping.

Implementation may add a separate probe contract, owner-scoped control measurement hook, tests, and narrow optional App/Canvas/CardView wiring with injected-mode frame markup/styles. Preserve normal and diagnostic behavior. Exact new module names are implementation details, not existing APIs.

## Receipt and request contract

Bind each request to store identity, board, App generation, exact committed publication, nullable capture token, expected ticket incarnations, expected ordinary-frame controls, and a sequence or fence that cannot survive an intervening hold or publication.

Sample cards and controls together after commit. Check readiness and publication identity before and after sampling. Reject missing, replaced, disconnected, stale or invalid registrations. Do not substitute provisional geometry for incomplete measurements.

Copy and freeze geometry and owner receipts. Separate complete geometry from capture readiness: a complete sample without a matching server token can provide measurement evidence but cannot authorize submission. The probe itself never authorizes or performs a spatial write.

Preserve card measurement live views and viewport behavior. Equal-size fresh samples establish freshness without inventing a geometry revision. Control geometry revisions advance only when rectangles or registration owners change.

## Ordinary-frame control geometry

Measure actual border boxes for wrapped title buttons and resize buttons, including external portions. Use untransformed offset geometry relative to the frame/scene owner, accounting for parent borders; do not use zoomed client rectangles as scene coordinates.

Read-only frames have no resize control, so expected completeness must reflect the committed markup. Frame interiors, selection outlines, edges and screen-fixed panels are not obstacles. Do not duplicate manual-card obstacles or add allocator spacing to measured rectangles. Pen/Inbox controls and complete production obstacle coverage remain later work.

## Filter-independent footprints

Only in injected sampling mode, separate filtered-count text from title wrapping. Reserve a dedicated count slot large enough for every count for the current membership total. Filtering changes the text, not the reserved footprint. Include the slot in the sampled footprint. Do not clip text or hide overflow to manufacture stability.

Keep normal-mode markup and behavior unchanged. Selection and filtering must not change control geometry revisions when owners and geometry remain equal.

## Fixture-only staging

Use the real card component in a disposable fixture to prove invisible, noninteractive measurement with one registration per ticket. Staged cards must not receive focus, pointer actions or accessibility navigation.

Do not stage newly accepted tickets in the normal App during this slice. That requires coherent placement-consumer conversion. The fixture must not present temporary status-lane or origin positions as approved pen placement.

## Test-first sequence and verification gates

Write and run failing tests before each implementation step. Record missing-module failures separately from executed assertion failures.

1. Test request fencing and immutable receipts, equal-height freshness, owner replacement, stale cleanup, recreated ticket identities and board A/B/A.
2. Test complete expected card/control sets, filtered cards, read-only handle removal, publication changes, pending saves and frame holds.
3. Test actual wrapped-title and font-driven growth, narrow frames, external resize handles, parent-border offsets and pan/zoom-invariant scene rectangles.
4. Test stable control footprints under filtering and selection, and noninteractive fixture staging.
5. Assert zero allocator/coordinator calls and zero mutations from the probe, with normal and diagnostic behavior preserved.
6. Verify actual markup and CSS in disposable Chromium source fixtures, not mocked dimensions alone. Keep scratch and Vite caches under /home/sothr/.local/state/terva/scratch.
7. Run focused and full frontend tests, strict TypeScript, strict ticket validation and whitespace checks. Record evidence in a new document and stop for review.

## Exclusions and activation gate

No SceneCoordinator integration, PlacementSnapshots or allocator changes, position/edge/fit/focus/gesture consumer conversion, automatic reflow, submission/history integration, backend expansion, or pen/Inbox authoring controls. Existing status-lane rendering remains active.

No production build, just check, generated-asset regeneration, staging, commit, push, release or sub-agent launch is included. Keep the ticket in-progress and every end-to-end acceptance and definition-of-done box unchecked.

Default activation requires separate user approval and evidence for visible pen/Inbox controls, complete obstacle coverage, coherent consumers and pending previews, guarded submissions/history, reviewed external-write limits, performance and generated assets. Sampling receipts and server tokens are not proof of cross-process atomicity or authentication.

## Preserved working tree

Continue in the original uncommitted main tree at 12601fa808e8eaf06308630e70a20669ea3f4260. A checkout at HEAD lacks inherited feature work. The index was empty at inspection.

The user confirmed that current web/dist changes and the changed user layout are expected and must be preserved. This supersedes the handoff's older protected-file baseline for this recording step. The current .tickets/canvas/default.yml SHA-256 is 2d07300c839b4f214da47cb56e6de0401cdfeb7d7d5ebab3283f3c3c6f2fff4c. Never edit or stage that user data. Preserve existing generated assets and all reviewed documents byte-for-byte.

## Related records

- [Opt-in consumer proposal](pen-position-consumers-proposal-v1.md)
- [Capture transport evidence](pen-capture-transport-implementation.md)
- [Measurement implementation](pen-measurement-implementation.md)
- [Diagnostic publication bridge](pen-publication-bridge-implementation.md)

Recorded in session 20260910-222105-a66a0903 with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z. Extensions: index 0.8.2, obsidian 0.2.0, web 0.3.1. Model: gpt-6-astra through openai-codex.
