---
schema: 3
id: TKT-01M30BQ1V3AGKTQX2ZHKS8NZN0
title: Explain a card's placement in the inspector and return it to automatic
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - ui
assignees: []
milestone: null
parent: TKT-01M2ND0S8N5Y8V0HQFRCBKMXE3
origin: null
dependencies: []
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

The read side of pens in the browser, split from TKT-01M26SQB4JWTW8FPSVHYZKFKCR on 2026-09-20. The pen layer, the inbox and the per-pen counts already render from resolveBoard since v0.5.0. What is left is the explanation and the one gesture that changes routing without authoring a rule. The inspector shows, for the selected card, what resolveBoard decided: pinned at a position, or the winning pen with the rules it beat and the fields each failed, or the inbox with every rule it failed, using the same words git ticket canvas explain prints. Return to automatic in the inspector removes the saved position through the existing layout write and reevaluates; a refused removal keeps the card pinned and says why. A served read-only canvas shows the explanation with the control disabled behind the existing badge. Verified on the served command, not only with -read-only on the desk one.

## Acceptance criteria

- [ ] The inspector explains the selected card's placement from the resolver's explanation: pinned, or the winning pen with the rules it beat and the fields each failed, or the inbox
- [ ] Return to automatic removes the saved position and the card moves to where the rules put it; a refused removal keeps it pinned and reports the reason
- [ ] A served read-only canvas shows the explanation with the control disabled, verified on git-ticket-canvas-server
