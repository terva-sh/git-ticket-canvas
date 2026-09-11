---
schema: 3
id: TKT-01M26YFRD2YJS7116WT5ACZYGW
title: Capture a deterministic screenshot of the canvas fixture
type: task
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
parent: TKT-01M26YEEBGPYAFDNF6TTM2JVD7
origin: null
dependencies:
  - TKT-01M26YFC1Y1XTK2RW2XYN4FFGW
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-11T00:39:39Z
updated_at: 2026-09-11T00:39:39Z
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

Build on the fixture helper, set browser and app state explicitly, wait on a deterministic readiness signal, then capture the page and a small metadata record next to the image.
