---
schema: 3
id: TKT-01M2HPBAHWAA9G2JS3V6X97D61
title: Cover store switching with a two-store browser fixture
type: task
status: draft
status_reason: null
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
claim: null
archive: null
created_at: 2026-09-15T04:49:04Z
updated_at: 2026-09-15T04:49:04Z
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

- [ ] A two-store fixture starts the server over two isolated temporary stores.
- [ ] Switching stores rebuilds the canvas and reconnects the event stream to the new store.
- [ ] No ticket, card, or schema value from the first store is visible after switching.
- [ ] An unavailable store appears in the picker with its reason.

## Definition of done

- [ ] just browser-test-embedded passes.
