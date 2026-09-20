---
schema: 3
id: TKT-01M30FQQ5AFKDT008DG39WCHS0
title: Release v0.7.0
type: chore
status: done
status_reason: v0.7.0 published from 2fc1604 on 2026-09-20
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
updated_at: 2026-09-20T23:21:01Z
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
- [x] just parity-check passes at the release commit
- [x] just release-check and just release-snapshot pass
- [x] just release-rehearse passes against a clean tagged clone
- [x] origin main carries the release commit and its CI result was read, not assumed
- [x] github main carries the same commit and the Windows lane passed
- [x] An annotated v0.7.0 tag is on that exact commit on both forges
- [x] github published five archives plus checksums.txt, verified by SHA-256 and by --version --json
- [x] The real download installer works into a temporary prefix
- [x] The published module resolves through the Go proxy for a clean Go-only install
- [ ] The GHCR image pulls anonymously and reports the right version
- [x] Forgejo tag-verify passed on the tag

## Notes

**agent:claude/t3code-a6d0ff31** at 2026-09-20T22:48:19Z

At 76a85ad on 2026-09-20: origin CI on the merge (push) read as success from the commit status. github main pushed to 76a85ad; mirror-ci run 35542586151 passed, Windows lane included. Local: just check exit 0 (after npm ci in the main checkout, which had no node_modules), just release-snapshot exit 0, just release-rehearse exit 0 (five archives with both commands, checksums, licenses, provenance, the unauthenticated-bind refusals and embedded HTTP assets verified for 0.0.0-rehearsal, clone and tag removed). just parity-check failed once in browser-test-embedded: tests/browser/pens.spec.ts 'a pen authored in the browser is the pen the CLI would have written' got layout_conflict on Apply under the parallel load of the full run. Cause: the server reconciles an outside write (the CLI's inbox placement) after a settling interval and serves the previous image until then, so the browser opened the panel over the old image and its draft's expectation no longer matched disk; the refusal was correct, the spec's assumption was not. Fixed: the spec now waits until the served board shows each CLI write before loading the page. 16 of 16 on a four-times repeat. The release commit will be the merge of the PR carrying this fix and this ticket; parity-check is being rerun on that branch and recorded below. Release-scope tickets TKT-01M30BQ1V, TKT-01M30BTTW and TKT-01M30BQ1X are done on main.

**agent:claude/t3code-a6d0ff31** at 2026-09-20T23:21:01Z

Published 2026-09-20. Release commit 2fc1604 (merge of PR 25); its tree is identical to d914218, where just parity-check passed (82 browser tests, Go-only install of both commands), and just release-snapshot and release-rehearse were rerun at 2fc1604 itself, both exit 0. origin CI on 2fc1604 (push): success. github mirror-ci run 35543121533: Windows lane success. Annotated v0.7.0 on 2fc1604 pushed to origin then github. Forgejo tag-verify run 188 (id 21302): success. github public-release run 35543318536 failed on its first attempt in 'Verify embedded parity before packaging': go test -race reported TestLiveBurstDedupAndIrrelevantFiles 'burst published 2 generations', the burst-coalescing assertion in internal/api/live_test.go, unchanged since 029558e and green on every other run today; nothing was packaged or uploaded, so the failed job was rerun rather than the tag moved, per docs/releasing.md. The rerun passed: windows and release success, release published 23:19:43Z, not a draft, not a prerelease, six assets (five archives and checksums.txt), all five OK by sha256sum -c, and the linux amd64 binary reports version v0.7.0, commit 2fc16041966976b8ec32518a7176d884f6c4e2ed, go1.25.0, modified false. install.sh --prefix into a temporary directory --version v0.7.0 installed a binary it reported as v0.7.0. proxy.golang.org serves v0.7.0 at 2fc1604 (refs/tags/v0.7.0) and a clean go install of the tag reports v0.7.0. GHCR is left unticked as for v0.6.0: this machine has no docker or podman; the release job that builds and tests the image passed. The burst test flake is worth its own ticket if it recurs on a runner again.

**agent:claude/t3code-a6d0ff31** at 2026-09-20T23:21:01Z

in-progress to done: v0.7.0 published from 2fc1604 on 2026-09-20

## Summary

v0.7.0 released from 2fc1604 on 2026-09-20 against git-ticket v0.23.0: pen rules are authored in the browser with Preview, Apply and Cancel, the inspector explains placement and returns a card to automatic, and the server's unreached capture handling is gone. Every check in docs/releasing.md passed except the GHCR pull, which this machine cannot run; the GitHub release job needed one rerun after an unrelated Go timing test failed before packaging.
