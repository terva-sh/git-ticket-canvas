---
schema: 3
id: TKT-01M26YFC1Y1XTK2RW2XYN4FFGW
title: Extract the canvas fixture unpacking into a shared test helper
type: task
status: done
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
updated_at: 2026-09-11T14:51:56Z
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

- [x] A helper unpacks the committed archive into a per-run directory and verifies that the default board contains all 30 fixture tickets before a caller uses it.
- [x] Two callers running at once never share or delete each other's store, under the two workers `playwright.config` already sets.
- [x] `scripts/capture-canvas-baseline.mjs` uses the helper instead of its own `tar` call and fixed store path, and two captures from one checkout still agree.
- [x] A fixture run never mutates the committed archive, and cleanup removes each temporary store.
- [x] The `schema: 3` to `schema: 2` rewrite is either recorded in the helper with its reason or removed as unnecessary.
- [x] The helper and its local invocation are documented for browser and integration test authors.

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

**agent:terva/mieli** at 2026-09-11T14:32:31Z

draft to ready: The user sequenced this before TKT-01M26YG1, which is the promotion.

**agent:terva/mieli** at 2026-09-11T14:37:45Z

Paused mid-ticket at the context limit, with a determinism regression open. Work is uncommitted in the working tree.

Done and verified. `tests/browser/canvas-fixture.mjs` exports `unpackCanvasFixture({ archive, store })`: `mkdtemp` per call, or a pinned directory when `store` is given, which a capture needs. It creates the reference targets, verifies 30 tickets and `default.yml` before returning, and hands back `{ store, tickets, cleanup }`. Six tests in `tests/tooling/canvas-fixture.test.mjs` cover concurrent callers getting separate stores, cleanup, double cleanup, the pinned path, a pinned path replacing stale content, and a bad archive leaving nothing behind. `just tooling-test` passes 71.

The schema question is answered by removal. `internal/layout.Schema` is 3, and the fixture loads natively: the capture reports 30 tickets and 30 rendered cards with no downgrade. The `schema: 3` to `schema: 2` rewrite and the `pens`/`ruleOrder`/`inbox` stripping are gone.

Open regression. Two captures no longer agree across builds. The script's own `go build` produced `c84dc998`, a `-buildvcs=false` build produced `ae957bc8`. Three runs of the second build all produced `ae957bc8`, so within a build it is exact. Before this work, the same comparison agreed at `ad4291f6`, so this is mine. `renderedChrome` in the metadata reads version `baseline` and storePath `/canvas-fixture/.tickets`, so both stubs applied and neither is the leak.

Read the confound before trusting the label "build-dependent". The two runs differ in more than build identity: the default run compiles the binary into the store directory, the other points at a binary outside it. That asymmetry existed before this change and did not matter then, which argues against it, but it has not been controlled for. Build two differently-stamped binaries outside the store and compare those, rather than comparing build modes.

Next step is a pixel diff rather than more reasoning. I could not find the differing region by inspection and should not have kept guessing. Suspects, in the order I would test them: the new `**/api/board*` route that rewrites `storePath` and refills the body while keeping the original headers, which may change conditional-read behaviour; and routing fields now reaching the frontend store because the schema downgrade is gone.

`canvas-baseline.png` and `canvas-baseline.json` were deliberately restored to HEAD. The recaptured pair came from this unverified state, and committing a baseline that fails its own cross-build check would have been worse than leaving HEAD coherent with HEAD's script.

**agent:terva/mieli** at 2026-09-11T14:51:35Z

This supersedes the pause note above. Its diagnosis was wrong in both directions, and the corrections are worth more than the fix.

The capture was never build-dependent. Two binaries with different version stamps, both built outside the store, produced identical bytes. So did the default run that compiles the binary into the store. Every configuration I had accused agrees.

It was not my regression either. Eight runs of one configuration split three ways over the session, so the capture had been intermittently nondeterministic all along. The earlier `ad4291f6` agreement that I treated as the healthy baseline was two samples that happened to land the same way. A two-sample check cannot distinguish a stable capture from one that agrees most of the time, and I drew a regression from n=1 against n=1.

The cause is paint, not data. Selecting a card starts two CSS transitions, a `.16s` inspector slide and a `.12s` handle fade on the selected card. Waiting for `#inspector.open` to be visible does not wait for either, so the screenshot could land mid-transition.

What found it was a measurement, after the reasoning had failed twice. I added the position and size of every card to the metadata and ran six captures: three different images, identical geometry in all six. That ruled out layout, placement, the store contents, and both stubs in one step, and left only paint. The geometry dump stays in the metadata, because a baseline that drifts should say which cards moved.

