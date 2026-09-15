---
schema: 3
id: TKT-01M2HPBA99N3306NS2Y979FTDZ
title: Merge explicitly named stores with discovered ones
type: task
status: done
status_reason: The two sets are one list, keyed on the resolved store, and the merge lives beside the registry where a rescan can reach it.
priority: normal
due_on: null
labels:
  - discovery
  - config
assignees: []
milestone: null
parent: TKT-01M2HPB9WEYH5VSYB55GNYMZ8Y
origin: null
dependencies:
  - TKT-01M2HPBA301SX096MRR4YWJ58H
blocks_on: none
references: []
claim:
  actor: agent:t3code/d30689a3
  branch: t3code/orient-upstream-review-tickets
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-d30689a3
  commit: 6d91912e874a67043178c79db7d351f78d8986b7
  session: null
  claimed_at: 2026-09-15T06:06:02Z
  expires_at: null
archive: null
created_at: 2026-09-15T04:49:03Z
updated_at: 2026-09-15T06:12:50Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

Combine the stores named in configuration with the stores a walk found.

A store named explicitly is always in the list. Root, depth, exclusions, and
the store-boundary rule do not apply to it, because you named it. Being in the
list is not the same as being healthy: a named store that is no longer on disk
appears as unavailable with the reason, rather than vanishing.

The merge key is the absolute path after resolving symbolic links, so
`~/src/foo`, `/home/you/src/foo`, and a discovered `/home/you/src/foo` are one
store and not three.

When the two overlap, everything the explicit entry sets wins: its name, its
actor, and its read-only setting. Discovery contributes only the fact that the
store was also found.

### Naming a discovered store

An id appears in a URL, so it is restricted to letters, digits, `-`, and `_`,
the character set `validBoardName` already enforces. A named store uses its
name. A discovered store derives one from its path relative to its root, with
`/` becoming `_` and any other illegal character becoming `-`. A collision
between two roots is broken by a short hash of the path. A declared child
derives its id from its parent's id and its relative path, so children sort
next to their parent.

## Acceptance criteria

- [x] An explicitly named store appears in the list regardless of root, depth, or exclusions.
- [x] A named store missing from disk is listed as unavailable with a reason.
- [x] A named store and a discovered store at the same resolved path produce one entry, and the named entry's fields win.
- [x] Two paths that differ by a symbolic link or by ~ expansion merge into one store.
- [x] A discovered store's id is URL-safe, derived from its path relative to its root, and stable across runs.

## Definition of done

- [x] go test ./... passes.

## Implementation plan

### Identity is a resolved path, and it belongs to the walk

`discover.Key(path)` answers what store a path refers to: the nearest directory
at or above it holding a valid store, with symbolic links resolved. A path that
resolves to nothing keeps its cleaned absolute form, because a store named and
missing must still be listed rather than dropped.

Walking up matters as much as resolving links. `--store .` run from inside a
repository names a subdirectory, while a search finds the repository, and
without the walk up those are two stores with one set of tickets between them.

The walk uses the key while it runs rather than filtering afterward, so a
discovered duplicate of an explicitly named store never becomes a `Found` and
`--scan` says why. `seen` becomes a small `visited` holding both maps: the
lexical paths that stop the walk repeating itself, and the resolved keys that
decide identity. Only a directory that is a store gets a key computed, so this
costs one resolution per store rather than one per directory.

### The merge is about names and settings, and it belongs beside the registry

`api.Merge(cfg, found, opts)` returns the stores to serve, in order, and the
notes to log. `main.go` keeps none of it, because a later rescan needs the same
rule and `main.go` will not be running then.

An explicitly named store comes first, in configured order, and is served
whatever a root, a depth, or an exclusion says, because naming it is the
instruction. Everything the explicit entry sets wins: its name, its actor, and
its read-only setting. A discovered store contributes only the fact that it was
also found, which becomes one note. The global `--read-only` still forces
read-only over either, since a flag that only sometimes refuses writes is worse
than no flag.

### Naming

An id appears in a URL. An explicit store uses its configured name, which
`config` already validates. A discovered store uses `config.SlugName` against
its root. A declared child uses the name its parent gave it when a URL can hold
it, and otherwise its parent's id joined to its own relative path, so children
sort next to their parent.

A collision is broken by appending six hexadecimal characters of a hash of the
resolved key, truncating the name first if the two together would pass the
64-character limit. The current code skips a colliding discovered store with a
log line, which silently costs you a store; a hash keeps both and stays the same
between runs. The key is resolved rather than lexical, so the suffix does not
change when the same store is reached by a different path.

