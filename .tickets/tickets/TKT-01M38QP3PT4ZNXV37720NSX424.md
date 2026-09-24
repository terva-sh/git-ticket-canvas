---
schema: 3
id: TKT-01M38QP3PT4ZNXV37720NSX424
title: Add a dependency or a parent from the inspector
type: task
status: ready
status_reason: null
priority: normal
due_on: null
labels:
  - ui
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-24T03:34:58Z
updated_at: 2026-09-24T03:40:25Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

The inspector can remove a dependency or a parent but cannot add one. The empty state reads "Drag a card's right handle onto another to add one". A phone does not offer that drag, and a keyboard user cannot perform it at all.

Add **Add dependency…** and **Set parent…** (reading **Change parent…** when there is one) to the Relationships section. Each opens a picker that searches the store's tickets by ID and title, the way Filter does. It writes with the ops the canvas already sends: `addDependency`, which `link()` in `App.tsx` uses for the drag, and `setParent`, which the inspector already uses to clear a parent. No server change.

The picker leaves out the ticket itself and any ticket that would close a cycle. That test is new and belongs to the browser. `git-ticket` v0.23.0 refuses only a self-reference (`AddDependency` and `SetParent` in `ticket/mutation.go`). A longer cycle is accepted, and only `git ticket check` reports it, as `dependency_cycle`. So the picker must walk the graph itself, over the tickets the board already holds.

This is for every layout, and the drag stays.

See `docs/mobile-design-v1.md`, "Adding a relationship without a drag".

## Acceptance criteria

- [ ] A dependency can be added from the inspector by searching for the ticket, with a test
- [ ] A parent can be set the same way
- [ ] The ticket itself and any ticket that would close a cycle are not offered
- [ ] The controls are disabled when read-only
- [ ] Keyboard alone is enough to add one
- [ ] The cycle test is a pure function in web/src/platform with table tests, including a cycle through three tickets and one through a parent chain
- [ ] A done ticket can be chosen as a dependency

## Notes

**agent:claude/t3code** at 2026-09-24T03:40:24Z

Groomed 2026-09-24. Found while checking the cycle claim: the drag-to-link gesture never checked for cycles and still does not, because `link()` sends `addDependency` without one, so a three-ticket cycle can be made by dragging today. This ticket does not change the drag. Whether the drag should use the same predicate is a separate question and a behaviour change for desk users, so it is left for whoever steers the epic rather than folded in here.

Before building the picker, check whether the board's ticket set includes done and archived tickets. A dependency on a done ticket is common and legitimate. If the board omits those tickets, the picker needs another source.
