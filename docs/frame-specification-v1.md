# Canvas frames v1

Status: approved membership and undo policies, specified for mockup preparation.
This document is not mockup approval or authorization to implement frames.

Tracking ticket: TKT-01M24411DDC98WXKT2MY2FMHQN (Add persistent canvas grouping frames).

## What this supersedes

This specification supersedes the visual-only frame movement recommendation,
explicit-membership deferral, and frame promotion check in
[Canvas readability, frames, and label-routing pens](canvas-organization-design.md).
That document remains unchanged as a historical record. Its readability and
label-routing proposals are not replaced by this specification.

The reconciled frame ticket and its approval notes are the source of these
requirements. The ticket stays in draft pending the mockup and user approval.
Write the implementation plan only after promotion, claim, and code inspection.

## Purpose and boundaries

A frame is a named rectangular boundary behind cards with explicit membership.
Moving a frame moves its members. Resizing changes only its boundary.

Provide creation, naming, a muted color palette, movement, resizing, deletion,
membership actions, and frame-only undo/redo. Frames, membership, and positions
are board metadata. No frame operation changes ticket Markdown, labels,
parent/child relationships, dependencies, or ticket existence.

Do not add nested frames, collapse, freehand drawing, or label routing in v1.
Geometric overlap is allowed but does not create nesting or shared membership.
A frame is not a pen and does not assign labels to cards.

## Initial capture and explicit membership

When the user completes frame creation, capture cards whose center points lie
inside the rectangle. Use board cards, including cards hidden by filters, rather
than only currently rendered cards. Capture does not move cards or convert
automatic placement into manual placement.

Each card belongs to at most one frame on a board. Initial capture excludes cards
already assigned to another frame, even when the new rectangle encloses them.

After capture, geometry no longer determines membership:

- Moving or resizing a frame does not add or remove members.
- Dragging a card into or out of a frame does not change its membership.
- Filtering cards does not change membership.
- Provide explicit Add to frame, Remove from frame, and Move to another frame
  actions. A transfer removes the old assignment and establishes the new one as
  one membership operation, without moving the card.
- A member may sit outside its frame and still moves with it.
- Deleting a frame removes its assignments but leaves cards and their positions
  unchanged. Undoing deletion restores the frame and assignments only when the
  undo operation has no conflict.

Selecting a frame highlights its members. Selecting a card identifies its frame
membership, including when it lies outside the frame. The mockup must explain
hidden membership without silently changing the user's filters.

## Operation behavior

| Operation | Frame effect | Card effect | History unit |
| --- | --- | --- | --- |
| Create | Add rectangle, title, and appearance | Capture eligible membership; no movement | One completed creation |
| Rename or recolor | Change the committed property | None | One committed edit |
| Move | Translate boundary | Translate every member by the same canvas displacement | One completed drag or committed keyboard move |
| Resize | Change boundary | No movement or membership change | One completed resize |
| Add, remove, or transfer members | Update explicit membership | No position or placement-ownership change | One committed membership edit |
| Delete | Remove frame and assignments | Preserve tickets and positions | One deletion |

A frame move includes members hidden by filters and members outside the boundary.
Nonmember cards never move as a side effect. All members use the same canvas
coordinate displacement, regardless of zoom or screen coordinates.

Moving a frame is an explicit manual-placement action for its members. Store the
resulting member positions as manual. Existing saved card coordinates remain
manual when loading older layouts.

Undo must restore placement ownership, not just coordinates. A member that was
manual before the move regains its previous saved position. A member that was
automatic regains automatic placement with no saved manual coordinate. This
requirement does not implement future pen routing. How current derived placement
and concurrent store updates are captured for safe restoration belongs in the
implementation plan; undo must not manufacture a stale manual position.

## Save, preview, and cancellation contract

A frame move saves the boundary and all affected card positions together as one
operation. A partial persisted result, such as a moved frame with unmoved members,
is not acceptable. Membership transfers likewise cannot leave two assignments.

During a gesture, previews belong to the initiating board and operation. Preserve
the existing gesture ownership and board-generation safeguards described in
[Preact canvas](preact-canvas.md). Incoming updates must not retarget an active
gesture or apply an old preview to another board.

Escape cancels an active edit without adding history. Cancellation and failed
saves remove the operation's preview and leave no partial grouped movement or
false persisted success. Restore the authoritative state rather than overwriting
a newer external change with an old preview baseline.

Failed saves add no history step. A failed undo or redo must not present the
operation as completed or consume the user's ability to retry an otherwise valid
operation. The API and persistence strategy for achieving this contract must be
chosen after code inspection, not inferred from this UI specification.

## Undo and redo

### Scope and lifetime

Frame history includes creation, deletion, movement, resizing, renaming,
recoloring, and membership edits. Each completed drag or committed edit is one
step, not one step per pointer event. Card movement belongs to this history only
when a frame operation caused it.

Ordinary card drags and ticket edits are not frame history entries. Frame undo
must not undo ticket text or unrelated canvas edits.

Keep a separate history for each board within the tab. Switching boards retains
the histories, but controls operate only on the active board. Reloading clears
history. Do not persist undo history in board files or share it across tabs.

### Conflict protection

Undo and redo are conditional operations, not unconditional restoration of old
snapshots. Check the state affected by the operation against later accepted edits.
Conflicting edits to affected frame state, member positions, or membership block
the operation with an explanation.

Do not:

