---
schema: 3
id: TKT-01M2HPBACHAMZM2EMV5FMC8CEK
title: Scope the browser client and live stream to a store
type: task
status: draft
status_reason: null
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

- [ ] Every client request targets /api/stores/{store}/, and the event stream connects to that store's URL.
- [ ] selectStore clears tickets, schema, boards, cards, frames, routing, validator, sync metadata, and capture token.
- [ ] A read in flight when the store changes cannot apply to the new store.
- [ ] Switching stores closes the previous event stream and opens the new one.

## Definition of done

- [ ] just web-test passes.
