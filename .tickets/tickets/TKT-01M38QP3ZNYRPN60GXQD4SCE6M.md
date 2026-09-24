---
schema: 3
id: TKT-01M38QP3ZNYRPN60GXQD4SCE6M
title: List tickets by status as well as on the board
type: task
status: in-progress
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
  - TKT-01M38QP2WYRK9A18P473KTM9BV
blocks_on: none
references: []
claim:
  actor: agent:claude/mobile-list
  branch: worktree-agent-a752f78af0b9e1231
  worktree: /home/sothr/workspace/git.local.sothr.com/terva-sh/git-ticket-canvas/.claude/worktrees/agent-a752f78af0b9e1231
  commit: 5389071f510222a6008ff7deb307c6f2074d7043
  session: null
  claimed_at: 2026-09-24T13:18:00Z
  expires_at: null
archive: null
created_at: 2026-09-24T03:34:58Z
updated_at: 2026-09-24T13:33:49Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/mobile-list
  name: ""
extensions: {}
---

## Description

Add a list view as an alternative to the board, switched by the Board/List control in the header. It groups tickets by status in the store's status order. It filters through `matchesTicket`, the same function the board and the count use, so the list and the count can never disagree. Tapping a row opens the same inspector or sheet. A row carries the title, ID, priority, labels and criterion progress.

The choice is stored per person and per browser with the display settings. A phone opens on the board the first time. The list is available on every layout and is the default on none.

See `docs/mobile-design-v1.md`, "The list".

## Acceptance criteria

- [ ] Board/List switches the view and the choice survives a reload
- [ ] The list shows the same tickets the board shows under every filter and search, with a test
- [ ] Tapping a row opens the ticket in the inspector or sheet
- [ ] Live updates reach the list as they reach the board
- [ ] A phone baseline screenshot of the list is added
- [ ] A touch drag scrolls the list on the emulated phone and tablet, carried from TKT-01M38QP2CZEJ120PFDKMK3WTP1's first criterion

## Implementation plan

### Where the list lives

The list is one more child of `Canvas`, rendered by `App` beside `#formsRoot` only while the view is `list`. It covers the stage with an opaque, scrolling panel (`#ticketList`, `position: absolute; inset: 0`) that sits under the inspector (z-index 15) and over the board's hint and tip (10). The board stays mounted underneath, so its view, its measurements and its live state carry on, and switching back is instant. `Canvas.canvasTarget` already treats any child it does not know as an overlay, and its wheel handler asks the same function, so a finger, a mouse or a wheel on the list starts no board gesture and needs no change to `Canvas.tsx`. The inspector, the phone's sheet, the composer and the toast are already children of the stage, so a row opens exactly the inspector or sheet a card does, through the same `select`.

The list is a scroll container. `#stage` sets `touch-action: none`, and Chromium stops intersecting ancestors' touch-action at the nearest scroll container, which is why the inspector body already scrolls under a finger (pinch.spec.ts holds that). The list relies on the same rule, and a browser test on the emulated phone and tablet holds it.

### What it shows

`web/src/platform/tickets/list.ts` holds one pure function, `listGroups(tickets, filters, statuses, priorities)`. It keeps the tickets `matchesTicket` accepts, the same predicate the board dims with and the toolbar counts with, groups them by status in the store's status order, and sorts each group the way a pen sorts its cards: more urgent first, then by ID. A status the configuration does not name goes after the configured ones rather than disappearing. Empty groups are left out. It gets a table test.

`web/src/ui/TicketList.tsx` renders a heading per group with its count, and a row per ticket. A row is a `<button>` carrying the title, short ID, priority, labels and criterion progress (the content of a compact card in a line), with `aria-current` on the selected ticket. Pressing it calls `onSelect`, which is App's `select`, the path a card tap takes.

### The switch and the preference

`StoredDisplay` gains `view?: 'list'`. Board is the absence of a record, like the default toolbar size, so a phone opens on the board the first time and nobody who never switched has anything stored. `recall` rebuilds it from its own allowlist. `useDisplay` exposes `view` and `chooseView`, and `reset` leaves it alone: it is a preference, not something the window asked for.

The switch is a two-button group, `#viewBoard` and `#viewList` with `aria-pressed`, in `ViewSwitch` inside Toolbar.tsx so the desk and phone headers share it. On the desk and tablet header it opens the working row, beside the search box, where the design says somebody will find it. On the phone it sits in the row between the search and the read-only badge. The phone-header one-row tests at all three toolbar sizes decide whether two buttons fit; if they do not, the phone shows only the button for the other view.

### App.tsx, kept small

Three places, all in the render, none near the keyboard handler: an import, `view`/`onView` passed to `Toolbar`, and `{display.view === 'list' && <TicketList .../>}` as a child of `Canvas` before `#formsRoot`. Live updates need nothing: the list reads `snapshot.tickets`, which `publish` replaces.

### Tests

- Unit: `listGroups` order, filtering and unknown statuses; `recall` keeps `view: 'list'` and drops anything else; the phone and desk headers carry the switch.
- Browser (`tests/browser/list.spec.ts`): the choice survives a reload; under a table of status, label (include, exclude, any) and search filters the list's rows are exactly the board's undimmed cards and the count agrees; tapping a row on the phone opens the sheet and clicking one on the desk opens the inspector; an external change reaches a row; a touch drag scrolls the list on the phone and tablet and moves no board view.
- A phone list baseline, opt-in under `CANVAS_VISUAL` like `phone-header.png`, beside it in the artifacts directory. The phone header baseline is regenerated, because the switch is new in that row.

### Alternatives

- Replacing the canvas with the list (unmounting `Canvas`). Rejected: the inspector and every other panel are the canvas's children, so the list would need its own copy of that tree or App would need restructuring, and the board would lose its view on every switch.
- Rendering the list outside `Canvas` and hiding the stage with CSS. Rejected for the same reason: hiding the stage hides the inspector with it.
- Filtering in the list with its own predicate. Rejected by the ticket: the list and the count must not be able to disagree.
- Storing the view under its own localStorage key. Rejected: the display record is the one allowlist and the design puts it there, as it did `tipClosed`.
- A single toggle button everywhere. Cheaper in width, but the two-button group says which view is showing without having to read the screen behind it; kept as the phone fallback only.

## Notes

**agent:claude/mobile-list** at 2026-09-24T13:33:49Z

Built as planned, with one change on the phone. Two buttons (Board, List) pushed the read-only phone row 17px past 390px at the larger toolbar size, with every other control at its floor. The phone now has one `List` toggle, `aria-pressed` while the list shows. Even that overflowed by 3.8px at the larger size, so at that size only, the toggle's side padding drops to .25em, the row gap to 7px, and the search box's floor to 3.5em. Measured slack there is now about 6px under this machine's fonts. The desk and tablet keep the two-button group. The design doc records the difference under "The list".

Where the baselines live: the task brief pointed at tests/browser/baseline.spec.ts, but that spec holds no screenshots. The phone header baseline is in tests/browser/phone-header.spec.ts, opt-in under CANVAS_VISUAL. The new phone list baseline follows it in tests/browser/list.spec.ts and writes docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/phone-list.png. phone-header.png is regenerated because the row gained the toggle. `--update-snapshots` kept the old header image when the difference was under tolerance, so the file was deleted and written again. The artifacts README says so.
