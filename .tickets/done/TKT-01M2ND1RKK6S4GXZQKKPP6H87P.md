---
schema: 3
id: TKT-01M2ND1RKK6S4GXZQKKPP6H87P
title: Place unpinned cards by rule
type: task
status: done
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
updated_at: 2026-09-20T03:36:42Z
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

- [x] An unpinned card is placed by the first pen in ruleOrder whose match it satisfies
- [x] A pinned card keeps its saved position regardless of any rule
- [x] A card matching no pen lands at the inbox and is visibly unhoused
- [x] A board with no pens places cards exactly as it does today
- [x] A pen whose cards do not fit grows rather than clipping or overlapping, and explain says so
- [x] Filing a ticket inserts into a pen without reshuffling the cards already in it

## Implementation plan

One pure function, web/src/platform/canvas/resolve.ts: resolveBoard(tickets, routing, pinned, statuses, priorities) returns positions for every unpinned card, an explanation per card (pen id or inbox, and the candidates it beat or missed), and each pen's grown height. A board with no pens returns autoPlace's answer unchanged, so an unorganized store is untouched. Otherwise: a pinned card is skipped; the first pen in ruleOrder whose requiredLabels the ticket all carries takes it; the inbox takes the rest. Within a pen, cards sort by status index, then priority index, then ID, and pack row-major on the same LANE_W, LANE_GAP and ROW_PITCH autoPlace uses, from the pen's top-left inset by the gap, as many columns as the pen's width holds. Row-major so that a pen too small for its cards grows downward, and the resolver reports the height it needed; the canvas draws the pen at that height and marks it overflowing. The inbox packs one column downward from its point. No measured heights, as autoPlace, so a density switch leaves every automatic card where it is.

Canvas.tsx: positions() calls resolveBoard instead of autoPlace; arrange() pins what the resolver answers. A new pen layer draws each pen like a frame, read-only, with its title and its grown outline, and an inbox marker at the inbox point when the board has pens. CardView gains an unhoused flag, set for an automatic card the inbox caught, and the stylesheet gives it a dashed border and the placement label reads Unhoused. Props: pens, ruleOrder, inbox from the store state that already carries them, and priorities from config.

Tests: resolve.test.ts holds each acceptance criterion against numbers; a Canvas render test shows a pen drawn and an unhoused card marked; the no-pen case asserts equality with autoPlace on a board of mixed statuses.

Docs: README-git-ticket-canvas.md and docs/README.md say a board with pens places cards by rule and points at git ticket canvas explain. Follow-on in git-ticket, not here: flip the applied flag and the 'not applied' wording in canvas explain once the canvas release that reads rules ships, and release it.

## Notes

**agent:claude/t3code-a6d0ff31** at 2026-09-20T02:07:05Z

Planned on 2026-09-20 with two decisions from the maintainer. Engine: a new pure resolve, per the design's 'placement is one function', not the archived trial's allocator, which ranks by specificity and contradicts first-match; the trial's removal is TKT-01M2Y91C31J34Q6DCSDN2QH6DD. Scope: schema 4's match record is split out as TKT-01M2Y91C17YTE0W0P3RBHTF50Y, so this ticket routes on requiredLabels, the rule git ticket canvas explain already resolves; the AC 'Schema 3 requiredLabels opens and reads as match.labels' moved with it. Facts that shaped the plan: nothing draws pens on the board today; autoPlace places on a fixed row pitch with no measured heights, and the resolver will too, so switching density leaves cards where they are.

**agent:claude/t3code-a6d0ff31** at 2026-09-20T02:12:53Z

Built. web/src/platform/canvas/resolve.ts is the one placement function; Canvas.tsx calls it from positions() and arrange(), draws a pen layer under the frames with each pen at the height its cards needed and an inbox marker, and CardView marks an automatic card the inbox caught as Unhoused. Packing order within a pen: status index, then the more urgent first, then ID; urgent first is a judgment, the design fixes only the keys. Frame previews do not carry routing, so the Canvas reads pens, ruleOrder and inbox from the snapshot rather than the previewed state. just check passes; 612 web tests including resolve.test.ts and canvas-pens.test.tsx. Two ACs rest on the CLI: explain's 'grows and says so' is the pen title on the board, and the CLI's explain still says routing is not applied until git-ticket flips the flag, which is the follow-on named in the plan.

**agent:claude/t3code-a6d0ff31** at 2026-09-20T02:15:42Z

Ran the desk canvas against a throwaway store with two pens and eight tickets and screenshotted it with Playwright: both pens drawn, Frontend grown to 560 for six cards with a dashed lower edge and 'grown to fit' on its title, cards packed draft row then ready row with urgent first, the docs ticket at the inbox dashed and labelled Unhoused. One defect found only by looking: inbox cards started at the inbox point, under the marker's title; they now inset by the lane gap as pens do. Canvas PR 16.

**agent:claude/t3code-a6d0ff31** at 2026-09-20T02:22:42Z

Terva could not review PR 16: every run failed in seconds with context_limit, because the action reads /pulls/16.diff and caps its context at 256 KB, and the rebuilt web/dist is 297 KB of a 347 KB diff. Read from the run log in the Forgejo UI; the API has no jobs endpoint on this version. web/dist is now -diff in .gitattributes for local diffs; Forgejo ignores it. Filed TKT-01M2Y9YXMRRAD5GP0953VY9AKC for the mechanism. This PR is for the maintainer's own review.

## Summary

resolveBoard in web/src/platform/canvas/resolve.ts places every unpinned card on a board with pens: first pen in ruleOrder whose requiredLabels it carries, else the inbox; a board with no pens goes to autoPlace unchanged. Pens drawn, overfull ones grown, unhoused cards marked. Merged in PR 16 as 8f63cf9, released as v0.5.0. Follow-ons filed: schema 4 match TKT-01M2Y91C17YTE0W0P3RBHTF50Y, trial engine removal TKT-01M2Y91C31J34Q6DCSDN2QH6DD, review context TKT-01M2Y9YXMRRAD5GP0953VY9AKC; git-ticket PR 213 flips applied.
