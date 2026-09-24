---
schema: 3
id: TKT-01M38QP373BAE8X6Q9F3G8E7SY
title: Keep a phone's board to panning, zooming and opening cards
type: task
status: review
status_reason: null
priority: normal
due_on: null
labels:
  - mobile
  - touch
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies:
  - TKT-01M38QP2CZEJ120PFDKMK3WTP1
  - TKT-01M38QP2NVPG01307B8V69C29M
blocks_on: none
references: []
claim:
  actor: agent:claude/mobile-board
  branch: worktree-agent-abf562633c7642e20
  worktree: /home/sothr/workspace/git.local.sothr.com/terva-sh/git-ticket-canvas/.claude/worktrees/agent-abf562633c7642e20
  commit: d8e2d90fa342322167fa2d673a1df162d19efc45
  session: null
  claimed_at: 2026-09-24T05:39:22Z
  expires_at: null
archive: null
created_at: 2026-09-24T03:34:57Z
updated_at: 2026-09-24T06:42:06Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/mobile-lead
  name: ""
extensions: {}
---

## Description

A phone is for viewing and triage, so its board does not write layout.

In the `phone` layout, a drag that starts on a card pans the board, and a tap opens the card. The link handle and the frame handles are not drawn. The hint line goes. On the first visit a one-line tip appears ("drag to move around · pinch to zoom · tap a card to open it"); tapping it closes it, and it is remembered with the display settings so it does not come back.

See `docs/mobile-design-v1.md`, "The board".

## Acceptance criteria

- [x] On the emulated phone a drag from a card pans and saves nothing, with a test
- [x] A tap on a card opens it
- [x] No link or frame handle is drawn on a phone
- [x] The first-visit tip shows once, closes when tapped, and stays closed after a reload
- [x] Setting the layout to tablet by hand brings card drags, handles and the hint back
- [x] The Manual placement control on a card does not hand the card back on a phone

## Implementation plan

Read against origin/t3code/mobile-wave-1 at d8e2d90 (PR 33: the phone header, the phone ticket sheet and the cycle refusal).

### Approach

- `App.tsx` passes `layout={display.settings.layout}` to `Canvas`, beside `inspector` and `fitFloor`. The gesture code reads it through `latest.current`, as it reads every other prop.
- In `startGesture` (Canvas.tsx), on the phone layout a finger or a mouse that lands on a card starts a `pan`, never a `card` or `link` gesture. The pan carries the card it landed on, and whether the pointer has travelled more than a small slop (8 CSS pixels). On the lift, a pan that never passed the slop selects the card through `p.onSelect`, which opens the sheet. A pan that moved selects nothing, so panning across a board that happens to start on a card does not open a sheet every time. Nothing on this path calls `save`, so a pan writes no layout. Pinch, and the pan a finger left after a pinch starts, are not touched.
- `CardView` takes `linkable`. On the phone the canvas passes `linkable={false}`, and the `.handle` element is not rendered. It also passes no `onRelease`, so the Manual control renders as the plain label a read-only board already gets, the path CardView already has.
- Frames on a phone: the title renders as a `span.canvas-frame-label` with the same look, no `data-frame-gesture`, no `onClick`, and `pointer-events: none`, so a finger on it pans the board. The resize button is not rendered.
- Decision on the frame title: tapping it does not open the frame panel on a phone. The panel offers only edits (title, colour, bounds, membership, delete), each of them a layout write, and the phone does not write layout. Everything the panel would show to a reader, the frame's name and member count, is already in the label, and the ticket sheet names the frame a ticket belongs to. Opening a panel whose every control is refused, or that writes when the rest of the phone board does not, would be worse than no panel.
- The hint (`#hint`) is not rendered on the phone layout. In its place, on the first visit, a `button#boardTip` reads "drag to move around · pinch to zoom · tap a card to open it". Tapping it closes it. It is a button, so `canvasTarget` already refuses it as a gesture start and a tap on it cannot pan or select.
- The tip is remembered in `git-ticket-canvas.display` as `tipClosed: true`, allowlisted in `recall()` beside `toolbar`. `useDisplay` keeps it out of `overrides` the way it keeps `toolbar` out, exposes `tipClosed` and `closeTip()`, and `reset()` keeps it, because handing the automatic settings back is not a request to see the tip again.
- Placement of the tip: across the stage above New ticket (bottom `16px + 48px + 12px` and the safe-area inset), full width less 12px margins, so it never shares the bottom-right button's box. While the ticket sheet is open the tip is hidden with `#stage:has(#inspector.open) #boardTip`, and it comes back when the sheet closes, still waiting to be tapped.
- Setting the layout to `tablet` by hand on a phone reverses every one of these, because each keys on `layout === 'phone'` and nothing on the viewport size.

### Alternatives rejected

