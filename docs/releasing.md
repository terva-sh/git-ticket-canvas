# Releasing git-ticket-canvas

This runbook adds the release process to the local development guides.
`README-release.md` is the usage document shipped in archives and the image.
Historical guides and validation reports remain unchanged.

## Hosts and authority

`origin` is the primary internal Forgejo repository. Push working changes and
run CI there. `github` is the public mirror at
`git@github.com:terva-sh/git-ticket-canvas.git`. Keep both at identical commits
and tags for a release; do not use the mirror as a daily backup.

Read the actual origin URL from `git remote get-url origin`, rather than copying
internal addresses into public prose. The one internal registry address under
`.forgejo/workflows` follows the sibling repository's runner convention.

A tag push matching `v*` publishes a release. Pushing `main` does not publish one.
An agent may prepare files and run local checks, but a person chooses the version
and approves pushes, tags, and publication. No recipe here tags this checkout or
pushes a remote. `release-rehearse` uses a throwaway clone and destroys its local
rehearsal tag when it finishes.

## Artifacts and versions

GoReleaser v2 builds these targets with CGO disabled and committed `web/dist`:

- Linux amd64 and arm64 tarballs.
- macOS amd64 and arm64 tarballs.
- Windows amd64 zip.

Each archive contains the executable, LICENSE, THIRD_PARTY_LICENSES, and
README-release.md. `checksums.txt` covers exactly those five archives.
Runtime notices include Preact, git-ticket, YAML, x/sys, and the Go standard
library. Build-only JavaScript tooling is not shipped in the executable.

`--version` and `--version --json` read Go build information, not linker-injected
variables. JSON includes schemaVersion, kind, version, commit, go, and modified.
A checkout without usable module/VCS information reports development fallbacks.
A release must report the exact tag and commit with modified=false. Full tag
history is required on both builders. Do not run `go mod tidy` or a frontend
build after GoReleaser checks the release tree; commit those changes first.

`release.disable` is true in GoReleaser. It packages but never publishes.
Both workflows verify the archives before their separate publishing step.
`scripts/verify-release.py --tag TAG` checks the exact target set, checksums,
archive contents, license/document bytes, and build provenance. It also runs
the Linux amd64 binary on an isolated store and compares its HTTP assets with
`web/dist`. A malformed, missing, duplicate, changed, or extra artifact fails.
The local verifier runs on Linux amd64, matching both release builders.

Snapshot names are not release identities. A snapshot can carry dirty/development
provenance and is never publishable. The clean tagged rehearsal is the test of
release provenance, and runs against committed HEAD, not uncommitted edits.

## Local checks

Requirements include Go, Node 22.12+, npm, Git, just, Python 3.12+, GoReleaser v2,
a C compiler, and Playwright Chromium. Podman or Docker is needed for image checks.
The release-installer tests are offline and never contact the public release API.

```sh
just parity-check
just release-check
just release-snapshot
# Commit reviewed release tooling, then verify the committed build:
just release-rehearse
```

`release-snapshot` writes only gitignored `dist/` output. `release-rehearse`
creates a disposable local clone, assigns `v0.0.0-rehearsal` there, builds all
five archives with publication disabled, verifies their clean tagged provenance,
and removes the clone. It does not create a source-checkout tag or contact a
forge. Go dependency downloads may still occur if the module cache is cold.

To exercise the image locally, unpack the snapshot Linux amd64 archive into
`image-context/`, then run:

```sh
podman build -f Dockerfile -t localhost/git-ticket-canvas:release-test image-context
just image-check localhost/git-ticket-canvas:release-test
```

The Dockerfile must receive an unpacked archive, not the repository root or a
loose development binary. `image-check` checks version output, non-root and
read-only defaults, loopback HTTP serving, mutation refusal, and explicit
writable persistence against temporary repositories. It removes test containers
and stores. The locally built image remains until you remove it.

## CI and credentials

Forgejo runs the primary parity gate on main and pull requests, plus the same
gate before a tag build. It uses the sibling's Go Alpine registry image and
mirrored checkout/GoReleaser actions. Alpine uses distro Chromium via
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH; other hosts use Playwright's pinned build.
The first hosted run must confirm available apk versions, the Chromium path,
and mirrored action availability. Source-checkout tests alone cannot prove
runner configuration.

GitHub's main/manual CI lane builds, vets, and tests Go on Windows. The public
release workflow also requires a successful Windows job for that tag, runs the
full Linux parity gate, packages, verifies archives, and builds/tests the image
before creating a release. Every GitHub job checks github.server_url to avoid
accidental execution by Forgejo's `.github` workflow support.

Before the first tag:

- Enable Actions and the appropriate runners on Forgejo. Add repository secret
  BOT_TOKEN with release write access. The publisher fails if it is missing.
- Enable GitHub Actions with contents write and packages write permissions.
  GitHub supplies GITHUB_TOKEN. No personal token belongs in this tree.
- Check the `ghcr.io/terva-sh/git-ticket-canvas` package is public after first
  publication. A successful authenticated push does not prove anonymous pulls.

Both publishers upload into a draft and expose it only after all six assets
arrive. Failed uploads leave a draft for inspection; reruns do not overwrite a
release silently. Decide whether to delete the failed draft before rerunning.
Never move an already-published tag to repair a release. Fix forward instead.

The public image is Linux amd64, matching git-ticket's image target. It uses the
verified archive bytes, not a second Go build. Before image upload, the workflow
compares a downloaded public archive with those input bytes. Exact stable tags
also move the minor and latest aliases; prereleases move only their exact alias.
Image checks precede upload and a registry pull checks version metadata afterward.
An image failure does not erase an already-published binary release.

## Release sequence requiring explicit approval

1. Review the diff, all release-scope tickets, and the clean source state. Finish
   or explicitly defer work with evidence. Do not treat unrelated draft tickets
   as blockers or silently close them. Keep user-owned `.tickets/canvas/` out of
   staging and release builds. Use a fresh clone for a clean release candidate
   rather than deleting that data.
2. Run local parity, snapshot, and clean tagged rehearsal checks. Confirm the
   license, dependency notices, archive contents, install commands, and image
   mounting examples are current.
3. With approval, push main to origin and inspect the primary CI result. Then
   push that same main commit to github and inspect the Windows lane. Record
   actual hosted results; configured workflows are not proof that they ran.
4. Have a person choose a semver tag. Inspect the intended commit, create the
   annotated tag only with approval, and push that exact tag to origin and
   github. Do not use a broad tag push or force-push. Tags trigger publication.
5. On both forges, confirm five archives plus checksums.txt. Download them,
   verify SHA-256, and run native --version --json to confirm tag/commit and
   modified=false. Cross-forge archives need not be byte-identical when Go patch
   versions differ, but each must have correct provenance and checksums.
6. Exercise the real download installer into a temporary prefix. Check its
   binary against the released archive. Verify the published module through the
   Go proxy and a clean Go-only install of the tag.
7. Pull the GHCR exact, minor, and latest tags anonymously for a stable release.
   Verify version metadata and serve a temporary local repository using the
   documented loopback/read-only command. Record package visibility separately
   from authenticated upload success.
8. Record the tag, commit, artifact hashes, workflow outcomes, and live install
   and image results in a release ticket. Keep unverified checks unticked.

No first release version or live publication is implied by this preparation.
The first hosted CI run, Windows execution, release API uploads, live installer,
Go proxy availability, and anonymous GHCR pulls remain publication-time checks.
There is no self-update command or native PowerShell installer in this scope.
