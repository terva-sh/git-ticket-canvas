---
schema: 3
id: TKT-01M2HPB9ZNGE7YGDZ6RZHB4PFJ
title: Route the API by store key behind a store registry
type: task
status: draft
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
updated_at: 2026-09-15T04:49:03Z
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

- [ ] Routes under /api/stores/{store}/ reach the right store for board, schema, events, tickets, and layout.
- [ ] GET /api/stores lists the configured stores.
- [ ] An unknown store key returns 404 unknown_store.
- [ ] With exactly one store configured, the flat /api routes behave as they do today; with more than one, they are absent.
- [ ] A write to one store does not change another store's ETag or wake its coordinator.

## Definition of done

- [ ] Every existing internal/api test passes unmodified.
