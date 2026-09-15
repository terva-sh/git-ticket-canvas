---
schema: 3
id: TKT-01M2K38J5NGC6MNZKKEX285B61
title: Move a ticket between stores from the canvas
type: epic
status: draft
status_reason: null
priority: normal
due_on: null
labels: []
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-15T17:53:59Z
updated_at: 2026-09-15T17:53:59Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

### Why now

The multi-store epic TKT-01M2HPB9W (Serve many ticket stores from one canvas)
closed by saying that rendering tickets from several stores together needs
namespaced ticket IDs, a decision about where a layout spanning two stores is
persisted, and a per-card origin badge. Moving a ticket between stores needs
none of those, and the precondition it does need already exists: one process
holds every store open.

v0.18.1 supplies the rest. `Store.Export` builds an artifact, `PlanImport`
decides what would happen and writes nothing, and `ApplyImport` files what the
plan settled and decides nothing itself.

### Why this API fits a canvas better than most

Between the two halves sits `ChangeKind`, which names thirteen things a
receiving store imposes on an incoming ticket: `label_dropped`,
`milestone_dropped`, `due_on_dropped`, `blocks_on_dropped`,
`reference_path_dropped`, `acceptance_criteria_unchecked`,
`definition_of_done_unchecked`, `status_carried`, `status_not_carried`,
`work_record_carried`, `acceptance_criteria_carried`,
`definition_of_done_carried`, and `origin_parent_recorded`.

A plan that writes nothing and enumerates its own consequences is a confirm
dialog with a real diff in it. The user drags a card to another store, reads
what they would lose, and decides. Most libraries make you build that list
yourself and get it subtly wrong.

### Two decisions this epic owns

**What happens to the source ticket.** `Export` does not remove anything, so
import alone is a copy. A move is an import plus something at the source, and
archiving is the likely answer because a deletion refuses on a ticket carrying
work. Until that is settled, this is a copy feature wearing the word move, and
the word should not appear in the UI until the behaviour matches it.

**Whether `ImportOptions.SameOwner` is set, and by whom.** With it, the
sender's ticks, status, and filing instant travel. Without it, every ticket
lands as a draft with its boxes cleared. Twenty-two stores under one person is
arguably the case it was written for, but a canvas that sets it silently is
carrying evidence across a boundary on the user's behalf. It should be a
deliberate setting with a default that errs toward not carrying.

### Not in scope

Rendering two stores on one canvas at the same time. This epic moves a ticket
between stores that are each viewed on their own, which is why it does not need
the namespaced IDs the earlier epic deferred.
