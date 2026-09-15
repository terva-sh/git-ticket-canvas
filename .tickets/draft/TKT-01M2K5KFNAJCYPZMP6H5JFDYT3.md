---
schema: 3
id: TKT-01M2K5KFNAJCYPZMP6H5JFDYT3
title: Update an installed canvas in place
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels: []
assignees: []
milestone: null
parent: null
origin: null
dependencies:
  - TKT-01M2K5JVG49DH23HTS55ACET5J
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-15T18:34:54Z
updated_at: 2026-09-15T18:34:54Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

### The problem

An installed canvas has no way to move to a newer release. `git-ticket` solves
this with `git ticket self-update`, against the same artifacts the canvas
already publishes, so the work is mostly a port. What is not a port is the
shape it takes here and one thing the canvas is that the CLI is not.

### A flag, not a subcommand

`git-ticket` is a git subcommand with many commands, so `self-update` is one
more. The canvas has no subcommands at all: `main.go` parses flags and serves.
`--version` and `--scan` already set the pattern of a flag that does a thing
and exits.

Follow that grain. `--self-update`, with `--check` and `--dry-run` as
modifiers, fits a binary whose only job is to serve. Introducing a subcommand
parser to hold one command is a structural change that buys nothing, and it
would make `git-ticket-canvas --root x self-update` a shape somebody has to
think about.

### The thing the CLI does not have to handle

The canvas is a long-running server. `git ticket self-update` replaces a binary
that is not running; this one may replace the binary of a process that is
serving right now.

On POSIX the atomic replace is safe, because the running process holds its
inode and keeps running the old code. That is also the trap: the update
succeeds, the server keeps serving the old version, and nothing says so. The
command must state plainly that a restart is required, and `--version` on the
running process must keep reporting what that process actually is rather than
what is now on disk.

Do not restart the server. The canvas does not own its supervisor and a
process that kills itself to come back is a surprise.

### Carry over from git-ticket, for its reasons

- `--check` resolves the latest release, writes nothing, and grades the gap so
  the exit status names the highest version component that moved. That is what
  makes it usable from a script.
- `--dry-run` names the asset and the target it would touch, and still writes
  nothing.
- The sha256 is verified before anything on disk moves.
- The replace is atomic.
- A build that reports `devel` refuses, because there is nothing to compare.
- The release source is the public mirror, and it must be the same source and
  the same meaning of "latest" that `install.sh` uses. Two answers to what
  stable means is worse than one wrong answer.

### Reuse what the release already proves

`--version --json` already reports version, commit, and modified, and
`.github/workflows/release.yml` asserts on all three. `--check` should compare
against the same field rather than parsing anything new.

## Acceptance criteria

- [ ] --self-update replaces the running binary with the latest release, atomically
- [ ] --check writes nothing and grades the gap through its exit status
- [ ] --dry-run names the asset and the target and writes nothing
- [ ] The sha256 is verified before anything on disk moves, and a mismatch refuses
- [ ] A devel build refuses rather than guessing
- [ ] The command says a restart is needed, and a running server keeps reporting its own version
- [ ] The update does not restart the server
- [ ] It resolves latest from the same source and by the same rule as install.sh
- [ ] Exercised against a real release on this machine, including the refusal path
