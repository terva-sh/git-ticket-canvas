---
schema: 3
id: TKT-01M23HK5J08WDF7Q2EA9SG6C9V
title: Migrate the ticket canvas MVP to Preact
type: epic
status: done
status_reason: Implementation completed in all seven child tickets on main through c34d361. Reviewed all four epic criteria and reran just parity-check successfully before closing this tracking epic at the user's request.
priority: normal
due_on: null
labels: []
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: children
references:
  - ref: baseline:validation
    path: docs/mvp-validation.md
  - ref: baseline:api-tests
    path: internal/api/server_test.go
  - ref: report:migration
    path: docs/preact-migration.md
  - ref: guide:current-development
    path: docs/development-preact.md
  - ref: test:platform-boundaries
    path: tests/platform/boundaries.test.ts
claim: null
archive: null
created_at: 2026-09-09T16:56:36Z
updated_at: 2026-09-09T19:10:07Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Convert the standalone tkcanvas frontend to Preact, strict TypeScript, and Vite while preserving its current appearance, ticket interactions, HTTP API, layout format, and single Go binary distribution. Borrow the layer boundaries and committed frontend build conventions from ../terva/packages/agent/web/client, not its control protocol or application-specific components.

Keep ticket state, persisted layout, transient gestures, and local interface state distinct. The result should provide tested interaction patterns and separable modules that may inform future interactive ticket tooling. Direct integration into terva, a shared package, authentication, a PWA, and a new transport are outside this epic.

### Promotion gate

A person must approve the migration scope, TypeScript/Vite toolchain, committed dist policy, and parity-first approach before promoting implementation tickets. Baseline browser tests must pass before the frontend conversion begins. Children record the dependency order; filing does not authorize implementation.

## Acceptance criteria

- [x] All child tickets are complete and existing ticket/layout contracts remain compatible.
- [x] Browser tests demonstrate parity for ticket edits, conflicts, read-only behavior, and canvas gestures.
- [x] A clean checkout can build and install the embedded application using Go without a JavaScript toolchain; frontend source and committed dist are verified together.
- [x] The frontend keeps reusable ticket and geometry logic independent of Preact and application composition.

## Notes

**agent:terva/mieli** at 2026-09-09T19:10:07Z

draft to done: Implementation completed in all seven child tickets on main through c34d361. Reviewed all four epic criteria and reran just parity-check successfully before closing this tracking epic at the user's request.

## Summary

Reviewed all four criteria at application commit c34d361 and confirmed all seven children are done. Production API and layout code are unchanged from baseline 42cc798; main.go changes only the embedded asset root. Fresh just parity-check passed 27 embedded Chromium cases covering edits, conflicts, read-only behavior and gestures; 71 frontend tests including platform import/DOM boundaries; 13 tooling tests; strict TypeScript; Go race/vet/format checks; strict ledger validation; locked source-to-HEAD dist comparison; and clean HEAD Go-only build/install with Node/npm absent from PATH. Pure ticket and geometry modules remain under web/src/platform, independent of Preact/application composition. Closed on the user's authorization after review. Host integration remains outside scope.
