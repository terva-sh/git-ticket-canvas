---
schema: 3
id: TKT-01M26SPJGBWT2B3QP0NE7CRQQT
title: Finish committed sampling probe verification
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - ui
  - canvas
assignees: []
milestone: null
parent: TKT-01M2441T0PTXRFK6VC4FM1PET7
origin: null
dependencies: []
blocks_on: none
references:
  - ref: spec:committed-sampling
    path: docs/pen-committed-sampling-scope-v1.md
  - ref: code:committed-sampling
    path: web/src/ui/canvas/committedSampling.ts
  - ref: code:control-measurements
    path: web/src/ui/canvas/controlMeasurements.ts
  - ref: code:sampled-frame
    path: web/src/ui/canvas/SampledFrame.tsx
claim: null
archive: null
created_at: 2026-09-10T23:15:59Z
updated_at: 2026-09-10T23:15:59Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

The committed sampling probe implementation is present and its unit/component tests pass, but the approved slice lacks its final real-source Chromium evidence and complete scope audit. Finish verification against docs/pen-committed-sampling-scope-v1.md before treating receipts as an integration prerequisite. Default activation remains prohibited. This is remaining work split from the existing pens ticket, not approval to expand scope.

## Acceptance criteria

- [ ] Audit the implementation and tests against every approved sampling requirement; record any missing behavior without claiming completion.
- [ ] Verify actual CSS control geometry, filtering/selection stability, staging, ownership, holds and A/B/A in a disposable real-source Chromium fixture.
- [ ] Write a new implementation/evidence document and link it without changing previously delivered scope documents.
