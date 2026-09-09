# Live updates and smaller board responses

Design recorded on 2026-09-09. This is draft work, not shipped behavior or a
performance report. It complements [the canvas organization design](canvas-organization-design.md)
without changing that document or making live updates a prerequisite for frames
or label-routing pens. Existing race and gesture guarantees are recorded in
[preact-canvas.md](preact-canvas.md).

## Current behavior and goals

`web/src/ui/App.tsx` requests the full board every 12 seconds and when the page
becomes visible. Each open tab schedules 300 interval requests per hour, before
visibility refreshes and mutation-related reads.

`internal/api/server.go` lists all tickets, computes readiness and short IDs,
loads layout and configuration, and returns a full board response. Every ticket
includes its description, plan, summary, checklists, notes, and comments.
`TicketStore.load()` replaces every ticket object on an accepted response, even
when the ticket is unchanged. Memoized cards cannot rely on stable ticket
identity across those loads.

The repository has no watcher, SSE stream, or ETag handling. The generic
`TicketClient.request()` rejects empty/non-success responses, so a 304 requires
an explicit conditional-read result rather than ordinary JSON parsing.

Reduce three different costs without conflating them:

- Detection latency: external ticket changes should reach an open board without
  waiting for the next 12-second poll.
- Transfer and server work: idle boards should not repeatedly download full
  bodies or force each tab to rebuild the same snapshot.
- Client work: unchanged state should not publish, rerender cards, or trigger
  automatic placement calculation.

No bandwidth, refresh-render, or server-cost measurements have been collected
for this proposal. The existing 120-card browser test measures pointer-motion
responsiveness, not refresh cost.

## Proposed flow

```text
Filesystem hints or successful API writes
  -> coalesced reconciliation of authoritative files
  -> validated snapshot and generation
  -> small SSE invalidation notification
  -> conditional authoritative read
  -> identity-preserving client reconciliation
  -> accepted state publication outside an active gesture
```

Keep mutations on existing HTTP endpoints with revision checks. SSE carries
one-way notifications, not commands or ticket writes. The stream is not an
additional source of truth, and no durable event database is required.

## Step 1: Conditional reads and stable client state

Add conditional reads for `/api/board?board=...` using an ETag and
`If-None-Match`. A matching validator returns 304 with no response body. A client
without the matching cached board snapshot must request a complete response.
Keep validators scoped to the board representation; switching boards must not
reuse another board's cached layout.

The validator covers the complete observable response, not just ticket file
revisions. Include layout, board list, configuration, derived readiness, short
IDs, and time-dependent claim state. Capture a consistent evaluation time for
one snapshot. Do not allow private board data to enter a shared HTTP cache.

An initial implementation may build a deterministic response before comparing
its validator. This reduces transfer and browser work but does not claim a server
CPU or filesystem saving. Watcher-backed shared snapshots belong to step 2.

For changed responses, retain the existing object for each observably unchanged
ticket, layout entry, and configuration value. Preserve collection identities
where their contents are unchanged. A 304 or an equivalent 200 response must not
publish state, rerender ticket cards or the inspector, or request automatic
placement. Do not use ticket file revision alone to decide equivalence.

Keep full snapshots as the recovery mechanism. Preserve read/write epochs,
board generations, stale-revision behavior, and pending-save ownership. A read
started before a mutation cannot overwrite its accepted result. Cached validators
must describe a usable snapshot, including after a local mutation.

## Step 2: Watcher-driven SSE invalidation

### Detection and reconciliation

Watch ticket-store directories, configuration, and board layout files. Directory
watching must account for newly created directories, atomic replacement, status
moves, deletion, and Git checkout bursts. Exclude irrelevant temporary files and
avoid treating each low-level event as a complete ticket transaction.

Coalesce related events with a bounded delay, reconcile authoritative files, and
publish only a validated snapshot. Bound the delay so continuous changes cannot
starve readers. API writes use the same invalidation/reconciliation path; duplicate
filesystem notifications must not generate duplicate accepted updates.

