---
schema: 3
id: TKT-01M2NHFKXWYHX69YQ7KJRW1MP0
title: Choose canvas defaults from the viewport, and let them be overridden
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
updated_at: 2026-09-16T18:35:16Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

The canvas is laid out for one shape of screen. Card width is a constant, the toolbar is a single row that runs off the side when there are enough controls, the inspector reserves a fixed 380px, and the starting zoom does not consider how much room there is. On a wide monitor that wastes the edges; on a laptop the toolbar crowds; on a tablet or a phone it is unusable rather than merely tight.

Pick sensible defaults from the viewport — its size, its aspect ratio, and whether it is a coarse pointer — and let somebody override each of them.

### What a default should be chosen from

- **Width and height**, for how many cards fit and whether the inspector can sit beside the board or has to cover it.
- **Aspect ratio**, because a wide short viewport wants a different starting frame from a tall narrow one even at the same area.
- **Pointer**, because drag targets, the frame handles and the card controls are sized for a mouse, and a finger needs more.

### What must stay true

An override is per person and lives in the browser, like the zoom level, not in the layout file. Two people on one board must not be able to change each other's toolbar.

A default is a starting point and never a lock: everything chosen automatically can be set by hand, and the choice is visible rather than mysterious, so somebody who dislikes it can find what to change.

### Related

`TKT-01M2NHFKWXXZQYG0MQ2V81MHD3` (the zoom control) owns the magnification half and its storage, and this should reuse whatever that establishes rather than inventing a second preference mechanism.

## Acceptance criteria

- [x] Starting zoom, card density and inspector placement are chosen from viewport size and aspect ratio
- [x] A coarse pointer gets targets sized for a finger
- [x] Every automatic choice can be overridden by hand
- [x] An override is per person and per browser, never in the layout file
- [x] What was chosen automatically is visible, so somebody who dislikes it can find what to change

## Implementation plan

What the canvas has today, read rather than assumed: `density` is a `useState('full')` with a toolbar select and no memory; the inspector is a fixed 360px panel absolutely positioned over the right edge; the toolbar already wraps rather than overflowing; there is not one media query or pointer query in the stylesheet; `fitView` clamps magnification to 0.15 at the bottom regardless of how small the viewport is.

### Three settings, chosen then overridable

The choices worth making from a viewport are `density`, where the inspector sits, and how big the targets are. Everything else follows from those three.

`web/src/platform/canvas/viewport.ts` is a pure function from `{width, height, coarse}` to those three. Pure and in platform so the rules are testable as a table and `tests/platform/boundaries.test.ts` keeps them free of the DOM. `matchMedia` and `innerWidth` stay in a `useDisplay` hook in the UI layer.

Aspect ratio earns its place on the inspector, which is the one choice where a wide short viewport and a tall narrow one of the same area want different answers:

- width >= 1120: `beside`, as now, because the board still has room left.
- taller than wide: `bottom`, a sheet over the lower half. A 360px side panel on a portrait screen leaves a sliver of board.
- otherwise: `over`, full width, because a narrow landscape viewport has no room to split.

Density goes compact under 900px wide. Targets go coarse on a coarse pointer.

### The opening magnification

`fitView` bottoms out at 0.15. On a phone that renders a card 42px wide, which is a picture of a board rather than a board. `fitView` takes a floor, and the floor is derived from the two settings that are already overridable — a card has to render at least 150px wide to be read — rather than becoming a fourth setting somebody has to know about. It only applies where the viewport is small or the pointer is coarse; a wide mouse-driven viewport keeps today's behaviour, because there you can zoom in and hovering works.

### Overrides

`web/src/ui/displayPreferences.ts`, same shape as `viewMemory` from TKT-01M2NKHS0MT0GVBTX6YAA0F3NT and for the same reasons: `localStorage`, per person and per browser, never the layout file, surviving storage that throws. It stores only the keys somebody actually set, so changing these rules later moves everybody who never disagreed with them and nobody who did.

The toolbar's existing density select becomes one of these overrides rather than session state that a reload forgets.

### Making the choice visible

