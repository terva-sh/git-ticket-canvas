---
schema: 3
id: TKT-01M2NS7JA2TAY6XPYSFT6PWXHM
title: Give the toolbar a deliberate two-row layout
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - ui
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T18:56:24Z
updated_at: 2026-09-16T19:00:08Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

On a 2560×1440 screen the toolbar already overflows: it is one flex row with `flex-wrap`, so the controls fill the width and `New ticket` — the primary action — drops onto a second line alone, at the far left, under the store path. The row is a queue rather than a layout, and which control falls off the end depends on how long the store path is and how many statuses the store defines.

It also reads as an accident, because it is one. Nothing decides that there are two rows; the browser discovers it.

### What to do instead

Two rows on purpose, each with a left and a right group, and the controls placed by what they are about rather than by what fitted.

- The first row is what you are looking at: the canvas and its store on the left, and who you are and what this window chose on the right.
- The second row is working with it: finding things on the left, and changing the view and making things on the right.

The primary action ends up where a primary action belongs, at the end of the working row, rather than wherever the wrap put it.

## Acceptance criteria

- [x] The toolbar is two rows because it was laid out that way, not because it wrapped
- [x] Each row has a left and a right group, and the right group ends at the right edge
- [x] Every control is in the row and group its purpose puts it in
- [x] New ticket is at the end of the working row rather than wherever the wrap left it
- [x] A narrow window still wraps within a row rather than losing a control

## Implementation plan

`#toolbar` becomes a column of two `.toolbar-row` elements, each holding a left `.toolbar-side` and a right one. The right group takes `margin-left: auto` and packs from the right edge, so it grows leftwards and its last control stays where the eye goes looking for it. Both groups keep `flex-wrap`, so a narrow window still folds within a group rather than dropping a control.

Placement follows what each control is about rather than what fitted:

- **context** — the canvas, its store, the board, and adding one, on the left; the read-only badge, `Display` and the account on the right. The badge is a property of the store, so it sits with the store rather than with the counts.
- **working** — search, status chips and labels on the left, with the counts at the end of them because the counts are what the filters left behind; relationships, density, frames, `Arrange`, zoom, `Fit` and then `New ticket` on the right.

A hairline between the rows, so the second reads as the other half of a layout rather than as the overflow of the first.

The toolbar-size rules from TKT-01M2NRBYGQSMBZF1C4RQ2W1498 set `gap` on `#toolbar`, which now means the space between the two rows rather than between controls. They move to a `--row-gap` custom property that the rows and groups read, and keep setting `gap` for the smaller space between the rows themselves.

`.spacer` was the old way the toolbar pushed its right-hand half over. It stays in the stylesheet because the inspector still uses one.

The layout gets a test. Without one the next control lands wherever it was typed, which is exactly how the single row ended up in the order it was in.

## Notes

**agent:claude/t3code** at 2026-09-16T19:00:08Z

`web/src/ui/toolbar-layout.test.tsx` pins the placement by listing the id of every control in each of the four groups, in order. That is a blunt test and it is meant to be: the point is that adding a control has to be a decision about which group it belongs to rather than a line typed at the end of a function, and a test that only counted the rows would not force that.

It renders the toolbar with everything switched on — a store picker, an account, frames, zoom, labels — and again with the subset a desk canvas gets, because the two differ in which groups have anything in them and an empty right-hand group must still hold the edge.

Criterion 5 rests on `flex-wrap` staying on both the row and the group, which the stylesheet has and the test does not check: jsdom lays nothing out, so there is no width at which it could observe a fold. That one wants a real browser.

## Summary

The toolbar is two rows on purpose. It was one row with `flex-wrap`, so on a wide screen the controls filled the width and `New ticket` — the primary action — dropped onto a line of its own at the far left, under the store path. Which control fell off the end moved with the length of the store path and the number of statuses a store defines, so the layout was a property of the data rather than a decision.

`#toolbar` is now a column of two rows, each with a left and a right group. The right group takes `margin-left: auto` and packs from the right edge so it grows leftwards and its last control stays where the eye goes looking for it. Both groups keep `flex-wrap`, so a narrow window folds within a group rather than losing anything.

Placement follows what a control is about. The first row is what you are looking at: the canvas, its store, the board and adding one on the left; the read-only badge, `Display` and the account on the right. The badge is a property of the store rather than of the filters, so it sits with the store. The second row is working with it: search, status chips and labels on the left, with the counts at the end of them because the counts are what the filters left behind; relationships, density, frames, `Arrange`, zoom, `Fit`, and then `New ticket` last, where a primary action belongs.

A hairline between the rows, so the second reads as the other half of a layout rather than as the overflow of the first.

The toolbar-size rules set `gap` on `#toolbar`, which now means the space between the two rows rather than between controls; they set a `--row-gap` that the rows and groups read, and keep `gap` for the smaller space between the rows themselves.

`web/src/ui/toolbar-layout.test.tsx` lists the id of every control in each of the four groups, in order. It is a blunt test deliberately: adding a control should be a decision about which group it belongs to, and a test that only counted rows would not force that.
