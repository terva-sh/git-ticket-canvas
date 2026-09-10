# Live-update browser harness

New browser coverage for TKT-01M245JGN1A77WJASYMPSF19CM (Push store invalidations through watcher/SSE).
This document supplements `docs/refresh-measurements.md`; it does not replace the
published refresh baseline or its JSON artifacts. The harness contains no client
or Go implementation. Runtime results require those changes to be integrated.

## Files and checks

- `tests/browser/live-update-support.ts` observes the application's EventSource
  through Chromium CDP, validates event and board-header contracts, samples DOM
  convergence, and writes new result directories.
- `tests/browser/live-update-regressions.spec.ts` contains eight browser cases.
- `tests/browser/live-update-measurements.spec.ts` contains two 120-card
  measurement cases and one 65-second healthy-stream safety-read case.

The standalone strict TypeScript check and Playwright discovery passed when this
harness was authored. Discovery found 11 tests in the two spec files. Browser
execution and latency measurements have not run against the integrated changes.
Dependencies were installed with `npm ci`. No existing docs, artifacts, ticket
records, frontend files, or Go files were changed.

```sh
npm ci
npm exec -- tsc --noEmit --strict --target ES2022 --module ESNext \
  --moduleResolution bundler --lib ES2022,DOM,DOM.Iterable --skipLibCheck \
  tests/browser/live-update-support.ts \
  tests/browser/live-update-regressions.spec.ts \
  tests/browser/live-update-measurements.spec.ts
npm exec -- playwright test tests/browser/live-update-regressions.spec.ts \
  tests/browser/live-update-measurements.spec.ts --list --workers=1
```

## Integrated runs

Install Chromium if the host has no configured browser, then build the integrated
frontend before running the regressions. Playwright global setup builds temporary
Go binaries with the current embedded assets. Each test gets a new temporary
store and server, and the existing fixture removes both afterward.

```sh
npm exec -- playwright install chromium
npm run build
npm exec -- playwright test tests/browser/live-update-regressions.spec.ts \
  tests/browser/canvas-performance.spec.ts --workers=1
```

Measurements opt in separately from the old `REFRESH_MEASURE` suite. Use one
worker and do not run other performance workloads alongside it:

```sh
LIVE_UPDATE_MEASURE=1 LIVE_UPDATE_OUTPUT_DIR=docs/live-update-measurements \
  npm exec -- playwright test tests/browser/live-update-measurements.spec.ts \
  --workers=1
```

The default measurements reuse the existing in-memory Vite function-entry
instrumentation. It does not write frontend source or `web/dist`. To cross-check
the integrated embedded bundle without that transform:

```sh
REFRESH_INSTRUMENT=0 LIVE_UPDATE_MEASURE=1 \
  LIVE_UPDATE_OUTPUT_DIR=docs/live-update-measurements-embedded \
  npm exec -- playwright test tests/browser/live-update-measurements.spec.ts \
  --workers=1
```

Each fixture writes beneath a newly created variant/timestamp/process directory.
Files use exclusive creation, so reusing `LIVE_UPDATE_OUTPUT_DIR` cannot overwrite
an earlier JSON result. Playwright also attaches the JSON to the test result.
A failed measurement writes partial evidence when it reaches the measured phase.
Only `completed: true` with all 30 samples in each fixture meets the checks.
The fixture cases still run separately when the first fails; Playwright serial
mode would instead skip the second case. The extra 65-second safety-read case
reports through Playwright assertions and traces, not a fixture JSON file.

## Measurement boundaries and acceptance checks

Both fixtures retain 120 pinned cards on the ten-column grid and 39 predecessor
dependencies. Normal descriptions are empty. Body-heavy descriptions contain
exactly 16,384 bytes each, totaling 1,966,080 bytes. Both tabs share a browser
context and the same server. Both inspectors remain open on card zero.

Each fixture records these phases:

- Initial board traffic and SSE connections, outside the idle phase.
- A real 25,000 ms idle interval. Both tabs must make zero board requests while
  SSE is healthy. Cumulative server rebuilds must not increase. Boundary probes
  and one explicit conditional 304 probe also must not trigger rebuilds.
  `X-Canvas-Safety-Scans` is recorded separately; scans are not called rebuilds.
  Idle App, CardView, placement, and inspector counters retain their zero-work
  assertions. Embedded mode reports unavailable function counts as `null`.
