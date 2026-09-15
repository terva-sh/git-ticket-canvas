# Serving many ticket stores from one canvas

Today `git-ticket-canvas` serves one store. You pass `--store`, the process
discovers one `.tickets` directory, and everything from that point down assumes
there is exactly one: one actor, one read-only setting, one file watcher, one
set of API routes.

Anybody who keeps work in more than one repository runs more than one copy on
more than one port and keeps the ports in their head. This document describes
serving a list of stores from one process, and browsing a whole tree of them,
so that planning across repositories is one pane instead of six tabs.

The stores stay independent. No ticket in one store references a ticket in
another, no board spans two stores, and nothing here changes what a store is.
The canvas learns to hold several of them at once and to switch between them.

## What this does not do

One store is visible on the canvas at a time. Switching stores resets the
canvas the way switching boards already does.

Rendering tickets from several stores together on one canvas was considered and
rejected for this version. It needs namespaced ticket IDs, a decision about
where a layout spanning two stores would be persisted, and a per-card badge
saying where each card came from. None of that is needed to stop running six
processes, which is the problem in front of us. Ruling it out now also keeps
one browser connection open instead of one per store, which matters because
browsers cap concurrent connections per origin.

If an aggregate view is ever wanted, the wire format here does not prevent it.
The store key is in the URL path, so a client that wanted two stores at once
could ask for both.

## How a store gets into the list

Three ways, and they combine.

**Named explicitly**, in a configuration file, in the `GIT_TICKET_CANVAS_STORES`
environment variable, or in a repeatable `--store` flag. A `--store` flag beats
the environment variable, and the environment variable beats the file. The file
is the durable form, the environment variable suits a container, and the flag
suits one session.

```yaml
roots:
  - path: ~/workspace
    depth: 4
stores:
  - name: acme-infra
    path: ~/src/acme/infra
  - name: personal
    path: ~/notes
    readOnly: true
```

**Found by walking a tree**, when you pass `--root` and `-R`. This is how you
point the canvas at a directory of checkouts and get all of them.

**Declared by a store you already have**, when that store's own configuration
names child directories that are also stores. A project decides what it
exposes. The canvas does not guess.

An explicitly named store is always in the list. Root, depth, exclusions, and
the store-boundary rule below do not apply to it, because you named it. Being
in the list is not the same as being healthy: a store you named that is no
longer on disk appears as unavailable, with the reason, rather than vanishing.

When a walk finds a store you also named, the two are one entry. The merge key
is the absolute path after symbolic links are resolved, so `~/src/foo`,
`/home/you/src/foo`, and a discovered `/home/you/src/foo` are one store and not
three. Everything the explicit entry sets wins: its name, its actor, and its
read-only setting. Discovery contributes only the fact that the store was also
found.

## Walking a tree

```
--root PATH        repeatable. Defaults to the --store directory.
-R, --recursive    optional depth. Default 4.
--depth N          the same setting, spelled so it cannot be misread.
```

From each root, examine directories level by level, with the root at level 0.
At each directory:

1. Test for `.tickets/config.yml`. If the file exists and parses as YAML, this
   directory is a store. Do not descend below it.
2. Otherwise, if the level is below the depth limit, examine the children that
   are directories, are not symbolic links, are not hidden, and are not
   excluded.

Two details in that loop are easy to get wrong, so they are stated separately
here and tested separately in the code.

The first is that `.tickets` is itself a hidden directory. "Do not descend into
a hidden directory" and "do look for a hidden `.tickets` child" are two rules.
Collapsing them into one hidden check finds nothing at all.

The second is that symbolic links to directories are not followed. That makes
the walk terminate because it cannot revisit a directory, rather than because
it detects that it has.

### Why the default depth is 4

A workspace organized as `forge/org/repo` puts a store three levels below its
root. Four covers that with one level to spare, and it covers `org/repo` when
the root is a single forge.

The number is not about speed. On a workspace holding 22 stores, a bounded walk
takes about ten milliseconds, and raising the limit from 4 to 6 does not make
it slow. The number is about what the walk picks up.

