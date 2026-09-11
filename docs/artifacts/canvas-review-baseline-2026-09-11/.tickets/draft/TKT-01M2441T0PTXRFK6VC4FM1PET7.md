---
schema: 3
id: TKT-01M2441T0PTXRFK6VC4FM1PET7
title: Route automatic tickets to label-matching canvas pens
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - ui
  - canvas
  - labels
assignees: []
milestone: null
parent: null
origin: null
dependencies:
  - TKT-01M24411DDC98WXKT2MY2FMHQN
blocks_on: none
references:
  - ref: design:canvas-organization
    path: docs/canvas-organization-design.md
  - ref: code:geometry
    path: web/src/platform/canvas/geometry.ts
  - ref: code:ticket-store
    path: web/src/platform/tickets/store.ts
  - ref: code:app
    path: web/src/ui/App.tsx
  - ref: code:canvas
    path: web/src/ui/Canvas.tsx
  - ref: code:layout-store
    path: internal/layout/layout.go
  - ref: doc:gesture-ownership
    path: docs/preact-canvas.md
claim: null
archive: null
created_at: 2026-09-09T22:19:10Z
updated_at: 2026-09-09T22:19:10Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Add label-routing pens consisting of a frame, an arrival pin, and a rule requiring independent labels. Follow docs/canvas-organization-design.md. This depends on TKT-01M24411DDC98WXKT2MY2FMHQN (Add persistent canvas grouping frames).

### Confirmed behavior
All required labels must match; the matching rule with the most distinct required labels wins. Automatic tickets follow label changes until manually moved. Persist only manual ticket coordinates. Recalculate derived automatic placement on each accepted store update, including incoming tickets and label edits, never during rendering or an active drag. Existing saved positions remain manual.

### Scope
Provide an Inbox fallback, rule explanations, Return to automatic placement, stable in-memory slots, and previewed pen/rule edits. Persist pens and rules per board, not automatic coordinates. First validate one pen plus Inbox and manual override, then competing rules. Spatial movement must not edit ticket labels.

### Promotion check
Confirm equal-specificity tie-breaking, overflow behavior, count membership, pen removal, and the treatment of Arrange and creation at a clicked position before promotion. The design recommends explicit rule order for ties, with overlap warnings. New-arrival counts are deferred until seen/unseen semantics are defined. Write the implementation plan after claim and code inspection.

## Acceptance criteria

- [ ] Pen rules require all listed independent labels; additional ticket labels are allowed, duplicate requirements do not increase specificity, and the most-specific matching rule wins.
- [ ] Equally specific matches follow the approved deterministic tie-break policy, expose overlap feedback, and show a winning-rule explanation; unmatched automatic tickets use a visible board-local Inbox pin.
- [ ] Only explicit manual placements persist ticket coordinates; existing saved coordinates remain manual, while loading and recalculating automatic placement produce no card-position writes.
- [ ] Every accepted store update reevaluates automatic placement, including label edits and new tickets; rendering, filtering, pan, and zoom do not invoke layout calculation.
- [ ] Placement remains frozen during a drag; pending updates apply after completion or cancellation and respect the newly placed card, pending previews, board generations, stale-response guards, and save-failure rollback.
- [ ] Automatic cards use spaced, collision-aware slots around pins, accounting for card dimensions; valid in-memory slots remain stable across unrelated updates, and fresh loads reconstruct deterministically under the approved overflow policy.
- [ ] Return to automatic placement removes the saved position and reevaluates routing; failed removal retains manual state. Selection and cancelled gestures do not save coordinates.
- [ ] Pen/rule edits preview affected automatic tickets and never relocate manual cards; moving tickets across pen boundaries never mutates labels. Counts use the approved membership definition, and creation/Arrange/removal follow the approved manual-intent policy.
- [ ] Board persistence round-trips pins and rules without automatic coordinates or ticket Markdown changes; read-only mode blocks mutations and compatibility tests protect existing layouts.
- [ ] Unit, store, Go, and browser tests cover matching, specificity, ties, Inbox, stable slots, collisions, label changes, reloads, manual override, unpin failure, drag/update races, and board switches while preserving the 120-card responsiveness guard.

## Definition of done

- [ ] Record the remaining approved interaction policies and evidence for the one-pen/Inbox/manual-override slice before expanding to multiple rules.
- [ ] Run just check and embedded browser checks; regenerate committed frontend assets through the existing build process.
