---
schema: 3
id: TKT-01M2K0QDHEMR3M7HN1Z55NYP24
title: Key a store id on a fixed-width hash of its resolved path
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels: []
assignees: []
milestone: null
parent: null
origin: null
dependencies:
  - TKT-01M2JYXZ0W3X7PZN8QESG2BFA5
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-15T17:09:40Z
updated_at: 2026-09-15T18:02:45Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

### The problem

A store's id is derived by joining its path below the root and trimming to 64
characters. `unique` then guarantees the result is distinct within one run by
appending a hash to whichever store it reaches second.

That guarantees uniqueness and not stability. TKT-01M2JYXZ (Show a store's
directory name instead of its derived id) records the measurement: two stores
that differ only near the root trim to the same name, collide, and the second
takes a hash on a remainder cut mid-word. Adding a third store that sorts ahead
of them moved an existing id, and the bare id it vacated began resolving to the
new store, so a bookmarked `#store=` fragment opens a different store without
saying so.

There is a second instability already recorded in `state.go`, which says that
an id derived from a path relative to a root means changing `--root` renames
every store. That is why favorites are keyed on resolved paths and never on
ids.

So an id today depends on three things that are not the store: what other
stores exist, the order they were found in, and which root they were found
under.

### What to change

Make an id a pure function of the store and nothing else:

    id = trim(leaf directory name, 20) + "-" + 12 hex of sha256(discover.Key(path))

For example, `otel-collector-a3f19c2b4d1e`. At most 33 characters against 64
today.

Hash `discover.Key`, the resolved absolute path, rather than the path relative
to a root. That is already the identity function used to deduplicate stores and
to key favorites, so this makes the id agree with the identity the rest of the
code uses. It also fixes the `--root` instability and makes two symlinked
routes to one store produce one id.

### The readable prefix becomes free

Trimming is what breaks the current scheme, because uniqueness lives in the
characters being trimmed. Once uniqueness lives entirely in the hash, the
readable part carries no load and can be cut to any length with no consequence.
That is why the id can be both readable and short here when it cannot be today.

Twenty characters covers every leaf name in the real workspace, the longest
being `git-ticket-canvas` and `terva-conn-matrix` at 17.

### Hash width: 12 hex

Birthday bound, P(any collision):

| bits / hex | 22 stores | 1,000 | 10,000 | 100,000 |
|---|---|---|---|---|
| 24 / 6 | 1.4e-05 | 3.0e-02 | certain | certain |
| 32 / 8 | 5.4e-08 | 1.2e-04 | 1.2e-02 | certain |
| 40 / 10 | 2.1e-10 | 4.5e-07 | 4.6e-05 | 4.6e-03 |
| 48 / 12 | 8.2e-13 | 1.8e-09 | 1.8e-07 | 1.8e-05 |

Forty bits is already enough for any workspace a person has. Forty-eight costs
two more characters, puts a hundred thousand stores at 1.8e-05, and removes the
question. Take 12.

### Rejected: splitting the bits between the parent tree and the leaf

The proposal was a wider hash of the parent tree and a narrower one for the
leaf within it, on the reasoning that this bounds length while keeping related
stores together. It costs more than it buys.

Stores that share a parent share the parent component, so only the leaf bits
separate them. Siblings are the dense case: a workspace is mostly directories
full of sibling repositories, and the largest sibling group in the real
workspace is ten, under `git.local.sothr.com/Sothr-Containers`.

| scheme | P(collision) |
|---|---|
| 16-bit leaf, among those 10 siblings | 6.9e-04 |
| 20-bit leaf, among those 10 siblings | 4.3e-05 |
| 24-bit leaf, among those 10 siblings | 2.7e-06 |
| flat 48-bit, across all 22 stores | 8.2e-13 |

For the same total width the composite spends bits separating parent trees,
which are sparse, and starves the leaf, which is dense. It concentrates the
collision risk exactly where stores are packed most tightly.

The grouping it would buy is already on screen and better: the browser heading
names the parent tree in words, and TKT-01M2JYXZ gives each row its directory
name. A shared hex prefix is a weaker version of a heading that already reads
`git.local.sothr.com/Sothr-Containers`.

It also adds a second instability. A parent component is a fact about where a
store sits rather than about the store, so moving a tree renames every store
under it, which is the class of bug this ticket exists to remove.

### Collision handling: a startup error, never a rename

On the astronomically unlikely collision, refuse to start and name both paths,
telling the operator to give one an explicit name.

Do not lengthen the hash on collision and do not number the duplicates. Both
make an id depend on what else exists, which is precisely the defect being
fixed. A fixed width and a loud refusal keep `id = f(path)` true without
exception.

A store named on the command line or in a configuration file keeps that name as
its id, unchanged. Naming it is the instruction.

### What this breaks

Every derived `#store=` fragment changes once, including bookmarks. Those links
are already unstable, so the choice is between breaking them deliberately now
and having them break on their own later, silently and one at a time.

Accepting the old slug as an alias that resolves to the canonical id would keep
old links working and keep an id hand-typable. That is worth doing and is not
in this ticket.

### Symbolic links: resolve them, so one store has one id

`discover.Key` already resolves links, and this ticket keeps that rather than
hashing the lexical path. Verified against the real code: two roots, one a
symbolic link to the other, produce two stores and not four, and both are
reported at their real paths.

The trade-off is worth naming, because it only has one good side. Hashing the
resolved path means an id follows the store's physical location, so moving the
real directory changes the id even when the symbolic link used to reach it did
not move. Hashing the lexical path would keep the id stable across that move,
and would give one store two ids when it is reachable two ways. Two ids means
two registry entries, which means two servers, two watchers, and two locks over
one set of tickets, each writing without knowing about the other. One store
with one id and an id that can move is the better failure.

