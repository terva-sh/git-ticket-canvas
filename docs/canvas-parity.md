# Keeping the two canvases from drifting

The canvas ships as two commands over one browser bundle.

`git-ticket-canvas` is the desk one: loopback, writable, no sign-on, one person
and every store. `git-ticket-canvas-server` requires OIDC and is read-only by
default. The bundle is the same bundle; what differs is which props arrive
filled. On the Go side the whole of it is `internal/cli/signon.go` returning a
pass-through and four nils for the desk kind, and a nil `Access` in the registry
meaning one person who may see everything.

That worked while both were built in the same week. It does not keep working on
its own. A change lands against whichever canvas the person making it happens to
be running, and the other one gets it by luck — and as this tool is dogfooded,
the desk canvas is the one used daily and the served one is the one that quietly
falls behind.

So a difference between them is either declared or a test failure.

## Two axes, measured apart

Two independent things can produce a difference, and conflating them is how the
manifest first got written.

**Sign-on** is inherent. `internal/cli/signon.go` returns a pass-through and
four nils for the desk kind, so there is no session and no `Access`. Neither
command can be run as the other.

**Read-only** is a flag both commands have, differing only in default:
`-read-only` is true by default on the served canvas and false on the desk one.
Pointing a desk canvas at a store you do not intend to modify is a real reason
to set it, which is exactly why it cannot be folded into sign-on. The first
version of this manifest did fold it in, and it made the read-only badge read as
though a desk canvas could not show it — and, worse, would have absorbed any
genuine read-only difference into "that is just the served canvas".

So each axis is measured with the other held constant, over the whole 2x2 grid.
An axis whose differences depend on the other is an *interaction*, and that is
its own failure: neither measurement would be the answer, so the test says so
rather than picking one.

Routes are all on the sign-on axis, because read-only refuses at the handler
with a 403 and never changes what is registered. That is asserted rather than
assumed — `TestReadOnlyChangesNoRouteReachability` probes both settings.

## Declaring one

`docs/canvas-parity.json` names every deliberate difference, which axis it is
on, and why it is one. Two tests read it:

- `web/src/ui/canvas-parity.test.tsx` mounts the real `App` in both shapes and
  compares the identified controls.
- `internal/api/parity_test.go` probes the route table on a registry built each
  way and compares what answers.

Run both with `just drift-check`. It is named apart from `parity-check`, which
is the release gate and means something else.

It is deliberately not a step inside `parity-check`. Both files are already
covered there by `web-test` and `test`, which run every vitest and every Go
test, so a step would be duplicated work — and `web-test` runs first, so a drift
would fail there and the name would never appear anyway. CI runs `drift-check`
as its own step before the gate, which is where the name earns its keep: a
difference between the two canvases reports as one, early, rather than as a
failure somewhere inside a twelve-step release check. That step installs the
frontend dependencies for itself, and the gate installs them again.

Adding a control or a route to one canvas only is allowed. What is not allowed
is doing it silently: the failure names what appeared where and asks for the
reason, and the manifest is where the reason goes. A stale entry fails too, so
the file cannot fill up with differences that were resolved years ago.

## What it does not cover

Three things, stated because a guard that is trusted for more than it does is
worse than no guard.

**Controls without an id.** Giving one is how this codebase marks something
addressable, so the chrome test treats an id as the definition of an identified
control. Markup that differs without an id is invisible to it.

**The store count.** It is a third axis and is held constant at two everywhere.
The store picker is the one that catches people, including the ticket that asked
for this tooling: it looks like a served-canvas control and is not. It appears
whenever `GET /api/stores` returns anything, so a desk canvas over several
repositories shows it too. Adding it as a real axis is now a matter of extending
the grid rather than reworking anything.

**Refusals.** A route that exists and answers 401 or 403 counts as reachable
here. Who may use it is an access question, and `internal/api/access_test.go`
is where that is answered.

## Adding a route

`probes` in `internal/api/parity_test.go` is the coverage, listed by hand
because Go's `ServeMux` does not report its patterns. A hand-maintained list
stops covering things, so a second test reads `registry.go` and fails when a
registered route is missing from it. Add the route to `probes` and that test
goes quiet; if the route is deliberately one-sided, the manifest takes the
reason.
