---
schema: 3
id: TKT-01M38QP2WYRK9A18P473KTM9BV
title: Fit the header into one row on a phone
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

On a phone the header wraps its two rows into six or more and takes over half the screen.

In the `phone` layout, keep only these in one row: a store-and-board button that opens a picker, the search field, a Board/List switch (held back until the list exists), and a Filter button that shows how many filters are active. The status and label filters and the count move into a filter sheet. Relationships mode, card density, Display, account and New board move into a menu. New frame, Undo frame, Redo frame, Arrange and the zoom buttons are not offered. New ticket becomes a button fixed at the bottom right. The read-only badge stays in the row. The brand, store path and version move into the store picker.

See `docs/mobile-design-v1.md`, "The header is one row".

## Acceptance criteria

- [x] On the emulated phone the header is one row in portrait and in landscape
- [x] Every control that moved can still be reached from the filter sheet, the menu or the store picker
- [x] Frame, arrange and zoom controls are absent in the phone layout and present on tablet and desk
- [x] New ticket sits at the bottom right within thumb reach and is disabled when read-only
- [x] A phone baseline screenshot of the header is added
- [x] Tablet and desk headers are unchanged
- [x] Pens, the label filter, the store picker and the version details each have a place on a phone: Pens is not offered, the rest move to the filter sheet or the store picker
- [x] The header stays one row at every toolbar size on the emulated phone, and the page does not widen (expectFitsDevice)

## Implementation plan

Read before writing: `Toolbar.tsx` renders two declared rows (context, working), each with a left and a right group, and `toolbar-layout.test.tsx` pins which id sits in which group. `App.tsx` sets `html[data-layout]` from `display.settings.layout` in an effect and renders `<Toolbar>` inside `#toolbarRoot`. The inspector is `aside#inspector` inside the stage, `z-index: 15`, with class `open` while a ticket is shown; on a portrait phone it is a bottom sheet (`data-inspector="bottom"`), and its footer buttons sit along the bottom edge. The label filter, version and store picker are `details` popovers whose bodies are absolutely positioned.

### Changes

- `Toolbar.tsx`: a `layout` prop. When it is `phone`, `Toolbar` returns `PhoneToolbar` instead of the two rows. `LabelFilter` and `Version` are exported, and the status chips become an exported `StatusFilters`, so both headers render the same controls. The desk and tablet markup does not change.
- `PhoneToolbar.tsx` (new): one row of store-and-board button (`#phoneStore`, shows the board; the store is in its accessible name), `#search`, `#roBadge`, `#phoneFilter` (badged with the number of status and label filters on), and `#phoneMenu`. Each button opens one sheet hanging from the header:
  - store: brand, `#storePath`, `#version`, `StorePicker`, `#boardSelect`
  - filters: `#statusFilters`, `#labelFilter`, `#counts`
  - menu: `#relationshipMode`, `#cardDensity`, `#btnFit`, `#btnDisplay`, `#btnAccount`, `#newBoard`
  One sheet at a time; the same button, Escape, or a pointer landing outside the header closes it. Controls keep their desk ids; only one header is ever rendered, so no id is doubled.
  Not rendered: New frame, Undo frame, Redo frame, Arrange, Pens, zoom.
- `PhoneToolbar.css` (new): every rule keyed on `html[data-layout="phone"]`. The row does not wrap; the search takes the remaining width and the store button truncates first. Gaps and side padding are held down at each toolbar size, and the row's buttons pad in `em`, so `large` and `larger` still scale text and target height. Popovers inside a sheet open in place (static), because the sheet scrolls and would clip them.
- `App.tsx`: one prop at the `<Toolbar>` call site, `layout={display.settings.layout}`, and a corrected comment on the `data-layout` line. Nothing near `link()`.

### New ticket, and the ticket sheet

`#btnNew` on a phone is `.phone-new`, fixed at the bottom right (16px in, plus the safe-area inset), at least 48px tall, disabled when read-only. The inspector sheet's controls sit along the same bottom edge. Two things keep the button off them:

