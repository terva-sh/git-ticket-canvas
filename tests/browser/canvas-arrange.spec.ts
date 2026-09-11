import { test, expect } from './fixtures'
// @ts-expect-error one JavaScript module serves the specs and the capture script
import { SCENE, loadScene } from './canvas-scene.mjs'
import type { Page } from '@playwright/test'

// Arranged geometry is measured against the reference viewport, like the dense
// scene, so the fit scales here and the ones recorded on the ticket compare.
test.use({
  viewport: SCENE.viewport,
  colorScheme: SCENE.colorScheme,
  deviceScaleFactor: SCENE.deviceScaleFactor,
})

interface Box { id: string; x: number; y: number; w: number; h: number }

/**
 * Every card in scene space. `translate(x, y)` carries the placement and
 * `offsetWidth` the rendered width, both before `#scene` applies `scale(k)`.
 * Reading `getBoundingClientRect` instead would fold the fit scale in and
 * compare placement against a number that moves when the fit moves.
 */
async function boxes(page: Page): Promise<Box[]> {
  return page.evaluate(() => [...document.querySelectorAll('#cards .card')].map(node => {
    const card = node as HTMLElement
    const at = card.style.transform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/)!
    return {
      id: card.dataset.id!, x: Number(at[1]), y: Number(at[2]),
      w: card.offsetWidth, h: card.offsetHeight,
    }
  }).sort((a, b) => a.id.localeCompare(b.id)))
}

/** The span the board occupies, and the aspect the viewport has to swallow. */
function extent(cards: Box[]) {
  const spanX = Math.max(...cards.map(c => c.x + c.w)) - Math.min(...cards.map(c => c.x))
  const spanY = Math.max(...cards.map(c => c.y + c.h)) - Math.min(...cards.map(c => c.y))
  return { spanX, spanY, aspect: Number((spanX / spanY).toFixed(3)) }
}

/** Pairs of cards whose rectangles intersect, named so a failure says which. */
function overlaps(cards: Box[]): string[] {
  const found: string[] = []
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i], b = cards[j]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        found.push(`${a.id} over ${b.id}`)
      }
    }
  }
  return found
}

/** The `k` of `#scene`, which is what `fitView` chose for this board. */
async function fitScale(page: Page): Promise<number> {
  const transform = await page.locator('#scene').evaluate(node => node.style.transform)
  return Number(Number(transform.match(/scale\(([\d.]+)\)/)![1]).toFixed(3))
}

/**
 * Which dimension the fit is bound by, from the budget `Canvas.viewport` hands
 * `fitView`. That budget is not the window: the stage reserves 400 px for an
 * inspector that is not open yet and gives up 40 px of height, so a 2048x1152
 * window fits a board against 1648x1023. Measured rather than assumed, because
 * assuming 2048 wide is what made the estimate on the ticket predict 0.494.
 */
async function binding(page: Page, spanX: number, spanY: number) {
  const stage = await page.locator('#stage').evaluate(node => ({
    width: (node as HTMLElement).clientWidth, height: (node as HTMLElement).clientHeight,
  }))
  const budget = {
    width: stage.width > 700 ? Math.max(320, stage.width - 400) : stage.width,
    height: stage.height - 40,
  }
  const byWidth = budget.width / (spanX + 120)
  const byHeight = budget.height / (spanY + 120)
  return { binds: byWidth < byHeight ? 'width' : 'height', byWidth, byHeight, budget }
}

/** Refit, so a scale belongs to the density that is showing. */
async function refit(page: Page) {
  const before = await page.locator('#scene').evaluate(node => node.style.transform)
  await page.locator('#btnFit').click()
  await expect.poll(() => page.locator('#scene').evaluate(node => node.style.transform))
    .not.toBe(before)
}

/** Lay the board out in status lanes and wait for the write to land. */
async function arrange(page: Page) {
  page.once('dialog', dialog => void dialog.accept())
  await Promise.all([
    page.waitForResponse(response =>
      response.request().method() === 'PUT' && response.url().includes('/api/layout')),
    page.locator('#btnArrange').click(),
  ])
}

async function setDensity(page: Page, density: 'full' | 'compact', width: number) {
  await page.locator('#cardDensity').selectOption(density)
  await expect.poll(() => page.locator('#cards .card').first()
    .evaluate(card => (card as HTMLElement).offsetWidth)).toBe(width)
}

