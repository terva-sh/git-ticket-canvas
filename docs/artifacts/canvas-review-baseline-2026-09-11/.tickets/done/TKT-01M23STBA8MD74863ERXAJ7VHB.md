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
  - ref: doc:installer-cleanup
    path: docs/installer-test-cleanup.md
claim: null
archive: null
created_at: 2026-09-09T19:20:20Z
updated_at: 2026-09-10T04:26:02Z
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

### CI cleanup repair
CI run #8 failed in fixture teardown with ENOTEMPTY after the intentionally failed build. Inspection and strace in the CI Go 1.25 Alpine image show a detached Go telemetry child writing under the fixture HOME after the installer exits. The exact timing did not recur in 80 host and 150 container attempts.

Initialize each installer fixture with isolated config and telemetry paths, then use go telemetry off before running any tested build. Do not change the production installer, the user's telemetry configuration, or weaken rmSync cleanup. Add deterministic checks for disabled fixture telemetry and isolation from inherited telemetry/config paths, alongside the existing old-binary/staging assertions. Verify the new invariant fails before the fix, stress the failure path in the CI image, run just check and embedded browsers, and write a new evidence note without editing published guides. Saved board layout must retain its checksum. No commit, push, install or CI rerun requested.

## Notes

**agent:terva/mieli** at 2026-09-09T19:24:36Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-59 just install supports the sibling tooling's destination selection, atomic replacement, and PATH warnings with regression tests. — Added scripts/install-local.sh and just install DIR forwarding. Five installer tests passed for default/fallback/explicit paths, atomic replacement, Git discovery, warnings, and failed-build preservation. bash -n and just check passed.
- [x] task-60 Install locally and verify the resolved executable and git ticket-canvas -h without modifying PATH or the git-ticket installation. — just install installed /home/sothr/.local/bin/git-ticket-canvas. Unmodified PATH resolves that path; direct -h and git ticket-canvas -h both exited 0. git-ticket still resolves /home/sothr/go/bin/git-ticket; no PATH edits or other binary removals.
- [x] task-61 Document the successor install convention and pass tooling/build checks. — docs/local-install.md supersedes the prior just install convention without rewriting shipped guides. just check passed 71 frontend and 18 tooling tests, production build/typecheck, Go race/vet/format checks, strict ledger validation; bash -n and git diff --check passed.

**agent:terva/mieli** at 2026-09-10T04:15:11Z

done to in-progress: User requested investigation and repair of CI run #8 ENOTEMPTY failure in the installer test cleanup hook.

**agent:terva/mieli** at 2026-09-10T04:25:35Z

Repaired the installer test isolation after CI run #8 failed with ENOTEMPTY. A trace in the CI Go1.25 Alpine image confirmed a detached telemetry process writes to fixture HOME after the failed build and installer exit; exact ENOTEMPTY timing did not recur in original-test stress runs. Each fixture now isolates XDG config, clears TEST_TELEMETRY_DIR and runs go telemetry off before builds. The deterministic regression checks off mode, private paths, no counter/upload files, and unchanged inherited sentinels. Strict cleanup and production installer remain unchanged. Both targeted tests passed 150 container repetitions each; full local just parity-check passed 194 unit/component, 65 tooling, 53 browser passes with five opt-in skips, plus Go and store checks. Evidence and runtime provenance: docs/installer-test-cleanup.md. Saved default.yml SHA-256 unchanged. Repair remains uncommitted/unpushed; hosted run #8 remains failed pending a new commit and run.

## Summary

Local installer behavior remains implemented and unchanged. Repaired pre-commit CI cleanup failure by isolating fixture config and disabling Go telemetry before builds, preventing detached telemetry writers from racing recursive HOME removal. Added deterministic isolation and no-counter-file regression; existing binary-preservation and strict cleanup assertions remain. Both targeted tests passed 150 runs each in the CI Go1.25 Alpine image. Full local just parity-check passed with 194 unit/component tests, 65 tooling tests and 53 browser passes/five skips, plus Go and ticket checks. Evidence: docs/installer-test-cleanup.md. Repair remains uncommitted and unpushed; hosted CI has not rerun. Saved user layout unchanged and unstaged.
