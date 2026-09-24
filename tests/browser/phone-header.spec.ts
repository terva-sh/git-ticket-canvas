import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { expectFitsDevice, phone, tablet, type Device } from './touch'

// The header on a phone: one row, three sheets, and New ticket at the bottom
// right. See docs/mobile-design-v1.md, "The header is one row", and
// PhoneToolbar.tsx for what went where.

/** A phone held sideways. Still a phone: its short side is under 600. */
const landscape: Device = { ...phone, viewport: { width: 844, height: 390 } }

const SIZES = ['standard', 'large', 'larger'] as const

/** The controls a phone does not offer. Each writes the board's layout or
 * stands in for a gesture the phone already has. */
const ABSENT = ['#btnFrame', '#btnFrameUndo', '#btnFrameRedo', '#btnArrange',
  '#btnZoomIn', '#btnZoomOut', '#btnZoomReset', '#btnPens']

/** Store display overrides before the page reads them, the same record the
 * Display panel writes. */
async function preferences(page: Page, stored: Record<string, string>) {
  await page.addInitScript(value => localStorage.setItem('git-ticket-canvas.display', value), JSON.stringify(stored))
}

/**
 * How the header's controls sit: how many rows the header declares, and
 * whether any visible control starts below the bottom of another, which is
 * what a wrapped row looks like. Also whether any control leaves the screen.
 */
async function shape(page: Page) {
  return page.locator('#toolbar').evaluate(toolbar => {
    const rows = [...toolbar.querySelectorAll(':scope > .toolbar-row')]
    // Leaves, not groups: a group that wraps inside itself is still a wrap.
    const controls = [...toolbar.querySelectorAll(':scope > .toolbar-row :is(button, input, select, summary, .badge, .brand)')]
      .filter(element => element.getClientRects().length && !element.closest('details:not([open]) > :not(summary)'))
      .map(element => element.getBoundingClientRect())
    const wrapped = controls.some(a => controls.some(b => a.top >= b.bottom - 1))
    const outside = controls.some(box => box.left < 0 || box.right > window.innerWidth + 0.5)
    return { rows: rows.length, wrapped, outside, height: Math.round(toolbar.getBoundingClientRect().height) }
  })
}

async function open(page: Page, url: string) {
  await page.goto(url)
  await expect(page.locator('#toolbar')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'phone')
}

/** Wait for a sheet to stop moving before measuring anything under it. */
async function settled(page: Page, selector: string) {
  const box = () => page.locator(selector).boundingBox()
  await expect.poll(async () => JSON.stringify(await box())).toBe(JSON.stringify(await box()))
}

