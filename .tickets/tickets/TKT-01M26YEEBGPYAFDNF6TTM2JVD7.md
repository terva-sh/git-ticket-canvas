---
schema: 3
id: TKT-01M26YEEBGPYAFDNF6TTM2JVD7
title: Build reproducible canvas fixtures and visual test suites
type: epic
status: ready
status_reason: "The user asked for the promotion. Six of its nine children are done: the fixture helper, the deterministic capture, the visual checks, relationship clutter, compact card density, and the lane-width measurement. Three remain in draft: edge routing, row pitch, and lane depth."
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
blocks_on: children
references:
  - ref: artifact:canvas-review-baseline
    path: docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/ahpsh-tickets.tgz
  - ref: artifact:canvas-review-extracted-store
    path: docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/.tickets
claim: null
archive: null
created_at: 2026-09-11T00:38:56Z
updated_at: 2026-09-11T20:13:44Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Create a repeatable browser-test scene for the git ticket canvas so layout, relationship rendering, and card density can be reviewed against the same 30-ticket board.

The supplied `ahpsh-tickets.tgz` is the first fixture source. It contains a `.tickets/canvas/default.yml` board layout, 30 ticket Markdown files, and the default board state shown in the reference screenshot. The committed copy is at `docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/ahpsh-tickets.tgz`, with an extracted copy beside it. Keep the archive and source fixture immutable. Tests should copy it into an isolated temporary store before starting the app.

The suite should make the scene deterministic. It needs a documented viewport, board name, relationship mode, wait condition for card measurements, and screenshot or DOM evidence capture. The first consumers are the all-edges readability work and compact card density work already filed as child candidates. Later canvas ideas can use the same fixture instead of rebuilding a dense board by hand.

The reference screenshot is currently available in the conversation but not as a workspace file. Add it to the artifact when a workspace-visible image becomes available, and record the capture conditions beside it rather than changing the immutable ticket-store source.

## Acceptance criteria

- [ ] A test can copy the committed AHPSH ticket archive into an isolated store and open the default board with all 30 tickets and its saved layout.
- [ ] A documented browser command reproduces the reference viewport, board, relationship mode, and readiness state before capturing evidence.
- [ ] The fixture source remains unchanged by a test run, and the archive, extracted store, and capture metadata have stable project paths.
- [ ] The suite provides a reviewable baseline and regression evidence for relationship rendering and card density.
- [ ] A contributor can run the fixture suite and understand how to compare or intentionally update its visual baseline.

## Definition of done

- [ ] The fixture and capture commands pass from a clean checkout.
- [ ] The artifact paths and reproduction steps are documented next to the fixture.

## Implementation plan

1. Add a fixture-copy helper or test setup that starts from the committed `ahpsh-tickets.tgz` without mutating it.
2. Add a browser capture path with fixed viewport, board selection, relationship mode, readiness wait, and stable output names.
3. Store the reference image and capture metadata as versioned artifacts.
4. Add visual or structural assertions for relationship density and compact-card presentation.
5. Document how to run the fixture suite locally and how to update a baseline intentionally.

## Notes

**agent:terva/mieli** at 2026-09-11T20:13:44Z

draft to ready: The user asked for the promotion. Six of its nine children are done: the fixture helper, the deterministic capture, the visual checks, relationship clutter, compact card density, and the lane-width measurement. Three remain in draft: edge routing, row pitch, and lane depth.
