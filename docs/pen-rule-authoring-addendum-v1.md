# Pen rule authoring addendum v1

Status: approved by the user before implementation.

For TKT-01M2441T0PTXRFK6VC4FM1PET7 (Route automatic tickets to label-matching canvas pens).

The user approved the proposal with: "I approve nonempty rules and the proposed
label-entry controls. Record these decisions in a new addendum before making code
changes."

This addendum resolves the empty-rule and general label-entry choices left open in
[the implementation plan](pen-implementation-plan-v1.md). It supplements
[the pen specification](pen-specification-v1.md),
[the one-pen mockup](mockups/pens-v1.html), and
[the competing-rule mockup](mockups/competing-pens-v1.html).
Those reviewed artifacts remain unchanged. Their statements that these authoring
choices are unresolved are superseded by this addendum, not silently edited.

## Nonempty rules only

Every accepted pen rule requires at least one distinct label. An empty rule is
invalid, not a catch-all. Inbox remains the built-in fallback for unmatched
automatic cards.

- A new pen draft may temporarily contain no required labels.
- Preview and Apply remain disabled until the draft has at least one distinct
  required label.
- Removing the last requirement shows an inline error: "Add at least one required
  label. Unmatched automatic cards go to Inbox."
- Existing accepted routing remains active while a draft is invalid.
- The API rejects an empty rule without writing anything.
- A hand-edited board containing an empty rule reports an invalid layout. Do not
  interpret it as catch-all, silently disable it, or delete it.

An empty conjunction would otherwise match everything, introducing a second
fallback mechanism and making clearing a field reroute unmatched cards. Any future
catch-all pen must be an explicit feature rather than an empty-field side effect.

## Required labels field

Use a token-based field labelled "Required labels" with this explanation:

> Tickets must have every label below. Additional ticket labels are allowed.

Selected labels appear as individually removable tokens. A text input beneath the
tokens offers searchable suggestions.

### Suggestions and exact identity

- Combine configured labels and labels currently used by tickets as suggestions.
- Show their source where useful: "Configured", "Used on tickets", or both.
- Search suggestions without regard to case, but preserve the exact spelling and
  case of the selected label. Matching remains exact and case-sensitive.
- Enter selects the highlighted suggestion.
- When no suggestion is selected, offer an explicit `Use "typed label"` action.
  This permits a rule to require a label not yet configured or present on a ticket.
- Do not split pasted text on commas or spaces. One label must not silently become
  several requirements.
- Reject blank input. Strip accidental leading/trailing whitespace from new entries,
  but do not otherwise rewrite label text.

A custom requirement changes only the pen rule. It does not create a configured
label or modify any ticket. Do not apply new-entry trimming as a silent migration
of existing authored requirements or exact suggestion identities.

### Duplicates, specificity, and unused labels

Adding an already selected exact label does not add another token or increase
specificity. Show feedback such as: `"frontend" is already required.`

Display specificity beneath the field, for example: "2 distinct required labels".
The existing distinct-label matching policy also applies to repeated requirements
received outside this control.

Retain a selected label that is neither configured nor currently used. Warn, for
example:

> "backend" is not currently configured or used. This rule will match tickets if
> that label appears.

Do not remove it automatically when configuration or ticket contents change.

### Keyboard and accessible feedback

- Arrow keys navigate suggestions; Enter selects.
- Escape closes suggestions first. A later Escape can cancel the pen preview.
- Give each token's remove button an accessible name, such as "Remove required
  label frontend".
- Backspace in an empty input does not immediately delete a requirement.
- Make validation and duplicate feedback available to screen readers.

## Preview and Apply

Token editing changes only the draft. Preview evaluates the complete valid draft
and shows:

- Automatic cards changing destination.
- Manual cards whose potential winning rule changes while their positions stay fixed.
- New or changed overlaps.
- The distinct-label count and resulting specificity.

Apply saves exactly the draft that was previewed. Further edits require a new
preview; they cannot silently change what Apply submits. An invalid draft cannot
reuse an earlier valid preview to enable Apply.

Keep explicit tie-order controls separate from label entry. Adding a distinct
required label changes specificity; moving a rule earlier affects equal-specificity
ties only. Neither action changes ticket labels or ordinary-frame membership.

## Implementation and verification consequences

Use these decisions when implementing the existing plan's schema validation,
API validation, rule form, and preview ownership. Add tests for:

- Empty-rule rejection through the API and board parser, with no disk write or
  silent repair; legacy boards with no pens remain valid.
- Empty and last-token-removed drafts disabling Preview and Apply while accepted
  routing remains unchanged.
- Exact identity despite case-insensitive suggestion search, source annotations,
  explicit custom entries, blank rejection, and new-entry whitespace handling.
- Pasted labels containing commas or spaces remaining one requirement.
- Duplicate feedback and unchanged distinct-label specificity.
- Retention and warning for labels that become unconfigured and unused.
- Arrow/Enter interaction, Escape precedence, named removal controls, safe empty-
  input Backspace behavior, and accessible feedback.
- Post-preview edits invalidating Apply until a new valid preview, including edits
  that change overlaps or affect manual cards' potential destinations.
- No ticket-label or configuration mutations from rule authoring.

These are future implementation checks, not evidence that production code already
satisfies them. The ticket remains in progress under its existing claim. This
request authorizes recording the decisions only; no code changes, staging, commit,
or push are part of this addendum task.

## Record provenance

Recorded after explicit user approval in session `20260910-013410-55c12f2e`.
Source baseline: `12601fa808e8eaf06308630e70a20669ea3f4260`.

terva `0.134.6-0.20260910010245-6f36fa1e7be7`, commit `6f36fa1`, built
`2026-09-10T01:05:08Z`. Extensions: index `v0.8.2`, obsidian `v0.2.0`, web `v0.3.1`.
