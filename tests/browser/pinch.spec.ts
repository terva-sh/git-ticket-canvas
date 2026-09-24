import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { pinch, tablet, touchSteps, twoFingerPan, type Point } from './touch'

// What the board does with two fingers, on an emulated tablet. The harness's
// own checks, that two fingers arrive as two fingers, are in touch.spec.ts.

test.use(tablet)

interface View { x: number; y: number; k: number }

/** The view as the scene is drawn, which is what somebody sees. */
async function view(page: Page): Promise<View> {
  const transform = await page.locator('#scene').evaluate(scene => (scene as HTMLElement).style.transform)
  const match = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(transform)
  if (!match) throw new Error(`unexpected scene transform ${transform}`)
  return { x: Number(match[1]), y: Number(match[2]), k: Number(match[3]) }
}

async function stageBox(page: Page) {
  return (await page.locator('#stage').boundingBox())!
}

/** The scene point under a client point. */
async function sceneAt(page: Page, client: Point) {
  const box = await stageBox(page), v = await view(page)
  return { x: (client.x - box.x - v.x) / v.k, y: (client.y - box.y - v.y) / v.k }
}

/** Every request that could have written something. */
function writes(page: Page) {
  const seen: string[] = []
  page.on('request', request => { if (request.method() !== 'GET') seen.push(`${request.method()} ${request.url()}`) })
  return seen
}

/** Open the board with one card on it and let the opening fit settle. */
async function open(page: Page, url: string, id: string) {
  await page.goto(url)
  await expect(page.locator(`.card[data-id="${id}"]`)).toBeVisible()
  await expect.poll(() => view(page)).toEqual(await view(page))
}

/** Touch coordinates reach the page rounded to whole pixels, so a finger
 * placed at a fraction lands a fraction away from where the test thinks it
 * is, and a pinch that should end where it began ends a little off. */
const whole = (point: Point) => ({ x: Math.round(point.x), y: Math.round(point.y) })

/** An empty spot on the board, well away from the cards these tests place.
 *
 * Near the top rather than the bottom: touching a card selects it, and on a
 * portrait tablet the inspector opens as a sheet along the bottom of the
 * board. A finger landing on the sheet is on the sheet, not the board, so it
 * is not a second finger for a pinch. */
async function empty(page: Page, dx = 0) {
  const box = await stageBox(page)
  return whole({ x: box.x + box.width / 2 + dx, y: box.y + 90 })
}

test('a pinch zooms about the midpoint of the two fingers', async ({ page, app }) => {
  const ticket = await app.create('Pinched', { x: 0, y: 0 })
  await open(page, app.url, ticket.id)
  const center = await empty(page)
  const before = await view(page)
  const anchored = await sceneAt(page, center)

  await pinch(page, center, 100, 200)

  const after = await view(page)
  expect(after.k).toBeCloseTo(Math.min(2.5, before.k * 2), 2)
  const now = await sceneAt(page, center)
  expect(now.x).toBeCloseTo(anchored.x, 0)
  expect(now.y).toBeCloseTo(anchored.y, 0)
})

test('a two-finger drag pans the board with the fingers and keeps the magnification', async ({ page, app }) => {
  const ticket = await app.create('Panned', { x: 0, y: 0 })
  await open(page, app.url, ticket.id)
  const before = await view(page)

  await twoFingerPan(page, await empty(page), { x: 70, y: -90 })

  const after = await view(page)
  expect(after.k).toBeCloseTo(before.k, 5)
  expect(after.x - before.x).toBeCloseTo(70, 0)
  expect(after.y - before.y).toBeCloseTo(-90, 0)
})

test('a second finger during a card drag puts the card back and saves nothing', async ({ page, app }) => {
  const ticket = await app.create('Dragged, then pinched', { x: 0, y: 0 })
  await open(page, app.url, ticket.id)
  const card = page.locator(`.card[data-id="${ticket.id}"]`)
  const style = await card.getAttribute('style')
  const box = (await card.boundingBox())!
  const on = whole({ x: box.x + 60, y: box.y + 20 })
  const moved = { x: on.x + 90, y: on.y + 60 }
  const other = await empty(page, 120)
  const sent = writes(page)

  await touchSteps(page, [
    [on],
    [{ x: on.x + 45, y: on.y + 30 }],
    [moved],
    [moved, other],
    [moved, { x: other.x + 40, y: other.y }],
  ])

  await expect(card).toHaveAttribute('style', style!)
  expect(sent).toEqual([])
  expect((await app.board()).layout.cards[ticket.id]).toEqual({ x: 0, y: 0 })
})

