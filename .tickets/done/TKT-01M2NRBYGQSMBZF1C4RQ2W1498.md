---
schema: 3
id: TKT-01M2NRBYGQSMBZF1C4RQ2W1498
title: Let the toolbar be made larger without zooming the board
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
dependencies:
  - TKT-01M2NHFKXWYHX69YQ7KJRW1MP0
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T18:41:19Z
updated_at: 2026-09-16T18:44:57Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

The toolbar is the one part of the canvas somebody cannot make bigger without making everything bigger. Zooming the browser scales the board too, which is the opposite of what they asked for: the cards were already the right size, it is the row of controls above them that is hard to read and hard to hit.

TKT-01M2NHFKXWYHX69YQ7KJRW1MP0 gave the canvas a display panel with three settings chosen from the window and overridable one at a time. This is a fourth control in the same panel, with one difference worth being honest about: nothing about a window suggests an answer. Physical screen size is not observable — CSS pixels already account for device pixel ratio, so a 27-inch 4K monitor and a 24-inch 1440p one report the same width — so this has a default rather than an automatic choice, and it should say so rather than offering an `Automatic` that means `whatever we picked`.

### What it changes

The header bar and nothing else: the controls in it, their text, and the chips and badges beside them. The board, the cards and the inspector keep their own sizes, because the whole point is to change one without the other.

### Sizes

The current size, and two larger ones. Each must stay at least as big as what a coarse pointer already gets, so that turning this up on a tablet never makes a target smaller than leaving it alone would.

## Acceptance criteria

- [x] The toolbar offers its current size and two larger ones
- [x] Changing it leaves the board, the cards and the inspector alone
- [x] The choice is per person and per browser, beside the other display settings
- [x] A larger size is never smaller than what a coarse pointer already gets
- [x] It is presented as a preference with a default, not as an automatic choice

## Implementation plan

A fourth control in the display panel from TKT-01M2NHFKXWYHX69YQ7KJRW1MP0, in its own section rather than as a fourth row, because it is a different kind of setting: the other three are chosen from the window and this one cannot be. Physical screen size is not observable, so it gets a default and says so rather than offering an `Automatic` that means `whatever we picked`.

`ToolbarScale` joins the display vocabulary in platform, and `toolbar` is stored beside the overrides rather than among them. `useDisplay` splits the two: `Use automatic for all` clears the settings the window chose and leaves the toolbar size alone, because there is nothing to hand a toolbar size back to.

The stylesheet is where the composition problem is. A coarse pointer already enlarges `.tool` and `.chip`, and a larger toolbar must never undo that. Both go through custom properties — `--tool-y`, `--tool-x`, `--chip-y`, `--chip-x` — set on `html` for the pointer and on `#toolbar` for the size, so the inner one wins for header controls and the outer one still reaches the inspector and the dialogs. Each toolbar size is chosen at or above the coarse values, so the inner one winning never means a smaller target.

Scoping every rule to `#toolbar` is what makes this different from browser zoom: the board, the cards and the ticket panel keep their own sizes.

## Notes

**agent:claude/t3code** at 2026-09-16T18:44:40Z

The sizes are hand-picked numbers in a stylesheet, and the rule they have to obey is not visible from any one of them. `web/src/ui/toolbar-scale.test.ts` reads `web/index.html` and checks three things nothing else would notice: that neither toolbar size drops any control below what a coarse pointer already gets, that `larger` beats `large` on every measure, and that every `html[data-toolbar=...]` rule is scoped to `#toolbar` so a future one cannot leak into the board.

Testing a stylesheet by parsing it is unusual and worth being honest about: it proves the numbers are in the right order and the selectors are scoped, and it proves nothing about how any of it looks. That still has to be looked at, and I could not — the preview browser here cannot reach a loopback canvas and the deployed one is behind Authentik, as recorded on TKT-01M2NHFKXWYHX69YQ7KJRW1MP0.

## Summary

The display panel has a Toolbar section with three sizes: Standard, Large, Larger. It changes the header bar and nothing else, which is the thing browser zoom cannot do — the cards were already the right size.

It sits in its own section rather than as a fourth row beside the others, because it is a different kind of setting. The other three are chosen from the window; this one cannot be, since physical screen size is not observable — CSS pixels already account for device pixel ratio, so a 27-inch 4K monitor and a 24-inch 1440p one report the same width. So it has a default rather than an automatic choice and the panel says as much. `Use automatic for all` leaves it alone for the same reason: there is nothing to hand a toolbar size back to.

Standard is the absence of a record, so somebody who tries a larger toolbar and goes back leaves nothing behind.

The composition problem was in the stylesheet. A coarse pointer already enlarges every `.tool` and `.chip`, and turning the toolbar up must never undo that. Both now go through `--tool-y`, `--tool-x`, `--chip-y` and `--chip-x`: the pointer sets them on `html`, the size sets them on `#toolbar`. The inner one wins for header controls while the outer one still reaches the inspector and the dialogs, and each toolbar size is chosen at or above the coarse values so the inner one winning never means a smaller target. `large` matches the coarse padding and raises the text; `larger` exceeds both.

Every rule is scoped to `#toolbar`, which is what keeps the board out of it, and `web/src/ui/toolbar-scale.test.ts` reads the stylesheet and holds that scoping along with the ordering between the sizes. Those are hand-picked numbers with a relationship no single one of them shows.
