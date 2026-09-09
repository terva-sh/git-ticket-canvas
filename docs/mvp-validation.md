# MVP baseline validation

Validated on 2026-09-09 against commit `e542552`, after ticket-store initialization in `d064d8c`. No application code changed during validation.

## Environment and repeatable checks

The validation host ran Linux, Go 1.26.2, and Node.js 22.23.2. `go.mod` declares Go 1.25.0; this pass did not test that minimum version.

These checks passed:

```sh
go test -race -cover ./...
go vet ./...
go build -o /tmp/tkcanvas-mvp .
node --check web/app.js
git ticket check --fix --dry-run --strict
gofmt -l main.go internal/api/*.go internal/layout/*.go
```

`gofmt` reported no files. The existing layout tests covered 74.5% of statements. The root package and `internal/api` each reported 0.0% coverage because they have no automated tests.

## Live HTTP smoke checks

A one-off Python standard-library client launched the built binary on an ephemeral loopback port against a temporary Git repository with a copy of the initialized `.tickets` store. Writes used the explicit actor `agent:terva/mvp-smoke`. The temporary repository was removed after the checks; the repository's own store received no test tickets.

The following assertions passed:

- The server served `/` and `/app.js`, returned an empty board, and served `/api/schema`.
- Creation rejected a blank title with 422 and an unknown request field with 400.
- Creation returned a ticket and its requested card position with 201.
- A two-operation patch changed title and priority using a chained revision.
- A patch using the old revision returned 409 with `stale_revision`.
- A layout update persisted negative and fractional coordinates.
- A board path containing `../` returned 400.
- Ticket edits and card placement survived a server restart.
- Read-only mode reported itself in the board response and refused POST, PATCH, DELETE, and layout PUT with 403 and `read_only`.
- Deletion using an old revision returned 409.
- Forced deletion using the current revision removed both the ticket and its default-board placement.
- The temporary store passed the strict integrity check after deletion.
- Each server exited successfully on SIGTERM.

These HTTP assertions are session evidence, not a committed regression suite. They exercised the server but did not execute the browser application.

## Gaps to address before calling this a full project

- Add automated API and startup tests. Preserve the HTTP cases above as regression tests rather than relying on this one-off pass.
- Exercise the browser in an actual browser. Dragging, zoom, multi-selection, dependency handles, inspector edits, keyboard shortcuts, polling, and stale-revision feedback remain unverified.
- Test concurrent writers, failures partway through a patch batch, and ticket creation when layout persistence fails. A chained revision does not make a multi-operation patch atomic.
- Test merge behavior in Git. The current layout tests verify sorted output and a one-line change per drag, but do not perform the two-branch merge claimed in the README.
- Establish CI and test the declared minimum Go version.
- Review network exposure before deployment beyond loopback. The MVP has no authentication; this pass was not a security review.

No full-project backlog tickets have been filed. This report records the baseline for that planning discussion, not a production-readiness verdict.
