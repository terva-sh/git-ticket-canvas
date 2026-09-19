---
schema: 3
id: TKT-01M2KJ5STJFD39PWNFFYJCZP3B
title: Bring user and developer documentation up to what the canvas does
type: task
status: done
status_reason: null
priority: high
due_on: null
labels:
  - readability
assignees: []
milestone: null
parent: null
origin: null
dependencies:
  - TKT-01M2KHX3QNR779RE8M9MM36V9V
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-15T22:14:37Z
updated_at: 2026-09-19T07:34:37Z
created_by:
  id: agent:t3code/d30689a3
  name: ""
updated_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
extensions: {}
---

## Description

The documentation describes a single-store canvas that polls, and the product is
a multi-store canvas that watches the filesystem. These are not small wording
drifts; the README tells a reader that features which exist do not.

Four checked against the code on 2026-09-16 rather than suspected:

`README.md:203` says "The canvas re-reads the store every ~12s and on tab
focus... That is a poll because the server holds no state to push from; a file
watcher is the obvious next step." The file watcher is built.
`internal/api/live.go` imports `fsnotify` and holds a `*fsnotify.Watcher`, and
`internal/api/events.go:83` serves `text/event-stream`. The README recommends as
future work the thing the binary already does.

`README.md:214` lists "`z` and `w` are in the layout schema but nothing sets them
yet" under known edges. `internal/layout.Card` carries `W`, `Z`, and `Collapsed`;
`Board` carries `Frames` with bounds, color, and members; `Routing` carries
`Pens` with pin points and required labels, plus `ruleOrder` and `inbox`. The
web tree has `FramesPanel.tsx`, `Frames.css`, and `FrameCanvas.css`.

The architecture block lists `internal/layout` and `internal/api` only. The tree
holds `buildinfo`, `config`, `discover`, `state`, and `testpath` as well, and
three of those carry the multi-store design: discovery, configuration
precedence, and the favorites and last-store file outside the repository.

The API table documents `GET /api/board`, `GET /api/schema`, `POST
/api/tickets`, `PATCH /api/tickets/{id}`, `DELETE /api/tickets/{id}`, and `PUT
/api/layout`. The server registers `/api/stores/{store}/` as the prefix for
per-store routes, plus `GET /api/stores`, `POST /api/stores/rescan`, `GET` and
`PUT /api/favorites`, and `GET /api/version`. Anybody writing a client from the
README writes one that cannot address a store.

Beyond those, this session alone changed how the software is obtained and
verified, and the user-facing documents have not caught up in full:
publication moved to GitHub alone, `README-release.md` and `docs/releasing.md`
were updated for that, and everything else was not re-read against it. The
store picker, the store browser, display names, hashed store ids in the
`#store=` fragment, and the state directory have no user-facing description
anywhere.

Treat the audit as the work rather than the edits. A pass that fixes the four
findings above and does not re-read the rest leaves the next reader in the same
position, trusting a document that was right about some things.

## Acceptance criteria

- [x] The README no longer describes the watcher as future work, and says what the canvas does when the store changes on disk.
- [x] The known edges list matches the layout package: nothing claims z, w, frames, or pens are unimplemented.
- [x] The architecture block names every package under internal/ and says what each is for.
- [x] The API section documents the per-store route prefix and the store, favorites, rescan, and version endpoints, so a client written from it can address a store.
- [x] Multi-store use is documented for a user: naming stores, discovery roots, the picker and browser, favorites, display names, and where state is kept.
- [x] Every documented command, flag, path, and count in the files changed was run or read at the commit that lands them, and the ticket says which were not.
- [x] Each document under docs/ is either confirmed current, updated, or explicitly recorded as historical, with none left unexamined.

## Implementation plan

Treat the audit as the work. Three passes, each checked against the code at the commit that lands it.