for (const [name, device] of [['portrait', phone], ['landscape', landscape]] as const) {
  test.describe(`phone ${name}`, () => {
    test.use(device)

    for (const size of SIZES) {
      // Read-only, because that is the widest the row gets: the badge is one
      // more control in it.
      test(`the header is one row at the ${size} toolbar size`, async ({ page, app }) => {
        await preferences(page, size === 'standard' ? {} : { toolbar: size })
        await open(page, await app.readOnlyURL())
        await expect(page.locator('html')).toHaveAttribute('data-toolbar', size)
        await expect(page.locator('#roBadge')).toBeVisible()
        expect(await shape(page)).toMatchObject({ rows: 1, wrapped: false, outside: false })
        await expectFitsDevice(page, device)
      })
    }

    test('offers no frame, arrange, pens or zoom controls, and New ticket sits at the bottom right', async ({ page, app }) => {
      await app.create('On a phone', { x: 0, y: 0 })
      await open(page, app.url)
      for (const selector of ABSENT) await expect(page.locator(selector), selector).toHaveCount(0)
      for (const id of ['#storePath', '#boardSelect', '#statusFilters', '#labelFilter', '#counts',
        '#relationshipMode', '#cardDensity', '#btnDisplay', '#newBoard']) {
        await expect(page.locator(id), `${id} waits in a sheet`).toHaveCount(0)
      }
      await expect(page.locator('#roBadge')).toBeHidden()

      const button = page.locator('#btnNew')
      await expect(button).toBeEnabled()
      const box = (await button.boundingBox())!
      const { width, height } = device.viewport
      // Within thumb reach: its edges within 40px of the right and bottom of
      // the screen, and big enough to hit.
      expect(width - (box.x + box.width)).toBeLessThanOrEqual(40)
      expect(height - (box.y + box.height)).toBeLessThanOrEqual(40)
      expect(box.height).toBeGreaterThanOrEqual(44)
      await button.tap()
      await expect(page.locator('#composer')).toBeVisible()
      await expectFitsDevice(page, device)
    })

    test('every control that moved is reachable from a sheet', async ({ page, app }) => {
      await open(page, app.url)
      await expect(page.locator('#phoneFilter')).toHaveAccessibleName('Filters')
      await expect(page.locator('#phoneStore')).toHaveText(/^default/)

      // Store and board: the brand, the path, the build and the board.
      await page.locator('#phoneStore').tap()
      await settled(page, '#phoneStoreSheet')
      await expect(page.locator('#phoneStoreSheet .brand')).toBeVisible()
      await expect(page.locator('#storePath')).toHaveText(/\S/)
      await expect(page.locator('#version > summary')).toBeVisible()
      await page.locator('#version > summary').tap()
      await expect(page.locator('#version dl')).toBeVisible()
      await expect(page.locator('#boardSelect')).toHaveValue('default')
      await expectFitsDevice(page, device)
      await page.locator('#phoneStore').tap()
      await expect(page.locator('#phoneStoreSheet')).toHaveCount(0)

      // Filters: statuses, labels, the count, and a badge on the button.
      await page.locator('#phoneFilter').tap()
      await settled(page, '#phoneFilterSheet')
      await expect(page.locator('#counts')).toBeVisible()
      await expect(page.locator('#labelFilter > summary')).toBeVisible()
      const chip = page.locator('#statusFilters .chip').first()
      await chip.tap()
      await expect(chip).toHaveAttribute('aria-pressed', 'true')
      await expect(page.locator('#phoneFilterCount')).toHaveText('1')
      await expect(page.locator('#phoneFilter')).toHaveAccessibleName('Filters, 1 active')
      await page.locator('#labelFilter > summary').tap()
      await expect(page.locator('#labelFilter .label-filter-body')).toBeVisible()
      await expectFitsDevice(page, device)

      // A finger on the board closes the sheet.
      const stage = (await page.locator('#stage').boundingBox())!
      await page.touchscreen.tap(Math.round(stage.x + 40), Math.round(stage.y + stage.height - 40))
      await expect(page.locator('#phoneFilterSheet')).toHaveCount(0)

      // The menu: relationships, density, Fit, Display, New board.
      await page.locator('#phoneMenu').tap()
      await settled(page, '#phoneMenuSheet')
      for (const id of ['#relationshipMode', '#cardDensity', '#btnFit', '#btnDisplay', '#newBoard']) {
        await expect(page.locator(`#phoneMenuSheet ${id}`), id).toBeVisible()
      }
      await expect(page.locator('#newBoard')).toBeEnabled()
      await page.locator('#relationshipMode').selectOption('none')
      await expect(page.locator('#relationshipMode')).toHaveValue('none')
      await expectFitsDevice(page, device)
      await page.locator('#btnDisplay').tap()
      await expect(page.locator('#phoneMenuSheet')).toHaveCount(0)
      await expect(page.locator('#display-toolbar-large')).toBeVisible()
    })

    test('read-only shows the badge in the row and disables New ticket and New board', async ({ page, app }) => {
      await open(page, await app.readOnlyURL())
      await expect(page.locator('#toolbar > .toolbar-row #roBadge')).toBeVisible()
      await expect(page.locator('#btnNew')).toBeDisabled()
      await page.locator('#phoneMenu').tap()
      await expect(page.locator('#newBoard')).toBeDisabled()
    })
  })
}

