# Using the canvas from a phone or a tablet

Design measured against `main` at `0be4e5a`. Nothing in it is built yet.

The canvas was laid out for a mouse on a desk. `TKT-01M2NHFKXWYHX69YQ7KJRW1MP0`
made three settings follow the window (card density, where the inspector sits,
how big targets are) and `TKT-01M2NRBYGQSMBZF1C4RQ2W1498` let the header be made larger, so a
tablet is already usable. A phone is not. On an iPhone in portrait, measured on
the brokkr ledger canvas:

- The header takes more than half the screen. Its two declared rows each wrap
  into three or four, and every control stays visible, including New frame,
  Undo frame, Redo frame, Arrange, and the zoom buttons.
- The hint line (`drag canvas to pan · scroll to zoom · double-click …`) sits
  over the board and describes a mouse.
- Of what is left, the board gets about a third of the height.

Three things in the code decide what can be done about it:

- **The canvas handles one pointer.** `pointerMove` and `pointerUp` in
  `web/src/ui/Canvas.tsx` return early unless `event.isPrimary`, and zoom comes
  only from `wheel` or the toolbar buttons. There is no pinch.
- **`#stage` sets no `touch-action`.** The browser is free to claim a touch
  drag for its own scrolling or zooming and send `pointercancel`, which ends a
  gesture half done. Only the inspector's resize handle sets `touch-action: none`.
- **Adding a relationship requires a drag.** The inspector can remove a
  dependency or a parent and cannot add one; its empty state says "Drag a
  card's right handle onto another to add one". A layout without drags needs
  another way in.

## What each size is for

The decision, taken on 2026-09-24:

| | Phone | Tablet | Desk |
|---|---|---|---|
| Purpose | View and triage | Full editing by touch | Full editing |
| Board | Pan, pinch, tap to open | Everything desk does, by touch | Unchanged |
| List view | Yes, beside the board | Available, not the default | Available, not the default |
| Move cards, draw frames, drag to link | No | Yes | Yes |
| Change a ticket | Yes, in the sheet | Yes | Yes |

A phone is where somebody reads the board and moves a ticket along: changes a
status, adds a note, ticks a criterion, files something they just thought of.
Arranging a board on a 390px screen is possible and is not worth building for.
Everything a phone leaves out is a layout write, and every one of them has
another way in on the same screen, so nothing about a ticket becomes
unchangeable from a phone.

Read-only only would have been smaller. It lost because changing a status from
your pocket is most of the reason to open a board there. Full editing on a phone
was the other option. It lost because each drag gesture would have to be
redesigned twice (once for a finger and once for a screen with no room around
the finger), for work nobody asked to do there.

## Choosing the layout

`layout` becomes a fourth field in `DisplayChoices` (`viewport.ts`), chosen by
`chooseDisplay` and overridable in the Display panel like the other three:

- **`phone`** when the short side of the window is under 600 CSS pixels. The
  short side, not the width, so that a phone turned landscape (844×390) is still
  a phone. A narrow desktop window is 600 or more on its short side and stays
  `desk`.
- **`tablet`** when the pointer is coarse and it is not a phone.
- **`desk`** otherwise.

A phone that somebody wants to edit on can set `tablet` by hand. A small
touch-screen laptop that keeps landing in `tablet` can set `desk`. Both are one
select in a panel that already exists, stored where the other overrides are
stored (`git-ticket-canvas.display` in `localStorage`).

The existing three choices keep their own rules. A phone already gets compact
density, the bottom inspector, and coarse targets from them. `layout` decides
what is offered, not how big it is.

## Gestures, for every layout

The gesture code moves from one pointer to a small set of active pointers.
This comes first because the tablet needs it and the phone's board is not
usable without it.

- `#stage` sets `touch-action: none`, so the canvas owns every touch on it.
  The header, the inspector and the list keep the browser's own scrolling.
- One finger behaves as the mouse does today: pan on empty board, drag on a
  card, link from the handle.
- A second finger landing turns the gesture into a pinch. Zoom follows the
  distance between the two fingers, anchored at their midpoint, and the
  midpoint's travel pans. Whatever the first finger had started is cancelled
  and not saved. A card that was mid-drag goes back to where it was, the way
  `pointercancel` already sends it back.
- Lifting to one finger does not resume a drag. It pans, because a finger
  left behind after a pinch almost never means "now move this card".
- Pinch and wheel both go through `zoomAt`, so the two cannot drift apart on
  limits or anchoring.

## Phone

### The header is one row

Everything that is not needed to find and change a ticket goes into a sheet
or out of the phone layout:

| Stays in the row | Moves to a sheet | Not offered on a phone |
|---|---|---|
| Store and board, as one button that opens a picker | Status and label filters, with the count | New frame, Undo frame, Redo frame |
| Search | Relationships mode, card density, Display, account | Arrange |
| Board / List switch | New board | Zoom buttons (pinch replaces them) |
| Filter button, badged with how many filters are active | | |

