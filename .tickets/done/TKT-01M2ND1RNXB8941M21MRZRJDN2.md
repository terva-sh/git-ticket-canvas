---
schema: 3
id: TKT-01M2ND1RNXB8941M21MRZRJDN2
title: Make the card show what deserves attention
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
parent: TKT-01M2ND0S8N5Y8V0HQFRCBKMXE3
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T15:23:31Z
updated_at: 2026-09-16T19:29:33Z
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

- [x] Done and archived recede rather than competing, and the title-colour override is gone
- [x] A blocked card reads as inert and promotes what it waits on
- [x] A startable card carries the strongest treatment on the board
- [x] A claimed card says who holds it
- [ ] Density follows zoom, with the manual control kept as an override
- [x] Nothing in this ticket is stored in the layout file or on a ticket

## Notes

**agent:claude/t3code** at 2026-09-16T16:44:19Z

Criterion 5, density following zoom, is left for `TKT-01M2NHFKWXXZQYG0MQ2V81MHD3`.

Not because it is hard: the canvas already knows its own scale, so the mapping could be written today. It is that the zoom ticket owns where a level is remembered and what a manual override is stored as, and a density override written here would be a second preference mechanism that the zoom work would then have to unpick. Whichever lands second should check that a restored zoom applies the right density on the first paint rather than after the first scroll.

Everything else in this ticket is done and deployed.

**agent:claude/t3code** at 2026-09-16T19:29:33Z

Closing this with criterion 5 unticked rather than carrying it further. Everything else shipped and is deployed; the remaining half is now TKT-01M2NV3WMAD902MKM5REAT4FTA, which is a decision before it is code.

The reason it moved rather than being finished here: TKT-01M2NHFKXWYHX69YQ7KJRW1MP0 made density a choice from the viewport with an explicit `Automatic` and a stored override, so "follows zoom" would now be a third input to a value that already has two. That is a question about what density should mean, not the small mapping this criterion assumed when it was written.

## Summary

A card's weight follows what somebody could act on rather than where it is in its lifecycle. Done and archived recede — including the `.card.done` rule that gave a finished ticket its title colour back after a neutral border had just taken it away — without being hidden, because a board that forgets what was finished cannot be read backwards. Blocked reads as inert and says what it waits on, counted from the readiness the server resolved rather than from the raw dependency list. Startable carries the strongest treatment on the board, which is what `git ticket ready` answers and the most useful fact on a canvas. A claimed card names who holds it, and an expired claim is not a claim.

None of it is stored in the layout file or on a ticket: every one of these is derived from the ticket the server already sent.

Criterion 5, density following zoom, is not done and is not being counted as done. It was deferred here so that it and the zoom control would not invent two preference mechanisms, and by the time both had landed the premise had moved: density is now chosen from the viewport with an explicit `Automatic` and a stored override, so "follows zoom" would be a third input to one value. That is TKT-01M2NV3WMAD902MKM5REAT4FTA, and it is a decision before it is code.
