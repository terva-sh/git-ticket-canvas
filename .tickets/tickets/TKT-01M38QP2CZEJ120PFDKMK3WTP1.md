---
schema: 3
id: TKT-01M38QP2CZEJ120PFDKMK3WTP1
title: Pinch to zoom and pan with two fingers on the board
type: task
status: review
status_reason: null
priority: normal
due_on: null
labels:
  - touch
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies:
  - TKT-01M38QP27PJBQQDFK8RNBATJE2
blocks_on: none
references: []
claim:
  actor: agent:claude/t3code
  branch: t3code/pinch-two-finger
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-fd003818
  commit: 5cb0e0fab340c0f19925aa340c4290f5114f5486
  session: null
  claimed_at: 2026-09-24T04:20:07Z
  expires_at: null
archive: null
created_at: 2026-09-24T03:34:56Z
updated_at: 2026-09-24T04:55:03Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

`Canvas.tsx` tracks one pointer: `pointerMove` and `pointerUp` return unless `event.isPrimary`, and zoom comes only from `wheel` and the toolbar. `#stage` sets no `touch-action`, so the browser can take over a touch drag and send `pointercancel` partway through.

Track the active pointers. One finger behaves as the mouse does now. When a second finger lands, whatever the first one started is cancelled without saving and the gesture becomes a pinch: the distance between the fingers sets the zoom, anchored at their midpoint, and the midpoint's travel pans. Lifting back to one finger pans; it does not resume a card drag. Pinch and wheel both go through `zoomAt`.

See `docs/mobile-design-v1.md`, "Gestures, for every layout".

## Acceptance criteria

- [ ] #stage sets touch-action: none, and the header, inspector and list still scroll natively
- [x] A second finger landing during a card, link or frame drag cancels it without saving, and the card returns
- [x] Lifting to one finger after a pinch pans rather than resuming a drag
- [x] Mouse and wheel behaviour on a desk is unchanged, and the existing gesture tests pass
- [x] Each of the above is a browser test on the emulated tablet
- [x] Two fingers zoom about their midpoint and pan with it, sharing zoomAt's limits and anchoring

## Implementation plan

### What is already true

`#stage` already sets `touch-action: none`, as an inline style in `Canvas.tsx` (`style={{ touchAction: 'none' }}`), not in a stylesheet. The design doc and criterion 1 were written from a grep of the CSS alone and said otherwise. Criterion 1 still needs its second half checked: the inspector sits inside `#stage` and must still scroll by touch. It should, because the effective touch action is only intersected up to the nearest scroll container, and the inspector is one. The browser test will prove it rather than this plan assuming it.

### Geometry (web/src/platform/canvas/geometry.ts)

- `clampZoom(k)`: the MIN_ZOOM and MAX_ZOOM clamp, used by `zoomTo`, `zoomAt` and the new function, so none of the three can reach a scale the others cannot.
- `pinchView(view, from, to, origin)`: the scene point under the fingers' starting midpoint stays under their current midpoint, and the magnification scales by the ratio of the finger distances. It always works from the view and points at the start of the pinch, never frame to frame, so rounding does not build up over a long pinch. It is pure, so it gets a table test beside `zoomAt`'s.

It does not go through `zoomAt` itself as criterion 2 said, because `zoomAt` takes a wheel delta and turns it into a factor along the wheel's exponential curve. Turning a finger ratio back into a fake wheel delta would be a way to hide the difference, not remove it. What the criterion was protecting is that the limits and the anchoring cannot drift apart, and the shared clamp plus the same anchor formula does that. The criterion is reworded to match.

### Canvas.tsx

- `local.touches`: the pointers currently down on the canvas and where each is. Filled on `pointerdown` over a canvas target, updated on move, and emptied on `pointerup` and `pointercancel`. Not on `lostpointercapture`, because releasing capture is not a lift, and cancelling the first finger's gesture releases capture on purpose.
- A second pointer landing while one is down starts a pinch. The first finger's gesture is cancelled through the existing `cancel()`, so a card drag goes back to where it was and nothing is saved, as `pointercancel` already does. The pinch holds both pointer ids, their start points, the start view, and a busy flag that ends the way a gesture's does.
- While pinching, moves from either finger go through the same requestAnimationFrame batching the wheel uses, and the wheel is ignored.
- One finger lifting ends the pinch. If a finger is still down, it starts a plain `pan` gesture from where that finger is now, never a card drag. A third finger is ignored.
- `pointerMove` and `pointerUp` match on the gesture's pointer id and stop requiring `isPrimary`, because the finger left over after a pinch may not be the primary one. A mouse only ever has one pointer, so desk behaviour does not change.