1. It is rendered as a sibling of `#toolbar`, not inside it. `#toolbar` becomes a stacking context on a phone (so its sheets sit over the board), and anything inside would stack over the inspector too. Outside, its `z-index: 14` is weighed against the inspector's 15, so a peek or half sheet covers the button rather than the button covering the sheet.
2. `html[data-layout="phone"]:has(#inspector.open) #btnNew.phone-new { display: none }` hides it outright while a ticket is open, which holds even if the bottom-sheet ticket changes the inspector's stacking. It depends only on `#inspector` keeping the `open` class.

Header sheets hang from the top, not the bottom, so they never compete with the ticket sheet for the bottom edge.

### Tests

- `web/src/ui/phone-toolbar.test.tsx`: the row, what is absent, each sheet's contents and actions, the badge count, closing rules, read-only.
- `web/src/ui/toolbar-layout.test.tsx`: tablet and desk render byte-identical markup to a toolbar with no layout.
- `tests/browser/phone-header.spec.ts` with `test.use(phone)` and a landscape 844x390 phone: one row at standard, large and larger (read-only, the widest row) with `expectFitsDevice`; absent controls; New ticket position, size and action; every moved control reachable and working from its sheet; the button hidden while the inspector is open; a phone set to desk gets the desk header and a desk set to phone gets the phone header; tablet and desk still show two rows with every control. An opt-in `CANVAS_VISUAL` element screenshot, `phone-header.png`, in the artifact directory `snapshotPathTemplate` points at.

### Rejected

- CSS only: render both headers' controls and hide by `data-layout`. The moved controls have ids (`#boardSelect`, `#labelFilter`, `#counts`...), and a sheet showing them while the desk copies sit hidden doubles every id. Restyling the desk groups into sheets in place does not work either: the menu takes controls from three different groups in two rows.
- Choosing the header by a width media query. Rejected by the design: a person can override the layout, and a landscape phone is 844px wide.
- Reading `document.documentElement.dataset.layout` inside Toolbar instead of a prop. It is written in an effect after render and nothing re-renders the toolbar when it changes. The prop is the same value, from the same setting, so it follows an override the same way.
- Sheets from the bottom of the screen. The ticket sheet owns that edge.
- Showing store and board both on the button. A store name is usually a repository name, and at the larger size on a phone it left one letter; the board is what changes while somebody works, and both are named in the sheet and in the button's accessible name.
- The Board/List switch: held back until TKT-01M38QP3ZNYRPN60GXQD4SCE6M (List tickets by status as well as on the board) exists.

## Notes

**agent:claude/t3code** at 2026-09-24T05:01:53Z

Groomed 2026-09-24 against main at 79b233f. The layout this reads is `html[data-layout]`, set in `App.tsx` beside `data-targets` and `data-inspector`. Toolbar.tsx has four controls the design's table did not place:

- **The store picker** (`StorePicker`, shown when the canvas serves several stores). It goes into the store-and-board picker with the board select.
- **Pens** (`#btnPens`). It authors the board's rules, a layout write, so it belongs with frames and Arrange: not offered on a phone.
- **The label filter** (`details#labelFilter`, with its match-mode chips). It goes into the filter sheet with the status chips.
- **The version details** (`details#version`). They go into the store picker with the brand and path, as the design says.

The toolbar-size preference (`data-toolbar`, TKT-01M2NRBYGQSMBZF1C4RQ2W1498) still applies on a phone, and a larger size must not break the one row. There is a criterion for that. The phone spec should use `test.use(phone)` and `expectFitsDevice` from `tests/browser/touch.ts`.

**agent:claude/mobile-header** at 2026-09-24T05:26:12Z

Implementation notes for the sibling tickets and for review.