test.describe('arranged canvas geometry', () => {
  test('wraps the deep lane into columns and records the span at both densities', async ({ dense, page }) => {
    await loadScene(page, dense.url)
    await arrange(page)

    const full = await boxes(page)
    expect(full.length, 'cards on the arranged board').toBe(SCENE.expectedCards)

    // The fixture is 5 `draft` in lane 0 and 25 `done` in lane 5, so the
    // arranged board is two occupied lanes with four empty ones between them.
    // An empty lane still holds a column, which is what keeps lane 5 at
    // 5 x 322 rather than moving as statuses fill and empty.
    const columns = [...new Set(full.map(card => card.x))].sort((a, b) => a - b)
    expect(columns, 'the x of every column').toEqual([0, 1610, 1932, 2254, 2576, 2898])

    // Column-major fill, six deep, so the `done` lane is five columns: four
    // full and one holding the twenty-fifth card.
    const depth = columns.map(x => full.filter(card => card.x === x).length)
    expect(depth, 'cards per column').toEqual([5, 6, 6, 6, 6, 1])
    expect(Math.max(...depth), 'the deepest column against the cap of 6').toBeLessThanOrEqual(6)
    const rows = [...new Set(full.map(card => card.y))].sort((a, b) => a - b)
    expect(rows, 'the y of every row').toEqual([0, 340, 680, 1020, 1360, 1700])

    expect(overlaps(full), 'overlapping cards at full density').toEqual([])

    // Recorded so a later change says which number moved. Card heights come
    // from the rendered text, and CI renders with other fonts, so spanY and
    // the scale get ranges while the placement numbers are exact.
    const fullExtent = extent(full)
    expect(fullExtent.spanX, 'arranged spanX at full density').toBe(3178)
    expect(fullExtent.spanY, 'arranged spanY at full density').toBeGreaterThan(1900)
    expect(fullExtent.spanY, 'arranged spanY at full density').toBeLessThan(2050)
    expect(fullExtent.aspect, 'arranged aspect at full density').toBeGreaterThan(1.5)
    const fullScale = await fitScale(page)
    expect(fullScale, 'fit scale at full density').toBeGreaterThan(0.42)

    // A cap of 6 lands this board on the knee. Measured: 0.4997 by width
    // against 0.5000 by height, which is 0.0003 apart, and compact tips it to
    // height. So which dimension binds is not worth asserting, and the balance
    // is: neither dimension wastes the other. That is the property the cap was
    // chosen for, and a cap that stops holding it fails here.
    const bound = await binding(page, fullExtent.spanX, fullExtent.spanY)
    const balance = Math.min(bound.byWidth, bound.byHeight) / Math.max(bound.byWidth, bound.byHeight)
    expect(balance, 'how close the two fit terms are at full density').toBeGreaterThan(0.9)

    await setDensity(page, 'compact', SCENE.compactCardWidth)
    await refit(page)
    const compact = await boxes(page)
    const compactExtent = extent(compact)

    // Compact narrows every card inside the same lane, so the span loses
    // exactly the 100 px the last column gives back and nothing reflows.
    expect(compactExtent.spanX, 'arranged spanX at compact density').toBe(3078)
    expect(compactExtent.spanY, 'compact is no taller than full')
      .toBeLessThanOrEqual(fullExtent.spanY)
    expect(overlaps(compact), 'overlapping cards at compact density').toEqual([])
    const compactScale = await fitScale(page)
    expect(compactScale, 'fit scale at compact density').toBeGreaterThanOrEqual(fullScale)

    // Measured locally at this viewport: spanX 3178, spanY 1926, aspect 1.65,
    // fit 0.500 at full; spanX 3078, spanY 1901, aspect 1.62, fit 0.506 after
    // refitting compact. Unwrapped, the same board is 1890 x 8409 at aspect
    // 0.22 and fits at 0.120. The annotation carries the fit budget, so a run
    // that disagrees says whether the board changed or the stage did.
    testAnnotation(fullExtent, fullScale, compactExtent, compactScale, bound)
  })

  test('a density change on an arranged board moves no card and writes nothing', async ({ dense, page }) => {
    await loadScene(page, dense.url)
    await arrange(page)

    // Registered after the arrange, whose own PUT proves this listener sees a
    // write at all. Without that, an empty list would also be what a listener
    // attached to the wrong page reports.
    const writes: string[] = []
    page.on('request', request => {
      if (request.method() !== 'GET' && request.method() !== 'HEAD') {
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`)
      }
    })

    const placed = (cards: Box[]) => cards.map(card => `${card.id} ${card.x},${card.y}`)
    const before = placed(await boxes(page))

    await setDensity(page, 'compact', SCENE.compactCardWidth)
    expect(placed(await boxes(page)), 'positions after switching to compact').toEqual(before)
    await setDensity(page, 'full', SCENE.cardWidth)
    expect(placed(await boxes(page)), 'positions back at full density').toEqual(before)

    // Placement is derived from saved positions and recomputed on every
    // accepted store update, so a density toggle that wrote board data would
    // reflow a board at the next unrelated refresh rather than at the toggle.
    expect(writes, 'requests a density change sent').toEqual([])
  })
})

/** Print the recorded geometry, so a run reports the numbers it measured. */
function testAnnotation(
  full: { spanX: number; spanY: number; aspect: number }, fullScale: number,
  compact: { spanX: number; spanY: number; aspect: number }, compactScale: number,
  bound: { binds: string; byWidth: number; byHeight: number; budget: { width: number; height: number } },
) {
  const round = (value: number) => value.toFixed(4)
  test.info().annotations.push({
    type: 'arranged geometry',
    description: `full ${full.spanX}x${full.spanY} aspect ${full.aspect} fit ${fullScale}; `
      + `compact ${compact.spanX}x${compact.spanY} aspect ${compact.aspect} fit ${compactScale}; `
      + `budget ${bound.budget.width}x${bound.budget.height} binds ${bound.binds} `
      + `by width ${round(bound.byWidth)} by height ${round(bound.byHeight)}`,
  })
}
