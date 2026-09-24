---
schema: 3
id: TKT-01M38QP3ZNYRPN60GXQD4SCE6M
title: List tickets by status as well as on the board
type: task
status: in-progress
status_reason: null
priority: normal
due_on: null
labels:
  - mobile
  - ui
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies:
  - TKT-01M38QP2WYRK9A18P473KTM9BV
blocks_on: none
references: []
claim:
  actor: agent:claude/mobile-list
  branch: worktree-agent-a752f78af0b9e1231
  worktree: /home/sothr/workspace/git.local.sothr.com/terva-sh/git-ticket-canvas/.claude/worktrees/agent-a752f78af0b9e1231
  commit: 5389071f510222a6008ff7deb307c6f2074d7043
  session: null
  claimed_at: 2026-09-24T13:18:00Z
  expires_at: null
archive: null
created_at: 2026-09-24T03:34:58Z
updated_at: 2026-09-24T13:18:01Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/mobile-list
  name: ""
extensions: {}
---

## Description

Add a list view as an alternative to the board, switched by the Board/List control in the header. It groups tickets by status in the store's status order. It filters through `matchesTicket`, the same function the board and the count use, so the list and the count can never disagree. Tapping a row opens the same inspector or sheet. A row carries the title, ID, priority, labels and criterion progress.

The choice is stored per person and per browser with the display settings. A phone opens on the board the first time. The list is available on every layout and is the default on none.

See `docs/mobile-design-v1.md`, "The list".

## Acceptance criteria

- [ ] Board/List switches the view and the choice survives a reload
- [ ] The list shows the same tickets the board shows under every filter and search, with a test
- [ ] Tapping a row opens the ticket in the inspector or sheet
- [ ] Live updates reach the list as they reach the board
- [ ] A phone baseline screenshot of the list is added
- [ ] A touch drag scrolls the list on the emulated phone and tablet, carried from TKT-01M38QP2CZEJ120PFDKMK3WTP1's first criterion
