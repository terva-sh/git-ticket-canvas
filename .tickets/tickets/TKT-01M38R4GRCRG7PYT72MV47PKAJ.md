---
schema: 3
id: TKT-01M38R4GRCRG7PYT72MV47PKAJ
title: Refuse a dependency drag that would close a cycle
type: task
status: in-progress
status_reason: null
priority: normal
due_on: null
labels:
  - ui
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies:
  - TKT-01M38QP3PT4ZNXV37720NSX424
blocks_on: none
references: []
claim:
  actor: agent:claude/mobile-cycle
  branch: worktree-agent-a42474eec8ebfad02
  worktree: /home/sothr/workspace/git.local.sothr.com/terva-sh/git-ticket-canvas/.claude/worktrees/agent-a42474eec8ebfad02
  commit: 1e1926626e0d0b508c7a4898535f90f0602f693d
  session: null
  claimed_at: 2026-09-24T05:10:51Z
  expires_at: null
archive: null
created_at: 2026-09-24T03:42:50Z
updated_at: 2026-09-24T05:16:38Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/mobile-cycle
  name: ""
extensions: {}
---

## Description

Dragging a card's link handle onto another card sends `addDependency` through `link()` in `web/src/ui/App.tsx` without checking for a cycle. `git-ticket` v0.23.0 refuses only a self-reference, so dragging can close a cycle through three tickets today. Only `git ticket check` reports it, as `dependency_cycle`, and every ticket in the cycle then stays unready for good.

Use the cycle predicate that TKT-01M38QP3PT4ZNXV37720NSX424 (Add a dependency or a parent from the inspector) adds, so the drag and the picker cannot disagree. While the link is being dragged, a target that would close a cycle is shown as refused, the way a non-card target is now. Dropping on it writes nothing and names the cycle.

This changes behaviour for desk users. The maintainer accepted that on 2026-09-24: a cycle is never what somebody meant, and the drag and the picker should agree.

## Acceptance criteria

- [ ] Dropping a link that would close a cycle writes nothing and says which tickets form the cycle, with a browser test
- [ ] The drag and the inspector picker use the same predicate
- [ ] While dragging, a cycle-closing target is shown as refused before the drop
- [ ] A link that closes no cycle behaves exactly as it does today

## Implementation plan

### Direction

`link(from, to)` in `App.tsx` sends `addDependency from` on `to`, so after the drop `to` waits on `from`. In `closingCycle(tickets, kind, ticket, target)` a `dependency` means `ticket` would wait on `target`; `relations.test.ts` row "a dependency the other way round from one that exists" (`store('A:', 'B: A')`, ticket A, target B, cycle `[A, B]`) confirms it. So the drag asks `closingCycle(store.state.tickets, 'dependency', to, from)`, and the answer lists the loop starting at `to`, each ticket waiting on the next and the last waiting on `to`.

### App

A new function `linkRefusal(from, to)` in `App.tsx`, beside `link()`, answers `null` or the message that names the loop, built from each ticket's short ID: "Not linked: that would close a cycle, C waits on A, A waits on B, B waits on C." `link()` calls it first and, when it answers, toasts it as an error and writes nothing. That guard covers a drop decided against a board the store has since refreshed. `Canvas` gets it as one optional prop, `linkRefusal`, next to `onLink`.

### Canvas

The `link` gesture gains `refused: { id, message } | null`. In `applyMotion`, when the card under the pointer changes, Canvas asks `linkRefusal(from, id)`. A refused card is not the gesture's `to`, so it gets no `link-target` highlight and the existing drop path, which writes only when `to` is set, writes nothing, exactly as for a non-card target. It is marked instead: the card takes `link-refused` (danger border), the stage takes `link-refused` (not-allowed cursor), and the ghost line turns the danger colour. On a drop with `refused` set, Canvas calls `onError(message)`, which is App's existing error toast. The question is asked once per card the pointer enters, not per frame.

A link that closes no cycle takes the same path it takes today: `to` is set, the target is highlighted, and the drop calls `onLink`. The only added work is one `closingCycle` walk per card entered.

### Rejected

- Canvas importing `closingCycle` and walking its own `tickets` prop. No new prop, but the message would then be written in Canvas and again in `link()`'s guard, and Canvas would start owning a rule about the ticket graph that the inspector's picker already reaches through App's data. A callback keeps the graph and the wording in App and leaves Canvas asking one question.
- A boolean callback plus a separate message builder. Two calls that must agree about the same pair; returning the message makes "refused" and "why" one answer.
- Keeping the refused card as `to` and checking at the drop. The drop path would need a new branch to not write, and a refused card would get the accept highlight while hovered.
- Leaving the refused hover looking like empty board. The criterion asks for it to be shown as refused, and a person hovering a card with no feedback reads it as a missed target and tries again.

### Tests

Browser, in a new `tests/browser/link-cycle.spec.ts`, so the link tests in `canvas.spec.ts` stay unchanged. Three tickets where C waits on B and B waits on A; a drag from C's handle onto A would make A wait on C. At the desk size with the mouse: an unrelated card under the link shows `link-target` and no refusal; A shows `link-refused` and not `link-target`, the stage and the ghost are marked refused; after the drop the error toast names A, C and B by short ID, nothing but GETs were sent, and A has no dependencies. On a tablet, the same drag through `touchSteps` from C's `.handle`, with a MutationObserver recording that A showed the refusal while the finger was over it. The predicate itself is covered by `relations.test.ts`; the message is asserted word for word by the browser tests.

## Notes

**agent:claude/mobile-cycle** at 2026-09-24T05:16:38Z

Direction checked against `relations.test.ts` before relying on it: `store('A:', 'B: A')` with ticket A and target B answers `[A, B]`, so `closingCycle(tickets, 'dependency', ticket, target)` means ticket would wait on target. `link(from, to)` writes `addDependency from` on `to`, so the drag asks `closingCycle(store.state.tickets, 'dependency', to, from)`, as the inspector ticket's summary said.

The tests needed the short IDs read from the board after every ticket was filed. A short ID is the shortest prefix unique in the store, so the one returned when a ticket is created gets longer as later tickets land. The first run failed on exactly that: the toast was right and the expected text was stale.

Checked that the new browser tests catch the missing behaviour: with the `linkRefusal` prop and the guard in `link()` removed and the bundle rebuilt, both fail (desk: `link-refused` never appears on the hovered card; tablet: the observer never saw it). Restored and rebuilt, both pass.
