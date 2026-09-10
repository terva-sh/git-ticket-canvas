# Measurement-only integration evidence

Implementation evidence for TKT-01M2441T0PTXRFK6VC4FM1PET7 (Route automatic tickets to label-matching canvas pens).

This implements the unchanged [approved measurement-only scope](pen-measurement-scope-v1.md). It supplements the [pure placement evidence](pen-placement-snapshots.md). Measurement publications now exist, but no production caller connects them to the pen allocator or snapshot controller.

## Production changes

Only three production files changed in this slice:

- `web/src/ui/canvas/useMeasurements.ts` separates size snapshots from viewport notifications and owns registration cleanup.
- `web/src/ui/canvas/CardView.tsx` returns the cleanup supplied by registration instead of unregistering by ticket ID.
- `web/src/ui/Canvas.tsx` changes its grid effect dependency from `measurements.revision` to `measurements.viewportRevision`.

`Canvas.positions()`, gestures, saves, fit/focus/capture algorithms, App publications, frame algorithms, backend guards, and pure placement modules remain unchanged. Automatic cards still use render-time status lanes. No pen placement or shadow allocator runs in production.

## Measurement contract

`useMeasurements(stage)` returns:

- `sizes`, a frozen `MeasurementSnapshot` containing `revision`, `heights`, and `registrations`.
- `viewportRevision`, the separately incremented grid-redraw signal.
- `heights` and `elements`, read-only live views retained for existing Canvas consumers.
- `register(id, element)`, which returns an owner-scoped cleanup function.

Each registration receives an opaque symbol. `sizes.registrations` maps ticket IDs to those symbols, including registrations whose heights are unavailable. These symbols describe element-registration lifetimes, not ticket incarnations or accepted-board baselines. A new registration for the same ID receives a new symbol even if its element and height are unchanged.

The hook reads finite positive `offsetHeight` values. This measures border-box heights in scene units, with the browser's integer rounding, rather than zoomed client bounds. Zero, negative, NaN, and infinite measurements are absent from the height maps. The hook supplies no provisional placement dimensions.

A single animation frame coalesces size/membership changes and viewport notifications. At publication, the hook compares final heights and registration owners with the last snapshot. Identical observations and size changes that revert before the frame preserve the snapshot reference and revision. A stage/window event increments only `viewportRevision` unless effective measurements changed too.

Snapshots wrap copied maps in frozen facades without mutators. `forEach` exposes the facade, never its backing map. Previously published snapshots remain unchanged after later observations, cleanup, and board remounts. Live views update when measurements arrive, before the next snapshot publication, so existing imperative consumers retain their current behavior. Later placement integration must use `sizes`, not those live views, as its publication boundary.

The observer requests border-box notifications and measures only current card targets. An old target cannot trigger measurement of a replacement card. When the same element is registered again, the hook reads its current `offsetHeight` instead of using a queued entry's size. Cleanup acts only if its registration still owns the ID.

The mount effect accommodates child registrations made before it starts observing. Unmount disconnects the observer, removes the window listener, cancels the pending frame, clears live maps, and invalidates old callbacks. Existing App board-generation keys remount Canvas; this slice does not change that mechanism. The stage ref remains stable within a Canvas mount.

Without `ResizeObserver`, registration and window resize still measure cards. Arbitrary content changes without either event are not detected by that fallback; no new polling or observer polyfill was added.

## Disclosure test correction

Browser verification found an incorrect assumption in the proposal's example and the initial mocked test. The label disclosure uses `position: absolute` in `web/index.html`. Opening it does not increase the card's border-box height.

The hook therefore must not publish a size change merely because that disclosure opens. Tests now verify unchanged disclosure height, then a genuine height change. This corrects the test assumption without editing the reviewed scope, changing CSS, or expanding the measurement boundary. Detecting popover obstacles is not part of this slice.

## Test-first record

Before production edits, added `web/src/ui/canvas/useMeasurements.test.tsx` and ran:

```sh
npm run test:unit -- web/src/ui/canvas/useMeasurements.test.tsx
```

