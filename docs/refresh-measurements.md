# Board refresh measurements

Baseline evidence for TKT-01M245HJ (Add conditional board reads and stable client snapshots).
The baseline is `423802c0778f9a096ae90063c95cc1857341c27f`. These measurements
add no production code, alter no existing fixture, and write no ticket records.
The commands use the existing isolated temporary-store and server fixtures.

## Run the harness

Install the locked test dependencies and Chromium once:

```sh
npm ci
npx playwright install chromium
```

Run on the baseline without rebuilding committed assets:

```sh
REFRESH_MEASURE=1 REFRESH_OUTPUT_DIR=docs/refresh-measurements-baseline \
  npm exec -- playwright test tests/browser/refresh-measurements.spec.ts --workers=1
npm exec -- playwright test tests/browser/refresh-regressions.spec.ts \
  tests/browser/canvas-performance.spec.ts --workers=1
```

Run against updated code after its frontend build:

```sh
npm run build
REFRESH_EXPECT_CONDITIONAL=1 REFRESH_MEASURE=1 \
  REFRESH_OUTPUT_DIR=docs/refresh-measurements-updated \
  npm exec -- playwright test tests/browser/refresh-measurements.spec.ts --workers=1
REFRESH_EXPECT_CONDITIONAL=1 \
  npm exec -- playwright test tests/browser/refresh-regressions.spec.ts \
  tests/browser/canvas-performance.spec.ts --workers=1
```

For a network/DOM cross-check using the embedded production bundle without
function-entry instrumentation, add `REFRESH_INSTRUMENT=0` and use another output
directory. Baseline cross-check command:

```sh
REFRESH_INSTRUMENT=0 REFRESH_MEASURE=1 \
  REFRESH_OUTPUT_DIR=docs/refresh-measurements-baseline/embedded \
  npm exec -- playwright test tests/browser/refresh-measurements.spec.ts --workers=1
```

Use new result directories rather than overwriting evidence from a published run.
Each run takes about two minutes. Measurements opt out of the ordinary browser
suite unless `REFRESH_MEASURE=1`. Each case allows 180 seconds for fixture setup,
the 25-second idle interval, and three subsequent real polls. Do not run competing
performance workloads. The recorded cross-check overlapped the three-second
negative regression check during setup, before its idle interval.

Playwright global setup builds and removes temporary Go binaries. Each fixture
creates its own `mkdtemp` ticket store, uses an ephemeral loopback port, stops its
servers, and removes the store. No user's canvas is read or written. JSON files
in the requested output directory are intentional durable artifacts. Playwright
also attaches each JSON to its test result.

## Fixtures and measurement boundaries

Both cases reproduce the existing performance fixture: 120 tickets named
`Representative ticket 0` through `Representative ticket 119`, 120 pinned cards
on the same ten-column grid, and 39 predecessor dependencies. Card zero is
selected and its inspector remains open. The normal case has empty descriptions.
The body-heavy case adds exactly 16,384 ASCII bytes to every description, using
repeated `Refresh measurement body line.\n` text truncated to that length. Total
description content is 1,966,080 bytes. JSON escaping makes the board response
larger than the sum of body strings. IDs and timestamp formatting can vary by a
few bytes between seeded runs; the JSON records actual bytes.

Each case records these phases:

- Initial load, outside the idle totals.
- A fixed 25,000 ms idle wait with the application's original 12,000 ms interval.
  The test requires at least two board requests.
- One title edit through a second client's API request, followed by the natural
  poll that makes it visible in the browser.
- One atomic Markdown title replacement in the fixture store, followed by the
  natural poll. This does not call the canvas mutation API or a ticket command.
- Ten sequential API title edits to ten other tickets, followed by the natural
  poll that exposes all ten changes.

There are no fake clocks, accelerated intervals, synthetic visibility changes,
network throttles, or forced refreshes in the measurement cases. The separate
regressions use explicit visibility events and a held response for determinism.

