---
schema: 3
id: TKT-01M2440DW3PPHYBBC530T1M5TT
title: Improve canvas card and inspector readability
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - ui
  - readability
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references:
  - ref: design:canvas-organization
    path: docs/canvas-organization-design.md
  - ref: code:card-view
    path: web/src/ui/canvas/CardView.tsx
  - ref: code:edges
    path: web/src/ui/canvas/Edges.tsx
  - ref: code:inspector
    path: web/src/ui/Inspector.tsx
  - ref: code:canvas-style
    path: web/index.html
  - ref: test:canvas-responsiveness
    path: tests/browser/canvas-performance.spec.ts
claim: null
archive: null
created_at: 2026-09-09T22:18:25Z
updated_at: 2026-09-09T22:18:25Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Make the organized canvas readable at a glance without disturbing user placement. The screenshot motivating docs/canvas-organization-design.md shows crossed-out completed titles, a competing grid, unlabeled progress bars, crowded relationships, and a long inspector form.

### Scope
Implement the proposed card hierarchy, quieter grid, textual warnings and acceptance counts, bounded label display, relationship visibility controls, and a resizable inspector with a compact state summary. Preserve existing editing and gesture guarantees. Routing-label emphasis belongs to the pens ticket when routing metadata exists; this ticket does not depend on pens.

### Promotion check
Before promotion, have the user approve a representative mockup covering card hierarchy, label overflow, the default relationship mode, and the inspector layout. This draft records proposed UI behavior, not a settled visual specification. Write an implementation plan after claim and code inspection.

## Acceptance criteria

- [ ] Completed and archived card titles remain readable without strikethrough; a quieter grid and consistent card hierarchy work in light and dark themes.
- [ ] Status, blockers, overdue dates, and high priority have consistent positions and text cues; acceptance progress includes a visible AC completed/total count and is absent when no criteria exist.
- [ ] Cards bound label display with a +N affordance, and keyboard users can access the full label set without relying on hover.
- [ ] All, Selected, and None relationship modes work; Selected shows immediate dependency and parent/child relationships with understandable direction and type.
- [ ] The inspector is resizable, wraps long titles, summarizes status/priority/ownership/blockers near the top, and collapses empty optional fields and older activity without hiding editing access.
- [ ] Filtering and visual controls do not rearrange cards; inspector drafts, focus, stale-revision handling, and read-only behavior survive refresh.
- [ ] Component and browser coverage verifies the approved layout, keyboard access, narrow viewports, and existing 120-card responsiveness with no per-motion inspector rerenders.

## Definition of done

- [ ] Record the approved UI choices and verification evidence in the ticket.
- [ ] Run just check and embedded browser checks; regenerate committed frontend assets through the existing build process.
