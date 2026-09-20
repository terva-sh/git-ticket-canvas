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
updated_at: 2026-09-20T22:48:19Z
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

- [x] The source state is clean, and every release-scope ticket is finished or explicitly deferred with evidence
- [ ] just parity-check passes at the release commit
- [x] just release-check and just release-snapshot pass
- [x] just release-rehearse passes against a clean tagged clone
- [x] origin main carries the release commit and its CI result was read, not assumed
- [x] github main carries the same commit and the Windows lane passed
- [ ] An annotated v0.7.0 tag is on that exact commit on both forges
- [ ] github published five archives plus checksums.txt, verified by SHA-256 and by --version --json
- [ ] The real download installer works into a temporary prefix
- [ ] The published module resolves through the Go proxy for a clean Go-only install
- [ ] The GHCR image pulls anonymously and reports the right version
- [ ] Forgejo tag-verify passed on the tag

## Notes

**agent:claude/t3code-a6d0ff31** at 2026-09-20T22:48:19Z

At 76a85ad on 2026-09-20: origin CI on the merge (push) read as success from the commit status. github main pushed to 76a85ad; mirror-ci run 35542586151 passed, Windows lane included. Local: just check exit 0 (after npm ci in the main checkout, which had no node_modules), just release-snapshot exit 0, just release-rehearse exit 0 (five archives with both commands, checksums, licenses, provenance, the unauthenticated-bind refusals and embedded HTTP assets verified for 0.0.0-rehearsal, clone and tag removed). just parity-check failed once in browser-test-embedded: tests/browser/pens.spec.ts 'a pen authored in the browser is the pen the CLI would have written' got layout_conflict on Apply under the parallel load of the full run. Cause: the server reconciles an outside write (the CLI's inbox placement) after a settling interval and serves the previous image until then, so the browser opened the panel over the old image and its draft's expectation no longer matched disk; the refusal was correct, the spec's assumption was not. Fixed: the spec now waits until the served board shows each CLI write before loading the page. 16 of 16 on a four-times repeat. The release commit will be the merge of the PR carrying this fix and this ticket; parity-check is being rerun on that branch and recorded below. Release-scope tickets TKT-01M30BQ1V, TKT-01M30BTTW and TKT-01M30BQ1X are done on main.
