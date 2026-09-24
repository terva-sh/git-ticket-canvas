---
schema: 3
id: TKT-01M38QP3PT4ZNXV37720NSX424
title: Add a dependency or a parent from the inspector
type: task
status: in-progress
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
claim:
  actor: agent:claude/mobile-relate
  branch: worktree-agent-ada6c465a707666f8
  worktree: /home/sothr/workspace/git.local.sothr.com/terva-sh/git-ticket-canvas/.claude/worktrees/agent-ada6c465a707666f8
  commit: d760329b61513f256fa407da7e21003109930c5a
  session: null
  claimed_at: 2026-09-24T03:44:37Z
  expires_at: null
archive: null
created_at: 2026-09-24T03:34:58Z
updated_at: 2026-09-24T03:46:49Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/mobile-relate
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

## Implementation plan

### Predicate

A new module, `web/src/platform/tickets/relations.ts`, exports `closingCycle(tickets, kind, ticket, target)`. `kind` is `dependency` (ticket would depend on target) or `parent` (target would become ticket's parent). It returns the IDs that would form the cycle, in edge order starting at `ticket`, or `null` when the edge closes none. A self-reference returns `[ticket]`. It is pure and reads only `id`, `dependencies`, `parent` and `blocksOn`, so the drag in TKT-01M38R4GRCRG7PYT72MV47PKAJ (Refuse a dependency drag that would close a cycle) can call it with `store.state.tickets` and name the tickets it returns.

It refuses what `git ticket check` would report, over the same graphs:

- A dependency closes a cycle when the target already reaches the ticket through the blocking graph, which is dependencies plus the children of every ticket whose blocks_on is children. That graph contains the dependency graph, so one walk finds both `dependency_cycle` and `blocking_cycle`.
- A parent closes a cycle when the target's parent chain reaches the ticket (`parent_cycle`), or when the target blocks on its children and the ticket already reaches the target through the blocking graph, because the new child edge closes a `blocking_cycle`.

A breadth-first walk keeps the path, so the cycle it names is a shortest one. Edges to tickets outside the map are skipped, as check skips them.

Rejected: two separate predicates for dependency and parent. The drag needs only the dependency half, but the blocking graph mixes the two edge kinds, so splitting them would mean two walks that each have to know about the other.

Rejected: returning a boolean. The drag ticket must name the cycle, and a caller that only wants yes or no can test for null.

### Picker

Inline in the Relationships section, not a modal. **Add dependency…** and **Set parent…** (**Change parent…** when there is one) are buttons that open a search box under them, in the flow of the inspector. The search box is an ARIA combobox with a listbox of results. Typing filters with `matchesTicket` given only a query, so it matches exactly what the board's search box matches. Arrow keys move the active option, Enter picks it, Escape closes the picker without closing the inspector and returns focus to the button. Clicking an option also picks it.

Candidates are every ticket in the map, done and archived included, less the ticket itself, what is already linked (its dependencies, or its current parent), and every ticket for which `closingCycle` returns a cycle. Results show ID, title and status, most recently updated first, capped at a screenful with a line saying how many more match. When a search matches tickets that were left out for closing a cycle, a muted line says how many, so a search that finds nothing does not read as a missing ticket.

Picking sends `addDependency` or `setParent` through `onPatch`, the ops the drag and the parent's remove button already use. No server change. The buttons are disabled when read-only, and the picker closes if the inspector becomes read-only while it is open.

Rejected: a native `datalist` on an input. It matches on the option value in a browser-specific way, cannot show a status beside the title, and makes the typed text the value, so a title would have to be parsed back into an ID.

Rejected: a modal dialog. It would add a second focus layer inside the inspector, whose Escape already closes the inspector, and it is a mobile-shaped decision the sheet ticket should make, not this one.

Rejected: hiding cycle closers silently. The criterion says they are not offered, and they are not, but a person looking for a ticket they know exists deserves to be told why it is absent.

The empty-state text becomes "none yet. Add one below, or drag a card's right handle onto another", which keeps the drag as a path without claiming it is the only one.

### Tests

Table tests in `relations.test.ts`: self-reference, a two-ticket and a three-ticket dependency cycle, a parent chain, a blocking cycle through an epic's children in both directions, a done ticket in the loop, edges to missing tickets, and edges that close nothing. Component tests in `inspector-relations.test.tsx` for the picker's filtering, exclusions, keyboard path and read-only state. One browser spec at desktop size that adds a dependency on a done ticket and sets a parent by keyboard alone against a real server.

## Notes

**agent:claude/t3code** at 2026-09-24T03:40:24Z

Groomed 2026-09-24. Found while checking the cycle claim: the drag-to-link gesture never checked for cycles and still does not, because `link()` sends `addDependency` without one, so a three-ticket cycle can be made by dragging today. This ticket does not change the drag. Whether the drag should use the same predicate is a separate question and a behaviour change for desk users, so it is left for whoever steers the epic rather than folded in here.

Before building the picker, check whether the board's ticket set includes done and archived tickets. A dependency on a done ticket is common and legitimate. If the board omits those tickets, the picker needs another source.

**agent:claude/mobile-relate** at 2026-09-24T03:46:28Z

Answered the open question from grooming: the board's ticket set in the browser does include done and archived tickets, so the picker can search the map the inspector already receives and needs no other source.

Evidence. `ticketDirs()` in `internal/api/snapshot.go` walks every entry in `ticket.Statuses`, which in git-ticket v0.23.0 runs from draft through done and archived, and the snapshot turns every parsed ticket into a DTO with no status filter. The client store keeps `response.tickets` whole in `state.tickets` (`web/src/platform/tickets/store.ts`, through `reconcileTickets`), and `App.tsx` passes `snapshot.tickets` to the inspector unfiltered. The status chips narrow only the rendered cards, through `matchesTicket`.

This matters for the cycle walk too. `git ticket check` builds its cycle graphs over `live`, which is every readable ticket whatever its status (`ticket/check.go`), so a loop through a done ticket is still reported. The predicate walks every ticket in the map for the same reason.

Also found while reading check: it reports three cycle kinds, not two. Besides `dependency_cycle` and `parent_cycle` there is `blocking_cycle`, over dependencies plus the children of any ticket whose blocks_on is children. An epic that blocks on its children and a child that depends on that epic is the smallest one. It leaves those tickets unready as surely as a dependency cycle does, so the predicate refuses it as well.
