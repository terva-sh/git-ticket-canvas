import { test, expect } from './fixtures'
// @ts-expect-error one JavaScript module serves the specs and the capture script
import { SCENE, loadScene } from './canvas-scene.mjs'
import type { Page } from '@playwright/test'

// The same viewport the rest of the dense-scene work measures at. Crossings are
// a property of where cards landed, and cards land differently at another size.
test.use({
  viewport: SCENE.viewport,
  colorScheme: SCENE.colorScheme,
  deviceScaleFactor: SCENE.deviceScaleFactor,
})

/**
 * What the reference scene measured before any anti-crossing work. Two kinds of
 * number live here. The exact ones are structural: they come from the fixture
 * and from geometry constants, so they hold on any machine. The `max` ones are
 * upper bounds, because a crossing count depends on card heights, card heights
 * come from wrapped text, and CI renders Alpine Chromium with font-noto while a
 * developer machine renders Playwright's Chromium. `canvas-arrange.spec.ts`
 * draws the same line for the same reason.
 *
 * The bounds carry roughly a quarter of headroom over the local measurement.
 * That is loose enough to survive a font and tight enough that a change which
 * makes the board worse fails here rather than in review.
 */
const CROSSINGS = {
  // Measured on 2026-09-12 at 72d8964, before the anchor spread.
  measured: {
    points: 26,
    pairs: 23,
    edgesInvolved: 16,
    inRightCluster: 25,
    edgesOverCards: 6,
    edgeCardOverlaps: 14,
    // Crossings per edge, as counts of edges: [0, 1, 2, 3 or more].
    distribution: [25, 4, 2, 10],
  },
  max: {
    points: 32,
    edgesInvolved: 20,
    edgesOverCards: 8,
    edgeCardOverlaps: 18,
  },
}

/** How finely each rendered path is walked. */
const SAMPLES = 160
/** Two intersections closer than this are one visual crossing. */
const CLUSTER_RADIUS = 3
/** Intersections this close to a shared endpoint are the anchor, not a crossing. */
const ANCHOR_RADIUS = 4

interface Box { id: string; x: number; y: number; w: number; h: number }
interface Sample { from: string; to: string; points: [number, number][] }
interface Scene { edges: Sample[]; cards: Box[]; rightHalf: string[] }

/**
 * Sample every relationship path in scene space, along with the card boxes and
 * which cards sit in the dense right cluster.
 *
 * Sample the rendered path rather than the straight line between two anchors.
 * `curve()` offsets its control points by `max(40, |dx| * 0.45)`, so a bezier
 * bulges well clear of the chord, and two edges that miss as straight lines can
 * still cross as drawn. Straight-line counting is the measurement that would
 * have said this board was fine.
 *
 * Everything here is scene space. A path's own coordinates already are, and a
 * card's `translate(x, y)` with `offsetWidth` is the same space. Reading card
 * boxes with `getBoundingClientRect` instead would mix in `scale(view.k)` from
 * `#scene` and compare two coordinate systems. The one exception is the right
 * cluster, which uses client space on purpose so it means the same thing as
 * `SCENE.rightHalf` in `canvas-density.spec.ts`.
 */
async function sampleScene(page: Page, samples: number): Promise<Scene> {
  return page.evaluate((steps) => {
    const cards = [...document.querySelectorAll('#cards .card')].map(node => {
      const card = node as HTMLElement
      const at = card.style.transform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/)!
      return {
        id: card.dataset.id!,
        x: Number(at[1]),
        y: Number(at[2]),
        w: card.offsetWidth,
        h: card.offsetHeight,
      }
    })
    const midpoint = window.innerWidth / 2
    const rightHalf = [...document.querySelectorAll('#cards .card')]
      .filter(card => card.getBoundingClientRect().x > midpoint)
      .map(card => (card as HTMLElement).dataset.id!)

    const edges = [...document.querySelectorAll('#edges g.relationship')].map(node => {
      const group = node as SVGGElement
      const path = group.querySelector('path:not(.edge-hit)') as SVGPathElement
      const length = path.getTotalLength()
      const points: [number, number][] = []
      for (let step = 0; step <= steps; step++) {
        const point = path.getPointAtLength(length * step / steps)
        points.push([point.x, point.y])
      }
      return { from: group.dataset.from!, to: group.dataset.to!, points }
    })
    return { edges, cards, rightHalf }
  }, samples)
}

/** Where two segments meet, or null when they do not. */
function meeting(
  a1: [number, number], a2: [number, number],
  b1: [number, number], b2: [number, number],
): [number, number] | null {
  const ax = a2[0] - a1[0]
  const ay = a2[1] - a1[1]
  const bx = b2[0] - b1[0]
  const by = b2[1] - b1[1]
  const denominator = ax * by - ay * bx
  if (denominator === 0) return null
  const t = ((b1[0] - a1[0]) * by - (b1[1] - a1[1]) * bx) / denominator
  const u = ((b1[0] - a1[0]) * ay - (b1[1] - a1[1]) * ax) / denominator
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return [a1[0] + t * ax, a1[1] + t * ay]
}

/** Does this polyline enter that box? */
function entersBox(points: [number, number][], box: Box): boolean {
  return points.some(([x, y]) =>
    x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h)
}

/**
 * Count what a reader sees as clutter. Two edges that share a card meet at that
 * card's anchor by construction, and nobody reads that as a crossing, so
 * intersections within `ANCHOR_RADIUS` of a shared endpoint's card are
 * discarded. Sampling also produces several hits where one crossing exists, so
 * points within `CLUSTER_RADIUS` collapse into one.
 */
