# Readability v1

Implemented for TKT-01M2440DW3PPHYBBC530T1M5TT (Improve canvas card and inspector readability).
The user approved `docs/mockups/readability-v1.html` before implementation. That
review artifact remains unchanged. This document records the application behavior.

## Cards and relationships

Cards at full density are 280 px wide with the title first, followed by status and
priority, textual blocker/due warnings, labels, ownership, acceptance progress and
secondary ID/type/placement metadata. Completed and archived titles have no
strikethrough. Automatic cards keep dashed borders without reducing text opacity.
The grid has lower contrast in both themes.

Two labels remain visible at full density, three in compact. The `+N` button opens
the complete set without selecting, dragging or saving the card. Enter and Space
activate it; Escape closes it. Long labels wrap at full density and are cut with
an ellipsis in compact. The disclosure overlays the card instead of changing its
height. Acceptance progress includes `AC completed/total` and is absent with no
criteria.

Relationships default to Selected. No selection means no edges. Selected shows
immediate dependency and parent/child edges incident to any selected card. All
shows every relationship; None hides them. Dependency arrows point from a ticket
to its prerequisite. Dashed parent arrows point toward the child. A canvas legend
explains the directions. A live dependency-drag preview remains visible even in
None mode. The existing creation gesture still makes the drop target depend on
the handle's source; its tooltip now says so explicitly.

TKT-01M26Y32BZHJFXFGRYZ37TWYFP changed how edges carry their text. Every edge
used to draw a label reading `depends on` or `parent of`, which is 41 labels on
the reference board and one bit each, since the dash pattern already said it.
A label now appears only on an emphasised edge. An edge is emphasised when the
pointer is on it, and otherwise when the selection holds one of its endpoints,
with hover winning outright. Everything else drops to 0.28 opacity, which still
reads as a line: the point is to say which edge is which, not to hide the rest.
A filtered-out edge stays at 0.12, because excluded outranks not-this-one.

Parent edges also carry `--edge-parent`, a warm colour with its own arrow marker,
so kind survives at fit-to-view scale where a 5 px dash pattern does not. Each
edge keeps its `<title>`, so the screen-reader text is unchanged, and the
inspector still lists dependencies and parent with navigation. Edges are not
focusable: reaching a relationship by keyboard goes through the card and the
inspector rather than through 41 new tab stops.

Hovering needs pointer events, which `#edges` disables for the layer. Each edge
re-enables them on a wide transparent hit path. A press there still starts a
canvas pan, because `canvasTarget` accepts any target inside `#scene`, and a
browser test drags from a point on an edge and asserts the scene transform moved.

Filtering, label disclosure and relationship visibility do not change coordinates
or write board data. Existing manual positions stay intact. Automatic status lanes
use 340 px row spacing instead of 132 px to accommodate the taller hierarchy.
This changes derived automatic positions and explicit Arrange results, not saved
manual coordinates. Extremely long cards or densely placed manual cards can still
overlap; v1 does not introduce collision-aware layout or rearrange a user's board.

## Card density

TKT-01M26Y3D0BAX6KGND8PYXXR918 added a second card presentation. The toolbar
carries a `Cards` control beside `Relationships` with `Full` and `Compact`.
Density is session state in `App`, like the relationship mode: nothing persists
it, a reload returns to full, and it is independent of browser zoom.

A compact card is 180 px wide against 280, and it drops rows as well. It keeps
the title, the status pill, the blocker and overdue line, the labels and
acceptance progress. It drops the priority text, the assignee and claim rows, the
milestone, the frame membership line, and the `card-head` line carrying the ID,
the type and the Manual or Automatic marker. Dropping the ID is deliberate:
compact is for finding a card, and the inspector identifies the one you found.
Every dropped row is still in the inspector, which is unchanged at either density.

Labels go the other way, three chips in compact against two in full, because once
priority, ownership and the ID line are gone the labels carry the scanning load on
their own. The rest stay behind the same `+N` disclosure, which still overlays the
card rather than changing its height. Compact chips are capped at 72 px on one
line and cut with an ellipsis. Full mode breaks a long label anywhere instead,
which at that width turns `maintenance` into `maintenan` over `ce`. The whole
label stays in the chip's title attribute and in the disclosure.

Measured on the 30-card reference board, full against compact: rows per card 10 to
5, median height 226 to 201 px, shortest card 204 to 160 px, and total card area at
0.55 of full. Narrower alone would prove nothing, since a narrower card that wraps
its way back to the same height buys no density, so the browser test asserts that
no card grew and that the area ratio stays under 0.7. It asserts the direction
rather than these numbers because CI renders with different fonts.

