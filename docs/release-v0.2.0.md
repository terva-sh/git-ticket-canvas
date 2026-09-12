# v0.2.0 release verification

Published and verified on 2026-09-12. The release sequence in
[releasing](releasing.md) was followed, and this records what was actually
observed rather than what was configured.

## Identity and hosted runs

- Tag: v0.2.0, annotated object fed7084e45a38dd2e6b30b6c1a0df086806d2e8c.
- Release commit: 8529287fdba6b23d5b3b4a332dc4eb6b5719b871.
- Both remote tags carry that identical object and peeled commit.
- Forgejo release: https://git.local.sothr.com/terva-sh/git-ticket-canvas/releases/tag/v0.2.0
- Forgejo release run: https://git.local.sothr.com/terva-sh/git-ticket-canvas/actions/runs/15
- Forgejo parity run for the commit: https://git.local.sothr.com/terva-sh/git-ticket-canvas/actions/runs/14
- GitHub release: https://github.com/terva-sh/git-ticket-canvas/releases/tag/v0.2.0
- GitHub release run: https://github.com/terva-sh/git-ticket-canvas/actions/runs/34668182865
- GitHub mirror CI for the commit: https://github.com/terva-sh/git-ticket-canvas/actions/runs/34667588230

Both release workflows passed. On GitHub the Windows job passed in 1 minute
11 seconds and the release job in 4 minutes 39 seconds. Forgejo published all
six assets.

## The Windows lane blocked this release first

Release preparation stopped before any tag. GitHub's Windows lane had failed on
every commit since 616aca8 on 2026-09-10, and the public release workflow
requires a successful Windows job for the tag. Tagging would have produced a tag
that could not publish, and the runbook forbids moving a published tag.

The failure was `TestLiveStoreReplacementAndCancelledLifecycle`, which renamed
the store directory to simulate the store disappearing:

```text
live_test.go:632: rename ...\.tickets ...\.tickets-moved: Access is denied.
```

The SSE watcher was the obvious suspect and was not the cause. fsnotify v1.9.0
opens every watched directory with `FILE_SHARE_DELETE`, so its handle permits a
rename. Go does not: `syscall.Open` on Windows uses
`FILE_SHARE_READ|FILE_SHARE_WRITE` and never adds `FILE_SHARE_DELETE`. The live
coordinator reads the store continuously through `image()`, so a handle inside
`.tickets` is open much of the time and Windows refuses to rename the enclosing
directory.

That is a real platform difference rather than a test artifact. A running
git-ticket-canvas holds its store directory against rename and delete on Windows
for as long as it reads it.

Commit 8529287 splits that test in three. `TestLiveStoreLossAndRecovery` reaches
the same stale state portably by overwriting `config.yml` and restoring it.
`TestLiveStoreDirectoryReplacement` keeps the rename, which is the only way to
exercise the parent-directory watch, and skips on Windows with the reason.
`TestLiveCancelledLifecycle` is the subscribe-and-cancel tail, which Windows had
never reached because execution died at the rename. Both lanes passed on that
commit before the tag was created.

## Download verification

Both releases are non-draft stable releases with five archives and
checksums.txt. All six assets were downloaded from each forge and verified with
`scripts/verify-release.py --published --tag v0.2.0 --commit 8529287...` run from
a clean detached worktree at the tag, not from main. Each set passed archive
contents, checksums, license and document bytes, target, provenance and embedded
HTTP asset checks.

### Forgejo archive SHA-256

```text
968cd7bc73ceb6bfb190e00e08ac141c5308614b8a1472fcbaaad5fd01cfa666  git-ticket-canvas_0.2.0_darwin_amd64.tar.gz
dcb9c9c87184df86ad151f2dc112b4519d94f0ed86d15cdd39eaa76baa7bb2fe  git-ticket-canvas_0.2.0_darwin_arm64.tar.gz
ac94ee1c69f785d8cae17d382c8761a118b9f1684285e9aa0f29abff82a5a968  git-ticket-canvas_0.2.0_linux_amd64.tar.gz
9723259145aa444f2644a41a7e04b936099ee1dd7398bd8628b23a89542efe5c  git-ticket-canvas_0.2.0_linux_arm64.tar.gz
5e537712c39e6ddfaad4c78a5c30cae132908bf9d121c4b6b847e7c295fb842b  git-ticket-canvas_0.2.0_windows_amd64.zip
```

