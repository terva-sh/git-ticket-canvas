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
updated_at: 2026-09-20T22:11:10Z
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
