---
schema: 3
id: TKT-01M26Y32BZHJFXFGRYZ37TWYFP
title: Reduce relationship clutter in the all-edges view
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
created_at: 2026-09-11T00:32:43Z
updated_at: 2026-09-11T17:15:18Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

The screenshot shows 30 cards with Relationships set to All. The right-side cluster becomes difficult to trace because many solid dependency curves and dashed parent curves converge through the same area, and each edge carries a text label. `Toolbar.tsx` currently offers only All, Selected, and None, while `Edges.tsx` renders a label and curve for every visible relationship.

Improve the all-edges view without removing access to any relationship. Candidate behaviors include showing edge labels on hover or focus instead of on every edge, highlighting one edge and its endpoints while dimming unrelated edges, routing or bundling crossings where possible, and using a stronger visual distinction for dependency versus parent edges. Keep keyboard and screen-reader access to the relationship meaning, and keep the existing Selected and None modes useful for focused work.

Use the screenshot's dense right-side cluster as a regression fixture. The board should remain readable at the fit-to-view scale with 30 cards and the current relationship mix.

## Acceptance criteria

- [x] The all-edges view remains usable at fit-to-view scale on a board with 30 cards and mixed dependency and parent relationships.
- [x] Users can identify a relationship's source, target, and kind without reading overlapping labels on neighboring edges.
- [x] The view provides a clear focus state for a hovered, keyboard-focused, or selected relationship and dims unrelated edges without hiding them permanently.
- [x] Dependency and parent relationships remain distinguishable in the edge rendering and through an accessible text or semantic equivalent.
- [x] Selected and None relationship modes continue to provide focused and hidden views without regressions.

## Implementation plan

Written after reading `Edges.tsx`, the pointer handling in `Canvas.tsx`, the edge CSS in `web/index.html`, and the specs that assert on `.relationship`.

What the clutter actually is. Every edge renders a `<text class="edge-label">` reading either `depends on` or `parent of`. That is 41 labels in the reference scene, each carrying one bit, and the dash pattern plus the arrow already carry that same bit. `Edges.tsx` has no hover or focus state at all; the only dimming is the search filter at `opacity: 0.12`.

The user's rulings: show a label only on the focused or hovered edge, reach relationship meaning through the card and inspector rather than making edges focusable, and give parent edges their own colour as well as the dash.

1. Hover without breaking the canvas. `#edges` sets `pointer-events: none` today. Give each edge a transparent hit path with a wide stroke and `pointer-events: stroke`, and keep the visible path inert. This is safe for panning: `canvasTarget` accepts any target inside `#scene`, an edge is inside `#scene`, and `pointerDown` finds no card and no frame, so it still starts a pan. Hover state lives inside `Edges` rather than in `Canvas`, so pointing at an edge cannot re-render the cards.

2. Emphasis and dimming. One rule decides both: an edge is emphasised when it is hovered, or when the selection holds one of its endpoints. Everything else dims to a value that still reads as a line, not to the filter's 0.12, because dimmed here means "not this one" rather than "filtered out". Nothing is hidden, so criterion 3 holds.

3. Labels. Render the `<text>` for an emphasised edge only. The `<title>` stays on every edge, so the screen-reader path is unchanged, and the inspector keeps listing dependencies and parent with navigation. That is criteria 2 and 4 together, with no new tab stops.

4. Kind. Add an `--edge-parent` colour for both themes, use it on the parent path, and add a second arrow marker in that colour, because a marker's fill does not inherit from its path. Update the `#hint` legend, which currently names solid against dashed and would otherwise describe a rendering that no longer exists.

5. Tests. Component tests for the emphasis rule and for label rendering, a browser test for hover emphasis and for dimming, and a check that `selected` and `none` still behave, which is criterion 5. The visual suite's counts do not move, because the same 41 edges still render.

6. The picture changes on purpose, so recapture the baseline and add a `baseline-history.json` entry saying why, which is the workflow TKT-01M26YG1 put in place. `just canvas-visual` is the gate that proves the new scene is the intended one.

## Notes

**agent:terva/mieli** at 2026-09-11T17:02:45Z

draft to ready: The user asked me to promote this and start it, which is the promotion. Its dependency, the dense-scene visual suite, is done.