- Fit was not placed by the design. It is in the phone menu as "Fit all cards", because a pinch cannot find cards that are off the screen and the `f` key is not available on a phone.
- The store-and-board button shows the board name only. The store's name is in its accessible name and tooltip, and both are in the sheet. With the store name first, the larger toolbar size on a read-only phone left `g.` on the button.
- The phone search placeholder is "Search", not the desk's "Filter  /", so it cannot be confused with the Filter button beside it.
- Three existing desk specs resize a mouse window to 390 wide, which is a phone by the layout rule, and they clicked `#btnFit` or read `#version` from the row. They now open the menu or the store sheet first: `baseline.spec.ts` (toolbar labels the server build), `frames.spec.ts` (frame panel fits the narrow-screen layout), `readability.spec.ts` (narrow inspector occupies a full-width row). Before that change all three failed on this branch; after it the whole browser suite passed.
- For TKT-01M38QP3EV026GJY91GE3CG0J6 (Open a ticket in a bottom sheet on a phone): New ticket hides while `#inspector` has the `open` class. The rule is `html[data-layout="phone"]:has(#inspector.open) #btnNew.phone-new` in `web/src/ui/PhoneToolbar.css`. If the sheet stops using that class, the button falls back to stacking under the inspector at `z-index: 14` against its 15.
- For TKT-01M38QP373BAE8X6Q9F3G8E7SY (Keep a phone's board to panning, zooming and opening cards): until the hint line goes, its right end runs under New ticket at the bottom right of a portrait phone. The first-visit tip that ticket adds should stay clear of the bottom-right 48px-tall button.

**agent:claude/t3code** at 2026-09-24T05:38:44Z

Opened with its two wave 1 siblings as PR 33, https://git.local.sothr.com/terva-sh/git-ticket-canvas/pulls/33, from t3code/mobile-wave-1. On the merged head: web-test 552 passed, browser-test 127 passed / 7 skipped / 0 failed, dist-verify byte-identical, ticket check clean. A Terva review is requested next; its result is recorded here when it lands.

**agent:claude/t3code** at 2026-09-24T05:55:34Z

Merged to main through PR 33 (https://git.local.sothr.com/terva-sh/git-ticket-canvas/pulls/33) at 9a1d66b on 2026-09-24, under the maintainer's direction to carry the batch through to completion. The Terva review on d8e2d90 was clean (run 4616fcaf-2e07-4ba4-82e8-64b2029426d2). CI failed once (run 226, a flake whose log was unreadable) and passed on rerun (run 228, c7a4da4). Closed with the merge recorded; the summary above stands as written by the implementing agent.

## Summary

On a phone the header is one row: a store-and-board button, the search, the read-only badge when it applies, a Filter button badged with the number of status and label filters on, and a menu button. Tablet and desk render the same two rows as before, byte for byte.

`Toolbar` takes a `layout` prop, which `App.tsx` passes from `display.settings.layout`, the same value it writes to `html[data-layout]`. So a layout override in the Display panel changes the header either way. At `phone`, `Toolbar` returns `PhoneToolbar` (`web/src/ui/PhoneToolbar.tsx`), styled by `web/src/ui/PhoneToolbar.css`, with every rule keyed on `html[data-layout="phone"]`. Each button in the row opens one sheet that hangs from the header:

- store: brand, store path, version details, the store picker when there are several stores, and the board select
- filters: status chips, the label filter, and the count
- menu: relationships, card density, Fit, Display, account, and New board

New frame, Undo frame, Redo frame, Arrange, Pens and the zoom buttons are not rendered. Moved controls keep their desk ids, and only one header is rendered, so no id appears twice. `StatusFilters`, `LabelFilter` and `Version` are shared between the two headers.

New ticket is `#btnNew.phone-new`, fixed 16px from the bottom right, 48px tall, and disabled when read-only. It sits outside `#toolbar`, so it stacks under the inspector (14 against 15), and it is hidden while `#inspector.open` exists. It therefore never covers the ticket sheet's controls. The Board/List switch is held back for TKT-01M38QP3ZNYRPN60GXQD4SCE6M (List tickets by status as well as on the board).

Tests:
- `web/src/ui/phone-toolbar.test.tsx`, 8 tests.
- `web/src/ui/toolbar-layout.test.tsx`: tablet and desk markup identical to no layout.
- `tests/browser/phone-header.spec.ts`, 18 tests: one row in portrait and at 844x390 at each toolbar size, with `expectFitsDevice`; absent controls; New ticket position and action; every sheet's controls working; New ticket hidden while a ticket is open; the layout override in both directions; tablet and desk still two rows with every control.
- The phone baseline `phone-header.png` sits in the snapshot directory and is compared only with `CANVAS_VISUAL=1`, like the canvas baseline, because CI's Chromium draws text differently.
- Three desk specs that resize to 390 wide now open the menu or the store sheet first.

With the one-row rules and the `:has` rule removed, the portrait one-row tests and the hidden-button test failed.

Not done here: the hint line still runs under New ticket on a portrait phone until TKT-01M38QP373BAE8X6Q9F3G8E7SY (Keep a phone's board to panning, zooming and opening cards) removes it.
