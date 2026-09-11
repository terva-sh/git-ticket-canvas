---
schema: 3
id: TKT-01M26Y3D0BAX6KGND8PYXXR918
title: Add a compact card density mode for large boards
type: task
status: done
status_reason: null
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
claim: null
archive: null
created_at: 2026-09-11T00:32:54Z
updated_at: 2026-09-11T19:30:35Z
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

- [x] The canvas exposes a visible density or detail control with full and compact presentations.
- [x] Compact cards retain readable titles, status, selection and link-target states, and the metadata needed to identify blockers or labels during scanning.
- [x] Secondary metadata remains available through the inspector or an explicit expand, hover, or focus interaction.
- [x] The full presentation remains available and its current inspector and relationship behavior does not regress.
- [x] A 30-card fit-to-view board remains distinguishable and usable in compact mode, including cards connected by dependency and parent edges.

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

**agent:terva/mieli** at 2026-09-11T18:43:49Z

Step 2 is done and uncommitted: the card width has one source. `--card-w: 280px` is gone from `:root` in `web/index.html`, and `Canvas` sets `--card-w` on `#scene` inline from `CARD_WIDTH`. `.card` is the only consumer and every card renders inside `#scene`, so that placement covers all of them. Preact writes the custom property from the style object without help.

The evidence that it is a pure refactor is the pixel gate: `just canvas-visual` passes against the committed baseline unchanged, so the rendered board is byte-identical after the move.

I deliberately left no `var(--card-w, 280px)` fallback, because a fallback is a second copy of the number. That makes a missing variable a silent auto-width collapse rather than an error, and only the opt-in pixel gate would have caught it. So the always-on structural test now asserts the width: `SCENE.cardWidth = 280`, and the test reads `offsetWidth` on every `.card` and expects one distinct value.

Two measurements from getting that assertion right.

The widths in `cardGeometry` are viewport space, not scene space. They come from `getBoundingClientRect`, and `#scene` carries `scale(view.k)`, so at the reference viewport a 280px card reports 165. My first version of the assertion failed on that and I changed it to `offsetWidth`, which the transform does not touch. Anything else asserting a scene-space size from `geometry` has the same trap waiting.

The guard was then checked against its own failure: with the inline property removed and the bundle rebuilt, cards collapsed to 120 and 121 and the test failed naming the width. Without that run the assertion was only known to pass.

Still to do, in plan order: the `density` state and toolbar control; `CardView`'s compact subset; the `Edges.tsx` anchors, which still read `CARD_WIDTH` directly; and the open decision about whether a density change re-derives automatic placement.

`just check`, 468 frontend tests, 75 tooling tests, 63 browser tests and the pixel gate all pass.

**agent:terva/mieli** at 2026-09-11T18:56:08Z

Steps 3 and 4 are done and uncommitted, and step 4's open question is now decided. The user's ruling: a density change re-derives nothing, so automatic cards stay where they are and compact only opens space between them.

That ruling costs no code, which is worth knowing. `autoPlace` lanes off its own `LANE_W = 300` rather than `CARD_WIDTH`, so no density input reaches placement and nothing can move. The invariant is asserted where positions are observable, in the browser: toggle to compact, compare every card's `translate(x, y)` against what it was, toggle back, compare again.

What landed. `geometry.ts` gained `Density` and `cardWidthFor`, which is the one place that chooses between 280 and 180. `Edges` takes a `cardWidth` prop, and `curve`, the vertical-against-horizontal routing decision, the label x and the ghost path all read it. `Canvas` takes `density` and holds `activeWidth()`, reading `latest.current` rather than closing over a width, because density can change between a gesture starting and its callback running. That one function feeds five consumers: `--card-w` on `#scene`, the `Edges` prop, `fitView`'s per-card width, `captureFrame`'s box width and `focus`'s centring. `App` holds `density` as session `useState` beside `relationships`, and `Toolbar` renders `#cardDensity` as Full and Compact next to Relationships.

Three of those five were traps rather than tidiness. `fitView` falls back to `CARD_WIDTH` per card, so a compact board would have fitted as if every card were still 280 wide. `captureFrame` describes each card's box to frame membership capture, so a stale width would have captured cards that do not overlap the frame. `focus` centres on the card's midpoint. None of them is the CSS width, and none would have failed loudly.

Both new guards were checked against their own failure rather than only observed passing. Dropping the `cardWidth` prop from the `Edges` call and rebuilding put 32 anchors off a card in compact, each one exactly 100px out, which is 280 minus 180. Removing the `--card-w` declaration collapsed cards to 120 and 121.

The honest limit of this slice: compact narrows a card and does not yet trim what is on it, so a compact card holds every metadata row and wraps taller. It is narrower, not yet shorter. That is why `cardMetadataRows` in `canvas-scene.mjs` is unchanged and why acceptance criteria 2, 3 and 5 stay unticked. Criterion 4 is satisfied on the evidence below, but I left it open too, because the content slice is the one most likely to regress the full presentation and ticking it now would spend the box early.

New baseline `dc699217`, with a history entry. The only difference is the `Cards` select in the toolbar, 1963 pixels at a ratio of 0.01, and it still fits on the first toolbar row rather than pushing the counts onto a second one the way the Labels button did. I viewed the image rather than trusting the ratio.

Remaining: `CardView`'s compact subset, which is title, status pill, blocker and overdue alerts, AC progress and the first 3 to 5 label chips, and a check that the label disclosure still overlays rather than growing the card.

