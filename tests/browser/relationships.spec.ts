import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

// Adding a dependency or a parent from the inspector, against a real server.
// The drag from a card's handle is covered elsewhere; this is the path a phone
// and a keyboard have, so the inspector is driven by keys alone once it is open.

function field(page: Page, label: string) {
  return page.locator('#inspBody .field').filter({ has: page.locator('label', { hasText: new RegExp(`^${label}$`) }) })
}
// Scoped, because the inspector's own selects carry options too.
const options = (page: Page) => page.locator('.relation-search [role=option]')
async function saved(page: Page, run: () => Promise<unknown>) {
  const response = page.waitForResponse(r => r.request().method() === 'PATCH')
  await run(); expect((await response).status()).toBe(200)
}

test('adds a dependency on a done ticket and sets a parent by keyboard alone', async ({ page, app }) => {
  const target = await app.create('Needs groundwork')
  let groundwork = await app.create('Groundwork finished')
  groundwork = await app.patch(groundwork, [{ op: 'setStatus', status: 'ready' },
    { op: 'setStatus', status: 'in-progress' }, { op: 'setStatus', status: 'done' }])
  const middle = await app.patch(await app.create('Waits on the target'), [{ op: 'addDependency', id: target.id }])
  // Depending on this would close a loop through three tickets.
  await app.patch(await app.create('Would close the loop'), [{ op: 'addDependency', id: middle.id }])
  const epic = await app.create('Parent epic')

  await page.goto(app.url)
  await page.locator(`.card[data-id="${target.id}"]`).click()
  await expect(page.locator('#inspector')).toHaveClass(/open/)

  const summary = page.locator('#inspBody summary', { hasText: /^Relationships/ })
  await summary.focus()
  await page.keyboard.press('Enter')
  await expect(field(page, 'Depends on')).toContainText("Add one below, or drag a card's right handle onto another")
  await page.keyboard.press('Tab')
  const setParent = page.getByRole('button', { name: 'Set parent…' })
  await expect(setParent).toBeFocused()
  await page.keyboard.press('Tab')
  const addDependency = page.getByRole('button', { name: 'Add dependency…' })
  await expect(addDependency).toBeFocused()

  await page.keyboard.press('Enter')
  const search = page.getByRole('combobox', { name: /to depend on/ })
  await expect(search).toBeFocused()
  await page.keyboard.type('Would close')
  await expect(options(page)).toHaveCount(0)
  await expect(page.locator('.relation-refused')).toHaveText('1 ticket is left out because linking would close a cycle')
  await page.keyboard.press('Control+A')
  await page.keyboard.type('Groundwork')
  const option = options(page)
  await expect(option).toHaveCount(1)
  await expect(option).toContainText('Groundwork finished')
  await expect(option).toContainText('done')
  await saved(page, () => page.keyboard.press('Enter'))
  await expect(field(page, 'Depends on')).toContainText('Groundwork finished')
  await expect(addDependency).toBeFocused()

  // Back past the new dependency's remove button to the parent control.
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(setParent).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('combobox', { name: /Find a parent/ })).toBeFocused()
  await page.keyboard.type('Parent epic')
  await expect(options(page)).toHaveCount(1)
  await saved(page, () => page.keyboard.press('Enter'))
  await expect(field(page, 'Parent')).toContainText('Parent epic')
  await expect(page.getByRole('button', { name: 'Change parent…' })).toBeFocused()
  await expect(page.locator('#inspector')).toHaveClass(/open/)

  // The fixture's ticket type leaves out parent, which only this spec reads.
  const stored = (await app.board()).tickets.find(t => t.id === target.id)! as { dependencies: string[]; parent?: string }
  expect(stored.dependencies).toEqual([groundwork.id])
  expect(stored.parent).toBe(epic.id)
})

test('relationship controls are disabled on a read-only board', async ({ page, app }) => {
  const target = await app.create('Read-only relationships')
  await app.create('Another ticket')
  await page.goto(await app.readOnlyURL())
  await page.locator(`.card[data-id="${target.id}"]`).click()
  await page.locator('#inspBody summary', { hasText: /^Relationships/ }).click()
  await expect(page.getByRole('button', { name: 'Add dependency…' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Set parent…' })).toBeDisabled()
  await expect(page.locator('.relation-search')).toHaveCount(0)
})
