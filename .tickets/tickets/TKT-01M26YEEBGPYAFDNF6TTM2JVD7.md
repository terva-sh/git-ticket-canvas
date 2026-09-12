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
updated_at: 2026-09-12T18:54:30Z
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

- [x] A test can copy the committed AHPSH ticket archive into an isolated store and open the default board with all 30 tickets and its saved layout.
- [x] A documented browser command reproduces the reference viewport, board, relationship mode, and readiness state before capturing evidence.
- [x] The fixture source remains unchanged by a test run, and the archive, extracted store, and capture metadata have stable project paths.
- [x] The suite provides a reviewable baseline and regression evidence for relationship rendering and card density.
- [x] A contributor can run the fixture suite and understand how to compare or intentionally update its visual baseline.

## Definition of done

- [x] The fixture and capture commands pass from a clean checkout.
- [x] The artifact paths and reproduction steps are documented next to the fixture.

## Implementation plan

1. Add a fixture-copy helper or test setup that starts from the committed `ahpsh-tickets.tgz` without mutating it.
2. Add a browser capture path with fixed viewport, board selection, relationship mode, readiness wait, and stable output names.
3. Store the reference image and capture metadata as versioned artifacts.
4. Add visual or structural assertions for relationship density and compact-card presentation.
5. Document how to run the fixture suite locally and how to update a baseline intentionally.

## Notes

**agent:terva/mieli** at 2026-09-11T20:13:44Z

draft to ready: The user asked for the promotion. Six of its nine children are done: the fixture helper, the deterministic capture, the visual checks, relationship clutter, compact card density, and the lane-width measurement. Three remain in draft: edge routing, row pitch, and lane depth.

**agent:terva/mieli** at 2026-09-12T00:34:38Z

Verification pass over this epic's own boxes, at 887f740. No feature work. Five acceptance criteria ticked, one definition-of-done item ticked, one left open.

Each criterion's evidence is on the task that closed it. The two things worth reading here are what the pass found.

### The saved-layout claim was never asserted anywhere

Criterion 1 says the board opens with its saved layout, and nothing in the suite checks that. `canvas-density.spec.ts` asserts the board name, 30 cards and 30 tickets served. The fixture helper checks that `default.yml` exists in the copy. Neither compares a rendered position against a saved one, so an automatic placement of all 30 cards would pass both.

I verified it by hand instead: the 30 geometry rows in `canvas-baseline.json` against the 30 placements in the fixture's `default.yml`. They agree under one scale, 0.59079, and one offset, worst deviation 0.68 px, no rendered card without a saved placement. So the criterion is earned. It is earned by the artifact and by my arithmetic rather than by a test, which is worth knowing if somebody later changes how a board loads.

### The baseline doc named a superseded image

The Verification section of `docs/canvas-baseline.md` gave `1688493a...` as the committed baseline. Two baselines have landed since, for the relationship-clutter and card-density tickets, and the committed image is `dc699217...`. A contributor following that section to check reproducibility would have compared a correct capture against the wrong hash and concluded the capture was broken.

Fixed in the doc as part of this pass. It now names `dc699217`, which I reproduced today, and attributes the eight-capture determinism sweep to the baseline it was actually run against. `baseline-history.json` was correct throughout, and `tests/tooling/canvas-baseline.test.mjs` holds the PNG, the metadata and the newest history entry together. The prose was the only thing that drifted, because nothing checks prose.

### The definition-of-done item left open

"The artifact paths and reproduction steps are documented next to the fixture" is unticked. The documentation is thorough and it lives at `docs/canvas-baseline.md`. Nothing sits in `docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/` pointing at it, so somebody who finds the archive first finds no way back to the instructions. A README of a few lines beside the archive would earn it. That is a decision about where docs belong, so I left the box honest rather than reading "next to" loosely.

### Loose artifact

`docs/artifacts/canvas-review-baseline-2026-09-11/.tickets` is a second extracted store, 31 tracked files with 28 tickets, and nothing in the repository references it. The fixture the suite uses is the one inside `ahpsh-tickets/`, which has 30 tickets and matches the tarball. Worth a chore to remove, but not this pass.

### What ran

The archive stayed at `a6162422` throughout. The whole artifact directory hashes to `8adb1326` before and after a browser run. From a detached worktree at HEAD with only `node_modules` linked in, the capture reproduced the committed PNG byte for byte, the fixture and baseline tooling tests passed 10, and the structural density spec passed 6. In the main tree: `just tooling-test` 79, `just canvas-visual` 7.

**agent:terva/mieli** at 2026-09-12T01:38:56Z

The last definition-of-done item is closed. `docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/README.md` now sits beside the archive.

It is a map rather than a second copy of `docs/canvas-baseline.md`. It names what each of the five files in the directory is, carries the two checksums that identify the archive and the committed baseline, gives the four commands with their once-per-machine prerequisites, states the capture conditions, and states the one rule that matters: regenerate with the capture, never with `--update-snapshots`, and add a history entry. The reasoning stays in `docs/canvas-baseline.md`, which the README points at in its second sentence.

Two things it says that the root doc does not. The extracted `.tickets` copy beside the tarball is for a person to read and no test reads it, because the helper unpacks the tarball into a fresh temporary store for every run. And the unreferenced `.tickets` directory one level up is not part of this fixture, with TKT-01M29HX117P043SBQBMC5200XJ (Remove or document the unreferenced ticket snapshot in docs/artifacts) named as the ticket that decides its fate.

Both checksums in the README were checked against the files on disk rather than copied from the earlier note, `just tooling-test` still passes 79, and the new file changes nothing the suite reads.

Every box on this epic is now ticked. It stays open on `blocks_on: children` for TKT-01M28QE4Z761Y2KBVYDMV1NYVZ (Route or bundle canvas edges through dense crossings), which is still in draft.

**agent:terva/mieli** at 2026-09-12T18:54:30Z

Supersedes the "Loose artifact" section of my verification note above.

That note reported `docs/artifacts/canvas-review-baseline-2026-09-11/.tickets` as a second extracted store of 28 tickets that nothing references, and guessed it might be fixture provenance. The guess was wrong and the path no longer exists.

TKT-01M29HX117P043SBQBMC5200XJ (Remove or document the unreferenced ticket snapshot in docs/artifacts) compared the two id sets. The 28 tickets shared none of the 30 ids in `ahpsh-tickets.tgz`, and all 28 are tickets from this repository's own store. It was a copy of git-ticket-canvas's own board committed under an artifact name, not fixture material, and it carried no `canvas/` directory so it held no layout. It has been deleted.

The fixture is `ahpsh-tickets/ahpsh-tickets.tgz` and its extracted copy beside it. `ahpsh-tickets/README.md` records what was removed, so the next reader does not have to repeat the comparison.
