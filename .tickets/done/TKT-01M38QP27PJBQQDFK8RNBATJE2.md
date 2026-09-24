---
schema: 3
id: TKT-01M38QP27PJBQQDFK8RNBATJE2
title: Drive the canvas as an emulated phone and tablet in browser tests
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - touch
  - testing
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-24T03:34:56Z
updated_at: 2026-09-24T04:19:23Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

The browser harness drives the canvas with a mouse at one desk size. Nothing in the mobile work can be tested until it can also drive a phone and a tablet.

Add two emulated devices to the harness: a phone at 390x844 and a tablet at 820x1180, each with `hasTouch` and `isMobile`. Add a helper that performs a two-finger pinch through CDP `Input.dispatchTouchEvent`, because Playwright's `touchscreen` API taps and does not move.

See `docs/mobile-design-v1.md`, "Testing". Read `docs/browser-testing.md` first. The harness has limits that are already written down, including rebuilding before a Playwright run.

## Acceptance criteria

- [x] A spec can run against an emulated phone and an emulated tablet, each reporting a coarse pointer
- [x] A helper performs a two-finger pinch and a two-finger pan, and a test shows the browser received two touch points
- [x] The existing desk suites run unchanged
- [x] A phone spec asserts the page did not widen past the emulated width, so overflow cannot pass silently
- [x] docs/browser-testing.md says how to write a touch spec and why the pinch goes through CDP

## Implementation plan

### Shape

A new module, `tests/browser/touch.ts`, holds everything a touch spec needs. It does not change `playwright.config.ts` or `tests/browser/fixtures.ts`, so every desk suite runs exactly as before and the sibling tickets that edit the fixtures do not collide with this one.

- `phone` and `tablet` are plain context options: `{ viewport, hasTouch: true, isMobile: true }` at 390x844 and 820x1180. A spec opts in with `test.use(phone)` at file or `describe` level and keeps the `app` fixture and everything else.
- `expectFitsDevice(page, device)` asserts that `innerWidth` equals the emulated width and that the document does not scroll sideways. Under `isMobile` Chromium widens the layout viewport to fit overflow, so a spec that never checks can pass against a page wider than a phone. Every phone spec in the mobile epic is expected to call it after the page settles.
- `twoFingers(page, frames)` sends a sequence of two-point frames through CDP `Input.dispatchTouchEvent`: `touchStart` for the first, `touchMove` for the rest, `touchEnd` after. `pinch(page, center, from, to)` and `twoFingerPan(page, start, delta)` are the two gestures built on it. The CDP session is opened per gesture and detached afterwards.

`tests/browser/touch.spec.ts` proves the harness itself, not any mobile behavior of the canvas (that belongs to the sibling tickets):

- On the phone and on the tablet, `(pointer: coarse)` matches, `(hover: hover)` does not, and the page fits the emulated width.
- On the phone, a pinch and a two-finger pan over `#stage` arrive as two distinct `touch` pointers, each with its own down, moves and up, ending the distance apart (pinch) or the delta along (pan) that the helper asked for. The events are recorded by a capture listener on `window`, so the canvas's own pointer capture does not hide them.
- At the desk size the same checks report a fine pointer with hover, as a guard that the default `use` block stays a mouse.

`docs/browser-testing.md` gets a section on writing a touch spec and why the pinch goes through CDP.

### Alternatives rejected

- Playwright projects for phone and tablet. A project reruns every matching spec, so either every desk suite runs three times at sizes it was never written for, or each project needs a `testMatch` naming convention that a new spec has to remember. `test.use` in the spec that needs it has neither cost.
- A `device` option on the shared fixture. It would add nothing over `test.use` with plain context options, since `hasTouch`, `isMobile` and `viewport` already are options, and it would put this ticket's edit in a file the sibling tickets are also changing.
- Playwright's `devices['iPhone 13']` and similar presets. They carry a WebKit user agent, a device scale factor of 3 and sizes that do not match the design's 390x844 and 820x1180. A named preset also invites reading the result as "works on an iPhone", which emulated Chromium does not establish.
- `page.touchscreen`. It only taps; it has no move, so it cannot pinch or pan.
- Synthetic `PointerEvent`s dispatched from page script. They skip the browser's touch pipeline, so `touch-action`, pointer ids, primary-pointer assignment and implicit capture would all be whatever the test invented. CDP input goes through the same path as a real touchscreen.

## Notes

**agent:claude/t3code** at 2026-09-24T03:40:24Z

