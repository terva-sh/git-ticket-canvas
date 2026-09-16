---
schema: 3
id: TKT-01M2NW7N2CGN6ZXQHVQ6ZHSYVK
title: Resolve the state directory without asking the host which platform it is
type: bug
status: in-progress
status_reason: null
priority: high
due_on: null
labels:
  - infrastructure
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim:
  actor: agent:claude/t3code
  branch: t3code/state-dir-portability
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-acc5e2b7
  commit: 355ba5c78ef5ea8bdf966f2346e8bb04bb56cb6c
  session: null
  claimed_at: 2026-09-16T19:48:59Z
  expires_at: null
archive: null
created_at: 2026-09-16T19:48:52Z
updated_at: 2026-09-16T19:52:28Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

The Windows lane on the github mirror fails `go test ./...` in `internal/state`, which stops the v0.4.0 release: the publishing job declares `needs: windows`.

`dirFor` from TKT-01M2NERD2P5PTWJBSZFKQ6H8BW takes the platform as an argument. Its own comment says why: "so that all four branches are testable on one machine. The alternative is three of them being untested everywhere, which for a path is how a release ships writing to somewhere nobody looks."

It does not deliver that. The body uses `filepath.Join` and `filepath.IsAbs`, which read the *host's* rules rather than the argument's. So `dirFor("linux", "/xdg", ...)` on Windows neither recognises `/xdg` as absolute nor joins with `/`, and the function is only correct when the argument happens to match the machine running it. Every branch passed on Linux and three of them were never really tested at all — the precise failure the comment claims to prevent.

```
dirFor("linux", "/xdg", "", "/home/person") = "\home\person\.local\state\git-ticket-canvas", want "/xdg/git-ticket-canvas"
```

`TestDirFollowsXDG` is a second, smaller problem. It calls `Dir()` and asserts XDG semantics, which are not the rule on Windows or macOS. On the Windows runner `Dir()` correctly answers `LOCALAPPDATA` and the test calls that a defect.

Production behaviour on any given machine is unaffected: where the argument matches the host, the old code and the new agree. What was broken is the ability to check the other platforms, which is the whole reason the argument exists.

## Acceptance criteria

- [x] dirFor joins and tests absoluteness by the platform it was given, not the one it is running on
- [x] The platform table asserts literal paths rather than paths built by the host's filepath
- [x] A test about XDG does not run where XDG is not the rule, and says so
- [ ] go test ./... passes on the Windows lane
- [x] Nothing about where any platform resolves to has changed

## Notes

**agent:claude/t3code** at 2026-09-16T19:52:28Z

Criterion 4 stays unticked until the lane itself is read. Nothing here can run a Windows binary: the check available locally is that the table is now host-independent by construction, so passing on Linux means the same arithmetic passes anywhere. `GOOS=windows go vet ./...` is clean, which catches a compile break but says nothing about an assertion.

Two cases went in that the original table did not have, because they are the ones the old code would have got wrong in the other direction: a drive-relative `\state` on Windows is not absolute and must fall back, and a `C:\state` carried to Linux is not absolute either and must not silently become a relative directory.
