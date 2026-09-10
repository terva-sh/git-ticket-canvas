import { test, expect } from './fixtures'

test('120-card board keeps pointer frames out of the inspector', async ({ page, app }, testInfo) => {
  const tickets = []
  for (let i = 0; i < 120; i++) {
    const ticket = await app.create(`Representative ticket ${i}`, { x: (i % 10) * 322, y: Math.floor(i / 10) * 160 })
    if (i && i % 3 === 0) await app.patch(ticket, [{ op: 'addDependency', id: tickets[i - 1].id }])
    tickets.push(ticket)
  }
  await page.goto(app.url)
  await expect(page.locator('.card')).toHaveCount(120)
  // Keep all 39 edges in the workload despite the quieter Selected default.
  await page.locator('#relationshipMode').selectOption('all')
  const target = page.locator(`.card[data-id="${tickets[0].id}"]`)
  await target.click()
  const box = (await target.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  const result = await page.evaluate(async ({ x, y }) => {
    const stage = document.getElementById('stage')!, inspector = document.getElementById('inspector')!
    const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    await frame(); await frame()
    const before = inspector.getAttribute('data-render-count')
    const frameBefore = Number(stage.getAttribute('data-canvas-frame'))
    const samples: number[] = []
    for (let i = 1; i <= 30; i++) {
      const start = performance.now()
      stage.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, isPrimary: true, clientX: x + i * 2, clientY: y + i, buttons: 1 }))
      await frame(); await frame()
      samples.push(performance.now() - start)
    }
    const after = inspector.getAttribute('data-render-count')
    samples.sort((a, b) => a - b)
    return { cards: 120, edges: document.querySelectorAll('#edgeLayer path[marker-end]').length,
      samples: samples.length, p95ms: samples[Math.floor(samples.length * .95)], maxMs: samples.at(-1)!,
      inspectorRendersBefore: before, inspectorRendersAfter: after,
      renderedFrames: Number(stage.getAttribute('data-canvas-frame')) - frameBefore }
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
  await page.mouse.up()
  await testInfo.attach('canvas-responsiveness.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
  expect(result.edges).toBe(39)
  expect(result.renderedFrames).toBe(30)
  expect(result.inspectorRendersAfter).toBe(result.inspectorRendersBefore)
  // Includes two display frames per sample. A generous ceiling detects stalls,
  // not differences between a laptop and CI's virtual display.
  expect(result.p95ms).toBeLessThan(100)
  expect(result.maxMs).toBeLessThan(250)
})
