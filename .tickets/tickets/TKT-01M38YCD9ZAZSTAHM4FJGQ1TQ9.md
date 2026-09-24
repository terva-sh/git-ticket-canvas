---
schema: 3
id: TKT-01M38YCD9ZAZSTAHM4FJGQ1TQ9
title: Wait for the board before measuring it in the touch spec's lift test
type: bug
status: review
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
claim:
  actor: agent:claude/mobile-lead
  branch: t3code/mobile-wave-4
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-fd003818
  commit: 5389071f510222a6008ff7deb307c6f2074d7043
  session: null
  claimed_at: 2026-09-24T13:17:45Z
  expires_at: null
archive: null
created_at: 2026-09-24T05:32:00Z
updated_at: 2026-09-24T13:20:13Z
created_by:
  id: agent:claude/mobile-sheet
  name: ""
updated_by:
  id: agent:claude/mobile-lead
  name: ""
extensions: {}
---

## Description

`tests/browser/touch.spec.ts`, "a gesture whose move fails still lifts both fingers", calls `stageCenter(page)` right after `page.goto(app.url)`. It does not wait for the board to render first. `stageCenter` reads `#stage`'s bounding box and dereferences it with `!`, so when the board has not mounted yet the box is null and the test fails with `TypeError: Cannot read properties of null (reading 'x')` at `touch.spec.ts:51`.

Seen once on 2026-09-24 in a full `just browser-test` run on the branch for TKT-01M38QP3EV026GJY91GE3CG0J6 (Open a ticket in a bottom sheet on a phone). That branch does not touch the stage or this spec. The same test passed 20 of 20 times alone (`--repeat-each 20`), and the next full run passed.

The neighbouring tests in that file wait for `.card` or for the page to settle before they measure. The fix is probably a wait on `#stage` (or on `expect(page.locator('#stage')).toBeVisible()`) before `stageCenter`, in this test or inside `stageCenter` itself.

## Implementation plan

Fix it inside `stageCenter` in tests/browser/touch.spec.ts, so that all three callers wait, not only the lift test that failed.

The wait the description suggests does not close the gap. Playwright's `locator.boundingBox()` already waits for `#stage` to be attached. It answers null when the element is attached but not laid out. A visibility check followed by a second read leaves that moment open between the two calls, for example while the board remounts as a store opens.

`stageCenter` therefore polls `boundingBox()` until it is non-null and uses the box from that same poll.

Rejected alternatives:
- `expect(stage).toBeVisible()` then a read. It has the gap described above.
- A fixed wait. It is slow and still does not guarantee anything.

## Notes

**agent:claude/mobile-lead** at 2026-09-24T13:20:13Z

Evidence, from a throwaway spec that was not committed. With a laid-out `#stage` hidden for 1 s (`display: none`, then restored):
- The old `stageCenter` read failed with `TypeError: Cannot read properties of null (reading 'x')`, the error this ticket reports.
- The polled read waited and passed.

A first probe that delayed the JS bundle did not reproduce the failure. `boundingBox()` waited for the element to attach, which is how I found that the null comes from an element that is attached but not laid out.

touch.spec.ts with `--repeat-each=5` passed 35/35.

## Summary

tests/browser/touch.spec.ts `stageCenter` now polls `#stage`'s bounding box until it is laid out and uses that read, so none of its three callers can dereference a null box. A probe that hid the stage for a second reproduced the reported TypeError with the old read, and the new read passed.
