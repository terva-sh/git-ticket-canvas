---
schema: 3
id: TKT-01M38YCD9ZAZSTAHM4FJGQ1TQ9
title: Wait for the board before measuring it in the touch spec's lift test
type: bug
status: draft
status_reason: null
priority: low
due_on: null
labels:
  - testing
  - mobile
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-24T05:32:00Z
updated_at: 2026-09-24T05:32:00Z
created_by:
  id: agent:claude/mobile-sheet
  name: ""
updated_by:
  id: agent:claude/mobile-sheet
  name: ""
extensions: {}
---

## Description

`tests/browser/touch.spec.ts`, "a gesture whose move fails still lifts both fingers", calls `stageCenter(page)` right after `page.goto(app.url)`. It does not wait for the board to render first. `stageCenter` reads `#stage`'s bounding box and dereferences it with `!`, so when the board has not mounted yet the box is null and the test fails with `TypeError: Cannot read properties of null (reading 'x')` at `touch.spec.ts:51`.

Seen once on 2026-09-24 in a full `just browser-test` run on the branch for TKT-01M38QP3EV026GJY91GE3CG0J6 (Open a ticket in a bottom sheet on a phone). That branch does not touch the stage or this spec. The same test passed 20 of 20 times alone (`--repeat-each 20`), and the next full run passed.

The neighbouring tests in that file wait for `.card` or for the page to settle before they measure. The fix is probably a wait on `#stage` (or on `expect(page.locator('#stage')).toBeVisible()`) before `stageCenter`, in this test or inside `stageCenter` itself.
