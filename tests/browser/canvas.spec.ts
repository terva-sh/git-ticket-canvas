import type { Page, Locator } from '@playwright/test'
import { test, expect } from './fixtures'

const card = (page: Page, id: string) => page.locator(`.card[data-id="${id}"]`)
async function startDrag(page: Page, target: Locator, dx = 60, dy = 35) {
  const box = (await target.boundingBox())!
  await page.mouse.move(box.x + 80, box.y + 25)
  await page.mouse.down()
  await page.mouse.move(box.x + 80 + dx, box.y + 25 + dy, { steps: 5 })
}
for (const event of ['pointercancel', 'lostpointercapture']) {
  test(`${event} rolls back a drag and releases the gesture without saving`, async ({ page, app }) => {
    const ticket = await app.create('Cancel drag', { x: 0, y: 0 })
    await page.goto(app.url)
    const target = card(page, ticket.id); await expect(target).toBeVisible()
    const before = await target.getAttribute('style'), writes: string[] = []
    page.on('request', request => { if (request.method() === 'PUT') writes.push(request.url()) })
    await startDrag(page, target)
    await expect(target).not.toHaveAttribute('style', before!)
    await page.locator('#stage').evaluate((stage, event) => stage.dispatchEvent(new PointerEvent(event, { pointerId: 1, bubbles: true })), event)
    await expect(target).toHaveAttribute('style', before!)
    await page.mouse.up()
    expect(await page.locator('#stage').evaluate(stage => stage.hasPointerCapture(1))).toBe(false)
    expect(writes).toEqual([])
    expect((await app.board()).layout.cards[ticket.id]).toEqual({ x: 0, y: 0 })
    await startDrag(page, target, 40, 20); await page.mouse.up()
    await expect.poll(async () => (await app.board()).layout.cards[ticket.id].x).not.toBe(0)
  })
}
test('switching boards cancels an active drag without saving it to either board', async ({ page, app, request }) => {
  const ticket = await app.create('Board switch', { x: 0, y: 0 })
  await request.put(`${app.url}/api/layout`, { data: { board: 'other', cards: { [ticket.id]: { x: 400, y: 0 } } } })
  await page.goto(app.url); const target = card(page, ticket.id); await expect(target).toBeVisible()
  const writes: string[] = []
  page.on('request', request => { if (request.method() === 'PUT') writes.push(request.postData() || '') })
  await startDrag(page, target)
  await page.locator('#boardSelect').selectOption('other')
  await page.mouse.up()
  await expect(target).toHaveAttribute('style', /translate\(400px, 0px\)/)
  expect(writes).toEqual([])
  expect((await app.board()).layout.cards[ticket.id]).toEqual({ x: 0, y: 0 })
})
test('a pending save retains its original board after a switch', async ({ page, app, request }) => {
  const ticket = await app.create('Delayed save', { x: 0, y: 0 })
  await request.put(`${app.url}/api/layout`, { data: { board: 'other', cards: { [ticket.id]: { x: 400, y: 0 } } } })
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let captured: { board: string } | undefined
  await page.route('**/api/layout', async route => {
    captured = route.request().postDataJSON()
    await gate; await route.continue()
  })
  await page.goto(app.url); const target = card(page, ticket.id); await expect(target).toBeVisible()
  await startDrag(page, target); await page.mouse.up()
  await expect.poll(() => captured?.board).toBe('default')
  await page.locator('#boardSelect').selectOption('other')
  release()
  await expect(target).toHaveAttribute('style', /translate\(400px, 0px\)/)
  const other = await (await request.get(`${app.url}/api/board?board=other`)).json()
  expect(other.layout.cards[ticket.id]).toEqual({ x: 400, y: 0 })
  await expect.poll(async () => (await app.board()).layout.cards[ticket.id].x).not.toBe(0)
})
test('an earlier save completion does not replace an active second drag', async ({ page, app }) => {
  const ticket = await app.create('Two gestures', { x: 0, y: 0 })
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let calls = 0
  await page.route('**/api/layout', async route => { if (++calls === 1) await gate; await route.continue() })
  await page.goto(app.url); const target = card(page, ticket.id); await expect(target).toBeVisible()
  await startDrag(page, target, 50, 0); await page.mouse.up()
  await expect.poll(() => calls).toBe(1)
  await startDrag(page, target, 45, 20)
  const second = await target.getAttribute('style')
  const saved = page.waitForResponse(r => r.url().includes('/api/layout'))
  release(); await saved
  await expect(target).toHaveAttribute('style', second!)
  await page.mouse.up()
  await expect.poll(() => calls).toBe(2)
})
test('visibility polling waits for an active gesture rather than moving its cards', async ({ page, app, request }) => {
  const ticket = await app.create('Poll during drag', { x: 0, y: 0 })
  await page.goto(app.url); const target = card(page, ticket.id); await expect(target).toBeVisible()
  await startDrag(page, target)
  const during = await target.getAttribute('style')
  await request.put(`${app.url}/api/layout`, { data: { board: 'default', cards: { [ticket.id]: { x: 900, y: 800 } } } })
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(target).toHaveAttribute('style', during!)
  await page.mouse.up()
  await expect.poll(async () => (await app.board()).layout.cards[ticket.id].x).not.toBe(900)
})
test('read-only dependency gestures send no mutation and do not pin cards', async ({ page, app }) => {
  const a = await app.create('Read-only source', { x: 0, y: 0 }), b = await app.create('Read-only target', { x: 350, y: 0 })
  await page.goto(await app.readOnlyURL())
  await expect(page.locator('#roBadge')).toBeVisible()
  const writes: string[] = []
  page.on('request', request => { if (['PATCH', 'PUT', 'POST', 'DELETE'].includes(request.method())) writes.push(request.url()) })
  await card(page, a.id).locator('.handle').dragTo(card(page, b.id))
  expect(writes).toEqual([])
  expect((await app.board()).tickets.find(ticket => ticket.id === b.id)?.dependencies).toEqual([])
  await expect(page.locator('#ghost')).toHaveCount(0)
})
// The drop calls onLink(prerequisite, dependent), so the target waits on the
// source. The edge is drawn from the dependent to the prerequisite it needs.
const dependency = (page: Page, dependent: string, prerequisite: string) =>
  page.locator(`.relationship[data-kind="dependency"][data-from="${dependent}"][data-to="${prerequisite}"]`)

