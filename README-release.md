# git-ticket-canvas

A browser canvas for a Git-native `.tickets` work ledger. One Go binary serves
the Preact frontend and HTTP API. Ticket mutations retain server revision checks;
card positions live beside the tickets. No Node process is needed at runtime.

This is the release usage guide. It supersedes installation examples in earlier
README and development guides without changing those historical records.

## Install

Download an archive and `checksums.txt` from
https://github.com/terva-sh/git-ticket-canvas/releases. Verify its SHA-256 checksum,
unpack it, and place `git-ticket-canvas` on PATH. Native Windows uses the amd64
zip and `git-ticket-canvas.exe`; Linux and macOS have amd64 and arm64 tarballs.
Keep LICENSE and THIRD_PARTY_LICENSES with redistributed copies.

After the first release is published, the repository's `install.sh` provides
checksum-verified installation into `~/.local/bin`, falling back to `~/bin`:

```sh
curl -fsSLO https://raw.githubusercontent.com/terva-sh/git-ticket-canvas/main/install.sh
# Inspect install.sh before running it.
sh install.sh
```

From a source checkout, `just install [DIR]` follows the same destination policy
and rebuilds the frontend first. See `docs/local-install.md`.
Go-only consumers can use `go install github.com/terva-sh/git-ticket-canvas@VERSION`
with a published tag. That uses GOBIN or GOPATH/bin, not the script's destination.

```sh
git ticket-canvas --version
git ticket-canvas --version --json
git ticket-canvas -h
git ticket-canvas -store /path/to/repo -read-only
```

Git finds the `git-ticket-canvas` executable on PATH as `git ticket-canvas`.
This is not `git ticket canvas`. The existing `git ticket` CLI initializes and
manages the store independently. Version and help work without a store.
Use `-h` for application help; Git may interpret `--help` as a manual-page request.

The browser is at http://127.0.0.1:7777. Keep it on loopback: this prototype has
no authentication. To edit, remove `-read-only` and set `-actor human:your-id`.
The application never commits or pushes ticket changes for you.

## Serve a local repository in a container

The GitHub release workflow publishes `ghcr.io/terva-sh/git-ticket-canvas` for
Linux amd64, assembled from the verified release archive. Replace `VERSION`
with a published image tag such as `0.1.0`. The image defaults to a non-root
user, `/repo` as the store, port 7777, and read-only application mode.

```sh
docker run --rm --name ticket-canvas \
  --user "$(id -u):$(id -g)" \
  -p 127.0.0.1:7777:7777 \
  --mount "type=bind,src=$(pwd),dst=/repo,readonly" \
  ghcr.io/terva-sh/git-ticket-canvas:VERSION
```

Run this from the repository containing `.tickets`. The repository must be
readable by that UID. Mount the complete worktree, not only `.tickets`.
A linked Git worktree also needs its common Git directory mounted at a path
its `.git` file can resolve. Podman users can use `--userns=keep-id` instead of
Docker's UID mapping; SELinux hosts may need an appropriately relabeled mount.

For intentional editing, use a writable mount and replace the default command:

```sh
docker run --rm --name ticket-canvas \
  --user "$(id -u):$(id -g)" \
  -p 127.0.0.1:7777:7777 \
  --mount "type=bind,src=$(pwd),dst=/repo" \
  ghcr.io/terva-sh/git-ticket-canvas:VERSION \
  -store /repo -addr 0.0.0.0:7777 -actor human:your-id
```

The UID must be allowed to write the store. Binding `0.0.0.0` inside the container
is necessary for port forwarding; keep the host-side mapping on `127.0.0.1`.
Do not expose this unauthenticated server to a network. No blanket Git
`safe.directory` exception is configured. Image `--version` reports the same
provenance as the archive. Stable tags also move the minor and `latest` image
tags; prereleases move only their exact tag.

## Development and release verification

`just parity-check` verifies locked frontend output, frontend/tooling tests,
Go checks, embedded browser behavior, and a clean Go-only build/install.
`just release-snapshot` builds and verifies five local archives without uploading.
`just release-rehearse` exercises clean tagged provenance in a disposable local
clone. See `docs/releasing.md` for the primary Forgejo / public GitHub sequence,
credentials, approval gates, and checks that require a real first release.
