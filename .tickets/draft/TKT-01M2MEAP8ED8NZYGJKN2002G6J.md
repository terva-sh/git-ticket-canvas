---
schema: 3
id: TKT-01M2MEAP8ED8NZYGJKN2002G6J
title: Serve the canvas to more than one person
type: epic
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - auth
  - multiuser
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references:
  - ref: doc:multiuser
    path: docs/multiuser-design-v1.md
claim: null
archive: null
created_at: 2026-09-16T06:26:37Z
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

Turn the canvas from a single-person desk tool into something that can be published at a hostname, without giving up what makes it good on loopback.

The canvas has no authentication today. No credential, no session, no authorization code. The one HTTP control, `http.NewCrossOriginProtection()`, guards unsafe methods only, so an unauthenticated `GET /api/board` from a hostile origin returns the whole store. That is correct for a tool you run against your own repositories and wrong for one anybody else can reach.

`docs/multiuser-design-v1.md` is the design. In short: two commands rather than one flag, single sign-on through OpenID Connect, grants scoped per store with an unlisted store invisible rather than public, and per-user state.

The children are ordered so each is useful alone. The first fixes a bug that exists today and needs no identity provider at all.

## Acceptance criteria

- [ ] docs/multiuser-design-v1.md is implemented or amended where it was wrong
- [ ] A canvas published at a hostname refuses every request it was not granted
- [ ] The desk tool on loopback behaves as it does today
