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
updated_at: 2026-09-20T21:38:21Z
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

- [x] internal/api has no capture parsing, token minting or capture guard, and the board response carries no CaptureToken
- [x] Every layout write path that a client uses still passes its tests, and just check is green
- [x] web/dist is unchanged

## Implementation plan

Delete internal/api/capture.go and its two test files. Remove CaptureToken from the board response in snapshot.go and server.go, and the Capture field and its guard from the layout request in server.go. Grep internal/ and web/src for capture and CaptureToken to catch stragglers; leave docs/ alone. Run just check; confirm git status shows no web/dist change. PR against main, Terva review.

## Notes

**agent:claude/t3code-a6d0ff31** at 2026-09-20T21:38:21Z

Removed the server's capture handling. Deleted internal/api/capture.go, capture_test.go and capture_token_test.go; dropped CaptureToken from boardResponse and the token minting in snapshot.representation; dropped the Capture field from layoutRequest and its parse/validate guard in handleLayout, and the || req.Capture != nil term from the RoutingTransaction condition, so frames, expectations and routing still take the transactional path. No client sent a capture, so nothing on the wire changed for the web app.

Kept deliberately: internal/api/snapshot.go comments about the 'captured image' and 'captured tickets', the live.go comment about the clock being 'captured' once per build, live_test.go's 'captured readiness' message, conditional_test.go's 'captured evaluation time' comment, and internal/auth/logging_test.go's captured() log helper. All are the ordinary English word, not the capture feature. web/src keeps captureMembers/CaptureCard in platform/canvas/frames.ts and the pointer-capture calls in ui/Canvas.tsx, which are frame membership and DOM pointer capture. docs/ untouched per the ticket, including the reference code:capture-snapshot to snapshot.go, which still exists.

Cleared three stale reference paths on archived TKT-01M2441T0PTXRFK6VC4FM1PET7 (code:server-capture, test:pen-server-capture, test:capture-token-regressions) to null, keeping the ref names, the same way TKT-01M2Y91C31 handled its removals in 86e8763; git ticket check --strict failed on them otherwise. just check is green end to end and web/dist is unchanged.
