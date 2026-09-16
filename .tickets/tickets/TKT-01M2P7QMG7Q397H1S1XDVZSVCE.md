---
schema: 3
id: TKT-01M2P7QMG7Q397H1S1XDVZSVCE
title: Move to git-ticket v0.19.1
type: task
status: in-progress
status_reason: null
priority: normal
due_on: null
labels:
  - infrastructure
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim:
  actor: agent:claude/t3code
  branch: t3code/git-ticket-v0.19.1
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-acc5e2b7
  commit: f24527838d9015adbfc0d806cf1e457dcd3bbefe
  session: null
  claimed_at: 2026-09-16T23:09:53Z
  expires_at: null
archive: null
created_at: 2026-09-16T23:09:50Z
updated_at: 2026-09-16T23:11:02Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

The canvas is pinned to `github.com/terva-sh/git-ticket v0.19.0`. v0.19.1 is
published, one day later, and is a single behavioural change plus the prose that
was wrong when v0.19.0 shipped.

The whole library diff sits in `ticket/doctorrules.go`, and none of it is
exported: no exported identifier in that file changed between the two tags. So
nothing in this tree has to compile against anything new. `ParseConfig` is the
only library call the canvas makes near this area, at
`internal/api/snapshot.go:214`, and the two parameters v0.19.1 adds are doctor
config rather than Go API.

What does change is what `git ticket doctor` says about this store.

`label_order` in v0.19.0 fired on any ticket carrying two or more labels, which
on this store was every open ticket that had been labelled at all. We answered
those 31 findings one at a time in TKT-01M2NYWQJW and concluded that driving
them to zero would mean stripping tickets down to one label, which is worse than
the thing being reported.

v0.19.1 replaces the assertion with an inference. It reads the dimension each
ticket leads with, the text before the first `/` or `:`, finds the dimension the
store leads with most often, and reports only the tickets that disagree. Below
`sample` ordered tickets, or below `confidence` dominance, it says nothing at
all. Upstream measured this store at 19 findings before and 0 after, and records
the zero as the correct answer rather than a gap: this store has no dimensional
label convention, so there is nothing objective for the rule to say.

That prediction was measured against an older snapshot of this store, so
confirming it here against the store as it stands now is part of the work rather
than a formality.

The JSON path-join bug found during the v0.19.0 bump is filed upstream as
TKT-01M2NZDPTQQV6T68B0N4S8BAE7 and is still a draft at v0.19.1, so it should
still reproduce. Confirming that is cheaper than assuming it either way.

Three workflow files install the CLI by version and have to move with `go.mod`.
`TestWorkflowsInstallTheGitTicketGoModRequires` is what catches that, and it
caught it on the v0.19.0 bump rather than me remembering.

## Acceptance criteria

- [ ] go.mod is pinned to v0.19.1 and the tree builds and passes parity-check
- [ ] The three workflow files that install the CLI move with go.mod
- [ ] doctor's findings on this store are measured after the bump and the change from 0 hard / 32 soft is explained rather than just reported
- [ ] Whether the upstream JSON path-join bug still reproduces is checked and recorded
- [ ] The conclusion recorded in TKT-01M2NYWQJW, that label_order could not be driven to zero, is revisited against what the rule now does

## Implementation plan

Bump `go.mod`, move the three workflow pins with it, and then spend the actual
effort on the one thing that changes: what doctor says about this store.

The measurement has to be honest about a confound. Upstream's "19 to 0" figure
for this store was taken against an older snapshot, and the store has gained
tickets since, including this one. Comparing yesterday's 32 against today's
number would be comparing two different stores and crediting the difference to
the tool. So both CLI versions get run against the identical working tree, with
v0.19.0 installed to a scratch GOBIN rather than replacing the one on PATH.

The JSON path-join bug gets checked in a throwaway store in `/tmp` rather than
against any real one, because the check needs a store with a live finding and
this one is clean.
