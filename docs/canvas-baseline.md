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

The capture uses a temporary store with a stable path so the store path shown in the toolbar does not make repeated images differ. Do not run two captures concurrently. The command removes that temporary store after the server exits and never modifies the archive.

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

The generated image is the current-app baseline for the supplied reference screenshot. It uses the same 30-ticket AHPSH store, saved `default` layout, dark 2048 by 1152 viewport, `All` relationship mode, and selected `Prepare the first live event and future themes` ticket. The current build reports `devel`, so the generated image is a reproducible baseline rather than a byte-for-byte copy of the conversation image.

The JSON file records the fixture SHA-256, the layout adaptation, viewport, board, relationship mode, selected ticket, card count, relationship count, and app build information.

## Verification

Two captures from this checkout produced identical PNG bytes:

```text
75fd5785ba7cafc07acd3acff6ca6f3d1cc7a49c4d70e55f156dfb27339e85cc  canvas-baseline.png
```

The source archive checksum is:

```text
a6162422b117d113e77b17323fbb7d736df19ae68016051e62605a2c6dd240ab  ahpsh-tickets.tgz
```
