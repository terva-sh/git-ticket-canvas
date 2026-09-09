# Conditional board reads and stable client snapshots

Implementation and evidence for TKT-01M245HJ (Add conditional board reads and
stable client snapshots), recorded on 2026-09-09. This implements step 1 of
[live-updates-design.md](live-updates-design.md). It adds no watcher, SSE,
delta protocol, summary/detail split, frames, or pen behavior.

The earlier design documents and [baseline report](refresh-measurements.md)
remain unchanged. This document records the final implementation, updates the
harness instructions, and provides the after measurements.

## Server behavior

Board GET/HEAD responses use a quoted SHA-256 ETag over the exact complete JSON
representation, including its trailing newline. Matching `If-None-Match` returns
304 without a body. Weak validators, lists, repeated header fields, quoted commas,
and standalone `*` are supported. Malformed conditions fall back to a full read;
they do not bypass board or store validation.

All API responses use `Cache-Control: private, no-cache`. An ETag covers every
observable board field, including bodies, readiness, short IDs, layout, board
list, configuration, actor, read-only mode, and store path. A claim expiring can
change the representation without changing the ticket file revision.

The ticket library retains configuration and its clock on each Store. Each API
request therefore opens a request-local store with current configuration and one
captured time. Readiness and claim DTOs use that same instant. The layout writer
and operator identity remain shared; the Server is not mutated by requests.

Review found that refreshing only board configuration would advertise new series
that schema and write handlers still rejected. The request-local policy now
covers schema and mutations too. A regression adds a series after server startup,
checks board/schema agreement, and creates, patches, and deletes a ticket using
that series.

Every board request still lists tickets, computes readiness, constructs DTOs,
serializes the full response, and hashes it. A 304 saves transfer, parsing, and
UI work. It does not skip server reconciliation or claim a server CPU saving.

## Client behavior

`TicketClient.board()` returns an explicit 200-with-data or 304 outcome. It does
not read a 304 body. The request uses `cache: no-store` because TicketStore owns
the accepted snapshot and validator rather than relying on browser cache merging.

TicketStore keeps a validator only for its current accepted board. It clears the
validator on board switches and on both sides of every mutation, including failed
writes. Existing read sequence, mutation epoch, and board generation checks run
before a result or its validator can become accepted.

A cacheless 304 triggers one unconditional retry. A second 304 is an explicit
error, not an empty board. Responses naming another board are rejected. Failed
reads retain the accepted snapshot. There is no persistent or cross-board cache.

Full responses compare all observable JSON values, not only file revisions.
Unchanged tickets and card positions retain their object identities; unchanged
maps, board lists, and configuration retain collection identity too. An equal
200 and a valid 304 both return without publishing state. Genuine derived-only
changes still publish. Layout schema changes remain observable.

App tracks the last published state separately from the outcome of its latest
read. If a response is accepted while a drag delays UI publication, the next 304
must not strand that accepted state. After the gesture ends, App publishes it
while preserving manual-placement previews and write ordering. Unfinished
inspector text keeps its original revision and focus.

Small diagnostic attributes expose store publications, card renders, and placement
calculations for regressions. They do not control state. The existing inspector
and pointer-frame diagnostics remain separate.

## Browser measurements

Both fixtures have 120 pinned cards and 39 dependencies. The normal fixture has
empty descriptions. Body-heavy adds 16 KiB per description, totaling 1,966,080
bytes before JSON escaping. One inspector stays open. The production 12-second
polling interval is unchanged; each idle observation lasts 25 seconds.

| Idle interval | Normal before | Normal after | Body-heavy before | Body-heavy after |
| --- | ---: | ---: | ---: | ---: |
| Board requests | 2 | 2 | 2 | 2 |
| HTTP status | 200 | 304 | 200 | 304 |
| Decoded response payload bytes | 175,444 | 0 | 4,234,170 | 0 |
| HTTP response transfer bytes | 175,734 | 348 | 4,234,462 | 348 |
| Card renders | 240 | 0 | 240 | 0 |
| Inspector renders | 2 | 0 | 2 | 0 |
| Automatic placement calls | 2 | 0 | 2 | 0 |
| Content DOM mutation records | 0 | 0 | 0 | 0 |

