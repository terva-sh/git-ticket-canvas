import { test, expect } from './fixtures'
// @ts-expect-error one JavaScript module serves the specs and the capture script
import {
  SCENE, SHOT, assertStableChrome, loadScene, selectReference, stubBuildIdentity,
} from './canvas-scene.mjs'
import type { Page } from '@playwright/test'

// The dense scene is captured at the reference viewport, not the suite default.
test.use({
  viewport: SCENE.viewport,
  colorScheme: SCENE.colorScheme,
  deviceScaleFactor: SCENE.deviceScaleFactor,
})

interface Edge { from: string; to: string; kind: string }

async function renderedEdges(page: Page): Promise<Edge[]> {
  return page.evaluate(() => [...document.querySelectorAll('#edges .relationship')]
    .map(edge => ({
      from: (edge as HTMLElement).dataset.from!,
      to: (edge as HTMLElement).dataset.to!,
      kind: (edge as HTMLElement).dataset.kind!,
    })))
}

function countKinds(edges: Edge[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const edge of edges) counts[edge.kind] = (counts[edge.kind] || 0) + 1
  return counts
}

/**
 * A point on an edge's hit path where that path is the topmost element. Cards
 * render after the edge layer and sit over it, so an edge's midpoint is often
 * covered, and hovering it would land on a card instead. Walking the path and
 * asking `elementFromPoint` also proves an edge is pointable at all in a scene
 * this dense, which is the thing the hover behaviour depends on.
 */
async function exposedEdgePoint(page: Page, selector: string) {
  return page.evaluate(query => {
    for (const path of [...document.querySelectorAll(query)] as SVGPathElement[]) {
      const length = path.getTotalLength()
      const ctm = path.getScreenCTM()
      if (!length || !ctm) continue
      for (let step = 1; step < 20; step++) {
        const point = path.getPointAtLength(length * step / 20).matrixTransform(ctm)
        if (document.elementFromPoint(point.x, point.y) !== path) continue
        const owner = path.closest('.relationship') as SVGGElement
        return { x: point.x, y: point.y, from: owner.dataset.from!, to: owner.dataset.to! }
      }
    }
    return null
  }, selector)
}