### Tests

For identity: two roots reaching one store through a symbolic link give one
entry; `~/project` named explicitly and `/home/.../project` discovered give one
entry, with `HOME` set for the test; a path inside a repository and the
repository itself give one entry.

For the merge: an explicit entry's name, actor, and read-only setting survive a
discovery that disagrees; an explicit store outside every root and one inside an
excluded directory are both served; a named store that is not on disk is listed
as unavailable with a reason; two roots that slug to the same name keep both
stores, with ids that are URL-safe, and that do not change on a second run.

## Notes

**agent:t3code/d30689a3** at 2026-09-15T05:30:53Z

Discovered stores are already wired into the registry, in
TKT-01M2HPBA3 (Walk a root for ticket stores with a bounded depth). That was
done there rather than left here so `-R` would not parse into nothing, which is
the trap this project already hit with per-store `readOnly`.

What exists is the minimum. A discovered store is named by
`config.SlugName`, and one whose path or name a configured store already holds
is skipped with a log line in `main.go`.

What this ticket still owns is the real rule. Merging on absolute path after
symbolic links are resolved, rather than on the configured path string, so that
`~/src/foo` and `/home/you/src/foo` are one store. An explicit entry winning
every field it sets. An explicit store staying in the list even when it is
outside every root or below a boundary. And a short hash breaking a collision
between two roots that slug to the same name, which the current skip would
silently drop instead.

Move that logic out of `main.go` while you are there. It belongs beside the
registry, because rescan will need it and `main.go` will not be running then.

**agent:t3code/d30689a3** at 2026-09-15T06:06:02Z

draft to ready: The user chose it next. Its dependency, the walk, is done, and --scan now gives the merge a place to show its work.

**agent:t3code/d30689a3** at 2026-09-15T06:12:50Z

in-progress to done: The two sets are one list, keyed on the resolved store, and the merge lives beside the registry where a rescan can reach it.

## Summary

The stores named in configuration and the stores a walk found are now one list.

### Identity, in the walk

`discover.Key` answers what store a path refers to: the nearest directory at or
above it holding a valid store, with symbolic links resolved. The walk uses it
while it runs, so a candidate that is a store already in the list never becomes
a result, and `--scan` names the entry it matched instead of leaving the
duplicate to be filtered out later.

Walking up earns its place beside resolving links. `--store .` run from inside a
repository names a subdirectory while a search finds the repository, and
`ticket.Discover` opens the same store for both. A key that stopped at the
resolved path would have served one set of tickets twice under two names.

`seen` became `visited`, holding two maps that answer different questions: the
lexical paths that stop the walk repeating itself, and the resolved keys that
decide identity. Only a directory that is a store gets a key computed, so this
costs one resolution per store rather than one per directory.

### Naming and settings, beside the registry

`api.Merge` returns the stores to serve and the notes to log. `main.go` keeps
none of it, because a rescan needs the same rule and `main.go` will not be
running then.

An explicitly named store comes first, in configured order, whatever a root, a
depth, or an exclusion says. Its name, its actor, and its read-only setting all
win, and the global `--read-only` still forces read-only over either.

A collision between two derived names appends six hexadecimal characters of a
hash of the store's resolved key. The old code skipped the second store with a
log line, which silently cost you a store for the ordinary case of two roots
each laid out as `org/repo`. The hash is taken over the key rather than a
counter, so an id is the same on the next run and does not move when another
store is added ahead of it.

### Verified

`just test`, `just vet`, and `just tickets-check` pass. `internal/api` is at
87.7% coverage with 11 new tests, covering each identity case, the explicit
entry winning every field, a named store that is not on disk, collisions kept
and stable, and a declared child named after its parent.

Run against real data, four ways. Naming the working directory and also giving
it as a root lists one store and explains the second sighting. Naming
`workspace/ledger` alongside a search of `workspace` gives 22 stores rather than
23. Naming a store through a symbolic link, and naming a subdirectory inside
one, each merge with the discovered entry; served, the subdirectory case opens
`/tmp/kids/tree/real/project/.tickets` under the configured name. A plain search
of the workspace still serves 22 stores, all available.

Not run: the visual suite. Chromium cannot load `libnspr4.so` on this machine
and installing the library needs a password. Unchanged from the six commits
before this one.
