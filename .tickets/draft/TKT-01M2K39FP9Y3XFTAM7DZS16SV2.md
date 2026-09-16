---
schema: 3
id: TKT-01M2K39FP9Y3XFTAM7DZS16SV2
title: Apply a planned move and settle what happens at the source
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - api
  - canvas
assignees: []
milestone: null
parent: TKT-01M2K38J5NGC6MNZKKEX285B61
origin: null
dependencies:
  - TKT-01M2K39FN01J4VENBHW9CP13ZB
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-15T17:54:29Z
updated_at: 2026-09-16T20:44:24Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

### What

Apply a plan produced by the preview, and do whatever the epic decided happens to the source ticket.

### The decision this ticket closes

`Export` removes nothing, so import alone is a copy. Settle it here and record the reasoning: archive at the source is the likely answer, because `remove` refuses a ticket carrying notes, comments, a summary, or a claim, and a ticket worth moving usually carries at least one of those.

Until this lands the feature is a copy, and the word move should not appear in the interface.

### SameOwner

This is where `ImportOptions.SameOwner` is decided and made configurable. Default to not carrying the sender's ticks and status. A person who keeps every store in one workspace can turn it on, and a canvas that turned it on by itself would be carrying evidence across a boundary nobody asked it to cross.

### Ordering

The apply must consume a plan rather than recompute one. If it recomputes, the preview stops being a promise and becomes a second opinion, which is the one failure this API's shape exists to prevent.

## Acceptance criteria

- [ ] Applying a plan files the tickets in the target with the edges among them rewritten to the target's IDs
- [ ] The apply consumes the plan it was given and does not recompute one
- [ ] What happens to the source ticket is implemented and its reasoning recorded in the ticket
- [ ] SameOwner is configurable and defaults to not carrying the sender's ticks and status
- [ ] A move is exercised end to end between two real stores, and the result is read back with the CLI