On the workspace this was measured against, depth 4 finds 22 stores and all 22
are real projects. Going deeper finds three more, and all three are test
fixtures committed inside a repository: the canvas keeps its own baseline
fixture at `docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets`,
which is a complete 30-ticket store. An unbounded walk puts test fixtures in
your store picker.

To measure a tree yourself:

```sh
find "$ROOT" -maxdepth 8 -type d -name .tickets \
  | sed "s|^$ROOT/||; s|/.tickets$||" \
  | awk -F/ '{print NF"  "$0}' | sort -n
```

The first column is the number of levels below the root, which is the number
`--depth` takes.

### Stopping at a store

The walk does not descend into a directory that is a store. What a store keeps
below itself is that store's own material, and listing it is that store's
decision rather than the canvas's.

This rule, not the depth limit, is what keeps the canvas fixture out of the
list. Depth 4 happens to exclude it as well, but depth is a number somebody
will raise, and the boundary rule holds at any depth. Measured on a real
workspace: 22 stores at depth 4 and the same 22 at depth 8, with none of the
three committed fixtures appearing at either.

### A .tickets that is a symbolic link is not a store

Test for the store directory with `lstat` rather than `stat`, and require a
real directory.

A `.tickets` that is a symbolic link is an alias for a store kept somewhere
else, and the walk finds that store at its real path. Following the link would
list one store twice under two names. Worse, it would make the directory
holding the alias a boundary, so a workspace root with a convenience link such
as `.tickets -> ledger/.tickets` would hide every project underneath it.

That is not hypothetical. It is exactly what the first working version of the
walk did on a real workspace: one store found instead of 22. No temporary tree
in the tests had that shape, and `find -type d -name .tickets` does not match a
symbolic link either, so the original survey had not shown it. Pointing the
walk at real data is what found it.

## A store exposing its own children

A repository that genuinely keeps a store inside a store can say so, in its own
`.tickets/config.yml`:

```yaml
canvas:
  children:
    - path: docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets
      name: canvas-fixture
      readOnly: true
```

This is the opt-in that overrides the store-boundary rule, for the paths named
and for nothing else. It applies whether the parent store was named explicitly
or found by a walk, because it describes the store rather than how the store
was reached.

### Why the key goes in config.yml

`git ticket` reports `unknown_field` as an error, which made this look unsafe.
It is not: that finding applies to ticket files, not to the store
configuration. Verified against `git-ticket` v0.14.3 on a scratch store, with a
`canvas:` key added to `.tickets/config.yml`:

- `git ticket check --strict` reports no problems.
- `git ticket check --fix --dry-run --strict`, which is what CI runs, reports
  no problems.
- `git ticket create` succeeds, and the `canvas:` key is still there afterward.
  Ticket writes do not rewrite the store configuration.
- `git ticket config` only prints. It has no flag that writes, so no command in
  the tool rewrites the file.

The key is tolerated rather than guaranteed, so two things follow. Keep
everything under the single `canvas:` key, which leaves one thing to upstream
if `git ticket` ever validates its configuration strictly. Treat the key as
optional: absent, empty, or malformed must mean "no children" and must never
make the store fail to open.

The fallback, if that day comes, is a sibling file at `.tickets/canvas.yml`.

Do not put this in `.tickets/canvas/`. That directory holds board layouts, and
`layout.Store.Boards` lists every `*.yml` in it, so a file placed there appears
in the board picker as a board.

### Rules on a declared child path

This configuration is read from a repository that you might not have written,
so a declared path is checked before it is used:

- The path must be relative. An absolute path is rejected.
- After normalization and after symbolic links are resolved, the path must
  still be inside the declaring store's own directory. That rejects an escape
  through `..` and an escape through a symbolic link, which are two different
  ways out.
- The child must pass the same validity test as any other candidate.
- A chain of children is bounded, three deep by default, and every path visited
  is recorded by absolute path so that a cycle ends.

