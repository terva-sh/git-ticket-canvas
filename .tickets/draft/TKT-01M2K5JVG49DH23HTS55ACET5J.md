---
schema: 3
id: TKT-01M2K5JVG49DH23HTS55ACET5J
title: Install the canvas without a Go toolchain
type: task
status: draft
status_reason: null
priority: normal
due_on: null
labels: []
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-15T18:34:33Z
updated_at: 2026-09-15T18:34:33Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

### The problem

The README opens with "Build and run", which assumes a Go toolchain and a
checkout. There is no path for a machine that has neither. Every release
already publishes what an installer needs, so the gap is the script and not the
infrastructure.

### What already exists, so nobody rebuilds it

- `.goreleaser.yaml` builds linux, darwin, and windows across amd64 and arm64,
  and produces `git-ticket-canvas_{version}_{os}_{arch}` archives, `.tar.gz`
  except a `.zip` on windows.
- `checksums.txt` is produced with sha256.
- `.github/workflows/release.yml` publishes `dist/*.tar.gz dist/*.zip
  dist/checksums.txt` to a GitHub release, and only after
  `scripts/verify-release.py` has passed.
- A container image is pushed to `ghcr.io` with `latest` and a
  major-minor tag, so the container audience is already served. This ticket is
  for the person who wants a binary.
- The frontend is embedded, so there is exactly one file to install and no
  asset directory to place beside it.

### What to write

`install.sh`, a POSIX shell script modelled on the one in `git-ticket`, which
solves the same problem against the same artifact shape. Read that script
before writing this one: the differences should be the repository name and
whatever the canvas genuinely needs differently, and nothing else.

The properties worth carrying over, each for a reason:

- The source is the GitHub releases of the public mirror, never the internal
  forge. A binary in the wild has never heard of `git.local.sothr.com` and
  cannot reach it.
- The sha256 is verified against `checksums.txt` before anything is unpacked,
  so a truncated download fails loudly rather than installing a broken binary.
- The script never runs `sudo` on its own. A `--prefix` the caller can write
  to is the answer, defaulting to the first of `~/.local/bin` and `~/bin` that
  exists or can be created.
- `--help` works without a network.

### Then tell people it exists

Add an install section to the README ahead of "Build and run", because the
current first section answers a question most readers do not have. Building
from a checkout is what a contributor does, not what somebody trying the tool
does.

## Acceptance criteria

- [ ] install.sh installs the current release on linux and darwin, amd64 and arm64
- [ ] The sha256 from checksums.txt is verified before anything is unpacked, and a mismatch refuses without writing
- [ ] --prefix chooses the directory, and without it the script picks a writable default and says which
- [ ] The script never invokes sudo
- [ ] The release source is the public mirror, not the internal forge
- [ ] --help works with no network
- [ ] The README has an install section before Build and run
- [ ] Run end to end on this machine, installing a real release into a temporary prefix
