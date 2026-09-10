# Label-routing pens v1

Status: interaction policies approved by the user; specification for mockup review.
This approval does not promote the ticket or authorize implementation.

Tracks TKT-01M2441T0PTXRFK6VC4FM1PET7 (Route automatic tickets to label-matching
canvas pens). Its dependency is TKT-01M24411DDC98WXKT2MY2FMHQN (Add persistent
canvas grouping frames), now complete.

This specification records the policies approved after the frames v1 walkthrough.
It supersedes conflicting pen recommendations in
[the historical canvas organization design](canvas-organization-design.md),
including the description of a pen as an ordinary frame with an arrival pin and
rule. That historical document remains unchanged.
[The approved frames v1 specification](frame-specification-v1.md) also remains
unchanged. Pens must preserve its explicit membership and grouped-movement contract.

## Purpose and scope

A pen routes automatic cards using required independent labels. It has its own
board record, rectangular preferred layout area, arrival pin, and rule. Reuse
rectangle rendering where useful, but distinguish pen controls from frame controls.
A pen is not an explicit membership group.

Provide board-local Inbox fallback, winning-rule explanations, manual override,
Return to automatic placement, stable in-memory slots, visible overflow, and
previewed pen edits. Persist authored pen geometry, pins, and routing rules, never
derived automatic card coordinates. Spatial actions never edit ticket labels,
Markdown, dependencies, or parent/child relationships.

First validate one pen, Inbox, manual override, and an ordinary frame together.
Only then expand to competing rules. The first version excludes conversion of
frames into pens and attachment of pen rules to existing frames.

## Frame membership, routing destination, and placement mode

These are independent properties on each board:

| Property | Authority |
| --- | --- |
| Frame membership | Initial frame capture, followed by explicit add/remove/transfer |
| Routing destination | Current labels and the winning pen rule, otherwise Inbox |
| Placement mode | Automatic unless a saved manual coordinate overrides it |

Frame membership alone does not override routing. Capturing or assigning a card
to a frame remains a membership-only operation: it neither moves the card nor
makes its placement manual. A card can belong to at most one ordinary frame.
Pen assignment does not consume that membership or transfer it.

An automatic frame member may route outside its frame after a label change. It
remains a member, including for later grouped movement. Explain both facts in the
UI, for example: "Member of Release work. Automatically placed by Frontend bugs."
A manual card should explain that saved placement overrides routing.

Moving an ordinary frame translates every explicit member, including filtered and
outside members, and saves those positions as manual. Subsequent label or pen
changes must not move them. Resizing an ordinary frame changes only its boundary;
deleting it removes assignments without moving cards.

## Matching and equal-specificity ties

A rule matches when the ticket has all its distinct required labels. Additional
ticket labels are allowed. Repeated requirements do not increase specificity.
Among matching rules, the rule with the most distinct required labels wins.

Break equal-specificity ties using explicit, visible, editable rule order. The
earlier rule wins. Never use file iteration order, creation time, or spatial
position as hidden precedence. Warn about overlapping equal-specificity rules
and explain the winning rule and matching labels.

For example, a ticket matching both `frontend + bug` and `frontend + urgent`
uses rule order because both rules require two labels. Reordering rules previews
affected automatic cards before Apply.

## Placement, stability, and overflow

At each accepted store update, reevaluate automatic routing, including new tickets
and label changes. Preserve manual placements and their pending previews. Calculate
and publish a placement snapshot outside rendering. Rendering, filtering, pan, and
zoom do not invoke layout calculation.

Use spaced collision-aware slots that account for card dimensions, pin controls,
and frame headers. Preserve valid in-memory slots across unrelated updates. New
arrivals use available slots. Fresh loads reconstruct deterministically; only
manual coordinates promise exact durable positions.

Fill available slots inside the pen first. If the preferred layout area is full,
use a deterministic spill area outside its boundary and show an overflow count.
The boundary is not a containment guarantee. Do not silently enlarge it, overlap
cards, move manual cards to make room, or send matching overflow cards to Inbox
merely because their pen is full. Avoid collisions with manual cards and other
automatically placed cards. Filters do not free occupied slots.

Exact slot spacing, spill direction, and placement algorithm remain implementation
and mockup details. They must satisfy these policies; this document does not select
an algorithm before code inspection.

## Pen operations and Inbox

| Action | Approved effect |
| --- | --- |
| Move pen | Preview moving its boundary and arrival pin, and rerouting assigned automatic cards |
| Resize pen | Preview the revised automatic layout within the new preferred area and overflow |
| Move arrival pin | Preview affected automatic placements before Apply |
| Edit rule or rule order | Preview affected automatic destinations and positions before Apply |
| Delete pen | Preview removal and reevaluate automatic cards against the remaining rules |
| Drag a card across a pen boundary | No label or routing-rule change; a completed card drag expresses manual placement |

Pen edits never relocate manual cards or alter explicit frame membership.

On pen deletion, each affected automatic card uses its next winning rule, if any,
or Inbox. Preserve labels, frame membership, and manual coordinates. Do not treat
pen deletion like ordinary frame deletion: automatic routing must be reevaluated.

Inbox is visible, board-local, movable through a preview, and non-deletable. It
receives unmatched automatic cards. Rules and saved manual placement on one board
do not determine placement on another board.

## Counts and selection

