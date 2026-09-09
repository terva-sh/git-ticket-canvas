import type { Page, Locator } from '@playwright/test'
import { test, expect } from './fixtures'

function card(page: Page, id: string) { return page.locator(`.card[data-id="${id}"]`) }
function prose(page: Page, label: string) {
  return page.locator('#inspBody .field').filter({ has: page.locator('label', { hasText: new RegExp(`^${label}$`) }) }).locator('textarea')
}
async function drag(page: Page, target: Locator, dx: number, dy: number) {
  const box = await target.boundingBox()
  if (!box) throw new Error('Drag target has no bounds')
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
  await page.mouse.up()
}
async function visibleRefresh(page: Page) {
  const response = page.waitForResponse(r => r.url().includes('/api/board') && r.request().method() === 'GET')
  // Dispatch the lifecycle event the application uses, without calling its internals.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await response
}

test('create a draft and edit its inspector title', async ({ page, app }) => {
  await page.goto(app.url)
  await page.getByRole('button', { name: 'New ticket', exact: true }).click()
  await page.getByPlaceholder('Title, then Enter').fill('Created in browser')
  await page.getByPlaceholder('Title, then Enter').press('Enter')
  await expect(page.locator('#fTitle')).toHaveValue('Created in browser')
  const created = (await app.board()).tickets[0]
  expect(created.status).toBe('draft')
  expect((await app.board()).layout.cards[created.id]).toBeDefined()
  await page.locator('#fTitle').fill('Edited in inspector')
  await page.locator('#fTitle').press('Tab')
  await expect.poll(async () => (await app.board()).tickets[0].title).toBe('Edited in inspector')
  await expect(card(page, created.id)).toContainText('Edited in inspector')
  await page.reload()
  await expect(card(page, created.id)).toContainText('Edited in inspector')
})

test('stale inspector edit reports a conflict and reloads external data', async ({ page, app }) => {
  const ticket = await app.create('Original')
  await page.goto(app.url)
  await card(page, ticket.id).click()
  await page.locator('#fTitle').fill('Unsubmitted local edit')
  await app.patch(ticket, [{ op: 'setTitle', title: 'External edit' }])
  const rejected = page.waitForResponse(r => r.request().method() === 'PATCH' && r.status() === 409)
  await page.locator('#fTitle').press('Tab')
  await rejected
  await expect(page.locator('#toast')).toContainText('changed on disk')
  await expect(page.locator('#fTitle')).toHaveValue('External edit')
  expect((await app.board()).tickets[0].title).toBe('External edit')
})

test('read-only controls and drag cannot change persisted files', async ({ page, app }) => {
  const ticket = await app.create('Read only', { x: 0, y: 0 })
  const readonly = await app.readOnlyURL()
  await page.goto(readonly)
  await expect(page.locator('#roBadge')).toBeVisible()
  const before = await app.snapshot()
  await card(page, ticket.id).click()
  for (const id of ['fTitle', 'btnClaim', 'btnArchive', 'btnDelete', 'btnNew', 'btnArrange']) {
    await expect(page.locator(`#${id}`)).toBeDisabled()
  }
  await drag(page, card(page, ticket.id), 60, 40)
  await expect(page.locator('#toast')).toContainText('read-only')
  await expect.poll(async () => app.snapshot()).toEqual(before)
  // Try the keyboard creation path as well as the disabled button.
  await page.locator('#inspClose').click()
  await page.keyboard.press('n')
  await expect(page.locator('#composer')).toBeHidden()
  expect(await app.snapshot()).toEqual(before)
})

test('drag pins an unplaced ticket and persists across reload', async ({ page, app }) => {
  const ticket = await app.create('Unplaced')
  await page.goto(app.url)
  await expect(card(page, ticket.id)).toHaveClass(/unpinned/)
  expect((await app.board()).layout.cards[ticket.id]).toBeUndefined()
  await drag(page, card(page, ticket.id), 70, 45)
  await expect.poll(async () => (await app.board()).layout.cards[ticket.id]).toBeDefined()
  const position = (await app.board()).layout.cards[ticket.id]
  expect(position.x).not.toBe(0)
  await page.reload()
  await expect(card(page, ticket.id)).not.toHaveClass(/unpinned/)
  expect((await app.board()).layout.cards[ticket.id]).toEqual(position)
})

