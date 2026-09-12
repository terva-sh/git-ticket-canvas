---
schema: 3
id: TKT-01M29HX117P043SBQBMC5200XJ
title: Remove or document the unreferenced ticket snapshot in docs/artifacts
type: chore
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - quality-of-life
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references:
  - ref: artifact:canvas-review-ticket-snapshot
    path: docs/artifacts/canvas-review-baseline-2026-09-11/.tickets
claim: null
archive: null
created_at: 2026-09-12T00:57:25Z
updated_at: 2026-09-12T00:57:25Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

`docs/artifacts/canvas-review-baseline-2026-09-11/.tickets` is a ticket store of 31 tracked files and 236K, holding 28 tickets in `done` and `draft` plus `README.md`, `config.yml` and `epics.md`. Nothing in the repository reads it.

It is not the canvas fixture, and it could not be. It has no `canvas/` directory, so it carries no board layout. The fixture the suite uses is one directory deeper, at `ahpsh-tickets/.tickets`, with 30 tickets that match `ahpsh-tickets.tgz`, and `tests/browser/canvas-fixture.mjs` unpacks the tarball rather than reading either extracted copy.

Two directories named `.tickets` under one artifact directory, one of them live and one of them not, is the kind of thing that costs somebody an hour. It cost part of a verification pass already: TKT-01M26YEEBGPYAFDNF6TTM2JVD7 (Build reproducible canvas fixtures and visual test suites) has a note about it, which is currently the only reference to the path anywhere in the repository.

### Where it came from

`6957ac2` on 2026-09-10, "Add canvas review ticket snapshot", with an empty body. The real fixture arrived two commits later in `8e5b75f`, "Add screenshot scene ticket store artifact". So the snapshot predates the fixture and looks like a first attempt that the tarball replaced.

### The decision this needs

Deleting it is the obvious move and it may be the wrong one. A 28-ticket snapshot taken the day the canvas review started could be the provenance of the reference screenshot, which was never a workspace file. If that is what it is, it is worth keeping and worth a sentence saying so, because a snapshot nobody can identify is deleted by the next person who finds it.

Read the 28 tickets against the 30 in the tarball before deciding. If they are the same board minus two, it is provenance. If they are unrelated, it is debris.

## Acceptance criteria

- [ ] The 28 tickets in the snapshot are compared against the 30 in ahpsh-tickets.tgz, and the ticket records which they are.
- [ ] Either the directory is gone, or a line beside it says what it is and why it stays.
- [ ] git grep finds no path reference the change left dangling, including the note on TKT-01M26YEEBGPYAFDNF6TTM2JVD7.
- [ ] just tooling-test, the canvas-density spec and just canvas-visual still pass, proving nothing read it.
