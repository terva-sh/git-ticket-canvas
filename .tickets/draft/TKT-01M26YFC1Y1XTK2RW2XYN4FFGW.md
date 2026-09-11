---
schema: 3
id: TKT-01M26YFC1Y1XTK2RW2XYN4FFGW
title: Make the 30-ticket canvas fixture runnable
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
updated_at: 2026-09-11T00:39:26Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Turn the committed AHPSH ticket archive into a reusable test fixture for the canvas. The source archive is `docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/ahpsh-tickets.tgz`; it contains the `.tickets/canvas/default.yml` layout and 30 ticket Markdown files from the reference scene.

Add a test setup or helper that copies the archive into an isolated temporary store, starts or points the canvas app at that store, selects the `default` board, and leaves the source archive untouched. The helper should expose the fixture path and cleanup lifecycle to browser and integration tests instead of making each test unpack the scene independently.

## Acceptance criteria

- [ ] A test setup copies the committed archive into an isolated temporary store and verifies that the default board contains all 30 fixture tickets.
- [ ] The canvas app can start against the isolated store and open the saved `default` board layout from `.tickets/canvas/default.yml`.
- [ ] A fixture run never mutates the committed archive or another test's store, and cleanup removes the temporary store.
- [ ] The helper and its local invocation are documented for browser and integration test authors.

## Implementation plan

Add a fixture helper around the committed archive, verify the expected ticket and board files before launch, and document the command or test entry point that consumes it.
