---
schema: 3
id: TKT-01M30BQ1X0MS52X2DDJ31FKY08
title: Author pen rules in the browser with Preview, Apply and Cancel
type: task
status: in-progress
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - ui
assignees: []
milestone: null
parent: TKT-01M2ND0S8N5Y8V0HQFRCBKMXE3
origin: null
dependencies:
  - TKT-01M30BQ1V3AGKTQX2ZHKS8NZN0
blocks_on: none
references: []
claim:
  actor: agent:claude/t3code-a6d0ff31
  branch: t3code/pen-authoring
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-a6d0ff31
  commit: 5163b4f8be18d0805a94b1924af646b0ee52d7f9
  session: null
  claimed_at: 2026-09-20T22:11:10Z
  expires_at: null
archive: null
created_at: 2026-09-20T21:31:50Z
updated_at: 2026-09-20T22:13:11Z
created_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
updated_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
extensions: {}
---

## Description

Browser rule authoring over the schema 4 match record, split from TKT-01M26SQB4JWTW8FPSVHYZKFKCR on 2026-09-20. A pen panel lists the rules in ruleOrder with explicit reorder controls; adding or editing a pen takes a title, a region, a colour and a match record of labels, status, type and parent, with the empty-rule refusal and label-entry rules of docs/pen-rule-authoring-addendum-v1.md applied to labels. A completed gesture is a preview, never a save: Preview shows where every automatic card would land, Apply writes the routing through RoutingTransaction with the routing expectation, and Cancel discards. A rule written by the CLI while a preview is held is refused with layout_conflict on Apply and the preview is discarded with a visible reason. Removing a pen reevaluates the remaining rules. The file the browser writes is the file git ticket canvas writes, byte for byte after a save. Pens are shared board data; nobody gets a private pen. Authoring stays a desk feature until layout writes are attributed under TKT-01M2MED3BW4T8PF2C45V6RNSJQ.

## Acceptance criteria

- [ ] A pen can be added, edited, reordered and removed in the browser over the match record, and every change is a preview until Apply
- [ ] Apply after a CLI write to the same board is refused with layout_conflict and the preview is discarded with a visible reason
- [ ] A board authored in the browser and then saved by git ticket canvas is byte-identical, and vice versa
- [ ] Every authoring control is disabled on a served read-only canvas

## Implementation plan

1. web/src/platform/canvas/pens.ts, pure: draft operations over Routing (addPen, updatePen, removePen, moveRule, setInbox, penIdFor(title)), validateRouting for the draft (nonempty match, geometry, colour, ID grammar, parent IDs), diffRouting(before, after, tickets, cards) listing automatic cards that change destination, pinned cards whose would-be destination changes, and per-pen counts before and after, and overlaps(routing, tickets) naming, per pen, the cards an earlier rule took. All from explain() in resolve.ts. 2. web/src/ui/PensPanel.tsx + Pens.css: an aside like FramePanel, opened from a Pens toolbar button. Rules listed in ruleOrder with earlier/later/edit/remove; a form for one pen with title, ID (new pens only, prefilled from the title), region, colour (the three the schema allows), pin, and the match record: a token field for labels per docs/pen-rule-authoring-addendum-v1.md (suggestions from config and tickets with their source, Use typed label, no splitting on commas or spaces, duplicate feedback, warning for unconfigured labels, arrow/Enter/Escape, named remove buttons), multi-selects for status and type from the schema, a ticket-ID entry for parent with a datalist of tickets. Inbox position editable. Preview, Apply, Cancel: Preview evaluates the exact draft and shows the diff; Apply is enabled only while the draft equals what was previewed; any edit after a preview disables Apply until the next Preview. 3. App.tsx: routingDraft state {base, draft, previewed}. While a preview is held the Canvas is given the previewed routing so the pen layer and the cards show where everything would land, and layoutBusy locks drags. Apply calls store.saveRoutingLayout with expect.routing = base; layout_conflict discards the preview with a visible reason; a live update that changes routing under a held draft is also reported and disables Apply. Read-only: the panel opens, every control disabled, a sentence saying so. 4. Tests: pens.test.ts (operations, validation, diff, overlaps), pens-panel.test.tsx (label field rules, preview/apply gating, read-only), App-level wiring test for conflict. 5. tests/browser/pens.spec.ts against the real server with the real CLI: global-setup installs github.com/terva-sh/git-ticket/cmd/git-ticket at the version go.mod names into the harness bin; the spec adds a pen in the browser, previews, applies, then runs git ticket canvas pen order (a no-op) and asserts the file bytes did not change; holds a preview while the CLI adds a pen and asserts layout_conflict discards the preview with the reason shown; and opens the -read-only command to see every control disabled. 6. Decision to record: the addendum's empty-rule message is reworded for the match record (labels, status, type or parent) because a rule with a status and no labels is valid under the 2026-09-19 design.
