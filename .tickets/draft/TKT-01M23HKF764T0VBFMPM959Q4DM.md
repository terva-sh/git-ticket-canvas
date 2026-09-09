---
schema: 3
id: TKT-01M23HKF764T0VBFMPM959Q4DM
title: Capture MVP browser behavior before the Preact migration
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
dependencies: []
blocks_on: none
references:
  - ref: source:frontend
    path: web/app.js
  - ref: tooling:just
    path: justfile
claim: null
archive: null
created_at: 2026-09-09T16:56:46Z
updated_at: 2026-09-09T16:56:46Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Add a Playwright baseline against the current Go-served vanilla frontend before changing rendering frameworks. Run against isolated temporary stores with explicit actors, never the repository's work ledger. Establish browser-test tooling with a lockfile that the later Vite workspace can reuse.

Capture intended behavior and report reproducible defects separately rather than asserting broken behavior as parity. Blocking baseline defects must be resolved or explicitly scoped by a person before dependent work is promoted.

## Acceptance criteria

- [ ] Browser tests cover draft creation, inspector editing, revision-conflict feedback after an external write, and read-only refusal without disk changes.
- [ ] Browser tests cover pan/zoom, multi-selection dragging, pinning, dependency direction, keyboard shortcuts, and layout persistence after reload.
- [ ] Polling or focus refresh observes external ticket changes without silently losing unfinished form edits; observed baseline defects are recorded separately.
- [ ] Tests start and stop their servers, clean up temporary stores, and run through a documented just recipe.
- [ ] The baseline suite passes against the unconverted frontend and its scope is documented.
