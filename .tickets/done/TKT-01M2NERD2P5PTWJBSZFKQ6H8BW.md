---
schema: 3
id: TKT-01M2NERD2P5PTWJBSZFKQ6H8BW
title: Resolve the state directory the way terva does
type: chore
status: done
status_reason: null
priority: normal
due_on: null
labels:
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
created_at: 2026-09-16T15:53:21Z
updated_at: 2026-09-16T15:54:51Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

`state.Dir` resolves `$XDG_STATE_HOME/git-ticket-canvas`, falling back to `~/.local/state/git-ticket-canvas`, on every platform. That is right on Linux and wrong on the two others we ship binaries for: goreleaser builds darwin and windows, so a Windows canvas writes `%USERPROFILE%\.local\state\git-ticket-canvas`, which is not where anything else on that machine looks.

terva resolves the same question per platform in `packages/envcompat/envcompat.go`, and the house pattern is that resolver: macOS `~/Library/Application Support/<name>`, Windows `%LOCALAPPDATA%\<name>`, then `$XDG_STATE_HOME/<name>`, then `~/.local/state/<name>`. Follow it.

Three files live in this directory and all three move together: the favorites and last-store state, `actors.json`, and the people record from `TKT-01M2NEPRPTADQ3TGE5C8PAPMJC`. `--state` continues to move all of them.

Nothing changes on Linux, which is where the only deployment is.

### Not a silent move

Where the conventional directory does not exist and the legacy `~/.local/state/git-ticket-canvas` does, the legacy one is used and the canvas says so at startup. Moving somebody's actor bindings between directories without being asked is the kind of helpfulness that loses a record, and `actors.json` is the one file here that cannot be reconstructed.

The resolver takes the platform as an argument so that all four branches are testable on one machine, rather than three of them being untested everywhere.

## Acceptance criteria

- [x] macOS resolves under Library/Application Support, Windows under LOCALAPPDATA
- [x] Linux resolves XDG_STATE_HOME when absolute, and ~/.local/state otherwise
- [x] Every branch is tested on one machine, the platform being an argument rather than runtime.GOOS
- [x] A legacy ~/.local/state directory is used where the conventional one is absent, and said so at startup
- [x] Nothing is moved on disk without being asked

## Summary

`state.Dir` now resolves the way terva's `packages/envcompat/envcompat.go` does: macOS `~/Library/Application Support/git-ticket-canvas`, Windows `%LOCALAPPDATA%\git-ticket-canvas`, then `$XDG_STATE_HOME/git-ticket-canvas`, then `~/.local/state/git-ticket-canvas`.

The resolution is `dirFor(goos, xdg, localAppData, home)`, a pure function taking the platform, so all four branches are tested on one machine. Reading `runtime.GOOS` inside would have left three of them untested everywhere, which for a path is how a release ships writing somewhere nobody looks.

Nothing changes on Linux, which is where the only deployment is. `XDG_STATE_HOME` is still ignored when relative, as the specification says, and still ignored entirely on macOS.

`state.InUse` adds the legacy half: where the conventional directory does not exist and `~/.local/state/git-ticket-canvas` does, the old one is used and the canvas prints a note naming both. Nothing is moved. `actors.json` is the only file here that cannot be reconstructed, and relocating somebody's record of who wrote what unasked is how a record is lost.

The command resolves it once and the note is printed once, rather than each helper resolving separately.
