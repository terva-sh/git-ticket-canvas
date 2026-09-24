import type { Page } from '@playwright/test'
import { test, expect, type Ticket } from './fixtures'
import { phone, tablet, type Device } from './touch'

// Opening any ticket's inspector with a keyboard and nothing else, from page
// load, on every layout. The route is the list: Tab to List, Enter, Tab into
// the list, arrows, Enter. See TicketList.tsx. No test here clicks or taps.

/** What has focus: its id, the row it is, and whether it is inside the board
 * the list covers or inside the inspector. */
function focused(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null
    return {
      id: element?.id || '',
      row: element?.closest('.list-row')?.getAttribute('data-id') || '',
      board: !!element?.closest('#scene, #grid, #hint, #boardTip'),
      inspector: !!element?.closest('#inspector'),
    }
  })
}

/** Press Tab until `done` says so, and fail if it takes more than `limit`
 * presses. Every element passed on the way is returned, so a test can say
 * what the route did not pass through. */
async function tabUntil(page: Page, done: (at: Awaited<ReturnType<typeof focused>>) => boolean, limit = 40) {
  const passed: Awaited<ReturnType<typeof focused>>[] = []
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab')
    const at = await focused(page)
    passed.push(at)
    if (done(at)) return passed
  }
  throw new Error(`Tab did not get there in ${limit} presses: ${JSON.stringify(passed.map(at => at.id || at.row))}`)
}

/** Tickets in two status groups, the first pinned so the covered board holds
 * a focusable Manual button, and one with more labels than a card shows, so
 * it holds a +N button too. Returns them in the order the list shows them. */
async function seed(app: { create(title: string, card?: { x: number; y: number }): Promise<Ticket>; patch(ticket: Ticket, ops: object[]): Promise<Ticket> }) {
  const drafts: Ticket[] = []
  for (let i = 0; i < 4; i++) drafts.push(await app.create(`Draft ${i + 1}`, { x: i * 350, y: 0 }))
  await app.patch(drafts[1], [{ op: 'addLabel', label: 'one' }, { op: 'addLabel', label: 'two' },
    { op: 'addLabel', label: 'three' }, { op: 'addLabel', label: 'four' }])
  const ready = await app.patch(await app.create('The last one in the list', { x: 0, y: 300 }), [{ op: 'setStatus', status: 'ready' }])
  return [...drafts.map(t => t.id).sort(), ready.id]
}

