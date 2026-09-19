---
schema: 3
id: TKT-01M2ND0S8N5Y8V0HQFRCBKMXE3
title: Let an agent organize a board
type: epic
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - layout
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T15:22:59Z
updated_at: 2026-09-19T08:06:40Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
extensions: {}
---

## Description

An untouched ticket store opens as every card at once, in status lanes, sorted by ticket ID. Adjacency means nothing: the tickets either side of one you care about are its ID neighbours. That is the honest output of `autoPlace` when nothing has told it what belongs with what.

Three records already exist to tell it. `Pen` is a label conjunction with a region, a colour and a pin. `Routing` carries the pens, an explicit `ruleOrder` for ties, and an `inbox` point for anything unmatched. `Card.Collapsed` is a per-card density flag. All three are modelled, validated, round-tripped through YAML and JSON, and reconciled into frontend state, and nothing reads any of them.

Nor can an agent write them. `git ticket` has no canvas commands, so organizing a board needs a running desk canvas and a browser, and a served canvas is read-only.

This epic closes both halves: agents author rules rather than coordinates, and the card encodes actionability rather than lifecycle.

See `docs/board-organization-design-v1.md`.

## Notes

**agent:claude/t3code-a6d0ff31** at 2026-09-19T08:06:40Z

Adopted on 2026-09-19 as the contract for pens over docs/pen-specification-v1.md on matching, resolution order, the no-pen board, and authoring order; see the note on TKT-01M2441T0PTXRFK6VC4FM1PET7. Under the served canvas, which is read-only, this epic's CLI is the only authoring path that reaches every reader.
