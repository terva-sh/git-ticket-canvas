import { test, expect } from './fixtures'
import { conditional, diagnostics, counters, counterDelta, network, settle } from './refresh-support'
import type { Page } from '@playwright/test'

async function visibilityRefresh(page: Page) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/board')
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await response
  await settle(page)
}
function description(page: Page) {
  return page.locator('#inspBody .field').filter({ has: page.locator('label', { hasText: /^Description$/ }) }).locator('textarea')
}

test('unchanged refresh preserves focused inspector drafts and avoids conditional publication', async ({ page, app }) => {
  const ticket = await app.create('Refresh draft owner', { x: 0, y: 0 })
  const instrumentation = await diagnostics(page)
  const traffic = await network(page)
  await page.goto(app.url)
  await page.locator(`.card[data-id="${ticket.id}"]`).click()
  const draft = description(page)
  await draft.fill('Unsubmitted refresh draft')
  await draft.evaluate(el => { (el as HTMLTextAreaElement).setSelectionRange(4, 10) })
  await settle(page)
  const before = await counters(page), mark = traffic.mark()
  await visibilityRefresh(page)
  await visibilityRefresh(page)
  await expect(draft).toHaveValue('Unsubmitted refresh draft')
  await expect(draft).toBeFocused()
  expect(await draft.evaluate(el => [(el as HTMLTextAreaElement).selectionStart, (el as HTMLTextAreaElement).selectionEnd])).toEqual([4, 10])
  expect((await app.board()).tickets[0].body.description || '').toBe('')
  const rows = await traffic.since(mark)
  expect(rows).toHaveLength(2)
  if (conditional) {
    expect(await page.evaluate(() => (window as any).__refreshFetchResults.slice(-2))).toEqual([304, 304])
    expect(rows.every(row => row.status === 304 && !!row.ifNoneMatch && row.decodedPayloadBytes === 0), JSON.stringify(rows, null, 2)).toBe(true)
    const delta = counterDelta(before, await counters(page))
    expect(delta.inspectorRenders).toBe(0)
    if (instrumentation.instrumented) {
      expect(delta.cardRenders).toBe(0)
      expect(delta.placementCalls).toBe(0)
      expect(delta.appRenders).toBe(0)
    }
  }
})

test('an equivalent 200 refresh preserves drafts without rendering or placement', async ({ page, app }) => {
  const ticket = await app.create('Equivalent snapshot', { x: 0, y: 0 })
  const instrumentation = await diagnostics(page)
  await page.goto(app.url)
  await page.locator(`.card[data-id="${ticket.id}"]`).click()
  const draft = description(page)
  await draft.fill('Keep this local text')
  await settle(page)
  // Force a server 200 by removing the validator on the upstream test request.
  // The browser still sends its own validator, and receives a real full snapshot.
  await page.route('**/api/board?*', async route => {
    const headers = { ...route.request().headers() }
    delete headers['if-none-match']
    const response = await route.fetch({ headers })
    expect(response.status()).toBe(200)
    await route.fulfill({ response })
  })
  const before = await counters(page)
  await visibilityRefresh(page)
  await expect(draft).toHaveValue('Keep this local text')
  await expect(draft).toBeFocused()
  if (conditional) {
    const delta = counterDelta(before, await counters(page))
    expect(delta.inspectorRenders).toBe(0)
    if (instrumentation.instrumented) {
      expect(delta.cardRenders).toBe(0)
      expect(delta.placementCalls).toBe(0)
      expect(delta.appRenders).toBe(0)
    }
  }
})

test('two tabs retain independent snapshots and recover after a failed read', async ({ page, app }) => {
  const ticket = await app.create('Two tab snapshot', { x: 0, y: 0 })
  const second = await page.context().newPage()
  try {
    // Block SSE in both tabs. With a live stream both tabs converge on their
    // own, so the second tab would not stay stale until its visibility
    // refresh. This case verifies fallback-mode independent snapshots and
    // failed-read recovery; SSE convergence is covered by
    // live-update-regressions.spec.ts.
    await page.route('**/api/events', route => route.abort())
    await second.route('**/api/events', route => route.abort())
    await page.goto(app.url); await second.goto(app.url)
    await expect(page.locator('.card-title')).toHaveText('Two tab snapshot')
    await expect(second.locator('.card-title')).toHaveText('Two tab snapshot')
    await app.patch(ticket, [{ op: 'setTitle', title: 'Observed separately' }])
    await visibilityRefresh(page)
    await expect(page.locator('.card-title')).toHaveText('Observed separately')
    await expect(second.locator('.card-title')).toHaveText('Two tab snapshot')
    await visibilityRefresh(second)
    await expect(second.locator('.card-title')).toHaveText('Observed separately')
    const before = await page.locator('#toolbarRoot').getAttribute('data-store-publications')
    await page.route('**/api/board?*', route => route.abort('failed'), { times: 1 })
    const failed = page.waitForEvent('requestfailed', r => r.url().includes('/api/board'))
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await failed
    await expect(page.locator('.card-title')).toHaveText('Observed separately')
    const recovery = page.waitForResponse(r => r.url().includes('/api/board'))
    await visibilityRefresh(page)
    if (conditional) {
      expect((await recovery).status()).toBe(304)
      expect(await page.locator('#toolbarRoot').getAttribute('data-store-publications')).toBe(before)
    }
  } finally { await second.close() }
})

test('a changed response arriving during drag waits until cancellation', async ({ page, app }) => {
  const ticket = await app.create('Before held refresh', { x: 0, y: 0 })
  await page.goto(app.url)
  const card = page.locator(`.card[data-id="${ticket.id}"]`)
  await expect(card).toBeVisible()
  // Install the held-response interception before the mutation. SSE delivers
  // the invalidation immediately, so a route installed after the patch could
  // lose the race to an event-driven read that was already in flight.
  let release!: () => void, captured!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const ready = new Promise<void>(resolve => { captured = resolve })
  await page.route('**/api/board?*', async route => {
    const response = await route.fetch()
    captured(); await held
    await route.fulfill({ response })
  }, { times: 1 })
  await app.patch(ticket, [{ op: 'setTitle', title: 'Changed while dragging' }])
  await ready
  const box = (await card.boundingBox())!
  const writes: string[] = []
  page.on('request', request => { if (request.method() === 'PUT') writes.push(request.url()) })
  await page.mouse.move(box.x + 80, box.y + 25)
  await page.mouse.down()
  await page.mouse.move(box.x + 150, box.y + 65, { steps: 5 })
  const preview = await card.getAttribute('style')
  const arrived = page.waitForResponse(r => new URL(r.url()).pathname === '/api/board')
  release(); await arrived; await settle(page)
  await expect(card).toHaveAttribute('style', preview!)
  await expect(card.locator('.card-title')).toHaveText('Before held refresh')
  await page.locator('#stage').evaluate(el => el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })))
  await page.mouse.up()
  await expect(card.locator('.card-title')).toHaveText('Changed while dragging')
  expect(writes).toEqual([])
  expect((await app.board()).layout.cards[ticket.id]).toMatchObject({ x: 0, y: 0 })
})
