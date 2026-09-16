---
schema: 3
id: TKT-01M2ND1RNXB8941M21MRZRJDN2
title: Make the card show what deserves attention
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
parent: TKT-01M2ND0S8N5Y8V0HQFRCBKMXE3
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T15:23:31Z
updated_at: 2026-09-16T15:23:51Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

The card encodes status on its left border, acceptance-criteria progress, blocked-or-startable, priority and labels. That is a lot of information and very little hierarchy: a done ticket from March and a startable ticket blocking three others carry the same visual weight.

`.card.done` makes this literal. It neutralises the left border and then a second rule restores the title colour, so a finished card is if anything more legible than a live one.

Weight should follow actionability, not lifecycle.

- Done and archived recede: reduced opacity, desaturated, collapsed to a title chip below a zoom threshold. Not hidden — the history is why the board is trustworthy — but no longer competing.
- Blocked reads as inert, with the blocking count promoted, because the useful question about a blocked card is what it is waiting for.
- Startable is the loud one. It is already computed and rendered as the word "Startable" in body text. It is what `git ticket ready` answers and it deserves the strongest treatment on the card.
- Claimed shows who. On a canvas served to several people, a card somebody else is working is a different thing from an unclaimed one, and nothing says so today.
- Density follows zoom. It is currently a global manual dropdown with two settings; zoomed out far enough to see structure, a 280px card renders text nobody can read. Full, compact, then chip, with the manual control kept as an override. `Card.Collapsed` is the per-card version and is already in the model.

None of this is stored. Salience is computed from the ticket and the view, so there is no new record, nothing to migrate, and no way for a board to disagree with the tickets it is showing.

This one does not depend on the others and could go first if the board should look better before it is organized.

### A warning

Everything here is a judgement about what matters, and judgements about visual weight are wrong in public. It should ship behind nothing — no flag, no setting — and be changed when it is wrong. A preference toggle would fossilise the first guess.

## Acceptance criteria

- [ ] Done and archived recede rather than competing, and the title-colour override is gone
- [ ] A blocked card reads as inert and promotes what it waits on
- [ ] A startable card carries the strongest treatment on the board
- [ ] A claimed card says who holds it
- [ ] Density follows zoom, with the manual control kept as an override
- [ ] Nothing in this ticket is stored in the layout file or on a ticket
