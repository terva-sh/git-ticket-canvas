# Developing tkcanvas with just

The root `justfile` wraps the Go build and test commands. The frontend remains vanilla JavaScript embedded in the Go binary; there is no npm install or frontend build step.

## Prerequisites

- Go 1.25.0 or newer, matching `go.mod`.
- [just](https://github.com/casey/just). The recipes work with just 1.21.0.
- A POSIX shell. These recipes target Linux and macOS; use WSL on Windows.
- A C compiler and a Go platform that supports the race detector for `just test` and `just check`.
- Node.js for `just js-check` and `just check`. Node.js 22 was used for validation.
- `git ticket` on PATH for `just tickets-check` and `just check`. Build, test, install, and run use the Go library and do not require that CLI.

Run `just` with no arguments to list the recipes. Recipes run from the repository root, including when invoked from a subdirectory.

## Build and run

```sh
just build
just run -read-only
just run -store /path/to/repo -actor human:your-id
just run -store "/path/with spaces/repo" -addr 127.0.0.1:8888 -read-only
```

`just build` writes the gitignored `./tkcanvas` binary. `just run` rebuilds it first, so Go and embedded frontend edits appear on the next run. It forwards each argument unchanged to the binary, stays in the foreground, and stops with Ctrl-C. It does not watch files or restart automatically.

With no flags, the application discovers this repository's `.tickets` store, listens on `127.0.0.1:7777`, and permits writes using the store's configured actor. Use `-read-only` when browsing without changing tickets or layout. Set `-actor` explicitly when making edits under another identity. Keep the address on loopback; the MVP has no authentication.

## Test and check

```sh
just test
just test -count=1
just test -run TestTicketLifecycleAndPersistence
just check
```

`just test` runs `go test -race -cover ./...`. Extra arguments are Go test flags placed before `./...`; it always includes every package. API tests create temporary ticket stores and do not write test tickets into this repository.

`just check` runs these recipes and stops when a check fails:

| Recipe | Check |
|---|---|
| `fmt-check` | Go formatting, without modifying files |
| `vet` | `go vet ./...` |
| `js-check` | JavaScript syntax in `web/app.js` |
| `test` | Go tests with race detection and coverage |
| `tickets-check` | Strict ticket-store validation, including pending repairs |

Run `just fmt` to format Go files in place. Ticket validation only reports repairs; it does not apply them. Browser interaction tests and production security checks are not part of `just check`.

## Install

```sh
just install
GOBIN="$HOME/.local/bin" just install
```

`just install` runs `go install .` and installs the binary as `tkcanvas`. It uses `GOBIN` when set, otherwise the `bin` directory of the first GOPATH entry, normally `$HOME/go/bin`. Add that directory to PATH. Installation can replace an existing `tkcanvas` there; it does not use sudo or write to `/usr/local/bin` by default.

To verify installation without replacing your installed copy:

```sh
install_dir="$(mktemp -d)"
GOBIN="$install_dir" just install
"$install_dir/tkcanvas" -h
rm -r "$install_dir"
```
