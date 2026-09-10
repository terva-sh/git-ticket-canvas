---
schema: 3
id: TKT-01M2441T0PTXRFK6VC4FM1PET7
title: Route automatic tickets to label-matching canvas pens
type: task
status: in-progress
status_reason: null
priority: normal
due_on: null
labels:
  - ui
  - canvas
  - labels
assignees: []
milestone: null
parent: null
origin: null
dependencies:
  - TKT-01M24411DDC98WXKT2MY2FMHQN
blocks_on: children
references:
  - ref: design:canvas-organization
    path: docs/canvas-organization-design.md
  - ref: code:geometry
    path: web/src/platform/canvas/geometry.ts
  - ref: code:ticket-store
    path: web/src/platform/tickets/store.ts
  - ref: code:app
    path: web/src/ui/App.tsx
  - ref: code:canvas
    path: web/src/ui/Canvas.tsx
  - ref: code:layout-store
    path: internal/layout/layout.go
  - ref: doc:gesture-ownership
    path: docs/preact-canvas.md
  - ref: spec:pens-v1
    path: docs/pen-specification-v1.md
  - ref: mockup:pens-v1
    path: docs/mockups/pens-v1.html
  - ref: test:pens-v1-mockup
    path: docs/mockups/pens-v1-check.mjs
  - ref: mockup:competing-pens-v1
    path: docs/mockups/competing-pens-v1.html
  - ref: test:competing-pens-v1-mockup
    path: docs/mockups/competing-pens-v1-check.mjs
  - ref: plan:pens-v1
    path: docs/pen-implementation-plan-v1.md
  - ref: spec:pen-rule-authoring-v1
    path: docs/pen-rule-authoring-addendum-v1.md
  - ref: test:pen-schema
    path: internal/layout/pens_test.go
  - ref: test:pen-transactions
    path: internal/api/pens_test.go
  - ref: code:pen-schema
    path: internal/layout/pens.go
  - ref: code:routing-transactions
    path: internal/layout/frames.go
  - ref: code:routing-api
    path: internal/api/server.go
  - ref: evidence:pen-backend-schema3
    path: docs/pen-backend-schema3.md
  - ref: code:pen-wire
    path: web/src/platform/tickets/types.ts
  - ref: code:pen-evaluation
    path: web/src/platform/canvas/pens.ts
  - ref: code:pen-normalization
    path: web/src/platform/tickets/layout.ts
  - ref: test:pen-store
    path: web/src/platform/tickets/store-pens.test.ts
  - ref: test:pen-evaluation
    path: web/src/platform/canvas/pens.test.ts
  - ref: evidence:pen-typescript-foundation
    path: docs/pen-typescript-foundation.md
  - ref: spec:pen-placement-snapshot-v1
    path: docs/pen-placement-snapshot-scope-v1.md
  - ref: code:pen-placement
    path: web/src/platform/canvas/placement.ts
  - ref: test:pen-placement
    path: web/src/platform/canvas/placement.test.ts
  - ref: code:pen-snapshots
    path: web/src/platform/canvas/snapshots.ts
  - ref: test:pen-snapshots
    path: web/src/platform/canvas/snapshots.test.ts
  - ref: evidence:pen-placement-snapshots
    path: docs/pen-placement-snapshots.md
  - ref: spec:pen-measurement-v1
    path: docs/pen-measurement-scope-v1.md
  - ref: code:pen-measurements
    path: web/src/ui/canvas/useMeasurements.ts
  - ref: code:card-measurement-registration
    path: web/src/ui/canvas/CardView.tsx
  - ref: test:pen-measurements
    path: web/src/ui/canvas/useMeasurements.test.tsx
  - ref: evidence:pen-measurements
    path: docs/pen-measurement-implementation.md
  - ref: spec:pen-publication-bridge-v1
    path: docs/pen-publication-bridge-scope-v1.md
  - ref: code:pen-publication-bridge
    path: web/src/platform/canvas/publications.ts
  - ref: test:pen-publication-adapter
    path: web/src/platform/canvas/publications.test.ts
  - ref: test:pen-publication-app
    path: web/src/ui/publications.test.tsx
  - ref: evidence:pen-publication-bridge
    path: docs/pen-publication-bridge-implementation.md
  - ref: proposal:pen-position-consumers-v1
    path: docs/pen-position-consumers-proposal-v1.md
  - ref: test:pen-consumer-scene
    path: web/src/platform/canvas/scene.test.ts
  - ref: test:pen-local-capture
    path: web/src/platform/canvas/capture.test.ts
  - ref: test:pen-store-capture
    path: web/src/platform/tickets/store-capture.test.ts
  - ref: test:pen-server-capture
    path: internal/api/capture_test.go
  - ref: evidence:pen-consumer-contracts
    path: docs/pen-consumer-contract-tests.md
  - ref: code:pen-consumer-scene
    path: web/src/platform/canvas/scene.ts
  - ref: test:pen-scene-regressions
    path: web/src/platform/canvas/scene-regressions.test.ts
  - ref: evidence:pen-scene-coordinator
    path: docs/pen-scene-coordinator-implementation.md
  - ref: code:pen-local-capture
    path: web/src/platform/canvas/capture.ts
  - ref: test:pen-capture-regressions
    path: web/src/platform/canvas/capture-regressions.test.ts
  - ref: evidence:pen-local-capture
    path: docs/pen-local-capture-implementation.md
  - ref: code:server-capture
    path: internal/api/capture.go
  - ref: code:capture-snapshot
    path: internal/api/snapshot.go
  - ref: test:capture-token-regressions
    path: internal/api/capture_token_test.go
  - ref: test:store-capture-regressions
    path: web/src/platform/tickets/store-capture-regressions.test.ts
  - ref: evidence:capture-transport
    path: docs/pen-capture-transport-implementation.md
  - ref: spec:pen-committed-sampling-v1
    path: docs/pen-committed-sampling-scope-v1.md
  - ref: evidence:pen-checkpoint
    path: docs/pen-checkpoint-verification.md
  - ref: test:refresh-instrumentation
    path: tests/browser/refresh-support.ts
  - ref: build:frontend-assets
    path: web/dist/index.html
claim:
  actor: agent:terva/mieli
  branch: null
  worktree: null
  commit: null
  session: 13ff7f81-766b-496c-a0e6-4743345e1b86
  claimed_at: 2026-09-10T20:53:39Z
  expires_at: null
archive: null
created_at: 2026-09-09T22:19:10Z
updated_at: 2026-09-10T23:17:45Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

Add label-routing pens with distinct board records, preferred layout rectangles, arrival pins, and rules requiring independent labels. Follow docs/pen-specification-v1.md for the approved policies; it supersedes conflicting pen recommendations in the unchanged historical docs/canvas-organization-design.md. This depends on TKT-01M24411DDC98WXKT2MY2FMHQN (Add persistent canvas grouping frames), now complete.

### Approved behavior
All distinct required labels must match; the most-specific matching rule wins. Equal specificity uses visible editable explicit rule order, earlier first, with overlap feedback and winning-rule explanations. Persist only manual ticket coordinates. Reevaluate automatic placement on accepted store updates, never during rendering or active drags. Existing saved positions remain manual.

Frame membership, routing destination, and manual placement are independent. Membership operations do not move or pin cards. Automatic members can route outside their ordinary frame and remain members. Moving that frame moves every member and makes its position manual. Return to automatic preserves membership. Frame undo restores automatic placement through current routing without bypassing conflict protection.

### Scope
Provide a visible board-local, movable, non-deletable Inbox; stable in-memory slots; collision-free interior placement followed by deterministic visible overflow; and Preview, Apply, Cancel for pen edits. Filters do not free slots. Count and highlight automatic cards whose winning destination is the pen, including filtered and overflow cards, not manual or merely enclosed cards. Removing a pen reevaluates remaining rules then Inbox without changing labels, membership, or manual positions.

