import type { Page } from '@playwright/test'
import { test, expect, type Ticket } from './fixtures'
import { tablet, touchSteps, viewSettled, type Point } from './touch'

// Nothing on a tablet's board needs hover. The hint describes a finger, a tap
// names an edge and the name stays, and the stage counts a double tap itself
// rather than trusting `dblclick`. The desk keeps its mouse: hover names an
// edge for as long as the pointer is on it, and a double-click files.
// docs/mobile-design-v1.md, "Tablet".

const TOUCH_HINT = 'drag to pan · pinch to zoom · double-tap to file a ticket · hold a card to select several'
const DESK_HINT = 'drag canvas to pan · scroll to zoom · double-click to file a ticket'

/** The part of the `app` fixture these tests use. */
interface App {
  url: string
  create(title: string, card?: Point): Promise<Ticket>
  patch(ticket: Ticket, ops: object[]): Promise<Ticket>
}

/** Two cards far enough apart that the edge between them has a stretch no
 * card covers, the second waiting on the first, with every edge drawn. */
async function linked(page: Page, app: App) {
  const first = await app.create('Prerequisite', { x: 0, y: 0 })
  const second = await app.create('Dependent', { x: 900, y: 0 })
  await app.patch(second, [{ op: 'addDependency', id: first.id }])
  await page.goto(app.url)
  await expect(page.locator(`.card[data-id="${first.id}"], .card[data-id="${second.id}"]`)).toHaveCount(2)
  await page.locator('#relationshipMode').selectOption('all')
  await expect(page.locator('#edges .relationship')).toHaveCount(1)
  // Let the opening fit settle before anything measures a point on the board.
  await viewSettled(page)
  return { first, second }
}

/** A whole-pixel point on the edge's hit path where the path is topmost, so
 * a finger or a mouse there lands on the edge and not on a card. */
async function edgePoint(page: Page): Promise<Point> {
  const point = await page.evaluate(() => {
    const path = document.querySelector('#edges .edge-hit') as SVGPathElement
    const length = path.getTotalLength()
    const ctm = path.getScreenCTM()!
    for (let step = 1; step < 20; step++) {
      const at = path.getPointAtLength(length * step / 20).matrixTransform(ctm)
      const x = Math.round(at.x), y = Math.round(at.y)
      if (document.elementFromPoint(x, y) === path) return { x, y }
    }
    return null
  })
  expect(point, 'a point on the edge no card covers').not.toBeNull()
  return point!
}

/** A point on empty board: inside the stage, above the cards and clear of
 * the hint along the bottom. Checked rather than assumed. */
async function emptyPoint(page: Page): Promise<Point> {
  const stage = (await page.locator('#stage').boundingBox())!
  const point = { x: Math.round(stage.x + stage.width / 2), y: Math.round(stage.y + 40) }
  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y)
    return element?.id || element?.className || element?.tagName
  }, point)
  expect(['stage', 'grid'], 'the empty point is on bare board').toContain(hit)
  return point
}

const tap = (page: Page, point: Point) => touchSteps(page, [[point]])
const label = (page: Page) => page.locator('#edges .edge-label')
const named = (page: Page) => page.locator('#edges .relationship[data-emphasised=true]')

