---
schema: 3
id: TKT-01M26Y3D0BAX6KGND8PYXXR918
title: Add a compact card density mode for large boards
type: task
status: ready
status_reason: The user asked me to promote this and start it, which is the promotion. Its dependency, the dense-scene visual suite, is done.
priority: normal
due_on: null
labels:
  - idea
  - ui
  - canvas
  - readability
assignees: []
milestone: null
parent: TKT-01M26YEEBGPYAFDNF6TTM2JVD7
origin: null
dependencies:
  - TKT-01M26YG1VHJXCXXQPXPDBTSS47
blocks_on: none
references: []
claim:
  actor: agent:terva/mieli
  branch: main
  worktree: null
  commit: null
  session: bd5cdc0f-a012-474a-a5a2-1a984b5207fa
  claimed_at: 2026-09-11T17:29:20Z
  expires_at: null
archive: null
created_at: 2026-09-11T00:32:54Z
updated_at: 2026-09-11T17:33:10Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

The screenshot fits 30 cards on the canvas, but the cards become small while each one still shows the title, status, priority, blocker state, labels, ownership, acceptance progress, ticket ID, type, and placement mode. The full metadata is useful in the inspector, but it competes with the board-level task and relationship view.

Add a visible card density or detail setting for the canvas. A compact mode should keep the title, status, selection state, relationship target state, and enough label or blocker information to support scanning, while moving secondary metadata to the inspector or an expand/hover/focus view. Keep the setting independent from browser zoom and preserve the current full card presentation as an option.

Use the screenshot's 30-card fit-to-view board as a density regression fixture. Verify that compact cards remain distinguishable, readable, selectable, and compatible with relationship edges and the existing label disclosure control.

## Acceptance criteria

- [ ] The canvas exposes a visible density or detail control with full and compact presentations.
- [ ] Compact cards retain readable titles, status, selection and link-target states, and the metadata needed to identify blockers or labels during scanning.
- [ ] Secondary metadata remains available through the inspector or an explicit expand, hover, or focus interaction.
- [ ] The full presentation remains available and its current inspector and relationship behavior does not regress.
- [ ] A 30-card fit-to-view board remains distinguishable and usable in compact mode, including cards connected by dependency and parent edges.

## Implementation plan

Written after reading `geometry.ts`, `placement.ts`, `Edges.tsx`, `CardView.tsx`, the card CSS, and the view-state wiring in `App.tsx`. No code written yet.

The user's rulings: compact cards are narrower as well as shorter; compact keeps title, status pill, the blocker and overdue alert line, acceptance progress, and the first few label chips, with 3 to 5 as a floor; the setting is session-only `useState` in `App`, matching `relationships`, with nothing persisted.

Where 280 actually lives. `CARD_WIDTH = 280` in `geometry.ts` is not only the CSS width:

- `placement.ts` uses it as the search lattice pitch in `grid`, `dx = CARD_WIDTH + PLACEMENT_GAP`.
- `world(height)` bounds the scene at `SCENE_LIMIT - CARD_WIDTH`.
- `interior(routing, id, height)` fits a card inside a pen with `p.x + p.w - PLACEMENT_GAP - CARD_WIDTH`.
- `fitView` falls back to it per card, as `card.width ?? CARD_WIDTH`.
- `Edges.tsx` anchors every curve, decides vertical against horizontal routing, and places the ghost with it.
- `web/index.html` sets `--card-w: 280px` separately, so the number exists twice today.

`autoPlace` is the exception worth knowing: its status lanes use their own `LANE_W = 300` and `LANE_GAP = 22`, not `CARD_WIDTH`. A narrower card does not automatically tighten the lanes, so decide deliberately whether compact re-lanes the board.

1. Make the width a parameter, not a constant. Keep `CARD_WIDTH` as the full width and add `COMPACT_CARD_WIDTH`. Give every function above an optional width argument defaulting to `CARD_WIDTH`, so existing callers and the placement tests keep passing unchanged, and the diff stays readable. `PlacementInput` is the natural carrier for the placement side.

2. One source for the number. Have the canvas set `--card-w` inline on `#scene` from the TypeScript constant rather than leaving a literal in the stylesheet. If CSS and TypeScript disagree by even a pixel, every edge anchors off the card, which is the failure this arrangement prevents.

3. `App` holds `density`, the toolbar gets a control beside Relationships, and `Canvas` passes the active width to `Edges` and to placement.

4. Settle automatic placement before writing UI. Derived automatic positions are computed on accepted store updates, never during render. A density change is not a store update, so decide one of: re-derive on the density toggle, treating it like a store update; or leave automatic positions where they are, so compact simply leaves more space between cards. The second is cheaper and surprises nobody; the first is what "density mode" implies. Whichever you choose, manual positions must not move, which is the user's condition.

5. `CardView` renders the compact subset behind the same measurement contract. Heights are measured, so shorter cards need no new plumbing, but check the label disclosure still overlays rather than growing the card.

6. Tests and the gate. The structural test in `canvas-density.spec.ts` asserts `cardMetadataRows`, and compact is the change that moves it, so extend `SCENE` with the compact row set rather than loosening the assertion. Add a compact browser case at the 30-card scene for criterion 5. Expect a new `baseline-history.json` entry only if the captured scene itself changes; if the capture stays in full mode, the baseline holds and that is the evidence full mode did not regress.

Sequencing note. Steps 1 and 2 are a self-contained slice: pure modules parameterised, defaults preserved, no UI change and no visible behaviour. That is a good first commit and a good stopping point, because a half-threaded width is the one state of this work that is hard to reason about.

## Notes

**agent:terva/mieli** at 2026-09-11T17:23:29Z

draft to ready: The user asked me to promote this and start it, which is the promotion. Its dependency, the dense-scene visual suite, is done.

**agent:terva/mieli** at 2026-09-11T17:33:10Z

Step 1 of the plan is done and uncommitted: the pure modules take a card width, and every default preserves today's behaviour. No UI, no visible change.

`geometry.ts` gained `COMPACT_CARD_WIDTH = 180` beside `CARD_WIDTH = 280`. In `placement.ts`, `grid`, `world`, `interior`, `fitsPen` and `spill` each take a `width = CARD_WIDTH`, `PlacementInput` gained an optional `cardWidth`, and `allocatePlacement` threads it through every lattice, bound, pen interior and emitted rectangle. An invalid width returns `invalid-input` alongside the existing budget check.

Two things worth knowing before the next slice.

Read the width from the caller's `input`, not from `prepared.input`. `preparePlacement` rebuilds the input from the fields it knows, so a width set on it is silently dropped. The first run of the new test showed 280s where 180s belonged, which is how that surfaced.

A narrower card does not automatically fit more per pen, and my first test asserted that it would. At the default 632-wide test pen both widths give two columns, because the lattice index stops at `floor((428 - 24) / 204) = 1`. The test now widens the pen to 700, where compact gains a third column and the overflow count drops. That arithmetic is the thing to check when judging whether compact actually buys density on a real board, rather than assuming it does.

Still to do, in plan order: one source for the number, since `--card-w: 280px` in the stylesheet is still written independently of the constant; the `density` state and toolbar control; `CardView`'s compact subset; the `Edges.tsx` anchors, which still read the constant directly; and the decision about whether a density change re-derives automatic placement.

`just check` is clean and 468 frontend tests pass.
