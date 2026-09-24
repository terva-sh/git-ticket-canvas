---
schema: 3
id: TKT-01M38QP3EV026GJY91GE3CG0J6
title: Open a ticket in a bottom sheet on a phone
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - mobile
  - ui
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies:
  - TKT-01M38QP2NVPG01307B8V69C29M
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-24T03:34:57Z
updated_at: 2026-09-24T05:55:34Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

On a portrait screen the inspector already becomes a bottom panel that takes a fixed share of the stage. On a phone it becomes a sheet with three heights: a peek showing the title, status and next action; half; and full. It moves between heights by dragging its handle, and dragging below the peek closes it. Above a peek or half sheet the board can still be panned, and tapping another card switches the sheet to that ticket without closing it.

The fields work as they do now.

See `docs/mobile-design-v1.md`, "The ticket sheet".

## Acceptance criteria

- [x] The sheet opens at the peek and can be dragged to half and full, with a test on the emulated phone
- [x] Dragging below the peek closes it
- [x] Tapping another card while the sheet is open switches its ticket
- [x] Status, priority, the checklist, notes and text fields can all be edited from the sheet at full height
- [x] The phone sheet keys on the phone layout, and only one mechanism positions a portrait inspector
- [x] Tablet and desk inspector placement is unchanged, except that a tablet or desk window 700px wide or less follows its data-inspector placement now that the 700px grid is gone

## Implementation plan

Read against origin/main at 1e19266.

### Approach

- Remove the `@media (max-width: 700px)` grid from `web/src/ui/Inspector.css`. It split `#stage` into a 35% board row and a 65% inspector row. A portrait tablet or desk window keeps the `html[data-inspector=...]` rules in `web/index.html`, scoped with `:not([data-layout="phone"])`. A phone gets the sheet rules in `Inspector.css`, keyed on `html[data-layout="phone"]`. The two selectors are disjoint, so each layout has exactly one set of rules placing its inspector, and neither depends on specificity or stylesheet order.
- The sheet is the existing `#inspector` absolutely positioned along the bottom of `#stage`, full width, over the board rather than beside it. The board keeps the whole stage, so it pans and pinches above a peek or half sheet without any change to Canvas.tsx. `Canvas.viewport()` already fits above a full-width panel that does not reach the top.
- The height lives in `Inspector` state, `peek | half | full`, rendered as `data-sheet` on the aside. It resets to `peek` whenever the inspector goes from no ticket to a ticket. Switching tickets keeps it, because the selection changes and the inspector stays open. `InspectorBody key={ticket.id}` already remounts the fields per ticket.
- Peek is `height: auto` with the body hidden, so it is exactly the handle, the head and the foot, whatever the title's length. Half is 50% of the stage, with a floor of the peek plus 96px of body (`SHEET_HALF_BODY`), because on a short stage half of it is less than the peek. Full is 100%. CSS cannot read an `auto` height back, so a ResizeObserver on the handle, head and foot writes the floor to `--sheet-half-least`. The head gains a status and priority line shown on the phone only. "The next action" is the foot's Claim or Release, which sits directly under the head at the peek.
- A handle at the top of the sheet has `touch-action: none` and pointer capture. While it is dragged, the height is written straight to the element's style, as the side resize does, so drag frames never re-render the fields or disturb a focused editor. On release, the sheet closes if its height is under two thirds of the peek. Otherwise it snaps to the nearest of the three heights. A press without a drag steps up through peek, half and full, handled on pointerup. ArrowUp and ArrowDown step, and Enter or Space steps through `click` with `detail === 0`, so a keyboard can reach every height. The handle calls `preventDefault` on `touchstart`: without it, a quick drag ended in a fling that nothing scrolled, and Chromium swallowed the next tap anywhere on the page as the tap that stopped the fling.
- On the phone the side `.insp-resize` handle is hidden. The 700px media query keeps one rule that hides it, so a desk window narrower than 700px shows no handle. That rule places nothing. The tablet's bottom sheet stays as it is, because TKT-01M38WN9EE8QVNR0E7B3B4QTZM (Hide the inspector's side resize handle when it is not beside the board) covers it.
- The Display panel's "Ticket panel" hint says that a phone shows a sheet whatever this setting is.

### Alternatives rejected

- Keying the sheet on `data-inspector="bottom"` as well as the phone layout. A phone turned landscape chooses `over`, so it would have lost the sheet on rotation. The layout is the setting that stays the same in both orientations, and it is the one a person can override.
- Keeping the 700px grid and adding the sheet as a second grid. The width media query cannot be overridden, and a grid row cannot float over a board that stays pannable.
- Letting half fall below the peek on a short stage. On a landscape phone that made "half" a smaller sheet than the peek, with the foot clipped off.
- A measured pixel height for the peek. It goes stale when the title wraps differently or the fonts load late. `height: auto` with the body hidden follows the content.
- Updating the height through React state on every pointer move. That re-renders every field on each frame, and the side resize avoids it for the same reason.

