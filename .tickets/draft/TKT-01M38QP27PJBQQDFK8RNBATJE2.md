---
schema: 3
id: TKT-01M38QP27PJBQQDFK8RNBATJE2
title: Drive the canvas as an emulated phone and tablet in browser tests
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - touch
  - testing
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-24T03:34:56Z
updated_at: 2026-09-24T03:34:56Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

The browser harness drives the canvas with a mouse at one desk size. Nothing in the mobile work can be tested until it can also drive a phone and a tablet.

Add two emulated devices to the harness: a phone at 390x844 and a tablet at 820x1180, each with `hasTouch` and `isMobile`. Add a helper that performs a two-finger pinch through CDP `Input.dispatchTouchEvent`, because Playwright's `touchscreen` API taps and does not move.

See `docs/mobile-design-v1.md`, "Testing". Read `docs/browser-testing.md` first. The harness has limits that are already written down, including rebuilding before a Playwright run.

## Acceptance criteria

- [ ] A spec can run against an emulated phone and an emulated tablet, each reporting a coarse pointer
- [ ] A helper performs a two-finger pinch and a two-finger pan, and a test shows the browser received two touch points
- [ ] The existing desk suites run unchanged
