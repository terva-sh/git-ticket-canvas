# Proposal for an opt-in placement-consumer trial

Status: proposed, not approved for implementation.

For TKT-01M2441T0PTXRFK6VC4FM1PET7 (Route automatic tickets to label-matching canvas pens).

The user requested this next bounded proposal and explicitly said to stop before code changes. This document changes no implementation authority. The [test-only publication bridge](pen-publication-bridge-implementation.md) remains the latest implemented slice. Its diagnostic-only contract and the normal entry point remain unchanged.

## Recommendation and stopping point

Build an explicitly injected placement-consumer trial in the real App, exercised only by tests and disposable source-browser fixtures. In that trial, one committed scene snapshot would supply visible positions, dimensions and spatial actions. Add identity-owned pending manual overlays, derive obstacles from actual scene controls, and protect frame operations that depend on captured automatic geometry.

Keep `web/src/main.ts` disconnected. Do not add a URL flag, persisted setting, operator toggle or default shadow allocator. Preserve the existing diagnostic bridge mode separately; injecting a diagnostic observer must not start moving cards. A new explicit consumer-mode injection is required.

This is not the pen-authoring UI or a release. It ends with opt-in integration evidence and a review of the remaining activation blockers. Default activation requires a separate proposal, including visible pens/Inbox and their complete controls, performance evidence, and generated-asset verification.

The work has a mandatory dependency order:

1. Specify and test scene/preview contracts and capture guards.
2. Implement obstacle sampling and the opt-in scene coordinator.
3. Switch all listed consumers together in opt-in mode.
4. Enable guarded spatial mutations in that mode only after the guard tests pass.
5. Verify the source-browser trial, write evidence, and stop.

Do not expose a partially converted mode where cards use pen positions but fit, edges or frame actions still use status lanes. Keep spatial mutations disabled in the trial until their prerequisites pass.

## Inspected gaps

| Source | Current mechanism | Proposed change in consumer mode |
| --- | --- | --- |
| `Canvas.tsx` `positions()` | Runs `autoPlace` during render and imperative operations; overlays gesture positions and local saves. | Read a prepared scene map. No matching/allocation during render or imperative reads. |
| `CardView` and `Edges.tsx` | Share positions, but edges use the measurement hook's live heights and a separate 110-unit fallback. | Read positions and dimensions from the same scene generation. Preserve pinned flags and z-order independently of allocation geometry. |
| `fit()`, `focus()` | Recompute positions; fit reads live `offsetHeight`, while focus uses another fallback. | Use one scene extent/height source. Viewport calculations remain separate. |
| Pointer handlers | Freeze positions, then apply movement deltas; `release()` calls busy false before drop previews are installed. | Freeze the scene, including dimensions and control geometry. Install ownership/fencing before any settled calculation can resume. |
| `captureFrame()`, `framePositions()` | Capture mixes recalculated coordinates with fresh DOM heights; frame movement consumes that coordinate map. | Return an explicit, generation-bound capture result or unavailable state. Never substitute an empty capture for unavailable geometry. |
| `autoPlace` in Arrange | Explicitly computes status lanes and saves every result. | Retain as an explicit manual operation, not automatic pen placement or bulk unpinning. |
| Frame title/resize controls | Title wraps at `top: -18px`; resize handle extends outside the frame. Title text includes filtered counts. | Measure actual control boxes in scene units; reserve them without treating frame interiors as obstacles. |
| `PublicationBridge` | Immutable fixture obstacles; empty previews; `activate`/`accept` only. | Keep this diagnostic contract. A consumer coordinator owns dynamic obstacles and proposed overlays. |
| `FrameHistory` | Guards saved cards, frame preimages, membership and ticket presence. | Add local captured-scene checks for operations that materialize automatic coordinates, especially redo. |
| `RoutingTransaction` / `validateFrameTickets` | Reloads layout and checks card/frame/routing preimages; API checks referenced ticket existence. | Add a server-verifiable capture-input precondition for the new guarded path. Local bridge tokens are not server preconditions. |

The existing 364-test result proves the diagnostic bridge, not any of these proposed changes.

