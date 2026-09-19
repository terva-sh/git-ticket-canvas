---
schema: 3
id: TKT-01M26SQB4JWTW8FPSVHYZKFKCR
title: Show and author pens in the browser after the CLI
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - labels
  - ui
assignees: []
milestone: null
parent: TKT-01M2441T0PTXRFK6VC4FM1PET7
origin: null
dependencies:
  - TKT-01M26SPW8XM5Q3M73536W5X0F1
  - TKT-01M2ND1RMSJ1KAEZM7HZX5DEHR
blocks_on: none
references:
  - ref: spec:pens
    path: docs/pen-specification-v1.md
  - ref: spec:rule-authoring
    path: docs/pen-rule-authoring-addendum-v1.md
  - ref: proposal:activation-gate
    path: docs/pen-position-consumers-proposal-v1.md
claim: null
archive: null
created_at: 2026-09-10T23:16:24Z
updated_at: 2026-09-19T08:08:57Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
extensions: {}
---

## Description

The browser side of pens, after the CLI. Under the contract adopted on 2026-09-19 (docs/board-organization-design-v1.md, recorded on TKT-01M2441T0PTXRFK6VC4FM1PET7), the layout schema moves into git-ticket, `git ticket canvas` reads and writes rules, and TKT-01M2ND1RKK6S4GXZQKKPP6H87P (Place unpinned cards by rule) wires the resolver into placement, keeping status lanes for a board with no pens. That ticket is where automatic cards start following pens; nothing here switches that on.

What is left for the canvas is to show what the resolver decided and to let a person at a desk author rules without the CLI:

- A pen layer and the Inbox, drawn from the resolver's output, with the counts and the per-ticket explanation the pen specification describes: winning rule, rules it beat, missing fields, and whether a saved position overrides routing.
- Return to automatic in the inspector, which removes the saved position and reevaluates; a failed removal keeps the card manual and says so.
- Browser rule authoring over the `match` record with Preview, Apply, and Cancel, explicit rule-order controls, overlap feedback, and removal that reevaluates the remaining rules. A completed gesture is a preview, never an implicit save. The empty-rule refusal and label-entry rules from docs/pen-rule-authoring-addendum-v1.md apply to the `labels` field.
- Read-only canvases, which includes every served canvas today, render the layer, counts, and explanations with every authoring control disabled behind the existing badge. Layout writes are unattributed until TKT-01M2MED3BW4T8PF2C45V6RNSJQ settles them, so pen authoring stays a desk feature.

Pens are shared board data. Nobody gets a private pen; per-user state holds favorites and the last store only. Card density is per viewer and feeds the resolver's card width, so two people can see different automatic positions on one board; explanations are computed per viewer and stay truthful.

Promotion is a person's decision and needs the CLI write commands done first, because the browser and the CLI must author the same record and the CLI is the path that works where the canvas is read-only. Keep the approved specifications as records; write later decisions in new documents.

## Acceptance criteria

- [ ] The pen layer, Inbox, counts, and per-ticket explanations render from the resolver on every canvas, and a served read-only canvas shows them with every authoring control disabled
- [ ] Return to automatic removes the saved position and reevaluates routing; a failed removal keeps the card manual and reports it
- [ ] Browser rule authoring over the match record uses Preview, Apply, and Cancel with explicit rule order, overlap feedback, and removal that reevaluates remaining rules, and produces the same file the CLI writes
- [ ] A rule written by the CLI while a browser holds a preview is refused with layout_conflict on Apply and the preview is discarded with a visible reason
- [ ] End-to-end routing, save, frame history, and 120-card behavior are verified with a viewer that is not the author

## Notes

**agent:claude/t3code-a6d0ff31** at 2026-09-19T08:04:44Z

Review against the multi-user features, 2026-09-19, read-only, nothing promoted.

### What the served canvas changes for this ticket

`git-ticket-canvas-server` is read-only by default and nothing grants the writer role (`internal/grants/grants.go:22-34`). Automatic placement is computed in the browser and never written, so a served reader would see pen-routed positions, explanations, counts, and highlights for free; every authoring control here (pen panel, rules, Preview and Apply, pin gestures, Arrange) is a `PUT .../layout` and would be refused with 403. The spec already says "Read-only mode blocks pen and placement mutations" (docs/pen-specification-v1.md, gestures section); this ticket's second and fourth criteria should carry it and verify it on the served command, not only with `-read-only` on the desk one.

