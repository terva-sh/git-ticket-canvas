---
schema: 3
id: TKT-01M24411DDC98WXKT2MY2FMHQN
title: Add persistent canvas grouping frames
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - ui
  - canvas
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references:
  - ref: design:canvas-organization
    path: docs/canvas-organization-design.md
  - ref: code:layout-store
    path: internal/layout/layout.go
  - ref: code:canvas
    path: web/src/ui/Canvas.tsx
  - ref: code:layout-types
    path: web/src/platform/tickets/types.ts
  - ref: doc:gesture-ownership
    path: docs/preact-canvas.md
  - ref: spec:frames-v1
    path: docs/frame-specification-v1.md
  - ref: mockup:frames-v1
    path: docs/mockups/frames-v1.html
  - ref: test:frames-v1-mockup
    path: docs/mockups/frames-v1-check.mjs
  - ref: doc:frames-v1-implementation
    path: docs/frames-v1-implementation.md
  - ref: code:frame-transactions
    path: internal/layout/frames.go
  - ref: code:frame-api
    path: internal/api/frames.go
  - ref: code:frame-history
    path: web/src/platform/canvas/frames.ts
  - ref: code:frame-panel
    path: web/src/ui/FramesPanel.tsx
  - ref: test:frames-browser
    path: tests/browser/frames.spec.ts
  - ref: test:frame-history
    path: web/src/platform/canvas/frames.test.ts
  - ref: test:frame-layout
    path: internal/layout/frames_test.go
  - ref: test:frame-api
    path: internal/api/frames_test.go
  - ref: doc:frames-v1-review-fixes
    path: docs/frames-v1-review-fixes.md
  - ref: test:mutation-network-isolation
    path: internal/api/mutation_io_test.go
claim: null
archive: null
created_at: 2026-09-09T22:18:45Z
updated_at: 2026-09-10T04:00:55Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Add named rectangular frames behind ticket cards with explicit membership and grouped movement. Frames and membership are board metadata and must not modify ticket Markdown. The approved membership and undo policy in this ticket supersedes the visual-only Frames proposal in docs/canvas-organization-design.md; retain that document as a historical record.

### Scope
Provide rectangle creation, title editing, move/resize/delete controls, a muted color palette, explicit membership actions, and frame-only undo/redo. Initial capture uses card centers, including filtered-out cards, without taking members from another frame. Membership remains explicit afterward. Moving a frame moves its boundary and all member cards together; resizing changes only its boundary. Persist frame identity, bounds, title, appearance, and membership per board with deterministic serialization and compatibility for existing card-only layouts. Leave label routing to its own ticket. Nested frames, collapse, and freehand drawing remain out of scope.

### Approved undo policy
Undo/redo covers frame creation, deletion, movement, resizing, renaming, recoloring, and membership edits. Each completed drag or committed edit is one step. History is separate per board, survives board switches within the tab, and clears on reload. Ordinary card drags and ticket edits stay outside frame history. A frame move saves the boundary and member positions together; cancellation or failure restores the whole operation. Moving members expresses manual placement; undo restores previous coordinates and manual/automatic placement state. Later conflicting edits block undo or redo with an explanation rather than overwriting newer state or partially reversing an operation.

### Promotion check
Movement, membership, and undo policies are approved. Keep this ticket in draft while preparing a superseding frame specification and mockup for user approval. Do not treat policy approval as implementation or mockup approval. Write the implementation plan after promotion, claim, and code inspection.

## Acceptance criteria

