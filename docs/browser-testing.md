# Browser baseline for the frontend before the Preact migration

Historical record from 2026-09-09. It describes the Playwright baseline captured before the frontend moved to Preact; the defect it names was fixed and the run recorded in `browser-baseline-passed.md`. The current commands are in `development-preact.md`, and `tests/browser/` now holds more than this baseline. The setup and failure-artifact sections below still apply.

This guide supplements `docs/development.md` with Playwright testing. It does not introduce Preact or change the frontend build. The npm workspace sits at the repository root so `node_modules` is outside the current `go:embed web` tree. The lockfile can be reused when introducing Vite.

## Setup and commands

Use Go 1.25 or newer, Node.js 22 or newer, npm, and just. Validation used Go 1.26.2, Node.js 22.23.2, and Playwright 1.61.1 on Linux.

```sh
just browser-setup
just browser-test
just browser-test --repeat-each=3
just browser-test --grep 'unfinished description'
```

`browser-setup` runs `npm ci` and installs Playwright's Chromium. On a host missing browser system libraries, an administrator may need to run `npx playwright install-deps chromium`. The setup recipe does not install OS packages or use sudo.

`browser-test` builds the actual tkcanvas binary and a small store initializer in a temporary directory. Each test initializes its own temporary store using the Go ticket library, then launches the binary on an ephemeral loopback port with the explicit actor `agent:playwright/baseline`. A read-only test launches another server against that test's store. Teardown stops servers and removes stores, even when assertions fail; suite teardown removes the temporary binaries.

Tests never use this repository's `.tickets` data or reuse an already-running developer server. Independent HTTP clients simulate external writes. There is no git-ticket CLI prerequisite.

The browser gate remains separate from `just check`, which still runs the existing Go, formatting, JavaScript syntax, and ticket-store checks. Both commands are required before claiming migration readiness.

## Covered behavior

The tests in `tests/browser/baseline.spec.ts` at the time exercised:

- Draft creation and placement through the composer, title edits, and reload persistence.
- A stale inspector write after an independent HTTP edit, conflict feedback, and authoritative reload.
- Read-only controls, drag refusal, keyboard creation refusal, and byte-for-byte persisted-file checks.
- Pinning an unplaced ticket and preserving its layout after reload.
- Multi-selection dragging with equal scene-coordinate deltas.
- Dependency direction when dropping a source handle onto another card.
- Pan, zoom anchored at the cursor, fit, filtering, new/cancel, and delete keyboard shortcuts.
- The real periodic poll observing an external edit.
- Visible-document refresh observing an external edit.
- Preservation of focused, unfinished description text without an unsolicited write.

The visibility tests dispatch `visibilitychange` on a visible document. They exercise the application's event handler, not an OS-level tab switch. Gesture tests use Chromium pointer events at a desktop viewport. They do not establish mobile, touch, Firefox, WebKit, accessibility, or large-board performance parity. Inspector testing covers title editing and unfinished description handling, not every field or mutation.

Tests use existing selectors rather than adding test-only hooks to the MVP. Keep the behavior assertions when replacing the renderer; selectors can change with the markup.

## Current blocking defect

TKT-01M23J6D5NE0FE1Z1QAMXMMA5C (Prevent refresh from submitting unfinished inspector text) blocks TKT-01M23HKF764T0VBFMPM959Q4DM (Capture MVP browser behavior before the Preact migration).

At this baseline, the unfinished-description test fails because refresh saves the focused text without a user blur or submission. The test checks that the description is initially unsaved and the textarea focused before the external change and refresh. Afterwards, the stored description unexpectedly contains the unfinished text.

Three full runs produced 27 passing cases and three failures, all of that same regression. The cursor-anchor assertion was subsequently strengthened and passed three additional focused runs. `just check` passed. No frontend code was changed.

The regression remains an ordinary failing test, not skipped or marked as an expected failure. A successful subset is not a passing baseline. Do not promote the dependent frontend conversion until the defect is fixed and the full suite passes, or a person explicitly changes the scope.