App executions also fall from two to zero. The old renderer was doing work even
though visible content did not change. These counts distinguish component
executions from DOM mutation records and do not measure browser paints.

A single API or external-file edit now renders one card instead of 120. Ten
changed tickets render ten cards instead of 120. Each changed snapshot still
renders the inspector once and sends a complete board response:

| Updated changed phase | Normal payload / transfer bytes | Body-heavy payload / transfer bytes |
| --- | ---: | ---: |
| One API edit | 87,715 / 87,968 | 2,117,069 / 2,117,323 |
| One external-file edit | 87,728 / 87,981 | 2,117,082 / 2,117,336 |
| Ten-edit burst | 87,738 / 87,991 | 2,117,092 / 2,117,346 |

Response payloads remain approximately the same size as baseline. Header overhead
increases slightly because responses now include validators and cache policy.
Fixture IDs and timestamps account for small payload differences between runs.

Observed accepted-write-to-visible times remain about 10.8 seconds for the API
edit, 12 seconds for the external atomic replacement, and 11.7 to 11.8 seconds
after the final burst write. These samples deliberately occur shortly after the
previous poll. They are not percentiles or watcher-detection timings.

The embedded-bundle cross-check also returned two 304s and 348 response bytes for
each fixture, with no inspector renders or DOM changes. No in-memory JS bundle
substitution occurs in that mode. Unavailable function counters are recorded as
null, not zero. The separate two-tab regression checks independent snapshots and
recovery after a failed read; it is not a multi-tab performance measurement.

### Artifacts and transport caveat

- [Baseline normal](refresh-measurements-baseline/refresh-normal.json) and
  [baseline body-heavy](refresh-measurements-baseline/refresh-body-heavy.json).
- [Updated normal](refresh-measurements-updated/refresh-normal.json) and
  [updated body-heavy](refresh-measurements-updated/refresh-body-heavy.json).
- [Updated embedded normal](refresh-measurements-updated/embedded/refresh-normal.json)
  and [updated embedded body-heavy](refresh-measurements-updated/embedded/refresh-body-heavy.json).
- Baseline embedded cross-checks remain under `refresh-measurements-baseline/embedded/`.

The harness normally injects function-entry counters into an in-memory Vite build
without modifying source or dist. It separates diagnostic-attribute mutations
from content mutations. The current harness also records resolved fetch statuses.

Chromium reports `Network.loadingFailed` with `net::ERR_ABORTED` when discarding
these bodyless 304 responses even though fetch resolves with status 304. Tests
verify the resolved outcomes. For this case the harness records actual raw HTTP
response header bytes from CDP and a labeled completion reason, rather than
inventing a loadingFinished value or reporting zero network cost. For normal 200s
it uses CDP loadingFinished transfer bytes. The artifacts identify the byte source
per row. The initial updated JSON files retain an older generic `limitations`
string that describes only loadingFinished; this paragraph and their per-row
`wireBytesSource` correct that shorthand. The harness now writes the complete
definition for future runs without rewriting the retained measurements.

Transfer counts cover HTTP responses, not TCP/TLS overhead or request headers.
Mutation request/response payload bytes are recorded separately. Their wire sizes
and per-request server reconciliation counters remain unavailable. The embedded
cross-check avoids Playwright routing's browser-cache side effect. None of these
measurements estimates compression savings or total bidirectional traffic.

## Server benchmark

[Raw benchmark output](refresh-measurements-updated/server-benchmark.txt) records
three samples per mode. Independent timing medians:

| Server fixture | Legacy 200 | Current 200 | Current 304 |
| --- | ---: | ---: | ---: |
| Normal 120 | 6.964 ms | 7.058 ms | 7.012 ms |
| Body-heavy 120 | 36.992 ms | 41.728 ms | 43.138 ms |

