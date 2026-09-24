import type { Locator, Page } from '@playwright/test'
import { test, expect, type Ticket } from './fixtures'
import { expectFitsDevice, phone, tablet, touchSteps, viewSettled, type Device, type Point } from './touch'

// The list: the board's tickets grouped by status, switched to from the
// header and remembered with the display settings. docs/mobile-design-v1.md,
// "The list".

const KEY = 'git-ticket-canvas.display'

const list = (page: Page) => page.locator('#ticketList')
const row = (page: Page, id: string) => page.locator(`#ticketList .list-row[data-id="${id}"]`)

/** The rows in the order the list shows them. */
function rows(page: Page) {
  return page.locator('#ticketList .list-row').evaluateAll(found => found.map(row => row.getAttribute('data-id')))
}
/** The cards the board shows rather than dims, which is what the filters
 * leave on the board. The board is still drawn under the list. */
function shown(page: Page) {
  return page.locator('.card:not(.dimmed)').evaluateAll(found => found.map(card => card.getAttribute('data-id')))
}

/** The list and the board agree, and the count says how many both show. */
async function agree(page: Page, expected: readonly string[], total: number) {
  await expect.poll(async () => (await rows(page)).sort()).toEqual([...expected].sort())
  expect((await shown(page)).sort()).toEqual([...expected].sort())
  await expect(page.locator('#counts')).toHaveText(`${expected.length} of ${total}`)
}

/** The view as the scene is drawn, as pinch.spec.ts reads it. */
async function view(page: Page) {
  return page.locator('#scene').evaluate(scene => (scene as HTMLElement).style.transform)
}

/** Every request that could have written something. */
function writes(page: Page) {
  const seen: string[] = []
  page.on('request', request => { if (request.method() !== 'GET') seen.push(`${request.method()} ${request.url()}`) })
  return seen
}

/** A whole-pixel point on the element that a finger there would land on: on
 * the screen, and not under anything else. See phone-board.spec.ts. */
async function reachable(locator: Locator): Promise<Point> {
  const point = await locator.evaluate(element => {
    const box = element.getBoundingClientRect()
    for (let y = Math.ceil(box.top) + 4; y < box.bottom - 2; y += 4) {
      for (let x = Math.ceil(box.left) + 4; x < box.right - 2; x += 4) {
        if (x >= window.innerWidth || y >= window.innerHeight) continue
        const hit = document.elementFromPoint(x, y)
        if (hit && element.contains(hit)) return { x, y }
      }
    }
    return null
  })
  if (!point) throw new Error('no part of the element is on screen and uncovered')
  return point
}

