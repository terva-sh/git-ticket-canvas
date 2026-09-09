# git-ticket-canvas

An infinite canvas over a [git-ticket](https://github.com/terva-sh/git-ticket) store.
One Go binary serves the Preact frontend and HTTP API. The frontend uses
TypeScript and Vite; its built assets are committed in `web/dist` and embedded
in the binary. No Node process or database is required at runtime.

## Build and run

From a source checkout, build with Go using the committed frontend assets.
No JavaScript toolchain is needed for this build:

```sh
go build -o git-ticket-canvas .
./git-ticket-canvas -store /path/to/repo -read-only
```

Open http://127.0.0.1:7777. The repository must already contain a `.tickets`
store; initialize one with `git ticket init` if needed. To permit edits, remove
`-read-only` and set `-actor human:your-id`. The application writes ticket and
layout files but never commits or pushes them.

Flags include `-store`, `-addr`, `-actor`, and `-read-only`. Use `-h` for help,
`--version` for build provenance, or `--version --json` for machine-readable
output. Keep the server on loopback; it has no authentication.

With Go, Node.js 22.12 or newer, npm, and just installed, rebuild and install
from source:

```sh
just web-setup
just install
# Once git-ticket-canvas is on PATH:
git ticket-canvas -store /path/to/repo -read-only
```

`just install` rebuilds the frontend and installs into the first writable
`~/.local/bin` or `~/bin`. Use `just install /path/to/bin` for an explicit
destination. See [local installation](docs/local-install.md) for details.
Git discovers the executable as `git ticket-canvas`, not `git ticket canvas`.

See [release usage](README-release.md) for archive installation and container
serving, and the [release runbook](docs/releasing.md) for publication checks.

## Frontend development

```sh
just web-setup          # Install locked dependencies with npm ci.
just build              # Typecheck, build web/dist with Vite, then build Go.
just web-typecheck
just web-test           # Platform, component, and import-boundary tests.
```

For live frontend development, run these in separate terminals:

```sh
just api-dev -store /path/to/repo -read-only
just web-dev
```

Open http://127.0.0.1:5173. Vite serves the Preact source and proxies `/api` to
Go on port 7777. The Go port serves the last built `web/dist`, not Vite's source.
Set `GIT_TICKET_CANVAS_API_URL` to a loopback HTTP origin if the API uses another
port.

Commit frontend source, lockfile changes, and regenerated `web/dist` together.
Raw `go build` does not rebuild the frontend. Before release, `just parity-check`
verifies the committed bundle before any rebuild, runs frontend and Go checks,
tests embedded browser behavior, and builds a clean checkout without Node.
Browser checks require Playwright Chromium; install it with `just browser-setup`.
See [the parity gate](docs/development-preact.md#development-checks-and-the-release-gate)
for full validation prerequisites and
[the Preact migration](docs/preact-migration.md) for verification evidence.

## What this is for

A proof of concept for managing work spatially rather than in lanes, and a
probe into what the eventual git-ticket web interface should be. Everything
below is a position it takes, not a detail it happens to have.

## The one design question, and the answer

A canvas knows exactly one thing a ticket file does not: **where the card
sits.** Everything else here is a projection of the store.

Position is *authored* data, not derived data. Spatial memory is the whole
reason a canvas beats a list — "the thing I keep avoiding is bottom-left" is
real information — so an arrangement has to survive a cache rebuild the same
way a ticket survives one. That rules out keeping it only in an application
database.

It also rules out a binary database *in the repository*. git-ticket's format is
per-field mergeable text with a merge driver; a SQLite page would be the one
file in the store that two worktrees could not reconcile. Two people dragging
different cards is the ordinary case, not the exotic one.

So a board is text, one line per card, sorted by ticket ID:

```yaml
# .tickets/canvas/default.yml
schema: 1
board: default
cards:
  TKT-01M23FCNEN7TRTAXZCD9388946: {x: 0, y: -280}
  TKT-01M23FCZKB8XEHFF0YEMD36K3M: {x: 0, y: -40}
```

Verified, not asserted: one drag produces a one-line diff, and two branches
each moving a different card merge with no driver and no conflict.
`internal/layout/layout_test.go` holds that property down.

**The database still belongs in the design — for the other half.** Search
index, viewport and session state, presence, undo history, per-user overlays:
that is derived state, it wants real query support, and it should live in a
gitignored cache (`.tickets/canvas/cache.db`) rebuilt from disk on boot.
Nothing in this MVP needs it yet, so nothing here has it; the split is what
matters, and it holds when you add one.

A useful consequence: the board file contains geometry and nothing else, so a
repo can `.gitignore` `.tickets/canvas/` and lose only arrangement. Shared
boards and private boards are the same feature with a different gitignore.

### Pinned vs unpinned

A ticket filed from the CLI has no card. It gets an auto-placed position in
status lanes, drawn with a dashed border, and **that guess is never written**.
Dragging it is what pins it. Otherwise every `git-ticket create` would churn
the layout file and claim a placement nobody chose.

## Architecture

```
main.go              flags, embed, store discovery, actor resolution
internal/layout      the board file: read, write, canonical render
internal/api         JSON API over the ticket library + DTOs + op dispatch
web/src/main.ts      Preact entry point
web/src/ui           App, Canvas, inspector, composer, toolbar, feedback
web/src/platform     typed HTTP client, ticket state, write queues, geometry
web/dist             committed Vite output, served from go:embed
```

Preact owns the browser UI. `App` owns accepted store snapshots, selection,
and forms; `Canvas` owns viewport state, gestures, animation frames, and
pending layout previews. The platform modules contain no Preact or DOM imports.
See [component ownership and save policies](docs/preact-canvas.md).

The Go server uses the library directly (`ticket.Store`), not through shell
commands. Every ticket edit goes through the typed `Mutation` set under the
store lock with the same revision preconditions the CLI uses. The browser
accepts ticket changes only after the server confirms them. Card movement uses
local previews while layout saves are pending; failed saves do not become
accepted layout state.

### API

| | |
|---|---|
| `GET /api/board?board=` | tickets (all statuses), layout, vocabulary, readiness — one read |
| `GET /api/schema` | statuses, types, priorities, labels, milestones, permitted transitions, which transitions need a reason |
| `POST /api/tickets` | create; optional `card` places it in the same call |
| `PATCH /api/tickets/{id}` | `{ifRevision, ops:[…]}` |
| `DELETE /api/tickets/{id}` | `?ifRevision=&force=` |
| `PUT /api/layout` | `{board, cards:{id:{x,y}|null}}` |

Ops are named and closed — `setStatus`, `addDependency`, `setChecklistItem`,
`appendNote`, `claim`, `archive`, and so on — each mapping to exactly one
library mutation. There is deliberately no "replace the whole ticket" op, for
the same reason the library does not offer one: it would silently drop the
frontmatter keys a newer reader wrote, and the format's forward compatibility
rests on never doing that.

Two details worth keeping in whatever you build next:

- **Revisions chain through a batch.** The client's `ifRevision` gates the
  first op; each op afterwards carries the revision the previous one produced.
  Sending the client's revision to every op would refuse the second one every
  time; dropping the precondition after the first would let a batch stomp a
  concurrent write halfway through. Chaining is the only reading where "these
  edits apply to the ticket I was looking at" stays true for the whole batch.
- **`stale_revision` reloads rather than retries.** Somebody else wrote the
  ticket — the CLI, an agent, another tab. The edit did not happen, and showing
  it as though it had is how a canvas starts lying about a repository.

Error codes map straight onto HTTP: `stale_revision`/`claim_conflict` → 409,
`invalid_transition`/`invalid_field` → 422, `ticket_not_found` → 404. The
client never re-derives a rule the library owns; it asks `/api/schema` which
transitions need a reason and prompts for one.

## Interactions

| | |
|---|---|
| drag background | pan · scroll to zoom at cursor |
| drag card | move (multi-select moves together); pins it |
| drag right handle onto another card | that card now waits on this one |
| double-click empty canvas | file a draft there |
| click card | inspector: every field, AC/DoD, notes, comments, claim, archive |
| `/` `n` `f` `Esc` `Del` | filter · new · fit · close · delete |

Solid arrows are dependencies (gating), faint dashed lines are parent edges
(grouping) — different meanings, so an epic never looks like a blocker.

The canvas re-reads the store every ~12s and on tab focus, because a terminal
and an agent are editing the same files while it is open. That is a poll
because the server holds no state to push from; a file watcher is the obvious
next step and changes nothing on the client.

## Known edges

- The board payload sends every ticket with full body. Fine at a few hundred;
  the seam for splitting card-level fields from detail is the `/api/board` DTO.
- Polling, not watching (above).
- No authentication. Keep the server and any container port mapping on loopback.
- `z` and `w` are in the layout schema but nothing sets them yet.
- Cross-branch reads (`Filter.CrossBranch`) are not surfaced; the canvas shows
  the working tree.
