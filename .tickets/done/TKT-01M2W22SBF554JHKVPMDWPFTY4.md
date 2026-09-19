---
schema: 3
id: TKT-01M2W22SBF554JHKVPMDWPFTY4
title: Install targeted Terva PR reviews
type: task
status: done
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
claim: null
archive: null
created_at: 2026-09-19T05:26:31Z
updated_at: 2026-09-19T05:56:34Z
created_by:
  id: agent:codex/installation-20260919
  name: ""
updated_by:
  id: agent:codex/dispositions-20260919
  name: ""
extensions: {}
---

## Description

Install the pinned Terva review action as the first external consumer, coordinated with terva-action-code-review TKT-01M2VQAH5 — Package the action and document installation. Keep reviews advisory and targeted.

## Acceptance criteria

- [x] Add trusted pinned workflow and operator guidance without changing existing CI.
- [x] Verify real manual review and published feedback on the installation PR.

## Implementation plan

Add a separate terva-review workflow using the existing docker runner and organization BOT_TOKEN/CPA_API_KEY references. Checkout only merged immutable reviewer c8730fe into an isolated directory and install checksum-pinned Terva; never checkout/execute consumer PR code in the credentialed job. Keep manual/created-comment triggers, per-PR serialization, code profile, gpt-5.6-sol/low and maintained clean-summary publication. Existing parity/release jobs remain unchanged. Add operator/agent guidance, open the installation PR and manually dispatch the inspected branch to validate actual cross-repository installation and feedback. Comment events activate after merge; do not merge or change settings/secrets in this task.

## Notes

**agent:codex/installation-20260919** at 2026-09-19T05:27:45Z

