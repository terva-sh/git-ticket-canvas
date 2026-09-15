---
schema: 3
id: TKT-01M2KJ2DZ4KQDVA3G5FK0BFQZG
title: Store a board's home view and let a person set or reset it
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels: []
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-15T22:12:47Z
updated_at: 2026-09-15T22:12:47Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

Opening a board drops you at the origin whatever the arrangement looks like. On
the example bundle every card sits at negative x and positive y, so the first
thing a new reader sees is empty canvas, and finding the work means panning
until it appears or pressing Fit. There is no way to say "this is where this
board starts" and no way to get back to it once you have wandered.

Two controls answer that: set the board's home to what you are currently looking
at, and return to 0,0. Both are small. Where the home point is stored is not,
and that is the decision this ticket exists to settle rather than assume.

### The case for the board file

`internal/layout` already stores a named point there. `Routing.Inbox` is a
`*Point` on the Board, saved beside cards, frames, and pens, so the precedent
for "a coordinate somebody chose" living in the layout file exists and is in
use. A home point read that way is authored data by the same argument the
package documentation makes for card positions: somebody decided it, it is not
derivable from the tickets, and it should survive a cache rebuild. It is also
shared, which is the point if a team keeps a board arranged deliberately: a
colleague opening the board lands where the arrangement makes sense.

### The case against, from this repository's own documentation

`internal/layout`'s package comment names viewport explicitly as the other kind:
"Derived state, a search index, viewport, presence, undo, is the part that wants
a real database, and it belongs in a gitignored cache beside this." The README
repeats it. If viewport is session state, a home point stored in a tracked file
makes every pan a candidate for a diff, and two people who prefer different
starting views have a merge conflict over a preference.

### The distinction that probably resolves it

Those two are not actually in conflict, because they are about different things.
Where you are looking right now is session state and belongs in the state
directory beside favorites and last-store, alongside `internal/state`. Where a
board *starts* is a property of the arrangement, chosen once, changed rarely,
and useful to everyone who opens it. That reading puts the home point next to
`inbox` in the board file and leaves the live viewport out of version control
entirely, which is the split the package comment is really drawing.

Worth settling before implementing, because it decides whether this is a layout
schema change with a mutation and a merge story, or a few lines in
`internal/state`. The reset-to-origin button is unaffected either way.

## Acceptance criteria

- [ ] The ticket records the decision on where a home point lives, with the reason the rejected option lost.
- [ ] A control sets the board's home to the current view, and another returns the view to the origin.
- [ ] Opening a board with a home set starts there; opening one without a home behaves exactly as it does today.
- [ ] If the home point lands in the layout file, one change is a one-line diff and two boards setting different homes merge without a driver, held down by a test in internal/layout.
- [ ] The live viewport is not written to a tracked file, so panning never produces a diff.
