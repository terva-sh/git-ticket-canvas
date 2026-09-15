# README images

The three images in the README are generated, never captured by hand. Run:

```sh
just readme-shots
```

That writes `docs/images/canvas.png`, `docs/images/inspector.png`,
`docs/images/stores.png`, and `docs/images/shots.json`, each 1920x1080 at device
scale factor 1. Commit the images with whatever change made them move.

## Why they are generated

A hand-captured screenshot is right on the day it is taken. The canvas changes,
and nothing re-checks a picture, so the first person a stale image misleads is
the one deciding whether to try the tool. Regenerating has to be one command, or
it will not happen.

## What it does

The seed is a tarballed ticket store, not a directory, so the pictures describe
a fixed committed store rather than whatever the machine running the capture had
open. The script unpacks that archive into two directories, starts the real
binary over both plus one path that does not exist, drives a browser, and takes
three screenshots.

The third store is missing on purpose. A store that cannot be opened is listed
with its reason rather than hidden, and that is a design decision worth showing.

Shoot a different bundle without editing the script:

```sh
just readme-shots --fixture path/to/store.tgz
just readme-shots --width 2560 --height 1440
just readme-shots --out /tmp/shots
```

## What is held constant, and what happens when it cannot be

The toolbar renders the build version, the commit, and the store path, so an
image would otherwise change on every commit and on every machine. The capture
serves constants for all three through `stubBuildIdentity` in
`tests/browser/canvas-scene.mjs`, the same stubs the review baseline uses, so
the two captures cannot drift into stubbing different things.

`assertStableChrome` then reads the toolbar back and throws if it does not show
the stubbed values. A capture that cannot be reproduced fails instead of writing
an image nobody can regenerate.

Card positions come from the archive. The store paths in the picker come from a
pinned workspace under the system temporary directory rather than a `mkdtemp`
name, because those paths are visible in the image. The favorites file is
written inside that workspace through `XDG_STATE_HOME`, so a capture never reads
or writes the favorites of whoever ran it.

Fit animates with `requestAnimationFrame`, which Playwright's
`animations: 'disabled'` does not govern, so the script waits for the canvas
transform to stop changing before each shot. Without that wait a screenshot can
land mid-flight. The review baseline found the same class of bug when six
identical runs produced three different images.

Verified rather than assumed: two consecutive runs with no code change produce
byte-identical PNGs.

## Not a CI gate

These images are not byte-compared on CI, and should not be. A runner renders
text with Alpine Chromium and font-noto while a developer machine uses
Playwright's own Chromium, and the two disagree; `docs/canvas-baseline.md`
records the same constraint for the review baseline and the `canvas-visual`
recipe. A check comparing these bytes on a runner would fail for a reason that
is not a defect.

`docs/images/shots.json` records the SHA-256 of each image, the seed archive and
its checksum, the viewport, the card and relationship counts, the store that was
opened, and the toolbar values that were rendered. That is provenance for a
reader, not an assertion for a gate.

## Requirements

Node, npm, Go, and Playwright Chromium. Install the browser with
`just browser-setup`. The script builds the Go binary itself unless
`GIT_TICKET_CANVAS_BINARY` names one.
