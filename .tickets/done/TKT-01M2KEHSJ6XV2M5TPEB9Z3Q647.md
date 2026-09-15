---
schema: 3
id: TKT-01M2KEHSJ6XV2M5TPEB9Z3Q647
title: Publish releases from GitHub and stop publishing from Forgejo
type: task
status: done
status_reason: null
priority: high
due_on: null
labels: []
assignees: []
milestone: null
parent: null
origin: null
dependencies:
  - TKT-01M2KEZ1V4GHVWD84CD6NDQVM9
blocks_on: none
references:
  - ref: file:.github/workflows/release.yml
    path: null
  - ref: file:release_config_test.go
    path: null
  - ref: file:docs/releasing.md
    path: null
  - ref: file:.forgejo/workflows/tag-verify.yml
    path: null
claim: null
archive: null
created_at: 2026-09-15T21:11:16Z
updated_at: 2026-09-15T21:52:10Z
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

- [x] The GitHub mirror holds the same main commit and the v0.3.1 tag as origin, and a non-draft v0.3.1 GitHub release carries five archives plus checksums.txt.
- [x] install.sh, run unmodified against the public API, resolves v0.3.1 rather than v0.2.0.
- [x] No workflow in the tree uploads a release artifact to Forgejo, and scripts/publish-forgejo.py with its test are gone from the tree.
- [x] The Forgejo tag lane still runs parity, builds, and verifies archives, and holds only contents: read.
- [x] A test fails if a second forge gains a publish step, rather than only asserting the order of the steps GitHub has.
- [x] docs/releasing.md and README-release.md name GitHub as the only publisher and no longer instruct an operator to configure BOT_TOKEN for releases.

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

## Notes

**agent:t3code/d30689a3** at 2026-09-15T21:17:10Z

Criteria 1 and 2 are blocked, and the block is a real finding rather than a
delay. Pushing main to the mirror (884c155..e8c0cc3, a fast-forward) started
mirror-ci run 35024247866, and its Windows job failed after 1m32s. The v0.3.1
tag was therefore not pushed: `.github/workflows/release.yml` declares
`needs: windows`, so a tag pushed over that failure would publish nothing and
would leave a tag naming a version that does not exist.

Windows passed for v0.2.0 on 2026-09-12 at 8529287 and has not run since,
because the mirror was never pushed after that. The multi-store work broke it
and nothing reported that for four days. Fifteen tests fail across
internal/api, internal/config, internal/discover, internal/state, and the root
scan tests.

Almost all of it is the tests rather than the product. They hardcode POSIX
absolute paths, so `Load(..., "/base")` with `shared=/from/env` produces
`\base\from\env` on Windows because `filepath.IsAbs("/from/env")` is false
there. `TestDirFollowsXDG` sets `XDG_STATE_HOME=/somewhere/state` and hits the
same rule. `TestWritingLeavesNoPartialFile` asserts mode 0600, which Windows
reports as -rw-rw-rw-. `TestHashedIDIsAlwaysAValidName` tries to create a
directory named `....`, which Windows refuses.

One is a product defect. `internal/config/config.go:317` expands a leading
tilde only when the next character is `filepath.Separator`, so on Windows
`~/notes`, which is what anyone writes in a config file, is not expanded and is
joined against the base instead. That is also the likely cause of
`TestMergeJoinsATildePathWithADiscoveredOne` finding two stores where it wants
one: an unexpanded tilde path never resolves to the directory discovery found,
so the two are not recognized as the same store and both are served.

Filed separately as the blocker for criteria 1 and 2.

**agent:t3code/d30689a3** at 2026-09-15T21:25:44Z

v0.3.1 cannot be the release that reaches GitHub, and this is a consequence of
the Windows finding rather than a separate problem.

The tag names 9007d40. The Windows fix is 15bb2d1, which is later, so the tag
does not contain it. Pushing v0.3.1 to the mirror would run the release
workflow against a tree whose Windows job fails, and `needs: windows` means the
publishing job would never start. The result would be a tag on the mirror with
no release attached to it, which is worse than the current state: today the
mirror simply has no v0.3.1, which is true, whereas a tag without a release
looks like a publication that went wrong.

Criteria 1 and 2 therefore need a tag at or after 15bb2d1. Choosing that version
is a person's decision under docs/releasing.md, which says a person chooses the
version and approves pushes, tags, and publication, so this is where the ticket
waits. v0.3.1 stays on Forgejo as the record of what was built there.

Measured for criterion 2, so the before state is on the record: as of
2026-09-16, `api.github.com/repos/terva-sh/git-ticket-canvas/releases/latest`
returns tag v0.2.0, published 2026-09-12T02:43:24Z. That is what the documented
one-line installer resolves today.

## Summary

GitHub is the only publisher, and v0.3.2 is the first release to prove it on
both sides at once.

Published: https://github.com/terva-sh/git-ticket-canvas/releases/tag/v0.3.2,
non-draft, not a prerelease, at 2026-09-15T21:50:59Z, from run 35027424107 with
both the windows and release jobs green. Six assets: five archives plus
checksums.txt. Forgejo ran `verify` for the same tag and it succeeded, and its
release list still ends at v0.3.1, so the internal lane checked the tag and
uploaded nothing. That is the change working from both directions rather than
only the absence of a second upload.

The installer criterion was measured before and after. Before,
`api.github.com/.../releases/latest` returned v0.2.0 from 2026-09-12; now it
returns v0.3.2. Running `install.sh` unmodified into a temporary prefix
downloaded `git-ticket-canvas_0.3.2_linux_amd64.tar.gz`, verified its SHA-256
against checksums.txt, and installed a binary reporting version v0.3.2, commit
b0ab0935d32db2c07b7f5a250aec8eda8a9ec882, modified=false. That binary is byte
identical to the one inside the downloaded release archive.

The tag is v0.3.2 rather than v0.3.1 because v0.3.1 names 9007d40, which
predates the Windows fix. `needs: windows` would have stopped the publishing job
and left a tag on the mirror with no release behind it. v0.3.1 stays on Forgejo
as the record of what was built there.

In the tree: `.forgejo/workflows/release.yml` is now `tag-verify.yml`, with the
same parity gate, build, and archive verification, no upload step, and
`contents: read`. `scripts/publish-forgejo.py` and its test are gone, and
`tests/tooling/release-verifier.test.mjs` no longer runs the second script.
`TestReleaseWorkflowsGatePublication` required a publish step in both workflows
and could not survive the change, so it became three properties: the ordering
check applied to the one publisher, a check that the internal lane still
verifies, and `TestExactlyOneWorkflowPublishes`, which fails if any second
workflow gains a publish step. That last one was falsified twice, by re-adding
the Forgejo publisher and by dropping `--skip=publish`.

One thing found on the way and worth keeping visible: pushing the mirror
uncovered that Windows had been broken since the multi-store work, four days
earlier. The mirror is the only place Windows runs and nothing pushes it except
a release, so the lane reported the state of the last push rather than the state
of the code. Fixed under TKT-01M2KEZ1V4GHVWD84CD6NDQVM9 (Fix the Windows test
lane the multi-store work broke). Now that a release requires the mirror, that
particular blind spot is narrower, but it is not closed: main still reaches
GitHub only when somebody pushes it.