### README.md
Rewrite the sections the ticket names and re-read the rest. Verified facts to write in:
- Live updates: `internal/api/live.go` watches with fsnotify (100ms debounce, one-second burst cap, 60s safety scan) and publishes epoch/generation/scopes on `GET /api/events`; the browser (`web/src/platform/tickets/live.ts`) answers with a conditional `GET /api/board` (`If-None-Match`, 304), falls back to a 12s poll while the stream is down, and 60s when live, plus a read on tab visibility.
- Layout schema: `internal/layout` holds `Card{x,y,w,z,collapsed}`, `Frame{title,x,y,w,h,color,members}`, and `Routing{pens,ruleOrder,inbox}`. Frames are user-facing (toolbar New frame, draw on canvas, FramesPanel). `z` is read for stacking; `w` and `collapsed` are accepted and preserved but no shipped control sets them. Pens are validated by the API and computed by `web/src/platform/canvas/pens.ts` and `placement.ts`, but `web/src/main.ts` passes no publication bridge, so the shipped canvas still auto-places in status lanes. Say so as the known edge rather than "nothing sets them".
- Architecture: name all twelve `internal/` packages (actors, api, auth, buildinfo, cli, config, discover, grants, layout, people, state, testpath) from their package comments.
- API: routes are `/api/stores/{store}/…` for board, schema, events, tickets, layout; flat `/api/…` only when exactly one store is served (`store_required` otherwise); plus `GET /api/stores`, `POST /api/stores/rescan` (refused on the served canvas), `GET|PUT /api/favorites`, `GET /api/session`, `GET /api/version`, and on the served canvas `GET|PUT /api/stores/{store}/actor`, `GET|PUT /api/actor`, `GET /api/people`.
- Multi-store for a user: `-store PATH` or `NAME=PATH`, `-root`/`-R`/`-depth`/`-exclude`, `-config`, `GIT_TICKET_CANVAS_STORES`, `-scan`; ids are `leaf-<12 hex of sha256(path)>` and appear in the `#store=` fragment; display names default to the directory name; picker, browser with search, favorites star, rescan; state in `$XDG_STATE_HOME/git-ticket-canvas/state.json` (or `~/.local/state`, `~/Library/Application Support`, `%LOCALAPPDATA%`) with `actors.json` and `people.json` beside it on a served canvas; `-state` overrides; `-max-active` and `-store-idle` bound watchers.
- Interactions: add `u` (release to automatic), `Delete`/`Backspace`, shift-click multi-select, New frame, Arrange, boards select, density, relationships.
- Known edges: rewrite from what is true now.

### README-git-ticket-canvas.md and README-release.md
Re-read against the same facts; fix drift only (module path, commands, flags, env vars). Keep their scope.

### docs/
Three read-only investigators audit every `.md` under `docs/` in parallel (design/pen/frame set; architecture/serving set; dev/test/release set), each classifying CURRENT, NEEDS-UPDATE with evidence, or HISTORICAL. Then: fix living docs that drift; add a one-line status header to historical docs that lack one; list every doc and its disposition in the ticket summary. A living doc that needs more than wording fixes gets its own draft ticket rather than growing this one.

### Verification
Every command, flag, path, and count written into a changed file is run or read at HEAD: both binaries' `-h`, `--version`, `just --list`, route table from `internal/api`, link targets. The ticket note names anything not run (browser-only checks, release publication).

## Notes

**agent:t3code/d30689a3** at 2026-09-15T22:14:51Z

Ordered behind TKT-01M2KHX3QNR779RE8M9MM36V9V (Generate the README screenshots from a re-runnable script) rather than blocked by it. The screenshots land in the README, so doing the prose pass first would mean editing the same sections twice and describing images that are not there yet.

**agent:claude/t3code-a6d0ff31** at 2026-09-19T07:02:25Z

What was run or read at 6e68d90 (the code is unchanged in the doc commit that follows) to back the changed files:

Run: `go build` of both commands, then `-h` on each and `--version` and `--version --json` on the desk one; `just --list`; `git tag`; `sha256sum` was not needed because the investigators reproduced the baseline checksums. Read: `internal/cli/cli.go` and `identity.go` for flags and defaults, `internal/api/server.go` and `registry.go` for every route, status code, and error code in the API table, `internal/api/live.go`, `events.go`, and `web/src/platform/tickets/live.ts` for the live-update timings, `internal/layout/*.go` and `.tickets/canvas/default.yml` for the board file shape, `internal/state/state.go` for the state directory per platform, `internal/api/merge.go` for the id scheme, `internal/config/config.go` for the configuration keys, `web/src/ui/App.tsx`, `Toolbar.tsx`, `Canvas.tsx`, `FramesPanel.tsx`, and `CardView.tsx` for the interactions table and frame behaviour, `web/src/main.ts` to confirm no pen bridge ships, `.goreleaser.yaml`, `Dockerfile`, `install.sh`, `vite.config.ts`, and the justfile. Every relative link in the three READMEs and the edited docs was checked to resolve, and every `.md` under docs/ is named in `docs/README.md`.

Not run: `just install`, `just readme-shots`, `just parity-check`, `just browser-test`, `install.sh`, the docker commands, the `curl` line, goreleaser, and the served canvas against a real identity provider. Those claims rest on reading the recipes and scripts, not on executing them. The investigators' reads happened under a guard that refused `go run`, so their flag claims came from the source and mine from the built binaries; the two agree.

