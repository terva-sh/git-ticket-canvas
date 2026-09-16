---
schema: 3
id: TKT-01M2MECN07R2P8DJK770CMHNQE
title: Let a person set the actor their writes are stamped with
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - auth
  - multiuser
assignees: []
milestone: null
parent: TKT-01M2MEAP8ED8NZYGJKN2002G6J
origin: null
dependencies:
  - TKT-01M2MEBNKV23GT9ATQ4PGZQSMB
blocks_on: none
references:
  - ref: doc:multiuser
    path: docs/multiuser-design-v1.md
  - ref: code:bindings
    path: internal/actors/actors.go
  - ref: code:actor-routes
    path: internal/api/actor.go
  - ref: test:bindings
    path: internal/actors/actors_test.go
  - ref: test:actor-routes
    path: internal/api/actor_test.go
  - ref: doc:operator-guide
    path: docs/serving-a-canvas.md
claim: null
archive: null
created_at: 2026-09-16T06:27:42Z
updated_at: 2026-09-16T14:25:31Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

A user sets their own actor in the web UI, per store. The canvas prefills it from the identity provider so nobody has to think about it on a first login, and the user may then change it to whatever they want.

Prefill order, first non-empty wins: `preferred_username`, the local part of `email`, then `name`. Offer it as `human:<value>`, because that prefix is the convention the store's own actors already use.

Free choice means somebody can type an actor id that reads like another person, so the integrity of the record comes from two rules that do not constrain what may be typed. An actor id binds to one subject per store, first claim holding, so two people cannot both write as `human:drew` and nobody can take over an id another has been writing under. And the binding is recorded, so the canvas can always answer which subject wrote as a given actor on a given date.

What that does not prevent is claiming an id belonging to somebody who has never signed in to this canvas, because there is no binding to conflict with. An operator who needs more can turn on the store's declared actors as an allowlist. That is off by default: the cost of it being on is that every new user is blocked until somebody edits a file, and the case it defends against is one where the people involved already have accounts here.

The binding is retained when a grant is revoked, so re-granting somebody does not free their id for a different person to claim and inherit the look of their history.

`resolveActor` at `internal/api/registry.go:453` deliberately accepts an actor the store does not list, so that `--actor me@example.com` works in a store that never declared one. The desk tool keeps exactly that. The server keeps it too by default and adds the binding check in front: the allowlist asks whether the store knows this name, the binding asks whether somebody else is already using it.

See `docs/multiuser-design-v1.md`.

## Acceptance criteria

- [x] A first login is offered an actor prefilled from the provider, and can change it
- [x] An actor id already bound to a different subject on that store is refused
- [x] The subject-to-actor binding and every change to it are recorded and readable by an administrator
- [x] A binding survives revoking and re-granting the user
- [x] The store's declared actors can be turned on as an allowlist, and are off by default
- [x] The desk tool's actor resolution is unchanged

## Implementation plan

A new record, two routes, and nothing at all on the desk canvas.

### internal/actors

The binding and its history, in their own file beside the favorites file and
deliberately not in it. A bug in the favorites path must not be able to rewrite
who wrote what, and the two have different owners.

Two maps, one file. `byActor` answers who holds an id, `current` answers what
somebody is writing as, and the file holds the bindings plus an append-only list
of events. `current` is rebuilt by replaying the events rather than stored, so
the append-only list is the one place holding the truth.

`Claim` is the whole rule: an id bound to another subject is refused, an id
already yours is a no-op, and a change records what it replaced without
releasing the old binding. Nothing deletes a binding, which is what makes
"survives revoking and re-granting" true by construction rather than by
remembering.

A record that will not parse stops the canvas, unlike the favorites file. Losing
a canvas over a corrupted list of favorites is the wrong trade; carrying on as
though nobody had ever claimed an id would let the next person claim somebody
else's name.

### The routes

`GET` and `PUT` on `/api/stores/{store}/actor`, plus the flat pair for a canvas
serving one store. Registered only when `Access` is non-nil, so the desk canvas
has no such route rather than one that always refuses.

They sit on the registry rather than on a `Server`, because an actor is now a
property of the caller and the store together, and a `Server` knows only the
store.

`Caller` gains a suggested `Actor`, built in the command from
`auth.Identity.Actor()`. It is a suggestion: `GET` marks it `chosen: false` and
nothing is bound until a `PUT`.

Two checks in front of a claim, and they are different questions. The allowlist
asks whether the store knows this name, and is off unless `enforceActors` is
set. The binding asks whether somebody else is already using it, and is always
on.

The route is invisible for a store the caller cannot read, with the same answer
a store that is not configured gets. Choosing an actor must not be a way to
learn a repository is here.

### What is not changed