test('a second finger during a link drag leaves no edge and no dependency', async ({ page, app }) => {
  const from = await app.create('Link source', { x: 0, y: 0 })
  const to = await app.create('Link target', { x: 0, y: 360 })
  await open(page, app.url, from.id)
  const handle = page.locator(`.card[data-id="${from.id}"] .handle`)
  await expect(handle).toBeVisible()
  const start = (await handle.boundingBox())!
  const at = { x: start.x + start.width / 2, y: start.y + start.height / 2 }
  const target = (await page.locator(`.card[data-id="${to.id}"]`).boundingBox())!
  const over = { x: target.x + 60, y: target.y + 20 }
  const other = await empty(page, 200)
  const sent = writes(page)

  await touchSteps(page, [
    [at],
    [{ x: (at.x + over.x) / 2, y: (at.y + over.y) / 2 }],
    [over],
    [over, other],
  ])

  await expect(page.locator('#stage')).not.toHaveClass(/linking/)
  expect(sent).toEqual([])
  expect((await app.board()).tickets.find(ticket => ticket.id === to.id)!.dependencies).toEqual([])
})

test('a second finger during a frame move puts the frame back and saves nothing', async ({ page, app }) => {
  const ticket = await app.create('Framed', { x: 0, y: 0 })
  await open(page, app.url, ticket.id)
  // Made through the panel the way a person makes one, then the panel is
  // closed so the board is what the fingers land on.
  await page.locator('#btnFrame').click()
  const panel = page.locator('#framePanel')
  await panel.getByLabel('Frame title', { exact: true }).fill('Held')
  for (const [label, value] of Object.entries({ X: -40, Y: -60, Width: 420, Height: 320 })) {
    await panel.getByLabel(label, { exact: true }).fill(String(value))
  }
  const created = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/layout') && r.request().method() === 'PUT')
  await panel.getByRole('button', { name: 'Create and capture', exact: true }).click()
  expect((await created).status()).toBe(200)
  await panel.getByRole('button', { name: 'Close frame panel' }).click()
  await expect(panel).toHaveCount(0)
  const frame = page.locator('.canvas-frame').first()
  const title = frame.locator('.canvas-frame-title')
  await expect(title).toBeVisible()
  const style = await frame.getAttribute('style')
  const before = (await app.board() as unknown as { layout: { frames: Record<string, unknown> } }).layout.frames
  const box = (await title.boundingBox())!
  const on = whole({ x: box.x + 20, y: box.y + box.height / 2 })
  // Touching the title selects the frame, which opens its panel over the
  // right half of a tablet's board. The second finger goes on the left, where
  // it is on the board and not on the panel.
  const stage = await stageBox(page)
  const other = whole({ x: stage.x + 60, y: stage.y + 90 })
  const sent = writes(page)

  await touchSteps(page, [
    [on],
    [{ x: on.x + 40, y: on.y + 30 }],
    [{ x: on.x + 80, y: on.y + 60 }],
    [{ x: on.x + 80, y: on.y + 60 }, other],
  ])

  await expect(frame).toHaveAttribute('style', style!)
  expect(sent).toEqual([])
  expect((await app.board() as unknown as { layout: { frames: Record<string, unknown> } }).layout.frames).toEqual(before)
})