Three audits were delegated read-only and their findings folded in: pen, frame, and organization docs (all historical, none contradicted by README); architecture and serving docs (`serving-a-canvas.md` current claim by claim, `version-display.md` fixed, superseded guides marked); development, test, and release docs (`development-preact.md` fixed, `browser-testing.md` and `canvas-baseline.md` counts fixed, `pr-reviews.md` vestigial line removed).

Left as records rather than edited, on purpose: the pen evidence docs that say the pen ticket is still in progress, `frames-v1-implementation.md` saying schema 2, `live-update-implementation.md` crediting `main.go`, and the cited line numbers in `multiuser-design-v1.md`. Each names its date or commit, and `docs/README.md` now says how to read them.

**agent:claude/t3code-a6d0ff31** at 2026-09-19T07:32:17Z

PR https://git.local.sothr.com/terva-sh/git-ticket-canvas/pulls/12. Terva review 24 (run 48dc9b49-b685-4e64-b30e-bbef0c96a5ef, profile code) reviewed head 0c3ad85ffcdc58bebb82da3ac1d735f7fdec6967 against base 55afe0a6b7e86079c3673c9fb9219d742de5c585 and raised one high finding: the known-edges bullet saying `git-ticket-canvas-server` is read-only contradicts the actor and mutation routes documented above it. Follow-up review 25 (comment 8468, from another agent session) had the model retract it: the served binary defaults to `-read-only`, `refuseWrite` answers 403, and nothing grants the reserved Writer role.

Disposition: accepted in part. The suggested fix, that a writer grant and configured actor enable served writes, is declined; no such grant exists. The kernel is real, though: `internal/cli/cli.go:139` makes read-only a default rather than a rule, nothing refuses `-read-only=false` on the served canvas, and with it off every reader writes. The README known edge and `docs/serving-a-canvas.md` now say that in so many words. Reviewed again at the head that carries this note.

**agent:claude/t3code-a6d0ff31** at 2026-09-19T07:34:09Z

Terva review 26 on head c7ba2267ae626f5c80b773bae2ec51c6697ebbf3 (base 55afe0a6b7e86079c3673c9fb9219d742de5c585) raised one medium finding: that `NAME=PATH` does not replace the hashed store id, so README.md:99 misleads. Declined. `internal/api/merge.go:49-51` keeps a written name as the id and hashes only a derived one, `internal/config/config.go:79-82` states the rule, and `config.go:317-320` sets Derived only when no name was supplied. The review had read the ticket plan's description of discovered-store ids as the rule for every store. A follow-up was posted on the PR with those lines; nothing in the README changed for this finding.

**agent:claude/t3code-a6d0ff31** at 2026-09-19T07:34:37Z

Follow-up review 27 retracted finding-1 of review 26 against merge.go:49-51; terva-follow-up/code is success on head c7ba2267ae626f5c80b773bae2ec51c6697ebbf3 while terva-review/code stays failure there, because a status names the head it reviewed and the retraction does not rewrite it. Both dispositions on this PR await maintainer acceptance.

## Summary

Landed as one documentation commit on `t3code/review-open-queued-work`, following the claim and plan commits.

`README.md` was rewritten around what ships: the fsnotify watcher and server-sent invalidations with their timings, a "Serve several stores" section covering `-store`, `-root`, `-R`, `-depth`, `-exclude`, `-config`, `GIT_TICKET_CANVAS_STORES`, `-scan`, the hashed store id in `#store=`, the picker and browser, favorites, and the state directory per platform, an architecture block naming all twelve `internal/` packages, an API table with the `/api/stores/{store}/` prefix and the store, rescan, favorites, session, version, actor, and people routes, a frames section, an interactions table with `u` and Delete, and a known-edges list that says `w` and `collapsed` are preserved but unset and that pens are validated and evaluated but not wired into placement, pointing at TKT-01M2441T0PTXRFK6VC4FM1PET7 (Route automatic tickets to label-matching canvas pens).

`README-git-ticket-canvas.md` and `README-release.md` lost their claims that the main README is superseded, that writes need `-actor`, and that `install.sh` waits on a first release. Under docs/, `development-preact.md`, `version-display.md`, `canvas-baseline.md`, `browser-testing.md`, `pr-reviews.md`, `serving-a-canvas.md`, and `preact-canvas.md` were corrected; `development.md`, `development-vite.md`, `platform-modules.md`, `preact-forms.md`, `multi-store-design-v1.md`, `multiuser-design-v1.md`, and `canvas-organization-design.md` gained a first-line status; and `docs/README.md` is new, listing every document as current or historical. The note on this ticket says what was run and what was only read.
