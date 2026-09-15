---
schema: 3
id: TKT-01M2HPBA7RWTDJ54X497BJM16Z
title: Explain discovery decisions with a --scan dry run
type: task
status: done
status_reason: --scan explains every discovery rule and is the harness the walk tests assert against. Two choices changed from the plan after running it on a real workspace, and both are recorded.
priority: normal
due_on: null
labels:
  - discovery
assignees: []
milestone: null
parent: TKT-01M2HPB9WEYH5VSYB55GNYMZ8Y
origin: null
dependencies:
  - TKT-01M2HPBA4EZT6EGT0Q0ZCRY4F4
  - TKT-01M2HPBA60FP1Y0TK81HHYZT0H
blocks_on: none
references: []
claim:
  actor: agent:t3code/d30689a3
  branch: t3code/orient-upstream-review-tickets
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-d30689a3
  commit: c7bd92384cea55421cffceb16db81bfa3d4e0425
  session: null
  claimed_at: 2026-09-15T05:52:05Z
  expires_at: null
archive: null
created_at: 2026-09-15T04:49:03Z
updated_at: 2026-09-15T05:58:08Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

Explain the result of discovery, per candidate.

Depth, exclusions, the store-boundary rule, declared children, and explicit
entries all interact. "Why is my store not in the list" has five possible
answers, so answer it directly rather than leaving somebody to guess.

`git-ticket-canvas --scan` runs discovery, prints one line per candidate with
the reason for the decision, and exits without starting a server.

```
$ git-ticket-canvas --scan
~/workspace  depth 4
  ok   ledger                          store
  ok   forge/org/project               store
  skip forge/other-org                 excluded (config: exclude[0])
  skip forge/org/project/docs          not descended (store boundary)
  ok   forge/org/project/docs/fixture  child (declared by forge/org/project)
  skip forge/org/project/node_modules  excluded (default)
```

This is also the test harness for the walk. A test that asserts against this
output covers depth, hidden directories, exclusions, boundaries, and declared
children in one readable fixture, which is easier to review than a set of
assertions over a returned structure.

## Acceptance criteria

- [x] --scan prints one line per candidate with the decision and the reason, then exits without serving.
- [x] Each reason names its cause: depth, a store boundary, which exclusion matched, or which store declared a child.
- [x] The output is stable enough to assert against, and the walk tests use it.

## Definition of done

- [x] go test ./... passes.

## Implementation plan

### The example in the description cannot happen

Two of its lines sit inside a store:

```
  skip forge/org/project/docs          not descended (store boundary)
  skip forge/org/project/node_modules  excluded (default)
```

The walk stops at `forge/org/project` and never reads its children, so neither
directory is ever examined and neither can produce a decision. Making them
appear would mean listing one level below every store, which on a workspace of
22 stores is a few hundred lines of noise for the one case somebody cares
about.

The boundary is reported where it is real: on the store line, which says the
subtree below it was not searched. That is the answer to "why is my store not
listed" for anything under a store, and it costs one line per store rather than
one per subdirectory. The description's example and the same example in
`docs/multi-store-design-v1.md` both get corrected to what the code can
produce.

### One function decides what discovery concludes

`--scan` is worth having only if it explains the discovery that actually runs.
Today `main.go` sequences it: open the explicitly named stores, ask each for its
declared children, then walk the roots. A second sequence for scanning would
drift from the first, and the drift would be invisible.

So the sequence moves into `discover.Scan(cfg) Result`, and both paths call it.
Serving opens what Scan found. Scanning prints what Scan found and exits.

Scan shares one `seen` set across the explicit stores and the roots, which
removes a case `main.go` handles today: a store named on the command line that
also sits under a root is recorded once, as explicit, rather than found twice
and deduplicated afterward. Merging on resolved path, and the name collisions
that go with it, stays TKT-01M2HPBA9 (Merge explicitly named stores with
discovered ones).

`Decision` gains a `Root` field so the output can be grouped without matching
path prefixes, and `Result` gains a count of directories examined. A run that
examined 400 directories and found nothing is a different problem from one that
examined 2.

### The output

```
configured
  ok    /home/sothr/ledger                    named explicitly
  ok    /home/sothr/ledger/vendor/inner       declared by /home/sothr/ledger

/home/sothr/workspace  depth 4
  ok    forge/org/project                     store; its subtree is not searched
  skip  forge/org/node_modules                excluded by node_modules
  skip  forge/deep/a/b/c/d                    depth limit reached
  skip  scratch                               has .tickets but no config.yml

3 stores, 3 skipped, 412 directories examined
```