All 17 tests failed against the existing implementation. Failures included missing size/viewport APIs, missing owner-scoped cleanup, redundant publication, and card-height changes redrawing the grid. Some deeper assertions were blocked by the missing API; the red run was not passing feature evidence.

After implementation, all 17 tests passed. Strict TypeScript then caught incomplete observer-fixture fields and two `act` callbacks returning booleans. The fixtures now use complete entry shapes and void callbacks. The final strict check passes.

Coverage includes:

- Initial child registration, unchanged observations, parent rerenders, and stage/window notifications.
- Scene-unit measurements, invalid heights, immutable map facades, frame coalescing, and within-frame reversions.
- Same-ID and same-element replacements, stale cleanup/observer/RAF callbacks, removal, and A/B/A component remounts.
- Filtered-card registration, disclosure behavior, and the no-ResizeObserver fallback.
- CardView using the returned cleanup.
- Canvas updating measured edge geometry without redrawing the grid for card-only changes, redrawing for viewport changes, preserving manual/status-lane positions, and issuing no measurement saves.

## Browser verification

Ran a disposable Chromium fixture using the real hook, CardView, and current inline CSS from `web/index.html`. Vite served a virtual test page and transformed source modules in development mode. Its cache and check script stayed under `/home/sothr/.local/state/terva/scratch`; no committed assets were rebuilt. The server and browser closed after each run.

Final command:

```sh
node /home/sothr/.local/state/terva/scratch/measurement-browser-check.mjs
```

The successful run verified:

- Viewport resizing reused the size snapshot while advancing the viewport revision.
- Opening label disclosure left measured height unchanged.
- Wrapping a longer title changed measured card height from 176 to 489 scene units through the real observer.
- Prior snapshots stayed unchanged, and measurements matched actual `offsetHeight`.
- Scaling the scene did not alter measured height; changing the card border did.
- Board-key remounts created fresh registration owners and cleared the old live maps.
- No browser errors or API requests occurred.

Initial fixture runs failed before the final success. The virtual TSX module first needed explicit transformation; after that, the incorrect disclosure-growth expectation timed out. Those were fixture/test-assumption failures, not passing verification runs. The final run uses wrapped title text for real growth and asserts no growth from disclosure.

This disposable check is not a committed browser regression suite, an embedded-asset test, an App save/gesture walkthrough, or a performance claim. The committed regression coverage is the adjacent Vitest file.

## Final checks and preserved files

- `npm run test:unit`: all 330 tests pass across 18 files, including the 17 new measurement tests and existing component/import-boundary checks.
- `npm run typecheck`: passes.
- Tracked and new-test whitespace checks pass.
- Strict ticket validation passes with no warnings or errors.

The pre-slice baseline excluding the three allowed production files contains 185 existing non-ticket files plus the protected user layout, counted together. Its aggregate SHA-256 remains `a2bbb935077c5d7a90479eb53e653e3a252cfa9e6b37788443bcd59d69aa8436`. The new test and this new document are excluded from that comparison. Existing tests, reviewed documents/mockups, App, geometry/frame code, pure placement modules, backend, and generated assets are unchanged.

The approved scope remains at SHA-256 `585f9ee49e56e80ecb1194de1f364fc4c876c6511e85778557965b39afd2f1f6`. User `.tickets/canvas/default.yml` remains unchanged at `852da1cea4bae70a3809aab5ddaa679ca09cabda477e828636fdf2b62cdf5eee` and unstaged.

No production frontend build, `just check`, Go suite, embedded browser suite, staging, commit, push, or release ran during this measurement slice. Work remains uncommitted on `main` at `12601fa808e8eaf06308630e70a20669ea3f4260`. The ticket stays in progress with end-to-end acceptance criteria unchecked.

Accepted-publication/controller integration still requires a separate proposal and review. It must define ticket incarnation and baseline tokens, measurement-to-ticket identity binding, deferred publication during gestures, pending-save ownership, and position consumers before enabling pen placement.

## Record provenance

Session `20260910-180705-fd3659c9`, terva `0.134.6-0.20260910010245-6f36fa1e7be7`, commit `6f36fa1`, built `2026-09-10T01:05:08Z`. Extensions: index `0.8.2`, obsidian `0.2.0`, web `0.3.1`.