- Hiding the handles with CSS on `html[data-layout="phone"]`. The gesture code would still start a link from the handle's box, and a stylesheet cannot stop the Manual button's click. Not rendering them, and choosing the gesture from the same prop, keeps drawing and behaviour from disagreeing.
- Selecting the card on pointerdown, as the desk does. On the desk the press starts a drag of that card, so selecting it first is right. On a phone the press is almost always the start of a pan, and opening the sheet on every pan that starts on a card would cover half the board each time.
- Letting a frame title tap open the frame panel. See the decision above.
- A guard in `Canvas.releaseCards` for the phone. It would also stop the `u` key and the sheet's Placement section, but it would leave their controls on screen doing nothing. Those two are outside the board and outside this ticket; they are filed as a draft instead.
- Storing the tip in a separate `localStorage` key. The ticket and the grooming note both ask for it beside the display settings, and one record means one allowlist and one place that survives private browsing.
- Putting the tip at the top of the board. Existing phone specs pan from the top of the stage, and a tip there would take their first touch. Above New ticket it is clear of the button, and the sheet hides it while it is open.

### Tests

A new `tests/browser/phone-board.spec.ts` on the emulated phone: a drag from a card pans by the finger's travel, leaves the card where it was, opens nothing and sends no write; a tap on a card opens the sheet; no `.handle`, `.canvas-frame-title` or `.canvas-frame-resize` on a board with a frame, and the frame label is a pan; the Manual label on a pinned card is not a button and a tap on it writes nothing; the tip shows, sits clear of New ticket, hides under an open sheet, closes on a tap and stays closed after a reload, with no `#hint`; and a phone set to `tablet` gets the hint, the handles, the frame buttons and a card drag that saves. `display-preferences.test.ts` gains the allowlist case for `tipClosed`.

## Notes

**agent:claude/t3code** at 2026-09-24T05:01:53Z

Groomed 2026-09-24 against main at 79b233f.

- `Canvas` does not receive `layout`. `App.tsx` passes `display.settings.inspector` and `fitFloor`, and `layout` has to be passed beside them. Read it through `latest.current` in the gesture code, as the other props are.
- On a phone, the card-drag branch of `startGesture` (Canvas.tsx) should start a `pan` rather than a `card` gesture. The tap-to-open path, `p.onSelect`, stays as it is.
- Cards carry a second layout-writing control the design missed: the "Manual" placement button in `CardView.tsx`, which hands a card back to automatic placement. On a phone it should read as a label, not act as a button, the same as the handles. There is a new criterion for that.
- The link handle is `.handle` in CardView. The frame handles are `.canvas-frame-title` and `.canvas-frame-resize` in Canvas.tsx; the title is also a button that selects the frame. On a phone, should tapping a frame title still open the frame panel? The panel offers only edits, so this ticket should decide and say.
- The hint is `#hint` in Canvas.tsx. Store the first-visit tip beside the display settings (`displayPreferences.ts`), as a key that `recall()` allowlists.
- Pinch is done (TKT-01M38QP2CZEJ120PFDKMK3WTP1), so two fingers already work on a phone. This ticket only changes what one finger does.

**agent:claude/mobile-board** at 2026-09-24T05:49:01Z

Evidence for the criteria, from `tests/browser/phone-board.spec.ts` on the emulated phone (390x844), with the build of e5b7320:

1. "a drag that starts on a card pans the board, opens nothing and saves nothing": the view moves by the finger's travel, the card's style is unchanged, no non-GET request is sent, and the store's files are byte-identical before and after.
2. "a tap on a card opens it": the sheet opens with that ticket.
3. "no link or frame handle is drawn, and a finger on the frame title pans": no `.handle`, `.canvas-frame-title`, `.canvas-frame-resize` or `[data-frame-gesture]`, also with the card selected. The frame's title is `.canvas-frame-label`, and a drag on it pans and writes nothing.
4. "the first-visit tip replaces the hint ...": shown with no `#hint`, above New ticket, hidden under an open sheet and back when it closes, closed by a tap that neither pans nor selects, stored as `{"tipClosed":true}`, and absent after a reload.
5. "a phone set to tablet gets card drags, the handles and the hint back": hint, handle, frame title and resize button all present, and a drag from the card saves a new position with a PUT.
6. "the Manual placement label does not hand the card back": with full density the card head says Manual, there is no `button.card-placement` or `[data-release]`, and a tap on it opens the card, keeps it pinned and writes nothing.

Built against d8e2d90's web source, tests 1, 3, 4 and 6 fail and tests 2 and 5 pass: those two guard behaviour the base already had. The two new unit tests (`display-preferences.test.ts`, `display-dialog.test.tsx`) fail against d8e2d90's source too.