A declared child that fails any of these checks is a warning on the parent
store, shown in the browser view. It is not a failure, because one bad entry
must not hide the project that declared it.

## Excluding things

Exclusions and the list of build directories to skip are one mechanism, not
two. The built-in list is the default value of `exclude`, and you can extend or
replace it.

```yaml
exclude:
  - /home/you/workspace/some-org
  - "**/node_modules"
roots:
  - path: ~/workspace
    depth: 4
    exclude:
      - archive
```

A repeatable `--exclude` flag does the same thing.

An earlier version of this section said that an exclusion under a root is
relative to that root and one at the top level is an absolute path or a pattern.
Those two sentences did not cover the defaults, which are bare names at the top
level and so are neither. An entry is classified by its own shape instead, and
the same shape means the same thing wherever it appears:

| Shape | Example | Meaning |
|---|---|---|
| Absolute path | `/home/you/workspace/some-org` | That directory and everything below it |
| Holds `*`, `?`, or `[` | `**/node_modules` | A pattern against the path relative to the root, where `**` spans any number of segments |
| Holds a separator | `old/stuff` | A relative path resolved against its root, and that subtree |
| Bare name | `node_modules` | Any directory with that name, at any depth under the root |

The bare-name rule is what makes `node_modules` work as a default, and it is
what somebody means when they write one. A per-root bare name stays scoped to
its root.

`path.Match` has no `**` and its `*` does not cross a separator, so the matcher
walks the segments itself and hands each ordinary segment to `path.Match`.

The default value is `node_modules`, `vendor`, `target`, `dist`, and `build`. A
hidden directory such as `.git` is already skipped. Setting `exclude` extends
that list rather than replacing it, because losing the defaults by naming one
extra directory is not what anybody means. To replace it, set
`excludeDefaults: false`.

Exclusions are applied during the walk, so an excluded subtree costs nothing
rather than being filtered out afterward.

An exclusion overrides a store that declares itself a child of another. The
person running the canvas outranks the project being served.

An exclusion does not apply to a store you named explicitly. A store you name
is never discovered, so there is nothing for an exclusion to act on. Naming a
store and excluding the same path contradicts itself, so report it as a
configuration warning and keep the store.

## Explaining the result

Depth, exclusions, the store-boundary rule, declared children, and explicit
entries all interact. "Why is my store not in the list" has five possible
answers, so the tool answers it directly:

```
$ git-ticket-canvas --scan
~/workspace  depth 4
  ok   ledger                          store
  ok   forge/org/project               store
  skip forge/other-org                 excluded (config: exclude[0])
  skip forge/org/project/docs          not descended (store boundary)
  ok   forge/org/project/docs/fixture  child (declared by forge/org/project)
  skip forge/org/project/node_modules  excluded (default)
```

`--scan` runs discovery, prints one line per candidate with the reason, and
exits without starting a server. It is also how the walk is tested: the test
asserts against this output.

## Opening a store, and when

Finding a store is cheap. Opening one is not: it costs a file watcher, a
snapshot build, and a goroutine, and a file watcher is one inotify instance.

That matters at the scale a walk produces. On the workspace measured above, a
walk finds 22 stores. A Debian 13 workstation reports 128 in
`/proc/sys/fs/inotify/max_user_instances`, and that budget is shared with every
editor and every other tool the user is running. Opening every store found
would spend a sixth of it on a canvas that is showing one store. Pointing
`--root` at a home directory would be worse. Read the limit with:

```sh
cat /proc/sys/fs/inotify/max_user_instances
```

So discovery and activation are separate, and a store is in one of two tiers.

| Tier | What is known | Cost |
|---|---|---|
| discovered | id, name, path, root, whether the configuration parses, whether it is a favorite | none |
| active | the above, plus ticket counts, health, generation, ETag, and live events | one inotify instance |

Every store found is discovered, so the picker lists all of them at once. A
store becomes active when you first look at it. Favorites and the last store
you used are activated at startup, so the common case is already warm. A store
that nobody has looked at for a while is closed again.

