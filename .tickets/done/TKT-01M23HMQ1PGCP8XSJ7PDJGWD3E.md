---
schema: 3
id: TKT-01M23HMQ1PGCP8XSJ7PDJGWD3E
title: Convert ticket forms and toolbar to Preact components
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
  - TKT-01M23HME7E2RC19BXEHD65TP1R
blocks_on: none
references:
  - ref: code:preact-forms
    path: web/src/ui/mount.tsx
  - ref: code:inspector
    path: web/src/ui/Inspector.tsx
  - ref: code:canvas-adapter
    path: web/app.js
  - ref: test:forms-components
    path: web/src/ui/forms.test.tsx
  - ref: test:forms-browser
    path: tests/browser/forms.spec.ts
  - ref: doc:preact-forms
    path: docs/preact-forms.md
claim: null
archive: null
created_at: 2026-09-09T16:57:26Z
updated_at: 2026-09-09T18:17:20Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Move the toolbar, ticket inspector, composer, and feedback messages into Preact components backed by the extracted modules. Preserve current appearance and supported operations. During the transition, give each DOM subtree exactly one owner so legacy canvas rendering and Preact do not modify the same nodes.

## Acceptance criteria

- [x] Preact owns the toolbar, inspector, composer, and feedback UI; component boundaries are explicit.
- [x] All current inspector fields, checklists, notes/comments, claims, transitions, and archive/delete actions remain available with server-enforced rules.
- [x] Component tests cover form drafts during refresh, submission success and failure, stale revisions, read-only controls, and partial-success feedback.
- [x] Keyboard focus and shortcuts do not interfere with text editing or move focus unexpectedly on refresh.
- [x] Browser baseline tests pass with the legacy canvas and Preact forms sharing no DOM ownership.

## Implementation plan

Mount Preact into dedicated toolbar and stage-overlay roots. Keep legacy code responsible only for canvas cards, edges, grid and gestures; replace form/toolbar DOM mutations with a typed UI model and callbacks. Delegate the inspector component alone with a fixed props contract, while implementing toolbar/composer/feedback and integration locally. Preserve field drafts and captured revisions across refresh, disable write controls in read-only mode and surface authoritative write/partial-success results. Add DOM component tests for drafts, focus, refusals and feedback plus browser ownership and parity coverage. Rebuild embedded assets, run strict types, unit tests, Go checks and repeated browser baseline before closing.

## Notes

**agent:terva/mieli** at 2026-09-09T18:17:11Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-35 Preact owns the toolbar, inspector, composer, and feedback UI; component boundaries are explicit. — Dedicated toolbarRoot and formsRoot mount Toolbar, Inspector, Composer and FeedbackMessage. Legacy form builders/wiring removed. DOM ownership tests and browser root checks pass.
- [x] task-36 All current inspector fields, checklists, notes/comments, claims, transitions, and archive/delete actions remain available with server-enforced rules. — Inspector conversion retains all legacy controls and typed operations. Repeated browser tests passed metadata/status edits, labels, assignees, checklist updates, notes/comments, claim/release, archive/unarchive and deletion.
- [x] task-37 Component tests cover form drafts during refresh, submission success and failure, stale revisions, read-only controls, and partial-success feedback. — 10 jsdom component tests pass for retained draft revisions, stale reset without retry, failure preservation, note/composer success, read-only controls, toolbar refresh and timed partial-success feedback. Full unit suite passes 70 tests.
- [x] task-38 Keyboard focus and shortcuts do not interfere with text editing or move focus unexpectedly on refresh. — Focused refresh/draft component tests and all polling/visibility browser regressions passed. Browser text-shortcut test verifies n, f and / stay in the textarea; baseline verifies search, composer and Escape behavior.
- [x] task-39 Browser baseline tests pass with the legacy canvas and Preact forms sharing no DOM ownership. — just check passes with 70 tests and all Go/static checks. Full 18-case browser suite passed 54/54 repeated runs. Dedicated root/source ownership checks pass; docs/preact-forms.md records the boundary and behavior.

## Summary

Converted toolbar, inspector, composer and feedback to typed Preact components under explicit toolbarRoot/formsRoot ownership. Removed legacy form DOM builders and wiring while retaining canvas rendering and platform modules. Stable editors keep draft revisions through refresh, retain ordinary failed submissions and reload stale replacements without retry. Read-only controls cover every form write. Added 10 jsdom component tests, source ownership checks and browser lifecycle/delete/ownership cases. just check passes with 70 tests; 18 browser cases passed three repeats, 54 runs; npm audit reports zero vulnerabilities. Embedded assets regenerated and docs/preact-forms.md documents the transition.
