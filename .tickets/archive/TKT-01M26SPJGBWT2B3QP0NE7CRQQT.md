---
schema: 3
id: TKT-01M26SPJGBWT2B3QP0NE7CRQQT
title: Finish committed sampling probe verification
type: task
status: archived
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - ui
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
    path: null
  - ref: code:control-measurements
    path: null
  - ref: code:sampled-frame
    path: null
claim: null
archive:
  archived_at: 2026-09-19T08:34:33Z
  from_status: draft
  reason: "Superseded on 2026-09-19 with its parent TKT-01M2441T0PTXRFK6VC4FM1PET7: the adopted contract in docs/board-organization-design-v1.md places cards through one resolver shared with the CLI, so the opt-in trial route this verified is not the one being built. Evidence and scope documents stay as records."
created_at: 2026-09-10T23:15:59Z
updated_at: 2026-09-20T18:38:35Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
extensions: {}
---

## Description

The committed sampling probe implementation is present and its unit/component tests pass, but the approved slice lacks its final real-source Chromium evidence and complete scope audit. Finish verification against docs/pen-committed-sampling-scope-v1.md before treating receipts as an integration prerequisite. Default activation remains prohibited. This is remaining work split from the existing pens ticket, not approval to expand scope.

## Acceptance criteria

- [ ] Audit the implementation and tests against every approved sampling requirement; record any missing behavior without claiming completion.
- [ ] Verify actual CSS control geometry, filtering/selection stability, staging, ownership, holds and A/B/A in a disposable real-source Chromium fixture.
- [ ] Write a new implementation/evidence document and link it without changing previously delivered scope documents.

## Notes

**agent:claude/t3code-a6d0ff31** at 2026-09-19T08:06:40Z

Decision 2026-09-19: the pen contract moved to docs/board-organization-design-v1.md, whose placement is one resolve function shared with the CLI. The committed sampling probe and the opt-in scene trial this ticket verifies were the approved spec's route to the same end. Whether any of that machinery survives is decided when TKT-01M2ND1RKK6S4GXZQKKPP6H87P is planned; until then this ticket is a candidate for archiving rather than promotion.

**agent:claude/t3code-a6d0ff31** at 2026-09-19T08:34:33Z

archived from draft: Superseded on 2026-09-19 with its parent TKT-01M2441T0PTXRFK6VC4FM1PET7: the adopted contract in docs/board-organization-design-v1.md places cards through one resolver shared with the CLI, so the opt-in trial route this verified is not the one being built. Evidence and scope documents stay as records.
