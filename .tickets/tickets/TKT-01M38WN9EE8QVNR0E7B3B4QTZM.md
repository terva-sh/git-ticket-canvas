---
schema: 3
id: TKT-01M38WN9EE8QVNR0E7B3B4QTZM
title: Hide the inspector's side resize handle when it is not beside the board
type: bug
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
dependencies: []
blocks_on: none
references: []
claim:
  actor: agent:claude/mobile-lead
  branch: t3code/mobile-wave-4
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-fd003818
  commit: 5389071f510222a6008ff7deb307c6f2074d7043
  session: null
  claimed_at: 2026-09-24T13:17:45Z
  expires_at: null
archive: null
created_at: 2026-09-24T05:01:53Z
updated_at: 2026-09-24T13:22:39Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/mobile-lead
  name: ""
extensions: {}
---

## Description

The inspector's resize handle, `.insp-resize` in `web/src/ui/Inspector.tsx` and `Inspector.css`, is a 10px column-resize strip along the inspector's left edge, with `touch-action: none`. It makes sense when the inspector sits beside the board. `Inspector.css` hides it under 700px, but not when a portrait tablet places the inspector as a sheet along the bottom (`html[data-inspector="bottom"]`, 820 CSS px wide). There it resizes the width of something that is already full width, and it swallows any touch that starts along the sheet's left edge, including a scroll.

Found while writing the inspector scroll test for TKT-01M38QP2CZEJ120PFDKMK3WTP1 (Pinch to zoom and pan with two fingers on the board): a drag started 6px from the sheet's left edge went to `.insp-resize` and scrolled nothing.

Hide it, or make it resize height, wherever the inspector is not beside the board. Key it on the inspector placement, not on a width media query.

## Acceptance criteria

- [x] The resize handle is absent or inert wherever the inspector is not placed beside the board
- [x] A touch drag starting at the left edge of a bottom sheet on the emulated tablet scrolls the inspector
- [x] The beside placement keeps its resize handle, and its existing tests pass

## Implementation plan

Hide `.insp-resize` with one rule in Inspector.css, `html:not([data-inspector="beside"]) #inspector .insp-resize { display: none; }`, and drop the `max-width: 700px` media query it replaces.

App.tsx already writes the placement to `html[data-inspector]`. There are three placements: `beside`, `bottom` and `over`. Both `bottom` and `over` are full width (web/index.html), so a width handle is meaningless in either. The phone's own rule stays, because the phone always shows its sheet whatever the placement says.

Rejected alternatives:
- Make the handle resize height on the bottom sheet. On a phone the sheet already has its own peek/half/full handle. A tablet bottom panel with a height handle would be a new feature, and no ticket asks for one.
- Stop rendering the handle in Inspector.tsx when not beside. That would need the placement passed into Inspector for a purely visual question. `display: none` already removes it from the tab order and from hit testing.
- Keep the 700px query as well. It hid the handle on a narrow window where somebody had set the panel beside by hand, which is exactly where a width is worth setting.

## Notes

**agent:claude/mobile-lead** at 2026-09-24T13:22:38Z

New test in pinch.spec.ts: "a touch drag from the left edge of the bottom sheet scrolls it". It runs on the emulated portrait tablet (820x1180), with `data-inspector="bottom"`, and drags from 4px inside the sheet's left edge.

Before the fix, the test failed on its `.insp-resize` hidden check. With that check removed, it failed on the scroll, with scrollTop left at 0. It passes with the fix.

The neighbouring inspector scroll test's comment no longer describes the left edge as the resize handle.

Criterion 3: sheet.spec.ts "…desk…beside" already asserts `.insp-resize` is visible for the beside panel, and it passes. pinch and sheet together passed 18/18, and `just web-test` passed 556.

## Summary

The inspector's side resize handle now shows only when the inspector is beside the board. A rule in Inspector.css keyed on html[data-inspector] replaces the 700px width query, so the portrait tablet's bottom panel and the full-width over panel no longer carry a handle that swallowed edge touches. Test: pinch.spec.ts "a touch drag from the left edge of the bottom sheet scrolls it", which failed before the fix. The beside panel keeps its handle (sheet.spec.ts).
