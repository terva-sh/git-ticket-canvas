# Developing tkcanvas with Vite

This guide supersedes the no-frontend-build instructions in `README.md` and `docs/development.md`. The browser setup in `docs/browser-testing.md` still applies, but browser runs now build frontend assets first. Historical validation reports remain unchanged.

## Prerequisites

For frontend development, use Node.js 22 or newer, npm, Go 1.25 or newer, and just. The lockfile pins Vite 6, TypeScript 5, Preact 10, and the Preact Vite preset. `just check` also requires the git-ticket CLI and a Go race-detector toolchain. Browser tests require Playwright Chromium; `just browser-setup` installs it and the locked npm dependencies.

```sh
just web-setup       # npm ci
just web-typecheck   # strict TypeScript and compile-only Preact JSX contracts
just web-build       # typecheck, then build web/dist
just build           # web-build, then build ./tkcanvas
just install         # web-build, then go install .
just run -read-only  # rebuild both, then serve at http://127.0.0.1:7777
```

Developer build, install, and run recipes always rebuild frontend assets. They fail if the JavaScript toolchain or installed dependencies are missing; they do not silently fall back to stale assets. Run `web-setup` after dependency changes. No recipe uses sudo or replaces dependencies with unlocked versions.

`web/dist` is committed. Review and commit generated asset additions and deletions together with their source changes. Do not edit generated files. Vite empties dist on each build; a changed content hash can replace the old asset filename. Automated committed-dist verification remains in the final migration-gate ticket.

## Go-only consumers

A checkout containing committed dist needs no Node, npm, or Vite to build:

```sh
go build -o tkcanvas .
go install .
```

These commands deliberately use the committed assets and do not rebuild frontend source. Use the just recipes when editing the frontend. Installation follows GOBIN, otherwise the first GOPATH entry's bin directory, and may replace an existing tkcanvas there.

Go embeds only `web/dist`, not the source HTML, legacy JavaScript, TypeScript, or node_modules. The embedded-asset test verifies this boundary and checks that HTML references resolve inside the bundle. API asset tests discover emitted URLs instead of requiring `/app.js`.

## Two-terminal development loop

Start the Go API in one terminal:

```sh
just api-dev -store /path/to/repo -actor human:your-id -read-only
```

Start Vite in another:

```sh
just web-dev
```

Open `http://127.0.0.1:5173`, not the Go server's port. Vite serves frontend source and proxies `/api` to `http://127.0.0.1:7777`. Both servers bind to loopback by default. Stop both with Ctrl-C. Remove `-read-only` only when you intend to edit the selected store.

For a different API port:

```sh
# Terminal one
just api-dev -addr 127.0.0.1:8888 -read-only
# Terminal two
TKCANVAS_API_URL=http://127.0.0.1:8888 just web-dev
```

The proxy target must be a loopback HTTP origin. Vite refuses an occupied port rather than silently selecting another; pass `just web-dev --port 5174` when needed. This is not an authenticated deployment setup.

`api-dev` recompiles Go without rebuilding frontend assets, because Vite serves the source in this workflow. The Go port still exposes the last built bundle. Restart `api-dev` after Go edits. Vite reloads the current vanilla entry on frontend changes; component-level Preact refresh becomes relevant after components exist.

## Incremental migration boundary

`web/src/main.ts` imports the unchanged `web/app.js`. Strict TypeScript checks cover new TypeScript and the Vite configuration. The legacy JS is explicitly admitted with `allowJs` and `checkJs: false`; it is not yet typed. Compile-only contracts in `tests/tooling/preact-types.tsx` verify JSX props and strict null checking. Browser test TypeScript is still executed by Playwright, not included in this frontend typecheck.

The application has not been converted to Preact components. Existing markup and inline CSS remain in `web/index.html`; Vite emits a hashed JavaScript module and keeps the styles inline. The HTTP API and layout schema are unchanged. No router, service worker, or new transport was added.

## Validation

```sh
just check
just browser-test --repeat-each=3
```

`just check` rebuilds assets before the Go tests, vet, formatting, legacy-JS syntax check, and strict ticket validation. Browser tests also rebuild through npm's `pretest:browser` hook, then run the actual embedded Go binary against temporary stores. Running `npm run test:browser` directly has the same rebuild behavior; invoking `npx playwright test` bypasses that hook.

Validation for this pipeline passed all 42 repeated browser cases. A separate live check exercised `just api-dev` plus `just web-dev`, the proxy, and Chromium loading the read-only UI from an isolated store. Go tests include checks of embedded asset paths and fetched bundle URLs.
