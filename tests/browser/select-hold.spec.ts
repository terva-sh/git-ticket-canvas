import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { expectFitsDevice, phone, tablet, touchSteps, viewSettled, type Point } from './touch'

// Selecting several cards without a shift key: hold a card for 450 ms to
// select it and enter selection mode, then tap to add and remove. A tablet
// drags the selection; a phone only selects. docs/mobile-design-v1.md,
// "Tablet".

interface View { x: number; y: number; k: number }

const KEY = 'git-ticket-canvas.display'
/** Longer than the 450 ms the canvas waits, with room for a slow runner. */
const HOLD = 700

/** The view as the scene is drawn, as pinch.spec.ts reads it. */
async function view(page: Page): Promise<View> {
  const transform = await page.locator('#scene').evaluate(scene => (scene as HTMLElement).style.transform)
  const match = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(transform)
  if (!match) throw new Error(`unexpected scene transform ${transform}`)
  return { x: Number(match[1]), y: Number(match[2]), k: Number(match[3]) }
}

/** Every request that could have written something. */
function writes(page: Page) {
  const seen: string[] = []
  page.on('request', request => { if (request.method() !== 'GET') seen.push(`${request.method()} ${request.url()}`) })
  return seen
}

/** Touch coordinates reach the page as whole pixels. */
const whole = (point: Point) => ({ x: Math.round(point.x), y: Math.round(point.y) })

/** A point on the card's title, clear of the link handle and the head. */
async function on(page: Page, id: string) {
  const box = (await page.locator(`.card[data-id="${id}"] .card-title`).boundingBox())!
  return whole({ x: box.x + Math.min(40, box.width / 2), y: box.y + Math.min(12, box.height / 2) })
}

/** A spot on the board no card, sheet or header covers: the top left of the
 * stage. The cards here are framed into the middle, and every sheet a touch
 * opens rises from the bottom. */
async function empty(page: Page) {
  const box = (await page.locator('#stage').boundingBox())!
  return whole({ x: box.x + 24, y: box.y + 24 })
}

const tap = (page: Page, at: Point) => touchSteps(page, [[at]])
const hold = (page: Page, at: Point) => touchSteps(page, [[at], HOLD])
async function tapLocator(page: Page, locator: Locator) {
  const box = (await locator.boundingBox())!
  await tap(page, whole({ x: box.x + box.width / 2, y: box.y + box.height / 2 }))
}

/** One finger from `from`, by `by`, in eight steps, and up. */
function drag(from: Point, by: Point) {
  return Array.from({ length: 9 }, (_, i) => [whole({ x: from.x + by.x * i / 8, y: from.y + by.y * i / 8 })])
}

async function open(page: Page, url: string, layout: string) {
  await page.goto(url)
  // The phone's first-visit tip sits along the bottom; it is not what these
  // tests are about.
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ tipClosed: true })), KEY)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-layout', layout)
  await expect(page.locator('.card').first()).toBeVisible()
  await viewSettled(page)
}

const mode = (page: Page) => page.locator('#selectionMode')
const count = (page: Page) => page.locator('#selectionCount')
const cardOf = (page: Page, id: string) => page.locator(`.card[data-id="${id}"]`)

