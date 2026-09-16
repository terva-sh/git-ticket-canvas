---
schema: 3
id: TKT-01M2NJZ6CTYYST3Z4XB20G3W4D
title: Let a card go back to automatic placement
type: task
status: done
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
updated_at: 2026-09-16T18:22:30Z
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

## Acceptance criteria

- [x] A card placed by hand can be handed back to automatic placement from the canvas
- [x] A card already placed automatically offers nothing to press
- [x] A read-only canvas offers nothing to press
- [x] Releasing a card in a selection releases the whole selection
- [x] A released card is laid out by the rules immediately, not after the write returns
- [x] Compact density, which hides the card head, still has a way to release

## Implementation plan

Everything below the browser is already built, and I verified each piece rather than taking the filing note's word for it: `layout.Store.Update` deletes the entry when handed a nil (internal/layout/layout.go:180), `layoutRequest.Cards` is `map[string]*layout.Card` (internal/api/server.go:629), and `validateFrameTickets` already skips nils when it decides which tickets a transaction needs. The whole change is in `web/`.

### The affordance

`CardView` gains an `onRelease` prop. When a card is pinned and the prop is there, the `Manual` in the card head becomes a button carrying an accessible name that says what pressing it does; the text stays `Manual` so the head does not reflow. An `Automatic` card has nothing to do, and a read-only canvas gets no prop and so keeps the plain span.

### Carrying a nil through the canvas

`Canvas.save` takes `Cards` and its preview map is `Map<string, Card>`, so neither can express a removal. Both widen to `CardChanges` / `Card | null`.

`positions()` builds its pinned set as `{...cards, ...previews}`, which would leave a null sitting under the id. `isPinned` and `posOf` both test truthiness, so that happens to behave; it is still a lie in the types. It becomes an explicit loop that deletes the key for a null preview, so a released card is optimistically laid out by the rules on the same frame the press happens, before the write returns.

### The selection, and compact density

Dragging moves every selected card, so releasing releases every selected card when the pressed one is in the selection. Anything already automatic is dropped from the change rather than written as a redundant nil.

Compact density hides the card head entirely, which would leave no way to release at all at the density a large board is most likely read at. A `u` key on the canvas releases the selection, which covers compact, covers multi-select without a press per card, and is the only keyboard route to this.

### Naming

TKT-01M2ND1RMSJ1KAEZM7HZX5DEHR calls the command-line half `git ticket canvas release`, and this ticket asks the two to agree. `release` already means dropping a claim everywhere else in this vocabulary, so the button says neither: it says `Manual`, and its accessible name says "hand back to automatic placement". The word to settle on belongs with that ticket, where the command is actually named.

## Notes

**agent:claude/t3code** at 2026-09-16T18:22:18Z

Releasing removes the whole card record, not just its coordinates. `Card` also carries `w`, `z` and `collapsed`, so in principle handing a card back to the rules forgets a width and a collapse state too. Nothing in the browser sets any of the three today — I checked, `collapsed` appears only in the type and `w` only in frame geometry — so there is nothing to lose yet. When a width or a collapse becomes settable, this has to keep them and clear the position alone.

**agent:claude/t3code** at 2026-09-16T18:22:18Z

Left for TKT-01M2ND1RMSJ1KAEZM7HZX5DEHR, which names the command-line half: what this operation is called. That ticket proposes `git ticket canvas release`, and `release` already means dropping a claim everywhere else in this vocabulary, so the button avoids the question rather than settling it. It says `Manual` and its accessible name says "hand back to automatic placement". If that ticket keeps `release`, the button's label and this hint should follow it.

## Summary

Dragging a card is no longer a one-way door. The `Manual` in the card head is a button: pressing it removes the card's saved position, which is the only thing that made it manual. Everything below the browser was already built — `layout.Store.Update` deletes an entry handed a nil, `layoutRequest.Cards` is `map[string]*layout.Card`, and `validateFrameTickets` already skips nils — so the whole change is in `web/`.

The word does not change on press, and neither does the label on a card the rules already place. `Manual` stays `Manual` so the card head does not reflow under the pointer; what pressing does is in the accessible name and the tooltip. A read-only canvas is passed no handler at all and renders a plain label rather than a disabled button, because a disabled button advertises an operation that is not on offer.

`Canvas.save` took `Cards` and its preview map held `Card`, so neither could express a removal; both widened to `CardChanges` and `Card | null`. `positions()` built its pinned set by spreading the previews, which would have left a null sitting under the id. `isPinned` and `posOf` both test truthiness so that would have behaved, but it was a lie in the types, and it is now a loop that deletes the key. The payoff is that a released card lands where the rules put it on the same frame as the press, rather than sitting where it was dropped until the write returns.

Dragging moves every selected card, so releasing releases every selected card when the pressed one is in the selection. Cards the rules already place are dropped from the change rather than written as removals that remove nothing.

Compact density hides the card head entirely, and a board read at compact is the large one where an accidental drag is most likely and hardest to find again. `u` releases the selection, which covers compact, covers a multi-selection without a press per card, and is listed in the canvas hint because there is nowhere else in the app that documents a key. It does not check read-only first: `Canvas.save` refuses and says so, and a key that silently does nothing is worse than one that explains itself.
