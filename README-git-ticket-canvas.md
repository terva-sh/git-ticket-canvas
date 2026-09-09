# git-ticket-canvas

A standalone browser canvas for a repository's `.tickets` store. The project
and executable were previously named `tkcanvas`. This is the current usage
entry point. It supersedes the project name and command examples in `README.md`
and the development guides, including `docs/development-preact.md`. Those
shipped documents and validation reports remain unchanged as historical records.
The Preact architecture and release-gate details in the latter guide still apply.

## Install and run

From this checkout, Go 1.25 or newer can build and install the committed frontend
without Node or npm:

```sh
go build -o git-ticket-canvas .
./git-ticket-canvas -store /path/to/repo -read-only

go install .
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
CLI remains separate. The server defaults to `http://127.0.0.1:7777` and discovers
the store from the current directory when `-store` is absent. A Git repository
is not required for Git's external-command discovery; the application still
requires a discoverable ticket store.

Keep the server on loopback. It has no authentication. To permit writes,
remove `-read-only` and pass `-actor human:your-id` explicitly. Ticket and layout
formats, API routes, actor rules, and frontend interactions are unchanged.

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
just build                # frontend build, then ./git-ticket-canvas
just run -read-only
just install              # frontend build, then go install .
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
