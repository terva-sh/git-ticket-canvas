---
schema: 3
id: TKT-01M2ND1RH33T89QZ7JBA0YC1AZ
title: Move the layout schema into git-ticket
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - layout
assignees: []
milestone: null
parent: TKT-01M2ND0S8N5Y8V0HQFRCBKMXE3
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T15:23:31Z
updated_at: 2026-09-16T15:23:51Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

`internal/layout` defines the format of `.tickets/canvas/*.yml`, a file that lives inside a directory belonging to another tool. `git ticket check` validates every other file under `.tickets/` and cannot see this one, so a layout with a bad `ruleOrder` is caught when somebody opens a browser.

The store's format is the store tool's to define. Move the package to `git-ticket` and have the canvas import it.

This is also what makes `git ticket canvas` subcommands possible at all: `git-ticket-canvas` already imports `github.com/terva-sh/git-ticket/ticket`, so the dependency cannot run the other way.

No behaviour changes here. It is breaking and cross-repo, and it is on its own so that a bisect can find it.

### Rejected

`git-ticket-canvas layout ...` subcommands, keeping the schema where it is. Works, needs no move, one repository. Rejected because it puts the validator in the tool least likely to be installed: an agent working a ticket store has `git ticket` and may not have the canvas. A format whose only validator ships with the optional viewer is checked after it is committed.

## Acceptance criteria

- [ ] internal/layout is an importable package in git-ticket and the canvas imports it
- [ ] The canvas produces byte-identical layout files before and after the move
- [ ] A layout written by the old canvas opens in the new one, and the reverse
- [ ] No command or endpoint changes behaviour
