---
schema: 3
id: TKT-01M26SQB4JWTW8FPSVHYZKFKCR
title: Gate default pen activation on controls and trial evidence
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - ui
  - canvas
  - labels
assignees: []
milestone: null
parent: TKT-01M2441T0PTXRFK6VC4FM1PET7
origin: null
dependencies:
  - TKT-01M26SPW8XM5Q3M73536W5X0F1
blocks_on: none
references:
  - ref: spec:pens
    path: docs/pen-specification-v1.md
  - ref: spec:rule-authoring
    path: docs/pen-rule-authoring-addendum-v1.md
  - ref: proposal:activation-gate
    path: docs/pen-position-consumers-proposal-v1.md
claim: null
archive: null
created_at: 2026-09-10T23:16:24Z
updated_at: 2026-09-10T23:16:24Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Default pen activation remains blocked even after a passing opt-in trial. Keep this ticket draft until a person reviews the trial evidence and explicitly approves a bounded controls/activation plan. Queue order or passing foundation tests is not authorization. Remaining production scope includes visible pen/Inbox controls, rule authoring, preview/apply/cancel, explanations/counts, removal and return-to-automatic, complete obstacles, and end-to-end verification. Preserve approved specifications and record later decisions in new documents.

## Acceptance criteria

- [ ] Record explicit human promotion approval referencing trial evidence and a reviewed bounded controls/activation plan.
- [ ] Implement and verify approved pen/Inbox and rule-authoring interactions, including previews, manual intent, counts, ties and removal.
- [ ] Review external-writer concurrency limits and complete production obstacle coverage before activation.
- [ ] Verify end-to-end routing/save/history behavior, 120-card performance and generated assets before separately approved default activation.
