---
schema: 3
id: TKT-01M2ND34E7KCEYBDXQAF328WJB
title: Show who is signed in, and let them sign out
type: task
status: in-progress
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
dependencies: []
blocks_on: none
references: []
claim:
  actor: agent:claude/t3code
  branch: t3code/implement-multiuser-canvas
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-acc5e2b7
  commit: a22aacffc8f688344e01e997f5abbd2c87594461
  session: null
  claimed_at: 2026-09-16T15:24:27Z
  expires_at: null
archive: null
created_at: 2026-09-16T15:24:16Z
updated_at: 2026-09-16T15:33:03Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

A served canvas shows no sign of who is reading it. There is no name anywhere, no way to tell which groups produced the access you have, and no way to sign out: `GET /auth/logout` exists and works, but nothing links to it, so ending a session means knowing the path or erasing cookies.

That last part is how this was found. Somebody added themselves to a group, cleared cookies to force a fresh login, and had no way to check what the new token actually carried.

A person should be able to answer three questions from the canvas itself: who am I here, why can I see what I can see, and how do I stop being signed in.

### What it shows

A button in the toolbar, present only when the canvas authenticates at all, opening a dialog with the display name and email the provider sent, every group in the token, which of those groups actually granted something, and a sign-out control.

Showing the groups that granted separately from the groups that arrived is the point rather than a detail. A group that is in the token and grants nothing looks identical to a group the provider never sent, and telling those apart is most of diagnosing a grant that did not work.

### Why it is worth doing now

It is also the only way anybody can see the `email` and `name` claims. The first acceptance criterion of `TKT-01M2MEBNKV23GT9ATQ4PGZQSMB` is unticked precisely because nothing in the canvas displays them, so a real login could not demonstrate them. This closes that.

Nothing here is a new permission surface. The endpoint answers about the caller and only the caller, and a group that granted nothing on a store the caller cannot see is not named.

## Acceptance criteria

- [x] A signed-in person can see their name and email as the provider sent them
- [x] Every group in the token is listed
- [x] The groups that actually granted something are distinguishable from those that did not
- [x] A sign-out control ends the session and returns to a fresh login
- [x] The control is absent on a desk canvas, which has no session
- [x] The endpoint answers about the caller only, and names no store the caller cannot read
- [x] The dialog shows the actor this person writes as on the current store, and whether it is chosen or merely suggested
- [ ] A person can change their actor from the dialog, and the change sticks
- [x] actor_taken and actor_not_declared are shown as readable refusals rather than swallowed

## Notes

**agent:claude/t3code** at 2026-09-16T15:26:18Z

The dialog is also where a person's own settings belong, and there is already exactly one: the actor id their writes to this store are stamped with.

`TKT-01M2MECN07` built the whole mechanism — `GET` and `PUT /api/stores/{store}/actor`, a suggestion derived from the provider's claims, first-claim-holds binding, and an optional per-store allowlist — and gave it no interface at all. A person can only reach it with curl. That is the same shape of gap as the missing logout: the capability exists and nothing links to it.

Putting it here rather than in a separate settings screen is deliberate. The actor is not a preference about the canvas, it is a statement about who you are when you write, so it belongs beside the name the provider gave you and the groups that let you in. A person reading "you are Drew, these two groups let you in, your writes are stamped human:drew" has been told one coherent thing.

The actor is per store, so the dialog shows it for the store being looked at and says which store that is. The canvas being read-only does not change this: nothing in the actor route refuses a read-only canvas, because binding an id is a claim about identity rather than a write to a ticket, and `TKT-01M2MECN07` deliberately built the record before writes were switched on so that it would not start with a hole in it.

Two refusals the dialog has to show rather than swallow: an id already bound to somebody else on this store comes back `actor_taken`, and on a store that enforces its declared actors an undeclared id comes back `actor_not_declared`.

**agent:claude/t3code** at 2026-09-16T15:33:03Z

Criterion 8 — that a changed actor sticks — is left unticked deliberately.

Every layer is tested. The dialog raises the change (`session-dialog.test.tsx`), the API binds it and refuses a taken id (`internal/api/actor_test.go`), and the record survives a restart (`internal/actors/actors_test.go`). What nobody has done is type a new actor into a browser against the running canvas and reload to see it come back, and that round trip is the whole of what the criterion asks. It needs a session, which means it needs the person whose session it is.

Tick it when somebody has done that.
