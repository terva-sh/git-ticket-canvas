# Organizing a board that nobody has organized

Adopted on 2026-09-19 as the contract for pens: matching, resolution order,
lanes for a board with no pens, and CLI authoring before browser authoring. It
supersedes `pen-specification-v1.md` on those points and nothing else. The
decision and its reasons are on TKT-01M2441T0PTXRFK6VC4FM1PET7 and
TKT-01M26SQB4JWTW8FPSVHYZKFKCR.

Open a canvas on a ticket store that has never been arranged and you get every
card at once, in status lanes, sorted by ticket ID. Seventy-nine cards on the
ledger store, in a grid, where adjacency means nothing: the tickets either side
of one you care about are its ID neighbours and nothing else.

That is not a bug. There is no layout to show. `autoPlace`
(`web/src/platform/canvas/geometry.ts:144`) sorts by ID, buckets by status, and
wraps every `LANE_CAP` rows, which is the most honest thing a function can do
when it has been given no information about what belongs with what. The store
has no `canvas/` directory at all, so nothing else was available.

The interesting part is what is already built and unused. Measured against the
tree at `043c901`:

| Piece | Defined at | Consumed by |
|---|---|---|
| `Pen` — label conjunction, region, colour, pin | `internal/layout/pens.go:26` | nothing |
| `Routing` — pens, `ruleOrder`, `inbox` | `internal/layout/pens.go:38` | parsed, validated, reconciled into state, then dropped |
| `Card.Collapsed` | `internal/layout/layout.go:50` | nothing |
| `Frame.Members` — explicit membership | `internal/layout/frames.go:21` | drawn, and the one that does work |
| `.card.done`, `.card.archived` | `web/index.html:226` | neutral border, and a rule that restores the title colour |
| `density: 'full' \| 'compact'` | `geometry.ts:37,40` | a manual toolbar dropdown, global |

Three records are fully modelled, round-tripped through YAML and JSON, validated
on the way in, reconciled into frontend state — and then nothing reads them. The
pen record in particular is a complete, careful mechanism for saying *where a
class of ticket belongs*, sitting one function call away from the placement path
that currently sorts by ID.

And there is no way for an agent to write any of it. `git ticket` has thirty-odd
commands and not one touches the canvas. The only writer is the web app's
`PUT /layout`, which means organizing a board requires a running desk canvas and
a browser — and a served canvas is read-only, so the API is unavailable exactly
where several people are reading.

This document is about closing that, and about what a board should look like
once it is closed.

## What this does not do

It does not make the canvas decide what matters. Every rule in here is one a
person or an agent wrote down and can read back. Nothing infers importance from
activity, recency, or how often a card was clicked.

It does not add a database. Layout stays a file in the ticket store, committed,
one line per card, sorted by ID, so that a drag is a one-line diff and a
reorganization is reviewable in a pull request. That property is worth more than
anything a richer store would buy.

It does not change what a ticket is. No new ticket fields, no canvas-only
metadata on tickets. A board is a view; if organizing one requires editing
tickets, the organization has leaked into the ledger.

## Coordinates are the wrong interface for an agent

The board stores positions. For a human dragging a card, a position is exactly
right: it is direct, it is reversible, and the hand already knows where it means.

For an agent it is the worst available interface. Three reasons, in increasing
order of how much they cost:

**Positions collide.** An agent placing forty cards must implement packing,
measure card heights it cannot see, and avoid frames it must read first. Every
agent reimplements the same arithmetic, badly, and the failure mode is silent
overlap.

**Positions do not survive.** A ticket filed tomorrow has no position, so it
lands wherever `autoPlace` puts it — which is to say, somewhere unrelated to the
work it belongs to. Organization decays from the moment it is written, and the
only repair is to run the whole arrangement again.

**Positions have lost the intent.** "Group the Authentik work together" compiled
down to twelve coordinate pairs cannot be re-applied, cannot be checked, and
cannot be understood by the next reader. The one thing worth keeping — the
reason those cards are together — is exactly what the coordinates discarded.

So: **agents author rules, humans drag cards.** A rule keeps working as tickets
are filed, states what it means in the words the ticket store already uses, and
is reviewable as text. A dragged card overrides the rule for that card, because
a person who moved something meant it.

This is a smaller change than it sounds, because the seam already exists.
`CardView` (`web/src/ui/canvas/CardView.tsx:47`) already distinguishes **pinned**
— a card with a saved position — from **unpinned**, and `isPinned`
(`geometry.ts:182`) is the predicate. Today unpinned means "autoPlace decides".
Under this design unpinned means "the rules decide". The core model does not
move; one function is replaced.

## Where the layout schema belongs

Choosing `git ticket canvas` as the agent's surface forces a question the
canvas repository has been able to avoid: who owns the format of
`.tickets/canvas/default.yml`?

