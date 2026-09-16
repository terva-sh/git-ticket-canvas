---
schema: 3
id: TKT-01M2P0BQT4BKF28MFG5S4NW319
title: A filtered-out card stays on the board if it is done or blocked
type: bug
status: done
status_reason: null
priority: high
due_on: null
labels:
  - ui
  - canvas
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references:
  - ref: ticket:TKT-01M2P0C6GTKTW19Q2QZXK77X9Z
    path: null
claim:
  actor: agent:claude/t3code
  branch: t3code/git-ticket-upgrade
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-acc5e2b7
  commit: 3efb6be1959b7c74dc213cccd96818ab9ce5a07f
  session: null
  claimed_at: 2026-09-16T21:01:16Z
  expires_at: null
archive: null
created_at: 2026-09-16T21:01:01Z
updated_at: 2026-09-16T21:24:57Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

Reported from a board with three labels required at once, where the count read
`0 of 80` and most of the board stayed legible.

`Canvas` marks every card the filter rejects with a `dimmed` class, and the
stylesheet takes it from there. Three other rules set `opacity` on a card at
exactly the same specificity, and `.card.dimmed` was declared above all of them:

    .card.dimmed { opacity: .18 }                       web/index.html:338
    .card.done, .card.archived { opacity: .55 }         web/index.html:343
    .card.blocked-card { opacity: .8 }                  web/index.html:354

Equal specificity, so the last one wins. A filtered-out card that was done,
archived or blocked kept its own opacity and stayed where it was. Hover and
selected are worse: `.card.done:hover` and `.card.done.selected` set opacity
back to 1 at a higher specificity again.

The effect is a filter that looks half-broken rather than one that looks off.
Most of the board recedes, the settled and blocked cards do not, and what is
left reads as the result of the filter, which is the opposite of what those
cards are. On the reported board the measured tiers were .18 for the cards that
dimmed, .55 for done, and .8 for blocked.

Nothing was wrong with the predicate. `matchesTicket` is the single predicate
behind both the count and the cards, and it was right both times: three
required labels intersect, and no ticket in that store carried all three, so
`0 of 80` was the correct answer to the question asked.

### Why the tests did not catch it

`tests/browser/label-filters.spec.ts` asserts `toHaveClass(/dimmed/)`. The class
was always there. Nothing asked the browser what it painted, so a rule that
silently lost the cascade looked identical to one that worked.

### Not in scope

A label include intersects while a status include unions, and both sets of chips
sit in the same toolbar with nothing saying so. That is a real trap and it is
what made this board show `0 of 80` in the first place, but it is a design
decision rather than a defect, and it is filed separately.

## Acceptance criteria

- [x] A card the filter rejects renders at the dimmed opacity whatever its status is, including done, archived and blocked.
- [x] Hovering or selecting a filtered-out card does not bring it back to full opacity.
- [x] A test asks the browser for the painted opacity rather than for the class, and fails if the rule loses the cascade again.

## Notes

**agent:claude/t3code** at 2026-09-16T21:01:44Z

Diagnosed from two screenshots before touching the code, because the counts in
them were the thing that looked wrong and were not.

`0 of 80` with three labels required, and `55 of 80` with the same three
excluded. Checked both against the store on disk: 0 tickets carry all three, 25
carry at least one, and 80 - 25 = 55. So the predicate answered correctly twice
and the report was about what the board looked like, not what it computed.

The screenshots also carried the evidence for the real fault. Sampling the
brightest pixels per card column gives four tiers rather than two: ~65, ~95,
~135 and ~232 against a ~28 background. Solving `o*text + (1-o)*28` for each
lands on opacity .18, .55, .8 and 1 — which is exactly the set of opacity values
the stylesheet assigns, and .55 and .8 are the two that should have been
unreachable on a board where nothing matched.

Fix is ordering plus the two higher-specificity variants, not `!important`, so
the next rule that needs to beat this one still can.

Confirmed the test guards the bug rather than just passing alongside it: with
the rule back above the status rules, the done card reports opacity 0.55 and the
test fails on that number. With the fix it reports 0.18.

**agent:claude/t3code** at 2026-09-16T21:21:00Z

CI failed on the first push of this fix while the same commit passed the gate
locally, and this Forgejo build exposes no way to read why: the run status API
reports failure, the log endpoints 404 for both curl and `tea actions runs
logs`, and the step endpoint wants a browser session. So the cause is still
unknown rather than diagnosed, and saying otherwise would be guessing.

What was ruled out rather than assumed:

- The visual baseline in `canvas-density.spec.ts` is opt-in behind
  CANVAS_VISUAL and skipped in CI too, so it is not reacting to the new rule.
- No other browser spec asserts opacity, and nothing else reads `dimmed`.
- The open label popover does not cover the hovered card: measured, it sits
  ~690px away, so a font difference could not move it onto the card.
- The spec is stable locally across repeated runs.

Two changes in response, both worth having regardless of what CI was objecting
to. The hover assertion no longer goes through Playwright's actionability path,
which is the only thing in the new test that depended on where the board laid a
card out; it moves the mouse to the measured centre and then asserts the hover
actually landed, so a miss reports itself rather than passing vacuously — .18 is
the expected value whether or not the hover works.

And the cascade itself is now guarded by a test that needs no browser at all.
`web/src/ui/card-dimming.test.ts` parses the stylesheet, computes specificity,
and fails when any rule setting opacity on a card is not beaten by a dimmed one.
That is the actual regression, checked directly rather than through something a
renderer has to agree with. It caught two things the hand-written fix missed on
first pass: comments swallowed into a selector, and `.card:hover .handle`, which
sets opacity on something inside the card rather than on the card.

**agent:claude/t3code** at 2026-09-16T21:24:57Z

CI passed on b6571c3. That closes the branch but not the question.

Two things changed between the rejected commit and the accepted one: the hover
assertion stopped going through Playwright's actionability path, and a
browser-free cascade test arrived. Only the first could have affected CI, so the
actionability path is now the strong suspect — that check waits for the element
to be stable and to receive events at its centre, which depends on where the
board laid the card out, and CI lays it out differently because it renders with
font-noto alone under Alpine Chromium. Measuring locally ruled out the popover
overlapping, but local geometry was never the geometry in question.

Suspect, not cause. The logs were never readable, nothing was bisected, and a
green run after two changes does not identify which one mattered. If this spec
ever goes red in CI again, that is the thread to pull, and the assertion added
alongside the mouse move will say so directly: it fails with "the mouse did not
land on the card" rather than with an opacity number.

Worth noting for whoever hits the next one: a Forgejo build without the actions
jobs API makes a CI-only failure nearly undiagnosable from a shell. Both `tea
actions runs logs` and the REST endpoints 404. The workable options are asking
somebody with browser access, or splitting a commit until pass/fail isolates it.

## Summary

The dimmed class was applied correctly and then lost the cascade. Three appearance rules set opacity on a card at the same specificity, and dimmed was declared above all of them, so a filtered-out card that was done, archived or blocked kept its own opacity. Moved the rule below them and named the hover and selected variants, which sit a specificity step higher. The browser test now asks for the painted opacity rather than the class, which is the gap that let this ship.