- Overwrite newer card positions, frame edits, or membership assignments.
- Reverse only part of a grouped move.
- Apply the inverse displacement to a card's newer position.
- Treat an unrelated edit as a conflict solely because the board changed.

Apply the same protection to redo. The implementation must check conflicts at the
save boundary, not only when enabling an Undo button. A change arriving after a
local check must not evade protection.

A conflict is not a request to discard the user's later edit. Explain which
change prevents reversal. The precise presentation of blocked history and any
history-management controls remain mockup decisions; do not silently skip or
partially execute a blocked entry.

### Examples to demonstrate

1. Frame F contains A and B. Moving F by 100 canvas units moves F, A, and B
   together. Undo restores all three and their prior placement ownership in one
   step, provided no relevant change intervened.
2. After that move, the user drags A independently. Undo of the frame move is
   blocked. B and F do not move back alone, and A does not receive an inverse
   displacement.
3. After the move, A transfers to another frame. Undo cannot reclaim A's former
   membership or move it as though the transfer never happened.
4. Editing an unrelated ticket's description does not invalidate an otherwise
   applicable frame move undo. Frame undo does not reverse that description edit.
5. Deleting F leaves A and B where they are. Undo restores F and membership when
   valid, but cannot take A from a frame it joined after deletion.
6. An external edit arriving before an undo save receives the same conflict
   protection as a local card drag. No partial undo is persisted.

## Board persistence and compatibility

Persist stable frame IDs, titles, bounds, appearance, and explicit membership per
board with deterministic serialization. Store membership by stable ticket identity,
not by title, visible index, or geometric enclosure on reload.

Existing card-only boards must load without losing or relocating saved cards.
Loading frames, filtering, and editing membership must not write derived automatic
card coordinates. Frame movement is the explicit exception that creates manual
positions for members.

Keep the existing sparse card-update behavior and protect frame metadata from
silent loss by unsupported writers. The concrete schema version, representation,
validation, and compatibility strategy belong in the implementation plan for
`internal/layout/layout.go` and the board API.

Read-only mode permits viewing, selection, and navigation, but blocks frame,
membership, grouped-position, undo, and redo writes. Delayed responses and board
switches must not modify another board's state or history.

Ticket deletion and externally removed frames must never cause undo to recreate
ticket Markdown. Stale or missing identities must be handled without corrupting
membership or partially moving a group. Their detailed cleanup behavior must be
specified during implementation planning and tested against the conflict rules.

## Mockup requirements

The mockup should demonstrate the approved behavior, not introduce another undo
model. Include these states:

- Rectangle creation and a clear explanation of initial capture, including hidden
  cards and exclusion of cards already belonging to another frame.
- Frame selection, member highlighting, and a member outside its boundary.
- Add, remove, and transfer membership actions.
- Distinct movement and resize controls with the wording "Move frame and members"
  and "Resize boundary only", or equally explicit labels.
- A grouped move with hidden members accounted for and one Undo action.
- Undo blocked by a later card movement or membership change, with a reason.
- Frame deletion without card deletion or movement, and valid undo of deletion.
- Save pending, save failed, cancellation, redo, and read-only states.
- Keyboard access to creation, movement, resizing, membership, and history controls.

Frame controls must coexist with card selection, pan, zoom, and relationship
gestures. Fit includes frame geometry. Preserve the existing card and inspector
readability work rather than redesigning it as part of frames.

Exact shortcuts, control placement, boundary hit-testing details, and history
capacity are not asserted as approved here. Resolve them in the mockup or
implementation plan as appropriate. Present user-visible policy changes for
approval rather than silently extending this specification.

## Verification contract

The frame ticket's 13 acceptance criteria remain unchecked implementation work.
Use this coverage when planning Go, component, and embedded browser tests:

| Area | Required evidence |
| --- | --- |
| Capture and membership | Center-based capture, hidden cards, overlapping frames, no stealing, one assignment, explicit transfer, out-of-bounds members |
| Group movement | Equal displacement, unchanged nonmembers and ticket data, hidden members included, boundary-only resizing, deletion without movement |
| Persistence | Deterministic frame/membership round-trip, card-only compatibility, manual-state preservation, no automatic-coordinate writes on load or membership edits |
| Undo/redo | One step per completed edit, all approved operations, placement-ownership restoration, per-board histories, board-switch retention, reload clearing |
| Conflicts | Later local/external moves and membership changes, frame edits, deletion/restore conflicts, no partial reversal, unrelated changes still permit reversal |
| Save lifecycle | Escape cancellation, failed grouped save, failed undo/redo, delayed replies, concurrent updates at save time, no false persisted success |
| UI safeguards | Read-only writes blocked, keyboard operation, Fit, gesture coexistence, board isolation, existing 120-card responsiveness guard |

After implementation, run `just check` and embedded browser checks and regenerate
committed frontend assets through the existing build process. Writing this
specification does not constitute passing those implementation checks.

## Record provenance

Written from the user-approved movement, membership, and undo decisions in session
`20260910-013410-55c12f2e`, after reconciliation of the frame ticket. No application
code or historical design document was changed to produce this specification.

Author: Mieli through terva
`0.134.6-0.20260910010245-6f36fa1e7be7`, commit `6f36fa1`, built
`2026-09-10T01:05:08Z`. Loaded extensions: index `v0.8.2`, obsidian `v0.2.0`,
and web `v0.3.1`.