Two findings make the resolution total, so there is no second case to design
for:

- `Key` falls back to the unresolved path when nothing resolves, which would
  have been an unstable id, because a store that did not exist and then does
  would hash differently once its links resolved. It cannot happen. A walk only
  finds stores that exist, and a declared child that is not on disk is refused
  with a warning rather than becoming a store, so every derived id belongs to a
  store that is present and resolvable.
- Paths reach `Key` already absolute, because `config.Load` resolves them
  against the working directory. Verified: a relative `--root .` and an
  absolute symbolically linked root over the same tree deduplicate to one store
  each.

### Which ids are hashed

The rule is what the operator wrote, not where they wrote it. A name a person
chose is kept, in a configuration file or as `--store name=path`. A name the
canvas derived is hashed, which includes `--store path` with no name, where
`DeriveName` takes the base name today.

That is a small widening of the rule and it removes a sharp edge: two unnamed
`--store` paths whose directories share a base name currently derive one name
and fail at registration with a duplicate. Hashed, they differ.


### What it touches

`derivedName` and `unique` in `internal/api/merge.go`, which is where both
rules live today, `config.SlugName` and `MaxNameLen` in `internal/config`, and
the merge tests. The browser needs no change beyond TKT-01M2JYXZ, because a row
is keyed on `data-store` and displays its name and path.

## Acceptance criteria

- [x] A discovered store's id is its trimmed leaf directory name plus 12 hex of sha256 over discover.Key(path)
- [x] An id does not change when another store is added, removed, or found in a different order
- [x] An id does not change when --root changes
- [x] Two paths reaching one store through a symlink produce one id
- [x] Two stores differing only near the root get distinct ids, per the reproduction on TKT-01M2JYXZ
- [x] A store named on the command line or in a configuration file keeps that name as its id
- [x] A hash collision refuses startup and names both paths, rather than renaming either
- [x] Checked against the real 22-store workspace, with ids compared across two runs that differ by an added store
- [x] An unnamed --store PATH gets a hashed id, and two such paths sharing a base name no longer collide

## Definition of done

- [x] just check passes
- [x] just browser-test-embedded passes against a freshly built bundle
- [x] docs/multi-store-design-v1.md records the id scheme and why the composite hash lost

## Implementation plan

### The shape

`derivedName` stops building a slug and returns
`trim(DisplayName(path), 20) + "-" + hash`, where hash is 12 hexadecimal
characters of sha256 over `discover.Key(path)`. The readable part carries no
uniqueness, so trimming it is free, which is the whole reason it can be both
short and readable.

`unique` goes away as a rule. Uniqueness is a property of the hash, so there is
nothing to resolve by looking at what other stores exist. What replaces it is a
check: if two specs land on one id, refuse to start and name both paths. That
keeps `id = f(path)` true with no exception, which is the defect being fixed.

### What stays

An id a person wrote is kept, so `Merge`'s first loop is untouched. The rule
widens only in that `--store PATH` with no name is a derived name and gets
hashed, which needs config to record whether a name was written or derived.

### Order of work

1. The id function and its tests, including the depth reproduction from
   TKT-01M2JYXZ and a stability test that adds a store and asserts nothing
   else moved.
2. The collision refusal.
3. Config carrying "the operator wrote this name".
4. `SlugName` and `MaxNameLen` become unused by the id path. Leave them if
   configuration still validates a written name against the limit.
5. The real workspace, with ids compared across two runs that differ by an
   added store.

### Not in scope

The slug alias. Bookmarks and backward compatibility are explicitly out, per
the decision recorded on this ticket.

## Summary

A store id is now `trim(directory, 20) + "-" + 12 hex of sha256 over
discover.Key(path)`, for example `alpine-eda63a418a4e`.

### What it fixes, measured

Two runs over the real workspace, the second with a store added that sorts
ahead of the rest: 22 of 22 ids byte-identical, nothing moved. Under the slug
scheme an added store moved an existing id and the id it vacated began
resolving to a different store. The widest id went from 50 characters to 30.

`Merge` no longer resolves collisions, because there is nothing to resolve
against: an id depends on the store and not on what else was found. Two stores
claiming one id refuse startup and name both paths.

### What went with it

`unique`, `trimName`, `shortHash`, `derivedName`, and `config.SlugName` are
gone, along with the tests that asserted the rules they carried. Where a
deleted test held a property still worth having, it was rewritten rather than
dropped, and that paid for itself: the replacement for `TestSlugNameIsAlwaysValid`
immediately caught `hashedID` building ids out of unsanitized directory names
like `weird name` and `with.dots`. The leaf now goes through `config.DeriveName`,
which already held that rule.

### Three tests whose premises the change made obsolete

`TestMergeNamesADeclaredChildAfterItsParent` asserted a child's id spelled out
its parent. An id is a function of one path now, so the relationship travels in
`Parent`, which is what the browser nests by. The test asserts that instead.

`TestAFavoriteSurvivesARootChangeThatRenamesEverything` existed because
changing `--root` renamed every store. It does not any more, so the test now
holds the stronger property: neither the favorite nor the id moves.

`TestRescanAddsAndRemovesWithoutTouchingActiveStores` hand-registered the name
the old scheme derived. It registers the id `hashedID` derives now, or the
rescan reads the store as a second one sharing a path.

### Verified

`just check` passes, including `go test -race`. `just browser-test-embedded`
passes with 72 tests. `internal/api` coverage 88.6%, `internal/config` 89.9%.

### Not done

The slug alias, dropped deliberately: the ids it would have preserved are the
unstable ones, and an alias resolving to a store the slug no longer identifies
is worse than a link that fails.
