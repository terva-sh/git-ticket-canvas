import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { expectFitsDevice, phone, pinch, tablet, touchSteps, type Device, type Point } from './touch'

// The ticket sheet on a phone: three heights on a handle, closed by dragging
// below the peek, and a board above it that still pans and takes a tap on
// another card. docs/mobile-design-v1.md, "The ticket sheet".

interface View { x: number; y: number; k: number }

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

/** A box once it has stopped moving. The sheet slides and changes height with
 * a transition, and a box read on the way is somewhere it has since left. */
async function settled(locator: Locator) {
  let last = ''
  await expect.poll(async () => {
    const was = last
    last = JSON.stringify(await locator.boundingBox())
    return last === was
  }).toBe(true)
  return JSON.parse(last) as { x: number; y: number; width: number; height: number }
}

async function tap(page: Page, locator: Locator) {
  const box = (await locator.boundingBox())!
  await touchSteps(page, [[whole({ x: box.x + Math.min(40, box.width / 2), y: box.y + Math.min(20, box.height / 2) })]])
}

/** Drag the handle by `dy` pixels in steps, lifting at the end. */
async function dragHandle(page: Page, dy: number, steps = 8) {
  const box = await settled(page.locator('.insp-sheet-handle'))
  const from = whole({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
  await touchSteps(page, Array.from({ length: steps + 1 }, (_, i) => [{ x: from.x, y: Math.round(from.y + dy * i / steps) }]))
}

/**
 * Hide the header before the page lays itself out.
 *
 * The phone header is two wrapping rows until TKT-01M38QP2WYRK9A18P473KTM9BV
 * (Fit the header into one row on a phone) lands, and on the emulated phone it
 * takes about 580 of the 844 pixels. That leaves a stage too short for half of
 * it to be taller than the peek, so three heights cannot be told apart. With
 * the header hidden the stage is the size the sheet is designed for. Nothing
 * in these tests uses the header.
 */
async function withoutHeader(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '#toolbar { display: none !important; }'
      document.head.append(style)
    })
  })
}

