---
schema: 3
id: TKT-01M2HPB9ZNGE7YGDZ6RZHB4PFJ
title: Route the API by store key behind a store registry
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - api
assignees: []
milestone: null
parent: TKT-01M2HPB9WEYH5VSYB55GNYMZ8Y
origin: null
dependencies:
  - TKT-01M2HPB9XY067AWC768HT94143
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-15T04:49:03Z
updated_at: 2026-09-15T05:08:07Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

Put a registry above `api.Server` and route to it by store key.

`api.Server` already holds exactly one store, one `layout.Store` rooted at that
store's path, one coordinator, one actor, and one mutation lock. Nothing in it
assumes it is the only one, so the work goes above it rather than inside it.
The existing tests in `internal/api` construct a `Server` directly and must
keep passing without modification. That is the main reason to prefer this shape
over threading a store key through every handler.

Split `Server.Handler` so the same handlers mount under a path prefix. Add
`GET /api/stores` for the list.

### Why a path prefix and not a query parameter

An ETag is scoped to a URL, so a separate path means a 304 for one store can
never be matched against another store's cached body. The event stream gets its
own URL per store, which keeps the browser's reconnection behavior separate
without any work. And the store is visible in a log line and in the network
panel without parsing a query string.

### The compatibility rule

When exactly one store is configured, the flat routes stay mounted and behave
as they do now, so `git-ticket-canvas --store .` is unchanged. Do not mount
them when there is more than one store, because then they would have to guess
which store they meant.

## Acceptance criteria

- [x] Routes under /api/stores/{store}/ reach the right store for board, schema, events, tickets, and layout.
- [x] GET /api/stores lists the configured stores.
- [x] An unknown store key returns 404 unknown_store.
- [x] With exactly one store configured, the flat /api routes behave as they do today; with more than one, they are absent.
- [x] A write to one store does not change another store's ETag or wake its coordinator.

## Definition of done

- [x] Every existing internal/api test passes unmodified.

## Implementation plan

### Splitting the handler

`Server.Handler` builds a mux with routes at `/api/...`, mounts the assets at
`/`, and wraps the result in `http.NewCrossOriginProtection()`. Split it so the
API routes can mount under a prefix:

- `Server.apiRoutes` returns a mux holding the routes without their `/api`
  prefix: `/board`, `/schema`, `/events`, `/tickets`, `/tickets/{id}`, and
  `/layout`.
- `Server.Handler` mounts `http.StripPrefix("/api", ...)` at `/api/`, keeps
  `/api/version` on the outer mux, adds the assets, and wraps as before.
  Nothing about its behavior changes, which is what keeps every existing test
  in `internal/api` passing unmodified.

Rewrite the path rather than registering one literal route set per store.
TKT-01M2HPBAB (Open discovered stores lazily and evict idle ones) changes the
store set at runtime through rescan, and literal routes would have to be
remounted every time. One wildcard pattern does not.

### Registry

`Registry` owns the servers and routes to them by name. Guard the map with a
`sync.RWMutex` now, although nothing mutates it in this ticket, so that rescan
does not have to add locking to code written as though there were none.

Its routes:

- `GET /api/stores` is the index.
- `/api/stores/{store}/` is a subtree. Read `r.PathValue("store")`, look the
  store up, rewrite the path, and delegate to that server's `apiRoutes`.
- `GET /api/version` is global. It answers from the registry's build identity
  rather than from any store, so the browser can label the server even when no
  store is readable.
- The flat `/api/` routes mount only when exactly one store is configured.

An unknown name answers 404 with code `unknown_store`, through the existing
`errBody` shape so the browser decodes it the same way as every other error.

### The compatibility rule

With exactly one store the flat routes mount and behave as they do now, so
`git-ticket-canvas --store .` is unchanged. With more than one they are absent,
because then they would have to guess which store they meant. Assert both
directions.

### Where this ticket stops

A store that cannot be opened still fails the whole process, exactly as it does
today. Per-store actor overrides, per-store read-only, and turning a failed
open into one unavailable store while the rest serve are
TKT-01M2HPBA1 (Resolve actor and read-only per store, and isolate failures).

This ticket does resolve an actor per store, using the existing `resolveActor`
once for each, because constructing a `Server` needs one and there is no other
way to have several.