test('the finger left after a pinch pans the board and does not resume the card drag', async ({ page, app }) => {
  const ticket = await app.create('Left behind', { x: 0, y: 0 })
  await open(page, app.url, ticket.id)
  const card = page.locator(`.card[data-id="${ticket.id}"]`)
  const style = await card.getAttribute('style')
  const box = (await card.boundingBox())!
  const on = whole({ x: box.x + 60, y: box.y + 20 })
  const other = await empty(page, 120)
  const before = await view(page)
  const sent = writes(page)

  // The first finger lands on the card and a second joins, which cancels the
  // card drag. The pinch spreads and comes back, so it ends where it began and
  // the view is unchanged by it. Then the second finger lifts and the first,
  // still on the card, moves. That must pan the board by the finger's travel.
  await touchSteps(page, [
    [on],
    [on, other],
    [on, { x: other.x + 60, y: other.y }],
    [on, other],
    [on, null],
    [{ x: on.x + 20, y: on.y + 15 }, null],
    [{ x: on.x + 40, y: on.y + 30 }, null],
  ])

  const after = await view(page)
  expect(after.k).toBeCloseTo(before.k, 5)
  expect(after.x - before.x).toBeCloseTo(40, 0)
  expect(after.y - before.y).toBeCloseTo(30, 0)
  await expect(card).toHaveAttribute('style', style!)
  expect(sent).toEqual([])
  expect((await app.board()).layout.cards[ticket.id]).toEqual({ x: 0, y: 0 })
})

// The board claims every touch on it with `touch-action: none`, and the
// inspector sits inside the board's element. It still scrolls under a finger,
// because a scroll container is where the browser stops combining its
// ancestors' touch-action; this holds that rather than trusting it.
test('a touch drag inside the open inspector scrolls it and leaves the board alone', async ({ page, app }) => {
  const ticket = await app.patch(await app.create('Long enough to scroll', { x: 0, y: 0 }),
    [{ op: 'setDescription', text: Array.from({ length: 80 }, (_, i) => `Line ${i + 1} of a description long enough to scroll.`).join('\n\n') }])
  await open(page, app.url, ticket.id)
  const box = (await page.locator(`.card[data-id="${ticket.id}"]`).boundingBox())!
  await touchSteps(page, [[whole({ x: box.x + 60, y: box.y + 20 })]])
  const body = page.locator('#inspBody')
  await expect(page.locator('#inspector')).toHaveClass(/open/)
  await expect.poll(() => body.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true)
  // The sheet slides up as it opens. A drag measured against a box still on
  // its way would start somewhere the sheet has since left.
  let settled = ''
  await expect.poll(async () => {
    const was = settled
    settled = JSON.stringify(await body.boundingBox())
    return settled === was
  }).toBe(true)
  const before = await view(page)
  const area = (await body.boundingBox())!
  // In the body's right-hand padding. The left edge is the resize handle,
  // which claims its touches on purpose, and this is about the container.
  const x = Math.round(area.x + area.width - 6), from = Math.round(area.y + area.height - 40)
  const sent = writes(page)

  await touchSteps(page, Array.from({ length: 9 }, (_, i) => [{ x, y: from - i * 30 }]))

  await expect.poll(() => body.evaluate(node => node.scrollTop)).toBeGreaterThan(100)
  expect(await view(page)).toEqual(before)
  expect(sent).toEqual([])
})

// Starting a pinch drops the first finger's gesture, and with it the capture
// that gesture held. A finger that then leaves the board would take its lift
// somewhere the board never hears, and the board would go on counting it as
// down. The next single finger would then be the "second" of a pinch with a
// finger that is not there, so a plain one-finger drag would zoom.
test('a finger that lifts after leaving the board is not still counted', async ({ page, app }) => {
  const ticket = await app.create('Wandering finger', { x: 0, y: 0 })
  await open(page, app.url, ticket.id)
  const board = await empty(page)
  const other = await empty(page, 160)
  const header = (await page.locator('#toolbar').boundingBox())!
  const outside = whole({ x: board.x, y: header.y + header.height / 2 })

  await touchSteps(page, [
    [board],
    [board, other],
    [outside, other],
    [null, other],
  ])
  const before = await view(page)
  await touchSteps(page, [
    [board],
    [{ x: board.x + 25, y: board.y + 35 }],
    [{ x: board.x + 50, y: board.y + 70 }],
  ])

  const after = await view(page)
  expect(after.k).toBeCloseTo(before.k, 5)
  expect(after.x - before.x).toBeCloseTo(50, 0)
  expect(after.y - before.y).toBeCloseTo(70, 0)
})