`resolveActor` is untouched, so the desk canvas still resolves one actor when a
store opens and still accepts an id the store does not list.

The board and schema payloads still carry the store's resolved actor. The design
notes that making it per-request means either the snapshot cache stops being
shared or the actor comes out of the payload; neither is needed while multiuser
mode is read-only, and the choice belongs with the phase that switches writes on.

## Notes

**agent:claude/t3code** at 2026-09-16T14:25:10Z

The third criterion is ticked on a narrow reading, and here is exactly what it got.

"The subject-to-actor binding and every change to it are recorded and readable by an administrator."

Recorded: yes, durably and append-only, in `actors.json` beside the state file. Every claim and every change carries a timestamp, the store, the subject, the actor id, and what it replaced. `TestEveryClaimAndChangeIsRecorded` asserts all of that including across a restart. Nothing in the code deletes an entry.

Readable by an administrator: only as a file on the server, plus a line per binding on stderr at startup. There is no API and no screen, because there is no administration surface at all yet and building one is TKT-01M2MEC1, which the handoff says not to start.

So the criterion is satisfied for the only administrator a canvas at this phase has, which is whoever can read the server's state directory. If the intent was "an administrator signed in to the canvas can read it", that arrives with TKT-01M2MEC1 and this record is what it will read. Ticked rather than left open because the thing that had to exist now is the record, and it does; say so if you read the criterion the other way and I will unpick it.

**agent:claude/t3code** at 2026-09-16T14:25:10Z

The actor is chosen and bound and does not stamp anything yet, which is the phase order rather than an omission.

Multiuser mode is read-only until TKT-01M2MED3 is settled, so no write on a served canvas reaches a store and there is nothing for a per-request actor to label. What is built here is the choosing, the binding, and the record.

That is worth doing before writes rather than with them. The record is what gives a store's `updated_by` field any meaning, and a record that starts on the day writes are switched on is a record with a hole at the front: every id claimed before then would be unattributed, and the first-claim rule would have nothing to check against.

Two things the phase that switches writes on inherits.

**The board and schema payloads still carry the store's own resolved actor**, not the caller's. The design names the cost: the actor is resolved once when a store opens and lives on the `*Server`, and `conditional_test.go` lists `actor` among the changes that invalidate a snapshot, so making it per-request means either the snapshot cache stops being shared between users or the actor comes out of the payload. Nothing here needed the choice made, and making it now would mean guessing which way the write path wants it.

**The display name is not stored.** `ticket.Actor` has an ID and a Name; the binding records the id, because the id is the record and the name is decoration. Whatever resolves an actor for a write will want a Name, and the identity's own `name` claim is the obvious source.

## Summary

A person on a served canvas sets the actor their writes would be stamped with, per store, and an id belongs to one subject.

`internal/actors` is the record: current bindings plus an append-only list of every claim and every change, in `actors.json` beside the favorites file and deliberately not in it. `current` is replayed from the events rather than stored, so the append-only list is the one place holding the truth. Nothing deletes a binding, which is what makes "survives revoking and re-granting" true by construction.

`GET` and `PUT` on `/api/stores/{store}/actor`, plus the flat pair, registered only where there is somebody to have an actor. `GET` offers `preferred_username`, then the local part of the email, then the display name, first non-empty winning, as `human:<value>`, marked `chosen: false` until somebody accepts or replaces it.

Two checks in front of a claim, and they are different questions. The allowlist asks whether the store knows this name and is off unless `enforceActors: true`. The binding asks whether somebody else is already using it and is always on. The route is invisible for a store the caller cannot read, with the same answer an unconfigured store gets, so choosing an actor is not a way to learn a repository is here.

Earned, each by a named test: the prefill and the change (`TestAFirstLoginIsOfferedAnActorAndCanChangeIt`), the refusal (`TestAnActorBoundToAnotherSubjectIsRefused`), the record including across a restart (`TestEveryClaimAndChangeIsRecorded`), survival of revoke and re-grant end to end (`TestABindingSurvivesRevokingAndReGranting`), the allowlist off by default and on when asked (`TestTheDeclaredActorsAreAnAllowlistOnlyWhenTurnedOn`), and the desk canvas having no such route and still resolving its own actor (`TestTheDeskCanvasHasNoActorRoute`).

Two narrow readings are recorded in notes rather than hidden behind a tick. "Readable by an administrator" means the operator reads the file and sees the bindings logged at startup; there is no API, because there is no administration surface until TKT-01M2MEC1. And the actor stamps nothing yet, because multiuser mode is read-only: the board and schema payloads still carry the store's own resolved actor, and the choice the design names between an unshared snapshot cache and taking the actor out of the payload belongs with the phase that switches writes on.

`resolveActor` is untouched. `just check` passes, including `go test -race`.
