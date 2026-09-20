---
schema: 3
id: TKT-01M2Y91C31J34Q6DCSDN2QH6DD
title: Remove the opt-in pen placement trial engine
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
dependencies:
  - TKT-01M2ND1RKK6S4GXZQKKPP6H87P
blocks_on: none
references: []
claim:
  actor: agent:claude/t3code-a6d0ff31
  branch: t3code/board-rules
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-a6d0ff31
  commit: 9a4ca246150ab480fc659b45b42e0e355f3887d2
  session: null
  claimed_at: 2026-09-20T18:30:08Z
  expires_at: null
archive: null
created_at: 2026-09-20T02:06:34Z
updated_at: 2026-09-20T18:30:08Z
created_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
updated_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
extensions: {}
---

## Description

web/src/platform/canvas/placement.ts, pens.ts, snapshots.ts, publications.ts, the committed sampling probe, and the PublicationBridge props on App and Canvas are the archived opt-in trial's route to placement: a collision-search allocator with measured heights and a resolver that ranks by specificity before rule order. The adopted contract resolves by first match in ruleOrder, and TKT-01M2ND1RKK6S4GXZQKKPP6H87P places cards through one pure resolve function. Decided on 2026-09-20 when that ticket was planned: the trial does not survive. Remove it and its tests, and the diagnostic injection in main.ts and the test harness, so the tree has one reading of a board. Keep docs/pen-position-consumers-proposal-v1.md and the evidence documents as records.

## Acceptance criteria

- [ ] No module in web/src resolves a pen by specificity
- [ ] The PublicationBridge and committed sampling props are gone from App and Canvas
- [ ] The web test suite and just ci pass with the trial removed
