---
schema: 3
id: TKT-01M2HPBA4EZT6EGT0Q0ZCRY4F4
title: Exclude paths and directories from the store walk
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - discovery
assignees: []
milestone: null
parent: TKT-01M2HPB9WEYH5VSYB55GNYMZ8Y
origin: null
dependencies:
  - TKT-01M2HPBA301SX096MRR4YWJ58H
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-15T04:49:03Z
updated_at: 2026-09-15T05:37:01Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

Let the operator keep paths out of the walk.

Exclusions and the list of build directories to skip are one mechanism, not
two. The built-in list becomes the default value of `exclude`, which you can
extend or replace. The default is `node_modules`, `vendor`, `target`, `dist`,
and `build`. A hidden directory such as `.git` is already skipped by the walk.

An exclusion is configurable at the top level, per root, and as a repeatable
`--exclude` flag. An exclusion under a root is relative to that root. One at
the top level is an absolute path or a pattern.

Apply an exclusion during the walk, so an excluded subtree costs nothing rather
than being filtered out afterward.

### Two precedence rules

An exclusion overrides a store that another store declares as its child. The
person running the canvas outranks the project being served.

An exclusion does not apply to a store named explicitly in the configuration. A
named store is never discovered, so there is nothing for an exclusion to act
on. Naming a store and excluding the same path contradicts itself: report a
configuration warning and keep the store.

## Acceptance criteria

- [x] An excluded directory subtree is skipped during the walk, not filtered afterward.
- [x] A glob pattern such as **/node_modules excludes matching directories at any level.
- [x] The default exclusions are node_modules, vendor, target, dist, and build, and they can be extended or replaced.
- [x] A per-root exclusion resolves relative to that root; a top-level one is absolute or a pattern.
- [x] An exclusion does not remove an explicitly named store, and the contradiction is reported as a warning.

## Definition of done

- [x] go test ./... passes.

## Implementation plan

### An ambiguity in the design document, settled here

`docs/multi-store-design-v1.md` says an exclusion under a root is relative to
that root, that one at the top level is an absolute path or a pattern, and that
the defaults are `node_modules`, `vendor`, `target`, `dist`, and `build`. Those
three sentences disagree: the defaults are bare names at the top level, and a
bare name is neither absolute nor a pattern.

So an entry is classified once, by its own shape, and the same shape means the
same thing wherever it appears:

- An absolute path excludes that directory and everything below it.
- An entry holding `*`, `?`, or `[` is a pattern, matched against the candidate
  path relative to its root, where `**` spans any number of segments.
- An entry holding a separator but no pattern character is a relative path,
  resolved against the root it belongs to, and excludes that subtree.
- A bare name matches any directory with that name, at any depth under the
  root.

The bare-name rule is what makes `node_modules` work as a default, and it is
what a person means when they write one. A per-root bare name stays scoped to
its root, so it is still relative to that root in the sense the criterion asks
for.

### The pattern matcher

`path.Match` has no `**`, so a small matcher is needed. Split both the pattern
and the relative path on `/` and walk the segments, with `**` consuming any
number of them and `path.Match` deciding each ordinary segment. That keeps
`*.tmp` and `?` working per segment without a dependency.

### Defaults are applied, extended, or replaced

`config.DefaultExclude` holds the five names. They apply unless a configuration
sets `excludeDefaults: false`, and anything configured extends them. That gives
both halves of the criterion without inventing an un-exclude syntax.

Somebody who genuinely keeps a store inside one of those directories already has
an escape hatch, because naming a store with `--store` is never subject to an
exclusion.

### Exclusions and explicitly named stores

An exclusion is a rule for searching, and an explicitly named store is never
searched for, so nothing about it can be excluded. Naming a store and excluding
its path is a contradiction rather than an instruction, so report it as a
warning at startup and keep the store. The operator said two things and the more
specific one wins.

### Applied during the walk

