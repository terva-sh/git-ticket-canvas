---
schema: 3
id: TKT-01M2K7XZSNK5C7XD0FHB0YV9R2
title: Close the store picker once it has chosen a store
type: bug
status: done
status_reason: null
priority: high
due_on: null
labels: []
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-15T19:15:35Z
updated_at: 2026-09-15T19:20:56Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

### What happens

Open the toolbar store picker, choose "Browse all stores", pick a store. The
store switches and the browser view closes, and the picker dropdown is still
open, hanging over the toolbar and covering whatever is beneath it.

`StorePicker` is a native `<details>`, always mounted in the toolbar.
`open` is DOM state rather than component state, so no Preact re-render
resets it, and nothing in the code closes it. It stays open until somebody
clicks the summary again.

### How it surfaced

The v0.3.0 release failed on it. `just parity-check` runs the browser suite,
and `tests/browser/stores.spec.ts:50` timed out clicking `#labelFilter`,
with Playwright naming the cause exactly: a `.store-quick-item` inside
`<details open id="storePicker">` intercepts the pointer.

It passes on the machine it was written on, six runs out of six in isolation
and in a full local suite. The difference is layout: the dropdown only covers
`#labelFilter` at some toolbar widths, and CI installs `font-noto` while this
machine has different font metrics. The bug is equally present in both; only
CI's text measurements put the dropdown over the target.

That makes the test a fair witness rather than a flaky one. It failed for the
reason it exists.

### What to change

Close the picker when it has done its job: when the browser view opens from
it, and when a store is chosen, whether from the picker's own quick list or
from the browser view. The store having changed is the signal that the
dropdown is finished.

Do not fix this in the test. Forcing the click, or closing the dropdown from
the test before clicking, would leave a dropdown parked over the toolbar for
every real user and remove the only thing that noticed.

### Worth considering while in here

A native `<details>` does not close when a click lands outside it. That is a
second and broader wart, and it is not required to unblock the release. If it
is more than a few lines, file it rather than growing this ticket.

## Acceptance criteria

- [x] Choosing a store from the picker's quick list closes the dropdown
- [x] Opening the store browser from the picker closes the dropdown
- [x] Choosing a store in the browser view leaves no dropdown open over the toolbar
- [x] tests/browser/stores.spec.ts passes without being changed to work around the overlap
- [x] just parity-check passes, which is the gate the release failed on

## Summary

`StorePicker` now closes its own dropdown: when the browser view opens from
it, when a store is chosen from its quick list, and whenever the current store
changes from anywhere, which covers a choice made in the browser view.

### Why nothing closed it before

`open` on a `<details>` is DOM state. Preact re-rendering the same element
never clears it, and no code did, so the dropdown stayed open until somebody
clicked the summary again.

### Why it failed in CI and not here

The bug was equally present on both machines. Whether an open dropdown covers
`#labelFilter` depends on toolbar layout, and CI installs `font-noto` while
this machine has different font metrics. The test was a fair witness, not a
flaky one: it failed for exactly the reason it exists.

### The test now fails on the cause

`tests/browser/stores.spec.ts` asserts the picker carries no `open` attribute
after a store is chosen, in the shared helper every switching test uses. That
is checked directly rather than through whatever the dropdown happens to
overlap.

Falsified rather than assumed. With the fix disabled and the bundle rebuilt,
two tests fail in 8 seconds on that assertion. With it restored they pass. The
earlier failure was a 30-second timeout on an intercepted click, which named
the cause only in the Playwright call log.

### Verified

`just parity-check` passes, which is the gate the v0.3.0 release failed on:
502 frontend tests plus one new, tooling tests, vet, `go test -race`, the
ticket store, 72 browser tests, and the Go-only build.

### Not done

A `<details>` still does not close when a click lands outside it. That is a
separate wart, it did not block the release, and it is not filed.
