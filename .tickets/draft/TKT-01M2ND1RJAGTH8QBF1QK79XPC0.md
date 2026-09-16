---
schema: 3
id: TKT-01M2ND1RJAGTH8QBF1QK79XPC0
title: Read the board from the command line
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - layout
  - cli
assignees: []
milestone: null
parent: TKT-01M2ND0S8N5Y8V0HQFRCBKMXE3
origin: null
dependencies:
  - TKT-01M2ND1RH33T89QZ7JBA0YC1AZ
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

Read-only commands first, so the schema and the resolution order get exercised and argued about before anything writes one.

- `git ticket canvas show [--board B]` — the rules, and what each one catches.
- `git ticket canvas pens` — the rules in resolution order.
- `git ticket canvas explain ID` — why this card is where it is: the matching pen, the rules it beat, and whether a pin overrides all of them.

`explain` is not a convenience. A declarative placement system whose decisions cannot be interrogated is one nobody will trust with a board they care about, and an agent that cannot ask why a card moved cannot correct a rule it wrote.

Until resolution lands these answer against the current behaviour, which is that every unpinned card is placed by `autoPlace`. That is a truthful answer and it is worth being able to ask the question before the answer gets interesting.

## Acceptance criteria

- [ ] git ticket canvas show prints the rules and what each catches
- [ ] git ticket canvas pens prints the rules in resolution order
- [ ] git ticket canvas explain ID names the matching pen, the rules it beat, and any pin
- [ ] The commands work on a checkout with no canvas running
- [ ] A board with no layout file is reported as such rather than as an error
