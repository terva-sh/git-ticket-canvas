# Developing the Preact frontend

This is the current developer guide. It supersedes the no-frontend-build
instructions in `README.md` and `docs/development.md`, and the incremental
migration and validation instructions in `docs/development-vite.md`.
Those documents and the historical browser and migration reports remain unchanged.
See `docs/preact-canvas.md` for component ownership and gesture/save policies.

## Requirements

Frontend development needs Node.js 22.12 or newer, npm, Go 1.25 or newer,
just, and a POSIX shell. The lockfile pins frontend dependencies. Validation
also needs Git, the git-ticket CLI, a C compiler for Go race tests, and
Playwright Chromium. The Go-only verification script needs Python 3.12 or newer.
The recipes target Linux and macOS; use WSL on Windows.

```sh
just web-setup          # npm ci
just browser-setup      # npm ci and Playwright Chromium
just web-typecheck      # strict TypeScript, no output
just web-test           # platform, component, and import-boundary tests
just tooling-test       # dist verifier failure modes and cleanup
just web-build          # typecheck and Vite production build
just build              # rebuild frontend, then ./tkcanvas
just run -read-only      # rebuild both, then serve on loopback
```

`just install` rebuilds frontend assets and runs `go install .`. It may replace
an existing binary in GOBIN or GOPATH/bin. No recipe uses sudo.
Re-run `web-setup` after dependency changes. Commit source, lockfile, and all
`web/dist` additions and deletions together. Never edit generated assets by hand.

## Go-only consumers

A checkout with committed assets needs no JavaScript toolchain:

```sh
go build -o tkcanvas .
go install .
```

Go embeds only `web/dist`. Raw Go commands do not compile TypeScript or run Vite.
They use the committed bundle, so use `just build` when changing the frontend.
The single binary serves both the API and frontend. No runtime Node process,
Vite server, router, service worker, or new transport is required.

## Two-terminal development

```sh
# Terminal one. Use an explicit actor before permitting writes.
just api-dev -store /path/to/repo -actor human:your-id -read-only
# Terminal two
just web-dev
```

Open `http://127.0.0.1:5173`. Vite serves source with Preact refresh and proxies
`/api` to `http://127.0.0.1:7777`. Restart the Go process after Go edits.
The Go port serves the last built bundle, not Vite's source.

For another API port, pass `-addr 127.0.0.1:8888` to `api-dev` and set
`TKCANVAS_API_URL=http://127.0.0.1:8888` for `web-dev`. The proxy accepts only
loopback HTTP origins. Keep both servers on loopback. This prototype has no
authentication and this workflow is not a public deployment recipe.

## Development checks and the release gate

The development loop rebuilds assets:

```sh
just check
just browser-test --repeat-each=3
```

`check` runs the production build, frontend tests, verifier tests, Go formatting,
vet, race tests, and strict ticket validation. `browser-test` invokes npm's
`pretest:browser` build hook. These commands are useful while editing but cannot
prove that the bundle was current before they overwrote it.

After committing frontend source and assets, run the release gate:

```sh
just parity-check
# Optional repeated browser run without another frontend build:
just browser-test-embedded --repeat-each=3
```

The gate stops at the first failure and runs in this order:

1. `dist-verify` compares the working dist with HEAD, installs dependencies using
   `npm ci` in a temporary directory, and makes a Vite production build from the
   current frontend inputs. It compares every path and byte with HEAD again.
   Changed, missing, extra, and ignored files fail. It never overwrites working
   dist and removes its temporary directory on success or failure.
2. `web-setup` installs locked dependencies in the checkout. Typecheck, frontend
   tests, verifier tests, Go formatting, vet, race tests, and strict ticket
   validation then run without rebuilding working dist.
3. `browser-test-embedded` bypasses npm's rebuild hook. Playwright global setup
   builds a fresh Go binary containing the verified dist. Each test starts that
   binary against an isolated temporary ticket store on an ephemeral loopback
   port. No Vite server participates. Setup and fixtures remove binaries, stores,
   and processes when they finish.
4. `go-only-check` archives HEAD into a temporary clean source tree, then runs
   `go build` and `go install` with only Go on PATH. Node, npm, and npx are absent.
   It sets CGO_ENABLED=0 and GOTOOLCHAIN=local and installs into a temporary GOBIN,
   not the user's installation. It removes the source and binaries afterward.

`dist-verify` is deliberately a HEAD check, not a staged-content check. A newly
rebuilt but uncommitted bundle fails even when it matches current source. Commit
the bundle before invoking the release gate. `go-only-check` likewise verifies
HEAD, not uncommitted Go changes. Review `git status` when interpreting results.
The isolated rebuild copies package metadata, the lockfile, TypeScript and Vite
configuration, and `web`. Add any future build inputs to the verifier too.

The Go-only check can use the machine's module and build caches. It proves that
frontend tools are not required, not that an offline or uncached install works.
Chromium and OS libraries must already be installed for browser checks.

## Source boundaries

`web/src/main.ts` mounts the Preact `App`. `App` owns accepted store snapshots,
forms, and selection. `Canvas` owns viewport, gestures, animation frames, and
pending layout previews. Platform modules own HTTP DTOs, accepted ticket state,
serialized writes, board-keyed layout work, and pure geometry. Platform modules
must not import Preact or DOM APIs.

The server still owns ticket vocabulary, revision checks, HTTP responses, and
layout persistence. Do not replace accepted server results with optimistic
requested values or retry partial-success creation. Browser test TypeScript runs
through Playwright; frontend typecheck does not cover the browser test files.
