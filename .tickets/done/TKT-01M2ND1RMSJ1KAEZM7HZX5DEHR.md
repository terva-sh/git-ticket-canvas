---
schema: 3
id: TKT-01M2ND1RMSJ1KAEZM7HZX5DEHR
title: Write board rules from the command line
type: task
status: done
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
updated_at: 2026-09-20T19:37:20Z
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

- [x] pen add, pen rm, pen order, place, release, frame add and inbox all write the layout file
- [x] git ticket check validates layouts, and --fix repairs what it can
- [x] No command computes a card position; only place writes one, from its argument
- [x] A write refuses rather than producing a layout that check would reject

## Implementation plan

All code is in git-ticket under TKT-01M300AM5WJ61BDVW28B2R1ANT (Write board rules from the command line), where the source-inspected plan lives; this ticket records the interface decisions and closes when that ships.

Decisions taken on 2026-09-21 against the design's sketch. frame add takes an ID and --at/--size, because a frame record requires geometry and no command computes one. pen add takes --label alone; --status, --type and --parent are the match record's and arrive with TKT-01M2Y91C17YTE0W0P3RBHTF50Y. A pen's pin defaults to its origin, since the adopted resolver reads no pin. release refuses a card that is not pinned. Every write goes through one layout.Store.Modify that validates before it renames, so a refused write leaves the file untouched. check gains layout_invalid (error), layout_ticket_missing and layout_not_canonical (warnings), reuses label_unknown for pen labels, and --fix rewrites the non-canonical file only. The CLI takes no store lock for a layout write, because the canvas takes none either; the gap is recorded in plan 12.10 rather than half-closed.

The canvas needs no change: it reads what the CLI writes through the same package. This ticket closes with the git-ticket release named.

## Notes

**agent:claude/t3code-a6d0ff31** at 2026-09-20T19:37:19Z

Shipped in git-ticket v0.23.0, merge commit fd32d73 on main, from PR 215 (Write board rules from the command line), and on proxy.golang.org as github.com/terva-sh/git-ticket v0.23.0. Every criterion is met by that release rather than by anything in this repository: the seven write words write the board file, check reads .tickets/canvas/*.yml in the same pass as the tickets and --fix rewrites a non-canonical one, no command computes a card position, and each write validates through layout.Store.Modify before the rename so a refused write leaves the file untouched.

Observed here rather than taken on trust: the v0.23.0 CLI reported this repository's own board file as layout_not_canonical and check --fix rewrote it to schema 4, which is the check-and-repair criterion running against a real store.

## Summary

Closed by git-ticket v0.23.0. The interface decisions this ticket recorded were implemented in git-ticket under TKT-01M300AM5WJ61BDVW28B2R1ANT and released as v0.23.0 (fd32d73): pen add, pen rm, pen order, place, release, frame add and inbox write the layout file, check validates every board and --fix repairs the non-canonical one, only place writes a coordinate and it writes the caller's, and one layout.Store.Modify validates before it renames. The canvas needed no change for this ticket; it bumps to v0.23.0 under TKT-01M2Y91C17YTE0W0P3RBHTF50Y (Widen a pen's rule from requiredLabels to a match record), which is the schema 4 half of the same release.