Filed TKT-01M38ZB4QPZXM05BHHT72F81MM (Stop the phone's ticket sheet and keyboard from writing layout) for the sheet's Return to automatic, its frame membership controls, and the `u` key, which still write layout on the phone layout.

**agent:claude/mobile-lead** at 2026-09-24T06:24:05Z

The phone-board browser specs failed about one run in ten under load. They were fixed in the tests, and the product was not changed. There were two causes:

- **A remembered view carried between layouts.** The page writes the view 300ms after it last moved, and it writes again on unload. When a test changed display settings straight after the first load, that pending write landed after the test's reset. The next open then restored the first load's view instead of fitting. The card ended up placed for a compact card, or for a different toolbar height, and parts of it sat past the 390px edge. The Manual placement label was at x≈400.
- **Taps taken from the bounding box.** A touch at a point outside the viewport never reaches the page, so pointerdown never ran.

The fixes, both in tests/browser/phone-board.spec.ts:

- `store()` waits for the view to hold still, then clears `git-ticket-canvas.view.*` along with the display record.
- `tap()` and the drags start from `reachable()`, which is the first point on the element that is on the screen and uncovered.

The tablet-on-phone drag now goes up and right, because at 390px that board is a strip along the bottom.

pinch.spec.ts and phone-board.spec.ts also replace `expect.poll(() => view(page)).toEqual(await view(page))` with `settled()`. The old check compared a poll against a single up-front read, so it passed at once whenever nothing had moved yet.

Results: phone-board with `--repeat-each=8` passed 48/48. phone-board plus pinch with `--repeat-each=4 --workers=8` passed 56/56. The full suite passed 133, with 7 skipped.

**agent:claude/mobile-lead** at 2026-09-24T06:34:30Z

Terva reviewed 97513da on PR 34 in run 404e92a8, Actions run 231. It raised one medium finding: frame drawing could still write layout on the phone board. The finding is accepted.

A phone has no New frame button, so the normal route does not exist. However, a frame draft opened on the tablet layout survives a switch to the phone layout in Display. A drag on empty board then redrew the draft's bounds, and Create and capture saves those bounds.

The fix is in Canvas.tsx: the frame-draw branch now requires `!phone`, so that press pans instead.

The new test "a frame draft left open when the layout turns to phone is not redrawn from the board" is in phone-board.spec.ts. It failed without the guard: the draft bounds changed from -62,-21,620x420 to -101,-60,117x117. It passes with the guard.

An alternative was to close the draft when the layout changes. It lost for two reasons. The frame panel's other fields are still usable on a phone. And discarding typed work because a display setting changed would be a worse surprise than the board declining to draw.

Checks run: `just browser-test` passed 134 with 7 skipped, and `just web-test` passed 554.

**agent:claude/mobile-lead** at 2026-09-24T06:42:06Z

Terva reviewed ac36afe on PR 34 in run 622e72f0, Actions run 233. It marked the frame-draw finding from review 356 as resolved and raised two new findings.

### Medium: "clear the remembered view after the old page unloads" (declined)
The unload handler in App.tsx (`leaving`) calls `flushView`, and `flushView` writes only `pendingView`. The 300 ms debounce timer runs the same `flushView` and clears `pendingView`.

`store()` first waits for `viewSettled`: three matching reads of the scene transform, 150 ms apart, so at least 450 ms of stillness. By then the owed write has already landed and been cleared, so the navigation writes nothing back.

The hazard the reviewer describes is the one the wait already closes. Before that wait existed it did occur, as a card placed for the compact fit. Since then, phone-board has passed 48/48 and 35/35 on repeat runs. The helper's comment now states the unload behaviour explicitly.

### Low: "do not offer frame drawing after switching a draft to phone" (accepted)
`#frameDrawHint` said "Draw on empty canvas…" on a board that now refuses to draw. On the phone layout it now reads "Enter bounds in the frame panel. Escape cancels." The frame-draft test in phone-board.spec.ts asserts that text.

## Summary

On the phone layout the board writes no layout. Everything below keys on `layout === 'phone'`, which `App.tsx` now passes to `Canvas`, so a phone set to `tablet` by hand gets the tablet board back.

- A press on a card starts a pan, which carries the card it landed on (`startGesture` in `web/src/ui/Canvas.tsx`). If the pointer stays within 8 CSS pixels, the lift selects the card and the sheet opens. A pan that moved selects nothing. Pinch, and the pan a finger left after a pinch starts, are unchanged, and so is the link-refusal path.
- `CardView` takes `linkable`. On a phone the link handle is not rendered, and the card gets no `onRelease`, so Manual is a label, as it already was on a read-only board.
- A frame's title is a `span.canvas-frame-label` with `pointer-events: none`, so a finger on it pans. The resize button is not rendered. A tap on it does not open the frame panel, because that panel offers only edits and the label already shows the name and member count (see the plan).
- `#hint` is gone on the phone. On the first visit `button#boardTip` reads "drag to move around · pinch to zoom · tap a card to open it", across the board above New ticket, and hidden while the ticket sheet is open. A tap closes it and stores `tipClosed: true` in `git-ticket-canvas.display`, allowlisted in `recall()`. `useDisplay` keeps it out of the overrides, so the Display panel neither counts nor resets it.

Tests: `tests/browser/phone-board.spec.ts` (6 cases), one new unit test each in `display-preferences.test.ts` and `display-dialog.test.tsx`. On the final tree: web-test 554 passed, browser-test 133 passed / 7 skipped / 0 failed, typecheck, strict tsc on the new spec, dist-verify and the ticket check all pass.

Not done here: the sheet's Return to automatic, its frame membership controls and the `u` key still write layout on a phone. They are filed as TKT-01M38ZB4QPZXM05BHHT72F81MM (Stop the phone's ticket sheet and keyboard from writing layout).
