---
schema: 3
id: TKT-01M2ND34FN6BB5MJ5XP51273J1
title: Record a successful login
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
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T15:24:16Z
updated_at: 2026-09-16T15:33:15Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

A successful login writes nothing to the log. The canvas prints the issuer, the client and the redirect URI at startup, and then records nothing when somebody actually signs in: no subject, no name, no groups, no time.

An operator reading the unit's journal cannot tell who has been reading a ticket store. On the brokkr deployment the identity provider's own event log was the only record that anybody had signed in at all, which means the audit trail for a canvas lives in a different system from the canvas.

For a tool whose entire purpose is serving a store to several people, that is a hole in the record rather than a missing convenience.

One line, at the point the session is created. Subject, display name, and the groups the token carried, because a login that arrives with no groups is the single most common misconfiguration and the log should make it obvious.

### What must not be logged

No tokens, no authorization code, no session id, no cookie value. The log line names a person and what they were granted; anything that could be replayed does not belong in it.

A failed login already logs which check failed, and that stays as it is.

## Acceptance criteria

- [x] A successful login writes one line naming subject, display name, and the groups carried
- [x] No token, authorization code, session id, or cookie value appears in any log line
- [x] A login carrying no groups is obvious in the log
- [x] A refused login logs which check failed, which docs/serving-a-canvas.md already promises and nothing implemented

## Notes

**agent:claude/t3code** at 2026-09-16T15:25:15Z

`internal/auth` has no logging of any kind, not just no success logging. `finish` computes a precise reason for every refusal — the browser started no login, the state did not match, the token did not verify, the nonce belonged to another attempt — and `Callback` discards it, answering the browser with one generic sentence.

`docs/serving-a-canvas.md:219` already tells operators the opposite: "Which one is on the server's log and not in the browser's, because the browser may be holding a code that is not its own." That sentence describes something nobody built.

So this ticket covers both halves. The failure reason has to reach the log for the documentation to stop lying, and it is the same one-line change at the same seam. The fourth criterion is amended accordingly; it previously assumed failure logging existed.

## Summary

`internal/auth` had no logging at all. It has two lines now, both at the callback, which is the only place that knows whether a login worked.

A success logs `login  <name> (<subject>) holding <groups>`, built by `Identity.Describe`. A login that arrived with no groups says `holding no groups` rather than rendering an empty list, because that is the most common misconfiguration there is and an operator should not have to infer it from an empty canvas.

A refusal logs `refuse login: <reason>` — the precise reason `finish` already computed and `Callback` was discarding. The browser still gets one generic sentence, because it may be holding a code that is not its own. This is what `docs/serving-a-canvas.md:219` has promised operators since before anything implemented it.

`Describe` carries no email, no token, no authorization code and no session id. `TestTheLogCarriesNothingReplayable` asserts each of those against a real flow rather than by inspection.

Verified live on brokkr: a callback with no attempt cookie logged `refuse login: this browser started no login`.
