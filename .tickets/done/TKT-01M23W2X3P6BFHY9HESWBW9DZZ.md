---
schema: 3
id: TKT-01M23W2X3P6BFHY9HESWBW9DZZ
title: Verify the first hosted release and public installation
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
dependencies:
  - TKT-01M23TNTW2086TMX4MS28ZC60W
  - TKT-01M2418WY6RTYPYCNYH517EE36
blocks_on: none
references:
  - ref: report:release-v0.1.0
    path: docs/release-v0.1.0.md
  - ref: docs:published-assets
    path: docs/published-asset-verification.md
claim: null
archive: null
created_at: 2026-09-09T19:59:57Z
updated_at: 2026-09-09T21:45:50Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Publication-time gate after local release preparation. This remains draft until a person approves pushing main, chooses the first release version, and approves tag publication. Use docs/releasing.md. Configuration and local rehearsals do not count as hosted evidence. Primary CI is Forgejo; GitHub is the public mirror. Never move a published tag to repair a failure.

## Acceptance criteria

- [x] With approval, push identical main history to origin and github; primary parity and GitHub Windows CI actually pass.
- [x] A person selects the version and approves tag publication; both forges publish exactly five archives and checksums with correct clean tag/commit provenance.
- [x] The real public installer succeeds in a temporary prefix and its executable matches the released archive; tagged Go-only install and Go proxy metadata are verified.
- [x] GHCR exact/minor/latest visibility and provenance are verified anonymously as appropriate for stable or prerelease tags; the published image serves a mounted local repository safely.
- [x] Record live workflow URLs, tag, commit, hashes, install/image results and any remaining limitations in a release report.

## Implementation plan

User approved executing the v0.1.0 publication plan. Pin a1ee5a5e02aa7b30bd12a5640c1ada9fba3a100f in a clean temporary clone, create one annotated tag, push exact tag to Forgejo first and verify its published archives before pushing the same tag object to GitHub. Wait for GitHub Windows/Linux release and image gates, verify downloads, installer, Go proxy/install and anonymous GHCR pulls. Stop at any failed gate; never move a published tag, silently delete drafts or bypass Windows. Record evidence after the release commit without including user canvas data.

## Notes

**agent:terva/mieli** at 2026-09-09T20:27:50Z

Approved main pushes reached both forges at 7ebdaf3de02002a5c516974e9ca1931ece1875c9. Forgejo parity passed https://git.local.sothr.com/terva-sh/git-ticket-canvas/actions/runs/2 and GitHub Windows build/vet/test passed https://github.com/terva-sh/git-ticket-canvas/actions/runs/34400659225. GitHub reported a non-blocking Node.js 20 action warning; TKT-01M23XM50095XTS2XYSX2BQJ97 (Upgrade GitHub Actions to Node.js 24 runtimes) addresses it before publication. Recheck CI after the upgrade is pushed. Operator guidance: consider cutting Windows support if Windows builds become a problem. Revisit with failure evidence and explicit approval; do not silently remove the target or bypass its gate. No release version or tag publication has been approved.

**agent:terva/mieli** at 2026-09-09T21:06:30Z

### Refreshed candidate verification

Verified commit a1ee5a5e02aa7b30bd12a5640c1ada9fba3a100f on 2026-09-09, before changing this ticket. This supersedes the earlier request to rerun CI after the action upgrade.

- just parity-check passed: locked dist matches HEAD, strict TypeScript, 71 frontend tests, 64 tooling cases, Go format/vet/race checks, strict tickets, 29 embedded browser tests, and clean HEAD Go-only build/install without Node/npm.
- just release-check and just release-snapshot passed. All five archives passed checksum, license/document, target/provenance and embedded HTTP asset verification.
- just release-rehearse passed in a disposable clone of a1ee5a5. All five archives reported the exact rehearsal tag and clean commit provenance. The temporary clone, archives and rehearsal tag were removed. No source-checkout tag was created.
- Rebuilt localhost/git-ticket-canvas:release-test from the newly verified Linux amd64 snapshot archive. Image ID fb438a97ea4607e8fa9fd2419cb498588f7087705b5b28eff975d88f5fc7faa9. just image-check passed non-root/read-only defaults, mounted repository serving, 403 write refusal and explicit writable persistence.
- Approved pushes put the same a1ee5a5 commit on both remotes. Forgejo parity passed https://git.local.sothr.com/terva-sh/git-ticket-canvas/actions/runs/3 and GitHub Windows build/vet/test passed https://github.com/terva-sh/git-ticket-canvas/actions/runs/34401775286. The GitHub check had no annotations and its logs had zero Node.js 20/deprecation/warning matches.
- The operator reports that BOT_TOKEN has been seeded at the terva-sh organization level. Repository availability and release-write access have not yet been exercised by a release run; no secret value was inspected.