The benchmark reproduces the old pipeline locally and verifies byte-identical
full responses. It does not run a separately checked-out historical binary.
It includes filesystem reads, readiness, serialization, and httptest response
buffers, not network transfer. Raw output includes allocations and bytes/op.

These fixtures intentionally stress server work differently from the browser
fixtures: normal has 32-byte descriptions; body-heavy has 128 KiB per ticket
across five body sections. Current conditional responses have zero payload bytes
but still construct the representation. The body-heavy conditional handler is
slower than the reproduced old handler. Do not describe this as a compute win.

## Reproduction and verification

The harness now enforces conditional behavior by default. To reproduce baseline
results, use a disposable checkout at `423802c`, copy the three `refresh-*` browser
harness files into it, install dependencies, and set
`REFRESH_EXPECT_CONDITIONAL=0`. Do not copy implementation source or new dist
into the baseline checkout. The original baseline report records its original
commands; the explicit opt-out is required with the current harness.

Run the current code with a fresh output directory for every retained run:

```sh
just check
REFRESH_MEASURE=1 REFRESH_OUTPUT_DIR=/tmp/canvas-refresh-new-run \
  npm exec -- playwright test tests/browser/refresh-measurements.spec.ts --workers=1
REFRESH_INSTRUMENT=0 REFRESH_MEASURE=1 \
  REFRESH_OUTPUT_DIR=/tmp/canvas-refresh-embedded-new-run \
  npm exec -- playwright test tests/browser/refresh-measurements.spec.ts --workers=1
go test ./internal/api -run '^$' -bench '^BenchmarkBoardRead$' \
  -benchmem -benchtime=1s -count=3
just browser-test-embedded --repeat-each=2
```

Verification completed:

- `just check` passed the build, 99 unit/component/boundary tests, 64 tooling
  checks, Go race tests, vet, formatting, and strict ticket validation.
- The embedded browser suite passed 66 runs across 33 tests. Four intentionally
  skipped measurement instances run separately rather than slowing every suite.
- All four updated measurement cases passed: normal/body-heavy with and without
  in-memory bundle instrumentation. An interrupted embedded run produced no
  retained artifact and was rerun to completion.
- Standalone strict checking of the new browser TypeScript files passed using
  the command in the baseline report with `--strict` added. The normal tsconfig
  excludes browser tests.
- The unchanged 120-card pointer-motion guard passed twice, including zero
  per-motion inspector rerenders. No thresholds were weakened.
- Review found one configuration consistency issue, fixed with request-local
  stores across API handlers and a new cross-endpoint regression.

## Remaining work and promotion evidence

TKT-01M245JG (Push store invalidations through a watcher and SSE) remains draft.
This report supplies concrete remaining costs: nearly a full polling interval
for external changes and full server reconciliation per idle request. A shared
reconciled snapshot and coalesced invalidations could address those costs, but the
user still owns its target, deployment/recovery scope, and promotion decision.

TKT-01M245KD (Reduce changed-board payloads after live-update measurements) also
remains draft. Changed responses still carry full bodies, but its gate requires
post-SSE evidence before choosing deltas or summary/detail. These step-1 results
do not bypass that dependency or authorize either protocol.

## Provenance

Parent implementation and final checks used terva
0.134.5-0.20260908184005-01e3a6719b46, commit `01e3a67`, built
2026-09-08T18:49:46Z; extensions index 0.8.2, obsidian 0.2.0, web 0.3.1.
Session `20260909-215300-f584a1be`, based on application commit `423802c`.

Browser runs used Node 22.23.2, Go 1.26.2, Playwright 1.61.1, Chromium
149.0.7827.55, Linux on WSL2, and an AMD Ryzen 9 9950X3D with 32 logical CPUs.
Measurements ran with one worker and a 1440 by 1000 viewport. Per-run JSON records
working-tree state, runtime versions, timestamps, and instrumented bundle hashes.
The unchanged baseline report records the independent worker's harness version.
