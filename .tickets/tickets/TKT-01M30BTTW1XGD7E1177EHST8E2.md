---
schema: 3
id: TKT-01M30BTTW1XGD7E1177EHST8E2
title: Remove the server's capture handling
type: task
status: in-progress
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - server
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim:
  actor: agent:claude/t3code-a6d0ff31
  branch: t3code/remove-capture
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-a6d0ff31-capture
  commit: 69a4e76c40e675783e519ff2f8adec956ab3aa16
  session: null
  claimed_at: 2026-09-20T21:33:54Z
  expires_at: null
archive: null
created_at: 2026-09-20T21:33:54Z
updated_at: 2026-09-20T21:33:54Z
created_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
updated_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
extensions: {}
---

## Description

TKT-01M2Y91C31 removed the trial engine from the web app in v0.6.0 and noted that the Go server's capture handling in internal/api is now unreached: no client sends a capture, so parseCapture, captureToken, validateCapture, the CaptureToken on the board response and the Capture field and guard in handleLayout are dead code and dead tests. Remove them so the server's request and response records say only what a client can send. The docs that describe the capture transport stay as records of what was tried; they are not edited.

## Acceptance criteria

- [ ] internal/api has no capture parsing, token minting or capture guard, and the board response carries no CaptureToken
- [ ] Every layout write path that a client uses still passes its tests, and just check is green
- [ ] web/dist is unchanged

## Implementation plan

Delete internal/api/capture.go and its two test files. Remove CaptureToken from the board response in snapshot.go and server.go, and the Capture field and its guard from the layout request in server.go. Grep internal/ and web/src for capture and CaptureToken to catch stragglers; leave docs/ alone. Run just check; confirm git status shows no web/dist change. PR against main, Terva review.