Clicked-position creation is manual; positionless creation is automatic. Arrange remains explicit manual status-lane placement with a warning, not bulk unpinning. Pen edits affect automatic placement only and stay outside Undo frame. Preserve gesture freezes, deferred updates, preview ownership, board generations, and honest pending-save feedback.

Persist authored pens, pins, rules, and explicit order per board, never derived automatic coordinates. Spatial actions never edit labels. Frame-to-pen conversion, attaching rules to existing frames, new-arrival counts, bulk return-to-automatic, and pen-edit undo are outside the initial slice.

### Approvals and current work boundary
The user approved the interaction policies and, after their respective walkthroughs, both mockups. Approval notes record the exact artifact hashes. The one-pen mockup at docs/mockups/pens-v1.html covers the demonstrated one-pen, Inbox, manual-override, and ordinary-frame controls and explanations, including outside membership, overflow, counts, removal, previews, pending saves, and keyboard controls.

The competing-rule mockup at docs/mockups/competing-pens-v1.html is also approved. It covers explicit tie-order controls, specificity over order, duplicate-label handling, overlap warnings and counts, per-ticket winning/losing/missing-label explanations, reorder/removal previews, manual overrides, and cancellation/pending/failure feedback. Its browser check is docs/mockups/competing-pens-v1-check.mjs. Reviewed files remain unchanged; their historical approval-status wording is superseded by the ticket's approval records.

The user's subsequent request explicitly authorized promotion, code inspection, and an implementation plan before code changes. This supersedes the earlier keep-draft/unclaimed/no-plan instruction. The ticket has been promoted, claimed, and moved to in-progress for inspection and planning. The source-inspected plan is docs/pen-implementation-plan-v1.md. Stop at that plan for review before making production code changes. The plan identifies remaining general authoring choices rather than silently choosing them. Mockup approval is not production verification; all implementation acceptance criteria and definition-of-done items remain unchecked.

## Acceptance criteria

- [ ] Pen rules require all listed independent labels; additional ticket labels are allowed, duplicate requirements do not increase specificity, and the most-specific matching rule wins.
- [ ] Equally specific matches follow the approved deterministic tie-break policy, expose overlap feedback, and show a winning-rule explanation; unmatched automatic tickets use a visible board-local Inbox pin.
- [ ] Only explicit manual placements persist ticket coordinates; existing saved coordinates remain manual, while loading and recalculating automatic placement produce no card-position writes.
- [ ] Every accepted store update reevaluates automatic placement, including label edits and new tickets; rendering, filtering, pan, and zoom do not invoke layout calculation.
- [ ] Placement remains frozen during a drag; pending updates apply after completion or cancellation and respect the newly placed card, pending previews, board generations, stale-response guards, and save-failure rollback.
- [ ] Automatic cards use spaced, collision-aware slots around pins, accounting for card dimensions; valid in-memory slots remain stable across unrelated updates, and fresh loads reconstruct deterministically under the approved overflow policy.
- [ ] Return to automatic placement removes the saved position and reevaluates routing; failed removal retains manual state. Selection and cancelled gestures do not save coordinates.
- [ ] Pen/rule edits preview affected automatic tickets and never relocate manual cards; moving tickets across pen boundaries never mutates labels. Counts use the approved membership definition, and creation/Arrange/removal follow the approved manual-intent policy.
- [ ] Board persistence round-trips pins and rules without automatic coordinates or ticket Markdown changes; read-only mode blocks mutations and compatibility tests protect existing layouts.
- [ ] Unit, store, Go, and browser tests cover matching, specificity, ties, Inbox, stable slots, collisions, label changes, reloads, manual override, unpin failure, drag/update races, and board switches while preserving the 120-card responsiveness guard.

## Definition of done

- [ ] Record the remaining approved interaction policies and evidence for the one-pen/Inbox/manual-override slice before expanding to multiple rules.
- [x] Run just check and embedded browser checks; regenerate committed frontend assets through the existing build process.

## Implementation plan

Checkpoint the existing work with reviewed generated assets and verification evidence at the user's request. Completed foundations and remaining boundaries are recorded in docs/pen-checkpoint-verification.md. Next, finish the approved committed sampling scope audit and real-source Chromium evidence under its draft child, then complete the dependent opt-in consumer integration. Keep the default-activation child draft until explicit human approval backed by trial evidence and a bounded controls/activation plan. Existing reviewed scope documents remain unchanged. No visible pen placement, guarded UI submission/history conversion or default injection is authorized by this checkpoint.

## Notes

**agent:terva/mieli** at 2026-09-10T05:06:37Z

The user approved the recommended pen policies and requested a new specification while keeping this ticket draft. Recorded them in docs/pen-specification-v1.md and linked spec:pens-v1. Approval covers distinct pens and independent frame membership, explicit rule-order ties, visible overflow, automatic-destination counts, previewed edits/removal, Inbox, manual creation/Arrange intent, and frame/save/undo interactions. Historical design and frames v1 documents remain unchanged.

This is policy approval only, not mockup approval, promotion, or implementation authorization. The ticket remains draft and unclaimed, without an implementation plan; all acceptance criteria and definition-of-done items remain unchecked. The next review artifact is one pen plus Inbox, manual override, and an ordinary frame before competing rules.

Recorded with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index v0.8.2, obsidian v0.2.0, web v0.3.1.

**agent:terva/mieli** at 2026-09-10T15:11:43Z

Created the requested one-pen review artifact at docs/mockups/pens-v1.html. It shows Frontend, a non-deletable Inbox, automatic overflow, a manual card, and the independent Release work frame. The embedded walkthrough covers membership-only assignment, Frontend-to-Inbox routing, grouped movement making members manual, label changes respecting manual placement, and Return to automatic preserving membership. Pen move/resize/pin/rule/removal and Inbox movement have Preview, Apply, Cancel controls. Simulated saves show failure rollback and continue after panel close; frame undo restores current routing and blocks newer member placement or membership changes.

Verification: node docs/mockups/pens-v1-check.mjs passes in Chromium. Checks cover the walkthrough, retained unrelated slots, collision-free automatic placements, counts and filtered overflow, hidden/outside frame members, undo/current routing/conflicts, all six preview operations, cancel/failure/success, failed unpinning, pending panel close, read-only guards, keyboard activation, light/dark themes, a 390 px viewport, no browser errors, and no remote requests. Inspected dark and light screenshots. Local links and whitespace checks pass; prior specifications, mockups, and .tickets/canvas/default.yml are unchanged.

This is a standalone synthetic prototype with no API calls or storage. Step buttons stand in for dragging. The fixture layout, single-frame-move history, and simulated save timer are not production algorithms or concurrency evidence. Drag/SSE/board switching, creation, Arrange, multi-rule editing, persistence, and production performance remain outside this mockup. No production files or generated assets changed; production test suites were not rerun for this isolated artifact.

The user requested mockup creation only. It is not yet approved. Keep the ticket draft and unclaimed, with no implementation plan and all acceptance/definition-of-done items unchecked. No commit or push was made.

Recorded with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index v0.8.2, obsidian v0.2.0, web v0.3.1.

**agent:terva/mieli** at 2026-09-10T16:22:10Z

The user explicitly approved the one-pen mockup after the walkthrough: "I approve the one-pen mockup. Record my approval and keep the ticket in draft."

