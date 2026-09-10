# Opt-in consumer contract tests

For TKT-01M2441T0PTXRFK6VC4FM1PET7 (Route automatic tickets to label-matching canvas pens).

Status: initial tests-only stage complete. The new feature contracts are red. No trial implementation or default activation occurred.

The user approved the bounded trial in the ticket's 21:23:44 and 21:27:45 approval notes, then requested starting with scene, preview and capture-guard tests. Those approvals supersede the historical unapproved wording in [the reviewed proposal](pen-position-consumers-proposal-v1.md). That document remains unchanged.

## Files and contracts

| New file | Contract specified |
| --- | --- |
| `web/src/platform/canvas/scene.test.ts` | Separate opt-in coordinator, complete immutable scene rectangles and lineage, computation-free projections, startup/provisional/failure readiness, gesture/frame holds, exact per-card owners and one aggregate proposal owner. |
| `web/src/platform/canvas/capture.test.ts` | Explicit empty versus unavailable capture, inclusive centers and existing ownership, local invalidation, complete frame membership movement, automatic null inverses and observed-change redo invalidation. |
| `web/src/platform/tickets/store-capture.test.ts` | Full-read token binding, 304 preservation, token-only publications, board/read generations, guarded request forwarding, tokenless mutation invalidation and conflict reload without replay. |
| `internal/api/capture_test.go` | Versioned wire guard, positive controls, malformed and stale refusal, complete record insertions, unrelated edits, derived expiry, fresh external inputs, sparse CAS preservation, concurrent disjoint requests and legacy compatibility. |

The pure tests name future `SceneCoordinator`, `sceneRect`, `sceneCenter`, `sceneBounds` and `CaptureGuard` exports. Neither `scene.ts` nor `capture.ts` exists. No production stub or test-only replacement implements these contracts.

### Scene and preview API

`SceneCoordinator` receives the existing `PlacementSnapshots` instance. `activate` binds store path, board and App generation and returns the controller scope. `publish` receives the complete placement input, authored frames, capture token and a committed sample carrying baseline, revision, registration owners and completeness. These are caller-supplied receipts in this first pure contract, not proof of a correct DOM sample.

The read-only scene carries positions with dimensions, original lineage, display mode, capture readiness, collision safety, staged IDs and optional aggregate overlay owner. Pure rectangle/center/bounds projections never allocate. The caller must route cards, edge/ghost origins, fit/focus and frame operations through these projections during later integration.

`beginGesture`, `projectGesture`, `submitDrop` and `cancelGesture` separate frozen geometry from submission. `submitDrop` returns captured board/generation/cards and a unique owner, installs that owner synchronously, and does not flush queued samples. A later committed publication accepts an overlay-free base, then proposes against the same revision and baseline. Only submitted manual cards enter the request.

`complete` removes only the exact submission's current owners. A successful completion does not invent an accepted card: the actual response must be published. Two saves for the same card and saves for separate cards retain their own owners. One immutable aggregate owner represents the complete proposal set. Old cancellation and old board/incarnation completions cannot clear newer overlays.

`beginFrame` and `endFrame` retain the full reflow hold. Pending card saves prevent a frame hold. A failed proposal keeps explicit pending coordinates without claiming a collision-safe scene.

### Local capture API

`CaptureGuard.observe` records the current scene. `capture` returns a tagged ready result with member IDs, measured rectangles and bound token, or an unavailable result. `validate` checks the original result rather than recapturing. `prepareMove` prepares every explicit member from that scene and preserves null preimages for automatic members.

The frame test uses the existing `FrameHistory` for null restoration through current routing. After undo, `armRedo` and `validateRedo` specify a separate observed-scene guard. Change followed by change-back cannot restore the old guard. This is not yet wired into `FrameHistory`, `FramesPanel` or submission handlers.

## Server wire and canonical input contract

Complete `GET /api/board` responses add an opaque string `captureToken`. `PUT /api/layout` can declare the new guarded path:

```json
{"capture":{"version":1,"token":"<opaque capture token>"}}
```

Existing cards, frames, routing and their sparse expectations remain separate. Omission of `capture` selects legacy behavior. A present null/incomplete/malformed guard or unsupported version returns 400 before writing. A well-formed token that does not match fresh inputs returns 409 with `layout_conflict`. A valid token never bypasses sparse preimages or read-only checks. Guard fields never enter authored YAML or persisted frame history.

The version-1 canonical projection for implementation is:

- A domain/version discriminator of 1.
- The selected normalized board, including board name, schema, complete authored cards, frames, pens, rule order and Inbox. Keep every record field, not only coordinates or sparse expectations.
- The complete public ticket DTO collection sorted by full ID. Keep every DTO field, including creation/revision identity, short ID, labels, body, claim and evaluated readiness. Do not hash only the tickets named in a frame request.
- The complete public config DTO used by that board response, including actor and presentation configuration.

Use deterministic JSON serialization with sorted object keys and the ticket ordering above. Preserve other array order rather than silently treating it as a set. Prefix the SHA-256 digest with `capture-v1:`. Clients treat the result as opaque; mocked frontend fixtures use synthetic token strings and do not test server syntax. Exclude the token itself, ETag, transport headers, live coordinator counters, raw wall time, response board-name list, read-only flag and store-path display string. The local guard binds store identity separately. Identical canonical inputs can produce identical tokens in another store; this is not authentication.

