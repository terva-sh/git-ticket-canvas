---
schema: 3
id: TKT-01M2MEAYQBB43APVFJW17SNC5T
title: Key canvas state per user instead of per process
type: task
status: draft
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
updated_at: 2026-09-16T06:28:07Z
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

- [ ] State is keyed by user, with a documented constant key for the no-auth case
- [ ] Favorites and last-store set by one key are invisible under another
- [ ] An existing version 1 file is read without loss and upgraded in place
- [ ] The file keeps its 0600 mode and atomic replace
- [ ] No permission or grant data is stored in this file
