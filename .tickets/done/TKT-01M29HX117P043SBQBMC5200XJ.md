---
schema: 3
id: TKT-01M29HX117P043SBQBMC5200XJ
title: Remove or document the unreferenced ticket snapshot in docs/artifacts
type: chore
status: done
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
references: []
claim: null
archive: null
created_at: 2026-09-12T00:57:25Z
updated_at: 2026-09-12T18:56:19Z
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

- [x] The 28 tickets in the snapshot are compared against the 30 in ahpsh-tickets.tgz, and the ticket records which they are.
- [x] Either the directory is gone, or a line beside it says what it is and why it stays.
- [x] git grep finds no path reference the change left dangling, including the note on TKT-01M26YEEBGPYAFDNF6TTM2JVD7.
- [x] just tooling-test, the canvas-density spec and just canvas-visual still pass, proving nothing read it.

## Notes

**agent:terva/mieli** at 2026-09-12T18:52:17Z

draft to ready: The user asked me to pick this up and clear it, which is the promotion.

**agent:terva/mieli** at 2026-09-12T18:53:05Z

The comparison, and it answers the question the other way from either option I offered.

I framed this as "same board minus two means provenance, unrelated means debris". It is neither. The 28 tickets are this repository's own tickets.

- Snapshot ids: 28. Tarball ids: 30. Ids in both: **0**.
- Snapshot ids that are tickets in this repository's live `.tickets` store: **28 of 28**.
- Snapshot ids found nowhere in this repository's store: 0.

Titles confirm it at a glance: "Automate the MVP HTTP smoke checks", "Add just recipes for local development", "Migrate the ticket canvas MVP to Preact", "Capture MVP browser behavior before the Preact migration", "Add the TypeScript and Vite frontend build pipeline". That is git-ticket-canvas's own board in early September, not the AHPSH scavenger-hunt board the canvas review used.

So `6957ac2` "Add canvas review ticket snapshot" committed a copy of this project's own ticket store into `docs/artifacts/`, two commits before `8e5b75f` added the actual fixture. The name made it look like fixture material to every reader since, including me when I filed this ticket.

It cannot be provenance for the reference screenshot either. It has no `canvas/` directory, so it carries no board layout and could not reproduce any arrangement of anything.

That settles the decision: delete it. Nothing reads it, it is not the fixture, it is not provenance, and it is a stale duplicate of 28 tickets that are live in `.tickets/` right now with their full history in git. Keeping a second copy of the project's own board inside its artifact directory would mean maintaining two stores that drift apart, which is the confusion this ticket was filed about in the first place.

**agent:terva/mieli** at 2026-09-12T18:56:16Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-105 The 28 tickets in the snapshot are compared against the 30 in ahpsh-tickets.tgz, and the ticket records which they are. — Compared id sets. Snapshot 28, tarball 30, intersection 0. All 28 snapshot ids are tickets in this repository's live .tickets store (28 of 28, none missing). Titles confirm it: "Migrate the ticket canvas MVP to Preact", "Add just recipes for local development" and similar, which is git-ticket-canvas's own board, not the AHPSH board. Recorded on the ticket as a note. The finding refutes both options the ticket offered: it is not fixture provenance and not unrelated debris, it is a stale duplicate…
- [x] task-106 Either the directory is gone, or a line beside it says what it is and why it stays. — Directory removed with git rm -r: 31 tracked files, 236K, at docs/artifacts/canvas-review-baseline-2026-09-11/.tickets. What remains under the artifact directory is the fixture alone: ahpsh-tickets.tgz, its extracted .tickets copy, canvas-baseline.png, canvas-baseline.json, baseline-history.json and README.md. The README's "What is not here" section now records what was removed and why, so the identification survives the deletion and nobody re-adds it.
- [x] task-107 git grep finds no path reference the change left dangling, including the note on TKT-01M26YEEBGPYAFDNF6TTM2JVD7. — git ticket files on the removed path now answers "No ticket recorded a reference to that path"; before this it returned the chore, because its references block carried path: docs/artifacts/canvas-review-baseline-2026-09-11/.tickets. That entry (artifact:canvas-review-ticket-snapshot) is removed and the chore now has references: []. Four prose mentions remain and all are intentional history rather than dangling pointers: the epic's original note at line 100, my superseding note on the epic at lin…
- [x] task-108 just tooling-test, the canvas-density spec and just canvas-visual still pass, proving nothing read it. — The three the criterion named all pass after the deletion: just tooling-test 79 of 79, canvas-density spec 6 passed, just canvas-visual 7 passed including the pixel comparison against the committed baseline. Since the change removed 31 tracked files I also ran the full gate: just check passed, with go test -race green across every package and git ticket check --fix --dry-run --strict reporting no problems. Nothing read the deleted store.

## Summary

Deleted `docs/artifacts/canvas-review-baseline-2026-09-11/.tickets`, 31 tracked files and 236K, after establishing what it was rather than acting on the guess this ticket was filed on.

It was not fixture provenance and not unrelated debris, the two options I wrote into the description. It was a copy of this repository's own ticket store. The 28 tickets share none of the 30 ids in `ahpsh-tickets.tgz`, and all 28 are tickets in the live `.tickets/` store today. `6957ac2` committed the project's own board into the artifact directory under the name "canvas review ticket snapshot", two commits before `8e5b75f` added the real fixture, and that name misled every reader since, including me when I filed this.

It could not have been provenance for the reference screenshot in any case: no `canvas/` directory, so no board layout, so nothing to reproduce.

The identification outlives the deletion. `ahpsh-tickets/README.md` records what sat there, what it actually held and that it was removed, so nobody repeats the comparison or re-adds a second store. The epic's earlier note claiming it might be provenance is superseded by a new note rather than edited, because notes are append-only.

One dangling pointer was left by the deletion and is now gone: the chore's own `artifact:canvas-review-ticket-snapshot` reference, which made `git ticket files` resolve a path that no longer exists. That command now answers "No ticket recorded a reference to that path". The four remaining mentions are prose history in two ticket bodies and the README.

Nothing read it, as expected and now demonstrated: tooling-test 79 of 79, canvas-density 6 passed, canvas-visual 7 passed including the pixel baseline, and the full `just check` green with a clean strict store check.
