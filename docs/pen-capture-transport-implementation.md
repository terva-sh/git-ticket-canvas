# Capture-token transport and server validation

For TKT-01M2441T0PTXRFK6VC4FM1PET7 (Route automatic tickets to label-matching canvas pens).

Implemented the requested transport/server slice. This supersedes the missing store/server support reported in [local capture evidence](pen-local-capture-implementation.md). It does not enable a consumer trial or default activation.

## Implemented boundary

- `internal/api/capture.go` computes `capture-v1:` SHA-256 tokens from version 1, the complete selected normalized board, full public ticket DTOs sorted by full ID, and public config. It round-trips JSON through maps with `UseNumber` so every object key sorts, including nested struct fields. Other array order remains significant. Tokens exclude transport metadata, board-name lists, store path, read-only mode and raw wall time.
- `snapshot.go` supplies the same captured-file-image builder to cached board representations and fresh mutation validation. Complete board responses contain `captureToken`; the full-response ETag includes that field but is not interchangeable with it. Existing cached reads remain cached.
- `server.go` distinguishes absent `capture` from a present guard. Legacy omission remains supported. Null, malformed, unsupported-version and unknown-field guards return 400. Well-formed stale tokens return 409 `layout_conflict`. Guarded requests use the existing layout transaction, require sparse expectations, and retain read-only and ticket-membership checks. Guards never enter layout YAML.
- `types.ts` adds `CapturePrecondition` and optional wire fields for compatibility with legacy responses. `TicketStore` exposes nullable `captureToken`, binds it only on accepted complete reads, and publishes token-only changes. Every queued write and board switch invalidates the token. Partial mutation responses cannot restore it; valid cached 304s preserve only their existing binding.
- Transaction forwarding copies only the explicit capture field alongside existing wire fields. The write queue freezes the request. A conflict waits for queued writes, reloads the active generation, and rejects the original operation without replay or token substitution.

No UI, DOM sampling, scene/local guard, allocator, snapshot-controller, frame-history, default entry-point or diagnostic-injection changes were made in this slice. The inherited changes in those files predate this work.

## Read, validate and write boundary

`withStore` buffers the bounded request body before acquiring `Server.mutations`. Inside that mutex it captures one clock instant and opens request-local ticket state. Guard validation reads a fresh authoritative file image and constructs DTOs at that instant instead of consulting the watcher cache. It compares the token before the layout transaction checks sparse preimages and writes. Response network I/O remains outside the mutex. The builder does not acquire coordinator locks recursively.

This serializes requests through this server, including disjoint guarded writes sharing one token. It does not lock out external editors or another process between image capture, validation and layout write. It does not detect byte-identical changes hidden between observations. A valid token is neither authentication nor evidence of correct browser geometry. Conservative conflicts after unrelated metadata changes are intentional.

## Verification and fixture correction

Before implementation, the seven original Go capture groups failed at missing board tokens. Their positive controls and deeper assertions now execute and pass. The four inherited store cases were already red. Four additional store lifecycle cases also failed before store changes. The queued-conflict case's early failed assertion prevented its later awaited rejection check from running in that red run.

After implementation, one inherited store case exposed an unreachable fixture assumption: its invalid 304 caused the existing unconditional retry, but the default mock then returned a full 200 carrying the original token. Accepting that complete response is correct. The fixture now explicitly supplies a tokenless 200 on retry, verifies both reads occurred, then supplies a fresh token-bearing 200. The production 304 recovery algorithm is unchanged. Two missing test-fixture ETag fields caused TypeScript errors and were corrected before final checks.

Eight added store regressions cover enqueue-time invalidation, immutable prior state, reads crossing writes, failed writes/bodyless reads, queued conflict recovery, patch/create/delete invalidation, immutable queued guards, old-board responses and legacy tokenless reads. Four were added after implementation and passed on their first run. Three added Go regressions cover canonical ordering, guard syntax and missing sparse expectations; these also passed on their first run, not an observed red run.

Final executed checks:

| Check | Result |
| --- | --- |
| `go test -race ./internal/api -run '^TestCapture' -count=1` | Pass, all ten groups including the seven original groups. |
| `go test -race ./... -count=1` | Pass without skips. |
| `go vet ./...` | Pass. |
| `npm run test:unit` | 427 pass across 26 files, including 12 store capture tests. |
| `npm run typecheck` | Pass. |
| Strict ticket validation and tracked whitespace | Pass before this evidence record; final checks follow it. |

The original tree was verified before implementation at `main`, HEAD `12601fa808e8eaf06308630e70a20669ea3f4260`, with an empty index and the handoff's 207-file aggregate hash `fd8179a4126779bdaeeb3371945b19b43d4a151605afe27ae720d683c10e7164`. User layout still has SHA-256 `852da1cea4bae70a3809aab5ddaa679ca09cabda477e828636fdf2b62cdf5eee`. The intentional draft-ticket deletion remains inherited. Work remains uncommitted; no staging, commit, push, release, asset regeneration, production build or `just check` occurred. No sub-agent was launched for this slice.

## Remaining gates

Default activation remains blocked even after these tests pass. The next bounded prerequisite is actual owner-bound committed card/control sampling, including filter-independent obstacle footprints and staging. Unpublished-state fencing, coherent opt-in position consumers, local guard validation immediately before submission, and submission/history integration remain unfinished. Server support alone does not authorize any geometry-dependent UI action.

No browser, end-to-end, performance or generated-asset evidence was collected here. Keep the ticket in-progress and all end-to-end acceptance and definition-of-done boxes unchecked. Reviewed documents remain unchanged; this document records the new result.

Recorded in session `20260910-222105-a66a0903` with terva `0.134.6-0.20260910010245-6f36fa1e7be7`, commit `6f36fa1`, built `2026-09-10T01:05:08Z`; extensions index `0.8.2`, obsidian `0.2.0`, web `0.3.1`; `gpt-6-astra` through `openai-codex`.
