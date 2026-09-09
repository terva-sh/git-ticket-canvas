---
schema: 3
id: TKT-01M23HK5J08WDF7Q2EA9SG6C9V
title: Migrate the ticket canvas MVP to Preact
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
blocks_on: children
references:
  - ref: baseline:validation
    path: docs/mvp-validation.md
  - ref: baseline:api-tests
    path: internal/api/server_test.go
claim: null
archive: null
created_at: 2026-09-09T16:56:36Z
updated_at: 2026-09-09T16:58:06Z
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

- [ ] All child tickets are complete and existing ticket/layout contracts remain compatible.
- [ ] Browser tests demonstrate parity for ticket edits, conflicts, read-only behavior, and canvas gestures.
- [ ] A clean checkout can build and install the embedded application using Go without a JavaScript toolchain; frontend source and committed dist are verified together.
- [ ] The frontend keeps reusable ticket and geometry logic independent of Preact and application composition.