test('a dependency drag shows the edge and saves it without a reload', async ({ page, app }) => {
  const a = await app.create('Prerequisite', { x: 0, y: 0 }), b = await app.create('Dependent', { x: 350, y: 0 })
  await page.goto(app.url)
  await page.locator('#relationshipMode').selectOption('all')
  await expect(card(page, b.id)).toBeVisible()
  await card(page, a.id).locator('.handle').dragTo(card(page, b.id))
  await expect(dependency(page, b.id, a.id)).toHaveCount(1)
  expect((await app.board()).tickets.find(ticket => ticket.id === b.id)?.dependencies).toEqual([a.id])
})

// Relationships default to Selected, which draws an edge only when one of its
// endpoints is selected. A drop that leaves nothing selected saves a dependency
// the user cannot see, on this load or any later one.
test('a dependency drag leaves the new edge visible in the default relationship mode', async ({ page, app }) => {
  const a = await app.create('Prerequisite', { x: 0, y: 0 }), b = await app.create('Dependent', { x: 350, y: 0 })
  await page.goto(app.url)
  await expect(page.locator('#relationshipMode')).toHaveValue('selected')
  await expect(card(page, b.id)).toBeVisible()
  await card(page, a.id).locator('.handle').dragTo(card(page, b.id))
  await expect(dependency(page, b.id, a.id)).toHaveCount(1)
})

test('a dependency created by dragging is still there after a reload', async ({ page, app }) => {
  const a = await app.create('Prerequisite', { x: 0, y: 0 }), b = await app.create('Dependent', { x: 350, y: 0 })
  await page.goto(app.url)
  await page.locator('#relationshipMode').selectOption('all')
  await expect(card(page, b.id)).toBeVisible()
  await card(page, a.id).locator('.handle').dragTo(card(page, b.id))
  await expect(dependency(page, b.id, a.id)).toHaveCount(1)
  await page.reload()
  await page.locator('#relationshipMode').selectOption('all')
  await expect(dependency(page, b.id, a.id)).toHaveCount(1)
})

test('a failed dependency save reports the error and draws no edge', async ({ page, app }) => {
  const a = await app.create('Prerequisite', { x: 0, y: 0 }), b = await app.create('Dependent', { x: 350, y: 0 })
  await page.route('**/api/tickets/**', route =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"internal","message":"disk full"}' })
      : route.continue())
  await page.goto(app.url)
  await page.locator('#relationshipMode').selectOption('all')
  await expect(card(page, b.id)).toBeVisible()
  await card(page, a.id).locator('.handle').dragTo(card(page, b.id))
  await expect(page.locator('#toast')).toHaveClass(/err/)
  await expect(page.locator('#toast')).toContainText('disk full')
  await expect(dependency(page, b.id, a.id)).toHaveCount(0)
  expect((await app.board()).tickets.find(ticket => ticket.id === b.id)?.dependencies).toEqual([])
})

test('measured card height updates dependency edge anchors', async ({ page, app }) => {
  const a = await app.create('Source', { x: 0, y: 0 }), b = await app.create('Dependent', { x: 350, y: 0 })
  await app.patch(b, [{ op: 'addDependency', id: a.id }])
  await page.goto(app.url)
  await page.locator('#relationshipMode').selectOption('all')
  const edge = page.locator('#edgeLayer path[marker-end]'); await expect(edge).toHaveCount(1)
  const before = await edge.getAttribute('d')
  await card(page, a.id).evaluate(el => { el.style.height = '260px' })
  await expect(edge).not.toHaveAttribute('d', before!)
  // The arrow now points from the dependent to its prerequisite.
  await expect(edge).toHaveAttribute('d', /280,130$/)
})