test.describe('tablet', () => {
  test.use(tablet)

  async function board(page: Page, app: { url: string; create(title: string, card?: Point): Promise<{ id: string }> }) {
    const a = await app.create('Held first', { x: 0, y: 0 })
    const b = await app.create('Tapped second', { x: 320, y: 0 })
    const c = await app.create('Left alone', { x: 0, y: 300 })
    await open(page, app.url, 'tablet')
    return { a: a.id, b: b.id, c: c.id }
  }

  test('a long press selects the card and enters selection mode', async ({ page, app }) => {
    const { a, b } = await board(page, app)
    await expect(mode(page)).toHaveCount(0)
    const sent = writes(page)

    await hold(page, await on(page, a))

    await expect(mode(page)).toBeVisible()
    await expect(count(page)).toHaveText('1')
    await expect(cardOf(page, a)).toHaveClass(/selected/)
    await expect(cardOf(page, b)).not.toHaveClass(/selected/)
    // Holding is not dragging: a finger that stayed put saves nothing.
    expect(sent).toEqual([])
  })

  test('moving more than 8 px before the press completes drags the card and enters no mode', async ({ page, app }) => {
    const { a } = await board(page, app)
    const at = await on(page, a)
    const saved = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/layout') && r.request().method() === 'PUT')

    // 12 px at once, then held well past the 450 ms.
    await touchSteps(page, [[at], [{ x: at.x + 12, y: at.y }], HOLD, [{ x: at.x + 60, y: at.y + 40 }]])

    expect((await saved).status()).toBe(200)
    await expect(mode(page)).toHaveCount(0)
    const moved = (await app.board()).layout.cards[a]
    expect(moved.x).toBeGreaterThan(0)
    expect(moved.y).toBeGreaterThan(0)
  })

  test('in selection mode a tap toggles a card off and on', async ({ page, app }) => {
    const { a, b } = await board(page, app)
    await hold(page, await on(page, a))
    await expect(count(page)).toHaveText('1')
    const sent = writes(page)

    await tap(page, await on(page, b))
    await expect(count(page)).toHaveText('2')
    await expect(cardOf(page, a)).toHaveClass(/selected/)
    await expect(cardOf(page, b)).toHaveClass(/selected/)

    await tap(page, await on(page, a))
    await expect(count(page)).toHaveText('1')
    await expect(cardOf(page, a)).not.toHaveClass(/selected/)
    await expect(cardOf(page, b)).toHaveClass(/selected/)
    // The inspector moved to the card still selected.
    await expect(page.locator('#fTitle')).toHaveValue('Tapped second')

    // A fingertip wobbles. Within 8 px it is still a tap, and saves nothing.
    const at = await on(page, a)
    await touchSteps(page, [[at], [{ x: at.x + 4, y: at.y + 3 }]])
    await expect(count(page)).toHaveText('2')
    await expect(cardOf(page, a)).toHaveClass(/selected/)
    expect(sent).toEqual([])
  })

  test('a drag from a selected card moves every selected card', async ({ page, app }) => {
    const { a, b, c } = await board(page, app)
    await hold(page, await on(page, a))
    await tap(page, await on(page, b))
    await expect(count(page)).toHaveText('2')
    const saved = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/layout') && r.request().method() === 'PUT')

    await touchSteps(page, drag(await on(page, b), { x: 60, y: 90 }))

    expect((await saved).status()).toBe(200)
    await expect.poll(async () => (await app.board()).layout.cards[a].y).toBeGreaterThan(0)
    const cards = (await app.board()).layout.cards
    expect(cards[b].x - cards[a].x).toBe(320)
    expect(cards[b].y).toBe(cards[a].y)
    expect(cards[c]).toEqual({ x: 0, y: 300 })
    // Still in the mode, with the same two.
    await expect(count(page)).toHaveText('2')
  })

  test('Done leaves selection mode and keeps the selection', async ({ page, app }) => {
    const { a, b } = await board(page, app)
    await hold(page, await on(page, a))
    await tap(page, await on(page, b))
    await expect(count(page)).toHaveText('2')

    await tapLocator(page, page.locator('#selectionDone'))

    await expect(mode(page)).toHaveCount(0)
    await expect(page.locator('.card.selected')).toHaveCount(2)
    // Out of the mode a tap no longer toggles. A tap on a selected card keeps
    // the selection, as a click on one does on a desk, so a drag can follow.
    await tap(page, await on(page, b))
    await expect(page.locator('.card.selected')).toHaveCount(2)
    await expect(mode(page)).toHaveCount(0)
  })

  test('a tap on empty board leaves selection mode', async ({ page, app }) => {
    const { a } = await board(page, app)
    await hold(page, await on(page, a))
    await expect(mode(page)).toBeVisible()

    await tap(page, await empty(page))

    await expect(mode(page)).toHaveCount(0)
    await expect(cardOf(page, a)).toHaveClass(/selected/)
  })

  for (const echo of [true, false]) test(`a double tap on empty board leaves selection mode and files nothing, ${echo
    ? 'with the browser\'s dblclick' : 'with no dblclick'}`, async ({ page, app }) => {
    // Out of the mode a double tap here files a ticket (touch-help.spec.ts).
    // In it, the first tap is how somebody leaves, and tapping twice to be
    // sure is not asking for a ticket.
    if (!echo) await page.addInitScript(() => window.addEventListener('dblclick', event => event.stopPropagation(), true))
    const { a } = await board(page, app)
    await hold(page, await on(page, a))
    await expect(mode(page)).toBeVisible()
    const point = await empty(page)

    await touchSteps(page, [[point], [], [{ x: point.x + 6, y: point.y + 4 }]])

    await expect(mode(page)).toHaveCount(0)
    await page.waitForTimeout(400)
    await expect(page.locator('#composer')).toBeHidden()
  })

  test('a drag on empty board pans and stays in selection mode', async ({ page, app }) => {
    const { a } = await board(page, app)
    await hold(page, await on(page, a))
    const before = await view(page)

    await touchSteps(page, drag(await empty(page), { x: 40, y: 60 }))

    const after = await view(page)
    expect(after.x - before.x).toBeCloseTo(40, 0)
    await expect(mode(page)).toBeVisible()
  })
})

