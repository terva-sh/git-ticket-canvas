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
updated_at: 2026-09-16T14:26:42Z
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

## Notes

**agent:claude/t3code** at 2026-09-16T06:35:43Z

Handoff written for a fresh session: ~/.local/state/agent-handoffs/git-ticket-canvas/2026-09-16-multiuser-canvas.md

It carries the read order, the four promoted tickets and their sequence, the seven properties that fail silently if dropped, the verification gate (just check), and the repository traps that have already cost time this month. It is coordination state; this ticket and docs/multiuser-design-v1.md remain the record.

TKT-01M2MEC1, TKT-01M2MECN1P and TKT-01M2MED3 were deliberately left as drafts. The first two build the administration surface, which the design document says can grant its own caller more access and deserves an adversarial review rather than an unattended build. The third needs a choice between four options with real trade-offs, and choosing is the maintainer's.

**agent:claude/t3code** at 2026-09-16T14:26:42Z

The first four phases are implemented. TKT-01M2MEAY, TKT-01M2MEB8, TKT-01M2MEBN and TKT-01M2MECN07 are done, in that order, each with its own summary.

Where the epic's own criteria stand, which is not for an agent to tick:

**"docs/multiuser-design-v1.md is implemented or amended where it was wrong."** Implemented, and one amendment is proposed and not yet written. The design says the desk tool's loopback refusal has "no override"; the published container image cannot work under that rule, because a process inside a container must bind 0.0.0.0 to be reachable and cannot see whether the host mapped the port to loopback. The maintainer chose a self-naming unsafe flag on 2026-09-16, and the argument that carried it is that the design already permits exactly that shape for the plaintext-issuer refusal. The proposed wording is in a note on TKT-01M2MEB8. Amending the document is not done, because none of the four tickets asked for it.

**"A canvas published at a hostname refuses every request it was not granted."** True for reading, which is all a served canvas does. Not verified against a real identity provider: the first criterion on TKT-01M2MEBN is left unticked for that reason and says what to check.

**"The desk tool on loopback behaves as it does today."** True, with one addition: `-unsafe-publish-without-authentication` exists, and it is the amendment above. Everything else about its flags, defaults and behaviour is pinned by `TestEachCommandHasItsOwnFlags`, which reads the command's own help output.

Three children remain drafts and were not touched: TKT-01M2MEC1, TKT-01M2MECN1P, TKT-01M2MED3.

Two things found while building that nothing tracks yet, neither filed because filing under an epic a person is still steering is their call:

- A served canvas shows no login state. There is no `/api/session`, no name in the toolbar, and no logout control, so somebody logged in cannot see as whom or log out without typing `/auth/logout`. Nothing breaks; the browser works end to end because an unauthenticated page request is redirected and comes back.
- Group membership is read once at login and never again. Somebody removed from a group keeps what it granted until their session idles out, up to twelve hours, or until the canvas restarts.
