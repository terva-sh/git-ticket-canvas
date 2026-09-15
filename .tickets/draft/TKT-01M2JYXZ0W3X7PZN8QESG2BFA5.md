---
schema: 3
id: TKT-01M2JYXZ0W3X7PZN8QESG2BFA5
title: Show a store's directory name instead of its derived id
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
created_at: 2026-09-15T16:38:17Z
updated_at: 2026-09-15T16:38:28Z
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

Every row in the store browser prints its derived id. On the real workspace of
22 stores that is `git-local-sothr-com_Sothr-Containers_alpine`, 50 characters
at the longest and 38 on average, against a cap of 64 in `config.MaxNameLen`.

The browser already groups those rows under a heading built from the root and
the leading path, and each row prints its own path below the name. So the same
prefix is on screen three times per row, and the part that differs, `alpine`,
sits at the right-hand end of the widest column. The id is not too long. It is
repeating what the heading beside it already said.

This is follow-on work from TKT-01M2HPB9W (Serve many ticket stores from one
canvas), which shipped the browser this affects.

### What to change

Give every store a display name and use it wherever a store is named to a
person: the browser row and the toolbar picker. Default it to the name of the
directory that holds the store, so `/ws/org/alpine/.tickets` displays as
`alpine`.

The id does not change. It stays what the URL fragment, the API path, and the
row's `data-store` attribute carry, because that is what has to be unique and
has to survive being bookmarked.

Rules, in the order they apply:

- A store somebody named on the command line or in a configuration file
  displays that name. Naming it is the instruction, which is the rule `Merge`
  already follows when it assigns ids.
- A declared child displays the name its parent gave it in `canvas.children`.
- Everything else derives it: strip a trailing `.tickets` and take the base of
  what is left. Deriving from the path rather than from the id is what makes
  this work for a store whose path was never normalized.
- An unavailable store gets one too. Its path was never resolved through
  `discover.Nearest`, so the derivation has to run on the path as configured.
- Display names are allowed to collide. Two directories called `docs` under
  different parents both display `docs`, and that is correct, because the row
  prints its path and the heading names its group. Do not add a suffix to
  separate them. Separating them is what the id is for.

### Where it is computed

On the server, reported as a new `display` field on `StoreStatus`, filled from
a new field on `StoreSpec` beside `derivedName` in `internal/api/merge.go`.

The alternative was deriving it in the frontend from `path`, which needs no API
change at all. Rejected because the first rule above lives in the configuration
the frontend never sees, so the frontend would have to re-implement "an
explicit name wins" and would still get the unavailable case wrong. One rule,
one place, and `--scan` and the startup log can use it later.

### Rejected: hashing the id instead

The other way to shorten a row is to replace the derived id with a short hash,
which would also keep the workspace path out of the URL. Rejected on
measurement:

- It does not bound anything new. `config.MaxNameLen` is already 64 and the
  real workspace tops out at 50.
- It does not hide the path. `StoreStatus` ships `path`, every browser row
  renders it, the toolbar shows it, and startup logs it. A hash hides the path
  from the URL and from nowhere else.
- It costs the case that needs the id most. This workspace holds `git-ticket`
  and `git-ticket-canvas` on both `git.local.sothr.com` and `github.com`, and
  one of each pair is a mirror. Today the address says which one you are about
  to write a ticket into. Two hex strings would not.
- It buys no stability. A hash and a slug are both derived from the path, so
  both change when a repository moves.

Keeping the URL id opaque is a real but separate question, because a URL can be
read without its page: pasted into a public issue, a bookmark, or synced
browser history, `#store=git-local-sothr-com_Sothr-Containers_alpine` names an
internal forge and an organisation. That trades diagnosability for privacy, it
belongs behind an opt-in flag rather than in the default, and it is not filed.

### What it touches

`StoreSpec` and `StoreStatus` in `internal/api/registry.go`, the derivation in
`internal/api/merge.go`, `StoreBrowser.tsx` and `StorePicker.tsx`, and the
`#storePickerLabel` assertions in `web/src/ui/store-browser.test.tsx` and
`tests/browser/stores.spec.ts`. `data-store` keeps the id, so the row selectors
in the browser suite do not move.

## Acceptance criteria

- [ ] A discovered store displays the name of the directory holding its .tickets, in the browser row and in the toolbar picker
- [ ] A store named on the command line or in a configuration file displays that name
- [ ] A declared child displays the name its parent gave it in canvas.children
- [ ] An unavailable store displays a name derived from its configured path
- [ ] Two stores whose directories share a name both display that name, with no suffix, and keep distinct ids
- [ ] The id is unchanged: the URL fragment, the API route, and data-store still carry it
- [ ] Checked against the real 22-store workspace, not only fixtures

## Definition of done

- [ ] just check passes
- [ ] just browser-test-embedded passes against a freshly built bundle
