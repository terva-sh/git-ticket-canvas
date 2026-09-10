import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { externalTitle } from './refresh-support'

export const eventURL = /\/api\/events(?:\?.*)?$/
export const card = (page: Page, id: string) => page.locator(`.card[data-id="${id}"]`)
export const description = (page: Page) => page.locator('#inspBody .field')
  .filter({ has: page.locator('label', { hasText: /^Description$/ }) }).locator('textarea')

export interface Invalidation {
  epoch: string
  generation: number
  scopes: string[]
  stale: boolean
  degraded: boolean
}
export interface EventRecord {
  atMs: number
  eventName: string
  data: string
  payload: Invalidation | null
  error?: string
}

// Observe the application's own EventSource. Opening a second test EventSource
// would let a broken client pass the transport assertions.
export async function liveTraffic(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  const start = performance.now()
  const attempts: { atMs: number; method: string; url: string }[] = []
  const connections: { atMs: number; status: number; mimeType: string }[] = []
  const events: EventRecord[] = []
  const boardReads: { atMs: number; url: string }[] = []
  const streamIDs = new Set<string>()
  cdp.on('Network.requestWillBeSent', ({ requestId, request }) => {
    const path = new URL(request.url).pathname
    if (path === '/api/board') boardReads.push({ atMs: performance.now() - start, url: request.url })
    if (path !== '/api/events') return
    streamIDs.add(requestId)
    attempts.push({ atMs: performance.now() - start, method: request.method, url: request.url })
  })
  cdp.on('Network.responseReceived', ({ requestId, response }) => {
    if (streamIDs.has(requestId)) connections.push({ atMs: performance.now() - start, status: response.status, mimeType: response.mimeType })
  })
  cdp.on('Network.eventSourceMessageReceived', ({ requestId, eventName, data }) => {
    if (!streamIDs.has(requestId)) return
    const row: EventRecord = { atMs: performance.now() - start, eventName, data, payload: null }
    try { row.payload = JSON.parse(data) as Invalidation }
    catch (error) { row.error = String(error) }
    events.push(row)
  })
  return { attempts, connections, events, boardReads, mark: () => performance.now() - start }
}
export type LiveTraffic = Awaited<ReturnType<typeof liveTraffic>>

export async function connected(traffic: LiveTraffic, after = -1, timeout = 10_000) {
  await expect.poll(() => traffic.connections.some(row => row.atMs > after && row.status === 200 && row.mimeType === 'text/event-stream'),
    { timeout, message: 'The application must open GET /api/events' }).toBe(true)
  expect(traffic.attempts.every(row => row.method === 'GET')).toBe(true)
}

export function assertEventContract(events: EventRecord[]) {
  expect(events.length, 'At least one ordinary SSE message must be observed').toBeGreaterThan(0)
  for (const event of events) {
    expect(['', 'message']).toContain(event.eventName)
    expect(event.error).toBeUndefined()
    expect(event.payload).not.toBeNull()
    const payload = event.payload!
    expect(typeof payload.epoch).toBe('string')
    expect(payload.epoch.length).toBeGreaterThan(0)
    expect(Number.isSafeInteger(payload.generation)).toBe(true)
    expect(payload.generation).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(payload.scopes)).toBe(true)
    expect(payload.scopes.every(scope => /^(tickets|config|boards|layout:.+)$/.test(scope))).toBe(true)
    expect(typeof payload.stale).toBe('boolean')
    expect(typeof payload.degraded).toBe('boolean')
  }
  for (let i = 1; i < events.length; i++) {
    const before = events[i - 1].payload!, after = events[i].payload!
    if (before.epoch === after.epoch) expect(after.generation).toBeGreaterThanOrEqual(before.generation)
  }
}

export function boardHeaders(headers: Record<string, string>) {
  function required(name: string) {
    const value = headers[name.toLowerCase()]
    expect(value, `Missing ${name}`).toBeDefined()
    expect(value, `Empty ${name}`).not.toBe('')
    return value!
  }
  function count(name: string) {
    const value = required(name)
    expect(value, name).toMatch(/^\d+$/)
    expect(Number.isSafeInteger(Number(value)), name).toBe(true)
    return Number(value)
  }
  function flag(name: string) {
    const value = required(name)
    expect(['true', 'false'], name).toContain(value)
    return value === 'true'
  }
  return { epoch: required('X-Canvas-Epoch'), generation: count('X-Canvas-Generation'),
    stale: flag('X-Canvas-Stale'), degraded: flag('X-Canvas-Degraded'),
    rebuilds: count('X-Canvas-Rebuilds'), safetyScans: count('X-Canvas-Safety-Scans') }
}

// Explicit boundary probes are separate from browser read counts. Repeating a
// cached board GET must not rebuild the store; safety scans have their own count.
export async function probe(request: APIRequestContext, url: string, etag?: string) {
  const response = await request.get(`${url}/api/board?board=default`, {
    headers: etag ? { 'If-None-Match': etag } : {},
  })
  expect(response.status()).toBe(etag ? 304 : 200)
  return { status: response.status(), ...boardHeaders(response.headers()), etag: response.headers().etag }
}

export async function visibleTitle(page: Page, id: string, title: string, acceptedAt: number, timeout = 15_000) {
  await page.waitForFunction(({ id, title }) => document.querySelector(`.card[data-id="${id}"] .card-title`)?.textContent === title,
    { id, title }, { polling: 'raf', timeout })
  return performance.now() - acceptedAt
}
export async function externalEdit(root: string, id: string, before: string, after: string) {
  const startedAt = performance.now()
  await externalTitle(root, id, before, after)
  return { startedAt, acceptedAt: performance.now(), method: 'Atomic Markdown replacement in isolated fixture store' }
}
export function p95(samples: number[]) {
  if (!samples.length) throw new Error('Cannot compute p95 of an empty sample')
  return [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * .95) - 1]
}

// Each invocation creates a new directory. Never replace a prior measurement,
// even when the caller reuses LIVE_UPDATE_OUTPUT_DIR.
export async function saveMeasurement(base: string, variant: string, output: string) {
  const dir = resolve(base)
  await mkdir(dir, { recursive: true })
  const run = join(dir, `${variant}-${new Date().toISOString().replaceAll(':', '-')}-${process.pid}`)
  await mkdir(run)
  const path = join(run, `live-update-${variant}.json`)
  await writeFile(path, output, { flag: 'wx' })
  return path
}
