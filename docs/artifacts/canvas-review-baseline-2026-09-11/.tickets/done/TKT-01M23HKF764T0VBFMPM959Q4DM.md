---
schema: 3
id: TKT-01M23HKF764T0VBFMPM959Q4DM
title: Capture MVP browser behavior before the Preact migration
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
  - TKT-01M23J6D5NE0FE1Z1QAMXMMA5C
blocks_on: none
references:
  - ref: tooling:just
    path: justfile
  - ref: test:browser-baseline
    path: tests/browser/baseline.spec.ts
  - ref: docs:browser-testing
    path: docs/browser-testing.md
  - ref: tooling:playwright
    path: playwright.config.ts
  - ref: validation:browser-passed
    path: docs/browser-baseline-passed.md
  - ref: git:42cc798:web/app.js
    path: null
claim: null
archive: null
created_at: 2026-09-09T16:56:46Z
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

Add a Playwright baseline against the current Go-served vanilla frontend before changing rendering frameworks. Run against isolated temporary stores with explicit actors, never the repository's work ledger. Establish browser-test tooling with a lockfile that the later Vite workspace can reuse.

Capture intended behavior and report reproducible defects separately rather than asserting broken behavior as parity. Blocking baseline defects must be resolved or explicitly scoped by a person before dependent work is promoted.

## Acceptance criteria

- [x] Browser tests cover draft creation, inspector editing, revision-conflict feedback after an external write, and read-only refusal without disk changes.
- [x] Browser tests cover pan/zoom, multi-selection dragging, pinning, dependency direction, keyboard shortcuts, and layout persistence after reload.
- [x] Polling or focus refresh observes external ticket changes without silently losing unfinished form edits; observed baseline defects are recorded separately.
- [x] Tests start and stop their servers, clean up temporary stores, and run through a documented just recipe.
- [x] The baseline suite passes against the unconverted frontend and its scope is documented.

## Implementation plan

Add a root npm/Playwright workspace with a lockfile, keeping node_modules outside the currently embedded web directory. A Go test helper initializes an isolated store using ticket.Init; Playwright launches the actual built tkcanvas binary per test on an ephemeral loopback port and cleans up processes/stores. Cover mutations, stale writes, read-only behavior, gestures, shortcuts, and external refresh through UI and independent API requests. Keep frontend code unchanged; record reproduced defects with intended-behavior regression tests and block conversion rather than blessing failures as parity. Add just browser setup/test recipes and a new browser-testing guide.

## Notes

**agent:terva/mieli** at 2026-09-09T17:09:47Z

in-progress to blocked: Browser baseline reproduces refresh submitting unfinished description text. Waiting for TKT-01M23J6D5NE0FE1Z1QAMXMMA5C (Prevent refresh from submitting unfinished inspector text); full suite is not green and conversion must remain gated.

**agent:terva/mieli** at 2026-09-09T17:09:47Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-16 Browser tests cover draft creation, inspector editing, revision-conflict feedback after an external write, and read-only refusal without disk changes. — Creation/edit, stale conflict reload, and read-only controls/drag/file-snapshot assertions passed in all three full Chromium runs.
- [x] task-17 Browser tests cover pan/zoom, multi-selection dragging, pinning, dependency direction, keyboard shortcuts, and layout persistence after reload. — Gesture, persistence, multi-select, dependency direction, and keyboard cases passed all three full runs. Strengthened numeric cursor-anchor zoom assertions passed three further focused runs.
- [ ] task-18 (blocked) Polling or focus refresh observes external ticket changes without silently losing unfinished form edits; observed baseline defects are recorded separately. — Polling and visibility refresh read external changes, but refresh submits focused description text without user intent. Reproduced in 3/3 full runs; filed TKT-01M23J6D5NE0FE1Z1QAMXMMA5C (Prevent refresh from submitting unfinished inspector text).
- [x] task-19 Tests start and stop their servers, clean up temporary stores, and run through a documented just recipe. — Added locked Playwright workspace, just browser-setup/browser-test, temporary binary/store fixtures and teardown, and docs/browser-testing.md. Repeated tests completed without retained servers or stores.
- [ ] task-20 (blocked) The baseline suite passes against the unconverted frontend and its scope is documented. — docs/browser-testing.md records scope and limitations. Full repeated suite has 27 passes and 3 failures of the same unfinished-description regression; no skip or expected-failure annotation. Frontend unchanged. just check and locked browser setup pass.

**agent:terva/mieli** at 2026-09-09T17:20:10Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-16 Browser tests cover draft creation, inspector editing, revision-conflict feedback after an external write, and read-only refusal without disk changes. — Creation/edit, stale conflict reload, and read-only controls/drag/file-snapshot assertions passed in all three full Chromium runs.
- [x] task-17 Browser tests cover pan/zoom, multi-selection dragging, pinning, dependency direction, keyboard shortcuts, and layout persistence after reload. — Gesture, persistence, multi-select, dependency direction, and keyboard cases passed all three full runs. Strengthened numeric cursor-anchor zoom assertions passed three further focused runs.
- [x] task-18 Polling or focus refresh observes external ticket changes without silently losing unfinished form edits; observed baseline defects are recorded separately. — Refresh defect is fixed. Actual periodic polling and visibility refresh preserve focused drafts; concurrent same-field edits return 409 on commit. All 42 repeated Chromium cases passed.
- [x] task-19 Tests start and stop their servers, clean up temporary stores, and run through a documented just recipe. — Added locked Playwright workspace, just browser-setup/browser-test, temporary binary/store fixtures and teardown, and docs/browser-testing.md. Repeated tests completed without retained servers or stores.
- [x] task-20 The baseline suite passes against the unconverted frontend and its scope is documented. — Full 14-case suite passed three times, 42/42 with no skips. docs/browser-baseline-passed.md supersedes the previous blocked result; just check passes.

## Summary

Baseline completed after fixing the separate inspector refresh defect. The expanded 14-case Chromium suite passes three consecutive runs, 42/42, with no skipped or expected-failure tests. just check also passes. docs/browser-baseline-passed.md supersedes the earlier blocked result while preserving the historical report. The frontend is still vanilla; dependent TypeScript/Vite work remains draft.
