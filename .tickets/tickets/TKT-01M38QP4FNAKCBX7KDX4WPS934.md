---
schema: 3
id: TKT-01M38QP4FNAKCBX7KDX4WPS934
title: Replace hover-only help and edge names on a touch screen
type: task
status: review
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
updated_at: 2026-09-24T07:20:55Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/mobile-lead
  name: ""
extensions: {}
---

## Description

Several things are explained only on hover, which a finger cannot do. The hint line describes a mouse. Edge names show on hover or on selection. Some controls explain themselves only through a `title`.

On a coarse pointer, the hint line describes touch ("drag to pan · pinch to zoom · double-tap to file a ticket · hold a card to select several"). Tapping an edge names it. A control whose only explanation is its `title` gets a visible label or an entry in the help. The stage detects a double tap itself (a second tap within 300 ms and 24 px) and does not rely on `dblclick`, which browsers synthesise inconsistently once `touch-action` is `none`.

See `docs/mobile-design-v1.md`, "Tablet".

## Acceptance criteria

- [x] The hint line is chosen by pointer and is accurate for touch
- [x] Tapping an edge names it, with a test on the emulated tablet
- [x] A double tap on empty board files a ticket on the emulated tablet, and double-click on a desk still does
- [x] No control is explained only by its title attribute on a coarse pointer

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

**agent:claude/mobile-hover** at 2026-09-24T06:02:40Z

Evidence, 2026-09-24, on this branch at 0bfeab2 (built on 9f82bee, the wave 2 branch).

`tests/browser/touch-help.spec.ts`, 10 tests, all pass against the rebuilt bundle. Run against the committed 9f82bee bundle before the rebuild, 5 failed, each at the point it should: the hint had no `data-pointer="coarse"`, the held badge had no `::before`, a tap on an edge named nothing (emphasised count 0), a double tap on an edge opened the composer, and a double tap with the browser's dblclick swallowed opened nothing. The desk tests and the double tap with Chromium's own dblclick passed on 9f82bee too, as they should. Emulated Chromium does synthesise `dblclick` from two CDP taps, so a double-tap test that leaves the dblclick alone would pass without the fix. That is why the spec also runs the double tap with a capture-phase listener that swallows `dblclick` before it reaches the stage.

Two decisions the reviewer should see:
- **A phone no longer files a ticket on a double tap.** On 9f82bee a double tap on a phone's empty board filed one through Chromium's synthesised dblclick. Nobody designed that. Now the stage ignores a dblclick within 800 ms of a touch lift, which it needs so that a tablet does not file twice, and the counted double tap skips `layout === 'phone'`. The phone has New ticket in its header, and its tip says nothing about double tap. If the phone should file on a double tap, drop the phone check in `touchUp` in Canvas.tsx.
- **A double tap on an edge files nothing,** although a desk double-click on an edge still does. The first tap names the edge, and filing on the second would cover the name that tap just showed.

**agent:claude/mobile-hover** at 2026-09-24T06:02:40Z

Criterion 1 is left unticked on purpose. The touch hint uses the design's wording, "hold a card to select several", and long-press selection belongs to TKT-01M38QP47 (Select several cards on a touch screen by holding one), which is being built in parallel. On this branch alone the phrase describes something the board does not do yet. Everything else in the criterion is met and tested: the hint is chosen by `display.facts.coarse`, the phone keeps its tip, and the desk hint is unchanged word for word. Tick the criterion once TKT-01M38QP47 lands in the same wave. If that ticket slips, remove the phrase from the coarse hint in Canvas.tsx.

**agent:claude/mobile-hover** at 2026-09-24T06:06:13Z

Criterion 4, checked beyond the grooming list. Every `title=` in web/src/ui was read under a coarse pointer, where nothing shows a title:
- Named in the grooming note. The link handle, Manual and the zoom level have entries in the touch hint. The held-by badge reads "held by NAME". Fit and the zoom level have `aria-label`s. Zoom in and out already had them. New ticket is labelled by its own text, and its title no longer names double-click as the only way to file.
- Found besides those: New board (`+`), the inspector's close (`×`) and its relation remove buttons (`×`). Each was named only by a glyph, with the meaning in its title. Each now has an `aria-label`: "New board", "Close", "Remove dependency ID". A sighted finger reads a `+` beside the board select and a `×` beside what it removes as what they are.
- Left alone, because each already has a visible label that says what it does and the title only adds detail: Display, Pens, Arrange, Undo and Redo frame, Cards, the account button, the version badge, the store picker, Rescan, and the card's label pills and the Unhoused state, which is not a control.