test.describe('phone portrait, with a ticket open', () => {
  test.use(phone)

  // The ticket sheet's own controls sit along the bottom of the screen, where
  // New ticket is. It gives way rather than covering them.
  test('New ticket is hidden while the ticket sheet is open, and comes back when it closes', async ({ page, app }) => {
    const ticket = await app.create('Opened on a phone', { x: 0, y: 0 })
    await open(page, app.url)
    const card = page.locator(`.card[data-id="${ticket.id}"]`)
    await expect(card).toBeVisible()
    await expect(page.locator('#btnNew')).toBeVisible()
    await card.tap()
    await expect(page.locator('#inspector.open')).toBeVisible()
    await expect(page.locator('#btnNew')).toBeHidden()
    await page.keyboard.press('Escape')
    await expect(page.locator('#inspector.open')).toHaveCount(0)
    await expect(page.locator('#btnNew')).toBeVisible()
  })
})

test.describe('phone header baseline', () => {
  test.use(phone)

  // Opt-in, for the same reason as the dense canvas: CI's Chromium and a
  // developer's render text differently. Compare it with
  // `CANVAS_VISUAL=1 npx playwright test tests/browser/phone-header.spec.ts`.
  // A new image comes from the same command with `--update-snapshots -g
  // baseline`; unlike canvas-baseline.png it has no metadata to keep in step.
  test('matches the committed phone header baseline', async ({ page, app }) => {
    test.skip(!process.env.CANVAS_VISUAL, 'Set CANVAS_VISUAL=1 to compare pixels; see docs/canvas-baseline.md.')
    // Nothing in the row varies between runs: the store path, the version and
    // the store's name are all in the sheet or only in an accessible name.
    await open(page, app.url)
    await expect(page.locator('#search')).toBeVisible()
    await expect(page.locator('#toolbar')).toHaveScreenshot('phone-header.png', { animations: 'disabled', caret: 'hide' })
  })
})

// The layout is a setting, not a window size. The header follows an override
// either way, and the desk header on a phone is exactly what this replaced.
test.describe('the header follows the layout setting', () => {
  test.use(phone)

  test('a phone set to desk gets the desk header, which wraps', async ({ page, app }) => {
    await preferences(page, { layout: 'desk' })
    await page.goto(app.url)
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'desk')
    await expect(page.locator('#phoneStore')).toHaveCount(0)
    await expect(page.locator('#btnArrange')).toBeVisible()
    // The check the one-row tests rely on does see a wrap when there is one.
    expect(await shape(page)).toMatchObject({ rows: 2, wrapped: true })
  })
})

test.describe('a desk window set to phone', () => {
  test('gets the phone header', async ({ page, app }) => {
    await preferences(page, { layout: 'phone' })
    await open(page, app.url)
    await expect(page.locator('#phoneStore')).toBeVisible()
    await expect(page.locator('#btnArrange')).toHaveCount(0)
    expect(await shape(page)).toMatchObject({ rows: 1, wrapped: false })
  })
})

// Tablet and desk keep the two-row header with every control in it. The
// structure is pinned in toolbar-layout.test.tsx; this checks the real page.
for (const [name, device] of [['tablet', tablet], ['desk', null]] as const) {
  test.describe(`${name} header`, () => {
    if (device) test.use(device)

    test('is the two-row header with frame, arrange, pens and zoom controls', async ({ page, app }) => {
      await page.goto(app.url)
      await expect(page.locator('html')).toHaveAttribute('data-layout', name)
      await expect(page.locator('#toolbar > .toolbar-row')).toHaveCount(2)
      for (const selector of [...ABSENT, '#btnFit', '#statusFilters', '#boardSelect', '#storePath']) {
        await expect(page.locator(selector), selector).toBeVisible()
      }
      await expect(page.locator('#phoneStore, #phoneFilter, #phoneMenu')).toHaveCount(0)
      // New ticket is in the working row, not fixed at the bottom.
      await expect(page.locator('#toolbar [data-row="working"] #btnNew')).toBeVisible()
      await expect(page.locator('#btnNew')).not.toHaveClass(/phone-new/)
    })
  })
}
