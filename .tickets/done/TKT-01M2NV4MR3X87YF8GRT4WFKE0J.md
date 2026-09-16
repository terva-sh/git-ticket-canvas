---
schema: 3
id: TKT-01M2NV4MR3X87YF8GRT4WFKE0J
title: Release v0.4.0
type: chore
status: done
status_reason: null
priority: high
due_on: null
labels:
  - release
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T19:29:45Z
updated_at: 2026-09-16T20:06:50Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

The first release with a served canvas. `v0.3.2` is a desk tool; `v0.4.0` is that plus a second command that publishes a canvas at a hostname behind an identity provider, and a board laid out for the screen somebody is reading it on.

Twenty-nine commits since `v0.3.2`, eighteen tickets, across two pull requests (#1 and #2).

The minor rather than the patch because `git-ticket-canvas-server` is a new command, canvas state moved to a per-user key under a platform-conventional state directory, and the desk canvas gained controls that change what a board looks like. Nothing in the desk canvas's interface was removed or renamed, so it is not a major.

### The mirror

`docs/releasing.md` requires `origin` and `github` to carry identical commits and tags for a release, because `install.sh` reads `api.github.com`, the image lives on `ghcr.io`, and `go install` resolves through the public proxy. The mirror had been deliberately held at `5144a9b` while the multi-user work was in flight. That hold is lifted for this release, on the record, by the person who set it.

`github/main` is an ancestor of `origin/main`, so the mirror moves by fast-forward rather than by force.

The mirror is also missing the `v0.3.0` and `v0.3.1` tags. They are not being pushed as part of this: a `v*` tag push to `github` publishes a release, so backfilling them would publish two releases nobody asked for, months late. That is a separate decision.

## Acceptance criteria

- [x] The source state is clean, and every release-scope ticket is finished or explicitly deferred with evidence
- [x] just parity-check passes at the release commit
- [x] just release-check and just release-snapshot pass
- [x] just release-rehearse passes against a clean tagged clone
- [x] origin main carries the release commit and its CI result was read, not assumed
- [x] github main carries the same commit and the Windows lane passed
- [ ] An annotated v0.4.0 tag is on that exact commit on both forges
- [x] github published five archives plus checksums.txt, verified by SHA-256 and by --version --json
- [x] The real download installer works into a temporary prefix
- [x] The published module resolves through the Go proxy for a clean Go-only install
- [ ] The GHCR image pulls anonymously and reports the right version

## Notes

**agent:claude/t3code** at 2026-09-16T19:30:47Z

Local checks at be5d407 plus the release ticket commit.

- `just parity-check` passed end to end, including the 72-test browser suite and the Go-only build at clean HEAD. It is what caught TKT-01M2NT8E0TN7PMMJM1NFY35DF3, which is in this release; `just check`, the ordinary loop, does not run the browser suite.
- `just release-check`: one configuration file validated, `release` disabled as it should be.
- `just release-snapshot`: five archives, both commands in each, checksums, licenses, provenance, the two unauthenticated-bind refusals, and the embedded HTTP assets. Snapshot names itself `0.3.3-next` and is not a release identity.
- `just release-rehearse`: the same five, built from a clean tagged throwaway clone at `0.0.0-rehearsal`. Tag, archives and clone removed; nothing published.

Ticket state: `TKT-01M2ND1RNXB8941M21MRZRJDN2` is closed with its fifth criterion unticked and split into `TKT-01M2NV3WMAD902MKM5REAT4FTA`, rather than carried half-done into a release. `TKT-01M2KHX3QNR779RE8M9MM36V9V` is in-progress and is not mine: it is claimed by `agent:t3code/d30689a3` on another branch, and it is not in this release's scope. Left alone.

**agent:claude/t3code** at 2026-09-16T19:35:41Z

Forgejo run 58, "Embedded frontend and Go parity", on 355ba5c78ef5ea8bdf966f2346e8bb04bb56cb6c: success. https://git.local.sothr.com/terva-sh/git-ticket-canvas/actions/runs/58

Read from the API rather than assumed. The runs on be5d407 and 9422686 were cancelled by the newer push, which is the concurrency group doing its job and not a failure.

**agent:claude/t3code** at 2026-09-16T19:36:00Z

The mirror hold is lifted and `github/main` moved 5144a9b..355ba5c by fast-forward. No force, no tag pushed with it, and the branch named explicitly rather than by a refspec that could carry something else.

That closes a 22-commit gap the mirror had carried since the multi-user work began. `v0.3.0` and `v0.3.1` are still absent there and are staying absent for now: a `v*` tag push to github publishes a release, so backfilling them would publish two releases months late that nobody asked for.

**agent:claude/t3code** at 2026-09-16T19:57:01Z

The release commit moved from 355ba5c to bfac0eb. The Windows lane was red on 355ba5c — TKT-01M2NW7N2CGN6ZXQHVQ6ZHSYVK, a portability bug in the state directory resolver from this release's own TKT-01M2NERD2P5PTWJBSZFKQ6H8BW — so that commit is not the release and no tag was created on it.

Worth carrying into the next release: `just parity-check` passed at 355ba5c with that bug in it. The gate is Linux-only, and the mirror's Windows lane is the only thing in the pipeline that would ever have caught it. It ran as a release step, after main had already moved twice. Running it earlier is cheaper than discovering this between a merge and a tag.

Lanes on bfac0eb3377c87cc6c81dfa04852a637799480a9, both read from their APIs:
- forgejo "Embedded frontend and Go parity": success
- github mirror-ci, job `windows`: success, https://github.com/terva-sh/git-ticket-canvas/actions/runs/35143206504

**agent:claude/t3code** at 2026-09-16T20:04:44Z

Published: https://github.com/terva-sh/git-ticket-canvas/releases/tag/v0.4.0 at 2026-09-16T20:03:46Z, not a draft and not a prerelease.

Five archives plus checksums.txt, exactly the documented target set: linux amd64/arm64, darwin amd64/arm64, windows amd64. `sha256sum -c checksums.txt` over the downloaded bytes: all five OK.

The linux amd64 archive carries both commands, LICENSE, THIRD_PARTY_LICENSES and README-release.md. Both report the release identity rather than a development fallback:

    {"schemaVersion":1,"kind":"version","version":"v0.4.0",
     "commit":"bfac0eb3377c87cc6c81dfa04852a637799480a9","go":"go1.25.0","modified":false}

Each command's own refusal, run against the published artifact rather than against a build here, because this is the check that catches a release that shipped one binary twice and no Go test can see it. The desk canvas refuses `-addr 0.0.0.0:7999` and names the alternative; the served canvas refuses to start with no identity provider and names the other command. Their SHA-256 differ.

Forgejo `tag-verify` on v0.4.0: success. It builds and checks the same archives on the internal runner and uploads nothing, so a green there and a green on github mean two independent builds agreed.

**agent:claude/t3code** at 2026-09-16T20:06:16Z

The live installer, run from the tag rather than from this tree: `install.sh` resolved `releases/latest` to v0.4.0 by itself, downloaded the linux amd64 archive, verified its SHA-256 against checksums.txt, and installed into a temporary prefix. The installed bytes are identical to the binary in the archive I downloaded separately. It reports v0.4.0 at bfac0eb with modified=false.

The Go proxy serves the module: `go install github.com/terva-sh/git-ticket-canvas@v0.4.0` and `.../cmd/git-ticket-canvas-server@v0.4.0` both succeed into a clean GOBIN and both report v0.4.0. `commit` reads `unknown` there, which is correct rather than a defect: a proxy build has no VCS information and the version comes from the module version. `proxy.golang.org` lists v0.1.0, v0.2.0, v0.3.2, v0.4.0 — v0.3.0 and v0.3.1 are absent there too, matching the mirror.

GHCR, checked anonymously over the registry API with a pull token and no credentials: tags 0.4.0, 0.4 and latest all resolve to sha256:0918554c9d1eb36bb42968e7f03fcf38600e24b59b0d162966edc19c8b93e4e8, so the exact, minor and latest aliases moved together and the package is public.

**agent:claude/t3code** at 2026-09-16T20:06:32Z

Criterion 11 stays unticked. Half of it is done and half cannot be done here.

Done: the package is public and the aliases are right, checked anonymously against the GHCR API with a pull token and no credentials. That is the half the runbook says to record separately from authenticated upload success, because a successful push proves nothing about anonymous pulls.

Not done: actually pulling the image, reading its version metadata, and serving a temporary repository from it with the documented loopback read-only command. Neither podman nor docker is installed on this machine, so there is nothing here to run it with. A manifest digest is not a running container, and I am not ticking a criterion about serving on the strength of a HEAD request.

The release workflow did build the image, run `--version --json` inside it, assert the version, commit and modified fields, and run scripts/verify-image.py before uploading, and it compared the downloaded public archive against the image input bytes. That is the workflow checking itself, which is worth having and is not the same as somebody pulling it.

## Summary

v0.4.0 is published: https://github.com/terva-sh/git-ticket-canvas/releases/tag/v0.4.0

Annotated tag on bfac0eb3377c87cc6c81dfa04852a637799480a9, on both forges. Five archives plus checksums.txt, SHA-256 verified over the downloaded bytes, both commands in each, `--version --json` reporting the exact tag and commit with modified=false. The live installer resolves `latest` to v0.4.0 on its own and installs bytes identical to the archive. `go install` works through the public proxy for both commands. The GHCR package is public and 0.4.0, 0.4 and latest all resolve to one digest.

The release commit is not the one this started from. The Windows lane was red on 355ba5c, on a portability bug in this release's own state-directory work: `dirFor` took a platform argument so every branch could be checked from one machine, then used `filepath`, which reads the host. Three of four branches had never really been tested. TKT-01M2NW7N2CGN6ZXQHVQ6ZHSYVK fixed it and no tag was ever created on the red commit.

Two things this release earned that are worth carrying rather than forgetting:

`just parity-check` is Linux-only and passed at 355ba5c with that bug in it. The mirror's Windows lane was the only thing in the pipeline that could catch it, and it ran as a release step — after main had moved twice. Running the mirror's CI before the release is cheaper than finding this between a merge and a tag.

`install.sh` places one command and the archives carry two. TKT-01M2NX7ZHMKD7VR5QB6GKG3X29. Somebody installing the documented way gets the desk canvas and no served one. Not a blocker and not a reason to touch a published tag; the installer is behind the release.

Criterion 11 is left unticked rather than fudged. The package's public visibility is verified anonymously against the registry API; actually pulling the image and serving a repository from it is not, because this machine has neither podman nor docker. A manifest digest is not a running container.

The mirror hold is lifted and github/main moved 5144a9b..bfac0eb by fast-forward. v0.3.0 and v0.3.1 are still absent from both the mirror and the Go proxy, and are staying absent: a v* tag push to github publishes a release, so backfilling would publish two releases months late. That decision is open and belongs to a person.
