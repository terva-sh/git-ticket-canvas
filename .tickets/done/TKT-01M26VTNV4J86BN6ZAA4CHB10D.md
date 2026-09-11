---
schema: 3
id: TKT-01M26VTNV4J86BN6ZAA4CHB10D
title: Repair drag-to-link dependency updates and persistence
type: bug
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - idea
  - ui
  - canvas
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-10T23:53:11Z
updated_at: 2026-09-11T05:35:57Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Dragging the connection handle from one ticket onto another does not reliably update the visible relationship or persist it. Reloading the page still leaves the child ticket without the connection. The canvas calls `onLink(gesture.from, gesture.to)` after drop, and `App.tsx:236-241` currently patches the target with `{ op: 'addDependency', id: from }`, but the result does not leave the board in the state the user just edited.

Repair the full path for the dependency edge the drag already creates: show the new edge and updated ticket metadata immediately after a successful drop, save the relationship through the API, surface a failure instead of silently leaving a ghost or stale card, and confirm that a reload reconstructs the same edge. Preserve the existing source-to-target direction, where the source is the prerequisite and the target is the dependent.

Choosing between a dependency and a parent relationship at drag time was split out into its own ticket, which depends on this repair. Fix the one edge kind the gesture already has before adding a second.

## Acceptance criteria

- [x] A successful dependency drag updates the affected ticket and visible edge without a page reload.
- [x] A dependency created by dragging persists through the API and is present after reloading the board.
- [x] A failed relationship save reports an error and does not leave the UI claiming that the edge was saved.
- [x] A test covers the drop, the save, and the reload, so the regression cannot return silently.

## Notes

**agent:terva/mieli** at 2026-09-11T05:23:45Z

draft to ready: The user selected this for the next work after reviewing the merged idea tickets. Narrowed to the dependency repair first; the relationship choice is now a separate dependent ticket.

**agent:terva/mieli** at 2026-09-11T05:35:39Z

The Description's premise is wrong, and the next reader should know which part.

The save path was never broken. I wrote the drop-save-reload tests first, against unchanged code, and they passed: the PATCH lands, the ticket file gains the dependency, and a reload reconstructs the edge. The failure path was already honest too, because `App.patch` reports the server's message and rethrows, so a 500 during the drop raises an alert toast and stores nothing.

What is broken is visibility. `Relationships` defaults to `Selected`, and `Edges.tsx` draws an edge only when the selection holds one of its endpoints. The link gesture in `Canvas.tsx` selects nothing: the card branch of `pointerDown` calls `p.onSelect`, and the handle branch does not. So a correct drop saved an edge that nothing on screen would draw, on that load or any later one. That reads exactly like a link that did not take, which is how it was reported.

The fix is one line of behavior in `App.tsx` `link()`: on a successful patch, select the dependent, guarded on the board generation the way `create()` guards its own select. The edge then renders in the default mode, and the inspector opens on the ticket that changed, which is the confirmation the gesture never had.

Worth knowing for the ticket that follows this one. A parent drag will have the same problem, since parent edges go through the same mode filter, so it should select its child on success rather than rediscovering this.

Evidence: four tests in `tests/browser/canvas.spec.ts`. The default-mode test is the regression guard and it is the one that failed before the change, finding 0 edges.

**agent:terva/mieli** at 2026-09-11T05:35:54Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-1 A successful dependency drag updates the affected ticket and visible edge without a page reload. — App.tsx link() now selects the dependent after a successful patch, guarded on the board generation. Browser tests 'a dependency drag shows the edge and saves it without a reload' and 'a dependency drag leaves the new edge visible in the default relationship mode' pass; the latter failed with 0 edges before the change.</evidence> <parameter name="activate_next">task-2
- [x] task-2 A dependency created by dragging persists through the API and is present after reloading the board. — Browser test 'a dependency created by dragging is still there after a reload' drops the link, reloads the page, and finds the same edge. It passed against the old code too: the API path was never broken.
- [x] task-3 A failed relationship save reports an error and does not leave the UI claiming that the edge was saved. — Browser test 'a failed dependency save reports the error and draws no edge' routes the PATCH to a 500, then asserts the #toast carries role=alert with the server's message, that no edge is drawn, and that the stored ticket still has no dependencies. It passed against the old code: App.patch already reported and rethrew.
- [x] task-4 A test covers the drop, the save, and the reload, so the regression cannot return silently. — tests/browser/canvas.spec.ts adds four tests covering drop, save, reload, default-mode visibility, and the failure path. The default-mode test failed against the old code (0 edges) and passes after the fix; `just browser-test -g "dependency drag|dependency created by dragging|failed dependency save"` reports 57 passed.</evidence> <parameter name="activate_next">task-1

## Summary

The drag-to-link save was already correct. The defect was that a correct drop drew no edge, because `Relationships` defaults to `Selected` and the link gesture selected nothing. `App.tsx` `link()` now selects the dependent on a successful patch, guarded on the board generation, so the edge renders and the inspector shows the ticket that changed.

Four tests in `tests/browser/canvas.spec.ts` cover the drop, the save, the reload, the default relationship mode, and a 500 during the save. The default-mode test found 0 edges before the change and passes after it. `just check` passes, and `web/dist` was rebuilt because the change is in an embedded asset.

One follow-up is recorded on TKT-01M27ENKEA6WKJRM8P9Z5BN8NF (Choose a dependency or parent relationship when dragging a link): parent edges pass through the same mode filter, so that gesture needs the same select-on-success.
