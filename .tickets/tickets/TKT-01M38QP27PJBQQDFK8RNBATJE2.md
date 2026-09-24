---
schema: 3
id: TKT-01M38QP27PJBQQDFK8RNBATJE2
title: Drive the canvas as an emulated phone and tablet in browser tests
type: task
status: ready
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
updated_at: 2026-09-24T03:40:25Z
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

- [ ] A spec can run against an emulated phone and an emulated tablet, each reporting a coarse pointer
- [ ] A helper performs a two-finger pinch and a two-finger pan, and a test shows the browser received two touch points
- [ ] The existing desk suites run unchanged
- [ ] A phone spec asserts the page did not widen past the emulated width, so overflow cannot pass silently
- [ ] docs/browser-testing.md says how to write a touch spec and why the pinch goes through CDP

## Notes

**agent:claude/t3code** at 2026-09-24T03:40:24Z

Groomed 2026-09-24. Probed Playwright 1.x Chromium (the main checkout's install, from /tmp, nothing written there) with three contexts:

- 390x844 and 820x1180 with `hasTouch` and `isMobile`: `(pointer: coarse)` matches and `(hover: hover)` does not. That is what `useDisplay` reads, so no `emulateMedia` workaround is needed.
- `Input.dispatchTouchEvent` with two touch points produced `pointerdown` for two distinct pointer ids of type `touch`, then moves for both. A pinch helper built on it will reach `Canvas.tsx` as real pointer events.
- Desk context: not coarse, hover available. The default config is untouched.

One trap: under `isMobile` the layout viewport grows to fit overflowing content. The probe page overflowed by 18px and `innerWidth` read 408, not 390. A phone spec that does not assert its width can pass against a page that is really wider than a phone. Added a criterion for it.

Where it goes: `playwright.config.ts` has one `use` block, a 1440x1000 viewport, and no projects. The tidiest shape is probably a fixture option or `test.use()` per spec rather than projects, because projects would rerun every desk suite at phone size. The implementer decides and writes it in the plan. `tests/browser/fixtures.ts` launches the desk command only, which is all this needs.
