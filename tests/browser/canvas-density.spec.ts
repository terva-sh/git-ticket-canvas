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
