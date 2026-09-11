---
schema: 3
id: TKT-01M26SB170M9TGNXHK8W7W5YSM
title: Filter the canvas by label with include and exclude states
type: task
status: ready
status_reason: The user selected this for the next work after reviewing the merged idea tickets.
priority: normal
due_on: null
labels:
  - idea
  - ui
  - labels
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-10T23:09:41Z
updated_at: 2026-09-11T05:28:02Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

The toolbar filters by status today. `Toolbar.tsx:51` renders one chip per status from `snapshot.config.statuses`, `App.tsx:341` toggles the name in and out of `ui.filters`, and `App.tsx:316` drops any ticket whose status is not in that set. Labels get no such control, so finding every `frontend` card means typing into the search box and hoping no description happens to contain the word.

Add the same kind of control for labels, with one difference. A ticket carries one status, so a status chip is a checkbox. A ticket carries many labels, so a label chip is three-state: unselected, include, exclude. Exclude is the part that makes this worth building, because it removes a whole band of cards without naming every label you do want.

The combining rule, decided: includes intersect. Setting `frontend` and `backend` to include shows only the cards that carry both, so each further include narrows the board. Excludes win over includes, so a card carrying an excluded label is hidden whether or not it matches every include. Label filters and status filters then combine as an AND, which is how the two rows read.

Two things still to decide. Where the label chips live, given that a store with thirty labels will not fit the status row. And whether the chip list covers every label in the store or only the ones the current board uses.

## Acceptance criteria

- [ ] Every label in the store appears as a filter control that cycles unselected, include, exclude.
- [ ] The three states are distinguishable without hovering, and the control reports its state to a screen reader.
- [ ] The card count in the toolbar reflects the label filters, as it does for the status filters.
- [ ] Label filters and status filters combine by the documented rule, with a test for each combination.

## Notes

**agent:terva/mieli** at 2026-09-11T05:23:42Z

draft to ready: The user selected this for the next work after reviewing the merged idea tickets.

**agent:terva/mieli** at 2026-09-11T05:28:02Z

The user decided the two open questions the Description left.

Placement: one `Labels` button in the toolbar opens a dropdown or popover holding the chips. The button summarizes the active filters, so the current state is readable without opening the popover. This keeps the status row intact and does not commit a second permanent toolbar row.

Scope: the chip list covers every label in the store, not only the labels the current board uses. The control then stays stable as tickets and boards change, at the cost of showing labels that match nothing on this board.

The combining rule in the Description is unchanged and was already decided: includes intersect, excludes win over includes, and label filters AND with status filters.