New ticket becomes a button fixed at the bottom right of the board and the
list, where a thumb reaches it. The read-only badge stays in the row, because
somebody who cannot write needs to see that before they try.

The version badge, the brand and the store path move into the store picker. A
phone has no room to show a path nobody acts on.

### The board

- Pan with one finger and zoom with two. Tapping a card opens it.
- A drag that starts on a card pans the board. On a phone, a finger landing on
  a card is almost always the start of a pan, and a card moved by accident is
  a layout write somebody then has to find and undo.
- The link handle and the frame handles are not drawn.
- The hint line is gone. The first visit shows a one-line tip ("drag to move
  around · pinch to zoom · tap a card to open it") that closes when tapped and
  does not come back, remembered beside the other display settings.

### The ticket sheet

The inspector already becomes a bottom panel on a portrait screen. On a phone
it becomes a sheet with three heights: a peek that shows the title, status and
the next action; half the screen; and full. It is dragged by its handle
between them, and dragging it below the peek closes it. The board stays
visible and pannable above a peek or half sheet, so tapping another card
changes which ticket the sheet shows without closing it.

Status, priority, the checklist, notes and every text field work as they do
now. Relationships gain an add control, below.

### Adding a relationship without a drag

The inspector gets **Add dependency…** and **Set parent…**. Each opens a
picker that searches the store by ID and title, the same way `Filter` does,
and excludes the ticket itself and anything that would close a cycle. This
applies to every layout, not only phones: a keyboard user has the same problem
a phone does, and the drag stays as the fast path where there is a pointer.

### The list

A **Board / List** switch in the header. The list groups tickets by status in
the store's status order, uses the filters and the search exactly as the board
does (through `matchesTicket`, so a count cannot disagree between them), and
opens the same sheet when a row is tapped. A row carries title, ID, priority,
labels, and criterion progress, which is the content of a compact card laid
out in a line.

The switch is a per-person, per-browser preference stored with the other display
settings. The first time a phone opens a board it shows the board, not the
list. It is a canvas, and somebody who wanted a list will find the switch next
to the search box.

The list is available on tablet and desk as well, because building it only
for phones would mean building a condition. It is not the default on either.

## Tablet

A tablet gets everything a desk does. The work is making each thing reachable
without a mouse:

- **Pinch and two-finger pan**, from the gesture work above.
- **Card, link and frame drags that survive touch.** Mostly `touch-action`.
  Each drag gets a test that runs it from a touch pointer, not just from a
  mouse.
- **Long-press to select.** Shift-click has no touch equivalent. Holding a
  card for 450 ms without moving more than 8 px adds it to the selection and
  enters selection mode, shown in the header with a count and a Done button.
  While in selection mode a tap toggles a card. A drag from any selected card
  moves them all, as shift-selection does now. Done, or a tap on empty board,
  leaves selection mode.
- **Nothing that needs hover.** The hint line is chosen by pointer, so a
  coarse pointer reads "drag to pan · pinch to zoom · double-tap to file a
  ticket · hold a card to select several". Edge names, which today appear on
  hover or on selection, appear on a tap on the edge. Any `title` attribute
  that carries the only explanation of a control gets a visible label or moves
  into the help.
- **Double-tap to file a ticket.** `dblclick` is what the stage listens for,
  and whether a browser still synthesises it once `touch-action` is `none`
  varies. The stage detects a second tap within 300 ms and 24 px itself, and
  does not trust `dblclick` for touch.

## Testing

Each ticket carries its own browser checks. The harness adds two emulated
devices: a phone at 390×844 and a tablet at 820×1180, each with `hasTouch` and
`isMobile`. Pinch is driven through CDP `Input.dispatchTouchEvent` with two
touch points, because Playwright's `touchscreen` API taps and does not move.
Screenshots of the phone header and the sheet join the canvas baselines.

Real devices are checked by hand once the phone layout lands, on the brokkr
ledger canvas, with what was checked written into the ticket.

## What this does not do

- It does not make a phone able to arrange a board. `tablet` set by hand is the
  way to do that, and it is not tested at phone size.
- It does not add offline support or install the canvas as an app.
- It does not change what density follows. That question is
  `TKT-01M2NV3WMAD902MKM5REAT4FTA` (Decide what density should follow now that the viewport
  chooses it), and a phone's compact default is unaffected by either answer.

## Phases

1. Gestures: multiple pointers, pinch, `touch-action`. Needed by every later
   phase.
2. The `layout` choice and its override. Nothing visible changes except the
   Display panel.
3. The phone header, the phone board rules, and the sheet.
4. Adding a relationship from the inspector. Independent, and useful on a desk
   the day it lands.
5. The list.
6. Tablet selection and hover-free help.