- [x] Users can create, name, recolor, move, resize, and delete rectangular frames behind cards using discoverable controls that remain usable by keyboard.
- [x] Completing frame creation captures cards whose center points lie inside the frame, including filtered-out cards, but never takes cards already assigned to another frame. Each card belongs to at most one frame; nested frames are out of scope.
- [x] Membership remains explicit after initial capture. Moving or resizing frames and dragging cards across boundaries do not recalculate it. Keyboard-usable Add to frame, Remove from frame, and Move to another frame actions update membership. The UI identifies membership even when a member is outside its frame.
- [x] Moving a frame translates its boundary and every member card, including filtered-out members, by the same canvas displacement. Resizing changes only the boundary; deleting a frame removes its membership assignments without moving cards. Frame operations never change ticket labels, relations, or Markdown, and never move nonmember cards.
- [x] A completed frame move saves the boundary and all affected card positions together as one operation and one undo step. Movement expresses manual placement for members; undo restores their previous coordinates and manual/automatic placement state. Existing saved card positions remain manual when loading older layouts.
- [x] Undo and redo cover frame creation, deletion, movement, resizing, renaming, recoloring, and membership edits. Each completed drag or committed edit adds one step. Ordinary card drags and ticket edits remain outside frame history; undoing frame deletion restores the frame and its membership when no conflict exists.
- [x] Frame history is separate per board, survives board switches within the same tab, and clears on reload. Undo and redo target only the active board's history.
- [x] Later conflicting edits to affected frame state, member positions, or membership block undo and redo with an explanation. Neither operation overwrites newer state, partially reverses a frame move, or applies an inverse displacement to newer positions. Unrelated edits do not invalidate an otherwise applicable operation.
- [x] Escape cancels an active frame edit without adding history. Cancelled operations and failed saves, including failed undo/redo saves, leave no false persisted state or partial grouped movement; failed saves add no history step.
- [x] Frame IDs, titles, bounds, appearance, and explicit membership round-trip per board with deterministic serialization. Existing card-only boards retain all saved ticket coordinates, and merely loading frames or changing membership does not save automatic card positions.
- [x] Frame controls coexist with card selection, pan, zoom, and dependency gestures; Fit includes frame geometry. The UI explains grouped movement and boundary-only resizing and highlights all members when selecting a frame.
- [x] Read-only mode prevents frame, membership, grouped-position, and undo/redo writes. Board switches or delayed saves cannot apply edits or history changes to the wrong board.
- [x] Go, component, and browser tests cover initial capture, overlapping frames, filtered and out-of-bounds members, explicit membership, grouped movement, persistence compatibility, manual/automatic restoration, undo/redo conflicts, cancellation, failed saves, reloads, and board switching. Tests verify unchanged ticket data and nonmember positions while preserving canvas responsiveness.

## Definition of done

- [x] Document approved capture, explicit membership, grouped movement, frame-only undo/redo, conflict blocking, and layout compatibility in a superseding frame specification without changing the historical design document.
- [x] Run just check and embedded browser checks; regenerate committed frontend assets through the existing build process.

## Implementation plan

### Pre-commit review fixes
Quote board names and card/frame record keys in the deterministic YAML renderer. Add table-driven regressions for null spellings and other YAML-sensitive accepted names, checking frame membership/card preservation and repeat writes.

Read bounded request bodies into memory before taking the shared API mutation lock. Keep request-local store opening, ticket identity validation, mutations, and snapshot reconciliation inside the lock. Buffer all responses, including store-open failures, and release the lock before network response writes. Preserve the existing 4 MiB body limit and read-only refusal before body reads. Add deterministic stalled-body and stalled-response regressions proving another board's mutation completes while network I/O is blocked; retain competing-transaction tests.

Run regressions before fixes to confirm failures, then Go race tests and just check plus embedded browser checks. Write a new review-fix evidence document without changing already presented specifications/mockups or implementation evidence. Verify .tickets/canvas/default.yml checksum remains unchanged. No staging, commit, push, or install.

## Notes

**agent:terva/mieli** at 2026-09-10T02:44:48Z

### Approved frame membership and undo policy
The user approved explicit membership after initial capture and blocking undo when later edits conflict. This decision supersedes the visual-only movement recommendation in the original description and acceptance criterion 4. Those original requirements must be reconciled before implementation; docs/canvas-organization-design.md remains an unchanged historical design record.

The agreed proposal uses card centers for initial enclosure capture, including filtered-out cards. Each card belongs to at most one frame; initial capture does not take cards from another frame. Membership stays explicit afterward. Moving/resizing frames or dragging cards across boundaries does not recalculate it. Provide Add to frame, Remove from frame, and Move to another frame actions. Deleting a frame removes membership without moving cards. Nested frames remain out of scope.

Moving a frame translates its boundary and all member cards, including filtered-out members, by the same canvas displacement. Resizing changes the boundary only. Save the frame move and affected positions together as one operation and one undo step; cancellation or failure restores the whole operation. Frame movement expresses manual placement. Undo restores previous placement ownership as well as coordinates, including manual/automatic state.

Undo and redo cover frame creation, deletion, movement, resizing, renaming, recoloring, and membership edits. Each completed drag or committed edit is one step. History is separate per board, survives board switches in the same tab, and clears on reload. Failed saves add no step; Escape cancels an active edit without adding one. Ordinary card drags and ticket edits remain outside frame history.

Undo must not overwrite affected positions or membership changed after the recorded operation. Later conflicting card drags or external changes block the operation with an explanation; no partial reversal or inverse movement applied to newer positions. Unrelated changes need not invalidate history. Apply the same conflict protection to redo.

Next: reconcile ticket criteria and write a superseding frame specification for the mockup. No implementation promotion or mockup approval is implied by this policy decision.

**agent:terva/mieli** at 2026-09-10T02:47:41Z

Reconciled the description, acceptance criteria, and definition of done with the approved membership and undo policy. Replaced the visual-only/no-card-movement requirement with explicit membership, grouped movement, atomic save/rollback, placement-state restoration, and conflict-safe per-board undo/redo. Added testable coverage for capture, hidden members, membership persistence, history lifetime, cancellation, read-only mode, and board isolation. All criteria remain unchecked; this is a requirements update, not implementation evidence. This completes the ticket-reconciliation step named in the prior note. The superseding specification and mockup remain pending. Status stays draft; historical documents and saved canvas coordinates are unchanged.

