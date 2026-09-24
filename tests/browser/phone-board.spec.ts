import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { expectFitsDevice, phone, touchSteps, viewSettled, type Point } from './touch'

// A phone's board views and triages: one finger pans, two zoom, a tap opens a
// card, and nothing on it writes layout. docs/mobile-design-v1.md, "The board".

interface View { x: number; y: number; k: number }

const KEY = 'git-ticket-canvas.display'
const TIP = 'drag to move around · pinch to zoom · tap a card to open it'

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

/** A whole-pixel point on the element that a finger there would land on.
 * The opening fit can leave a card partly past the edge of a 390px screen, or
 * under the hint, and a touch outside the viewport never reaches the page, so
 * a point taken from the bounding box alone misses now and then. This walks
 * the box and returns the first point, nearest its top left, that is on the
 * screen and whose topmost element is this one or inside it. An element that
 * lets touches through, as the phone's frame label does, names in `lands` what
 * the finger should reach instead, and a card is never it. */
async function reachable(page: Page, locator: Locator, lands?: string): Promise<Point> {
  const point = await locator.evaluate((element, lands) => {
    const box = element.getBoundingClientRect()
    for (let y = Math.ceil(box.top) + 4; y < box.bottom - 2; y += 4) {
      for (let x = Math.ceil(box.left) + 4; x < box.right - 2; x += 4) {
        if (x >= window.innerWidth || y >= window.innerHeight) continue
        const hit = document.elementFromPoint(x, y)
        if (hit && (lands ? hit.closest(lands) && !hit.closest('.card') : element.contains(hit))) return { x, y }
      }
    }
    return null
  }, lands)
  if (!point) throw new Error('no part of the element is on screen and uncovered')
  return point
}

async function tap(page: Page, locator: Locator) {
  await touchSteps(page, [[await reachable(page, locator)]])
}

/** One finger from `from`, by `by`, in eight steps, and up. */
async function drag(page: Page, from: Point, by: Point) {
  await touchSteps(page, Array.from({ length: 9 }, (_, i) => [whole({ x: from.x + by.x * i / 8, y: from.y + by.y * i / 8 })]))
}

/** Store display settings the way the Display panel does, once. An init
 * script would run again on every reload and undo what the page wrote.
 *
 * The remembered view goes too. It was taken at whatever size the board had
 * before, and a phone toolbar and a tablet toolbar at 390px leave boards of
 * very different heights, so restoring one layout's view in the other can put
 * the card off the screen. Every open after this one fits instead. The page
 * writes the view 300ms after it last moved, and on unload writes only a view
 * still owed from that wait, so this waits for it to hold still first. After
 * that nothing is owed and the navigation that follows writes nothing back;
 * clearing sooner leaves the owed write to land afterwards. */
async function store(page: Page, stored: Record<string, unknown> | null) {
  await viewSettled(page)
  await page.evaluate(([key, value]) => {
    for (const held of Object.keys(localStorage)) if (held.startsWith('git-ticket-canvas.view.')) localStorage.removeItem(held)
    if (value === null) localStorage.removeItem(key!)
    else localStorage.setItem(key!, value)
  }, [KEY, stored === null ? null : JSON.stringify(stored)] as const)
}

async function open(page: Page, url: string, layout = 'phone') {
  await page.goto(url)
  await expect(page.locator('html')).toHaveAttribute('data-layout', layout)
  await expect(page.locator('.card').first()).toBeVisible()
  // Let the opening fit settle before anything measures the view.
  await viewSettled(page)
}

/** A frame around the card, made through the tablet's frame panel, since a
 * phone offers no way to make one. The phone is then put back on automatic. */
async function frameAround(page: Page, url: string) {
  await page.goto(url)
  await store(page, { layout: 'tablet', tipClosed: true })
  await open(page, url, 'tablet')
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
}

