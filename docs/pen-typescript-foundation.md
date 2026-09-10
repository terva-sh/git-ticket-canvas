# Pen TypeScript foundation

Implementation evidence for TKT-01M2441T0PTXRFK6VC4FM1PET7 (Route automatic tickets to label-matching canvas pens).

The user authorized TypeScript wire/store support and test-first pure rule evaluation after verifying the backend handoff. This document supplements [the backend evidence](pen-backend-schema3.md), [the reviewed implementation plan](pen-implementation-plan-v1.md), and [the rule-authoring addendum](pen-rule-authoring-addendum-v1.md). Those artifacts remain unchanged.

## Wire and store support

`web/src/platform/tickets/types.ts` defines `Point`, `Pen`, `Pens`, `Routing`, `RoutingTransaction`, and `NormalizedBoard`. Legacy `Board` responses may omit routing. A `LayoutRequest` that replaces routing requires a complete `expect.routing` at compile time. Mixed card/frame changes retain their record preimages.

`web/src/platform/tickets/layout.ts` centralizes response normalization. Schemas 1/2 receive empty pens/order and a fresh `{x: 0, y: 0}` Inbox without a write. Schema 3 requires complete routing. The normalizer rejects unsupported schemas, routing on legacy responses, unknown top-level/routing/pen/point fields, malformed geometry, empty or blank rules, and invalid order permutations. It deduplicates requirements without splitting, case folding, trimming, or rounding read coordinates. Its blank-label check follows Go's Unicode White_Space definition rather than JavaScript `trim`, which would reject a backend-valid U+FEFF requirement.

This is routing validation, not a replacement for the Go parser. Existing card/frame record validation remains server-owned. Frontend rule-authoring controls and new-entry trimming are not implemented here.

`TicketStore` retains `pens`, `ruleOrder`, and `inbox` in persisted state. Board selection resets all three. The same reconciliation path handles board loads, ordinary layout saves, frame saves, routing saves, and creation responses carrying a layout. Equivalent 200 responses, 304 responses, and equivalent layout mutations preserve state identity. A changed pen replaces that record while unchanged pens, cards, frames, tickets, order, and Inbox retain identity as applicable.

Ticket-only creation and patch responses retain routing. Deletion has no layout response; it retains routing while applying the existing card/membership cleanup, or preserving layout when cleanup fails. Invalid layout responses fail before publication and do not install their ETag.

`saveRoutingLayout(board, transaction)` uses the existing serialized layout-write queue. It validates complete replacement/preimage routing, snapshots requests before queueing, permits atomic card/frame changes, and excludes operation labels from the request. Read-only checks run both before queueing and at submission. A layout conflict waits for queued writes to settle, rechecks the board generation, and reloads that generation once. It preserves the original error and never replays the edit. Stale board-generation responses cannot publish routing. Mutation returns carry normalized layouts for subsequent preimages.

The HTTP client needs no separate routing endpoint. Its existing JSON request/response path preserves these fields; a store test exercises that path with mocked fetch responses, not a live server.

## Pure evaluation

`web/src/platform/canvas/pens.ts` exports `evaluatePens(routing, allTickets, cards)`.

- Pass the complete ticket collection, not the filtered view. Inputs can be a board's routing fields or its normalized board/state object. `cards` contains only persisted manual records.
- Every distinct exact requirement must match. Extra ticket labels are allowed. Greater distinct-label specificity wins; explicit rule order breaks ties.
- Destinations use tagged values, so a pen with ID `inbox` cannot collide with built-in Inbox.
- Each ticket result includes matched/missing labels for every candidate, specificity, zero-based explicit order, and winner/loser reasons.
- Manual cards have `destination: null` plus a `potentialDestination` and explanations. They never increment automatic-assignment counts.
- Counts include every automatic winner in the supplied collection, including hidden tickets. Geometry and frame membership do not determine assignment. Eventual overflow cards must remain included by supplying the same complete collection.
- Every rule pair reports its combined requirements and set relationship: equal, subset, intersecting, or disjoint. Positive independent labels can coexist even when disjoint. Current counts separate manual matches, automatic top-specificity ties, matches outranked by greater specificity, and unequal-specificity resolutions.

