---
schema: 3
id: TKT-01M27GQJPMBKCGRD9T0ES3WV7C
title: Mask build-varying text before comparing canvas baselines
type: bug
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
parent: null
origin: null
dependencies: []
blocks_on: none
references:
  - ref: artifact:canvas-baseline-image
    path: docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/canvas-baseline.png
  - ref: script:canvas-baseline-capture
    path: scripts/capture-canvas-baseline.mjs
  - ref: code:version-label
    path: web/src/ui/Toolbar.tsx
claim: null
archive: null
created_at: 2026-09-11T05:58:29Z
updated_at: 2026-09-11T06:26:00Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

The canvas baseline image cannot be compared byte for byte across builds, because the toolbar renders the build version and the version label varies with the build.

`Toolbar.tsx` renders `#version` beside the brand, showing `versionLabel(version)`. The committed baseline at `docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/canvas-baseline.png` shows `devel` there. A capture from a git-described build shows `v0.1.1-0.20260911055630-b6342ddfd54b+dirty`, which carries the commit SHA, so every commit repaints those pixels.

Measured, not assumed. The committed PNG is SHA-256 `75fd5785ba7cafc07acd3acff6ca6f3d1cc7a49c4d70e55f156dfb27339e85cc`. A capture at commit b6342dd through `npm run capture:canvas-baseline --output <scratch>` produced `6a7969079ef3df938d52d7aa5f2f26b923f32f8a6d494aa6edc6dca6201df5e9`. Two differences are visible between the images: the version label, and the new `Labels` filter button from TKT-01M26SB17, which also pushed the card count and the relationship control onto the second toolbar row.

Nothing asserts against the baseline yet, so no check is failing today. This matters for TKT-01M26YG1VHJXCXXQPXPDBTSS47 (Add visual checks for dense canvas scenes), which turns this image into a gate. Built as it stands, that gate would fail on the next commit and blame whatever change happened to be in it.

Decide how to make the scene build-independent. Masking or stubbing the version element before capture keeps the toolbar in frame while removing the varying text. Clipping the screenshot to the canvas drops the toolbar from the baseline, which also drops the thing several canvas ideas want to review. Either way, the baseline that TKT-01M26YFRD2YJS7116WT5ACZYGW committed no longer reproduces at HEAD and needs a recapture once the masking is settled.

## Acceptance criteria

- [x] Two captures from different commits, with no rendering change between them, produce identical baseline bytes.
- [x] The masking or clipping choice is documented beside the fixture, with the reason it was chosen.
- [x] A capture at HEAD reproduces the committed baseline, or the committed baseline is replaced in the same change.
- [x] The approach still covers whatever toolbar state the readability tickets need to review.

## Implementation plan

Mask rather than clip. Clipping to the canvas would drop the toolbar, and the toolbar is what the density and relationship-clutter tickets want to review, so the fourth criterion rules it out.

Two elements carry build or environment identity into the pixels.

`#version > summary` is the measured one. It renders `versionLabel(version)`, which carries the commit SHA on a git-described build.

`#storePath` in the brand is the one that has not bitten yet. It renders the store path, which is a fixed `tmpdir` constant today, so it is stable by accident. TKT-01M26YFC1Y1XTK2RW2XYN4FFGW moves that store to a per-run directory, and on that day the baseline starts varying again. Mask it now, in the same change, rather than rediscovering this.

Normalize the text rather than hiding the elements. Both sit in a flex toolbar, so their width follows their content; `visibility: hidden` would leave a box whose width still varies with the string it no longer shows.

Fail loudly when a selector matches nothing. A mask that silently stops applying returns the baseline to varying by build, which is the bug being fixed, so a missing selector has to stop the capture rather than produce a quietly poisoned image.

Steps:
1. Add the mask to `scripts/capture-canvas-baseline.mjs`, applied after `pageReady` and before the screenshot, and record the masked selectors and their replacement text in the metadata JSON.
2. Document the choice in `docs/canvas-baseline.md`: what is masked, why masking beat clipping, and that the PNG is the byte-comparison target while the JSON's `appVersion` is provenance that varies by build on purpose.
3. Capture to a scratch path from this working tree, commit the script and documentation, then capture the committed baseline from the new commit. The two captures come from different builds with different version strings, so identical PNG bytes are the evidence for the first criterion, and the recapture satisfies the third.

Checked and deliberately not masked: every one of the 30 fixture tickets has `due_on: null`, so the wall-clock comparison at `CardView.tsx:33` and `Inspector.tsx:191` never fires. A fixture that later carries a due date would make the image change on a date with no commit behind it. Recorded in the documentation as a constraint on future fixtures rather than masked today.

## Notes

**agent:terva/mieli** at 2026-09-11T06:19:01Z

draft to ready: The user asked me to pick this up, which is the promotion.

**agent:terva/mieli** at 2026-09-11T06:25:42Z

The plan above is wrong in its central choice, and the record should say so rather than read as if stubbing was the idea all along.

