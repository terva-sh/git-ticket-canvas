---
schema: 3
id: TKT-01M38QMHD99E8CKJR263X7BVDB
title: Use the canvas from a phone or a tablet
type: epic
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - mobile
  - touch
  - ui
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references:
  - ref: design:mobile-design-v1
    path: docs/mobile-design-v1.md
claim: null
archive: null
created_at: 2026-09-24T03:34:06Z
updated_at: 2026-09-24T05:55:34Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

Make the canvas usable from a phone and comfortable from a tablet.

On a phone in portrait the header takes more than half the screen, every desk control stays visible, the hint line describes a mouse, and the board gets about a third of the height. The canvas takes one pointer at a time, has no pinch, and `#stage` sets no `touch-action`, so the browser can take a touch drag over and cancel it.

`docs/mobile-design-v1.md` is the design. What each size is for, as decided on 2026-09-24:

- **Phone:** view and triage. Pan, pinch, tap a card to open it in a bottom sheet, and change anything about a ticket there. There is a list view as well as the board. Moving cards, drawing frames and drag-to-link are not offered.
- **Tablet:** everything a desk can do, done by touch. Pinch and two-finger pan, long-press to select several cards, drags that survive touch, and nothing that needs hover.
- **Desk:** unchanged, apart from what the new pieces add everywhere (a way to add a relationship without dragging, and the list).

The children are ordered so each is useful alone. The gesture work comes first because every later phase depends on it.

## Acceptance criteria

- [ ] docs/mobile-design-v1.md is implemented or amended where it was wrong
- [ ] On a real phone a person can find a ticket, open it, and change its status, notes and checklist without zooming the page
- [ ] On a real tablet everything a desk can do can be done by touch
- [ ] A desk canvas behaves as it does today

## Notes

**agent:claude/t3code** at 2026-09-24T05:50:22Z

PR 33 (wave 1): the Terva review on d8e2d90 was clean (run 4616fcaf-2e07-4ba4-82e8-64b2029426d2), but CI run 226 on the same head failed after 4m14s. Its log is not readable from this machine: the jobs log needs a web session, and the API has no jobs endpoint. Locally, on the same head, just drift-check and just parity-check (the CI recipe) both pass, with browser-test-embedded at 127 passed / 7 skipped / 0 failed. The first guess was that fonts differ: this machine renders the sans stack as FreeSans, while CI installs font-noto. Rerunning the whole suite with Noto Sans forced in also gave 127 passed, so fonts are not the cause. This commit is pushed to rerun CI. If CI fails again, the log is needed from the Actions page.

**agent:claude/t3code** at 2026-09-24T05:55:34Z

PR 33 CI: the rerun, run 228 on c7a4da4, passed in 4m20s on code identical to the failed run 226 (the only commit between them is a ticket note). So run 226 was a flake. Its log was never readable from here, so which test is not known. The two known candidates are TKT-01M38YCD9ZAZSTAHM4FJGQ1TQ9 (Wait for the board before measuring it in the touch spec's lift test) and the refresh-regressions draft flake. PR 33 was merged at 9a1d66b.
