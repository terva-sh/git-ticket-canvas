---
schema: 3
id: TKT-01M2NZ35Y8EED58263DF13D6ZD
title: Keep the desk and served canvases from drifting apart
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - ui
  - multiuser
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T20:38:52Z
updated_at: 2026-09-16T20:44:24Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

The canvas ships as two commands over one frontend. `git-ticket-canvas` is the
desk one: loopback, writable, no sign-on, one person and every store.
`git-ticket-canvas-server` requires OIDC and is read-only by default. The
browser bundle is the same bundle; what differs is which props arrive filled.
`internal/cli/signon.go` returning a pass-through and four nils for the desk
kind is the whole of it on the Go side, and a nil `Access` in the registry
means one person, every store.

That works today because both were built in the same week. It will not keep
working: a change lands against whichever canvas the person making it happens
to be running, and the other one gets it by luck. We are about to dogfood this,
which means the desk canvas is the one that gets used daily and the served one
is the one that quietly falls behind.

Nothing currently fails when they diverge. That is the gap. Wanted is tooling
that makes a difference between the two either declared or a test failure, so
that adding a control to one and not the other is a decision somebody wrote
down rather than an accident nobody saw.

Sketch, not a design:

- A manifest of deliberate differences, each with a reason. The store picker
  and the account button belong to a served canvas; that is intended and should
  be stated once rather than inferred from every test that works around it.
- A browser test that renders `App` in both shapes and diffs the chrome against
  that manifest. An identified control appearing in one and not the other is a
  failure unless the manifest names it.
- A Go test over the route table, so a handler reachable in one kind and not
  the other is likewise declared. `withStore` and the read-only default are
  already the interesting seam.

Note the name: `just parity-check` is taken, and means the release gate. This
needs its own verb.

## Acceptance criteria

- [ ] A manifest names every deliberate difference between the desk and served chrome, each with the reason it is one.
- [ ] A test renders App in both shapes and fails when an identified control appears in one and not the other unless the manifest names it.
- [ ] A Go test asserts which routes each kind serves, and fails when a handler's reachability changes without the table changing.
- [ ] The check runs in CI on every change, not only at release, and has a name that does not collide with the parity-check release gate.
- [ ] Adding a control to one canvas only is possible, and the failure message says to write down why rather than just going red.
