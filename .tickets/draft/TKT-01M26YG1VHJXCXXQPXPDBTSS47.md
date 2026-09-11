---
schema: 3
id: TKT-01M26YG1VHJXCXXQPXPDBTSS47
title: Add visual checks for dense canvas scenes
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
  - TKT-01M26YFRD2YJS7116WT5ACZYGW
  - TKT-01M27GQJPMBKCGRD9T0ES3WV7C
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-11T00:39:48Z
updated_at: 2026-09-11T05:58:37Z
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

- [ ] The suite loads the 30-ticket fixture and asserts the expected card count, board, relationship mode, and inspector state before comparing visuals.
- [ ] Failures distinguish structural changes such as missing cards or edges from screenshot differences, and retain reviewable diff output.
- [ ] The baseline covers the dense right-side relationship cluster and the full card metadata presentation shown in the reference scene.
- [ ] Baseline updates require an explicit command or review step and record why the visual change is intentional.
- [ ] The suite is usable as the regression gate for the relationship-clutter and compact-card child tickets.

## Implementation plan

Add a browser test that consumes the fixture and capture helper, stores a baseline and diff output, and asserts stable card counts, relationship kinds, toolbar state, and inspector presence alongside the image comparison.
