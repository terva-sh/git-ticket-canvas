# Browser baseline after the inspector refresh fix

This 2026-09-09 report supersedes the blocking-defect status in `docs/browser-testing.md`. That document remains the historical record of the initial failure and the guide to browser-test setup.

TKT-01M23J6D5NE0FE1Z1QAMXMMA5C (Prevent refresh from submitting unfinished inspector text) is resolved. TKT-01M23HKF764T0VBFMPM959Q4DM (Capture MVP browser behavior before the Preact migration) now has a passing baseline against the vanilla frontend.

## What changed

- Background board refresh leaves the same inspector intact while an input or textarea is focused. Cards and board data still refresh.
- Programmatic inspector replacement suppresses textarea blur mutations.
- Inspector operations submit the revision of the displayed ticket snapshot, not a newer revision fetched by polling.
- Explicit user commits retain the existing blur/Enter behavior. A stale commit reports a conflict and reloads the server value instead of retrying against a newer revision.

This is a bounded fix in `web/app.js`, not the Preact conversion. Inspector metadata may remain at its displayed snapshot while a text editor is focused. It refreshes on a subsequent load after focus leaves or on an explicit mutation response. As before, stale-revision feedback reloads authoritative content rather than offering a merge editor.

## Validation

```sh
just browser-test --repeat-each=3
just check
```

All 14 browser tests passed in three consecutive runs: 42 passes, no skips or expected failures. The suite includes the original ten cases plus concurrent same-field edits for description and title, focused-editor preservation during the actual periodic poll, and explicit prose commit after a refresh with no external edits.

The tests verify focus and unsaved text preservation, no PATCH during the focused periodic refresh, and 409 refusal rather than silent overwrite when committing after an external edit. They launch the built Go binary against temporary stores.

Go race tests, Go vet, formatting, JavaScript syntax, strict ticket validation, and whitespace checks also passed. API statement coverage remains 65.1%; layout coverage remains 74.5%.

The browser environment was Chromium through Playwright 1.61.1 on Linux with a desktop viewport. Mobile/touch, other browser engines, exhaustive inspector mutation coverage, and large-board performance remain outside this baseline. The visibility tests exercise the visible-document event handler rather than an OS-level tab switch.

The browser-baseline dependency is satisfied. The TypeScript/Vite migration and the rest of the Preact epic remain draft pending promotion.
