---
schema: 3
id: TKT-01M3CVT36K83VGTX1DX5CANB6B
title: Release v0.8.0
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
  actor: agent:claude/t3code-1e9656fe
  branch: t3code/check-public-release-lag
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-1e9656fe
  commit: 580b9a9ea0de6242ce96907b802eb71686c78f3f
  session: null
  claimed_at: 2026-09-25T18:04:00Z
  expires_at: null
archive: null
created_at: 2026-09-25T18:04:00Z
updated_at: 2026-09-25T18:04:00Z
created_by:
  id: agent:claude/t3code-1e9656fe
  name: ""
updated_by:
  id: agent:claude/t3code-1e9656fe
  name: ""
extensions: {}
---

## Description

Release from 580b9a9, the merge of PR 38, which makes the canvas usable from a phone or a tablet. PRs 29 to 38 add the groundwork, two-finger pinch zoom and pan on the board, a phone header and ticket sheet, hold-to-select, touch help that needs no hover, the list view, and keyboard reach. PR 33 also refuses a link that would close a dependency cycle. PRs 27 and 28 move the Terva review settings into organization variables, which changes CI only. Built against git-ticket v0.23.0, unchanged. The sequence is docs/releasing.md. A person chose v0.8.0 and approved the pushes on 2026-09-25, and will confirm the tag push once more before it happens.

## Acceptance criteria

- [x] The source state is clean, and every release-scope ticket is finished or explicitly deferred with evidence
- [ ] just parity-check passes at the release commit
- [ ] just release-check and just release-snapshot pass
- [ ] just release-rehearse passes against a clean tagged clone
- [ ] origin main carries the release commit and its CI result was read, not assumed
- [ ] github main carries the same commit and the Windows lane passed
- [ ] An annotated v0.8.0 tag is on that exact commit on both forges
- [ ] github published five archives plus checksums.txt, verified by SHA-256 and by --version --json
- [ ] The real download installer works into a temporary prefix
- [ ] The published module resolves through the Go proxy for a clean Go-only install
- [ ] The GHCR image pulls anonymously and reports the right version
- [ ] Forgejo tag-verify passed on the tag