Groomed 2026-09-24. Probed Playwright 1.x Chromium (the main checkout's install, from /tmp, nothing written there) with three contexts:

- 390x844 and 820x1180 with `hasTouch` and `isMobile`: `(pointer: coarse)` matches and `(hover: hover)` does not. That is what `useDisplay` reads, so no `emulateMedia` workaround is needed.
- `Input.dispatchTouchEvent` with two touch points produced `pointerdown` for two distinct pointer ids of type `touch`, then moves for both. A pinch helper built on it will reach `Canvas.tsx` as real pointer events.
- Desk context: not coarse, hover available. The default config is untouched.

One trap: under `isMobile` the layout viewport grows to fit overflowing content. The probe page overflowed by 18px and `innerWidth` read 408, not 390. A phone spec that does not assert its width can pass against a page that is really wider than a phone. Added a criterion for it.

Where it goes: `playwright.config.ts` has one `use` block, a 1440x1000 viewport, and no projects. The tidiest shape is probably a fixture option or `test.use()` per spec rather than projects, because projects would rerun every desk suite at phone size. The implementer decides and writes it in the plan. `tests/browser/fixtures.ts` launches the desk command only, which is all this needs.

**agent:claude/mobile-harness** at 2026-09-24T03:50:56Z

Evidence for the criteria, from this branch on 2026-09-24:

- `npx playwright test touch.spec`: 6 passed. `--repeat-each=5`: 30 passed, so the CDP gestures are not timing-sensitive on this machine.
- `just browser-test` (rebuilds web/dist first, which came out byte-identical): 88 passed, 6 skipped, 0 failed. The 6 skipped are the pre-existing opt-in tests (the dense visual baseline and the live-update and refresh measurements), not anything this ticket touched. 82 of the 88 are the desk suites. `playwright.config.ts`, `tests/browser/fixtures.ts` and every existing spec are unchanged in the diff.
- Before writing the width criterion into a spec, a probe on the current canvas measured `innerWidth` and `documentElement.scrollWidth` at exactly 390 on the phone and 820 on the tablet, so the check passes today without being loosened. On the tablet the label-filter popover's contents extend to about 964px but are clipped and do not widen the document. The header ticket TKT-01M38QP2WYRK9A18P473KTM9BV (Fit the header into one row on a phone) should still call `expectFitsDevice`, because the header is the likeliest thing to push past 390.
- `touch.spec.ts` also shows the width check failing: it appends a 408px element and expects `expectFitsDevice` to reject.
- `tests/browser` is outside the `include` list in `tsconfig.json`, so `just web-typecheck` does not cover the new files. I ran `tsc --noEmit --strict` on `touch.ts` and `touch.spec.ts` directly and it passed. I did not change `tsconfig.json`, since that would pull every existing spec into the typecheck, which is outside this ticket.

**agent:claude/t3code** at 2026-09-24T04:03:48Z

Merged with its two sibling tickets on branch t3code/mobile-foundations and opened as one PR, https://git.local.sothr.com/terva-sh/git-ticket-canvas/pulls/29, at the maintainer's direction on 2026-09-24. The only merge conflict was the generated web/dist/index.html, resolved by rebuilding. On the merged head: web-typecheck pass, web-test 531 passed, go test pass, browser-test 90 passed / 6 skipped / 0 failed, dist-verify byte-identical, ticket check clean. A Terva review is requested next; its result is recorded here when it lands.

**agent:claude/t3code** at 2026-09-24T04:08:49Z

Terva review of PR 29, request `ready-review`, run 920b4f41-8e15-404c-a0ee-4c7c4e3a5ae4 (Actions run 204), review 317, on head a2b5eb6 against base 0be4e5a. The gate failed on two medium findings. This is the one on this ticket.

**Accepted and fixed: "End the touch gesture if a CDP move fails"** (tests/browser/touch.ts:64). It was real. Once `touchStart` succeeded, a failing `touchMove` skipped `touchEnd`, and `finally` only detached the session, so both fingers stayed down for whatever the caller did next. `twoFingers` now tracks whether the fingers are down, and its `finally` sends a best-effort `touchEnd` before detaching. It swallows a second error from that cleanup, because the error worth reporting is the one that got there.

New test `a gesture whose move fails still lifts both fingers` in touch.spec.ts. A NaN coordinate makes CDP reject the move after both fingers land, and the test asserts each pointer that went down also came up. With the cleanup line removed the test fails; with it, it passes.

**agent:claude/t3code** at 2026-09-24T04:13:52Z

Terva review clean on PR 29: request review-after-fixes-1, run 11e37549-7ace-4db3-96bf-2874c4071221 (Actions run 206), head 31c8cba against base 0be4e5a. No findings at the failure threshold. It marked both findings from review 317 resolved: the touch cleanup fix, and the declined picker finding with its InspectorBody key test. CI (Embedded frontend and Go parity) passed on the same head, and Forgejo reports the PR mergeable. Ready to merge; merging is the maintainer's call.

**agent:claude/t3code** at 2026-09-24T04:19:23Z

Merged to main through PR 29 (https://git.local.sothr.com/terva-sh/git-ticket-canvas/pulls/29) at 5cb0e0f on 2026-09-24, with the maintainer's authorization, after a clean Terva review (run 11e37549-7ace-4db3-96bf-2874c4071221 on 31c8cba) and green CI. Closed with the merge recorded; the summary above stands as written by the implementing agent.

## Summary

The browser harness can now drive an emulated phone (390x844) and tablet (820x1180), each with `hasTouch` and `isMobile`. This ticket does not change any canvas behavior. It adds the means to test it.

- `tests/browser/touch.ts` has the `phone` and `tablet` context options, which a spec applies with `test.use`. It also has `expectFitsDevice(page, device)`, which fails if the page widened past the emulated width, and the two-finger helpers `pinch`, `twoFingerPan` and `twoFingers`, which go through CDP `Input.dispatchTouchEvent`.
- `tests/browser/touch.spec.ts` checks the harness. Both devices report a coarse pointer and no hover, and each page fits its width. A pinch and a pan each arrive as two distinct `touch` pointers, one of them primary, with no `pointercancel`, and end where the helper put them. The width check fails when a 408px element is added. The desk size still reports a fine pointer with hover.
- `docs/browser-testing.md` has a new section, "Writing a touch spec", covering the devices, the width check and why gestures go through CDP.
- `playwright.config.ts`, `tests/browser/fixtures.ts`, every existing spec and web source are unchanged. `just browser-test` gave 88 passed and 6 skipped, the skips being the pre-existing opt-in tests.

For the sibling tickets: import from `./touch`, call `expectFitsDevice` in every phone spec, and assert what the canvas does with a pinch in that ticket's own spec. `tests/browser` is outside the `tsconfig.json` typecheck, as before.