Approved artifact: docs/mockups/pens-v1.html, SHA-256 cfd55f71a38b162ca0c8ce6c3123740af36f7e7f3a00ab057784c39887089a59. Approval covers the demonstrated one-pen/Inbox/manual-override/ordinary-frame controls and explanations, including overflow and filtered counts, independent membership, grouped manual movement, Return to automatic, previews, simulated save failure/pending feedback, frame undo conflicts, and keyboard/theme presentation. The earlier note's statement that the mockup is not yet approved is superseded by this approval.

The reviewed mockup, check script, and specification remain unchanged. Their historical approval-status wording records when they were authored; this ticket records the subsequent approval. This approval does not cover competing-rule controls or production algorithms, persistence, live-update/drag races, or performance. It does not authorize promotion, claim, implementation, commit, or push. Keep the ticket draft and unclaimed with no implementation plan; implementation criteria remain unchecked.

Recorded with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index v0.8.2, obsidian v0.2.0, web v0.3.1.

**agent:terva/mieli** at 2026-09-10T16:32:08Z

Created the requested separate competing-rule mockup at docs/mockups/competing-pens-v1.html. Four rules demonstrate one-label fallback, an explicit two-label tie, and three-label specificity. Move earlier/later previews order changes; per-ticket explanations distinguish missing requirements, lower specificity, and losing tie order. Overlap warnings identify the combined required labels and distinguish automatic top-specificity ties, manual matches, and matches outranked by greater specificity, including filtered cards. Repeated labels count once. Reorder/removal previews preserve manual positions and frame membership; removing all matching rules eventually falls back to Inbox.

Verification: node docs/mockups/competing-pens-v1-check.mjs passed in Chromium. It covers specificity over order, tie reversal, overlap explanations with and without decisive automatic ties, hidden counts, duplicate requirements, preview cancellation and save failure, applied preview parity, manual override and failed/successful unpinning, label changes, removal fallback through remaining rules to Inbox, collision-free automatic fixture slots, pending saves after editor close, read-only controls, keyboard activation, light/dark themes, 390 px viewport, no browser errors, and no remote requests. Inspected dark preview and light accepted-state screenshots. New-file whitespace and local links passed. Approved one-pen HTML/check script, approved specification, historical documents, and user layout checksums remain unchanged.

This is an unapproved review artifact, not production implementation. Fixed fixture slots, a static frame, step buttons, and a simulated save timer do not establish a production algorithm, persistence schema, drag/live-update correctness, or performance. Production suites were not rerun for this isolated mockup. The ticket remains draft and unclaimed with no implementation plan and all criteria unchecked. No staging, commit, or push.

Recorded with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index v0.8.2, obsidian v0.2.0, web v0.3.1.

**agent:terva/mieli** at 2026-09-10T16:58:33Z

The user explicitly approved the competing-rule mockup after the walkthrough: "I approve the competing-rule mockup. Record my approval and keep the ticket in draft."

Approved artifact: docs/mockups/competing-pens-v1.html, SHA-256 c69e00077b8a67dee55477d609491834f507315f6d5e59c2d3efcf10133a7e89. Approval covers the demonstrated explicit tie-order controls, specificity over order, duplicate-label handling, overlap warnings and counts, per-ticket winning/losing/missing-label explanations, reorder/removal previews, manual overrides, and cancellation/pending/failure feedback. This supersedes the earlier note's statement that this mockup is unapproved.

Both reviewed mockups, their check scripts, and the specification remain unchanged. Their historical approval-status wording records when they were authored; this ticket records the subsequent approvals. This approval does not select a production placement algorithm, general rule-authoring form, persistence schema, or migration, and does not establish drag/live-update correctness or performance.

Keep the ticket draft and unclaimed with no implementation plan. Promotion and implementation still require separate authorization. No criteria were checked, and no staging, commit, or push was made.

Recorded with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index v0.8.2, obsidian v0.2.0, web v0.3.1.

**agent:terva/mieli** at 2026-09-10T17:04:07Z

draft to ready: User explicitly authorized promotion, code inspection, and an implementation plan before code changes.

**agent:terva/mieli** at 2026-09-10T17:09:35Z

On the user's explicit request, promoted this ticket from draft to ready, claimed it on main, and moved it to in-progress for code inspection and planning. Read the current layout parser/transactions, API layout and snapshot paths, TicketStore reconciliation/write queue, App publication/save ownership, Canvas geometry/gesture/Arrange paths, measurement hook, frame history, and browser instrumentation.

Wrote docs/pen-implementation-plan-v1.md and the Implementation plan section after that inspection. Key findings: Canvas currently computes automatic status-lane placement during render; layout parsing accepts schemas 1/2 and has no pen fields; frame undo's null-card inverse is suitable for current-routing restoration, but automatic-position capture/redo needs routing-aware guards; browser placement instrumentation must move with the engine. The plan sequences schema/transactions, pure routing and placement snapshots, publication/gesture integration, one-pen production verification, then competing-rule controls and regressions.

Stopped before code changes. Strict ticket validation passed with no warnings/errors; plan links and whitespace passed. Git reports no changes in internal, web, tests, scripts, or justfile and no staged files. Approved mockup/specification and user-layout hashes match the pre-inspection baseline. Production tests were not rerun for this documentation-only phase. All acceptance criteria remain unchecked. This note supersedes the earlier draft-only restriction, not the requirement to preserve reviewed artifacts.

Recorded with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index v0.8.2, obsidian v0.2.0, web v0.3.1.

**agent:terva/mieli** at 2026-09-10T17:23:25Z

The user approved nonempty rules and the proposed label-entry controls, requesting a new addendum before code changes. Recorded the decisions in docs/pen-rule-authoring-addendum-v1.md and linked spec:pen-rule-authoring-v1. This resolves and supersedes the open empty-rule/general-label-entry choices mentioned in the existing Description, Implementation plan, and reviewed plan document; those reviewed documents remain unchanged.

Accepted pen rules require at least one distinct label. Empty drafts disable Preview/Apply; the API rejects empty rules without writing, and malformed hand-edited layouts report an error rather than treating empty rules as catch-all. Inbox remains the unmatched fallback. Required labels use removable exact-label tokens with configured/used suggestions, case-insensitive search but exact matching, explicit custom entry, no splitting on commas/spaces, blank rejection, and trimming only new entries. Duplicates do not increase specificity; unconfigured/unused requirements remain with warnings. The addendum records keyboard navigation, Escape precedence, accessible removal/feedback, and Apply bound to the exact previewed draft.

The addendum contains future implementation checks, not claims of completed implementation. The ticket remains in-progress under its existing claim; no criteria were checked. No code changes, staging, commit, or push are authorized by this recording task.

Recorded with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index v0.8.2, obsidian v0.2.0, web v0.3.1.

**agent:terva/mieli** at 2026-09-10T17:34:02Z

Started the requested schema/transaction test-first slice following docs/pen-rule-authoring-addendum-v1.md. Added five schema tests in internal/layout/pens_test.go and five API transaction tests in internal/api/pens_test.go. No production code changed.

The test-local wire contract makes the plan concrete without requiring missing production Go symbols: schema-3 boards expose pens, ruleOrder, and inbox; pen records use pin:{x,y} and requiredLabels. PUT /api/layout takes routing:{pens,ruleOrder,inbox} plus the complete expect.routing preimage. Existing card/frame request fields remain available for atomic mixed edits. Exact Go production type names/signatures remain unchosen.

Assertions cover legacy 1/2 read-without-write and explicit-write upgrade; schema-3 deterministic round trips; YAML-sensitive IDs/strings; exact case/comma/space/custom-label preservation and deduplication; empty/null/blank rules, invalid order, missing/null Inbox, future fields/version rejection; routing preservation through sparse card/frame/create/delete paths; stale routing and stale unpin atomicity; simultaneous insert/reorder with one winner; live snapshot/ETag changes; and read-only preservation. Valid schema-3 positive controls gate malformed-input cases so blanket schema rejection cannot count as correct validation.

