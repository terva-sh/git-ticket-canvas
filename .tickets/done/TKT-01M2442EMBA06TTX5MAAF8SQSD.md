---
schema: 3
id: TKT-01M2442EMBA06TTX5MAAF8SQSD
title: Display the running application version in the UI
type: task
status: done
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
  - ref: evidence:version-display
    path: docs/version-display.md
  - ref: code:buildinfo
    path: internal/buildinfo/buildinfo.go
  - ref: test:api-version
    path: internal/api/version_test.go
claim: null
archive: null
created_at: 2026-09-09T22:19:31Z
updated_at: 2026-09-10T01:33:32Z
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

- [x] The UI displays the running server's version in a discoverable compact location without crowding essential canvas controls.
- [x] Version, commit, and modified-state details follow the existing CLI build-metadata semantics rather than frontend package metadata; no unverified release tag is presented as authoritative.
- [x] Development and missing build metadata render honest devel/unknown fallbacks without breaking board loading or showing a blank version.
- [x] Version details are keyboard-accessible, work in read-only mode and narrow viewports, and expose no credentials, environment variables, or filesystem paths.
- [x] Go/API and UI tests verify released, development, modified, and unavailable metadata cases and consistency with CLI version semantics.

## Definition of done

- [x] Record the approved display location and verification evidence.
- [x] Run just check and relevant embedded browser checks; regenerate committed frontend assets through the existing build process.

## Implementation plan

Approved placement: beside the brand at the left of the toolbar, as a small mono label like the store path, with a native `<details>` disclosure for commit, modified state, and Go version. Approved transport: a new `GET /api/version` that answers even when the store snapshot is unavailable, fetched once at load.

### Server
- Move `parseBuildVersion` and its struct into `internal/buildinfo` (`buildinfo.Info`, `buildinfo.Parse(*debug.BuildInfo)`, `buildinfo.Read()`), keeping the JSON tags `schemaVersion`, `kind`, `version`, `commit`, `go`, `modified`. `version.go` keeps its CLI text formatting and calls the package, so CLI and API share one parser by construction.
- Add `Options.Version buildinfo.Info` and `GET /api/version` in `internal/api/server.go`. The handler writes the stored value with `Cache-Control: private, no-cache` and never touches the live coordinator or snapshot, so it works while the store is unavailable. `main.go` passes `buildinfo.Read()`. A zero `Options.Version` is normalized to the devel/unknown fallback so tests that build a Server without it stay honest.

### Client
- Add `VersionInfo` to `web/src/platform/tickets/types.ts` and `TicketClient.version()`.
- `App` fetches it once on mount into state; a failed fetch leaves `null` and the label renders `unknown`. Board loading is independent of this request.
- `Toolbar` renders `<details class="version">` after the store path: `<summary>` shows the compact label (`v0.1.0`, `devel`, or `unknown`, with a `+` suffix when modified). The body lists the short commit, modified state, and Go version. Native details keeps keyboard access without extra JavaScript; read-only mode does not disable it. No paths or environment values appear in the payload.

### Tests
- `internal/buildinfo` tests: released, devel, `+dirty`, modified, nil build info; `version_test.go` keeps its CLI cases against the moved parser.
- `internal/api` test: `/api/version` body matches the injected Info and stays 200 when the snapshot is nil.
- Vitest: `Toolbar` renders the four cases and the details body; `App` test covers a failed version fetch still loading the board.
- Browser: one check in `tests/browser/baseline.spec.ts` that the label is visible, the details open by keyboard, and the body matches `/api/version`.
- `just check`, `just browser-test-embedded` for the touched specs, `npm run build` to regenerate `web/dist`.

## Notes

**agent:terva/mieli** at 2026-09-10T01:25:18Z

draft to ready: User asked to promote and pick up this ticket.

**agent:terva/mieli** at 2026-09-10T01:33:30Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-13 The UI displays the running server's version in a discoverable compact location without crowding essential canvas controls. — User-approved placement: details#version beside the brand in web/src/ui/Toolbar.tsx; summary is a mono .badge, the dl body is absolutely positioned so opening it never reflows toolbar controls. Browser test at 390px confirms it fits.
- [x] task-14 Version, commit, and modified-state details follow the existing CLI build-metadata semantics rather than frontend package metadata; no unverified release tag is presented as authoritative. — internal/buildinfo.Parse is the single parser; version.go aliases it and GET /api/version serves buildinfo.Info with the same six-key envelope. go test ./internal/buildinfo ./internal/api . -run 'Version|Parse' green.
- [x] task-15 Development and missing build metadata render honest devel/unknown fallbacks without breaking board loading or showing a blank version. — buildinfo.Parse(nil) yields devel/unknown; api.New normalizes a zero Options.Version to it (TestVersionEndpointFallsBackWhenUnset). /api/version reads no snapshot (TestVersionEndpointIgnoresSnapshotState: 503 board, 200 version). App renders no element while in flight and 'unknown' on failure; App.test 'fetches the build identity once and loads the board even when that fails'.
- [x] task-16 Version details are keyboard-accessible, work in read-only mode and narrow viewports, and expose no credentials, environment variables, or filesystem paths. — Native details/summary: browser test focuses the summary and toggles it with Enter, on the read-only server at a 390px viewport, and asserts the dl stays inside the viewport. Payload is the six-key buildinfo envelope only (TestVersionEndpointMatchesCLISemantics rejects extra fields); browser and forms tests assert the body carries no store path.
- [x] task-17 Go/API and UI tests verify released, development, modified, and unavailable metadata cases and consistency with CLI version semantics. — Go: internal/buildinfo TestParse (release, dirty release, pseudo version, devel, nil, empty), version_test.go TestParseBuildVersion pins the CLI to buildinfo.Parse, internal/api/version_test.go covers released/modified/devel/unset/unstarted. UI: forms.test.tsx covers released, modified, devel, null and the in-flight state; App.test.tsx covers failed fetch and the +dirty label; baseline.spec.ts compares the rendered body with /api/version. just check green, 123 unit tests, 42 embedded browser pas…

## Summary

Shipped. The parser moved from version.go into internal/buildinfo, and the CLI aliases it, so `--version` and the browser share one source. GET /api/version serves that Info with the CLI's six-key JSON envelope, reads no store state, and normalizes an unset Options.Version to devel/unknown. The toolbar shows a native details element beside the brand: the summary is the version (`+dirty` when modified, `unknown` on a failed fetch, absent while in flight), and the body lists version, 12-character commit, modified, and Go. The client fetches it once on mount, independent of board loading.

Placement and transport were confirmed with the user before implementation. Evidence is in docs/version-display.md: Go, Vitest, and browser tests cover released, modified, devel, and unavailable cases; just check and the embedded browser suite passed; web/dist was regenerated.
