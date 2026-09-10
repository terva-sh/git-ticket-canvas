# Pen foundation checkpoint

This record updates TKT-01M2441T0PTXRFK6VC4FM1PET7 (Route automatic tickets to label-matching canvas pens) without changing previously delivered specifications or evidence documents.

## Implemented work

The checkpoint includes schema-3 persistence and routing CAS, TypeScript normalization/store preservation, pure rule evaluation, collision-aware allocation and placement snapshots, immutable measurement publications, optional diagnostic publication wiring, pure scene coordination and local capture guards, and capture-v1 transport/server validation. Earlier slice documents describe their contracts and limits.

The newer committed sampling probe is also present: owner/publication-bound receipts, card and control sampling, optional App/Canvas wiring, and injected-only count-stable frame controls. Its unit/component tests pass. Its approved scope audit and real-source Chromium verification remain unfinished; this record does not certify that slice complete. Normal main.ts still injects neither probe nor bridge. Visible automatic placement still uses legacy status lanes.

The user-authored `.tickets/canvas/default.yml` is included unchanged. The original draft ticket deletion is a lifecycle move to `.tickets/tickets/`, not lost ticket history.

## Verification and repair

Initial verification passed 446 frontend tests, strict TypeScript, the full Go race suite, vet, formatting, 65 tooling tests and strict ticket validation. It also found two real checkpoint problems:

- Existing generated assets did not match a disposable build of current source.
- Two browser refresh regressions could not instrument App because their insertion pattern still required `App()` without props.

The user explicitly approved fixing the hook, regenerating assets, rerunning checks and committing. The hook now accepts the single-line App parameter list while retaining its fail-closed insertion check. `just check` rebuilt dist and passed all its checks. The subsequent `just browser-test-embedded` passed 53 tests; five opt-in measurement tests were skipped. This includes the existing 120-card responsiveness guard, not proof of pen-trial performance. Both previously failing refresh regressions now pass.

## Remaining work

Three draft children make the unfinished sequence explicit:

- TKT-01M26SPJGBWT2B3QP0NE7CRQQT (Finish committed sampling probe verification).
- TKT-01M26SPW8XM5Q3M73536W5X0F1 (Integrate and verify the opt-in pen consumer trial), dependent on sampling verification.
- TKT-01M26SQB4JWTW8FPSVHYZKFKCR (Gate default pen activation on controls and trial evidence), dependent on the trial and explicit human approval.

The parent remains in-progress. End-to-end acceptance criteria remain unchecked because foundations and baseline browser parity do not prove activated pen behavior. Capture tokens do not prove browser geometry or atomicity against external writers after validation. Default activation remains blocked. This checkpoint authorizes no push or release.

Recorded in session `20260910-230314-3c1b5619` with terva `0.134.6-0.20260910010245-6f36fa1e7be7`, commit `6f36fa1`, built `2026-09-10T01:05:08Z`; extensions index `0.8.2`, obsidian `0.2.0`, web `0.3.1`.
