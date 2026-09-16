import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

const card = (page: Page, id: string) => page.locator(`.card[data-id="${id}"]`)
const chip = (page: Page, label: string) => page.locator(`.label-chip[data-label="${label}"]`)
const summary = (page: Page) => page.locator('#labelFilter > summary')
const counts = (page: Page) => page.locator('#counts')

test('label filters narrow the board and the count, with excludes winning', async ({ page, app }) => {
  const both = await app.create('Both labels', { x: 0, y: 0 })
  await app.patch(both, [{ op: 'addLabel', label: 'ui' }, { op: 'addLabel', label: 'canvas' }])
  const one = await app.create('One label', { x: 350, y: 0 })
  await app.patch(one, [{ op: 'addLabel', label: 'ui' }])
  const bare = await app.create('No labels', { x: 700, y: 0 })

  await page.goto(app.url)
  await expect(counts(page)).toHaveText('3 of 3')
  await summary(page).click()
  // The chips cover the labels the tickets carry, even though this store
  // enforces none and so configures none.
  await expect(page.locator('.label-chip')).toHaveCount(2)

  await chip(page, 'ui').click()
  await expect(counts(page)).toHaveText('2 of 3')
  await expect(card(page, bare.id)).toHaveClass(/dimmed/)
  await expect(card(page, one.id)).not.toHaveClass(/dimmed/)
  await expect(summary(page)).toHaveText('Labels: 1 in')

  // A second include intersects rather than widening.
  await chip(page, 'canvas').click()
  await expect(counts(page)).toHaveText('1 of 3')
  await expect(card(page, both.id)).not.toHaveClass(/dimmed/)
  await expect(card(page, one.id)).toHaveClass(/dimmed/)

  // Cycling canvas again excludes it, which beats the ui include the card also
  // satisfies. The count stays at one, but it is now a different card.
  await chip(page, 'canvas').click()
  await expect(chip(page, 'canvas')).toHaveAttribute('data-state', 'exclude')
  await expect(counts(page)).toHaveText('1 of 3')
  await expect(card(page, both.id)).toHaveClass(/dimmed/)
  await expect(card(page, one.id)).not.toHaveClass(/dimmed/)
  await expect(summary(page)).toHaveText('Labels: 1 in, 1 out')

  await page.locator('#clearLabelFilters').click()
  await expect(counts(page)).toHaveText('3 of 3')
  await expect(summary(page)).toHaveText('Labels')
  await expect(page.locator('.card.dimmed')).toHaveCount(0)
})

test('label filters and status filters narrow together', async ({ page, app }) => {
  const promoted = await app.create('Promoted', { x: 0, y: 0 })
  await app.patch(promoted, [{ op: 'addLabel', label: 'ui' }, { op: 'setStatus', status: 'ready' }])
  const draft = await app.create('Still draft', { x: 350, y: 0 })
  await app.patch(draft, [{ op: 'addLabel', label: 'ui' }])

  await page.goto(app.url)
  await summary(page).click()
  await chip(page, 'ui').click()
  await expect(counts(page)).toHaveText('2 of 2')

  await page.locator('#statusFilters button', { hasText: 'draft' }).click()
  await expect(counts(page)).toHaveText('1 of 2')
  await expect(card(page, promoted.id)).toHaveClass(/dimmed/)
  await expect(card(page, draft.id)).not.toHaveClass(/dimmed/)

  // The label exclude and the status include are an AND, so nothing survives.
  await chip(page, 'ui').click()
  await expect(chip(page, 'ui')).toHaveAttribute('data-state', 'exclude')
  await expect(counts(page)).toHaveText('0 of 2')
  await expect(page.locator('.card.dimmed')).toHaveCount(2)
})

// The bug this guards: `dimmed` is only a class, and three appearance rules set
// opacity on a card at the same specificity it does. When the dimmed rule sat
// above them in the stylesheet, a filtered-out card that was done, archived or
// blocked kept its own opacity and stayed on the board. Every assertion above
// still passed, because the class was there — it just did nothing. So this asks
// the browser what it actually painted.
test('a filtered-out card recedes whatever its status looks like', async ({ page, app }) => {
  const settled = await app.create('Finished work', { x: 0, y: 0 })
  await app.patch(settled, [{ op: 'setStatus', status: 'done', reason: 'finished' }])
  const stuck = await app.create('Waiting on something', { x: 350, y: 0 })
  await app.patch(stuck, [{ op: 'setStatus', status: 'ready' }, { op: 'setStatus', status: 'blocked', reason: 'waiting' }])
  const plain = await app.create('Ordinary', { x: 700, y: 0 })
  await app.patch(plain, [{ op: 'addLabel', label: 'ui' }])

  await page.goto(app.url)
  await summary(page).click()
  // Requires `ui`, which only the ordinary card carries, so the other two go.
  await chip(page, 'ui').click()
  await expect(counts(page)).toHaveText('1 of 3')

  const opacity = (id: string) => card(page, id).evaluate(node => getComputedStyle(node).opacity)
  expect(Number(await opacity(settled.id))).toBeCloseTo(0.18, 2)
  expect(Number(await opacity(stuck.id))).toBeCloseTo(0.18, 2)
  expect(Number(await opacity(plain.id))).toBe(1)

  // Hover sets opacity a specificity step above dimming, so it gets asked too.
  // Moving the mouse rather than calling `hover()` keeps this off Playwright's
  // actionability path, which depends on where the board laid the card out and
  // on what else is on top of it. Whether the hover landed is then asserted
  // rather than assumed, so a miss reports itself instead of passing for the
  // wrong reason: not hovering would also leave the card at .18.
  const box = (await card(page, settled.id).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  expect(await card(page, settled.id).evaluate(node => node.matches(':hover')),
    'the mouse did not land on the card, so the hover assertion would prove nothing').toBe(true)
  expect(Number(await opacity(settled.id))).toBeCloseTo(0.18, 2)
})
