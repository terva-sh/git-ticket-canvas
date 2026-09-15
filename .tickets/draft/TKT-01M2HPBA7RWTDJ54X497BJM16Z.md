---
schema: 3
id: TKT-01M2HPBA7RWTDJ54X497BJM16Z
title: Explain discovery decisions with a --scan dry run
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - discovery
assignees: []
milestone: null
parent: TKT-01M2HPB9WEYH5VSYB55GNYMZ8Y
origin: null
dependencies:
  - TKT-01M2HPBA4EZT6EGT0Q0ZCRY4F4
  - TKT-01M2HPBA60FP1Y0TK81HHYZT0H
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-15T04:49:03Z
updated_at: 2026-09-15T04:49:03Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

Explain the result of discovery, per candidate.

Depth, exclusions, the store-boundary rule, declared children, and explicit
entries all interact. "Why is my store not in the list" has five possible
answers, so answer it directly rather than leaving somebody to guess.

`git-ticket-canvas --scan` runs discovery, prints one line per candidate with
the reason for the decision, and exits without starting a server.

```
$ git-ticket-canvas --scan
~/workspace  depth 4
  ok   ledger                          store
  ok   forge/org/project               store
  skip forge/other-org                 excluded (config: exclude[0])
  skip forge/org/project/docs          not descended (store boundary)
  ok   forge/org/project/docs/fixture  child (declared by forge/org/project)
  skip forge/org/project/node_modules  excluded (default)
```

This is also the test harness for the walk. A test that asserts against this
output covers depth, hidden directories, exclusions, boundaries, and declared
children in one readable fixture, which is easier to review than a set of
assertions over a returned structure.

## Acceptance criteria

- [ ] --scan prints one line per candidate with the decision and the reason, then exits without serving.
- [ ] Each reason names its cause: depth, a store boundary, which exclusion matched, or which store declared a child.
- [ ] The output is stable enough to assert against, and the walk tests use it.

## Definition of done

- [ ] go test ./... passes.
