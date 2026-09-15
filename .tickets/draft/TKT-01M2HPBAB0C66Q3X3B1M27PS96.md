---
schema: 3
id: TKT-01M2HPBAB0C66Q3X3B1M27PS96
title: Open discovered stores lazily and evict idle ones
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - api
  - discovery
assignees: []
milestone: null
parent: TKT-01M2HPB9WEYH5VSYB55GNYMZ8Y
origin: null
dependencies:
  - TKT-01M2HPB9ZNGE7YGDZ6RZHB4PFJ
  - TKT-01M2HPBA99N3306NS2Y979FTDZ
blocks_on: none
references:
  - ref: design:multi-store-v1
    path: docs/multi-store-design-v1.md
claim: null
archive: null
created_at: 2026-09-15T04:49:03Z
updated_at: 2026-09-15T04:49:34Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

Separate finding a store from opening one.

Finding a store is cheap. Opening one costs a file watcher, a snapshot build,
and a goroutine, and a file watcher is one inotify instance.

That matters at the scale a walk produces. A walk over the workspace measured
in docs/multi-store-design-v1.md finds 22 stores, and a Debian 13 workstation
reports 128 in `/proc/sys/fs/inotify/max_user_instances`, shared with every
editor the user is running. Opening every store found would spend a sixth of
that budget on a canvas showing one store. Pointing `--root` at a home
directory would be worse.

So a store is in one of two tiers. Discovered costs nothing and knows the id,
name, path, root, whether the configuration parses, and whether it is a
favorite. Active costs one inotify instance and adds ticket counts, health,
generation, ETag, and live events.

Every store found is discovered, so the picker lists all of them at once. A
store becomes active when somebody first looks at it. Favorites and the last
store used activate at startup, so the common case is already warm. A store
nobody has looked at for a while closes again.

A limit on how many stores may be active at once fails with a clear message.
That limit is still needed with lazy activation, because nothing stops somebody
marking forty stores as favorites.

This reverses the eager activation assumed earlier in planning. The measurement
above is why.

`POST /api/stores/rescan` walks the roots again without a restart. It updates
the discovered set and must not disturb a store that is currently active.

## Acceptance criteria

- [ ] GET /api/stores lists every discovered store without opening any of them.
- [ ] A store opens on first access, and only then does it hold a file watcher.
- [ ] Favorites and the last store used are opened at startup.
- [ ] A store idle beyond the configured period is closed, and reopens correctly on next access.
- [ ] Exceeding the active-store limit fails with a message naming the limit, not by exhausting inotify instances.
- [ ] POST /api/stores/rescan updates the discovered set and leaves active stores untouched.

## Definition of done

- [ ] A test asserts the watcher count matches the number of active stores, not discovered ones.
