---
schema: 3
id: TKT-01M30FQQ5AFKDT008DG39WCHS0
title: Release v0.7.0
type: chore
status: in-progress
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim:
  actor: agent:claude/t3code-a6d0ff31
  branch: t3code/release-v0.7.0
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-a6d0ff31
  commit: 76a85ada1968d3ac8ff31a498c267dfaae795332
  session: null
  claimed_at: 2026-09-20T22:42:06Z
  expires_at: null
archive: null
created_at: 2026-09-20T22:42:06Z
updated_at: 2026-09-20T22:42:06Z
created_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
updated_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
extensions: {}
---

## Description

Release from 76a85ad, the merge of PR 24: pen rules are authored in the browser with Preview, Apply and Cancel over the schema 4 match record; the inspector explains a card's placement and returns it to automatic; the server's unreached capture handling is gone. Against git-ticket v0.23.0, unchanged. The sequence is docs/releasing.md; a person chose the version and approved the pushes on 2026-09-20, with the tag push to be confirmed once more before it happens.

## Acceptance criteria

- [ ] The source state is clean, and every release-scope ticket is finished or explicitly deferred with evidence
- [ ] just parity-check passes at the release commit
- [ ] just release-check and just release-snapshot pass
- [ ] just release-rehearse passes against a clean tagged clone
- [ ] origin main carries the release commit and its CI result was read, not assumed
- [ ] github main carries the same commit and the Windows lane passed
- [ ] An annotated v0.7.0 tag is on that exact commit on both forges
- [ ] github published five archives plus checksums.txt, verified by SHA-256 and by --version --json
- [ ] The real download installer works into a temporary prefix
- [ ] The published module resolves through the Go proxy for a clean Go-only install
- [ ] The GHCR image pulls anonymously and reports the right version
- [ ] Forgejo tag-verify passed on the tag
