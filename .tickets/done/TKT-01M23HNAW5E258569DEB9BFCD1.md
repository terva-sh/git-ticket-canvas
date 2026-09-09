---
schema: 3
id: TKT-01M23HNAW5E258569DEB9BFCD1
title: Convert canvas rendering and gestures to Preact
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels: []
assignees: []
milestone: null
parent: TKT-01M23HK5J08WDF7Q2EA9SG6C9V
origin: null
dependencies:
  - TKT-01M23HMQ1PGCP8XSJ7PDJGWD3E
blocks_on: none
references:
  - ref: code:preact-app
    path: web/src/ui/App.tsx
  - ref: code:canvas
    path: web/src/ui/Canvas.tsx
  - ref: test:canvas-browser
    path: tests/browser/canvas.spec.ts
  - ref: test:canvas-cleanup
    path: web/src/ui/Canvas.test.tsx
  - ref: test:canvas-responsiveness
    path: tests/browser/canvas-performance.spec.ts
  - ref: doc:preact-canvas
    path: docs/preact-canvas.md
claim: null
archive: null
created_at: 2026-09-09T16:57:47Z
updated_at: 2026-09-09T18:47:07Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Move ticket cards, dependency/parent edges, and canvas composition into Preact. Use refs and animation frames where needed for transient pointer motion, rather than rerendering forms on every movement. Preserve geometry semantics and remove the legacy manual renderer once Preact owns the canvas.

## Acceptance criteria

- [x] Preact owns cards, edges, and canvas composition; the legacy renderer and duplicate global state are removed.
- [x] Pan, cursor-centered zoom, fit, multi-selection drag, pinning, and dependency direction pass browser tests.
- [x] Pointer capture, pointer cancellation, unmount cleanup, and measured card heights do not leave stuck gestures or misaligned edges.
- [x] Dragging has a defined save/failure policy; polling and pending saves cannot overwrite an active gesture or write it to another board.
- [x] Read-only mode cannot persist ticket or placement changes, and transient feedback does not imply a successful write.
- [x] Representative-board browser checks record responsiveness and confirm pointer movement does not rerender the inspector each frame.

## Implementation plan

Replace the global legacy adapter with a typed Preact App using TicketStore as its only persisted state owner. Delegate Canvas/cards/edges/grid/gesture implementation behind a fixed props/ref contract; integrate toolbar and existing forms locally. Canvas owns viewport, animation-frame motion and preview/gesture state, while App owns selection/filter/forms and captures board generation for async work. Keep layout batches board-keyed, retain previews until authoritative completion, cancel gestures on unmount/board changes and block read-only writes. Remove obsolete app.js, mount bridge and duplicate canvas state. Add browser race/cancellation/height tests and record representative-board frame timings plus inspector render counts. Run strict types, unit tests, Go/static checks and repeated embedded browser parity before closing.

## Notes

**agent:terva/mieli** at 2026-09-09T18:46:41Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-40 Preact owns cards, edges, and canvas composition; the legacy renderer and duplicate global state are removed. — Typed App mounts Canvas/cards/edges/forms. Removed web/app.js, forms mount bridge and unused global canvas state; strict TS no longer allows JS. JSX ownership tests pass.
- [x] task-41 Pan, cursor-centered zoom, fit, multi-selection drag, pinning, and dependency direction pass browser tests. — The original browser gesture baseline passes three repeats inside the 81/81 full run, including cursor-anchor zoom, fit, multi-drag, pin persistence and source-to-dependent direction.
- [x] task-42 Pointer capture, pointer cancellation, unmount cleanup, and measured card heights do not leave stuck gestures or misaligned edges. — Cancellation/lost-capture browser cases pass with rollback and subsequent usable dragging. Height changes update edge anchors. Canvas.test.tsx verifies unmount capture/frame/observer/listener cleanup and no write.
- [x] task-43 Dragging has a defined save/failure policy; polling and pending saves cannot overwrite an active gesture or write it to another board. — Frozen gesture positions and object-owned save previews protect active motion. Browser tests pass pending saves across board switches, overlapping save/drag, visibility refresh during drag and save rollback. Policy documented in docs/preact-canvas.md.
- [x] task-44 Read-only mode cannot persist ticket or placement changes, and transient feedback does not imply a successful write. — Read-only browser file snapshots remain unchanged. Added dependency-drag test confirms no mutation request or ghost edge; readonly canvas does not move/pin cards. Save-failure regression verifies persisted data and preview rollback.
- [x] task-45 Representative-board browser checks record responsiveness and confirm pointer movement does not rerender the inspector each frame. — 120-card/39-edge Chromium benchmark passed three repeats with 30 verified canvas motion frames each, zero inspector rerenders and two-frame sample p95 33.4–33.5 ms. Results and measurement limits recorded in docs/preact-canvas.md. Full browser suite passed 81/81; just check passed 71 tests.

## Summary

Replaced the legacy renderer/global adapter with typed Preact App and Canvas, memoized cards, SVG edges, measured heights and frame-coalesced gestures. Removed app.js, forms mount bridge and unused canvas-state factory. Gestures freeze positions, cancellation/unmount release resources without saving, completed drops retain their captured board, and failures clear only their own previews. Preserved read-only behavior and inspector draft/focus parity. just check passes 71 tests; 27 browser cases passed three repeats, 81 runs. A 120-card/39-edge benchmark rendered 30 motion frames per run with zero inspector rerenders and two-frame p95 33.4–33.5 ms. docs/preact-canvas.md records architecture, policy and results. Converted five historical references to deleted files into commit-qualified Git references so strict ledger validation remains clean. Final embedded-parity gate remains draft.
