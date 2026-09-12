---
schema: 3
id: TKT-01M29RG95G4T6FB9BV7T3RBB34
title: Verify the v0.2.0 hosted release and public installation
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
  - ref: report:release-v0.2.0
    path: docs/release-v0.2.0.md
  - ref: docs:published-assets
    path: docs/published-asset-verification.md
claim: null
archive: null
created_at: 2026-09-12T02:52:48Z
updated_at: 2026-09-12T02:53:06Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Publication record for v0.2.0, filed after the fact to match the shape TKT-01M23W2X3P6BFHY9HESWBW9DZZ (Verify the first hosted release and public installation) set for v0.1.0. The v0.1.0 ticket was a gate opened before publication; this one is the record of a publication the user drove directly, so it lands closed rather than pretending to have gated anything.

The sequence in `docs/releasing.md` was followed. Evidence is in `docs/release-v0.2.0.md`.

### What nearly went wrong

Release preparation stopped before any tag was created. GitHub's Windows lane had failed on every commit since 616aca8 on 2026-09-10, and the public release workflow requires a successful Windows job for the tag. Tagging would have produced a tag that could not publish, and the runbook forbids moving a published tag to repair one.

The cause was `TestLiveStoreReplacementAndCancelledLifecycle` renaming the store directory. fsnotify shares delete on its watch handles, so the watcher was not to blame. Go's `syscall.Open` on Windows never sets `FILE_SHARE_DELETE`, and the live coordinator reads the store continuously, so Windows refused to rename the enclosing directory. Commit 8529287 split that test in three, which also restored the cancelled-lifecycle coverage Windows had never reached.

Both lanes were green on 8529287 before the tag was created.

## Acceptance criteria

- [x] With approval, push identical main history to origin and github; primary parity and GitHub Windows CI actually pass.
- [x] A person selects the version and approves tag publication; both forges publish exactly five archives and checksums with correct clean tag/commit provenance.
- [x] The real public installer succeeds in a temporary prefix and its executable matches the released archive; tagged Go-only install and Go proxy metadata are verified.
- [x] GHCR exact/minor/latest visibility and provenance are verified anonymously; the published image serves a mounted local repository safely.
- [x] Record live workflow URLs, tag, commit, hashes, install/image results and any remaining limitations in a release report.

## Summary

Published v0.2.0 at 8529287fdba6b23d5b3b4a332dc4eb6b5719b871 on both forges with one annotated tag object, fed7084e45a38dd2e6b30b6c1a0df086806d2e8c. All five acceptance criteria were earned and none were ticked on trust.

The release was blocked first. GitHub's Windows lane had been red since 616aca8, and the public release workflow requires that job for the tag, so preparation stopped before tagging rather than creating a tag that could not publish. 8529287 fixed it by splitting the offending test in three, which also gave Windows back the cancelled-lifecycle coverage it had never reached. Both lanes were green on that commit before the tag existed.

Verified after publication: six non-draft assets on each forge; both sets passed `verify-release.py --published` run from a clean detached worktree at the tag. The forges' archives differ byte for byte, explained by go1.25.0 on the GitHub builder against go1.25.5 on Forgejo, with both reporting v0.2.0, the full commit and modified=false. The published install.sh matched the committed copy, installed into a temporary prefix with its own checksum check, and produced a binary byte-identical to the GitHub archive. The Go proxy serves v0.2.0 with Origin.Hash equal to the release commit; a tagged `go install` reports commit=unknown, which is the documented fallback for module downloads and matches v0.1.0. GHCR 0.2.0, 0.2 and latest pull anonymously to one digest af0ec8739fe1, and the published image passed the repository-serving and write-policy checks.

docs/release-v0.2.0.md records the URLs, hashes and limitations, including a correction: the Forgejo run URL built from the global id `tea` reports returns 404, because the web path uses index_in_repo. Every link in that document was checked for HTTP 200. No tag was moved, no draft deleted, and user-owned `.tickets/canvas/` was untouched.
