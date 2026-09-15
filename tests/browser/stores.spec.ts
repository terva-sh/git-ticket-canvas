import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * Switching stores in a real browser.
 *
 * What only a browser can answer is whether the canvas is rebuilt rather than
 * repainted: that the stream follows the store, and that no ticket, card, or
 * schema value from the first store is still on the page after the switch.
 */

async function openBrowser(page: Page) {
  await page.locator('#storePickerLabel').click()
  await page.locator('#browseStores').click()
  await expect(page.locator('#storeBrowser')).toBeVisible()
}

async function open(page: Page, name: string) {
  await page.locator(`.store-row[data-store="${name}"] .store-open`).click()
  await expect(page.locator('#storeBrowser')).toHaveCount(0)
  // The picker is a native details element, so nothing closes it on its own.
  // Left open its dropdown covers the toolbar and swallows clicks meant for
  // the controls underneath, which is how this reached a failed release.
  // Asserting it here fails on the cause rather than on whatever the dropdown
  // happens to overlap at the running machine's font metrics.
  await expect(page.locator('#storePicker')).not.toHaveAttribute('open', /.*/)
}

test('switching stores rebuilds the canvas and reconnects the stream', async ({ page, pair }) => {
  const [first, second] = pair.stores
  const streams: string[] = []
  page.on('request', request => {
    const path = new URL(request.url()).pathname
    if (path.endsWith('/events')) streams.push(path)
  })

  await page.goto(`${pair.url}/#store=${first.name}`)
  await expect(page.locator('.card-title')).toHaveText(first.title)
  await expect.poll(() => streams).toEqual([`/api/stores/${first.name}/events`])
  await expect(page.locator('#storePickerLabel')).toHaveText(first.name)

  await openBrowser(page)
  await open(page, second.name)

  // The board belongs to the second store, and nothing of the first is left.
  await expect(page.locator('.card-title')).toHaveText(second.title)
  await expect(page.locator('.card')).toHaveCount(1)
  await expect(page.getByText(first.title)).toHaveCount(0)
  await expect(page.locator('#storePath')).toContainText(second.root)
  await expect(page).toHaveURL(new RegExp(`#store=${second.name}$`))

  // The stream follows the store rather than staying on the previous one.
  await expect.poll(() => streams.at(-1)).toBe(`/api/stores/${second.name}/events`)
})

test('no ticket, card, or schema value from the first store survives the switch', async ({ page, pair }) => {
  const [first, second] = pair.stores
  await page.goto(`${pair.url}/#store=${first.name}`)
  await expect(page.locator('.card-title')).toHaveText(first.title)
  // A label is a schema value the toolbar derives from the store, so it is
  // visible proof that the schema was replaced rather than merged.
  await page.locator('#labelFilter > summary').click()
  await expect(page.locator(`.label-chip[data-label="${first.label}"]`)).toBeVisible()
  await page.locator('#labelFilter > summary').click()

  const cardBefore = await page.locator('.card').first().getAttribute('data-id')

  await openBrowser(page)
  await open(page, second.name)

  await expect(page.locator('.card-title')).toHaveText(second.title)
  await expect(page.locator(`.card[data-id="${cardBefore}"]`)).toHaveCount(0)
  await page.locator('#labelFilter > summary').click()
  await expect(page.locator(`.label-chip[data-label="${second.label}"]`)).toBeVisible()
  await expect(page.locator(`.label-chip[data-label="${first.label}"]`)).toHaveCount(0)
})

test('a configured store that is not there is listed with its reason', async ({ page, pair }) => {
  await page.goto(`${pair.url}/#store=${pair.stores[0].name}`)
  await expect(page.locator('.card-title')).toHaveText(pair.stores[0].title)
  await openBrowser(page)

  const row = page.locator(`.store-row[data-store="${pair.missing}"]`)
  await expect(row).toBeVisible()
  await expect(row).toHaveAttribute('data-available', 'false')
  await expect(row.locator('.store-reason')).toContainText('git-ticket init')
  await expect(row.locator('.store-open')).toBeDisabled()
})

test('a favorite marked from the view survives a reload', async ({ page, pair }) => {
  const [first, second] = pair.stores
  await page.goto(`${pair.url}/#store=${first.name}`)
  await expect(page.locator('.card-title')).toHaveText(first.title)
  await openBrowser(page)

  const mark = page.locator(`.store-row[data-store="${second.name}"] .store-favorite`)
  await expect(mark).toHaveAttribute('aria-pressed', 'false')
  await mark.click()
  await expect(mark).toHaveAttribute('aria-pressed', 'true')

  await page.reload()
  await expect(page.locator('.card-title')).toHaveText(first.title)
  await openBrowser(page)
  await expect(page.locator('.store-group-label').first()).toHaveText('Favorites')
  await expect(page.locator(`.store-row[data-store="${second.name}"] .store-favorite`))
    .toHaveAttribute('aria-pressed', 'true')
})
