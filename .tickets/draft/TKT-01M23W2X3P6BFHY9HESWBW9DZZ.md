---
schema: 3
id: TKT-01M23W2X3P6BFHY9HESWBW9DZZ
title: Verify the first hosted release and public installation
type: task
status: draft
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
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-09T19:59:57Z
updated_at: 2026-09-09T20:27:50Z
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

- [ ] With approval, push identical main history to origin and github; primary parity and GitHub Windows CI actually pass.
- [ ] A person selects the version and approves tag publication; both forges publish exactly five archives and checksums with correct clean tag/commit provenance.
- [ ] The real public installer succeeds in a temporary prefix and its executable matches the released archive; tagged Go-only install and Go proxy metadata are verified.
- [ ] GHCR exact/minor/latest visibility and provenance are verified anonymously as appropriate for stable or prerelease tags; the published image serves a mounted local repository safely.
- [ ] Record live workflow URLs, tag, commit, hashes, install/image results and any remaining limitations in a release report.

## Notes

**agent:terva/mieli** at 2026-09-09T20:27:50Z

Approved main pushes reached both forges at 7ebdaf3de02002a5c516974e9ca1931ece1875c9. Forgejo parity passed https://git.local.sothr.com/terva-sh/git-ticket-canvas/actions/runs/2 and GitHub Windows build/vet/test passed https://github.com/terva-sh/git-ticket-canvas/actions/runs/34400659225. GitHub reported a non-blocking Node.js 20 action warning; TKT-01M23XM50095XTS2XYSX2BQJ97 (Upgrade GitHub Actions to Node.js 24 runtimes) addresses it before publication. Recheck CI after the upgrade is pushed. Operator guidance: consider cutting Windows support if Windows builds become a problem. Revisit with failure evidence and explicit approval; do not silently remove the target or bypass its gate. No release version or tag publication has been approved.
