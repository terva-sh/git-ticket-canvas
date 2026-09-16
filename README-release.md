# git-ticket-canvas

A browser canvas for a Git-native `.tickets` work ledger. Two Go binaries serve
the Preact frontend and HTTP API. Ticket mutations retain server revision checks;
card positions live beside the tickets. No Node process is needed at runtime.

`git-ticket-canvas` is the canvas on your own machine: loopback, writable, no
authentication, pointed at repositories you already have. It refuses an address
anybody else could reach. `git-ticket-canvas-server` is the canvas published at
a hostname: it refuses to start without an OpenID Connect provider, defaults to
read-only, and grants read access per store. Which one you are running is
answerable from its name rather than from the flags it was given, which is why
there are two of them and not one flag.

This is the release usage guide. It supersedes installation examples in earlier
README and development guides without changing those historical records.

## Install

Download an archive and `checksums.txt` from
https://github.com/terva-sh/git-ticket-canvas/releases. Verify its SHA-256 checksum,
unpack it, and place `git-ticket-canvas` and `git-ticket-canvas-server` on PATH.
Every archive carries both. Native Windows uses the amd64 zip and the `.exe`
names; Linux and macOS have amd64 and arm64 tarballs.
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
with a published tag, and
`go install github.com/terva-sh/git-ticket-canvas/cmd/git-ticket-canvas-server@VERSION`
for the served canvas. That uses GOBIN or GOPATH/bin, not the script's destination.

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

The browser is at http://127.0.0.1:7777. To edit, remove `-read-only` and set
`-actor human:your-id`. The application never commits or pushes ticket changes
for you.

`git-ticket-canvas` has no authentication of any kind, so it refuses a
non-loopback `-addr` and its error names the other command. There is no flag
that turns that into a warning, because a warning has an override and the
override is what somebody reaches for at exactly the moment they should be
reaching for a different tool. The one exception is a container, below.

## Serve a canvas to other people

```sh
git-ticket-canvas-server -config /etc/git-ticket-canvas.yml -addr 127.0.0.1:7777
```

It refuses to start without an issuer, a client id, and the public URL it is
reached at. Put them in the canvas configuration file rather than on the command
line, which is where the client secret belongs too: a secret in an argument is
readable by every other process on the machine.

```yaml
identity:
  issuer: https://id.example.com/application/o/canvas/
  clientId: git-ticket-canvas
  clientSecret: ...
  baseUrl: https://canvas.example.com

roles:
  "Brokkr Staff": reader

stores:
  - name: ledger
    path: /srv/ledger
    roles:
      "Brokkr Ledger Admin": reader
    honourGroups: ["Brokkr Staff"]
```

Register `https://canvas.example.com/auth/callback` as the redirect URI. The
canvas prints it at startup beside the issuer, so a mismatch is visible before
anybody has typed a password.

Access is granted per store, and a store nobody granted is invisible rather than
public: adding a repository to the configuration to look at it yourself does not
hand it to everybody who can log in, and a store the caller does not hold
answers exactly as one that is not configured. The top-level `roles:` map is a
convenience and grants nothing until a store names the group under
`honourGroups`.

Identity never comes from a store's own `.tickets/config.yml`. A ticket store is
a git repository, and repository bytes must not decide who the canvas trusts to
log in, or who may read anything.

The served canvas is read-only, sessions are held server-side behind an opaque
cookie and do not survive a restart, and there is no administration interface
yet. See [serving a canvas](docs/serving-a-canvas.md) for the whole of it.

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
  -store /repo -addr 0.0.0.0:7777 -actor human:your-id \
  -unsafe-publish-without-authentication
```

The UID must be allowed to write the store. Binding `0.0.0.0` inside the container
is necessary for port forwarding, and `-unsafe-publish-without-authentication` is
what lets the desk canvas do it: a process inside a container cannot see whether
the host mapped that port to a loopback address, so the decision is the
operator's and the flag is where they record it. The default command already
passes it. **Keep the host-side mapping on `127.0.0.1`.** `-p 7777:7777` publishes
an unauthenticated canvas to every machine that can reach this host.

The image ships `git-ticket-canvas-server` too. To serve other people, override
the entrypoint and give it a provider:

```sh
docker run --rm --name ticket-canvas \
  --user "$(id -u):$(id -g)" \
  -p 127.0.0.1:7777:7777 \
  --mount "type=bind,src=$(pwd),dst=/repo,readonly" \
  --entrypoint git-ticket-canvas-server \
  ghcr.io/terva-sh/git-ticket-canvas:VERSION \
  -store /repo -addr 0.0.0.0:7777 \
  -issuer https://id.example.com -client-id git-ticket-canvas
```

No blanket Git `safe.directory` exception is configured. Image `--version`
reports the same provenance as the archive, from either command. Stable tags
also move the minor and `latest` image tags; prereleases move only their exact
tag.

## Development and release verification

`just parity-check` verifies locked frontend output, frontend/tooling tests,
Go checks, embedded browser behavior, and a clean Go-only build/install.
`just release-snapshot` builds and verifies five local archives without uploading.
`just release-rehearse` exercises clean tagged provenance in a disposable local
clone. Releases are published from GitHub only; the internal Forgejo repository
builds and verifies a tag without uploading it. See `docs/releasing.md` for the
sequence, credentials, approval gates, and checks that need a real release.
