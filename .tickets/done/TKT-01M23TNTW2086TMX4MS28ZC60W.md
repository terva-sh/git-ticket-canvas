---
schema: 3
id: TKT-01M23TNTW2086TMX4MS28ZC60W
title: Prepare dual-forge releases and the repository-serving image
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
  - ref: release:config
    path: .goreleaser.yaml
  - ref: release:github
    path: .github/workflows/release.yml
  - ref: release:verification
    path: scripts/verify-release.py
  - ref: release:installer
    path: install.sh
  - ref: release:image
    path: Dockerfile
  - ref: release:version
    path: version.go
  - ref: release:runbook
    path: docs/releasing.md
  - ref: release:evidence
    path: docs/release-preparation-verified.md
  - ref: release:usage
    path: README-release.md
  - ref: release:forgejo
    path: .forgejo/workflows/tag-verify.yml
claim: null
archive: null
created_at: 2026-09-09T19:35:20Z
updated_at: 2026-09-15T21:17:38Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

Prepare git-ticket-canvas to release like sibling git-ticket. User approved MIT Copyright (c) 2026 Drew Short, primary Forgejo origin with GitHub mirror, five cross-platform archives, SHA-256 checksums, build-derived version information, verified release installer, and GHCR image from release artifacts with local-repository serving instructions. No push, tag, or publication is authorized in this preparation task.

## Acceptance criteria

- [x] Version reporting exposes build provenance without a store and has unit and executable tests.
- [x] GoReleaser produces five platform archives with licenses, current documentation, and checksums; local verification gates artifact provenance and embedded frontend before publication.
- [x] Primary Forgejo CI/releases and guarded GitHub mirror CI/releases are configured; release validation precedes publishing and the release procedure documents credentials and approval gates.
- [x] A checksum-verifying release installer follows the local destination convention and has offline regression tests.
- [x] A GHCR image uses verified release artifacts and documents safe local-repository serving; local image checks run or any unavailable runtime evidence remains explicitly pending.

## Implementation plan

Add MIT and runtime dependency notices, build-derived human/JSON version output, and five-target GoReleaser archives. Build without publishing on both forges, validate checksums, exact tag/commit/clean provenance and embedded asset serving, then upload the already-verified archives. Primary Forgejo runs frontend parity plus Go checks; GitHub guards by server URL and adds Windows Go checks. Include checksum-verifying download installer and an amd64 GHCR image assembled from the release archive with non-root/read-only defaults and explicit writable opt-in. Add release recipes and a successor runbook with approval/credential/live-verification gates. Exercise snapshot and fake-tag release builds only in disposable local clones, never tagging/pushing this checkout. Keep .tickets/canvas untouched. Document any live workflow or image checks unavailable before first publication.

## Comments

**agent:t3code/d30689a3** at 2026-09-15T21:17:23Z

Repointed the file reference: .forgejo/workflows/release.yml was renamed to tag-verify.yml by TKT-01M2KEHSJ6XV2M5TPEB9Z3Q647 (Publish releases from GitHub and stop publishing from Forgejo), which removed the Forgejo publishing step. The dual-forge publication this ticket prepared no longer exists; the internal lane builds and verifies a tag without uploading it. The reference moves so that `git ticket files` still finds this history from the workflow's current path.

## Summary

Prepared release infrastructure in d07822c. MIT/runtime notices, build-derived version reporting, five GoReleaser archives, checksums, pre-publication artifact verification, dual-forge CI/releases, 44-case offline download installer, and non-root/read-only repository-serving GHCR image are implemented. Full parity gate passed with 71 frontend tests, 64 tooling cases including 15 Python safety tests, Go checks, and 29 embedded browser cases. Clean tagged rehearsal in a disposable clone passed exact clean tag/commit validation on all five targets. Podman image tests passed mounted Git repository serving, read-only refusal/unchanged files, and explicit write persistence. Snapshot/actionlint/shellcheck checks passed. docs/release-preparation-verified.md records evidence. No push, source-checkout tag, publication, or user canvas-data change occurred. TKT-01M23W2X3P6BFHY9HESWBW9DZZ (Verify the first hosted release and public installation) remains draft for live CI, credentials, uploads, Go proxy and anonymous GHCR checks after approval.
