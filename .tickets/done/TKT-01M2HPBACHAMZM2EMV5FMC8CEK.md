---
schema: 3
id: TKT-01M2HPBACHAMZM2EMV5FMC8CEK
title: Scope the browser client and live stream to a store
type: task
status: done
status_reason: Every request the canvas makes is scoped to a store, and switching stores rebuilds the client and the stream rather than repointing them.
priority: normal
due_on: null
labels:
  - ui
assignees: []
milestone: null
parent: TKT-01M2HPB9WEYH5VSYB55GNYMZ8Y
origin: null
dependencies:
  - TKT-01M2HPB9ZNGE7YGDZ6RZHB4PFJ
blocks_on: none
references: []
claim:
  actor: agent:t3code/d30689a3
  branch: t3code/orient-upstream-review-tickets
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-d30689a3
  commit: 97d1aa454e26c8ba2eac30999930cc144b19f408
  session: null
  claimed_at: 2026-09-15T06:32:51Z
  expires_at: null
archive: null
created_at: 2026-09-15T04:49:03Z
updated_at: 2026-09-15T06:47:53Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

Point the browser client at one store and let it switch.

`TicketClient` hardcodes `/api/...`. Give it a store-scoped base path so every
request goes to `/api/stores/{store}/...`, and connect `live.ts` to that
store's own event stream.

Add `TicketStore.selectStore`, which resets more than `selectBoard` does. It
must clear the ticket map as well. That map is keyed by ticket ID, and an entry
from the previous store would otherwise survive `reconcileTickets` into the
next one. It must also clear the schema, the board list, the validator, the
sync metadata, and the capture token.

Switching stores replaces the client and the live connection rather than
mutating them. The existing generation and epoch counters already guard reads
that are in flight; a store switch increments both.

## Acceptance criteria

- [x] Every client request targets /api/stores/{store}/, and the event stream connects to that store's URL.
- [x] selectStore clears tickets, schema, boards, cards, frames, routing, validator, sync metadata, and capture token.
- [x] A read in flight when the store changes cannot apply to the new store.
- [x] Switching stores closes the previous event stream and opens the new one.

## Definition of done

- [x] just web-test passes.

## Notes

**agent:t3code/d30689a3** at 2026-09-15T06:32:51Z

draft to ready: Next in the run the user asked for. Its dependency, the registry, is done, and the browser view needs a store-scoped client first.

**agent:t3code/d30689a3** at 2026-09-15T06:47:53Z

in-progress to done: Every request the canvas makes is scoped to a store, and switching stores rebuilds the client and the stream rather than repointing them.

## Summary

The browser now talks to one store, by name, and can change which one.

### Scoped, everywhere

`TicketClient` takes a base and builds every path from it. `storeBase(name)`
gives `/api/stores/{name}`, so the board, schema, tickets, layout, and event
stream are all that store's. `RegistryClient` is the unscoped half: the store
list, the favorites, the version, and a rescan.

`LiveUpdates` takes the stream URL, and the canvas builds a new one per store
rather than repointing the old.

### selectStore clears what selectBoard does not

`TicketStore.selectStore(store, client)` replaces the client and empties the
ticket map, the schema, the board list, the cards, the frames, the routing, the
validator, the sync metadata, and the capture token. The ticket map is the one
that would bite: it is keyed by ticket ID and `reconcileTickets` reuses an entry
whose ID it recognizes, so an ID present in both stores would survive the switch
and show the previous store's title.

The epoch and generation counters both advance, so a read already in flight is
rejected when it returns. A test releases a read from the first store's client
after the switch and asserts it changes nothing.

### Which store, and how to change it

At startup the canvas asks `GET /api/stores`, then opens the store named in the
address, or the store last used, or a favorite, or the first available one. The
store is written into the address as `#store=name`, so a reload comes back to it
and a link to one store is a link somebody can send. A `hashchange` switches
stores, which is also what the picker in TKT-01M2HPBAG (Add a store browser view
and a compact toolbar picker) will do.

A canvas that cannot list stores falls through to the flat routes rather than
showing nothing.

### The browser tests were testing the old bundle

`just browser-test-embedded` runs the committed assets, so it passed the first
time with none of this in it. Rebuilding `web/dist` and running it again found
two real failures, both in fixtures that matched the flat paths: a tab whose
event stream was no longer being blocked, and a stream-blocking pattern that
stopped matching. The route patterns now match the endpoint rather than the
prefix, which holds for both shapes of URL.

That is worth recording: a green browser run right after a frontend change means
nothing unless the bundle was rebuilt first.

### Verified

`just web-test` passes with 481 tests, 5 new. `npm run typecheck`, `just test`
and `just vet` pass. `just browser-test-embedded` passes against a freshly built
bundle: 68 passed, 6 skipped.
