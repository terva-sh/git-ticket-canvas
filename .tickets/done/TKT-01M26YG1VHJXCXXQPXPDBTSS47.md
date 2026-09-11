---
schema: 3
id: TKT-01M26YG1VHJXCXXQPXPDBTSS47
title: Add visual checks for dense canvas scenes
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - idea
  - ui
  - canvas
  - readability
assignees: []
milestone: null
parent: TKT-01M26YEEBGPYAFDNF6TTM2JVD7
origin: null
dependencies:
  - TKT-01M26YFRD2YJS7116WT5ACZYGW
  - TKT-01M27GQJPMBKCGRD9T0ES3WV7C
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-11T00:39:48Z
updated_at: 2026-09-11T16:52:26Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Use the deterministic 30-ticket capture as the first visual regression suite for canvas density and relationship rendering. Combine screenshot comparison with structural assertions so a useful failure explains whether cards, edges, the inspector, or the toolbar changed.

Cover the current full-card scene with Relationships set to All, including the dense right-side relationship cluster shown in the reference. The suite should provide evidence for the existing relationship-clutter and compact-card ideas without coupling those future implementations to one brittle pixel image. When those child tickets change rendering intentionally, require an explicit baseline update with a reason.

## Acceptance criteria

- [x] The suite loads the 30-ticket fixture and asserts the expected card count, board, relationship mode, and inspector state before comparing visuals.
- [x] Failures distinguish structural changes such as missing cards or edges from screenshot differences, and retain reviewable diff output.
- [x] The baseline covers the dense right-side relationship cluster and the full card metadata presentation shown in the reference scene.
- [x] Baseline updates require an explicit command or review step and record why the visual change is intentional.
- [x] The suite is usable as the regression gate for the relationship-clutter and compact-card child tickets.

## Implementation plan

Written after reading `playwright.config.ts`, `tests/browser/fixtures.ts`, `tests/browser/global-setup.ts`, the justfile, and `.forgejo/workflows/ci.yml`.

The constraint that shapes this. CI runs `just parity-check`, which ends in `just browser-test-embedded`, inside `golang:1.25-alpine` with distro Chromium and `font-noto`. A developer machine runs Playwright's pinned Chromium with different fonts. Playwright's per-platform snapshot suffix is `-linux` in both, so one committed pixel baseline cannot serve both and the two would fight over one filename.

The user's ruling: structural assertions run everywhere including CI, the pixel comparison is opt-in locally behind a flag, and `docs/artifacts/.../canvas-baseline.png` stays the reviewed image. CI never fails over font rendering. A container-generated CI baseline is therefore not needed, though containers are available here if that changes.

1. Extract the scene into `tests/browser/canvas-scene.mjs`, beside the fixture helper: the viewport, board, relationship mode, selected ticket and expected counts; `stubBuildIdentity(page)` with the version and board `storePath` routes; `assertStableChrome(page)`; and the goto, select, wait and click sequence. `scripts/capture-canvas-baseline.mjs` becomes a caller rather than the owner, so the artifact and the suite cannot drift into describing different scenes.

2. Add a `dense` fixture to `tests/browser/fixtures.ts` that unpacks the archive through `unpackCanvasFixture` and starts a server against it, reusing the existing `start` and `stop`. The `app` fixture keeps building its store from `init-store`, and Playwright only runs the fixture a spec asks for.

3. Write `tests/browser/canvas-density.spec.ts`. Structural assertions run first and carry their own messages: board `default`, relationship mode `All`, 30 cards with non-zero boxes, 41 rendered relationships, the inspector open on the selected ticket, the dense right-side cluster present as a counted property rather than a picture, and one card's metadata rows present. A missing card then fails as a missing card, not as a pixel diff.

4. The pixel comparison runs last, in its own test, skipped unless the flag is set. `toHaveScreenshot` with `animations: 'disabled'` and `caret: 'hide'`, matching the capture, and Playwright keeps the actual, expected and diff images for review.

5. Criterion 4 needs more than a command, because `--update-snapshots` on its own records nothing. Add a small registry file listing each committed visual baseline with its sha256 and the reason it changed, and a `tests/tooling` test that fails when a baseline's bytes do not match its registry entry. Updating an image then forces writing down why, or the tooling gate fails.

6. Document the suite, the flag, the update command and the registry, and cross-link `docs/canvas-baseline.md` so the artifact and the gate explain their relationship.

## Notes

**agent:terva/mieli** at 2026-09-11T14:29:58Z

draft to ready: The user asked me to pick this up, which is the promotion. Both dependencies are done.

