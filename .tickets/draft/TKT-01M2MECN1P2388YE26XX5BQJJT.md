---
schema: 3
id: TKT-01M2MECN1P2388YE26XX5BQJJT
title: Grant access to one person rather than a group
type: task
status: draft
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
  - TKT-01M2MEC1ZXHZ0Y2MRJ3R0D66XE
blocks_on: none
references:
  - ref: doc:multiuser
    path: docs/multiuser-design-v1.md
claim: null
archive: null
created_at: 2026-09-16T06:27:42Z
updated_at: 2026-09-16T06:28:07Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

Granting to a group is cheap: the provider knows the groups and puts them in the token. Granting to a person is not, because the canvas has no user directory. It learns a user exists when they log in.

Typing a raw subject identifier is unusable by a human. Querying the provider for a user list needs a client credential with directory scope, which is a much larger ask of whoever operates the provider and a much larger thing to hold. Both rejected.

Invite by email: an administrator grants to an email address, and the first login whose `email` claim matches binds the grant to that subject permanently, after which the email is decoration.

The trap is the one the subject rule exists to avoid, relocated to the grant stage. An unbound grant is a claim on an email address, and email is mutable in every provider, so a pending grant can be collected by whoever holds that address next. Pending grants expire, binding happens once and cannot be repeated without an administrator action, and every binding is an audit entry. If any of those three is dropped as unnecessary, nothing fails visibly and the property is gone.

Per-user state from the first phase is also the directory this needs, so an administrator can grant to anyone who has signed in before without any directory scope. The invite path covers only somebody who never has.

See `docs/multiuser-design-v1.md`.

## Acceptance criteria

- [ ] An administrator can grant to a user who has signed in before, chosen from what the canvas already knows
- [ ] An administrator can grant to an email address that has never signed in
- [ ] A pending grant expires, and the expiry is tested
- [ ] Binding happens once; a second attempt needs an administrator action
- [ ] Every binding is an audit entry naming the subject and the email it matched
