---
schema: 3
id: TKT-01M2NEPRPTADQ3TGE5C8PAPMJC
title: Record who has signed in
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - auth
  - multiuser
assignees: []
milestone: null
parent: TKT-01M2MEAP8ED8NZYGJKN2002G6J
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T15:52:28Z
updated_at: 2026-09-16T16:01:37Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

Nothing records that somebody signed in. A person who logs in and reads a board leaves no trace at all: they appear in `actors.json` only if they happened to choose an actor, and in the state file only if they marked a favorite. Both of those store an opaque subject and nothing else, so even where a trace exists it cannot be read by a human.

The login log line added by `TKT-01M2ND34FN6BB5MJ5XP51273J1` is the whole of the current record, and a log is not something you can ask questions of.

Record each person once, updated on every login: subject, first seen, last seen, display name, email, and the groups the token carried at the most recent login.

The groups are the field that earns this its keep. "They signed in on Tuesday carrying these three groups, none of which granted anything" diagnoses the case the account dialog structurally cannot reach — a store invisible to everybody because every grant on it is misspelled, which no per-caller view can point at without disclosing the store to everyone who logs in.

### This creates a user directory, deliberately

`docs/serving-a-canvas.md` currently says the canvas has none: "The canvas learns that somebody exists when they log in, and grants are to identity-provider groups rather than to people." That sentence has to change, and the change is the point rather than a side effect. `TKT-01M2MECN1P2388YE26XX5BQJJT` already depends on this existing — its description says per-user state "is also the directory this needs", and this is that directory done properly.

It also puts names and email addresses on disk where only opaque subjects have lived. That is a deliberate widening and it should be written down where an operator will read it.

### Shape

Beside `actors.json` and the favorites file, under the canvas state directory, 0600 in a 0700 directory, moved by `--state` with the others.

A record that will not parse stops the canvas, as the actor record does and unlike the favorites file. Silently forgetting who has been here is the one behaviour an account of people must not have, and this record is what per-person grants will later be written against.

Writing it must not be on the path that decides whether a login succeeds. A failure to record somebody is worth a warning; it is not worth refusing them entry.

## Acceptance criteria

- [x] Each login records subject, first seen, last seen, name, email, and the groups carried
- [x] First seen is fixed at the first login and last seen moves on every one after
- [x] A record that will not parse stops the canvas rather than starting empty
- [x] A failure to record somebody does not refuse them entry
- [x] The record lives beside the actor bindings, 0600, and moves with --state

## Summary

`internal/people` records every login: subject as the key, first and last seen, the display name and email the provider sent, and the groups the token carried at the most recent login. It lives beside `actors.json` and the favorites, 0600 in a 0700 directory, and moves with `--state`.

It is written from an `OnLogin` hook on `auth.Config`, so the relying party still knows only how to authenticate somebody. A failure to record is a warning and the login proceeds: recording somebody must never be able to refuse them entry.

Like the actor record and unlike the favorites file, a file that will not parse stops the canvas. Silently forgetting who has been here is the one behaviour an account of people must not have, and this is what per-person grants will be written against.

This is a user directory, which `docs/serving-a-canvas.md` said the canvas did not have. That sentence is rewritten rather than quietly falsified, and the document now says where the file is, that it carries names and email addresses, and that only an administrator reads it.
