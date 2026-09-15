---
schema: 3
id: TKT-01M2KJ1RQ96BDARDT31Y93DSVJ
title: Seed the example bundle with modern placement metadata
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels: []
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-15T22:12:25Z
updated_at: 2026-09-15T22:12:25Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

The committed example bundle predates most of what the canvas can now place, so
any screenshot generated from it understates the product.

`docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/ahpsh-tickets.tgz`
carries `.tickets/canvas/default.yml` at `schema: 3`, which is current, so this
is not a schema migration. The gap is in what the file uses. Every one of its
cards is a bare pair:

    "TKT-01M24G5WDNA3KER19GWBC2F688": {x: -767, y: 685}

`internal/layout` reads and writes considerably more than that today. A Card
also carries `w`, `z`, and `collapsed`. A Board carries `frames`, each with a
title, bounds, color, and an explicit member list. `Routing` adds `pens` with
pin points and required labels, a `ruleOrder`, and an `inbox` point. The bundle
exercises none of them, so a capture from it shows loose cards on an empty
field: no grouping frames, no pens, no widened card holding a long title, and
nothing collapsed.

That matters most where the screenshots are going. The README's central claim is
that position is authored data and that spatial arrangement carries real
information. A picture of ungrouped cards at default width is the weakest
possible illustration of that argument, and it is weak for a reason that has
nothing to do with the product.

What a refreshed bundle needs is a real arrangement rather than a synthetic one:
someone opening the canvas over this store, grouping the work into frames that
mean something, widening the cards whose titles deserve it, and saving what
results. A generated arrangement would produce a picture of an algorithm's
output, which is exactly what the README says a canvas is not for.

Keep the existing archive rather than replacing it. `canvas-baseline.png`,
`canvas-baseline.json`, the visual suite, and `SCENE` in
`tests/browser/canvas-scene.mjs` all pin to its exact contents, including
`expectedCards: 30` and `expectedRelationships: 41`. A second bundle beside it
leaves the review baseline intact and gives the screenshots a seed chosen for
showing the product rather than for guarding a regression.

## Acceptance criteria

- [ ] A committed bundle exercises frames, card width, z-order, and collapsed cards, and states which of pens and inbox it covers.
- [ ] The existing AHPSH archive and its baseline artifacts are unchanged, so the visual suite and SCENE still pin to what they pin to now.
- [ ] The arrangement is authored by a person on a real canvas rather than generated, and the ticket records who arranged it and when.
- [ ] The README screenshot generator names the new bundle as its default seed.
