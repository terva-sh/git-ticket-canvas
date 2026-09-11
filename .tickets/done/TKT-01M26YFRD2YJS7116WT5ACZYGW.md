---
schema: 3
id: TKT-01M26YFRD2YJS7116WT5ACZYGW
title: Capture a deterministic screenshot of the canvas fixture
type: task
status: done
status_reason: Implemented the documented deterministic capture command, committed the PNG and metadata, and checked all five acceptance criteria.
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
claim: null
archive: null
created_at: 2026-09-11T00:39:39Z
updated_at: 2026-09-11T05:36:10Z
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

- [x] A documented browser command opens the isolated fixture at the default board with all 30 cards and Relationships set to All.
- [x] The capture waits for card measurement and relationship rendering instead of relying on a fixed sleep.
- [x] The screenshot is stored at a stable artifact path with viewport, board, relationship mode, app build, and fixture checksum metadata.
- [x] Two captures from the same checkout produce equivalent scene geometry and do not modify the fixture source.
- [x] The capture procedure identifies how the supplied reference image maps to the generated baseline.

## Implementation plan

Add a maintained Node/Playwright capture command that unpacks the committed AHPSH archive into a temporary store, starts git-ticket-canvas on an ephemeral loopback port, sets the 2048x1152 viewport and Relationships=All, selects the reference epic, waits for all 30 cards and measured geometry, and writes a PNG plus capture metadata beside the immutable fixture. Run two captures and compare their geometry and fixture checksum before recording the ticket evidence.

## Notes

**agent:terva/mieli** at 2026-09-11T05:32:57Z

Implemented and ran the maintained capture path. `npm run capture:canvas-baseline` builds a temporary binary, unpacks the AHPSH archive into an isolated stable-path store, adapts layout schema 3 to the current schema 2 reader, creates temporary reference targets, sets a dark 2048x1152 viewport with Relationships=All, selects the reference epic, waits for 30 measured cards and relationship paths, and writes the PNG plus JSON metadata. Two captures were byte-identical at SHA-256 `75fd5785ba7cafc07acd3acff6ca6f3d1cc7a49c4d70e55f156dfb27339e85cc`; the source archive stayed at `a6162422b117d113e77b17323fbb7d736df19ae68016051e62605a2c6dd240ab`. Documentation is in `docs/canvas-baseline.md`.

**agent:terva/mieli** at 2026-09-11T05:36:03Z

in-progress to done: Implemented the documented deterministic capture command, committed the PNG and metadata, and checked all five acceptance criteria.

**agent:terva/mieli** at 2026-09-11T05:36:03Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-21 A documented browser command opens the isolated fixture at the default board with all 30 cards and Relationships set to All. — docs/canvas-baseline.md documents `npm run capture:canvas-baseline`; the capture script opens the isolated AHPSH store on the `default` board, selects Relationships=`all`, and asserts 30 rendered cards before taking the screenshot.
- [x] task-22 The capture waits for card measurement and relationship rendering instead of relying on a fixed sleep. — scripts/capture-canvas-baseline.mjs uses Playwright waits and assertions: it waits for `#cards`, checks all 30 card bounds have positive width and height, waits for the selected inspector, and waits for the first rendered relationship. The script contains no fixed sleep.
- [x] task-23 The screenshot is stored at a stable artifact path with viewport, board, relationship mode, app build, and fixture checksum metadata. — The committed PNG is at `docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/canvas-baseline.png`. Its adjacent JSON records the stable output, 2048x1152 viewport, device scale factor 1, `default` board, `all` relationships, app version, 30 cards, 41 relationships, and fixture SHA-256 `a6162422b117d113e77b17323fbb7d736df19ae68016051e62605a2c6dd240ab`.
- [x] task-24 Two captures from the same checkout produce equivalent scene geometry and do not modify the fixture source. — The verification recorded in docs/canvas-baseline.md shows two captures from the same checkout produced identical PNG bytes with SHA-256 `75fd5785ba7cafc07acd3acff6ca6f3d1cc7a49c4d70e55f156dfb27339e85cc`. The capture script removes its temporary adapted store in `finally`, and the fixture archive checksum remains `a6162422b117d113e77b17323fbb7d736df19ae68016051e62605a2c6dd240ab`.
- [x] task-25 The capture procedure identifies how the supplied reference image maps to the generated baseline. — docs/canvas-baseline.md explicitly states that the generated image is the current-app baseline for the supplied reference screenshot, matching its 30-ticket AHPSH store, saved `default` layout, dark 2048x1152 viewport, `All` relationship mode, and selected ticket. It also records that the supplied conversation image was not workspace-accessible, so byte-for-byte equivalence is not claimed.

## Summary

Added `npm run capture:canvas-baseline` with a Playwright browser harness in `scripts/capture-canvas-baseline.mjs`. It adapts only a temporary copy of the immutable AHPSH archive, waits for 30 measured cards and rendered relationships, and captures the dark 2048x1152 `default` board with Relationships=`All`. The committed PNG and JSON metadata live beside the archive. Two captures produced identical PNG SHA-256 `75fd5785ba7cafc07acd3acff6ca6f3d1cc7a49c4d70e55f156dfb27339e85cc`; the fixture archive remained SHA-256 `a6162422b117d113e77b17323fbb7d736df19ae68016051e62605a2c6dd240ab`. The generated image is documented as a current-app baseline, not a byte-for-byte copy of the inaccessible conversation attachment.