test.describe('phone', () => {
  test.use(phone)
  test.beforeEach(async ({ page }) => { await withoutHeader(page) })

  /** Open the board with two cards side by side, and let the fit settle. */
  async function board(page: Page, app: { url: string; create: (title: string, card?: Point) => Promise<{ id: string; title: string }> }) {
    const first = await app.create('First on the phone', { x: 0, y: 0 })
    const second = await app.create('Second on the phone', { x: 400, y: 0 })
    await page.goto(app.url)
    await expect(page.locator(`.card[data-id="${second.id}"]`)).toBeVisible()
    await expect.poll(() => view(page)).toEqual(await view(page))
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'phone')
    return { first, second, card: (id: string) => page.locator(`.card[data-id="${id}"]`) }
  }

  async function stageHeight(page: Page) {
    return (await page.locator('#stage').boundingBox())!.height
  }

  test('the sheet opens at the peek and its handle drags it to half, full and back', async ({ page, app }) => {
    const { first, card } = await board(page, app)
    const inspector = page.locator('#inspector')
    await tap(page, card(first.id))
    await expect(inspector).toHaveClass(/open/)
    await expect(inspector).toHaveAttribute('data-sheet', 'peek')
    const stage = (await page.locator('#stage').boundingBox())!
    const peek = await settled(inspector)
    // The peek is the title, the status and the next action, and no body.
    await expect(page.locator('#fTitle')).toBeInViewport()
    await expect(page.locator('.insp-peek-state')).toHaveText('draft · normal')
    await expect(page.locator('#btnClaim')).toBeInViewport({ ratio: 1 })
    await expect(page.locator('#inspBody')).toBeHidden()
    expect(peek.width).toBe(390)
    expect(Math.round(peek.y + peek.height)).toBe(Math.round(stage.y + stage.height))
    expect(peek.height).toBeLessThan(stage.height / 2)
    expect(await page.locator('.insp-sheet-handle').evaluate(node => getComputedStyle(node).touchAction)).toBe('none')
    const before = await view(page)
    const sent = writes(page)

    await dragHandle(page, -Math.round(stage.height / 2 - peek.height))
    await expect(inspector).toHaveAttribute('data-sheet', 'half')
    const half = await settled(inspector)
    expect(half.height).toBeCloseTo(stage.height / 2, 0)
    await expect(page.locator('#inspBody')).toBeVisible()

    await dragHandle(page, -Math.round(stage.height / 2))
    await expect(inspector).toHaveAttribute('data-sheet', 'full')
    const full = await settled(inspector)
    expect(full.height).toBeCloseTo(stage.height, 0)
    expect(full.y).toBeCloseTo(stage.y, 0)

    await dragHandle(page, Math.round(stage.height / 2))
    await expect(inspector).toHaveAttribute('data-sheet', 'half')
    await dragHandle(page, Math.round(stage.height / 2 - peek.height))
    await expect(inspector).toHaveAttribute('data-sheet', 'peek')
    expect((await settled(inspector)).height).toBeCloseTo(peek.height, 0)

    // A drag on the handle is the sheet's, not the board's, and saves nothing.
    expect(await view(page)).toEqual(before)
    expect(sent).toEqual([])
    await expectFitsDevice(page, phone)
  })

  test('a tap on the handle steps the height, and keys step it too', async ({ page, app }) => {
    const { first, card } = await board(page, app)
    const inspector = page.locator('#inspector'), handle = page.locator('.insp-sheet-handle')
    await tap(page, card(first.id))
    await expect(inspector).toHaveAttribute('data-sheet', 'peek')
    await settled(inspector)
    await tap(page, handle)
    await expect(inspector).toHaveAttribute('data-sheet', 'half')
    await tap(page, handle)
    await expect(inspector).toHaveAttribute('data-sheet', 'full')
    await handle.focus()
    await page.keyboard.press('ArrowDown')
    await expect(inspector).toHaveAttribute('data-sheet', 'half')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(inspector).toHaveAttribute('data-sheet', 'peek')
    await expect(inspector).toHaveClass(/open/)
    await page.keyboard.press('ArrowUp')
    await expect(inspector).toHaveAttribute('data-sheet', 'half')
  })

  test('dragging below the peek closes the sheet, and it opens at the peek again', async ({ page, app }) => {
    const { first, card } = await board(page, app)
    const inspector = page.locator('#inspector')
    await tap(page, card(first.id))
    const peek = await settled(inspector)

    // A nudge down that stays within a third of the peek springs back.
    await dragHandle(page, Math.round(peek.height / 4), 4)
    await expect(inspector).toHaveAttribute('data-sheet', 'peek')
    await expect(inspector).toHaveClass(/open/)
    expect((await settled(inspector)).height).toBeCloseTo(peek.height, 0)

    // Up to full, then all the way down in one drag.
    await dragHandle(page, -Math.round(await stageHeight(page)))
    await expect(inspector).toHaveAttribute('data-sheet', 'full')
    await settled(inspector)
    await dragHandle(page, Math.round(await stageHeight(page)))
    await expect(inspector).not.toHaveClass(/open/)
    await expect(card(first.id)).not.toHaveClass(/selected/)

    await tap(page, card(first.id))
    await expect(inspector).toHaveClass(/open/)
    await expect(inspector).toHaveAttribute('data-sheet', 'peek')
  })

  test('above a half sheet the board pans and pinches, and a tap on another card switches the ticket', async ({ page, app }) => {
    const { first, second, card } = await board(page, app)
    const inspector = page.locator('#inspector')
    await tap(page, card(first.id))
    await settled(inspector)
    await tap(page, page.locator('.insp-sheet-handle'))
    await expect(inspector).toHaveAttribute('data-sheet', 'half')
    const sheet = await settled(inspector)
    const stage = (await page.locator('#stage').boundingBox())!
    // Empty board, well above the sheet and clear of the two cards.
    const on = whole({ x: stage.x + stage.width / 2, y: stage.y + 60 })
    expect(on.y).toBeLessThan(sheet.y)
    const sent = writes(page)

    const before = await view(page)
    await touchSteps(page, [[on], [{ x: on.x, y: on.y + 30 }], [{ x: on.x + 20, y: on.y + 60 }], [{ x: on.x + 40, y: on.y + 90 }]])
    const panned = await view(page)
    expect(panned.k).toBeCloseTo(before.k, 5)
    expect(panned.x - before.x).toBeCloseTo(40, 0)
    expect(panned.y - before.y).toBeCloseTo(90, 0)

    await pinch(page, whole({ x: stage.x + stage.width / 2, y: stage.y + 90 }), 80, 60)
    expect((await view(page)).k).toBeLessThan(panned.k)
    await expect(inspector).toHaveAttribute('data-sheet', 'half')
    await expect(inspector).toHaveClass(/open/)
    expect(sent).toEqual([])

    // Bring the second card above the sheet, then tap it.
    let target = (await card(second.id).boundingBox())!
    const room = { top: stage.y + 20, bottom: sheet.y - 20 }
    if (target.y + target.height > room.bottom || target.y < room.top || target.x + 40 > stage.x + stage.width) {
      const to = whole({ x: stage.x + stage.width / 2, y: (room.top + room.bottom) / 2 })
      const from = whole({ x: target.x + 40, y: target.y + 20 })
      // Pan from empty board by the offset that puts the card's corner at `to`.
      const start = whole({ x: stage.x + 20, y: stage.y + 30 })
      const end = whole({ x: start.x + to.x - from.x, y: start.y + to.y - from.y })
      await touchSteps(page, Array.from({ length: 9 }, (_, i) => [whole({
        x: start.x + (end.x - start.x) * i / 8, y: start.y + (end.y - start.y) * i / 8 })]))
      target = (await card(second.id).boundingBox())!
    }
    expect(target.y + 20).toBeLessThan(sheet.y)
    await tap(page, card(second.id))

    await expect(page.locator('#fTitle')).toHaveValue(second.title)
    await expect(inspector).toHaveClass(/open/)
    await expect(inspector).toHaveAttribute('data-sheet', 'half')
    await expectFitsDevice(page, phone)
  })

  test('status, priority, the checklist, notes and text fields edit from the full sheet', async ({ page, app }) => {
    const { first, card } = await board(page, app)
    const inspector = page.locator('#inspector')
    await tap(page, card(first.id))
    await settled(inspector)
    // A quick drag, then taps on fields. Before the handle refused the
    // browser's own touch gestures, the drag ended in a fling and the first
    // tap after it, on the disclosure below, produced no click.
    await dragHandle(page, -Math.round(await stageHeight(page)))
    await expect(inspector).toHaveAttribute('data-sheet', 'full')
    await settled(inspector)
    const field = (label: string) => page.locator('#inspBody .field')
      .filter({ has: page.locator('label', { hasText: new RegExp(`^${label}$`) }) })
    const saved = async (run: () => Promise<unknown>) => {
      const response = page.waitForResponse(r => r.request().method() === 'PATCH')
      await run()
      expect((await response).status()).toBe(200)
    }

    await page.getByText('Edit status, priority, ownership and due date', { exact: true }).tap()
    await saved(() => field('Status').locator('select').selectOption('ready'))
    await saved(() => field('Priority').locator('select').selectOption('high'))
    await saved(async () => {
      await page.locator('#fTitle').fill('Renamed from the sheet')
      await page.locator('#fTitle').press('Enter')
    })
    await saved(async () => {
      await field('Description').locator('textarea').fill('Written on a phone.')
      await field('Description').locator('textarea').blur()
    })
    await page.getByText('Acceptance criteria · add', { exact: true }).tap()
    await saved(async () => {
      await field('Acceptance criteria').locator('input.control').fill('Checked from the sheet')
      await field('Acceptance criteria').locator('input.control').press('Enter')
    })
    await saved(() => field('Acceptance criteria').locator('input[type=checkbox]').tap())
    await page.getByText('Notes · add', { exact: true }).tap()
    await saved(async () => {
      await field('Notes').locator('textarea').fill('Noted from the sheet')
      await field('Notes').locator('textarea').press('Control+Enter')
    })

    // The fixture's Ticket names only the fields other specs read.
    const ticket = (await app.board()).tickets.find(each => each.id === first.id)! as unknown as {
      status: string; priority: string; title: string
      body: { description: string; acceptanceCriteria: { text: string; checked: boolean }[]; notes: { text: string }[] }
    }
    expect(ticket).toMatchObject({ status: 'ready', priority: 'high', title: 'Renamed from the sheet' })
    expect(ticket.body.description).toBe('Written on a phone.')
    expect(ticket.body.acceptanceCriteria).toMatchObject([{ text: 'Checked from the sheet', checked: true }])
    expect(ticket.body.notes.map(note => note.text)).toEqual(['Noted from the sheet'])
    await expect(inspector).toHaveAttribute('data-sheet', 'full')
    await expectFitsDevice(page, phone)
  })

  // The sheet keys on the layout, which a person can override, and not on
  // the window's width, which they cannot.
  test('a phone set to the tablet layout gets the tablet placement', async ({ page, app }) => {
    await page.addInitScript(() => localStorage.setItem('git-ticket-canvas.display', JSON.stringify({ layout: 'tablet' })))
    const ticket = await app.create('Tablet layout on a phone', { x: 0, y: 0 })
    await page.goto(app.url)
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'tablet')
    await tap(page, page.locator(`.card[data-id="${ticket.id}"]`))
    const inspector = page.locator('#inspector')
    await expect(inspector).toHaveClass(/open/)
    const box = await settled(inspector), stage = (await page.locator('#stage').boundingBox())!
    expect(box.height).toBeCloseTo(stage.height * 0.55, 0)
    await expect(page.locator('.insp-sheet-handle')).toBeHidden()
    await expect(page.locator('#inspBody')).toBeVisible()
  })
})