test.describe('phone', () => {
  test.use(phone)

  async function board(page: Page, app: { url: string; create(title: string, card?: Point): Promise<{ id: string }> }) {
    const a = await app.create('Held first', { x: 0, y: 0 })
    const b = await app.create('Tapped second', { x: 0, y: 260 })
    await open(page, app.url, 'phone')
    return { a: a.id, b: b.id }
  }

  test('a long press selects the card, enters the mode in the one-row header, and drags nothing', async ({ page, app }) => {
    const { a } = await board(page, app)
    const at = await on(page, a)
    const style = await cardOf(page, a).getAttribute('style')
    const files = await app.snapshot()
    const sent = writes(page)

    await hold(page, at)

    await expect(mode(page)).toBeVisible()
    await expect(count(page)).toHaveText('1')
    await expect(cardOf(page, a)).toHaveClass(/selected/)
    // The mode stands where the search was, and the header is still one row.
    await expect(page.locator('#search')).toHaveCount(0)
    const header = (await page.locator('#toolbar').boundingBox())!
    const done = (await page.locator('#selectionDone').boundingBox())!
    expect(done.y + done.height).toBeLessThanOrEqual(header.y + header.height)
    await expectFitsDevice(page, phone)

    // A drag after the hold pans; the card stays where it is on the board.
    const before = await view(page)
    await touchSteps(page, drag(at, { x: 30, y: 50 }))
    expect((await view(page)).y - before.y).toBeCloseTo(50, 0)
    await expect(cardOf(page, a)).toHaveAttribute('style', style!)
    await expect(count(page)).toHaveText('1')
    expect(sent).toEqual([])
    expect(await app.snapshot()).toEqual(files)
  })

  test('moving more than 8 px before the press completes pans and selects nothing', async ({ page, app }) => {
    const { a } = await board(page, app)
    const at = await on(page, a)
    const before = await view(page)

    await touchSteps(page, [[at], [{ x: at.x, y: at.y + 12 }], HOLD])

    expect((await view(page)).y - before.y).toBeCloseTo(12, 0)
    await expect(mode(page)).toHaveCount(0)
    await expect(page.locator('.card.selected')).toHaveCount(0)
    await expect(page.locator('#inspector.open')).toHaveCount(0)
  })

  test('in selection mode a tap toggles a card rather than opening it', async ({ page, app }) => {
    const { a, b } = await board(page, app)
    await hold(page, await on(page, a))
    await expect(count(page)).toHaveText('1')

    await tap(page, await on(page, b))
    await expect(count(page)).toHaveText('2')
    await expect(cardOf(page, b)).toHaveClass(/selected/)

    await tap(page, await on(page, b))
    await expect(count(page)).toHaveText('1')
    await expect(cardOf(page, b)).not.toHaveClass(/selected/)
    await expect(cardOf(page, a)).toHaveClass(/selected/)

    await tap(page, await on(page, b))
    await expect(count(page)).toHaveText('2')
  })

  test('Done and a tap on empty board both leave the mode', async ({ page, app }) => {
    const { a } = await board(page, app)
    await hold(page, await on(page, a))
    await expect(mode(page)).toBeVisible()
    await tapLocator(page, page.locator('#selectionDone'))
    await expect(mode(page)).toHaveCount(0)
    await expect(page.locator('#search')).toBeVisible()

    await hold(page, await on(page, a))
    await expect(mode(page)).toBeVisible()
    await tap(page, await empty(page))
    await expect(mode(page)).toHaveCount(0)
    await expect(page.locator('#search')).toBeVisible()
  })
})

test.describe('desk', () => {
  test('shift-click still adds to the selection, and a held mouse enters no mode', async ({ page, app }) => {
    const a = await app.create('First', { x: 0, y: 0 })
    const b = await app.create('Second', { x: 320, y: 0 })
    const c = await app.create('Third', { x: 0, y: 300 })
    await page.goto(app.url)
    const card = (id: string) => page.locator(`.card[data-id="${id}"] .card-title`)
    await card(a.id).click()
    await card(b.id).click({ modifiers: ['Shift'] })
    await expect(page.locator('.card.selected')).toHaveCount(2)
    await expect(mode(page)).toHaveCount(0)
    // Shift adds and never takes away, as before.
    await card(a.id).click({ modifiers: ['Shift'] })
    await expect(page.locator('.card.selected')).toHaveCount(2)
    // A plain click on a card outside the selection replaces it.
    await card(c.id).click()
    await expect(page.locator('.card.selected')).toHaveCount(1)

    const box = (await card(b.id).boundingBox())!
    await page.mouse.move(box.x + 20, box.y + 8)
    await page.mouse.down()
    await page.waitForTimeout(HOLD)
    await page.mouse.up()
    await expect(mode(page)).toHaveCount(0)
    await expect(page.locator('.card.selected')).toHaveCount(1)
  })
})
