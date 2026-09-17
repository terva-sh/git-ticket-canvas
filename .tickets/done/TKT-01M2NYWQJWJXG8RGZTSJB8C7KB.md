---
schema: 3
id: TKT-01M2NYWQJWJXG8RGZTSJB8C7KB
title: Answer doctor's findings on this store
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
claim:
  actor: agent:claude/t3code
  branch: t3code/git-ticket-upgrade
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-acc5e2b7
  commit: fc759bc536566614524a9f10b74c7bd93bced874
  session: null
  claimed_at: 2026-09-16T20:43:06Z
  expires_at: null
archive: null
created_at: 2026-09-16T20:35:20Z
updated_at: 2026-09-16T23:15:09Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

`git ticket doctor` arrived in v0.19.0 and this store gets 11 hard and 21 soft findings on the open set.

Every hard one is `label_missing`: eleven tickets carry no label, so nothing but the title says what they are about. They are the older drafts — the cross-store move set, the installer pair, the fixture and home-view work.

The soft ones are `label_order`, and they are worth reading rather than batch-fixing. The rule's own message is written against this canvas: "`canvas` leads its 3 labels and a card shows only 2, hiding `cli`". That is `CardView` showing two chips at full density and three at compact, so a label ordered third is invisible on a board at exactly the moment somebody is scanning it. The question the rule asks — is the first label the one that describes the card best — is a judgement, which is why it is soft.

Both rules are the ones the note behind TKT-01M2NHGHTZ4PWHBKRHE43XJG8D asked for, now shipped in the library rather than built here.

### Not in scope

Whether the canvas should *show* doctor findings on a board is a separate question and a bigger one. Filed separately if it is worth doing.

## Acceptance criteria

- [x] Every hard finding is gone: no open ticket carries zero labels.
- [x] Every soft label_order finding has been read, and the leading label names the ticket's subject.
- [x] The reason the soft count does not fall to zero is recorded rather than left looking like unfinished work.

## Notes

**agent:claude/t3code** at 2026-09-16T20:46:07Z

Hard: 12, not the 11 this ticket was filed against — TKT-01M2NZ35Y8 was
filed unlabelled in between and doctor caught it immediately, which is the
rule doing its job.

Labels chosen to the vocabulary already in the store rather than a new one:
api/config for cross-branch reads, canvas+config+idea for the cross-store move
epic and api/ui+canvas for its three children, infrastructure for the installer
pair, readability for the documentation and screenshot work, layout+canvas for
the fixture and home-view tickets, ui+multiuser for the parity ticket.

Soft is the more interesting half. `label_order` fires on every open ticket
carrying more than one label — 31 tickets, 31 findings, counted both ways to be
sure. It is not a defect list. It asks "is the first label the one that
describes it best?", which is why the rule is graded soft: the answer is a
judgement the rule cannot make. Driving the count to zero would mean stripping
every ticket to a single label, which is worse than the thing being reported.

So the work was to answer the question 31 times, not to silence it. What
actually changed:

- `idea` no longer leads anywhere. It records how settled a ticket is, not what
  it is about, and it was leading six tickets whose real subject then fell past
  the two chips a card shows.
- `ui` no longer leads the pen tickets. Nearly everything here is `ui`; it
  distinguishes nothing, and `canvas` is the subsystem the pen work lands in.
- `cli` now leads the two "from the command line" tickets, where it had been
  third and therefore invisible on a board.
- `security` moved ahead of `multiuser` on the grants-and-audit-log ticket. An
  audit log is the security of it.

The remaining 31 are reviewed, and each one's leading label names its subject.
A store gate should read "no hard findings" and treat the soft count as a
review prompt. `--strict` exits 20 for soft-only and 21 when anything hard
fired, so that distinction is already available to CI without any work here.

Separately: doctor's `--json` `file` field is malformed. It prepends `.tickets/`
to an already-absolute path, giving
`.tickets/home/sothr/.../. tickets/draft/TKT-....md`. The text output is fine,
so this is a JSON-only path join bug in git-ticket v0.19.0 and belongs upstream.

**agent:claude/t3code** at 2026-09-16T23:15:09Z

v0.19.1 moved the ground under this ticket's main conclusion, so it is worth saying what survived and what did not.

What survived: the 31 soft findings really were unanswerable, and answering them one at a time really was the only honest thing to do with them at the time. Reading each one and concluding that the store was right and the rule was wrong was not wasted work.

What did not: the recommendation that the gate should be 'no hard findings, soft as a review prompt' was a workaround for a rule that fired on everything. v0.19.1's label_order infers the store's dominant leading-label dimension and reports only the tickets that disagree, and stays silent when there is no convention to infer. This store has no dimensional convention, so it now reports nothing, measured at 0 soft findings against the same tree that gives 32 under v0.19.0.

So soft findings are now sparse enough to be worth reading rather than worth suppressing, and a future gate can treat them as signal. That is a change in the tool, not in this store: nothing here was cleaned up, the rule got quieter.

Upstream reached the same conclusion independently and with numbers, in git-ticket TKT-01M2P0FWJ1BEDGV3603X5YKR5G. It measured four real stores and found label_order firing on 99% of terva's open tickets and 100% of ketju's, and it records this store's zero as the correct answer rather than a gap.

## Summary

All 12 hard findings fixed by labelling the tickets that carried none, using the vocabulary already in the store. All 31 soft label_order findings read and answered: idea and ui no longer lead anywhere they described nothing, cli leads the two command-line tickets, security leads multiuser on the audit-log one. The soft count stays at 31 because the rule fires once per multi-label ticket and asks a question rather than reporting a defect; that is recorded on the ticket so it does not read as unfinished. Found and noted a JSON-only path bug in doctor's file field for upstream.
