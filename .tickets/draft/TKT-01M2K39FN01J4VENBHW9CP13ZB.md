---
schema: 3
id: TKT-01M2K39FN01J4VENBHW9CP13ZB
title: Preview a ticket move without writing anything
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels: []
assignees: []
milestone: null
parent: TKT-01M2K38J5NGC6MNZKKEX285B61
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-15T17:54:29Z
updated_at: 2026-09-15T17:54:29Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

### What

An endpoint that takes a ticket, a source store, and a target store, calls `Export` on the source and `PlanImport` on the target, and answers with the plan. It writes nothing anywhere, which is the property that makes it safe to call while somebody is still deciding.

### Why this is its own ticket

The preview is the whole value of this API and it is testable without any write path existing. Every `ChangeKind` the receiving store would impose can be provoked from fixtures: a label the target does not permit, a milestone it does not know, a due date it drops, a dependency that does not cross, an acceptance criterion that arrives ticked and lands unticked.

Getting this right first means the apply half has nothing left to decide, which is exactly how the library splits it.

### Report the changes as the library names them

Pass the `ChangeKind` values through rather than rewriting them into prose on the server. The browser needs to group and count them, and a string the server invented is a string two places have to agree about.

## Acceptance criteria

- [ ] An endpoint returns an import plan for a ticket, given a source and a target store
- [ ] It writes nothing: the source, the target, and both working trees are unchanged after a call
- [ ] Every ChangeKind the plan can carry is provoked by a test
- [ ] The ChangeKind values reach the browser as the library names them
- [ ] A target that refuses the ticket answers with the reason rather than an empty plan
