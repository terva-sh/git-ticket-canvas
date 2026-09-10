# Pen implementation plan v1

For TKT-01M2441T0PTXRFK6VC4FM1PET7 (Route automatic tickets to label-matching canvas pens).

The user authorized promotion, code inspection, and this plan before code changes.
The ticket is now in progress and claimed for that work. This document records the
implementation approach; no production code, tests, or generated assets changed
while preparing it. Stop here for review before implementation.

## Approved inputs

- [Pen policies](pen-specification-v1.md).
- [One-pen mockup](mockups/pens-v1.html), approved at SHA-256
  `cfd55f71a38b162ca0c8ce6c3123740af36f7e7f3a00ab057784c39887089a59`.
- [Competing-rule mockup](mockups/competing-pens-v1.html), approved at SHA-256
  `c69e00077b8a67dee55477d609491834f507315f6d5e59c2d3efcf10133a7e89`.
- [Frames v1 contract](frame-specification-v1.md).

These artifacts remain unchanged. The plan is not permission to expand their scope.
Keep ordinary-frame membership, routing destination, and manual placement independent.

## Findings from code inspection

| Current path | Mechanism and consequence |
| --- | --- |
| `internal/layout/layout.go` | Schema 2 stores sparse manual cards and frames. `Update` reloads before writing; a null card removes manual placement without changing membership. |
| `internal/layout/frames.go` | `Parse` rejects unknown fields and unsupported versions. `Transaction` checks card/frame preimages and atomically renames one board file. Extend this path rather than introduce a second pen file. |
| `internal/api/server.go` | `handleLayout` selects sparse updates or conditional frame transactions. `withStore` buffers request/response I/O outside the mutation lock and reconciles the live snapshot after writes. Keep those boundaries. |
| `internal/api/snapshot.go` | Captured board files use `layout.Parse`; board JSON is part of both scoped invalidations and complete-response ETags. Pens must enter this representation, not a separate unversioned response. |
| `web/src/platform/tickets/store.ts` | `TicketStore` serializes writes, invalidates reads on both sides, reconciles cards/frames by identity, and guards board generations. Every layout-bearing response path needs pen normalization. |
| `web/src/ui/Canvas.tsx` | `positions()` runs `autoPlace` during render and other operations. Gestures freeze positions, but calculation still occurs. Replacing `autoPlace` alone would violate the approved no-render-time-routing requirement. |
| `web/src/ui/App.tsx` | Live refresh defers publication during gestures. Patch/create/layout completions also call `publish`; route all accepted-state paths through the same placement publication boundary. Frame saves already use request identity and board-generation ownership. |
| `web/src/ui/canvas/useMeasurements.ts` | ResizeObserver supplies scene-space heights, but its revision also changes for viewport notifications. Placement must react to actual size changes, not every redraw or zoom. |
| `web/src/platform/canvas/frames.ts` | Group movement writes every member's coordinate. Its inverse writes null for formerly automatic cards, which is the correct basis for restoration. History tracks saved cards, frames, and ticket identities, not routing changes. |
| `geometry.ts`, `App.tsx`, `Toolbar.tsx` | `autoPlace` is status-lane layout and Arrange persists its result. Preserve that operation separately from pen routing; replace the misleading Arrange tooltip and strengthen the confirmation. |
| `tests/browser/refresh-support.ts` | Development placement instrumentation targets `geometry.autoPlace`. Update instrumentation to observe the new placement engine so zero-work checks cannot pass by measuring the old function. |

## 1. Extend authored board data and conditional writes

Use layout schema 3 with these authored fields:

- `pens`: ID-keyed records containing title, rectangle, arrival-pin coordinates,
  appearance, and required labels. Pens have no member list.
- `ruleOrder`: one explicit ordered list of pen IDs. Require each pen exactly once;
  reject duplicate, missing, and unknown entries. Map iteration never breaks ties.
- `inbox`: board-local arrival-pin coordinates. No delete operation.
- Existing `cards` and `frames`, with their current meaning and precision.

Add the pen types, validation, normalization, and deterministic rendering in a new
`internal/layout/pens.go`, with tests in `pens_test.go`. Quote YAML keys and strings
as existing frame rendering does. Validate finite geometry and positive area;
normalize duplicate required labels without changing case-sensitive label identity.
Do not silently discard labels because they disappeared from the current config.

Read schemas 1, 2, and 3. Normalize legacy boards to empty pens/order and a documented
fixed Inbox pin in memory. Do not write on load. Upgrade the file to schema 3 on its
next explicit mutation, preserving all manual cards and frame memberships. Older
schema-2 writers already refuse schema 3. Continue rejecting future schemas and
unknown fields rather than losing metadata. Cover disk and captured-snapshot parsing.

Extend the existing transaction request with a conditional routing configuration
change. Treat pens, explicit order, and Inbox as one authored configuration for
compare-and-swap: require its complete preimage when changing any of them. This
prevents two tabs from independently inserting/reordering pens against stale lists.
Keep sparse card writes and frame transactions compatible and ensure both preserve
routing fields when they reload and rewrite a board. A rejected edit writes nothing.

