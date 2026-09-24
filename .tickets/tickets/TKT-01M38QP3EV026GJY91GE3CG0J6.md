---
schema: 3
id: TKT-01M38QP3EV026GJY91GE3CG0J6
title: Open a ticket in a bottom sheet on a phone
type: task
status: in-progress
status_reason: null
priority: normal
due_on: null
labels:
  - mobile
  - ui
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies:
  - TKT-01M38QP2NVPG01307B8V69C29M
blocks_on: none
references: []
claim:
  actor: agent:claude/mobile-sheet
  branch: worktree-agent-adcc0394be5e907cc
  worktree: /home/sothr/workspace/git.local.sothr.com/terva-sh/git-ticket-canvas/.claude/worktrees/agent-adcc0394be5e907cc
  commit: 1e1926626e0d0b508c7a4898535f90f0602f693d
  session: null
  claimed_at: 2026-09-24T05:09:42Z
  expires_at: null
archive: null
created_at: 2026-09-24T03:34:57Z
updated_at: 2026-09-24T05:11:59Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/mobile-sheet
  name: ""
extensions: {}
---

## Description

On a portrait screen the inspector already becomes a bottom panel that takes a fixed share of the stage. On a phone it becomes a sheet with three heights: a peek showing the title, status and next action; half; and full. It moves between heights by dragging its handle, and dragging below the peek closes it. Above a peek or half sheet the board can still be panned, and tapping another card switches the sheet to that ticket without closing it.

The fields work as they do now.

See `docs/mobile-design-v1.md`, "The ticket sheet".

## Acceptance criteria

- [ ] The sheet opens at the peek and can be dragged to half and full, with a test on the emulated phone
- [ ] Dragging below the peek closes it
- [ ] Tapping another card while the sheet is open switches its ticket
- [ ] Status, priority, the checklist, notes and text fields can all be edited from the sheet at full height
- [ ] Tablet and desk inspector placement is unchanged
- [ ] The phone sheet keys on the phone layout, and only one mechanism positions a portrait inspector

## Implementation plan

Read against origin/main at 1e19266.

### Approach

- Remove the `@media (max-width: 700px)` grid from `web/src/ui/Inspector.css`. It split `#stage` into a 35% board row and a 65% inspector row. A portrait tablet or desk window keeps the `html[data-inspector=...]` rules in `web/index.html`, scoped with `:not([data-layout="phone"])`. A phone gets the sheet rules in `Inspector.css`, keyed on `html[data-layout="phone"]`. The two selectors are disjoint, so each layout has exactly one set of rules placing its inspector, and neither depends on specificity or stylesheet order.
- The sheet is the existing `#inspector` absolutely positioned along the bottom of `#stage`, full width, over the board rather than beside it. The board keeps the whole stage, so it pans and pinches above a peek or half sheet without any change to Canvas.tsx. `Canvas.viewport()` already fits above a full-width panel that does not reach the top.
- The height lives in `Inspector` state, `peek | half | full`, rendered as `data-sheet` on the aside. It resets to `peek` whenever the inspector goes from no ticket to a ticket. Switching tickets keeps it, because the selection changes and the inspector stays open. `InspectorBody key={ticket.id}` already remounts the fields per ticket.
- Peek is `height: auto` with the body hidden, so it is exactly the handle, the head and the foot, whatever the title's length. Half is 50% of the stage and full is 100%. The head gains a status and priority line shown on the phone only. "The next action" is the foot's Claim or Release, which sits directly under the head at the peek.
- A handle at the top of the sheet has `touch-action: none` and pointer capture. While it is dragged, the height is written straight to the element's style, as the side resize does, so drag frames never re-render the fields or disturb a focused editor. On release, the sheet closes if its height is under two thirds of the peek. Otherwise it snaps to the nearest of the three heights. A click without a drag steps up through peek, half and full, and ArrowUp and ArrowDown step, so a keyboard can reach every height.
- On the phone the side `.insp-resize` handle is hidden. The 700px media query keeps one rule that hides it, so a desk window narrower than 700px shows no handle. That rule places nothing. The tablet's bottom sheet stays as it is, because TKT-01M38WN9EE8QVNR0E7B3B4QTZM (Hide the inspector's side resize handle when it is not beside the board) covers it.
- The Display panel's "Ticket panel" hint says that a phone shows a sheet whatever this setting is.

### Alternatives rejected

- Keying the sheet on `data-inspector="bottom"` as well as the phone layout. A phone turned landscape chooses `over`, so it would have lost the sheet on rotation. The layout is the setting that stays the same in both orientations, and it is the one a person can override.
- Keeping the 700px grid and adding the sheet as a second grid. The width media query cannot be overridden, and a grid row cannot float over a board that stays pannable.
- A measured pixel height for the peek. It goes stale when the title wraps differently or the fonts load late. `height: auto` with the body hidden follows the content.
- Updating the height through React state on every pointer move. That re-renders every field on each frame, and the side resize avoids it for the same reason.

### Tests

A new `tests/browser/sheet.spec.ts` with `test.use(phone)` covers five cases: open at the peek and drag the handle to half, full and back with `touchSteps`; drag below the peek to close; tap another card while the sheet is open; pan the board with one finger above a half sheet; edit fields at full height. A tablet case and a desk case check that the bottom sheet and the side panel still sit where they did.

## Notes

**agent:claude/t3code** at 2026-09-24T05:01:53Z

Groomed 2026-09-24 against main at 79b233f. A portrait inspector is laid out today by two independent mechanisms, and this ticket should leave one:

- `web/index.html`: `html[data-inspector="bottom"] #inspector` is an absolutely positioned sheet at 55% of the stage, sliding up with `transform`.
- `web/src/ui/Inspector.css`: `@media (max-width: 700px)` turns `#stage` into a two-row grid (35% board, 65% inspector) whenever the inspector is open, and hides `#hint` and `.insp-resize`.

A 390px phone gets the media query; a portrait tablet gets the data attribute. The phone sheet should key on `html[data-layout="phone"]`, which is the choice a person can override, not on a width media query they cannot. The 700px rule should then go, or be scoped so that it cannot fight the sheet.

Found while testing the pinch work: the inspector's `.insp-resize` handle is a column-resize strip along the left edge, with `touch-action: none`. It is hidden under 700px but not in the tablet's bottom placement, where it resizes nothing sensible and swallows touches along the sheet's left edge. It is filed separately as a small bug, so it does not wait on the phone sheet.

The drag handle for the sheet's heights needs `touch-action: none` of its own, and a test on the emulated phone that drags it through the three heights using `touchSteps`.