Before this note, the only untracked path was user-owned .tickets/canvas/, left untouched. Refreshed dist and image-context files are ignored local snapshots, not published artifacts. No pushes, source tags, releases or registry uploads occurred during this refresh. No first version or publication approval has been given. Live archive downloads, public installer, tagged Go proxy/install and anonymous GHCR checks remain unverified. Windows support remains unchanged; consider removal only if concrete build problems justify a separate decision.

Verification harness: terva 0.134.5-0.20260908184005-01e3a6719b46, commit 01e3a67, built 2026-09-08T18:49:46Z; extensions index 0.8.2, obsidian 0.2.0, web 0.3.1.

**agent:terva/mieli** at 2026-09-09T21:31:20Z

### v0.1.0 publication stopped at downloaded-asset verification

With explicit user approval, created annotated tag v0.1.0 at a1ee5a5e02aa7b30bd12a5640c1ada9fba3a100f in clean clone /tmp/git-ticket-canvas-v0.1.0-s73c0w6d. Tag object 54c4aa6208f67abb239ba9518af04dcc6d9fffea was pushed to origin only. Forgejo release run https://git.local.sothr.com/terva-sh/git-ticket-canvas/actions/runs/4 succeeded. Public non-draft release https://git.local.sothr.com/terva-sh/git-ticket-canvas/releases/tag/v0.1.0 contains exactly five archives and checksums.txt. This proves the organizational BOT_TOKEN worked for Forgejo release publication.

Downloaded all six assets anonymously into the clone's forgejo-artifacts directory. Running scripts/verify-release.py --dist that-directory --tag v0.1.0 failed with FileNotFoundError for metadata.json before artifact inspection. That GoReleaser build-only file is not a published asset. This is a verifier gap, not established evidence of bad archives. TKT-01M2418WY6RTYPYCNYH517EE36 (Verify published release assets without GoReleaser metadata) tracks repair and regression tests. Do not fabricate build metadata to bypass the failed gate.

Stopped per the approved plan. GitHub has no v0.1.0 tag; no GitHub release or GHCR upload was triggered. Public installer, Go proxy and anonymous image verification were not attempted. Preserve the existing Forgejo tag and release; do not move or delete them. Resume by repairing downloaded-asset verification and validating these exact artifacts, then use the same tag object for the GitHub push. The source checkout has no tag and user canvas data is untouched. The clean clone and downloaded assets remain for diagnosis.

Harness: terva 0.134.5-0.20260908184005-01e3a6719b46, commit 01e3a67, built 2026-09-08T18:49:46Z; index 0.8.2, obsidian 0.2.0, web 0.3.1.

**agent:terva/mieli** at 2026-09-09T21:31:30Z

in-progress to blocked: Forgejo published v0.1.0, but downloaded-asset verification requires unpublished metadata.json. Repair TKT-01M2418WY6RTYPYCNYH517EE36 and verify the existing artifacts before pushing the unchanged tag to GitHub.

## Summary

Published v0.1.0 at a1ee5a5 on both forges using identical annotated tag object 54c4aa6208f67abb239ba9518af04dcc6d9fffea. Repaired downloaded verification in 2602996 before continuing from Forgejo to GitHub. Both six-asset downloads passed full verification. Latest public installer matched GitHub archive; public Go proxy and temporary tagged Go install passed. Anonymous GHCR 0.1.0/0.1/latest pulls share digest c6ad15172b25b20cd4f67f03b22d94f19fb61a507d4926ddea271d44fde44b81 and correct provenance; published image passed repository-serving/write-policy tests. docs/release-v0.1.0.md records URLs, hashes and limitations. Go module installs report commit unknown; archives/images report full commit. Package admin API lacks local read:packages scope, but anonymous registry access proves public distribution. No tag was moved; user canvas data untouched.
