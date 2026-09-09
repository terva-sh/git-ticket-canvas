import type { Page } from '@playwright/test'
import { build } from 'vite'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cpus, platform, release } from 'node:os'

// Normal CI enforces the new behavior. Baseline reproduction must opt out.
export const conditional = process.env.REFRESH_EXPECT_CONDITIONAL !== '0'
export const idleMs = 25_000
export const bodyBytes = 16 * 1024
export const heavyBody = 'Refresh measurement body line.\n'.repeat(Math.ceil(bodyBytes / 31)).slice(0, bodyBytes)

// A test-only Vite transform counts function executions, not DOM mutations. No
// source or web/dist files are written. Fail closed if an insertion point moves.
let bundle: Promise<{ code: string; sha256: string }> | undefined
async function instrumentedBundle() {
  bundle ??= (async () => {
    const found = new Set<string>()
    const output = await build({
      configFile: resolve('vite.config.ts'), logLevel: 'error',
      build: { write: false },
      plugins: [{ name: 'refresh-measurement-counters', enforce: 'pre',
        transform(code, id) {
          const points: [string, RegExp, string][] = [
            ['/ui/App.tsx', /export function App\(\) \{/, 'appRenders'],
            ['/ui/canvas/CardView.tsx', /memo\(function CardView\([^\n]*\) \{/, 'cardRenders'],
            ['/platform/canvas/geometry.ts', /export function autoPlace\([\s\S]*?\): Map<string, Point> \{/, 'placementCalls'],
          ]
          for (const [suffix, pattern, counter] of points) {
            if (!id.endsWith(suffix)) continue
            if (!pattern.test(code)) throw new Error(`Refresh instrumentation insertion point moved: ${suffix}`)
            found.add(counter)
            code = code.replace(pattern, match => `${match}\n;(globalThis as any).__refreshCounts.${counter}++;`)
          }
          return code
        },
      }],
    })
    if (found.size !== 3) throw new Error('Refresh instrumentation did not visit all three functions')
    const outputs = Array.isArray(output) ? output : [output]
    const chunks = outputs.flatMap(item => 'output' in item ? item.output : []).filter(item => item.type === 'chunk')
    if (chunks.length !== 1 || chunks[0].type !== 'chunk') throw new Error('Expected one application chunk for refresh instrumentation')
    const code = chunks[0].code
    return { code, sha256: createHash('sha256').update(code).digest('hex') }
  })()
  return bundle
}

export async function diagnostics(page: Page) {
  const instrument = process.env.REFRESH_INSTRUMENT !== '0'
  const compiled = instrument ? await instrumentedBundle() : null
  await page.addInitScript(({ instrument }) => {
    const win = window as any
    win.__refreshCounts = { appRenders: 0, cardRenders: 0, placementCalls: 0 }
    win.__refreshInstrumented = instrument
    win.__refreshFetchResults = []
    const send = window.fetch.bind(window)
    window.fetch = async (...args) => {
      const response = await send(...args)
      if (new URL(response.url).pathname === '/api/board') win.__refreshFetchResults.push(response.status)
      return response
    }
    win.__refreshDOM = { all: 0, content: 0, cards: 0, inspector: 0, diagnostics: 0 }
    new MutationObserver(records => {
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement
        win.__refreshDOM.all++
        if (record.type === 'attributes' && /^data-(render|canvas-frame|placement|store-publications)/.test(record.attributeName || '')) {
          win.__refreshDOM.diagnostics++; continue
        }
        win.__refreshDOM.content++
        if (target?.closest('#cards')) win.__refreshDOM.cards++
        if (target?.closest('#inspector')) win.__refreshDOM.inspector++
      }
    }).observe(document, { attributes: true, childList: true, characterData: true, subtree: true })
  }, { instrument })
  if (compiled) {
    await page.route('**/assets/*.js', route => route.fulfill({ contentType: 'application/javascript', body: compiled.code }))
  }
  return { instrumented: instrument, instrumentedBundleSHA256: compiled?.sha256 ?? null,
    method: instrument ? 'In-memory Vite function-entry increments in App, CardView and autoPlace; existing Inspector data-render-count; MutationObserver.'
      : 'Embedded production assets; existing Inspector data-render-count; MutationObserver. Other function counts unavailable.' }
}

export async function counters(page: Page) {
  return page.evaluate(() => {
    const win = window as any
    return {
      appRenders: win.__refreshInstrumented ? win.__refreshCounts.appRenders as number : null,
      cardRenders: win.__refreshInstrumented ? win.__refreshCounts.cardRenders as number : null,
      placementCalls: win.__refreshInstrumented ? win.__refreshCounts.placementCalls as number : null,
      inspectorRenders: Number(document.querySelector('#inspector')?.getAttribute('data-render-count') || 0),
      dom: { ...win.__refreshDOM } as Record<string, number>,
    }
  })
}
export function counterDelta(before: Awaited<ReturnType<typeof counters>>, after: Awaited<ReturnType<typeof counters>>) {
  return {
    appRenders: before.appRenders === null || after.appRenders === null ? null : after.appRenders - before.appRenders,
    cardRenders: before.cardRenders === null || after.cardRenders === null ? null : after.cardRenders - before.cardRenders,
    placementCalls: before.placementCalls === null || after.placementCalls === null ? null : after.placementCalls - before.placementCalls,
    inspectorRenders: after.inspectorRenders - before.inspectorRenders,
    dom: Object.fromEntries(Object.entries(after.dom).map(([key, n]) => [key, n - before.dom[key]])),
  }
}

export interface BoardRead {
  id: string
  startedMs: number
  url: string
  method: string
  ifNoneMatch: string | null
  status: number | null
  etag: string | null
  decodedPayloadBytes: number | null
  encodedBodyBytes: number
  wireResponseBytes: number | null
  durationMs: number | null
  fromDiskCache: boolean
  completion?: string
  wireBytesSource?: string
  error?: string
}
function header(headers: Record<string, unknown>, name: string) {
  const key = Object.keys(headers).find(key => key.toLowerCase() === name)
  return key ? String(headers[key]) : null
}
export async function network(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  // No artificial clocks, polling, cache headers, throttling or visibility events.
  const rows = new Map<string, BoardRead>()
  const extraRequests = new Map<string, Record<string, unknown>>()
  const extraResponses = new Map<string, { statusCode: number; headers: Record<string, unknown>; headersText?: string }>()
  const pending = new Set<Promise<void>>()
  const started = performance.now()
  cdp.on('Network.requestWillBeSent', event => {
    if (!new URL(event.request.url).pathname.endsWith('/api/board')) return
    const headers = extraRequests.get(event.requestId) || event.request.headers
    rows.set(event.requestId, { id: event.requestId, startedMs: performance.now() - started,
      url: event.request.url, method: event.request.method, ifNoneMatch: header(headers, 'if-none-match'),
      status: null, etag: null, decodedPayloadBytes: null, encodedBodyBytes: 0,
      wireResponseBytes: null, durationMs: null, fromDiskCache: false })
  })
  cdp.on('Network.requestWillBeSentExtraInfo', event => {
    extraRequests.set(event.requestId, event.headers)
    const row = rows.get(event.requestId)
    if (row) row.ifNoneMatch = header(event.headers, 'if-none-match')
  })
  cdp.on('Network.responseReceivedExtraInfo', event => {
    extraResponses.set(event.requestId, event)
    const row = rows.get(event.requestId)
    if (row) {
      row.status = event.statusCode; row.etag = header(event.headers, 'etag')
      if (event.statusCode === 304) {
        row.decodedPayloadBytes = 0
        if (event.headersText) {
          row.wireResponseBytes = Buffer.byteLength(event.headersText)
          row.wireBytesSource = 'CDP raw HTTP response headers; 304 has no body'
        }
      }
    }
  })
  cdp.on('Network.responseReceived', event => {
    const row = rows.get(event.requestId)
    if (!row) return
    const extra = extraResponses.get(event.requestId)
    row.status = extra?.statusCode ?? event.response.status
    row.etag = header(extra?.headers ?? event.response.headers, 'etag')
    row.fromDiskCache = !!event.response.fromDiskCache
  })
  cdp.on('Network.dataReceived', event => {
    const row = rows.get(event.requestId)
    if (row) row.encodedBodyBytes += event.encodedDataLength
  })
  cdp.on('Network.loadingFinished', event => {
    const row = rows.get(event.requestId)
    if (!row) return
    row.durationMs = performance.now() - started - row.startedMs
    row.wireResponseBytes = event.encodedDataLength
    row.wireBytesSource = 'CDP loadingFinished.encodedDataLength'
    const done = (async () => {
      if (row.status === 304) { row.decodedPayloadBytes = 0; return }
      try {
        const body = await cdp.send('Network.getResponseBody', { requestId: event.requestId })
        row.decodedPayloadBytes = Buffer.byteLength(body.body, body.base64Encoded ? 'base64' : 'utf8')
      } catch (error) { row.error = String(error) }
    })()
    pending.add(done); void done.finally(() => pending.delete(done))
  })
  cdp.on('Network.loadingFailed', event => {
    const row = rows.get(event.requestId)
    if (!row) return
    // Chromium reports ERR_ABORTED when it discards a bodyless 304 even though
    // fetch resolves with status 304. Retain raw header bytes and label this
    // separately; regression tests also verify the resolved fetch outcomes.
    if (row.status === 304 && event.errorText === 'net::ERR_ABORTED' && row.wireResponseBytes !== null) {
      row.decodedPayloadBytes = 0
      row.durationMs = performance.now() - started - row.startedMs
      row.completion = 'bodyless 304 reported as ERR_ABORTED by CDP'
    } else row.error = event.errorText
  })
  return {
    mark: () => performance.now() - started,
    async since(mark: number) {
      await Promise.all([...pending])
      return [...rows.values()].filter(row => row.startedMs >= mark).map(row => ({ ...row }))
    },
  }
}

export function totals(rows: BoardRead[]) {
  const sum = (key: 'decodedPayloadBytes' | 'wireResponseBytes') => rows.every(row => row[key] !== null)
    ? rows.reduce((total, row) => total + row[key]!, 0) : null
  return { requests: rows.length, status: rows.map(row => row.status), payloadBytes: sum('decodedPayloadBytes'),
    wireResponseBytes: sum('wireResponseBytes'), conditionalRequests: rows.filter(row => row.ifNoneMatch !== null).length }
}

export async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}

export async function externalTitle(root: string, id: string, before: string, after: string) {
  async function visit(dir: string): Promise<string | undefined> {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, item.name)
      if (item.isDirectory()) { const result = await visit(path); if (result) return result }
      else if (item.name.includes(id) && item.name.endsWith('.md')) return path
    }
  }
  const path = await visit(join(root, '.tickets'))
  if (!path) throw new Error(`Fixture ticket file missing: ${id}`)
  const source = await readFile(path, 'utf8')
  if (!source.includes(before)) throw new Error('Fixture title not found in ticket file')
  // Atomic editor-style replacement in this test's mkdtemp store only.
  await writeFile(`${path}.refresh-tmp`, source.replaceAll(before, after))
  await rename(`${path}.refresh-tmp`, path)
}

export function environment(browserVersion: string) {
  return { recordedAt: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    workingTree: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim(),
    node: process.version, go: execFileSync('go', ['version'], { encoding: 'utf8' }).trim(),
    playwright: '1.61.1', browser: browserVersion, chromiumExecutable: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || 'Playwright managed',
    os: `${platform()} ${release()}`, cpu: cpus()[0]?.model, logicalCPUs: cpus().length,
    viewport: { width: 1440, height: 1000 }, workers: 1,
    conditionalExpected: conditional, productionPollingMs: 12_000,
  }
}