Use conditional card preimages for Return to automatic so a stale unpin cannot erase
a newer manual position. Null removes the existing card record only, not membership.
Preserve `layout_conflict` behavior: reload current state, report the conflict, never
automatically replay the user's edit.

Extend `layoutRequest`, TypeScript wire types, and `TicketStore` consistently. Handle
board load, board switch, layout mutation, frame mutation, ticket creation with an
optional layout, and deletion cleanup. Keep full-response ETag/scoped invalidation
coverage and unknown-schema protection. No new SSE protocol is necessary.

## 2. Build pure rule evaluation and placement snapshots

Add Preact-free modules under `web/src/platform/canvas`:

- `pens.ts`: distinct-label matching, specificity, explicit-order ties, candidate
  explanations, overlap relationships, and automatic-destination counts.
- `placement.ts`: stable slot allocation and a placement snapshot controller with
  explicit accepted-input and preview-input updates.

A routing result includes the winning pen or Inbox, matching requirements, missing
requirements, lower-specificity matches, and equal-specificity losers. Manual cards
can expose their potential winning rule but never count as automatic assignments.
Positive independent label conjunctions can overlap even without shared required
labels. Separate potential overlap from current decisive ties, manual matches, and
matches outranked by greater specificity. Count filtered cards and overflow.

Keep authored persistence separate from derived positions, assignment, overflow,
and explanation maps. Retain valid slots per board in memory; discard stale identities
and reconstruct deterministically from full ticket IDs on a fresh load. Maintain
separate caches for accepted layout and previews so Cancel never replaces accepted
slots with proposed ones.

Proposed allocation approach:

1. Reserve manual coordinates and identity-owned placement previews as obstacles.
   Include actual card dimensions, frame headers, and pen/Inbox controls. Ordinary
   frame interiors are not containment constraints.
2. Keep still-valid slots for unaffected automatic cards. Invalidate a slot when
   its destination, relevant geometry, dimensions, or collision constraints change.
3. For new or invalidated cards, scan deterministic interior slots ordered from the
   arrival pin, using `CARD_WIDTH`, measured heights, and explicit gaps. A card must
   fit fully inside to consume an interior slot.
4. After interior slots are exhausted, scan deterministic spill rows beyond the
   preferred area. Use one scene-wide occupancy index to avoid manual cards and
   other pens' automatic cards. Never resize a pen or fall back to Inbox because
   of capacity. Never use hidden/filtered state as free space.
5. Publish the resulting immutable position and routing maps together. Geometry
   changes may rearrange their affected automatic cards; unrelated cards retain
   valid positions. Fresh reconstruction uses deterministic pen order and ticket IDs.

Use a spatial bucket index to avoid rescanning every placed card for each candidate.
Do not copy the mockups' fixed fixture coordinates or limited slot loops. Tests must
cover oversized cards, overlapping pen rectangles, dense manual obstacles, and
coordinate bounds before the allocator reaches the UI.

## 3. Move placement out of render and preserve save ownership

Refactor Canvas to consume prepared automatic positions. Its render path may combine
those positions with frozen gesture deltas and manual previews, but must not run
matching or allocation. `fit`, focus, edges, and frame capture use the same snapshot.
Keep status-lane `autoPlace` only for explicit Arrange.

Trigger placement updates on accepted store publications, actual measured-size
changes, pen previews, and manual-preview lifecycle changes. Use cached routing
inputs to avoid reallocation for unrelated ticket text when dimensions are unchanged.
Batch real ResizeObserver size changes outside rendering; ignore identical sizes
and viewport-only revisions. Initial unmeasured cards use a conservative size until
measurement, with no saved automatic coordinates.

During any gesture, freeze the placement snapshot and defer accepted publications
and measurement-driven layout. On drop, install the new identity-owned manual preview
before releasing the busy gate or consuming deferred updates. On cancellation, apply
the deferred accepted state without saving coordinates. A save completion may clear
only the exact preview it owns. Old-board responses never replace the active board.

Generalize App's frame request gate into layout-operation ownership shared by frame,
pen, and unpin operations. Avoid independent booleans that allow concurrent conflicting
previews. Keep the store's serialized queue and generation/epoch checks. Pen preview
state captures board, generation, and authored preimages. A changed baseline invalidates
an unsubmitted preview instead of silently applying it to a newer layout.

Close/Escape cancels unsubmitted drafts only. Submitted saves continue with pending
feedback above the panel lifetime. Failure clears false success and returns to the
accepted layout; failed unpin leaves the manual position. Read-only state blocks all
mutation paths, including shortcuts and gestures. Board switches cancel unsubmitted
drafts, preserve captured-board submitted saves, and never show their previews on the
new board.

## 4. Add the production controls in two verified slices

First implement one pen, Inbox, and manual override alongside the existing frame UI:

- Add a distinct pen layer and pen panel, not frame conversion or rule attachment.
- Reuse form/geometry primitives from `FramesPanel.tsx`, not its membership behavior.
- Provide title, geometry, pin, and required-label editing with validation and explicit
  Preview/Apply/Cancel. Use existing schema labels as suggestions while preserving
  authored labels. Flag unanswered authoring choices before coding their behavior.
