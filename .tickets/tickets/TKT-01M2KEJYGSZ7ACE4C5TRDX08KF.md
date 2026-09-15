---
schema: 3
id: TKT-01M2KEJYGSZ7ACE4C5TRDX08KF
title: Match the CI git-ticket pin to the version go.mod requires
type: task
status: in-progress
status_reason: null
priority: normal
due_on: null
labels: []
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references:
  - ref: file:.forgejo/workflows/ci.yml
    path: null
  - ref: file:.forgejo/workflows/tag-verify.yml
    path: null
  - ref: file:.github/workflows/release.yml
    path: null
  - ref: file:go.mod
    path: null
  - ref: file:release_config_test.go
    path: null
claim:
  actor: agent:t3code/d30689a3
  branch: t3code/orient-upstream-review-tickets
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-d30689a3
  commit: 24033a9b2b64e9387055f6c343ddb7d0a9718595
  session: null
  claimed_at: 2026-09-15T22:05:11Z
  expires_at: null
archive: null
created_at: 2026-09-15T21:11:54Z
updated_at: 2026-09-15T22:07:23Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

`go.mod` requires `github.com/terva-sh/git-ticket v0.18.1` since commit c10dbed,
but three workflow files still install the CLI at v0.14.3 for `just
tickets-check`:

- `.forgejo/workflows/ci.yml` line 24
- `.forgejo/workflows/tag-verify.yml` line 22
- `.github/workflows/release.yml` line 44

This is not currently breaking anything. v0.14.3 was installed to a temporary
GOBIN on 2026-09-16 and run as `git-ticket check --fix --dry-run --strict`
against this store; it reported "No problems found" and exited 0. Both versions
enforce store schema 3, which is why the old CLI still reads a store the new
library writes.

The risk is that the gate is weaker than the library. `check --strict` validates
against the rules the binary knows, so any rule added between v0.14.3 and
v0.18.1 is a rule CI does not enforce, and a store defect that the local
developer's v0.17.1 CLI reports would pass on a hosted runner. The versions
should match the module requirement so the gate and the code agree.

## Acceptance criteria

- [ ] The three workflow files install the same git-ticket version go.mod requires.
- [ ] A check fails if the pinned CLI version and the go.mod requirement drift apart again.

## Implementation plan

Three one-line pin changes and one new test, plus proof that the new pin passes
before CI is asked to run it.

`.forgejo/workflows/ci.yml`, `.forgejo/workflows/tag-verify.yml`, and
`.github/workflows/release.yml` move from v0.14.3 to v0.18.1, the version go.mod
requires. Verified before changing anything: v0.18.1 was installed to a
temporary GOBIN and the exact command CI runs, `git ticket check --fix
--dry-run --strict`, reported "No problems found" and exited 0 against this
store. Both versions enforce ticket schema 3, which is why v0.14.3 kept working
and why the drift stayed invisible.

`TestWorkflowsInstallTheGitTicketGoModRequires` reads the required version out
of go.mod and every `cmd/git-ticket@` pin out of every workflow under
`.github/` and `.forgejo/`, then compares them. It carries no version literal,
so it follows the next upgrade without being edited; the two versions that
appear in the file are in a comment explaining what went wrong. Zero pins found
is its own failure rather than a vacuous pass, because a workflow that installs
no CLI cannot run tickets-check at all.

Falsified rather than trusted. Reverting one workflow to v0.14.3 fails it naming
that file and both versions. Deleting the install step from all three fails it
with the no-CLI message.

The one thing local checks cannot settle is whether v0.18.1 installs and runs on
the hosted runners, where the Alpine container and the Ubuntu image differ from
this machine. The criterion asking for that stays unticked until a green run.

## Notes

**agent:t3code/d30689a3** at 2026-09-15T22:07:23Z

A third version is in play and this ticket does not change it. The CLI on this
machine's PATH is v0.17.1, at /home/sothr/.local/bin/git-ticket, while go.mod
and now CI are both on v0.18.1. So `just tickets-check` locally and the same
recipe on a runner are again running different binaries, in the other direction
this time and by a smaller gap.

That is deliberately left alone. A developer's own tooling is their
environment, not something a repository change should reach into. Worth knowing
if a store check ever passes locally and fails on CI. v0.18.1 reports
`self-update` among its kinds, so upgrading is likely a single command.
