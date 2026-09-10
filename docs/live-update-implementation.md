# Live updates: watcher and SSE implementation

This records the implementation and evidence for TKT-01M245JGN1A77WJASYMPSF19CM
(Push store invalidations through a watcher and SSE), step 2 of
`docs/live-updates-design.md`. Step 1, conditional board reads, is committed at
`548f346` and measured in `docs/conditional-board-reads.md`.

This document supersedes two statements in `docs/live-update-browser-harness.md`,
which is kept as delivered. The reconnect regression no longer uses
browser-context offline emulation, and the rebuild counter assertions now
attribute safety-scan rebuilds. Both changes are explained under
"Harness changes during integration".

## What changed

The server owns a live coordinator (`internal/api/live.go`,
`internal/api/snapshot.go`). It watches the store directories with fsnotify,
reads and validates the complete authoritative state, and publishes immutable
snapshots. Board and schema reads serve cached representations from the current
snapshot; no tab read opens the store or recomputes readiness. `GET /api/events`
(`internal/api/events.go`) streams small invalidations to same-origin
subscribers. Mutations stay on the existing HTTP endpoints and reconcile the
snapshot synchronously before their response is released.

The client (`web/src/platform/tickets/live.ts`) is a Preact-free controller. It
consumes the event stream, coalesces notifications into serialized conditional
reads, falls back to 12-second polling when the stream is down, and keeps a
60-second safety read while healthy. `App.tsx` wires it to the store and shows
persistent connection, stale, and degraded feedback in `#syncStatus`.

## Event contract

`GET /api/events` sends ordinary SSE `data:` messages. Each message is JSON with
exactly five fields:

```json
{"epoch": "…", "generation": 7, "scopes": ["tickets"], "stale": false, "degraded": false}
```

- `epoch` is a random per-server-instance token. A changed epoch means the
  server restarted and every cached validator is suspect.
- `generation` increases monotonically within an epoch. It advances for
  observable content changes and for stale or degraded transitions.
  Status-only events can carry `scopes: []`; clients must still consume their
  status.
- `scopes` name what changed: `tickets`, `config`, `boards`, or
  `layout:<name>`.
- Every subscription receives the current state immediately, so there is no
  initial-read race, no client cursor, and no replay history. Reconnects
  revalidate through an authoritative read.
- No ticket bodies, patches, or deltas are streamed.

Board and schema responses, including 304s, carry `X-Canvas-Epoch`,
`X-Canvas-Generation`, `X-Canvas-Stale`, `X-Canvas-Degraded`, and the
cumulative diagnostics `X-Canvas-Rebuilds` and `X-Canvas-Safety-Scans`. Health
headers are literal `true` or `false`. Board JSON and exact-byte SHA-256 ETags
are unchanged from step 1.

## Recovery contract

Filesystem events are hints, not transactions. The coordinator reads the
complete authoritative file image, hashes contents, builds a candidate
snapshot, and requires the same image after a settling interval before
publication. A changed image rejects the candidate and retries.

- Malformed or incomplete reads keep the last valid snapshot. Conditional
  requests can answer 304 with `X-Canvas-Stale: true`. Without any valid
  snapshot, board and schema return 503 `snapshot_unavailable` with
  `Retry-After: 1`.
- `stale` reports snapshot validation failure. `degraded` reports watcher
  unavailability. Recovery publishes current data and clears both.
- Watcher overflow, lost watches, and closed watchers discard the content
  fingerprint and repair the watch set. The 60-second safety reconciliation is
  a forced full rebuild, so a silently missed event is repaired within one
  safety period even with a healthy-looking watcher.
- Claim expiry is scheduled from the snapshot's nearest expiry instant, not
  from filesystem events.
- Symlinked or otherwise non-regular authoritative files are refused, which
  makes them a stale condition rather than an unbounded read.
- The client revalidates on initial subscription, reconnect, epoch change, and
  generation gaps. Failed reads and connections retry with exponential backoff
  bounded at 12 seconds. Duplicate events and failed reconnects do not reset
  the poll clocks, so fallback and safety reads cannot starve.

## Timing and resource values

| Mechanism | Value |
|---|---:|
| Event debounce | 100 ms |
| Maximum burst postponement | 1 second |
| Candidate settling interval | 40 ms |
| Failed-read and watcher recovery retry | 250 ms |
| Safety reconciliation (server) | 60 seconds |
| SSE heartbeat (comment) | 15 seconds |
| Stream write deadline | 5 seconds |
| Maximum subscribers | 128 |
| Pending events per subscriber | 1 |
| Unsaved-board representation cache | 64 entries |
| Client fallback polling | 12 seconds |
| Client healthy safety read | 60 seconds |
| Client reconnect and read backoff cap | 12 seconds |

A subscriber whose one-slot queue overflows has its obsolete event replaced
with broad scopes (`tickets`, `config`, `boards`), so its next read covers
anything the dropped event named. `X-Canvas-Rebuilds` counts full candidate
builds, including the forced build of every safety scan. It does not count
fingerprint reads, so a zero rebuild delta does not claim zero filesystem work;
`X-Canvas-Safety-Scans` is the separate scan count.

## Shutdown

`Server.Start(ctx)` builds the initial snapshot and starts the watcher.
`Server.Close()` is idempotent; it stops the coordinator, closes the watcher,
and closes every subscriber channel. `main.go` closes live streams before HTTP
shutdown so open EventSource connections cannot hold the 5-second shutdown
window.