test.describe('on a desk', () => {
  test('Board/List switches the view, and the choice survives a reload', async ({ page, app }) => {
    const ticket = await app.create('Listed', { x: 0, y: 0 })
    await page.goto(app.url)
    await expect(page.locator(`.card[data-id="${ticket.id}"]`)).toBeVisible()
    // The board is where every layout opens the first time.
    await expect(list(page)).toHaveCount(0)
    await expect(page.locator('#viewBoard')).toHaveAttribute('aria-pressed', 'true')

    await page.locator('#viewList').click()
    await expect(row(page, ticket.id)).toBeVisible()
    await expect(page.locator('#viewList')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#viewBoard')).toHaveAttribute('aria-pressed', 'false')
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), KEY)).toEqual({ view: 'list' })

    await page.reload()
    await expect(row(page, ticket.id)).toBeVisible()
    await expect(page.locator('#viewList')).toHaveAttribute('aria-pressed', 'true')

    await page.locator('#viewBoard').click()
    await expect(list(page)).toHaveCount(0)
    // Back on the board is the absence of a record, not a record of `board`.
    expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBeNull()
    await page.reload()
    await expect(page.locator(`.card[data-id="${ticket.id}"]`)).toBeVisible()
    await expect(list(page)).toHaveCount(0)
  })

  test('the list shows the tickets the board shows under every filter and search', async ({ page, app }) => {
    const make = async (title: string, x: number, ops: object[]) => {
      const created = await app.create(title, { x, y: 0 })
      return ops.length ? app.patch(created, ops) : created
    }
    const a = await make('Alpha interface', 0, [{ op: 'addLabel', label: 'ui' }])
    const b = await make('Beta interface and api', 350, [{ op: 'addLabel', label: 'ui' }, { op: 'addLabel', label: 'api' },
      { op: 'setStatus', status: 'ready' }])
    const c = await make('Gamma api', 700, [{ op: 'addLabel', label: 'api' }, { op: 'setStatus', status: 'ready' },
      { op: 'setPriority', priority: 'high' }])
    const d = await make('Delta, nothing on it', 1050, [])
    const all = [a.id, b.id, c.id, d.id]
    await page.goto(app.url)
    await page.locator('#viewList').click()
    await agree(page, all, 4)
    // Grouped by status in the store's order, draft before ready, and the more
    // urgent first inside a group.
    await expect(page.locator('#ticketList .list-heading')).toHaveText(['draft 2', 'ready 2'])
    expect(await rows(page)).toEqual([...[a.id, d.id].sort(), c.id, b.id])

    const chip = (label: string) => page.locator(`.label-chip[data-label="${label}"]`)
    const status = (name: string) => page.locator('#statusFilters .chip', { hasText: name })

    await status('ready').click()
    await agree(page, [b.id, c.id], 4)
    await status('ready').click()

    await page.locator('#labelFilter > summary').click()
    await chip('ui').click()
    await agree(page, [a.id, b.id], 4)
    await chip('api').click()
    await agree(page, [b.id], 4)
    await page.locator('#labelMatch-any').click()
    await agree(page, [a.id, b.id, c.id], 4)
    // A second press on ui excludes it, which wins over the api include.
    await chip('ui').click()
    await agree(page, [c.id], 4)
    await page.locator('#clearLabelFilters').click()
    await page.locator('#labelFilter > summary').click()
    await agree(page, all, 4)

    await page.locator('#search').fill('interface')
    await agree(page, [a.id, b.id], 4)
    // The search reads the ID as well as the title, as the board's does.
    await page.locator('#search').fill(d.id.slice(-8).toLowerCase())
    await agree(page, [d.id], 4)
    await page.locator('#search').fill('nothing matches this')
    await agree(page, [], 4)
    await expect(page.locator('#filterNotice')).toBeVisible()
    await page.locator('#search').fill('')
    await agree(page, all, 4)
  })

  test('clicking a row opens the ticket in the inspector', async ({ page, app }) => {
    const first = await app.create('First in the list', { x: 0, y: 0 })
    const second = await app.create('Second in the list', { x: 350, y: 0 })
    await page.goto(app.url)
    await page.locator('#viewList').click()
    await row(page, second.id).click()
    await expect(page.locator('#inspector')).toHaveClass(/open/)
    await expect(page.locator('#fTitle')).toHaveValue('Second in the list')
    await expect(row(page, second.id)).toHaveAttribute('aria-current', 'true')
    await row(page, first.id).click()
    await expect(page.locator('#fTitle')).toHaveValue('First in the list')
    await expect(row(page, first.id)).toHaveAttribute('aria-current', 'true')
    await expect(row(page, second.id)).not.toHaveAttribute('aria-current', 'true')
  })

  test('live updates reach the list as they reach the board', async ({ page, app }) => {
    const moving = await app.create('Before the change', { x: 0, y: 0 })
    await page.goto(app.url)
    await page.locator('#viewList').click()
    await expect(row(page, moving.id)).toContainText('Before the change')
    await expect(page.locator('#ticketList .list-group[data-status="draft"]').locator(`[data-id="${moving.id}"]`)).toBeVisible()

    // Changed by another writer: the row follows, into the group its new
    // status belongs in, with no reload and no action on this page.
    await app.patch(moving, [{ op: 'setTitle', title: 'After the change' }, { op: 'setStatus', status: 'ready' }])
    await expect(page.locator('#ticketList .list-group[data-status="ready"]').locator(`[data-id="${moving.id}"]`))
      .toContainText('After the change')
    await expect(page.locator('#ticketList .list-group[data-status="draft"]')).toHaveCount(0)
    await expect(page.locator(`.card[data-id="${moving.id}"]`)).toContainText('After the change')

    // Filed by another writer: a row arrives, as a card does.
    const filed = await app.create('Filed elsewhere', { x: 350, y: 0 })
    await expect(row(page, filed.id)).toContainText('Filed elsewhere')
    await expect(page.locator('#counts')).toHaveText('2 of 2')
  })

  test('a row carries the title, ID, priority, labels and criterion progress', async ({ page, app }) => {
    const ticket = await app.patch(await app.create('Everything on one line', { x: 0, y: 0 }), [
      { op: 'setPriority', priority: 'high' }, { op: 'addLabel', label: 'mobile' }, { op: 'addLabel', label: 'ui' },
      { op: 'addChecklistItem', section: 'ac', text: 'One' }, { op: 'addChecklistItem', section: 'ac', text: 'Two' },
    ])
    await app.patch(ticket, [{ op: 'setChecklistItem', section: 'ac', index: 1, checked: true }])
    await page.goto(app.url)
    await page.locator('#viewList').click()
    const line = row(page, ticket.id)
    await expect(line.locator('.list-title')).toHaveText('Everything on one line')
    // The short form the card shows, which is a prefix of the full ID.
    const short = await page.locator(`.card[data-id="${ticket.id}"] .card-id`).textContent()
    expect(ticket.id.startsWith(short!)).toBe(true)
    await expect(line.locator('.list-id')).toHaveText(short!)
    await expect(line.locator('.list-priority')).toHaveText('high')
    await expect(line.locator('.pill.label')).toHaveText(['mobile', 'ui'])
    await expect(line.locator('.list-progress')).toHaveText('AC 1/2')
  })
})

