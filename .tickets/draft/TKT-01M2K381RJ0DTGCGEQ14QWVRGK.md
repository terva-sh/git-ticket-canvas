---
schema: 3
id: TKT-01M2K381RJ0DTGCGEQ14QWVRGK
title: Read tickets across branches behind an off-by-default flag
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
created_at: 2026-09-15T17:53:42Z
updated_at: 2026-09-15T17:53:42Z
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

The canvas reads `ticket.Filter{All: true}` at `internal/api/server.go:705` and
`internal/api/frames.go:31`. That is the working tree and nothing else, so a
canvas over a repository where work happens on branches shows the tickets on
the checked-out branch and silently omits the rest. Nothing on the page says a
ticket is missing, which is the part that makes it worth fixing: a board that
is quietly partial reads exactly like a board that is complete.

v0.18.1 adds `Filter.CrossBranch` and `ReadyOptions.CrossBranch`, which widen a
read to the recent local and remote-tracking refs and merge the answers, with
the existing filters applied to the merged result.

### What to change

Thread the option through to both read sites, controlled by a flag that is off
by default.

Off by default is the whole design, not caution. The library's own note says
the caller is the one who knows which question they are asking, and "what is in
my tree" is a legitimate thing to want rather than a degraded version of the
other. A canvas that silently answered the wider question would be a different
tool than the one somebody opened.

### Measure before choosing a default

The cost is unknown and has to be known before this goes anywhere near a
default:

- `crossBranchView` reads refs, and the canvas re-reads a board on every
  filesystem event rather than on a timer.
- The real `git-ticket` store holds 134 tickets, and a canvas over the
  workspace serves 22 stores.

Measure a board read with the option on and off, on that store, and record both
numbers in this ticket. If the wide read is expensive enough to be felt on a
keystroke, that is an argument for reading it once per change rather than per
request, and that belongs in this ticket rather than in a later surprise.

### Open question for whoever takes this

Whether the switch is a process flag, a per-store setting, or something a
person toggles in the browser. A process flag is the smallest thing that works
and is the right place to start. A per-store setting is plausible, because a
workspace holds both repositories where branches carry work and repositories
where they do not. Do not build the browser toggle first: it is the most work
and the easiest to add later.

## Acceptance criteria

- [ ] Filter.CrossBranch is threaded to both board read sites
- [ ] The option is off by default and a canvas started without the flag reads exactly what it reads today
- [ ] With the flag on, a board shows a ticket that exists only on another branch
- [ ] A board read is timed with the option on and off against the real 134-ticket store, and both numbers are in the ticket
- [ ] The cost of a wide read on every filesystem event is measured, and the caching decision it implies is recorded
