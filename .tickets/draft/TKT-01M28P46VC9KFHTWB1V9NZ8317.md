---
schema: 3
id: TKT-01M28P46VC9KFHTWB1V9NZ8317
title: just recipes taking *args run everything when given none
type: bug
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - quality-of-life
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-11T16:52:01Z
updated_at: 2026-09-11T16:52:01Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

The variadic test recipes forward their arguments as `"$@"`. With no arguments that expands to one empty string rather than to nothing, and a test runner reads an empty filter as matching every file.

Found while adding `just canvas-visual` in TKT-01M26YG1VHJXCXXQPXPDBTSS47 (Add visual checks for dense canvas scenes). The first version of that recipe named one spec file and still ran all 66 tests, because the empty filter ORs with the file path. The fix there was `{{args}}`, which expands to nothing when empty.

The same shape appears in `browser-test`, `browser-test-embedded`, and `web-test`. It is easy to miss, because the recipe does more work rather than less, and the run passes. Concretely, `just browser-test -- canvas-density` runs the whole browser suite for about 70 seconds instead of one spec for 3.

Worth confirming per recipe before changing them. `npm run test:browser -- "$@"` passes through npm, so the empty argument may be swallowed at a different point than it is for `npm exec -- playwright test`. Check each one by running it with no arguments and with one filter, and compare the test counts rather than the exit status.

`tests/tooling/parity-recipe.test.mjs` already guards recipe wiring, so a check that a filtered invocation runs fewer tests than an unfiltered one belongs beside it.

## Acceptance criteria

- [ ] Each variadic test recipe runs only the named spec when given a filter, and the full suite when given none, confirmed by test counts rather than exit status.
- [ ] A tooling test fails if a recipe's argument forwarding regresses to matching every file.
- [ ] The `"$@"` and `{{args}}` choice is recorded where the next person writing a recipe will read it.
