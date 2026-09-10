# Frames v1 pre-commit review fixes

This records the fixes requested after review of TKT-01M24411DDC98WXKT2MY2FMHQN
(Add persistent canvas grouping frames). It supplements
[the implementation record](frames-v1-implementation.md), which remains unchanged.
The approved specification, mockup, and historical design also remain unchanged.

## YAML identifiers

The renderer now quotes board names and card/frame map keys. Validation allowed
names such as `null`, `Null`, `NULL`, and `-`, but the previous unquoted output
could discard null map keys or produce a board that the strict parser refused.
Frame transactions could report success before the next load lost the frame.

`TestYAMLSensitiveIdentifiersRoundTrip` checks twelve accepted names, card positions,
frame membership, and byte-stable repeated writes. It separately checks null map
keys on the ordinary `default` board. Before the fix it failed for the three null
spellings, the dash board name, and silent map-key loss.

`TestFrameAPIYAMLSensitiveNamesSurviveSnapshotAndReload` verifies the HTTP response,
live snapshot, independent disk reload, and later sparse writes for the three null
spellings and the dash name. It also checks that the new board does not prevent
reading the default board.

Quoting changes the canonical representation on the next actual save. Loading a
layout does not rewrite it. This fix does not attempt to repair files that an
older writer already corrupted.

## Mutation lock boundaries

`withStore` now reads POST, PATCH, and PUT bodies into a bounded memory buffer
before acquiring the shared mutation lock. The existing 4 MiB limit and
`bad_request` error envelope remain. Read-only requests fail before reading their
body. DELETE does not consume a body.

Inside the lock, the server opens the request-local store, decodes the in-memory
body, validates identities and preconditions, performs mutations, and reconciles
the live snapshot. It buffers all responses, including store-open errors, and
releases the lock before writing HTTP headers or response bytes. Ticket deletion
and frame identity validation therefore remain serialized without waiting for
network I/O inside the lock.

`internal/api/mutation_io_test.go` adds deterministic gates for stalled POST,
PATCH, and PUT bodies and stalled response headers and bodies. Each test requires
a complete mutation on another board to finish while the first request remains
blocked. All five cases failed before the fix and pass afterward. Additional tests
check the body-size limit and read-only refusal without reading a body.

This change prevents one stalled client from monopolizing the mutation lock. It
does not add body or response timeouts, and a stalled connection can still retain
its own handler resources. The previously documented cross-process and external
filesystem writer limitations remain.

## Verification

- `go test ./internal/layout -run TestYAMLSensitiveIdentifiersRoundTrip -count=1`
  failed before the quoting fix as expected.
- `go test ./internal/api -run TestStalledMutation -count=1` failed all five gated
  I/O cases before the lock fix as expected.
- `go test -race ./internal/layout ./internal/api` passed after the fixes.
- The new regressions and competing-frame transaction test passed ten consecutive
  runs under the Go race detector.
- `just check` passed, including TypeScript, 194 unit/component tests, 64 tooling
  tests, Go race/coverage tests, vet, formatting, and strict ticket validation.
- `just browser-test-embedded` passed 53 tests with five opt-in measurement skips.
  The frame regressions and 120-card performance guard remain passing.

All regression stores use temporary directories. The saved user board
`.tickets/canvas/default.yml` retains SHA-256
`852da1cea4bae70a3809aab5ddaa679ca09cabda477e828636fdf2b62cdf5eee`.
No saved layout was edited or staged. No commit, push, or install was performed.

## Record provenance

Source baseline: `dacc3f4baaa378d3eed3131f7f6ba1efb1e246e2`, with frames v1 and
these review fixes in the working tree. Session: `20260910-013410-55c12f2e`.

Author: Mieli through terva `0.134.6-0.20260910010245-6f36fa1e7be7`, commit
`6f36fa1`, built `2026-09-10T01:05:08Z`. Loaded extensions: index `v0.8.2`,
obsidian `v0.2.0`, and web `v0.3.1`.
