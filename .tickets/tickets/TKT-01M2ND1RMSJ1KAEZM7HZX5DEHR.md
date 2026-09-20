---
schema: 3
id: TKT-01M2ND1RMSJ1KAEZM7HZX5DEHR
title: Write board rules from the command line
type: task
status: in-progress
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
claim:
  actor: agent:claude/t3code-a6d0ff31
  branch: t3code/board-rules
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-a6d0ff31
  commit: 1d16016188935089c162336c99851fc11825acf9
  session: null
  claimed_at: 2026-09-20T18:12:34Z
  expires_at: null
archive: null
created_at: 2026-09-16T15:23:31Z
updated_at: 2026-09-20T18:13:52Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code-a6d0ff31
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

## Implementation plan

All code is in git-ticket under TKT-01M300AM5WJ61BDVW28B2R1ANT (Write board rules from the command line), where the source-inspected plan lives; this ticket records the interface decisions and closes when that ships.

Decisions taken on 2026-09-21 against the design's sketch. frame add takes an ID and --at/--size, because a frame record requires geometry and no command computes one. pen add takes --label alone; --status, --type and --parent are the match record's and arrive with TKT-01M2Y91C17YTE0W0P3RBHTF50Y. A pen's pin defaults to its origin, since the adopted resolver reads no pin. release refuses a card that is not pinned. Every write goes through one layout.Store.Modify that validates before it renames, so a refused write leaves the file untouched. check gains layout_invalid (error), layout_ticket_missing and layout_not_canonical (warnings), reuses label_unknown for pen labels, and --fix rewrites the non-canonical file only. The CLI takes no store lock for a layout write, because the canvas takes none either; the gap is recorded in plan 12.10 rather than half-closed.

The canvas needs no change: it reads what the CLI writes through the same package. This ticket closes with the git-ticket release named.
