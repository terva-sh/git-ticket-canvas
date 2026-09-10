# Pen backend schema 3

Backend implementation evidence for TKT-01M2441T0PTXRFK6VC4FM1PET7 (Route automatic tickets to label-matching canvas pens). This adds implementation evidence to the reviewed specification, implementation plan, and rule-authoring addendum. Those documents and both approved mockups remain unchanged.

## Scope

The user authorized schema/parser/renderer, atomic transactions, and API implementation after the test-first slice. This supersedes the earlier planning-only boundary for this backend work. Frontend matching, placement, controls, and generated assets remain outside this slice.

## Persistence

`internal/layout/pens.go` defines `Pen`, `Point`, and `Routing`. Schema 3 exposes `pens`, `ruleOrder`, and `inbox` alongside cards and frames. Each pen has a title, rectangle, allowed color, absolute arrival pin, and nonempty required-label list. Pens have no member list.

`Parse` reads schemas 1, 2, and 3. Legacy boards receive empty pens, empty order, and a fresh board-local Inbox at `{x: 0, y: 0}` in memory. Reads never rewrite disk or change authored coordinates. The next explicit mutation writes schema 3. Legacy files carrying any routing field, even null or empty, fail rather than silently importing newer metadata. Future versions and unknown fields also fail.

Schema-3 records require complete, non-null routing fields. Pen and point decoding rejects missing/null fields and unknown nested fields. Validation rejects nonfinite or out-of-range coordinates, nonpositive rounded dimensions, invalid IDs/titles/colors, empty rules, blank labels, and invalid order permutations. Required labels retain exact case, spaces, commas, and unconfigured values. Duplicate labels collapse to one exact requirement without trimming or splitting.

Canonical YAML sorts pen IDs, quotes IDs and strings, preserves explicit rule order, and rounds coordinates to two decimals on writes. Sparse card writes, frame transactions, and ticket deletion retain routing. Null card writes remove manual coordinates without removing frame membership.

For source compatibility, `Save` accepts programmatic card/frame-only `Board` literals with all routing fields absent and supplies the empty default. This exception does not apply to parsed schema-3 files or partial routing records. `Save` still loads the existing file first and refuses to overwrite malformed or unsupported disk data.

## Atomic transactions and API

`PUT /api/layout` accepts a complete `routing:{pens,ruleOrder,inbox}` replacement and requires a complete `expect.routing` preimage. Existing card/frame writes and their expectations may accompany it. `RoutingTransaction` extends the existing lock, reload, read-set comparison, validation, and single-file rename path. `Transaction` remains a wrapper for existing callers.

Malformed replacements or preimages return HTTP 400. A valid stale preimage returns HTTP 409 with `layout_conflict`. All card/frame/routing expectations must match before any requested change is applied. Exact-label requirements compare as sets; explicit rule order remains order-sensitive. A response's normalized routing can serve as the next preimage.

The API retains request buffering before the mutation lock and response writes after unlocking. Snapshot reconciliation still runs through the existing mutation path. Complete board responses and ETags include routing without a second persistence file or a special routing endpoint. Read-only mode blocks these writes.

## Verification

Passed on the uncommitted backend worktree based on `12601fa808e8eaf06308630e70a20669ea3f4260`:

- `go test -race ./internal/layout ./internal/api`
- `go test -race ./... -count=1`
- `go vet ./...`
- `git diff --check`

The five layout pen tests and six API pen tests pass. They cover schema migration without read-time writes, deterministic round trips, exact labels and deduplication, YAML-sensitive keys, malformed records, preservation through existing writers, stale routing and unpin atomicity, simultaneous insert/reorder with exactly one winner, read-only rejection, ETag invalidation, and normalized write responses usable as subsequent preimages. Additional malformed-input cases cover partial/null pins and Inbox, nonfinite pins, null coordinates, and incomplete pen expectations. Existing frame compatibility tests now use `Schema` and `Schema+1` instead of assuming version 2 is current.

The complete Go race suite ran without skipping pen tests. This replaces the earlier intentional red-phase result. It does not establish frontend matching, placement, drag/live-update behavior, controls, or browser performance. `just check` and embedded browser suites were not run, and frontend assets were not rebuilt.

SHA-256 checks confirmed the approved specification, plan, addendum, both mockups/check scripts, and user `.tickets/canvas/default.yml` match their prior hashes. No frontend changes, staging, commit, push, or release occurred. The ticket remains in-progress; end-to-end acceptance criteria remain unchecked.

## Record provenance

Recorded with terva `0.134.6-0.20260910010245-6f36fa1e7be7`, commit `6f36fa1`, built `2026-09-10T01:05:08Z`. Loaded extensions: index `0.8.2`, obsidian `0.2.0`, web `0.3.1`. Session `20260910-013410-55c12f2e`.