### Tests

A new `tests/browser/sheet.spec.ts` with `test.use(phone)` covers seven cases: open at the peek and drag the handle to half, full and back with `touchSteps`; tap and keys on the handle; drag below the peek to close, then reopen at the peek; pan and pinch the board above a half sheet, then tap another card; edit fields at full height; a phone with its layout overridden to tablet gets the tablet placement; and a short landscape stage where half takes its floor. A tablet case and a desk case check that the bottom sheet and the side panel still sit where they did. The phone cases hide the header, which currently takes about 580 of the phone's 844 pixels, until TKT-01M38QP2WYRK9A18P473KTM9BV (Fit the header into one row on a phone) lands.

`readability.spec.ts`, "narrow inspector ...", ran at 390x844, which is the phone layout. It now steps the sheet to full before it opens the editors.

## Notes

**agent:claude/t3code** at 2026-09-24T05:01:53Z

Groomed 2026-09-24 against main at 79b233f. A portrait inspector is laid out today by two independent mechanisms, and this ticket should leave one:

- `web/index.html`: `html[data-inspector="bottom"] #inspector` is an absolutely positioned sheet at 55% of the stage, sliding up with `transform`.
- `web/src/ui/Inspector.css`: `@media (max-width: 700px)` turns `#stage` into a two-row grid (35% board, 65% inspector) whenever the inspector is open, and hides `#hint` and `.insp-resize`.

A 390px phone gets the media query; a portrait tablet gets the data attribute. The phone sheet should key on `html[data-layout="phone"]`, which is the choice a person can override, not on a width media query they cannot. The 700px rule should then go, or be scoped so that it cannot fight the sheet.

Found while testing the pinch work: the inspector's `.insp-resize` handle is a column-resize strip along the left edge, with `touch-action: none`. It is hidden under 700px but not in the tablet's bottom placement, where it resizes nothing sensible and swallows touches along the sheet's left edge. It is filed separately as a small bug, so it does not wait on the phone sheet.

The drag handle for the sheet's heights needs `touch-action: none` of its own, and a test on the emulated phone that drags it through the three heights using `touchSteps`.

**agent:claude/mobile-sheet** at 2026-09-24T05:32:55Z

Criterion 5 (tablet and desk placement unchanged) is reworded, and the old wording removed. It conflicted with "only one mechanism positions a portrait inspector". The 700px grid applied to every window 700px wide or less, not only phones. A tablet or desk window that narrow, for example a desk browser at 650x900, used to get the 35%/65% grid. It now gets what its `data-inspector` setting says: the 55% bottom panel on a portrait window, or the full-width panel over the board on a landscape one. Keeping the grid for those windows would have kept the second mechanism. At the sizes the specs use, 820x1180 for a tablet and 1440x1000 for a desk, placement is the same as on main. `sheet.spec.ts` checks both, and both of those tests also pass against a build of main.

