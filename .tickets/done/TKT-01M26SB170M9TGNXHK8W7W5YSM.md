---
schema: 3
id: TKT-01M26SB170M9TGNXHK8W7W5YSM
title: Filter the canvas by label with include and exclude states
type: task
status: done
status_reason: null
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
updated_at: 2026-09-11T05:55:18Z
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

- [x] Every label in the store appears as a filter control that cycles unselected, include, exclude.
- [x] The three states are distinguishable without hovering, and the control reports its state to a screen reader.
- [x] The card count in the toolbar reflects the label filters, as it does for the status filters.
- [x] Label filters and status filters combine by the documented rule, with a test for each combination.

## Implementation plan

Written after reading the source, so it corrects one thing the decisions assumed.

`Schema.labels` comes from `cfg.Labels` in `config.yml` (`server.go:384`), and this store has `labels: []` because it does not enforce labels. Every ticket here carries `ui`, `canvas`, `idea` and so on. A control built from `config.labels` alone would therefore be empty in this repository, which is the main place the canvas runs. The chip list is the union of `config.labels` and the labels the tickets actually carry, sorted. That keeps the user's decision, which was to avoid a board-scoped list, and it still works where labels are unenforced. Configured labels appear even when no ticket uses them.

1. New pure module `web/src/platform/tickets/filters.ts`, Preact-free like the rest of `platform`: `LabelFilters` as a `ReadonlyMap<string, 'include' | 'exclude'>` that holds only the labels in a state, `cycleLabel` returning the next map for unselected to include to exclude to unselected, `labelUniverse(config, tickets)` for the sorted union, and `matchesLabels(ticket, filters)` for the rule. Excludes are checked first, so an excluded label hides a card whatever the includes say. Includes intersect, so each further include narrows. An empty map matches everything.

2. `App.tsx` holds `labelFilters` in `ui` and passes it to `matches`, which already gates both the rendered cards and the `counts` string, so the count follows for free rather than needing its own path.

3. `Toolbar.tsx` gains one `Labels` button that opens a popover holding the chips. The button summarizes the active filters. Each chip is a button with `aria-pressed` plus a visible state marker, so the three states read without hovering and announce to a screen reader. Escape closes the popover and returns focus to the button.

4. Tests in three layers: unit tests for the pure rule including every include/exclude and status combination, a component test for the popover's cycling and its accessible state, and a browser test that filters a real board and checks the card count.

## Notes

**agent:terva/mieli** at 2026-09-11T05:23:42Z

draft to ready: The user selected this for the next work after reviewing the merged idea tickets.

**agent:terva/mieli** at 2026-09-11T05:28:02Z

The user decided the two open questions the Description left.

Placement: one `Labels` button in the toolbar opens a dropdown or popover holding the chips. The button summarizes the active filters, so the current state is readable without opening the popover. This keeps the status row intact and does not commit a second permanent toolbar row.

Scope: the chip list covers every label in the store, not only the labels the current board uses. The control then stays stable as tickets and boards change, at the cost of showing labels that match nothing on this board.

The combining rule in the Description is unchanged and was already decided: includes intersect, excludes win over includes, and label filters AND with status filters.

**agent:terva/mieli** at 2026-09-11T05:55:04Z

Two things the next reader should know, one of which refines a decision rather than following it.

The chip list is the union of `config.labels` and the labels tickets carry, not `config.labels` alone. `Schema.labels` is `cfg.Labels` straight from `config.yml` (`server.go:384`), and this store has `labels: []` because it does not enforce labels, while every ticket in it carries `ui`, `canvas`, `idea`. Building the control from configuration alone would have produced an empty popover in the repository the canvas mostly runs against. The union honours the decision, which was to avoid a board-scoped list, and a configured label that no ticket uses still appears. Worth confirming if a store that does enforce labels should instead show only the configured ones.

The canvas had a second filter predicate. `CardView.tsx` exported its own `matches`, and that was what dimmed cards, while `App.tsx` had a near-identical copy for the toolbar count. Two copies of one rule meant a label filter wired into App alone would have moved the count while leaving every card lit. Both are gone, replaced by `matchesTicket` in `web/src/platform/tickets/filters.ts`, which `App` counts with and `Canvas` dims with. The platform version keeps the defensive `ticket.labels || []` reading that the canvas copy had, because test fixtures build partial tickets.

The popover is a native `details`, the same construction as the `#version` panel beside it, so keyboard reach and Escape come from the platform rather than from focus code of mine. The plan said the chips would carry `aria-pressed`; they do not. That attribute is binary and would report an excluded label as merely not pressed. The state rides in the accessible name instead, as `ui, included` or `canvas, excluded`.

**agent:terva/mieli** at 2026-09-11T05:55:16Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-5 Every label in the store appears as a filter control that cycles unselected, include, exclude. — Toolbar.tsx renders one chip per entry of labelUniverse inside a native details popover, and App passes the union of config.labels and ticket labels. forms.test.tsx 'offers every store label as a chip and cycles it through include and exclude' covers the chip list and each rendered state; filters.test.ts covers the cycle order itself.
- [x] task-6 The three states are distinguishable without hovering, and the control reports its state to a screen reader. — Each chip carries a leading mark (+, minus, middot) plus its own border, colour, and line-through per data-state, so the state does not depend on colour alone or on hovering. The accessible name states it outright: 'ui, included', 'canvas, excluded', 'idea, not filtered'. forms.test.tsx 'distinguishes the three chip states without hovering and names each one' asserts both. Verified in markup, not against a live screen reader.
- [x] task-7 The card count in the toolbar reflects the label filters, as it does for the status filters. — App's counts string and Canvas's dimming now share matchesTicket, so they cannot disagree. Browser test 'label filters narrow the board and the count, with excludes winning' walks 3 of 3 to 2 of 3 to 1 of 3 and back, checking the dimmed card each time; 'label filters and status filters narrow together' reaches 0 of 2.
- [x] task-8 Label filters and status filters combine by the documented rule, with a test for each combination. — web/src/platform/tickets/filters.ts holds the whole predicate; web/src/platform/tickets/filters.test.ts covers includes intersecting, excludes winning over includes, label AND status in all four combinations, label AND query, and the no-label card. The suite failed on the missing module first, then 461 tests pass.

## Summary

One `Labels` button in the toolbar opens a native `details` popover holding a chip per label, each cycling unselected to include to exclude. The button reads `Labels: 2 in, 1 out` when the popover is shut. Includes intersect, excludes win over includes, and label filters AND with status and search.

The rule lives in the new `web/src/platform/tickets/filters.ts`, Preact-free like the rest of `platform`. It replaced two near-identical copies of the filter predicate, one in `App.tsx` for the toolbar count and one exported from `CardView.tsx` for dimming cards. `App` and `Canvas` now share `matchesTicket`, so the count and the dimmed cards cannot disagree.

The chip list is the union of `config.labels` and the labels tickets carry. This store configures none, so a control built from configuration alone would have been empty here.

Evidence: 19 new tests. `filters.test.ts` covers the rule and the universe, `forms.test.tsx` covers the chips and their accessible names, and `label-filters.spec.ts` drives a real board from 3 of 3 down to 0 of 2. `just web-test` passes 465 unit tests, both browser tests pass by name, and `just check` passes. `web/dist` was rebuilt because the change is in an embedded asset.
