# Pure pen placement and snapshots

Implementation evidence for TKT-01M2441T0PTXRFK6VC4FM1PET7 (Route automatic tickets to label-matching canvas pens).

This implements the pure-engine slice in the unchanged [approved scope](pen-placement-snapshot-scope-v1.md). It supplements the [TypeScript foundation evidence](pen-typescript-foundation.md). Earlier statements that placement is unimplemented are superseded for these modules only. No production caller uses them yet.

## Files and boundary

- `web/src/platform/canvas/placement.ts` exports `preparePlacement` and `allocatePlacement`.
- `web/src/platform/canvas/snapshots.ts` exports `PlacementSnapshots`.
- Adjacent `placement.test.ts` and `snapshots.test.ts` cover geometry and snapshot ownership.

These modules contain no DOM reads, Preact imports, network calls, timers, or persistence operations. They return positions, routing explanations, automatic assignments, overflow membership/counts, and lineage together. They do not change labels, frame membership, or authored card coordinates.

`App`, `Canvas`, `useMeasurements`, existing geometry/frame algorithms, backend capture guards, browser instrumentation, and generated assets remain unchanged in this slice. Existing UI behavior therefore remains unchanged too.

## Allocator contract

`PlacementInput` carries board identity, generation, monotonically increasing revision, opaque baseline, all tickets with incarnation identities, authored routing, manual coordinates, identity-tagged measured heights, identity-tagged manual previews with owner tokens, and explicit obstacle rectangles.

The caller supplies the full ticket collection, including filtered tickets. The allocator ignores unrelated metadata. It cannot recover tickets omitted by a caller. Measurements and previews for deleted or different-incarnation tickets do not affect placement.

Card width is 280. Gaps and pen padding are 24 scene units. Missing measurements produce marked provisional 280 by 340 rectangles. Provisional geometry does not guarantee that an unmeasured rendered card fits.

Manual cards never move to make room. A pending manual preview supplies that ticket's displayed position and excludes it from automatic counts without changing its persisted record. Both the persisted manual source rectangle and the pending preview rectangle reserve space. Manual-to-manual overlaps remain authored overlaps; automatic cards avoid them.

Allocation proceeds as follows:

1. Reserve manual cards, previews, and explicit control/header obstacles in one scene-wide index.
2. Revalidate previous automatic slots by board, ticket incarnation, destination geometry/pin, size, containment/overflow classification, and collisions. Reserve unchanged-height slots before reconsidering resized cards.
3. Process unplaced cards by explicit destination order, then Inbox, then full ticket ID within each destination.
4. Enumerate a lazy near-pin lattice, using strides of width plus gap and height plus gap. Clamp the origin to the valid top-left domain. Order by squared distance, then y and x.
5. Exhaust the interior lattice before overflow. Overflow enumerates below, right, above, and left half-plane lattices in round-robin order. Each starts nearest its boundary/pin anchor.
6. Inbox searches a whole-scene near-pin lattice. It has no interior-capacity boundary or overflow count.

This is deterministic lattice placement, not optimal rectangle packing. An interior can have unused space that is not a free lattice slot. Valid retained overflow slots stay outside rather than compacting into later holes. Destination geometry/pin changes invalidate that destination's retained slots; title and color changes do not.

Fractional lattice arithmetic clamps yielded coordinates to the domain. The allocator also checks actual padded edges and overflow classification before accepting a candidate. Regression tests cover fractional boundaries and 24-unit separation.

### Limits and immutability

Automatic rectangles fit within scene coordinates from -1e9 to +1e9. Search defaults to 50,000 yielded candidates across the snapshot. `maxCandidates` can override that budget for allocator tests. Exhaustion returns `search-exhausted` or `coordinate-exhausted`, with no partial snapshot or silent Inbox fallback. Invalid inputs return `invalid-input`.

The index uses 512-unit buckets. Insertion or lookup spanning more than 4,096 buckets falls back to scanning supplied rectangles rather than expanding a scene-sized bucket array. Candidate limits bound enumeration, not total rule-evaluation or collision work independently of input size.

Snapshots own frozen nested objects and arrays. Read-only map facades expose no mutators and do not leak their backing maps through `forEach`. The allocator copies inputs rather than freezing caller-owned data. `work` reports candidate, collision-check, and retained-slot counts; it is diagnostic data outside the immutable snapshot.

## Accepted and proposed ownership

`activate(board)` returns a fresh frozen board/generation token. The controller keeps each board's last-good cache but exposes no accepted snapshot for a new generation until `accept(input)` succeeds. A failed first acceptance in a new generation does not expose a previous generation's cached snapshot.