function measure(scene: Scene) {
  const boxes = new Map(scene.cards.map(card => [card.id, card]))
  const right = new Set(scene.rightHalf)
  const points: { x: number; y: number; inCluster: boolean }[] = []
  const pairs = new Set<string>()
  const perEdge = new Array(scene.edges.length).fill(0)

  for (let i = 0; i < scene.edges.length; i++) {
    for (let j = i + 1; j < scene.edges.length; j++) {
      const a = scene.edges[i]
      const b = scene.edges[j]
      const shared = [a.from, a.to].filter(id => id === b.from || id === b.to)
      const found: [number, number][] = []
      for (let s = 0; s < a.points.length - 1; s++) {
        for (let t = 0; t < b.points.length - 1; t++) {
          const hit = meeting(a.points[s], a.points[s + 1], b.points[t], b.points[t + 1])
          if (!hit) continue
          const atAnchor = shared.some(id => {
            const box = boxes.get(id)!
            return hit[0] >= box.x - ANCHOR_RADIUS && hit[0] <= box.x + box.w + ANCHOR_RADIUS
              && hit[1] >= box.y - ANCHOR_RADIUS && hit[1] <= box.y + box.h + ANCHOR_RADIUS
          })
          if (atAnchor) continue
          if (found.some(seen => Math.hypot(seen[0] - hit[0], seen[1] - hit[1]) < CLUSTER_RADIUS)) continue
          found.push(hit)
        }
      }
      if (!found.length) continue
      pairs.add(`${i}:${j}`)
      perEdge[i] += found.length
      perEdge[j] += found.length
      // A crossing counts as cluster clutter when both its edges land on a
      // right-half card, which is what makes it part of the dense knot rather
      // than a stray meeting on the way across the board.
      const inCluster = [a, b].every(edge => right.has(edge.from) || right.has(edge.to))
      for (const [x, y] of found) points.push({ x, y, inCluster })
    }
  }

  const overlaps: string[] = []
  for (const edge of scene.edges) {
    for (const card of scene.cards) {
      if (card.id === edge.from || card.id === edge.to) continue
      if (entersBox(edge.points, card)) overlaps.push(`${edge.from}->${edge.to} over ${card.id}`)
    }
  }

  const duplicates = new Map<string, number>()
  for (const edge of scene.edges) {
    const key = [edge.from, edge.to].sort().join('|')
    duplicates.set(key, (duplicates.get(key) ?? 0) + 1)
  }

  const distribution = [0, 0, 0, 0]
  for (const count of perEdge) distribution[Math.min(count, 3)]++

  return {
    points: points.length,
    pairs: pairs.size,
    edgesInvolved: perEdge.filter(count => count > 0).length,
    inRightCluster: points.filter(point => point.inCluster).length,
    edgesOverCards: new Set(overlaps.map(entry => entry.split(' over ')[0])).size,
    edgeCardOverlaps: overlaps.length,
    duplicatePairs: [...duplicates.values()].filter(count => count > 1).length,
    distribution,
  }
}

test.describe('edge crossings in the dense scene', () => {
  test('holds the reference board under its recorded crossing budget', async ({ dense, page }) => {
    const { cardCount } = await loadScene(page, dense.url)
    const scene = await sampleScene(page, SAMPLES)

    // Guards, so a fixture swap or a rendering change reports itself here
    // rather than shifting the crossing numbers and looking like a regression.
    expect(cardCount, 'rendered cards').toBe(SCENE.expectedCards)
    expect(scene.edges.length, 'rendered relationships').toBe(SCENE.expectedRelationships)
    expect(scene.rightHalf.length, 'cards past the horizontal midpoint').toBe(SCENE.rightHalf.cards)

    const seen = measure(scene)
    test.info().annotations.push({
      type: 'crossings',
      description: JSON.stringify(seen),
    })

    // No two cards on this board are joined by more than one relationship, so
    // there is nothing here for an edge-bundling change to bundle. Assert it
    // exactly: it is a property of the fixture, not of the fonts, and it is the
    // reason this scene cannot demonstrate a duplicate-edge fix.
    expect(seen.duplicatePairs, 'card pairs joined by more than one edge').toBe(0)

    expect(seen.points, 'crossing points between rendered edges')
      .toBeLessThanOrEqual(CROSSINGS.max.points)
    expect(seen.edgesInvolved, 'edges that cross at least one other edge')
      .toBeLessThanOrEqual(CROSSINGS.max.edgesInvolved)
    expect(seen.edgesOverCards, 'edges drawn across a card that is not an endpoint')
      .toBeLessThanOrEqual(CROSSINGS.max.edgesOverCards)
    expect(seen.edgeCardOverlaps, 'edge and non-endpoint card overlaps')
      .toBeLessThanOrEqual(CROSSINGS.max.edgeCardOverlaps)

    // Where the clutter is, which is the finding that chose the fix. Most of
    // the crossings sit in the right cluster and most edges cross nothing at
    // all, so the problem is a handful of edges sharing endpoints rather than a
    // board that needs a routing algorithm.
    expect(seen.inRightCluster / Math.max(seen.points, 1),
      'share of crossings inside the right cluster').toBeGreaterThan(0.7)
    expect(seen.distribution[0], 'edges that cross nothing')
      .toBeGreaterThanOrEqual(SCENE.expectedRelationships - CROSSINGS.max.edgesInvolved)
  })
})