The plan was to rewrite `textContent` on `#version > summary` and `#storePath` before the screenshot. That does not hold. The toolbar re-renders on selection, on live updates, and on every store publication, and each of those puts the fetched value back. Measured: with the DOM rewrite in place, a VCS-stamped build captured `dd482d9a` and a `-buildvcs=false` build captured `68685d99`, while the same build twice agreed at `68685d99`. Same-build repeatability held, so the residue was build-dependent and the rewrite was being undone before the screenshot.

What shipped instead stubs `GET /api/version` with a constant payload, so the toolbar renders `baseline` on any build. A stub sits upstream of every re-render, which is what the DOM rewrite could not do. Same two builds after the change: `ad4291f6` from both, and the committed baseline is a third capture matching them.

The store path is asserted rather than rewritten, which is also a change from the plan. It is deterministic by construction, because the capture chooses where it unpacks the fixture, so there is nothing to normalize. The assertion is the tripwire for TKT-01M26YFC1Y1XTK2RW2XYN4FFGW: giving the capture a per-run directory now fails loudly instead of quietly making every later baseline unreproducible.

Two limits found while verifying, both recorded in `docs/canvas-baseline.md` rather than fixed here.

The store path is visible in the brand, so the baseline is machine-dependent. `tmpdir()` is `/tmp` on Linux and `/var/folders/...` on macOS, and a capture on another platform differs for a reason unrelated to the canvas. The documentation names `--store` and `CANVAS_CAPTURE_STORE` as the pin, and says a multi-platform gate should use them.

`CardView.tsx:33` and `Inspector.tsx:191` compute the late state from `new Date()`. All 30 fixture tickets have `due_on: null`, so it never fires here. A future fixture carrying due dates would repaint the image on a calendar day with no commit behind it.

The old baseline `75fd5785` is superseded, not reproducible: it predates both the stub and the `Labels` button from TKT-01M26SB170M9TGNXHK8W7W5YSM.

**agent:terva/mieli** at 2026-09-11T06:25:56Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-9 Two captures from different commits, with no rendering change between them, produce identical baseline bytes. — A VCS-stamped build (reports v0.1.1-0.20260911061135-104c3c1ad552) and a -buildvcs=false build (reports devel) both captured ad4291f6651cf8211107002b25520b19b238581b7c3caf79e92d75df8161dd9a. The first attempt, rewriting textContent, failed this check at dd482d9a vs 68685d99 while the same build twice agreed at 68685d99, which is how the re-render was found.</evidence> <parameter name="activate_next">task-10
- [x] task-10 The masking or clipping choice is documented beside the fixture, with the reason it was chosen. — docs/canvas-baseline.md gained "How the capture stays build-independent": what is held constant, why stubbing the version response beat rewriting the DOM (with the measured failure), why it beat clipping the toolbar out, and why the store path is asserted rather than rewritten. The Verification section carries the cross-build hashes and the commands to reproduce them.</evidence> </invoke>
- [x] task-11 A capture at HEAD reproduces the committed baseline, or the committed baseline is replaced in the same change. — The committed baseline is replaced in this change: canvas-baseline.png and canvas-baseline.json are recaptured. The new PNG is ad4291f6651cf8211107002b25520b19b238581b7c3caf79e92d75df8161dd9a, which a capture at HEAD reproduces and which both cross-build captures matched. The superseded 75fd5785 is recorded in docs/canvas-baseline.md with the reason it cannot be reproduced.</evidence> </invoke>
- [x] task-12 The approach still covers whatever toolbar state the readability tickets need to review. — Stubbing keeps the toolbar in frame, unlike clipping. I read the committed canvas-baseline.png: both toolbar rows are present with the brand, the version badge reading "baseline", the board selector, the search box, every status chip, the Labels filter button, the 30 of 30 count, the Relationships selector, and the frame and view controls, alongside all 30 cards, the edges and the open inspector. Only the version string is held constant; nothing else is hidden or cropped.

## Summary

The capture now stubs `GET /api/version` with a constant payload, so the toolbar renders `baseline` on any build and the image no longer carries the commit SHA. It asserts the rendered version label and the store path instead of rewriting them, so a toolbar change or a per-run store directory fails the capture rather than producing a quietly unreproducible baseline.

The plan's approach, rewriting `textContent` before the screenshot, was tried first and does not work. The toolbar re-renders on selection, live updates, and store publications, and each one restores the fetched value. It failed at `dd482d9a` against `68685d99` across two builds while the same build twice agreed, which is how the re-render was found.

Evidence for the fix: a VCS-stamped build and a `-buildvcs=false` build, reporting different versions, both captured `ad4291f6651cf8211107002b25520b19b238581b7c3caf79e92d75df8161dd9a`. The committed baseline is a third capture matching both, replacing the superseded `75fd5785`. `just check` passes and `git diff --check` is clean.

`docs/canvas-baseline.md` records the choice, why stubbing beat both the DOM rewrite and clipping the toolbar away, and two limits found while verifying: the visible store path makes the baseline machine-dependent unless `--store` is pinned, and the late-state comparison against `new Date()` would vary a future fixture that carries due dates.

TKT-01M26YG1VHJXCXXQPXPDBTSS47 can now build its gate on an image that only changes when the canvas does.
