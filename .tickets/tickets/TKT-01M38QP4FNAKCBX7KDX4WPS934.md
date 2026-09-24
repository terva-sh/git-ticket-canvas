---
schema: 3
id: TKT-01M38QP4FNAKCBX7KDX4WPS934
title: Replace hover-only help and edge names on a touch screen
type: task
status: ready
status_reason: null
priority: normal
due_on: null
labels:
  - touch
  - ui
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies:
  - TKT-01M38QP2CZEJ120PFDKMK3WTP1
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-24T03:34:58Z
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

Several things are explained only on hover, which a finger cannot do. The hint line describes a mouse. Edge names show on hover or on selection. Some controls explain themselves only through a `title`.

On a coarse pointer, the hint line describes touch ("drag to pan · pinch to zoom · double-tap to file a ticket · hold a card to select several"). Tapping an edge names it. A control whose only explanation is its `title` gets a visible label or an entry in the help. The stage detects a double tap itself (a second tap within 300 ms and 24 px) and does not rely on `dblclick`, which browsers synthesise inconsistently once `touch-action` is `none`.

See `docs/mobile-design-v1.md`, "Tablet".

## Acceptance criteria

- [ ] The hint line is chosen by pointer and is accurate for touch
- [ ] Tapping an edge names it, with a test on the emulated tablet
- [ ] A double tap on empty board files a ticket on the emulated tablet, and double-click on a desk still does
- [ ] No control is explained only by its title attribute on a coarse pointer

## Notes

**agent:claude/t3code** at 2026-09-24T05:01:53Z

Groomed 2026-09-24 against main at 79b233f.

- Edge names: `Edges.tsx` keeps a `hovered` edge in state, set by `onPointerEnter` and cleared by `onPointerLeave` on a wide transparent path, plus an SVG `<title>` tooltip. Under touch, enter and leave fire around the tap, so a name would flash and vanish. Tap-to-name needs a persistent "named" edge, cleared by tapping elsewhere. `#edges` is `pointer-events: none` with the per-edge paths opted back in, which is what lets a tap reach one.
- The hint is `#hint` in Canvas.tsx and reads "drag canvas to pan · scroll to zoom · double-click to file a ticket · drag the right handle to link", with "hover or select to name one edge" on its second line. Both lines need a touch version.
- Double tap: the stage listens for `onDblClick`, and `compose()` takes a client point.
- Title-only explanations under a coarse pointer include the card's link handle ("Drag to another card to make that ticket depend on this one"), the Manual placement control, the held-by badge, and on the toolbar Fit, the zoom buttons and New ticket ("double-click the canvas"). The last one names a mouse gesture as the only way to file.