// A phone turned landscape keeps its sheet, since the layout goes by the short
// side, and after the header and the browser's own bars it has a stage of
// about 300 pixels. Half of that is less than the peek, so half is the peek
// and a few lines of the body instead, with the title and the foot in view.
const landscape: Device = { ...phone, viewport: { width: phone.viewport.height, height: 300 } }

test.describe('phone, landscape', () => {
  test.use(landscape)
  test.beforeEach(async ({ page }) => { await withoutHeader(page) })

  test('half is never shorter than the peek', async ({ page, app }) => {
    const ticket = await app.create('Landscape phone', { x: 0, y: 0 })
    await page.goto(app.url)
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'phone')
    await expect(page.locator(`.card[data-id="${ticket.id}"]`)).toBeVisible()
    await tap(page, page.locator(`.card[data-id="${ticket.id}"]`))
    const inspector = page.locator('#inspector')
    await expect(inspector).toHaveAttribute('data-sheet', 'peek')
    const peek = await settled(inspector), stage = (await page.locator('#stage').boundingBox())!
    expect(peek.height, 'a stage short enough to reach the floor').toBeGreaterThan(stage.height / 2)
    await tap(page, page.locator('.insp-sheet-handle'))
    await expect(inspector).toHaveAttribute('data-sheet', 'half')
    const half = await settled(inspector)
    // Inspector.tsx's SHEET_HALF_BODY.
    expect(half.height).toBeCloseTo(Math.min(stage.height, peek.height + 96), 0)
    await expect(page.locator('#btnClaim')).toBeInViewport({ ratio: 1 })
    await expect(page.locator('#fTitle')).toBeInViewport({ ratio: 1 })
    await expect(page.locator('#inspBody')).toBeVisible()
    await expectFitsDevice(page, landscape)
  })
})

