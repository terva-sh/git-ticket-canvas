---
schema: 3
id: TKT-01M2MEB8F779XMKSSP2JJA338J
title: Split the desk canvas and the served canvas into two commands
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - auth
  - multiuser
assignees: []
milestone: null
parent: TKT-01M2MEAP8ED8NZYGJKN2002G6J
origin: null
dependencies:
  - TKT-01M2MEAYQBB43APVFJW17SNC5T
blocks_on: none
references:
  - ref: doc:multiuser
    path: docs/multiuser-design-v1.md
  - ref: code:cli
    path: internal/cli/cli.go
  - ref: code:bind-safety
    path: internal/cli/addr.go
  - ref: code:identity-config
    path: internal/config/identity.go
  - ref: code:desk
    path: main.go
  - ref: code:served
    path: cmd/git-ticket-canvas-server/main.go
  - ref: code:assets
    path: web/assets.go
  - ref: test:commands
    path: internal/cli/command_test.go
  - ref: release:packaging
    path: .goreleaser.yaml
  - ref: release:image
    path: Dockerfile
claim: null
archive: null
created_at: 2026-09-16T06:26:56Z
updated_at: 2026-09-16T13:55:22Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

`-addr` takes whatever it is given (`main.go:100`, default `127.0.0.1:7777`), so `-addr 0.0.0.0:7777` publishes every served store to the network with no authentication in front of it. A startup warning was considered and rejected: a warning has an override, and the override is what somebody reaches for at exactly the moment they should be reaching for a different tool.

Split the entrypoint instead, so the rule is structural rather than checked. `git-ticket-canvas` is the desk tool and refuses a non-loopback address, naming the other command in the error. `git-ticket-canvas-server` is the served tool and is where every later phase lands.

Defaults differ by command rather than globally. The desk tool stays writable, because loopback plus your own repository plus one person is the case where writing is the point, and a read-only default there is a flag people alias around within a week. The server defaults read-only.

Two entrypoints rather than a build tag, which terva uses for the same problem: a tag makes "does this binary have authentication" answerable only by knowing how it was built, while a command name says it out loud. See `docs/multiuser-design-v1.md`.

## Acceptance criteria

- [x] Two commands build, and the release ships both
- [x] The desk tool refuses a non-loopback -addr with an error naming the server command
- [x] The desk tool's defaults, flags, and behaviour are otherwise unchanged
- [x] The server command refuses to start without an identity provider configured
- [x] The server command defaults to read-only

## Implementation plan

Two entrypoints over one shared body, and the frontend embed moves so both can
reach it.

### Where the code goes

`go:embed` cannot look above its own package directory, so a second command in
`cmd/` could not see `web/dist` while the embed lived in the root package. The
embed moves to `web/assets.go`, a Go package beside the assets it embeds, and
both commands call `web.FS()`.

`internal/cli` takes the body of the old `main.go`: flags, discovery, the merge,
the registry, the serving loop, and `version.go`. `Kind` is which canvas is
running, `Run(kind, args)` is the whole program, and the two `main` packages are
one line each. Splitting the body rather than copying it is what keeps "the desk
tool's behaviour is otherwise unchanged" a property rather than a hope.

`main.go` stays the desk canvas so that `go install
github.com/terva-sh/git-ticket-canvas@VERSION` keeps meaning what
README-release.md says it means. The served canvas is
`./cmd/git-ticket-canvas-server`.

### What actually differs

Three things, and each is a switch on `Kind` rather than a flag:

- `-read-only` defaults to true on the served canvas and false on the desk one.
- The desk canvas refuses a non-loopback `-addr`. The refusal names the served
  command, because somebody who hits it wants a different tool rather than a
  different flag.
- The served canvas refuses to start without an issuer and a client id.

The flags themselves differ too: `-unsafe-publish-without-authentication` exists
only on the desk canvas and `-issuer`, `-client-id`, `-client-secret` only on the
served one. A flag that is absent cannot be passed by mistake, and
`TestEachCommandHasItsOwnFlags` reads each command's own `-h` output so the desk
set cannot drift unnoticed.

### Identity configuration

`config.Identity` is the shape: issuer, client id, client secret, under
`identity:` in the canvas's own configuration file, with flags overriding.
Nothing consults it yet; TKT-01M2MEBN builds the relying party on it.

It is not reachable from a store's `config.yml`. `discover.readChildren` decodes
only `canvas.children` into its own struct and never touches `config.Config`, so
the path from repository bytes to identity does not exist rather than being
closed.

`Validate` also refuses a plaintext issuer, which is TKT-01M2MEBN's criterion.
It is here because the issuer is being parsed here anyway, and shipping an
intermediate that accepts one would be shipping the hole.

### Packaging

Two goreleaser builds, one archive per platform carrying both, so five archives
stay five. `verify-release.py` checks both binaries' provenance and runs each
one's refusal against the built artifact, which is the only check that can catch
a release that shipped the same binary under two names. `install-local.sh`
installs both: a local install that gives you half the product is a trap when
the half you have tells you to run the half you do not.

## Notes

**agent:claude/t3code** at 2026-09-16T13:55:01Z

The design document has no answer for the container image, and the maintainer chose one.

docs/multiuser-design-v1.md says the desk tool's refusal has "no override, because an override is the thing somebody reaches for at the moment they should be reaching for the server". The published image's default command is `-store /repo -addr 0.0.0.0:7777 -read-only`, and README-release.md says that binding `0.0.0.0` inside a container "is necessary for port forwarding; keep the host-side mapping on `127.0.0.1`". Implemented literally, the refusal breaks the image.

