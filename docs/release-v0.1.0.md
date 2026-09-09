# v0.1.0 release verification

Published and verified on 2026-09-09 for TKT-01M23W2X3P6BFHY9HESWBW9DZZ
(Verify the first hosted release and public installation).

## Identity and hosted runs

- Tag: v0.1.0, annotated object 54c4aa6208f67abb239ba9518af04dcc6d9fffea.
- Release commit: a1ee5a5e02aa7b30bd12a5640c1ada9fba3a100f.
- Both remote tags have that identical object and peeled commit.
- Forgejo release: https://git.local.sothr.com/terva-sh/git-ticket-canvas/releases/tag/v0.1.0
- Forgejo run: https://git.local.sothr.com/terva-sh/git-ticket-canvas/actions/runs/4
- GitHub release: https://github.com/terva-sh/git-ticket-canvas/releases/tag/v0.1.0
- GitHub run: https://github.com/terva-sh/git-ticket-canvas/actions/runs/34407948271

Both release workflows passed. GitHub Windows passed in 41 seconds and the
release job passed in 3 minutes 37 seconds. Forgejo organizational BOT_TOKEN
successfully published all six assets. GitHub published the binaries and image.

## Download verification and verifier repair

Both releases are non-draft stable releases with five archives and checksums.txt.
All six assets from each forge were downloaded anonymously. Each archive passed
SHA-256, exact archive contents, license/document bytes, OS/architecture, exact
tag/commit and clean provenance checks. Native Linux version JSON and embedded
HTTP assets also passed against the original tagged checkout.

The first downloaded-assets check stopped because the prepublication verifier
required metadata.json, which is not shipped. Publication paused before the
GitHub tag push. Repair commit 2602996 adds explicit published mode requiring
the expected tag and full commit. Its 29 verifier tests and 4 publisher tests
passed. The existing Forgejo downloads then passed before the unchanged tag
was pushed to GitHub. No tag or published asset was replaced.
See [published verification](published-asset-verification.md) for the command.

### Forgejo archive SHA-256

```text
1a3a81c3040cd076d535108f28103029d101ffe1ef3d12433a23312e46cae9cb  git-ticket-canvas_0.1.0_darwin_amd64.tar.gz
768456e7eb63196ccee65cb7300ed137a8b6f53b0392a3b86556c2d57577940d  git-ticket-canvas_0.1.0_darwin_arm64.tar.gz
ad752fd1b45b52166d8fdc10320c133ad56390429ed47bbb02ac7dbc0c486a4f  git-ticket-canvas_0.1.0_linux_amd64.tar.gz
827e228afb1c6fb8eadf11249957f7ce8a0aa3ec136e32451a92e5bafdeae951  git-ticket-canvas_0.1.0_linux_arm64.tar.gz
28b12bdacdfa8e385175e2bd91a3fc1b1d49fa6d8a37826b114d000d32198f9e  git-ticket-canvas_0.1.0_windows_amd64.zip
```

### GitHub archive SHA-256

```text
1a82bc58085e115fa823126551981a10fd36644bf9b550b8fc5b87a76496f4c9  git-ticket-canvas_0.1.0_darwin_amd64.tar.gz
cb836a7c45edf634749ba11cd61071ee0f6712eb314ef827a9fdeab971aab1e4  git-ticket-canvas_0.1.0_darwin_arm64.tar.gz
9bdc219245ab8a9b107d0e1b8145b898035843de340286ee790c6370b754729b  git-ticket-canvas_0.1.0_linux_amd64.tar.gz
10e85feebe9acf05fb7f9e4ce68fe5fa924fd0a75cf49bbd2f82ff5f1dd310ba  git-ticket-canvas_0.1.0_linux_arm64.tar.gz
9e72a899a8d80c01ab01c3fb1f6b80b462deb53de631d40799b88b64e3fcbc36  git-ticket-canvas_0.1.0_windows_amd64.zip
```

The two builders produced different archive hashes. Each set independently
passed provenance, contents and checksum verification; byte-identical cross-forge
archives are not a release requirement.

## Public installation

The tagged install.sh selected the real latest stable GitHub release and installed
into a temporary prefix. Its binary matched the GitHub Linux amd64 archive byte
for byte and reported v0.1.0, the full release commit and modified=false.
Temporary-prefix PATH/shadowing warnings were expected; the user's installation
was not replaced.

The public Go proxy returned v0.1.0 with Origin.Hash matching the release commit.
A Go install of github.com/terva-sh/git-ticket-canvas@v0.1.0 succeeded outside a
source checkout, using a temporary GOBIN and the public proxy. It reported
v0.1.0 and modified=false, but commit=unknown. Module downloads lack VCS build
metadata; release archives and the image retain the full commit. This check did
not claim an uncached or Node-free PATH build; clean Go-only builds were covered
by the refreshed parity gate.

## Public image

Anonymous registry token and manifest requests returned HTTP 200 for 0.1.0,
0.1 and latest. All three resolve to manifest digest:

```text
sha256:c6ad15172b25b20cd4f67f03b22d94f19fb61a507d4926ddea271d44fde44b81
```

Podman pulled all three with an empty auth file and isolated HOME/DOCKER_CONFIG.
Every image reported v0.1.0, the release commit and modified=false. Image config
ID is 818ddc96d2d15244ce4403cec30376eb2c13171f8df71c3cc05769df2bece530.
The published exact-tag image passed the Docker repository-serving check with
non-root/read-only defaults, 403 write refusal and explicit writable persistence.
Anonymous access proves public distribution, independently of authenticated CI
upload success. The package administration API returned 403 because the local
GitHub CLI token lacks read:packages; its visibility field was not read or changed.

## Scope and remaining limitations

The image is Linux amd64. Linux binaries were executed locally and Windows Go
build/vet/tests ran on GitHub. macOS and non-native release binaries were verified
by archive/build metadata, not executed on each target. Windows remains supported;
operator guidance is to reconsider it if concrete build problems arise.

The verifier repair and this evidence are post-release commits, not part of
v0.1.0. User-owned .tickets/canvas/ was untouched. No broad tag push, tag movement,
force-push, draft deletion or visibility change was used.

Harness: terva 0.134.5-0.20260908184005-01e3a6719b46, commit 01e3a67,
built 2026-09-08T18:49:46Z. Extensions: index 0.8.2, obsidian 0.2.0, web 0.3.1.
