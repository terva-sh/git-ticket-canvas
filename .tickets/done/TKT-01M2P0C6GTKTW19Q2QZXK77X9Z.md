---
schema: 3
id: TKT-01M2P0C6GTKTW19Q2QZXK77X9Z
title: Say what the label chips and the status chips each do to a filter
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - ui
  - labels
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim:
  actor: agent:claude/t3code
  branch: t3code/label-filter-semantics
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-acc5e2b7
  commit: f5f996c85e13fd041d6c3de8f7de77de7d19811b
  session: null
  claimed_at: 2026-09-16T23:49:27Z
  expires_at: null
archive: null
created_at: 2026-09-16T21:01:16Z
updated_at: 2026-09-17T00:00:19Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

Two sets of chips sit in the same toolbar and combine differently, with nothing
on screen saying so:

- Status chips union. Selecting `draft` and `ready` shows tickets in either.
- Label chips intersect. Selecting three labels shows tickets carrying all
  three, which on a real board is usually nothing.
- Label excludes union: carrying any excluded label removes a ticket.

Three semantics, none named. The popover says "Click to require a label, again
to exclude it", and `require` is technically accurate, but it sits a few
centimetres from chips that behave the other way.

This is what produced the report behind TKT-01M2P0BQT4: three labels selected,
`0 of 80`, and a board that looked broken. The cascade bug was real and is
fixed, but the reason there was nothing to look at is this.

Worth deciding rather than assuming. Options, none obviously right:

- Make label includes union, matching the status chips. Reads as "show me
  anything about these", which is what most people seem to expect. Loses the
  ability to narrow to an intersection, which is genuinely useful on a large
  store.
- Keep the intersection and say so, in the popover hint and in the summary —
  `Labels: all 3` rather than `Labels: 3 in`.
- Offer both, with an any/all toggle in the popover. Most capable, most
  furniture, and a third control to explain.

Whatever is chosen, the count reaching zero should probably say why: `0 of 80`
is true but unhelpful when a board has gone blank.

## Acceptance criteria

- [x] The label chips offer both an intersection and a union, with the intersection as the default so no existing selection changes meaning
- [x] Which mode is in force is readable from the closed toolbar button, and the popover says what the mode does
- [x] Excluding still wins under both modes, and a filter that only excludes does not empty the board under any
- [x] The mode reaches the cards as well as the count, guarded by a test confirmed to fail when it does not
- [x] An emptied board says which clause emptied it and offers the ways out, each counted against the store rather than predicted
- [x] The choice between the three filed options is decided against measurement of this store and recorded

## Implementation plan

The measurement in the notes settles the operator question: neither `all` nor
`any` is right, so the toggle is the only option that serves both widths. It
defaults to `all`, which is what the board does today, so no existing selection
changes meaning under the upgrade.

Four pieces, smallest first.

`matchesLabels` takes a `LabelMatch`. Excludes stay an AND under both modes,
because a forbidden label removing a ticket is not a claim about how the
required ones combine. The case to get right is `any` with no includes at all:
there is nothing for the mode to change there, and a naive `some()` would reject
every ticket instead of passing them.

The toggle lives inside the label popover rather than on the toolbar. The
toolbar already overflowed once on TKT-01M2NHFKX and a third row of controls
would put it back; the popover is absolutely positioned and adds no width to the
row that has to fit.

`labelSummary` names the mode, but only from two required labels up. With one,
`all` and `any` select the same tickets, so `all 1` would be a distinction the
board cannot demonstrate and the summary stays `1 in`.

The empty-board notice is the part that answers the original report. `0 of 80`
was already true; what it could not say was which clause emptied the board. So
each candidate relaxation drops exactly one clause, counts what comes back from
the store actually loaded, and is offered only if it is above zero. The numbers
shown are measured rather than predicted, which also means an offer never lies
about what it will do.

It belongs in `filters.ts` beside the predicate it inverts, so it is unit
testable without a browser, for the same reason the cascade guard was.

## Notes

**agent:claude/t3code** at 2026-09-16T23:16:37Z

Measured the three options against this store rather than arguing them, 123 tickets, taking every 2- and 3-way combination of the six most common labels.

Three labels under the current intersection: 13 of the 20 combinations give exactly 0. Under union the same 20 give between 37 and 74 matches, against a store of 123. Two labels under intersection: 6 of 15 give 0; under union, 15 to 67.

That kills the first option on its own terms. 'Make label includes union, matching the status chips' was the one I expected to recommend, because it matches what people seem to expect and matches the chips next to it. But on real data it replaces a blank board with an unfiltered one: selecting three labels would show more than half the store. The reported complaint was 'the filter shows me nothing'; union answers it with 'the filter shows me everything', and neither is a filter.

The useful reading is that neither operator is right at three labels, because the two are useful at different widths. Intersection narrows well at two labels when the pair is real -- canvas+ui gives 39 of 123, idea+readability gives 11 -- and collapses when the pair is not. Union is only useful at one or two labels before it stops excluding anything.

So the choice is not which operator. It is that a board has no way to tell the difference between 'the filter is working and nothing matches' and 'the filter does not mean what you thought'. 0 of 80 is true and says neither.

This also makes the third option, an any/all toggle, look less like extra furniture than it did when it was filed. It is the only one of the three that serves both widths. The cost is a third control in a toolbar that already overflowed once, on TKT-01M2NHFKX.

## Summary

The label chips now carry a match mode, `all` or `any`, and the board says which
one is in force. The empty case explains itself and offers a measured way out.

The option chosen was not the one this ticket leaned toward. Making label
includes union, so both sets of chips in the toolbar meant the same thing, was
the obvious fix and the measurement killed it: at three required labels an
intersection empties 13 of the 20 commonest combinations on this store, and a
union of the same three matches more than half the tickets. The complaint was
that the filter showed nothing; union answers it by showing everything. They are
useful at different widths, so the board offers both rather than picking, with
`all` as the default so no existing selection changes meaning under the upgrade.

Two details that would have been bugs.

`any` with no required labels must not empty the board. A filter that only
excludes has nothing for the mode to change, and asking whether any of an empty
set is present answers no. Counting requirements separately rather than reaching
for `some()` is what keeps that right, and there is a test named for it.

Canvas takes the mode as a prop rather than defaulting it. Dimming and the count
run off one predicate on purpose, and a card deciding the mode for itself is
exactly how they come to disagree -- the class of fault TKT-01M2P0BQT4 just
fixed in the stylesheet. The browser test asserts the card's painted opacity as
well as the count, and it was confirmed to fail when the prop is dropped rather
than assumed to guard anything.

The offers are ordered smallest-change-first, not by how many tickets each
returns. Sorting by count was what I wrote first, and a test caught that it puts
`Clear label filters` ahead of `Match any label instead` whenever clearing
returns more, which leads with the option that throws the user's selection away.
Each button carries its own count, so the comparison is still there without the
order making it for them.

Verified against this store rather than only against fixtures: three labels
selected gives `Labels: all 3`, `0 of 122`, and the sentence "No ticket carries
all 3 of canvas, ui and multiuser", with offers reading 74 and 122. The 74
matches an independent count taken over the ticket files before any of this was
written.

Not done, and deliberately. The summary names the mode only from two required
labels up, because at one the two modes select the same tickets. The status
chips still union without saying so; they are consistent with themselves and
nothing reported them, so relabelling them is a separate question.
