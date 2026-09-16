---
schema: 3
id: TKT-01M2MECN07R2P8DJK770CMHNQE
title: Let a person set the actor their writes are stamped with
type: task
status: ready
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
claim: null
archive: null
created_at: 2026-09-16T06:27:42Z
updated_at: 2026-09-16T06:34:29Z
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

- [ ] A first login is offered an actor prefilled from the provider, and can change it
- [ ] An actor id already bound to a different subject on that store is refused
- [ ] The subject-to-actor binding and every change to it are recorded and readable by an administrator
- [ ] A binding survives revoking and re-granting the user
- [ ] The store's declared actors can be turned on as an allowlist, and are off by default
- [ ] The desk tool's actor resolution is unchanged
