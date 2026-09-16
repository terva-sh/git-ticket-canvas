---
schema: 3
id: TKT-01M2MEC1ZXHZ0Y2MRJ3R0D66XE
title: Manage grants in the canvas, with an audit log
type: task
status: draft
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
  - TKT-01M2MEBNKV23GT9ATQ4PGZQSMB
blocks_on: none
references:
  - ref: doc:multiuser
    path: docs/multiuser-design-v1.md
claim: null
archive: null
created_at: 2026-09-16T06:27:22Z
updated_at: 2026-09-16T06:28:14Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

Static configuration is where grants start and not where they should end. An operator who has to edit a file and restart a service to add a colleague will either not add the colleague or will leave the grants too wide on purpose.

Moving grants into the application changes their character. Permissions stop being policy an operator writes and become mutable state the canvas owns, which makes the administration endpoint the most security-sensitive surface in the product: it is the one that can grant its own caller more access. Everything in this ticket follows from that.

The configuration file keeps exactly one job, naming the bootstrap administrator group or subject, and that grant is not editable through the API. It is the root of trust, and putting it out of reach also disposes of the last-administrator problem, since no sequence of clicks can leave the canvas with nobody able to grant.

An administrator may grant and revoke. An administrator has no implicit read access to any store. The capability is identical either way, because an administrator can grant themselves anything; the difference is that a self-grant leaves a record and implicit access leaves none. For a canvas serving somebody's ledger, "who looked at this" should have an answer.

See `docs/multiuser-design-v1.md`.

## Acceptance criteria

- [ ] Grants are created and revoked through the API and the web UI by an administrator
- [ ] The bootstrap administrator comes from configuration and cannot be revoked or edited through the API
- [ ] No sequence of API calls leaves the canvas with no administrator
- [ ] An administrator holds no read access they were not granted, and a self-grant is recorded
- [ ] Every grant, revoke, and administrative change is an append-only audit entry naming the acting subject
- [ ] The audit log cannot be edited or deleted through the API
- [ ] Grant state is stored apart from the per-user preference file
