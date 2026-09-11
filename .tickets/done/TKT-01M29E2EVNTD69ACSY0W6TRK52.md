---
schema: 3
id: TKT-01M29E2EVNTD69ACSY0W6TRK52
title: Measure the lane cap against board shapes other than the fixture
type: spike
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - ui
  - canvas
  - readability
assignees: []
milestone: null
parent: TKT-01M26YEEBGPYAFDNF6TTM2JVD7
origin: null
dependencies: []
blocks_on: none
references:
  - ref: code:auto-place
    path: web/src/platform/canvas/geometry.ts
  - ref: doc:lane-depth
    path: docs/readability-v1.md
claim: null
archive: null
created_at: 2026-09-11T23:50:29Z
updated_at: 2026-09-11T23:57:45Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

`LANE_CAP` is 6 and every number behind it came from one board: the 30-card reference fixture, which puts 25 of its 30 tickets in a single status. Three tickets in a row have now recorded the same caveat, that a store spread across seven statuses is nearly square before wrapping and could be made worse by a cap of six, and none of them measured it.

The fixture cannot supply a second shape, so the shapes have to be built. The `app` browser fixture creates tickets against an empty store over the API and can drive their statuses, so a spec can build a board of any distribution and read the rendered geometry back.

### Shapes worth measuring

- One deep lane, which is the fixture: most tickets in one status.
- An even spread across every configured status, which is the shape the caveat names.
- Two deep lanes, a store mid-migration with a large backlog and a large done pile.
- A single status holding everything, the degenerate case of the fixture.
- A larger even board, to separate the effect of shape from the effect of size.
- A small board, where wrapping should do nothing at all.

### What the answer has to include

The fit scale at cap 6 for each shape, the best cap for each shape, and how much the best cap beats 6. A cap that is within a few percent of the best across every shape is settled. A cap that is badly wrong on one shape is a bug waiting for the store that has that shape.

Sweeping the cap by rebuilding for each value is slow, so the honest shortcut is a model that reproduces a rendered board exactly at the cap that is compiled in, and is then swept. That technique was validated earlier to four decimal places against the reference board, and it must be re-validated per shape rather than assumed.

## Acceptance criteria

- [x] At least four board shapes beyond the reference fixture are built and their arranged geometry measured in the browser.
- [x] For each shape the model is validated against the rendered board at the compiled-in cap before its sweep is trusted.
- [x] The fit scale at cap 6 and at the best cap is recorded per shape, with the gap between them.
- [x] A verdict is recorded: keep 6, change it, or make it depend on something, with the measurement behind it.
- [x] docs/readability-v1.md replaces the 'measure a second shape before treating six as settled' caveat with the answer.

## Notes

**agent:terva/mieli** at 2026-09-11T23:50:56Z

draft to ready: The user asked for this measurement directly, which is the promotion.

**agent:terva/mieli** at 2026-09-11T23:55:36Z

Verdict: 6 is wrong. 5 is better or equal on every shape measured, and the reasoning that picked 6 was right in method and stale in arithmetic.

Six shapes built through the API against fresh stores, rendered at the reference viewport, then swept with a model validated against each rendered board at the compiled-in cap of 6. Every validation matched to four decimal places; the sweep refuses to run on a shape whose validation fails.

| shape | cards | fit at 6 | best fit | best cap | what 6 gives up |
| --- | --- | --- | --- | --- | --- |
| even-30, 5 per status | 30 | 0.7219 | 0.7219 | 5 | nothing |
| even-60, 10 per status | 60 | 0.4181 | 0.4181 | 5 | nothing |
| lopsided-30, 20 in one status | 30 | 0.5538 | 0.5538 | 5 | nothing |
| two-deep-30, 15 and 15 | 30 | 0.6068 | 0.7073 | 5 | 14.2% |
| single-30, all in one status | 30 | 0.6068 | 0.7219 | 5 | 16.0% |
| small-8 | 8 | 0.8911 | 0.9775 | 3 | 8.8% |

A cap of 5 is best or tied on five of six, and on the sixth it ties 6. A cap of 6 never wins. The fixture agrees: measured in the browser earlier today, it reaches 0.707 at cap 5 against 0.605 at 6, a 14.4% loss that matches two-deep-30 and single-30.

Why 5 and not 6. The cap was chosen as one screenful of rows, which was six rows of 340 px at a fit of about 0.49. The row pitch is now 269 and the fit is about 0.72, and one screenful at those numbers is five rows: 5 x 269 is 1345 scene px, which is roughly the 1023 px of stage height once scaled. The rule was sound and its arithmetic aged the moment the pitch changed. That is the fourth measurement today to expire when a later layout change landed.

