---
schema: 3
id: TKT-01M3086CWETZ0BRK9CBRSW1VTS
title: Release v0.6.0
type: chore
status: done
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
claim: null
archive: null
created_at: 2026-09-20T20:30:19Z
updated_at: 2026-09-20T20:40:16Z
created_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
updated_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
extensions: {}
---

## Description

Release from aaf4749, the merge of PR 19: the canvas builds against git-ticket v0.23.0, reads the schema 4 match record, places by every match field the way layout.Route does, and no longer carries the opt-in placement trial. Paired with git-ticket v0.23.0, which added the canvas write words and check of board files. The sequence is docs/releasing.md; a person chose the version and approved the pushes on 2026-09-20.

## Acceptance criteria

- [x] The source state is clean, and every release-scope ticket is finished or explicitly deferred with evidence
- [x] just parity-check passes at the release commit
- [x] just release-check and just release-snapshot pass
- [x] just release-rehearse passes against a clean tagged clone
- [x] origin main carries the release commit and its CI result was read, not assumed
- [x] github main carries the same commit and the Windows lane passed
- [x] An annotated v0.6.0 tag is on that exact commit on both forges
- [x] github published five archives plus checksums.txt, verified by SHA-256 and by --version --json
- [x] The real download installer works into a temporary prefix
- [x] The published module resolves through the Go proxy for a clean Go-only install
- [ ] The GHCR image pulls anonymously and reports the right version
- [x] Forgejo tag-verify passed on the tag

## Notes

**agent:claude/t3code-a6d0ff31** at 2026-09-20T20:30:19Z

Local checks at aaf4749 on 2026-09-20: just check, release-snapshot, release-rehearse and parity-check all exit 0; the rehearsal verified five archives with both commands, checksums, licenses, provenance, the unauthenticated-bind refusals and embedded HTTP assets. Release-scope tickets TKT-01M2ND1RM, TKT-01M2Y91C17, TKT-01M2Y91C31 and TKT-01M2Y9YX are done on main.

**agent:claude/t3code-a6d0ff31** at 2026-09-20T20:40:16Z

Published 2026-09-20. origin CI on aaf4749: success, read from the commit status. github mirror-ci run 35535819498: windows success. Annotated v0.6.0 on aaf4749 pushed to origin then github. public-release run 35535919542: windows and release success; release published 20:39:17Z, not a draft, not a prerelease, six assets: five archives and checksums.txt, all five OK by sha256sum -c, and the linux amd64 binary reports version v0.6.0, commit aaf47492ec54c18550146fd19256ed0592c65c0a, modified false. install.sh --prefix into a temporary directory downloaded and installed a binary reporting v0.6.0. proxy.golang.org serves v0.6.0 at that commit. Forgejo tag-verify run 8118: success. GHCR is left unticked: this machine has no docker or podman, so the anonymous pull was not tried; the release job that builds and tests the image passed.

## Summary

v0.6.0 released from aaf4749 on 2026-09-20, paired with git-ticket v0.23.0: the canvas reads the schema 4 match record and places by every field, the placement trial is gone, and the Terva reviewer reads frontend PRs through exclude-paths. Every check in docs/releasing.md passed except the GHCR pull, which this machine cannot run.