`acceptedToVisibleMs` measures from API response completion or atomic rename
completion until the DOM observation and two settling animation frames. It
includes the wait for polling. It is not the latency of a filesystem watcher,
not a server-side detection metric, and not a sampled percentile. The burst
latency starts after its last accepted write. These edits happen shortly after
the prior poll, intentionally exposing nearly a full polling interval.

## Instrumentation and byte definitions

The default harness uses Vite's ordinary configuration with `write: false`. A
test-only transform inserts one counter increment at entry to `App`, `CardView`,
and `autoPlace`. Playwright substitutes that one JS chunk in memory. It writes
neither source files nor `web/dist`. Insertion points fail closed if a refactor
moves them. The JSON records the instrumented bundle's SHA-256. The harness uses
the existing inspector `data-render-count` for inspector renders.

These are function executions, not inferred DOM changes. `placementCalls` means
calls to `autoPlace`, including any calls made by gesture or measurement paths.
It does not count positions read from a map. `appRenders` is not a direct store
publication counter. No-op conditional assertions require zero App, card, and
inspector renders and zero `autoPlace` calls when instrumentation is enabled.

Playwright routing disables the browser HTTP cache in instrumented runs. The
harness does not remove application `If-None-Match` headers, but this cache effect
is why the embedded cross-check also exists. That cross-check makes no routes
and serves the actual committed production bundle. Its unavailable counters are
`null`, not zero. Compare both modes after implementing conditional reads.

A `MutationObserver` records mutation records for the document, cards and
inspector. The `diagnostics` count separates changes to render/frame/placement
attributes from content mutations. It does not count component executions or
paint operations. Inspector render diagnostics therefore do not masquerade as
visible content changes.

Network records come from a per-page CDP session:

- `status` prefers `Network.responseReceivedExtraInfo.statusCode`, so an actual
  304 is not hidden by a browser's cached-response presentation.
- `ifNoneMatch` prefers actual request extra-info headers.
- `decodedPayloadBytes` is the UTF-8/base64-decoded response-body length; a 304
  has zero payload bytes.
- `wireResponseBytes` is `Network.loadingFinished.encodedDataLength`, the
  received HTTP response transfer including headers and encoding/framing. It
  does not include TCP or TLS overhead. Loopback requests use plain HTTP.
- `encodedBodyBytes` sums CDP data-event encoded lengths. These may include
  framing and may be zero when Chromium omits per-chunk lengths. Do not use it
  as an estimate of decoded JSON size.

Mutation request and response payload sizes come from Playwright APIRequestContext,
not the browser CDP session. Their wire-response bytes and server reconciliation
counts are explicitly `null`. Request wall time does not establish server CPU or
filesystem work. The Go owner must provide separate reconciliation evidence if
that metric is needed. No savings are inferred from request counts alone.

## Baseline results

The instrumented results are in:

- `docs/refresh-measurements-baseline/refresh-normal.json`
- `docs/refresh-measurements-baseline/refresh-body-heavy.json`

The unmodified embedded-bundle cross-checks are in the `embedded/` subdirectory.
All four cases passed.

| Instrumented 25-second idle interval | Normal | Body-heavy |
| --- | ---: | ---: |
| Board requests | 2 | 2 |
| Status codes | 200, 200 | 200, 200 |
| Requests with If-None-Match | 0 | 0 |
| Decoded payload bytes | 175,444 | 4,234,170 |
| HTTP response transfer bytes | 175,734 | 4,234,462 |
| App executions | 2 | 2 |
| Card executions | 240 | 240 |
| Inspector executions | 2 | 2 |
| Automatic placement calls | 2 | 2 |
| Content DOM mutation records | 0 | 0 |
| Diagnostic attribute mutation records | 2 | 2 |

The embedded cross-check measured 175,730 and 4,234,460 idle transfer bytes.
Both cases again made two 200 requests, rendered the inspector twice, and made
zero content DOM mutations. Small byte differences reflect separately seeded
IDs/timestamps, not instrumentation compression or savings.

