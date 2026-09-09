# Preact forms beside the legacy canvas

This guide supplements `docs/platform-modules.md` and supersedes its description
of the renderer owning form controls. It records
TKT-01M23HMQ1PGCP8XSJ7PDJGWD3E (Convert ticket forms and toolbar to Preact components).

## DOM ownership

`web/index.html` now provides two empty mount roots. Preact owns every descendant
of `toolbarRoot` and `formsRoot`. The static shell retains the stage, grid,
scene, card container, edge container and hint.

`web/src/ui/mount.tsx` accepts a typed `FormsModel` and `FormsActions` contract.
The legacy adapter in `web/app.js` supplies accepted store data and callbacks.
It does not build inspector elements or assign form values, classes or handlers.
The search shortcut may focus the search field; it does not change its value.
The source ownership test limits legacy DOM lookups to canvas nodes, mount roots
and that focus shortcut. Browser tests check the rendered root separation.

The UI modules are:

- `Toolbar.tsx` for board selection, filtering, counts and toolbar actions.
- `Inspector.tsx` for metadata, text fields, relations, checklists, logs and
  lifecycle actions. The server still supplies vocabulary and transition rules.
- `Composer.tsx` for a new ticket draft and its captured board/scene position.
- `mount.tsx` for mounting the components and timed feedback messages.

The canvas itself is not a Preact component. Cards, edges, pan, zoom, placement
and gesture handling remain in the legacy adapter and extracted platform modules.
No transport or layout format changed.

## Draft and failure behavior

Inspector text editors keep stable DOM nodes and the ticket snapshot that
supplied each draft. Refresh can update metadata without replacing the active
editor or giving an unfinished draft a newer revision. Blur submits changed
replacement text. Enter submits single-line additions; Ctrl/Command+Enter submits
notes and comments. Unmount does not submit a draft.

Ordinary failures keep the draft. A stale replacement edit yields to the reloaded
server value after focus leaves, without retrying the edit. Successful additions
clear only the text that was submitted; later input survives an in-flight request.

Selects and checkboxes display accepted server values, including after a refused
write. Tests click a checkbox, wait for its response, then assert its accepted
state rather than assuming it toggles before the request completes.

The composer keeps text after a failed create and prevents duplicate submission
while a request is pending. Its position includes the board and view generation.
A completed request cannot close a newer composer. A successful HTTP 207 response
still closes the completed draft and reports the placement failure; creation is
not retried. All write controls are disabled in read-only mode, including label
removal and new-board creation.

## Verification

`just web-test` runs platform tests in Node and component tests in jsdom. Vitest
compiles JSX with Preact's automatic runtime. jsdom is a locked development-only
dependency and does not enter the browser bundle or Go binary.

On 2026-09-09, validation passed:

- 70 unit/component/ownership tests, including 10 form component tests.
- 18 browser tests repeated three times, 54 passing runs. These include the
  original focus/refresh baseline, metadata and lifecycle operations, deletion,
  DOM ownership, text shortcuts and layout-save refusal.
- `just check`, including strict TypeScript, generated assets, Go race tests,
  vet, JavaScript syntax, formatting and ticket validation.
- `npm audit` with zero reported vulnerabilities and `git diff --check`.

Recorded with terva 0.134.5-0.20260908184005-01e3a6719b46, commit `01e3a67`,
built 2026-09-08T18:49:46Z. Loaded extensions were index 0.8.2, obsidian 0.2.0
and web 0.3.1.
