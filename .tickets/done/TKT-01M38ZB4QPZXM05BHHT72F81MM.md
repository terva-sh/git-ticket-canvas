---
schema: 3
id: TKT-01M38ZB4QPZXM05BHHT72F81MM
title: Stop the phone's ticket sheet and keyboard from writing layout
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
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
created_at: 2026-09-24T05:48:47Z
updated_at: 2026-09-24T14:08:48Z
created_by:
  id: agent:claude/mobile-board
  name: ""
updated_by:
  id: agent:claude/mobile-lead
  name: ""
extensions: {}
---

## Description

TKT-01M38QP373BAE8X6Q9F3G8E7SY (Keep a phone's board to panning, zooming and opening cards) took every layout write off the phone's board. Three writes are still reachable on the phone layout from outside the board:

- The ticket sheet's Placement section has "Return to automatic" (`web/src/ui/Placement.tsx`, `data-return-automatic`), which calls `Canvas.release` and removes the card's saved position.
- The sheet's frame membership section (`FrameMembership` in `web/src/ui/FramesPanel.tsx`) changes which frame a ticket belongs to, and its "Member of" button opens the frame panel, whose controls are all edits.
- The `u` key (`App.tsx`) calls `Canvas.releaseSelected`, for a phone with a keyboard attached.

The design says a phone does not write layout and that each write it leaves out has another way in on the same screen, but these are the sheet's and the keyboard's, not the board's, so the board ticket left them alone. A guard inside `Canvas.releaseCards` was considered there and rejected, because it would leave the sheet's buttons on screen doing nothing. The fix belongs where the controls are drawn: on `layout === 'phone'`, render the Placement state without its button, the membership as text, and skip `u`.

## Implementation plan

Fix each write where its control is drawn, as the description asks.

- `PlacementSection` (Placement.tsx) and `FrameMembership` (FramesPanel.tsx) each take `layoutReadOnly`. App.tsx sets it to `display.settings.layout === 'phone'`.
- On a phone, Placement keeps its verdict and routing lines and drops the Return to automatic button.
- On a phone, membership reads "Member of TITLE" as text, with no frame-panel button, no target select and no Move or Remove.
- Both sections show one shared line where the controls were: `ARRANGED_ELSEWHERE`, "Arranged on the tablet or desk layout. Display can switch this screen to one." This is the "another way in on the same screen" that docs/mobile-design-v1.md promises. The line is not shown on a read-only store, which already says it cannot be changed.
- The `u` key handler in App.tsx skips on the phone layout. It reads a `layoutLatest` ref because the listener is registered once.

Rejected alternatives:
- A guard inside `Canvas.releaseCards`. The board ticket already rejected it, because the buttons would stay on screen doing nothing.
- Disabling the controls instead of removing them. A disabled button on a phone reads as broken, or as waiting on something, and gives no reason.
- Passing `layout` itself into the sections. They need one yes-or-no answer, and a boolean named for what it means keeps layout names out of form components.

## Notes

**agent:claude/mobile-lead** at 2026-09-24T13:29:51Z

New test in phone-board.spec.ts: "the ticket sheet shows placement and frame membership without the controls that write layout". On the emulated phone, it opens a pinned card inside a frame and checks three things:
- The placement shows the arranged-elsewhere line and has no `[data-return-automatic]`.
- Membership reads "Member of Held" and contains no button or select.
- `u`, pressed with focus out of every field, leaves the card pinned.

It also checks that no request is sent and the store is unchanged.

With the `u` guard removed, the test failed: the card became `unpinned`. The desk and tablet keep every control, and placement.spec and frames.spec still pass.

Checks run:
- `just browser-test`: 164 passed, 7 skipped, and 1 failed. The failure was frames.spec "frame capture…", an API-call timeout at load average 9.85. frames.spec passed 18/18 on a `--repeat-each=3` re-run.
- `just web-test`: 556 passed.

**agent:claude/mobile-lead** at 2026-09-24T14:08:48Z

Merged to main through PR 37 (https://git.local.sothr.com/terva-sh/git-ticket-canvas/pulls/37) at 2bfc536 on 2026-09-24, with the epic's other four remaining children. Terva reviewed 844d14b and raised one finding, keyboard focus lost when the focused list row is removed or regrouped; it was fixed with a test on TKT-01M38RXAS80BEW03WCGBYYRBDC. The review of 9116cfb was clean, and CI passed on it. The summary above stands.

## Summary

On the phone layout, the ticket sheet no longer offers a layout write. Placement shows why the card is where it is, without Return to automatic. Frame membership reads as text, without the frame-panel button or the Move and Remove controls. In their place a line says that arranging happens on the tablet or desk layout, which Display can switch to. The u key does nothing on a phone. Tested in phone-board.spec.ts.
