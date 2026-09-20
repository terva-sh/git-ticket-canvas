import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

function card(page: Page, id: string) { return page.locator(`.card[data-id="${id}"]`) }
const section = (page: Page) => page.locator('#inspBody .placement')
const control = (page: Page) => page.locator('#inspBody button[data-return-automatic]')

/** A board with one pen and an inbox just below it, both on screen at 1:1, in
 * the file git ticket canvas writes. */
async function rules(root: string, cards: Record<string, { x: number; y: number }>) {
  const dir = join(root, '.tickets', 'canvas')
  await mkdir(dir, { recursive: true })
  const lines = Object.entries(cards).map(([id, c]) => `  "${id}": {x: ${c.x}, y: ${c.y}}`)
  await writeFile(join(dir, 'default.yml'), [
    'schema: 4', 'board: "default"', `cards:${lines.length ? '\n' + lines.join('\n') : ' {}'}`, 'frames: {}',
    'pens:', '  "ui":', '    title: "Interface"', '    x: 0', '    y: 0', '    w: 1000', '    h: 300', '    color: "#759bcc"',
    '    pin: {x: 0, y: 0}', '    match:', '      labels: [ui]',
    'ruleOrder: [ui]', 'inbox: {x: 0, y: 450}', '',
  ].join('\n'))
}

// The inspector says what the resolver decided, in the words `git ticket
// canvas explain` prints, and the one control hands a pinned card back.
test('the inspector explains placement and returns a pinned card to the rules', async ({ page, app }) => {
  const routed = await app.create('Routed by the rules')
  await app.patch(routed, [{ op: 'addLabel', label: 'ui' }])
  const stray = await app.create('Caught by the inbox')
  const held = await app.create('Placed by hand')
  await app.patch(held, [{ op: 'addLabel', label: 'ui' }])
  await rules(app.root, { [held.id]: { x: 900, y: 900 } })
  await page.goto(app.url)

  await card(page, routed.id).click()
  await expect(section(page)).toContainText('automatic: the canvas places it by the rules below')
  await expect(section(page)).toContainText('goes to pen ui (Interface): labels ui')
  await expect(control(page)).toBeDisabled()

  await card(page, stray.id).click()
  await expect(section(page)).toContainText('goes to the inbox (0, 450): no rule matched')
  await expect(section(page)).toContainText('not ui (rule 1): missing labels ui')

  await card(page, held.id).click()
  await expect(section(page)).toContainText('pinned at (900, 900); routing does not apply')
  await expect(control(page)).toBeEnabled()
  await control(page).click()
  await expect.poll(async () => (await app.board()).layout.cards[held.id]).toBeUndefined()
  await expect(card(page, held.id)).toHaveClass(/unpinned/)
  await expect(section(page)).toContainText('automatic: the canvas places it by the rules below')
  await expect(control(page)).toBeDisabled()
})

// A refused removal leaves the card where it was and says why. The board is
// made stale under the browser by an outside write to the same file.
test('a refused return keeps the card pinned and reports the reason', async ({ page, app }) => {
  const held = await app.create('Placed by hand')
  await rules(app.root, { [held.id]: { x: 900, y: 900 } })
  await page.goto(app.url)
  await card(page, held.id).click()
  await expect(control(page)).toBeEnabled()
  // Make the write fail: the store becomes read-only on disk.
  await app.restart(async () => { await writeFile(join(app.root, '.tickets', 'canvas', 'default.yml'), 'schema: 4\nboard: "default"\ncards: {\n', { mode: 0o444 }) })
  await control(page).click()
  await expect(page.locator('#toast')).toContainText('Could not save board default')
  await expect(card(page, held.id)).not.toHaveClass(/unpinned/)
})

// A read-only canvas shows the same explanation with the control off.
test('a read-only canvas explains placement and refuses to change it', async ({ page, app }) => {
  const held = await app.create('Placed by hand')
  await app.patch(held, [{ op: 'addLabel', label: 'ui' }])
  await rules(app.root, { [held.id]: { x: 900, y: 900 } })
  const before = await app.snapshot()
  await page.goto(await app.readOnlyURL())
  await expect(page.locator('#roBadge')).toBeVisible()
  await card(page, held.id).click()
  await expect(section(page)).toContainText('pinned at (900, 900); routing does not apply')
  await expect(section(page)).toContainText('goes to pen ui (Interface): labels ui')
  await expect(section(page)).toContainText('Read-only. Placement cannot be changed.')
  await expect(control(page)).toBeDisabled()
  expect(await app.snapshot()).toEqual(before)
})