**agent:terva/mieli** at 2026-09-11T17:15:14Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-24 The all-edges view remains usable at fit-to-view scale on a board with 30 cards and mixed dependency and parent relationships. — Recaptured the reference scene at 2048x1152 with all 30 cards and 41 mixed edges, and read the image rather than only the counts. Labels dropped from 41 to the 6 on the selected ticket, parent edges read as warm dashed against blue-grey dependencies, and the faded edges stay traceable at 0.28. Honest limit: the right-side cluster still crosses. This ticket reduced clutter by what edges paint, not by routing or bundling them, so tracing a specific edge through the cluster still relies on hovering…
- [x] task-25 Users can identify a relationship's source, target, and kind without reading overlapping labels on neighboring edges. — A label renders only on an emphasised edge, so neighbouring labels cannot overlap: there is at most the selection's set, and exactly one while hovering. Source and target stay readable from the arrow direction plus the emphasised curve, and every edge keeps a <title> naming both endpoints and the kind. Browser test asserts 0 labels with no selection, exactly `touching` labels after selecting the reference ticket, and exactly 1 while hovering a faded edge.
- [x] task-26 The view provides a clear focus state for a hovered, keyboard-focused, or selected relationship and dims unrelated edges without hiding them permanently. — One rule in Edges.tsx decides emphasis: a hovered edge wins outright, otherwise the selection's edges are emphasised. Unrelated edges drop to 0.28 opacity and keep their curve, marker and <title>, so nothing is hidden. Component test in readability.test.tsx covers all four states: no emphasis (3 edges at opacity 1, no labels), selection emphasis (2 emphasised, 1 faded at 0.28 retaining its title), hover winning over the selection on an edge the selection had faded, and pointerleave handing empha…
- [x] task-27 Dependency and parent relationships remain distinguishable in the edge rendering and through an accessible text or semantic equivalent. — Parent edges now carry --edge-parent (#c08f5e dark, #8a5a24 light) plus their own #arrowParent marker, since a marker's fill does not inherit from the referencing path, alongside the existing 5 5 dash. Dependency edges keep --edge and #arrow. The accessible equivalent is unchanged and unconditional: every edge keeps a <title> reading "<source> depends on <target>" or "<source> parent of <target>", emphasised or faded, and the inspector still lists dependencies and parent with navigation. The can…
- [x] task-28 Selected and None relationship modes continue to provide focused and hidden views without regressions. — Browser test 'selected and none modes still focus and hide' switches the live 30-card scene: Selected renders only the edges touching the selection, all of them emphasised with labels and none faded, so the mode keeps its focused meaning; None renders zero relationships and zero labels. The existing component test still asserts the same counts per mode (2 for one selection, 3 in All, 0 in None, 0 for an empty selection, 3 for two selected cards), unchanged by this work. Full browser suite 63 pas…

## Summary

The clutter was mostly one thing: every edge drew a text label reading `depends on` or `parent of`, so the reference board carried 41 labels of one bit each, and the dash pattern already said it. A label now renders only on an emphasised edge.

One rule in `Edges.tsx` decides emphasis. A hovered edge wins outright, otherwise the selection's edges are emphasised. Everything else drops to 0.28 opacity and keeps its curve, arrow and `<title>`, because the goal is to say which edge is which rather than to hide the rest. A filtered-out edge stays at 0.12, since excluded outranks not-this-one.

Parent edges carry `--edge-parent` and their own `#arrowParent` marker as well as the dash, because a marker's fill does not inherit from the path that references it. The canvas legend was updated, since it described solid against dashed only.

Hover needed pointer events on a layer that disables them, so each edge has a wide transparent hit path. The risk was that pressing an edge would stop starting a canvas pan. It does not, because `canvasTarget` accepts any target inside `#scene`, and a browser test now drags from a point on an edge and asserts the scene transform moved rather than trusting that reading.

Keyboard and screen-reader access is unchanged by design: every edge keeps its `<title>`, the inspector still lists dependencies and parent with navigation, and no edge became focusable, so the board gained no tab stops.

Tests: a component test covering all four emphasis states including hover winning over the selection and leaving handing it back, and three browser tests for label counts, hover on a real point, the pan, and the Selected and None modes. Browser suite 63 passed and 6 skipped, 466 component tests, 75 tooling tests, `just check` clean.

New baseline `79faddf4` with its reason recorded. The counts did not move, still 30 cards and 41 edges, because this changed what edges paint and not where anything sits.

What this did not do: routing or bundling. The right-side cluster still crosses, and tracing one edge through it relies on hovering, which does nothing for a reader looking at a screenshot. Filed TKT-01M28QE4Z761Y2KBVYDMV1NYVZ, which asks for a measured crossing count before anyone commits to a layout algorithm.
