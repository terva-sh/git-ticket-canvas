# Preact migration parity report

TKT-01M23HNMXT6092RDVB75702V0P (Gate the Preact migration on embedded browser parity)
completes the standalone frontend's parity gate. This report supersedes the
pending-gate status in `docs/preact-canvas.md`, not its architecture record.
The current workflow is in `docs/development-preact.md`. Historical reports
remain unchanged.

## What changed

The frontend now uses strict TypeScript, Vite, and Preact. `App` composes the
canvas, toolbar, inspector, composer, and feedback. `Canvas` owns transient
viewport and gesture state. Platform modules own the typed HTTP client,
accepted ticket state, serialized writes, board-keyed layout work, and geometry.
The legacy renderer and shared mutable canvas state are gone.

This gate adds an isolated locked rebuild comparison, failure-mode tests,
committed-asset browser recipes, and clean HEAD Go-only build/install checks.
It makes no Go API, DTO, layout-format, or frontend behavior changes.
Go still embeds `all:web/dist` and serves the application as a single binary.

## Preserved behavior

The embedded Chromium suite retains all 14 original baseline cases and now has
27 cases. It covers these behaviors:

- Draft creation, inspector title/prose edits, metadata, checklists, logs,
  lifecycle operations, and deletion.
- Conflict feedback and reload without silently upgrading a stale editor's
  revision. Polling and visibility refresh retain unfinished drafts and focus.
- Read-only controls and gestures leave persisted ticket and layout files alone.
- Single and multi-card dragging, pinning, persistence across reloads, dependency
  direction, pan, cursor-centered zoom, fit, and keyboard shortcuts.
- Pointer cancellation, capture loss, board switching, overlapping saves,
  polling during gestures, failed layout saves, and measured edge anchors.
- A 120-card board keeps inspector renders out of pointer-motion frames.

Platform tests cover server-accepted results, serialized mutations, read and
board generation guards, and partial-success responses. HTTP 207 does not mean
that ticket creation should be repeated. A successful ticket result survives
its associated layout error. Geometry and import-boundary tests keep those
modules independent of Preact and DOM APIs.

## Validation on 2026-09-09

`just parity-check` passed all of its checks:

| Check | Result |
|---|---|
| Locked isolated Vite build | Exact match with HEAD and working dist |
| Strict frontend TypeScript | Passed |
| Platform, component, and boundary tests | 71 passed |
| Verifier and aggregate-recipe tests | 13 passed |
| Go formatting, vet, and race tests | Passed |
| Strict ticket validation including pending repairs | Passed |
| Fresh Go binary with embedded assets | 27 browser cases passed |
| Clean HEAD Go-only build and install | Passed with Node/npm/npx absent from PATH |

A separate `just browser-test-embedded --repeat-each=3` passed 81/81 runs.
The browser commands bypassed npm's frontend build hook; Playwright global
setup compiled the Go binary from the verified assets. No Vite server served
these runs. Each fixture used its own temporary store and loopback server.
`npm ci` reported zero vulnerabilities. `git diff --check` passed.

The verified application HEAD was `e95b430c93fe75ded868211d3585bdf88cddd680`.
The gate tooling and these successor documents were working-tree additions
when the checks ran. The emitted JavaScript remained
`web/dist/assets/index-BeJDLQPA.js`. The clean source check used a Git archive
of HEAD, an isolated GOBIN, CGO_ENABLED=0, and GOTOOLCHAIN=local. It could use
existing Go caches; it did not test an offline or uncached installation.

An initial aggregate recipe passed subsequent recipe names as arguments to
variadic `web-test`, skipping checks. That run was not counted as aggregate
evidence. Each check now has its own invocation, a regression test asserts the
ordered commands, and the corrected aggregate passed. The verifier also caught
an omitted TypeScript config in its initial isolated build inputs; copying
`tsconfig.json` restored the byte-for-byte match without changing dist.

Validation environment was Linux amd64, Node 22.23.2, npm 10.9.8, Go 1.26.2,
Git 2.43.0, just 1.21.0, and Playwright 1.61.1 Chromium. The agent ran in terva
`0.134.5-0.20260908184005-01e3a6719b46`, commit `01e3a67`, built
`2026-09-08T18:49:46Z`, with index 0.8.2, obsidian 0.2.0, and web 0.3.1.

## Limits

This is a loopback prototype without authentication, not a public multi-user
service. No host integration, shared package, PWA, router, or new transport was
introduced. Server vocabulary and HTTP/layout contracts remain authoritative.

Browser evidence covers desktop Chromium with primary-pointer input. It does
not establish Firefox, WebKit, mobile, accessibility, or cross-platform parity.
The responsiveness test detects stalls at its existing p95 100 ms and maximum
250 ms limits. Its samples span two display frames and are not measurements of
JavaScript execution time or a performance SLA. The earlier measured samples
are retained in `docs/preact-canvas.md`.

Frontend typecheck excludes browser test TypeScript, which Playwright executes.
The dist verifier checks current build inputs against committed HEAD, so
uncommitted generated assets intentionally fail. Future build inputs must be
added to its copy list. Dependency locking does not make builds independent of
Node versions or platforms; mismatches fail rather than rewriting the bundle.

## Candidates for reuse, not integration commitments

Pure coordinate transforms, placement, and edge geometry are candidates for a
separate consumer. The accepted-state store and serialized-write patterns are
useful examples for revisioned ticket editing. Gesture snapshots, identity-owned
save previews, stable editor drafts, and the embedded-browser fixture are other
patterns worth evaluating. None is published as a shared package by this work.

Any proposed host integration belongs in separate draft work. Before promotion,
that work must name the host and a specific user workflow, show evidence that
the standalone application or existing tooling does not meet that workflow,
and define tests for the host's transport, actor authority, lifecycle, and
security requirements. Record that approval as a dependency gate in the ticket
ledger. Completing this migration is not permission to integrate into terva.
No integration ticket was promoted or implemented by this gate.