test.describe('on a phone', () => {
  test.use(phone)

  test('tapping a row opens the ticket in the sheet, and List toggles back to the board', async ({ page, app }) => {
    const ticket = await app.create('Opened from the list', { x: 0, y: 0 })
    await page.goto(app.url)
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'phone')
    await expect(page.locator(`.card[data-id="${ticket.id}"]`)).toBeVisible()
    await expect(list(page)).toHaveCount(0)
    await touchSteps(page, [[await reachable(page.locator('#viewList'))]])
    await expect(page.locator('#viewList')).toHaveAttribute('aria-pressed', 'true')
    await expect(row(page, ticket.id)).toBeVisible()
    await expectFitsDevice(page, phone)

    await touchSteps(page, [[await reachable(row(page, ticket.id))]])
    const sheet = page.locator('#inspector')
    await expect(sheet).toHaveClass(/open/)
    await expect(sheet).toHaveAttribute('data-sheet', /peek|half|full/)
    await expect(page.locator('#fTitle')).toHaveValue('Opened from the list')

    await page.keyboard.press('Escape')
    await expect(sheet).not.toHaveClass(/open/)
    await touchSteps(page, [[await reachable(page.locator('#viewList'))]])
    await expect(list(page)).toHaveCount(0)
    await expect(page.locator('#viewList')).toHaveAttribute('aria-pressed', 'false')
  })

  // Opt-in, like the phone header: CI's Chromium and a developer's render text
  // differently. Compare with
  // `CANVAS_VISUAL=1 npx playwright test tests/browser/list.spec.ts -g baseline`,
  // and add `--update-snapshots` to write a new image. It has no metadata file,
  // so that flag is safe here. The tickets are filed with fixed titles, and a
  // row's ID is replaced before the shot, so nothing in it varies between runs.
  test('matches the committed phone list baseline', async ({ page, app }) => {
    test.skip(!process.env.CANVAS_VISUAL, 'Set CANVAS_VISUAL=1 to compare pixels; see docs/canvas-baseline.md.')
    const plan: [string, object[]][] = [
      ['Fit the header into one row on a phone', [{ op: 'setStatus', status: 'ready' }, { op: 'addLabel', label: 'mobile' }, { op: 'addLabel', label: 'ui' }]],
      ['List tickets by status as well as on the board', [{ op: 'setStatus', status: 'ready' }, { op: 'setPriority', priority: 'high' },
        { op: 'addLabel', label: 'mobile' }, { op: 'addChecklistItem', section: 'ac', text: 'One' }, { op: 'addChecklistItem', section: 'ac', text: 'Two' }]],
      ['Pinch to zoom the board', [{ op: 'setStatus', status: 'done' }, { op: 'addLabel', label: 'mobile' }]],
      ['Open a ticket without a pointer', [{ op: 'addLabel', label: 'ui' }]],
      ['Hide the side resize handle', []],
    ]
    for (const [i, [title, ops]] of plan.entries()) {
      const created = await app.create(title, { x: i * 350, y: 0 })
      if (ops.length) await app.patch(created, ops)
    }
    await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ view: 'list', tipClosed: true })), KEY)
    await page.goto(app.url)
    await expect(page.locator('#ticketList .list-row')).toHaveCount(plan.length)
    await page.locator('#ticketList .list-id').evaluateAll(ids => ids.forEach((id, i) => { id.textContent = `TKT-0000000${i}` }))
    await expect(page).toHaveScreenshot('phone-list.png', { animations: 'disabled', caret: 'hide' })
  })
})