## 1. One scene snapshot for every position consumer

Introduce a Preact-free scene envelope with explicit lineage:

- Store identity, board, App generation, accepted publication baseline and placement-input revision.
- Accepted placement snapshot, current ticket incarnation map and committed measurement/control sample identity.
- Read-only positions and dimensions for the complete ticket collection, including filtered tickets.
- Display mode: accepted, gesture-frozen, pending-manual-overlay, or unavailable/stale.
- Preview ownership and readiness sufficient to reject a stale spatial command.

A pure projection may overlay captured gesture deltas or already-owned manual positions. It must not invoke the allocator. Engine content is immutable; UI pinned/z values do not mutate it.

Convert this complete consumer set in the injected mode:

1. Card transforms, pinned presentation and z-order.
2. Dependency/parent edge endpoints and link ghost origin.
3. Fit extents and focus target.
4. Pointer-down freeze, multi-card drag and frame-member movement.
5. Frame-create center capture, capture counts, numeric frame movement and redo preparation.

Screen-to-scene conversion for pan, zoom and clicked-position creation remains view math. Link target lookup can still use DOM hit testing, but it must resolve a current scene identity. Arrange is the only remaining automatic status-lane calculation in consumer mode; its results are explicit manual writes with the existing confirmation strengthened to say so.

### Startup, new tickets and failure

Do not bootstrap by showing status lanes and then silently moving cards into pens. Register new cards in a noninteractive measurement staging area using the real card content/CSS, hidden with visibility rather than `display:none`. Staged cards have no usable spatial position, cannot be captured, and do not create a second registration for an already displayed card. Promote them only when a complete scene is ready. This requires explicit DOM/measurement tests before implementation.

For a registered card with no valid height, the allocator's existing marked 340-unit fallback can produce a provisional scene. It is not safe capture evidence. Disable geometry-dependent frame submission until relevant measurements and all collision inputs are valid and current.

On calculation failure, retain the last-good scene with its original lineage and a visible stale/unavailable notice. Keep new identities staged; never give them fabricated origin coordinates. Permit pan/zoom and non-spatial inspection, but disable spatial writes and capture while the scene does not match the current accepted publication. On first-load failure show no positioned automatic scene. A later valid input recovers without writing coordinates.

This trial's failure presentation is proposed behavior, not a claim that old-lineage diagnostic snapshots are already suitable for display.

## 2. Pending previews are owned overlays, never accepted state

Keep accepted placement separate from gesture and submitted-save state. Use the controller's existing `propose`/`cancel` operations for trial overlays; do not modify allocator geometry or accepted/proposed cache semantics.

Each pending manual placement records board/App generation, full ticket incarnation, unique operation owner, exact submitted card object and source scene. Two saves for the same ID must not share an owner. DOM registration identity is not ticket identity.

Proposed lifecycle:

| Event | Required behavior |
| --- | --- |
| Gesture start | Capture one complete scene and advance the fence. No allocation throughout the gesture. |
| Drag motion | Apply deltas to the frozen scene only. Do not reroute neighboring cards under the pointer. |
| Drop | Install the submitted manual overlay and its owner before releasing the placement hold. Keep the existing request's captured board and manual coordinates. |
| First settled commit with pending saves | Sample current dimensions/control geometry and calculate a proposal using the complete active manual-overlay set. Pending cards are fixed obstacles; other automatic cards may move around them. |
| New accepted publication while saves remain | Accept only the new base without previews, then recompute the current proposal against it after commit. Never promote proposal slots to the accepted cache. |
| Save success | Publish the actual response, remove only that save's matching overlays, then recompute the remaining overlay set. Do not assume a successful request is the latest owner. |
| Save failure | Remove only matching overlays, retain error feedback, and return to the latest accepted base plus any newer overlays. Never persist proposal results. |
| Board switch / incarnation change | Remove old-scope display overlays; submitted saves still finish on their captured board. Their completions cannot alter the new scene or a recreated ticket. |
| Cancellation before submission | Clear gesture/proposal ownership with no write. Closing a panel cannot cancel an already submitted save. |

