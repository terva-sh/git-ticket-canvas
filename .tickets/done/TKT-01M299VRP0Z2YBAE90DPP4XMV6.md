---
schema: 3
id: TKT-01M299VRP0Z2YBAE90DPP4XMV6
title: Drop empty status lanes from an arranged board
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - idea
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
created_at: 2026-09-11T22:36:55Z
updated_at: 2026-09-11T23:22:29Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

`autoPlace` gives every configured status a lane whether or not any ticket carries that status, and an empty lane still occupies a full column of 322 px. On the 30-card reference board only `draft` and `done` hold tickets, so 1288 px of the arranged board's 3178 px span is the void between them. The render shows it as roughly a third of the board, empty, with dependency edges stretched across it.

This was considered and rejected inside TKT-01M290N0GA1DBBRGR3HJJQVDY2 (Wrap a deep status lane into more than one column), and that rejection was conditional. The board was then height-bound by more than four to one, so dropping the empty lanes changed the fit scale by exactly nothing: it freed width nobody was waiting on. The note said it would come back if a cap ever made a board width-bound.

Wrapping at six did that. Measured after implementation, the arranged board fits at 0.4997 by width against 0.5000 by height. Width is now half of what binds, so freeing 1288 px of it is no longer free of effect. That is the whole reason this ticket exists, and it is worth re-measuring rather than assuming: taking a third off the width when the two terms are even moves the binding to height, and the gain is bounded by how much slack height has.

### The cost that was named against it

Lane position would depend on which statuses hold tickets, so filing the first `ready` ticket would shift every lane to its right. Derived positions recompute on every accepted store update, so a person would see a board reflow on ticket creation. Wrapping has the same class of instability but a longer period: it reflows when a status crosses 6, 12 or 18 tickets, where dropping reflows when a status crosses 0 to 1.

That trade was judged not worth making for a gain of zero. It has to be judged again against a gain that is not zero, and the answer may still be no. Measure first.

### Worth considering instead

Reserving a narrow gap for an empty lane rather than a full column, so an occupied lane's position still moves when a status fills but moves by less. That keeps some of the positional stability and takes most of the void. Nobody has measured it.

## Acceptance criteria

- [x] The fit scale, span and binding dimension are measured for the arranged board with empty lanes dropped, at both densities, against the same 1648x1023 budget the wrapping work used.
- [x] The reflow cost is stated as a measurement rather than a prediction: how far lanes move when a status gains its first ticket, on the reference board.
- [x] A narrow-gap alternative to dropping entirely is measured or explicitly ruled out with a reason.
- [x] If the change lands, the empty-lane paragraph in docs/readability-v1.md under Lane depth is corrected rather than left contradicting the code.
- [ ] If the change does not land, the measurement is recorded on this ticket so the next person does not repeat it.

## Notes

**agent:terva/mieli** at 2026-09-11T23:01:33Z

Correcting this ticket's own premise, measured while re-measuring TKT-01M290E5VQE9CWSQF3WCG71806 (Size automatic row pitch for the active card density). The description stays as filed; this note is the correction.

I filed this saying width is now half of what binds, so freeing 1288 px of it would pay. It does not. Dropping the empty lanes on today's board takes the fit scale from 0.4997 to 0.5000 at full and leaves it at 0.5062 at compact. Freeing the width hands the binding straight to height, which is what a balanced board does.

So this ticket is worth nothing on its own, exactly as it was when TKT-01M290N0GA1DBBRGR3HJJQVDY2 rejected it. What changed is that the row pitch is now worth nothing on its own either, and the two together are worth a fifth of the board:

| change | full | compact |
| --- | --- | --- |
| today | 0.4997 | 0.5062 |
| drop empty lanes | 0.5000 | 0.5062 |
| row pitch 269 | 0.4997 | 0.5153 |
| both | 0.6050 | 0.6140 |

Measured with a model validated against the real arranged board: at the current pitch and cap it reproduces the browser's 0.4997 and 0.5062 to four decimal places.

The consequence for whoever picks either ticket up. Landing one alone will measure as a wasted change and will look like one to the next person who checks. They want a single decision, and the first acceptance criterion here, which asks for the fit scale with empty lanes dropped, now has its answer for the isolated case: 0.5000, and it is not the number that matters.