for (const [name, device] of [['desk', null], ['tablet', tablet], ['phone', phone]] as [string, Device | null][]) {
  test.describe(`on the ${name} layout`, () => {
    if (device) test.use(device)

    test('Tab and Enter reach the list, and the covered board takes no focus', async ({ page, app }) => {
      const order = await seed(app)
      await page.goto(app.url)
      await expect(page.locator('html')).toHaveAttribute('data-layout', name)
      await expect(page.locator(`.card[data-id="${order[0]}"]`)).toBeAttached()
      // The board is focusable before the list covers it: that is what the
      // route must not pass through once it does.
      await expect(page.locator('#scene button').first()).toBeAttached()

      await tabUntil(page, at => at.id === 'viewList')
      await page.keyboard.press('Enter')
      await expect(page.locator('#ticketList')).toBeVisible()
      await expect(page.locator('#viewList')).toHaveAttribute('aria-pressed', 'true')

      // One Tab from the switch lands on the first row, and only one row is a
      // tab stop.
      const passed = await tabUntil(page, at => !!at.row)
      expect(passed.at(-1)!.row).toBe(order[0])
      expect(passed.some(at => at.board), 'Tab reached the board under the list').toBe(false)
      await expect(page.locator('#ticketList .list-row[tabindex="0"]')).toHaveCount(1)
      // Tab again leaves the list, and does not fall onto the covered board.
      await page.keyboard.press('Tab')
      const after = await focused(page)
      expect(after.row).toBe('')
      expect(after.board).toBe(false)
    })

    test('the arrow keys reach any row across the groups, and Enter opens it', async ({ page, app }) => {
      const order = await seed(app)
      await page.goto(app.url)
      await expect(page.locator(`.card[data-id="${order[0]}"]`)).toBeAttached()
      await tabUntil(page, at => at.id === 'viewList')
      await page.keyboard.press('Enter')
      await tabUntil(page, at => !!at.row)

      await page.keyboard.press('ArrowDown')
      expect((await focused(page)).row).toBe(order[1])
      await page.keyboard.press('ArrowUp')
      expect((await focused(page)).row).toBe(order[0])
      await page.keyboard.press('ArrowUp')
      expect((await focused(page)).row, 'ArrowUp stops at the first row').toBe(order[0])
      await page.keyboard.press('End')
      expect((await focused(page)).row).toBe(order.at(-1))
      await page.keyboard.press('Home')
      expect((await focused(page)).row).toBe(order[0])
      // Down across the draft group into the ready one.
      for (let i = 1; i < order.length; i++) await page.keyboard.press('ArrowDown')
      expect((await focused(page)).row).toBe(order.at(-1))
      await page.keyboard.press('ArrowDown')
      expect((await focused(page)).row, 'ArrowDown stops at the last row').toBe(order.at(-1))

      await page.keyboard.press('Enter')
      await expect(page.locator('#inspector')).toHaveClass(/open/)
      await expect(page.locator('#fTitle')).toHaveValue('The last one in the list')
      // The row that opened it is still the list's one tab stop.
      await expect(page.locator(`#ticketList .list-row[data-id="${order.at(-1)}"]`)).toHaveAttribute('tabindex', '0')
    })

    test('Tab goes from the row into the inspector, and closing it puts focus back on the row', async ({ page, app }) => {
      const order = await seed(app)
      await page.goto(app.url)
      await expect(page.locator(`.card[data-id="${order[0]}"]`)).toBeAttached()
      await tabUntil(page, at => at.id === 'viewList')
      await page.keyboard.press('Enter')
      await tabUntil(page, at => !!at.row)
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowDown')
      const opened = order[2]
      expect((await focused(page)).row).toBe(opened)
      await page.keyboard.press('Enter')
      await expect(page.locator('#inspector')).toHaveClass(/open/)

      // The inspector follows the list, so the next Tab after the list's one
      // stop is inside it, and the title field is that stop or a few presses
      // on. Beside the board the width handle comes first; along the bottom
      // there is no handle and the title is the first stop.
      await page.keyboard.press('Tab')
      const first = await focused(page)
      expect(first.inspector, 'the Tab after the list lands in the inspector').toBe(true)
      if (first.id !== 'fTitle') await tabUntil(page, at => at.id === 'fTitle', 6)
      await page.keyboard.type(' by keyboard')
      // Escape leaves the field, which saves it; a second Escape closes the
      // inspector, and focus is back on the row that opened it.
      const saved = page.waitForResponse(r => r.request().method() === 'PATCH' && r.status() === 200)
      await page.keyboard.press('Escape')
      await saved
      await page.keyboard.press('Escape')
      await expect(page.locator('#inspector')).not.toHaveClass(/open/)
      await expect.poll(async () => (await focused(page)).row).toBe(opened)
      await expect(page.locator(`#ticketList .list-row[data-id="${opened}"] .list-title`)).toHaveText('Draft 3 by keyboard')
    })
  })
}

// Another writer's change arrives as a live update, and the row that had focus
// is moved to another status group (which remounts it) or removed. Focus stays
// in the list either way, so the arrow keys keep working.
test('focus stays in the list when another writer moves or removes the focused row', async ({ page, app }) => {
  const order = await seed(app)
  await page.goto(app.url)
  await expect(page.locator(`.card[data-id="${order[0]}"]`)).toBeAttached()
  await tabUntil(page, at => at.id === 'viewList')
  await page.keyboard.press('Enter')
  await tabUntil(page, at => !!at.row)
  await page.keyboard.press('ArrowDown')
  const moved = order[1]
  expect((await focused(page)).row).toBe(moved)

  // To ready, a group further down: the same row, somewhere else.
  const ticket = (await app.board()).tickets.find(t => t.id === moved)!
  const after = await app.patch(ticket, [{ op: 'setStatus', status: 'ready' }])
  await expect(page.locator(`#ticketList [data-status="ready"] .list-row[data-id="${moved}"]`)).toBeAttached()
  await expect.poll(async () => (await focused(page)).row).toBe(moved)

  // Gone: its neighbour in the ready group takes the focus.
  const query = new URLSearchParams({ board: 'default', ifRevision: after.revision, force: 'false' })
  expect((await page.request.delete(`${app.url}/api/tickets/${moved}?${query}`)).status()).toBe(200)
  await expect(page.locator(`#ticketList .list-row[data-id="${moved}"]`)).toHaveCount(0)
  await expect.poll(async () => (await focused(page)).row).not.toBe('')
  const now = (await focused(page)).row
  await page.keyboard.press('Home')
  expect((await focused(page)).row, 'the arrow keys still work').toBe(order[0])
  expect(now).not.toBe(moved)
})