- Support pen/pin movement and pen resizing through pointer gestures and keyboard-
  usable numeric controls. A completed pen gesture produces a preview, not an implicit
  save. Selection, fit, hit testing, and panel exclusions include pens and Inbox.
- Add placement explanation and Return to automatic in the ticket inspector. Show
  membership independently, including outside-frame membership. Keep frame selection
  and pen-assignment highlighting distinct.
- Retain clicked-position creation as manual. Existing API creation without `card`
  remains automatic. Do not turn the toolbar's existing center-position creation into
  an unapproved positionless workflow.
- Keep Arrange's status-lane behavior, with explicit wording that all cards become
  manually placed and automatic routing is overridden. It is not bulk unpinning.

Verify the approved six-step Frontend/Inbox/frame/manual walkthrough in production
before expanding the UI to competing pens. Then add explicit rule-order controls,
overlap feedback, matching/losing explanations, and affected-card preview summaries
as demonstrated in the second approved mockup. Removal reevaluates remaining rules
then Inbox while preserving manual positions, labels, and frame memberships.

The mockups do not settle empty-rule authoring or the exact general label-entry form.
Do not invent a new catch-all rule policy. Bring any such user-visible decision back
with a concrete proposal before implementing it; this does not block backend and
routing-engine work on the approved nonempty rule cases.

## 5. Extend frame conflict protection without adding pen history

Preserve frame-only per-board tab-session history and its existing null-card inverse.
Undo of a grouped move that originally moved automatic members removes those manual
records and routes through current accepted rules. Label/rule changes while a member
is manual must not prevent that intended restoration merely because its future
routing changed. Pen edits never create an Undo frame entry.

Distinguish historical restoration from capturing an automatic position for a new
frame move or redo. A redo must not blindly write an old absolute coordinate after
an automatic member acquired a newer routing position. Add derived-position/routing
observations for affected automatic members to the history guard. Block that redo
with a reason rather than overwrite newer placement; retain existing saved-card,
frame, membership, identity-deletion, and change-then-change-back protection.

At submission, attach a fresh routing-input guard when a frame operation materializes
automatic positions. Check it against current authored routing and ticket inputs
under the server mutation boundary, alongside card/frame preimages. A concurrent
label/rule/layout change between capture and submission must yield a conflict rather
than save a stale automatic coordinate as manual. Keep submission guards separate from recorded frame
history values; refresh them when preparing an operation. Tests must distinguish
unrelated edits from changes affecting captured placement, including collision inputs.
The server need not run browser measurements or persist automatic coordinates.

## Verification and delivery sequence

1. Add red Go schema/transaction tests and pure routing/placement tests, then implement
   their units. Cover legacy read/no-write, next-write migration, unknown fields,
   malformed order, YAML-sensitive IDs, concurrent configuration edits, stale unpin,
   and preservation through every existing writer.
2. Extend store/client tests for all response normalization paths, identity reuse,
   equivalent 200/304 reads, validator invalidation, failures, and board generations.
3. Wire event-driven placement with Canvas and App tests. Assert zero routing/allocation
   calls from render, filtering, selection, pan, zoom, and unchanged refreshes. Update
   `tests/browser/refresh-support.ts` to count the new engine, not only `autoPlace`.
4. Implement and verify the one-pen production slice, including measurements, incoming
   tickets, label changes, filtered/overflow counts, manual placement, frame movement,
   undo/redo guards, read-only state, failed saves, and stale/captured-board responses.
5. Add competing-rule controls and tests for specificity, order, duplicate labels,
   potential/decisive overlaps, preview cancellation, removal fallback, and unpinning
   after reorder. Re-run the one-pen and frame regressions.
6. Extend `tests/browser/canvas-performance.spec.ts` with 120 automatic cards across
   competing pens, retaining the inspector-rerender guard. Include idle live-update,
   reconnect, and accepted-update-during-drag coverage from the existing suites.
7. Run focused Go tests with `-race`, unit/component tests, then `just check` and
   `just browser-test-embedded` after rebuilding assets. Preserve the separate-command
   parity gate; its HEAD-dependent checks belong after a separately authorized commit.
8. Write new implementation evidence, map every acceptance criterion to passing tests,
   and leave unmet criteria unchecked. Preserve approved documents and user layout.
   Commit/push/release require separate authorization; none is part of this plan task.

## Inspection boundary and provenance

Source baseline: `12601fa808e8eaf06308630e70a20669ea3f4260` on `main`.
This is a source-inspected plan, not implementation test evidence. The mockup checks
passed in the preceding review phase; production tests were not run for this plan.
Do not run `just check` merely to validate this document: it rebuilds generated assets.

Recorded by Mieli in session `20260910-013410-55c12f2e` using terva
`0.134.6-0.20260910010245-6f36fa1e7be7`, commit `6f36fa1`, built
`2026-09-10T01:05:08Z`. Extensions: index `v0.8.2`, obsidian `v0.2.0`, web `v0.3.1`.