It is not a case the rule got wrong so much as one it did not consider. A process inside a container has to bind `0.0.0.0` to be reachable through a published port at all, and it cannot see whether the host mapped that port to a loopback address. The publication decision is made outside the process, by somebody the process cannot ask.

Four options were put to the maintainer on 2026-09-16, with costs:

1. Keep the desk tool in the image and document `--network host`, so the container's loopback is the host's. No override, and it removes today's footgun where `-p 7777:7777` instead of `-p 127.0.0.1:7777:7777` publishes an unauthenticated canvas. Costs network isolation and behaves differently on Docker Desktop.
2. Make the image run the served command, which refuses to start without a provider. Truest to the design; the documented read-only container use stops working out of the box.
3. A self-naming unsafe flag on the desk tool, passed by the image's command.
4. Stop and leave the phase unfinished.

**The maintainer chose 3.** The argument that carried it is that the design already permits this exact shape for a different refusal: "A development opt-out may exist; it must say in its own name that it is unsafe", said of the plaintext issuer. Applying that to one refusal and forbidding it for another was an inconsistency in the document rather than a considered difference.

Implemented as `-unsafe-publish-without-authentication`, on the desk command only. It is not silent: `logPublishingWithoutAuthentication` writes a warning at every start, not only the run where somebody typed the flag, because a flag set in an image or a unit file is read once and then never again.

Proposed amendment to docs/multiuser-design-v1.md, in "Two commands, not one flag": the sentence "There is no override" becomes an override that is named after its cost, with the container as the case it exists for and the warning as what keeps it visible. Not written here, because amending the design document is not this ticket's work.

**agent:claude/t3code** at 2026-09-16T13:55:01Z

This phase's served canvas authenticates nobody, and says so at every start.

The entrypoint split lands before single sign-on does, so `git-ticket-canvas-server` currently checks that an identity provider is configured, never consults it, and then serves every request without asking who is asking. It also binds whatever `-addr` it is given, since the loopback refusal is the desk command's.

That is the phase order the design chose and it is defensible between commits, but it is a binary that looks like the authenticated one and is not. It logs a warning naming TKT-01M2MEBN and saying not to publish it, and that warning is removed when TKT-01M2MEBN lands.

If this epic is stopped before TKT-01M2MEBN, do not release from here. The desk command is safe; the served one is a shell.

**agent:claude/t3code** at 2026-09-16T13:55:01Z

What changed outside the two commands, so a reviewer does not have to find it in the diff.

`web/assets.go` is new and holds the `go:embed`. It had to move: `go:embed` cannot look above its own package directory, so a command under `cmd/` could never have seen `web/dist` while the embed lived in the root package. Putting a Go file in the frontend directory is unusual; the alternative was making the module root a library, which would have broken `go install github.com/terva-sh/git-ticket-canvas@VERSION` as README-release.md documents it.

Three closed tickets carried `references.path` entries pointing at `assets_test.go`, `version.go`, and `version_test.go`, which `git ticket check --strict` then reported as unresolved. Each was repointed to where the file now lives, under the same ref name, so the reference still records what it recorded. Nothing else about those tickets was touched.

`verify-release.py` now unpacks each archive into a directory named for its target rather than renaming the binary, so both commands keep the names a person would run.

The desk command gained exactly one flag, `-unsafe-publish-without-authentication`. Everything else about its flags, defaults, and behaviour is unchanged, and `TestEachCommandHasItsOwnFlags` pins the full set by reading the command's own `-h` output.

## Summary

Two commands, sharing one body in `internal/cli`.

`git-ticket-canvas` is the desk canvas and stays at the module root, so `go install github.com/terva-sh/git-ticket-canvas@VERSION` still means what README-release.md says. `git-ticket-canvas-server` is `./cmd/git-ticket-canvas-server`. Each `main` is one line; `cli.Run(kind, args)` is the program.

Three differences, each a switch on `Kind` rather than a flag somebody can move: the served canvas defaults to read-only, the desk canvas refuses a non-loopback `-addr` naming the served command, and the served canvas refuses to start without an issuer and a client id. The flags differ too, so the one that does not apply cannot be passed at all, and `TestEachCommandHasItsOwnFlags` reads each command's own `-h` to keep the desk set from drifting.

`config.Identity` is the provider shape under `identity:` in the canvas's own configuration file, with flags overriding. Nothing consults it yet. It is unreachable from a store's `config.yml`, because `discover.readChildren` decodes only `canvas.children` into its own struct. `Validate` also refuses a plaintext issuer, which is TKT-01M2MEBN's criterion, brought forward rather than shipping an intermediate that accepts one.

The frontend embed moved to `web/assets.go` so both commands can reach it; `go:embed` cannot look above its own package directory.

The release ships both in one archive per platform, so five archives stay five. `verify-release.py` runs each command's own refusal against the built artifact, which is the only check that catches a release shipping one binary under two names. `install-local.sh` installs both. The image ships both, defaults to the desk canvas, and passes `-unsafe-publish-without-authentication`.

That flag is the one design decision the maintainer made rather than the document: see the first note. It exists for a container, which must bind `0.0.0.0` to be reachable and cannot see the host's port mapping. It warns at every start.

Unearned tick: none. One caveat on the third criterion, recorded in a note: the desk command gained that one flag, and is otherwise unchanged.

The served canvas in this phase authenticates nobody and says so loudly at startup. Do not release before TKT-01M2MEBN.

`just check` passes.