The check runs where a child is about to be enqueued, so an excluded subtree is
never read rather than being filtered out of the results afterward. The decision
records which pattern matched, so `--scan` can later say not just that a
directory was skipped but which line of configuration skipped it.

### Tests

The matcher on its own: each of the four shapes, `**` at the start, middle, and
end, and a pattern that must not match. Then the walk: a store inside an
excluded subtree never found, a bare name matching at several depths, a per-root
exclusion not leaking into another root, defaults applied and replaced, and a
decision naming the pattern that matched. Finally the contradiction warning,
asserting the store survives.

## Notes

**agent:t3code/d30689a3** at 2026-09-15T05:32:34Z

draft to ready: The user chose it next. Its dependency, the walk, is done.

## Summary

Exclusions keep directories out of the search, as one mechanism rather than two.
The built-in list of build directories is the default value of `exclude` instead
of a separate prune list, because skipping `node_modules` and skipping a path
you named are the same request.

### An ambiguity in the design document, found and settled

`docs/multi-store-design-v1.md` said an exclusion under a root is relative to
that root and one at the top level is an absolute path or a pattern. Those two
sentences do not cover the defaults, which are bare names at the top level and
so are neither.

An entry is now classified by its own shape, and the same shape means the same
thing wherever it appears. An absolute path excludes that subtree. An entry
holding `*`, `?`, or `[` is a pattern matched against the path relative to its
root. An entry holding a separator is a relative path resolved against its root.
A bare name matches any directory with that name at any depth.

The bare-name rule is what makes `node_modules` work as a default and what
somebody means when they write one. A per-root bare name stays scoped to its
root, which is what "relative to that root" was asking for. The table is now in
the design document, with a note saying what the earlier wording missed.

### The matcher

`path.Match` has no `**`, and its `*` does not cross a separator. So the matcher
splits both sides on `/` and walks the segments, letting `**` consume any number
of them and handing each ordinary segment to `path.Match`. That keeps `*.tmp`
and `?` working per segment without a dependency.

### Defaults extend rather than replace

Setting `exclude` adds to the built-in list. Losing `node_modules` pruning by
naming one extra directory is not what anybody means. `excludeDefaults: false`
replaces the list outright, which is the other half of the criterion.

### The contradiction, and a gap the test found

An exclusion governs searching, and a store named with `--store` is never
searched for, so it survives. The contradiction is reported rather than resolved
in silence.

The first version of that check asked only whether the store's own directory
name was excluded, and the test failed. A store at
`<root>/node_modules/deliberate` is not itself named `node_modules`; its
*ancestor* is, and that ancestor is why the walk could never reach it.
`matchSelfOrAncestor` now walks up from the store to the root. The case worth
reporting is exactly the one the first version missed.

### Verified against the real workspace

Read-only throughout, so nothing could touch the repositories:

- 22 stores with no exclusions, the established baseline.
- `--exclude Sothr-Containers` leaves 12, with none of that organisation's
  repositories present. A bare name excluding a whole directory of projects.
- `--exclude '**/github.com/**'` leaves 20, with no github.com path present.
- An explicitly named store inside `node_modules` is served, and the warning
  names the store, its path, and the exclusion it contradicts.

### Verified

`just fmt-check`, `just vet`, `just test` with `-race`, `just go-only-check`,
`just tickets-check`, `just dist-verify`, and `just web-test` at 476 tests all
pass. `internal/discover` is at 95.8% and `internal/config` at 90.2%.

`TestEffectiveExclude` moved to `internal/config`, where the method it exercises
lives and where its coverage counts.

`just browser-test-embedded` did not run, because Chromium cannot start here
without `libnspr4.so`. Nothing in this change reaches the frontend.

### Left for later

A decision now records which entry excluded a directory, which is what
TKT-01M2HPBA7 (Explain discovery decisions with a --scan dry run) needs to name
the line of configuration responsible rather than only saying a directory was
skipped. Nothing renders those decisions yet.
