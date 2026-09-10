# Frames v1 implementation

Implemented for TKT-01M24411DDC98WXKT2MY2FMHQN (Add persistent canvas grouping frames)
after the user approved [the interactive mockup](mockups/frames-v1.html) and
requested implementation against [the frame specification](frame-specification-v1.md).
Both approval artifacts remain unchanged. This record describes the implementation,
not a revision to those artifacts.

## User-facing behavior

The toolbar provides New frame, Undo frame, and Redo frame. New frame opens numeric
creation controls and enables rectangle drawing on empty canvas. Creation previews
capture using card centers across the complete board, including filtered cards,
and excludes tickets already assigned to a frame.

Frame titles drag the boundary and every explicit member together. Corner handles
resize only the boundary. The frame panel provides keyboard-usable numeric movement
and resize controls, title and color editing, deletion, and a member list with
filtered and missing identities identified. A frame's selected members receive an
outline even when they lie outside its boundary.

The ticket inspector exposes Add to frame, Remove from frame, and Move to another
frame. These change membership without changing card positions. Card drags never
recalculate membership. Deleting a frame removes its assignments but leaves tickets
and card positions alone. No operation edits ticket labels, prose, or relationships.

The frame panel conceals the ticket inspector without unmounting its editor nodes.
On narrow screens the frame panel occupies a full-width row below the canvas. Fit
includes frame widths, heights, and title space, and uses the available canvas area.
The application's existing filter behavior remains dimming rather than hiding cards;
filtered members still participate in capture and movement.

## Placement and history

`web/src/platform/canvas/frames.ts` owns pure capture, movement, resizing, membership,
forward/inverse operations, and conflict checks. `TicketStore.saveFrameLayout`
serializes frame transactions with ordinary writes but does not debounce history
steps together. `App` holds one `FrameHistory` per board above the keyed Canvas.
Switching boards retains history; reloading clears it.

A completed frame edit is one history step. History changes only after a successful
save, and failed undo/redo retains the entry for retry. Group movement stores manual
positions for all members, including formerly automatic cards. Undo restores absent
manual records as `null` changes, returning those cards to derived placement rather
than storing their former automatic coordinates.

Automatic lane placement now reserves a slot for each ticket even when it has a
manual position. The prior algorithm compacted the remaining automatic tickets
when another ticket became manual. Reserving slots prevents a grouped move from
relocating unrelated automatic cards, including across reloads. This can leave gaps
in automatic lanes and changes the initial derived positions of automatic cards
that follow manually placed tickets. It never rewrites saved manual coordinates.
Arrange still uses the same deterministic status/ID ordering.

Observed changes to relevant frames, member positions, membership, or ticket
existence block affected undo/redo entries. Unrelated records do not invalidate an
otherwise applicable operation. A blocked entry is not silently skipped and no
partial reversal is attempted. Controls and feedback explain the conflict.

Numeric transaction coordinates use the same two-decimal normalization as the
layout writer before history records their expected result. This prevents a saved
fractional coordinate from appearing to fail because its response was rounded.

## Layout schema and API

`internal/layout` now writes schema 2. Each board holds sparse manual `cards` and a
`frames` map. A frame contains `title`, `x`, `y`, `w`, `h`, `color`, and explicit
`members`. Frames and members serialize in stable sorted order. Empty frame maps
are returned as `{}`, not `null`.

Schema 1 boards load with empty frames and retain their card coordinates. Loading
does not migrate files or save derived coordinates. The next write emits schema 2,
which older schema-1 writers refuse rather than dropping the new metadata. Unknown
schema versions, unknown YAML fields, mismatched board names, and multiple YAML
documents fail closed. The live snapshot uses the same strict parser as disk loads.

Existing `PUT /api/layout` requests containing only `board` and sparse `cards`
remain supported and preserve frames. A null card removes its manual position, not
its membership. Frame transactions add sparse `frames` and an `expect` object:

```json
{
  "board": "default",
  "cards": {},
  "frames": {
    "frame-example": {
      "title": "Delivery",
      "x": 40,
      "y": 60,
      "w": 620,
      "h": 420,
      "color": "#759bcc",
      "members": []
    }
  },
  "expect": {
    "cards": {},
    "frames": { "frame-example": null }
  }
}
```

Every changed record requires its expected previous value; `null` means absent.
Extra read-set expectations are also checked. A grouped movement sends its frame
and all changed member positions in one transaction. Membership transfers update
both affected frame records together.