Filesystem notifications are hints. Watcher overflow, lost watches, startup,
uncertain events, and a periodic safety reconciliation require a rescan. Define
behavior for partial reads and malformed files: retain the last valid snapshot,
report that it is stale, and retry. With no valid snapshot, return an explicit
unavailable/error state rather than an apparently empty board.

A multi-file Git operation is not necessarily atomic. Reconciliation must not
claim stronger consistency than the store provides; use settling/retry checks to
avoid publishing known mixed or incomplete reads. Shared reconciled snapshots
should serve multiple readers without a per-tab full store rebuild.

### Stream and recovery

Send a small notification identifying the available generation and changed scope,
such as tickets, configuration, board list, or a named layout. Do not stream full
ticket bodies in this step. Schema field names and endpoint paths remain an
implementation choice.

Use a server-instance epoch with ordered generations so a restart cannot make an
old client cursor appear current. Close the race between subscribing and fetching
the initial snapshot: reconcile the stream's current generation against the
snapshot received, and fetch again if needed. Events only invalidate; the client
accepts data from authoritative reads, not from an assumed event order.

On reconnect, missed history, restart, or an unknown cursor, revalidate or fetch a
full snapshot. No unbounded replay log is necessary for an invalidation stream.
Do not imply that EventSource reconnect alone proves the client is synchronized.

Use bounded subscriber queues, coalesce superseded invalidations, and make slow
clients resynchronize rather than blocking writers. Clean up disconnected clients
and watchers at shutdown. Send heartbeats, flush events, configure proxy buffering
and stream timeouts, and preserve existing origin/access restrictions. Limit
resource use and expose synchronization failure without leaking file contents.

While connected, replace frequent polling with stream-triggered conditional
reads. Keep a slower safety reconciliation and visibility/reconnect recovery.
When streaming or watching is unavailable, fall back to conditional polling with
bounded retry/backoff and visible degraded state. Record chosen timing values and
their measured behavior in the implementation ticket.

### Client acceptance and gestures

Coalesce invalidations into at most the reads needed to reach the latest known
generation. Ignore old-board notifications and obsolete responses. A notification
received during a drag marks pending work; it does not publish a new placement.
After completion or cancellation, accept the latest state using the existing
manual-placement previews and mutation ordering before routing automatic cards.

When pens are implemented, automatic placement runs at accepted-update boundaries,
not in render functions or on every SSE heartbeat. Inspector drafts and focus
must remain intact. Local writes and their echoed notifications must converge
without redundant state publication or movement.

## Derived-state invalidation

File revisions alone are insufficient for validators, identity reuse, or deltas:

- Completing a prerequisite can change readiness on other tickets without
  changing their Markdown.
- Creating or deleting a ticket can change other tickets' shortest unique IDs.
- Claim expiry can change with time and no filesystem event.
- Configuration, board list, and layout changes alter board responses without
  changing ticket Markdown.

Use observable snapshot changes as the correctness boundary. Schedule or reconcile
time-dependent transitions even when no watcher event fires. A conservative
recompute followed by snapshot comparison is preferable to an incomplete
invalidation graph. Optimize graph updates only when measurements justify it.

## Step 3: Measured payload reduction

Do not implement both deltas and summary/detail splitting by default. After
steps 1 and 2, measure changed-response traffic and choose the smallest approach
that fixes a documented remaining cost. Promotion requires user approval of the
chosen approach and a measurable success target.

### Candidate A: Generation-based deltas

Return complete changed ticket records, deleted IDs, and changed board/configuration
metadata relative to a client's accepted generation. Include affected derived
records, not only files touched by the triggering event. Do not begin with JSON
field patches.

Identify the base and result generation, scope deltas to a board/server epoch,
and apply them atomically. Reject an incompatible base and fetch a full snapshot.
Bound any retained change history. Expired cursors, restart, gaps, or mismatches
fall back to a full snapshot. Test that applying a delta produces the same state
as the authoritative full response.

### Candidate B: Board summaries and ticket details