**agent:terva/mieli** at 2026-09-11T16:52:22Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-19 The suite loads the 30-ticket fixture and asserts the expected card count, board, relationship mode, and inspector state before comparing visuals. — tests/browser/canvas-density.spec.ts loads the 30-ticket fixture through the new dense fixture and asserts board `default`, relationship mode `all`, 30 rendered cards, 30 tickets served, the inspector open on `Prepare the first live event and future themes`, and the stubbed toolbar, all before any pixel comparison. loadScene also throws by name for any card with no measured bounds. Passing under just browser-test-embedded.
- [x] task-20 Failures distinguish structural changes such as missing cards or edges from screenshot differences, and retain reviewable diff output. — Structural assertions run before any pixel comparison and each carries its own message, so a missing card fails as "rendered cards" and a dropped edge as "rendered relationships" rather than as a picture. The visual test repeats the card-count assertion before the screenshot for the same reason. Exercised the failure path with a throwaway spec that dimmed one card: Playwright kept canvas-baseline-expected.png, canvas-baseline-actual.png, canvas-baseline-diff.png, error-context.md and trace.zip u…
- [x] task-21 The baseline covers the dense right-side relationship cluster and the full card metadata presentation shown in the reference scene. — The dense right-side cluster is asserted as counts rather than as a picture: 7 cards past the horizontal midpoint and 16 of the 41 relationships landing on one of them. Full card presentation is asserted as the ordered metadata rows on the selected card (card-title, card-state, card-priority prio-normal, card-alerts, card-labels, card-progress, card-head, card-id, card-type, card-placement). Edge counts are checked twice over, against the recorded numbers and against the store: 30 dependency edg…
- [x] task-22 Baseline updates require an explicit command or review step and record why the visual change is intentional. — Two mechanisms, both enforced. The capture now writes pngSha256 into canvas-baseline.json, and baseline-history.json records every baseline with a ticket, a date and a reason of at least 80 characters. tests/tooling/canvas-baseline.test.mjs checks that the image matches the newest history entry and that the metadata describes the committed bytes. Proved it fires: truncating the PNG, which is what a --update-snapshots rewrite looks like to the checks, failed both tests with the message naming the…
- [x] task-23 The suite is usable as the regression gate for the relationship-clutter and compact-card child tickets. — Both child tickets already depend on this one, and the constants they will move are named in docs: TKT-01M26Y32BZ moves rightHalf.edgesTouching, TKT-01M26Y3D0B moves cardMetadataRows, both in tests/browser/canvas-scene.mjs. Added the `just canvas-visual` recipe, and docs/canvas-baseline.md gained "The visual suite" and "Changing the baseline on purpose". The scene lives in one module that the capture script and the spec share, so the reviewed artifact and the gate cannot describe different pictu…

## Summary

`tests/browser/canvas-density.spec.ts` is the regression gate for the dense scene, split into a structural test that runs everywhere and a pixel test that is opt-in and local.

The structural test asserts the board, the relationship mode, 30 cards with measured bounds, 41 relationships, the inspector open on the reference ticket, the stubbed toolbar, the right-side cluster as counts, and the metadata rows a full card presents. Each assertion carries its own message, so a dropped edge fails as `rendered relationships` and not as a picture. Edge counts are checked twice, against the recorded numbers and against the store, so 30 dependency edges are the 30 dependency links in the fixture and 11 parent edges are the 11 tickets with a parent. A fixture swap that changes what the scene means fails too.

`just canvas-visual` runs the pixel comparison. It skips otherwise, because CI renders with Alpine Chromium and `font-noto` while a developer machine uses Playwright's pinned Chromium, and Playwright's suffix is `-linux` for both, so one image cannot serve both and a CI pixel gate would fail over fonts.

There is one baseline image. `snapshotPathTemplate` resolves the snapshot to the reviewed artifact, after measuring that Playwright's own snapshot was byte-identical to it, so a second copy would have been duplication free to drift. On a mismatch Playwright keeps expected, actual and diff images plus a trace, which was verified by dimming one card in a throwaway spec.

Baseline updates are enforced rather than requested. The capture writes `pngSha256` into the metadata, `baseline-history.json` records every baseline with a ticket, a date and a reason, and `tests/tooling/canvas-baseline.test.mjs` checks the image against both. `--update-snapshots` cannot update the metadata, so the shortcut fails with a message naming the capture command. Verified by truncating the image.

The scene itself moved into `tests/browser/canvas-scene.mjs`, shared by the capture script and the spec, so the artifact and the gate cannot describe different pictures. The capture is byte-identical after that refactor. A `dense` fixture in `tests/browser/fixtures.ts` serves the archive per run.

Full suite 60 passed and 6 skipped, `just tooling-test` 75, `just check` clean. Filed TKT-01M28P46VC9KFHTWB1V9NZ8317 for the `"$@"` recipe quirk found on the way.
