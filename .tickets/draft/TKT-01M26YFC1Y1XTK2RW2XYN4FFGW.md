---
schema: 3
id: TKT-01M26YFC1Y1XTK2RW2XYN4FFGW
title: Extract the canvas fixture unpacking into a shared test helper
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - idea
  - ui
  - canvas
assignees: []
milestone: null
parent: TKT-01M26YEEBGPYAFDNF6TTM2JVD7
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-11T00:39:26Z
updated_at: 2026-09-11T06:09:52Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

`scripts/capture-canvas-baseline.mjs` already unpacks the committed AHPSH archive, starts the app against it, and cleans up. It does that inline, for itself, and no test can call it. `tests/browser/fixtures.ts` still builds every store from `init-store` and `mkdtemp`, and nothing under `tests/` references `ahpsh-tickets.tgz`.

Lift that unpacking into a helper the tests can use, and make the capture script its first caller. This replaces the original scope, which was to write the unpacking from scratch. That work landed inside the capture script, so the remaining job is extraction, not authorship.

One property has to change on the way out. The script stores the unpacked fixture at a fixed path in `tmpdir` (`capture-canvas-baseline.mjs:28`) and deletes that path at the start and end of every run (lines 148 and 202). That is safe for one serial CLI invocation and unsafe the moment a second caller exists: `playwright.config` sets `fullyParallel: true` with `workers: 2`, so two workers would delete each other's store mid-run. The helper needs a per-run directory, as `tests/browser/fixtures.ts` already does for ordinary stores.

Settle the schema adaptation while the code is open. Line 51 rewrites `schema: 3` to `schema: 2` in the fixture's `default.yml`, so the committed fixture is authored one schema ahead of what the script feeds the app. Either the fixture is stale and should be recaptured at the schema the app reads, or the adaptation is deliberate and belongs in the helper with a recorded reason. It should not survive as an unexplained line in a capture script.

## Acceptance criteria

- [ ] A helper unpacks the committed archive into a per-run directory and verifies that the default board contains all 30 fixture tickets before a caller uses it.
- [ ] Two callers running at once never share or delete each other's store, under the two workers `playwright.config` already sets.
- [ ] `scripts/capture-canvas-baseline.mjs` uses the helper instead of its own `tar` call and fixed store path, and two captures from one checkout still agree.
- [ ] A fixture run never mutates the committed archive, and cleanup removes each temporary store.
- [ ] The `schema: 3` to `schema: 2` rewrite is either recorded in the helper with its reason or removed as unnecessary.
- [ ] The helper and its local invocation are documented for browser and integration test authors.

## Implementation plan

1. Add the helper beside `tests/browser/fixtures.ts`, taking the archive path and returning an unpacked store on a fresh `mkdtemp` directory, with a cleanup handle. Verify the 30 tickets and the `default` board before handing it back, so a caller fails on a broken fixture rather than on a confusing assertion later.
2. Decide the schema question and record the answer where the helper does the work.
3. Point `scripts/capture-canvas-baseline.mjs` at the helper, removing its own `tar` call and its fixed store path. Confirm two captures still agree with each other.
4. Document the helper for browser and integration test authors.

## Notes

**agent:terva/mieli** at 2026-09-11T06:09:52Z

Rescoped rather than closed, after checking whether the capture work had made this redundant.

I raised the possibility that TKT-01M26YFRD2YJS7116WT5ACZYGW (Capture a deterministic screenshot of the canvas fixture) had absorbed this ticket, and was asked to close it on that basis. The evidence says otherwise, so here is what I found before changing the scope.

Nothing under `tests/` mentions `ahpsh-tickets.tgz` or the baseline directory. `tests/browser/fixtures.ts` still builds every store from `init-store` plus `mkdtemp`. The capture script unpacks the archive at `capture-canvas-baseline.mjs:153` for its own run, and it is the only consumer. So the unpacking exists, and the reusable helper this ticket asks for does not.

The stored fixture path is a fixed constant in `tmpdir` (line 28), removed at lines 148 and 202 on every run. That is correct for one serial CLI invocation. It is wrong for a test helper, because `playwright.config` sets `fullyParallel: true` with `workers: 2`, and two workers would delete each other's store mid-run. That is precisely the property the old first and third criteria asked for, and it is the one the existing code does not have.

So the work is extraction rather than authorship, and the criteria now say so. The old ones described writing the unpacking from scratch, which would have duplicated what landed.

One thing I noticed and did not chase: line 51 rewrites `schema: 3` to `schema: 2` in the fixture's `default.yml`. The committed fixture is authored a schema ahead of what the script feeds the app. I do not know which side is stale. It is now a criterion because an unexplained schema downgrade inside a capture script is the kind of line that becomes load-bearing by accident.

Still a draft. TKT-01M26YG1VHJXCXXQPXPDBTSS47 (Add visual checks for dense canvas scenes) is the ticket that needs this helper, since a suite of visual checks is more than one serial capture.
