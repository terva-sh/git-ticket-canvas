---
schema: 3
id: TKT-01M38QP373BAE8X6Q9F3G8E7SY
title: Keep a phone's board to panning, zooming and opening cards
type: task
status: in-progress
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
updated_at: 2026-09-24T05:42:23Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/mobile-board
  name: ""
extensions: {}
---

## Description

A phone is for viewing and triage, so its board does not write layout.

In the `phone` layout, a drag that starts on a card pans the board, and a tap opens the card. The link handle and the frame handles are not drawn. The hint line goes. On the first visit a one-line tip appears ("drag to move around · pinch to zoom · tap a card to open it"); tapping it closes it, and it is remembered with the display settings so it does not come back.

See `docs/mobile-design-v1.md`, "The board".

## Acceptance criteria

- [ ] On the emulated phone a drag from a card pans and saves nothing, with a test
- [ ] A tap on a card opens it
- [ ] No link or frame handle is drawn on a phone
- [ ] The first-visit tip shows once, closes when tapped, and stays closed after a reload
- [ ] Setting the layout to tablet by hand brings card drags, handles and the hint back
- [ ] The Manual placement control on a card does not hand the card back on a phone

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