A `Display` dialog off the toolbar. Per setting: what the viewport is, what was chosen from it, what is in force, and a control that reads `Automatic` or a named value, with one control that puts everything back to automatic. It is a separate dialog from the account one deliberately: the account dialog exists only where somebody signed in, and a desk canvas needs this just as much.

## Notes

**agent:claude/t3code** at 2026-09-16T18:34:34Z

What is not verified. The stylesheet rules this adds — the coarse target sizes and the bottom-sheet inspector — have no automated coverage, because jsdom does not apply a stylesheet. The tests prove that `html[data-targets]` and `html[data-inspector]` carry the values the rules key on, and the rules are there to read, but nobody has looked at a phone-shaped window and said it looks right.

I could not do that myself: the preview browser here cannot reach a loopback canvas on this machine, and the deployed one at ledger.brokkr.local.sothr.com is behind Authentik. Resizing a desktop browser window past 900px and past 1120px, and using its device emulation for the coarse-pointer case, is the check somebody should make.

**agent:claude/t3code** at 2026-09-16T18:34:34Z

Two things in the canvas were quietly hard-coded to one shape of screen and are now driven by the inspector setting rather than a magic number.

`Canvas.viewport()` reserved room for an inspector that was not open yet with `clientWidth > 700 ? clientWidth - 400 : clientWidth`. It now reserves that room only where the inspector will sit beside the board. A sheet covers the board rather than splitting it, and holding a quarter of the width back for something that is going to cover everything framed every board into a corner it never needed.

The same function had a degenerate case that the `over` placement would have walked straight into: a panel covering the stage in both directions left `Math.max(1, panel.top - bounds.top)` as the height, so Fit with the inspector open would have produced a view derived from a one-pixel viewport. A panel that covers the stage is an overlay somebody is about to close rather than a split, so the fit now works from the whole stage and ignores it.

## Summary

Three settings — card density, where the inspector sits, and how big the targets are — are chosen from the window and overridable one at a time.

`web/src/platform/canvas/viewport.ts` is the rules: a pure function from `{width, height, coarse}` to the three. Pure and in platform so they can be read and tested as a table, which is what somebody who disagrees with them will want to argue with. `matchMedia`, `innerWidth` and the resize listener are in `useDisplay`, which is the only part that needs a DOM.

Aspect ratio earns its place on the inspector alone, which is the one choice where a wide short window and a tall narrow one of the same area want different answers. Wide enough and it sits beside the board as it always has; taller than wide and it becomes a sheet along the bottom, because a 360px side panel on a portrait screen leaves a sliver; otherwise it covers the board, because a narrow landscape window has nothing to split. Density goes compact under 900px. Targets go coarse on a coarse pointer, where the handle is also shown rather than revealed, since a finger cannot hover.

The opening magnification is the fit, and `fitView` bottomed out at 0.15 regardless of the screen — on a phone that renders a card forty pixels wide, which is a picture of a board rather than a board. It takes a floor now, derived from the density and the pointer rather than becoming a fourth setting somebody has to know about, and applied only where the viewport is small or the pointer is coarse. On a wide mouse-driven screen you can hover to read and scroll to reach, so the whole board stays worth more than a legible corner of it.

Overrides live in `localStorage` under `git-ticket-canvas.display`, the same shape and the same reasoning as `viewMemory`: per person, per browser, never the layout file, because two people on one board must not be able to change each other's toolbar. Only the keys somebody actually set are stored, so a later change to these rules reaches everybody who never disagreed and nobody who did. A value this version does not recognise is dropped rather than trusted.

A `Display` panel off the toolbar names the window it measured, what each setting was chosen to be, and what is in force, with one control per setting reading `Automatic — Compact` or a named value, and one that puts everything back. It is separate from the account dialog deliberately: that one exists only where somebody signed in, and a canvas on a desk needs this just as much. The toolbar keeps its density select as a shortcut, now able to say `Automatic` and writing the same preference, so the two cannot disagree.

Two hard-coded assumptions in `Canvas.viewport()` went with it. It reserved a quarter of the width for an inspector that was not open yet on any window over 700px; it now reserves that only where the inspector will sit beside the board. And a panel covering the stage in both directions left the fit working from a one-pixel viewport, which the `over` placement would have walked straight into; such a panel is an overlay somebody is about to close, so the fit ignores it.
