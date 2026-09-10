---
schema: 3
id: TKT-01M2440DW3PPHYBBC530T1M5TT
title: Improve canvas card and inspector readability
type: task
status: done
status_reason: Approved readability v1 implemented and verified. All acceptance and done criteria checked; docs/readability-v1.md records evidence. just check and 47 embedded browser tests passed.
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
  - ref: mockup:readability-v1
    path: docs/mockups/readability-v1.html
  - ref: doc:readability-v1
    path: docs/readability-v1.md
  - ref: test:readability-browser
    path: tests/browser/readability.spec.ts
  - ref: code:inspector-style
    path: web/src/ui/Inspector.css
  - ref: test:inspector-readability
    path: web/src/ui/inspector-readability.test.tsx
  - ref: test:card-readability
    path: web/src/ui/readability.test.tsx
claim: null
archive: null
created_at: 2026-09-09T22:18:25Z
updated_at: 2026-09-10T02:05:36Z
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

- [x] Completed and archived card titles remain readable without strikethrough; a quieter grid and consistent card hierarchy work in light and dark themes.
- [x] Status, blockers, overdue dates, and high priority have consistent positions and text cues; acceptance progress includes a visible AC completed/total count and is absent when no criteria exist.
- [x] Cards bound label display with a +N affordance, and keyboard users can access the full label set without relying on hover.
- [x] All, Selected, and None relationship modes work; Selected shows immediate dependency and parent/child relationships with understandable direction and type.
- [x] The inspector is resizable, wraps long titles, summarizes status/priority/ownership/blockers near the top, and collapses empty optional fields and older activity without hiding editing access.
- [x] Filtering and visual controls do not rearrange cards; inspector drafts, focus, stale-revision handling, and read-only behavior survive refresh.
- [x] Component and browser coverage verifies the approved layout, keyboard access, narrow viewports, and existing 120-card responsiveness with no per-motion inspector rerenders.

## Definition of done

- [x] Record the approved UI choices and verification evidence in the ticket.
- [x] Run just check and embedded browser checks; regenerate committed frontend assets through the existing build process.

## Implementation plan

User approved docs/mockups/readability-v1.html in this session. Preserve it unchanged as the approval artifact. Implement title-first 280 px cards, two-label disclosure, explicit state/priority/warnings/ownership and AC counts; use measured heights for edges and keep card controls out of canvas gestures. Update shared width and automatic row spacing to accommodate the hierarchy without writing existing manual positions. Add App-owned All/Selected/None view state defaulting to Selected, immediate relationship selection, dependency arrows toward prerequisites, parent arrows toward children, and a visible legend. Filtering and mode changes must not change coordinates. Implement inspector changes independently in Inspector.tsx/CSS: 400 px default, 320..560 resizing by pointer and keyboard, wrapping title, compact state summary, stable mounted editor disclosures and collapsed older activity. Preserve existing blur/Enter commit semantics and revision-owned drafts rather than adopting mockup-only wording about explicit save. Integrate and review against the existing uncommitted version-display work without overwriting it. Add focused component/browser coverage for themes, label keyboard access, relationships, resize, narrow viewport, drafts and saved positions. Explicitly set All in the 120-card performance fixture to retain its 39-edge workload. Run just check and embedded browser checks, regenerate dist, document evidence and limitations, then close only satisfied criteria.

## Notes

**agent:terva/mieli** at 2026-09-10T01:40:19Z

Prepared docs/mockups/readability-v1.html at the user's request for a representative mockup before implementation. Standalone synthetic examples only; no application changes. Proposed title-first cards, two visible labels plus keyboard +N disclosure, Selected relationships by default, and a 400 px inspector with compact state summary and collapsed optional fields/activity. Chromium checks passed for label disclosure via Enter, relationship visibility without moving cards, width control, 390 px inspector, and no script errors. Captured light/dark previews. Approval is still pending; ticket remains draft and implementation criteria remain unchecked. Treat v1 as a review artifact and supersede it with a new version if revised after presentation.

**agent:terva/mieli** at 2026-09-10T01:45:39Z

draft to ready: User approved readability-v1 mockup and requested implementation.

**agent:terva/mieli** at 2026-09-10T02:05:31Z

in-progress to done: Approved readability v1 implemented and verified. All acceptance and done criteria checked; docs/readability-v1.md records evidence. just check and 47 embedded browser tests passed.

## Summary

Implemented approved readability v1. Title-first 280 px cards have textual warnings, two-label +N disclosure, explicit AC counts and readable completed titles. Selected relationships are the default, with directional dependency/parent labels and All/None controls. Inspector defaults to 400 px, resizes with pointer/keyboard between 320 and 560 px, wraps titles and keeps collapsed editor subtrees mounted. Narrow screens allocate a full-width inspector row; Fit uses available canvas space. Existing manual coordinates and blur/Enter/revision-owned draft behavior remain intact. just check passed with 135 unit/component tests, 64 tooling tests, Go race/vet/format checks and strict store validation. Embedded browsers: 47 passed, 5 existing opt-in measurements skipped. The 120-card guard retained all 39 edges and zero inspector rerenders during pointer motion. Regenerated dist; no commit or deployment performed. docs/readability-v1.md records approved choices, limitations and verification provenance.
