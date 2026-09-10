# Test-only publication bridge implementation

For TKT-01M2441T0PTXRFK6VC4FM1PET7 (Route automatic tickets to label-matching canvas pens).

Implemented the [approved test-only scope](pen-publication-bridge-scope-v1.md) in the existing uncommitted `main` tree at `12601fa808e8eaf06308630e70a20669ea3f4260`. This document supplements prior evidence without changing reviewed documents. The normal entry point supplies no bridge. Displayed positions still use status lanes.

## Implementation

`web/src/platform/canvas/publications.ts` adds a Preact-free `PublicationBridge`. It copies complete publications into frozen local baseline envelopes with read-only identity maps. Incomplete states activate controller generations without observing placeholder tickets or accepting placement inputs. Scope changes include App generation, board and store path. Observed full-ID/creation/lifetime identities survive metadata edits and board switches; observed deletion or creation changes replace them. Store changes clear observed lifetimes.

Requests carry exact publication, fence and sequence tokens. `hold()` advances the fence synchronously. Reports require the current publication, matching sample token, complete registration membership and committed readiness. Stale reports cannot clear newer holds. Successful equivalent reports for one baseline are deduplicated. New baselines still call `accept` with fresh equal-height measurements; `PlacementSnapshots` reuses equivalent nested content without allocation. Measurement-only changes retain baseline and advance input revision. Failed calculations remain retryable and preserve old accepted lineage. The adapter calls only `activate` and `accept`, never `propose`. Fixture obstacles are copied, previews remain empty, and diagnostic observer exceptions do not escape into App state.

`useMeasurements.sample(token)` rereads current registered elements after commit, including unchanged heights. It returns a fresh frozen sample with copied read-only heights and registration maps. Unchanged reads schedule no work or semantic revision. Changed reads preserve existing coalesced publication behavior. Invalid heights remain unmeasured while registration membership stays complete. Sampling after unmount returns null.

App captures its optional bridge once per mount. Its existing publication path passes the displayed accepted state and App generation. Initial incomplete activation happens in the mount effect. Gesture/frame busy starts and manual-save starts advance the hold fence; busy completion never flushes placement. Live readiness requires no busy/frame operation and no raw accepted store state awaiting publication.

Canvas samples in a post-commit layout effect only when no gesture, local save preview or frame operation remains. The effect follows publication, semantic measurement changes and hold conditions, not selection, filter, pan/zoom or callback identity. It rechecks live readiness after sampling. Bridge results never feed `positions()`, edges, frame capture or mutation requests. Existing save-preview ownership and frame algorithms remain unchanged.

## Test-first history

1. The inherited baseline had 330 passing tests before the adapter test existed. At continuation, the adapter suite failed on missing `./publications`, with zero assertions executed. The protected 187-file hash matched the handoff, the index was empty, and claiming the ticket cleared its unclaimed warning.
2. Fixed the inherited nullable `settle()` helper. Added seven sampling cases before changing the hook. All seven failed on `api.sample is not a function`; all 17 existing measurement cases passed.
3. Implemented the adapter and sampling API. All 11 initial adapter tests and 24 measurement tests passed, as did strict TypeScript.
4. Added and executed 12 actual-App integration tests before App/Canvas wiring. Default disconnection passed; 11 failed. Initial save fixtures needed the existing 200 ms layout debounce and the actual Create and capture button rather than form submission. After those corrections, save positive controls executed and then failed on missing bridge acceptance. Several deeper assertions remained behind null-publication prerequisites at this red stage.
5. Added optional wiring. Eleven cases passed immediately; the remaining board-switch fixture used the wrong select ID. Corrected it to `boardSelect`. App's props needed Preact `RenderableProps` to preserve the unchanged `h(App, {})` entry point under strict TypeScript. The observer-entry fixture cast also needed correction.
6. Added a failing adapter regression for requests against a null/incomplete publication, then rejected those requests explicitly. Added actual-App checks for DOM changes without observer delivery and exact injected/default save and position parity for success and failure.
7. Strengthened drop tests with a real measurement change during the gesture so deduplication could not hide an early flush. That exposed a fixture issue: its last-created observer belonged to Inspector after card selection. The fixture now selects the observer that registered the stage. No production change was needed; both save outcomes pass and accept the changed height only after previews settle.

