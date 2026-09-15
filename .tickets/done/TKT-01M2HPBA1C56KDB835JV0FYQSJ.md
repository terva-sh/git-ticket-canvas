---
schema: 3
id: TKT-01M2HPBA1C56KDB835JV0FYQSJ
title: Resolve actor and read-only per store, and isolate failures
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - api
  - config
assignees: []
milestone: null
parent: TKT-01M2HPB9WEYH5VSYB55GNYMZ8Y
origin: null
dependencies:
  - TKT-01M2HPB9ZNGE7YGDZ6RZHB4PFJ
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-15T04:49:03Z
updated_at: 2026-09-15T05:19:58Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

Resolve the actor and the read-only setting per store, and contain a failure to
the store that caused it.

`resolveActor` currently runs once in `main.go` against the single store. Each
store has its own `config.yml` with its own actors, so it has to run per store.
A per-store entry in the canvas configuration wins, and a global `--actor` is
the fallback for stores that need one.

The effective read-only setting is the global flag, or the per-store setting,
or the absence of any resolvable actor, whichever applies.

### The behavior that changes

Today a store that declares no actor stops the process from starting. That is
right for one store and wrong for a list: one stale entry would take down the
whole page. Such a store opens read-only instead, with the reason recorded and
served, and every other store carries on.

The same holds for a path that is missing and a store that will not parse.
Report `unavailable` with a reason rather than failing to start.

## Acceptance criteria

- [x] Each store resolves its actor from its own config.yml; a per-store configured actor wins over the global --actor.
- [x] A store with no resolvable actor opens read-only with that reason, instead of stopping startup.
- [x] A missing or unparseable store is reported unavailable with a reason while the others serve.
- [x] Requests to an unavailable store return 503 store_unavailable carrying the reason.
- [x] Read-only can differ per store, and the board response reports the effective value.

## Definition of done

- [x] A test starts a server with one good and one broken store and reads the good one.

## Implementation plan

### The failure modes, measured rather than guessed

Probed against git-ticket v0.14.3:

- An absent path, and a directory with no `.tickets`, both fail `ticket.Discover`
  with code `store_not_found`.
- A `.tickets/config.yml` that is not valid YAML fails `Discover` with code
  `parse_error`. A malformed store therefore fails at open, not later.
- A store with `actors: []` opens fine. `Config.DefaultActor` returns not-ok.
  That is the read-only case rather than the unavailable one, because the store
  is perfectly readable.

So there are two degraded states and they are not the same. A store can be
unavailable, meaning nothing can be served from it, or available but forced
read-only, meaning it reads fine and cannot be written. Both carry a reason.

### Opening moves into the registry

`main.go` currently does `ticket.Discover`, then `resolveActor`, then
`api.New`. That loop has to move behind the registry, because
TKT-01M2HPBAB (Open discovered stores lazily and evict idle ones) opens a store
on first access rather than at startup, and opening cannot live in a startup
loop that will no longer run.

Add `StoreSpec{Name, Path, Actor, ReadOnly}` and `Registry.OpenStore(spec)`.
`OpenStore` attempts the open and records the outcome. It returns an error only
for a duplicate name, which is a configuration mistake rather than a store
problem. Move `resolveActor` out of `main.go` into `internal/api` beside it.

### Entry state

An entry keeps its name, its configured path, the resolved actor, the effective
read-only setting, a `*Server` that is nil when unavailable, and a reason that
is empty when nothing is wrong. One reason field covers both degraded states,
because a reader wants the same thing in either case: a sentence saying what is
wrong with this store.

A store with no resolvable actor is opened with read-only forced on. Writes are
refused at the edge, so the zero actor is never used to attribute anything.
Forcing read-only is what guarantees that.

### Serving a degraded store

`handleStore` already answers 404 `unknown_store` for a name nobody configured.
A name that is configured but unavailable answers 503 `store_unavailable`
carrying the reason, which distinguishes "you asked for something that does not
exist" from "you asked for something that exists and is broken". Reuse
`errBody` so the browser decodes both the same way.

`GET /api/stores` gains `available` and `reason` per row, so a misconfigured
path is diagnosable from the page rather than from the logs.

### Startup stops being all-or-nothing

`Registry.Start` starts the available stores. A store that fails to start is
marked unavailable with its reason instead of aborting, and the rest carry on.
This is the behavior change the ticket exists for, and it is what makes a list
usable: with 22 discovered stores, one stale path taking down the page is not a
tradeoff anybody would pick.

`main.go` logs what happened per store from `Registry.Statuses`, so an
unavailable store is loud at startup as well as visible in the API.

### Tests

One good store and one broken store in the same registry, reading the good one,
which is the definition of done. Then each failure mode separately: an absent
path, a malformed `config.yml`, and a store with no actor. Assert the 503 and
its reason, the index rows, and that a no-actor store reads but refuses writes.