**agent:claude/mobile-lead** at 2026-09-24T06:35:21Z

Criterion 1 was left unticked because the touch hint's "hold a card to select several" described a gesture that did not yet exist. The hint is now accurate.

On t3code/mobile-wave-3, the hover branch is merged together with TKT-01M38QP47G7VBHRBVYR8MMKN8K (Select several cards on a touch screen by holding one). A 450 ms hold on a card now selects it and enters selection mode, which tests/browser/select-hold.spec.ts demonstrates on the emulated tablet and phone.

The merge added one interaction guard in Canvas.tsx `touchUp`: in selection mode, a double tap on empty board files nothing. The first tap leaves the mode, and a second tap there is not a request for a ticket. The guard is recorded on TKT-01M38QP47.

The full browser suite passes on the merged branch: 157 passed, 7 skipped.

**agent:claude/mobile-lead** at 2026-09-24T07:08:04Z

Terva's low finding on PR 35 (review of 63ef448) is recorded in full on TKT-01M38QP47G7VBHRBVYR8MMKN8K. touchUp now counts a touch lift from a card as a tap when the finger never passed TAP_SLOP on screen (), not when it never moved one scene pixel. A fingertip wobble on a card now unnames the edge, as the toggle already treated it. Test: touch-help.spec.ts "a tap on a card that wobbles within 8 px still unnames the edge".

**agent:claude/mobile-lead** at 2026-09-24T07:20:55Z

This supersedes the previous note, the one on Terva's low finding from the review of 63ef448. The shell swallowed a code span in it. The phrase "when the finger never passed TAP_SLOP on screen ()" should read "when the finger never passed TAP_SLOP on screen (the card gesture's `wandered` flag)".

Since then, the review of f2efd4d on PR 35 found that an edge tap in selection mode left the mode. An edge tap now names the edge and keeps the mode. The details are on TKT-01M38QP47G7VBHRBVYR8MMKN8K.

## Summary

Built on the wave 2 branch at 9f82bee. On a tablet or any other coarse pointer off the phone layout, the board no longer needs hover. The phone's first-visit tip is unchanged.

- **Hint.** Canvas takes `coarse` from `display.facts.coarse`. A coarse pointer reads "drag to pan · pinch to zoom · double-tap to file a ticket · hold a card to select several". A second line covers the link handle, Manual and the zoom level, and the relationships line says "tap an edge". A fine pointer keeps today's hint word for word. The long-press phrase waits on TKT-01M38QP47 (Select several cards on a touch screen by holding one), so criterion 1 is unticked until that lands.
- **Edge names.** A touch tap on an edge's hit path, meaning a pan that never passed TAP_SLOP, names that edge in `local.named` until the next tap anywhere. Edges emphasises a hovered edge first, then a named one, then the selection, and forgets a name whose edge is no longer drawn. Touch no longer sets hover. A desk mouse hovers exactly as before, and a click keeps nothing.
- **Double tap.** `touchUp` in Canvas.tsx counts two taps on empty board within 300 ms and 24 px and calls `compose`. `onDblClick` ignores a dblclick within 800 ms of a touch lift, because Chromium echoes one and a tablet would otherwise file twice. A desk double-click still files. A phone no longer files on a double tap; see the note.
- **Titles.** The held-by badge reads "held by" under `(pointer: coarse)`. Fit, the zoom level, New board, the inspector's close and relation remove buttons have `aria-label`s. New ticket's title names double-tap.

Tests: `tests/browser/touch-help.spec.ts`, 10 tests. 5 of them fail on the 9f82bee bundle. They include a double tap with the browser's dblclick swallowed, because emulated Chromium synthesises one and would hide a missing counter. Full suite: web-typecheck clean, web-test 554/554, browser-test 143 passed and 7 skipped. An earlier full run had one timing failure, in canvas-performance, at a load average of 10. It passed 3/3 on its own.

Files touched outside the ticket's own: App.tsx (one prop on `<Canvas>`), Toolbar.tsx (attributes on newBoard, the zoom level, Fit and New ticket), Inspector.tsx (two `aria-label`s), index.html (one rule after `.card-alerts .held`).
