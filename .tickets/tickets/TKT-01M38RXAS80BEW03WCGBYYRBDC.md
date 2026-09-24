---
schema: 3
id: TKT-01M38RXAS80BEW03WCGBYYRBDC
title: Open a ticket's inspector without a pointer
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
  actor: agent:claude/mobile-list
  branch: worktree-agent-a752f78af0b9e1231
  worktree: /home/sothr/workspace/git.local.sothr.com/terva-sh/git-ticket-canvas/.claude/worktrees/agent-a752f78af0b9e1231
  commit: 151fa57c9b17bdc20c09ed2b3bba100ed42be27f
  session: null
  claimed_at: 2026-09-24T13:34:09Z
  expires_at: null
archive: null
created_at: 2026-09-24T03:56:23Z
updated_at: 2026-09-24T14:00:36Z
created_by:
  id: agent:claude/mobile-relate
  name: ""
updated_by:
  id: agent:claude/mobile-lead
  name: ""
extensions: {}
---

## Description

Found while building TKT-01M38QP3PT4ZNXV37720NSX424 (Add a dependency or a parent from the inspector). Once a ticket's inspector is open, a dependency or a parent can be added by keyboard alone. Getting the inspector open cannot be done that way. A card is not focusable (`web/src/ui/canvas/CardView.tsx` sets no tabIndex and handles no key on the card itself), so selecting a ticket takes a click or a tap, and the browser test for that ticket opens the inspector with a click before it switches to keys.

A keyboard user can therefore edit any ticket they can reach and cannot reach one. The list view, TKT-01M38QP3ZNYRPN60GXQD4SCE6M (List tickets by status as well as on the board), may cover this if its rows are buttons, which is one reason to decide this after that ticket rather than before it. The other candidates are focusable cards with a roving tab stop, or opening a ticket from the search box.

## Acceptance criteria

- [x] From page load on the desk, tablet and phone layouts, Tab reaches List in the header and Enter shows the list, with no pointer (list-keyboard.spec.ts)
- [x] While the list shows, the list is one Tab stop and no Tab lands on the board it covers (list-keyboard.spec.ts)
- [x] ArrowUp, ArrowDown, Home and End move between rows across status groups, and Enter opens the focused ticket in the inspector (list-keyboard.spec.ts)
- [x] The Tab after the list lands in the open inspector, and closing the inspector with Escape puts focus back on the row that opened it (list-keyboard.spec.ts)

## Implementation plan

### Decision

The list from TKT-01M38QP3ZNYRPN60GXQD4SCE6M (List tickets by status as well as on the board) is the keyboard route, with three additions it needs. Its rows are buttons, so a keyboard could already open any ticket, on every layout. The route from page load is: Tab to `List` in the header, Enter, Tab into the list, arrow keys to the ticket, Enter. What the list does not do by itself, read against the built page:

1. **Focus falls onto the covered board.** The board stays mounted under the list, and its focusable elements (a pinned card's `Manual` button, a card's `+N` labels button, a frame's title and resize buttons, the phone's tip) come before the list in the document. Tab from the header walked through controls nobody could see, and a screen reader read out the whole covered board. While the list shows, the stage's own board elements (`#scene`, `#grid`, `#hint`, `#boardTip`) get `visibility: hidden` through `#stage:has(> #ticketList)`. That takes them out of the tab order and the accessibility tree and keeps their layout, so the board's measurements and view are intact when somebody switches back. Pure CSS in TicketList.css, with no change to Canvas.tsx.
2. **Every row was a tab stop.** After opening the tenth of forty tickets, the inspector was thirty Tabs away. The list gets a roving tab stop: one row has `tabIndex=0` and the rest `-1`. ArrowDown and ArrowUp move between rows across the status groups, Home and End go to the first and last, and focusing a row makes it the stop. The stop is the row last focused, then the ticket the inspector shows, then the first row. Tab from the list goes on to the inspector, which follows the list in the document.
3. **Closing the inspector lost focus.** Escape outside a field closes the inspector through App's existing handler, and focus was left on a panel that had just become hidden, so the next Tab started from the top of the page. When the selection clears while focus is on the body or inside `#inspector`, the list focuses its stop again. This lives in TicketList, not in App's keyboard handler or in Inspector.tsx.

App.tsx is not touched for this ticket. The keyboard handler there is where the other session works.

### Alternatives

- **Focusable cards with a roving tab stop on the board.** Rejected. A board has no reading order: cards sit wherever somebody dragged them or wherever the pens put them, so ArrowDown has no single right answer, and Tab order by DOM (ID order) would jump around the screen. A card already holds buttons (`Manual`, `+N` labels), so the card would be a focus stop that contains focus stops. Moving focus to an off-screen card would also have to pan the board, which is a view write on every arrow press. It would need changes to CardView.tsx and Canvas.tsx, the file this batch is told not to refactor, and it would duplicate what the list now does in a linear order that suits a keyboard.
- **Opening a ticket from the search box** (Enter opens the only match, or the first). Rejected as the route, though it could still be added later. It works only when the query narrows to one ticket or when the first match is the one wanted, so reaching an arbitrary ticket means knowing its ID or a unique word in it. What Enter did would be invisible until pressed. It would also add a key to the search input and a new path through App, near the keyboard handler the other session is changing. The list already shows the search's results as rows, so `/`, type, Tab, arrows and Enter reach the same place with nothing new to learn.
- **Rows as plain buttons with no roving stop.** This is the list alone, and it opens any ticket. Rejected as insufficient because of items 1 and 3, and because of the Tab distance to the inspector in item 2.
- **`inert` on the covered board, set from script.** It would work, but it means reaching into the canvas's DOM from outside it. `visibility: hidden` does the same job for focus and for assistive technology, in the stylesheet.