Installation PR 11 is open. Dispatched inspected branch ci/terva-review for request install-review, head a33ae5a and base e59bdca, using merged reviewer c8730fe, Terva 0.137.0, code profile and CPA gpt-5.6-sol/low. The API confirms native review run 82 (https://git.local.sothr.com/terva-sh/git-ticket-canvas/actions/runs/82) despite tea returning its known empty-JSON dispatch error. Existing parity CI is independently running as run 81. Repository-local secret metadata is empty, but organization BOT_TOKEN/CPA_API_KEY names exist and sothr-bot has owner access; actual inheritance/authentication remains to be verified by this run. No secret values were read and no settings were changed.

**agent:codex/installation-20260919** at 2026-09-19T05:29:37Z

First external review completed in run 82 and published review 18: https://git.local.sothr.com/terva-sh/git-ticket-canvas/pulls/11#issuecomment-8425. This proves cross-repository private checkout, inherited org secrets, runtime installation and real CPA inference/publication work. The findings gate failed as intended for two reported findings, not for setup.

Accepted the high checkout-helper pinning finding: replaced mutable @v6 with its verified full v6.1.0 commit d23441a48e516b6c34aea4fa41551a30e30af803. Inspected its action metadata (node24, token/repository/path inputs, dist entrypoint) and upstream package identity; it is the same revision the v6 ref currently names, not an untested version upgrade. Kept system package/image provisioning explicit rather than claiming a hermetic runtime.

Declined the claimed comment-ID collision. The pinned reviewer's src/run.mjs builds command keys from repository/revisions plus canonical comment ID/body digest, and ignores workflow request-id for command identity. src/comments.mjs validates commands and canonical authors; test/runner.test.mjs verifies duplicate delivery and ignored workflow overrides. Clarified the workflow comment; no runtime change is warranted. The action reviews a bounded diff and cannot inspect the external action implementation, explaining the missing context. Dispatch a new ready review after the substantive pin correction; do not weaken the gate.

**agent:codex/installation-20260919** at 2026-09-19T05:31:58Z

Run 83 completed review 19 on head 07dca89 and raised one medium queue-exhaustion concern. Accepted: the action blocked unauthorized inference/publication but matching public comments could still cause dependency/checkout setup. Added an explicit pilot commenter allowlist before job provisioning, initially warricksothr after verifying live owner permission. Unlisted comment events also resolve to a separate ignored concurrency group so they do not occupy a legitimate PR queue. Manual dispatch remains available to authorized maintainers; runtime permission checks remain authoritative, and operators must update both workflow lists when approving another commenter. This narrows the pilot rather than broadening credential access.

Existing parity CI run 81 failed independently; no source/test/CI changes were made in this PR. Requested only the safe failed-step/error line because private logs are unavailable through the API. Keep that gate visible and do not merge while its cause is unknown. A targeted new review will verify the substantive workflow gate change after push.

**agent:codex/installation-20260919** at 2026-09-19T05:34:40Z

Run 85 completed review 20 on fa2d6a1 (issuecomment-8433) with one medium concern about a shared ignored-event concurrency group. Adopted a focused refinement: rejected events now use format(ignored-{0}, github.run_id), eliminating a shared serialized backlog while retaining the pre-job allowlist and stable authorized PR group. Manual and permitted comment requests still share their PR group. General event/run record creation is unavoidable for a public issue_comment trigger and belongs to server-side anti-abuse policy; no runner/model work is authorized by rejected events. No repository settings were changed. Did not request another model verdict for this small refinement; it is explicitly after the reviewed SHA.

The installation is functional: three native workflow runs fetched the private pinned action, installed the runtime, authenticated CPA and published real review findings. Remaining review concerns have dispositions above; no clean result is claimed for the latest unreviewed refinement. Existing parity CI also failed on run 86. Its error detail is still pending from the operator; keep this PR unmerged until that independent gate is understood.

**agent:codex/installation-20260919** at 2026-09-19T05:35:30Z

in-progress to blocked: Reviewer installation and real feedback are verified, but existing parity CI runs 81/84/86 fail. Need safe failed-step/error detail to triage the independent gate before rollout; private logs unavailable through API and local Go/browser prerequisites are absent.

**agent:codex/installation-20260919** at 2026-09-19T05:38:43Z

User supplied run 81's failure: TestExactlyOneWorkflowPublishes treats the installer's /releases/download/ URL as publication. This supersedes earlier notes describing parity as an unknown independent failure: the new workflow exposed an existing classifier false positive. All 602 web tests, 77 tooling tests, dist parity, typecheck and vet passed before this failure.

Fix the classifier in this installation ticket because it is required to integrate the new workflow. Exempt only the asset-download route from the conservative /releases heuristic, retaining all other endpoint detection and existing publisher checks. Do not exempt an entire workflow/step, remove the publication gate, or rewrite the URL to hide it. Add regression coverage for download-only, API create/upload, mixed steps and GoReleaser modes. Existing CI jobs and release policy remain unchanged. Local Go is absent; obtain a checksum-verified temporary toolchain for focused tests, then verify native parity CI.

**agent:codex/installation-20260919** at 2026-09-19T05:40:44Z

Targeted review https://git.local.sothr.com/terva-sh/git-ticket-canvas/actions/runs/89 completed inference and published review 21: https://git.local.sothr.com/terva-sh/git-ticket-canvas/pulls/11#issuecomment-8438. Reviewed head de08ca0f5f6d909ebb492f5252b692a6881b4a3f, base e59bdca7d9317b7018a49683483e288108c72c84, request release-classifier-fix. No release-classifier findings. One high finding asserts inputs.request-id is invalid subtraction. Declined: https://docs.github.com/en/actions/reference/workflows-and-actions/contexts explicitly permits hyphens in property dereference names (letter or underscore first, then alphanumeric, hyphen or underscore). This native run also parsed, executed and published from that workflow. Keep the finding and failing model gate visible; do not change valid syntax or rerun for a pass. Earlier accepted pin/allowlist/ignored-group findings are fixed; the comment request identity finding remains declined with runtime/source evidence. Native parity run 88 is still running. No merge authorized.

**agent:codex/dispositions-20260919** at 2026-09-19T05:56:34Z

Applied the advisory disposition process from TKT-01M2W3KM31J45QARBJQQC8ESR3 — Formalize finding dispositions and validate consumer discussion. Canonical record: https://git.local.sothr.com/terva-sh/git-ticket-canvas/pulls/11#issuecomment-8443; also linked in the PR description. Review 21/finding-1 is proposed declined, with grammar evidence, reviewed de08ca0/base e59bdca and assessed 0bb1f13/base e59bdca. Confirmed only ticket bookkeeping changed. Explicit maintainer acceptance remains pending; model failure is preserved. This record enables ordinary PR discussion without a model command, which is currently unavailable because the workflow is unmerged and source review head is historical. No new status, credential/settings change or merge performed. This note is additional bookkeeping after the assessed revision.

## Summary

Implemented in canvas PR #11. Native parity CI run 88 passed on de08ca0f5f6d909ebb492f5252b692a6881b4a3f (https://git.local.sothr.com/terva-sh/git-ticket-canvas/actions/runs/88). Real CPA review 21/run 89 completed on that head against e59bdca7d9317b7018a49683483e288108c72c84. All findings have dispositions; latest model gate remains failed for a documented false-positive syntax finding. Download classifier regression and local root Go tests pass. Workflow awaits merge before default-branch comment triggers activate. Not merged; subsequent ticket-only commits are not covered by the recorded CI/review SHA.