test('multi-selection drag moves both cards by the same scene delta', async ({ page, app }) => {
  const a = await app.create('First', { x: 0, y: 0 })
  const b = await app.create('Second', { x: 320, y: 0 })
  await page.goto(app.url)
  await card(page, a.id).click()
  await card(page, b.id).click({ modifiers: ['Shift'] })
  await expect(page.locator('.card.selected')).toHaveCount(2)
  await drag(page, card(page, a.id), 55, 45)
  await expect.poll(async () => (await app.board()).layout.cards[a.id].x).not.toBe(0)
  const positions = (await app.board()).layout.cards
  expect(positions[b.id].x - positions[a.id].x).toBe(320)
  expect(positions[b.id].y).toBe(positions[a.id].y)
  expect(positions[a.id].y).not.toBe(0)
})

test('dependency handle makes the drop target wait on the source', async ({ page, app }) => {
  const a = await app.create('Prerequisite', { x: 0, y: 0 })
  const b = await app.create('Dependent', { x: 350, y: 0 })
  await page.goto(app.url)
  await card(page, a.id).locator('.handle').dragTo(card(page, b.id))
  await expect.poll(async () => (await app.board()).tickets.find(t => t.id === b.id)?.dependencies).toEqual([a.id])
  expect((await app.board()).tickets.find(t => t.id === a.id)?.dependencies).toEqual([])
})

