---
schema: 3
id: TKT-01M2Y91C31J34Q6DCSDN2QH6DD
title: Remove the opt-in pen placement trial engine
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - canvas
  - layout
assignees: []
milestone: null
parent: TKT-01M2ND0S8N5Y8V0HQFRCBKMXE3
origin: null
dependencies:
  - TKT-01M2ND1RKK6S4GXZQKKPP6H87P
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-20T02:06:34Z
updated_at: 2026-09-20T18:48:13Z
created_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
updated_by:
  id: agent:claude/t3code-a6d0ff31
  name: ""
extensions: {}
---

## Description

web/src/platform/canvas/placement.ts, pens.ts, snapshots.ts, publications.ts, the committed sampling probe, and the PublicationBridge props on App and Canvas are the archived opt-in trial's route to placement: a collision-search allocator with measured heights and a resolver that ranks by specificity before rule order. The adopted contract resolves by first match in ruleOrder, and TKT-01M2ND1RKK6S4GXZQKKPP6H87P places cards through one pure resolve function. Decided on 2026-09-20 when that ticket was planned: the trial does not survive. Remove it and its tests, and the diagnostic injection in main.ts and the test harness, so the tree has one reading of a board. Keep docs/pen-position-consumers-proposal-v1.md and the evidence documents as records.

## Acceptance criteria

- [x] No module in web/src resolves a pen by specificity
- [x] The PublicationBridge and committed sampling props are gone from App and Canvas
- [x] The web test suite and just ci pass with the trial removed

## Implementation plan

Mapped the trial closure by following imports both ways from placement.ts, pens.ts, snapshots.ts, publications.ts, capture.ts, scene.ts and the UI probe, then removed every module nothing else reaches.

Removed from web/src/platform/canvas: placement.ts (collision-search allocator), pens.ts (specificity resolver), snapshots.ts, publications.ts (PublicationBridge), capture.ts (CaptureGuard), scene.ts (SceneCoordinator), and their eight test files. capture.ts and scene.ts import only placement.ts, snapshots.ts and frames.ts, and nothing outside the trial imports them, so they go with it.

Removed from web/src/ui: canvas/committedSampling.ts, canvas/controlMeasurements.ts, canvas/SampledFrame.tsx and their tests, plus publications.test.tsx, which was the only harness that constructed a PublicationBridge or a CommittedSampling. No production module and no vitest setup file injected them: main.ts renders App with no props, and vitest.config.ts has no setupFiles. Canvas lost samplingProbe, samplingPublication, samplingReady, publicationBridge, publication and publicationReady with both sampling effects and the SampledFrame branch; App lost its two props, the bridge, probe, publication and samplingPublication refs, and the hold/dispose calls.

Web-side capture transport went too, because the sampling probe was its only reader: captureToken on PersistedState and BoardResponse, CapturePrecondition, the capture field on FrameTransaction and LayoutRequest, the token reset inside write(), and the two store-capture test files.

Kept on purpose. resolve.ts and frames.ts are the live path. useMeasurements keeps heights, elements, register, sizes and viewportRevision, which Canvas uses for real card heights, edge anchors and frame capture; only sample, sampleCards and the per-registration incarnation went, with the CardView incarnation prop that fed them. The publications counter and the data-store-publications attribute on App stay: they count store publications for the refresh diagnostics, not bridge publications, and tests/browser/refresh-regressions.spec.ts asserts on that attribute. The Go server capture handling in internal/api stays untouched, as the ticket says.

Gate: npm run typecheck, npm run test:unit, then just check (this justfile has no ci recipe), with web/dist rebuilt and committed on its own so verify-dist parity holds.

## Notes

**agent:claude/t3code-a6d0ff31** at 2026-09-20T18:40:26Z

What the next person needs to know about this removal.

The Go server keeps its capture handling. internal/api/capture.go, snapshot.go, capture_test.go and capture_token_test.go are untouched, and server.go still issues a captureToken and still accepts a capture precondition on a layout write. The web side no longer reads or sends either, so that code is now unreached from this client. Deciding its fate is separate work and is not done here.

Deliberately kept. web/src/platform/canvas/resolve.ts and frames.ts are the live path. useMeasurements keeps heights, elements, register, sizes and viewportRevision: Canvas reads elements and heights for real card heights, the edge layer anchors on them, and the sizes publication is what rerenders the canvas when a card changes height. Only sample, sampleCards and the per-registration incarnation went. The publications counter and the data-store-publications attribute on App stay, because they count store publications for the refresh diagnostics rather than bridge publications, and tests/browser/refresh-regressions.spec.ts asserts on that attribute. The pen documents under docs/, including pen-position-consumers-proposal-v1.md, are untouched.

Two archived tickets recorded references to files this ticket deleted, which made git ticket check --strict fail with 20 reference_path_unresolved warnings. The paths on those 20 references were cleared to null on TKT-01M2441T0PTXRFK6VC4FM1PET7 and TKT-01M26SPJGBWT2B3QP0NE7CRQQT. The reference names stay, which is what those tickets already did for other refs with no path, so the record of what that work produced survives.

There is no just ci recipe in this justfile. The gate that exists is just check, which runs web-build, web-test, tooling-test, fmt-check, vet, test and tickets-check. It was run on the committed tree and exited 0, as did just dist-verify.

docs/readability-v1.md had one paragraph describing the collision-search allocator as the pen placement path; it now describes resolveBoard. Its Verification section still says five opt-in measurement tests were skipped, which is a dated record of a run on 2026-09-10 and was left as written.

**agent:claude/t3code-a6d0ff31** at 2026-09-20T18:48:13Z

Terva could not read PR 18: the run at 087a53c53a42 failed at context_limit in 2 s. This time the bundle is not the cause; web/dist moved by about 1 KB, because the trial was tree-shaken out of it already, and the 40 changed source files are 260 KB of deletions against a 256 KB cap. The reviewer was checked out at the exclude-paths head and the exclusion applied. A PR that is mostly deleted code is the maintainer's to read; the tests that ran are the evidence.

## Summary

The opt-in placement trial is gone from web/src. Removed placement.ts, pens.ts, snapshots.ts, publications.ts, capture.ts and scene.ts with their eight tests, the committedSampling, controlMeasurements and SampledFrame modules with theirs, ui/publications.test.tsx, and the two store-capture test files. App and Canvas no longer carry the PublicationBridge or committed sampling props, and no module in web/src resolves a pen by specificity: resolveBoard, which takes the first match in ruleOrder, is the only route to placement. The web side of the capture transport went with the probe that was its only reader, while the server keeps its own, which a note records as follow-up work.

Verified on the committed tree: just dist-verify exited 0 with the locked rebuild matching HEAD byte for byte, and just check exited 0 with 423 vitest tests in 36 files, 78 tooling tests, Go vet and race tests, and a clean ticket store. This justfile has no ci recipe; just check is its gate.
