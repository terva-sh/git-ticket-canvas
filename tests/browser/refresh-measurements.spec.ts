import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { test, expect, type Ticket } from './fixtures'
import { bodyBytes, heavyBody, conditional, idleMs, diagnostics, counters, counterDelta, network, totals, settle, externalTitle, environment } from './refresh-support'

test.describe('refresh measurements', () => {
  // Measurements run deliberately and serially, not as extra minutes in every browser suite.
  test.skip(process.env.REFRESH_MEASURE !== '1', 'Set REFRESH_MEASURE=1 to collect production-timing measurements')
  test.describe.configure({ timeout: 180_000 })

  for (const variant of ['normal', 'body-heavy'] as const) {
    test(`120-card ${variant}`, async ({ page, app, request, browser }, testInfo) => {
      const tickets: Ticket[] = []
      for (let i = 0; i < 120; i++) {
        let ticket = await app.create(`Representative ticket ${i}`, { x: (i % 10) * 322, y: Math.floor(i / 10) * 160 })
        const ops: object[] = []
        if (i && i % 3 === 0) ops.push({ op: 'addDependency', id: tickets[i - 1].id })
        if (variant === 'body-heavy') ops.push({ op: 'setDescription', text: heavyBody })
        if (ops.length) ticket = await app.patch(ticket, ops)
        tickets.push(ticket)
      }
      const instrumentation = await diagnostics(page)
      const traffic = await network(page)
      await page.goto(app.url)
      await expect(page.locator('.card')).toHaveCount(120)
      const selected = page.locator(`.card[data-id="${tickets[0].id}"]`)
      await selected.click()
      await expect(page.locator('#inspector')).toHaveClass('open')
      await settle(page)
      const initial = await traffic.since(0)
      const seededBoard = await app.board()
      const fixture = { variant, cards: 120, dependencies: 39, pinnedCards: 120,
        descriptionBytesPerTicket: variant === 'body-heavy' ? bodyBytes : 0,
        actualDescriptionBytes: seededBoard.tickets.reduce((n, t) => n + Buffer.byteLength(t.body.description || ''), 0),
        boardJSONBytesFromFixture: Buffer.byteLength(JSON.stringify(seededBoard)),
      }
      const phases: Record<string, unknown> = {}
      let mark = traffic.mark(), before = await counters(page)
      const idleStart = performance.now()
      await page.waitForTimeout(idleMs)
      const elapsedMs = performance.now() - idleStart
      await settle(page)
      const idle = await traffic.since(mark)
      const idleCounts = counterDelta(before, await counters(page))
      phases.idle = { requestedIntervalMs: idleMs, elapsedMs, reads: idle, totals: totals(idle), counts: idleCounts }

      // Mutations originate in another client. Browser refresh remains the real
      // production interval, rather than an artificial visibility event.
      async function patch(index: number, title: string) {
        const ticket = tickets[index]
        const data = { ifRevision: ticket.revision, ops: [{ op: 'setTitle', title }] }
        const started = performance.now()
        const response = await request.patch(`${app.url}/api/tickets/${ticket.id}`, { data })
        expect(response.status()).toBe(200)
        const body = await response.body()
        tickets[index] = JSON.parse(body.toString()).ticket
        return { status: response.status(), requestPayloadBytes: Buffer.byteLength(JSON.stringify(data)),
          responsePayloadBytes: body.length, elapsedMs: performance.now() - started,
          wireResponseBytes: null, serverReconciliation: null }
      }
      async function visible(id: string, title: string) {
        await page.waitForFunction(({ id, title }) => document.querySelector(`.card[data-id="${id}"] .card-title`)?.textContent === title,
          { id, title }, { polling: 'raf', timeout: 15_000 })
        await settle(page)
      }
      mark = traffic.mark(); before = await counters(page)
      let changedStart = performance.now()
      const apiWrite = await patch(0, 'API measurement edit')
      const apiAccepted = performance.now()
      await visible(tickets[0].id, 'API measurement edit')
      let rows = await traffic.since(mark)
      phases.apiEdit = { mutation: apiWrite, writeStartToVisibleMs: performance.now() - changedStart,
        acceptedToVisibleMs: performance.now() - apiAccepted, reads: rows, totals: totals(rows),
        counts: counterDelta(before, await counters(page)) }

      mark = traffic.mark(); before = await counters(page)
      changedStart = performance.now()
      await externalTitle(app.root, tickets[1].id, tickets[1].title, 'External filesystem measurement edit')
      const externalAccepted = performance.now()
      await visible(tickets[1].id, 'External filesystem measurement edit')
      rows = await traffic.since(mark)
      phases.externalEdit = { method: 'Atomic rename of one Markdown file in isolated fixture store',
        writeStartToVisibleMs: performance.now() - changedStart, acceptedToVisibleMs: performance.now() - externalAccepted,
        reads: rows, totals: totals(rows), counts: counterDelta(before, await counters(page)) }

      mark = traffic.mark(); before = await counters(page)
      changedStart = performance.now()
      const burstWrites = []
      for (let i = 10; i < 20; i++) burstWrites.push(await patch(i, `Burst measurement edit ${i}`))
      const burstAccepted = performance.now()
      await Promise.all(tickets.slice(10, 20).map((ticket, i) => visible(ticket.id, `Burst measurement edit ${i + 10}`)))
      rows = await traffic.since(mark)
      phases.burst = { edits: 10, method: 'Ten sequential API patches to ten distinct tickets', mutations: burstWrites,
        mutationRequestPayloadBytes: burstWrites.reduce((n, w) => n + w.requestPayloadBytes, 0),
        mutationResponsePayloadBytes: burstWrites.reduce((n, w) => n + w.responsePayloadBytes, 0),
        writeStartToVisibleMs: performance.now() - changedStart, lastAcceptedToVisibleMs: performance.now() - burstAccepted,
        reads: rows, totals: totals(rows), counts: counterDelta(before, await counters(page)) }

      const result = { format: 1, environment: { ...environment(browser.version()), workers: testInfo.config.workers },
        instrumentation, fixture, initial, phases,
        limitations: ['CDP wireResponseBytes uses loadingFinished.encodedDataLength for completed responses or raw HTTP response headers for bodyless 304; each row labels the source. Neither includes TCP/TLS overhead.',
          'Network.dataReceived encodedBodyBytes may be zero when Chromium supplies no per-chunk encoded lengths; it is not a payload estimate.',
          'APIRequestContext mutation payloads are decoded bytes. Mutation wire sizes and server reconciliation counts are unavailable.',
          'Latency is accepted-write-to-DOM observation, including polling delay and up to two settling frames; not filesystem-event detection latency.',
          'No throttling or accelerated timers. One tab with open inspector. Reconnect, multiple tabs and other correctness cases use separate regression tests.'] }
      const output = JSON.stringify(result, null, 2) + '\n'
      await testInfo.attach(`refresh-${variant}.json`, { body: output, contentType: 'application/json' })
      const outDir = resolve(process.env.REFRESH_OUTPUT_DIR || testInfo.outputPath('measurements'))
      await mkdir(outDir, { recursive: true })
      await writeFile(join(outDir, `refresh-${variant}.json`), output)
      // Keep diagnostic artifacts even if the new behavior regresses.
      expect(fixture.actualDescriptionBytes).toBe(variant === 'body-heavy' ? 120 * bodyBytes : 0)
      expect(idle.length).toBeGreaterThanOrEqual(2)
      expect(idle.every(row => !row.error && row.wireResponseBytes !== null && row.decodedPayloadBytes !== null)).toBe(true)
      if (conditional) {
        expect(idle.every(row => row.status === 304 && !!row.ifNoneMatch && row.decodedPayloadBytes === 0)).toBe(true)
        expect(idleCounts.inspectorRenders).toBe(0)
        if (instrumentation.instrumented) {
          expect(idleCounts.appRenders).toBe(0)
          expect(idleCounts.cardRenders).toBe(0)
          expect(idleCounts.placementCalls).toBe(0)
        }
      }
    })
  }
})
