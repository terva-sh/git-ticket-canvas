---
schema: 3
id: TKT-01M23HKTJXM6GW1WDA3RFM1FC9
title: Add the TypeScript and Vite frontend build pipeline
type: task
status: draft
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
references: []
claim: null
archive: null
created_at: 2026-09-09T16:56:57Z
updated_at: 2026-09-09T16:56:57Z
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

- [ ] The workspace supports strict TypeScript, Preact JSX, Vite builds, and a lockfile-based dependency installation.
- [ ] Go embeds only self-contained dist assets; a clean checkout builds and installs with Go alone.
- [ ] just exposes frontend build and development recipes; development proxies the existing API to a loopback Go server and documents both processes.
- [ ] Build, install, and run recipes document and enforce when frontend rebuilding is required, without making Go-only consumer builds depend on Node.
- [ ] Existing Go tests and baseline browser tests pass against the bundled frontend; asset assertions no longer assume a fixed /app.js filename.
