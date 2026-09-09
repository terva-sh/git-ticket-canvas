import { test, expect } from './fixtures'

test('failed layout save discards the drag preview without changing persisted data', async ({ page, app }) => {
  const ticket = await app.create('Placement refusal', { x: 0, y: 0 })
  await page.goto(app.url)
  const card = page.locator(`.card[data-id="${ticket.id}"]`)
  await expect(card).toBeVisible()
  const before = await card.getAttribute('style')
  await page.route('**/api/layout', route => route.fulfill({ status: 500, contentType: 'application/json',
    body: JSON.stringify({ code: 'layout_error', message: 'Test layout refusal' }) }))
  const box = (await card.boundingBox())!
  await page.mouse.move(box.x + 100, box.y + 30)
  await page.mouse.down()
  await page.mouse.move(box.x + 170, box.y + 75, { steps: 8 })
  await expect(card).not.toHaveAttribute('style', before!)
  await page.mouse.up()
  await expect(page.locator('#toast')).toContainText('Test layout refusal')
  await expect(card).toHaveAttribute('style', before!)
  expect((await app.board()).layout.cards[ticket.id]).toEqual({ x: 0, y: 0 })
})
