# Canvas baseline capture

The committed AHPSH archive provides the first reproducible dense canvas scene:

```text
docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/ahpsh-tickets.tgz
```

Install the locked Node dependencies and Playwright Chromium once, then capture the baseline with:

```sh
npm ci
npx playwright install chromium
npm run capture:canvas-baseline
```

The command writes these files beside the archive:

```text
docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/canvas-baseline.png
docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/canvas-baseline.json
```

The capture unpacks the archive with the shared helper described below, and removes the store after the server exits. It never modifies the archive. It pins the store to one path, so do not run two captures at once: the second deletes the first one's store.

## The fixture helper

`tests/browser/canvas-fixture.mjs` unpacks the archive for everything that needs the dense scene, the capture script and the Playwright specs alike:

```js
import { unpackCanvasFixture } from './canvas-fixture.mjs'

const fixture = await unpackCanvasFixture()
try {
  // fixture.store is the store root to pass the server as -store
  // fixture.tickets is the ticket ids found in the copy
} finally {
  await fixture.cleanup()
}
```

With no arguments it unpacks into a fresh `mkdtemp` directory. That is what the specs need: `playwright.config` runs two workers with `fullyParallel`, so a shared directory would have one spec deleting the store another is reading. Pass `store` to pin the path, which is what the capture does and what a spec should not do. Pass `archive` to point at a different tarball.

It verifies before it returns. The copy must hold 30 tickets and a `default.yml`, or the call throws and leaves nothing behind. `cleanup` removes the directory and is safe to call twice. Neither path writes to the archive.

The helper is plain `.mjs` on purpose. `tests/browser` is not in the `tsconfig.json` include, so the specs are not typechecked, and one JavaScript module serves both them and the capture script with no build step.

`just tooling-test` covers it: two concurrent callers getting separate stores, cleanup, a double cleanup, a pinned path, a pinned path replacing stale content, and a bad archive.

## The visual suite

`tests/browser/canvas-density.spec.ts` is the regression gate for the dense scene. It holds two tests, and they are split on purpose.

The structural test runs everywhere, including CI. It asserts the board, the relationship mode, 30 cards, 41 relationships, the inspector open on the reference ticket, the stubbed toolbar, the right-side cluster as counts, and the metadata rows a full card presents. Each assertion carries its own message, so a dropped edge fails as `rendered relationships` rather than as a picture with some pixels moved. The edge counts are checked twice, against the recorded numbers and against the store: 30 dependency edges are the 30 dependency links in the fixture, and 11 parent edges are the 11 tickets with a parent. A fixture swap that changes what the scene means therefore fails too.

The pixel test is opt-in and local:

```sh
just canvas-visual
```

It skips unless `CANVAS_VISUAL` is set, and the skip message says why. CI runs `just parity-check` inside `golang:1.25-alpine` with distro Chromium and `font-noto`, while a developer machine runs Playwright's pinned Chromium. The two render text differently, and Playwright's per-platform suffix is `-linux` for both, so one committed image cannot serve both and a CI pixel gate would fail over fonts rather than over the canvas.

There is one baseline image, not two. `snapshotPathTemplate` in `playwright.config.ts` resolves the snapshot to `canvas-baseline.png`, the artifact above, so the gate compares against the image a person reviewed. Playwright's default would have written a second copy beside the spec, byte-identical on the day it was made and free to drift after. On a mismatch it keeps the expected, actual and diff images, an error context and a trace under `test-results`, which `.gitignore` already excludes.

## Changing the baseline on purpose

Regenerate the image with the capture, never with `--update-snapshots`:

```sh
npm run capture:canvas-baseline
```

Then add an entry to `baseline-history.json`, newest first, saying what changed in the picture and what made it intentional. `tests/tooling/canvas-baseline.test.mjs` holds the line: the committed PNG must match the newest history entry, `canvas-baseline.json` must record the same bytes in `pngSha256`, and every entry needs a ticket, a date and a reason of at least 80 characters.

That is also what stops the shortcut. `playwright --update-snapshots` writes the PNG and cannot write the metadata beside it, so the checksums disagree and the tooling test names the capture command. Verified by truncating the image: both checks failed with that message, and restoring it returned the suite to green.

The child tickets change the picture on purpose, and not always the counts. `TKT-01M26Y32BZHJFXFGRYZ37TWYFP` (Reduce relationship clutter in the all-edges view) landed a new baseline while every number here held: same 30 cards, same 41 edges, same cluster counts, because it changed what edges paint rather than where anything sits. I had predicted it would move `rightHalf.edgesTouching`, and it did not. `TKT-01M26Y3D0BAX6KGND8PYXXR918` (Add a compact card density mode for large boards) is the one that should move `cardMetadataRows` in `tests/browser/canvas-scene.mjs`.

That is the division the gate is built on. A change that only repaints needs a new baseline entry and leaves the constants alone. A change that moves or restructures cards fails a structural assertion first, and editing that constant is how you say the move was intended.

## How the capture stays build-independent

The toolbar renders the build version beside the brand. `versionLabel(version)` carries the commit SHA on a git-described build, so without help the image changes on every commit and a visual gate blames whatever landed in it.

The capture stubs `GET /api/version` with a constant payload, so the toolbar renders `baseline` on every build. It does not rewrite the DOM after the page renders. That was the first attempt and it does not hold: the toolbar re-renders on selection, on live updates, and on every store publication, and each of those puts the fetched value back. It failed measurably, with two builds landing at `dd482d9a` and `68685d99` while the same build twice agreed, so the real version returned before the screenshot. A stub is upstream of every re-render.

Stubbing beat clipping the screenshot to the canvas. The toolbar is part of what the density and relationship-clutter tickets want to review, so cropping it out would remove the evidence those tickets need.

