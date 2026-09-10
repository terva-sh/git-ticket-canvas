# Installer test cleanup isolation

This supplements the unchanged local-install guide for
TKT-01M23STBA8MD74863ERXAJ7VHB (Match git-ticket local installation behavior).

## Failure and investigation

[Forgejo run #8](https://git.local.sothr.com/terva-sh/git-ticket-canvas/actions/runs/8)
failed on commit `5c150f9e14ab0a2c6a46db0c161c74a4221a123a`. The intentionally failed
build test passed its installer assertions, but its cleanup hook raised
`ENOTEMPTY` while removing the temporary HOME.

The installer waits for `go build`, but Go can start a detached telemetry child
before rejecting invalid GOFLAGS. A trace in the CI container image showed that
child opening counter files and creating the fixture's telemetry upload directory
after both the Go build process and installer exited. This leaves a writer racing
Node's recursive directory removal.

The exact ENOTEMPTY timing did not recur in 80 host repetitions or 150 container
repetitions of the original test. The process trace establishes the outstanding
writer; the original CI log establishes the cleanup failure. No deletion retry or
ignored cleanup error was added.

## Fix

The installer fixture now sets HOME and XDG_CONFIG_HOME to private temporary paths,
clears inherited TEST_TELEMETRY_DIR, and runs `go telemetry off` before any tested
build. This changes only the fixture's telemetry configuration. The production
installer and operator configuration remain unchanged.

Clearing TEST_TELEMETRY_DIR matters: `go telemetry off` writes the default config
path, whereas counter collection honors that Go test override. An initial attempt
to set both paths differently failed the new mode assertion. The final fixture
uses one private default path and verifies that Go reports mode `off` there.

The regression checks disabled telemetry before the failed build, absence of
counter/upload files afterward, and unchanged inherited config and telemetry
sentinels. Existing assertions still verify that build failure preserves the old
executable and leaves no destination staging file. Cleanup remains strict.

## Verification

- The new fixture-isolation regression failed before the fix and passes afterward.
- All six installer tests passed locally.
- The fixture regression and failed-build test each passed 150 repetitions in
  `container.local.sothr.com/library/golang:1.25-alpine`, with Go 1.25.12 and
  Node 24.17.0. Image digest:
  `sha256:e5941b66b396c6eb24dacca23df57c6025b5f9a38f20c2826998f73afa7f0d68`.
- `just parity-check` passed locally: committed asset parity, TypeScript,
  194 unit/component tests, 65 tooling tests, Go formatting/vet/race checks,
  strict ticket validation, and 53 embedded browser tests with five opt-in skips.
  The final Go-only check verified clean HEAD `5c150f9`, not the uncommitted test fix.
- `git diff --check` passed.

Hosted run #8 remains failed. This repair has not been committed, pushed, or
submitted to hosted CI. All test installations and stores were temporary; no
application install was performed outside those fixtures.

The saved user board `.tickets/canvas/default.yml` remains unchanged and unstaged,
with SHA-256 `852da1cea4bae70a3809aab5ddaa679ca09cabda477e828636fdf2b62cdf5eee`.

## Record provenance

Session `20260910-013410-55c12f2e`, source baseline `5c150f9` plus the working-tree
repair. Author: Mieli through terva `0.134.6-0.20260910010245-6f36fa1e7be7`, commit
`6f36fa1`, built `2026-09-10T01:05:08Z`. Extensions: index `v0.8.2`, obsidian
`v0.2.0`, and web `v0.3.1`.