`cardWidthFor` in `geometry.ts` is the only place that chooses between the two
widths. Canvas reads it once per render and feeds five consumers: `--card-w` on
`#scene`, the edge layer's anchors, `fitView`'s per-card width, the box width that
frame membership capture sees, and the midpoint `focus` centres on. The stylesheet
declares no `--card-w` of its own and no fallback, so the number cannot be
duplicated. Three of those consumers are not the CSS width and none would fail
loudly: a stale width would frame a compact board as if every card were 280 px,
capture frame members that do not overlap the frame, and centre focus off-card.

Changing density re-derives nothing. Automatic status lanes come from `autoPlace`,
which uses its own `LANE_W` rather than the card width, so every automatic card
stays where it is and compact only opens space between cards. Manual positions are
untouched, and nothing about a density change writes board data.

That a 180 px card sits in a 300 px lane is deliberate. TKT-01M28ZMK8YJDW9CHSSC8BGZWB5
(Size automatic status lanes for the active card density) measured it rather than
assuming either way, and closed as no change. On the 30-card reference board,
arranged, a compact-sized lane pitch cuts the horizontal span from 1790 px to
1190 px and moves the fit scale from 0.121 to 0.121. Both densities were
height-bound and not marginally: the arranged board was 8361 px tall against
1190 px wide, because `autoPlace` stacked a status into one column at a flat
340 px row pitch and the deepest lane holds 25 of the 30 cards. Narrowing lanes
therefore buys nothing a person can see, and `LANE_W` stays at 300 px for both
densities. Lane wrapping has since changed the shape those numbers describe, and
the conclusion survives it: see Lane depth below.

The row pitch is the one that would respond, which is the opposite of what the
ticket was filed on. The tallest card is 249 px at full and 220 px at compact
against that flat 340, and a pitch of the tallest card plus 20 raises the fit
scale to 0.150 at full and 0.168 at compact. Compact gains more because its cards
are shorter. Nothing implements that, and anything that does has to be checked
against cards overlapping their neighbours, since the pitch was raised from 132 px
to 340 px in the first place to fit the taller card hierarchy. Those two numbers
were measured on an unwrapped board and no longer describe this one, so
TKT-01M290E5VQE9CWSQF3WCG71806 (Size automatic row pitch for the active card
density) has to re-measure before it decides anything. A tighter pitch now buys
less: the board it would shorten is no longer the dimension under pressure.

### Lane depth

`autoPlace` wraps a status lane at six cards and starts another column to its
right. TKT-01M290N0GA1DBBRGR3HJJQVDY2 (Wrap a deep status lane into more than one
column) chose the cap, and `LANE_CAP` in `geometry.ts` carries the reasoning.

Measured on the 30-card reference board at the 2048x1152 reference viewport:

| board | span | aspect | fit |
| --- | --- | --- | --- |
| unwrapped, full | 1890 x 8409 | 0.22 | 0.120 |
| wrapped, full | 3178 x 1926 | 1.65 | 0.500 |
| wrapped, compact | 3078 x 1901 | 1.62 | 0.506 |

The cap is a count, not a measurement of a card, so a density change still
re-derives nothing. Six rows at the resulting scale is about one stage height,
which is where the number comes from.

Fill order is column-major: down to six, then right. A status reads top to
bottom the way it did before wrapping, and the sort by id keeps it deterministic.
Row-major produces a board that looks just as reasonable and orders the tickets
differently, so the choice is asserted rather than implied.

An empty lane still occupies one column. On this board that spends 1288 px on the
four empty lanes between `draft` and `done`, and it is what keeps a lane's x off
the question of which statuses happen to hold tickets. Skipping empty lanes would
move every lane right of a status the moment that status got its first ticket.

A lane's origin accumulates the widths of the lanes before it, so occupancy is
counted in a first pass. A lane's width is not known until every ticket has been
seen. Pinned tickets are counted in that pass and consume their slot in the
second, including across a column boundary, so pinning one card never reflows the
rest of its lane.

Two things measured differently from the estimate that chose the cap. The fit
budget is 1648x1023, not the window: `Canvas.viewport` reserves 400 px for an
inspector that is not open, and `fitView` gives up 40 px of height. And the
wrapped board lands on the knee rather than to one side of it, at 0.4997 by width
against 0.5000 by height, with compact tipping it to height. The suite asserts
that balance instead of which dimension binds, because 0.0003 is not a property
any test should hold to.

That balance also answers the question the cap left open. Dropping the empty
lanes was rejected while the board was height-bound by four to one, on the
grounds that width it freed was width nobody was waiting on. Width is now half of
what binds, so the argument no longer holds and dropping empty lanes is worth
re-measuring.