Layout writes carry no attribution: `handleLayout` (internal/api/server.go:634) has no actor and the board file has no author field. A pen is shared policy that moves everybody's automatic cards, so an unattributed pen edit is worse than an unattributed drag. Pen authoring on a served canvas waits on TKT-01M2MED3BW4T8PF2C45V6RNSJQ (Settle uncommitted canvas writes before writer roles), which today speaks only of ticket writes; a note there adds the layout case.

Pens are per board and shared. Per-user state keeps only favorites and the last store outside the repository (internal/state). Nobody gets private pens, and this ticket should say so.

One per-viewer input does change automatic placement: card density is a display choice, and `PlacementInput.cardWidth` (web/src/platform/canvas/placement.ts) takes it, so two people looking at one board can see different automatic positions and overflow. Explanations are computed per viewer, so they stay truthful, but "stable slots" is per viewer too.

Concurrency is already shaped for several writers: `snapshot.go:283` publishes a `layout:<board>` scope, `live.ts` treats it as relevant, `RoutingTransaction` checks `Expectations` and answers `layout_conflict` 409, and a file written by a CLI reaches the browser through the watcher like any other change. What is not shaped is many readers and one writer reflowing all of them at once; the spec permits it outside drags, and the 120-card trial should include a viewer that is not the author.

### The fork this ticket sits on

This ticket, its two siblings, and docs/pen-implementation-plan-v1.md build on the approved docs/pen-specification-v1.md: required-label conjunction, most-specific rule wins then explicit order, collision-aware slots around a pin, and authoring in the browser through Preview, Apply, Cancel. docs/board-organization-design-v1.md (2026-09-16, unapproved) and the drafts under TKT-01M2ND0S8N5Y8V0HQFRCBKMXE3 (Let an agent organize a board) describe the same records with a different contract: a schema 4 `match` record (labels, status, type, parent), first match in `ruleOrder` wins with no specificity, packing by status then priority then ID, `autoPlace` kept for boards with no pens, one `resolve` function shared by canvas and CLI, and authoring through `git ticket canvas` commands after `internal/layout` moves to git-ticket.

The multi-user features favour the second contract on one point that matters: in a served deployment the people reading a board cannot author it, so authoring by CLI or agent and consumption by every canvas is the only path that works everywhere. The two contracts also disagree on what an unorganized board looks like once pens are the default. The spec routes unmatched cards to the Inbox pin and says nothing about a board with no pens; the design keeps status lanes there. For served readers who cannot add a pen, lanes are the only acceptable answer, and TKT-01M2ND1RKK6S4GXZQKKPP6H87P (Place unpinned cards by rule) already states it.

Which contract this ticket targets, and whether it is resequenced behind the schema move and the CLI, is a decision for a person; recorded here so the next reader does not re-derive it.

**agent:claude/t3code-a6d0ff31** at 2026-09-19T08:06:40Z

Decision 2026-09-19: the board design is the contract. This ticket now depends on TKT-01M2ND1RMSJ1KAEZM7HZX5DEHR (Write board rules from the command line) and shrinks to the browser side: a pen layer and Inbox drawn from the resolver, explain and counts in the inspector, read-only verification on the served command, and browser rule authoring with Preview, Apply, Cancel over the match record. Default activation moves to TKT-01M2ND1RKK6S4GXZQKKPP6H87P. The title and description still describe the old scope; rewriting them is for whoever promotes it.

**agent:claude/t3code-a6d0ff31** at 2026-09-19T08:08:57Z

Terva review 28 on PR 13 (head 1a2c8f9a62a9d996828e98376818f956c7c944a5) found the note-only rewrite left this draft's title, description, and criteria stating the superseded scope. Accepted: the title, description, and acceptance criteria now state the adopted contract, and the previous criteria are replaced rather than appended. The dependency on TKT-01M26SPW8XM5Q3M73536W5X0F1 (the opt-in trial) is left for the person who decides whether that ticket is archived.
