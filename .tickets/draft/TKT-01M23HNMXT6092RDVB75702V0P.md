---
schema: 3
id: TKT-01M23HNMXT6092RDVB75702V0P
title: Gate the Preact migration on embedded browser parity
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
  - TKT-01M23HNAW5E258569DEB9BFCD1
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-09T16:57:57Z
updated_at: 2026-09-09T16:57:57Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Close the migration with repeatable checks of the actual Go-embedded frontend. Add committed-dist verification and document the new workflow in a successor development guide rather than silently rewriting the baseline reports. Record what the prototype demonstrates for possible future interactive ticket tooling, without implementing direct terva integration.

## Acceptance criteria

- [ ] A locked frontend rebuild matches committed dist, with a check that detects changed, missing, and extra generated files.
- [ ] just exposes frontend typecheck, unit/component tests, browser tests, and dist verification; the aggregate validation workflow is documented.
- [ ] Browser parity tests pass against a freshly built Go binary serving embedded assets, not only the Vite server.
- [ ] Go race tests, frontend tests, typecheck, production build, strict ticket validation, and clean-checkout Go-only build/install checks pass.
- [ ] A successor developer guide explains the frontend build requirement and supersedes the relevant no-build-step instructions without altering historical validation reports.
- [ ] A migration report records preserved behaviors, known limitations, and candidates for reuse. Any proposed host integration remains separate draft work requiring an explicit host, user workflow, and evidence-based promotion gate.
