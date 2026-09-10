import { test, expect, type Ticket } from './fixtures'
import { bodyBytes, heavyBody, diagnostics, counters, counterDelta, network, totals, settle, environment } from './refresh-support'
import { assertEventContract, card, connected, externalEdit, liveTraffic, p95, probe, saveMeasurement, visibleTitle } from './live-update-support'

const sampleCount = 30
const idleMs = 25_000

test.describe('live-update measurements', () => {
  test.skip(process.env.LIVE_UPDATE_MEASURE !== '1', 'Set LIVE_UPDATE_MEASURE=1 for real-timer, two-tab measurements')
  // --workers=1 provides isolation without serial-mode skip-on-first-failure.
  test.describe.configure({ mode: 'default', timeout: 240_000 })

  for (const variant of ['normal', 'body-heavy'] as const) {
    test(`120-card ${variant}, two tabs, 30 external edits`, async ({ page, app, request, browser }, testInfo) => {
      expect(testInfo.config.workers, 'Measurements require --workers=1').toBe(1)
      const tickets: Ticket[] = []
      for (let i = 0; i < 120; i++) {
        let ticket = await app.create(`Representative ticket ${i}`, { x: (i % 10) * 322, y: Math.floor(i / 10) * 160 })
        const ops: object[] = []
        if (i && i % 3 === 0) ops.push({ op: 'addDependency', id: tickets[i - 1].id })
        if (variant === 'body-heavy') ops.push({ op: 'setDescription', text: heavyBody })
        if (ops.length) ticket = await app.patch(ticket, ops)
        tickets.push(ticket)
      }
      const second = await page.context().newPage()
      const tabs = [page, second]
      const phases: Record<string, unknown> = {}
      const observations: { index: number; title: string; writeDurationMs: number; acceptedToVisibleMs: number[]; writeStartToVisibleMs: number[] }[] = []
      const fixtureBoard = await app.board()
      const fixture = { variant, cards: 120, pinnedCards: 120, dependencies: 39, tabs: 2, externalEditSamples: sampleCount,
        descriptionBytesPerTicket: variant === 'body-heavy' ? bodyBytes : 0,
        actualDescriptionBytes: fixtureBoard.tickets.reduce((sum, ticket) => sum + Buffer.byteLength(ticket.body.description || ''), 0),
        boardJSONBytesFromFixture: Buffer.byteLength(JSON.stringify(fixtureBoard)) }
      const instrumentation = await Promise.all(tabs.map(tab => diagnostics(tab)))
      const traffic = await Promise.all(tabs.map(tab => network(tab)))
      const streams = await Promise.all(tabs.map(tab => liveTraffic(tab)))
      let completed = false
      try {
        await Promise.all(tabs.map(tab => tab.goto(app.url)))
        await Promise.all(streams.map(stream => connected(stream)))
        for (const tab of tabs) {
          await expect(tab.locator('.card')).toHaveCount(120)
          await card(tab, tickets[0].id).click()
          await expect(tab.locator('#inspector')).toHaveClass('open')
          await expect(card(tab, tickets[1].id)).toBeInViewport()
          await settle(tab)
        }
        // Let initial handshake reads finish before the idle boundary. This wait
        // does not change application timers or trigger any read itself.
        await page.waitForTimeout(500)
        phases.initial = await Promise.all(traffic.map(tab => tab.since(0)))
        const serverBefore = await probe(request, app.url)
        const before = await Promise.all(tabs.map(tab => counters(tab)))
        const marks = traffic.map(tab => tab.mark())
        const started = performance.now()
        await page.waitForTimeout(idleMs)
        const elapsedMs = performance.now() - started
        await Promise.all(tabs.map(tab => settle(tab)))
        const idleReads = await Promise.all(traffic.map((tab, i) => tab.since(marks[i])))
        const idleCounts = await Promise.all(tabs.map(async (tab, i) => counterDelta(before[i], await counters(tab))))
        const serverAfter = await probe(request, app.url)
        expect(serverAfter.etag).toBeTruthy()
        const repeatRead = await probe(request, app.url, serverAfter.etag)
        phases.idle = { requestedIntervalMs: idleMs, elapsedMs,
          tabs: idleReads.map((reads, i) => ({ reads, totals: totals(reads), counts: idleCounts[i] })),
          serverBefore, serverAfter, repeatRead,
          rebuildDelta: serverAfter.rebuilds - serverBefore.rebuilds,
          safetyScanDelta: serverAfter.safetyScans - serverBefore.safetyScans }

        // Each accepted write gets an independent DOM observation in BOTH tabs.
        // Keep editing card one, which is in each viewport, not off-screen cards.
        const target = tickets[1]
        let title = target.title
        const editMarks = traffic.map(tab => tab.mark())
        phases.externalEdits = { method: '30 sequential atomic replacements of one visible ticket; wait for both tabs after each write', observations }
        for (let index = 0; index < sampleCount; index++) {
          const next = `Live sample ${index + 1}`
          const edit = await externalEdit(app.root, target.id, title, next)
          const latency = await Promise.all(tabs.map(tab => visibleTitle(tab, target.id, next, edit.acceptedAt)))
          observations.push({ index: index + 1, title: next, writeDurationMs: edit.acceptedAt - edit.startedAt,
            acceptedToVisibleMs: latency, writeStartToVisibleMs: latency.map(ms => ms + edit.acceptedAt - edit.startedAt) })
          title = next
        }
        const externalReads = await Promise.all(traffic.map((tab, i) => tab.since(editMarks[i])))
        const percentiles = tabs.map((_, i) => ({ tab: i + 1, samples: observations.length,
          acceptedToVisibleP95Ms: p95(observations.map(row => row.acceptedToVisibleMs[i])),
          writeStartToVisibleP95Ms: p95(observations.map(row => row.writeStartToVisibleMs[i])) }))
        phases.externalEdits = { observations, percentiles,
          tabs: externalReads.map(reads => ({ reads, totals: totals(reads) })) }

        // Ten writes without waiting for the browser between them exercise
        // coalescing. The final title is visible in both viewports.
        const burstMarks = traffic.map(tab => tab.mark())
        const burstStarted = performance.now()
        let lastAccepted = burstStarted
        for (let i = 0; i < 10; i++) {
          const next = `Live burst ${i + 1}`
          const edit = await externalEdit(app.root, target.id, title, next)
          lastAccepted = edit.acceptedAt; title = next
        }
        const burstLatency = await Promise.all(tabs.map(tab => visibleTitle(tab, target.id, title, lastAccepted)))
        const burstReads = await Promise.all(traffic.map((tab, i) => tab.since(burstMarks[i])))
        phases.burst = { edits: 10, method: 'Ten atomic replacements of the same visible ticket, without browser waits',
          writeDurationMs: lastAccepted - burstStarted, finalWriteToVisibleMs: burstLatency,
          tabs: burstReads.map(reads => ({ reads, totals: totals(reads) })) }

        // Preserve the existing pointer-motion guard's 30 samples, two frames,
        // and <100ms p95 / <250ms max thresholds for both body-size fixtures.
        await page.locator('#relationshipMode').selectOption('all')
        const targetCard = card(page, tickets[0].id)
        const box = (await targetCard.boundingBox())!
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        const pointer = await page.evaluate(async ({ x, y }) => {
          const stage = document.getElementById('stage')!, inspector = document.getElementById('inspector')!
          const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
          await frame(); await frame()
          const before = inspector.getAttribute('data-render-count')
          const frameBefore = Number(stage.getAttribute('data-canvas-frame'))
          const samples: number[] = []
          for (let i = 1; i <= 30; i++) {
            const start = performance.now()
            stage.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, isPrimary: true, clientX: x + i * 2, clientY: y + i, buttons: 1 }))
            await frame(); await frame(); samples.push(performance.now() - start)
          }
          return { samples, edges: document.querySelectorAll('#edgeLayer path[marker-end]').length,
            inspectorRendersBefore: before, inspectorRendersAfter: inspector.getAttribute('data-render-count'),
            renderedFrames: Number(stage.getAttribute('data-canvas-frame')) - frameBefore }
        }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
        await page.mouse.up()
        // Match the existing guard's percentile index exactly for pointer work.
        const pointerP95 = [...pointer.samples].sort((a, b) => a - b)[Math.floor(pointer.samples.length * .95)]
        phases.pointer = { ...pointer, p95ms: pointerP95, maxMs: Math.max(...pointer.samples) }

        expect(fixture.actualDescriptionBytes).toBe(variant === 'body-heavy' ? 120 * bodyBytes : 0)
        expect(serverAfter.epoch).toBe(serverBefore.epoch)
        // A 60-second safety reconciliation is a forced full rebuild, so any
        // rebuild in the window must be attributable to a safety scan. Idle tab
        // reads and boundary probes must cause zero rebuilds of their own.
        expect(serverAfter.rebuilds - serverBefore.rebuilds)
          .toBeLessThanOrEqual(serverAfter.safetyScans - serverBefore.safetyScans)
        expect(repeatRead.rebuilds - serverAfter.rebuilds)
          .toBeLessThanOrEqual(repeatRead.safetyScans - serverAfter.safetyScans)
        expect(serverAfter.safetyScans).toBeGreaterThanOrEqual(serverBefore.safetyScans)
        expect(serverBefore.stale || serverAfter.stale || serverBefore.degraded || serverAfter.degraded).toBe(false)
        for (let i = 0; i < tabs.length; i++) {
          expect(idleReads[i], `Tab ${i + 1} must not retain the 12-second poll while SSE is healthy`).toHaveLength(0)
          expect(idleCounts[i].inspectorRenders).toBe(0)
          if (instrumentation[i].instrumented) {
            expect(idleCounts[i].appRenders).toBe(0)
            expect(idleCounts[i].cardRenders).toBe(0)
            expect(idleCounts[i].placementCalls).toBe(0)
          }
          expect(percentiles[i].samples).toBeGreaterThanOrEqual(30)
          expect(percentiles[i].acceptedToVisibleP95Ms).toBeLessThanOrEqual(2_000)
          expect(percentiles[i].writeStartToVisibleP95Ms).toBeLessThanOrEqual(2_000)
          expect(burstLatency[i]).toBeLessThanOrEqual(3_000)
          assertEventContract(streams[i].events)
        }
        expect(pointer.edges).toBe(39)
        expect(pointer.renderedFrames).toBe(30)
        expect(pointer.inspectorRendersAfter).toBe(pointer.inspectorRendersBefore)
        expect(pointerP95).toBeLessThan(100)
        expect(Math.max(...pointer.samples)).toBeLessThan(250)
        completed = true
      } finally {
        const output = JSON.stringify({ format: 1, completed,
          environment: { ...environment(browser.version()), workers: testInfo.config.workers,
            productionPollingMs: null, healthySafetyReadMs: 60_000, fallbackPollingMs: 12_000, heartbeatMs: 15_000 },
          fixture, instrumentation, phases,
          streams: streams.map(({ attempts, connections, events, boardReads }) => ({ attempts, connections, events, boardReads })),
          limitations: ['Latency ends at DOM text observation via requestAnimationFrame, not a compositor paint timestamp. Both tabs contain the edited card in the viewport.',
            'Write-start includes fixture file lookup and replacement preparation. Accepted-write begins after atomic rename completion.',
            'No accelerated timers, synthetic visibility events, reloads, or request throttling. Two tabs share one browser context and one store.',
            'Boundary API probes are listed separately from browser board traffic. Cumulative rebuilds and safety scans are separate diagnostics.',
            'CDP transfer bytes exclude TCP/TLS overhead; see refresh-support.ts. SSE event records exclude comment heartbeats.',
            'completed=false means partial evidence only. Missing phases or fewer than 30 samples do not meet acceptance.'] }, null, 2) + '\n'
        try {
          await testInfo.attach(`live-update-${variant}.json`, { body: output, contentType: 'application/json' })
          await saveMeasurement(process.env.LIVE_UPDATE_OUTPUT_DIR || testInfo.outputPath('live-update-measurements'), variant, output)
        } finally { await second.close() }
      }
    })
  }

  test('healthy stream survives heartbeats and keeps the 60-second safety read', async ({ page, app, request }) => {
    test.setTimeout(100_000)
    const ticket = await app.create('Healthy safety read', { x: 0, y: 0 })
    const stream = await liveTraffic(page)
    await page.goto(app.url); await connected(stream)
    await expect(card(page, ticket.id)).toBeVisible()
    await page.waitForTimeout(500)
    const before = await probe(request, app.url)
    const mark = stream.mark(), connections = stream.connections.length
    await page.waitForTimeout(65_000)
    const reads = stream.boardReads.filter(row => row.atMs >= mark)
    expect(reads).toHaveLength(1)
    expect(reads[0].atMs - mark).toBeGreaterThanOrEqual(55_000)
    expect(stream.connections).toHaveLength(connections)
    const after = await probe(request, app.url)
    // The 65-second window contains at least one 60-second safety scan, and
    // each scan is a forced full rebuild. The tab's own single safety read must
    // not add a rebuild beyond what the scans account for.
    expect(after.safetyScans).toBeGreaterThanOrEqual(before.safetyScans + 1)
    expect(after.rebuilds - before.rebuilds).toBeLessThanOrEqual(after.safetyScans - before.safetyScans)
    const edit = await externalEdit(app.root, ticket.id, ticket.title, 'Still live after safety read')
    expect(await visibleTitle(page, ticket.id, 'Still live after safety read', edit.acceptedAt, 5_000)).toBeLessThanOrEqual(3_000)
    assertEventContract(stream.events)
  })
})
