---
schema: 3
id: TKT-01M2KEZ1V4GHVWD84CD6NDQVM9
title: Fix the Windows test lane the multi-store work broke
type: task
status: in-progress
status_reason: null
priority: high
due_on: null
labels: []
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references:
  - ref: file:internal/config/config.go
    path: null
  - ref: file:internal/config/config_test.go
    path: null
  - ref: file:internal/state/state_test.go
    path: null
  - ref: file:internal/discover/exclude_test.go
    path: null
  - ref: file:internal/api/merge_test.go
    path: null
claim:
  actor: agent:t3code/d30689a3
  branch: t3code/orient-upstream-review-tickets
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-d30689a3
  commit: 8b0ad27e60ca43edff0531cf21285714e997edda
  session: null
  claimed_at: 2026-09-15T21:18:37Z
  expires_at: null
archive: null
created_at: 2026-09-15T21:18:30Z
updated_at: 2026-09-15T21:24:40Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

The mirror-ci Windows job failed on run 35024247866 at commit e8c0cc3, with 15
failures across `internal/api`, `internal/config`, `internal/discover`, and
`internal/state`. The public release workflow declares `needs: windows`, so no
GitHub release can be published while this is red.

Windows last passed on 2026-09-12 at 8529287, the v0.2.0 commit. The multi-store
work landed after that and the mirror was never pushed again, so the only lane
that runs Windows did not run for four days. The break is not new; the report of
it is.

Most of the failures are the tests rather than the product. They hardcode POSIX
absolute paths and then compare against values that `path/filepath` produced, so
`Load(file, "shared=/from/env", nil, "/base")` yields `\base\from\env` on
Windows: `filepath.IsAbs("/from/env")` is false there, so the path is treated as
relative and joined against the base. `TestDirFollowsXDG` sets
`XDG_STATE_HOME=/somewhere/state` and fails the same `filepath.IsAbs` check in
`state.Dir`. `TestWritingLeavesNoPartialFile` asserts mode 0600, which Windows
reports as `-rw-rw-rw-` because it has no Unix permission bits.
`TestHashedIDIsAlwaysAValidName` generates a directory named `....`, which
Windows refuses to create.

One failure is a real defect. `resolve` in `internal/config/config.go` expands a
leading tilde only when the next byte is `filepath.Separator`:

    if path == "~" || strings.HasPrefix(path, "~"+string(filepath.Separator))

On Windows that separator is a backslash, so `~/notes`, the form a person writes
in a configuration file and the only form that is portable between machines, is
not expanded. It falls through to the relative branch and is joined against the
base, producing `\base\~\notes`.

That defect has a consequence beyond one wrong path, which is why
`TestMergeJoinsATildePathWithADiscoveredOne` reports two stores where it wants
one. `discover.Key` deduplicates a configured store against a discovered one by
resolved absolute path. An unexpanded tilde path never resolves to the directory
discovery walked, so the two are not recognized as the same store and a Windows
user gets the same tickets twice under two ids.

## Acceptance criteria

- [x] A leading tilde followed by a forward slash expands on every platform, and a test covers the forward-slash form specifically.
- [x] A configured tilde path and the same directory found by discovery merge into one store on Windows.
- [x] Tests that need an absolute path build one for the platform they run on instead of hardcoding a POSIX root.
- [x] The permission assertion states what it checks on a platform without Unix mode bits rather than failing there.
- [ ] go test ./... passes on the GitHub Windows runner, evidenced by a green mirror-ci run and its id.

## Implementation plan

One product change and four test files, separated so the product change is
visible on its own.

`resolve` in `internal/config/config.go` gains `afterTilde`, which accepts a
forward slash after the tilde on every platform and the native separator as
well where that differs. `~/notes` is the only spelling that travels between
machines, so it is the one that must work everywhere. This also removes the
duplicate-store symptom, because an expanded path resolves to the directory
discovery walked and `discover.Key` then recognizes the two as one store.

`internal/testpath` is new and holds two helpers rather than four copies of
each. `Abs` turns a slash path into one that is absolute here, taking the
volume from the working directory so a runner that is not on C: still works.
`HomeEnv` names the variable `os.UserHomeDir` reads, which is `USERPROFILE` on
Windows, so a test that points home at a temporary directory actually moves it.

The test changes are then mechanical. Absolute literals route through
`testpath.Abs`. `TestPrecedenceByName` builds its fixture with absolute paths so
the file-alone case asserts the file's value rather than a path resolved against
a temporary directory. `render` in the scan tests applies `filepath.ToSlash`, so
one expected block serves both platforms. The mode assertion in
`TestWritingLeavesNoPartialFile` skips on Windows with the reason stated: there
are no Unix permission bits there, and the file holds favorites rather than
anything secret. `TestHashedIDIsAlwaysAValidName` stops creating directories,
because the property is about deriving a name and `discover.Key` falls back to
the cleaned path, which also lets the table keep the `....` case Windows will
not create.

Verification is the honest limit here. Everything passes locally on Linux and
`GOOS=windows go vet ./...` type-checks the tests, but neither runs them on
Windows. The criterion asks for a green mirror-ci run and its id, and that is
the only thing that will close it.