| Instrumented changed phase | Normal payload / transfer bytes | Body-heavy payload / transfer bytes |
| --- | ---: | ---: |
| One API edit board read | 87,719 / 87,864 | 2,117,082 / 2,117,228 |
| External file edit board read | 87,732 / 87,877 | 2,117,095 / 2,117,241 |
| Ten-edit burst board read | 87,742 / 87,887 | 2,117,105 / 2,117,251 |
| One API edit mutation response payload | 651 | 17,563 |
| Ten-edit burst mutation response payload total | 6,801 | 175,921 |

Each changed phase made one full board read, ran all 120 cards and the inspector,
and ran `autoPlace` once for API/burst changes or twice for the external title
change. The latter can trigger a card measurement; the counter records actual
calls rather than assuming one call per board read. Card DOM mutation records
were 1, 1 and 10 respectively. The selected inspector recorded one content
mutation in the normal API phase and none in the other changed phases.

| Accepted write to visible observation | Normal | Body-heavy |
| --- | ---: | ---: |
| API edit | 10,822 ms | 10,784 ms |
| External atomic replacement | 11,986 ms | 11,985 ms |
| Last write in ten-edit burst | 11,821 ms | 11,706 ms |

These are baseline observations, not an after result or approval for SSE.

## Regression coverage and checks

`refresh-regressions.spec.ts` adds three cases:

- Two unchanged reads retain inspector text, focus and selection without saving
  the draft. Conditional mode also requires actual 304s with validators and no
  render or placement work.
- An equivalent full 200 retains the draft. The test removes the validator only
  from its upstream test request to force a real server 200. Conditional mode
  requires no render or placement work despite the full response.
- A changed response starts before a drag and arrives during it. The preview and
  old title remain until pointer cancellation. The changed title then appears,
  no layout write occurs, and persisted placement remains unchanged.

Baseline regression results were 3 passed. Running with
`REFRESH_EXPECT_CONDITIONAL=1` deliberately failed the first two cases on the
baseline: no 304 support, and an equivalent 200 rendered the inspector once.
The drag case still passed. This negative control demonstrates that baseline
mode does not silently claim the new behavior. The conditional implementation
has not been tested in this worktree.

The existing 120-card pointer-motion guard also passed unchanged. The final
combined regression/guard command reported 4 passed. Standalone typechecking
covers these new browser files, which the repository's normal tsconfig excludes:

```sh
npm exec -- tsc --noEmit --target ES2022 --module ESNext \
  --moduleResolution bundler --lib ES2022,DOM,DOM.Iterable --skipLibCheck \
  tests/browser/refresh-support.ts tests/browser/refresh-measurements.spec.ts \
  tests/browser/refresh-regressions.spec.ts
```

Multiple tabs, reconnect, board switches, and read-only checks are not measured
by this harness. Existing browser tests cover some of them. Do not present these
three new cases as completing every browser requirement in the live-update design.

## Counter recommendations for the frontend owner

Production diagnostics are not required to rerun these measurements. To replace
the function-entry transform with stable counters, expose monotonically
increasing counts for App publications, each CardView render, Inspector renders,
and actual `autoPlace` evaluations. Increment placement only on the computation,
not on a cache hit or every Canvas render. Keep the existing
`data-canvas-frame` separate: it counts pointer frames, not placement work.
A root diagnostic can aggregate card renders without adding DOM mutations to all
120 cards. Any production diagnostics should report rather than alter behavior.

## Recorded environment and provenance

Measurements ran on 2026-09-09 under Node v22.23.2, Go 1.26.2 linux/amd64,
Playwright 1.61.1, Chromium 149.0.7827.55, Linux
6.18.33.2-microsoft-standard-WSL2, and an AMD Ryzen 9 9950X3D with 32 logical CPUs.
Each browser used a 1440 by 1000 viewport and one Playwright worker. Per-run JSON
records timestamps, HEAD, working-tree changes, and bundle instrumentation identity.

The authoring harness reported terva
`0.134.6-0.20260908222723-3f8b5ffc2c50+dirty`, commit `3f8b5ff`, built
`2026-09-09T18:21:38Z`. Loaded extensions were index v0.8.2, obsidian v0.2.0,
and web v0.3.1. No ticket writes, commits, or pushes were made.
