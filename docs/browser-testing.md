# Browser baseline for the vanilla frontend

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

The ten tests in `tests/browser/baseline.spec.ts` exercise:

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

## Failure artifacts

Playwright retains screenshots and traces on failure under ignored `test-results/`. Open a trace using the exact path printed in the failure output:

```sh
npx playwright show-trace test-results/<test-directory>/trace.zip
```

Artifacts contain only temporary test data. They are local diagnostics, not committed evidence; this guide and the ticket record the observed results.