Today the canvas owns it, in `internal/layout`, and writes it inside a directory
belonging to another tool. `git ticket` validates every other file under
`.tickets/`, and `git ticket check` cannot see this one. A layout file with a
bad `ruleOrder` is caught when somebody opens a browser.

The layout file lives in the ticket store. The ticket store's format is
`git ticket`'s to define — that is what the rest of `.tickets/` already is. So
`internal/layout` moves to `git-ticket` as an importable package, and the canvas
imports it rather than defining it.

Three things fall out for free, and they are the reason this is worth a
cross-repo move rather than a shim:

- `git ticket canvas` subcommands can exist at all. They cannot otherwise:
  `git-ticket-canvas` already imports `github.com/terva-sh/git-ticket/ticket`,
  so the dependency cannot run the other way.
- `git ticket check` learns to validate layouts, in the same pass that validates
  everything else, with the same `--fix` behaviour.
- The merge driver that already resolves ticket files mid-merge can learn the
  layout file, whose one-line-per-card form is close to ideal for it.

The cost is a breaking move across two repositories, and it should be done first
and on its own, before anything depends on it.

### Why not put the commands in the canvas binary

`git-ticket-canvas layout pen add …` would work, needs no move, and keeps one
repository. It was rejected because it puts the validator in the tool that is
least likely to be installed: an agent working a ticket store has `git ticket`,
and may well not have the canvas. A format whose only validator ships with the
optional viewer is a format that is checked late, and checked late means checked
after it is committed.

## The command surface

Small, and shaped so that an agent never computes a coordinate.

```
git ticket canvas pens                        list the rules, in resolution order
git ticket canvas pen add ID --title T \
    --label L... --status S --type T \
    --parent ID --at X,Y --size W,H --color C
git ticket canvas pen rm ID
git ticket canvas pen order ID... reorder the ties

git ticket canvas place ID --at X,Y            pin one card, overriding the rules
git ticket canvas release ID...                return cards to the rules
git ticket canvas frame add --title T --member ID...
git ticket canvas inbox --at X,Y               where unmatched cards land

git ticket canvas show [--board B]             what the rules are and what they catch
git ticket canvas explain ID                   why this card is where it is
```

`explain` is not a convenience. A declarative placement system whose decisions
cannot be interrogated is one nobody will trust with a board they care about,
and an agent that cannot ask why a card moved cannot correct a rule it wrote.
It answers with the matching pen, the rules it beat, and whether a pin is
overriding all of them.

Note what is absent: no command computes a layout. `place` writes a coordinate
the caller chose; everything else writes rules. This keeps exactly one
implementation of placement in the tree, which matters because the alternative —
the CLI packing cards in Go while the canvas packs them in TypeScript — is two
implementations that must agree forever and will not.

## Pens, finished

The record exists. What it needs is a consumer and a slightly wider predicate.

**Matching.** `requiredLabels` is a conjunction of labels, which is the right
shape and too narrow a vocabulary. A board wants to say "everything blocked",
"this epic's children", "the spikes", and none of those is a label. Schema 4
replaces `requiredLabels` with a `match` record:

```yaml
pens:
  authentik:
    title: "Authentik"
    match: {labels: ["authentik"], status: [draft, ready, in-progress, blocked, review]}
    x: 0
    y: 0
    w: 1200
    h: 900
    color: "#5b9bf0"
```

Every field in `match` is optional, and an absent field matches everything. A
present field is a conjunction with the others, and a list within a field is a
disjunction — `status: [ready, blocked]` means either. `parent` matching an
epic's ID is how "this epic's children" is said, and is expected to be the most
used predicate of the lot.

Schema 3's `requiredLabels` keeps working and reads as `match.labels`, because a
board written last week must still open.

**Resolution**, in order, and this order is the whole contract:

1. A pinned card — one with a saved position — stays where it is. Explicit beats
   implicit, always.
2. Otherwise, the first pen in `ruleOrder` whose `match` the ticket satisfies.
   `ruleOrder` already exists and already requires every pen exactly once
   (`web/src/platform/tickets/layout.ts:48`), so ties are decided by a list
   somebody wrote rather than by map iteration.
3. Otherwise, the `inbox` point.

Within a pen, cards are packed into its region in a stable order — status, then
priority, then ID — so that filing a ticket inserts rather than reshuffles.

**The inbox is the important one.** A card that matches nothing must land
somewhere obvious and must look unhoused, because an unmatched card is a
question for whoever wrote the rules: either the ticket is mislabelled or the
board has a gap. Today's equivalent is silence.

**Overflow.** A pen whose cards do not fit its region grows downward and says so
in `explain`, rather than clipping or overlapping a neighbour. A board that
silently hides a card is worse than one that is ugly for a week.

## Salience: encoding attention, not just status

