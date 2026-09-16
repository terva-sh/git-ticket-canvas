---
schema: 3
id: TKT-01M2NYWQJWJXG8RGZTSJB8C7KB
title: Answer doctor's findings on this store
type: chore
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - infrastructure
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T20:35:20Z
updated_at: 2026-09-16T20:35:20Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

`git ticket doctor` arrived in v0.19.0 and this store gets 11 hard and 21 soft findings on the open set.

Every hard one is `label_missing`: eleven tickets carry no label, so nothing but the title says what they are about. They are the older drafts — the cross-store move set, the installer pair, the fixture and home-view work.

The soft ones are `label_order`, and they are worth reading rather than batch-fixing. The rule's own message is written against this canvas: "`canvas` leads its 3 labels and a card shows only 2, hiding `cli`". That is `CardView` showing two chips at full density and three at compact, so a label ordered third is invisible on a board at exactly the moment somebody is scanning it. The question the rule asks — is the first label the one that describes the card best — is a judgement, which is why it is soft.

Both rules are the ones the note behind TKT-01M2NHGHTZ4PWHBKRHE43XJG8D asked for, now shipped in the library rather than built here.

### Not in scope

Whether the canvas should *show* doctor findings on a board is a separate question and a bigger one. Filed separately if it is worth doing.
