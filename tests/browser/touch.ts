import { expect, type Page } from '@playwright/test'

/**
 * An emulated phone and tablet, and two-finger gestures to drive them.
 *
 * The devices are plain context options rather than Playwright projects, so a
 * spec opts in with `test.use(phone)` and every desk suite keeps running once,
 * at the desk size, with a mouse. They are not Playwright's named presets
 * either: those carry a WebKit user agent and a device scale factor of 3, and a
 * spec that says `iPhone 13` reads as a claim about an iPhone that emulated
 * Chromium cannot make. These are the sizes `docs/mobile-design-v1.md` names.
 *
 * `hasTouch` and `isMobile` together make Chromium match `(pointer: coarse)` and
 * stop matching `(hover: hover)`, which is what `useDisplay` reads.
 */
export interface Device {
  viewport: { width: number; height: number }
  hasTouch: true
  isMobile: true
}

export const phone: Device = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
export const tablet: Device = { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }

/**
 * Assert that the page is no wider than the device it is emulated on.
 *
 * Under `isMobile` Chromium grows the layout viewport to fit content that
 * overflows, the way a phone browser zooms out on a page built for a desk. A
 * page 18px too wide on a 390px phone reports an `innerWidth` of 408 and lays
 * itself out at 408, so a phone spec that never looks passes against a page a
 * phone cannot show. Call this once the page has settled.
 */
export async function expectFitsDevice(page: Page, device: Device) {
  const width = device.viewport.width
  const measured = await page.evaluate(() => ({
    inner: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  expect(measured, `the page widened past the emulated ${width}px`).toEqual({ inner: width, scroll: width })
}

export interface Point { x: number; y: number }

/** Two fingers at one moment, in viewport CSS pixels. */
export type Frame = readonly [Point, Point]

/**
 * Put two fingers down at the first frame, move them through the rest, and
 * lift both.
 *
 * This goes through CDP `Input.dispatchTouchEvent` because Playwright's
 * `touchscreen` can only tap: it has no move, and no second finger. Script that
 * dispatches `PointerEvent`s would skip the browser's touch pipeline, so
 * `touch-action`, pointer ids, which pointer is primary and implicit capture
 * would be whatever the test made up. CDP input takes the path a touchscreen
 * does, and the page sees two `touch` pointers with ids the browser assigned.
 * Chromium only, which is the only browser the harness runs.
 */
export async function twoFingers(page: Page, frames: readonly Frame[]) {
  if (frames.length < 2) throw new Error('a two-finger gesture needs a start and at least one move')
  const session = await page.context().newCDPSession(page)
  // Each finger keeps its id for the whole gesture. That is what lets the page
  // tell two moving fingers apart from one finger lifting and another landing.
  const points = (frame: Frame) => frame.map((point, id) => ({ x: point.x, y: point.y, id }))
  // Whether the fingers are down right now. A move that fails leaves them
  // down, and a caller that catches the failure and carries on would be
  // driving a page that still believes two fingers are on the glass.
  let down = false
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(frames[0]) })
    down = true
    for (const frame of frames.slice(1)) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(frame) })
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    down = false
  } finally {
    // Lifting is best effort here: the error worth reporting is the one that
    // got us into this block, not a second one from the cleanup.
    if (down) await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => {})
    await session.detach()
  }
}

/** A straight line from one frame to another, the first frame included. */
function interpolate(from: Frame, to: Frame, steps: number): Frame[] {
  const along = (a: Point, b: Point, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  return Array.from({ length: steps + 1 }, (_, step) => {
    const t = step / steps
    return [along(from[0], to[0], t), along(from[1], to[1], t)] as const
  })
}

/**
 * Pinch about a centre: two fingers on a horizontal line, `from` pixels apart
 * at the start and `to` pixels apart at the end. `to` above `from` spreads the
 * fingers, which is a zoom in.
 */
export async function pinch(page: Page, center: Point, from: number, to: number, steps = 8) {
  const at = (distance: number): Frame => [
    { x: center.x - distance / 2, y: center.y },
    { x: center.x + distance / 2, y: center.y },
  ]
  await twoFingers(page, interpolate(at(from), at(to), steps))
}

/**
 * Drag two fingers the same way by the same amount, `spread` pixels apart on a
 * horizontal line centred on `start`.
 */
export async function twoFingerPan(page: Page, start: Point, delta: Point, spread = 80, steps = 8) {
  const at = (center: Point): Frame => [
    { x: center.x - spread / 2, y: center.y },
    { x: center.x + spread / 2, y: center.y },
  ]
  await twoFingers(page, interpolate(at(start), at({ x: start.x + delta.x, y: start.y + delta.y }), steps))
}
