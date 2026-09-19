---
schema: 3
id: TKT-01M2W22SBF554JHKVPMDWPFTY4
title: Install targeted Terva PR reviews
type: task
status: in-progress
status_reason: null
priority: normal
due_on: null
labels:
  - ci
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim:
  actor: agent:codex/installation-20260919
  branch: ci/terva-review
  worktree: /tmp/terva-consumer-install-u7v015yl/git-ticket-canvas
  commit: e59bdca7d9317b7018a49683483e288108c72c84
  session: null
  claimed_at: 2026-09-19T05:26:31Z
  expires_at: null
archive: null
created_at: 2026-09-19T05:26:31Z
updated_at: 2026-09-19T05:27:45Z
created_by:
  id: agent:codex/installation-20260919
  name: ""
updated_by:
  id: agent:codex/installation-20260919
  name: ""
extensions: {}
---

## Description

Install the pinned Terva review action as the first external consumer, coordinated with terva-action-code-review TKT-01M2VQAH5 — Package the action and document installation. Keep reviews advisory and targeted.

## Acceptance criteria

- [ ] Add trusted pinned workflow and operator guidance without changing existing CI.
- [ ] Verify real manual review and published feedback on the installation PR.

## Implementation plan

Add a separate terva-review workflow using the existing docker runner and organization BOT_TOKEN/CPA_API_KEY references. Checkout only merged immutable reviewer c8730fe into an isolated directory and install checksum-pinned Terva; never checkout/execute consumer PR code in the credentialed job. Keep manual/created-comment triggers, per-PR serialization, code profile, gpt-5.6-sol/low and maintained clean-summary publication. Existing parity/release jobs remain unchanged. Add operator/agent guidance, open the installation PR and manually dispatch the inspected branch to validate actual cross-repository installation and feedback. Comment events activate after merge; do not merge or change settings/secrets in this task.

## Notes

**agent:codex/installation-20260919** at 2026-09-19T05:27:45Z

Installation PR 11 is open. Dispatched inspected branch ci/terva-review for request install-review, head a33ae5a and base e59bdca, using merged reviewer c8730fe, Terva 0.137.0, code profile and CPA gpt-5.6-sol/low. The API confirms native review run 82 (https://git.local.sothr.com/terva-sh/git-ticket-canvas/actions/runs/82) despite tea returning its known empty-JSON dispatch error. Existing parity CI is independently running as run 81. Repository-local secret metadata is empty, but organization BOT_TOKEN/CPA_API_KEY names exist and sothr-bot has owner access; actual inheritance/authentication remains to be verified by this run. No secret values were read and no settings were changed.
