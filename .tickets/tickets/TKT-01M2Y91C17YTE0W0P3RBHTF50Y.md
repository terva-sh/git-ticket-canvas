---
schema: 3
id: TKT-01M2Y91C17YTE0W0P3RBHTF50Y
title: Widen a pen's rule from requiredLabels to a match record
type: task
status: in-progress
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - layout
assignees: []
milestone: null
parent: TKT-01M2ND0S8N5Y8V0HQFRCBKMXE3
origin: null
dependencies:
  - TKT-01M2ND1RKK6S4GXZQKKPP6H87P
blocks_on: none
references: []
claim:
  actor: agent:claude/t3code-a6d0ff31
  branch: t3code/match-canvas
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-a6d0ff31
  commit: 47b25aa27ba1fccd72ba48467ce5b72f61e641dc
  session: null
  claimed_at: 2026-09-20T19:30:51Z
  expires_at: null
archive: null
created_at: 2026-09-20T02:06:34Z
updated_at: 2026-09-20T19:32:42Z
created_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
updated_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
extensions: {}
---

## Description

Schema 4 replaces a pen's requiredLabels with a match record: labels, status, type, parent, every field optional, absent matching everything, present fields conjoined, a list within a field a disjunction. Schema 3 requiredLabels keeps opening and reads as match.labels. Cross-repo: the record, its validation and layout.Route in git-ticket's layout package, then git ticket canvas explain and show, then the web normalizer and resolver, then a git-ticket release and the canvas bump. Split from TKT-01M2ND1RKK6S4GXZQKKPP6H87P on 2026-09-20 so placement could ship on the rule the CLI already resolves; see docs/board-organization-design-v1.md, Pens, finished.

## Acceptance criteria

- [ ] A pen's match may name labels, status, type and parent, and every field is optional
- [ ] Schema 3 requiredLabels opens and reads as match.labels
- [ ] layout.Route and the web resolver give the same answer for every match field
- [ ] git ticket canvas explain reports which match fields a candidate failed

## Implementation plan

Read against git-ticket fd32d73 (v0.23.0) on 2026-09-21, after the release shipped the Go half.

The canvas side is a dependency bump plus one shape change carried through four surfaces. go.mod moves to v0.23.0 and the three workflows that `go install` the CLI move with it, which TestWorkflowsInstallTheGitTicketGoModRequires enforces. No production Go file names RequiredLabels, so the Go work is the wire-contract test in internal/api/pens_test.go alone: its penWire gains a match record, its assertions move to schema 4, and its invalid-routing table gains the cases the new record can fail on.

layout.Parse rewrites a loaded board's schema to 4, so this server answers schema 4 and renders `match` on every pen whatever the file spells. The web normaliser therefore reads match at schema 4 in practice, and the schema 3 requiredLabels path is for a legacy response from an older server; it maps to match.labels, a pen carrying both spellings or neither is refused, and match on a schema 3 response is refused, mirroring layout/pens.go penRuleSpelling.

resolve.ts follows layout/resolve.go field for field: RuleTicket gains type and parent beside status, a `failures` function returns the missing labels and the failed field names in the order labels, status, type, parent, and a Candidate carries the whole match with missingLabels, failed and the outcome, whose missing-labels value becomes no-match because a rule can now fail on a field holding no labels. Canvas.tsx already hands whole Ticket records to resolveBoard, so status, type and parent arrive without a props change; nothing in the UI prints a pen's rule today, so there is no rule rendering to widen.

This repository's own board file is rewritten to schema 4 by the v0.23.0 `check --fix`, which is a one-line diff because the board has no pens.