One section per root, headed by the root and its depth, plus a section for the
stores named explicitly. Paths are relative to their root, because the root is
already in the heading and the repeated prefix is what makes this output hard to
read. Lines sort by path, which is stable and reads as a tree. Warnings print
last, under their own heading, so a refused declared child and an exclusion that
contradicts an explicit store are visible here rather than only in the server
log.

A directory that was searched and held nothing gets no line. Recording every
directory would bury the decisions, and the examined count carries what it would
have told you.

`Format(cfg, result, w)` renders it, so a test asserts against the text rather
than over a returned structure, which is what the third acceptance criterion
asks for.

### Tests

One fixture tree exercising all five rules at once, asserted against the
rendered text: a store found, a store inside it invisible behind the boundary, a
declared child reaching past the boundary, an excluded directory, a directory
past the depth limit, a hidden directory, and a `.tickets` that does not
qualify. Then the smaller ones: `--scan` exits without listening, the configured
section appears with no roots at all, and grouping holds with two roots.

## Notes

**agent:t3code/d30689a3** at 2026-09-15T05:52:05Z

draft to ready: The user chose it next. Both dependencies, the exclusions and the declared children, are done, and it is the last of the five discovery rules to become inspectable.

**agent:t3code/d30689a3** at 2026-09-15T05:58:08Z

in-progress to done: --scan explains every discovery rule and is the harness the walk tests assert against. Two choices changed from the plan after running it on a real workspace, and both are recorded.

## Summary

`--scan` prints what discovery decided about every candidate and exits without
serving. `internal/discover/scan.go` holds both halves: `Scan` computes it and
`Format` renders it.

### One discovery, whether it is explained or served

`main.go` used to sequence discovery itself: open the explicitly named stores,
ask each for its declared children, then walk the roots. That sequence is now
`discover.Scan`, and both paths call it. An explanation of a discovery that is
not the one being run would be worse than none.

Scan shares one record of what has been examined across the whole sequence,
which removes a case `main.go` handled: a store named on the command line that
also sits under a root is recorded once, as explicit, rather than found twice
and deduplicated afterward. Merging on resolved path stays TKT-01M2HPBA9 (Merge
explicitly named stores with discovered ones).

### Two things the output does differently from the plan

Both came from running it against a real workspace of 22 stores rather than
from a fixture.

The store boundary is explained once, in a note at the end, rather than on
every store line. The plan put it on the line. At 22 stores that is the same
30-character clause 22 times, which is what stops output being read at all. The
note answers "why is my store not listed" for every directory below a store, in
two lines.

A symbolic link is only reported when it points at a directory. The walk
recorded one for every link, so a workspace where `AGENTS.md` is a link to a
shared file produced skip lines for files that were never candidates, burying
the links that could have been stores. The link at the top of that workspace
that points at one project's `.tickets`, which is the one that cost the walk 21
stores before, is still reported.

The example in this ticket's description, and the same example in
`docs/multi-store-design-v1.md`, both had two lines that the code cannot
produce: a skip for `forge/org/project/docs` and one for
`forge/org/project/node_modules`. Both sit inside a store, so neither is ever
examined and neither can carry a decision. The document now shows what the code
prints.

### Verified

`just test`, `just vet`, and `just tickets-check` all pass. `internal/discover`
is at 92.9% coverage. Six new tests there assert against the rendered text,
including one fixture tree that exercises depth, hidden directories,
exclusions, the boundary, a `.tickets` that does not qualify, and a declared
child at once.

`--scan` exiting without serving is tested end to end: the test holds the
address the canvas would have listened on, so a run that tried to serve would
fail to bind and a run that served would never return.

Run against real data. On a workspace of 22 stores, `--scan -R` reports 22
stores, 308 skipped, and 236 directories examined, and at depth 3 the same 22
stores with the repositories that hold no store shown as reaching the depth
limit. Serving still works after the refactor: the same invocation without
`--scan` opens all 22, and `GET /api/stores` lists them.

Not run: the visual suite. Chromium cannot load `libnspr4.so` on this machine
and installing the library needs a password. Unchanged from the five commits
before this one.
