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
updated_at: 2026-09-16T19:29:53Z
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

- [ ] The source state is clean, and every release-scope ticket is finished or explicitly deferred with evidence
- [ ] just parity-check passes at the release commit
- [ ] just release-check and just release-snapshot pass
- [ ] just release-rehearse passes against a clean tagged clone
- [ ] origin main carries the release commit and its CI result was read, not assumed
- [ ] github main carries the same commit and the Windows lane passed
- [ ] An annotated v0.4.0 tag is on that exact commit on both forges
- [ ] github published five archives plus checksums.txt, verified by SHA-256 and by --version --json
- [ ] The real download installer works into a temporary prefix
- [ ] The published module resolves through the Go proxy for a clean Go-only install
- [ ] The GHCR image pulls anonymously and reports the right version
