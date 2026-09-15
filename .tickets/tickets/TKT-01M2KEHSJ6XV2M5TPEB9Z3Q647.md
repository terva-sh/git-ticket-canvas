---
schema: 3
id: TKT-01M2KEHSJ6XV2M5TPEB9Z3Q647
title: Publish releases from GitHub and stop publishing from Forgejo
type: task
status: in-progress
status_reason: null
priority: high
due_on: null
labels: []
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references:
  - ref: file:.github/workflows/release.yml
    path: null
  - ref: file:.forgejo/workflows/release.yml
    path: null
  - ref: file:release_config_test.go
    path: null
  - ref: file:docs/releasing.md
    path: null
claim:
  actor: agent:t3code/d30689a3
  branch: t3code/orient-upstream-review-tickets
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-d30689a3
  commit: 9007d4025388359e54d63c6567d968aa9e45e1d8
  session: null
  claimed_at: 2026-09-15T21:11:22Z
  expires_at: null
archive: null
created_at: 2026-09-15T21:11:16Z
updated_at: 2026-09-15T21:11:43Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:t3code/d30689a3
  name: ""
extensions: {}
---

## Description

Two forges publish the same release today, and the public installer reads only
one of them. `.forgejo/workflows/release.yml` uploads five archives plus
`checksums.txt` to the internal Forgejo repository through
`scripts/publish-forgejo.py` and the `BOT_TOKEN` secret.
`.github/workflows/release.yml` publishes the same artifacts as a GitHub release
and pushes the image to `ghcr.io`. Neither is the stated source of truth.

The gap is already costing something measurable. `install.sh` line 75 reads
`https://api.github.com/repos/terva-sh/git-ticket-canvas/releases/latest`, so the
documented one-line install resolves whatever GitHub says is newest. GitHub's
newest release is v0.2.0, published 2026-09-12. v0.3.1 was published to Forgejo
on 2026-09-15 and was never pushed to the mirror. Anyone running the documented
installer today gets v0.2.0 and no error, because a release that exists on the
wrong forge is indistinguishable from a release that does not exist.

Dual publication also means two artifact sets per tag with no rule for which one
a report cites. `docs/release-v0.2.0.md` records that the GitHub builder used
go1.25.0 and the Forgejo builder go1.25.5, so the two archives for one tag are
not byte-identical and never will be. Keeping both makes every verification
answer the question twice and makes the phrase "the v0.3.1 binary" ambiguous.

GitHub is the right survivor rather than Forgejo, for reasons that have nothing
to do with preference. The installer, the ghcr.io image, the Go module proxy,
and `go install github.com/terva-sh/git-ticket-canvas@VERSION` all resolve
against public infrastructure. A release on an internal host reachable only from
the local network cannot serve any of them. Forgejo stays the primary
development remote and keeps running the parity gate on pushes and on tags. It
stops uploading artifacts.

Dropping the Forgejo publisher also retires the `BOT_TOKEN` release-write secret
from this repository's release path. GitHub Actions supplies `GITHUB_TOKEN` to
its own workflow, so no token needs configuring for publication.

## Acceptance criteria

- [ ] The GitHub mirror holds the same main commit and the v0.3.1 tag as origin, and a non-draft v0.3.1 GitHub release carries five archives plus checksums.txt.
- [ ] install.sh, run unmodified against the public API, resolves v0.3.1 rather than v0.2.0.
- [ ] No workflow in the tree uploads a release artifact to Forgejo, and scripts/publish-forgejo.py with its test are gone from the tree.
- [ ] The Forgejo tag lane still runs parity, builds, and verifies archives, and holds only contents: read.
- [ ] A test fails if a second forge gains a publish step, rather than only asserting the order of the steps GitHub has.
- [ ] docs/releasing.md and README-release.md name GitHub as the only publisher and no longer instruct an operator to configure BOT_TOKEN for releases.

## Implementation plan

Promote first, then retire the second publisher. The order is the point: making
GitHub the only publisher before GitHub has published anything from this branch
would leave no working path if the public lane is broken. `.github/workflows/`
has not changed since v0.2.0 (`git diff v0.2.0..HEAD -- .github` is empty), so
the lane that published v0.2.0 is the lane that will publish v0.3.1, and running
it once proves that before Forgejo's publisher is removed.

### Phase 1, promote the mirror

Add a `github` remote at `git@github.com:terva-sh/git-ticket-canvas.git`, the
address `docs/releasing.md` already names. The mirror is 26 commits behind at
884c155, which is an ancestor of 9007d40, so `main` fast-forwards.

Push `main`, wait for the Windows lane, then push the `v0.3.1` tag alone.
`v0.3.0` is deliberately left on Forgejo only. It names a commit whose parity
gate fails, which is why that release failed on 2026-09-15, and pushing it would
start a run that cannot succeed and publish nothing. A tag with no release on
either forge is a truthful record of a release that did not happen.

Confirm the run, the six assets, and then the thing the ticket is actually
about: that unmodified `install.sh` resolves v0.3.1. Run it into a temporary
prefix rather than reading the API and calling it proof.

### Phase 2, one publisher

`.forgejo/workflows/release.yml` keeps its tag trigger, its parity gate, its
GoReleaser build, and `scripts/verify-release.py`. It loses the publish step, so
the internal lane still fails loudly when a tag cannot be built on the internal
runner and never uploads. The workflow and job are renamed from `release` to
`tag-verify`, because a job called `release` that releases nothing misleads the
next reader more than the rename costs. `permissions` drops to `contents: read`.

Delete `scripts/publish-forgejo.py` and `tests/tooling/publish_forgejo_test.py`,
and drop the second entry from the loop in
`tests/tooling/release-verifier.test.mjs` that runs them.

`TestReleaseWorkflowsGatePublication` currently requires a publish step in both
workflows, so it fails on this change and has to be rewritten rather than
relaxed. Replace it with two properties. The first keeps the existing ordering
check but applies it only to the workflow that publishes. The second is new and
stronger: walk every workflow file under `.github/` and `.forgejo/` and fail if
more than one contains a publishing step, so a future edit that adds a second
publisher is caught by a test rather than by a duplicate release.

Update `docs/releasing.md` (hosts and authority, CI and credentials, and the
numbered sequence) and the `README-release.md` pointer to it.

### Deliberately not in scope

Both release workflows and `.forgejo/workflows/ci.yml` install
`git-ticket@v0.14.3` while `go.mod` requires v0.18.1. That pin is stale, but
v0.14.3 was run against this store during planning and reported "No problems
found", so it is not breaking anything today and changing what CI installs
during a release change would mix two failure modes. Filed separately.
