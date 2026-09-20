---
schema: 3
id: TKT-01M2Y91C17YTE0W0P3RBHTF50Y
title: Widen a pen's rule from requiredLabels to a match record
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - layout
assignees: []
milestone: null
parent: TKT-01M2ND0S8N5Y8V0HQFRCBKMXE3
origin: null
dependencies:
  - TKT-01M2ND1RKK6S4GXZQKKPP6H87P
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-20T02:06:34Z
updated_at: 2026-09-20T02:06:34Z
created_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
updated_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
extensions: {}
---

## Description

Schema 4 replaces a pen's requiredLabels with a match record: labels, status, type, parent, every field optional, absent matching everything, present fields conjoined, a list within a field a disjunction. Schema 3 requiredLabels keeps opening and reads as match.labels. Cross-repo: the record, its validation and layout.Route in git-ticket's layout package, then git ticket canvas explain and show, then the web normalizer and resolver, then a git-ticket release and the canvas bump. Split from TKT-01M2ND1RKK6S4GXZQKKPP6H87P on 2026-09-20 so placement could ship on the rule the CLI already resolves; see docs/board-organization-design-v1.md, Pens, finished.

## Acceptance criteria

- [ ] A pen's match may name labels, status, type and parent, and every field is optional
- [ ] Schema 3 requiredLabels opens and reads as match.labels
- [ ] layout.Route and the web resolver give the same answer for every match field
- [ ] git ticket canvas explain reports which match fields a candidate failed
