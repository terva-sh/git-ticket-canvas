# Canvas readability, frames, and label-routing pens

Design recorded on 2026-09-09 from the organized-board screenshot and follow-up
placement discussion. This is proposed work, not a description of shipped
features. The linked implementation tickets remain draft. Existing architecture
and gesture guarantees are documented in [preact-canvas.md](preact-canvas.md).

## Purpose

Preserve the user's spatial arrangement while making ticket titles, blockers,
labels, and relationships easier to scan. Give incoming tickets a predictable
place to collect without requiring users to place every ticket themselves.

The screenshot shows several concrete problems: completed titles are crossed
out, the grid competes with card text, progress bars lack visible counts, and
many relationship lines share the same space. The inspector exposes a long
editing form when the immediate need is often to read a ticket's state.

## Agreed routing behavior

The user confirmed these rules:

- Match combinations of independent labels, not hierarchical label paths.
- A pen matches when a ticket has every label required by its rule. Additional
  ticket labels do not prevent a match.
- The matching rule requiring the most distinct labels wins.
- Automatic tickets follow label changes until the user places them manually.
- Persist manual ticket coordinates only. Automatic coordinates are derived
  in memory, not written back as card positions.
- Recalculate automatic placement at each accepted store update, including
  incoming tickets and label edits. Do not calculate layout during rendering,
  panning, zooming, filtering, or an active drag.

No new automatic/manual flag is needed if a saved card position already means
manual placement. Preserve all existing saved card positions as manual.

The remaining interaction details below are recommendations for the draft
scope. The promotion checklist identifies decisions to confirm before building.

## Readability improvements

### Cards and the board

- Remove title strikethrough for completed and archived tickets. Retain readable
  text, a status badge, and a subdued border rather than crossing out the title.
- Reduce grid contrast without removing scene alignment cues.
- Give cards a stable reading order: title, status and urgent conditions,
  labels, then secondary metadata. Keep the ID and ticket type subordinate.
- Give blockers, overdue dates, and high priority consistent positions rather
  than mixing them into an undifferentiated wrapping collection of labels.
  Use text as well as color to identify these conditions.
- Pair the acceptance progress bar with a visible count such as `AC 3/5`.
  Do not show an empty progress indicator when no criteria exist.
- Limit the default label row and expose the rest through `+N`. Keep the labels
  responsible for automatic routing visible when pens are available, and make
  the complete label set accessible without relying on hover alone.
- Add relationship visibility modes: All, Selected, and None. Selected mode
  emphasizes immediate dependencies and parent/child relationships for selected
  tickets. Make relationship type and arrow direction understandable.
- Filtering must not rearrange cards to fill gaps.

### Inspector

Make the inspector resizable and let long titles wrap. Put status, priority,
ownership, and blockers near the top in a compact summary. Collapse empty
optional fields and older activity while keeping editing discoverable.

Preserve unfinished text, focus, keyboard navigation, stale-revision handling,
and read-only behavior. A refresh must not submit a draft field or replace it
with accepted server text. Test both light and dark themes and a narrow viewport.

## Frames

A frame is a named, resizable rectangle behind cards. Start with rectangle
creation, title editing, moving, resizing, deletion, a small muted color palette,
and undo for those frame operations. Do not build a freehand drawing toolkit.

Persist frame IDs, titles, bounds, and appearance per board. A frame is canvas
metadata, not a ticket, parent, dependency, or label mutation. Drawing a frame
around cards or dragging a card across its boundary must not change ticket data.
Deleting a frame must not delete tickets or their saved positions.

Recommended first scope: frames are visual boundaries. Moving a frame moves its
boundary only, not the tickets inside it. Explicit membership, nested frames,
collapse, and moving a frame with its contents are deferred until their
selection and persistence behavior is agreed. The UI must make this distinction
clear rather than suggesting an unsupported group drag.

Frame controls must not intercept ordinary card selection, canvas pan, or
relationship gestures. Fit should account for intentional frame geometry.
Read-only mode allows viewing and navigation but no frame writes.

## Label-routing pens

A pen combines a frame with an arrival pin and a label rule. The pin marks the
origin of its automatic layout, not a location at which cards overlap.

Example rules:

| Required labels | Destination |
| --- | --- |
| `frontend` | Frontend |
| `frontend`, `bug` | Frontend bugs |
| `frontend`, `bug`, `urgent` | Urgent frontend bugs |

A ticket with all three labels goes to Urgent frontend bugs. Label order does
not affect matching and repeated labels must not increase specificity.

### Matching and explanations

Recommend explicit rule order as the tie-breaker for equally specific matches.
Warn about overlapping equal-specificity rules; never let file iteration order
choose a destination. Provide a preview of which rule wins and why.

Each automatic card should expose its winning pen and matching labels, for
example `Placed by Urgent frontend bugs; frontend + bug + urgent`. Manual cards
should expose that their saved placement overrides routing.

Unmatched automatic tickets collect around a visible Inbox pin. Rules and the
Inbox belong to a board, so a manual position on one board does not pin a ticket
on every board. Moving a ticket into a pen does not change its labels.

### Placement and update boundaries

At an accepted update boundary:

1. Preserve all manual positions and current pending manual-placement previews.
2. Match automatic tickets to pens, falling back to Inbox.
3. Assign spaced slots around each pin using deterministic ticket-ID ordering
   when reconstructing a board from scratch.
4. Avoid overlap with manual cards and other automatically placed cards. Account
   for card dimensions and leave room for pin controls and frame headers.
5. Publish one placement snapshot for the canvas to render.

Recommend retaining valid slots in memory between updates. An unrelated ticket
edit should not shuffle a pen, and a new arrival should use an available slot.
A fresh load may reconstruct a different arrangement after membership changes;
only manual coordinates promise an exact durable position.

