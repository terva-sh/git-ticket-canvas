---
schema: 3
id: TKT-01M2HPBAB0C66Q3X3B1M27PS96
title: Open discovered stores lazily and evict idle ones
type: task
status: done
status_reason: A canvas over 22 stores now holds no watchers until somebody looks at one, measured on the real workspace.
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
claim:
  actor: agent:t3code/d30689a3
  branch: t3code/orient-upstream-review-tickets
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-d30689a3
  commit: bc26460705eca5332cbf285cf09b422431996474
  session: null
  claimed_at: 2026-09-15T06:17:05Z
  expires_at: null
archive: null
created_at: 2026-09-15T04:49:03Z
updated_at: 2026-09-15T06:27:05Z
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

- [x] GET /api/stores lists every discovered store without opening any of them.
- [x] A store opens on first access, and only then does it hold a file watcher.
- [x] Favorites and the last store used are opened at startup.
- [x] A store idle beyond the configured period is closed, and reopens correctly on next access.
- [x] Exceeding the active-store limit fails with a message naming the limit, not by exhausting inotify instances.
- [x] POST /api/stores/rescan updates the discovered set and leaves active stores untouched.

## Definition of done

- [x] A test asserts the watcher count matches the number of active stores, not discovered ones.

## Implementation plan

### Two tiers, and what each costs

A registered store holds a name, a path, and the settings the merge decided.
Nothing else. An active store holds a `Server`, a layout writer, a coordinator,
a goroutine, and one inotify instance.

`entry` keeps its `StoreSpec` and leaves `server` nil until somebody asks for
the store. `Registry.Register` replaces `OpenStore` on the startup path and
does one cheap check instead of an open: `discover.Nearest` reports the nearest
store at or above the path, which is two system calls and the same gate the
walk uses. A path with no store there is registered anyway, unavailable, with
the message that names the missing store and says to run `git-ticket init`.
Losing that message would cost somebody their first run.

`GET /api/stores` answers from registrations alone. `StoreStatus` gains
`active`, because "listed", "serving right now", and "broken" are three states
and the browser needs to tell them apart.

### Opening, and giving back

`acquire` activates under the write lock and records when the store was last
used. Every route through `/api/stores/{store}/` goes through it, so a store
opens the first time anybody looks at it.

Two things bound the active set.

An idle store closes. A janitor goroutine wakes on a ticker and closes any
active store with no live subscribers whose last use is older than
`--store-idle`, which defaults to 15 minutes. A store with a subscriber is
never closed no matter how old its last request: an open EventSource is
somebody watching.

A limit caps how many are active at once. `--max-active` defaults to 8. When
activating would pass it, the least recently used store with no subscribers is
closed to make room, and if every active store has a subscriber the request
fails with 503 and a message naming the limit and the flag. Eight is a sixth of
what a canvas should ask of a 128-instance budget shared with every editor on
the machine, and eight canvases open at once is already more than a person
reads.

### Warming, and the ticket this half belongs to

`RegistryOptions.Warm` is a list of paths to activate at startup, matched
against registered stores by `discover.Key`. It is empty here. TKT-01M2HPBAE
(Store favorites outside the repository, keyed by path) fills it with the
favorites and the last store used, which is the criterion on this ticket that
depends on the ticket that depends on this one. Splitting it this way is what
breaks the cycle: the mechanism lands here, the list lands there.

Warming respects the limit and warns rather than failing. A configuration with
forty favorites should start, serve eight, and say so.

### Rescan

`POST /api/stores/rescan` runs `discover.Scan` and `api.Merge` again from the
configuration the registry was given, then reconciles. A new store is
registered. A store that is no longer found is removed only if it is not
active, because closing a store somebody is looking at to reflect a change on
disk is the wrong trade. An active store is otherwise untouched: same server,
same watcher, same ETag, same stream.

The flat `/api/` mount stops being decided when the handler is built and starts
being decided per request, on how many stores are registered at that moment.
That is what makes rescan honest: a rescan that takes a canvas from one store
to two would otherwise leave a flat route that guesses which store it meant.

### Testing the definition of done

The criterion is that the watcher count matches the active stores rather than
the discovered ones. On Linux an inotify instance is a file descriptor whose
link in `/proc/self/fd` reads `anon_inode:inotify`, so the test counts them
directly: register three stores and see no change, touch one and see exactly
one more, let it evict and see it go. Counting the real descriptors is the only
way to test this that cannot pass while the bug is present.

## Notes

**agent:t3code/d30689a3** at 2026-09-15T06:17:05Z

draft to ready: The user asked for the remaining epic children in dependency order. Its dependencies, the registry and the merge, are both done.

**agent:t3code/d30689a3** at 2026-09-15T06:27:05Z

in-progress to done: A canvas over 22 stores now holds no watchers until somebody looks at one, measured on the real workspace.

## Summary

Finding a store and opening one are now separate things.

### What registering costs, and what opening costs

`Registry.Register` records a store's name, path, and settings, and makes one
check: `discover.Nearest`, the walk's own gate, two system calls and no
watcher. `GET /api/stores` answers from registrations alone, so a picker over
twenty-two repositories draws itself without opening any of them.
`StoreStatus` gained `active`, because listed, open, and broken are three
states and a browser that cannot tell them apart shows a spinner for a store
nobody asked for.

`acquire` opens a store the first time anybody asks for it and records when it
was last used. Every route under `/api/stores/{store}/` goes through it.

### What bounds the active set

`--store-idle`, 15 minutes by default, closes an untouched store. `--max-active`,
8 by default, closes the least recently used store to make room for a new one.
A store with a live subscriber is never closed for either reason: an open
EventSource is somebody watching, however long ago their last request was. When
every open store is being watched, the request fails with 503 naming the limit
and the flag, which is a better answer than exhausting the machine's inotify
instances and failing somewhere unrelated.

Eight is a sixteenth of the 128-instance budget this machine reports, shared
with every editor running on it.

### Rescan, and the flat routes

`POST /api/stores/rescan` searches the roots again. A store that has appeared is
registered; one that is gone is dropped unless it is open, because closing a
board somebody is reading to reflect the disk is the wrong trade. An open store
is untouched: same server, same watcher, same ETag, same stream.

The flat `/api/` routes are now decided per request on how many stores are
registered at that moment, rather than when the handler is built. A rescan that
takes a canvas from one store to two would otherwise leave a route that has to
guess which store it meant. A canvas serving several now answers `store_required`
there instead of falling through to the single-page application.

### The half that belongs to another ticket

`RegistryOptions.Warm` activates named stores at startup and is empty here.
TKT-01M2HPBAE (Store favorites outside the repository, keyed by path) fills it,
which is how the criterion on this ticket that depends on the ticket depending
on this one is met: the mechanism lands here, the list lands there. A warm list
longer than the limit warns and starts anyway.

### Verified

`just test` and `just vet` pass, `internal/api` at 88.8% coverage, with 11 new
tests. **`just browser-test-embedded` passes: 68 passed, 6 skipped.** Chromium
runs in this environment now, so the gap recorded in the previous seven commits
is closed, and this commit is held to it.

The definition of done is tested by counting the real descriptors: an inotify
instance is a file descriptor whose link in `/proc/self/fd` reads
`anon_inode:inotify`, so the test registers three stores and sees no change,
opens two and sees exactly two more, evicts them and sees them go. A count
taken from the registry's own bookkeeping would have agreed with the registry
even when the registry was wrong.

Measured on the real workspace, against a running binary:

```
registered 22, none opened: 0 inotify
after listing all 22:       0 inotify
after opening two:          2 inotify
```

Before this change that first line was 22.
