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

    // The fixture is 5 `draft` and 25 `done`. The four statuses between them
    // hold nothing and take 80 px each, so `done` starts at 322 + 320 = 642
    // rather than at 5 x 322 for full columns or at 322 for no lanes at all.
    // Those 320 px are the boundary between the two statuses. They were free
    // under a cap of 6, which left the board height-bound. The cap of 5 made
    // width the binding dimension, so they now cost 1.7% of the fit scale:
    // 0.7073 with them, 0.7194 without, which is where height takes over.
    // That is the price of the visible status boundary, and it is measured
    // rather than argued.
    const columns = [...new Set(full.map(card => card.x))].sort((a, b) => a - b)
    expect(columns, 'the x of every column').toEqual([0, 642, 964, 1286, 1608, 1930])

    // Column-major fill, five deep, so the `done` lane is five full columns
    // and the 5-card `draft` lane fills its one column exactly.
    const depth = columns.map(x => full.filter(card => card.x === x).length)
    expect(depth, 'cards per column').toEqual([5, 5, 5, 5, 5, 5])
    expect(Math.max(...depth), 'the deepest column against the cap of 5').toBeLessThanOrEqual(5)
    const rows = [...new Set(full.map(card => card.y))].sort((a, b) => a - b)
    expect(rows, 'the y of every row').toEqual([0, 269, 538, 807, 1076])

    expect(overlaps(full), 'overlapping cards at full density').toEqual([])

    // Recorded so a later change says which number moved. Card heights come
    // from the rendered text, and CI renders with other fonts, so spanY and
    // the scale get ranges while the placement numbers are exact.
    const fullExtent = extent(full)
    expect(fullExtent.spanX, 'arranged spanX at full density').toBe(2210)
    expect(fullExtent.spanY, 'arranged spanY at full density').toBeGreaterThan(1230)
    expect(fullExtent.spanY, 'arranged spanY at full density').toBeLessThan(1430)
    expect(fullExtent.aspect, 'arranged aspect at full density').toBeGreaterThan(1.1)
    const fullScale = await fitScale(page)
    expect(fullScale, 'fit scale at full density').toBeGreaterThan(0.55)

    // Wrapping alone left this board on the knee, 0.4997 by width against
    // 0.5000 by height. The tighter pitch and the cap of 6 moved it clear,
    // to 0.707 by width against 0.605 by height. The cap of 5 trades one row
    // for one column and has put it back on the knee: 0.7073 by width
    // against 0.7194 by height, 1.7% apart. Both dimensions are paid for
    // now, so a further empty lane comes out of the scale rather than out of
    // height slack. Which side binds turns on card heights, and CI renders
    // other fonts, so this asserts the balance and lets the annotation carry
    // the dimension.
    const bound = await binding(page, fullExtent.spanX, fullExtent.spanY)
    const knee = Math.max(bound.byWidth, bound.byHeight)
      / Math.min(bound.byWidth, bound.byHeight)
    expect(knee, 'how far the arranged fit sits from the knee').toBeLessThan(1.1)

    await setDensity(page, 'compact', SCENE.compactCardWidth)
    await refit(page)
    const compact = await boxes(page)
    const compactExtent = extent(compact)

    // Compact narrows every card inside the same lane, so the span loses
    // exactly the 100 px the last column gives back and nothing reflows.
    expect(compactExtent.spanX, 'arranged spanX at compact density').toBe(2110)
    expect(compactExtent.spanY, 'compact is no taller than full')
      .toBeLessThanOrEqual(fullExtent.spanY)
    expect(overlaps(compact), 'overlapping cards at compact density').toEqual([])
    const compactScale = await fitScale(page)
    expect(compactScale, 'fit scale at compact density').toBeGreaterThanOrEqual(fullScale)

    // Measured locally at this viewport: spanX 2210, spanY 1302, aspect 1.70,
    // fit 0.707 at full; spanX 2110, spanY 1277, aspect 1.65, fit 0.732 after
    // refitting compact. The same board was 1890 x 8409 at 0.120 before
    // wrapping, 3178 x 1926 at 0.500 with wrapping alone, and 2210 x 1571 at
    // 0.605 under a cap of 6. The annotation carries the fit budget and the
    // binding dimension, so a run that disagrees says whether the board
    // changed or the stage did.
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