A pen counts automatic cards whose winning destination is that pen. Include
filtered cards and overflow cards. Exclude manual cards, cards that merely lie
inside the boundary, and cards assigned to another winning rule.

Use wording such as "8 automatic · 2 blocked · 3 overflow". Selecting a pen
highlights the same assigned set, not spatial enclosure or every label match.
Ordinary frame selection continues to highlight explicit frame members.

Defer new-arrival counts. They need a separate seen/unseen definition and must not
be inferred from manual placement or the current viewport.

## Manual intent, creation, and Arrange

Existing saved coordinates remain manual when loading older boards. Loading and
recalculating placement must not write automatic coordinates.

- Creating a ticket at a clicked position expresses manual placement.
- Creating a ticket without a position leaves it automatic.
- Return to automatic placement removes the saved coordinate and evaluates current
  routing rules. It preserves explicit frame membership. A failed removal retains
  manual state and reports the failure.
- Selection and cancelled gestures do not save coordinates.
- Arrange retains its current meaning as an explicit manual layout action. Its
  confirmation must explain that it places all cards in status lanes and overrides
  automatic routing. Do not silently redefine it as a bulk return to automatic.

A separate bulk return-to-automatic command is outside the initial scope.

## Gestures, previews, and save boundaries

Freeze placement during a drag. Defer incoming updates until completion or
cancellation. On completion, apply the new manual placement before routing the
remaining automatic cards. Preserve captured-board saves, board generations,
stale-response guards, identity-owned previews, and failure rollback. A stale
response must not unpin a just-moved card.

Pen changes use Preview, Apply, and Cancel. Cancel discards uncommitted changes.
Once submitted, a save continues even if its panel closes; pending feedback must
say so. Failed saves must not leave false persisted success or previews presented
as accepted state. Read-only mode blocks pen and placement mutations.

## Frame undo interaction

Keep frame-only history and its existing per-board tab-session lifetime. Pen edits
must not appear under Undo frame. Pen-edit undo is explicitly outside the initial
slice; do not expand frame history implicitly.

When undo restores a formerly automatic frame member, remove its manual record
and return it to current automatic routing. Do not store its old automatic
coordinates as a manual placement. Preserve the existing conflict-blocking policy
for relevant later changes; neither undo nor redo may overwrite newer positions
or partially reverse grouped movement.

The detailed treatment of routing-related changes in conflict checks must be
worked through during implementation inspection and tested against that contract.
Approval of current routing on restoration does not authorize bypassing frame
conflict protection.

## Required interaction example

The first mockup and implementation slice must demonstrate this sequence:

1. An automatic card matches Frontend and routes there.
2. Add it to the Release work frame. It does not move or become manual.
3. Change its labels so it no longer matches Frontend and routes to Inbox. It
   remains a Release work member.
4. Move Release work. The card moves with it, even from outside the boundary,
   and becomes manual.
5. Further label changes do not move it.
6. Return the card to automatic placement. It routes using its current labels
   and remains a Release work member.

When expanding to multiple pens, repeat the approved walkthrough's Frontend-to-
Backend transfer in place of the Inbox fallback. In both slices, also demonstrate
frame undo restoring automatic placement without manufacturing manual coordinates,
and relevant conflicts blocking reversal.

## Persistence and compatibility

Pens, rules, explicit rule order, and Inbox geometry are authored board data.
Automatic assignments and slots are derived state. Preserve existing frame
records, explicit membership, and saved manual coordinates. Do not rewrite boards
merely by reading them or add automatic coordinates to their sparse card maps.

Choose the precise versioned persistence schema and API mechanisms after promotion,
claim, and code inspection. Round-trip authored data deterministically, quote
YAML-sensitive identifiers, and protect newer layouts from unsupported writers.
Preserve read-only behavior and full-state recovery across board switches and
save failures. No schema number or migration implementation is approved here.

## Mockup and promotion gate

The user approved these interaction policies, not an implementation or a mockup.
Keep the ticket in draft and unclaimed while preparing the first mockup.

The next approval artifact should show one pen, Inbox, manual override, and an
ordinary frame, including outside membership, spill, counts, removal, preview
cancellation, pending saves, and keyboard-usable controls. Validate this slice
before expanding to competing rules, tie-order controls, and overlap explanations.

Promotion remains a separate user decision. Do not write an implementation plan
until after promotion, claim, and code inspection.

## Verification expectations

Tests and evidence must cover matching, distinct-label specificity, explicit ties,
Inbox, stable slots, collisions, overflow, filtered counts, label changes, reloads,
manual override, failed unpinning, pen removal, Arrange and creation intent,
frame membership independent of routing, grouped manual movement, frame undo,
preview cancellation, save failures, read-only mode, and board/drag update races.
Preserve the existing 120-card responsiveness guard.

Implementation completion still requires `just check`, embedded browser checks,
and regenerated frontend assets. No implementation criteria are satisfied by
this policy record alone.

## Record provenance

Recorded by Mieli in session `20260910-013410-55c12f2e` after explicit user approval
of the pen-policy walkthrough. Source baseline: `12601fa808e8eaf06308630e70a20669ea3f4260`.

terva `0.134.6-0.20260910010245-6f36fa1e7be7`, commit `6f36fa1`, built
`2026-09-10T01:05:08Z`. Extensions: index `v0.8.2`, obsidian `v0.2.0`, web `v0.3.1`.
