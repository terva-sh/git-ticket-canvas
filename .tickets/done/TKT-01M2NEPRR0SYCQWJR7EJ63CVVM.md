---
schema: 3
id: TKT-01M2NEPRR0SYCQWJR7EJ63CVVM
title: Let an administrator see who has signed in
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - auth
  - multiuser
  - ui
assignees: []
milestone: null
parent: TKT-01M2MEAP8ED8NZYGJKN2002G6J
origin: null
dependencies:
  - TKT-01M2NEPRPTADQ3TGE5C8PAPMJC
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T15:52:28Z
updated_at: 2026-09-16T16:01:37Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

`grants.Admin` has been in the vocabulary since the first version and gates nothing anywhere. This is its first consumer.

An administrator can see who has signed in: the people record from `TKT-01M2NEEX`, as a list — display name, email, when they were first and last seen, the groups they last carried, and the actor id they write as on each store.

### The bootstrap grant is configuration, and only configuration

A group named in the configuration file holds admin. That grant is not editable through anything the canvas serves, which is what disposes of the last-administrator problem: no sequence of requests can leave the canvas with nobody able to administer it, because no request can change who can.

This is the part of `TKT-01M2MEC1ZXHZ0Y2MRJ3R0D66XE` that has to exist before the rest of it can. That ticket keeps everything else: creating and revoking grants, the append-only audit log, and the rule that the audit log cannot be edited through the API.

### An administrator still reads nothing

`CanRead` does not consult admin and must not start. Seeing who uses the canvas is not seeing what they read, and an administrator who wants a store grants it to themselves, which leaves a record. That rule is already written down in `docs/multiuser-design-v1.md` and this ticket is the first chance to break it, so it needs a test rather than an intention.

### Refusal

A caller who is not an administrator is refused rather than shown an empty list, because an empty list and a refusal mean different things and somebody debugging deserves to know which they got. This is not a store, so the invisibility rule does not apply: the route's existence discloses nothing about what is served here.

## Acceptance criteria

- [x] A group named in configuration holds admin, and nothing served can change it
- [x] An administrator sees everyone who has signed in, with the groups each last carried
- [x] An administrator reads no store they were not granted, with a test
- [x] A caller who is not an administrator is refused rather than shown an empty list
- [x] The refusal names nobody
- [x] A desk canvas offers none of this

## Summary

`grants.Admin` had been in the vocabulary since the first version and gated nothing anywhere. `admins:` in the configuration file now names groups that administer the canvas, `api.Access` answers `IsAdmin`, and `GET /api/people` is its first consumer.

The account panel grows an Administration section for those callers: everybody who has signed in, when they were last here, the groups they last carried, and the actor id they write as on each store.

`TestAnAdministratorReadsNoStoreTheyWereNotGranted` is the important one. Administration is not read access, an administrator who wants a store grants it to themselves in the file, and this ticket was the first chance to break that rule, so it is a test rather than an intention.

A caller who is not an administrator is refused rather than shown an empty list, because those mean different things, and the refusal names nobody.

Found while wiring it: `config.Load` copies fields from the parsed file one at a time, so `admins:` parsed correctly and then never arrived. The startup note added here — "no group administers this canvas" — is what caught it on the first run, and `TestLoadCarriesTheAdministrators` is so the next field added to `Config` cannot go missing the same way.

What this does not do is anything `TKT-01M2MEC1ZXHZ0Y2MRJ3R0D66XE` still holds: creating or revoking grants, the append-only audit log, and the rule that the log cannot be edited through the API. This is the bootstrap that had to exist before any of that could.