## Notes

**agent:t3code/d30689a3** at 2026-09-15T05:08:07Z

Two of this ticket's acceptance criteria were satisfied early, in
TKT-01M2HPB9Z (Route the API by store key behind a store registry).

Running the built binary there showed a configuration file setting
`readOnly: true` being parsed and then ignored, because `main.go` handed the
global flag to every store. A setting that protects somebody's repository must
not be accepted and dropped, so `main.go` now applies both per-store fields: a
store's configured `actor` beats the global `--actor`, and a configured
`readOnly` holds whatever the flag says. `TestReadOnlyCanDifferPerStore` covers
the read-only half.

So criterion 1 is partly done, in that a per-store configured actor already
wins. What remains on it is resolving each store's actor from its own
config.yml when nothing is configured, which already happens, and confirming it
under several stores with different actors.

Criterion 5 is done: read-only already differs per store and the board response
reports the effective value.

What this ticket still owns is the behavior change. A store that cannot be
opened stops the whole process today, exactly as one store does. Making it one
unavailable store while the rest serve, opening an actor-less store read-only
instead of failing, and answering 503 store_unavailable with a reason are all
untouched.

The refusal message also changed to "this store is read-only", because the old
wording named --read-only as the cause when configuration may be the real one.

**agent:t3code/d30689a3** at 2026-09-15T05:13:10Z

draft to ready: The user chose it next. Its dependency, the store registry, is done.

## Summary

A store that cannot be opened is now one unavailable store rather than a dead
process. Opening moved from `main.go` into `Registry.OpenStore`, and
`resolveActor` moved with it.

### The failure modes, measured first

Probed against git-ticket v0.14.3 before any code was written. An absent path
and a directory with no `.tickets` both fail `ticket.Discover` with
`store_not_found`. A `config.yml` that is not YAML fails it with `parse_error`,
so a malformed store fails at open rather than later. A store with `actors: []`
opens fine and `Config.DefaultActor` returns not-ok.

That last one is why there are two degraded states rather than one. A store can
be unavailable, serving nothing, or available and forced read-only, reading
fine with nobody to write as. Withholding a readable store because nobody can
write to it would throw away the reading, which is most of what a canvas does.

### Reason and note are separate fields

The first version folded them together, and the tests caught it.
`ticket.Init` with an actor lists that actor but sets no `defaults.actor`, so an
ordinary healthy store carries the "writing as the first listed actor" message.
With one field, the browser would badge a perfectly good store as degraded.

`Reason` now means something is wrong: unavailable, or forced read-only. `Note`
is information a healthy store can carry. `TestAnInformationalNoteIsNotAFault`
holds the line.

### What answers what

- A name nobody configured: 404 `unknown_store`.
- A name that is configured and not serving: 503 `store_unavailable` with the
  reason and a `Retry-After`. These are different answers because "you asked
  for something that does not exist" and "that exists and is broken" send a
  reader to different places.
- A store with no actor: reads 200, writes 403 `read_only`.

`GET /api/stores` reports `available`, `readOnly`, `actor`, `actorId`, `reason`,
and `note` per store, and lists unavailable stores rather than hiding them.

`main.go` logs every store at startup, unavailable ones included, and refuses to
start only when nothing opened at all. Serving nothing is a broken invocation
rather than a degraded canvas.

### Verified against the built binary

Four stores in one process: healthy, no-actor, malformed `config.yml`, and an
absent path. It started. The healthy store read and wrote, the no-actor store
read and refused writes with 403, both broken stores answered 503 with their
reasons, an unconfigured name answered 404, and the startup log named all four.
With every store broken it refused to start and exited 1. A single healthy
store still served the flat routes and the frontend.

That run also caught a regression worth naming: the `store_not_found` reason had
lost the "run `git-ticket init` first" hint that the single-store path always
gave. It is the error somebody hits on their first run, and the next step is not
obvious from the absence alone. Restored.

### Verified

`just fmt-check`, `just vet`, `just test` with `-race`, `just go-only-check`,
`just tickets-check`, `just dist-verify`, `just web-typecheck`, and
`just web-test` at 476 tests all pass. `internal/api` coverage is 87.3%.

The only existing test file touched is `internal/api/registry_test.go`, and only
to rename loop variables that would otherwise shadow the new `entry` type. No
test predating this work changed.

`just browser-test-embedded` did not run. Chromium cannot start in this
environment because `libnspr4.so` is absent, so CI is the first run. The
frontend is untouched and still uses the flat routes, which a single store still
mounts.

### Left for later

`Registry.Start` returns nil in every path today. The error stays in the
signature because TKT-01M2HPBAB (Open discovered stores lazily and evict idle
ones) moves opening off startup, where a cancelled context is a failure of the
call rather than of any one store.

Nothing retries an unavailable store. Fixing a path still needs a restart until
the rescan work lands.