`accept(input)` rejects inactive generations and older revisions. One revision cannot name conflicting baselines or effective content. A newer revision may carry the same baseline when measurement or other placement inputs change. Failed accepted attempts with valid revisions advance the revision watermark, so older callbacks cannot replace them. Identical failed allocations can retry; invalid inputs without a canonical key require a newer revision to recover.

A failed accepted update publishes no partial result. `accepted` keeps its last-good snapshot with its original lineage, `failure` reports the accepted-update error, and unsafe proposals disappear. New proposals are blocked until acceptance recovers. Stale generations and older revisions leave current accepted/proposed state alone, even when their payload is malformed.

`propose(input, owner)` requires the current accepted revision/baseline and a nonempty owner. New calculations always start from accepted slots, never from previous proposed slots. Equivalent proposal inputs can reuse already computed content. Failed proposals return diagnostics and clear proposed state without poisoning the accepted cache.

`cancel(scope, owner)` clears only the matching current proposal. It performs no calculation. Owner tokens distinguish proposal lifetimes; callers must not reuse an old lifetime's token for unrelated work. Manual-preview ownership in `PlacementInput` is also supplied by the caller, not inferred by the engine.

Equivalent effective inputs use `preparePlacement` keys to skip both allocation and rule evaluation. New lineage can reuse immutable nested content with a new frozen outer snapshot. Canonicalization still runs on update calls; getters never calculate. Ticket label order, duplicate ticket labels, and unrelated metadata do not invalidate content. Authored required-label order remains relevant because explanations preserve it.

Accepted updates invalidate proposals when revision/baseline changes, even if geometry can be reused. No proposal becomes accepted automatically. A successful save must later supply the actual accepted input through `accept`.

## Test-first record

Allocator tests preceded `placement.ts`. The initial focused run exited 1 because `./placement` did not exist. No assertions executed in that red run. Implementation then passed all 27 initial allocator tests and strict TypeScript.

Controller tests preceded `snapshots.ts`. Its initial focused run also exited 1 on the missing module, with no assertions executed. Implementation passed the 16 initial tests. Strict TypeScript then found a test writing through `Readonly<Cards>`; the test now mutates a separately retained mutable input alias. The focused 43-test run and typecheck passed afterward.

Host review added two regression tests before their fixes. Both failed:

- Fractional placement produced x `24.19999999999999` outside a padded minimum of `24.2`.
- A malformed older revision reported `invalid-input` and disturbed current state rather than rejecting stale work first.

Clamped lattice output plus explicit boundary checks fixed the first. Revision rejection before payload validation fixed the second. Both regressions pass in the final full run.

## Final verification

- `npm run test:unit`: 313 tests pass across 17 files, including 28 allocator tests, 17 controller tests, component tests, and import/DOM-ownership boundary checks.
- `npm run typecheck`: passes.
- `go test -race ./... -count=1`: passes without skips.
- `go vet ./...`: passes.
- Tracked and four new source-file whitespace checks pass.
- Strict ticket validation passes with no warnings or errors.

The 120-card engine fixture asserts collision-free placement, fewer than 20,000 candidate visits, and fewer than 100,000 collision checks. A second calculation retains all 120 slots with zero candidate visits. Controller invocation spies verify zero allocator calls for equivalent updates and getters. These are engine checks, not browser-response-time measurements.

The protected 116-file baseline still hashes to `d838eb295a32c50d95f19408650c6841cf777842d4a70022420eb485a0d63a0e`. This covers the pre-slice web/internal/tests/scripts trees, reviewed mockups and selected specification/evidence documents, user layout, justfile, and package manifests. The four new source/test files are excluded from that pre-slice comparison.

The approved scope hash remains `675a799cb291996a1920d10e909cdf3e04e17ee6d26e32d8ba0775624e4a7a61`. User `.tickets/canvas/default.yml` remains unchanged at `852da1cea4bae70a3809aab5ddaa679ca09cabda477e828636fdf2b62cdf5eee` and unstaged.

No frontend build, `just check`, production browser suite, staging, commit, push, or release ran. The work remains uncommitted on `main` at `12601fa808e8eaf06308630e70a20669ea3f4260`. The ticket remains in progress with all end-to-end acceptance criteria unchecked.

## Remaining integration

A separately reviewed slice must define production publication and measurement inputs, incarnation and baseline tokens, gesture freezes, deferred updates, save ownership, failure feedback, and consumers of these snapshots. Pen controls, frame-history/capture interactions, browser instrumentation, asset regeneration, and end-to-end walkthroughs remain unimplemented or unverified. This pure engine does not replace those checks.

## Record provenance

Session `20260910-180705-fd3659c9`, terva `0.134.6-0.20260910010245-6f36fa1e7be7`, commit `6f36fa1`, built `2026-09-10T01:05:08Z`. Extensions: index `0.8.2`, obsidian `0.2.0`, web `0.3.1`.
