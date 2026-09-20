---
schema: 3
id: TKT-01M2YE1VJ9B9CKER3WENM0A5EY
title: Release v0.5.0
type: task
status: draft
status_reason: null
priority: high
due_on: null
labels:
  - release
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-20T03:34:12Z
updated_at: 2026-09-20T03:43:42Z
created_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
updated_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
extensions: {}
---

## Description

The first release where a board with pens places its cards by rule. v0.4.0 laid every automatic card out in status lanes; v0.5.0 does that only on a board with no pens, and on a board with pens it places each unpinned card by the first pen in ruleOrder whose labels it carries, draws the pens, grows an overfull one, and puts a card no rule caught at the inbox, marked Unhoused. `git ticket canvas show | pens | explain` in git-ticket v0.21.0 reads the same board the same way.

Sixty-nine commits since v0.4.0, seventeen tickets, twelve pull requests (#5 to #16). The layout schema moved to git-ticket's `layout` package (v0.20.0), targeted Terva reviews were installed, the desk and served canvases got a declared parity, and the documentation was brought up to what the canvas does.

The minor rather than the patch because placement on a board with pens is new behaviour a board can see, and the git-ticket dependency moved from v0.19.1 to v0.21.0. Nothing in either command's interface was removed or renamed, so it is not a major.

The release commit is 8f63cf9, the merge of PR 16, already green on Forgejo. This ticket is recorded after the tag rather than folded into the release commit, so the commit CI read is the commit tagged.

## Acceptance criteria

- [x] The source state is clean, and every release-scope ticket is finished or explicitly deferred with evidence
- [x] just parity-check passes at the release commit
- [x] just release-check and just release-snapshot pass
- [x] just release-rehearse passes against a clean tagged clone
- [x] origin main carries the release commit and its CI result was read, not assumed
- [x] github main carries the same commit and the Windows lane passed
- [x] An annotated v0.5.0 tag is on that exact commit on both forges
- [x] github published five archives plus checksums.txt, verified by SHA-256 and by --version --json
- [x] The real download installer works into a temporary prefix
- [x] The published module resolves through the Go proxy for a clean Go-only install
- [ ] The GHCR image pulls anonymously and reports the right version
- [x] Forgejo tag-verify passed on the tag

## Notes

**agent:claude/t3code-a6d0ff31** at 2026-09-20T03:36:30Z

Local checks at 8f63cf9, the merge of PR 16, with no release-ticket commit folded in. just check passed; just release-snapshot verified five archives with both commands, checksums, licenses, provenance, the two unauthenticated-bind refusals and the embedded HTTP assets, named 0.4.1-next; just release-rehearse passed against a clean tagged throwaway clone at 0.0.0-rehearsal, tag and clone removed. just parity-check passed end to end: 75 browser tests, 6 skipped, and the Go-only build and install of both commands at clean HEAD with Node absent from PATH.

**agent:claude/t3code-a6d0ff31** at 2026-09-20T03:36:30Z

Forgejo CI on 8f63cf9 (Embedded frontend and Go parity, pull_request on PR 16): success, read from the statuses API. The mirror moved bfac0eb..8f63cf9 by fast-forward, the commit named explicitly, no tag with it. GitHub mirror-ci run 35486902029 on 8f63cf9: success, windows job 106014834880 green in 1m28s, read with gh.

**agent:claude/t3code-a6d0ff31** at 2026-09-20T03:36:30Z

Version chosen by the maintainer: v0.5.0, minor, on 2026-09-20. Annotated tag created on 8f63cf9a40eda162f853adb58c365bffea169568 and pushed to origin, then to github, each by name. git tag --contains 8f63cf9 answers v0.5.0.

**agent:claude/t3code-a6d0ff31** at 2026-09-20T03:43:42Z

Published: https://github.com/terva-sh/git-ticket-canvas/releases/tag/v0.5.0 at 2026-09-20T03:42:15Z, not a draft and not a prerelease, GitHub release run 35486999452 green. Five archives plus checksums.txt, sha256sum -c over the downloaded bytes: all five OK. The linux amd64 archive carries both commands, LICENSE, THIRD_PARTY_LICENSES and README-release.md; both report {version v0.5.0, commit 8f63cf9a40eda162f853adb58c365bffea169568, go1.25.0, modified false}. The desk canvas refuses -addr 0.0.0.0:7999 and names the server; the server refuses to start with no identity provider and names the flags. Their SHA-256 differ (85b3a250…, fd6ce01d…). Forgejo tag-verify run 140 on v0.5.0: success.

**agent:claude/t3code-a6d0ff31** at 2026-09-20T03:43:42Z

Installer: install.sh from raw.githubusercontent.com main, --prefix into a temporary directory, --version v0.5.0: the installed binary reports the release identity and its SHA-256 equals the archive's (85b3a250…). Go proxy: v0.5.0.info served with the tag's hash; GOBIN install of both the root module and cmd/git-ticket-canvas-server at v0.5.0 built and each reports version v0.5.0 with commit unknown, which is what a module install reports. GHCR: not verified from this machine, which has no docker or podman; left unticked.