Two things this kills. First, my claim that cap 5 only won on the fixture by dividing 25 cards into five columns of five exactly: single-30 and two-deep-30 have no such divisibility and still prefer 5, so the explanation was wrong. Second, the caveat that a store spread across seven statuses could be made worse by the cap. It cannot: even-30 and even-60 are flat from cap 5 upward, because an even board is bound by its widest lane rather than by its deepest, and the cap stops mattering once no lane exceeds it.

Where the cap does matter is exactly where this project started, a board with one deep lane. small-8 is the one shape that wants something smaller than 5, and at eight cards it fits at 0.89 either way, so it is not worth a constant.

Card heights on these synthetic boards are 198 to 221 px against the fixture's 204 to 249. I re-ran every sweep with a flat 226 px to check that the bias does not carry the verdict: the best cap is unchanged on all six shapes.

Not implemented here, because this ticket is the measurement. The change is one constant plus the browser spec numbers it moves.</text>

**agent:terva/mieli** at 2026-09-11T23:57:42Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-71 At least four board shapes beyond the reference fixture are built and their arranged geometry measured in the browser. — Six shapes built through the API against fresh stores and measured in the browser at the reference viewport: even-30, even-60, two-deep-30, single-30, small-8, lopsided-30. Rendered k: 0.7219, 0.4181, 0.6068, 0.6068, 0.8911, 0.5538.
- [x] task-72 For each shape the model is validated against the rendered board at the compiled-in cap before its sweep is trusted. — The model reproduces the rendered fit at the compiled-in cap of 6 for all six shapes, to within 0.001 (it matched to four decimal places in every case). The sweep script refuses to sweep a shape whose validation fails.
- [x] task-73 The fit scale at cap 6 and at the best cap is recorded per shape, with the gap between them. — Recorded per shape. fit@6 vs best (cap): even-30 0.7219 vs 0.7219 (5), even-60 0.4181 vs 0.4181 (5), lopsided-30 0.5538 vs 0.5538 (5), single-30 0.6068 vs 0.7219 (5) losing 16.0%, two-deep-30 0.6068 vs 0.7073 (5) losing 14.2%, small-8 0.8911 vs 0.9775 (3) losing 8.8%. Re-run with fixture-height cards gives the same best cap on every shape.
- [x] task-74 A verdict is recorded: keep 6, change it, or make it depend on something, with the measurement behind it. — Verdict on the ticket: change 6 to 5. Cap 5 is best or tied on all six shapes and 6 never wins; the fixture agrees at 0.707 against 0.605. The 'one screenful of rows' rule that chose 6 was computed at a pitch of 340 and a fit of 0.49; at 269 and 0.72 a screenful is five rows. Also kills two earlier claims of mine: the cap-5 divisibility explanation, and the caveat that an even spread could be made worse by the cap.
- [x] task-75 docs/readability-v1.md replaces the 'measure a second shape before treating six as settled' caveat with the answer. — docs/readability-v1.md Lane depth now carries the six-shape table, the verdict that 5 beats 6 everywhere, why the screenful rule aged with the pitch, and a note that the code still says 6. The old 'measure a second shape' caveat is replaced by the answer, including that an even spread is flat from cap 5 up and cannot be made worse by the cap. The LANE_CAP comment carries the same correction.

## Summary

Six board shapes built through the API against fresh stores, measured in the browser, and swept for the lane cap with a model validated against each rendered board at the compiled-in cap of 6. Every validation matched to four decimal places.

Verdict: change 6 to 5. A cap of 5 is best or tied on all six shapes and 6 never wins, giving up 14% to 16% where a board has one deep lane and nothing where it does not. The reference fixture agrees at 0.707 against 0.605. Filed as TKT-01M29EEPX6KCR7YC7XM941P40N (Lower the lane cap from 6 to 5), in draft.

Six was one screenful of rows at a pitch of 340 and a fit near 0.49. The pitch is 269 now and the fit near 0.72, so a screenful is five rows. The rule that picked the number survived and its arithmetic did not, which is the fourth measurement in this area to expire when a later layout change landed.

The spike also refuted two claims I had recorded as fact. A cap of 5 does not win by dividing 25 cards into five columns of five, because single-30 and two-deep-30 have no such divisibility and still prefer 5. And an even spread across every status cannot be made worse by the cap: it is flat from 5 upward, because such a board is bound by its widest lane rather than its deepest.

Method worth reusing. Building a shape through the `app` fixture takes one create and one patch per ticket, and two statuses need a reason the store enforces with a 422: `blocked` always, and a draft closed straight to `done`. Walk the lifecycle for done rather than passing a reason. Synthetic cards render 198 to 221 px against the fixture's 204 to 249, so every sweep was re-run with a flat 226 px to check the height bias does not carry the verdict. It does not.

No production code changed. `docs/readability-v1.md` and the `LANE_CAP` comment carry the table and the verdict, and both say the code still ships 6.

Gates: `just check` passed, and `web/dist` is unchanged because only comments and docs moved.
