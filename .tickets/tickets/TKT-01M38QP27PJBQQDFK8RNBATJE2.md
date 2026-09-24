---
schema: 3
id: TKT-01M38QP27PJBQQDFK8RNBATJE2
title: Drive the canvas as an emulated phone and tablet in browser tests
type: task
status: in-progress
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
claim:
  actor: agent:claude/mobile-harness
  branch: worktree-agent-a4313ca6d89fb3796
  worktree: /home/sothr/workspace/git.local.sothr.com/terva-sh/git-ticket-canvas/.claude/worktrees/agent-a4313ca6d89fb3796
  commit: d760329b61513f256fa407da7e21003109930c5a
  session: null
  claimed_at: 2026-09-24T03:45:09Z
  expires_at: null
archive: null
created_at: 2026-09-24T03:34:56Z
updated_at: 2026-09-24T03:45:24Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/mobile-harness
  name: ""
extensions: {}
---

## Description

The browser harness drives the canvas with a mouse at one desk size. Nothing in the mobile work can be tested until it can also drive a phone and a tablet.

Add two emulated devices to the harness: a phone at 390x844 and a tablet at 820x1180, each with `hasTouch` and `isMobile`. Add a helper that performs a two-finger pinch through CDP `Input.dispatchTouchEvent`, because Playwright's `touchscreen` API taps and does not move.

See `docs/mobile-design-v1.md`, "Testing". Read `docs/browser-testing.md` first. The harness has limits that are already written down, including rebuilding before a Playwright run.

## Acceptance criteria

- [ ] A spec can run against an emulated phone and an emulated tablet, each reporting a coarse pointer
- [ ] A helper performs a two-finger pinch and a two-finger pan, and a test shows the browser received two touch points
- [ ] The existing desk suites run unchanged
- [ ] A phone spec asserts the page did not widen past the emulated width, so overflow cannot pass silently
- [ ] docs/browser-testing.md says how to write a touch spec and why the pinch goes through CDP

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
