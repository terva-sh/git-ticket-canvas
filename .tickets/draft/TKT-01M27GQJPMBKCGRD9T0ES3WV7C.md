---
schema: 3
id: TKT-01M27GQJPMBKCGRD9T0ES3WV7C
title: Mask build-varying text before comparing canvas baselines
type: bug
status: draft
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
updated_at: 2026-09-11T05:58:29Z
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

- [ ] Two captures from different commits, with no rendering change between them, produce identical baseline bytes.
- [ ] The masking or clipping choice is documented beside the fixture, with the reason it was chosen.
- [ ] A capture at HEAD reproduces the committed baseline, or the committed baseline is replaced in the same change.
- [ ] The approach still covers whatever toolbar state the readability tickets need to review.
