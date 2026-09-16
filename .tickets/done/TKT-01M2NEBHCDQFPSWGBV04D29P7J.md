---
schema: 3
id: TKT-01M2NEBHCDQFPSWGBV04D29P7J
title: Lead the account dialog with the groups that matter
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - auth
  - multiuser
  - ui
assignees: []
milestone: null
parent: TKT-01M2MEAP8ED8NZYGJKN2002G6J
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T15:46:20Z
updated_at: 2026-09-16T15:49:38Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

Sixteen groups arrived in a real token and two of them granted anything. The dialog lists all sixteen at equal weight, so the two that matter are found by reading past fourteen that do not.

Lead with what grants. Then name the groups that **would** grant and were not matched, which is the half the dialog cannot currently show at all and the half that diagnoses a misspelling: a person who can see `Brokkr Ticket Ledger Userss` sitting unmatched beside their own `Brokkr Ticket Ledger User` has found the typo without reading a configuration file. Put everything else in a collapsed list, kept rather than dropped, because comparing the unmatched-and-unexpected against the unmatched-and-expected is the diagnostic.

### The disclosure boundary, which decides what is answerable

Naming every group the configuration mentions would tell any authenticated person the group names this canvas knows, and a group name implies the store it grants on. That is the store list wearing a different hat, and the store list is a permission boundary precisely because it discloses what is served here.

So the answer is restricted: groups that grant on a store **the caller can already read**. Nothing is disclosed that the caller could not already infer from their own store list.

The limitation this leaves is worth stating rather than discovering. Where every grant on a store is misspelled, the store is invisible to everybody, and no amount of information in this dialog can point at it without disclosing it to everyone who logs in. That case needs an administrator's view, which is `TKT-01M2MEC1ZXHZ0Y2MRJ3R0D66XE`.

## Acceptance criteria

- [x] Groups that grant access are shown first
- [x] Groups that would grant access but were not matched are named, for stores the caller can already read
- [x] Every other group is kept, in a collapsed list, because comparing the two is the diagnostic
- [x] No group is named that grants only on a store the caller cannot read
- [x] A login carrying no groups still says what to check

## Summary

The dialog leads with the groups that grant, follows with groups that would have granted and were not matched, and keeps everything else in a collapsed `details` below.

The middle list is new data. `grants.Grants` gained `Granting(resource)`, which names every group holding a role on a resource, and `api.Access` passes it through. The handler asks it **only for stores the caller can already read**: a group name implies the store it grants on, so answering more widely would be the store list wearing a different hat, and the store list is a permission boundary. `TestAGroupOnAnUnreadableStoreIsNotNamed` pins that.

The limitation is real and recorded rather than discovered later: where every grant on a store is misspelled, the store is invisible to everybody and nothing answerable here can point at it without disclosing it to everyone who logs in. That case needs an administrator's view.

Measured against the live canvas, this turns sixteen equal rows into two that grant, none unmatched, and a fourteen-row summary line.