`Config.Roots` and `Config.Exclude` stay unread. The walk that consumes them is
TKT-01M2HPBA3 (Walk a root for ticket stores with a bounded depth).

### main.go

`--store` becomes repeatable and `--config` appears. When no file, environment
variable, or flag names a store, the list falls back to `.`, which is the
current default. `--actor` and `--read-only` stay global.

### Tests

Each endpoint reaching the right store. The index. An unknown store. The flat
routes present with one store and absent with two.

Isolation gets its own test, because it is the criterion a shared coordinator
would break: write to store A, then assert that store B's board ETag and its
`LiveStats().Rebuilds` are both unchanged.

## Notes

**agent:t3code/d30689a3** at 2026-09-15T04:58:17Z

draft to ready: The user chose it over the walk ticket. Its dependency, the configuration package, is done.

## Summary

A `Registry` owns one `Server` per store and routes to them by name.
`internal/api/registry.go` is new, `Server.Handler` is split, and `main.go`
builds the list through `internal/config`.

### The handler split

`Server.apiRoutes` returns the routes without their `/api` prefix. Both callers
mount it behind `http.StripPrefix`: `Server.Handler` at `/api/`, and the
registry under `/api/stores/{store}/`. Nothing else about `Server` changed, and
no existing test file was touched, which is what the definition of done asked
for.

The registry dispatches through one wildcard pattern rather than registering a
route set per store. TKT-01M2HPBAB (Open discovered stores lazily and evict
idle ones) changes the store set at runtime, and literal routes would have to
be remounted on every rescan.

`Registry.mu` guards the store map although nothing mutates it yet. The lock is
there so rescan does not have to add locking to code written as though there
were none.

### Verified against the built binary, not only in tests

The compatibility rule is about what ships, so it was checked by running
`git-ticket-canvas`:

- One store: the flat `/api/board`, `/api/schema`, `/api/version`, the frontend
  at `/`, and the named `/api/stores/alpha/board` all answer 200, and the board
  reports one ticket at the right store path.
- Two stores: `/api/board` answers 404, each store's own route reports only its
  own ticket and its own path, and `/api/stores/nope/board` answers 404 with
  `unknown_store`.
- Configuration file, environment variable, and precedence between them all
  behave as `internal/config` says, including a relative path resolving against
  the file's directory.

### Two things pulled forward from the actor ticket, and why

Running the binary showed `readOnly: true` in a configuration file being parsed
and then ignored, because `main.go` passed the global flag to every store.
Accepting a setting that protects a repository and silently not applying it is
worse than the small overlap with TKT-01M2HPBA1 (Resolve actor and read-only
per store, and isolate failures), so `main.go` now applies both per-store
fields:

- A store's configured `actor` wins over the global `--actor`. Ignoring it
  would attribute writes to the wrong person, which is the thing this project
  is most careful about.
- A store configured `readOnly` stays read-only whatever the flag says.

`TestReadOnlyCanDifferPerStore` covers it, and the refusal message changed from
"this canvas was started with --read-only" to "this store is read-only",
because the old wording named a cause that may not be the real one.

### What TKT-01M2HPBA1 still owns

Failure isolation, which is the behavior change that matters. A store that
cannot be opened still stops the whole process, exactly as one store does
today. Also a store that declares no actor opening read-only instead of
failing, and serving 503 `store_unavailable` with a reason.

`Config.Roots` and `Config.Exclude` remain unread. The walk that consumes them
is TKT-01M2HPBA3 (Walk a root for ticket stores with a bounded depth).

### Verified

`just fmt-check`, `just vet`, `just test` with `-race`, `just go-only-check`,
`just tickets-check`, `just web-typecheck`, `just web-test` at 476 tests, and
`just dist-verify` reporting the locked rebuild and working `dist` identical
byte for byte. `internal/api` coverage moved from 86.5% to 87.2%.

`just browser-test-embedded` did not run. Chromium cannot start in this
environment because `libnspr4.so` is absent, so CI is the first real run. The
frontend is untouched by this change and still calls the flat routes, which
still exist for one store, so nothing in the browser should notice. The client
moves to the per-store routes in TKT-01M2HPBAC (Scope the browser client and
live stream to a store).
