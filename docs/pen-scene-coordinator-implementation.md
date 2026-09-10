# Pure scene coordinator and pending previews

For TKT-01M2441T0PTXRFK6VC4FM1PET7 (Route automatic tickets to label-matching canvas pens).

The user requested the pure scene coordinator and pending-preview contracts after the [initial red contract stage](pen-consumer-contract-tests.md). This slice implements those contracts only. Default activation remains blocked. The reviewed proposal and earlier evidence remain unchanged.

## Implemented boundary

Added `web/src/platform/canvas/scene.ts` and `web/src/platform/canvas/scene-regressions.test.ts`. No existing source or test file changed.

`SceneCoordinator` accepts a dedicated `PlacementSnapshots` instance. It does not use or modify `PublicationBridge`. No UI, normal entry point or diagnostic injection imports the coordinator. The module has no DOM, network, persistence or scheduling dependency.

A scene contains immutable complete card rectangles, the source placement snapshot, copied obstacle rectangles, authored card/frame preimages, committed registration receipts and store/board/App/controller lineage. `sceneRect`, `sceneCenter` and `sceneBounds` project that data without matching or allocation. Gestures preserve dimensions, neighbors and obstacle geometry from the frozen source. Scene projections are not an alternative placement cache.

`publish` checks controller scope, revision ordering, sample baseline/revision, completeness and exact card-registration membership before calculation. Incomplete samples cannot restore readiness; older callbacks cannot replace a newer incomplete or held observation. Failed placement preserves displayed old lineage, removes absent/recreated identities from the position map and stages identities without usable rectangles. Provisional dimensions and absent capture tokens prevent capture readiness.

Only `publish` calls controller `accept` and `propose`. Gesture/frame release and save completion do not consume an old queued publication. The caller must publish another committed sample after release. `beginFrame` requires capture readiness and no pending card save; frame holds exclude gestures and stop all reflow.

## Pending-owner lifecycle

- A gesture handle is an exact local receipt. Foreign, cancelled and replayed handles cannot submit. Invalid coordinates and unknown card IDs fail before ownership changes.
- `submitDrop` copies and freezes only the submitted cards. It records their source scene, incarnation and captured scope, installs per-card owners synchronously, then releases the gesture hold. It never adds automatic neighbors to the request.
- One opaque aggregate owner represents the current per-card owner set. A change to that set cancels only the matching old proposal. Repeated equivalent publications keep the proposal available for controller reuse.
- Every proposal follows an overlay-free accepted base and uses its exact revision/baseline. Proposed slots never become accepted cache candidates.
- Success and failure remove only the exact submission's remaining owners. Copied receipts, old-board completions and older saves for a replaced owner do nothing. Neither outcome invents an authoritative saved card. A later publication supplies the actual accepted state.
- Recreated or removed identities lose old owners even when their new sample is incomplete. During an active gesture the whole scene stays frozen; the next settled publication performs identity cleanup.
- Failed proposals display explicit pending coordinates over the accepted base with `collisionSafe: false` and capture disabled. Completion/release also disables readiness until a committed publication restores it.

The caller still owns request dispatch and error messages. This module returns receipts and display state; it never submits requests or replays failures.

## Executed verification

The initial focused run reproduced the missing `./scene` import with zero assertions executed. After implementation all 15 original scene contracts execute and pass unchanged.

Nine additional regressions cover obstacle/source snapshot freezing, equivalent pending reuse, incomplete-sample incarnation cleanup, stale callback watermarks, completion without an authoritative response, immutable preimages and receipts, invalid/foreign handles, exact registration sets and old-scope isolation. Three regressions were observed failing before their fixes: pending proposal reuse, incomplete-sample owner cleanup and missing retained obstacle geometry.

The first implementation also tried to require every fixture obstacle to have a control registration. Two original contracts failed because these pure fixtures explicitly supply obstacles without DOM control receipts. The coordinator now retains control receipts and trusts the producer's completeness declaration rather than inferring DOM ownership from arbitrary obstacle IDs. This does not establish production obstacle coverage.

One full run reported the local `forEach` parameter named `self` through the platform boundary check. Renamed it to `thisArg`, matching the other map facades. The boundary check itself remains unchanged.

Final results:

| Check | Result |
| --- | --- |
| Focused scene, regression, snapshot, allocator and platform-boundary run | 71 tests pass in five files. This includes 24 scene tests. |
| `npm run test:unit` | 388 tests pass, including all 364 pre-contract tests. Four inherited store-capture tests fail. The local capture suite still fails its missing `./capture` import with zero assertions executed. 22 passing files, two failing files. |
| `npm run typecheck` | One TS2307 diagnostic for absent `./capture`. No scene API or implementation diagnostics. The full TypeScript gate remains red. |
| `git diff --check` and new-file whitespace | Pass. |
| Strict ticket validation | Pass with no warnings or errors; rerun after the final ticket record. |
| Protected pre-slice files | All 201 files match the starting checksum. |

Go code and HTTP contracts did not change, so Go tests were not rerun in this pure TypeScript slice. Their previously recorded missing-token failures are not resolved. No browser, build, generated-asset or performance claim follows from these pure tests.

## Caller obligations and remaining gates

`SceneSample` is a caller-supplied receipt, not proof that the browser committed correct measurements. The future producer must bind real card/control owners, all collision inputs, store identity and unpublished-state fencing to the right publication. It must use store-scoped ticket incarnations and a dedicated controller instance rather than share a diagnostic controller. `PlacementSnapshots` still maintains its existing board-local slot caches; this slice does not change those semantics.

`captureReady` is only the pure scene's readiness contribution. It is not permission to submit a frame operation. Local `CaptureGuard`, server capture validation, store token binding, complete DOM/control sampling and submission/history integration remain unimplemented. No guarded spatial action has been enabled.

The UI still uses its existing positions. New identities have pure staged IDs here, not a DOM staging implementation. Cards, edges/ghosts, fit/focus and frame consumers have not been converted. Actual-App coherency, no-fake-position staging, frame preview integration, filtered control footprints, browser mutation tests and the 120-card trial still require later slices.

Default activation stays blocked even if every future opt-in test passes. This work supplies neither visible pen/Inbox controls nor complete production obstacle or generated-asset evidence.

## Preserved state and provenance

The original uncommitted tree remains on `main` at `12601fa808e8eaf06308630e70a20669ea3f4260`. The protected 201-file baseline is SHA-256:

`6b19037e74b9a900a24af53de1aa88a448b1114d1baa12c82724ffc3447e9abd`

The check sorts unique existing paths from `git ls-files -co --exclude-standard -z`, excludes ticket metadata except `.tickets/canvas/default.yml`, then hashes each path, NUL, bytes, NUL. At the final check it excludes only the two new source/test files and this new document. This covers all inherited uncommitted work, original contract tests, reviewed documents, allocator/controller, diagnostic injection, `main.ts` and assets.

User layout SHA-256 remains `852da1cea4bae70a3809aab5ddaa679ca09cabda477e828636fdf2b62cdf5eee`. The index is empty. No build, `just check`, asset generation, staging, commit, push or release ran. No sub-agent was launched for this slice. The ticket stays in-progress and every end-to-end acceptance and definition-of-done checkbox remains unchecked.

Recorded in session `20260910-205247-e15f8f9e` with terva `0.134.6-0.20260910010245-6f36fa1e7be7`, commit `6f36fa1`, built `2026-09-10T01:05:08Z`; extensions index `0.8.2`, obsidian `0.2.0`, web `0.3.1`; `gpt-6-astra` through `openai-codex`.
