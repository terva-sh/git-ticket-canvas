---
schema: 3
id: TKT-01M2NHFKWXXZQYG0MQ2V81MHD3
title: Give the canvas a zoom control that remembers where you left it
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
created_at: 2026-09-16T16:40:59Z
updated_at: 2026-09-16T17:19:22Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

Zoom is scroll-only. There is no control that shows the current level, no way to get back to 1:1 without scrolling until it looks right, and the level is forgotten on every reload, so a board opened twice is a board at two sizes.

`Fit` exists and is a different thing: it frames everything, which is what you want when you have lost the board and not what you want when you have chosen a working magnification.

### What to add

A magnifier control in the toolbar: the current level, a way in and out, and a reset to 1:1 distinct from `Fit`.

Remember the level per board in browser storage. It is a view preference rather than anything about the work, so it belongs to the browser and not to the layout file: writing it to `.tickets/canvas/*.yml` would put a diff in the repository every time somebody scrolled, and would make two people looking at one board fight over one number.

### Relationship to TKT-01M2ND1RNXB8941M21MRZRJDN2

That ticket makes density follow zoom, so these two touch the same value from opposite ends. This one is the control and the memory; that one is what the cards do as it changes. Neither blocks the other, and whichever lands second should check that a restored zoom level applies the right density on the first paint rather than after the first scroll.

## Acceptance criteria

- [x] A control shows the current zoom level and changes it
- [x] Reset returns to 1:1, and is distinct from Fit
- [x] The level is remembered per board across a reload
- [x] The level is in browser storage and never in the layout file

## Notes

**agent:claude/t3code** at 2026-09-16T17:19:22Z

Criterion 3, "the level is remembered per board across a reload", was ticked here and did not hold. The write worked; the restore was an effect that pushed the level in after mount, and the opening fit ran a frame later and overwrote it. Nobody would have seen it work. Fixed in TKT-01M2NKHS0MT0GVBTX6YAA0F3NT, which also stores the position this ticket never did.

## Summary

A `− 100% +` group in the toolbar. The percentage is the reset: pressing it returns to 1:1, and its tooltip names the difference from `Fit`, which frames every card instead. A separate reset button would have cost a slot in a toolbar that already runs off the side of a narrow window.

The level is remembered per store and per board in `localStorage`, and restored when either changes. It is a view preference rather than a fact about the work, so it stays in the browser: writing it to `.tickets/canvas/*.yml` would put a diff in the repository every time somebody scrolled, and on a canvas serving several people it would make two readers fight over one number.

`zoomTo` is new in the geometry, beside `zoomAt`. The wheel zooms about the pointer, which is right when the pointer chose the place; a control has no pointer on the board, so it holds the centre of the viewport still. Both clamp to the same limits, because a control that could reach a scale the wheel cannot is one that can strand somebody where they cannot scroll out.

The canvas keeps its view in a ref so a wheel gesture can absorb every delta and render once a frame, which means nothing outside it could see the level move. It now reports through an `onZoom` prop when the scale changes, and only when it changes.

A remembered level outside the wheel's limits is discarded rather than clamped: whatever wrote it was not this. Storage that throws — private browsing, a full quota — is survived rather than handled, because a board that will not open because it could not remember how big it was would be a poor trade.

`zoomMemory` lives in the UI layer, not in platform. `tests/platform/boundaries.test.ts` keeps platform free of the DOM and caught the first attempt to file it beside the geometry it clamps against. The boundary is worth more than the tidiness.
