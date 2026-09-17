---
schema: 3
id: TKT-01M2NZ35Y8EED58263DF13D6ZD
title: Keep the desk and served canvases from drifting apart
type: task
status: done
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
updated_at: 2026-09-17T04:15:42Z
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

- [x] A manifest names every deliberate difference between the desk and served chrome, each with the reason it is one.
- [x] A test renders App in both shapes and fails when an identified control appears in one and not the other unless the manifest names it.
- [x] A Go test asserts which routes each kind serves, and fails when a handler's reachability changes without the table changing.
- [x] The check runs in CI on every change, not only at release, and has a name that does not collide with the parity-check release gate.
- [x] Adding a control to one canvas only is possible, and the failure message says to write down why rather than just going red.

## Summary

`just drift-check` now fails when the two canvases differ in a way nobody wrote
down. `docs/canvas-parity.json` is where the writing down happens, read by a
chrome test that mounts the real `App` in both shapes and a Go test that probes
the route table on a registry built each way.

The ticket's own sketch was wrong about the store picker, and finding that out
was most of the value. It listed the picker alongside the account button as
belonging to a served canvas. It does not: it renders whenever `GET /api/stores`
returns anything, so a desk canvas over several repositories shows it too. Had
that gone into the manifest as written, the tooling's first act would have been
to certify a false statement about the product and to hide a real difference in
store count behind it. The chrome test now holds the store count equal across
both shapes so configuration cannot masquerade as a difference between commands.

So the manifest was written from measurement rather than from the sketch. Run
against an empty manifest, the chrome difference is exactly two entries and the
route difference exactly five, and every one of the five is an `Access`-gated
handler, which matches what `registry.go` does.

The read-only badge is the one judgement call. It follows the board's `readOnly`
rather than the command, so it is a difference in default and not in capability.
It is declared served-only because that is the shape the commands ship in and so
the pair a person compares, and the entry says exactly that rather than implying
a desk canvas cannot show it.

Every guard was falsified rather than trusted. Dropping a probe, adding a route
inside the `Access` branch, deleting a manifest route entry, adding a served-only
button, and leaving a manifest entry behind after removing its control each
produce the failure they are supposed to, naming the thing and asking for the
reason. The escape hatch was rehearsed end to end: control plus manifest entry
passes, either alone fails.

Two guards guard the guards. `probes` is hand-listed because Go's `ServeMux`
does not report its patterns, so a second test reads `registry.go` and fails
when a registered route is not covered -- without it the list would silently
stop covering things. And the chrome test asserts both shapes actually rendered
a toolbar before comparing, because two empty sets compare equal and would pass
having proved nothing.

`just parity-check` gained `drift-check` as a step, which the existing
`parity-recipe` tooling test caught and required updating; CI runs it as its own
named step before the gate so a drift reports as drift rather than as a failure
somewhere inside a twelve-step release check.

Limits are recorded in `docs/canvas-parity.md` rather than left to be
discovered: a control with no id is not covered, refusals count as reachable
because access is a separate question with its own tests, and the store-count
axis is deliberately held constant.