// A finger on the list scrolls it. The stage sets `touch-action: none` for the
// board, and the list is inside the stage; it scrolls because the browser stops
// combining ancestors' touch-action at the nearest scroll container. Carried
// from TKT-01M38QP2CZEJ120PFDKMK3WTP1 (Pinch and two-finger pan on the board).
for (const [name, device] of [['phone', phone], ['tablet', tablet]] as [string, Device][]) {
  test.describe(`on a ${name}`, () => {
    test.use(device)

    test('a touch drag scrolls the list and leaves the board alone', async ({ page, app }) => {
      const tickets: Ticket[] = []
      for (let i = 0; i < 30; i++) tickets.push(await app.create(`Row ${String(i + 1).padStart(2, '0')} of a list long enough to scroll`, { x: (i % 6) * 350, y: Math.floor(i / 6) * 260 }))
      await page.goto(app.url)
      await expect(page.locator(`.card[data-id="${tickets[0].id}"]`)).toBeVisible()
      await viewSettled(page)
      await touchSteps(page, [[await reachable(page.locator('#viewList'))]])
      await expect(page.locator('#ticketList .list-row')).toHaveCount(30)
      const scroller = list(page)
      await expect.poll(() => scroller.evaluate(node => node.scrollHeight > node.clientHeight + 200)).toBe(true)
      const before = await view(page)
      const sent = writes(page)
      const box = (await scroller.boundingBox())!
      // Down the middle of the list, from low on the screen upwards, clear of
      // the phone's New ticket button at the bottom right.
      const x = Math.round(box.x + box.width / 3), from = Math.round(box.y + box.height * 0.7)
      const start = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('#ticketList') !== null, [x, from])
      expect(start, 'the drag starts on the list').toBe(true)

      await touchSteps(page, Array.from({ length: 9 }, (_, i) => [{ x, y: from - i * 40 }]))

      await expect.poll(() => scroller.evaluate(node => node.scrollTop)).toBeGreaterThan(100)
      expect(await view(page)).toEqual(before)
      // A drag that scrolls is not a tap: nothing opened.
      await expect(page.locator('#inspector')).not.toHaveClass(/open/)
      expect(sent).toEqual([])
    })
  })
}
