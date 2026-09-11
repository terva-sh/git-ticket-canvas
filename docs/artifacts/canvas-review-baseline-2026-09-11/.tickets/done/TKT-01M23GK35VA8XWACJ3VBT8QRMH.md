---
schema: 3
id: TKT-01M23GK35VA8XWACJ3VBT8QRMH
title: Automate the MVP HTTP smoke checks
type: task
status: done
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
references:
  - ref: validation:mvp
    path: docs/mvp-validation.md
  - ref: test:api
    path: internal/api/server_test.go
claim: null
archive: null
created_at: 2026-09-09T16:39:05Z
updated_at: 2026-09-09T16:43:27Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Turn the HTTP checks recorded in docs/mvp-validation.md into Go API regression tests using isolated temporary ticket stores. Cover reads, validation, creation with placement, chained revisions, stale writes, persistence, read-only enforcement, and deletion cleanup. Process signal handling and real browser interactions are outside the API test scope.

## Acceptance criteria

- [x] API tests cover the recorded HTTP smoke cases with isolated stores and explicit test actors.
- [x] Read-only and stale-revision tests verify that refused writes leave stored data unchanged.
- [x] The full Go test suite passes under the race detector and API coverage is recorded.

## Implementation plan

Add internal/api/server_test.go with ticket.Init in t.TempDir, explicit actors, httptest servers, and typed JSON assertions. Separate read/asset, validation, ticket lifecycle/persistence, and read-only tests. Reopen the store to verify disk persistence; compare board state after rejected writes. Run go test -race -cover ./..., repeated API tests, and go vet. Preserve the original validation report and record new results in this ticket.

## Summary

Added internal/api/server_test.go with four tests and isolated temporary stores. Covers real asset serving, empty board and schema, request validation, create with placement, chained patches, stale patch/delete refusal without data changes, persistence after store/server reopen, deletion cleanup and store integrity, and all four read-only write routes. go test -race -cover ./... passes with API coverage 65.1% and layout coverage 74.5%; go test -race -count=10 ./internal/api, go vet ./..., and strict ticket-store validation also pass. No application code changed. Original validation report remains unchanged. Binary embedding, process shutdown, and browser interactions remain outside this API suite.
