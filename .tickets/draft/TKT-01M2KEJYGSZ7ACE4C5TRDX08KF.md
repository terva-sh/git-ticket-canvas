---
schema: 3
id: TKT-01M2KEJYGSZ7ACE4C5TRDX08KF
title: Match the CI git-ticket pin to the version go.mod requires
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels: []
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-15T21:11:54Z
updated_at: 2026-09-15T21:11:54Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

`go.mod` requires `github.com/terva-sh/git-ticket v0.18.1` since commit c10dbed,
but three workflow files still install the CLI at v0.14.3 for `just
tickets-check`:

- `.forgejo/workflows/ci.yml` line 24
- `.forgejo/workflows/release.yml` line 22
- `.github/workflows/release.yml` line 44

This is not currently breaking anything. v0.14.3 was installed to a temporary
GOBIN on 2026-09-16 and run as `git-ticket check --fix --dry-run --strict`
against this store; it reported "No problems found" and exited 0. Both versions
enforce store schema 3, which is why the old CLI still reads a store the new
library writes.

The risk is that the gate is weaker than the library. `check --strict` validates
against the rules the binary knows, so any rule added between v0.14.3 and
v0.18.1 is a rule CI does not enforce, and a store defect that the local
developer's v0.17.1 CLI reports would pass on a hosted runner. The versions
should match the module requirement so the gate and the code agree.

## Acceptance criteria

- [ ] The three workflow files install the same git-ticket version go.mod requires.
- [ ] A check fails if the pinned CLI version and the go.mod requirement drift apart again.
