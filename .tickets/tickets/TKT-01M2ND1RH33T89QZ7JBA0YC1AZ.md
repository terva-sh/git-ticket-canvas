---
schema: 3
id: TKT-01M2ND1RH33T89QZ7JBA0YC1AZ
title: Move the layout schema into git-ticket
type: task
status: in-progress
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - layout
assignees: []
milestone: null
parent: TKT-01M2ND0S8N5Y8V0HQFRCBKMXE3
origin: null
dependencies: []
blocks_on: none
references:
  - ref: design:board-organization
    path: docs/board-organization-design-v1.md
claim:
  actor: agent:claude/t3code-a6d0ff31
  branch: t3code/review-open-queued-work
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-a6d0ff31
  commit: 0021a8d8e6d4453c65544a04832053d4fba87e3c
  session: null
  claimed_at: 2026-09-19T08:34:33Z
  expires_at: null
archive: null
created_at: 2026-09-16T15:23:31Z
updated_at: 2026-09-19T08:36:40Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
extensions: {}
---

## Description

`internal/layout` defines the format of `.tickets/canvas/*.yml`, a file that lives inside a directory belonging to another tool. `git ticket check` validates every other file under `.tickets/` and cannot see this one, so a layout with a bad `ruleOrder` is caught when somebody opens a browser.

The store's format is the store tool's to define. Move the package to `git-ticket` and have the canvas import it.

This is also what makes `git ticket canvas` subcommands possible at all: `git-ticket-canvas` already imports `github.com/terva-sh/git-ticket/ticket`, so the dependency cannot run the other way.

No behaviour changes here. It is breaking and cross-repo, and it is on its own so that a bisect can find it.

### Rejected

`git-ticket-canvas layout ...` subcommands, keeping the schema where it is. Works, needs no move, one repository. Rejected because it puts the validator in the tool least likely to be installed: an agent working a ticket store has `git ticket` and may not have the canvas. A format whose only validator ships with the optional viewer is checked after it is committed.

## Acceptance criteria

- [ ] internal/layout is an importable package in git-ticket and the canvas imports it
- [ ] The canvas produces byte-identical layout files before and after the move
- [ ] A layout written by the old canvas opens in the new one, and the reverse
- [ ] No command or endpoint changes behaviour

## Implementation plan

Source-inspected on 2026-09-19 in both checkouts: this worktree at 0021a8d and `/home/sothr/workspace/git.local.sothr.com/terva-sh/git-ticket` at 61a13cd on main, clean, equal to origin. Stop at this plan for review; the move is cross-repo and breaking.

### What moves

The whole of `internal/layout`: `layout.go`, `frames.go`, `pens.go`, their three test files, 1,576 lines. It is self-contained. Its only import from this module's neighbours is `ticket.ValidID` (`ticket/id.go:160` in git-ticket), and its only third-party import is `gopkg.in/yaml.v3`, which git-ticket already requires. The `Store` type carries its own mutex and does its own atomic file writes; it moves as is, because folding it into the ticket store's lock would be a behaviour change and this ticket forbids one.

Twelve Go files in `internal/api` import it (`server.go`, `snapshot.go`, `frames.go`, `capture.go`, and eight tests). Nothing outside Go references the path except `README.md`, which names it twice, and historical docs, which stay as written.

### Where it lands

`github.com/terva-sh/git-ticket/layout`, a top-level package beside `ticket`. The criterion says "`internal/layout` is an importable package in git-ticket", and a Go `internal/` directory cannot be imported across modules, so the name that satisfies the intent is the package minus the `internal/` prefix. Keeping the identifier `layout` means every call site changes only its import path. `canvas` was considered as the name and rejected: `layout` is what the file is, and `canvas` is the product that reads it.

git-ticket's `AGENTS.md` names `docs/plan.md` as the design of record, and the plan has no section on the layout file. The move adds a short entry under section 12 (Interfaces) saying that `.tickets/canvas/*.yml` is defined here, the canvas consumes it, and `check` does not validate it yet, with a pointer to TKT-01M2ND1RMSJ1KAEZM7HZX5DEHR in this store for when it will. The package doc comment names the commit it was copied from, since `git mv` cannot carry history across repositories.

### Sequence

1. In git-ticket: file a ticket in its store (labels `area/format` and `area/integration` are permitted there), copy the six files into `layout/`, change the one import, run `just ci` (lint, race tests, strict store check), add the plan.md entry, commit, open a PR on Forgejo, merge.
2. Tag git-ticket `v0.20.0` and push the tag to GitHub with `git push github main --follow-tags`, which is what its release workflow watches (`.github/workflows/release.yml:10`). A new exported package is a minor bump. The canvas fetches modules from GitHub with `GOFLAGS=""` and `GOWORK=off` (`scripts/verify-go-only.py:26`), so a `replace` directive can be used locally to build against the working tree but must never be committed.
3. In this repository: bump `go.mod` to `v0.20.0`, delete `internal/layout`, rewrite the twelve import paths, update the two README lines, run `just check` and `just parity-check`, open a PR, request the Terva review.

### Verification of the criteria

- Importable: step 3 compiles with no `replace`.
- Byte-identical files: before step 3, render every board reachable here with the old binary and after it with the new one, and diff. The boards are `.tickets/canvas/default.yml` and the fixture at `docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/.tickets/canvas/default.yml`. A small Go program under `/tmp` that calls `Load` then `Save` on a copy, run once per side, is enough; the moved tests also carry the round-trip and one-line-diff properties unchanged.
- Old opens in new and the reverse: the format is unchanged by construction, and the same two boards, plus a board the new binary writes, are opened by both binaries in the same run.
- No command or endpoint changes: `just parity-check` runs the embedded browser suite and the Go suite against the moved package; `just drift-check` confirms the two commands still differ only where declared.

### Alternatives considered

Keeping the schema here and adding `git-ticket-canvas layout …` subcommands: rejected in docs/board-organization-design-v1.md, because it puts the validator in the tool least likely to be installed. Copying the package into git-ticket and keeping this one too: rejected, two definitions of one file is the defect the move removes. Moving only the types and leaving `Store` here: rejected for this ticket because `check` and the CLI will need the reader and writer, and splitting now means moving twice.

### Open choices for the person reviewing

The package name (`layout`), the version (`v0.20.0`), and whether the plan.md entry is wanted or the package doc comment is record enough. Each is chosen above with its reason and any of them can be changed before step 1.
