---
schema: 3
id: TKT-01M23TNTW2086TMX4MS28ZC60W
title: Prepare dual-forge releases and the repository-serving image
type: task
status: in-progress
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
references: []
claim:
  actor: agent:terva/mieli
  branch: main
  worktree: null
  commit: null
  session: bcdfba63-126c-4b75-b174-c3b26346df9a
  claimed_at: 2026-09-09T19:36:24Z
  expires_at: null
archive: null
created_at: 2026-09-09T19:35:20Z
updated_at: 2026-09-09T19:37:24Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Prepare git-ticket-canvas to release like sibling git-ticket. User approved MIT Copyright (c) 2026 Drew Short, primary Forgejo origin with GitHub mirror, five cross-platform archives, SHA-256 checksums, build-derived version information, verified release installer, and GHCR image from release artifacts with local-repository serving instructions. No push, tag, or publication is authorized in this preparation task.

## Acceptance criteria

- [ ] Version reporting exposes build provenance without a store and has unit and executable tests.
- [ ] GoReleaser produces five platform archives with licenses, current documentation, and checksums; local verification gates artifact provenance and embedded frontend before publication.
- [ ] Primary Forgejo CI/releases and guarded GitHub mirror CI/releases are configured; release validation precedes publishing and the release procedure documents credentials and approval gates.
- [ ] A checksum-verifying release installer follows the local destination convention and has offline regression tests.
- [ ] A GHCR image uses verified release artifacts and documents safe local-repository serving; local image checks run or any unavailable runtime evidence remains explicitly pending.

## Implementation plan

Add MIT and runtime dependency notices, build-derived human/JSON version output, and five-target GoReleaser archives. Build without publishing on both forges, validate checksums, exact tag/commit/clean provenance and embedded asset serving, then upload the already-verified archives. Primary Forgejo runs frontend parity plus Go checks; GitHub guards by server URL and adds Windows Go checks. Include checksum-verifying download installer and an amd64 GHCR image assembled from the release archive with non-root/read-only defaults and explicit writable opt-in. Add release recipes and a successor runbook with approval/credential/live-verification gates. Exercise snapshot and fake-tag release builds only in disposable local clones, never tagging/pushing this checkout. Keep .tickets/canvas untouched. Document any live workflow or image checks unavailable before first publication.
