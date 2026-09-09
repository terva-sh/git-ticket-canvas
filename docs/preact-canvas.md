# Preact canvas and gesture ownership

This guide supersedes the mixed-renderer architecture in `docs/preact-forms.md`.
It records TKT-01M23HNAW5E258569DEB9BFCD1 (Convert canvas rendering and gestures to Preact).

## Application structure

`web/src/main.ts` mounts `App` into the empty `#app` shell. Preact owns the toolbar,
canvas, cards, SVG edges, inspector, composer and feedback. The canvas element's
2D context still draws the grid; no code builds card or edge HTML manually.

- `ui/App.tsx` owns store integration, selection, filters, form composition,
  keyboard shortcuts, refresh and board generations. `TicketStore` remains the
  sole owner of accepted tickets and layout responses.
- `ui/Canvas.tsx` owns viewport, gesture snapshots, queued animation frames and
  pending placement previews. Its ref exposes fit, focus, arrange, compose-centre
  and cancel operations to App.
- `ui/canvas/CardView.tsx` renders memoized card metadata and positions.
- `ui/canvas/Edges.tsx` renders parent and dependency edges. A dragged source is
  the prerequisite; the drop target waits on it.
- `ui/canvas/useMeasurements.ts` observes card border-box heights and stage size.
  Edge anchors use scene-unit heights, not zoomed client rectangles.
- `ui/canvas/grid.ts` draws the grid from viewport values.

`web/app.js`, the separate forms mount bridge, and the unused global canvas-state
factory are removed. The TypeScript configuration no longer admits unchecked
JavaScript. `just check` uses the strict frontend build instead of the removed
`js-check` recipe. Historical ticket references to deleted files now name their
Git commit and path, so those references remain useful without failing strict
working-tree path validation. Earlier reports remain unchanged.

## Gesture and save policy

Only the primary pointer's left button starts a gesture. Canvas captures that
pointer and ignores other pointer IDs. Motion updates refs and schedules at most
one canvas render per animation frame. App receives busy notifications at gesture
boundaries, not on every movement. Inspector children keep their existing vnode
while Canvas renders its own motion frames.

A gesture freezes its starting positions and pinned styling. Polling and an older
save response cannot replace that snapshot. App defers new refresh requests while
a gesture is active; already-started reads are published after the gesture or a
subsequent refresh. Canvas also protects positions when another action publishes
new props during a gesture.

Pointer up applies the final pointer coordinates before committing the drop. A
completed writable drag rounds coordinates and sends a sparse layout update.
`LayoutWriter` debounces by captured board name and `TicketStore` serializes writes.
Preview objects remain until completion. Each completion may clear only the exact
objects it created, so it cannot erase a newer drag's preview.

A failed save clears its preview and reports the board name. Accepted layout stays
unchanged. Completed drops may finish after a board switch, but always write their
captured board. The new board refreshes after a pending old-board write completes.
Failure feedback still appears if that old-board save fails.

Pointer cancellation, lost capture and window blur abort an active gesture without
saving it. A board switch cancels the gesture and remounts Canvas with a new
key. Unmount releases capture, cancels animation frames, disconnects observers and
removes event listeners. A completed drop already queued for persistence is not
revoked by navigation or unmount.

Read-only mode permits selection and viewport navigation but does not move or pin
cards, create dependency writes, or persist layout changes. The existing failure
regression checks both the rendered position and the server's unchanged layout.

## Verification and responsiveness

On 2026-09-09:

- `just check` passed 71 unit/component/boundary tests, strict TypeScript, Go race
  tests, vet, formatting and strict ticket validation.
- `just browser-test --repeat-each=3` passed 81 runs across 27 cases.
- New browser checks cover cancellation/lost capture, board-switch cancellation,
  saves across board switches, overlapping save/drag activity, refresh during a
  gesture, read-only links and card-height edge updates.
- The unmount component test verifies capture release, frame cancellation,
  observer disconnection and event-listener removal without a write.
- `npm audit` reported zero vulnerabilities. `git diff --check` passed.

The representative board has 120 cards and 39 dependency edges. Chromium ran at
1440 by 1000 with two Playwright workers. Each sample dispatches a pointer movement
and waits two animation frames, so the numbers include display scheduling rather
than measuring JavaScript work alone. Each run verified 30 actual canvas frames
and unchanged inspector render counts, 4 before and 4 after.

| Run | Samples | p95 | Maximum | Inspector rerenders |
| --- | ---: | ---: | ---: | ---: |
| 1 | 30 | 33.5 ms | 33.5 ms | 0 |
| 2 | 30 | 33.4 ms | 33.4 ms | 0 |
| 3 | 30 | 33.4 ms | 33.5 ms | 0 |

`tests/browser/canvas-performance.spec.ts` attaches the measurements as
`canvas-responsiveness.json`. Use a JSON or HTML reporter to retain attachments.
The test requires p95 below 100 ms and maximum below 250 ms; those generous limits
detect stalls without treating a particular display cadence as a performance SLA.

Recorded with terva 0.134.5-0.20260908184005-01e3a6719b46, commit `01e3a67`,
built 2026-09-08T18:49:46Z. Loaded extensions were index 0.8.2, obsidian 0.2.0
and web 0.3.1. The final embedded-parity gate remains a separate draft ticket.
