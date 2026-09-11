---
schema: 3
id: TKT-01M29EEPX6KCR7YC7XM941P40N
title: Lower the lane cap from 6 to 5
type: task
status: draft
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
created_at: 2026-09-11T23:57:10Z
updated_at: 2026-09-11T23:57:10Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

TKT-01M29E2EVNTD69ACSY0W6TRK52 (Measure the lane cap against board shapes other than the fixture) measured six board shapes and found `LANE_CAP` of 6 beaten by 5 on every one of them.

| shape | cards | fit at 6 | fit at 5 |
| --- | --- | --- | --- |
| even, 5 per status | 30 | 0.7219 | 0.7219 |
| even, 10 per status | 60 | 0.4181 | 0.4181 |
| 20 in one status | 30 | 0.5538 | 0.5538 |
| 15 and 15 | 30 | 0.6068 | 0.7073 |
| all 30 in one status | 30 | 0.6068 | 0.7219 |
| eight cards | 8 | 0.8911 | 0.8911 |

A cap of 5 ties on the flat shapes and wins 14% to 16% on the ones with a deep lane. The reference fixture agrees, at 0.707 against 0.605. A cap of 6 never wins on any shape measured.

Six was one screenful of rows when the row pitch was 340 and the fit was near 0.49. The pitch is 269 now and the fit near 0.72, so one screenful is five rows. The rule that chose the number is intact and its arithmetic is not.

### What this touches

One constant, and then the numbers it moves. `canvas-arrange.spec.ts` records the column positions, the depth per column, the row positions, the span at both densities and the fit budget ratio, and every one of those changes. That spec is the reason this is not a one-line change, and it is also what makes the change safe.

Re-measure rather than deriving the new expectations from the table above. Four separate measurements in this area have expired when a later layout change landed, including two of mine that were correct when written.

### The cost to weigh

A lane reflows when it crosses a multiple of the cap, so a cap of 5 reflows at 5, 10 and 15 tickets where 6 reflows at 6, 12 and 18. Slightly more often, on a board that already reflows when a status gains its first ticket.

## Acceptance criteria

- [ ] LANE_CAP is 5 and its comment carries the measurement rather than the superseded screenful arithmetic.
- [ ] canvas-arrange.spec.ts is re-measured in the browser, not derived from the recorded table, and its column, row, span and fit expectations updated.
- [ ] No card overlaps another on the 30-card reference board at either density.
- [ ] The render is looked at, not only the assertions, since a taller-than-expected card is what the thin pitch clearance risks.
- [ ] docs/readability-v1.md records the new numbers and drops the note saying the code still says 6.
