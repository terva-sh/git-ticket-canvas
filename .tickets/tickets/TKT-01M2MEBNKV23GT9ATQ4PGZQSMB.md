---
schema: 3
id: TKT-01M2MEBNKV23GT9ATQ4PGZQSMB
title: Authenticate with OpenID Connect and grant read access per store
type: task
status: ready
status_reason: null
priority: normal
due_on: null
labels:
  - auth
  - multiuser
  - security
assignees: []
milestone: null
parent: TKT-01M2MEAP8ED8NZYGJKN2002G6J
origin: null
dependencies:
  - TKT-01M2MEB8F779XMKSSP2JJA338J
blocks_on: none
references:
  - ref: doc:multiuser
    path: docs/multiuser-design-v1.md
claim: null
archive: null
created_at: 2026-09-16T06:27:10Z
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

The security core, and enough to publish a canvas at a hostname. Read-only: writer roles are in the grant schema so it never needs migrating, and are not switched on here. The reason is attribution, not effort, and it is recorded on its own ticket.

Discovery, the JWKS fetch, signature verification, and the code exchange come from the library. What the canvas owns is the configuration shape, the group mapping, and three refusals that are not configurable: a plaintext issuer, signing algorithms read from discovery rather than pinned to asymmetric schemes, and an unchecked nonce.

The rule the rest of the model protects: a user with no matching group on a store gets nothing on that store. Not a default role, not read access, not an entry in the list. A global role map is allowed as sugar and grants nothing by itself, because the global-map shape is the one that reads naturally and silently grants every new store to everyone already in it.

`GET /api/stores` is part of the boundary. It returns every configured store with its resolved filesystem path, and the picker renders those paths, so it discloses the name and on-disk location of every repository the host serves to anyone who can log in. Filter in the handler; a front-end filter is a rendering decision made after the data has left.

Identity configuration comes from the server command's own file or flags and never from a store's `.tickets/config.yml`. A ticket store is a git repository, and the multi-store design already lets a store influence what the canvas serves. That path must not extend to deciding who the canvas trusts to log in.

See `docs/multiuser-design-v1.md`.

## Acceptance criteria

- [ ] A login against a real provider yields subject, email, name, and groups, and everything downstream keys on subject
- [ ] A plaintext issuer is refused, and any development opt-out says in its name that it is unsafe
- [ ] Signing algorithms are pinned to asymmetric schemes, with tests for none, algorithm confusion, and kid handling
- [ ] The nonce is checked against the attempt that started in this browser
- [ ] A user with no matching group on a store cannot read it and cannot see it listed
- [ ] GET /api/stores returns only stores the caller holds a role on, filtered server-side
- [ ] Identity configuration is never read from a store's config.yml, and a test proves it
- [ ] Sessions are server-side behind an opaque id, with nothing about the principal in the cookie
