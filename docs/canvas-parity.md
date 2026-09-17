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

## Declaring one

`docs/canvas-parity.json` names every deliberate difference and why it is one.
Two tests read it:

- `web/src/ui/canvas-parity.test.tsx` mounts the real `App` in both shapes and
  compares the identified controls.
- `internal/api/parity_test.go` probes the route table on a registry built each
  way and compares what answers.

Run both with `just drift-check`. It is named apart from `parity-check`, which
is the release gate and means something else.

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

**Differences that are not between the commands.** The store picker is the one
that catches people, including the ticket that asked for this tooling: it looks
like a served-canvas control and is not. It appears whenever `GET /api/stores`
returns anything, so a desk canvas over several repositories shows it too. The
chrome test holds the store count equal across both shapes so that a difference
in configuration is not reported as a difference between the commands.

The read-only badge is the softer version of the same thing. It follows the
board's `readOnly`, not the command, and either canvas shows it when the flag is
set. It is declared as served-only because that is the shape the two commands
ship in and therefore the pair a person actually compares, and the manifest
entry says so rather than implying the desk canvas cannot show it.

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
