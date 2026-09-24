---
schema: 3
id: TKT-01M38QP47G7VBHRBVYR8MMKN8K
title: Select several cards on a touch screen by holding one
type: task
status: in-progress
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
updated_at: 2026-09-24T05:53:04Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/mobile-select
  name: ""
extensions: {}
---

## Description

Selecting several cards needs shift-click, and a touch screen has no shift key.

Holding a card for 450 ms without moving more than 8 px adds it to the selection and enters selection mode. The header shows the mode, a count and Done. In selection mode a tap toggles a card, and a drag from any selected card moves them all, as a shift-selection drag does now. Done, or a tap on empty board, leaves the mode. On a phone, holding a card only selects it; nothing gets dragged, because a phone does not move cards.

See `docs/mobile-design-v1.md`, "Tablet".

## Acceptance criteria

- [ ] A long press enters selection mode and selects the card, with a test on the emulated tablet
- [ ] In selection mode a tap toggles and a drag moves every selected card
- [ ] Done and a tap on empty board both leave selection mode
- [ ] Shift-click on a desk is unchanged
- [ ] Moving more than 8 px before the press completes enters no mode: a phone pans, and a tablet drags the card as it does now

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
