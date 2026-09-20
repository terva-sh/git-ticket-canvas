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
updated_at: 2026-09-20T21:50:16Z
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

- [x] The inspector explains the selected card's placement from the resolver's explanation: pinned, or the winning pen with the rules it beat and the fields each failed, or the inbox
- [x] Return to automatic removes the saved position and the card moves to where the rules put it; a refused removal keeps it pinned and reports the reason
- [ ] A served read-only canvas shows the explanation with the control disabled, verified on git-ticket-canvas-server

## Implementation plan

1. web/src/ui/Placement.tsx: a PlacementSection rendered inside the inspector, below frame membership, with a pure placementLines() that words the resolver's Explanation exactly as git ticket canvas explain does (pinned at; goes to pen ID (Title): rule; goes to the inbox: no rule matched; not ID (rule N): missing labels / status is X, rule wants Y / matches, but an earlier rule took it). A board without pens says the canvas places it in status lanes. 2. App.tsx computes the explanation from snapshot.pens, ruleOrder, inbox and cards through explain() in resolve.ts, the same function the pen layer uses, so the panel cannot disagree with the board. 3. Return to automatic: a new release(ids) on CanvasHandle reuses releaseCards, so the write, the preview and the refusal path are the ones the card's own control uses; the button is disabled when the card is automatic or the canvas is read-only. 4. Tests: placement wording; inspector shows the control disabled on read-only; a Canvas test that a refused layout write keeps the card pinned and reports the reason. 5. Served verification: tests/browser spec against git-ticket-canvas-server on a store with pens, explanation visible and control disabled; run through just browser-test and record the numbers in the ticket.

## Notes

**agent:claude/t3code-a6d0ff31** at 2026-09-20T21:43:17Z

Shipped as web/src/ui/Placement.tsx, rendered under frame membership in the inspector. The words are the CLI's: ruleText and failureText are ported line for line from cli/canvas.go in git-ticket, and placementLines mirrors writeCanvasExplain, so the panel and git ticket canvas explain can be compared word for word. The explanation comes from explain() in resolve.ts, the function the pen layer places by, computed in App from the snapshot's pens, ruleOrder, inbox and cards. Return to automatic is a new release(ids) on CanvasHandle over the existing releaseCards, so the write, the by-the-rules preview and the refusal path are the ones the card's own control and the u key use; a refused write withdraws the preview, leaves the saved position standing and reports the reason through the toast (canvas-release.test.tsx covers it, and tests/browser/placement.spec.ts drives it against a real server by making the layout file unwritable). Verification: placement.test.tsx (6), canvas-release.test.tsx (+2), placement.spec.ts (3, through just browser-test) and just check all green. AC 3 is left unchecked: the harness starts only git-ticket-canvas, and git-ticket-canvas-server refuses to start without an https OpenID Connect issuer, so the read-only verification ran on the desk command with -read-only. What makes that evidence carry: docs/canvas-parity.json and its two drift tests declare read-only as a flag axis shared by both commands and the inspector as common chrome, so the served canvas runs this same bundle with readOnly true. Alternatives considered: a fake issuer for the harness (a real piece of work, filed as follow-up rather than done here); reading the explanation from a new server route (rejected: the browser already holds the board and the resolver, and a route would be a second source that could disagree).

**agent:claude/t3code-a6d0ff31** at 2026-09-20T21:45:03Z

Terva review of PR 22 at 099249b (run eca25346, request placement-22-1), one medium finding, accepted: the browser refusal test passed mode 0o444 to writeFile on an existing file, which does not change its permissions, so the refusal it exercised came from the malformed YAML it also wrote, not from an unwritable layout. Fixed: the test now makes .tickets/canvas unwritable (the save creates a temporary file there and renames it into place, so the write fails for the plainest reason while the board stays readable), asserts the saved position survives on the server as well as in the browser, and restores the mode in a finally. No restart needed. Spec green 3 of 3.

**agent:claude/t3code-a6d0ff31** at 2026-09-20T21:50:16Z

CI on 3eef393 failed the refusal spec: the runner is root, so a 0o555 directory does not refuse a write and no toast appeared (run 166). Permissions are not a portable refusal. The test now stops the server for the moment the control is pressed (app.restart with the press inside whileDown), which fails the same way on every machine, and asserts after the restart that the browser still says pinned at (900, 900), the control is still enabled, and the server still holds the position. Locally 3 of 3, repeated three times. Terva's second pass (run 9893be71, request placement-22-2) was clean on 3eef393 before the CI result came in; re-dispatched as placement-22-3 on this commit.