// The placements the phone sheet must not disturb.
test.describe('tablet', () => {
  test.use(tablet)

  test('a portrait tablet keeps its bottom panel at 55% of the stage', async ({ page, app }) => {
    const ticket = await app.create('Tablet inspector', { x: 0, y: 0 })
    await page.goto(app.url)
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'tablet')
    await expect(page.locator('html')).toHaveAttribute('data-inspector', 'bottom')
    await tap(page, page.locator(`.card[data-id="${ticket.id}"]`))
    const inspector = page.locator('#inspector')
    await expect(inspector).toHaveClass(/open/)
    const box = await settled(inspector), stage = (await page.locator('#stage').boundingBox())!
    expect(box.x).toBe(stage.x)
    expect(box.width).toBe(stage.width)
    expect(box.height).toBeCloseTo(stage.height * 0.55, 0)
    expect(box.y + box.height).toBeCloseTo(stage.y + stage.height, 0)
    await expect(page.locator('.insp-sheet-handle')).toBeHidden()
    await expect(page.locator('.insp-peek-state')).toBeHidden()
    await expect(page.locator('#inspBody')).toBeVisible()
  })
})

test('a desk keeps its 400px inspector beside the board', async ({ page, app }) => {
  const ticket = await app.create('Desk inspector', { x: 0, y: 0 })
  await page.goto(app.url)
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'desk')
  await page.locator(`.card[data-id="${ticket.id}"]`).click()
  const inspector = page.locator('#inspector')
  await expect(inspector).toHaveClass(/open/)
  const box = await settled(inspector), stage = (await page.locator('#stage').boundingBox())!
  expect(box.width).toBe(400)
  expect(box.x + box.width).toBeCloseTo(stage.x + stage.width, 0)
  expect(box.y).toBeCloseTo(stage.y, 0)
  expect(box.height).toBeCloseTo(stage.height, 0)
  await expect(page.locator('.insp-sheet-handle')).toBeHidden()
  await expect(page.locator('.insp-peek-state')).toBeHidden()
  await expect(page.locator('.insp-resize')).toBeVisible()
})