Baseline go test ./internal/layout ./internal/api passed before adding tests. Final go test -race ./internal/layout ./internal/api -run '^TestPen' -count=1 compiles and fails all ten top-level tests at the expected missing schema/transaction support: unknown pens/inbox/ruleOrder fields, legacy normalization still at schema 2, unknown routing request field, and missing normalized routing response. Later validation/concurrency assertions are written but not yet reached past those prerequisites. This is an intentional red phase, not passing feature evidence. An initial test-helper compile error was corrected before the final run.

Existing tests still pass with go test -race ./internal/layout ./internal/api -skip '^TestPen' -count=1. The skip isolates the existing baseline only; it is not a feature or release gate. Formatting and diff whitespace checks pass. Reviewed documents, production files, generated assets, and user layout remain unchanged; no staging, commit, or push. No acceptance criteria checked. Next: implement schema-3 normalization/validation/rendering and routing CAS, then exercise all deeper assertions. Existing schema-2-specific expectations in frames_test.go will also need updating when schema 3 becomes supported, retaining future-schema refusal rather than weakening it.

Recorded with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index v0.8.2, obsidian v0.2.0, web v0.3.1.

**agent:terva/mieli** at 2026-09-10T18:03:02Z

Implemented the user-authorized backend slice. This supersedes the previous planning-only boundary for schema/parser/renderer, atomic routing transactions, and API changes only. Frontend routing/placement/controls remain outside this request. New evidence: docs/pen-backend-schema3.md; reviewed documents and mockups remain unchanged.

Schema 3 persists pens, ruleOrder, and Inbox. Legacy schemas normalize in memory without writes and upgrade on explicit mutation. Complete pen/point/routing records, nonempty exact-label rules, valid order permutations, geometry and unknown-field/version checks protect disk data. RoutingTransaction extends the existing locked reload/CAS/rename path and keeps existing Transaction callers compatible. PUT /api/layout requires complete expect.routing for routing replacement, rejects malformed records with 400 and stale preimages with 409, and supports atomic mixed card/frame changes. Sparse writers preserve routing; unpin preserves membership. Snapshot responses and ETags include routing through the existing reconciliation path.

All five layout pen tests and six API pen tests pass. Added deeper cases for partial/null coordinates, pins and Inbox, invalid nested fields, nonfinite pins, partial pen expectations, and response/disk normalization with reusable preimages. Final go test -race ./... -count=1 and go vet ./... pass; no pen-test skip. Existing frame tests now compare current Schema and Schema+1 for future rejection. git diff --check passes. Strict ticket check follows this note.

Approved artifact hashes and user .tickets/canvas/default.yml match their prior baselines. No frontend changes or asset rebuild, no staging, commit, push, or release. No just check or embedded browser run; no end-to-end criteria checked. Ticket stays in-progress for the remaining frontend work.

Recorded with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index 0.8.2, obsidian 0.2.0, web 0.3.1.

**agent:terva/mieli** at 2026-09-10T18:33:02Z

The user confirmed the bounded TypeScript wire/store and pure-evaluation slice, then explicitly requested implementation. Added schema-3 routing types and mandatory whole-routing preimages, shared layout normalization/reconciliation, and saveRoutingLayout through the existing serialized queue. Board loads/switches, layout/frame/routing/create responses, ticket-only mutations, deletion cleanup, ETags, identity reuse, read-only checks, conflicts, and stale generations now preserve routing. No placement or UI integration was added.

Added pure evaluatePens with distinct exact-label conjunctions, specificity and explicit-order ties, tagged pen/Inbox destinations, candidate explanations, potential overlap relationships and current overlap counts. Manual cards expose potential destinations but never count as automatic assignments. The caller supplies all tickets, including filtered ones. No production caller invokes the evaluator yet.

Test-first evidence: the initial store run failed 40 of 42 tests on missing support; the pure suite initially failed on its missing module before assertions could run. All are now exercised and passing. Follow-up regressions caught and fixed board-carried routing rejection and the Go/JavaScript Unicode whitespace mismatch. Final frontend run passes 266 tests across 15 files, including 46 new store tests and 26 pure tests; strict TypeScript passes. Go race tests without skips, go vet, tracked/new-file whitespace checks, and strict ticket validation pass.

New evidence document: docs/pen-typescript-foundation.md. Reviewed artifact and user-layout hashes match the pre-slice baseline. UI, geometry/frame algorithms, and web/dist are unchanged. No just check, frontend rebuild, browser suite, staging, commit, push, or release ran. Work remains uncommitted on main at 12601fa808e8eaf06308630e70a20669ea3f4260. Keep all end-to-end acceptance criteria unchecked; placement snapshots and UI require the next bounded authorization.

Recorded with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index 0.8.2, obsidian 0.2.0, web 0.3.1. Session 20260910-180705-fd3659c9.

**agent:terva/mieli** at 2026-09-10T18:36:18Z

Review follow-up supersedes the test counts and immediate-conflict-reload description in the preceding 18:33:02Z note. Read-only reviewer read-only-review-of-the-475313 found that a queued ticket-only mutation can cause a routing conflict recovery read to be discarded by the write-epoch guard. Added two regression tests, observed both fail, then changed shared frame/routing conflict recovery to await whenIdle() and recheck the board generation before loading. No edit is replayed; the original conflict remains the rejection.

Final verification after the fix: npm run test:unit passes all 268 tests in 15 files, including 48 schema-3 store tests and 26 pure evaluator tests. Strict TypeScript, the complete Go race suite, go vet, and diff checks pass. The reviewer found no other independent schema-preservation or evaluator correctness gaps. docs/pen-typescript-foundation.md includes the reviewed result and current counts. No placement/UI/assets, staging, commit, push, or release changes; all end-to-end criteria remain unchecked.

Recorded with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index 0.8.2, obsidian 0.2.0, web 0.3.1. Session 20260910-180705-fd3659c9.

**agent:terva/mieli** at 2026-09-10T18:53:50Z

The user explicitly approved the proposal: "I approve the pure placement-snapshot slice and proposed geometry choices. Record the approved scope before changing code."

Recorded approval in docs/pen-placement-snapshot-scope-v1.md, SHA-256 675a799cb291996a1920d10e909cdf3e04e17ee6d26e32d8ba0775624e4a7a61, and linked spec:pen-placement-snapshot-v1. Updated the Implementation plan to name this next bounded slice. The new approval supersedes earlier scope restrictions on pure placement only; reviewed documents remain unchanged.

Approved: a Preact-free collision-aware allocator plus per-board accepted/proposed snapshot controller; explicit geometry/identity/obstacle/preview inputs; stable slots before new allocation; explicit destination order then full ticket IDs; near-pin interior placement followed by deterministic overflow; no filter-based slot freeing; bounded diagnostic failure; no persistence. Geometry is 24 scene-unit gaps/padding, CARD_WIDTH 280, marked provisional 280 by 340 unmeasured cards, below-first overflow with deterministic alternate sides, and Inbox without an interior capacity boundary or overflow count. Secondary side order, candidate enumeration, and search-budget values remain implementation details to specify in tests, not previously approved numbers.

Test-first scope includes determinism/stability, routing and measurement changes, full-collection counts, obstacles/oversized cards/overlapping pens, preview and generation isolation, limits/failures, no mutation, and a 120-card engine fixture. App, Canvas, useMeasurements, UI controls, existing geometry/frame algorithms, browser instrumentation, backend capture guards, assets, and production gesture/publication integration stay outside the slice. No staging, commit, push, or release permission is included.

