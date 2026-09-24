---
schema: 3
id: TKT-01M38QP2WYRK9A18P473KTM9BV
title: Fit the header into one row on a phone
type: task
status: draft
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
updated_at: 2026-09-24T03:34:59Z
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
