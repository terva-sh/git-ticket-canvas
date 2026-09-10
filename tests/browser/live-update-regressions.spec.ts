import { test, expect } from './fixtures'
import { settle } from './refresh-support'
import { assertEventContract, card, connected, description, eventURL, externalEdit, liveTraffic, probe, visibleTitle } from './live-update-support'

// Real production timers throughout. No visibility event is used to make an
// invalidation test pass, and no extra EventSource substitutes for the client.
test('SSE updates two tabs while preserving focused inspector text and selection', async ({ page, app }) => {
  const ticket = await app.create('Live draft owner', { x: 0, y: 0 })
  const second = await page.context().newPage()
  try {
    const streams = await Promise.all([liveTraffic(page), liveTraffic(second)])
    await Promise.all([page.goto(app.url), second.goto(app.url)])
    await Promise.all(streams.map(stream => connected(stream)))
    await card(page, ticket.id).click()
    const draft = description(page)
    await draft.fill('Unsubmitted live draft')
    await draft.evaluate(el => (el as HTMLTextAreaElement).setSelectionRange(3, 9))
    const mutations: string[] = []
    page.on('request', request => { if (['PATCH', 'PUT', 'POST'].includes(request.method())) mutations.push(request.url()) })
    const edit = await externalEdit(app.root, ticket.id, ticket.title, 'External live title')
    const latency = await Promise.all([page, second].map(tab => visibleTitle(tab, ticket.id, 'External live title', edit.acceptedAt, 5_000)))
    expect(Math.max(...latency)).toBeLessThanOrEqual(3_000)
    await expect(draft).toHaveValue('Unsubmitted live draft')
    await expect(draft).toBeFocused()
    expect(await draft.evaluate(el => [(el as HTMLTextAreaElement).selectionStart, (el as HTMLTextAreaElement).selectionEnd])).toEqual([3, 9])
    expect(mutations).toEqual([])
    expect((await app.board()).tickets[0].body.description || '').toBe('')
    for (const stream of streams) {
      assertEventContract(stream.events)
      expect(stream.events.some(event => event.payload?.scopes.includes('tickets'))).toBe(true)
    }
  } finally { await second.close() }
})

test('SSE does not give a focused stale draft the new ticket revision', async ({ page, app }) => {
  const ticket = await app.create('Original live revision', { x: 0, y: 0 })
  const stream = await liveTraffic(page)
  await page.goto(app.url); await connected(stream)
  await card(page, ticket.id).click()
  const draft = description(page)
  await draft.fill('Local unsaved description')
  await app.patch(ticket, [{ op: 'setTitle', title: 'Remote live revision' }, { op: 'setDescription', text: 'Remote saved description' }])
  await expect(card(page, ticket.id).locator('.card-title')).toHaveText('Remote live revision')
  await expect(draft).toHaveValue('Local unsaved description')
  await expect(draft).toBeFocused()
  const refused = page.waitForResponse(response => response.request().method() === 'PATCH' && response.status() === 409)
  await draft.press('Escape')
  await refused
  await expect(page.locator('#toast')).toContainText('changed on disk')
  await expect(draft).toHaveValue('Remote saved description')
  expect((await app.board()).tickets[0].body.description).toBe('Remote saved description')
})

test('board 200 and 304 carry cache health and cumulative work counters', async ({ page, app, request }) => {
  const ticket = await app.create('Header generation', { x: 0, y: 0 })
  const stream = await liveTraffic(page)
  await page.goto(app.url); await connected(stream)
  await expect(card(page, ticket.id)).toBeVisible()
  const before = await probe(request, app.url)
  expect(before.etag).toBeTruthy()
  expect(before.stale).toBe(false)
  expect(before.degraded).toBe(false)
  const unchanged = await probe(request, app.url, before.etag)
  expect(unchanged.epoch).toBe(before.epoch)
  expect(unchanged.generation).toBe(before.generation)
  expect(unchanged.rebuilds).toBe(before.rebuilds)
  const edit = await externalEdit(app.root, ticket.id, ticket.title, 'Header invalidated')
  await visibleTitle(page, ticket.id, 'Header invalidated', edit.acceptedAt, 5_000)
  const after = await probe(request, app.url)
  expect(after.epoch).toBe(before.epoch)
  expect(after.generation).toBeGreaterThan(before.generation)
  expect(after.rebuilds).toBeGreaterThan(before.rebuilds)
  expect(after.safetyScans).toBeGreaterThanOrEqual(before.safetyScans)
  expect(after.stale).toBe(false)
  expect(after.degraded).toBe(false)
  assertEventContract(stream.events)
})

test('an SSE-triggered response held across a manual drag waits for cancellation', async ({ page, app }) => {
  const ticket = await app.create('Before live drag', { x: 0, y: 0 })
  const stream = await liveTraffic(page)
  await page.goto(app.url); await connected(stream)
  const target = card(page, ticket.id)
  await expect(target).toBeVisible()
  let release!: () => void
  let captured = false
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/board?*', async route => {
    const response = await route.fetch()
    captured = true; await held
    await route.fulfill({ response })
  }, { times: 1 })
  const writes: string[] = []
  page.on('request', request => { if (request.method() === 'PUT') writes.push(request.url()) })
  try {
    await externalEdit(app.root, ticket.id, ticket.title, 'After live drag')
    await expect.poll(() => captured, { message: 'External edit must cause an event-driven board read' }).toBe(true)
    const box = (await target.boundingBox())!
    await page.mouse.move(box.x + 80, box.y + 25); await page.mouse.down()
    await page.mouse.move(box.x + 150, box.y + 65, { steps: 5 })
    const preview = await target.getAttribute('style')
    const arrived = page.waitForResponse(response => new URL(response.url()).pathname === '/api/board')
    release(); await arrived; await settle(page)
    await expect(target).toHaveAttribute('style', preview!)
    await expect(target.locator('.card-title')).toHaveText('Before live drag')
    await page.locator('#stage').evaluate(stage => stage.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })))
    await page.mouse.up()
    await expect(target.locator('.card-title')).toHaveText('After live drag')
    expect(writes).toEqual([])
    expect((await app.board()).layout.cards[ticket.id]).toEqual({ x: 0, y: 0 })
  } finally { release() }
})

