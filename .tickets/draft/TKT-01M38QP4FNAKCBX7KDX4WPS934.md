---
schema: 3
id: TKT-01M38QP4FNAKCBX7KDX4WPS934
title: Replace hover-only help and edge names on a touch screen
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - touch
  - ui
assignees: []
milestone: null
parent: TKT-01M38QMHD99E8CKJR263X7BVDB
origin: null
dependencies:
  - TKT-01M38QP2CZEJ120PFDKMK3WTP1
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-24T03:34:58Z
updated_at: 2026-09-24T03:34:59Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

Several things are explained only on hover, which a finger cannot do. The hint line describes a mouse. Edge names show on hover or on selection. Some controls explain themselves only through a `title`.

On a coarse pointer, the hint line describes touch ("drag to pan · pinch to zoom · double-tap to file a ticket · hold a card to select several"). Tapping an edge names it. A control whose only explanation is its `title` gets a visible label or an entry in the help. The stage detects a double tap itself (a second tap within 300 ms and 24 px) and does not rely on `dblclick`, which browsers synthesise inconsistently once `touch-action` is `none`.

See `docs/mobile-design-v1.md`, "Tablet".

## Acceptance criteria

- [ ] The hint line is chosen by pointer and is accurate for touch
- [ ] Tapping an edge names it, with a test on the emulated tablet
- [ ] A double tap on empty board files a ticket on the emulated tablet, and double-click on a desk still does
- [ ] No control is explained only by its title attribute on a coarse pointer
