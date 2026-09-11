---
schema: 3
id: TKT-01M26YFRD2YJS7116WT5ACZYGW
title: Capture a deterministic screenshot of the canvas fixture
type: task
status: in-progress
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
  - TKT-01M26YFC1Y1XTK2RW2XYN4FFGW
blocks_on: none
references:
  - ref: script:canvas-baseline-capture
    path: scripts/capture-canvas-baseline.mjs
  - ref: docs:canvas-baseline
    path: docs/canvas-baseline.md
  - ref: artifact:canvas-baseline-image
    path: docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/canvas-baseline.png
  - ref: artifact:canvas-baseline-metadata
    path: docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/canvas-baseline.json
claim:
  actor: agent:terva/mieli
  branch: scratch/new-tickets
  worktree: null
  commit: null
  session: 9319f1c7-bff4-44d2-9639-055f1fb8b6ff
  claimed_at: 2026-09-11T05:16:38Z
  expires_at: null
archive: null
created_at: 2026-09-11T00:39:39Z
updated_at: 2026-09-11T05:32:57Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Capture the reproducible canvas scene under fixed conditions so later UI changes can be reviewed against the same board. Start from the isolated 30-ticket fixture, use the `default` board and the saved canvas layout, set Relationships to `All`, and use the 2048x1152 reference viewport shown in the supplied screenshot unless the browser harness documents a different viewport definition.

Wait for all 30 cards, measured card heights, relationship paths, and the selected inspector state before capture. Save the screenshot beside the fixture with metadata for viewport, board, relationship mode, app build, and fixture archive checksum. The current conversation image is the visual reference, but it still needs a workspace-visible file or a new capture before it can serve as a committed baseline.

## Acceptance criteria

- [ ] A documented browser command opens the isolated fixture at the default board with all 30 cards and Relationships set to All.
- [ ] The capture waits for card measurement and relationship rendering instead of relying on a fixed sleep.
- [ ] The screenshot is stored at a stable artifact path with viewport, board, relationship mode, app build, and fixture checksum metadata.
- [ ] Two captures from the same checkout produce equivalent scene geometry and do not modify the fixture source.
- [ ] The capture procedure identifies how the supplied reference image maps to the generated baseline.

## Implementation plan

Add a maintained Node/Playwright capture command that unpacks the committed AHPSH archive into a temporary store, starts git-ticket-canvas on an ephemeral loopback port, sets the 2048x1152 viewport and Relationships=All, selects the reference epic, waits for all 30 cards and measured geometry, and writes a PNG plus capture metadata beside the immutable fixture. Run two captures and compare their geometry and fixture checksum before recording the ticket evidence.

## Notes

**agent:terva/mieli** at 2026-09-11T05:32:57Z

Implemented and ran the maintained capture path. `npm run capture:canvas-baseline` builds a temporary binary, unpacks the AHPSH archive into an isolated stable-path store, adapts layout schema 3 to the current schema 2 reader, creates temporary reference targets, sets a dark 2048x1152 viewport with Relationships=All, selects the reference epic, waits for 30 measured cards and relationship paths, and writes the PNG plus JSON metadata. Two captures were byte-identical at SHA-256 `75fd5785ba7cafc07acd3acff6ca6f3d1cc7a49c4d70e55f156dfb27339e85cc`; the source archive stayed at `a6162422b117d113e77b17323fbb7d736df19ae68016051e62605a2c6dd240ab`. Documentation is in `docs/canvas-baseline.md`.