This step records approval only and stops before placement code changes. The ticket remains in-progress under its existing claim and all end-to-end criteria remain unchecked. Scope-document links and whitespace pass; protected-file and strict-store checks follow. No production suites reran for this documentation-only step.

Recorded with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index 0.8.2, obsidian 0.2.0, web 0.3.1. Session 20260910-180705-fd3659c9.

**agent:terva/mieli** at 2026-09-10T19:26:19Z

Implemented the user-approved pure placement-snapshot slice, with tests before each module. placement.ts supplies a Preact-free allocator with 24-unit gaps/padding, width 280, identity-tagged measured heights or marked 340-height fallback, manual/source-preview obstacles, stable automatic slots, deterministic interior/overflow lattices, Inbox placement, bounded diagnostics, and immutable snapshots. snapshots.ts supplies board-local last-good caches, generation/revision/baseline checks, accepted/proposed isolation, owner-scoped cancellation, failed-update watermarks, and equivalent-content reuse without allocation or matching. No production caller was added.

Both initial red runs failed on absent modules, with no assertions executed. After implementation, host review wrote two additional failing regressions: fractional boundary rounding and malformed stale updates disturbing newer state. Clamped candidates/explicit containment checks and stale-revision rejection before payload validation fix them. Final npm run test:unit passes all 313 tests in 17 files, including 28 allocator and 17 controller tests. Strict TypeScript, full Go race tests without skips, go vet, and whitespace checks pass. The 120-card engine fixture asserts collisions/work limits and retains all slots with zero new candidate visits on repeat. This is not browser-performance evidence.

New evidence document: docs/pen-placement-snapshots.md. The protected 116-file pre-slice baseline matches SHA-256 d838eb295a32c50d95f19408650c6841cf777842d4a70022420eb485a0d63a0e. Reviewed documents/mockups, UI, existing geometry/frame algorithms, backend guards, assets, and user .tickets/canvas/default.yml remain unchanged. No frontend build, just check, production browser suite, staging, commit, push, or release ran. Work remains uncommitted on main at 12601fa808e8eaf06308630e70a20669ea3f4260. Keep the ticket in-progress and all end-to-end criteria unchecked. Publication/measurement/gesture/save integration and UI controls require a separately reviewed slice. Strict ticket validation passed before this record and is rerun afterward.

Recorded with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index 0.8.2, obsidian 0.2.0, web 0.3.1. Session 20260910-180705-fd3659c9.

**agent:terva/mieli** at 2026-09-10T19:48:26Z

The user approved the proposal: "I approve the measurement-only slice. Record the scope in a new document before changing code."

Recorded approval in docs/pen-measurement-scope-v1.md, SHA-256 585f9ee49e56e80ecb1194de1f364fc4c876c6511e85778557965b39afd2f1f6, linked spec:pen-measurement-v1, and updated the Implementation plan. This supersedes earlier measurement exclusions only within the new boundary. Reviewed documents remain unchanged.

Approved production boundary: useMeasurements.ts, its CardView.tsx registration interface, and necessary Canvas.tsx measurement wiring. Separate immutable card-size publications from viewport redraws; publish valid positive scene-unit heights only on effective size/registration changes; preserve viewport redraws and existing consumers; protect newer registrations from stale cleanup/observer callbacks with owner tokens; coalesce per animation frame; cancel pending work on unmount/board switches; keep filtered cards measured. Registration ownership does not establish ticket incarnation or accepted-baseline tokens.

Tests precede implementation and cover unchanged observations, viewport-only events, real height changes including label disclosure, immutable/coalesced publications, registration replacement/removal/stale callbacks/unmount, and filtered cards. Later verification includes focused/full frontend tests, strict TypeScript, whitespace, and strict ticket validation. Any browser check uses disposable fixtures without asset rebuilding or user-layout changes.

This recording step stops before code changes. No App publication changes, placement activation, shadow allocator, gesture/save behavior changes, frame algorithms, backend guards, instrumentation, or assets. Existing render-time status lanes remain. No just check, staging, commit, push, or release. Ticket stays in-progress under its existing claim; all end-to-end criteria remain unchecked. Scope links and whitespace pass; protected-file and strict-store checks follow. No production suites reran for this documentation-only step.

Recorded with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index 0.8.2, obsidian 0.2.0, web 0.3.1. Session 20260910-180705-fd3659c9.

**agent:terva/mieli** at 2026-09-10T20:04:18Z

Implemented the approved measurement-only slice with 17 tests written and run before production edits. The initial run failed all 17 against the old implementation. Final npm run test:unit passes 330 tests across 18 files; strict TypeScript passes. useMeasurements now separates frozen size/registration snapshots from viewportRevision, preserves live read-only views for current consumers, coalesces updates, rejects stale registration cleanup/observer callbacks, and cancels work on unmount. CardView returns registration cleanup. Canvas changes only the grid effect dependency; no placement or save algorithms changed.

Disposable Chromium verification uses real hook/CardView/CSS and confirms viewport-only reuse, real wrapped-title growth from 176 to 489 scene units, immutable prior snapshots, scale invariance, border-box notifications, fresh board-remount ownership, no browser errors, and no API requests. Browser testing exposed an incorrect example assumption: the absolutely positioned label disclosure does not increase card border-box height. Tests now assert no publication for unchanged disclosure height and use wrapped titles for real growth. No CSS or reviewed-scope changes were needed. Early browser fixture attempts failed on virtual TSX transformation and the incorrect disclosure expectation; only the corrected final run is passing evidence.

New evidence: docs/pen-measurement-implementation.md. Production changes remain confined to useMeasurements.ts, the CardView registration interface, and Canvas measurement wiring. The 185-file protected baseline remains a2bbb935077c5d7a90479eb53e653e3a252cfa9e6b37788443bcd59d69aa8436, including unchanged reviewed documents, App, placement/frame/backend code, generated assets, and user layout. Strict store validation and source/test whitespace pass; final record checks follow. No production build, just check, Go suite, embedded browser suite, staging, commit, push, or release ran during this slice. Vite served only a disposable source fixture, with cache/script under terva scratch.

Ticket remains in-progress and all end-to-end criteria remain unchecked. Registration symbols are element owners, not ticket incarnation identities. Accepted-publication/controller integration still needs a separate proposal and review; current render-time status lanes remain active.

Recorded with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index 0.8.2, obsidian 0.2.0, web 0.3.1. Session 20260910-180705-fd3659c9.

**agent:terva/mieli** at 2026-09-10T20:27:21Z

The user explicitly approved the proposal: "I approve the test-only accepted-publication bridge slice. Record the scope in a new document before changing code."

Recorded approval in docs/pen-publication-bridge-scope-v1.md, SHA-256 a682637b8c21f9ee18862e61cc1cc6302424560d288ccba5fe0657088ab9df30, linked spec:pen-publication-bridge-v1, and updated the Implementation plan. Reviewed documents remain unchanged. This recording step stops before code changes.

Approved: one Preact-free adapter, narrow optional App/Canvas wiring, and explicit post-commit measurement sampling. Tests and a disposable browser fixture inject the bridge; the normal entry point does not. Observe complete App publications rather than raw store acceptance; distinguish incomplete board activation from accepted input; use local baseline/revision tokens and observed ticket lifetimes independent of registration owners; require fresh generation/baseline-bound measurements; hold during gestures, pending manual saves, and frame operations; flush only on matching committed readiness, never directly from onBusy(false). Call controller activate/accept only, keep results diagnostic, and preserve old-lineage failure state without changing App data, positions, or writes. Fixtures supply explicit obstacles.

Write failing tests before implementation for accepted/deferred/unchanged reads, A/B/A and stale reports, identity lifetimes, same-height freshness/reuse, drop/save hold ordering, failure recovery, default disconnection, and unchanged positions/mutation requests. Later checks include focused/full frontend tests, strict TypeScript/store/whitespace, and a disposable browser fixture without asset rebuilds or user-layout changes. This approval is not test evidence or permission for production activation.

