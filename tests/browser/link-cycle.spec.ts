import type { Page } from '@playwright/test'
import { test, expect, type Ticket } from './fixtures'
import { tablet, touchSteps, type Point } from './touch'

// A link drag that would close a dependency cycle. The store accepts any loop
// longer than a self-reference and only `git ticket check` reports it later, so
// the canvas refuses it: the card shows the refusal while the link is over it,
// and the drop writes nothing and names the tickets in the loop.
//
// Every test builds the same chain, C waits on B and B waits on A, and drags
// from C's handle onto A. The drop would make A wait on C, so A, C and B would
// each wait on the next.

const card = (page: Page, id: string) => page.locator(`.card[data-id="${id}"]`)

/** Every request that could have written something. */
function writes(page: Page) {
  const seen: string[] = []
  page.on('request', request => { if (request.method() !== 'GET') seen.push(`${request.method()} ${request.url()}`) })
  return seen
}

/** The part of the `app` fixture these tests use. */
interface App {
  create(title: string, card?: Point): Promise<Ticket>
  patch(ticket: Ticket, ops: object[]): Promise<Ticket>
  board(): Promise<{ tickets: Ticket[] }>
}

/** The refusal names tickets by short ID, which is the shortest prefix unique
 * in the store. It grows as tickets are filed, so each is read from the board
 * once the whole board exists rather than kept from when it was created. */
async function shorts(app: App) {
  const board = await app.board() as { tickets: (Ticket & { short: string })[] }
  return (ticket: Ticket) => {
    const short = board.tickets.find(t => t.id === ticket.id)?.short
    if (!short) throw new Error(`no short ID for ${ticket.id}`)
    return short
  }
}

async function chain(app: App) {
  const a = await app.create('First', { x: 0, y: 0 })
  const b = await app.create('Second', { x: 350, y: 0 })
  const c = await app.create('Third', { x: 700, y: 0 })
  await app.patch(b, [{ op: 'addDependency', id: a.id }])
  await app.patch(c, [{ op: 'addDependency', id: b.id }])
  return { a, b, c }
}

/** What the refusal says for the chain: A would wait on C, which waits on B,
 * which waits on A. */
async function cycleText(app: App, { a, b, c }: { a: Ticket; b: Ticket; c: Ticket }) {
  const name = await shorts(app)
  return `${name(a)} waits on ${name(c)}, ${name(c)} waits on ${name(b)}, ${name(b)} waits on ${name(a)}.`
}

async function dependencies(app: App, id: string) {
  return (await app.board()).tickets.find(ticket => ticket.id === id)?.dependencies
}

const centre = (box: { x: number; y: number; width: number; height: number }): Point =>
  ({ x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) })

test('a link drag that would close a cycle is refused while hovering and on the drop', async ({ page, app }) => {
  const { a, b, c } = await chain(app)
  // A card that closes nothing, to show the refusal is about the cycle and
  // not about every card.
  const d = await app.create('Unrelated', { x: 350, y: 300 })
  const named = await cycleText(app, { a, b, c })
  await page.goto(app.url)
  await expect(card(page, a.id)).toBeVisible()
  const sent = writes(page)

  const handle = centre((await card(page, c.id).locator('.handle').boundingBox())!)
  await page.mouse.move(handle.x, handle.y)
  await page.mouse.down()
  const free = (await card(page, d.id).boundingBox())!
  await page.mouse.move(free.x + 60, free.y + 20, { steps: 8 })
  await expect(card(page, d.id)).toHaveClass(/link-target/)
  await expect(card(page, d.id)).not.toHaveClass(/link-refused/)
  await expect(page.locator('#stage')).not.toHaveClass(/link-refused/)

  const closing = (await card(page, a.id).boundingBox())!
  await page.mouse.move(closing.x + 60, closing.y + 20, { steps: 8 })
  await expect(card(page, a.id)).toHaveClass(/link-refused/)
  await expect(card(page, a.id)).not.toHaveClass(/link-target/)
  await expect(page.locator('#stage')).toHaveClass(/link-refused/)
  await expect(page.locator('#ghost')).toHaveClass('refused')
  await page.mouse.up()

  const toast = page.locator('#toast')
  await expect(toast).toHaveClass(/err/)
  await expect(toast).toContainText('would close a cycle')
  await expect(toast).toContainText(named)
  await expect(card(page, a.id)).not.toHaveClass(/link-refused/)
  expect(sent).toEqual([])
  expect(await dependencies(app, a.id)).toEqual([])
})

test.describe('tablet', () => {
  test.use(tablet)

  test('a touch link drag that would close a cycle is refused and names it', async ({ page, app }) => {
    const { a, b, c } = await chain(app)
    const named = await cycleText(app, { a, b, c })
    await page.goto(app.url)
    await expect(card(page, a.id)).toBeVisible()
    // touchSteps runs the whole drag in one call, so the refusal shown while
    // the finger is over the card is recorded by the page as it happens.
    await page.evaluate(() => {
      const seen = { refused: false }
      ;(window as unknown as { refusedSeen: typeof seen }).refusedSeen = seen
      new MutationObserver(() => {
        if (document.querySelector('.card.link-refused')) seen.refused = true
      }).observe(document.getElementById('cards')!, { subtree: true, attributes: true, attributeFilter: ['class'] })
    })
    const sent = writes(page)

    const at = centre((await card(page, c.id).locator('.handle').boundingBox())!)
    const target = (await card(page, a.id).boundingBox())!
    const over = { x: Math.round(target.x + 60), y: Math.round(target.y + 20) }
    await touchSteps(page, [
      [at],
      [{ x: Math.round((at.x + over.x) / 2), y: Math.round((at.y + over.y) / 2) }],
      [over],
      [over],
    ])

    expect(await page.evaluate(() => (window as unknown as { refusedSeen: { refused: boolean } }).refusedSeen.refused)).toBe(true)
    const toast = page.locator('#toast')
    await expect(toast).toHaveClass(/err/)
    await expect(toast).toContainText(named)
    expect(sent).toEqual([])
    expect(await dependencies(app, a.id)).toEqual([])
  })
})
