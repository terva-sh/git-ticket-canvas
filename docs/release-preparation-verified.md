# Release preparation verification

TKT-01M23TNTW2086TMX4MS28ZC60W (Prepare dual-forge releases and the repository-serving image)
was locally verified on 2026-09-09 at implementation commit `d07822c`.
This record supplements `docs/releasing.md`; it does not claim a hosted release.

## Passed locally

- `just parity-check`: locked frontend rebuild matches HEAD, strict TypeScript,
  71 frontend tests, 64 Node tooling cases, Go race/vet/format checks, strict
  ticket validation, 29 embedded browser cases, and clean HEAD Go-only build/install.
  The tooling cases include 44 offline release-installer cases and wrappers for
  15 Python artifact/publisher safety tests.
- `just release-check`: GoReleaser configuration accepted.
- `just release-snapshot`: five platform archives and checksums generated and
  verified. Checks cover archive paths, notices, document bytes, target OS/arch,
  commit metadata, and a live comparison of the native binary's embedded HTTP
  assets with `web/dist`.
- `just release-rehearse`: disposable clone at committed HEAD, local
  `v0.0.0-rehearsal` tag, five clean tagged builds, exact version/commit validation,
  checksums and embedded HTTP verification. The temporary clone and tag were
  removed. No source-checkout tag was created.
- `podman build` from the verified Linux amd64 archive and `just image-check`:
  non-root/read-only defaults, mounted Git repository serving, 403 mutation
  refusal with unchanged files, and explicit writable ticket persistence.
- GitHub actionlint 1.7.7, shellcheck for both installers, and `git diff --check`.

The first snapshot build exposed missing Windows x/sys dependency checksums.
`go mod tidy` added the indirect dependency and sums before packaging; its license
notice was included. The five-target rebuild and tagged rehearsal then passed.
No dependency rewrite runs inside the packaging workflow.

## What remains unproven

TKT-01M23W2X3P6BFHY9HESWBW9DZZ (Verify the first hosted release and public installation)
tracks the checks that need an approved push and publication. It remains draft.
These include primary Forgejo runner packages/actions, hosted Windows execution,
release API credentials/uploads, the real public installer, tagged Go proxy
availability, and anonymous GHCR visibility and pulls. Local mocks and container
checks are not substitutes for that evidence.

The image target is Linux amd64. macOS/Windows artifacts were cross-compiled,
not run on those operating systems locally. The local image tag
`localhost/git-ticket-canvas:release-test` is a snapshot for inspection, not a
published release. Ignored `dist/` and `image-context/` hold local build output.
No pushes, public tags, releases, or GHCR uploads occurred during preparation.
User-owned `.tickets/canvas/` was left untouched.

## Environment

Linux amd64, Go 1.26.2, Node 22.23.2, npm 10.9.8, GoReleaser 2.16.0,
Playwright 1.61.1 Chromium, and Podman. The archive image used Alpine 3.22.
The agent ran in terva `0.134.5-0.20260908184005-01e3a6719b46`, commit `01e3a67`,
built `2026-09-08T18:49:46Z`, with index 0.8.2, obsidian 0.2.0, and web 0.3.1.
