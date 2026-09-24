---
schema: 3
id: TKT-01M38RXAS80BEW03WCGBYYRBDC
title: Open a ticket's inspector without a pointer
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
dependencies: []
blocks_on: none
references: []
claim:
  actor: agent:claude/mobile-list
  branch: worktree-agent-a752f78af0b9e1231
  worktree: /home/sothr/workspace/git.local.sothr.com/terva-sh/git-ticket-canvas/.claude/worktrees/agent-a752f78af0b9e1231
  commit: 151fa57c9b17bdc20c09ed2b3bba100ed42be27f
  session: null
  claimed_at: 2026-09-24T13:34:09Z
  expires_at: null
archive: null
created_at: 2026-09-24T03:56:23Z
updated_at: 2026-09-24T13:34:09Z
created_by:
  id: agent:claude/mobile-relate
  name: ""
updated_by:
  id: agent:claude/mobile-list
  name: ""
extensions: {}
---

## Description

Found while building TKT-01M38QP3PT4ZNXV37720NSX424 (Add a dependency or a parent from the inspector). Once a ticket's inspector is open, a dependency or a parent can be added by keyboard alone. Getting the inspector open cannot be done that way. A card is not focusable (`web/src/ui/canvas/CardView.tsx` sets no tabIndex and handles no key on the card itself), so selecting a ticket takes a click or a tap, and the browser test for that ticket opens the inspector with a click before it switches to keys.

A keyboard user can therefore edit any ticket they can reach and cannot reach one. The list view, TKT-01M38QP3ZNYRPN60GXQD4SCE6M (List tickets by status as well as on the board), may cover this if its rows are buttons, which is one reason to decide this after that ticket rather than before it. The other candidates are focusable cards with a roving tab stop, or opening a ticket from the search box.
