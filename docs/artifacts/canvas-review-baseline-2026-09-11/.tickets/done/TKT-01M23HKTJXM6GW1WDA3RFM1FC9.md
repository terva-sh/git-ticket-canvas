---
schema: 3
id: TKT-01M23HKTJXM6GW1WDA3RFM1FC9
title: Add the TypeScript and Vite frontend build pipeline
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels: []
assignees: []
milestone: null
parent: TKT-01M23HK5J08WDF7Q2EA9SG6C9V
origin: null
dependencies:
  - TKT-01M23HKF764T0VBFMPM959Q4DM
blocks_on: none
references:
  - ref: tooling:vite
    path: vite.config.ts
  - ref: tooling:typescript
    path: tsconfig.json
  - ref: source:entry
    path: web/src/main.ts
  - ref: source:embed
    path: main.go
  - ref: test:embed
    path: assets_test.go
  - ref: docs:vite-development
    path: docs/development-vite.md
  - ref: tooling:just
    path: justfile
claim: null
archive: null
created_at: 2026-09-09T16:56:57Z
updated_at: 2026-09-09T17:30:55Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Introduce a Preact-ready strict TypeScript and Vite workspace while preserving the existing UI behavior. Use terva's client build conventions as a reference, without importing its application code. Commit dependency locks and generated dist so Go-only builds remain possible.

Embed only the built frontend, not source files or node_modules. Define explicit developer commands so a run after a frontend edit cannot silently serve an old bundle. Keep the HTTP API and layout schema unchanged. Do not add PWA caching, a router, or a new transport.

## Acceptance criteria

- [x] The workspace supports strict TypeScript, Preact JSX, Vite builds, and a lockfile-based dependency installation.
- [x] Go embeds only self-contained dist assets; a clean checkout builds and installs with Go alone.
- [x] just exposes frontend build and development recipes; development proxies the existing API to a loopback Go server and documents both processes.
- [x] Build, install, and run recipes document and enforce when frontend rebuilding is required, without making Go-only consumer builds depend on Node.
- [x] Existing Go tests and baseline browser tests pass against the bundled frontend; asset assertions no longer assume a fixed /app.js filename.

## Implementation plan

Reuse the root npm lockfile. Add Preact/preset, strict TypeScript configuration, a TS entry importing the unchanged legacy JS, and Vite rooted at web with committed web/dist. Limit Go embed to dist; update asset tests to follow emitted asset URLs and add an embedded-FS boundary test. Developer just build/install/run and browser tests rebuild frontend; raw go build/install use committed dist with no Node. Add loopback-only Vite dev/API recipes and a successor development guide. Verify locked install, typecheck, bundled browser tests, live Vite proxy, and an isolated source export build/install without Node on PATH.

## Notes

**agent:terva/mieli** at 2026-09-09T17:30:44Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-24 The workspace supports strict TypeScript, Preact JSX, Vite builds, and a lockfile-based dependency installation. — Locked Preact 10.29.8, Vite 6.4.3, TypeScript 5.9.3 and preset; npm ci/build/typecheck pass. Compile-only JSX and strict-null contracts pass. Legacy JS remains unchanged.
- [x] task-25 Go embeds only self-contained dist assets; a clean checkout builds and installs with Go alone. — Go embed limited to all:web/dist; embedded-FS and bundle-link tests pass. Clean staged-source export built, installed, and tested with only Go on PATH, CGO disabled, and no node_modules.
- [x] task-26 just exposes frontend build and development recipes; development proxies the existing API to a loopback Go server and documents both processes. — Added web-setup/build/typecheck/dev and api-dev recipes. Actual just api-dev + web-dev passed proxy and Chromium read-only UI checks on isolated loopback ports; docs/development-vite.md explains both terminals.
- [x] task-27 Build, install, and run recipes document and enforce when frontend rebuilding is required, without making Go-only consumer builds depend on Node. — just build/install depend on web-build and run depends on build; browser script has pretest rebuild. just build and temporary-GOBIN install passed; raw Go-only build/install verified separately. Successor guide documents developer versus consumer paths.
- [x] task-28 Existing Go tests and baseline browser tests pass against the bundled frontend; asset assertions no longer assume a fixed /app.js filename. — Updated API asset test follows emitted links; new main-package test validates embedded asset boundary. All 42 repeated bundled Chromium cases and just check pass; no app.js behavior changes.

## Summary

Added locked Preact/TypeScript/Vite tooling, a typed entry importing unchanged legacy JS, and generated web/dist embedded exclusively by Go. Developer recipes rebuild assets; raw Go build/install remain Node-free. Added embedded-asset and JSX/type contracts; API tests follow generated URLs. npm ci, just build/check, temporary-GOBIN install, and 42 repeated bundled Chromium cases pass. A clean staged-source export built, installed, and tested with only Go on PATH and no node_modules. Actual api-dev/web-dev proxy and Chromium load passed against an isolated read-only store. docs/development-vite.md supersedes old no-build instructions. Legacy JS typing and Preact rendering remain later tickets.
