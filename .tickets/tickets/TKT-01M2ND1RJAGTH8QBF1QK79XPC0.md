---
schema: 3
id: TKT-01M2ND1RJAGTH8QBF1QK79XPC0
title: Read the board from the command line
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
  - TKT-01M2ND1RH33T89QZ7JBA0YC1AZ
blocks_on: none
references: []
claim:
  actor: agent:claude/t3code-a6d0ff31
  branch: t3code/review-open-queued-work
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-a6d0ff31
  commit: 374511fc8dd5266563128b434ac03c726aa2f32a
  session: null
  claimed_at: 2026-09-19T23:28:52Z
  expires_at: null
archive: null
created_at: 2026-09-16T15:23:31Z
updated_at: 2026-09-19T23:45:49Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
extensions: {}
---

## Description

Read-only commands first, so the schema and the resolution order get exercised and argued about before anything writes one.

- `git ticket canvas show [--board B]` — the rules, and what each one catches.
- `git ticket canvas pens` — the rules in resolution order.
- `git ticket canvas explain ID` — why this card is where it is: the matching pen, the rules it beat, and whether a pin overrides all of them.

`explain` is not a convenience. A declarative placement system whose decisions cannot be interrogated is one nobody will trust with a board they care about, and an agent that cannot ask why a card moved cannot correct a rule it wrote.

Until resolution lands these answer against the current behaviour, which is that every unpinned card is placed by `autoPlace`. That is a truthful answer and it is worth being able to ask the question before the answer gets interesting.

## Acceptance criteria

- [ ] git ticket canvas show prints the rules and what each catches
- [ ] git ticket canvas pens prints the rules in resolution order
- [ ] git ticket canvas explain ID names the matching pen, the rules it beat, and any pin
- [ ] The commands work on a checkout with no canvas running
- [ ] A board with no layout file is reported as such rather than as an error

## Implementation plan

Source-inspected on 2026-09-19: git-ticket at e568e5a (layout package landed in v0.20.0), this repository at 374511f. The work is in git-ticket; this ticket tracks it here and closes when that release exists.

### What exists to build on

`layout` in git-ticket holds the schema-3 records: `Pen{RequiredLabels}`, `Routing{Pens, RuleOrder, Inbox}`, `Card{X,Y}`, `Board`, `Store.Load`, `Store.Boards`. It holds no evaluation. The only rule evaluator anywhere is `web/src/platform/canvas/pens.ts` in this repository, unused by the shipped canvas, and it implements the superseded contract (most specific rule wins, then order). `cli` in git-ticket dispatches from one table in `cli/cli.go`; a command is `run(ctx, args)` over `parseFlags` and `openStore`; `series` is the model for a command with subcommand words. JSON kinds are a published list in `cli/envelopekinds_test.go` and each has a section under plan 10.

### What to build, in git-ticket

1. `layout/resolve.go`: `Match(pen Pen, ticket)` and `Route(routing Routing, cards, tickets) []Explanation`, pure. The contract is docs/board-organization-design-v1.md as adopted: a card with a saved coordinate is pinned and routing does not apply; otherwise the first pen in `ruleOrder` whose rule the ticket satisfies; otherwise Inbox. The rule this ticket evaluates is schema 3's `requiredLabels`, every label present; the schema-4 `match` record with status, type, and parent is TKT-01M2ND1RKK6S4GXZQKKPP6H87P's. An explanation names the winner, every earlier rule that did not match and which labels it lacked, and, for a pinned card, the coordinate. This is the reference implementation of routing; when ND1RK wires placement into the canvas, the TypeScript evaluator either consumes this through the API or is rewritten to match it, and that choice is ND1RK's.
2. `cli/canvas.go`: one dispatch entry `canvas` with the words `show`, `pens`, and `explain`, each taking `--board B` (default `default`) and `--json`. `show` prints each pen with its rule and the tickets it catches, then the Inbox with what falls through. `pens` prints the rules in resolution order and nothing else. `explain ID` prints where the card is and why. All three open the ticket store the ordinary way and read the layout through `layout.New(store.Path())`; no canvas process is involved. A board with no layout file prints one line saying so and exits 0, and its JSON says the same, because that is a fact about the store rather than a failure to answer.
3. Honesty before resolution lands: the canvas still places every unpinned card in status lanes. `explain` says "automatic, placed in status lanes by the canvas" and then "routing: would go to PEN because ..." under a heading that names it as not yet applied. When ND1RK lands, the heading goes and the sentence becomes the fact.
4. plan.md: three lines under 12.1, a new 10.10 for the kinds, and 12.10 revised to say the CLI now reads the file. `envelopeKinds` and the completion dump gain the entries. Tests: table tests on `Route` covering pinned, first-match, tie by order, no match, no pens, and a legacy board with no routing; CLI tests over a testdata store with a canvas file and one without.
5. Release as v0.21.0 (a new command is a minor under 12.4), following the sequence recorded on TKT-01M2ND1RH33T89QZ7JBA0YC1AZ. This ticket then closes with the version named.

### Settled with the user before code (git-ticket AGENTS.md)

The command spelling, the JSON kind names, the wording of the not-yet-applied section, and confirmation that first-match-in-order is the semantics, since the only existing evaluator does something else. Asked in one interruption; answers recorded here as a note.

## Notes

**agent:claude/t3code-a6d0ff31** at 2026-09-19T23:37:42Z

Settled with the user on 2026-09-19 before code: the command is git ticket canvas with the words show, pens, and explain ID, each taking --board; the JSON kinds are canvas-board (show and pens) and canvas-explain; the resolver's semantics are first match in ruleOrder, the adopted design, so the canvas's unused TypeScript evaluator is superseded and ND1RK decides whether it consumes the Go result or is rewritten; explain states the status-lane fact first and reports routing under a heading saying it is not applied until the canvas reads rules.

**agent:claude/t3code-a6d0ff31** at 2026-09-19T23:45:49Z

Implemented in git-ticket on branch t3code/canvas-read as PR 211 (https://git.local.sothr.com/terva-sh/git-ticket/pulls/211), under its ticket TKT-01M2Y0H9YDK3325C55QHYNM4K4. layout.Route is the one routing implementation; the CLI answers canvas-board and canvas-explain with applied:false until the canvas places by rules. Tried against this repository's board, which has no pens, and every card reports to the inbox. Closes on the git-ticket release that carries it.