### GitHub archive SHA-256

```text
58da0534de9d1a78a329fdf4bdda94ec9af7a72bec18c1b5990ca0f200144ec2  git-ticket-canvas_0.2.0_darwin_amd64.tar.gz
b68750f6cb116598c96b69b089cee79302684a6833b39d56458307ae75fd73f4  git-ticket-canvas_0.2.0_darwin_arm64.tar.gz
f0f87d7111731a55baba957174aa861d06880241c89bbd86726ad4a4e3ecdaf7  git-ticket-canvas_0.2.0_linux_amd64.tar.gz
4fcde92cc027a06bf573a29e76494d915caa30eae7f5227830b3db20e074d5f2  git-ticket-canvas_0.2.0_linux_arm64.tar.gz
83af9ab0ff686043eabcaa9aee9ce863c9a58b4078136991b16e0ef269ffdc15  git-ticket-canvas_0.2.0_windows_amd64.zip
```

Every asset differs across the two forges, and the reason is the documented one.
The GitHub builder used go1.25.0 and the Forgejo builder go1.25.5, read from
`--version --json` and from the toolchain recorded in each binary. Both report
version v0.2.0, the full release commit and modified=false. Byte-identical
cross-forge archives are not a release requirement.

## Public installation

The installer was fetched from its published path,
`raw.githubusercontent.com/terva-sh/git-ticket-canvas/main/install.sh`, and
matches the committed `install.sh` byte for byte. Run with `--prefix` into a
temporary directory and `--version v0.2.0`, it reported "sha256 verified against
checksums.txt" and installed. Its binary matched the binary inside the
downloaded GitHub Linux amd64 archive byte for byte:

```text
13943a50856754cf46de58057dec34fd75ec543f7c5d00b93312113c1c557981  git-ticket-canvas
```

It warned that the temporary prefix is not on PATH and that the existing
`~/.local/bin` copy still wins. Both warnings are correct, and the real
installation was not replaced.

The public Go proxy returned v0.2.0 with `Origin.Hash` equal to the release
commit and `Ref` `refs/tags/v0.2.0`, and lists v0.1.0 and v0.2.0. A
`go install github.com/terva-sh/git-ticket-canvas@v0.2.0` into a temporary GOBIN
succeeded and reported v0.2.0 and modified=false, with commit=unknown. Module
downloads carry no VCS build metadata, `buildinfo.Parse` documents "unknown" as
the honest fallback, and v0.1.0 recorded the same result. Release archives and
the image retain the full commit.

## Public image

No auth file exists at `$XDG_RUNTIME_DIR/containers/auth.json`,
`~/.config/containers/auth.json` or `~/.docker/config.json`, so the pulls below
were anonymous rather than merely unauthenticated in intent. Podman pulled
0.2.0, 0.2 and latest, and all three resolve to one manifest digest:

```text
sha256:af0ec8739fe12caf47514387553e11278e7ea8d15f7cbcb4a27d9e559658602f
```

Image config ID is
5476de8a664cbcaf86783ec1599fc69e5d0a7fc40f2a54dc6894d5a057cd03ea. Every tag
reported v0.2.0, the release commit and modified=false. The image binary reports
go1.25.0, matching the GitHub archive rather than the Forgejo one, which
corroborates that the image reuses verified archive bytes instead of a second Go
build. `just image-check` against the published exact tag passed: non-root and
read-only defaults, local repository serving, 403 write refusal and explicit
writable persistence.

Anonymous access proves public distribution independently of authenticated CI
upload success. The package administration API was not queried.

## Scope and remaining limitations

The image is Linux amd64. Linux binaries were executed locally and Windows Go
build, vet and tests ran on GitHub. macOS and non-native release binaries were
verified by archive and build metadata, not executed on their targets.

This document and its release ticket are post-release commits and are not part
of v0.2.0. User-owned `.tickets/canvas/` was untouched throughout. No broad tag
push, tag movement, force-push, draft deletion or visibility change was used.

One correction worth recording, because it nearly reached this document. The
first Forgejo run URL written here used the global run id that `tea` reports,
`.../actions/runs/7204`, which returns 404. Forgejo's web URL uses a repo-local
index, `index_in_repo` 15. The links above were checked for an HTTP 200 rather
than assumed.

Harness: terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1,
built 2026-09-10T01:05:08Z. Extensions: index 0.8.2, obsidian 0.2.0, web 0.3.1.
