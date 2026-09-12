# The dense canvas fixture

This directory holds the 30-ticket board the canvas tests and the visual
baseline are built on. The reasoning behind every choice here is in
`docs/canvas-baseline.md`, at the repository root. This file is the map.

## What each file is

`ahpsh-tickets.tgz` is the fixture, and it is the source of truth. Keep it
immutable. Nothing in the suite writes to it.

```text
a6162422b117d113e77b17323fbb7d736df19ae68016051e62605a2c6dd240ab  ahpsh-tickets.tgz
```

`.tickets/` is an extracted copy of that tarball, 30 tickets and the saved
`canvas/default.yml` board layout. It is here so a person can read the fixture
without unpacking anything. No test reads it. `tests/browser/canvas-fixture.mjs`
unpacks the tarball into a fresh temporary store for every run, so two workers
never share one.

`canvas-baseline.png` is the reviewed image the pixel gate compares against.
`snapshotPathTemplate` in `playwright.config.ts` resolves the snapshot to this
path, so there is one baseline rather than a copy beside the spec that drifts.

```text
dc6992174ad3d16d1aec17570fea064d64c102328de719486475be03bb05c947  canvas-baseline.png
```

`canvas-baseline.json` describes those bytes: `pngSha256`, the fixture checksum,
the capture conditions, and the position and size of all 30 cards. The geometry
is what separates a baseline that drifted in layout from one that drifted in
paint.

`baseline-history.json` is every baseline, newest first, each with its ticket,
its date and why it changed.

## Reproducing the capture

Once per machine:

```sh
npm ci
npx playwright install chromium
```

Then, from the repository root:

```sh
npm run capture:canvas-baseline   # regenerate the PNG and its metadata
just canvas-visual                # compare the current render against it
```

The capture runs at 2048 by 1152, device scale factor 1, dark, board `default`,
relationship mode `All`, with `TKT-01M24GA0PMGWEM80RBS502FGVY` selected. It
stubs the build version and the store path, so the image does not change on
every commit.

`just canvas-visual` is opt-in because it is a local gate. CI renders with
Alpine Chromium and `font-noto` while a developer machine renders with
Playwright's Chromium, and the two draw text differently. The structural
assertions in `tests/browser/canvas-density.spec.ts` run everywhere and are what
CI relies on.

## Changing the baseline on purpose

Regenerate with `npm run capture:canvas-baseline`, never with
`--update-snapshots`. That flag writes the PNG and cannot write the metadata
beside it, so `tests/tooling/canvas-baseline.test.mjs` fails on the mismatch and
names the capture command.

Then add an entry to `baseline-history.json`, newest first, saying what moved in
the picture and what made it intentional. The same test requires a ticket, a
date and a reason of at least 80 characters, so a baseline cannot change without
somebody writing down why.

## What is not here

The `.tickets` directory one level up, beside `ahpsh-tickets/`, is not part of
this fixture. It carries no board layout and nothing reads it.
TKT-01M29HX117P043SBQBMC5200XJ decides what happens to it.