test.describe('dense canvas scene', () => {
  test('renders the reference scene, card for card and edge for edge', async ({ dense, page }) => {
    await stubBuildIdentity(page)
    const { board, cardCount, geometry } = await loadScene(page, dense.url)

    expect(await page.locator('#boardSelect').inputValue()).toBe(SCENE.board)
    expect(await page.locator('#relationshipMode').inputValue()).toBe(SCENE.relationshipMode)
    expect(cardCount, 'rendered cards').toBe(SCENE.expectedCards)
    expect(board.tickets.length, 'tickets the server served').toBe(SCENE.expectedCards)

    // Assert the edge counts against the store as well as against the recorded
    // numbers. A rendering change that drops edges then fails, and so does a
    // fixture swap that quietly changes what the scene is supposed to show.
    const edges = await renderedEdges(page)
    const dependencyLinks = board.tickets
      .reduce((total: number, ticket: { dependencies?: string[] }) => total + (ticket.dependencies?.length || 0), 0)
    const parentLinks = board.tickets.filter((ticket: { parent?: string }) => ticket.parent).length
    expect(edges.length, 'rendered relationships').toBe(SCENE.expectedRelationships)
    expect(countKinds(edges), 'relationships by kind').toEqual(SCENE.expectedEdgeKinds)
    expect(countKinds(edges).dependency, 'one edge per dependency link in the store').toBe(dependencyLinks)
    expect(countKinds(edges).parent, 'one edge per child ticket in the store').toBe(parentLinks)

    // The dense right-side cluster, as counts. This is the clutter the child
    // tickets exist to reduce, so it is the number they will change on purpose.
    const midpoint = SCENE.viewport.width / 2
    const rightHalf = new Set(geometry
      .filter(([, x]: [string, number]) => x > midpoint)
      .map(([id]: [string]) => id))
    expect(rightHalf.size, 'cards past the horizontal midpoint').toBe(SCENE.rightHalf.cards)
    expect(edges.filter(edge => rightHalf.has(edge.from) || rightHalf.has(edge.to)).length,
      'relationships landing on a right-half card').toBe(SCENE.rightHalf.edgesTouching)

    // The card width arrives as a custom property rather than a stylesheet
    // declaration, so assert the width the cards actually took. Read it as
    // `offsetWidth`, which is scene space. The widths in `geometry` come from
    // `getBoundingClientRect`, and `#scene` carries `scale(view.k)`, so those
    // are the fitted viewport widths: 165 rather than 280 at this viewport.
    const widths = await page.evaluate(() => [...new Set([...document.querySelectorAll('#cards .card')]
      .map(card => (card as HTMLElement).offsetWidth))])
    expect(widths, 'the width every card took').toEqual([SCENE.cardWidth])

    await selectReference(page)
    await expect(page.locator('#inspector')).toHaveClass(/open/)
    expect(await page.locator('#fTitle').inputValue(), 'inspector title').toBe(SCENE.selectedTitle)
    await expect(page.locator(`.card[data-id="${SCENE.selectedTicket}"]`)).toHaveClass(/selected/)

    // Full card presentation, which the compact-card ticket will change.
    const rows = await page.locator(`.card[data-id="${SCENE.selectedTicket}"]`)
      .evaluate(card => [...card.querySelectorAll('[class]')]
        .map(node => node.getAttribute('class'))
        .filter((name): name is string => !!name && name.startsWith('card-')))
    expect(rows, 'metadata rows on the selected card').toEqual(SCENE.cardMetadataRows)

    // Last, because it is the assertion most likely to be made obsolete by a
    // toolbar change, and the ones above say more about what broke.
    await assertStableChrome(page)
  })

  test('compact narrows cards, moves none of them, and keeps edges anchored', async ({ dense, page }) => {
    await loadScene(page, dense.url)

    // Cards carry their scene position as `translate(x, y)`, and edge paths are
    // in the same space, so one pass can compare an anchor with a card edge.
    // Reading card boxes with `getBoundingClientRect` instead would mix in the
    // scene's `scale(view.k)` and compare two different coordinate systems.
    const survey = () => page.evaluate(() => {
      const cards = new Map<string, { x: number; y: number; w: number }>()
      for (const node of document.querySelectorAll('#cards .card')) {
        const card = node as HTMLElement
        const at = card.style.transform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/)!
        cards.set(card.dataset.id!, { x: Number(at[1]), y: Number(at[2]), w: card.offsetWidth })
      }
      // An anchor sits on the source card's left edge, right edge or horizontal
      // centre, depending on how the edge routes. Anything else means the edge
      // layer and the rendered card disagree about how wide a card is.
      const detached: string[] = []
      for (const node of document.querySelectorAll('#edges .relationship')) {
        const group = node as SVGGElement
        const d = group.querySelector('path:not(.edge-hit)')!.getAttribute('d')!
        const anchor = Number(d.match(/^M(-?[\d.]+),/)![1])
        const card = cards.get(group.dataset.from!)!
        const edges = [card.x, card.x + card.w / 2, card.x + card.w]
        if (!edges.some(value => Math.abs(value - anchor) < 0.5)) {
          detached.push(`${group.dataset.from} to ${group.dataset.to}: anchor ${anchor}, `
            + `card edges ${edges.join(' ')}`)
        }
      }
      return {
        positions: Object.fromEntries([...cards].map(([id, box]) => [id, `${box.x},${box.y}`])),
        widths: [...new Set([...cards.values()].map(box => box.w))],
        detached,
      }
    })

    const full = await survey()
    expect(full.widths, 'card widths at full density').toEqual([SCENE.cardWidth])
    expect(full.detached, 'full-density edges anchored off a card').toEqual([])

    await page.locator('#cardDensity').selectOption('compact')
    await expect.poll(() => page.locator('#cards .card').first()
      .evaluate(card => (card as HTMLElement).offsetWidth)).toBe(SCENE.compactCardWidth)
    const compact = await survey()

    expect(compact.widths, 'card widths at compact density').toEqual([SCENE.compactCardWidth])
    // The ruling this slice implements: a density change re-derives nothing, so
    // every card stays exactly where it was and compact only opens space.
    expect(compact.positions, 'card positions after the toggle').toEqual(full.positions)
    expect(compact.detached, 'compact edges anchored off a card').toEqual([])
    expect(await page.locator('#edges .relationship').count(),
      'relationships still drawn in compact').toBe(SCENE.expectedRelationships)

    // Back to full, because the control has to be reversible to be a setting.
    await page.locator('#cardDensity').selectOption('full')
    await expect.poll(() => page.locator('#cards .card').first()
      .evaluate(card => (card as HTMLElement).offsetWidth)).toBe(SCENE.cardWidth)
    expect((await survey()).positions, 'card positions back at full density').toEqual(full.positions)
  })

  test('compact trims every card to what a board is scanned by', async ({ dense, page }) => {
    await loadScene(page, dense.url)

    const boxes = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#cards .card')]
      .map(node => [(node as HTMLElement).dataset.id!,
        { w: (node as HTMLElement).offsetWidth, h: (node as HTMLElement).offsetHeight }])))
    const rows = () => page.evaluate(id => [...document.querySelector(`.card[data-id="${id}"]`)!
      .querySelectorAll('[class]')]
      .map(node => node.getAttribute('class'))
      .filter((name): name is string => !!name && name.startsWith('card-')), SCENE.selectedTicket)
    const ink = (cards: Record<string, { w: number; h: number }>) =>
      Object.values(cards).reduce((total, box) => total + box.w * box.h, 0)

    const full = await boxes()
    expect(await rows(), 'rows on the reference card at full density').toEqual(SCENE.cardMetadataRows)

    await page.locator('#cardDensity').selectOption('compact')
    await expect.poll(() => page.locator('#cards .card').first()
      .evaluate(card => (card as HTMLElement).offsetWidth)).toBe(SCENE.compactCardWidth)
    const compact = await boxes()

    expect(await rows(), 'rows on the reference card at compact density')
      .toEqual(SCENE.compactCardMetadataRows)

    // Narrower is not the claim. A narrower card that wraps its way back to the
    // same height has bought nothing, so assert that no card grew and that the
    // board as a whole spends meaningfully less area. Measured on this scene:
    // median height 226 to 201, shortest 204 to 160, and an area ratio of 0.55.
    // The threshold sits well above that, because CI renders with other fonts.
    const taller = Object.entries(compact).filter(([id, box]) => box.h > full[id].h)
    expect(taller, 'cards that grew in compact').toEqual([])
    expect(ink(compact) / ink(full), 'compact card area against full').toBeLessThan(0.7)

    // Selection and the link target are states the ticket names, and both are
    // classes on a card that compact restyles, so drive them rather than
    // assuming the rules still apply. Two cards on the left, clear of the
    // inspector, which opens over the right side on selection.
    const pair = await page.evaluate(() => [...document.querySelectorAll('#cards .card')]
      .filter(card => card.getBoundingClientRect().right < 800)
      .slice(0, 2).map(card => (card as HTMLElement).dataset.id!))
    expect(pair, 'two left-hand cards to link between').toHaveLength(2)
    const source = page.locator(`.card[data-id="${pair[0]}"]`)
    const target = page.locator(`.card[data-id="${pair[1]}"]`)
    await source.click()
    await expect(source, 'selected state in compact').toHaveClass(/selected/)

    const handle = (await source.locator('.handle').boundingBox())!
    const drop = (await target.boundingBox())!
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(drop.x + drop.width / 2, drop.y + drop.height / 2, { steps: 8 })
    await expect(target, 'link-target state in compact').toHaveClass(/link-target/)
    // Release on empty canvas, so the gesture ends without writing a dependency.
    await page.mouse.move(40, SCENE.viewport.height - 60, { steps: 8 })
    await page.mouse.up()
    await expect(target).not.toHaveClass(/link-target/)
    expect(await page.locator('#edges .relationship').count(),
      'the cancelled link wrote no dependency').toBe(SCENE.expectedRelationships)

    // The label disclosure has to stay an overlay. It sits under a card that is
    // 100px narrower now, and a popover that pushed the rows below it down
    // would undo the height this mode just bought.
    const crowded = await page.evaluate(() => (document.querySelector('#cards .card:has(.label-more)') as HTMLElement)?.dataset.id ?? null)
    expect(crowded, 'a compact card with more labels than it shows').not.toBeNull()
    const card = page.locator(`.card[data-id="${crowded}"]`)
    const before = await card.evaluate(node => (node as HTMLElement).offsetHeight)
    await card.locator('.label-more').click()
    await expect(card.locator('.card-label-disclosure')).toBeVisible()
    expect(await card.evaluate(node => (node as HTMLElement).offsetHeight),
      'card height with the disclosure open').toBe(before)
  })

  test('names one relationship at a time, by selection and by hover', async ({ dense, page }) => {
    await stubBuildIdentity(page)
    await loadScene(page, dense.url)

    // Forty-one edges and not one label, which is the clutter this removed.
    await expect(page.locator('#edges .relationship')).toHaveCount(SCENE.expectedRelationships)
    await expect(page.locator('#edges .edge-label')).toHaveCount(0)
    await expect(page.locator('#edges .relationship.faded')).toHaveCount(0)

    await selectReference(page)
    const touching = await page.locator(`#edges .relationship[data-from="${SCENE.selectedTicket}"], `
      + `#edges .relationship[data-to="${SCENE.selectedTicket}"]`).count()
    expect(touching, 'the reference ticket has relationships to name').toBeGreaterThan(0)
    await expect(page.locator('#edges .relationship[data-emphasised=true]')).toHaveCount(touching)
    await expect(page.locator('#edges .edge-label')).toHaveCount(touching)
    // The rest fade rather than disappear.
    await expect(page.locator('#edges .relationship.faded'))
      .toHaveCount(SCENE.expectedRelationships - touching)

    // Hover a real point on a faded edge, which also proves the transparent hit
    // path receives pointer events through `#edges { pointer-events: none }`.
    const point = await exposedEdgePoint(page, '#edges .relationship.faded .edge-hit')
    expect(point, 'a faded edge with a point no card covers').not.toBeNull()
    await page.mouse.move(point!.x, point!.y)
    const emphasised = page.locator('#edges .relationship[data-emphasised=true]')
    await expect(emphasised).toHaveCount(1)
    await expect(emphasised).toHaveAttribute('data-from', point!.from)
    await expect(page.locator('#edges .edge-label')).toHaveCount(1)
  })

  test('an edge does not swallow the canvas pan', async ({ dense, page }) => {
    await stubBuildIdentity(page)
    await loadScene(page, dense.url)
    // Enabling pointer events on edges could have stolen pointerdown from the
    // stage. canvasTarget accepts anything inside #scene, so a press on an edge
    // should still start a pan. Measure it rather than trust the reading.
    const point = await exposedEdgePoint(page, '#edges .relationship .edge-hit')
    expect(point, 'an edge with a point no card covers').not.toBeNull()
    const transform = () => page.locator('#scene').evaluate(node => node.style.transform)
    const before = await transform()
    await page.mouse.move(point!.x, point!.y)
    await page.mouse.down()
    await page.mouse.move(point!.x + 120, point!.y + 60, { steps: 4 })
    await page.mouse.up()
    expect(await transform(), 'pressing an edge still pans the canvas').not.toBe(before)
  })

  test('selected and none modes still focus and hide', async ({ dense, page }) => {
    await stubBuildIdentity(page)
    await loadScene(page, dense.url)
    await selectReference(page)
    const touching = await page.locator(`#edges .relationship[data-from="${SCENE.selectedTicket}"], `
      + `#edges .relationship[data-to="${SCENE.selectedTicket}"]`).count()

    await page.locator('#relationshipMode').selectOption('selected')
    // Selected renders the selection's edges only, and every one of them is
    // emphasised, so nothing fades and the mode keeps its meaning.
    await expect(page.locator('#edges .relationship')).toHaveCount(touching)
    await expect(page.locator('#edges .relationship.faded')).toHaveCount(0)
    await expect(page.locator('#edges .edge-label')).toHaveCount(touching)

    await page.locator('#relationshipMode').selectOption('none')
    await expect(page.locator('#edges .relationship')).toHaveCount(0)
    await expect(page.locator('#edges .edge-label')).toHaveCount(0)
  })

  test('matches the committed visual baseline', async ({ dense, page }) => {
    test.skip(!process.env.CANVAS_VISUAL, 'Set CANVAS_VISUAL=1 to compare pixels. '
      + 'CI runs Alpine Chromium with font-noto while a developer machine runs Playwright\'s '
      + 'Chromium, and the two render text differently, so the pixel gate is local and opt-in. '
      + 'The structural test above runs everywhere.')
    await stubBuildIdentity(page)
    const { cardCount } = await loadScene(page, dense.url)
    // Fail on a missing card here too, so the image comparison is not the thing
    // that reports a structural break with a picture.
    expect(cardCount, 'rendered cards').toBe(SCENE.expectedCards)
    await selectReference(page)
    await assertStableChrome(page)
    // `snapshotPathTemplate` resolves this name to the reviewed artifact, so the
    // gate compares against the image a person actually looked at. Regenerate it
    // with `npm run capture:canvas-baseline`, not with `--update-snapshots`,
    // which writes the PNG and leaves the metadata beside it stale.
    await expect(page).toHaveScreenshot('canvas-baseline.png', SHOT)
  })
})