The writer reloads the board, checks preconditions, validates the resulting board
and referenced tickets, and replaces one file under its shared mutex. Stale
expectations return HTTP 409 with code `layout_conflict`, before proposal validation
can misreport them as a malformed edit. The client refreshes but never retries the
mutation automatically. Read-only mode blocks all frame and grouped-position writes.

Validation rejects nonfinite or out-of-range geometry, nonpositive dimensions,
invalid identities, duplicate assignments, and titles longer than 80 Unicode
characters or containing control characters. Colors are the three approved muted
values: `#759bcc`, `#b499be`, and `#89ad97`.

## Cancellation, board isolation, and limits

Canvas gestures freeze their starting positions. Escape, pointer cancellation,
lost capture, and board changes discard uncommitted gesture previews. Frame forms
retain dirty text through accepted metadata refreshes and save failures. A form
save checks the editing baseline rather than silently rebasing a dirty draft.

Once an HTTP save has been submitted, closing the panel or switching boards cannot
honestly promise to cancel a server-side commit. Pending feedback states that the
save continues. Its result updates the initiating board's history, never the newly
selected board's geometry or history. A rejected save removes its preview and does
not create a history entry. This replaces only the mockup's artificial cancellable
timer, not the approved cancellation behavior for uncommitted edits.

A ticket deletion cleans its position and membership on the named board. Other
boards, and external file deletions, can leave readable dangling memberships.
Missing members are listed in the frame panel. Remove missing memberships cleans
those assignments without recreating tickets. A nonnull edited frame must remove
missing members before it can save; unrelated frames remain editable. Undo cannot
restore membership to a deleted ticket.

Atomic conflict protection covers writes through this server's shared layout store.
API mutations also share a mutex so an API ticket deletion cannot race frame
identity validation. Another server process or an uncooperative external filesystem
writer does not take these locks and can race the final read/write interval. This
implementation does not claim a cross-process transaction with arbitrary editors.

No nested frames, collapse, freehand drawing, or label routing was added. The
label-routing pens ticket remains separate.

## Verification

Final verification in the combined working tree:

- `just check` passed: 194 unit/component tests, 64 tooling tests, Go race tests,
  vet, formatting, and strict ticket-store validation.
- `just browser-test-embedded` passed: 53 tests, with five opt-in measurement
  tests skipped. This includes six new frame regressions and the existing
  120-card performance guard with zero inspector rerenders during pointer motion.
- The new browser file passed an explicit strict TypeScript check.
- `git diff --check` passed. The approved readability mockup and historical
  canvas design have no changes.
- Frontend assets were rebuilt through `just web-build` and the final check.

Evidence is executable in these files:

| File | Coverage |
| --- | --- |
| `internal/layout/frames_test.go` | Schema compatibility, deterministic serialization, atomic preconditions, competing writes, null positions, membership validation |
| `internal/api/frames_test.go` | API conflicts, ticket identity checks, read-only writes, transfers, deletion cleanup, dangling memberships |
| `web/src/platform/canvas/frames.test.ts` | Capture, hidden/outside members, forward/inverse operations, normalization, null restoration, history conflicts, missing identities |
| `web/src/platform/tickets/store.test.ts` | Frame reconciliation, identity reuse, serialized writes, stale-response rejection, board generations, conflict refresh |
| `web/src/ui/frames-panel.test.tsx` | Keyboard controls, capture feedback, draft baselines, pending/error behavior, membership actions |
| `tests/browser/frames.spec.ts` | Full capture/move/resize/delete/undo flow, explicit membership, external conflict feedback, automatic nonmember stability, cancelled pointer move, delayed board-bound saves, editor retention, narrow layout, read-only and failure rollback |

No application install, commit, or push was performed. The user's existing
`.tickets/canvas/default.yml` was not edited or staged.

## Record provenance

Source baseline: `dacc3f4baaa378d3eed3131f7f6ba1efb1e246e2`, with this implementation
in the working tree. Session: `20260910-013410-55c12f2e`.

Author: Mieli through terva `0.134.6-0.20260910010245-6f36fa1e7be7`, commit
`6f36fa1`, built `2026-09-10T01:05:08Z`. Loaded extensions: index `v0.8.2`,
obsidian `v0.2.0`, and web `v0.3.1`.
