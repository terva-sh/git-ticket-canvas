---
schema: 3
id: TKT-01M38QP2WYRK9A18P473KTM9BV
title: Fit the header into one row on a phone
type: task
status: ready
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
updated_at: 2026-09-24T05:01:54Z
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

- [ ] On the emulated phone the header is one row in portrait and in landscape
- [ ] Every control that moved can still be reached from the filter sheet, the menu or the store picker
- [ ] Frame, arrange and zoom controls are absent in the phone layout and present on tablet and desk
- [ ] New ticket sits at the bottom right within thumb reach and is disabled when read-only
- [ ] A phone baseline screenshot of the header is added
- [ ] Tablet and desk headers are unchanged
- [ ] Pens, the label filter, the store picker and the version details each have a place on a phone: Pens is not offered, the rest move to the filter sheet or the store picker
- [ ] The header stays one row at every toolbar size on the emulated phone, and the page does not widen (expectFitsDevice)

## Notes

**agent:claude/t3code** at 2026-09-24T05:01:53Z

Groomed 2026-09-24 against main at 79b233f. The layout this reads is `html[data-layout]`, set in `App.tsx` beside `data-targets` and `data-inspector`. Toolbar.tsx has four controls the design's table did not place:

- **The store picker** (`StorePicker`, shown when the canvas serves several stores). It goes into the store-and-board picker with the board select.
- **Pens** (`#btnPens`). It authors the board's rules, a layout write, so it belongs with frames and Arrange: not offered on a phone.
- **The label filter** (`details#labelFilter`, with its match-mode chips). It goes into the filter sheet with the status chips.
- **The version details** (`details#version`). They go into the store picker with the brand and path, as the design says.

The toolbar-size preference (`data-toolbar`, TKT-01M2NRBYGQSMBZF1C4RQ2W1498) still applies on a phone, and a larger size must not break the one row. There is a criterion for that. The phone spec should use `test.use(phone)` and `expectFitsDevice` from `tests/browser/touch.ts`.
