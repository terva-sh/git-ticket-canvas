---
schema: 3
id: TKT-01M2442EMBA06TTX5MAAF8SQSD
title: Display the running application version in the UI
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - ui
  - quality-of-life
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references:
  - ref: design:canvas-organization
    path: docs/canvas-organization-design.md
  - ref: code:version
    path: version.go
  - ref: test:version
    path: version_test.go
  - ref: code:api
    path: internal/api/server.go
  - ref: code:toolbar
    path: web/src/ui/Toolbar.tsx
claim: null
archive: null
created_at: 2026-09-09T22:19:31Z
updated_at: 2026-09-09T22:19:31Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Expose the running git-ticket-canvas version in the UI so users can identify the server build without leaving the browser. This quality-of-life change is independent of readability, frames, and label-routing work.

### Scope
Use the Go server's build identity and the semantics already implemented in version.go for CLI version output. Do not use package.json or a hardcoded frontend release string as the running application's version. Show a compact version label with accessible commit and modified-state details, including honest development and unavailable-metadata fallbacks. The canvas API currently exposes no version metadata.

### Promotion check
Confirm where the version label and details belong before implementation. Write the implementation plan after claim and inspection. docs/canvas-organization-design.md records the independent scope.

## Acceptance criteria

- [ ] The UI displays the running server's version in a discoverable compact location without crowding essential canvas controls.
- [ ] Version, commit, and modified-state details follow the existing CLI build-metadata semantics rather than frontend package metadata; no unverified release tag is presented as authoritative.
- [ ] Development and missing build metadata render honest devel/unknown fallbacks without breaking board loading or showing a blank version.
- [ ] Version details are keyboard-accessible, work in read-only mode and narrow viewports, and expose no credentials, environment variables, or filesystem paths.
- [ ] Go/API and UI tests verify released, development, modified, and unavailable metadata cases and consistency with CLI version semantics.

## Definition of done

- [ ] Record the approved display location and verification evidence.
- [ ] Run just check and relevant embedded browser checks; regenerate committed frontend assets through the existing build process.
