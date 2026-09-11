// One definition of the dense canvas scene, shared by the artifact capture in
// `scripts/capture-canvas-baseline.mjs` and the visual suite in
// `canvas-density.spec.ts`. Two copies would drift, and the artifact a person
// reviews would stop being the scene the gate guards.

/** What the scene is, and what it should contain when it is ready. */
export const SCENE = {
  board: 'default',
  relationshipMode: 'all',
  // `Prepare the first live event and future themes`, which sits in the dense
  // right-side cluster and opens an inspector with every metadata row filled.
  selectedTicket: 'TKT-01M24GA0PMGWEM80RBS502FGVY',
  viewport: { width: 2048, height: 1152 },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
  expectedCards: 30,
  expectedRelationships: 41,
  // Every card at the full density, in CSS pixels. Canvas sets `--card-w` on
  // `#scene` from `CARD_WIDTH`, and the stylesheet declares no fallback, so a
  // width that fails to reach the page makes cards auto-width rather than
  // leaving them at 280. This is the assertion that catches that.
  cardWidth: 280,
  // The compact density's width. The capture stays in full mode, so this
  // number belongs to the structural suite rather than to the image.
  compactCardWidth: 180,
  // Every dependency link and every parent link in the fixture draws one edge,
  // so these two numbers are derivable from the store rather than observed from
  // a render. The suite checks them both ways.
  expectedEdgeKinds: { dependency: 30, parent: 11 },
  // The dense cluster on the right of the reference scene, measured as counts
  // rather than as a picture. `cards` is how many sit past the horizontal
  // midpoint, and `edgesTouching` is how many relationships land on one of
  // them, which is the clutter the child tickets are about.
  rightHalf: { cards: 7, edgesTouching: 16 },
  // The metadata rows a full card presents, in document order.
  cardMetadataRows: [
    'card-title', 'card-state', 'card-priority prio-normal', 'card-alerts',
    'card-labels', 'card-progress', 'card-head', 'card-id', 'card-type', 'card-placement',
  ],
  selectedTitle: 'Prepare the first live event and future themes',
}

// The toolbar renders build and environment identity, so the scene would change
// on every commit and on every machine. Serve constants to the page instead of
// rewriting the DOM after it renders: the toolbar re-renders on selection, on
// live updates and on every store publication, and each of those puts the
// fetched value back. Measured when that was tried: two builds landed at
// dd482d9a and 68685d99 while the same build twice agreed.
const stubbedVersion = {
  schemaVersion: 1, kind: 'version', version: 'baseline',
  commit: 'baseline', go: 'baseline', modified: false,
}
export const expectedVersionLabel = 'baseline'
export const stubbedStorePath = '/canvas-fixture/.tickets'

/** Serve a constant version and store path to the page. */
export async function stubBuildIdentity(page) {
  await page.route('**/api/version', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(stubbedVersion),
  }))
  await page.route('**/api/board*', async route => {
    const response = await route.fetch()
    // A conditional read answers 304 with no body to rewrite.
    if (response.status() !== 200) { await route.fulfill({ response }); return }
    await route.fulfill({ response, json: { ...await response.json(), storePath: stubbedStorePath } })
  })
}

/**
 * Read back what the toolbar ended up showing. A stub that stops matching, or a
 * new element carrying build identity, then fails the caller rather than
 * quietly producing an image nobody can reproduce.
 */
export async function readChrome(page) {
  return page.evaluate(() => ({
    version: document.querySelector('#version > summary')?.textContent ?? null,
    storePath: document.querySelector('#storePath')?.textContent ?? null,
  }))
}

/** Throw unless the toolbar shows the stubbed identity. */
export async function assertStableChrome(page) {
  const seen = await readChrome(page)
  for (const [field, expected] of [['version', expectedVersionLabel], ['storePath', stubbedStorePath]]) {
    if (seen[field] !== expected) {
      throw new Error(`toolbar ${field} reads ${JSON.stringify(seen[field])}, expected `
        + `${JSON.stringify(expected)}. That would vary the scene between runs.`)
    }
  }
  return seen
}

/**
 * Load the board and switch relationships on, stopping before the selection.
 * Returns the board payload, the rendered card count and the card geometry, so
 * a caller can assert on them in its own vocabulary. Selecting first would turn
 * a missing card into a click timeout, which says nothing about what is wrong.
 */
export async function loadScene(page, url, options = {}) {
  const relationshipMode = options.relationshipMode ?? SCENE.relationshipMode
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  const response = await page.request.get(`${url}/api/board?board=${SCENE.board}`)
  if (!response.ok()) {
    throw new Error(`board request failed ${response.status()}: ${await response.text()}`)
  }
  const board = await response.json()
  await page.locator('#relationshipMode').selectOption(relationshipMode)
  await page.locator('#cards').waitFor({ state: 'attached' })
  await page.locator('#cards .card').first().waitFor({ state: 'attached' })
  const cardCount = await page.locator('#cards .card').count()
  const geometry = await cardGeometry(page)
  const unmeasured = geometry.filter(([, , , boxWidth, boxHeight]) => boxWidth <= 0 || boxHeight <= 0)
  if (unmeasured.length) {
    throw new Error(`cards have no measured bounds: ${unmeasured.map(([id]) => id).join(', ')}`)
  }
  return { board, cardCount, geometry }
}

/** Select the reference ticket and wait for the inspector and the first edge. */
export async function selectReference(page, options = {}) {
  const selectedTicket = options.selectedTicket ?? SCENE.selectedTicket
  await page.locator(`.card[data-id="${selectedTicket}"]`).click()
  await page.locator('#inspector.open').waitFor({ state: 'visible' })
  await page.locator('#edges .relationship').first().waitFor({ state: 'attached' })
}

/**
 * Where every card landed, sorted by id. A scene that drifts then says which
 * cards moved rather than only that the bytes changed, and a capture whose
 * geometry is identical across differing images has a paint problem rather than
 * a layout one. That distinction is what found the animation race.
 */
export async function cardGeometry(page) {
  return page.evaluate(() => [...document.querySelectorAll('#cards .card')]
    .map(card => {
      const box = card.getBoundingClientRect()
      return [card.dataset.id, Math.round(box.x), Math.round(box.y),
        Math.round(box.width), Math.round(box.height)]
    })
    .sort((a, b) => a[0].localeCompare(b[0])))
}

/**
 * Screenshot options for the scene. Selecting a card starts a .16s inspector
 * slide and a .12s handle fade, and waiting for `#inspector.open` to be visible
 * waits for neither, so a shot could land mid-transition. Measured: six
 * identical runs produced three different images while card geometry was
 * identical in all six.
 */
export const SHOT = { animations: 'disabled', caret: 'hide' }
