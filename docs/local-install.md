# Local installation

This guide supersedes the `just install` destination described in
`README-git-ticket-canvas.md` and earlier development guides. Other usage and
validation instructions still apply. The shipped guides remain unchanged.

`git-ticket-canvas` follows the local install convention in `../git-ticket`:

```sh
just install                  # first writable of ~/.local/bin and ~/bin
just install "$HOME/go/bin"    # explicit destination
just install "/path/with spaces/bin"
```

The recipe rebuilds frontend assets, builds the Go binary in temporary storage,
and stages a mode-0755 executable in the destination. A rename replaces the old
binary atomically, so an already running process does not cause ETXTBSY. A build
failure leaves the installed binary unchanged. Temporary files are cleaned up.
Linked worktrees build with `-buildvcs=false`, matching the sibling tooling.

An explicit directory wins. Without one, the installer tries `~/.local/bin`,
then `~/bin`, creating directories when possible. It never uses sudo, changes
PATH, or removes another installation. It warns if the destination is absent
from PATH or another `git-ticket-canvas` comes first.

Verify shell and Git discovery after installing:

```sh
command -v git-ticket-canvas
git-ticket-canvas -h
git ticket-canvas -h
git ticket-canvas -store /path/to/repo -read-only
```

Git discovers `git-ticket-canvas` on PATH as `git ticket-canvas`; no alias is
needed. Use `-h` because Git may interpret `--help` as a request for a manual page.
No store mutation is needed to verify help or discovery.

`just install` does not use GOBIN. Raw `go install .` remains available for
Go-only consumers and retains Go's GOBIN/GOPATH behavior. To keep both tools in
the same place, use their `just install` recipes with the same default or explicit
directory. Existing `git-ticket` and old `tkcanvas` installations are untouched.

The frontend build needs Node/npm dependencies installed with `just web-setup`.
Run `just tooling-test` for installer destination, replacement, failure, and PATH
regressions. Those tests use temporary homes and do not install into your home.
