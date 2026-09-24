---
schema: 3
id: TKT-01M38QP3PT4ZNXV37720NSX424
title: Add a dependency or a parent from the inspector
type: task
status: review
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
updated_at: 2026-09-24T04:08:49Z
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

- [x] A dependency can be added from the inspector by searching for the ticket, with a test
- [x] A parent can be set the same way
- [x] The ticket itself and any ticket that would close a cycle are not offered
- [x] The controls are disabled when read-only
- [x] Keyboard alone is enough to add one
- [x] The cycle test is a pure function in web/src/platform with table tests, including a cycle through three tickets and one through a parent chain
- [x] A done ticket can be chosen as a dependency

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

**agent:claude/mobile-relate** at 2026-09-24T03:56:39Z

Evidence for the criteria, all against commit ac8114a.

1 and 2. `tests/browser/relationships.spec.ts`, "adds a dependency on a done ticket and sets a parent by keyboard alone", adds a dependency and then sets a parent through the picker against a real desk server and reads both back from `/api/board`. `web/src/ui/inspector-relations.test.tsx` covers the ops sent (`addDependency`, `setParent`), the click path, and a failed write keeping the search open.

3. The same browser test searches for the ticket that would close a three-ticket loop and gets no option and "1 ticket is left out because linking would close a cycle". The component tests check that the ticket itself, a descendant offered as a parent, the current parent, and an epic that blocks on its children are all left out.

4. "relationship controls are disabled on a read-only board" in the browser spec, plus a component test that an open search closes when the board turns read-only and does not come back when it turns writable.

5. The browser test opens the Relationships section, moves between the two buttons, searches, picks and returns focus, all with keys, and checks focus at each step. One limit: it opens the inspector with a click, because a card cannot take keyboard focus today. That is outside this ticket and filed as TKT-01M38RXAS80BEW03WCGBYYRBDC (Open a ticket's inspector without a pointer).

6. `cycleFinder` and `closingCycle` in `web/src/platform/tickets/relations.ts`, with 27 cases in `relations.test.ts`, among them "a cycle through three tickets" and "a parent chain that leads back to the ticket".

7. The browser test's dependency is on a ticket moved to done, and the option shows its status.

Results: `just web-typecheck` passed. `just web-test` 42 files, 525 tests passed. `just browser-test` 84 passed, 6 skipped, 0 failed, including the two new specs. The six skips are the opt-in visual baseline and the refresh and live-update measurements, which skip on every run without their environment switch. `just dist-verify` matched HEAD byte for byte. No Go was touched.

**agent:claude/t3code** at 2026-09-24T04:03:49Z

Merged with its two sibling tickets on branch t3code/mobile-foundations and opened as one PR, https://git.local.sothr.com/terva-sh/git-ticket-canvas/pulls/29, at the maintainer's direction on 2026-09-24. The only merge conflict was the generated web/dist/index.html, resolved by rebuilding. On the merged head: web-typecheck pass, web-test 531 passed, go test pass, browser-test 90 passed / 6 skipped / 0 failed, dist-verify byte-identical, ticket check clean. A Terva review is requested next; its result is recorded here when it lands.

**agent:claude/t3code** at 2026-09-24T04:08:49Z

Terva review of PR 29, request `ready-review`, run 920b4f41-8e15-404c-a0ee-4c7c4e3a5ae4 (Actions run 204), review 317, on head a2b5eb6 against base 0be4e5a. The gate failed on two medium findings. This is the one on this ticket.

**Declined, with a test: "Reset an open relationship search when the inspected ticket changes"** (web/src/ui/RelationPicker.tsx:35). The failure it describes does not happen. Both pickers render inside `InspectorBody`, which Inspector.tsx:444 mounts as `<InspectorBody key={ticket.id} ...>`. A change of ticket therefore remounts the pickers with fresh state, so an open search and its query cannot carry over to the next ticket. The review read only the diff, and that line is outside it.

I first wrote the reset the finding asked for. The new test passed with and without it, which is how the key came to light. I removed the reset as redundant and kept two tests in inspector-relations.test.tsx:

- `closes an open search when the inspector moves to another ticket`. Removing `key={ticket.id}` from InspectorBody makes it fail, so it holds what the finding was worried about.
- `keeps an open search when the same ticket arrives with a new revision`. A live update must not close a search somebody is typing into.

The finding was right that the picker does not defend itself. It depends on its parent's key. That is the pattern the other inspector fields already use (TextEditor keys on ticket.id at line 435), so the picker follows it rather than adding a second mechanism.

## Summary

The Relationships section has **Set parent…** (**Change parent…** when there is one) and **Add dependency…**. Each opens a search box in place, a combobox whose results come from the board's ticket map, done and archived tickets included. It matches with `matchesTicket` given only a query, so it finds what the board's search finds. Arrow keys move, Enter picks, and Escape closes the search without closing the inspector. It writes `addDependency` or `setParent` through the inspector's existing `onPatch`, with no server change. Both buttons are disabled when read-only. The empty state now reads "none yet. Add one below, or drag a card's right handle onto another". The component is `web/src/ui/RelationPicker.tsx`, and `Inspector.tsx` changes by the import, two uses and the empty-state text.

The results leave out the ticket itself, what is already linked, and any ticket that would close a cycle, with a line counting those. The cycle test is `cycleFinder(tickets)` and `closingCycle(tickets, kind, ticket, target)` in `web/src/platform/tickets/relations.ts`. They answer `null` or the IDs in the loop, in edge order starting at `ticket`. The walk covers the three graphs `git ticket check` reports on: dependencies, parents, and the blocking graph, which adds the children of a ticket whose blocks_on is children. That is stricter than "dependency or parent cycle", because a blocking cycle leaves tickets unready just the same. TKT-01M38R4GRCRG7PYT72MV47PKAJ (Refuse a dependency drag that would close a cycle) can call `closingCycle(store.state.tickets, 'dependency', to, from)` from `link()` and name what it returns.

Filed while doing it: TKT-01M38RXAS80BEW03WCGBYYRBDC (Open a ticket's inspector without a pointer). Once the inspector is open, keyboard alone is enough to add a relationship, but a card cannot take focus, so opening the inspector still takes a click or a tap.

Verification is in the notes: typecheck, 525 unit tests, 84 browser tests with 6 opt-in skips, and dist-verify all pass. It is waiting for review and merge.
