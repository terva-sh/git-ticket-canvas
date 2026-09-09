---
schema: 3
id: TKT-01M23HME7E2RC19BXEHD65TP1R
title: Extract typed ticket state and canvas geometry modules
type: task
status: done
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
references:
  - ref: code:ticket-platform
    path: web/src/platform/tickets/store.ts
  - ref: code:canvas-geometry
    path: web/src/platform/canvas/geometry.ts
  - ref: doc:platform-modules
    path: docs/platform-modules.md
  - ref: test:platform-boundaries
    path: tests/platform/boundaries.test.ts
  - ref: test:layout-refusal
    path: tests/browser/platform.spec.ts
  - ref: git:5e35465:web/app.js
    path: null
claim: null
archive: null
created_at: 2026-09-09T16:57:17Z
updated_at: 2026-09-09T18:41:53Z
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

- [x] Typed requests and responses match the Go API, including actor field casing, revisions, errors, and partial-success responses.
- [x] Ticket mutations accept server results as authoritative; stale revisions reload rather than retry edits invisibly.
- [x] Placement and zoom/coordinate calculations have pure tests, including pinned versus unpinned behavior.
- [x] Persisted state and transient interface state have separate types and update paths.
- [x] Unit tests cover out-of-order reads, board changes during pending layout saves, and failure responses so delayed work cannot overwrite unrelated state.
- [x] Import-boundary tests prevent platform modules from depending on Preact, DOM rendering, or application composition; the browser baseline still passes.

## Implementation plan

Extract wire DTOs and a typed fetch client, a Preact-free store with guarded read generations and serialized writes, and a board-keyed debounced layout writer. Keep persisted layout separate from UI drag previews. Integrate through thin legacy DOM adapters without converting components. Geometry extraction is independent and delegated; review and integrate its pure helpers/tests. Add Vitest tests for stale reads, board changes, pending saves, partial successes, and failure paths plus a static import/global boundary guard. Validate strict types, unit tests, 3x bundled browser baseline, Go checks, and regenerate committed dist. Use patched Vitest 5 rather than introducing the reported mocker vulnerability in older versions.

## Notes

**agent:terva/mieli** at 2026-09-09T17:59:39Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-29 Typed requests and responses match the Go API, including actor field casing, revisions, errors, and partial-success responses. — Inspected Go DTO, schema and op JSON fields. Strict TypeScript and 11 client tests pass for actor casing, explicit revisions, nullable fields, errors and HTTP 207.
- [x] task-30 Ticket mutations accept server results as authoritative; stale revisions reload rather than retry edits invisibly. — TicketStore tests verify authoritative results, serialized writes, explicit snapshot revisions, stale reload without retry, and original error preservation. Three repeats of stale inspector browser tests passed.
- [x] task-31 Placement and zoom/coordinate calculations have pure tests, including pinned versus unpinned behavior. — 25 geometry tests pass for stable placement, pinned positions, scene/client transforms, cursor zoom and fit bounds. Integrated the reviewed geometry worktree files into web/app.js.
- [x] task-32 Persisted state and transient interface state have separate types and update paths. — PersistedState and CanvasState are separate. Renderer holds DOM/form controls and transient previews, while only store responses update saved cards. State isolation test and three browser save-refusal runs pass.
- [x] task-33 Unit tests cover out-of-order reads, board changes during pending layout saves, and failure responses so delayed work cannot overwrite unrelated state. — 18 store/writer tests pass, including latest reads, A-to-B-to-A generation changes, reads across writes, copied layout batches, board switches during saves, write failures and HTTP partial success.
- [x] task-34 Import-boundary tests prevent platform modules from depending on Preact, DOM rendering, or application composition; the browser baseline still passes. — AST boundary checks and negative probes pass. All 58 unit tests pass. Bundled browser baseline passed 42/42 runs; added layout-failure regression passed 3/3. just check, npm audit and git diff --check pass. Documentation added at docs/platform-modules.md.

## Summary

Extracted typed wire contracts, HTTP client, guarded ticket store, board-keyed layout debounce and pure canvas geometry. The vanilla renderer uses separate drag previews and accepts server results without optimistic ticket edits. Stale and partially failed multi-op writes reload without retry. Fixed the native-fetch receiver issue found by the browser baseline and added its unit regression. Validation: 58 unit/boundary tests, 42 baseline browser runs and 3 layout-refusal browser runs passed; just check and npm audit passed. Regenerated embedded dist. docs/platform-modules.md records module ownership and ordering rules. Preact component conversion remains separate draft work.
