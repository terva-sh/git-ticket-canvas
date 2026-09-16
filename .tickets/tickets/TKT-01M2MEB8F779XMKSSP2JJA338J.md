---
schema: 3
id: TKT-01M2MEB8F779XMKSSP2JJA338J
title: Split the desk canvas and the served canvas into two commands
type: task
status: ready
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
claim: null
archive: null
created_at: 2026-09-16T06:26:56Z
updated_at: 2026-09-16T06:34:29Z
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

- [ ] Two commands build, and the release ships both
- [ ] The desk tool refuses a non-loopback -addr with an error naming the server command
- [ ] The desk tool's defaults, flags, and behaviour are otherwise unchanged
- [ ] The server command refuses to start without an identity provider configured
- [ ] The server command defaults to read-only
