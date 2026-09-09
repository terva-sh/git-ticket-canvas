# Typed platform modules

This guide supplements `docs/development-vite.md` after
TKT-01M23HME7E2RC19BXEHD65TP1R (Extract typed ticket state and canvas geometry modules).
The vanilla DOM renderer remains in `web/app.js`. This change does not mount
Preact components or change the Go API, layout format, or embedded asset boundary.

## Module ownership

- `web/src/platform/tickets/types.ts` describes the Go JSON contract. Vocabulary
  stays server-owned strings. Schema actors use `ID` and `Name`; ticket claims
  use `actor`. Ticket body plans use `plan`. Checklist indexes count from one.
- `tickets/client.ts` owns HTTP encoding and `ApiError`. Its fetch argument is
  injectable for tests. The default wrapper calls native fetch without binding
  the client as its receiver. Success bodies have compile-time types, not runtime
  schema validation. Invalid JSON and empty bodies produce `invalid_response`.
- `tickets/store.ts` owns accepted ticket and layout responses. UI code reads its
  state and sends mutations through its methods. It must not mutate those maps
  or objects directly. `LayoutWriter` debounces sparse layout updates by board.
- `canvas/state.ts` owns local viewport, selection, filters, automatic positions
  and drag previews. The renderer still owns DOM handles and form controls.
  Inspector controls retain the ticket revision they rendered, not the newest
  revision a poll happens to receive.
- `canvas/geometry.ts` owns placement, pinned-position lookup, coordinate
  transforms, cursor zoom and fit calculations. It takes values, not DOM nodes.

## Request ordering and failures

The store serializes writes. A read sequence rejects older reads, a board
generation rejects results from earlier visits even across A-to-B-to-A switches,
and write epochs reject reads started before or during a mutation. Selecting a
board clears saved cards until a response for that board arrives. Tickets remain
available because they belong to the repository, not an individual board.

Mutation responses are authoritative. The store does not apply requested ticket
fields optimistically. A stale revision triggers one reload and rethrows the
original error without retrying the edit. A failed multi-op patch also reloads,
because the server can apply an earlier operation before refusing a later one.
If that reload fails, the original write error still reaches the UI. Subsequent
polling can refresh data ignored while writes were pending.

HTTP 207 means ticket creation or deletion completed but layout work failed.
The client retains both the successful result and `layoutError`. The renderer
reports the partial failure rather than retrying creation or pretending deletion
failed. A failed layout save does not change accepted cards.

Layout batches capture their board name and copy coordinates when enqueued. Each
board has its own debounce timer. Changes arriving during an in-flight save form
a new batch. The renderer holds drag positions in preview objects; a completed
save clears only the preview objects it captured, never a newer drag's objects.
A board switch invalidates old preview cleanup callbacks.

## Verification

`just web-test` runs Vitest in Node with no Vite application plugin. `just check`
now includes those tests as well as strict TypeScript, generated assets, Go race
tests, syntax, formatting, vet and strict ticket validation. The boundary test
uses the TypeScript syntax tree to reject imports outside platform, Preact,
application composition, and DOM/global access in production platform modules.
Its negative probes verify that the guard itself rejects forbidden examples.

On 2026-09-09:

- 58 unit and boundary tests passed, including 25 pure geometry tests.
- The 14-case browser baseline passed three repeats, 42 runs.
- The added layout-refusal browser test passed three repeats. It checks both
  preview rollback and unchanged server layout data.
- `just check` passed. The browser builds exercised committed `web/dist` through
  the Go server. No Node runtime is needed by consumers of the Go binary.

The first browser run caught a native-fetch receiver bug that Node mocks did not
expose. The wrapper fix has a receiver regression test and the browser baseline.
This is why unit tests do not replace the bundled browser checks.

Recorded with terva 0.134.5-0.20260908184005-01e3a6719b46, commit `01e3a67`,
built 2026-09-08T18:49:46Z. Loaded extensions were index 0.8.2, obsidian 0.2.0
and web 0.3.1.