The card already encodes status on its left border, acceptance-criteria
progress, blocked-or-startable, priority, and labels. That is a lot of
information and very little hierarchy: a done ticket from March and a startable
ticket blocking three others have the same visual weight. `.card.done` currently
makes this literal — it neutralises the border and then has a second rule
restoring the title colour, so a finished card is, if anything, *more* legible
than a live one.

The reordering principle: **weight follows actionability, not lifecycle.**

**Done and archived recede.** Reduced opacity, desaturated, and collapsed to a
title chip below a zoom threshold. They are not hidden — the history is why the
board is trustworthy — but they stop competing. This is the inversion of
`web/index.html:227`, and it is the change you can see from across the room.

**Blocked reads as inert.** A blocked card is not actionable and should not look
like one. Muted, with the blocking count promoted, because the useful question
about a blocked card is what it is waiting for.

**Startable is the loud one.** `CardView` already computes it
(`CardView.tsx:55`) and renders it as the word "Startable" in body text. It is
the single most useful fact on the board — it is what `git ticket ready`
answers — and it deserves the strongest treatment on the card, not a line of
prose.

**Claimed shows who.** On a canvas served to several people, a card somebody
else is working is a different thing from an unclaimed one, and nothing on the
card says so today.

**Density follows zoom.** `density` is currently a global manual dropdown with
two settings. Zoomed out far enough to see structure, a 280px card is rendering
text nobody can read; the useful signal at that range is colour, shape, and
cluster. Make density a function of zoom — full, compact, then chip — with the
manual control kept as an override. `Card.Collapsed` is already in the model and
unused, and is the per-card version of the same idea.

None of this is stored. Salience is computed from the ticket and the view, so
there is no new record, nothing to migrate, and no way for a board to disagree
with the tickets it is showing.

## What this looks like on the ledger store

Concretely, the board from the screenshot. Seventy-nine tickets, no layout.

```sh
git ticket canvas pen add done    --title "Done"        --status done,archived --at 0,2400    --size 2400,1200
git ticket canvas pen add authentik --title "Authentik" --label authentik     --at 0,0       --size 1200,900
git ticket canvas pen add forge   --title "Forges and mirrors" --label forge  --at 1300,0    --size 1200,900
git ticket canvas pen add infra   --title "Infrastructure"     --label infrastructure --at 0,1000 --size 2400,1300
git ticket canvas pen order done authentik forge infra
git ticket canvas inbox --at -1400,0
```

Six commands, no coordinates computed, and the result survives the next twenty
tickets: anything labelled `authentik` files itself into the Authentik region,
anything finished sinks into a faded block at the bottom, and anything matching
nothing lands in the inbox to the left where it is visibly asking a question.

`git ticket canvas explain TKT-01M2HEB5` then answers: matched `done`, beating
`authentik`, unpinned.

## The seams

- **`layout` package, moved to `git-ticket`.** Format, validation, and
  resolution in one place. The canvas imports it; so does the CLI; so does
  `check`.
- **Placement is one function.** `resolve(tickets, board) → positions`, pure,
  with pins winning and the inbox catching. `autoPlace` becomes its fallback for
  a board with no pens, so an unorganized store behaves exactly as it does now.
- **Salience is one function.** `salience(ticket, view) → weight`, computed, with
  the CSS reading only its output.

## Phases

1. **Move `internal/layout` into `git-ticket`.** No behaviour change. Breaking,
   cross-repo, and done alone so that a bisect can find it.
2. **`git ticket canvas` read commands**: `show`, `pens`, `explain`. Read-only,
   so the schema and the resolution order get exercised and argued about before
   anything writes.
3. **Resolution.** Wire pens into placement, replacing `autoPlace` for unpinned
   cards on a board that has pens. `explain` becomes truthful here.
4. **`git ticket canvas` write commands**, and `git ticket check` validating
   layouts.
5. **Salience.** The styling inversion, claimed-by, and zoom-driven density.

Phase 5 is independently useful and could go first if the board needs to look
better before it needs to be organized. Phases 1 through 4 are a chain.

## Risks

**The cross-repo move is the expensive one.** It touches two repositories, and
until it lands nothing else in this document can start. If it proves worse than
it looks, the fallback is `git-ticket-canvas layout …` subcommands with the
schema staying put, at the cost described above.

**Rules move cards silently.** Relabelling a ticket will move it, which is the
point, but it means a label edit has a layout consequence nobody asked for.
`explain` is the mitigation and it is a weak one; watch for whether people start
pinning cards purely to stop them moving, which would be the signal that the
rules are too eager.

**Two placement implementations.** The single largest way this goes wrong is the
CLI learning to compute positions. It must not. If a command ever needs to know
where a card will land, it should ask the resolver, not reimplement it.

**Salience is taste.** Everything in that section is a judgement about what
matters, and judgements about visual weight are wrong in public. It should ship
behind nothing — no flag, no setting — and be changed when it is wrong, because
a preference toggle for this would fossilise the first guess.
