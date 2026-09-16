---
schema: 3
id: TKT-01M2NJZ6CTYYST3Z4XB20G3W4D
title: Let a card go back to automatic placement
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - ui
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T17:06:58Z
updated_at: 2026-09-16T17:06:58Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

Dragging a card is a one-way door. It gets a saved position, the card head starts reading `Manual`, and nothing in the canvas ever puts it back. The only way out is editing `.tickets/canvas/default.yml` by hand and deleting the line.

The state is already named on the card. `CardView` renders `Manual` or `Automatic` in the card head, so the concept is shown to a person who then finds there is no way to act on it.

Nothing in the protocol is missing either. `CardChanges` is `Record<string, Card | null>` on the wire, `layoutRequest.Cards` is `map[string]*layout.Card` in Go, and `layout.Store.Update` already deletes the entry when handed a nil. The whole gap is the affordance.

### Why it matters more than it looks

Today it is an annoyance: a card dragged by accident stays where it was dropped.

Under `TKT-01M2ND1RKK6S4GXZQKKPP6H87P` it becomes the escape hatch for the whole model. Once pens place unpinned cards, a saved position means "the rules do not apply to this one", and a person who cannot give a card back to the rules cannot undo a decision they made with a mouse. The design says explicit beats implicit, always — which is only safe if explicit can be withdrawn.

It is also the thing to watch for whether the rules are too eager: if people start pinning cards purely to stop them moving, that is the signal, and they need to be able to unpin just as easily to say so.

### Where the control goes

The label that reports the state is the obvious place to change it: `Manual` becomes something you can press to hand the card back. A card already reading `Automatic` has nothing to do.

The command-line half is `git ticket canvas release ID...` in `TKT-01M2ND1RMSJ1KAEZM7HZX5DEHR`. These should agree about what the operation is called.