test.describe('phone', () => {
  test.use(phone)

  test('a drag that starts on a card pans the board, opens nothing and saves nothing', async ({ page, app }) => {
    const ticket = await app.create('Dragged on a phone', { x: 0, y: 0 })
    await open(page, app.url)
    const card = page.locator(`.card[data-id="${ticket.id}"]`)
    const style = await card.getAttribute('style')
    const before = await view(page)
    const files = await app.snapshot()
    const sent = writes(page)

    await drag(page, await reachable(page, card.locator('.card-title')), { x: 40, y: 80 })

    const after = await view(page)
    expect(after.k).toBeCloseTo(before.k, 5)
    expect(after.x - before.x).toBeCloseTo(40, 0)
    expect(after.y - before.y).toBeCloseTo(80, 0)
    // The card is where it was on the board; only the board moved.
    await expect(card).toHaveAttribute('style', style!)
    await expect(page.locator('#inspector.open')).toHaveCount(0)
    await expect(page.locator('.card.selected')).toHaveCount(0)
    expect(sent).toEqual([])
    expect(await app.snapshot()).toEqual(files)
    await expectFitsDevice(page, phone)
  })

  test('a tap on a card opens it', async ({ page, app }) => {
    const ticket = await app.create('Tapped on a phone', { x: 0, y: 0 })
    await open(page, app.url)
    const sent = writes(page)

    await tap(page, page.locator(`.card[data-id="${ticket.id}"] .card-title`))

    await expect(page.locator('#inspector.open')).toBeVisible()
    await expect(page.locator('#fTitle')).toHaveValue(ticket.title)
    await expect(page.locator(`.card[data-id="${ticket.id}"]`)).toHaveClass(/selected/)
    expect(sent).toEqual([])
  })

  test('no link or frame handle is drawn, and a finger on the frame title pans', async ({ page, app }) => {
    const ticket = await app.create('Framed on a phone', { x: 0, y: 0 })
    await frameAround(page, app.url)
    await store(page, { tipClosed: true })
    await open(page, app.url)
    const card = page.locator(`.card[data-id="${ticket.id}"]`)
    await expect(card).toBeVisible()

    await expect(page.locator('.handle')).toHaveCount(0)
    await expect(page.locator('.canvas-frame-title, .canvas-frame-resize, [data-frame-gesture]')).toHaveCount(0)
    // The frame still says what it is.
    const label = page.locator('.canvas-frame-label')
    await expect(label).toHaveText('Held · 1 members')
    // Selecting the card, where a desk shows the handle, does not draw it.
    await tap(page, card.locator('.card-title'))
    await expect(card).toHaveClass(/selected/)
    await expect(page.locator('.handle')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('#inspector.open')).toHaveCount(0)

    const before = await view(page)
    const frames = (await app.board() as unknown as { layout: { frames: unknown } }).layout.frames
    const sent = writes(page)
    await drag(page, await reachable(page, label, '#stage'), { x: 30, y: 60 })

    const after = await view(page)
    expect(after.x - before.x).toBeCloseTo(30, 0)
    expect(after.y - before.y).toBeCloseTo(60, 0)
    await expect(page.locator('#framePanel')).toHaveCount(0)
    expect(sent).toEqual([])
    expect((await app.board() as unknown as { layout: { frames: unknown } }).layout.frames).toEqual(frames)
  })

  test('the Manual placement label does not hand the card back', async ({ page, app }) => {
    const ticket = await app.create('Placed by hand', { x: 0, y: 0 })
    await page.goto(app.url)
    // Full density shows the card head, where the control lives.
    await store(page, { density: 'full', tipClosed: true })
    await open(page, app.url)
    const card = page.locator(`.card[data-id="${ticket.id}"]`)
    const placement = card.locator('.card-placement')
    await expect(placement).toHaveText('Manual')
    await expect(card.locator('button.card-placement, [data-release]')).toHaveCount(0)
    const files = await app.snapshot()
    const sent = writes(page)

    await tap(page, placement)

    // A tap on it is a tap on the card, and nothing else.
    await expect(page.locator('#inspector.open')).toBeVisible()
    await expect(card).not.toHaveClass(/unpinned/)
    expect(sent).toEqual([])
    expect(await app.snapshot()).toEqual(files)
  })

  test('the first-visit tip replaces the hint, stays clear of New ticket and the sheet, and stays closed', async ({ page, app }) => {
    const ticket = await app.create('Under the tip', { x: 0, y: 0 })
    await open(page, app.url)
    const tip = page.locator('#boardTip')
    await expect(tip).toHaveText(TIP)
    await expect(page.locator('#hint')).toHaveCount(0)

    // Clear of New ticket, fixed at the bottom right.
    const button = (await page.locator('#btnNew').boundingBox())!
    const box = (await tip.boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(button.y)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)

    // An open ticket sheet rises from the same edge. The tip gives way to it
    // and is still waiting once the sheet closes.
    await tap(page, page.locator(`.card[data-id="${ticket.id}"] .card-title`))
    await expect(page.locator('#inspector.open')).toBeVisible()
    await expect(tip).toBeHidden()
    await page.keyboard.press('Escape')
    await expect(page.locator('#inspector.open')).toHaveCount(0)
    await expect(tip).toBeVisible()

    const before = await view(page)
    await tap(page, tip)
    await expect(tip).toHaveCount(0)
    // A tap on the tip is not a tap on the board.
    expect(await view(page)).toEqual(before)
    await expect(page.locator('#inspector.open')).toHaveCount(0)
    expect(JSON.parse(await page.evaluate(key => localStorage.getItem(key) ?? 'null', KEY))).toEqual({ tipClosed: true })

    await page.reload()
    await open(page, app.url)
    await expect(page.locator('#boardTip')).toHaveCount(0)
    await expect(page.locator('#hint')).toHaveCount(0)
    await expectFitsDevice(page, phone)
  })

  test('a frame draft left open when the layout turns to phone is not redrawn from the board', async ({ page, app }) => {
    await app.create('Beside a draft', { x: 0, y: 0 })
    await page.goto(app.url)
    await store(page, { layout: 'tablet', tipClosed: true })
    await open(page, app.url, 'tablet')
    // New frame arms drawing: a drag on empty board would draw one.
    await page.locator('#btnFrame').click()
    await expect(page.locator('#framePanel')).toBeVisible()
    await page.locator('#btnDisplay').click()
    await page.locator('#display-layout').selectOption('phone')
    await page.keyboard.press('Escape')
    await expect(page.locator('#displayDialog')).toHaveCount(0)
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'phone')
    // The draft is still open and still arming the board. A drawn frame
    // would replace its bounds, which Create and capture then saves.
    const panel = page.locator('#framePanel')
    await expect(panel).toBeVisible()
    const bounds = async () => Promise.all(['X', 'Y', 'Width', 'Height'].map(label => panel.getByLabel(label, { exact: true }).inputValue()))
    const drafted = await bounds()
    // And the board does not offer what it will refuse.
    await expect(page.locator('#frameDrawHint')).toHaveText('Enter bounds in the frame panel. Escape cancels.')
    const frames = (await app.board() as unknown as { layout: { frames: unknown } }).layout.frames
    const sent = writes(page)

    // The top left of the board, clear of the card framed into the middle
    // and of whatever the draft left open over the right half.
    const stage = (await page.locator('#stage').boundingBox())!
    await drag(page, whole({ x: stage.x + 20, y: stage.y + 20 }), { x: 120, y: 120 })

    await expect(page.locator('.canvas-frame-draft')).toHaveCount(0)
    expect(await bounds()).toEqual(drafted)
    expect(sent).toEqual([])
    expect((await app.board() as unknown as { layout: { frames: unknown } }).layout.frames).toEqual(frames)
  })

  test('a phone set to tablet gets card drags, the handles and the hint back', async ({ page, app }) => {
    const ticket = await app.create('Arranged on a phone', { x: 0, y: 0 })
    await frameAround(page, app.url)
    // The same record frameAround left: tablet, set by hand, and still in force.
    await open(page, app.url, 'tablet')
    const card = page.locator(`.card[data-id="${ticket.id}"]`)

    await expect(page.locator('#hint')).toBeVisible()
    await expect(page.locator('#boardTip')).toHaveCount(0)
    await expect(card.locator('.handle')).toHaveCount(1)
    await expect(page.locator('.canvas-frame-title')).toBeVisible()
    await expect(page.locator('.canvas-frame-resize')).toBeVisible()
    await expect(page.locator('.canvas-frame-label')).toHaveCount(0)

    // A drag from the card moves the card and saves it, as on a tablet.
    // Up and right, since the board on a phone this size is a strip along
    // the bottom and the card can sit at its foot.
    const from = await reachable(page, card.locator('.card-title'))
    const before = await view(page)
    const saved = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/layout') && r.request().method() === 'PUT')
    await drag(page, from, { x: 40, y: -40 })
    expect((await saved).status()).toBe(200)
    expect(await view(page)).toEqual(before)
    const moved = (await app.board()).layout.cards[ticket.id]
    expect(moved.x).toBeGreaterThan(0)
    expect(moved.y).toBeLessThan(0)
  })
})
