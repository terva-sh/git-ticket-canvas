---
schema: 3
id: TKT-01M2ND1RKK6S4GXZQKKPP6H87P
title: Place unpinned cards by rule
type: task
status: in-progress
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - layout
assignees: []
milestone: null
parent: TKT-01M2ND0S8N5Y8V0HQFRCBKMXE3
origin: null
dependencies:
  - TKT-01M2ND1RJAGTH8QBF1QK79XPC0
blocks_on: none
references: []
claim:
  actor: agent:claude/t3code-a6d0ff31
  branch: t3code/place-by-rule
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-a6d0ff31
  commit: bb6eec10698a7af8be205c9c3b47b2adbee035f0
  session: null
  claimed_at: 2026-09-20T02:06:19Z
  expires_at: null
archive: null
created_at: 2026-09-16T15:23:31Z
updated_at: 2026-09-20T02:07:05Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
extensions: {}
---

## Description

Wire pens into placement, replacing `autoPlace` for unpinned cards on a board that has pens. A board with no pens keeps today's behaviour exactly, so an unorganized store is unchanged.

The seam already exists. `CardView` distinguishes pinned — a card with a saved position — from unpinned, and `isPinned` is the predicate. Today unpinned means `autoPlace` decides; here it means the rules decide.

Resolution order, which is the whole contract:

1. A pinned card stays where it is. Explicit beats implicit, always.
2. Otherwise the first pen in `ruleOrder` whose `match` the ticket satisfies.
3. Otherwise the `inbox` point.

Within a pen, cards pack in a stable order — status, then priority, then ID — so filing a ticket inserts rather than reshuffles.

`requiredLabels` is the right shape and too narrow a vocabulary: a board wants to say "everything blocked", "this epic's children", "the spikes", and none of those is a label. Schema 4 replaces it with a `match` record whose fields are all optional, absent matching everything, present fields conjoined, and a list within a field read as a disjunction. Schema 3's `requiredLabels` keeps working as `match.labels`, because a board written last week must still open.

Two things that must hold. An unmatched card lands in the inbox and looks unhoused, because it is a question for whoever wrote the rules. A pen whose cards do not fit grows downward and says so, because a board that silently hides a card is worse than one that is ugly for a week.

## Acceptance criteria

- [ ] An unpinned card is placed by the first pen in ruleOrder whose match it satisfies
- [ ] A pinned card keeps its saved position regardless of any rule
- [ ] A card matching no pen lands at the inbox and is visibly unhoused
- [ ] A board with no pens places cards exactly as it does today
- [ ] A pen whose cards do not fit grows rather than clipping or overlapping, and explain says so
- [ ] Filing a ticket inserts into a pen without reshuffling the cards already in it

## Notes

**agent:claude/t3code-a6d0ff31** at 2026-09-20T02:07:05Z

Planned on 2026-09-20 with two decisions from the maintainer. Engine: a new pure resolve, per the design's 'placement is one function', not the archived trial's allocator, which ranks by specificity and contradicts first-match; the trial's removal is TKT-01M2Y91C31J34Q6DCSDN2QH6DD. Scope: schema 4's match record is split out as TKT-01M2Y91C17YTE0W0P3RBHTF50Y, so this ticket routes on requiredLabels, the rule git ticket canvas explain already resolves; the AC 'Schema 3 requiredLabels opens and reads as match.labels' moved with it. Facts that shaped the plan: nothing draws pens on the board today; autoPlace places on a fixed row pitch with no measured heights, and the resolver will too, so switching density leaves cards where they are.
