# Pure local capture guard

For TKT-01M2441T0PTXRFK6VC4FM1PET7 (Route automatic tickets to label-matching canvas pens).

Implemented the user-requested pure local capture contracts after the [scene coordinator slice](pen-scene-coordinator-implementation.md). Default activation remains blocked. This document supersedes the earlier missing-local-module result, not the reviewed trial proposal or its remaining gates.

## Implementation

`web/src/platform/canvas/capture.ts` exports `CaptureGuard`. It consumes immutable `Scene` envelopes and has no UI, DOM, network, storage or allocator dependency at runtime. No production consumer imports it.

- `observe` compares scope, baseline/revision, readiness, token, positions, authored cards/frames, obstacles, staged IDs and card/control registration owners. Equivalent envelopes preserve receipts. Any observed change advances a local epoch; change-back cannot revive an old receipt. Symbol owners are compared by identity, not serialized to JSON.
- `capture` uses the existing inclusive-center `captureMembers` operation across the whole scene, excluding assigned members. Ready empty results remain distinct from unavailable results. Receipts contain the source scene, token, immutable members and read-only measured rectangles.
- `validate` checks the exact locally issued receipt and epoch without recapturing. Foreign guards and copied receipts fail. Weak maps retain no otherwise unreachable receipt.
- `prepareMove` uses the existing `moveFrame` operation for every explicit member, including hidden/outside members. It preserves two-decimal rounding, manual preimages and null automatic preimages. Missing frames/members and invalid deltas return unavailable; a no-op returns `kind: 'noop'` with no operation. Prepared operations and nested preimages are frozen.
- `armRedo` and `validateRedo` provide a separate conservative whole-scene receipt for the requested member IDs. They do not alter `FrameHistory`, reuse old absolute positions or obstruct null restoration on undo.

The caller must observe every scene transition, including unavailable and held scenes, and validate immediately before submission. The guard cannot discover an unpublished store update or an unreported DOM change. Scene inputs must remain immutable. Receipt validity is not server authorization, proof of correct geometry or a replacement for sparse preimages.

## Test results and fixture correction

Before implementation, the focused capture suite failed to import `./capture` and executed zero assertions. The first implementation run passed 12 of 13 original cases; strict TypeScript passed.

The last case reached a previously unexecuted incorrect fixture expectation. While the frame member `hidden` was manual, the unrelated automatic card `owned` took the new Inbox pin at `(-800, 300)`. On undo, stable placement correctly retained that slot and routed `hidden` to the adjacent slot at `(-800, 176)`. Corrected that one expectation in `capture.test.ts` and added an explicit assertion that `owned` retains the pin. No allocator, snapshot, scene or frame-history behavior changed to satisfy the test. The remaining undo/redo and change-back assertions now execute and pass.

Added 14 regression cases in `capture-regressions.test.ts` for initial unavailability, equivalent observations, symbol-owner/token/title invalidation at the same lineage, change-back, foreign/copied receipts, invalid bounds, hold recovery, missing members, no-op movement, frozen results, rounding and zero allocator work during guard operations. These additional cases passed on their first run; they are not claimed as observed red regressions.

Final checks:

| Check | Result |
| --- | --- |
| Capture contracts and regressions | All 27 tests pass. |
| Focused capture, scene, frame and platform boundary run | 76 tests pass in six files. |
| `npm run typecheck` | Passes with no diagnostics. |
| `npm run test:unit` | 415 tests pass; four inherited store-capture tests fail. 24 passing files and one failing file. No missing-module suites remain. |
| Whitespace and protected-file checks | Pass. |

The four store failures still concern missing token binding/reset/propagation and stripped capture request data. They were not changed or skipped. Go code did not change and Go tests were not rerun; the previous server missing-token failures remain unresolved. No browser or performance evidence was collected.

## Preserved state and remaining gates

Only `capture.ts`, `capture-regressions.test.ts`, this document, the identified fixture assertion and ticket metadata changed. All other 203 pre-slice files remain byte-identical, including the scene coordinator, frame algorithms/history, allocator/controller, diagnostic injection, UI, `main.ts`, reviewed documents, generated assets and user layout.

The starting 204-file checksum is `6bb7a820aa9b14e8e13ba541359c3b84f409e026d680d18f45375f54fa74b365`. The check sorts unique existing paths from `git ls-files -co --exclude-standard -z`, excludes ticket metadata except user layout, and hashes path, NUL, bytes, NUL. Final verification excludes the three new files and reverses only the exact documented fixture replacement in memory while hashing. No disk restoration occurred. This verifies both the unchanged files and the precise allowed test correction.

The original tree remains uncommitted on `main`; the index is empty. No build, `just check`, asset regeneration, staging, commit, push, release or sub-agent launch occurred. The ticket remains in-progress with every end-to-end acceptance and definition-of-done item unchecked.

Still required before guarded trial use: store/server token implementation, complete owner-bound card/control DOM sampling, unpublished-state fencing, coherent actual-App consumers, and submission/history integration that cannot silently recapture or bypass validation. The current guard observes only the supplied pure scene. Passing it does not enable a frame request or the opt-in UI. Default activation requires its separate approval and remaining control, obstacle, concurrency, browser, performance and generated-asset evidence.

Recorded in session `20260910-205247-e15f8f9e` with terva `0.134.6-0.20260910010245-6f36fa1e7be7`, commit `6f36fa1`, built `2026-09-10T01:05:08Z`; extensions index `0.8.2`, obsidian `0.2.0`, web `0.3.1`; `gpt-6-astra` through `openai-codex`.