test.describe('tablet', () => {
  test.use(tablet)

  test('the hint describes a finger, and says what the titles would have', async ({ page, app }) => {
    await app.create('On a tablet', { x: 0, y: 0 })
    await page.goto(app.url)
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'tablet')
    const hint = page.locator('#hint')
    await expect(hint).toBeVisible()
    await expect(hint).toHaveAttribute('data-pointer', 'coarse')
    await expect(hint).toContainText(TOUCH_HINT)
    // What only a title explained on a desk: the link handle, the Manual
    // control and the zoom level.
    await expect(hint).toContainText("drag a card's round handle onto another card")
    await expect(hint).toContainText('tap Manual to hand a card back to automatic placement')
    await expect(hint).toContainText('tap the zoom level for 1:1')
    // Nothing here describes a mouse.
    await expect(hint).not.toContainText('double-click')
    await expect(hint).not.toContainText('hover')
    await expect(hint).not.toContainText('scroll')
  })

  test('a claim reads as one without its title', async ({ page, app }) => {
    const ticket = await app.create('Somebody has this', { x: 0, y: 0 })
    // A draft cannot be claimed.
    const ready = await app.patch(ticket, [{ op: 'setStatus', status: 'ready' }])
    await app.patch(ready, [{ op: 'claim' }])
    await page.goto(app.url)
    const held = page.locator(`.card[data-id="${ticket.id}"] .held`)
    await expect(held).toBeVisible()
    expect(await held.evaluate(node => getComputedStyle(node, '::before').content)).toBe('"held by "')
  })

  test('a tap names an edge until a tap somewhere else', async ({ page, app }) => {
    await linked(page, app)
    await expect(label(page)).toHaveCount(0)

    await tap(page, await edgePoint(page))
    await expect(named(page)).toHaveCount(1)
    await expect(label(page)).toHaveText('depends on')
    // Still named once the finger has long gone. A hover name would have left
    // with it.
    await page.waitForTimeout(500)
    await expect(label(page)).toHaveCount(1)
    await expect(page.locator('#composer')).toBeHidden()

    await tap(page, await emptyPoint(page))
    await expect(label(page)).toHaveCount(0)
    await expect(named(page)).toHaveCount(0)
    await expect(page.locator('#edges .relationship.faded')).toHaveCount(0)
  })

  test('a tap on a card that wobbles within 8 px still unnames the edge', async ({ page, app }) => {
    // A card no edge touches, so selecting it emphasises nothing of its own.
    const apart = await app.create('Unrelated', { x: 450, y: 300 })
    await linked(page, app)
    await tap(page, await edgePoint(page))
    await expect(named(page)).toHaveCount(1)

    // Enough to count as a drag on a desk, where one scene pixel is; still a
    // tap for a finger.
    const title = (await page.locator(`.card[data-id="${apart.id}"] .card-title`).boundingBox())!
    const at = { x: Math.round(title.x + 20), y: Math.round(title.y + title.height / 2) }
    await touchSteps(page, [[at], [{ x: at.x + 4, y: at.y + 3 }]])

    await expect(named(page)).toHaveCount(0)
  })

  test('a pan that starts on an edge moves the board and names nothing', async ({ page, app }) => {
    await linked(page, app)
    const from = await edgePoint(page)
    const transform = () => page.locator('#scene').evaluate(node => (node as HTMLElement).style.transform)
    const before = await transform()
    await touchSteps(page, Array.from({ length: 9 }, (_, i) => [{ x: from.x, y: from.y + i * 10 }]))
    expect(await transform()).not.toBe(before)
    await expect(label(page)).toHaveCount(0)
  })

  for (const echo of [true, false]) test(`a double tap on empty board files a ticket there, ${echo
    ? 'with the browser\'s dblclick' : 'with no dblclick'}`, async ({ page, app }) => {
    // Emulated Chromium synthesises a dblclick from two taps. Not every
    // browser does once `touch-action` is `none`, so the stage must not need
    // it. Swallowing it before it reaches the stage is that browser.
    if (!echo) await page.addInitScript(() => window.addEventListener('dblclick', event => event.stopPropagation(), true))
    await linked(page, app)
    const point = await emptyPoint(page)
    const composer = page.locator('#composer')

    // One tap is not two.
    await tap(page, point)
    await page.waitForTimeout(400)
    await expect(composer).toBeHidden()
    // Two taps too far apart in time are two single taps.
    await tap(page, point)
    await expect(composer).toBeHidden()
    // Two taps too far apart on the board are two single taps.
    await page.waitForTimeout(400)
    await touchSteps(page, [[point], [], [{ x: point.x + 60, y: point.y }]])
    await page.waitForTimeout(400)
    await expect(composer).toBeHidden()

    await touchSteps(page, [[point], [], [{ x: point.x + 6, y: point.y + 4 }]])
    await expect(composer).toBeVisible()
    // Opened where the second tap landed, give or take the composer's own
    // offset from the point it files at.
    const box = (await composer.boundingBox())!
    expect(Math.abs(box.x - point.x)).toBeLessThan(260)
    expect(Math.abs(box.y - point.y)).toBeLessThan(260)
  })

  test('a double tap on a card or an edge files nothing', async ({ page, app }) => {
    const { first } = await linked(page, app)
    const edge = await edgePoint(page)
    await touchSteps(page, [[edge], [], [edge]])
    await page.waitForTimeout(400)
    await expect(page.locator('#composer')).toBeHidden()
    // A card on a portrait tablet opens the inspector sheet, so tap its title.
    const title = (await page.locator(`.card[data-id="${first.id}"] .card-title`).boundingBox())!
    const onCard = { x: Math.round(title.x + 20), y: Math.round(title.y + title.height / 2) }
    await touchSteps(page, [[onCard], [], [onCard]])
    await page.waitForTimeout(400)
    await expect(page.locator('#composer')).toBeHidden()
  })
})

test.describe('desk', () => {
  test('the hint describes a mouse', async ({ page, app }) => {
    await app.create('On a desk', { x: 0, y: 0 })
    await page.goto(app.url)
    const hint = page.locator('#hint')
    await expect(hint).toContainText(DESK_HINT)
    await expect(hint).not.toHaveAttribute('data-pointer', 'coarse')
    await expect(hint).not.toContainText('pinch')
  })

  test('hover names an edge only while the mouse is on it, and a click does not keep it', async ({ page, app }) => {
    await linked(page, app)
    const point = await edgePoint(page)
    const away = await emptyPoint(page)
    await page.mouse.move(point.x, point.y)
    await expect(named(page)).toHaveCount(1)
    await expect(label(page)).toHaveText('depends on')
    await page.mouse.move(away.x, away.y)
    await expect(label(page)).toHaveCount(0)

    await page.mouse.move(point.x, point.y)
    await page.mouse.down()
    await page.mouse.up()
    await expect(label(page)).toHaveCount(1)
    await page.mouse.move(away.x, away.y)
    await expect(label(page)).toHaveCount(0)
  })

  test('a double-click on empty board still files a ticket', async ({ page, app }) => {
    await linked(page, app)
    const point = await emptyPoint(page)
    await page.mouse.dblclick(point.x, point.y)
    await expect(page.locator('#composer')).toBeVisible()
  })
})