A top-specificity tie is a pair-level fact, not proof that swapping that pair changes the winner. A third equally specific rule may precede both. Candidate explanations identify the actual winner, and a three-way-tie test protects that distinction.

The evaluator owns no cache and performs no DOM access, persistence, placement, or ticket mutation. Returned types expose readonly results. Each invocation creates its own result; it does not freeze all returned objects at runtime. Duplicate input ticket identities fail rather than inflate counts. Matching validates/copies the authored routing once, then evaluates ticket requirements. Overlap counting visits rule pairs and tickets, reusing precomputed winner specificities rather than rescanning candidates for each pair.

## Verification

The store test-first run produced 40 failures out of 42 tests at the expected missing routing-state, validation, and routing-save behavior. The initial pure-suite run failed to import the not-yet-created module, so it did not execute assertions. Implementation then passed both suites. Follow-up regression tests caught and fixed board-carried routing rejection and the Go/JavaScript Unicode whitespace mismatch.

Read-only reviewer `read-only-review-of-the-475313` found one conflict-recovery race: a queued ticket-only mutation kept the write count nonzero and caused an immediate recovery read to be discarded. Two regression tests reproduced premature rejection and an unwanted recovery read around a board switch. Shared frame/routing recovery now waits for `whenIdle()` and rechecks the board generation before loading. Both tests pass. The reviewer found no other independent schema-preservation or evaluator correctness gaps.

Final checks after the recovery fix:

- `npm run test:unit`: 268 tests passed across 15 files, including 48 new schema-3 store tests and 26 pure evaluator tests. This includes existing component, frame, live-update, and AST boundary tests.
- `npm run typecheck`: passed, including compile-time rejection of absent/partial routing preimages.
- `go test -race ./... -count=1`: passed without excluding pen tests.
- `go vet ./...`: passed.
- `git diff --check` and explicit new-file whitespace checks: no diagnostics.
- Strict ticket validation: no errors or warnings.

Coverage includes real-client JSON serialization through mocked fetch, schema-3 empty routing, exact Unicode labels, 200/304 identity preservation, all layout response paths, board switches, A-to-B-to-A races, serialized writes, immutable captured preimages, read-only changes while queued, conflicts, cleanup errors, failed saves, exhaustive small-label matching, potential overlaps with no tickets, three-way ties, manual exclusions, and frozen inputs.

## Remaining work and preserved state

No production caller invokes `evaluatePens` yet. `Canvas` still uses the existing automatic status-lane placement path. This slice does not establish event-driven placement, gesture freezing for pen edits, collision-free slots, UI controls, browser walkthroughs, or production performance.

Placement snapshots, measurement triggers, separate accepted/proposed caches, save ownership, and frame automatic-position capture guards remain in the reviewed plan. Routing CAS alone does not guard concurrent ticket-label or collision-input changes when a later frame operation captures automatic coordinates.

No `just check` ran because it rebuilds assets. No frontend build, browser suite, HEAD parity check, staging, commit, push, or release ran. `web/dist`, UI source, existing geometry/frame algorithms, reviewed documents, mockups/check scripts, and user `.tickets/canvas/default.yml` remain unchanged. The user-layout SHA-256 remains `852da1cea4bae70a3809aab5ddaa679ca09cabda477e828636fdf2b62cdf5eee`.

All pen work remains uncommitted in the original `main` working tree based on `12601fa808e8eaf06308630e70a20669ea3f4260`. A fresh checkout at HEAD does not contain this foundation or its uncommitted backend dependency. The ticket stays in progress with end-to-end criteria unchecked. Placement and UI integration require the next bounded authorization.

## Record provenance

Session `20260910-180705-fd3659c9`. Recorded with terva `0.134.6-0.20260910010245-6f36fa1e7be7`, commit `6f36fa1`, built `2026-09-10T01:05:08Z`. Extensions: index `0.8.2`, obsidian `0.2.0`, web `0.3.1`.