The controller currently has one proposal owner. Represent all active per-card owners as one immutable overlay-set token for that proposal; do not let independent calls overwrite one another's proposals. An old cancellation must not clear a newer overlay set. A measurement/obstacle change first advances the accepted base input revision without previews, then proposes against that exact accepted revision. `propose` must not be used to bypass the controller's baseline/revision checks.

Frame operations remain a full hold in this slice. Their existing explicit frame/card preview can project over the frozen scene, but automatic neighbor reflow waits for frame completion. Do not combine frame requests and pending card saves or add pen-edit previews here.

A failed proposal leaves accepted lineage untouched. Continue displaying the explicit submitted manual overlay over the frozen last-good base with pending/error feedback; mark this projection unsuitable for new capture. Do not present it as a collision-free proposed snapshot.

## 3. Derive obstacles from production scene elements

Add a dedicated owner-scoped control measurement hook rather than pretending fixture rectangles describe production controls. Pair its sample with card sampling and the exact rendered publication. Use stable namespaced IDs for controls and reject incomplete/stale registration sets.

Reserve these actual scene-space border boxes:

- Ordinary-frame title buttons, including wrapped text.
- Ordinary-frame resize controls, including the portion beyond the frame boundary.
- Eventually, every rendered pen/Inbox title, action control and pin affordance. There are no such production components yet, so this trial must not claim their obstacle coverage is complete.

Manual cards and pending manual cards are already allocator inputs. Do not also add them as generic obstacles. Ordinary-frame and pen interiors, borders without controls, selection outlines, edge paths and drag ghosts are not exclusion rectangles. Screen-fixed toolbar, inspector, composer and notices affect the viewport or pointer exclusions, not world-space occupancy. Panning must not move automatic cards to avoid an inspector.

Use untransformed offset geometry relative to the scene/control owner, not zoomed client rectangles. Measure controls after commit, freeze copied rectangles, and advance obstacle revision only for effective geometry or registration changes. Preserve finite-coordinate validation. Let the allocator apply its existing 24-unit spacing once; do not inflate rectangles and then apply the gap again.

### Avoid filter-driven allocation

Current frame title text changes with the filtered-member count and can wrap. That means naively measuring it would make filtering change obstacle geometry and invoke allocation. In consumer mode, separate the variable filtered-count indication from the reserved title box, with a fixed-size presentation that cannot expand its collision footprint. Tests must prove that selection, filtering, pan and zoom leave the obstacle revision and allocator count unchanged. Do not silently clip interactive controls to make the test pass.

Changing a frame title, frame bounds, theme/font metrics or actual control dimensions may legitimately change obstacles and placement after commit. Hold those changes during gestures. Tests must include long titles, narrow frames, read-only handles, font-size changes and board remounts.

No pen editor, rule-order UI, pin dragging or removal UI is included. Tests can supply schema-3 routing through fixture boards. Production activation stays blocked until visible pens/Inbox and their control obstacles have separate implementation evidence.

## 4. Capture safeguards before enabling spatial writes

There are two different guards. Neither replaces the other.

### Local scene guard

Capture returns a result containing the exact scene identity, measured rectangles and selected member IDs, not just an ID array. Bind preview and submission to the same result. Recheck immediately before submission that:

- Board, store, App generation, ticket incarnations and accepted baseline still match.
- No gesture, pending manual overlay, frame request, failed placement or unpublished store state remains.
- Committed card/control measurements still match the captured geometry; no provisional collision input remains.
- Frame ownership and authored card/frame preimages still match.

If any check fails, invalidate the draft's capture and require a fresh explicit preview/submission. Do not quietly recapture another member set when the user presses Create. A genuinely empty capture remains valid and differs from an unavailable capture. Center inclusion stays inclusive, includes filtered cards, and excludes already assigned cards as `captureMembers` does now.

Grouped movement includes every explicit member, including hidden/outside members. Manual members use accepted saved coordinates; automatic members use captured scene coordinates. Membership-only edits remain position-free. This guard also protects frame redo that would turn an automatic member into a saved coordinate.

