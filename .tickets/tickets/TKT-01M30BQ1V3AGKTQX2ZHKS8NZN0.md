---
schema: 3
id: TKT-01M30BQ1V3AGKTQX2ZHKS8NZN0
title: Explain a card's placement in the inspector and return it to automatic
type: task
status: in-progress
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
claim:
  actor: agent:claude/t3code-a6d0ff31
  branch: t3code/next
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-a6d0ff31
  commit: e0afa70cd6134e73cc6a5dc584a9933603286bc0
  session: null
  claimed_at: 2026-09-20T21:35:21Z
  expires_at: null
archive: null
created_at: 2026-09-20T21:31:50Z
updated_at: 2026-09-20T21:35:46Z
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

## Implementation plan

1. web/src/ui/Placement.tsx: a PlacementSection rendered inside the inspector, below frame membership, with a pure placementLines() that words the resolver's Explanation exactly as git ticket canvas explain does (pinned at; goes to pen ID (Title): rule; goes to the inbox: no rule matched; not ID (rule N): missing labels / status is X, rule wants Y / matches, but an earlier rule took it). A board without pens says the canvas places it in status lanes. 2. App.tsx computes the explanation from snapshot.pens, ruleOrder, inbox and cards through explain() in resolve.ts, the same function the pen layer uses, so the panel cannot disagree with the board. 3. Return to automatic: a new release(ids) on CanvasHandle reuses releaseCards, so the write, the preview and the refusal path are the ones the card's own control uses; the button is disabled when the card is automatic or the canvas is read-only. 4. Tests: placement wording; inspector shows the control disabled on read-only; a Canvas test that a refused layout write keeps the card pinned and reports the reason. 5. Served verification: tests/browser spec against git-ticket-canvas-server on a store with pens, explanation visible and control disabled; run through just browser-test and record the numbers in the ticket.