Height-aware packing is worth naming here too, since this ticket is the one that unlocks it. Packing each column by measured height plus a 20 px gap reaches 0.6307 at full and 0.7174 at compact with empty lanes dropped, against 0.605 and 0.614 for a static pitch. It is also incompatible with the density rule, because measured heights differ by density and a packed board would reflow on a toggle. It could only live behind an explicit Arrange.</text>

**agent:terva/mieli** at 2026-09-11T23:11:34Z

draft to ready: The user chose to land this with the row pitch in one pass, since neither is worth anything alone. That decision is the promotion.

**agent:terva/mieli** at 2026-09-11T23:22:08Z

Implemented, together with the row pitch, as one change. A stray closing tag at the end of my previous note is an artifact of how I wrote it; nothing is missing from that note.

`autoPlace` now skips a status that holds no tickets when it accumulates lane origins. On the reference board `done` moves from x 1610 to x 322, hard against the draft lane.

Criterion 1, measured in the browser after the change, against the 1648x1023 budget: full 1890 x 1571, fit 0.605, bound by height, with 0.8199 by width against 0.6050 by height. Compact 1790 x 1546, fit 0.614. Before this pair the same board was 3178 x 1926 at 0.500.

Criterion 2, the reflow cost as a measurement rather than a prediction. A status gaining its first ticket moves every lane to its right by one column, 322 px. `geometry.test.ts` asserts exactly that: with `draft` wrapped to two columns and `ready` empty, `done` sits at 644, and filing one `ready` ticket puts `ready` at 644 and pushes `done` to 966. That is the cost this ticket was refused over twice, and it is now in a test rather than in prose.

Criterion 3, the narrow gap, and the answer is more interesting than I expected. Reserving a gap instead of a full column for an empty lane costs nothing at all:

| empty lane | spanX full | fit full | fit compact |
| --- | --- | --- | --- |
| dropped | 1890 | 0.605 | 0.614 |
| 40 px gap | 2050 | 0.605 | 0.614 |
| 80 px gap | 2210 | 0.605 | 0.614 |
| 120 px gap | 2370 | 0.605 | 0.614 |
| full 322 px column | 3178 | 0.500 | 0.515 |

Every gap up to 120 px is free, because the board is bound by height once the pitch tightens and the width it spends is width nobody is waiting on. Only the full column costs, and it costs 18%.

So the narrow gap is the better option on these numbers and this board did not get it. It buys back the visual separation between statuses that dropping removes, and the render shows that loss plainly: the draft lane and the done lane now sit flush against each other and read as one block of cards. It also shortens the reflow when a status fills, from 322 px to 322 minus the gap. What it does not do is remove the reflow, which is the objection that matters.

I did not switch to it, because the user chose dropping and it is already green, and because a gap is free only while height binds. The moment something shortens the board further, the gap starts costing what the column costs today. Worth a follow-up rather than a quiet substitution.</text>

## Summary

`autoPlace` gives a status with no tickets no lane. On the reference board `done` moves from x 1610 to x 322 and the arranged span falls from 3178 x 1926 to 1890 x 1571.

Landed with TKT-01M290E5VQE9CWSQF3WCG71806 (Size automatic row pitch for the active card density) as one change, because each is worth nothing alone. Dropping empty lanes by itself moves the fit scale from 0.4997 to 0.5000. The tighter pitch by itself moves it not at all. Together they take it to 0.605 at full and 0.614 at compact, a fifth of the board, because a balanced board only responds when both dimensions shrink.

The cost is real and now measured rather than predicted: a status gaining its first ticket moves every lane to its right by 322 px, and `geometry.test.ts` asserts that movement. A person filing a `ready` ticket sees the board reflow.

A narrow gap in place of a dropped lane would have been better and this change did not take it. Every gap up to 120 px measures identical to dropping, 0.605 and 0.614, because height binds and the width is free. It keeps the visual separation between statuses that dropping removes, which the render shows: the draft and done lanes now sit flush and read as one block. It is left as a follow-up rather than substituted quietly, and the note carries the table.

The last criterion is unticked on purpose. It asks for the measurement to be recorded if the change does not land, and the change landed.

Gates: `just check`, `just browser-test` 67 passed and 6 skipped, `just canvas-visual` 7 passed. One pre-existing test had to change: `frames.spec.ts` sized a frame at a literal 700 px, which fell between rows at a pitch of 340 and captured all three cards at 269. It now derives the frame from where the third card actually sits.