Undo of a move that originally had automatic members must still write null and restore current routing. A label/rule change while that member is manual must not block that restoration merely because its future destination changed. Redo is different: after undo, record the current automatic starting scene and invalidate redo if an observed placement/identity change occurs before reuse, including change-then-change-back. Do not blindly reuse historical absolute coordinates against a changed starting scene.

### Server capture-input guard

Propose a new, versioned, opaque capture-input token issued with complete board reads. Keep it distinct from the complete-response ETag and the bridge's local baseline. The request would carry the token alongside existing card/frame expectations for a declared geometry-dependent operation. It is a concurrency precondition, not proof that the server computed browser geometry.

For a first guard version, recommend a conservative whole-board read set:

- Complete authored cards, frames and routing, with record-set membership so newly inserted obstacles cannot escape sparse expectations.
- Complete ticket ID/creation/revision set so additions, deletions, label changes and changes that affect card dimensions invalidate capture.
- Relevant configuration and derived card-presentation values used to render card/control content, including time-dependent readiness indicators. Specify the versioned canonical projection before coding; ticket revision alone does not cover those values.

The server computes and compares this projection from fresh authoritative inputs at the mutation boundary, before applying any sparse changes. Do not rely on a watcher cache that may lag disk. Keep request-body reads and response network writes outside the lock. Do not call a snapshot helper recursively through locks it already holds.

This conservative choice deliberately rejects some harmless metadata edits. It is broader than the historical plan's desired fine-grained guard. Approval should explicitly accept that tradeoff for the trial; do not call it minimal invalidation. A future narrower projection needs field-by-field evidence that excluded inputs cannot change placement. No server allocator, browser heights or derived positions are persisted.

Add the token to store publication lineage. A 304 preserves its previously accepted token. A mutation response that cannot supply a matching fresh token leaves geometry-dependent actions unavailable until a complete read; it must not borrow a token from older state. Reuse `layout_conflict` and the current reload-without-replay behavior for mismatch. Malformed guards fail before mutation. Guard fields do not enter YAML or frame undo history as historical values.

For compatibility, the new precondition is mandatory for the opt-in consumer path's geometry-dependent commands, not retroactively required of legacy status-lane clients in this slice. The declared guarded path must reject missing/invalid tokens. Keep the unchanged normal path's request semantics under regression tests. This is not a security barrier against clients that deliberately submit legacy requests.

### Concurrency limit and required stop

The inspected `s.mutations` and layout writer mutexes serialize this server's work. They do not prove exclusion against a second process or an editor changing ticket Markdown after validation. The implementation must document the exact read/validate/write boundary and test changes before validation plus competing requests through this server.

Do not claim cross-process atomic capture protection from those mutexes. If the trial needs a stronger guarantee, stop and propose a shared locking or transactional storage contract; do not add one as an incidental guard refactor. Default activation remains blocked until this concurrency limit is reviewed explicitly. A byte-identical delete/recreate hidden between observations also remains undetectable under the current identity model.

## Proposed file boundary

These are candidates for a later approved implementation, not permission to edit them now:

- New pure scene/overlay/capture contract modules under `web/src/platform/canvas`, plus adjacent tests.
- `App.tsx`, `Canvas.tsx`, `canvas/Edges.tsx`, measurement hooks, and narrowly scoped card staging/registration wiring.
- Frame control markup/CSS only for complete obstacle registration and filter-independent footprints.
- `FramesPanel.tsx` for explicit capture validity and disabled submission, not a panel redesign.
- `platform/canvas/frames.ts` for local automatic-capture/history guards; preserve membership semantics and null inverses.
- Ticket types/client/store and API DTO/board response code for capture-token lineage.
- `internal/api` and `internal/layout/frames.go` only for guarded validation at the existing transaction boundary; no schema change or persisted automatic positions.
- New source-browser fixtures and narrowly scoped instrumentation that counts allocator/evaluator work as well as retained legacy Arrange calls.

Keep allocator geometry/search and `PlacementSnapshots` semantics unchanged. A needed controller change is a new review point. Do not overload the existing diagnostic injection to activate consumers. Do not rewrite reviewed documents, change user layout, or regenerate assets.

