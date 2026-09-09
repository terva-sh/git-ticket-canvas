---
schema: 3
id: TKT-01M23HMQ1PGCP8XSJ7PDJGWD3E
title: Convert ticket forms and toolbar to Preact components
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels: []
assignees: []
milestone: null
parent: TKT-01M23HK5J08WDF7Q2EA9SG6C9V
origin: null
dependencies:
  - TKT-01M23HME7E2RC19BXEHD65TP1R
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-09T16:57:26Z
updated_at: 2026-09-09T16:57:26Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Move the toolbar, ticket inspector, composer, and feedback messages into Preact components backed by the extracted modules. Preserve current appearance and supported operations. During the transition, give each DOM subtree exactly one owner so legacy canvas rendering and Preact do not modify the same nodes.

## Acceptance criteria

- [ ] Preact owns the toolbar, inspector, composer, and feedback UI; component boundaries are explicit.
- [ ] All current inspector fields, checklists, notes/comments, claims, transitions, and archive/delete actions remain available with server-enforced rules.
- [ ] Component tests cover form drafts during refresh, submission success and failure, stale revisions, read-only controls, and partial-success feedback.
- [ ] Keyboard focus and shortcuts do not interfere with text editing or move focus unexpectedly on refresh.
- [ ] Browser baseline tests pass with the legacy canvas and Preact forms sharing no DOM ownership.
