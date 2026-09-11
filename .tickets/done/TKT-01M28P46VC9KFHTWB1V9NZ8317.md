---
schema: 3
id: TKT-01M28P46VC9KFHTWB1V9NZ8317
title: Variadic just recipes pass a phantom empty argument
type: bug
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - quality-of-life
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-11T16:52:01Z
updated_at: 2026-09-11T20:09:38Z
created_by:
  id: agent:terva/mieli
  name: Mieli
updated_by:
  id: agent:terva/mieli
  name: Mieli
extensions: {}
---

## Description

The variadic test recipes forward their arguments as `"$@"`. With no arguments that expands to one empty string rather than to nothing, and a test runner reads an empty filter as matching every file.

Found while adding `just canvas-visual` in TKT-01M26YG1VHJXCXXQPXPDBTSS47 (Add visual checks for dense canvas scenes). The first version of that recipe named one spec file and still ran all 66 tests, because the empty filter ORs with the file path. The fix there was `{{args}}`, which expands to nothing when empty.

The same shape appears in `browser-test`, `browser-test-embedded`, and `web-test`. It is easy to miss, because the recipe does more work rather than less, and the run passes. Concretely, `just browser-test -- canvas-density` runs the whole browser suite for about 70 seconds instead of one spec for 3.

Worth confirming per recipe before changing them. `npm run test:browser -- "$@"` passes through npm, so the empty argument may be swallowed at a different point than it is for `npm exec -- playwright test`. Check each one by running it with no arguments and with one filter, and compare the test counts rather than the exit status.

`tests/tooling/parity-recipe.test.mjs` already guards recipe wiring, so a check that a filtered invocation runs fewer tests than an unfiltered one belongs beside it.

## Acceptance criteria

- [x] Each variadic test recipe runs only the named spec when given a filter, and the full suite when given none, confirmed by test counts rather than exit status.
- [x] A tooling test fails if a recipe's argument forwarding regresses to matching every file.
- [x] The `"$@"` and `{{args}}` choice is recorded where the next person writing a recipe will read it.

## Notes

**agent:terva/mieli** at 2026-09-11T19:58:32Z

draft to ready: The user asked me to promote this and fix it, which is the promotion.

**agent:terva/mieli** at 2026-09-11T20:09:15Z

Fixed, and the diagnosis in the description above is wrong in two places. Measuring each recipe before changing it, as the description asked, is what caught them.

What `just` actually does, measured with a probe justfile that counts positional parameters. `printf '[%s]'` with zero arguments still prints one empty field, so my first probe could not tell `""` from nothing and had to be rewritten to count:

- `*args=""` forwarded as `"$@"`: 1 argument, empty.
- `*args` with no default, forwarded as `"$@"`: 0 arguments.
- `{{args}}` given `"two words"`: 2 arguments.
- `"$@"` given `"two words"`: 1 argument.

So the cause is the `=""` default, not `"$@"`. Dropping the default fixes the phantom argument and keeps shell quoting, which is the pair no other form gives.

First correction. `{{args}}`, which the earlier session adopted as the fix and wrote into the justfile as advice, splits a quoted argument. `just canvas-visual -g "one relationship at a time" --list` listed 3 tests where the same pattern passed straight to playwright lists 1, and `-g one` alone also lists 3, which is what proves the splitting rather than merely suggesting it. The recipe had been running the wrong tests since I wrote it. My first attempt to demonstrate this used `-g "names one relationship"`, where grep `names` and the full phrase both match exactly one test, so it produced the right answer for the wrong reason and told me nothing.

Second correction. An empty filter is harmless where a recipe forwards nothing else. Playwright lists 71 tests for `playwright test` and 71 for `playwright test ""`, so `browser-test`, `browser-test-embedded` and `web-test` were never broken by it: running everything when given nothing is what those recipes are for. The empty argument only bites when the recipe carries its own filter, and `canvas-visual` is the only one that does: a spec path plus `""` lists 71 tests where the path alone lists 7. The ticket title therefore names behaviour that is correct, and I have retitled it.

What was actually costing me whole suite runs all session was my own habit. `just` forwards a bare `--` literally rather than consuming it, so `just web-test -- geometry` hands vitest `--` and `geometry` and runs all 30 files instead of 1, and `just browser-test-embedded -- canvas-density --list` ran the entire browser suite for 1.1 minutes while ignoring `--list`. A leading dash needs no escaping, so `just browser-test-embedded --list` works as written. That trap is now in the justfile header, because it is the one a reader will hit.