No position-consumer replacement, pending-preview placement, production obstacle derivation, pen controls, allocator/controller changes, or frame/backend capture-guard changes. No just check, staging, commits, pushes, or releases. Ticket remains in-progress under its existing claim with all end-to-end criteria unchecked. Scope links/whitespace pass; protected-file and strict-store validation follow. No production tests reran for this documentation-only step.

Recorded with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index 0.8.2, obsidian 0.2.0, web 0.3.1. Session 20260910-180705-fd3659c9.

**agent:terva/mieli** at 2026-09-10T20:48:58Z

Paused at the user's request for a next-agent handoff. Concrete bridge contracts are recorded in the Implementation plan. Before the new bridge test file, npm run test:unit passed 330 tests in 18 files and npm run typecheck passed. Created web/src/platform/canvas/publications.test.ts with 11 adapter tests. The handoff verification run fails at import because ./publications does not exist; zero assertions executed. This is a genuine missing-module red result, not evidence that the individual cases ran. Sampling additions, UI integration tests, adapter implementation, and App/Canvas wiring have not started. No production file changed during this bridge phase.

The new test helper settle currently assumes request() is non-null even in its stale-publication case. The next agent must fix that helper before relying on assertion results. Full frontend/typecheck has not rerun after adding the missing-module test.

Protected 187-file baseline still matches b7d51eea47db8a5524cb887801fa5f8ef4a3c9ad4058caf87018e471a83bb2ef, excluding the four allowed existing bridge paths and the new test. Approved scope and user layout hashes match; index remains empty. No production build, just check, staging, commit, push, or release. Ticket stays in-progress with all criteria unchecked. Handoff: /home/sothr/.local/state/terva/handoffs/2026-09-10-git-ticket-canvas-publication-bridge.md. This supersedes the earlier backend-only handoff for the current work boundary without editing it.

Recorded with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index 0.8.2, obsidian 0.2.0, web 0.3.1. Session 20260910-180705-fd3659c9.

**agent:terva/mieli** at 2026-09-10T21:06:38Z

Continued the handoff in the original uncommitted tree and completed the approved test-only publication bridge. New evidence: docs/pen-publication-bridge-implementation.md. Added PublicationBridge, explicit fresh committed sample(token), and narrow mount-captured optional App/Canvas wiring. Normal entry point remains disconnected; results never supply displayed positions or saves. Holds fence gestures, manual saves and frame operations; complete fresh registrations and live publication readiness gate accept. No allocator/controller behavior changed.

Test-first record: reproduced inherited missing-module red with zero assertions; seven new sampling cases failed while all 17 existing cases passed; actual-App suite failed 11 of 12 before wiring. Corrected fixture debounce/button/select/observer issues rather than changing production behavior to satisfy them. A later null-publication request regression failed and was fixed. Final npm run test:unit passes 364 tests in 20 files; npm run typecheck passes. Strengthened drop tests with changed heights during drag so equivalent-report deduplication cannot conceal premature flushing.

New disposable Chromium fixture /home/sothr/.local/state/terva/scratch/publication-bridge-browser-check.mjs passed on its first run. It verifies real App/Canvas measurements from 176 to 489 scene units, fresh equal-height reuse, measurement-only lineage, A/B/A, drop-preview holds, and identical injected/default positions and manual request bodies. No browser errors or network API requests. Backend responses are fixtures, not persistence/SSE/performance evidence.

Protected 187-file hash remains b7d51eea47db8a5524cb887801fa5f8ef4a3c9ad4058caf87018e471a83bb2ef. Approved scope, prior documents/mockups, allocator/controller, backend, CardView, instrumentation, generated assets and user layout remain unchanged. Tracked/new source whitespace and strict store checks pass; final document/store/hash checks follow this note. Index is empty. No build, just check, staging, commit, push or release. Ticket remains in-progress under its claim, with all end-to-end criteria unchecked. Stop before production activation; next proposal must cover position consumers, pending previews, production obstacles and capture safeguards.

Recorded in session 20260910-205247-e15f8f9e with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index 0.8.2, obsidian 0.2.0, web 0.3.1; gpt-6-astra through openai-codex.

**agent:terva/mieli** at 2026-09-10T21:20:28Z

Wrote the user-requested next bounded proposal at docs/pen-position-consumers-proposal-v1.md, SHA-256 f97abef2569b659d29f0d2b00132a8bbb4a7906b3e157a38937b423d08a7e4e0. It is proposed, not approved for implementation. The last authorized Implementation plan and completed-slice Summary remain unchanged.

Recommendation: explicit opt-in consumer trial with one coherent scene for cards/edges/fit/focus/gestures/capture, identity-owned pending manual overlays using accepted/proposed separation, actual frame-control obstacle sampling, and local plus server capture guards. Default main.ts and existing diagnostic injection remain disconnected from visible pen placement. Guard prerequisites must pass before enabling geometry-dependent trial mutations. Pen-authoring controls and default activation remain outside the slice.

Inspection found frame capture mixing recomputed positions with live heights; server validation currently checks ticket existence, not captured routing inputs. The proposal recommends a versioned whole-board capture token that conservatively rejects some harmless metadata edits, explicitly departing from the historical fine-grained goal. It records that in-process mutexes do not prove atomicity against external file edits. Both tradeoffs require review. Frame title filtered counts can change measured obstacle dimensions, so the proposal requires filter-independent control footprints. It also specifies staging for unpositioned cards, stale/failure handling, current-rule undo versus guarded redo, test-first dependencies, and activation blockers.

Documentation-only verification: all 195 pre-proposal files outside ticket metadata are byte-identical, baseline bb8e7666892173c9852bbe4c740175990078aff35877978f6581bfb9ac9a00fb. This includes code, tests, existing documents, generated assets and user layout. Proposal links/whitespace and tracked whitespace pass; index remains empty. Strict store check follows this note. No production tests, builds, staging, commits, pushes or releases. Ticket stays in-progress with criteria unchecked. Stop here for review before code changes.

Recorded in session 20260910-205247-e15f8f9e with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index 0.8.2, obsidian 0.2.0, web 0.3.1; gpt-6-astra through openai-codex.

**agent:terva/mieli** at 2026-09-10T21:23:44Z

The user explicitly approved: "I approve the capture-token tradeoffs for the opt-in trial only. Record that approval and keep default activation blocked."

Approval covers the capture-token tradeoffs in docs/pen-position-consumers-proposal-v1.md and the subsequent walkthrough, for the opt-in trial only:

- Use a conservative whole-board capture-input token, accepting that some harmless metadata changes will cause conflicts rather than risking an incomplete dependency check.
- Combine server input validation with a separate local scene/measurement guard. The token is neither proof of correct browser geometry nor an authorization mechanism, and it does not replace card/frame preimages.
- Reject stale captures and require a fresh explicit attempt instead of silently recapturing or replaying the operation. Geometry-dependent actions wait for a fresh complete read when no matching token is available; unchanged 304 responses preserve a previously bound token.
- Validate guarded requests within this server's mutation boundary, without claiming atomic protection against external editors or other processes changing files after validation. Hidden byte-identical changes between observations remain undetectable.
- Preserve legacy status-lane client compatibility in the trial. The guarded path must require its token, but this is not a security barrier against deliberately using legacy requests.

Default activation remains explicitly blocked. Passing the opt-in trial does not lift that gate. A later activation decision requires separate user approval and evidence for visible pen/Inbox controls, complete obstacle coverage, position consumers and previews, reviewed external-write concurrency limits, performance, and generated-asset verification.