Evaluate time-dependent ticket presentation at the request's captured clock instant. Time passing without a derived value changing must retain the token. Compute validation from authoritative inputs inside the existing mutation boundary, not a potentially stale watcher snapshot. Do not hold the mutation lock while reading network request bodies or writing network responses.

This projection deliberately accepts harmless-edit conflicts. The tests include an unrelated priority edit as a conservative conflict, frame title changes with otherwise current sparse preimages, whole-record insertion, claim expiry without a revision change, and an external ticket/config write before validation. The concurrent test uses disjoint card preimages so a sparse-CAS conflict cannot masquerade as whole-board token enforcement.

The existing mutexes protect requests through this server only. These tests do not establish exclusion against an external writer after validation or detect hidden byte-identical recreation. No cross-process locking change is included.

## Executed results

Before adding these tests, `npm run test:unit` passed 364 tests in 20 files, `npm run typecheck` passed, and `go test ./internal/api ./internal/layout` passed.

Final runs after correcting fixture typing:

| Command | Actual outcome |
| --- | --- |
| `npm run test:unit` | 364 existing tests pass. Four new store tests fail. Two new pure suites fail import with zero tests collected and zero assertions executed. Total: 20 passing files, three failing files. |
| `npm run typecheck` | Three TS2307 diagnostics only: the two imports of absent `./scene` and the import of absent `./capture`. |
| `go test -race ./internal/api -run '^TestCapture' -count=1` | Compiles. All seven top-level groups fail at `complete board read has no captureToken`; the stale-input group's ten subtests stop at that same prerequisite. |
| `go test -race ./internal/api ./internal/layout -count=1` | Layout passes. API fails at the seven new capture groups above; no other failure or race diagnostic is reported. |

The store failures expose missing state token preservation/reset and stripping of the request's `capture` field. Its conflict test reaches and passes the existing one-write/two-read assertions, then fails because the reloaded token is absent. The token binding and request-forwarding failures prevent later 304/tokenless-mutation assertions in those cases from running.

The HTTP fixture creates tickets and legacy frames successfully, and the explicit legacy card write succeeds. No valid guarded request reaches execution because the full-read token prerequisite fails first. Malformed/stale/refusal, expiry, concurrency and read-only guard assertions are written but not yet exercised. Do not report them as passing protection or as seven independent guard-algorithm failures.

The first TypeScript run also caught mutable fixture maps annotated as `ReadonlyMap`. A later store fixture used nullable frame changes where a normalized board was required. Corrected both fixture errors without editing production types. The final diagnostics contain only missing production modules. Missing imports still mask future module API/type compatibility; a later implementation must rerun strict TypeScript and every deeper assertion.

## Preserved state and remaining evidence

All 196 pre-existing files outside ticket metadata are byte-identical to the tests-stage baseline:

`a13cff2277add13980613a28a8ca0fb1813c80e22b50cf3b49a29a7118902e55`

The checksum sorts unique existing paths from `git ls-files -co --exclude-standard -z` and hashes each path, NUL, file bytes, NUL. It excludes ticket metadata except `.tickets/canvas/default.yml`, and excludes only the five new paths listed in this document including this document itself. Thus it covers inherited uncommitted production changes as well as tracked files, reviewed artifacts, `main.ts`, diagnostic injection, assets and user layout.

Tracked and new-file whitespace checks pass. The index remains empty. The original tree remains on `main` at `12601fa808e8eaf06308630e70a20669ea3f4260`. Strict ticket validation is checked after recording this evidence.

No production build, `just check`, asset generation, browser trial, staging, commit, push, release or sub-agent ran in this tests-only stage. No existing test or production file changed. The ticket stays in-progress with all end-to-end acceptance and definition-of-done items unchecked.

This is an initial pure/wire contract set, not the complete trial test suite. Still needed before guarded consumer use:

- Real DOM staging without fake positions or duplicate registrations; fresh owner-bound card and control sampling, including frame-title wrapping and external resize handles.
- Actual-App consumer parity, unpublished-state guards, frame preview projection, and default/diagnostic injection isolation with a separate consumer injection.
- Complete token invalidation across every mutation response, stronger queued-write races, canonical ordering/restart stability and remaining record deletion/permutation cases.
- Submission/history integration that cannot bypass local validation or silently recapture/replay.
- Temporary-backend browser tests, evaluator/allocator instrumentation, filter/viewport zero-work checks and the 120-card trial.

Implement and verify those stages in dependency order. Do not change allocator geometry or `PlacementSnapshots` semantics to satisfy coordinator tests without review. Default activation remains blocked even after every trial test passes; visible pen/Inbox controls, complete obstacles, reviewed concurrency limits and source/embedded performance/build evidence still require a separate activation decision.

Recorded in session `20260910-205247-e15f8f9e` with terva `0.134.6-0.20260910010245-6f36fa1e7be7`, commit `6f36fa1`, built `2026-09-10T01:05:08Z`; extensions index `0.8.2`, obsidian `0.2.0`, web `0.3.1`; `gpt-6-astra` through `openai-codex`.
