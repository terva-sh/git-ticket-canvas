---
schema: 3
id: TKT-01M2NT8E0TN7PMMJM1NFY35DF3
title: Drop the dead class the placement button carried
type: bug
status: in-progress
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - ui
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim:
  actor: agent:claude/t3code
  branch: t3code/release-gate-fixes
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-acc5e2b7
  commit: f80f6a24a1ec27f0692a2e151778451f835855e0
  session: null
  claimed_at: 2026-09-16T19:14:26Z
  expires_at: null
archive: null
created_at: 2026-09-16T19:14:21Z
updated_at: 2026-09-16T19:14:26Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

`just parity-check` fails on `tests/browser/canvas-density.spec.ts`. The release button from TKT-01M2NJZ6CTYYST3Z4XB20G3W4D rendered `class="card-placement release"`, and the reference scene records the class of every metadata row on a card. Two assertions compare against `card-placement`.

The `release` half was never used. The stylesheet selects `button.card-placement`, the unit tests select `button[data-release]` and the element's tag, and nothing anywhere selects `.release`. It was markup that existed only to be recorded by a test that then disagreed with it.

The metadata rows a card presents genuinely did not change — a `span` became a `button` in the same row — so the reference is right and the markup was wrong.

Worth recording separately: the unit tests did not see this, and neither did I. `just check` does not run the browser suite; `just parity-check` does, and that is the gate a release goes through.

## Acceptance criteria

- [ ] just parity-check passes
- [x] The placement button still styles, still works, and is still found by its tests