This records approval of these tradeoffs only. It does not approve the entire position-consumer proposal or authorize implementation in this recording turn. The reviewed proposal remains unchanged; its historical unapproved wording is superseded only for these capture-token decisions. The existing Implementation plan, Summary, in-progress status, claim and all unchecked criteria remain unchanged. No code, tests, assets, user layout, staging, commit, push or release changes.

Recorded in session 20260910-205247-e15f8f9e with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index 0.8.2, obsidian 0.2.0, web 0.3.1; gpt-6-astra through openai-codex.

**agent:terva/mieli** at 2026-09-10T21:27:45Z

The user explicitly approved: "I approve the remaining opt-in trial decisions. Record my approval and keep default activation blocked."

Together with the preceding capture-token approval, this approves the bounded opt-in trial decisions in docs/pen-position-consumers-proposal-v1.md and the walkthroughs. The reviewed proposal's recorded SHA-256 is f97abef2569b659d29f0d2b00132a8bbb4a7906b3e157a38937b423d08a7e4e0. Its historical proposed/unapproved wording is now superseded for this trial scope; the reviewed document itself remains unchanged.

Approved remaining decisions:

- A separate explicit consumer-mode injection for tests and disposable source-browser fixtures. Convert cards, edges/ghosts, fit/focus, gestures and frame capture together to one coherent scene. Preserve diagnostic-only injection and keep the normal entry point disconnected; no URL flag, saved preference or default shadow allocator.
- Stage new cards for noninteractive measurement rather than showing temporary status-lane/origin positions. Provisional geometry does not authorize geometry-dependent frame submission. Placement failure retains honestly marked old lineage, stages new identities, and blocks unsafe spatial actions while allowing pan/zoom and non-spatial inspection.
- Freeze the complete scene throughout gestures. After drop, permit automatic reflow around exact-owner pending manual overlays, with accepted/proposed separation and no persistence of derived neighbor positions. Success/failure clears only matching owners; preserve board/incarnation isolation. Frame operations continue holding automatic reflow until completion.
- Measure actual scene control boxes as obstacles, including wrapped frame titles and external resize handles, with filter-independent footprints. Do not reserve frame interiors or screen-fixed panels, or double-count manual/preview cards. Pen/Inbox controls and complete production obstacle coverage remain later activation prerequisites.
- Bind frame capture to the exact scene and measurements. Distinguish valid empty capture from unavailable capture; invalidate stale capture and require another explicit attempt instead of silent recapture. Preserve filtered/outside membership rules, current-routing null restoration on undo, and guarded redo rather than reuse of stale absolute positions.
- Follow the proposal's staged test-first implementation boundaries: contract/guard tests, obstacle/coordinator work, coherent consumer conversion, guarded spatial mutations only after prerequisites pass, temporary-backend/source-browser verification, actual allocator/evaluator instrumentation, a 120-card trial, and new evidence followed by a review stop. Allocator geometry and PlacementSnapshots semantics remain unchanged; a needed expansion requires review.

The earlier capture-token approval remains in force, including conservative harmless-edit conflicts, separate local/server checks, legacy compatibility, and no claim of cross-process atomicity against external file edits after validation.

Default activation remains explicitly blocked even if every trial test passes. It requires separate user approval and evidence for visible pen/Inbox controls, complete obstacles, reviewed external-write concurrency limits, performance and generated-asset verification. No production build, just check, asset regeneration, staging, commit, push or release is included.

This turn records approval only and stops before implementation. The existing Implementation plan and completed-slice Summary remain unchanged pending the next implementation task. Ticket remains in-progress under its claim, with all end-to-end acceptance and definition-of-done items unchecked. No code, tests, reviewed documents or user layout changed.

Recorded in session 20260910-205247-e15f8f9e with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index 0.8.2, obsidian 0.2.0, web 0.3.1; gpt-6-astra through openai-codex.

**agent:terva/mieli** at 2026-09-10T21:48:22Z

Started the approved opt-in trial with the requested tests-only stage. Added scene.test.ts, capture.test.ts, store-capture.test.ts and internal/api/capture_test.go. New evidence and concrete future API/wire/canonical-input contract: docs/pen-consumer-contract-tests.md. Renewed the existing claim without acceptance-task seeding and replaced the historical bridge plan with the approved trial's current tests-only boundary.

Final npm run test:unit passes all 364 existing tests. Four new store tests execute and fail on missing token state/reset/propagation and stripped capture request data. The conflict case verifies one write and a recovery read before failing on the missing reloaded token. The scene and local-capture suites fail import with zero assertions executed. Strict TypeScript has only three missing-module diagnostics for scene/capture. Corrected fixture-only ReadonlyMap and nullable-frame typing errors; no production stub was added.

Go capture tests compile under -race. All seven top-level groups stop at the missing captureToken on a complete board read, including ten stale-input subtests. Valid guarded controls and deeper malformed/stale/concurrency/expiry assertions remain unreachable. The full API/layout race run reports only these new failures; layout passes. Existing legacy fixture writes succeed. This is an intentional red stage, not verified capture protection.

The contract uses captureToken on complete reads and capture:{version:1,token} on declared guarded layout requests, preserving legacy omission and sparse expectations. The evidence specifies a deterministic whole-board/public-ticket/public-config canonical projection, evaluated presentation values instead of raw clock time, and the acknowledged external-write limit. Default activation remains blocked even after future trial tests pass.

All 196 pre-existing files outside ticket metadata still match a13cff2277add13980613a28a8ca0fb1813c80e22b50cf3b49a29a7118902e55, including inherited production work, main.ts, diagnostic injection, reviewed documents, generated assets and user layout. Whitespace passes and the index is empty; final document/store/hash checks follow. No production edits, build, just check, browser trial, staging, commit, push, release or sub-agent. Keep this ticket in-progress and all end-to-end criteria unchecked. Stop before implementation in this initial contract-test stage.

Recorded in session 20260910-205247-e15f8f9e with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index 0.8.2, obsidian 0.2.0, web 0.3.1; gpt-6-astra through openai-codex.

**agent:terva/mieli** at 2026-09-10T22:00:40Z

Implemented the user-requested pure scene coordinator and pending-preview contracts only. Added scene.ts, nine adjacent regressions and docs/pen-scene-coordinator-implementation.md. All 15 original scene contracts execute unchanged and pass. The coordinator preserves immutable rectangle/obstacle/source lineage, stages missing/recreated identities, fences gesture/frame release, installs exact submission owners before release, accepts overlay-free bases before proposing, and never promotes proposals or invents saved cards on completion. No production caller or diagnostic wiring changed.

Test-first record: reproduced the missing scene import with zero assertions; additional failing regressions exposed unnecessary repeat proposal allocation, incomplete-sample incarnation cleanup and missing obstacle retention. Fixed all three. Two initial failures came from incorrectly requiring explicit fixture obstacles to have DOM-control registrations; pure completeness remains a producer receipt, not proof of production DOM coverage. Renamed a local self parameter after the unchanged platform boundary check flagged it.

Final focused scene/allocator/controller/boundary run passes 71 tests. Full frontend run passes 388 tests, including all 364 pre-contract tests; four inherited store-capture tests fail and local capture still fails its missing module import with zero assertions executed. Strict TypeScript reports only absent capture.ts. Go was not rerun because no backend code changed; previous server missing-token failures remain unresolved. Do not describe full gates or capture protection as passing.

All 201 pre-slice files outside ticket metadata match SHA-256 6b19037e74b9a900a24af53de1aa88a448b1114d1baa12c82724ffc3447e9abd, including original tests, inherited source changes, reviewed documents, main.ts, diagnostic injection, allocator/controller, generated assets and user layout. Whitespace and strict ticket validation pass; final post-record checks follow. Index empty. No build, just check, browser run, staging, commit, push, release or sub-agent launch for this slice.

