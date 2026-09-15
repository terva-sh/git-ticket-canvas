---
schema: 3
id: TKT-01M2HPBAHWAA9G2JS3V6X97D61
title: Cover store switching with a two-store browser fixture
type: task
status: done
status_reason: Four browser tests over a two-store fixture, and the fixture caught the canvas writing favorites into the developer's own state directory.
priority: normal
due_on: null
labels:
  - canvas
assignees: []
milestone: null
parent: TKT-01M2HPB9WEYH5VSYB55GNYMZ8Y
origin: null
dependencies:
  - TKT-01M2HPBAG7VFHDC8FV0MBKZYCP
blocks_on: none
references: []
claim:
  actor: agent:t3code/d30689a3
  branch: t3code/orient-upstream-review-tickets
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-d30689a3
  commit: 472c5d4242e14128499c49388bc715bb9b093921
  session: null
  claimed_at: 2026-09-15T06:56:46Z
  expires_at: null
archive: null
created_at: 2026-09-15T04:49:04Z
updated_at: 2026-09-15T07:00:37Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

Cover switching stores in a real browser.

`tests/browser/canvas-fixture.mjs` already unpacks the committed archive into a
fresh temporary store for each run, so a second store is close to a second call
to the same helper. Build a two-store fixture on it and assert what only a
browser can: that switching rebuilds the canvas, that the event stream
reconnects to the new store, and that no card, ticket, or schema value from the
first store survives into the second.

Also cover a store that is configured but unavailable, because the interesting
failure is a picker that hides it rather than reporting it.

## Acceptance criteria

- [x] A two-store fixture starts the server over two isolated temporary stores.
- [x] Switching stores rebuilds the canvas and reconnects the event stream to the new store.
- [x] No ticket, card, or schema value from the first store is visible after switching.
- [x] An unavailable store appears in the picker with its reason.

## Definition of done

- [x] just browser-test-embedded passes.

## Notes

**agent:t3code/d30689a3** at 2026-09-15T06:56:46Z

draft to ready: Last of the epic children. Its dependency, the browser view, is done, and Chromium runs in this environment now.

**agent:t3code/d30689a3** at 2026-09-15T07:00:37Z

in-progress to done: Four browser tests over a two-store fixture, and the fixture caught the canvas writing favorites into the developer's own state directory.

## Summary

Switching stores is now covered in a real browser.

### The fixture

`fixtures.ts` gained a `pair`: one canvas over two isolated stores, each
initialized fresh and each given a ticket and a label of its own, plus a third
store configured at a path that does not exist. `start` became a single-store
case of `spawnCanvas`, which takes whatever arguments a test needs.

The label is what makes the schema assertion visible. The toolbar derives its
label chips from the store, so a chip present before the switch and absent
after is proof the schema was replaced rather than merged.

### What the four tests hold

Switching rebuilds the canvas: the second store's ticket is on the page, the
first store's is not, the card count is one, the toolbar path changed, the
address changed, and the event stream moved from
`/api/stores/first/events` to `/api/stores/second/events` rather than staying
where it was.

Nothing survives: the card id from the first store is gone, and so is its
label chip, while the second store's chip is there.

A configured store that is not on disk is listed, marked unavailable, carrying
the `git-ticket init` hint, with its open button disabled. That is the
interesting failure, because a picker that hides it leaves a mistyped path
diagnosable only from the log.

A favorite marked from the view survives a reload and leads the list.

### A leak the fixture found

The favorites test passed on its first run, and then I looked at where it had
written. The canvas records favorites and the store last shown under
`XDG_STATE_HOME`, so a browser run was writing into the state directory of
whoever ran it, and one run's favorites could be read by the next.
`commandEnvironment` now points every canvas the suite starts at a temporary
state directory it removes on exit, and the pair fixture also passes `-state`
of its own. Verified after a full suite run: no state directory in the home
directory at all.

### Verified

`just browser-test-embedded` passes with 72 tests, 4 new, and 6 skipped, against
a bundle built from the current source. `just test`, `just vet`,
`just web-test` at 500 tests, and `git ticket check` all pass.
