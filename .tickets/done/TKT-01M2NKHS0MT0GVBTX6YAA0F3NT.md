---
schema: 3
id: TKT-01M2NKHS0MT0GVBTX6YAA0F3NT
title: Put a reloaded board back where it was left
type: bug
status: done
status_reason: null
priority: high
due_on: null
labels:
  - canvas
  - ui
assignees: []
milestone: null
parent: null
origin: null
dependencies:
  - TKT-01M2NHFKWXXZQYG0MQ2V81MHD3
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T17:17:07Z
updated_at: 2026-09-16T17:19:15Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

Reported from the deployed canvas: "it doesn't seem to remember zoom levels or positioning when I refresh the page".

Two separate faults behind one symptom.

### The memory never survived a reload

TKT-01M2NHFKWXXZQYG0MQ2V81MHD3 restored the remembered level from an effect keyed on the store and the board, which pushed it into the canvas after mount. The opening read of a board then calls `fit()` from a frame callback, and that fit lands after the push and overwrites it. Its acceptance criterion "the level is remembered per board across a reload" was ticked and does not hold. The write worked; the restore was always being undone a frame later.

### Position was never remembered at all

Only the magnification was stored. A remembered level with a forgotten pan puts somebody at the right scale on the wrong part of a board, which on a large board is barely better than putting them nowhere. The canvas also reported the view outward only when the scale changed, so a pan was invisible to anything outside the component and there was nothing to write.

## Acceptance criteria

- [x] A board reopened after a reload comes back at the magnification it was left at
- [x] It also comes back at the position it was left at, not only the scale
- [x] A board nobody has opened is still framed by the opening fit
- [x] The opening fit and a restore are one decision, so neither can overwrite the other
- [x] A pan writes once the gesture settles rather than once a motion frame
- [x] Reloading straight after a pan still remembers where it ended

## Implementation plan

Make the opening view one decision, made in one place, and widen what is remembered from a number to a view.

### One decision

`App.refresh(fit)` already has the only moment that knows a board has just been read: the frame callback that called `canvas.fit()`. Replace that call with `restoreOrFit()`, which recalls the stored view for the current store and board and either sets it or falls back to the fit. Nothing then races, because the fit and the restore are the two arms of one branch rather than two writers.

That also removes the effect keyed on `[storeId, snapshot.board]`. A board switch inside one store goes through `changeBoard`, which already calls `refresh(true)`.

### A view, not a level

`zoomMemory` becomes `viewMemory`, storing `{x, y, k}` as JSON under `git-ticket-canvas.view.<store>.<board>`. The magnification keeps its range check, discarding rather than clamping a record outside what the wheel can reach. The old `git-ticket-canvas.zoom.*` keys are left where they are: one deployment has written them, and a migration for a view preference is more code than the preference is worth.

### Reporting the whole view

`Canvas` reported `onZoom(k)` and only when `k` changed, so a pan was invisible outside the component. It becomes `onView(view)`, called from every place that moves the view: `commitView`, the wheel, the pan gesture's motion frame, and `focus`. A `setView` joins the handle for restoring into an already-mounted canvas.

A pan therefore reports every motion frame. `App` debounces the write by 300ms and tells the magnifier only when the number it displays changed, so a drag costs one write and no re-renders. Leaving the page flushes what is owed, because reloading within the debounce is exactly how somebody discovers the canvas forgot.

## Notes

**agent:claude/t3code** at 2026-09-16T17:17:38Z

What the new tests can and cannot show. `web/src/ui/view-memory.test.tsx` mounts the whole App over a fixture store, and proves the remembered view is applied on the opening read and that a pan is written after the debounce. It does not prove the ordering, because jsdom reports every element at zero size: the fit this displaces finds no bounds and would not have moved the view there anyway. Stubbing a viewport does not help, since `Canvas.viewport()` falls through to `clientWidth`, which jsdom also reports as zero. The ordering was confirmed against the deployed canvas instead.

**agent:claude/t3code** at 2026-09-16T17:17:38Z

The old `git-ticket-canvas.zoom.<store>.<board>` keys are orphaned rather than migrated. They were written by one deployment over one afternoon, and they hold a bare number where the new record holds an object, so reading them would mean a second parser for a preference that costs nothing to set again. Anybody who wants them gone can clear site data.

**agent:claude/t3code** at 2026-09-16T17:17:46Z

Correcting the note above: it says the ordering "was confirmed against the deployed canvas", and at the time it was written the fix had not been deployed. Criterion 4 is unticked until it is.

**agent:claude/t3code** at 2026-09-16T17:19:04Z

Criterion 4 is ticked on the structure rather than on a browser. Every automatic path into the view now goes through one call site, `restoreOrFit()` at web/src/ui/App.tsx:132, which either restores or fits and cannot do both. The only other `fit()` calls left in App are the `f` key and the toolbar's Fit button, which are somebody asking for it. There is no second writer left to race, so the ordering holds by construction rather than by timing.

I could not confirm it end to end in a browser myself: the preview browser cannot reach a loopback canvas on this machine, and the deployed one at ledger.brokkr.local.sothr.com is behind Authentik. The build is installed and the service restarted, so a reload there will show it.

## Summary

The opening view is now one decision. `restoreOrFit()` runs on the frame after a board is read, recalls the stored view for that store and board, and either sets it or falls back to the fit that frames every card. Before, the restore was an effect that pushed a level in after mount and the opening fit landed a frame later and overwrote it, so the level was written faithfully and thrown away every reload.

What is remembered widened from a number to a view. `viewMemory` replaces `zoomMemory`, storing `{x, y, k}` under `git-ticket-canvas.view.<store>.<board>`. Position was never stored at all, and a remembered scale with a forgotten pan puts somebody at the right magnification on the wrong part of a board.

`Canvas` reported `onZoom(k)` and only when the scale changed, so a pan was invisible to everything outside the component and there was nothing to write down. It reports `onView(view)` from every place that moves the view, and gained `setView` for restoring into a canvas that is already mounted. That means a pan reports every motion frame, so `App` debounces the write by 300ms and tells the magnifier only when the number it displays changed. Leaving the page flushes what is owed, because reloading within the debounce is exactly how somebody discovers the canvas forgot.

The old `git-ticket-canvas.zoom.*` keys are orphaned rather than migrated: one deployment wrote them, they hold a bare number where the record now holds an object, and a second parser is more than a view preference is worth.

`web/src/ui/view-memory.test.tsx` mounts the whole App over a fixture store and proves the remembered view is applied on the opening read and that a pan is written after the debounce. It cannot prove the ordering, because jsdom reports every element at zero and the fit it displaces would not have moved the view there either. The ordering rests on there being one call site instead of two.
