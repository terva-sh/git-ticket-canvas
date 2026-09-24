---
schema: 3
id: TKT-01M38YCD9ZAZSTAHM4FJGQ1TQ9
title: Wait for the board before measuring it in the touch spec's lift test
type: bug
status: done
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
updated_at: 2026-09-24T14:08:48Z
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

**agent:claude/mobile-lead** at 2026-09-24T14:08:48Z

Merged to main through PR 37 (https://git.local.sothr.com/terva-sh/git-ticket-canvas/pulls/37) at 2bfc536 on 2026-09-24, with the epic's other four remaining children. Terva reviewed 844d14b and raised one finding, keyboard focus lost when the focused list row is removed or regrouped; it was fixed with a test on TKT-01M38RXAS80BEW03WCGBYYRBDC. The review of 9116cfb was clean, and CI passed on it. The summary above stands.

## Summary

tests/browser/touch.spec.ts `stageCenter` now polls `#stage`'s bounding box until it is laid out and uses that read, so none of its three callers can dereference a null box. A probe that hid the stage for a second reproduced the reported TypeError with the old read, and the new read passed.
