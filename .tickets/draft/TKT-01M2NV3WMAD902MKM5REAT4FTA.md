---
schema: 3
id: TKT-01M2NV3WMAD902MKM5REAT4FTA
title: Decide what density should follow now that the viewport chooses it
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - ui
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T19:29:21Z
updated_at: 2026-09-16T19:29:21Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

Carried out of TKT-01M2ND1RNXB8941M21MRZRJDN2, whose fifth criterion was "density follows zoom, with the manual control kept as an override". That was deferred to the zoom ticket so the two would not invent two preference mechanisms.

Both landed, and the premise moved. TKT-01M2NHFKXWYHX69YQ7KJRW1MP0 made density a choice from the viewport with an explicit `Automatic`, stored per person in the browser, and TKT-01M2NKHS0MT0GVBTX6YAA0F3NT made the magnification something a board remembers per store and per board. So density now has two candidate inputs and one override, not one input and one override, and "follows zoom" would be a third thing writing the same value.

### The question to settle before writing any of it

Is zoom a better signal for density than the viewport is? A board zoomed out to 40% renders a full card at 112px, which argues the same way the phone case did. But somebody who zoomed out to see the shape of a board may want the cards to stay recognisable rather than to change what they contain under them.

If the answer is yes, the mechanism already exists and this is small: `chooseDisplay` takes the magnification alongside the viewport facts, and an override still wins. If it is no, this closes with that written down, which is worth more than the code would have been.

Whatever lands should check that a restored view applies the right density on the first paint rather than after the first scroll, which is the note the original ticket left.