The brand prints the store path beside the version, and the capture stubs that the same way. It intercepts `GET /api/board`, replaces `storePath` with `/canvas-fixture/.tickets`, and passes everything else through. A conditional read answering 304 carries no body, so that case is forwarded untouched.

The capture then asserts what the toolbar ended up showing, both the version label and the store path. A toolbar change that moves `#version` or `#storePath` stops the capture rather than quietly poisoning the image.

The PNG is the byte-comparison target. The JSON beside it records `appVersion`, the build that produced the image, which varies on purpose and is provenance rather than something a comparison holds fixed. `renderedChrome` records what the toolbar actually displayed, which is the part held constant.

Stubbing the store path is also what makes the baseline portable. `tmpdir()` is `/tmp` on Linux and `/var/folders/...` on macOS, so before the stub a capture on another platform wrote a different path into the brand and the bytes differed for a reason that had nothing to do with the canvas. Pinning the path was the old workaround. `--store` and `CANVAS_CAPTURE_STORE` still choose where the store lands, and neither is needed to reproduce the committed image now.

One thing is deliberately left alone. `CardView.tsx` and `Inspector.tsx` mark a ticket late by comparing `dueOn` against `new Date()`, so a fixture ticket with a due date would repaint on a calendar day with no commit behind it. All 30 tickets in this archive have `due_on: null`, so that path never fires here. A future fixture that carries due dates needs a pinned clock, or the late state held constant the same way the version is.

## Why the screenshot disables animations

Selecting a card starts two CSS transitions. The inspector slides in over `.16s`, and the selected card's handle fades in over `.12s`. Waiting for `#inspector.open` to be visible does not wait for either to finish, so the shot could land mid-transition and the bytes changed run to run.

That took a while to find because it looks like a build problem from the outside. Six identical runs produced three different images, while the card geometry recorded in the JSON was identical in all six. Layout was never in question, so the difference had to be paint. The screenshot now passes `animations: 'disabled'`, which finishes finite transitions at their end state first, and `caret: 'hide'`.

## Capture conditions

- viewport: 2048 by 1152 pixels
- device scale factor: 1
- color scheme: dark
- board: `default`
- relationship mode: `All`
- selected ticket: `TKT-01M24GA0PMGWEM80RBS502FGVY` (`Prepare the first live event and future themes`)
- expected tickets: 30
- expected saved card placements: 30
- expected rendered relationships: 41

The archive was produced with layout schema 3, and `internal/layout.Schema` is 3, so the copy loads as recorded. An earlier version of this capture rewrote `schema: 3` to `schema: 2` and stripped the schema 3 `pens`, `ruleOrder`, and `inbox` fields. That rewrite is gone, and the capture reports 30 tickets and 30 rendered cards without it. The archive does hold references to files from the original project that are not in the tarball, so the helper creates empty reference targets in the copy for the store to validate against. That does not change the committed archive.

The generated image is the current-app baseline for the supplied reference screenshot. It uses the same 30-ticket AHPSH store, saved `default` layout, dark 2048 by 1152 viewport, `All` relationship mode, and selected `Prepare the first live event and future themes` ticket. It is a reproducible baseline rather than a byte-for-byte copy of the conversation image, which was never a workspace file.

The JSON file records the fixture SHA-256, viewport, board, relationship mode, selected ticket, card count, relationship count, the position and size of every card, and app build information. The geometry is there so a baseline that drifts says which cards moved instead of only that the bytes changed. It is also what located the animation race above.

## Verification

The committed baseline is:

```text
dc6992174ad3d16d1aec17570fea064d64c102328de719486475be03bb05c947  canvas-baseline.png
```

The determinism evidence behind it was gathered two baselines earlier, at `1688493a9730949f88f777dceb874d551670b09571f527e91886a6ef4f42dc4c`. Eight consecutive captures produced identical PNG bytes, and so did three captures across different builds: the default run that compiles the binary into the store, an ordinary VCS-stamped build reporting `v0.1.1-0.20260911142057-aec22cd52685`, and a `go build -buildvcs=false` build reporting `devel`. That evidence is about the capture rather than about one image, and the two baselines since have each reproduced on a single capture, which is weaker. Run the sweep again if you change the capture itself.

To reproduce that check:

```sh
go build -buildvcs=false -o /tmp/canvas-devel .
for n in 1 2 3 4 5 6 7 8; do
  npm run capture:canvas-baseline -- --output /tmp/canvas-$n.png
done
GIT_TICKET_CANVAS_BINARY=/tmp/canvas-devel npm run capture:canvas-baseline -- --output /tmp/canvas-devel.png
sha256sum /tmp/canvas-*.png | sort | uniq -c -w64
```

Run it more than twice. The earlier baseline `ad4291f6651cf8211107002b25520b19b238581b7c3caf79e92d75df8161dd9a` passed a two-capture check and was still caught by the animation race, because two samples cannot tell a stable capture from one that agrees most of the time.

Only the newest entry reproduces from current code. Every older one records a picture the app no longer draws, and two of them could not be reproduced even at the time. `ad4291f6651cf8211107002b25520b19b238581b7c3caf79e92d75df8161dd9a` predates the animation fix. `75fd5785ba7cafc07acd3acff6ca6f3d1cc7a49c4d70e55f156dfb27339e85cc` predates the version stub and the `Labels` filter button from TKT-01M26SB170M9TGNXHK8W7W5YSM, which added a toolbar control and pushed the card count and relationship selector onto a second row.

The source archive is unchanged:

```text
a6162422b117d113e77b17323fbb7d736df19ae68016051e62605a2c6dd240ab  ahpsh-tickets.tgz
```
