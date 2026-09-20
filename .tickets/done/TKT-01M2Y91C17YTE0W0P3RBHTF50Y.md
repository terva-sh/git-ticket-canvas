---
schema: 3
id: TKT-01M2Y91C17YTE0W0P3RBHTF50Y
title: Widen a pen's rule from requiredLabels to a match record
type: task
status: done
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
claim: null
archive: null
created_at: 2026-09-20T02:06:34Z
updated_at: 2026-09-20T19:44:18Z
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

- [x] A pen's match may name labels, status, type and parent, and every field is optional
- [x] Schema 3 requiredLabels opens and reads as match.labels
- [x] layout.Route and the web resolver give the same answer for every match field
- [x] git ticket canvas explain reports which match fields a candidate failed

## Implementation plan

Read against git-ticket fd32d73 (v0.23.0) on 2026-09-21, after the release shipped the Go half.

The canvas side is a dependency bump plus one shape change carried through four surfaces. go.mod moves to v0.23.0 and the three workflows that `go install` the CLI move with it, which TestWorkflowsInstallTheGitTicketGoModRequires enforces. No production Go file names RequiredLabels, so the Go work is the wire-contract test in internal/api/pens_test.go alone: its penWire gains a match record, its assertions move to schema 4, and its invalid-routing table gains the cases the new record can fail on.

layout.Parse rewrites a loaded board's schema to 4, so this server answers schema 4 and renders `match` on every pen whatever the file spells. The web normaliser therefore reads match at schema 4 in practice, and the schema 3 requiredLabels path is for a legacy response from an older server; it maps to match.labels, a pen carrying both spellings or neither is refused, and match on a schema 3 response is refused, mirroring layout/pens.go penRuleSpelling.

resolve.ts follows layout/resolve.go field for field: RuleTicket gains type and parent beside status, a `failures` function returns the missing labels and the failed field names in the order labels, status, type, parent, and a Candidate carries the whole match with missingLabels, failed and the outcome, whose missing-labels value becomes no-match because a rule can now fail on a field holding no labels. Canvas.tsx already hands whole Ticket records to resolveBoard, so status, type and parent arrive without a props change; nothing in the UI prints a pen's rule today, so there is no rule rendering to widen.

This repository's own board file is rewritten to schema 4 by the v0.23.0 `check --fix`, which is a one-line diff because the board has no pens.

## Notes

**agent:claude/t3code-a6d0ff31** at 2026-09-20T19:39:56Z

What the next person needs, beyond the diff.

The wire is always schema 4 from this server, whatever the board file spells: layout.Parse rewrites a loaded board's schema to layout.Schema before it returns, so a schema 3 file on disk arrives as schema 4 with its requiredLabels already read as match.labels. The normalizer's schema 3 path is therefore for a response from an older canvas server, not for a board somebody has not rewritten, and the first thing to check if it ever fires is which binary answered.

The two resolvers are held together by inspection and by mirrored tests, not by a test that runs both. resolve.ts follows layout/resolve.go field for field and web/src/platform/canvas/resolve.test.ts covers each field, the disjunction within status, type and parent, the conjunction across fields and within labels, and the order failed reports them in; but nothing executes the Go implementation against the TypeScript one. A parity test that fed one corpus to both would be the real guarantee and does not exist in either repository.

Nothing in the canvas prints a pen's rule today. The pen layer draws the title, the order number and the count, so widening what a rule can say added no rendering, and a control that shows or edits a match is still unwritten work.

`git ticket canvas explain` is git-ticket's command, not this repository's, so criterion four is ticked on the v0.23.0 release: layout.Candidate carries Failed, and plan 10.10 publishes it in the canvas-explain envelope.

**agent:claude/t3code-a6d0ff31** at 2026-09-20T19:44:18Z

Terva review 59 reviewed ddeb1e45dd66: one medium finding, accepted. The normaliser took any non-blank string as a parent match value where the backend refuses anything but a ticket ID; it now holds parent values to the ID grammar of git-ticket plan 5.6 and refuses the rest as invalid_response, with two cases in the invalid table.

## Summary

The canvas reads the schema 4 match record. go.mod moves to github.com/terva-sh/git-ticket v0.23.0 with no replace directive, and .forgejo/workflows/ci.yml, .forgejo/workflows/tag-verify.yml and .github/workflows/release.yml install the same version, which a root Go test enforces.

No production Go file named RequiredLabels, so internal/api/pens_test.go is the whole Go change: its pen wire carries a match record, one pen names all four fields, its assertions moved to schema 4, and its invalid-routing table gained empty, null and unknown match fields, an invalid parent, and the schema 3 spelling arriving at a schema 4 server.

On the web side Pen.match replaced Pen.requiredLabels; the normalizer takes match at schema 4 and requiredLabels at schema 3 as match.labels, and refuses a pen carrying both spellings, neither, or one its schema does not allow; and resolve.ts follows layout/resolve.go, with failures() returning the missing labels and the failed field names, a candidate carrying the whole rule, and the missing-labels outcome renamed no-match. Canvas.tsx already hands whole tickets to the resolver, so status, type and parent needed no plumbing. New tests: web/src/platform/tickets/layout.test.ts for both schemas, and per-field, disjunction and conjunction cases in resolve.test.ts. README names the four fields and its sample board is schema 4, and this store's own board file was rewritten to schema 4 by the v0.23.0 check --fix.

just check is green, 454 web tests and the full Go suite pass, and web/dist is rebuilt in its own commit. The gap left behind is in the notes: no test runs the Go resolver against the TypeScript one, so their agreement rests on inspection and mirrored cases.
