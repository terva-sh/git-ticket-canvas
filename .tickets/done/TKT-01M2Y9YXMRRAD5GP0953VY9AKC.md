---
schema: 3
id: TKT-01M2Y9YXMRRAD5GP0953VY9AKC
title: Keep the built bundle out of what a PR review reads
type: task
status: done
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
claim: null
archive: null
created_at: 2026-09-20T02:22:42Z
updated_at: 2026-09-20T19:45:14Z
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

- [x] A canvas PR that rebuilds web/dist gets a Terva review of its source
- [x] The parity gate still holds dist to source on main

## Notes

**agent:claude/t3code-a6d0ff31** at 2026-09-20T18:48:13Z

First live use of the input, on canvas PR 18 from the branch's own workflow: the run's checkout step fetched 7de7990570c5, the exclude-paths head of the action's PR 13, and the review step still ended at context_limit, because that PR deletes 260 KB of source with the bundle already out. So the input is wired and reached the action, and the case that proves it end to end is a PR that changes source and rebuilds the bundle, which the match record's canvas half will be. The workflow pin moves to PR 13's merge commit when it lands.

**agent:claude/t3code-a6d0ff31** at 2026-09-20T19:39:56Z

The workflow pin moved from 7de7990570c5, the exclude-paths head of the action's PR 13, to 3dab5f86e2a4c31628e81729bfbd2166fd7613c8, where that PR merged on terva-sh/terva-action-code-review. exclude-paths: web/dist/** is unchanged beside it.

The criteria stay unticked on purpose. The proof is a PR that changes source and rebuilds the bundle getting a review of its source, and that PR is the one this branch becomes: it carries the match record's canvas half, roughly 400 lines of source, with web/dist rebuilt in its own commit. Tick both when Terva reviews it: the first when a review lands and reads source rather than ending at context_limit, the second because the same branch keeps the parity gate green, which just check and scripts/verify-dist.mjs already show locally.

**agent:claude/t3code-a6d0ff31** at 2026-09-20T19:45:14Z

Terva reviewed canvas PR 19 at ddeb1e45dd66 with one finding and at 7b4be7127a90 clean, both runs through the workflow that pins the action's merge commit 3dab5f86 and excludes web/dist/**, on a PR that rebuilds the bundle. One caveat for the record: the bundle moved by under 1 KB on this PR, so the review shows the input is wired end to end and does not by itself show a 300 KB bundle being kept out; the action's own runner test holds that case, and the parity gate still holds dist to source on main, as the second criterion asks.

## Summary

Solved in the action: terva-action-code-review PR 13 added an exclude-paths input that drops matching diff sections before the 256 KiB context check and tells the model what was left out. This repository's terva-review workflow pins that change's merge commit 3dab5f86 and excludes web/dist/**. Canvas PR 19, which rebuilds the bundle, was reviewed twice through it. The rejected options are in the description; the chosen one keeps the parity gate untouched.
