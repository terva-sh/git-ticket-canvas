# Version display

This records the implementation and evidence for TKT-01M2442EMB (Display the
running application version in the UI).

## Approved placement

The label sits beside the brand at the left of the toolbar, as a small mono
label in the same style as the store path. It is a native `<details>` element
(`#version` in `web/src/ui/Toolbar.tsx`), so the summary is focusable and
Enter or Space toggles it without any script. The body is a `<dl>` positioned
below the label, so opening it never reflows the toolbar controls. The user
chose this placement and a dedicated endpoint before implementation.

## What the browser shows

The summary shows the server's version as `--version` prints it: `v0.1.0` for
a release, `devel` for a development build, and `unknown` when the server did
not answer. A modified build tree appends `+dirty`, the marker Go itself uses.
The parser strips that suffix from `Main.Version` and keeps `Modified` as a
separate field, so the label re-attaches Go's marker rather than inventing one.

The body lists version, commit (12 characters, full value in the title),
modified as yes or no, and the Go toolchain. When the fetch failed every row
reads `unknown` and a note says the server did not answer. While the fetch is
in flight the element is absent, so the label is never blank.

## Where the value comes from

`internal/buildinfo` owns the parser that `version.go` used to own. `Parse`
follows the git-ticket CLI conventions: `runtime/debug.ReadBuildInfo` supplies
the module version and `vcs.*` settings, and missing metadata falls back to
`devel` and `unknown`. `version.go` aliases the type and calls the package, so
the CLI and the API cannot drift.

`GET /api/version` returns `buildinfo.Info` with the same six keys as
`--version --json`. `main.go` passes `buildinfo.Read()` through
`api.Options.Version`; a Server built without it serves the devel fallback
instead of empty strings. The handler reads no store state, so it answers 200
while `/api/board` answers 503 for a missing snapshot. The response carries no
paths, environment values, or credentials, and the API test refuses an
envelope with extra fields.

The client fetches it once on mount, independently of the board read. A
failure sets the label to `unknown` and does not touch board loading.

## Evidence

- `go test ./internal/buildinfo` covers release, dirty release, pseudo
  version, devel, nil, and empty metadata at 100% coverage.
- `version_test.go` pins `parseBuildVersion` to `buildinfo.Parse` and keeps
  the CLI text and JSON output checks.
- `internal/api/version_test.go` covers released, modified, devel, unset, and
  an unstarted server with no snapshot.
- `web/src/ui/forms.test.tsx` renders released, modified, devel, failed, and
  in-flight states in read-only mode and checks the body carries no path.
- `web/src/ui/App.test.tsx` checks one fetch per mount, board loading after a
  failed fetch, and the `+dirty` label.
- `tests/browser/baseline.spec.ts` opens the read-only server at 390px wide,
  toggles the disclosure by keyboard, compares every row with `/api/version`,
  and checks the body stays inside the viewport.
- `just check` passed, `just browser-test-embedded` passed 42 tests with 5
  opt-in skips, and `npm run build` regenerated `web/dist`.