test('pan, cursor zoom, fit, and keyboard shortcuts remain usable', async ({ page, app }) => {
  const ticket = await app.create('Keyboard target', { x: 0, y: 0 })
  await page.goto(app.url)
  await expect(card(page, ticket.id)).toBeVisible()
  const scene = page.locator('#scene')
  const before = await scene.getAttribute('style')
  await page.mouse.move(80, 800)
  await page.mouse.down()
  await page.mouse.move(180, 860, { steps: 5 })
  await page.mouse.up()
  await expect(scene).not.toHaveAttribute('style', before!)
  const panned = await scene.getAttribute('style')
  const pointAtCursor = () => page.evaluate(() => {
    const stage = document.querySelector('#stage')!.getBoundingClientRect()
    const matrix = new DOMMatrix(getComputedStyle(document.querySelector('#scene')!).transform)
    const point = new DOMPoint(180 - stage.left, 860 - stage.top).matrixTransform(matrix.inverse())
    return { x: point.x, y: point.y, scale: matrix.a }
  })
  const anchor = await pointAtCursor()
  await page.mouse.wheel(0, -200)
  await expect(scene).not.toHaveAttribute('style', panned!)
  const afterZoom = await pointAtCursor()
  expect(afterZoom.scale).toBeGreaterThan(anchor.scale)
  expect(afterZoom.x).toBeCloseTo(anchor.x, 2)
  expect(afterZoom.y).toBeCloseTo(anchor.y, 2)
  const zoomed = await scene.getAttribute('style')
  await page.keyboard.press('f')
  await expect(scene).not.toHaveAttribute('style', zoomed!)
  await page.keyboard.press('/')
  await expect(page.locator('#search')).toBeFocused()
  await page.locator('#search').fill('no matching ticket')
  await expect(card(page, ticket.id)).toHaveClass(/dim/)
  await page.locator('#search').fill('')
  await page.keyboard.press('Escape')
  await page.keyboard.press('n')
  await expect(page.locator('#composer')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#composer')).toBeHidden()
  await card(page, ticket.id).click()
  page.once('dialog', dialog => dialog.accept())
  await page.keyboard.press('Delete')
  await expect.poll(async () => (await app.board()).tickets.length).toBe(0)
})

test('periodic polling observes an external ticket change', async ({ page, app }) => {
  const ticket = await app.create('Before poll')
  await page.goto(app.url)
  await expect(card(page, ticket.id)).toContainText('Before poll')
  await app.patch(ticket, [{ op: 'setTitle', title: 'After poll' }])
  await expect(card(page, ticket.id)).toContainText('After poll', { timeout: 16_000 })
})

test('visibility refresh observes an external ticket change', async ({ page, app }) => {
  const ticket = await app.create('Before focus')
  await page.goto(app.url)
  await expect(card(page, ticket.id)).toBeVisible()
  await app.patch(ticket, [{ op: 'setTitle', title: 'After focus' }])
  await visibleRefresh(page)
  await expect(card(page, ticket.id)).toContainText('After focus')
})

test('visibility refresh preserves an unfinished description draft', async ({ page, app }) => {
  const ticket = await app.create('Editing prose')
  await page.goto(app.url)
  await card(page, ticket.id).click()
  const description = prose(page, 'Description')
  await description.fill('Unsubmitted description')
  await expect(description).toBeFocused()
  expect((await app.board()).tickets[0].body.description).toBe('')
  await app.patch(ticket, [{ op: 'setPriority', priority: 'high' }])
  await visibleRefresh(page)
  await expect(description).toHaveValue('Unsubmitted description')
  await expect(description).toBeFocused()
  expect((await app.board()).tickets[0].body.description).toBe('')
})

for (const field of ['description', 'title']) {
  test(`refresh cannot give a stale ${field} draft a newer revision`, async ({ page, app }) => {
    const ticket = await app.create('Original title')
    await page.goto(app.url)
    await card(page, ticket.id).click()
    const input = field === 'title' ? page.locator('#fTitle') : prose(page, 'Description')
    await input.fill('Local draft')
    await app.patch(ticket, [field === 'title'
      ? { op: 'setTitle', title: 'External value' }
      : { op: 'setDescription', text: 'External value' }])
    await visibleRefresh(page)
    await expect(input).toHaveValue('Local draft')
    await expect(input).toBeFocused()
    const refused = page.waitForResponse(r => r.request().method() === 'PATCH' && r.status() === 409)
    await input.press('Escape') // intentional blur commits the original snapshot
    await refused
    await expect(page.locator('#toast')).toContainText('changed on disk')
    await expect(input).toHaveValue('External value')
    const stored = (await app.board()).tickets[0]
    expect(field === 'title' ? stored.title : stored.body.description).toBe('External value')
  })
}

test('periodic polling preserves prose focus and sends no mutation', async ({ page, app }) => {
  const ticket = await app.create('Before focused poll')
  await page.goto(app.url)
  await card(page, ticket.id).click()
  const description = prose(page, 'Description')
  await description.fill('Still drafting')
  const mutations: string[] = []
  page.on('request', request => { if (request.method() === 'PATCH') mutations.push(request.url()) })
  await app.patch(ticket, [{ op: 'setTitle', title: 'After focused poll' }])
  await expect(card(page, ticket.id)).toContainText('After focused poll', { timeout: 16_000 })
  await expect(description).toHaveValue('Still drafting')
  await expect(description).toBeFocused()
  expect(mutations).toEqual([])
  expect((await app.board()).tickets[0].body.description).toBe('')
})

test('explicit prose blur still saves after a refresh without external edits', async ({ page, app }) => {
  const ticket = await app.create('Explicit prose commit')
  await page.goto(app.url)
  await card(page, ticket.id).click()
  const description = prose(page, 'Description')
  await description.fill('Save deliberately')
  await visibleRefresh(page)
  await expect(description).toBeFocused()
  const saved = page.waitForResponse(r => r.request().method() === 'PATCH' && r.status() === 200)
  await description.press('Escape')
  await saved
  await expect.poll(async () => (await app.board()).tickets[0].body.description).toBe('Save deliberately')
})
