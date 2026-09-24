---
schema: 3
id: TKT-01M38QP47G7VBHRBVYR8MMKN8K
title: Select several cards on a touch screen by holding one
type: task
status: review
status_reason: null
priority: normal
due_on: null
labels:
  - touch
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies:
  - TKT-01M38QP2CZEJ120PFDKMK3WTP1
blocks_on: none
references: []
claim:
  actor: agent:claude/mobile-select
  branch: worktree-agent-ab839db94abcf6f58
  worktree: /home/sothr/workspace/git.local.sothr.com/terva-sh/git-ticket-canvas/.claude/worktrees/agent-ab839db94abcf6f58
  commit: 9f82beef2699e71d85fe065e56900926170f62eb
  session: null
  claimed_at: 2026-09-24T05:51:11Z
  expires_at: null
archive: null
created_at: 2026-09-24T03:34:58Z
updated_at: 2026-09-24T07:20:55Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/mobile-lead
  name: ""
extensions: {}
---

## Description

Selecting several cards needs shift-click, and a touch screen has no shift key.

Holding a card for 450 ms without moving more than 8 px adds it to the selection and enters selection mode. The header shows the mode, a count and Done. In selection mode a tap toggles a card, and a drag from any selected card moves them all, as a shift-selection drag does now. Done, or a tap on empty board, leaves the mode. On a phone, holding a card only selects it; nothing gets dragged, because a phone does not move cards.

See `docs/mobile-design-v1.md`, "Tablet".

## Acceptance criteria

- [x] A long press enters selection mode and selects the card, with a test on the emulated tablet
- [x] In selection mode a tap toggles and a drag moves every selected card
- [x] Done and a tap on empty board both leave selection mode
- [x] Shift-click on a desk is unchanged
- [x] Moving more than 8 px before the press completes enters no mode: a phone pans, and a tablet drags the card as it does now

## Implementation plan

