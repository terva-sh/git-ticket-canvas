---
schema: 3
id: TKT-01M2HPBAG7VFHDC8FV0MBKZYCP
title: Add a store browser view and a compact toolbar picker
type: task
status: done
status_reason: The picker and the browser view are in, driven against the real 22-store workspace in a browser.
priority: normal
due_on: null
labels:
  - ui
  - canvas
assignees: []
milestone: null
parent: TKT-01M2HPB9WEYH5VSYB55GNYMZ8Y
origin: null
dependencies:
  - TKT-01M2HPBACHAMZM2EMV5FMC8CEK
  - TKT-01M2HPBAE9GCFJX2RTRS0X26PW
blocks_on: none
references: []
claim:
  actor: agent:t3code/d30689a3
  branch: t3code/orient-upstream-review-tickets
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-d30689a3
  commit: 49fe4056d46b10b63b2ce79203f229335107fefe
  session: null
  claimed_at: 2026-09-15T06:48:00Z
  expires_at: null
archive: null
created_at: 2026-09-15T04:49:04Z
updated_at: 2026-09-15T06:56:38Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

Make a tree of stores browsable.

A picker holding 22 entries is a list, not a menu. The toolbar keeps a compact
control showing the current store, its favorites, and recent stores. A
dedicated view holds the rest.

The view offers search, favorites first, grouping by root and then by the
leading segments of each path, and one row per store showing the path and
whether the store is available. A store declared as a child of another renders
under its parent, which its derived id already sorts it next to.

An unavailable store is visible with its reason rather than hidden, so a
misconfigured path is diagnosable from the page instead of the logs.

## Acceptance criteria

- [x] The toolbar shows the current store with its favorites and recent stores, and opens the browser view.
- [x] The browser view searches, groups by root and path segments, and lists favorites first.
- [x] An unavailable store is shown with its reason instead of being hidden.
- [x] A declared child store renders under its parent.
- [x] Marking a favorite from the view persists it.

## Definition of done

- [x] just web-test passes and the view is reachable by keyboard.

## Implementation plan

### What the list needs that it does not have

Grouping by root, and rendering a declared child under its parent, both need
facts the API does not report yet. `StoreSpec` gains the root a store was found
under and the id of the store that declared it, `Merge` fills both, and
`StoreStatus` reports them as `root` and `parent`. The merge already resolves a
parent's id while naming its children, so nothing new has to be worked out.

### Two controls, because 22 entries is a list and not a menu

The toolbar keeps a compact control: the store being shown, its favorites, and
the stores looked at recently, with one item that opens the full view. Nothing
about it grows with the number of stores.

The view is a panel over the canvas holding search, the groups, and one row per
store. Favorites come first, under their own heading. Then one group per root,
and within a root one group per leading path segment, which is what turns
`git.local.sothr.com/Sothr-Containers/alpine` and its fifteen siblings into one
heading and sixteen rows. A store declared as a child renders under its parent.

A row shows the path and whether the store is available. An unavailable store is
shown with its reason rather than hidden, so a path somebody mistyped is
diagnosable from the page instead of from the log. A row also carries the mark
that makes it a favorite, and marking one goes straight to `PUT /api/favorites`.

### Grouping is a pure function

`groupStores(stores, query)` lives in `platform` and returns headings and rows.
Keeping it out of the component is what lets the interesting cases be tested
without rendering anything: a store whose root is not a prefix of its path, a
declared child whose parent was filtered out by the search, two roots with the
same leading segments, and an unavailable store that must survive filtering.

### Keyboard

The control is a button, the rows are buttons, and the search is an input, so
the tab order is the reading order without any work. What has to be added is
Escape to close, focus moving into the search when the view opens, and focus
returning to the control when it closes. A canvas is a mouse-first thing and the
picker must not be.

### Tests

For the grouping: the cases above, as a unit. For the view: the search narrows,
favorites lead, an unavailable store shows its reason, a declared child renders
under its parent, and marking a favorite calls the route and updates the row.
For the toolbar: the current store is shown, and choosing another store changes
the address, which is what TKT-01M2HPBAC (Scope the browser client and live
stream to a store) made the switch.

## Notes

**agent:t3code/d30689a3** at 2026-09-15T06:48:00Z

draft to ready: Next in the run the user asked for. Both dependencies, the scoped client and favorites, are done.

**agent:t3code/d30689a3** at 2026-09-15T06:56:38Z

in-progress to done: The picker and the browser view are in, driven against the real 22-store workspace in a browser.

## Summary

A tree of stores is now browsable from the canvas.

### Two controls, because 22 entries is a list and not a menu

`StorePicker` sits in the toolbar and shows the store being displayed, the
favorites, and the stores looked at this session, capped at eight. Nothing about
it grows with the number of stores.

`StoreBrowser` is the full view: a search, a count, a rescan, and one row per
store. Favorites lead under their own heading, then one heading per root and
leading path, which turns sixteen sibling repositories under
`git.local.sothr.com/Sothr-Containers` into one heading and sixteen rows. A
declared child renders indented under its parent. Every row shows the path, and
an unavailable one shows its reason rather than being hidden, so a mistyped
path is diagnosable from the page instead of from the log.

### What the API had to start reporting

Grouping by root and nesting a child both need facts the API did not report.
`StoreSpec` gained `Root` and `Parent`, `Merge` fills them, and `StoreStatus`
reports them. The merge already resolved a parent's id while naming its
children, so nothing new had to be worked out.

### Grouping is a pure function

`groupStores` lives in `platform` and returns headings and rows, which is what
lets the awkward cases be tested without rendering anything: a root that is not
a prefix of the store's path, a child whose parent the search removed, two roots
with the same leading segments, a store nobody rooted, and an unavailable store
that has to survive filtering. A child whose parent is filtered out is promoted
to a row of its own, because a search that hides a match is worse than one that
shows it somewhere unexpected.

### Keyboard

The control and every row are buttons and the search is an input, so the tab
order is the reading order. Focus moves into the search when the view opens,
Escape closes it, and focus returns to whatever opened it.

### Verified

`just web-test` passes with 500 tests, 19 new. Typecheck, `just test` and
`just vet` pass. `just browser-test-embedded` passes against a freshly built
bundle: 68 passed, 6 skipped.

Driven in a real browser against the real workspace of 22 stores. The picker
showed the current store, the view grouped into five headings, the count read
22 of 22, searching `alpine` narrowed it to 1 of 22, marking a favorite
persisted it into the state file and moved it into the Favorites heading on
reload, and choosing another store switched the canvas and the address with no
console errors. A screenshot of the view is in the ticket's evidence trail.

One piece of cleanup worth recording: that browser check ran without
`XDG_STATE_HOME` set, so it wrote a favorite into the real state directory at
`~/.local/state/git-ticket-canvas/`. The file held only what the check had just
done and nothing a person had chosen, so it and its directory were removed.