Gates: `just check` clean, 471 frontend tests, 75 tooling tests, 64 browser tests with 6 skipped, and the pixel gate green.

**agent:terva/mieli** at 2026-09-11T19:14:44Z

Step 5 is done and uncommitted. Compact is now shorter as well as narrower, which is the claim the whole ticket rests on.

`CardView` takes `density`. Compact keeps the title, the status pill, the blocker and overdue line, the labels and AC progress. It drops the priority text, the assignee and claim rows, the milestone, the frame membership line and the whole `card-head`, which is the id, the type and the Manual or Automatic marker. Dropping the id is deliberate: compact is for finding a card, and the inspector is where you identify the one you found.

Labels go the other way. Compact shows three chips where full shows two, because once priority, ownership and the id line are gone the labels carry the scanning load on their own. The rest stay behind the same disclosure rather than being dropped, which is the user's "first 3 to 5, does not need to be all".

Measured on the 30-card scene, full against compact: rows on a card 10 to 5, median height 226 to 201, shortest 204 to 160, total height 6850 to 5859, and total card area at 0.55 of full. The browser case asserts the direction rather than these numbers, because CI renders with other fonts: no card grew, and the area ratio is under 0.7.

Viewing the capture caught a defect every test had passed over. At 72px wide the chips inherited `overflow-wrap: anywhere` from full mode, so `maintenance` rendered as `maintenan` over `ce`, and `deployment` as `deploymen` over `t`. A chip that wraps inside itself is worse than a cut one and costs height as well. Compact chips are now one line each with an ellipsis, and the full text stays in the title attribute and in the disclosure. This is the second time on this ticket that looking at the image found something the assertions could not.

Criteria 2 through 5 are ticked, with the evidence spread across three places. The row subset and the chip counts are in `readability.test.tsx` at both densities. The rest is in the browser case: the reference card's rows at each density, no card growing, the area ratio, the label disclosure opening without changing card height, and selection and link-target driven as real gestures rather than read off the stylesheet. The link gesture releases over empty canvas and the test then checks the edge count is still 41, so the cancel wrote nothing. Criterion 5 also rests on looking at the compact 30-card board rather than on counts.

Full mode is untouched, and the pixel baseline passing unchanged is the evidence: every compact rule is scoped to `.card.compact`, and the capture stays in full mode, so `dc699217` still matches.

Gates: `just check` clean, 472 frontend tests, 75 tooling tests, 65 browser tests with 6 skipped, and the pixel gate green.

**agent:terva/mieli** at 2026-09-11T19:30:30Z

ready to in-progress: Passing through in-progress to reach done. The work landed across 8ff6e93, 160d535 and 2c67bf5, with the documentation still uncommitted.

**agent:terva/mieli** at 2026-09-11T19:30:32Z

Task worklog for this ticket, from the session task board.

### Generation 7 — 2026-09-11 — TKT-01M26Y3D0B compact cards, planned only

- [ ] task-29 The canvas exposes a visible density or detail control with full and compact presentations.
- [ ] task-30 Compact cards retain readable titles, status, selection and link-target states, and the metadata needed to identify blockers or labels during scanning.
- [ ] task-31 Secondary metadata remains available through the inspector or an explicit expand, hover, or focus interaction.
- [ ] task-32 The full presentation remains available and its current inspector and relationship behavior does not regress.
- [ ] task-33 A 30-card fit-to-view board remains distinguishable and usable in compact mode, including cards connected by dependency and parent edges.

## Summary

The canvas has a `Cards` control beside `Relationships`, with `Full` and `Compact`. Density is session state in `App`, like the relationship mode, and nothing persists it. Compact renders a card at 180 px against 280 and drops rows with it: priority, assignees, claim, milestone, frame membership and the id, type and placement line all go, while the title, status pill, blocker and overdue line, labels and acceptance progress stay. Labels move the other way, three chips against two, because they carry the scanning load once the other rows are gone. Everything dropped is still in the inspector.

Measured on the 30-card reference board, full against compact: rows per card 10 to 5, median height 226 to 201 px, shortest card 204 to 160 px, and total card area at 0.55 of full. The tests assert the direction rather than the numbers, since CI renders with other fonts.

`cardWidthFor` in `geometry.ts` is the only place that chooses between the two widths, and the stylesheet declares no `--card-w` of its own. Canvas reads the width once per render and feeds five consumers with it: the custom property on `#scene`, the edge anchors, `fitView`, frame membership capture and `focus`. Three of those are not the CSS width and none would have failed loudly.

A density change re-derives nothing, which was the user's ruling. `autoPlace` lanes off `LANE_W`, so automatic cards stay put and compact only opens space between them. Manual positions are untouched and no density change writes board data.

Landed across four commits: `8ff6e93` parameterised the pure modules, `160d535` gave the width one source and added the state and control, `2c67bf5` trimmed the card content, and the documentation commit records the behaviour in `docs/readability-v1.md`. One new baseline, `dc699217`, for the toolbar control alone.

Two defects were found by looking at the captured image rather than by any assertion: the animation race on the earlier baseline ticket, and compact label chips breaking mid-word into `maintenan` over `ce`. Both passed every test that existed at the time. The visual gate catches change, not ugliness, so a person still has to look.

Not done here, and worth its own ticket if it matters: compact does not re-lane the board, so a 180 px card still sits in a 300 px lane and the horizontal space that frees is not reclaimed.