## Deployment

Direct local use on Linux and WSL2 local filesystems is the supported and
tested scope. Origin checking compares the `Origin` header against the
client-visible `Host` and rejects `Sec-Fetch-Site: cross-site`; it does not
trust forwarded headers. Go 1.25's `http.NewCrossOriginProtection` guards
unsafe methods.

Reverse-proxy support is documented, not tested. A proxy must preserve the
client-visible `Host`, disable response buffering for `/api/events`
(`X-Accel-Buffering: no` is sent), and allow idle upstream streams longer than
the 15-second heartbeat cadence.

## Measurements

Baseline, from `docs/conditional-board-reads.md` on the same 120-card fixtures:
external changes took about 10.8 to 12 seconds to appear, and conditional reads
still recomputed the full server response.

This implementation, measured 2026-09-10 with the harness in
`tests/browser/live-update-measurements.spec.ts` (two tabs, 30 external atomic
edits per fixture, real timers, `--workers=1`):

| Fixture | Mode | p95 write-to-visible | Burst (10 writes) | Idle 25 s tab reads | Idle rebuild delta |
|---|---|---:|---:|---:|---:|
| Normal 120 cards | instrumented | 183 ms | 170 ms | 0 | 0 |
| Body-heavy 120 cards | instrumented | 287 ms | 269 ms | 0 | 0 |
| Normal 120 cards | embedded | 184 ms | 180 ms | 0 | 0 |
| Body-heavy 120 cards | embedded | 267 ms | 251 ms | 0 | 0 |

All four runs completed with 30 samples per tab and per-tab p95 far under the
approved 2-second ceiling; bursts converged far under 3 seconds. The pointer
guard held in every run: p95 33.5 ms against the 100 ms ceiling, 30 rendered
frames, 39 edges, zero inspector renders. JSON artifacts with raw samples are
under `docs/live-update-measurements/` and
`docs/live-update-measurements-embedded/`.

The remaining approved targets:

- Fallback at most 15 seconds: the blocked-SSE browser regression aborts
  `/api/events` before navigation and observes an external edit converge within
  15 seconds, with two to four fallback reads and no retry storm over
  25 seconds.
- Silent-event recovery at most 65 seconds: `TestLiveOverflowLostWatchAndSafetyRescan`
  removes a directory watch silently, edits the file, and verifies the safety
  reconciliation both publishes the edit and restores the watch. It also covers
  injected overflow faults and a closed watcher, with degraded-state
  transitions. The browser side adds the opt-in 65-second healthy-stream case:
  exactly one safety read, no replacement connection, and a live edit
  afterwards.
- Heartbeat cadence, overflow, and capacity are Go transport tests
  (`TestLiveEventsInitialMutationHeartbeatReconnectAndRestart`,
  `TestLiveSubscribersBoundedAndCoalesced`,
  `TestLiveSlowStreamDeadlineAndCapacityHTTP`), because SSE comments are
  invisible to both the EventSource API and CDP.

Handler-level benchmark, reported by the server implementation session with the
existing byte-equivalence check: normal-fixture reads went from 7.22 ms (legacy
200) to 28.3 µs (cached 200) and 3.43 µs (cached 304); body-heavy from
32.49 ms to 1.23 ms and 1.54 µs.

## Harness changes during integration

Two worker-delivered browser checks changed during integration. The harness
document describes their original form.

1. The reconnect regression used `page.context().setOffline()`. An instrumented
   run proved Chromium's offline emulation never errors an established
   EventSource: the stream stays open and the held event arrives after going
   online, so no reconnect occurs and the test cannot pass. The test now
   restarts the server on the same port (`tests/browser/fixtures.ts` gained
   `app.restart(whileDown)`), which kills the socket for real, changes the
   epoch, and genuinely misses an edit while down. It asserts reconnection
   within 15 seconds, the epoch change, convergence to the missed edit, and a
   subsequent event-driven edit within 3 seconds.
2. The measurement assertions compared rebuild counters with strict equality
   across idle windows. Every 60-second safety scan is a forced full rebuild,
   so a scan landing inside a window failed the 65-second case and would
   eventually flake the 25-second windows. The assertions now require any
   rebuild delta to be attributable to the safety-scan delta, which is the
   approved target: zero rebuilds caused by tab reads, safety scans counted
   separately.

Two pre-existing refresh regressions were also adapted, as the harness
predicted. The two-tab case now blocks `/api/events` in both tabs so it keeps
verifying fallback-mode independent snapshots, and the held-drag case installs
its response interception before the mutation so SSE cannot win the race. The
old polling measurements in `docs/refresh-measurements-updated/` remain valid
polling evidence and were not rerun.

## Known limits

- Content checks before and after settling reject known mixed reads. They
  cannot detect a valid intermediate state of a multi-file operation that
  stays unchanged for the whole settling interval; the safety scan bounds the
  exposure to one minute.
- The coordinator parses the captured file image itself, because the ticket
  library's `List` skips malformed files and `Readiness` rereads disk.
  `snapshotReadiness` mirrors the library's readiness rules;
  `TestSnapshotReadinessMatchesLibrary` guards the parity across library
  upgrades and must be kept when bumping `github.com/terva-sh/git-ticket`.
- A stream that dies without a socket error (for example a silently dropped
  network path) produces no client-side error, because comment heartbeats are
  invisible to the EventSource API. The client still converges through its
  60-second healthy safety read.
