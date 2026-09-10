import { test, expect } from './fixtures'

for (const colorScheme of ['light', 'dark'] as const) {
  test(`readability hierarchy, keyboard labels and fixed positions in ${colorScheme}`, async ({ page, app }, testInfo) => {
    await page.emulateMedia({ colorScheme })
    const parent = await app.create('Canvas readability', { x: 0, y: 400 })
    await app.patch(parent, [{ op: 'setType', type: 'epic' }])
    const dependency = await app.create('Revision-safe board snapshots', { x: 440, y: 0 })
    const selected = await app.create('Keep inspector drafts intact during board refresh', { x: 0, y: 0 })
    await app.patch(selected, [
      { op: 'setPriority', priority: 'high' }, { op: 'setDueOn', dueOn: '2000-01-01' },
      { op: 'addDependency', id: dependency.id }, { op: 'setParent', parent: parent.id },
      ...['ui', 'readability', 'live-updates', 'performance', 'quality-of-life'].map(label => ({ op: 'addLabel', label })),
      { op: 'addChecklistItem', section: 'ac', text: 'Preserve title drafts' },
      { op: 'addChecklistItem', section: 'ac', text: 'Preserve focus' },
      { op: 'setChecklistItem', section: 'ac', index: 1, checked: true },
    ])
    const done = await app.create('Display the running application version', { x: 440, y: 400 })
    await app.patch(done, [{ op: 'setStatus', status: 'ready' }, { op: 'setStatus', status: 'in-progress' }, { op: 'setStatus', status: 'done' }])
    await page.goto(app.url)
    const card = page.locator(`.card[data-id="${selected.id}"]`)
    await expect(page.locator('#relationshipMode')).toHaveValue('selected')
    await expect(page.locator('.relationship')).toHaveCount(0)
    await expect(card.locator('.card-progress')).toHaveText('AC 1/2')
    await expect(card.locator('.card-alerts')).toContainText('Blocked by 1')
    await expect(card.locator('.card-alerts')).toContainText('Overdue 2000-01-01')
    await expect(card.locator('.card-priority')).toHaveText('high priority')
    await expect(page.locator(`.card[data-id="${done.id}"] .progress`)).toHaveCount(0)
    await expect(page.locator(`.card[data-id="${done.id}"] .card-title`)).toHaveCSS('text-decoration-line', 'none')
    const before = await app.snapshot()
    const positions = await page.locator('.card').evaluateAll(cards => cards.map(card => (card as HTMLElement).style.transform))
    const more = card.getByRole('button', { name: 'Show all 5 labels' })
    await more.focus(); await more.press('Enter')
    await expect(more).toHaveAttribute('aria-expanded', 'true')
    await expect(card.locator('.card-label-disclosure')).toContainText('performance')
    await expect(page.locator('.card.selected')).toHaveCount(0)
    await more.press('Space'); await expect(more).toHaveAttribute('aria-expanded', 'false')
    await card.locator('.card-title').click()
    await expect(page.locator('#inspector')).toHaveCSS('transform', 'none')
    const panelBounds = (await page.locator('#inspector').boundingBox())!
    expect(panelBounds.x + panelBounds.width).toBeLessThanOrEqual(1440)
    await expect(page.locator('.relationship')).toHaveCount(2)
    await expect(page.locator(`[data-kind="dependency"][data-from="${selected.id}"][data-to="${dependency.id}"]`)).toHaveCount(1)
    await expect(page.locator(`[data-kind="parent"][data-from="${parent.id}"][data-to="${selected.id}"]`)).toHaveCount(1)
    for (const mode of ['none', 'all', 'selected']) await page.locator('#relationshipMode').selectOption(mode)
    await page.locator('#search').fill('snapshots')
    expect(await page.locator('.card').evaluateAll(cards => cards.map(card => (card as HTMLElement).style.transform))).toEqual(positions)
    await page.locator('#search').fill('')
    expect(await app.snapshot()).toEqual(before)
    await page.screenshot({ path: testInfo.outputPath(`readability-${colorScheme}.png`), fullPage: true })
  })
}

test('inspector resize preserves an active draft and Fit uses the available width', async ({ page, app }) => {
  const ticket = await app.create('A wrapping inspector title with enough words to occupy several lines', { x: 0, y: 0 })
  await page.goto(app.url)
  await page.locator('.card-title').click()
  const inspector = page.locator('#inspector'), title = page.locator('#fTitle')
  const handle = page.getByRole('separator', { name: 'Inspector width' })
  await expect(inspector).toHaveCSS('width', '400px')
  await expect(inspector).toHaveCSS('transform', 'none')
  await title.fill('Unsubmitted title during inspector resizing')
  const before = await app.snapshot()
  const bounds = (await handle.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 30)
  await page.mouse.down(); await page.mouse.move(bounds.x - 90, bounds.y + 30); await page.mouse.up()
  await expect(title).toBeFocused()
  await expect(title).toHaveValue('Unsubmitted title during inspector resizing')
  expect(await app.snapshot()).toEqual(before)
  await app.patch(ticket, [{ op: 'setPriority', priority: 'high' }])
  await expect(page.locator('.insp-state')).toContainText('high')
  await expect(title).toBeFocused()
  await expect(title).toHaveValue('Unsubmitted title during inspector resizing')
  // Reload discards this deliberately stale draft without submitting it.
  await page.reload(); await page.locator('.card-title').click()
  await handle.focus(); await handle.press('End')
  await expect(inspector).toHaveCSS('width', '560px')
  await page.locator('#btnFit').click()
  const card = (await page.locator('.card').boundingBox())!, panel = (await inspector.boundingBox())!
  expect(card.x + card.width).toBeLessThanOrEqual(panel.x)
  await handle.focus(); await handle.press('Home')
  await expect(inspector).toHaveCSS('width', '320px')
})

test('narrow inspector occupies a full-width row with reachable editors', async ({ page, app }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await app.create('A long title that must wrap within the narrow inspector rather than overflow')
  await page.goto(app.url)
  await page.locator('.card-title').click()
  const inspector = page.locator('#inspector')
  await expect(inspector).toBeVisible()
  await expect(inspector).toHaveCSS('transform', 'none')
  const panel = (await inspector.boundingBox())!, stage = (await page.locator('#stage').boundingBox())!
  expect(panel.width).toBe(390)
  expect(panel.y - stage.y).toBeGreaterThanOrEqual(150)
  expect(panel.y + panel.height).toBeLessThanOrEqual(845)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.locator('#btnFit').click()
  const card = (await page.locator('.card').boundingBox())!
  expect(card.y + card.height).toBeLessThanOrEqual(panel.y)
  await page.getByText('Edit status, priority, ownership and due date', { exact: true }).click()
  const priority = page.locator('.field').filter({ has: page.locator('label', { hasText: /^Priority$/ }) }).locator('select')
  await priority.selectOption('high')
  await expect(page.locator('.insp-state')).toContainText('high')
  await page.screenshot({ path: testInfo.outputPath('readability-narrow.png'), fullPage: true })
})

test('label disclosure never starts a drag or saves manual positions', async ({ page, app }) => {
  const ticket = await app.create('Automatic card')
  await app.patch(ticket, ['ui', 'readability', 'performance'].map(label => ({ op: 'addLabel', label })))
  await page.goto(app.url)
  const before = await app.snapshot()
  const button = page.locator('.label-more')
  await button.click()
  await expect(page.locator('.card-label-disclosure')).toBeVisible()
  await expect(page.locator('.card')).toHaveClass(/unpinned/)
  await expect(page.locator('.card.selected')).toHaveCount(0)
  expect(await app.snapshot()).toEqual(before)
})
