---
schema: 3
id: TKT-01M2HPBA60FP1Y0TK81HHYZT0H
title: Let a store declare child stores in its own config
type: task
status: draft
status_reason: null
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

Let a store declare that specific directories below it are also stores.

A repository that genuinely keeps a store inside a store can say so in its own
`.tickets/config.yml`. This is the opt-in that overrides the store-boundary
rule from TKT-01M2HPBA3 (Walk a root for ticket stores with a
bounded depth), for the
paths named and for nothing else. It applies whether the parent store was named
explicitly or found by a walk, because it describes the store rather than how
the store was reached.

```yaml
canvas:
  children:
    - path: docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets
      name: canvas-fixture
      readOnly: true
```

### Why the key is safe in config.yml

`git ticket` reports `unknown_field` as an error, which makes this look unsafe.
It is not: that finding applies to ticket files, not to the store
configuration. Verified against git-ticket v0.14.3 on a scratch store with a
`canvas:` key added. `git ticket check --strict` reports no problems, so does
`git ticket check --fix --dry-run --strict` which is what CI runs, `git ticket
create` succeeds with the key still present afterward, and `git ticket config`
has no flag that writes.

The key is tolerated rather than guaranteed, so keep everything under the one
`canvas:` key, which leaves a single thing to upstream if git-ticket ever
validates its configuration strictly. Treat it as optional: absent, empty, or
malformed means no children and must never make the store fail to open.

Do not put this in `.tickets/canvas/`. That directory holds board layouts and
`layout.Store.Boards` lists every `*.yml` in it, so a file there appears in the
board picker as a board.

### Rules on a declared path

This configuration comes from a repository you might not have written, so check
a declared path before using it. The path must be relative; reject an absolute
one. After normalization and after resolving symbolic links, it must still be
inside the declaring store's own directory, which rejects an escape through
`..` and an escape through a link as two separate cases. The child must pass
the same validity test as any other candidate. Bound a chain of children, three
deep by default, recording every path visited by absolute path so a cycle ends.

A declared child that fails a check is a warning on the parent, not a failure.
One bad entry must not hide the project that declared it.

## Acceptance criteria

- [ ] A canvas.children entry in .tickets/config.yml exposes a named child store the walk would otherwise not descend to.
- [ ] An absolute path, a path escaping through .., and a path escaping through a symbolic link are each rejected.
- [ ] A chain of declared children is bounded, and a cycle terminates.
- [ ] A declared child that fails a check produces a warning on the parent, and the parent still loads.
- [ ] A store whose canvas key is absent, empty, or malformed loads normally with no children.

## Definition of done

- [ ] A test store carrying the key still passes git ticket check --strict.
