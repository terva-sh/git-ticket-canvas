---
schema: 3
id: TKT-01M2418WY6RTYPYCNYH517EE36
title: Verify published release assets without GoReleaser metadata
type: bug
status: done
status_reason: null
priority: high
due_on: null
labels: []
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references:
  - ref: script:verifier
    path: scripts/verify-release.py
  - ref: test:verifier
    path: tests/tooling/release_verifier_test.py
  - ref: docs:published-assets
    path: docs/published-asset-verification.md
claim: null
archive: null
created_at: 2026-09-09T21:30:36Z
updated_at: 2026-09-09T21:35:59Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

During the approved v0.1.0 release, Forgejo run 4 succeeded and published the five archives plus checksums.txt. Local download verification then failed before inspecting artifacts because scripts/verify-release.py unconditionally reads metadata.json, which is build-only and not published. GitHub tag publication stopped at this gate. Add a published-assets mode that derives expected version from the explicit tag and verifies against an explicit trusted commit or matching checkout, without fabricating metadata or weakening checksum, archive, documentation, target, clean provenance and HTTP checks.

## Acceptance criteria

- [x] Published-assets verification works with exactly five archives and checksums.txt, with explicit expected tag and commit.
- [x] Regression tests cover missing metadata in published mode and reject incorrect tag/commit and corrupt or incomplete assets.
- [x] Downloaded Forgejo v0.1.0 assets pass the repaired verifier before GitHub publication resumes.

## Implementation plan

Add explicit --published mode requiring --tag and --commit. Require expected commit to match checkout HEAD and tag; derive archive version from tag only in published mode. Keep existing metadata-required prepublication/snapshot behavior and all shared checks. Run repaired script by absolute path from the retained release checkout so docs/assets and tag resolve against a1ee5a5. Add metadata-free regression coverage and verify the six existing downloads before resuming publication.

## Summary

Added --published --tag --commit verification without metadata.json, retaining shared checks and metadata-required build mode. 29 verifier tests, 4 publisher tests and go test ./... pass. Repaired script executed from retained a1ee5a5 release checkout verified all existing Forgejo v0.1.0 downloads, including clean provenance and embedded HTTP assets. No tag or published asset changed. Usage documented in docs/published-asset-verification.md.