Keep card data in board responses and fetch full ticket detail when needed by the
inspector. Do not silently remove description search, acceptance progress,
readiness, labels, or relationships: those currently consume full-ticket fields.
Define their data path before choosing this approach.

Key detail caches by ticket identity and appropriate revision. Invalidate them
on changes and deletion. Protect against late responses after selection or board
changes, and preserve unsaved inspector drafts. Lazy-loading detail must not
introduce a stale revision into a later write.

## Measurement and promotion gates

Step 1 establishes a reproducible baseline and reports its before/after results.
Use the existing 120-card fixture plus a documented body-heavy variant. Record:

- Request counts and transferred bytes during a fixed idle interval.
- Response bytes and server reconciliation work for one ticket edit and a burst.
- Card/inspector render counts and placement-calculation counts on unchanged and
  changed updates.
- Detection-to-visible-update latency for API and external filesystem changes.
- Behavior with multiple tabs, reconnects, and an active drag.

Distinguish payload bytes from compressed wire bytes and actual DOM changes from
component renders. Record fixture sizes, intervals, commands, and runtime/build
identity with results. Do not estimate savings from request counts alone.

Step 2 depends on step 1. Before promotion, attach baseline and step-1 evidence,
identify the remaining external-update latency or repeated server-work problem,
and have the user approve a target and SSE deployment/recovery scope. Queue order
alone is not authorization to add a long-lived protocol.

Step 3 depends on step 2. Before promotion, attach post-SSE evidence that changed
responses still cost enough to justify a new representation, choose deltas or
summary/detail with the user, and record the success target and compatibility
contract. If the evidence does not justify it, leave the ticket draft or archive
it with that finding. Avoid speculative protocol work.

## Verification requirements

- Go/API tests cover conditional requests, board-specific validators, changed
  derived state, claim expiry, layout/configuration changes, and full-read recovery.
- Store/component tests verify stable identity and zero publication on no-op reads,
  while preserving genuine derived changes and stale-response protection.
- Watcher tests cover creation, atomic saves, status moves, deletion, new
  directories, burst coalescing, malformed files, overflow/rescan, and recovery.
- SSE tests cover initial-subscription races, disconnect/reconnect, restart,
  heartbeat behavior, bounded slow subscribers, fallback polling, and cleanup.
- Browser tests cover external edits, multiple tabs, inspector drafts, read-only
  mode, board switches, overlapping mutations, and updates during a drag.
- Step-3 tests cover delta/full-snapshot equivalence or summary/detail/search parity,
  depending on the approved design, plus deletions and stale cache recovery.
- Run `just check` and embedded browser checks for implementation work. Extend
  refresh measurements without weakening the existing 120-card pointer-motion
  guard or its zero per-motion inspector-rerender requirement.

These are future requirements. This design-only change does not claim that the
features or benchmarks have been implemented.

## Draft tracking

Three tickets track the steps above, all in draft:

1. [TKT-01M245HJ (Add conditional board reads and stable client snapshots)](../.tickets/draft/TKT-01M245HJ7GBGQ8G8JGGY5RW2DY.md).
2. [TKT-01M245JG (Push store invalidations through a watcher and SSE)](../.tickets/draft/TKT-01M245JGN1A77WJASYMPSF19CM.md). Depends on TKT-01M245HJ and its measurement evidence.
3. [TKT-01M245KD (Reduce changed-board payloads after live-update measurements)](../.tickets/draft/TKT-01M245KD7WVBWTWMB86C8CE6CH.md). Depends on TKT-01M245JG and post-SSE evidence.

These links record the initial draft paths. Resolve IDs with `git ticket` after
a ticket moves to another status directory. Their implementation plans remain
empty until an actor claims promoted work and inspects the then-current code.
The new workstream does not add dependencies to the existing frames or pens
tickets, and does not revise the earlier canvas design.

## Record provenance

Written with terva 0.134.5-0.20260908184005-01e3a6719b46, commit `01e3a67`,
built 2026-09-08T18:49:46Z. Loaded extensions: index 0.8.2, obsidian 0.2.0,
and web 0.3.1. Session `20260909-215300-f584a1be`.