### Touch helper (tests/browser/touch.ts)

`twoFingers` puts both fingers down together. Criteria 3 and 4 need one finger down first, then the second, then a lift of one. So add a general `touchSteps(page, steps)` that sends a list of touch states through CDP, with the same cleanup that lifts every finger if a step fails. `twoFingers` becomes a user of it.

### Tests (tablet, tests/browser/pinch.spec.ts)

- A pinch out magnifies, and the scene point under the midpoint stays under it.
- A two-finger pan moves the view by the midpoint's travel.
- A second finger during a card drag returns the card and sends no PUT.
- The same for a link drag, which leaves no ghost and no dependency.
- After a pinch, lifting one finger and moving the other pans the view and moves no card.
- A touch drag inside an open inspector scrolls it.

Desk: the existing suites, unchanged.

## Notes

**agent:claude/t3code** at 2026-09-24T04:21:36Z

Criterion 2 reworded from 'through zoomAt' to 'sharing zoomAt's limits and anchoring' when the plan was written. zoomAt takes a wheel delta along an exponential curve, and a pinch has a distance ratio. What the original wording protected is that the two cannot drift apart on limits or anchoring, and a shared clampZoom and the same anchor formula protect that. The list named in criterion 1 does not exist yet (TKT-01M38QP3ZNYRPN60GXQD4SCE6M); that half is checked against the header and the inspector, and the list ticket inherits it.

**agent:claude/t3code** at 2026-09-24T04:40:59Z

Evidence, on the commit that implements this:

- Criterion 2: `pinch.spec.ts` covers a card drag, a link drag and a frame move, each interrupted by a second finger, on the emulated tablet. Each asserts that the element is back where it started, that no non-GET request was sent, and that the saved layout or dependency is unchanged.
- Criterion 3: "the finger left after a pinch pans the board and does not resume the card drag". The first finger starts on a card, the second joins and pinches out and back, the second lifts, and the first moves 40,30. The test asserts the view moved by exactly 40,30 at the same magnification, and that the card and the layout are unchanged.
- Criterion 4: `just browser-test` gave 98 passed, 6 skipped, 0 failed; the 6 are the opt-in measurement and visual specs. That is 91 before this ticket plus 7 new. `just web-test` gave 543 passed, including the Canvas unmount test, which was what caught counting non-touch pointers.
- Criterion 5: all seven tests in `pinch.spec.ts` run with `test.use(tablet)`. They passed on each of three repeats.
- Criterion 6: the pinch and two-finger-pan browser tests, plus table tests for `pinchView` in `geometry.test.ts`. Those cover anchoring while spreading, closing, turning and moving; the clamp at both limits; and that `clampZoom` bounds `zoomTo`, `zoomAt` and `pinchView` alike.

**Criterion 1 is left unticked.** The `touch-action` half was already true on main, inline in Canvas.tsx. The inspector half is tested: a touch drag in the open inspector scrolls it and leaves the board's view alone. The header does not scroll at all, and it is outside `#stage`, so nothing here reaches it. The list does not exist yet. That third part can only be met by TKT-01M38QP3ZNYRPN60GXQD4SCE6M (List tickets by status as well as on the board), which should carry the check, so the box stays empty rather than being ticked for a list nobody has built.

Things found on the way, all in the tests, none in the product:

- On a portrait tablet, touching a card opens the inspector as a sheet along the bottom, and touching a frame title opens the frame panel over the right half. A second finger that lands on either is on the panel, not the board, so correctly no pinch starts. The tests put their second finger where neither panel is, and say why.
- A CDP `touchMove` that leaves a finger out does not lift it. A `touchEnd` naming one finger lifts exactly that one. `touchSteps` is built on what Chromium did, not on the CDP documentation, which says a touchEnd carries no points.
- The inspector does scroll under a finger on main. An early version of the inspector test said otherwise because it started dragging while the sheet was still sliding in, from a point on the resize handle.

**agent:claude/t3code** at 2026-09-24T04:42:01Z