Side resize handle (`.insp-resize`), for TKT-01M38WN9EE8QVNR0E7B3B4QTZM (Hide the inspector's side resize handle when it is not beside the board): hidden on the phone layout by a `html[data-layout="phone"]` rule in Inspector.css. The rule in the 700px media query that hid it is kept, alone and commented, so a narrow tablet or desk window still shows no handle, as before. Not covered, and left to that ticket: the portrait tablet's bottom panel and any `over` panel wider than 700px, which still show the handle along their left edge.

**agent:claude/mobile-sheet** at 2026-09-24T05:32:55Z

For the merge with the parallel phone work:

- TKT-01M38QP2WYRK9A18P473KTM9BV (Fit the header into one row on a phone). On main the phone header wraps to about 580 of the phone's 844 pixels, which leaves a 261px stage. There the peek (about 190px) is taller than half the stage, and half takes its floor. The phone cases in `tests/browser/sheet.spec.ts` hide `#toolbar` through `withoutHeader()` so they measure the sheet against a stage of the size it is designed for. Once the header is one row, drop `withoutHeader()` from the portrait `phone` describe and check that the three heights still differ. The landscape case (844x300) keeps it, because it needs a stage short enough to reach the floor under half.
- A New ticket button fixed at the bottom right of the board on a phone would sit under the sheet whenever the sheet is open. The sheet is `#inspector`, full width along the bottom of `#stage`, with z-index 15. Whether the button shows above the peek depends on its own z-index and on whether it lifts itself by `--sheet-half-least` or by the sheet's height. I did not move it.
- The Display panel's "Ticket panel" setting no longer places a phone's inspector: the phone layout always shows the sheet. The hint now says so. With "Beside the board" chosen on a phone, `Canvas.viewport()` still holds back 400px of width for a panel that is not open. That is an existing edge case and I have left it.

Found while testing: a quick drag on the handle ended in a fling, and Chromium then dropped the click from the next tap anywhere on the page, for example a tap on the "Edit status..." disclosure. It gave pointerdown and pointerup with no click. Slow drags in 20px steps did not trigger it; 100px steps did, even with a 1.5s wait before the tap. The handle now calls `preventDefault` on `touchstart`, and it handles a tap on pointerup instead of on click. The editing test drags fast to full and then taps fields, and before the fix it failed exactly this way.

In one full `just browser-test` run, `touch.spec.ts` "a gesture whose move fails still lifts both fingers" failed because the board had not rendered when the test measured it. That code is unrelated to this change. It passed 20 of 20 runs alone, and the next full run passed. Filed as TKT-01M38YCD9ZAZSTAHM4FJGQ1TQ9 (Wait for the board before measuring it in the touch spec's lift test).

**agent:claude/t3code** at 2026-09-24T05:38:13Z

Merged with the phone header (TKT-01M38QP2WYRK9A18P473KTM9BV) and the cycle refusal (TKT-01M38R4GRCRG7PYT72MV47PKAJ) on t3code/mobile-wave-1. As this ticket's report asked, the portrait phone tests in sheet.spec.ts no longer hide the header: they pass with the real one-row header. The landscape test still hides it, with the comment updated to say why. The New ticket button does not collide with the sheet, because the header hides it while the inspector is open, and phone-header.spec's test for that passes on the merged tree. On the merged tree: web-test 552 passed, browser-test 127 passed / 7 skipped / 0 failed, typecheck and strict tsc on the new specs pass.

**agent:claude/t3code** at 2026-09-24T05:38:44Z

Opened with its two wave 1 siblings as PR 33, https://git.local.sothr.com/terva-sh/git-ticket-canvas/pulls/33, from t3code/mobile-wave-1. On the merged head: web-test 552 passed, browser-test 127 passed / 7 skipped / 0 failed, dist-verify byte-identical, ticket check clean. A Terva review is requested next; its result is recorded here when it lands.

**agent:claude/t3code** at 2026-09-24T05:55:34Z

Merged to main through PR 33 (https://git.local.sothr.com/terva-sh/git-ticket-canvas/pulls/33) at 9a1d66b on 2026-09-24, under the maintainer's direction to carry the batch through to completion. The Terva review on d8e2d90 was clean (run 4616fcaf-2e07-4ba4-82e8-64b2029426d2). CI failed once (run 226, a flake whose log was unreadable) and passed on rerun (run 228, c7a4da4). Closed with the merge recorded; the summary above stands as written by the implementing agent.

## Summary

On the phone layout (`html[data-layout="phone"]`) the inspector is now a sheet over the bottom of the board, with three heights:

- the peek: the handle, the title, a status and priority line, and the foot with Claim or Release;
- half the stage, never less than the peek plus a few lines of the body;
- the full stage.

A handle with `touch-action: none` drags it between the heights. Released under two thirds of the peek, it closes. A tap on the handle steps the height, and so do Up, Down, Enter and Space. The sheet opens at the peek each time. A tap on another card switches its ticket and keeps its height. The board keeps the whole stage, so above a peek or half sheet it pans, pinches and takes taps.

The 700px grid in `web/src/ui/Inspector.css` is gone. The `data-inspector` rules in `web/index.html` now exclude the phone layout, so each layout has one rule placing its inspector. A tablet or desk window 700px wide or less now follows its `data-inspector` setting instead of the grid. The side resize handle is hidden on the phone. The tablet case stays with TKT-01M38WN9EE8QVNR0E7B3B4QTZM (Hide the inspector's side resize handle when it is not beside the board).

Tests: `tests/browser/sheet.spec.ts` has 9 cases: 7 on the emulated phone, one on the tablet and one on the desk. The 7 phone cases fail against a build of main, and the tablet and desk cases pass there. `readability.spec.ts`'s 390px case now steps the sheet to full before it edits. The phone cases hide the header until TKT-01M38QP2WYRK9A18P473KTM9BV (Fit the header into one row on a phone) lands; see the notes for the merge.

Other files touched: comments in `App.tsx` and `viewport.ts`, the Display panel's "Ticket panel" hint, and a dated addendum in `docs/readability-v1.md`.
