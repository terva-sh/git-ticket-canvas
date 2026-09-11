---
schema: 3
id: TKT-01M23XM50095XTS2XYSX2BQJ97
title: Upgrade GitHub Actions to Node.js 24 runtimes
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
  - ref: workflow:github-ci
    path: .github/workflows/ci.yml
  - ref: workflow:github-release
    path: .github/workflows/release.yml
  - ref: test:release-config
    path: release_config_test.go
claim: null
archive: null
created_at: 2026-09-09T20:26:51Z
updated_at: 2026-09-09T20:29:11Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Clear the Node.js 20 deprecation warning observed on the GitHub Windows CI run before publication. Upgrade JavaScript actions in both GitHub workflows to verified current Node.js 24 releases, preserve release gates, and leave Forgejo mirror actions unchanged.

## Acceptance criteria

- [x] Both GitHub workflows use verified Node.js 24 action versions.
- [x] Workflow lint and Go configuration tests pass without changing publication gates.

## Implementation plan

Upstream latest releases and action.yml declare node24: checkout v7.0.1, setup-go v7.0.0, setup-node v7.0.0, goreleaser-action v7.2.3 and docker/login-action v4.6.0. Upgrade GitHub workflow major references to v7/v4 accordingly, leaving application Node 22, GoReleaser v2 and all publication guards unchanged. Add a configuration regression test for the reviewed action majors. Run actionlint and Go tests. Do not push or publish; hosted rerun requires an approved push.

## Notes

**agent:terva/mieli** at 2026-09-09T20:27:03Z

Operator guidance: if Windows builds become a problem, consider dropping Windows support rather than allowing it to hold up publication indefinitely. This is a decision to revisit with concrete failure evidence, not authorization to remove the target or bypass its release gate now. The first hosted Windows run on 7ebdaf3 passed build, vet and tests; the Node.js 20 action warning was non-blocking.

## Summary

Updated both GitHub workflows to checkout/setup-go/setup-node/goreleaser-action v7 and docker/login-action v4. Verified each major ref's upstream action.yml declares node24. Added an offline action-version regression test. go test ./..., actionlint v1.7.7 and git diff --check passed. Application Node 22, GoReleaser v2, Forgejo workflows and publication gates remain unchanged. Hosted warning removal still needs an approved push and CI rerun. Recorded Windows support guidance and earlier hosted CI evidence in the first-release ticket.