Final frontend results:

- `npm run test:unit`: 364 tests pass in 20 files, including platform boundary/DOM ownership checks.
- `npm run typecheck`: passes.
- Adapter: 12 cases. Measurement hook: 24 cases, including the original 17. Actual App bridge integration: 15 cases.
- Coverage includes unchanged 200/304, deferred acceptance followed by 304, A/B/A, stale reports/disposal, metadata identity, creation changes with reused DOM, observed deletion/reappearance, fresh same-height content reuse, measurement-only changes, failed calculation recovery, frame holds, changed measurements during drag/drop/save, and default/injected request and displayed-position parity.

## Disposable browser evidence

Created and ran a new fixture without changing the prior measurement fixture:

```sh
node /home/sothr/.local/state/terva/scratch/publication-bridge-browser-check.mjs
```

Fixture SHA-256: `28613166a8709438fe7c414359d847c247e32f19865bea7ffafea958ef59dca8`.

The first run passed in headless Chromium. Vite served source with a virtual TSX entry and real App/Canvas/CardView/CSS. Its cache stays under terva scratch. The fixture substitutes TicketClient responses and records manual request bodies; it does not run a backend or access the user store.

Results:

- Initial real card height 176 scene units; wrapped title height 489. Accepted diagnostic heights match committed `offsetHeight`.
- Same-height metadata publication changes lineage, retains ticket identity and reuses the exact position map with one allocator call total before wrapping.
- Border-box growth advances measurement revision on the same baseline and leaves displayed coordinates unchanged.
- Unchanged 304 produces no new result. A/B/A retains observed identity with new board scopes.
- A real pointer drag holds diagnostics through pending drop preview. After save, diagnostic mode becomes manual.
- Separate injected and default App mounts produce identical initial, preview and settled transforms and the same request: `{"board":"default","cards":{"a":{"x":30,"y":25}}}`.
- No page errors, console errors or network API requests occurred.

This fixture verifies source integration and browser measurement provenance. It is not embedded-asset, backend persistence, SSE transport or 120-card browser-performance evidence. Save failure and calculation failure are covered in component tests, not this browser run.

## Protected work and verification boundary

The protected 187-file hash remains `b7d51eea47db8a5524cb887801fa5f8ef4a3c9ad4058caf87018e471a83bb2ef`. Its exclusions are only the four allowed existing App/Canvas/measurement paths, the adapter/test, the App integration test, this new document, and ticket metadata. It includes user `.tickets/canvas/default.yml`, prior evidence/specifications/mockups, allocator/controller, CardView, backend, geometry/frame algorithms, instrumentation and generated assets.

Approved scope SHA-256 remains `a682637b8c21f9ee18862e61cc1cc6302424560d288ccba5fe0657088ab9df30`. User layout remains `852da1cea4bae70a3809aab5ddaa679ca09cabda477e828636fdf2b62cdf5eee`.

Tracked and new source/test whitespace checks pass. Strict ticket validation passes under the retained claim. The index remains empty. No production build, `just check`, Go suite, embedded browser suite, staging, commit, push or release ran during this continuation. All inherited work remains in this original working tree.

## Limits and next boundary

The bridge is an opt-in diagnostic observer, not production pen placement. Fixtures supply explicit obstacles. No pending-preview placement, production obstacle derivation, pen controls or position-consumer replacement exists. Hidden byte-identical deletion/recreation between observations remains undetectable. Registration owners establish element lifetime, not ticket incarnation. Sampling is an explicit post-commit caller contract, not a general render-phase detector.

Keep the ticket in progress and all end-to-end acceptance/definition-of-done items unchecked. A next proposal should inventory every position consumer, define production obstacles and capture safeguards, and explain pending-preview lineage before any activation. Approval of this test-only implementation does not authorize that next slice.

## Runtime provenance

Session `20260910-205247-e15f8f9e`, model `gpt-6-astra` through `openai-codex`. terva `0.134.6-0.20260910010245-6f36fa1e7be7`, commit `6f36fa1`, built `2026-09-10T01:05:08Z`. Extensions: index `0.8.2`, obsidian `0.2.0`, web `0.3.1`.
