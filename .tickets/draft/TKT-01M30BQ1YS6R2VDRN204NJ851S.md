---
schema: 3
id: TKT-01M30BQ1YS6R2VDRN204NJ851S
title: Verify routing, save and frame history at 120 cards with a second viewer
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - testing
assignees: []
milestone: null
parent: TKT-01M2ND0S8N5Y8V0HQFRCBKMXE3
origin: null
dependencies:
  - TKT-01M30BQ1X0MS52X2DDJ31FKY08
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-20T21:31:50Z
updated_at: 2026-09-20T21:31:50Z
created_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
updated_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
extensions: {}
---

## Description

The end-to-end check split from TKT-01M26SQB4JWTW8FPSVHYZKFKCR on 2026-09-20: a board of at least 120 cards with several pens, authored by one browser and watched by a served read-only viewer that is not the author. Routing, save, live reflow of the viewer, frame history and undo hold under the browser harness of docs/browser-testing.md, and the measurements are recorded the way the live-update measurements were.

## Acceptance criteria

- [ ] A 120-card board with pens routes, saves and reflows on a second viewer within the harness's budgets, with the numbers recorded