## Writing a touch spec

Added 2026-09-24 for TKT-01M38QP27PJBQQDFK8RNBATJE2 (Drive the canvas as an emulated phone and tablet in browser tests). Unlike the rest of this page, this section describes the current harness.

`tests/browser/touch.ts` defines two emulated devices from `docs/mobile-design-v1.md`: `phone` at 390x844 and `tablet` at 820x1180, each with `hasTouch` and `isMobile`. With both set, Chromium matches `(pointer: coarse)` and stops matching `(hover: hover)`, which is what `useDisplay` reads. A spec opts in with `test.use`, at file level or inside a `describe`, and keeps the `app`, `dense` and `pair` fixtures:

```ts
import { test, expect } from './fixtures'
import { expectFitsDevice, phone, pinch } from './touch'

test.describe('phone', () => {
  test.use(phone)

  test('a pinch zooms the board', async ({ page, app }) => {
    await app.create('Pinched', { x: 0, y: 0 })
    await page.goto(app.url)
    await expect(page.locator('.card')).toBeVisible()
    const box = (await page.locator('#stage').boundingBox())!
    await pinch(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 60, 200)
    // assert what the canvas did
    await expectFitsDevice(page, phone)
  })
})
```

The devices are not Playwright projects. A project reruns every spec it matches, so every desk suite would run again at sizes it was never written for, or each project would need a file-naming rule that every new spec has to follow. They are not Playwright's named presets either, such as `devices['iPhone 13']`. Those carry a WebKit user agent, a device scale factor of 3 and different sizes, and a spec named after an iPhone claims something emulated Chromium does not establish. The default `use` block in `playwright.config.ts` is unchanged, 1440x1000 with a mouse, and `touch.spec.ts` checks that it still reports a fine pointer with hover.

Call `expectFitsDevice(page, device)` in every phone spec once the page has settled. Under `isMobile`, Chromium grows the layout viewport to fit content that overflows, the way a phone browser zooms out on a page built for a desk. On a 390px phone, a page 18px too wide reports an `innerWidth` of 408 and lays itself out at 408. Nothing is clipped, so a spec that does not check the width passes against a page a phone cannot show. The helper asserts that `innerWidth` and the document's scroll width both equal the emulated width, and `touch.spec.ts` shows it failing when an element overflows.

Two-finger gestures go through CDP `Input.dispatchTouchEvent`, not `page.touchscreen`. Playwright's touchscreen can only tap: it has no move and no second finger, so it cannot pinch or pan. Dispatching `PointerEvent`s from page script is also not a substitute, because it skips the browser's touch pipeline, and `touch-action`, pointer ids, which pointer is primary, and implicit capture would all be whatever the test invented. CDP input takes the same path as a touchscreen, and the page receives two `touch` pointers with ids the browser assigned. `touch.spec.ts` records those pointers for a pinch and for a pan and checks for two distinct ids, one primary, each with its own down, moves and up, and no `pointercancel`. The helpers are:

- `pinch(page, center, from, to)` puts two fingers on a horizontal line `from` pixels apart and moves them until they are `to` pixels apart. A `to` greater than `from` spreads the fingers.
- `twoFingerPan(page, start, delta)` moves both fingers by the same delta.
- `twoFingers(page, frames)` sends any sequence of two-point frames, for a gesture the other two do not cover.

CDP is Chromium only, which is the only browser this harness runs. Emulation is not a device: it does not reproduce a phone browser's own toolbars, its on-screen keyboard or its gesture handling outside the page. Check those by hand on a real device, as `docs/mobile-design-v1.md` says.

## Failure artifacts

Playwright retains screenshots and traces on failure under ignored `test-results/`. Open a trace using the exact path printed in the failure output:

```sh
npx playwright show-trace test-results/<test-directory>/trace.zip
```

Artifacts contain only temporary test data. They are local diagnostics, not committed evidence; this guide and the ticket record the observed results.
