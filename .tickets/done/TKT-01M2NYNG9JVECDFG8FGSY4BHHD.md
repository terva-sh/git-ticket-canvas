---
schema: 3
id: TKT-01M2NYNG9JVECDFG8FGSY4BHHD
title: Move to git-ticket v0.19.0
type: chore
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - infrastructure
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T20:31:23Z
updated_at: 2026-09-16T20:35:34Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

The canvas is pinned to `github.com/terva-sh/git-ticket v0.18.1`. v0.19.0 is published.

What the canvas has to answer for, from the surface it actually uses:

- `ticket.RenderConfig` is called here, and v0.19.0 changed it to emit a `doctor:` block. Anything in the canvas that rewrites `config.yml` through it would otherwise delete a store's rule configuration.
- `ticket.ApplyImport` is not used here, so the partial-result change does not reach this tree. Worth confirming rather than assuming.
- v0.19.0 adds a `doctor` command and a `doctor:` block in `config.yml`. The canvas parses config through `ticket.ParseConfig`, so an unknown block is the library's problem and not this one — but the canvas also serves a `Schema` to the browser, and whether that grew a field is a question for the wire types.

The pin is the whole change if nothing breaks. If something does, it is better found here than by a user whose store was written by a newer CLI than the canvas was built against.

## Acceptance criteria

- [x] The module is pinned to v0.19.0 and the tree builds
- [x] Every existing test passes, including the browser suite
- [x] Anything the canvas shows that the library changed is checked, not assumed
- [x] A config.yml the canvas rewrites keeps a doctor block somebody configured

## Notes

**agent:claude/t3code** at 2026-09-16T20:35:02Z

Criterion 4 is answered more strongly than it was written. The canvas never rewrites a store's `config.yml` at all: `RenderConfig` appears only in tests, and the production paths in `internal/api/snapshot.go` read that file and nothing more. So a `doctor:` block cannot be lost here whatever `RenderConfig` does.

Criterion 3, checked rather than assumed:
- `ApplyImport` is not referenced in this tree, so v0.19.0's nil-on-error to partial-on-error change does not reach it.
- `ticket.Config` gained `Doctor DoctorSettings`. The canvas serves `schemaBody` (internal/api/server.go:354), which names every field it sends, so the new block does not leak to the browser and no wire type moved.
- Three workflow files pinned the `git-ticket` CLI at v0.18.1. `TestWorkflowsInstallTheGitTicketGoModRequires` caught the mismatch, which is the test earning its place rather than me noticing.

## Summary

`go.mod` is on v0.19.0 and nothing in the canvas had to change to meet it. The three workflow files that install the `git-ticket` CLI moved with it; `TestWorkflowsInstallTheGitTicketGoModRequires` caught that, which is the test doing its job rather than me remembering.

The two changes v0.19.0 made that could have reached here did not. `ApplyImport` went from nil-on-error to partial-on-error and is not referenced in this tree. `RenderConfig` learned to emit the `doctor:` block, and the canvas never rewrites a store's `config.yml` at all — `RenderConfig` appears only in tests, and the production paths read that file and nothing else. So the block a store configures cannot be lost here regardless.

`ticket.Config` gained a `Doctor` field. `schemaBody` names every field it sends the browser, so nothing new leaked across the wire and no client type moved.

`just parity-check` passes end to end, including the 72-test browser suite and the Go-only build at clean HEAD.

What the upgrade opened rather than closed: `doctor` now exists, and on this store it reports 11 hard findings, all `label_missing`, and 21 soft `label_order` ones. TKT-01M2NYWQJWJXG8RGZTSJB8C7KB is answering them; TKT-01M2NYWQM1NJPSFC8VTE0CYJXS is the larger question of whether the board should show findings at all, which is not obvious — the canvas spends its salience on what somebody could act on, and rendering advice as a defect turns a second opinion into a red mark.
