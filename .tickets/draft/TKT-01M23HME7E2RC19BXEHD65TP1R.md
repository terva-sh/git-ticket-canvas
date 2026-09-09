---
schema: 3
id: TKT-01M23HME7E2RC19BXEHD65TP1R
title: Extract typed ticket state and canvas geometry modules
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
  - TKT-01M23HKTJXM6GW1WDA3RFM1FC9
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-09T16:57:17Z
updated_at: 2026-09-09T16:57:17Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Separate the existing frontend's API client, ticket state transitions, placement calculations, and coordinate transforms from DOM rendering. Keep these modules Preact-free. Preserve the existing HTTP contract and distinguish saved ticket/layout data from selection, draft forms, viewport, and transient drag positions.

Add focused Vitest tests and a small import-boundary guard. This is extraction for the current application, not a published library or a speculative transport abstraction.

## Acceptance criteria

- [ ] Typed requests and responses match the Go API, including actor field casing, revisions, errors, and partial-success responses.
- [ ] Ticket mutations accept server results as authoritative; stale revisions reload rather than retry edits invisibly.
- [ ] Placement and zoom/coordinate calculations have pure tests, including pinned versus unpinned behavior.
- [ ] Persisted state and transient interface state have separate types and update paths.
- [ ] Unit tests cover out-of-order reads, board changes during pending layout saves, and failure responses so delayed work cannot overwrite unrelated state.
- [ ] Import-boundary tests prevent platform modules from depending on Preact, DOM rendering, or application composition; the browser baseline still passes.
