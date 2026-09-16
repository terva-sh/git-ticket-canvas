---
schema: 3
id: TKT-01M2MEAYQBB43APVFJW17SNC5T
title: Key canvas state per user instead of per process
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - auth
  - multiuser
assignees: []
milestone: null
parent: TKT-01M2MEAP8ED8NZYGJKN2002G6J
origin: null
dependencies: []
blocks_on: none
references:
  - ref: doc:multiuser
    path: docs/multiuser-design-v1.md
claim: null
archive: null
created_at: 2026-09-16T06:26:46Z
updated_at: 2026-09-16T06:51:14Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

`internal/state/state.go` holds favorites and the last store opened, and its own doc comment calls it "what one person's canvas remembers". The file is process-global, so the moment the canvas serves two people, your favorites are everybody's favorites.

This is a bug that exists now rather than a feature for later, and it needs no identity provider to fix. Key the state on a user, with the single-user case as one constant key. Today's behaviour then becomes the one-user case of the general one rather than a second code path, and single sign-on has somewhere to put a subject when it arrives.

The file already carries `Version: 1`, so the format is extended rather than replaced, and it is already written `0o600` inside a `0o700` directory.

Grant state must not land in this file. A bug in the favorites path should not be able to corrupt a permission table, and the two have different audiences. See `docs/multiuser-design-v1.md`.

## Acceptance criteria

- [x] State is keyed by user, with a documented constant key for the no-auth case
- [x] Favorites and last-store set by one key are invisible under another
- [x] An existing version 1 file is read without loss and upgraded in place
- [x] The file keeps its 0600 mode and atomic replace
- [x] No permission or grant data is stored in this file

## Implementation plan

`internal/state` gains a user key and the callers pass one. Nothing else moves.

### The file

`State` becomes `{version, users}`, where `users` maps a key to a `UserState`
holding the favorites and last store that were at the top level. `currentVersion`
goes to 2.

`Open` unmarshals into a private `stored` struct, which is `State` plus the
version 1 fields, and folds those into `users[LocalUser]` when the file says
version 1. That is the right destination rather than a guess: a version 1 file
was written by a canvas on somebody's desk, and the desk canvas is still serving
that person.

The upgraded file is written straight away rather than at the next write. A lazy
upgrade leaves the question of whose the favorites were unanswered for as long
as nobody clicks anything, so a canvas that read the file, served it, and
stopped has decided differently from one that did not. The rewrite is
best-effort: a failure warns and the canvas runs on what it read, because
refusing to start over a file that was read perfectly well is the wrong trade.

### The keys

`LocalUser` is the constant `"local"`. `Subject(sub)` returns `"sub:" + sub`.
The prefix closes a collision that is otherwise real: a subject is an arbitrary
string the provider chose, nothing stops one issuing `local`, and an unprefixed
key would hand that person the desk canvas's favorites.

### The callers

Every method takes the key first: `Favorite(user, path)`, `SetFavorite`,
`SetLastStore`, `Snapshot(user)`, `Warm(user)`. Breaking the signatures is
deliberate, so every call site has to be revisited rather than compiling against
a default.

The registry answers the key from one method, `stateUser()`, returning
`state.LocalUser`. That is the single seam sign-on has to change, and it is a
method rather than the constant spelled at four call sites for exactly that
reason. `main.go` warms from `Warm(state.LocalUser)`.

### Tests

The property tests are what this ticket is for: one person's favorites,
last store, and warm list are invisible under another key; a subject that spells
the no-auth key does not collect the desk canvas's state; a version 1 file is
read, moved under the desk key, and rewritten with nothing left at the top
level; the rewrite lands at 0600 whatever mode the old file had.

`TestTheFileHoldsNoPermissionData` asserts the exact key set of the file and of
each entry, so it fails when any field is added rather than when somebody
guesses the name of a grant. Its failure message says where a grant belongs
instead.

## Notes

**agent:claude/t3code** at 2026-09-16T06:51:01Z

Downgrading the canvas after this loses favorites, and nothing warns.

A binary from before this change reads a version 2 file, finds no top-level
`favorites` or `lastStore`, and starts empty. It does not write until somebody
marks a favorite or switches store, and when it does it writes the version 1
shape with the `users` block gone.

This is the first version bump the file has had, so the situation did not exist
before. It is not defended against here because every defence costs something
that is worse than the failure: refusing to read a newer file would turn a
downgrade into a canvas that will not start, and keeping the version 1 fields
written beside the new ones would mean two copies of the same favorites
disagreeing after the first write under either binary.

Recorded so that whoever hits it knows the file is not corrupt and the fix is to
run the newer binary again. The version 1 file is gone by then, so the favorites
are gone with it.

## Summary

`internal/state` is keyed by user. The file is version 2, `{version, users}`,
and every method takes the key first, so a call site that did not decide whose
state it meant does not compile.

`LocalUser` is the key the desk canvas uses for everything, and `Subject(sub)`
prefixes an identity provider's subject so that a provider issuing `local`
cannot collect the desk canvas's favorites. `Registry.stateUser()` is the one
place that answers the key, returning `LocalUser`; it is the seam sign-on
changes.

A version 1 file is read, moved under `LocalUser`, and rewritten in the current
format at open rather than at the next write, so the question of whose the
favorites were is answered once by reading the file rather than by whether
anybody clicked anything afterwards. A failed rewrite warns and the canvas runs
on what it read.

Behaviour on a desk is unchanged: same routes, same responses, same 0600 file
through the same temporary-name rename.

Nothing about permissions is in the file, and `TestTheFileHoldsNoPermissionData`
asserts the exact key set of the file and of each entry, so adding one fails
with a message saying where a grant belongs instead.

The downgrade hazard the version bump creates is recorded in a note: an older
binary reads a version 2 file as empty and drops the `users` block on its next
write.

`just check` passes.
