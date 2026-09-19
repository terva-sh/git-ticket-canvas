# git-ticket-canvas

A browser canvas for one or more `.tickets` stores. The project and executable
were previously named `tkcanvas`; the validation reports under `docs/` that
still use that name are historical records and were left as written. This file
is the short developer entry point: how to build, install, and check a source
checkout. `README.md` describes what the canvas does and how to run it over
several stores, and `README-release.md` covers installing a published release.

## Install and run

From this checkout, Go 1.25 or newer can build and install the committed frontend
without Node or npm:

```sh
go build -o git-ticket-canvas .
go build -o git-ticket-canvas-server ./cmd/git-ticket-canvas-server
./git-ticket-canvas -store /path/to/repo -read-only

go install .
go install ./cmd/git-ticket-canvas-server
# Ensure GOBIN, or the default GOPATH/bin, is on PATH.
git-ticket-canvas -h
git ticket-canvas -h
git ticket-canvas -store /path/to/repo -read-only
```

Git discovers executables named `git-<command>` on PATH. Therefore
`git ticket-canvas` invokes `git-ticket-canvas` and forwards arguments.
No Git alias or registration step is required. Building into the current
directory alone does not put that directory on PATH; use `./git-ticket-canvas`
or install it first. Use `-h` for application help. Git may handle `--help`
itself and look for a manual page.

This is `git ticket-canvas`, not `git ticket canvas`. The existing `git ticket`
CLI remains separate. The server defaults to `http://127.0.0.1:7777` and looks
for a store at or above the current directory when `-store` is absent. `-store`
is repeatable, and `-root` with `-R` searches a workspace; see
[serve several stores](README.md#serve-several-stores). A Git repository is not
required for Git's external-command discovery; the application still requires a
discoverable ticket store.

`git-ticket-canvas` has no authentication and refuses a non-loopback `-addr`,
naming `git-ticket-canvas-server` in the error. It is writable by default and
records writes as the store's configured actor; `-actor human:your-id` overrides
that and `-read-only` refuses every write.

`go install .` installs `git-ticket-canvas` into GOBIN or GOPATH/bin. It does not
remove an old `tkcanvas` binary, create a compatibility alias, or modify PATH.
Remove old installations yourself when no longer needed. The Go module is now
`github.com/terva-sh/git-ticket-canvas`; no remote repository is renamed or
published by this local change. Install from this checkout until the new module
path is published at the chosen host.

## Frontend development

Use Node 22.12 or newer, npm, Go, just, and a POSIX shell:

```sh
just web-setup
just build                # frontend build, then both commands
just run -read-only       # the desk canvas
just serve --issuer ...   # the served canvas
just install              # frontend build, then both commands into ~/.local/bin
```

For live frontend changes, run `just api-dev -read-only` in one terminal and
`just web-dev` in another, then open `http://127.0.0.1:5173`. Vite proxies `/api`
to the Go server. Set `GIT_TICKET_CANVAS_API_URL=http://127.0.0.1:8888` when using
another loopback API port. The old `TKCANVAS_API_URL` remains a fallback; the new
variable wins when both are set. The origin validation is unchanged.

## Checks

```sh
just browser-setup
just check
just browser-test
# After committing source and generated assets:
just parity-check
```

`check` rebuilds frontend assets and runs typecheck, frontend/tooling tests,
Go formatting/vet/race checks, and strict ticket validation. `browser-test`
rebuilds assets and tests isolated temporary stores. Its setup installs the
application into a temporary GOBIN, so tests check the actual installed name.
The command cases exercise help and read-only serving both directly and through
Git discovery, including refusal of HTTP writes.

`parity-check` first compares a locked isolated rebuild with HEAD without
changing working dist. It runs checks and embedded browser tests, then verifies
Go-only build/install from a clean HEAD archive. Python 3.12 or newer and Git
are needed for that archive check, a C compiler for race tests, and Chromium
with host libraries for browser tests. All test binaries and stores are isolated;
checks do not replace your installed executable.