Started from 9f82bee (wave 2: a phone's board pans from cards and a tap opens one), not from main.

### State

App keeps `selecting` in its interface state beside `selection`, and clears it everywhere the selection is cleared: a board or store switch, a ticket that disappears, closing the inspector (so Escape also leaves the mode). A plain `select(id)` ends the mode and an additive one keeps whatever the mode was, so shift-click on a desk behaves exactly as before and never enters it.

Two new App functions, both small:

- `hold(id)` adds the card to the selection, makes it the inspected card, and enters the mode.
- `toggle(id)` adds or removes one card. Removing the inspected card moves the inspector to another selected card, and removing the last card leaves the mode, because a mode showing "0 selected" has nothing left to act on.

Done in the header calls `setSelecting(false)` and keeps the selection, which is what a desk has after a shift-click.

Rejected: widening `select(id, additive)` to a three-way `additive | 'toggle'` flag. Every existing caller would then read a boolean argument that is not one, and toggle needs its own rule for which card the inspector shows.

### Canvas

The long press is a timer in Canvas.tsx, held in `local.hold`. It starts on a one-finger touch `pointerdown` on a card when the mode is off, and only when that press started a gesture of its own: a `card` drag on a tablet or desk, a `pan` with a `tap` on a phone. It is cancelled by more than 8 px (`TAP_SLOP`) of travel, measured on every pointermove rather than per animation frame, by the lift, and by anything that releases the gesture, which covers a second finger starting a pinch, a cancel and a blur. Pinch itself is not changed.

When it fires:

- On a tablet, the card gesture is re-based at the finger's current point with no delta, so a hold that wandered 3 px and lifted writes nothing. A drag after the hold moves the selection.
- On a phone, the pan's `tap` is cleared, so the lift does not also open the card. The finger can still pan; nothing is dragged.

In the mode, nothing selects on `pointerdown`. A press on a card starts a `card` gesture (on a tablet) over the selection plus that card, tagged with `tap`. If it travels no more than 8 px it is a tap and toggles the card with nothing saved; past that it is a drag that moves every card in the gesture, and adds the pressed card to the selection if it was not already in it, as a shift-drag on a desk does. On a phone a press on a card is the wave 2 pan, and its tap toggles instead of opening. A press on empty board that stays within 8 px leaves the mode, on either device. A pan left over from a pinch is never a tap.

Rejected: a separate `hold` gesture kind that turns into a drag or a pan once it moves. Every existing path that ends a gesture would need a case for it, and the card drag and the phone pan already carry the pointer and the start point the timer needs.

Rejected: keeping selection on `pointerdown` in the mode and deciding toggle-off on the lift. The card would flash selected and a drag from an unselected card would have to undo it.

### Header

`Toolbar` takes an optional `selecting: { count, onDone }`. On a tablet it is one group at the right of the context row, before the read-only badge: "Selecting · N", and Done. On a phone the row has no room for a fourth control, so while the mode is on the group takes the search box's place; the query stays in force and comes back with Done.

### Tests

`touchSteps` accepts a number as a step, meaning wait that many milliseconds with every finger where it is. A hold is `[on], 600, ...`. Existing callers pass only finger arrays and are unaffected.

New `tests/browser/select-hold.spec.ts`, tablet and phone: a hold enters the mode and selects; more than 8 px before 450 ms pans on a phone and drags the card on a tablet, without entering the mode; a tap toggles off and on; Done and a tap on empty board leave; a tablet drag moves every selected card and saves them; shift-click on a desk still adds and does not show the mode.

## Notes

**agent:claude/t3code** at 2026-09-24T05:01:53Z

Groomed 2026-09-24 against main at 79b233f.

- `select(id, additive)` in `App.tsx` can add a card to the selection but never remove one: `additive` unions the id into the set. "A tap toggles a card" in selection mode needs a way to deselect, a toggle or a separate remove, which shift-click on a desk does not have today either.
- The long press belongs in Canvas.tsx's gesture code, beside the pinch that TKT-01M38QP2CZEJ120PFDKMK3WTP1 added. It is a timer started by a one-finger `pointerdown` on a card and cancelled by more than 8 px of movement, by a lift, or by a second finger, which already starts a pinch.
- The browser tests can hold a finger still with `touchSteps` by repeating a step across a wait. The helper sends one CDP event per step, so a hold is a step, a `page.waitForTimeout` between two `touchSteps` calls is not possible, and the helper may need a pause option. Decide in the plan.
- Where the mode, count and Done live in the header depends on TKT-01M38QP2WYRK9A18P473KTM9BV (Fit the header into one row on a phone) for the phone. On a tablet the header is unchanged, so this does not wait on it.

**agent:claude/mobile-select** at 2026-09-24T05:53:04Z

Reworded criterion 2, which said a move of more than 8 px "pans rather than selecting". That holds on a phone, where a press on a card is a pan since wave 2. On a tablet a finger on a card drags the card, and the design's Tablet section keeps card drags working from touch ("Card, link and frame drags that survive touch"), so a tablet cannot pan there without breaking that. The new wording keeps the point of the criterion, that moving before 450 ms cancels the hold, and says what each device does instead.

**agent:claude/mobile-select** at 2026-09-24T06:04:16Z

Built on 9f82bee (wave 2). What a reviewer should know that the plan does not say:

- Outside the mode, a finger on a card on a tablet still selects that card on `pointerdown`, as a touch has since the card drag learned touch. A long press there therefore starts the mode with that one card, or with the whole selection when the card was already in it. It does not add to an older selection that did not include the card. Deferring the tablet's selection to the lift would change how every tablet card drag starts, which this ticket does not own.
- Out of the mode, a tap on a card that is already selected keeps the whole selection. That is the desk's existing rule (a click on a selected card is additive, so a multi-drag can follow) and was not changed. The Done test relies on it: after Done, a tap on a selected card leaves both selected rather than toggling one off.
- Toggling off the last selected card also ends the mode, since a count of none has nothing to act on. Escape and closing the inspector clear the selection and end the mode.
- A long press is only looked for on a touch pointer. A mouse held on a card on a desk does nothing new; the desk spec checks that.
- Phone header screenshot in the mode, taken by a throwaway spec: the row reads `default ▾ | Selecting · 1 | Done | Filter | ☰` and stays one row at 390 px. The committed phone header baseline is local-only and was not regenerated, because the header without the mode is unchanged.
- Not checked on a real device. The design asks for that once the phone layout lands, on the brokkr ledger canvas.

**agent:claude/mobile-lead** at 2026-09-24T06:35:21Z

Merging with TKT-01M38QP4FNAKCBX7KDX4WPS934 (Replace hover-only help and edge names on a touch screen) on t3code/mobile-wave-3 created one interaction between the two tickets. That ticket's stage counts two taps on empty board as a double tap and files a ticket. This ticket makes a tap on empty board in selection mode leave the mode.

Left alone, tapping twice to leave the mode would also open the composer. `touchUp` now returns before the double-tap count while `selecting` is true.

The alternative was to count the pair and let the composer open once the mode had closed. It lost because the second tap belongs to the same intent as the first.

Test: select-hold.spec.ts "a double tap on empty board leaves selection mode and files nothing". It runs twice, once with Chromium's synthesised dblclick and once with it swallowed. Both runs failed with the guard removed and pass with it.

The same commit moves the view-settle wait into a shared `viewSettled` helper in tests/browser/touch.ts. It is used by pinch, phone-board, sheet and select-hold. select-hold and sheet previously compared a poll against one up-front read, which passes before anything has settled.

**agent:claude/mobile-lead** at 2026-09-24T07:08:03Z

Terva reviewed 63ef448 on PR 35 in run e7569f0a, Actions run 240. It raised two findings, and both are accepted.

### Medium: a card press can exceed the tap limit and still toggle
In selection mode the toggle checked only the final delta. A finger that went out 20px and came back therefore toggled the card. A card gesture's `moved` could not be used instead, because it is the desk's drag rule, set after one scene pixel, and a fingertip wobble within 8px sets it.

The card gesture now carries `wandered`. It is latched once the pointer passes TAP_SLOP on screen, reset when a hold restarts the drag, and the toggle requires `!wandered`.

Test: select-hold.spec.ts "in selection mode a finger that passes 8 px and comes back does not toggle".

### Low: a wobbly card tap does not clear a named edge
`touchUp` decided whether a card lift was a tap with `!moved`, so the same wobble that toggled a card left the edge named. It now uses `!wandered`, the same rule as the toggle.

Test: touch-help.spec.ts "a tap on a card that wobbles within 8 px still unnames the edge".

Both tests failed on 63ef448 and pass with the fix.

Also: touch-help's `linked()` now waits with `viewSettled`.

### Checks run
- `just web-test`: 556 passed.
- `just browser-test`: 158 passed, 7 skipped, 2 failed. The two failures were canvas-density tests that failed with "Target crashed" at load average 8. The spec passed 6/6 on re-run.

**agent:claude/mobile-lead** at 2026-09-24T07:20:55Z

Terva reviewed f2efd4d on PR 35 in run 999f15c8, Actions run 241. It marked the wobble and edge-naming finding resolved. It kept the tap-limit finding open in a sharper form and added one new finding. Both are accepted.

### Medium: a rapid out-and-back card gesture can still toggle
`wandered` was latched in `applyMotion`, which runs once per animation frame with the latest point. A finger that crossed 8px and came back between two frames was therefore never seen as having moved. The pan's `moved`, which decides whether a phone's card press opens the card and whether a touch pan was a tap, had the same weakness.

`pointerMove` now latches both on every move, measured from the gesture's start. This is where the hold was already ended, and for the same reason.

Tests:
- select-hold.spec.ts "in selection mode a finger that passes 8 px and comes back does not toggle" gains a second out-and-back, sent between two frames.
- phone-board.spec.ts adds "a finger that leaves the card and comes back before the next frame opens nothing".

Both hold the page's animation frames with a new `betweenFrames` helper in tests/browser/touch.ts. That makes it certain no frame runs between the moves. CDP input is otherwise free to let one run.

### Medium: tapping an edge also leaves selection mode
An edge press is a pan with no card, so it set `leave`. `leave` now also requires that no edge was hit, so only bare board leaves the mode, and an edge tap still names the edge.

Test: touch-help.spec.ts "in selection mode a tap on an edge names it and stays in the mode".

All three new tests failed on f2efd4d and pass with the fix.

The /tmp worktree this branch was being fixed in was deleted from outside the session during a test run, at about 02:19. The branch was re-created under .claude/worktrees/mobile-wave-3, and the uncommitted fix was restored from a saved copy of Canvas.tsx.

## Summary

Holding a card on a touch screen for 450 ms, within 8 px, selects it and enters selection mode. Built on the wave 2 branch at 9f82bee.

- `web/src/ui/Canvas.tsx`: the long press is a timer (`local.hold`, `HOLD_MS`) started by a one-finger touch press on a card when the mode is off. More than 8 px of travel (checked on every pointermove), the lift, or anything that releases the gesture (a second finger starting a pinch, a cancel, a blur) cancels it. On a tablet the card drag is re-based when the hold fires, so a hold that wobbled saves nothing. On a phone the pan's tap is cleared, so the lift does not also open the card. In the mode nothing selects on press: a card press within 8 px is a tap that toggles; past that, a tablet drag moves the selection plus the pressed card. A press on empty board within 8 px leaves the mode. Pinch is unchanged.
- `web/src/ui/App.tsx`: `selecting` in the interface state, cleared wherever the selection is. New `hold(id)` and `toggle(id)`; `select` ends the mode unless additive, so shift-click on a desk is unchanged.
- `web/src/ui/Toolbar.tsx`: `SelectionMode` (`#selectionMode`, `#selectionCount`, `#selectionDone`) at the right of the tablet's context row. `PhoneToolbar.tsx` shows it in place of the search box while the mode lasts. Styles in `web/index.html` and `PhoneToolbar.css`.
- `tests/browser/touch.ts`: a number as a `touchSteps` step pauses that many milliseconds, documented in the helper and in `docs/browser-testing.md`.
- `tests/browser/select-hold.spec.ts`: 12 tests across tablet, phone and desk. The two 8 px tests were checked to fail when the slop cancel is disabled. Two unit tests in `phone-toolbar.test.tsx` cover both headers.

Verification: `just web-typecheck` clean; `just web-test` 556 passed; `just browser-test` 145 passed, 7 skipped (the local-only baselines and measurements); new spec 36/36 over `--repeat-each 3`; strict tsc on the new spec and touch.ts clean; `just dist-verify` matches HEAD.

Not done: a check on a real device.
