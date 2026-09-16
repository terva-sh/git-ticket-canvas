---
schema: 3
id: TKT-01M2ND1RMSJ1KAEZM7HZX5DEHR
title: Write board rules from the command line
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - cli
  - layout
  - canvas
assignees: []
milestone: null
parent: TKT-01M2ND0S8N5Y8V0HQFRCBKMXE3
origin: null
dependencies:
  - TKT-01M2ND1RKK6S4GXZQKKPP6H87P
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T15:23:31Z
updated_at: 2026-09-16T20:45:17Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

The writing half, plus validation.

```
git ticket canvas pen add ID --title T --label L... --status S --type T --parent ID --at X,Y --size W,H --color C
git ticket canvas pen rm ID
git ticket canvas pen order ID...
git ticket canvas place ID --at X,Y
git ticket canvas release ID...
git ticket canvas frame add --title T --member ID...
git ticket canvas inbox --at X,Y
```

`git ticket check` learns the layout file in the same pass that validates everything else, with the same `--fix` behaviour.

**No command computes a layout.** `place` writes a coordinate the caller chose; everything else writes rules. This keeps exactly one implementation of placement in the tree. The alternative — the CLI packing cards in Go while the canvas packs them in TypeScript — is two implementations that must agree forever and will not. If a command ever needs to know where a card will land it asks the resolver.

## Acceptance criteria

- [ ] pen add, pen rm, pen order, place, release, frame add and inbox all write the layout file
- [ ] git ticket check validates layouts, and --fix repairs what it can
- [ ] No command computes a card position; only place writes one, from its argument
- [ ] A write refuses rather than producing a layout that check would reject
