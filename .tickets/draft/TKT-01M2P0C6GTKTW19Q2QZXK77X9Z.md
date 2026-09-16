---
schema: 3
id: TKT-01M2P0C6GTKTW19Q2QZXK77X9Z
title: Say what the label chips and the status chips each do to a filter
type: task
status: draft
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
claim: null
archive: null
created_at: 2026-09-16T21:01:16Z
updated_at: 2026-09-16T21:01:22Z
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