Opened as PR 31, https://git.local.sothr.com/terva-sh/git-ticket-canvas/pulls/31, from t3code/pinch-two-finger, rebased onto main at c5526d2 after PR 30 closed the harness ticket this one depends on. A Terva review is requested next; its result is recorded here when it lands.

**agent:claude/t3code** at 2026-09-24T04:46:52Z

Terva review of PR 31: request `ready-review`, run 2cba4185-2e10-4860-909c-ab487711b30e (Actions run 213), review 324, on head 15064f4 against base c5526d2. The gate failed on one medium finding. CI passed on the same head.

**Accepted and fixed: "Report failure to lift fingers after a successful touch sequence"** (tests/browser/touch.ts:101). It was real. On the success path, `touchSteps` left the final `touchEnd` to the `finally` block, which swallows errors. So a sequence whose last lift failed resolved as though the fingers were up. Lifting is now the sequence's own last step and its error propagates. The `finally` only lifts when a step failed partway, and only there is a cleanup error swallowed in favour of the one being reported.

No new test. Making only the final `touchEnd` fail would need a fake CDP session, and the helper talks to a real one on purpose. The existing test for a failed move still covers the cleanup path, and touch.spec and pinch.spec pass (14 of 14) after the change. The canvas code was not touched, so web/dist is unchanged.

**agent:claude/t3code** at 2026-09-24T04:55:03Z

Terva re-review of PR 31: request `review-after-fixes-1`, run f2435058-d237-4b52-bfac-6a2bc5eb117d (Actions run 216), review 328, on head 2eb470a. It marked the finding from review 324 resolved and raised a new medium one. CI passed on the same head.

**Accepted and fixed: "Keep both pinch pointers captured until they lift"** (web/src/ui/Canvas.tsx:454). It was real, and the new test reproduces it. `startPinch` dropped the first finger's gesture, which released that finger's capture, and captured nothing in its place. A first finger that slid off the board lifted where the stage never heard it, so it stayed in `local.touches`. The next single finger to land then made a pinch with a finger that was not there: in the test, a one-finger drag of 50,70 panned only 25,35.

The review's framing, that the pinch stays active, is milder in practice, because the other finger's lift still ends it. The phantom finger left in `local.touches` is what breaks the next gesture. The test pins that: `a finger that lifts after leaving the board is not still counted`.

Two changes:

- `startPinch` captures both fingers to the stage for the pinch's lifetime. That alone makes the test pass, checked with the other change removed.
- A primary touch pointer landing clears `local.touches`, because the primary pointer is by definition the first finger of a new touch. It is a backstop for any lift that never arrives, however it was lost.

On the new head: `just browser-test` gave 99 passed, 6 skipped, 0 failed; `just web-test` gave 543 passed; typecheck and strict tsc on the spec files passed; touch.spec and pinch.spec passed 45 of 45 across three repeats. web/dist is rebuilt.

## Summary

Two fingers now pinch and pan the board. A second finger landing drops whatever the first one started, whether a card drag, a link or a frame move, without saving it. The pinch zooms about the fingers' midpoint and pans with it. When one finger lifts, the one left pans the board and never resumes the drag it started with.

`Canvas.tsx` tracks the fingers down on the canvas in `local.touches`, and only fingers: `pointerType === 'touch'`, since a mouse or a stylus is one pointer. The pinch is held apart from `Gesture`, because it has two pointers, touches no card and saves nothing, and every path that ends a gesture by saving would otherwise need to know that. A lost capture does not count as a lift, because starting a pinch releases the first finger's capture on purpose. `pointerMove` and `pointerUp` now match the gesture's pointer id without requiring it to be primary, so the finger left after a pinch can keep panning. A mouse has one pointer, so desk behaviour is unchanged, and the full browser suite says so.

`geometry.ts` gains `pinchView`, which always works from where the pinch began so a long pinch does not gather error. It also gains `clampZoom`, now shared by `zoomTo`, `zoomAt` and `pinchView`, so no way of zooming can reach a scale the others cannot.

`tests/browser/touch.ts` gains `touchSteps`, for fingers that land and lift one at a time, and `twoFingers` is built on it.

Criterion 1 stays unticked, because its "list still scrolls" part waits on the list ticket; see the evidence note. The design doc is corrected: `#stage` already had `touch-action: none`.
