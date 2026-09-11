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

The capture uses a temporary store at a fixed path, and removes it after the server exits. It never modifies the archive. Do not run two captures concurrently, because the second one deletes the first one's store.

## How the capture stays build-independent

The toolbar renders the build version beside the brand. `versionLabel(version)` carries the commit SHA on a git-described build, so without help the image changes on every commit and a visual gate blames whatever landed in it.

The capture stubs `GET /api/version` with a constant payload, so the toolbar renders `baseline` on every build. It does not rewrite the DOM after the page renders. That was the first attempt and it does not hold: the toolbar re-renders on selection, on live updates, and on every store publication, and each of those puts the fetched value back. It failed measurably, with two builds landing at `dd482d9a` and `68685d99` while the same build twice agreed, so the real version returned before the screenshot. A stub is upstream of every re-render.

Stubbing beat clipping the screenshot to the canvas. The toolbar is part of what the density and relationship-clutter tickets want to review, so cropping it out would remove the evidence those tickets need.

The store path in the brand is deterministic by construction, because the capture unpacks the fixture at a path it chooses. The capture asserts it rather than rewriting it. That assertion is the tripwire for the per-run store directory in TKT-01M26YFC1Y1XTK2RW2XYN4FFGW: giving the capture a fresh directory per run fails the capture loudly instead of quietly making every later baseline unreproducible. The version label is asserted the same way, so a toolbar change that moves `#version` stops the capture rather than poisoning the image.

The PNG is the byte-comparison target. The JSON beside it records `appVersion`, the build that produced the image, which varies on purpose and is provenance rather than something a comparison holds fixed. `renderedChrome` records what the toolbar actually displayed, which is the part held constant.

The visible store path makes the baseline machine-dependent. `tmpdir()` is `/tmp` on Linux and `/var/folders/...` on macOS, so a capture on another platform writes a different path into the brand and the bytes differ for a reason that has nothing to do with the canvas. Pass the same path to reproduce the committed image:

```sh
npm run capture:canvas-baseline -- --store /tmp/git-ticket-canvas-reference-store-2026-09-11-warricksothr-arkham-halloween-photo-scavenger-hunt
```

`CANVAS_CAPTURE_STORE` sets the same thing. A gate that has to run on more than one platform should pin this rather than rely on the default.

One thing is deliberately left alone. `CardView.tsx` and `Inspector.tsx` mark a ticket late by comparing `dueOn` against `new Date()`, so a fixture ticket with a due date would repaint on a calendar day with no commit behind it. All 30 tickets in this archive have `due_on: null`, so that path never fires here. A future fixture that carries due dates needs a pinned clock, or the late state held constant the same way the version is.

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

The archive was produced with layout schema 3. The current canvas reader accepts schema 2, so the isolated copy changes `schema: 3` to `schema: 2` and removes the schema 3 `pens`, `ruleOrder`, and `inbox` fields. The archive also contains references to files from the original project that are not part of the ticket tarball. The capture creates empty reference targets in the isolated copy so the store can validate. Neither adaptation changes the committed archive.

The generated image is the current-app baseline for the supplied reference screenshot. It uses the same 30-ticket AHPSH store, saved `default` layout, dark 2048 by 1152 viewport, `All` relationship mode, and selected `Prepare the first live event and future themes` ticket. It is a reproducible baseline rather than a byte-for-byte copy of the conversation image, which was never a workspace file.

The JSON file records the fixture SHA-256, the layout adaptation, viewport, board, relationship mode, selected ticket, card count, relationship count, and app build information.

## Verification

Two builds reporting different versions produced identical PNG bytes. One was the ordinary VCS-stamped build, which reports `v0.1.1-0.20260911061135-104c3c1ad552`. The other was built with `go build -buildvcs=false`, which reports `devel`. The committed baseline is a third capture and matches both:

```text
ad4291f6651cf8211107002b25520b19b238581b7c3caf79e92d75df8161dd9a  canvas-baseline.png
```

To reproduce that check:

```sh
go build -buildvcs=false -o /tmp/canvas-devel .
npm run capture:canvas-baseline -- --output /tmp/a.png
GIT_TICKET_CANVAS_BINARY=/tmp/canvas-devel npm run capture:canvas-baseline -- --output /tmp/b.png
sha256sum /tmp/a.png /tmp/b.png
```

The previous baseline was `75fd5785ba7cafc07acd3acff6ca6f3d1cc7a49c4d70e55f156dfb27339e85cc`. It is superseded rather than reproducible: it predates both the version stub and the `Labels` filter button from TKT-01M26SB170M9TGNXHK8W7W5YSM, which added a toolbar control and pushed the card count and relationship selector onto a second row.

The source archive is unchanged:

```text
a6162422b117d113e77b17323fbb7d736df19ae68016051e62605a2c6dd240ab  ahpsh-tickets.tgz
```
