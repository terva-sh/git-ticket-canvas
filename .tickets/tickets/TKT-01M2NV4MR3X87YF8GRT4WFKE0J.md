---
schema: 3
id: TKT-01M2NV4MR3X87YF8GRT4WFKE0J
title: Release v0.4.0
type: chore
status: in-progress
status_reason: null
priority: high
due_on: null
labels:
  - release
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim:
  actor: agent:claude/t3code
  branch: t3code/release-v0.4.0
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-acc5e2b7
  commit: be5d4077e07793ce243c9762d876652321aa31c4
  session: null
  claimed_at: 2026-09-16T19:29:53Z
  expires_at: null
archive: null
created_at: 2026-09-16T19:29:45Z
updated_at: 2026-09-16T19:30:47Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

The first release with a served canvas. `v0.3.2` is a desk tool; `v0.4.0` is that plus a second command that publishes a canvas at a hostname behind an identity provider, and a board laid out for the screen somebody is reading it on.

Twenty-nine commits since `v0.3.2`, eighteen tickets, across two pull requests (#1 and #2).

The minor rather than the patch because `git-ticket-canvas-server` is a new command, canvas state moved to a per-user key under a platform-conventional state directory, and the desk canvas gained controls that change what a board looks like. Nothing in the desk canvas's interface was removed or renamed, so it is not a major.

### The mirror

`docs/releasing.md` requires `origin` and `github` to carry identical commits and tags for a release, because `install.sh` reads `api.github.com`, the image lives on `ghcr.io`, and `go install` resolves through the public proxy. The mirror had been deliberately held at `5144a9b` while the multi-user work was in flight. That hold is lifted for this release, on the record, by the person who set it.

`github/main` is an ancestor of `origin/main`, so the mirror moves by fast-forward rather than by force.

The mirror is also missing the `v0.3.0` and `v0.3.1` tags. They are not being pushed as part of this: a `v*` tag push to `github` publishes a release, so backfilling them would publish two releases nobody asked for, months late. That is a separate decision.

## Acceptance criteria

- [x] The source state is clean, and every release-scope ticket is finished or explicitly deferred with evidence
- [x] just parity-check passes at the release commit
- [x] just release-check and just release-snapshot pass
- [x] just release-rehearse passes against a clean tagged clone
- [ ] origin main carries the release commit and its CI result was read, not assumed
- [ ] github main carries the same commit and the Windows lane passed
- [ ] An annotated v0.4.0 tag is on that exact commit on both forges
- [ ] github published five archives plus checksums.txt, verified by SHA-256 and by --version --json
- [ ] The real download installer works into a temporary prefix
- [ ] The published module resolves through the Go proxy for a clean Go-only install
- [ ] The GHCR image pulls anonymously and reports the right version

## Notes

**agent:claude/t3code** at 2026-09-16T19:30:47Z

Local checks at be5d407 plus the release ticket commit.

- `just parity-check` passed end to end, including the 72-test browser suite and the Go-only build at clean HEAD. It is what caught TKT-01M2NT8E0TN7PMMJM1NFY35DF3, which is in this release; `just check`, the ordinary loop, does not run the browser suite.
- `just release-check`: one configuration file validated, `release` disabled as it should be.
- `just release-snapshot`: five archives, both commands in each, checksums, licenses, provenance, the two unauthenticated-bind refusals, and the embedded HTTP assets. Snapshot names itself `0.3.3-next` and is not a release identity.
- `just release-rehearse`: the same five, built from a clean tagged throwaway clone at `0.0.0-rehearsal`. Tag, archives and clone removed; nothing published.

Ticket state: `TKT-01M2ND1RNXB8941M21MRZRJDN2` is closed with its fifth criterion unticked and split into `TKT-01M2NV3WMAD902MKM5REAT4FTA`, rather than carried half-done into a release. `TKT-01M2KHX3QNR779RE8M9MM36V9V` is in-progress and is not mine: it is claimed by `agent:t3code/d30689a3` on another branch, and it is not in this release's scope. Left alone.