## Tests before implementation

Write and execute red tests per dependency stage, then implement only that stage. A missing import is not evidence that deeper assertions ran.

| Area | Required passing evidence before proceeding |
| --- | --- |
| Scene coherence | Cards, edge/ghost endpoints, fit/focus, gesture freeze, capture and frame movement agree on one lineage and dimensions; no render/imperative-read allocation. |
| Bootstrapping/failure | New tickets stage without fake visible coordinates or duplicate registrations; provisional inputs block capture; last-good failure keeps honest lineage and recovers without writes. |
| Pending saves | Changed measurements and deferred publications during drag/drop; two owners on one card; out-of-order success/failure; board A/B/A; recreated IDs; proposal failure; exact owned cleanup. |
| Obstacles | Actual wrapped frame title and external resize boxes, no frame-interior exclusion, manual/preview collision inputs counted once; filters/selection/viewport changes cause zero layout work. |
| Capture | Empty versus unavailable, filtered/outside members, invalidated preview cannot submit, stale dimensions, whole-record insertions, current-rule undo, blocked stale redo and change-back history. |
| Server guard | Valid token positive control; missing/malformed/stale token refusal; concurrent label/routing/manual/control-source changes; ticket/obstacle insertion/deletion; atomic no-partial-write conflict; harmless edits conservatively rejected as documented. |
| Default isolation | Normal entry invokes no consumer coordinator; existing rendering and mutation tests pass; legacy layout/frame clients remain compatible. |

After focused tests, run the full frontend suite, strict TypeScript, full Go race tests and vet if guard code changed, strict ticket validation and whitespace checks. Use a disposable real-App source browser fixture with a temporary backend/store for guarded mutations, never the user's `.tickets/canvas/default.yml`. Include real pointer interactions, fresh equal-height sampling, controls, failure recovery and no browser errors.

Measure actual evaluator/allocator calls. Existing `data-placement-calculations` and legacy `autoPlace` instrumentation cannot alone prove the new engine does zero work. Add a source 120-card consumer trial retaining the inspector-rerender guard. Do not label it embedded-asset verification.

No `just check`, production frontend build, staging, commit, push or release is included. A later release/activation proposal must name those gates explicitly.

## Review decisions and activation gate

The recommendation asks for approval of these choices together:

- An explicit opt-in consumer trial, not default activation.
- Post-drop automatic reflow around owned pending manual saves, with accepted/proposed separation; frame operations continue to hold reflow.
- Actual control-box obstacles and filter-independent control footprints; no frame-interior obstacles.
- Explicit capture invalidation rather than silent recapture, with provisional/stale geometry blocking spatial writes.
- A conservative whole-board server capture token for the trial, acknowledging harmless-edit conflicts and the cross-process limit.

Passing this trial is necessary but insufficient for production activation. That later work depends on this evidence, visible pen/Inbox behavior and controls, complete obstacle coverage, reviewed capture concurrency limits, and source/embedded performance and build verification. Do not promote activation work based only on queue order or passing pure-engine tests.

The existing ticket stays in progress under its claim. Its end-to-end criteria remain unchecked. This proposal does not replace the last authorized Implementation plan until the user approves implementation.

## Documentation-only verification and provenance

Inspected the original uncommitted `main` tree at `12601fa808e8eaf06308630e70a20669ea3f4260`. Before writing this proposal, the 195-file baseline excluding ticket metadata but including user layout was SHA-256 `bb8e7666892173c9852bbe4c740175990078aff35877978f6581bfb9ac9a00fb`. The final documentation check must reproduce it while excluding this new proposal only. Existing tests are historical evidence from the previous phase and are not rerun as proof of this unimplemented design.

Recorded in session `20260910-205247-e15f8f9e` with terva `0.134.6-0.20260910010245-6f36fa1e7be7`, commit `6f36fa1`, built `2026-09-10T01:05:08Z`; extensions index `0.8.2`, obsidian `0.2.0`, web `0.3.1`. Model `gpt-6-astra` through `openai-codex`.
