# What is under docs/

Two kinds of document live here, and the difference matters when one
contradicts the code. A **current** document describes the canvas as it is and
is fixed when it drifts. A **historical** document is a design, a plan, a scope
approval, a measurement, or a verification record from a date it names, and it
is kept as written because the decisions it records are the reason the code
looks the way it does. When a historical document and the code disagree, the
code is right and the document is telling you what was true then.

Audited against the code on 2026-09-19 under
TKT-01M2KJ5STJFD39PWNFFYJCZP3B (Bring user and developer documentation up to
what the canvas does). Regenerate the file list with `ls docs/*.md`.

## Current

| Document | What it is for |
|---|---|
| `serving-a-canvas.md` | Operator guide to `git-ticket-canvas-server`: identity, grants, state files, sessions |
| `local-install.md` | What `just install` does and where the commands land |
| `releasing.md` | Release runbook: gates, credentials, what GitHub publishes and Forgejo verifies |
| `development-preact.md` | Frontend build, two-terminal development, and the `parity-check` release gate |
| `preact-canvas.md` | Component ownership and the gesture and save policies |
| `canvas-parity.md` | Which differences between the two commands are declared, and `drift-check` |
| `canvas-baseline.md` | The dense-scene visual gate and how to move its baseline |
| `readme-images.md` | How the README screenshots are generated |
| `readability-v1.md` | Card and lane constants and the density modes |
| `version-display.md` | Where `--version` and `/api/version` get their values |
| `pr-reviews.md` | Requesting and reading targeted Terva reviews on a PR |
| `published-asset-verification.md` | Verifying a published release against the local build |
| `artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/README.md` | The fixture store behind the visual gate and the README images |

## Historical

Each of these names its date or the commit it was measured against, either in
its first lines or in a provenance block at the end.

**Designs and specifications.** `board-organization-design-v1.md`,
`canvas-organization-design.md`, `frame-specification-v1.md`,
`pen-specification-v1.md`, `pen-rule-authoring-addendum-v1.md`,
`pen-implementation-plan-v1.md`, `pen-position-consumers-proposal-v1.md`,
`multi-store-design-v1.md`, `multiuser-design-v1.md`, `live-updates-design.md`.

**Scope approvals for the pen work.** `pen-committed-sampling-scope-v1.md`,
`pen-measurement-scope-v1.md`, `pen-placement-snapshot-scope-v1.md`,
`pen-publication-bridge-scope-v1.md`.

**Implementation and evidence records.** `frames-v1-implementation.md`,
`frames-v1-review-fixes.md`, `pen-backend-schema3.md`,
`pen-typescript-foundation.md`, `pen-placement-snapshots.md`,
`pen-measurement-implementation.md`, `pen-publication-bridge-implementation.md`,
`pen-consumer-contract-tests.md`, `pen-scene-coordinator-implementation.md`,
`pen-local-capture-implementation.md`, `pen-capture-transport-implementation.md`,
`pen-checkpoint-verification.md`, `live-update-implementation.md`,
`live-update-browser-harness.md`, `conditional-board-reads.md`,
`refresh-measurements.md`, `installer-test-cleanup.md`.

**Superseded developer guides.** `development.md`, `development-vite.md`,
`platform-modules.md`, `preact-forms.md`, `browser-testing.md`. Each carries a
line at the top saying what replaced it.

**Verification reports and release notes.** `mvp-validation.md`,
`browser-baseline-passed.md`, `preact-migration.md`,
`release-preparation-verified.md`, `release-v0.1.0.md`, `release-v0.2.0.md`.

**Data and mockups.** `mockups/` holds the approved frame and pen HTML mockups
with their browser checks. `live-update-measurements/`,
`live-update-measurements-embedded/`, `refresh-measurements-baseline/`, and
`refresh-measurements-updated/` are harness output cited by the records above.
`images/` holds the generated README screenshots. `canvas-parity.json` is read
by tests and is current.
