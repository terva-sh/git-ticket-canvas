---
schema: 3
id: TKT-01M23HNMXT6092RDVB75702V0P
title: Gate the Preact migration on embedded browser parity
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
  - TKT-01M23HNAW5E258569DEB9BFCD1
blocks_on: none
references:
  - ref: code:dist-verifier
    path: scripts/verify-dist.mjs
  - ref: code:go-only-verifier
    path: scripts/verify-go-only.py
  - ref: test:dist-verifier
    path: tests/tooling/verify-dist.test.mjs
  - ref: test:parity-recipe
    path: tests/tooling/parity-recipe.test.mjs
  - ref: workflow:just
    path: justfile
  - ref: guide:development-preact
    path: docs/development-preact.md
  - ref: report:preact-migration
    path: docs/preact-migration.md
claim: null
archive: null
created_at: 2026-09-09T16:57:57Z
updated_at: 2026-09-09T19:06:26Z
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

- [x] A locked frontend rebuild matches committed dist, with a check that detects changed, missing, and extra generated files.
- [x] just exposes frontend typecheck, unit/component tests, browser tests, and dist verification; the aggregate validation workflow is documented.
- [x] Browser parity tests pass against a freshly built Go binary serving embedded assets, not only the Vite server.
- [x] Go race tests, frontend tests, typecheck, production build, strict ticket validation, and clean-checkout Go-only build/install checks pass.
- [x] A successor developer guide explains the frontend build requirement and supersedes the relevant no-build-step instructions without altering historical validation reports.
- [x] A migration report records preserved behaviors, known limitations, and candidates for reuse. Any proposed host integration remains separate draft work requiring an explicit host, user workflow, and evidence-based promotion gate.

## Implementation plan

Build current frontend inputs in a temporary directory with npm ci, leaving web/dist untouched. Compare exact path sets and bytes against HEAD's committed dist and the working dist; test changed, missing, extra, and ignored files. Add just recipes for dist verification, committed-asset browser tests, an aggregate parity gate, and a clean HEAD archive Go-only build/install check with a restricted PATH. Keep the existing rebuild-and-test developer loop. Run the complete gate and repeated embedded browser suite. Add successor development and migration reports without changing historical reports. Commit explicit paths, excluding user-owned .tickets/canvas, and do not push.

## Notes

**agent:terva/mieli** at 2026-09-09T19:06:17Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-46 A locked frontend rebuild matches committed dist, with a check that detects changed, missing, and extra generated files. — node --test tests/tooling/*.test.mjs passed 12 failure-mode/cleanup tests. node scripts/verify-dist.mjs rebuilt with npm ci in isolation and matched HEAD and working dist byte for byte; web/dist was not overwritten.
- [x] task-47 just exposes frontend typecheck, unit/component tests, browser tests, and dist verification; the aggregate validation workflow is documented. — just parity-check passed after splitting variadic recipe invocations. tests/tooling/parity-recipe.test.mjs guards the ordered calls. docs/development-preact.md documents development checks versus the non-overwriting release gate.
- [x] task-48 Browser parity tests pass against a freshly built Go binary serving embedded assets, not only the Vite server. — just parity-check passed all 27 browser cases; just browser-test-embedded --repeat-each=3 passed 81/81. Inspected global-setup.ts and fixtures.ts: go build creates the actual embedded binary and per-test temporary stores, with no Vite process or frontend prehook.
- [x] task-49 Go race tests, frontend tests, typecheck, production build, strict ticket validation, and clean-checkout Go-only build/install checks pass. — just parity-check passed locked Vite production build, strict tsc, 71 frontend tests, 13 tooling tests, go vet, Go formatting, go test -race -cover, strict ticket validation, and Go-only build/install from clean HEAD e95b430 with Node/npm absent from PATH. npm ci reported zero vulnerabilities; git diff --check passed.
- [x] task-50 A successor developer guide explains the frontend build requirement and supersedes the relevant no-build-step instructions without altering historical validation reports. — Added docs/development-preact.md and updated justfile's guide pointer. Guide explicitly supersedes README/development no-build instructions and the Vite incremental guide, documents Go-only consumers and frontend development, and leaves historical documents unchanged.
- [x] task-51 A migration report records preserved behaviors, known limitations, and candidates for reuse. Any proposed host integration remains separate draft work requiring an explicit host, user workflow, and ev… — docs/preact-migration.md records unchanged API/layout and embedded deployment contracts, 27-case behavior coverage, 71 frontend/13 tooling/81 repeated browser results, validation environment, scope limits, and reuse candidates. Host integration stays separate draft work with an explicit host/workflow/evidence dependency gate. Historical docs and dist have no diff.

## Summary

Added non-overwriting locked dist verification against HEAD, 13 tooling regression tests, explicit just parity-check ordering, embedded-only browser testing, and clean HEAD Go-only build/install verification. The corrected aggregate passed 71 frontend tests, strict TypeScript, locked production rebuild, Go formatting/vet/race tests, strict ledger validation, 27 embedded browser cases, and clean Go-only build/install. A separate embedded suite passed 81/81 repeated runs. Added docs/development-preact.md and docs/preact-migration.md without changing historical reports or generated assets. No host integration implemented or promoted; .tickets/canvas remains untouched.
