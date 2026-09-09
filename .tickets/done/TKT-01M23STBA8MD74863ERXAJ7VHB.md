---
schema: 3
id: TKT-01M23STBA8MD74863ERXAJ7VHB
title: Match git-ticket local installation behavior
type: task
status: done
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
  - ref: code:installer
    path: scripts/install-local.sh
  - ref: workflow:install
    path: justfile
  - ref: test:installer
    path: tests/tooling/install.test.mjs
  - ref: guide:local-install
    path: docs/local-install.md
claim: null
archive: null
created_at: 2026-09-09T19:20:20Z
updated_at: 2026-09-09T19:25:27Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Align just install with ../git-ticket: explicit DIR or first writable ~/.local/bin and ~/bin, no sudo, atomic replacement, and PATH/shadowing warnings. Install locally at the user's request and verify git ticket-canvas discovery. Preserve raw Go-only installation and historical guides.

## Acceptance criteria

- [x] just install supports the sibling tooling's destination selection, atomic replacement, and PATH warnings with regression tests.
- [x] Install locally and verify the resolved executable and git ticket-canvas -h without modifying PATH or the git-ticket installation.
- [x] Document the successor install convention and pass tooling/build checks.

## Implementation plan

Keep the frontend prerequisite on just install, but replace go install with a shell installer accepting DIR positionally. Mirror sibling destination order, no-sudo policy, linked-worktree build handling, and PATH warnings. Build in temporary storage and rename a unique destination-local temporary executable atomically. Test default/fallback/explicit destinations, shadowing, replacement, and failure preservation with isolated HOME directories. Add a successor install guide, run checks, then install to the real default and verify shell/Git resolution without altering PATH.

## Notes

**agent:terva/mieli** at 2026-09-09T19:24:36Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-59 just install supports the sibling tooling's destination selection, atomic replacement, and PATH warnings with regression tests. — Added scripts/install-local.sh and just install DIR forwarding. Five installer tests passed for default/fallback/explicit paths, atomic replacement, Git discovery, warnings, and failed-build preservation. bash -n and just check passed.
- [x] task-60 Install locally and verify the resolved executable and git ticket-canvas -h without modifying PATH or the git-ticket installation. — just install installed /home/sothr/.local/bin/git-ticket-canvas. Unmodified PATH resolves that path; direct -h and git ticket-canvas -h both exited 0. git-ticket still resolves /home/sothr/go/bin/git-ticket; no PATH edits or other binary removals.
- [x] task-61 Document the successor install convention and pass tooling/build checks. — docs/local-install.md supersedes the prior just install convention without rewriting shipped guides. just check passed 71 frontend and 18 tooling tests, production build/typecheck, Go race/vet/format checks, strict ledger validation; bash -n and git diff --check passed.

## Summary

Matched ../git-ticket's just install convention: explicit DIR, otherwise first writable ~/.local/bin or ~/bin, no sudo, destination-local atomic replacement, and PATH/shadow warnings. Added five isolated installer regressions and docs/local-install.md. just check passed 71 frontend and 18 tooling tests plus production build, strict TypeScript, Go race/vet/format and strict ledger checks. Ran just install locally: /home/sothr/.local/bin/git-ticket-canvas is first on the unchanged PATH, and both direct -h and git ticket-canvas -h exited successfully. Existing /home/sothr/go/bin/git-ticket was left untouched.
