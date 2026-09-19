---
schema: 3
id: TKT-01M2KJ5STJFD39PWNFFYJCZP3B
title: Bring user and developer documentation up to what the canvas does
type: task
status: in-progress
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
claim:
  actor: agent:claude/t3code-a6d0ff31
  branch: t3code/review-open-queued-work
  worktree: /home/sothr/.t3/worktrees/git-ticket-canvas/t3code-a6d0ff31
  commit: 55afe0a6b7e86079c3673c9fb9219d742de5c585
  session: null
  claimed_at: 2026-09-19T06:52:12Z
  expires_at: null
archive: null
created_at: 2026-09-15T22:14:37Z
updated_at: 2026-09-19T06:56:03Z
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

- [ ] The README no longer describes the watcher as future work, and says what the canvas does when the store changes on disk.
- [ ] The known edges list matches the layout package: nothing claims z, w, frames, or pens are unimplemented.
- [ ] The architecture block names every package under internal/ and says what each is for.
- [ ] The API section documents the per-store route prefix and the store, favorites, rescan, and version endpoints, so a client written from it can address a store.
- [ ] Multi-store use is documented for a user: naming stores, discovery roots, the picker and browser, favorites, display names, and where state is kept.
- [ ] Every documented command, flag, path, and count in the files changed was run or read at the commit that lands them, and the ticket says which were not.
- [ ] Each document under docs/ is either confirmed current, updated, or explicitly recorded as historical, with none left unexamined.

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