test('blocked SSE falls back within 15 seconds without a retry storm', async ({ page, app }) => {
  test.setTimeout(45_000)
  const ticket = await app.create('Fallback before', { x: 0, y: 0 })
  const stream = await liveTraffic(page)
  await page.route(eventURL, route => route.abort('failed'))
  await page.goto(app.url)
  await expect(card(page, ticket.id)).toBeVisible()
  const start = performance.now(), mark = stream.mark()
  const edit = await externalEdit(app.root, ticket.id, ticket.title, 'Fallback observed')
  expect(await visibleTitle(page, ticket.id, 'Fallback observed', edit.acceptedAt, 15_000)).toBeLessThanOrEqual(15_000)
  await page.waitForTimeout(Math.max(0, 25_000 - (performance.now() - start)))
  expect(stream.attempts.length).toBeGreaterThan(1)
  // A generous storm guard, not a claim about the exact retry backoff schedule.
  expect(stream.attempts.length).toBeLessThanOrEqual(12)
  expect(stream.connections.some(connection => connection.status === 200)).toBe(false)
  const fallbackReads = stream.boardReads.filter(row => row.atMs >= mark)
  expect(fallbackReads.length).toBeGreaterThanOrEqual(2)
  expect(fallbackReads.length).toBeLessThanOrEqual(4)
})

test('SSE reconnect reconciles a missed edit and resumes event-driven reads', async ({ page, app }) => {
  test.setTimeout(45_000)
  const ticket = await app.create('Reconnect before', { x: 0, y: 0 })
  const stream = await liveTraffic(page)
  await page.goto(app.url); await connected(stream)
  await expect(card(page, ticket.id)).toBeVisible()
  await expect.poll(() => stream.events.length).toBeGreaterThan(0)
  const epochBefore = stream.events[stream.events.length - 1].payload!.epoch
  const mark = stream.mark()
  // A server restart kills the established stream with a real socket error and
  // changes the epoch. Browser-context offline emulation cannot stand in for
  // this: Chromium keeps the emulated-offline EventSource open and delivers
  // the held event after going online, so no reconnect ever happens.
  await app.restart(async () => {
    await externalEdit(app.root, ticket.id, ticket.title, 'Edited while down')
  })
  await connected(stream, mark, 15_000)
  await expect(card(page, ticket.id).locator('.card-title')).toHaveText('Edited while down', { timeout: 15_000 })
  const reconnectEvents = stream.events.filter(event => event.atMs >= mark)
  expect(reconnectEvents.length).toBeGreaterThan(0)
  expect(reconnectEvents[0].payload!.epoch).not.toBe(epochBefore)
  const edit = await externalEdit(app.root, ticket.id, 'Edited while down', 'Event after reconnect')
  expect(await visibleTitle(page, ticket.id, 'Event after reconnect', edit.acceptedAt, 5_000)).toBeLessThanOrEqual(3_000)
  assertEventContract(stream.events)
})

test('board switches keep scoped layout invalidations on the selected board', async ({ page, app, request }) => {
  const ticket = await app.create('Scoped live layout', { x: 0, y: 0 })
  async function layout(board: string, x: number) {
    const response = await request.put(`${app.url}/api/layout`, { data: { board, cards: { [ticket.id]: { x, y: 0 } } } })
    expect(response.ok()).toBe(true)
  }
  await layout('other', 400)
  const stream = await liveTraffic(page)
  await page.goto(app.url); await connected(stream)
  await page.locator('#boardSelect').selectOption('other')
  await expect(card(page, ticket.id)).toHaveAttribute('style', /translate\(400px, 0px\)/)
  const mark = stream.mark()
  await layout('default', 900)
  await expect.poll(() => stream.events.some(event => event.atMs >= mark && event.payload?.scopes.includes('layout:default'))).toBe(true)
  await expect(card(page, ticket.id)).toHaveAttribute('style', /translate\(400px, 0px\)/)
  await layout('other', 500)
  await expect(card(page, ticket.id)).toHaveAttribute('style', /translate\(500px, 0px\)/)
  await page.locator('#boardSelect').selectOption('default')
  await expect(card(page, ticket.id)).toHaveAttribute('style', /translate\(900px, 0px\)/)
  assertEventContract(stream.events)
})

test('read-only SSE observes external edits without writing the store', async ({ page, app }) => {
  const ticket = await app.create('Read-only live before', { x: 0, y: 0 })
  const url = await app.readOnlyURL()
  const stream = await liveTraffic(page)
  const mutations: string[] = []
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url()) })
  await page.goto(url); await connected(stream)
  await expect(card(page, ticket.id)).toBeVisible()
  const edit = await externalEdit(app.root, ticket.id, ticket.title, 'Read-only live after')
  const persisted = await app.snapshot()
  expect(await visibleTitle(page, ticket.id, 'Read-only live after', edit.acceptedAt, 5_000)).toBeLessThanOrEqual(3_000)
  await card(page, ticket.id).click()
  await expect(description(page)).toBeDisabled()
  expect(await app.snapshot()).toEqual(persisted)
  expect(mutations).toEqual([])
  assertEventContract(stream.events)
})