### Tests (tests/browser/list-keyboard.spec.ts)

Keyboard only, from `page.goto` with no click and no tap, on the desk, the tablet and the phone layouts:

- Tab reaches `#viewList` and Enter shows the list.
- Tab lands on one row, and no Tab from the switch to the inspector lands inside the covered board.
- ArrowDown, ArrowUp, Home and End move across groups, and Enter on the last ticket in the list (a different status group from the first) opens it.
- Tab from the row reaches `#fTitle` in the inspector.
- Escape leaves the field, a second Escape closes the inspector, and focus is back on the row.

Each criterion added with `ac --add` names what the test proves.

## Notes

**agent:claude/mobile-list** at 2026-09-24T13:37:38Z

Evidence that the tests catch what they are for: tests/browser/list-keyboard.spec.ts was run against the bundle as it stood after TKT-01M38QP3ZNYRPN60GXQD4SCE6M (List tickets by status as well as on the board) alone, at commit 6fb447a plus the baselines, which has buttons for rows but no roving stop, no focus return and no hidden board. All 9 tests failed (3 tests on the desk, tablet and phone layouts). The Tab test failed on "Tab reached the board under the list". The arrow test failed because ArrowDown was an ordinary Tab-order move and focus did not follow. The inspector test failed because the Tab after the row landed on the next row, not in the inspector. With the change in c049867, all 9 pass, together with the 8 tests of tests/browser/list.spec.ts.

The criteria were added by this session, as the maintainer asked. The ticket arrived with none.

**agent:claude/mobile-lead** at 2026-09-24T13:50:09Z

Merging with TKT-01M38WN9EE8QVNR0E7B3B4QTZM (Hide the inspector's side resize handle when it is not beside the board) on t3code/mobile-wave-4 changed the inspector's tab order on a bottom panel. The width handle used to be the first tab stop there. It is now hidden, so the first Tab after the list lands straight on the title field. list-keyboard.spec.ts "Tab goes from the row into the inspector…" assumed a stop before the title and tabbed past it, failing 5 of 5 on the tablet. The test now accepts the title as that first stop and still requires the first Tab to land inside the inspector. list-keyboard and list together, with --repeat-each=3, passed 51 with 3 visual tests skipped. The rest of the merged suite passed at 181, with 8 skipped.

**agent:claude/mobile-lead** at 2026-09-24T14:00:36Z

Terva reviewed 844d14b on PR 37 in run 04757dc2, Actions run 253. It raised one medium finding: keyboard focus falls out of the list when the focused row disappears. The finding is accepted and widened.

The reported case is a row removed by a filter or a live update. The same loss happens when another writer changes the focused ticket's status. The row moves to another group, Preact remounts its button, and focus drops to the body even though the ticket is still listed.

TicketList now checks during render, before the DOM changes, whether the list holds focus. After the commit, a list that held focus and lost it gives it back. It goes to the same row if that row is still shown, otherwise to the nearest row still shown, next below and then above.

A filter typed in the search box removes rows while the box has focus, so nothing moves. The list specs type filters and still pass.

Rejected alternatives:
- An effect keyed on the rendered order that refocuses whenever focus is on the body. It would pull focus into the list after somebody had deliberately left it.
- Relying on focusout. Chromium does not reliably fire it when a focused node is removed.

New test: list-keyboard.spec.ts "focus stays in the list when another writer moves or removes the focused row". It moves the focused ticket to ready and expects focus still on it, then deletes it and expects focus on a neighbour, with Home still working. It failed on 844d14b, where focus was on the body after the move, and passes with the fix.

Checks run: `just browser-test` passed 183 with 8 skipped, and `just web-test` passed 569.

## Summary

A keyboard can now open any ticket's inspector from page load, with no pointer, on the desk, tablet and phone layouts. The route is the list from TKT-01M38QP3ZNYRPN60GXQD4SCE6M (List tickets by status as well as on the board): Tab to `List` in the header, Enter, Tab into the list, the arrow keys to the ticket, Enter.

### Decision

The list alone was not enough, though its rows are buttons. Read against the built page: Tab from the header walked through the covered board's buttons before it reached a row. Every row was a tab stop, so the inspector was as many Tabs away as there were rows below the one opened. Closing the inspector left focus on a hidden panel. So three changes, all in `web/src/ui/TicketList.tsx` and `TicketList.css`:

- A roving tab stop. One row has `tabIndex=0`. ArrowUp and ArrowDown move across status groups, and Home and End go to the ends. The stop is the row last focused, then the selected ticket, then the first row. The inspector follows the list in the document, so the next Tab reaches it.
- Focus comes back. When the selection clears while focus is on the body or inside `#inspector`, the list focuses its stop.
- The covered board is out of reach. `#stage:has(> #ticketList) > :is(#scene, #grid, #hint, #boardTip)` gets `visibility: hidden`, which takes the board out of the tab order and the accessibility tree and keeps its layout.

The plan records the rejected alternatives: focusable cards with a roving tab stop on the board, opening from the search box, plain button rows, and `inert` set from script. App.tsx, Canvas.tsx and Inspector.tsx are not changed for this ticket.

### Tests

`tests/browser/list-keyboard.spec.ts`, 3 tests on each of the desk, tablet and phone layouts, keyboard only from `page.goto`. The four criteria each name the test that proves them. Against the list without these changes, all 9 fail, each for the reason its criterion covers. With them, all 9 pass.