Local capture, server/store tokens, complete DOM/control sampling, actual consumer conversion and guarded submission/history integration remain later stages. Default activation remains blocked even after future trial success. Keep all end-to-end acceptance and definition-of-done items unchecked and this ticket in-progress. Stop at this bounded pure implementation.

Recorded in session 20260910-205247-e15f8f9e with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index 0.8.2, obsidian 0.2.0, web 0.3.1; gpt-6-astra through openai-codex.

**agent:terva/mieli** at 2026-09-10T22:12:21Z

Completed the requested pure local capture guard slice. Added capture.ts and 14 regressions; evidence is docs/pen-local-capture-implementation.md. CaptureGuard uses exact locally issued receipts and an observed-scene epoch, preserves equivalent publications, invalidates symbol-owner/token/geometry/preimage changes and change-back, distinguishes ready empty capture from unavailable, and prepares immutable sparse frame moves with automatic null preimages. Redo remains a separate scene-bound guard; FrameHistory and all production callers remain unchanged.

Initial capture run failed at the absent import with zero assertions. After implementation 12/13 original cases passed. The last case exposed a previously unreachable fixture error: owned retains the new Inbox pin while hidden returns to automatic in the adjacent slot. Corrected only that expectation and asserted the retained occupant explicitly; allocator/controller/scene/frame semantics remain unchanged. This supersedes the plan's intention to leave every original test unchanged. All deeper redo assertions now execute. The 14 added regressions passed on their first run, not an observed red run.

Final capture tests: 27 passing. Focused capture/scene/frame/platform-boundary run: 76 passing. Strict TypeScript passes. Full frontend: 415 pass, four inherited store-capture failures, no missing-module suites. Store/server tokens and guarded submission integration remain unimplemented. Go was not rerun because backend files are unchanged. No browser/performance/build claim.

Protected 204-file baseline 6bb7a820aa9b14e8e13ba541359c3b84f409e026d680d18f45375f54fa74b365 reproduces after reversing only the exact fixture replacement in memory during hashing; all other 203 files are byte-identical. Reviewed artifacts, user layout, UI/default/diagnostic wiring and generated assets remain unchanged. Whitespace passes and index is empty; final strict store and documentation checks follow. No build, just check, staging, commit, push, release or sub-agent launch. Keep every end-to-end criterion unchecked, ticket in-progress and default activation blocked. Stop after this pure guard slice.

Recorded in session 20260910-205247-e15f8f9e with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index 0.8.2, obsidian 0.2.0, web 0.3.1; gpt-6-astra through openai-codex.

**agent:terva/mieli** at 2026-09-10T22:31:39Z

Completed the requested capture-token transport/server slice. New evidence: docs/pen-capture-transport-implementation.md. Cached board issuance and fresh mutation validation share the captured-image DTO builder and canonical capture-v1 projection. Malformed guards fail 400, stale guards fail 409, and valid guards preserve sparse preimages/read-only checks. Store tokens invalidate at write enqueue and board switch; accepted full reads restore them, and queued conflicts reload without replay. No UI/DOM/history/allocator/default/diagnostic wiring changed.

Reproduced all seven Go capture groups failing at missing tokens before implementation; all now reach their deeper assertions and pass. Three added Go groups pass too. Four added store lifecycle cases failed before store implementation; four further cases passed on their first run. Final frontend result is 427 passing tests across 26 files, including 12 store capture cases. TypeScript, full Go race suite without skips and vet pass. One inherited 304 test required a fixture correction: its unconditional retry had returned the old token-bearing 200 by default; it now explicitly returns a tokenless full response before the later fresh response. Existing 304 retry behavior was preserved. Two test-only missing ETag typing errors were fixed before final checks.

The mutation mutex excludes competing requests through this server, not external writers after authoritative image capture/validation. No browser/performance/build/asset evidence or cross-process atomicity claim. User layout hash remains unchanged and index is empty. Keep all end-to-end criteria unchecked, ticket in-progress and default activation blocked. No staging, commit, push, release or sub-agent launch. Final strict ticket/whitespace checks follow this record.

Recorded in session 20260910-222105-a66a0903 with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; extensions index 0.8.2, obsidian 0.2.0, web 0.3.1; gpt-6-astra through openai-codex.

**agent:terva/mieli** at 2026-09-10T22:42:27Z

The user approved the committed sampling probe slice and requested scope recording before code. New document: docs/pen-committed-sampling-scope-v1.md, SHA-256 85ab7d91166f11c4ef874fd388d31cdbb91ddf57ff57b279c762847f7410f4b5. Linked spec:pen-committed-sampling-v1 and updated the Implementation plan; prior delivered documents and completed transport Summary remain unchanged.

Approved: separate test-only owner/publication-bound immutable card/control receipts, before/after readiness fencing, completeness separate from capture readiness, actual untransformed ordinary-frame title/resize boxes, injected-only filter-stable count slots and fixture-only noninteractive real-card staging. Test-first unit/component and disposable real-source Chromium verification precede a new evidence record and review stop. No diagnostic bridge overload, SceneCoordinator/allocator/PlacementSnapshots integration, position consumers, spatial submission/history, backend expansion or default activation. Default activation remains blocked regardless of future test results.

Recording only; no code/tests/assets changed and no suites/build/just check/staging/commit/push/release/sub-agents ran. Main/HEAD match the handoff and index remains empty. The user confirmed existing generated-asset and user-layout changes are expected and should be preserved. All 210 other pre-recording baseline files remain byte-identical, including source, tests, assets and reviewed documents. User layout changed again externally during recording; the document hash describes its inspection-time value, not a final invariant. This session never edited or staged it. Scope links/whitespace and git diff --check pass; strict store validation follows. Keep ticket in-progress and all end-to-end criteria unchecked.

Recorded in session 20260910-222105-a66a0903 with terva 0.134.6-0.20260910010245-6f36fa1e7be7, commit 6f36fa1, built 2026-09-10T01:05:08Z; index 0.8.2, obsidian 0.2.0, web 0.3.1; gpt-6-astra through openai-codex.

**agent:terva/mieli** at 2026-09-10T23:17:45Z

Checkpoint review at the user's request: docs/pen-checkpoint-verification.md records implemented foundations, the partially verified committed sampling probe, repaired refresh instrumentation, regenerated assets and passing checks. Checked only definition-of-done item 2 after just check and 53 passing embedded browser tests with five opt-in skips; all end-to-end acceptance criteria remain unchecked. This supersedes historical statements that no build/commit is authorized: the user explicitly requested the checkpoint and approved the test-hook fix and asset regeneration. Three draft children now track sampling verification, opt-in integration and the separately approved activation gate; blocks_on children prevents premature parent closure. No default activation, push or release. Runtime identity and extension versions are recorded in the checkpoint document.

## Summary

Checkpoint includes completed schema-3/CAS backend, TypeScript preservation/evaluation, pure allocator/snapshots, measurement publications, optional diagnostic bridge, pure scene/local capture guards and capture-v1 transport. Committed sampling implementation is present with passing unit/component tests, but its final scope audit and real-source browser evidence remain unfinished. Fixed the refresh instrumentation hook after reproducing two failures and regenerated stale dist with explicit user approval. just check passes: 446 frontend tests, 65 tooling tests, TypeScript, Go race/vet/format and strict store validation. Embedded browser suite passes 53 tests with five opt-in measurement skips. Evidence: docs/pen-checkpoint-verification.md. Three draft children track sampling verification, opt-in integration and default activation. Parent stays in-progress, end-to-end criteria unchecked and default activation blocked.
