import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { expectFitsDevice, phone, pinch, tablet, twoFingerPan, twoFingers } from './touch'

// These check the harness rather than the canvas: that an emulated device is a
// touch device as far as the page can tell, and that the two-finger helpers
// arrive as two fingers. What the canvas does with a pinch belongs to the specs
// of the tickets that teach it.

interface Seen { type: string; id: number; kind: string; primary: boolean; x: number; y: number }

/** Record every pointer event from here on. A capture listener on the window
 * sees events before the canvas does, including ones its pointer capture
 * retargets, so nothing the board does can hide a finger from this. */
async function recordPointers(page: Page) {
  await page.evaluate(() => {
    const seen: Seen[] = []
    ;(window as unknown as { seen: Seen[] }).seen = seen
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
      window.addEventListener(type, event => {
        const pointer = event as PointerEvent
        seen.push({ type, id: pointer.pointerId, kind: pointer.pointerType, primary: pointer.isPrimary,
          x: pointer.clientX, y: pointer.clientY })
      }, { capture: true })
    }
  })
  return () => page.evaluate(() => (window as unknown as { seen: Seen[] }).seen)
}

/** Two fingers, each down once and up once, and never taken by the browser. */
function expectTwoFingers(seen: Seen[]) {
  const downs = seen.filter(event => event.type === 'pointerdown')
  expect(downs.map(event => event.kind)).toEqual(['touch', 'touch'])
  const ids = downs.map(event => event.id)
  expect(new Set(ids).size).toBe(2)
  expect(downs.filter(event => event.primary)).toHaveLength(1)
  // A pointercancel is the browser claiming the gesture for itself, a native
  // scroll or zoom, which the page would then never finish seeing.
  expect(seen.filter(event => event.type === 'pointercancel')).toEqual([])
  expect(seen.filter(event => event.type === 'pointerup').map(event => event.id).sort()).toEqual([...ids].sort())
  for (const id of ids) expect(seen.filter(event => event.type === 'pointermove' && event.id === id).length).toBeGreaterThan(1)
  return ids
}

function lastMove(seen: Seen[], id: number) {
  return seen.filter(event => event.type === 'pointermove' && event.id === id).at(-1)!
}

async function stageCenter(page: Page) {
  const box = (await page.locator('#stage').boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

for (const [name, device] of [['phone', phone], ['tablet', tablet]] as const) {
  test.describe(name, () => {
    test.use(device)

    test(`an emulated ${name} reports a coarse pointer without hover and fits its width`, async ({ page, app }) => {
      await app.create('On a touch screen', { x: 0, y: 0 })
      await page.goto(app.url)
      await expect(page.locator('.card')).toBeVisible()
      expect(await page.evaluate(() => ({
        coarse: matchMedia('(pointer: coarse)').matches,
        hover: matchMedia('(hover: hover)').matches,
        touchPoints: navigator.maxTouchPoints > 0,
      }))).toEqual({ coarse: true, hover: false, touchPoints: true })
      await expectFitsDevice(page, device)
    })
  })
}

test.describe('phone gestures', () => {
  test.use(phone)

  test('a pinch arrives as two touch pointers that end the requested distance apart', async ({ page, app }) => {
    await app.create('Pinched', { x: 0, y: 0 })
    await page.goto(app.url)
    await expect(page.locator('.card')).toBeVisible()
    const seen = await recordPointers(page)
    const center = await stageCenter(page)

    await pinch(page, center, 60, 200)

    const events = await seen()
    const [first, second] = expectTwoFingers(events)
    const a = lastMove(events, first), b = lastMove(events, second)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(200, 0)
    expect((a.x + b.x) / 2).toBeCloseTo(center.x, 0)
    await expectFitsDevice(page, phone)
  })

  test('a two-finger pan moves both touch pointers by the same delta', async ({ page, app }) => {
    await app.create('Panned', { x: 0, y: 0 })
    await page.goto(app.url)
    await expect(page.locator('.card')).toBeVisible()
    const seen = await recordPointers(page)
    const center = await stageCenter(page)

    await twoFingerPan(page, center, { x: 60, y: 90 })

    const events = await seen()
    for (const id of expectTwoFingers(events)) {
      const down = events.find(event => event.type === 'pointerdown' && event.id === id)!
      const end = lastMove(events, id)
      expect(end.x - down.x).toBeCloseTo(60, 0)
      expect(end.y - down.y).toBeCloseTo(90, 0)
    }
    await expectFitsDevice(page, phone)
  })

  // A gesture that fails partway must not leave its fingers down. The caller
  // may catch the failure and carry on, and every tap after that would land
  // on a page that still has two touches in progress. A coordinate CDP will
  // not accept is the simplest way to make a move fail after the fingers land.
  test('a gesture whose move fails still lifts both fingers', async ({ page, app }) => {
    await page.goto(app.url)
    const seen = await recordPointers(page)
    const center = await stageCenter(page)
    const left = { x: center.x - 40, y: center.y }, right = { x: center.x + 40, y: center.y }

    await expect(twoFingers(page, [[left, right], [{ x: Number.NaN, y: center.y }, right]])).rejects.toThrow()

    const events = await seen()
    const downs = events.filter(event => event.type === 'pointerdown').map(event => event.id)
    expect(downs).toHaveLength(2)
    const lifted = events.filter(event => event.type === 'pointerup' || event.type === 'pointercancel').map(event => event.id)
    expect(lifted.sort()).toEqual([...downs].sort())
  })

  // The width check is only worth calling if it fails when it should. Chromium
  // widens a mobile viewport rather than scrolling it, so this is the case the
  // check exists for: nothing is visibly clipped, and innerWidth is what moved.
  test('the width check fails once something overflows the phone', async ({ page, app }) => {
    await page.goto(app.url)
    await expectFitsDevice(page, phone)
    await page.evaluate(() => {
      const wide = document.createElement('div')
      wide.style.cssText = 'width: 408px; height: 1px'
      document.body.append(wide)
    })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeGreaterThan(390)
    await expect(expectFitsDevice(page, phone)).rejects.toThrow(/widened past the emulated 390px/)
  })
})

// The default `use` block is a desk with a mouse, and the devices above must
// not have leaked into it. Every other suite relies on this without saying so.
test('the desk size still reports a fine pointer with hover', async ({ page, app }) => {
  await page.goto(app.url)
  expect(await page.evaluate(() => ({
    coarse: matchMedia('(pointer: coarse)').matches,
    hover: matchMedia('(hover: hover)').matches,
    width: innerWidth,
  }))).toEqual({ coarse: false, hover: true, width: 1440 })
})
