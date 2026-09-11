---
schema: 3
id: TKT-01M23J6D5NE0FE1Z1QAMXMMA5C
title: Prevent refresh from submitting unfinished inspector text
type: bug
status: done
status_reason: null
priority: high
due_on: null
labels: []
assignees: []
milestone: null
parent: TKT-01M23HK5J08WDF7Q2EA9SG6C9V
origin: null
dependencies: []
blocks_on: none
references:
  - ref: test:browser-baseline
    path: tests/browser/baseline.spec.ts
  - ref: validation:browser-passed
    path: docs/browser-baseline-passed.md
  - ref: git:42cc798:web/app.js
    path: null
claim: null
archive: null
created_at: 2026-09-09T17:07:06Z
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

The Chromium browser baseline reproduces an unsolicited write when a visibility refresh rebuilds the inspector while its description textarea is focused. The intended-behavior test fails in all three repeated runs against the unconverted frontend.

### Reproduction

Create a draft, open its inspector, fill Description without blurring it, and confirm the stored description is still empty. Change the ticket priority through an independent API request, then dispatch the visible-document visibilitychange event used by the application. The local text remains visible but GET /api/board now reports it as the saved description, despite no user submit or blur.

### Suspected mechanism

load replaces S.tickets and calls renderInspector. Clearing inspBody removes the focused textarea, which triggers its onblur handler and PATCH. patch obtains the refreshed revision from S.tickets rather than the revision against which the user began editing. This may also mask a concurrent prose edit; investigate that case during the fix.

### Scope

Fix draft preservation and unsolicited writes in the current vanilla frontend before migration. Keep the failing intended-behavior test active. Do not mark the defect as accepted parity or use expected-failure annotations to unblock conversion.

## Acceptance criteria

- [x] Polling and visible-document refresh retain unfinished inspector prose without sending a mutation or moving focus unexpectedly.
- [x] A concurrent edit to the same field is not silently overwritten with a refreshed revision when local work is later committed.
- [x] Explicit user commits still work, and stale-revision feedback remains accurate.
- [x] The unfinished-description regression and full browser baseline pass repeatedly against the unconverted frontend.

## Implementation plan

Defer rebuilding the same inspector while a text control is focused, suppress blur mutations during programmatic replacement, and bind inspector mutations to the rendered ticket revision instead of refreshed global state. Keep board refresh active. Test visibility and actual timer refresh, focus/draft preservation, explicit prose commits, and concurrent same-field edits for description and title. Run the entire Chromium baseline three times plus just check; record a successor validation note without rewriting historical reports.

## Summary

Fixed background refresh by retaining focused inspector controls and suppressing blur during programmatic replacement. Inspector mutations carry the displayed snapshot revision; concurrent description/title edits now refuse with 409 instead of silently overwriting. Added four browser cases and strengthened focus assertions. just browser-test --repeat-each=3 passed 42/42; just check passed. Evidence and limitations are in docs/browser-baseline-passed.md.
