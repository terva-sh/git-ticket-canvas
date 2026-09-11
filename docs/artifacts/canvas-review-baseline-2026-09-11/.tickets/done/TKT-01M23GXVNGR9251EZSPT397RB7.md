---
schema: 3
id: TKT-01M23GXVNGR9251EZSPT397RB7
title: Add just recipes for local development
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
dependencies: []
blocks_on: none
references:
  - ref: tooling:just
    path: justfile
  - ref: docs:development
    path: docs/development.md
claim: null
archive: null
created_at: 2026-09-09T16:44:57Z
updated_at: 2026-09-09T16:49:25Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Provide just recipes to build, test, install, and run tkcanvas, with developer documentation and reproducible validation. Include formatting and static checks without changing application behavior.

## Acceptance criteria

- [x] just lists documented build, test, install, and run recipes; run forwards application flags.
- [x] Build and test recipes pass, and install respects Go's GOBIN/GOPATH convention.
- [x] Developer documentation explains prerequisites, output paths, and verification commands.

## Implementation plan

Add a justfile compatible with installed just 1.21: list by default; build tkcanvas at repository root; install via go install .; run after build with shell positional arguments; race/coverage test recipe plus formatting, vet, JS syntax, ticket validation, and aggregate check. Document prerequisites and examples in a new docs/development.md without rewriting the baseline reports. Verify all recipes, install using temporary GOBIN, and exercise run against loopback with spaced arguments and read-only mode.

## Summary

Added justfile with default listing, build, install, run, test, fmt, fmt-check, vet, js-check, tickets-check, and aggregate check. Added docs/development.md with prerequisites, flags, output paths, and installation guidance. Verified on just 1.21.0: just build, just fmt, just check, and test flag forwarding pass; API coverage remains 65.1%. Installed into temporary GOBIN containing spaces and invoked the installed binary. Verified run from a subdirectory with spaced store/actor arguments and read-only HTTP response. Ctrl-C stops the listener; just returns conventional interrupt status 130. No application code changed or installed user binary replaced.