The fix is `animations: 'disabled'` and `caret: 'hide'` on the screenshot. Verification: eight consecutive runs identical, plus the three build configurations identical, all at `1688493a9730949f88f777dceb874d551670b09571f527e91886a6ef4f42dc4c`, which is the recaptured committed baseline.

Neither suspect in the pause note was involved. The `**/api/board*` route and the removed schema downgrade are both fine.

**agent:terva/mieli** at 2026-09-11T14:51:47Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-13 A helper unpacks the committed archive into a per-run directory and verifies that the default board contains all 30 fixture tickets before a caller uses it. — tests/browser/canvas-fixture.mjs exports unpackCanvasFixture({archive, store}), which unpacks into a mkdtemp directory and verifies 30 tickets plus default.yml before returning { store, tickets, cleanup }. The capture reports 30 tickets and 30 rendered DOM cards through it.
- [x] task-14 Two callers running at once never share or delete each other's store, under the two workers `playwright.config` already sets. — tests/tooling/canvas-fixture.test.mjs covers two concurrent callers receiving separate stores and one cleanup leaving the other store intact. just tooling-test passes 71.
- [x] task-15 `scripts/capture-canvas-baseline.mjs` uses the helper instead of its own `tar` call and fixed store path, and two captures from one checkout still agree. — The capture uses the helper, and captures now agree. Eight identical runs all produced 1688493a, and the three build configurations that started this (binary built into the store, a vcs-stamped build, a -buildvcs=false build) all produced 1688493a too. The cause was not the build: six identical runs had produced three different PNGs while card geometry was byte-identical in all six, which located it in paint. Selecting a card starts a .16s inspector slide and a .12s handle fade, and waiting for…
- [x] task-16 A fixture run never mutates the committed archive, and cleanup removes each temporary store. — tests/tooling/canvas-fixture.test.mjs hashes the archive before and after a run and asserts it is unchanged, asserts cleanup removes the store, and asserts a second cleanup is a no-op. A failed unpack from a bad archive leaves nothing behind.
- [x] task-17 The `schema: 3` to `schema: 2` rewrite is either recorded in the helper with its reason or removed as unnecessary. — Removed as unnecessary. internal/layout.Schema is 3, so the fixture loads natively: the capture reports 30 tickets and 30 rendered DOM cards with no downgrade. The schema rewrite and the pens/ruleOrder/inbox stripping are gone from scripts/capture-canvas-baseline.mjs, and the helper never had them.
- [x] task-18 The helper and its local invocation are documented for browser and integration test authors. — docs/canvas-baseline.md gained a "The fixture helper" section with the import, the mkdtemp default, when to pass store or archive, what it verifies, why it is plain .mjs, and the just tooling-test coverage. Three stale sections were corrected: the schema 3 to schema 2 rewrite is gone, the --store pinning is no longer required to reproduce, and the store path is now stubbed rather than asserted-by-construction. Added a section on why the screenshot disables animations.

## Summary

`tests/browser/canvas-fixture.mjs` now owns unpacking the AHPSH archive. `unpackCanvasFixture()` takes a fresh `mkdtemp` directory per call, which is what `playwright.config` needs under two parallel workers, and takes a pinned path when a caller passes `store`, which is what the capture wants. It creates the reference targets, verifies 30 tickets and `default.yml` before returning, and hands back `{ store, tickets, cleanup }`. Six tests in `tests/tooling/canvas-fixture.test.mjs` cover concurrent callers, cleanup, a double cleanup, the pinned path, a pinned path replacing stale content, and a bad archive leaving nothing behind.

`scripts/capture-canvas-baseline.mjs` is the first caller, with its own `tar` call and fixed store path gone. The schema question resolved by removal: `internal/layout.Schema` is 3, so the fixture loads as recorded and the `schema: 3` to `schema: 2` rewrite is deleted rather than explained.

The capture also stopped being flaky, which was not in the original scope. It had been intermittently nondeterministic, and a screenshot could land during the `.16s` inspector slide or the `.12s` handle fade that selecting a card starts. It now passes `animations: 'disabled'` and `caret: 'hide'`. Eight consecutive runs and three different build configurations all produce `1688493a9730949f88f777dceb874d551670b09571f527e91886a6ef4f42dc4c`, the recaptured committed baseline. The metadata gained the position and size of every card, which is what located the bug and what will name the cards that moved next time.

`docs/canvas-baseline.md` documents the helper for test authors, and three stale sections are corrected. `just tooling-test` passes 71 and `just check` is clean.