One board shape backs all of this, and this store puts 25 of its 30 tickets in
one status. A store spread across seven statuses is nearly square before wrapping
and could be made worse by a cap of six. Measure a second shape before treating
six as settled.

Lane wrapping and the pen placement path in `placement.ts` do not interact. Pens
allocate positions inside label-matching regions through `allocatePlacement` and
`PlacementSnapshots`, and nothing in that chain imports `autoPlace` or the lane
constants. `CARD_WIDTH` is the only symbol they share, and no UI module calls the
pen path in production. Two systems that both decide where an automatic card goes
will need a stated relationship on the day pens are switched on. That day is not
this one.

The gates for this are split. `readability.test.tsx` covers the row subset and the
chip counts at both densities. The dense-scene browser suite toggles density and
asserts the reference card's rows, unchanged card positions across the toggle and
back, every edge still anchored on a card edge, the height and area numbers above,
the disclosure opening without changing card height, and selection and link-target
driven as real gestures. The committed pixel baseline stays in full mode, so it
passes unchanged and is the evidence that full did not regress.

`canvas-arrange.spec.ts` gates the arranged board. It presses Arrange, then
asserts the column positions, the depth of each column against the cap, no card
overlapping another at either density, the span and aspect above, that the two
fit terms stay within 10% of each other, and that a density toggle sends no
request at all. It records the measured numbers as a test annotation, so a run
that disagrees says which one moved. `geometry.test.ts` holds the fill order and
the pinned slot reservation, which need no browser.

## Inspector

The inspector starts at 400 px. Drag its left edge to resize between 320 and
560 px. Keyboard users can focus the separator: Left widens, Right narrows,
Home sets 320 px, and End sets 560 px. Width is local UI state, not persisted.
Pointer resizing preserves the focused draft and does not rerender the inspector.
Fit, focus navigation and centered creation use the available area beside it.

The title wraps in an auto-sized textarea. The top summary shows status, priority,
assignment, claim, blockers and due date, including an overdue text cue. Metadata
editors sit behind an explicit disclosure. Labels remain visible. Empty optional
sections collapse with named add/edit controls. Populated notes/comments show their
latest entry, with older entries in a nested disclosure.

Native details elements retain their expansion state across refresh. Their editor
children remain mounted, preserving draft values and their original revisions.
The existing editing contract remains: text replacement saves on blur, title Enter
blurs, prose Enter inserts a newline, and Ctrl/Command+Enter adds a note/comment.
The mockup's illustrative explicit-save prose does not replace that contract.
Stale-revision handling, read-only controls and board-generation guards remain.

At viewport widths of 700 px or less, the inspector occupies a full-width grid row
below the canvas area. Its body scrolls while title and lifecycle controls remain
visible. Toolbar filters wrap. Fit uses the canvas space above the inspector.

## Verification

Run on the integrated working tree on 2026-09-10:

- `just check` passed: strict TypeScript, frontend build, 135 unit/component tests,
  64 tooling tests, Go formatting/vet/race tests and strict ticket-store validation.
- `just browser-test-embedded` passed: 47 tests. Five opt-in measurement tests were
  skipped by their existing environment gates.
- The 120-card responsiveness test explicitly selects All, preserving its 39-edge
  workload. It retains the 30-frame guard, zero inspector rerenders during pointer
  motion, p95 below 100 ms and maximum below 250 ms.
- Five readability browser tests cover light/dark styling, keyboard label access,
  relationship direction, unchanged saved files and card coordinates, pointer and
  keyboard resizing, active draft preservation during resize/SSE, Fit at maximum
  inspector width, and the 390 px narrow layout with reachable metadata editors.
- Existing stale-edit, refresh, read-only, cancellation, delayed-save, multi-drag,
  board-switch and lifecycle browser tests passed unchanged except for explicitly
  opening newly collapsed form sections and choosing All for edge-specific tests.
- `git diff --check` passed. `web/dist` was regenerated. No commit, install or
  release was performed; pre-existing version-display changes remain in the tree.

The inspector implementation from sub-agent `implement-inspector-port-829511` was
reviewed and applied to the main working tree. Host integration added the narrow
grid row and available-space geometry. The agent worktree was removed afterward.

## Record provenance

Recorded by Mieli in terva session `20260910-013410-55c12f2e`, using
`openai-codex/gpt-6-astra`. terva version
`0.134.6-0.20260910010245-6f36fa1e7be7`, commit `6f36fa1`, built
`2026-09-10T01:05:08Z`. Loaded extensions: index `v0.8.2`, obsidian `v0.2.0`,
web `v0.3.1`.
