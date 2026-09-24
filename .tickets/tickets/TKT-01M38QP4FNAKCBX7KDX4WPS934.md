---
schema: 3
id: TKT-01M38QP4FNAKCBX7KDX4WPS934
title: Replace hover-only help and edge names on a touch screen
type: task
status: in-progress
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
claim:
  actor: agent:claude/mobile-hover
  branch: worktree-agent-a2f851a4b2b6d5342
  worktree: /home/sothr/workspace/git.local.sothr.com/terva-sh/git-ticket-canvas/.claude/worktrees/agent-a2f851a4b2b6d5342
  commit: 9f82beef2699e71d85fe065e56900926170f62eb
  session: null
  claimed_at: 2026-09-24T05:52:41Z
  expires_at: null
archive: null
created_at: 2026-09-24T03:34:58Z
updated_at: 2026-09-24T05:58:34Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/mobile-hover
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

## Implementation plan

Built on the wave 2 branch at 9f82bee (wave 1 plus a phone's board), not on main, as the orchestrator asked.

### Hint, chosen by pointer
Canvas takes a `coarse` prop, which App fills from `display.facts.coarse`, the measured `(pointer: coarse)`. The phone keeps its first-visit tip exactly as it is. Anywhere else a coarse pointer gets a touch hint: "drag to pan · pinch to zoom · double-tap to file a ticket · hold a card to select several", a second line for what only titles explained (the link handle, Manual, the zoom level), and the relationships line saying "tap an edge". A fine pointer keeps today's hint word for word.

Rejected: keying on `layout`. A phone set to tablet by hand is still a finger, and a touch laptop set to desk still has a coarse pointer. Rejected: keying on `targets`. It is a size preference that somebody can override for bigger buttons with a mouse, and then the hint would describe gestures they are not making.

### Tap names an edge
Each edge's `<g>` carries `data-edge={key}`. A touch press on the edge's hit path starts a pan, as today. If the pan never passes TAP_SLOP, the lift was a tap, and Canvas keeps `local.named` as that edge's key, or clears it for a tap anywhere else, including a card. Edges takes `named` and emphasises it after a hover and before the selection, and drops it if the edge is no longer drawn. `onPointerEnter` ignores touch, so a finger does not flash a hover name.

Rejected: an `onClick` on the edge path. The stage captures the pointer on the press, so the edge never sees the lift. Rejected: a hover timeout. Nothing a finger does ends it predictably.

### Double tap
`touchUp` in Canvas runs on every touch lift that ends a gesture. A pan that did not move, started on empty board (not a card, frame or edge, the same test the double-click uses plus edges), and lands within 300 ms and 24 px of the last such tap calls `compose`. Any other lift breaks the pair. Not on a phone, which has a New ticket button and where a double tap is too easily a missed tap on a card. `onDblClick` ignores a `dblclick` within 800 ms of a touch lift, because Chromium does synthesise one from two taps and it would file twice.

Rejected: trusting `dblclick` for touch, as the design says. Rejected: telling touch `dblclick` apart through `sourceCapabilities`, which is Chromium only.

### Titles
- Link handle, Manual and zoom level: an entry in the touch hint. Manual already has an `aria-label`.
- Held-by badge: under `@media (pointer: coarse)` it reads "held by NAME" through `::before`, so the desk card and its text content do not change.
- Fit: an `aria-label` repeating its title. The visible word "Fit" stays.
- Zoom level: an `aria-label` "N%, reset to 1:1".
- Zoom in and out already have `aria-label`s.
- New ticket: the title no longer names double-click as the only way. It names double-tap too.

Toolbar.tsx edits are limited to those attributes, because a sibling ticket is adding a selection indicator there.

### Tests
A new `tests/browser/touch-help.spec.ts`, on the tablet with `touchSteps` and on the desk with a mouse. It covers the touch hint, the held-by label, tap-to-name and clearing it, a pan from an edge, a double tap with and without the browser's dblclick, a double tap on a card or an edge filing nothing, the desk hint, desk hover and click on an edge, and a desk double-click.

## Notes

**agent:claude/t3code** at 2026-09-24T05:01:53Z

Groomed 2026-09-24 against main at 79b233f.

- Edge names: `Edges.tsx` keeps a `hovered` edge in state, set by `onPointerEnter` and cleared by `onPointerLeave` on a wide transparent path, plus an SVG `<title>` tooltip. Under touch, enter and leave fire around the tap, so a name would flash and vanish. Tap-to-name needs a persistent "named" edge, cleared by tapping elsewhere. `#edges` is `pointer-events: none` with the per-edge paths opted back in, which is what lets a tap reach one.
- The hint is `#hint` in Canvas.tsx and reads "drag canvas to pan · scroll to zoom · double-click to file a ticket · drag the right handle to link", with "hover or select to name one edge" on its second line. Both lines need a touch version.
- Double tap: the stage listens for `onDblClick`, and `compose()` takes a client point.
- Title-only explanations under a coarse pointer include the card's link handle ("Drag to another card to make that ticket depend on this one"), the Manual placement control, the held-by badge, and on the toolbar Fit, the zoom buttons and New ticket ("double-click the canvas"). The last one names a mouse gesture as the only way to file.
