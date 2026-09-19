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
updated_at: 2026-09-19T06:52:12Z
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

## Notes

**agent:t3code/d30689a3** at 2026-09-15T22:14:51Z

Ordered behind TKT-01M2KHX3QNR779RE8M9MM36V9V (Generate the README screenshots from a re-runnable script) rather than blocked by it. The screenshots land in the README, so doing the prose pass first would mean editing the same sections twice and describing images that are not there yet.
