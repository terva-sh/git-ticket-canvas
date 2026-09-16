---
schema: 3
id: TKT-01M2NYWQM1NJPSFC8VTE0CYJXS
title: Show doctor findings on the board
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
created_at: 2026-09-16T20:35:20Z
updated_at: 2026-09-16T20:35:20Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

`git ticket doctor` reports what is untidy rather than what is invalid, and everything it says is advisory. The canvas already renders the other thing a ticket knows about itself — readiness, blockers, claims — as salience on the card.

A finding is a fact about a ticket that the board could carry. A card with no label is one the board already renders worst: label chips are how a board is scanned, and a ticket with none is a title and nothing else.

### Questions before any of it

Doctor is advisory in the strongest sense, and a canvas that renders advice as a defect turns a second opinion into a red mark. The salience work in TKT-01M2ND1RNXB8941M21MRZRJDN2 spent its weight on what somebody could act on; a hygiene finding is not that, and it should not outrank a blocker.

Where the findings come from also matters. The canvas links the library, so it could evaluate rules in process; or the server could shell out to `git ticket doctor --json`; or it could not do this at all and leave doctor to the command line where a person reading a report is already the audience. The first is the only one that survives a store the canvas opened but no CLI is installed for.
