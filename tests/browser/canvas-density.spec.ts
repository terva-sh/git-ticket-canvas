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
