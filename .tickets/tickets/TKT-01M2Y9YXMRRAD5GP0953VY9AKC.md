---
schema: 3
id: TKT-01M2Y9YXMRRAD5GP0953VY9AKC
title: Keep the built bundle out of what a PR review reads
type: task
status: in-progress
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - ci
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim:
  actor: agent:claude/t3code-a6d0ff31
  branch: t3code/board-rules
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-a6d0ff31
  commit: bb63f0eb667d3a0006eb15ca6129dffc6917bdd3
  session: null
  claimed_at: 2026-09-20T18:23:58Z
  expires_at: null
archive: null
created_at: 2026-09-20T02:22:42Z
updated_at: 2026-09-20T18:48:13Z
created_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
updated_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
extensions: {}
---

## Description

The Terva review of canvas PR 16 failed with context_limit before reading a line: the action fetches /pulls/N.diff and refuses a context over 256 KB, and the rebuilt web/dist was 297 KB of a 347 KB diff against 50 KB of source. Every PR that touches the frontend rebuilds the bundle, because scripts/verify-dist.mjs and the parity CI require dist to match source in the same commit, so every frontend PR is unreviewable by the action as things stand. Marking web/dist -diff in .gitattributes fixes local diffs only; Forgejo serves a PR diff from a bare repository and reads no attributes. Options, none chosen yet: an exclude-paths input on terva-action-code-review, which is the terva-sh org's own action; or building dist on merge to main and on release rather than in the PR, which changes the parity gate; or the action reading /pulls/N/files and skipping generated paths. Until one lands, a frontend PR is reviewed by the maintainer alone and the ticket records that Terva could not read it.

## Acceptance criteria

- [ ] A canvas PR that rebuilds web/dist gets a Terva review of its source
- [ ] The parity gate still holds dist to source on main

## Notes

**agent:claude/t3code-a6d0ff31** at 2026-09-20T18:48:13Z

First live use of the input, on canvas PR 18 from the branch's own workflow: the run's checkout step fetched 7de7990570c5, the exclude-paths head of the action's PR 13, and the review step still ended at context_limit, because that PR deletes 260 KB of source with the bundle already out. So the input is wired and reached the action, and the case that proves it end to end is a PR that changes source and rebuilds the bundle, which the match record's canvas half will be. The workflow pin moves to PR 13's merge commit when it lands.