- Thirty sequential external atomic Markdown replacements, not API mutations.
  Card one stays inside both viewports. Each replacement waits for independent
  DOM observations in both tabs before the next edit. Each tab must have at least
  30 samples and p95 at most 2,000 ms. The JSON records both accepted-write and
  write-start latency; both percentiles must meet the ceiling.
- Ten additional external replacements of the same visible card, without browser
  waits between writes. Both tabs must show the final title within 3,000 ms of
  the final rename. This phase tests convergence after coalesced changes.
- The existing pointer-motion procedure on 120 cards, repeated for both fixture
  sizes. It keeps 30 samples and two animation frames per sample. The ceilings
  remain p95 below 100 ms and maximum below 250 ms, with 30 rendered frames,
  39 edges, and no inspector renders during pointer motion.

Latency stops at title text observation on an animation frame, not compositor
paint. Write-start includes fixture file lookup and replacement preparation.
Accepted-write begins when the atomic rename completes. Live-edit p95 uses the
nearest-rank method, `ceil(0.95 * n) - 1`. Pointer p95 retains the existing guard's
`floor(0.95 * n)` index. Raw samples remain available in the JSON.

CDP board byte and timing fields retain the definitions in the refresh baseline.
SSE observations come from the client's actual connection; the harness never
opens a substitute EventSource. No measured edit relies on synthetic visibility
changes, reloads, accelerated timers, or forced reads.

## Regressions and implementation expectations

The eight ordinary regressions cover:

- External edits reaching two tabs while an inspector draft keeps text, focus,
  and selection, without an unsolicited mutation.
- A stale focused draft retaining its original revision, so an intentional blur
  gets a 409 rather than overwriting externally saved prose.
- Board 200 and 304 headers, increasing generations after an external edit, and
  unchanged rebuild counts for repeated cached reads.
- An event-triggered board response held across a manual drag. The preview and
  old title remain until cancellation. Cancellation causes no layout write and
  restores the persisted pinned position.
- Blocking `/api/events` before navigation. The external edit must converge in
  at most 15 seconds. The 25-second observation requires two to four fallback
  board reads and between two and twelve stream attempts. Twelve is a generous
  retry-storm guard, not an exact backoff specification.
- Disconnecting an established stream by setting the browser context offline,
  editing during the gap, reconnecting, and observing another event-driven edit.
- Switching between `default` and `other`, then invalidating their layouts.
  The selected board must not adopt the other board's positions.
- A read-only server observing external changes while keeping controls disabled,
  emitting no mutation requests, and leaving the post-edit store unchanged.

The opt-in safety case waits 65 seconds with a healthy stream. It expects exactly
one safety read, no replacement SSE connection, and no rebuild. It then verifies
another live edit. This checks that idle connections remain useful across several
15-second heartbeat periods. CDP does not expose comment-only heartbeats, so it
cannot establish their exact byte format or cadence. Go transport tests must
cover those details, watcher degradation, and overflow recovery.

The contract validators expect ordinary SSE messages, an opaque nonempty string
`epoch`, an integer `generation`, an array of scopes, and boolean `stale` and
`degraded`. Supported scopes are `tickets`, `config`, `boards`, and `layout:<name>`.
Board health headers must use literal `true` or `false`; generation and diagnostic
headers must be nonnegative decimal integers. Diagnostics are required on both
200 and 304 board responses. No renderer-specific live-update diagnostic is
required.

## Existing tests that need coordination

The shipped `refresh-regressions.spec.ts` case named "two tabs retain independent
snapshots and recover after a failed read" expects the second tab to remain stale
until a synthetic visibility refresh. That assertion conflicts with SSE delivery.
Its owner must revise the old expectation as part of client integration. This
harness deliberately leaves that existing file untouched. Its held-drag case also
patches the ticket before installing the held-response route. SSE can now deliver
that change before the route exists. Install the interception before the write
when adapting that case; the new SSE drag regression already uses this ordering.

The old opt-in `refresh-measurements.spec.ts` also requires two 12-second idle
polls in 25 seconds. Keep its published output as polling evidence, but do not run
it unchanged as SSE acceptance. The new suite uses `LIVE_UPDATE_MEASURE`, so the
old measurements remain skipped unless their separate flag is set.

Existing draft, drag, and pointer-motion tests should still run after the
integration owner resolves the old two-tab expectation. New tests are additional
coverage, not a reason to remove those safety checks.
