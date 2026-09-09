---
schema: 3
id: TKT-01M23X0S431DZMVG8EEA4HPXPN
title: Update the main README for Preact and git-ticket-canvas
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels: []
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references:
  - ref: docs:readme
    path: README.md
claim: null
archive: null
created_at: 2026-09-09T20:16:16Z
updated_at: 2026-09-09T20:18:13Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Update README.md at the user's request before publication. Replace the vanilla-JavaScript and tkcanvas descriptions with the current Preact, TypeScript, Vite, embedded-assets and executable details. Keep existing architecture rationale and historical successor guides intact.

## Acceptance criteria

- [x] README describes the Preact source layout, current executable, and frontend build versus Go-only build requirements accurately.

## Implementation plan

Update only README.md prose: current name and safe Go-only quickstart, local install and frontend build instructions, Preact UI/platform/dist architecture, and links to release usage and verification. Preserve the layout rationale and separate historical guides. Verify commands against justfile/main.go, check local links and obsolete wording, then run diff and strict ticket checks.

## Notes

**agent:terva/mieli** at 2026-09-09T20:18:06Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-68 README describes the Preact source layout, current executable, and frontend build versus Go-only build requirements accurately. — Updated README.md against main.go, justfile and web/src ownership. Local Markdown links/anchor and obsolete wording checks passed; git diff --check passed. Documentation only, no runtime changes.

## Summary

Updated README.md for git-ticket-canvas and Preact/TypeScript/Vite, distinguishing Go-only embedded builds from frontend development. Added current install/dev commands, component boundaries and guide links; corrected the optimistic-state description and loopback guidance. Verified local links, heading anchor, obsolete wording and diff whitespace. No runtime code, historical guides or canvas data changed.