Updates arriving during a drag wait until it completes or cancels. On completion,
apply the new manual placement before routing the remaining automatic cards.
Keep existing board-generation guards, captured-board saves, identity-owned
previews, and failure rollback. A stale response cannot unpin a just-moved card.

`Return to automatic placement` removes the saved position and reevaluates its
rule. A failed removal retains manual placement and reports the failure. Merely
selecting a ticket or starting and cancelling a drag must not save coordinates.

Pen edits and pin movement should preview affected automatic tickets before
applying a new arrangement. They must never relocate manual cards. Define an
explicit overflow policy before implementation; do not silently grow a pen over
neighboring work or stack arrivals on top of each other.

### Pen summaries

Recommend a header showing the name, required labels, and counts such as
`8 tickets · 2 blocked`. Counts need an explicit basis: automatically assigned
cards, spatially enclosed cards, and all rule-matching tickets are different sets.

A `new arrivals` count was discussed but is deferred. It needs a separate
seen/unseen definition and persistence policy; do not infer it from whether a
ticket has manual coordinates.

## Persistence and implementation boundaries

The current Go layout schema in `internal/layout/layout.go` stores cards only.
Extend it with versioned, deterministic frame and pen records, preserving sparse
card updates and small reviewable diffs under `.tickets/canvas/`. Loading a board
must not write derived coordinates. Define compatibility with existing boards
and protect newer records from silent loss through unsupported writers.

Keep ticket Markdown unchanged. Board geometry and routing rules are user-authored
board data; the accepted automatic placement snapshot is derived state.

Keep pure matching and placement logic in `web/src/platform/canvas`. Integrate
accepted-update calculation through the platform store and App rather than
recomputing it from `Canvas` rendering. Preserve the Preact/platform boundary and
the gesture ownership described in `preact-canvas.md`.

## Draft work and promotion checks

Four implementation tickets were filed in draft:

- [TKT-01M2440D (Improve canvas card and inspector readability)](../.tickets/draft/TKT-01M2440DW3PPHYBBC530T1M5TT.md).
- [TKT-01M24411 (Add persistent canvas grouping frames)](../.tickets/draft/TKT-01M24411DDC98WXKT2MY2FMHQN.md).
- [TKT-01M2441T (Route automatic tickets to label-matching canvas pens)](../.tickets/draft/TKT-01M2441T0PTXRFK6VC4FM1PET7.md). Depends on TKT-01M24411.
- [TKT-01M2442E (Display the running application version in the UI)](../.tickets/draft/TKT-01M2442EMBA06TTX5MAAF8SQSD.md). Independent of the canvas changes.

These links record the initial draft paths. Resolve the IDs with `git ticket`
after a ticket moves to another status directory.

The three canvas tickets have these promotion checks:

1. Readability improvements. Independent of frames and routing. Confirm the card
   hierarchy, label overflow, relationship default, and inspector layout using a
   representative mockup before promotion.
2. Frames. Independent of readability. Confirm visual-only movement and the
   scope of frame undo before promotion.
3. Label-routing pens. Depends on frames. First prove one pen, Inbox, manual
   override, and accepted-update routing, then add competing rules. Before
   promotion, confirm equal-specificity ordering, overflow, count membership,
   pen removal behavior, and the treatment of Arrange and ticket creation at a
   clicked canvas position. Those existing explicit placement operations must
   not silently erase manual intent or persist automatic coordinates.

The order above is a recommended review sequence, not an artificial dependency
between otherwise independent changes. Draft promotion belongs to the user.
Write each implementation plan after claiming its promoted ticket and inspecting
the then-current code, not while filing this design.

## Independent quality-of-life work

TKT-01M2442E covers displaying the running application's version in the UI.
This has no dependency on frames or routing.

Use the Go server's build identity rather than `package.json` or a hardcoded UI
release string. `version.go` already derives version, commit, Go version, and
modified state for the CLI; the canvas API currently has no version response.
Reuse those semantics, including honest `devel` and `unknown` fallbacks.

Recommend a compact version label with an accessible details view for commit
and modified state. Keep version details available in read-only mode without
exposing environment variables, credentials, or filesystem paths. Confirm the
placement of the label before implementation.

## Verification

- Card/component checks cover progress counts, label overflow, warning text,
  completed-title readability, and relationship modes.
- Browser checks cover the representative organized board, inspector resizing,
  draft preservation, light/dark contrast, and narrow-viewport controls.
- Frame tests cover round-trip persistence, undo, cancellation, board switching,
  read-only mode, failed saves, and unchanged ticket Markdown.
- Routing unit tests cover all-label matching, specificity, duplicate labels,
  ties, Inbox fallback, stable slots, collision avoidance, and label changes.
- Store and browser tests cover accepted-update recalculation, no recalculation
  during render or drag, manual precedence, unpin failure, reload behavior, and
  stale responses after a board switch or manual drop.
- Go tests cover layout schema compatibility and deterministic serialization.
- Version tests compare UI/API metadata with CLI semantics for release,
  development, modified, and unavailable metadata cases.
- Run `just check` and the embedded browser suite for implementation changes.
  Preserve the 120-card responsiveness test and zero inspector rerenders during
  pointer motion. Update embedded assets through the existing build process.

These are future verification requirements, not claims of tests already run for
unimplemented features.

## Record provenance

Written with terva 0.134.5-0.20260908184005-01e3a6719b46, commit `01e3a67`,
built 2026-09-08T18:49:46Z. Loaded extensions: index 0.8.2, obsidian 0.2.0,
and web 0.3.1. Session `20260909-215300-f584a1be`.
