# Readability v1

Implemented for TKT-01M2440DW3PPHYBBC530T1M5TT (Improve canvas card and inspector readability).
The user approved `docs/mockups/readability-v1.html` before implementation. That
review artifact remains unchanged. This document records the application behavior.

## Cards and relationships

Cards are 280 px wide with the title first, followed by status and priority,
textual blocker/due warnings, labels, ownership, acceptance progress and secondary
ID/type/placement metadata. Completed and archived titles have no strikethrough.
Automatic cards keep dashed borders without reducing text opacity. The grid has
lower contrast in both themes.

Two labels remain visible. The `+N` button opens the complete set without selecting,
dragging or saving the card. Enter and Space activate it; Escape closes it. Long
labels wrap. The disclosure overlays the card instead of changing its height.
Acceptance progress includes `AC completed/total` and is absent with no criteria.

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