A limit on how many stores may be active at once fails with a clear message.
That limit is still needed with lazy activation, because nothing stops somebody
marking forty stores as favorites.

Activation is where a store can fail, and a failure is contained: a store that
cannot be opened is marked unavailable with its reason, and the others carry
on. This is a change from today, where a single unreadable store stops the
process from starting.

## Naming a store

A store's id appears in URLs, so it is restricted to letters, digits, `-`, and
`_`, which is the character set `validBoardName` already enforces for boards.

A store you named uses that name. A store found by a walk derives one from its
path relative to its root, with `/` becoming `_` and any other illegal
character becoming `-`. A collision between two roots is broken by a short hash
of the path. A declared child derives its id from its parent's id and its
relative path, which makes children sort next to their parent.

Favorites and the record of the last store used are keyed by absolute path and
never by id. Changing `--root` changes every derived id at once, and a favorite
that is keyed by id would be lost.

## HTTP

The store key goes in the path.

```
GET    /api/stores                        the list, with tier, favorite, and root
GET    /api/stores/{store}/board?board=
GET    /api/stores/{store}/schema
GET    /api/stores/{store}/events
POST   /api/stores/{store}/tickets
PATCH  /api/stores/{store}/tickets/{id}
DELETE /api/stores/{store}/tickets/{id}
PUT    /api/stores/{store}/layout
PUT    /api/favorites
POST   /api/stores/rescan
GET    /api/version                       build identity, not tied to a store
```

A path prefix rather than a `?store=` parameter, for three reasons. An ETag is
scoped to a URL, so a separate path means a `304 Not Modified` for one store
can never be matched against another store's cached body. The event stream gets
its own URL per store, which keeps the browser's reconnection behavior separate
per store without any work. And the store is visible in a log line and in the
network panel without parsing a query string.

`POST /api/stores/rescan` walks the roots again without a restart. It updates
the discovered set and must not disturb a store that is currently active.

### One store behaves exactly as it does today

When exactly one store is configured, the flat routes stay mounted and behave
as they do now, so `git-ticket-canvas --store .` is unchanged. The flat routes
are deliberately not mounted when there is more than one store, because then
they would have to guess which store they meant.

## Where the code changes

`api.Server` already holds exactly one store, one `layout.Store` rooted at that
store's path, one coordinator, one actor, and one mutation lock. Nothing in it
assumes it is the only one.

So the work goes above `Server` rather than inside it. A registry owns several
of them and routes by store key. `Server.Handler` splits so that the same
handlers can mount under a path prefix. The existing tests in `internal/api`
construct a `Server` directly and keep passing without modification, which is
the main reason to prefer this shape over threading a store key through every
handler.

The browser client gains a store-scoped base path, and `TicketStore` gains
`selectStore`, which resets more than `selectBoard` does. It must clear the
ticket map as well, because that map is keyed by ticket ID and an entry from
the previous store would otherwise survive into the next one.

## Browsing

A picker holding 22 entries is a list, not a menu. The toolbar keeps a compact
control that shows the current store, its favorites, and recent stores. A
dedicated browser view holds the rest: search, favorites first, grouped by root
and then by the leading segments of each path, each row showing the path and
whether the store is available.

Favorites live in a state file outside every repository, keyed by absolute
path. They are not written into the configuration file, because that file is
written by hand and a tool that rewrites it would lose the comments and the
formatting.

## Risks

`-R 3` does not do what it looks like. Go's flag package allows a flag with an
optional value to be written as `-R` or as `-R=3`, but never as `-R 3`. Written
with a space, `3` becomes a stray positional argument and the depth silently
stays at its default. The parser must reject leftover positional arguments, and
`--depth` exists as the spelling that cannot be misread.

A root that is slow is not bounded by any of the three limits. Depth,
exclusions, and the store-boundary rule all bound how much of a tree is
visited. None of them bounds a filesystem that answers slowly, such as a
network mount, so the walk needs a timeout as well.

Discovery changes the list underneath a running browser. A rescan must let the
picker reconcile its list without disturbing the store being viewed.