The Go recipe tolerates the phantom argument: `go test -race -cover "" ./...` exits 0, same as without it. Non-variadic defaults have the same shape and are also fine here, because `install-local.sh` reads `${1:-}` and falls through to its search when the value is empty.

One thing I could not explain. An early `just test` run failed with a bare `FAIL` and exit 1, with `internal/api` the only uncached package. Two subsequent uncached runs of `internal/api` passed with zero failing tests, so it did not reproduce and I am not claiming it was the empty argument or a flake. Recorded here rather than dressed up, because the cache now hides whatever it was.

Guards: `tests/tooling/recipe-args.test.mjs`, 4 tests. Two read the justfile and fail if any variadic recipe regains a default or forwards `{{args}}`. Two assert just's own expansion semantics from a generated probe, so a just upgrade that changes them fails here rather than silently running the wrong tests. Checked against their own failure: reverting `canvas-visual` to `*args=""` with `{{args}}` failed both static guards by name, 77 pass and 2 fail, and restoring returned 79 pass.

Gates: `just check` clean, 79 tooling tests, and `just --dry-run parity-check` unchanged.

**agent:terva/mieli** at 2026-09-11T20:09:32Z

ready to in-progress: Passing through in-progress to reach done. The fix is in the justfile with guards in tests/tooling/recipe-args.test.mjs, uncommitted.

**agent:terva/mieli** at 2026-09-11T20:09:35Z

Task worklog for this ticket, from the session task board.

### Tasks

- [x] task-49 Each variadic test recipe runs only the named spec when given a filter, and the full suite when given none, confirmed by test counts rather than exit status. — Measured by counts: browser-test-embedded 71 tests unfiltered and 7 filtered; canvas-visual 7 for its own spec and 1 for a quoted -g that returned 3 before the fix; web-test 1 file filtered and 30 unfiltered; just test exits 0. Every variadic recipe now declares *args with no default and forwards "$@".
- [x] task-50 A tooling test fails if a recipe's argument forwarding regresses to matching every file. — tests/tooling/recipe-args.test.mjs adds 4 tests: two static guards over the justfile and two that assert just's own expansion semantics from a generated probe. Negative control: reverting canvas-visual to *args="" with {{args}} failed both guards by name, 77 pass 2 fail. Restored, 79 pass.
- [x] task-51 The `"$@"` and `{{args}}` choice is recorded where the next person writing a recipe will read it. — A 16-line block under `set positional-arguments` in the justfile states the rule and both rejected alternatives with the measured counts, plus the bare -- trap. canvas-visual's own comment now points at it instead of recommending {{args}}.

## Summary

Fixed. Every variadic recipe now declares `*args` with no default and forwards `"$@"`, which is the only form that both passes nothing when empty and keeps a quoted argument whole. Eight recipes changed: `run`, `test`, `browser-test`, `canvas-visual`, `web-test`, `browser-test-embedded`, `web-dev` and `api-dev`.

The cause was the `=""` default rather than `"$@"`, which is why the title changed: running the full suite when given no filter is correct behaviour, and the old title named it as the bug.

Two things the measurement corrected. `{{args}}`, adopted as the fix in an earlier session and written into the justfile as advice, splits a quoted argument, so `canvas-visual -g "one relationship at a time"` had been running the tests that match `-g one`, three instead of one. And an empty filter is harmless where a recipe forwards nothing else, so only `canvas-visual` was ever affected, because it is the only recipe carrying a filter of its own.

The habit that actually cost whole suite runs was mine: `just` forwards a bare `--` literally, so `just web-test -- geometry` ran all 30 files and `just browser-test-embedded -- canvas-density --list` ran the entire browser suite while ignoring `--list`. A leading dash needs no escaping.

Verified by counts rather than exit status: browser-test-embedded lists 71 unfiltered and 7 filtered, canvas-visual lists 7 for its own spec and 1 for the quoted `-g` that returned 3 before, web-test runs 1 file filtered and 30 unfiltered, and `just test` exits 0.

`tests/tooling/recipe-args.test.mjs` holds the line with 4 tests, two reading the justfile and two asserting just's own expansion semantics so a just upgrade cannot change them silently. Both static guards were checked against their own failure by reverting `canvas-visual` on purpose.

The rule and both rejected alternatives are recorded at the top of the justfile with the measured counts, where a person writing the next recipe will read them.

One loose end, recorded in the note and not explained: an early `just test` failed once with a bare `FAIL`, and two uncached reruns of the only uncached package passed. It did not reproduce, and I am not calling it a flake without evidence.
