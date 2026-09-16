---
schema: 3
id: TKT-01M2ND1RKK6S4GXZQKKPP6H87P
title: Place unpinned cards by rule
type: task
status: draft
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
claim: null
archive: null
created_at: 2026-09-16T15:23:31Z
updated_at: 2026-09-16T15:23:51Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
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
- [ ] Schema 3 requiredLabels opens and reads as match.labels
- [ ] Filing a ticket inserts into a pen without reshuffling the cards already in it