**agent:terva/mieli** at 2026-09-10T02:51:20Z

Wrote docs/frame-specification-v1.md and linked it as spec:frames-v1. It supersedes the historical visual-only frame scope without modifying docs/canvas-organization-design.md. The specification covers approved capture and explicit membership, grouped movement, per-board session undo/redo, conflict blocking, save/rollback, placement ownership, compatibility, mockup states, and test coverage. Exact UI controls and implementation mechanisms remain for mockup review and post-promotion planning. Ticket remains draft, criteria remain unchecked, and no application code or saved board positions changed. Record provenance is included in the specification.

**agent:terva/mieli** at 2026-09-10T03:01:50Z

Prepared docs/mockups/frames-v1.html as a standalone interactive approval artifact based on spec:frames-v1. It uses synthetic sample boards only, with no network or local storage. Controls demonstrate capture including hidden cards, exclusion of existing members, explicit transfers/removal, grouped pointer/numeric movement, boundary-only resizing, deletion/restoration, session per-board undo/redo, blocked conflicts, failed saves, Escape, read-only mode, Fit, and dark/light themes. Mockup limits are stated in its footer: production persistence, SSE and concurrency are not implemented; reload resets fixtures as well as history. node docs/mockups/frames-v1-check.mjs passed Chromium interaction checks, including real draw/move/resize gestures, placement-ownership undo, failed undo retry, unrelated card edits, redo conflicts, board switches during pending saves, and 390px document width. Screenshots generated for dark/light/mobile and conflict states. Application source, saved layout, specification, historical design and approved readability artifact remain untouched. Ticket stays draft, with implementation criteria unchecked, pending user mockup approval. Provenance: terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; index v0.8.2, obsidian v0.2.0, web v0.3.1; session 20260910-013410-55c12f2e.

**agent:terva/mieli** at 2026-09-10T03:07:34Z

draft to ready: User approved the interactive frames v1 mockup and explicitly requested implementation using the agreed specification.

**agent:terva/mieli** at 2026-09-10T03:39:21Z

Completion evidence is in docs/frames-v1-implementation.md, including the test-file coverage map and runtime provenance. All 13 acceptance criteria and both DoD items have supporting implementation and passing verification. Escape cancels uncommitted edits; a submitted HTTP request continues with explicit pending feedback, as recorded in the implementation plan. Shared server locks protect API writers, not arbitrary external filesystem writers or another server process. Automatic placement now reserves pinned tickets' lane slots so grouping automatic members does not shift nonmembers; existing saved manual coordinates remain unchanged. Final combined-tree checks passed after the last source change: just check and just browser-test-embedded. Integrated sub-agent worktrees were removed after review. Approved specification/mockup and historical design remain unchanged; user canvas data remains unedited and unstaged. No commit, push, or install. Provenance: terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; index v0.8.2, obsidian v0.2.0, web v0.3.1; session 20260910-013410-55c12f2e.

**agent:terva/mieli** at 2026-09-10T03:50:58Z

done to in-progress: User requested fixes and regression tests for pre-commit review findings: YAML-sensitive identifiers and network I/O inside the mutation lock.

**agent:terva/mieli** at 2026-09-10T04:00:39Z

Fixed both reproduced pre-commit findings at the user's request. New red/green regressions cover YAML-sensitive board/card/frame identifiers, live snapshots and repeat writes, stalled POST/PATCH/PUT bodies, stalled response headers/bodies, body size limits and read-only refusal before reads. Race-detector repetitions and final full checks passed. docs/frames-v1-review-fixes.md supplements the unchanged prior implementation record with fixes, test evidence and remaining connection-resource/cross-process limits. Final saved layout SHA-256 remains 852da1cea4bae70a3809aab5ddaa679ca09cabda477e828636fdf2b62cdf5eee. No layout edits or staging, and no commit/push/install. Runtime provenance is recorded in the new document.

## Summary

Implemented frames v1 and fixed both pre-commit review findings. Layout serialization quotes board names and card/frame keys; YAML-sensitive names retain positions and membership across saves, snapshots and reloads. API network reads and response writes now occur outside the shared mutation lock, while identity validation, mutations and reconciliation stay serialized. Regression tests failed before the fixes and pass afterward, including ten race-detector runs. Final just check passed with 194 unit/component tests, 64 tooling tests, Go race/vet/format and strict store checks. Embedded browser suite passed 53 tests with five opt-in skips. Evidence: docs/frames-v1-implementation.md and docs/frames-v1-review-fixes.md. Saved user layout checksum is unchanged; approved artifacts remain unchanged. No staging, commit, push or install.
