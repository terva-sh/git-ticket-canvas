import { describe, expect, it } from 'vitest'
import { allocatePlacement, type PlacementInput, type PlacementSnapshot, type Rectangle } from './placement'

function input(ids = ['a', 'b', 'c', 'd', 'e']): PlacementInput {
  return { board: 'default', generation: 1, revision: 1, baseline: 'r1',
    tickets: ids.map(id => ({ id, identity: `${id}-born`, labels: ['x'] })), cards: {}, previews: new Map(), obstacles: [],
    heights: new Map(ids.map(id => [id, { identity: `${id}-born`, height: 100 }])),
    routing: { pens: { p: { title: 'Pen', x: 0, y: 0, w: 632, h: 296, color: '#759bcc', pin: { x: 24, y: 24 }, requiredLabels: ['x'] } },
      ruleOrder: ['p'], inbox: { x: -1000, y: 0 } } }
}
function placed(value: PlacementInput, previous?: PlacementSnapshot) {
  const result = allocatePlacement(value, previous)
  if (!result.ok) throw new Error(JSON.stringify(result.error))
  return result
}
function separated(a: Rectangle, b: Rectangle) {
  return a.x + a.width + 24 <= b.x || b.x + b.width + 24 <= a.x || a.y + a.height + 24 <= b.y || b.y + b.height + 24 <= a.y
}
function collisionFree(snapshot: PlacementSnapshot, obstacles: readonly Rectangle[] = []) {
  const entries = [...snapshot.positions.values()]
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i]
    if (a.mode !== 'automatic') continue
    for (let j = 0; j < entries.length; j++) if (i !== j) expect(separated(a, entries[j])).toBe(true)
    for (const obstacle of obstacles) expect(separated(a, obstacle)).toBe(true)
  }
}
const xy = (s: PlacementSnapshot) => [...s.positions].map(([id, p]) => [id, p.x, p.y, p.overflow])
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    if (value instanceof Map) for (const entry of value.values()) frozen(entry)
    else Object.values(value).forEach(frozen)
    Object.freeze(value)
  }
  return value
}

describe('Pure placement allocation', () => {
  it('fills a padded near-pin lattice with exact gaps before below-first overflow', () => {
    const { snapshot } = placed(input())
    expect(xy(snapshot)).toEqual([['a', 24, 24, false], ['b', 24, 148, false], ['c', 328, 24, false], ['d', 328, 148, false], ['e', 24, 320, true]])
    expect(snapshot.overflow.get('p')).toEqual(['e']); expect(snapshot.overflowCounts.get('p')).toBe(1)
    expect(snapshot.evaluation.counts.pens.get('p')).toBe(5)
    expect(snapshot.positions.get('a')).toMatchObject({ width: 280, height: 100, provisional: false, identity: 'a-born', mode: 'automatic' })
    collisionFree(snapshot)
  })
  it('reconstructs deterministically from full IDs rather than ticket/map iteration order', () => {
    const one = input(['z', 'b', 'a']), two = input(['b', 'a', 'z'])
    two.heights = new Map([...two.heights].reverse())
    expect(xy(placed(one).snapshot)).toEqual(xy(placed(two).snapshot))
  })
  it('preserves valid slots across arrivals, deletions, and unrelated metadata without compacting', () => {
    const initial = placed(input()).snapshot, next = input(['b', 'c', 'd', 'e', 'new'])
    next.routing.pens.p.title = 'Changed title'; next.routing.pens.p.color = '#b499be'
    const { snapshot, work } = placed(next, initial)
    for (const id of ['b', 'c', 'd', 'e']) expect(snapshot.positions.get(id)).toBe(initial.positions.get(id))
    expect(snapshot.positions.get('new')).toMatchObject({ x: 24, y: 24, overflow: false })
    expect(snapshot.positions.has('a')).toBe(false); expect(work.retained).toBe(4)
    expect(snapshot.overflow.get('p')).toEqual(['e']); collisionFree(snapshot)
  })
  it('preserves manual coordinates even when manual cards overlap each other', () => {
    const next = input(['manual1', 'manual2', 'auto'])
    next.cards = { manual1: { x: 24, y: 24, w: 999 }, manual2: { x: 24, y: 24 } }
    const { snapshot } = placed(next)
    expect(snapshot.positions.get('manual1')).toMatchObject({ x: 24, y: 24, width: 280, mode: 'manual' })
    expect(snapshot.positions.get('manual2')).toMatchObject({ x: 24, y: 24, mode: 'manual' })
    expect(snapshot.evaluation.counts.pens.get('p')).toBe(1); collisionFree(snapshot)
  })
  it('reserves both manual source and owned preview, then releases preview intent without persisting it', () => {
    const next = input(['manual', 'auto'])
    next.cards = { manual: { x: 24, y: 24 } }
    next.previews = new Map([['manual', { identity: 'manual-born', owner: 'save-1', card: { x: 328, y: 24 } }]])
    const { snapshot } = placed(next)
    expect(snapshot.positions.get('manual')).toMatchObject({ x: 328, y: 24, mode: 'preview', previewOwner: 'save-1' })
    expect(snapshot.positions.get('auto')).toMatchObject({ x: 24, y: 148 })
    expect(next.cards.manual).toEqual({ x: 24, y: 24 })
    next.previews = new Map()
    expect(placed(next, snapshot).snapshot.positions.get('manual')).toMatchObject({ x: 24, y: 24, mode: 'manual' })
  })
  it('excludes pending automatic-to-manual previews from automatic assignments without changing authored cards', () => {
    const next = input(['a'])
    next.previews = new Map([['a', { identity: 'a-born', owner: 'drop', card: { x: 900, y: 900 } }]])
    const first = placed(next).snapshot
    expect(first.positions.get('a')?.mode).toBe('preview'); expect(first.evaluation.counts.pens.get('p')).toBe(0)
    expect(next.cards).toEqual({})
    next.previews = new Map()
    expect(placed(next, first).snapshot.positions.get('a')).toMatchObject({ x: 24, y: 24, mode: 'automatic' })
  })
  it('ignores deleted/stale-incarnation measurements and previews and marks fallback dimensions provisional', () => {
    const next = input(['a'])
    next.heights = new Map([['a', { identity: 'old-a', height: 1 }]])
    next.previews = new Map([['a', { identity: 'old-a', owner: 'old-save', card: { x: 24, y: 24 } }],
      ['deleted', { identity: 'deleted-born', owner: 'old-save', card: { x: 24, y: 320 } }]])
    const { snapshot } = placed(next)
    expect(snapshot.positions.get('a')).toMatchObject({ x: 24, y: 320, width: 280, height: 340, provisional: true, mode: 'automatic', overflow: true })
    expect(snapshot.positions.size).toBe(1)
  })
  it('revalidates resized cards after reserving unaffected slots', () => {
    const next = input(['a', 'b']), initial = placed(next).snapshot
    next.heights = new Map([['a', { identity: 'a-born', height: 230 }], ['b', { identity: 'b-born', height: 100 }]])
    const changed = placed(next, initial).snapshot
    expect(changed.positions.get('b')).toBe(initial.positions.get('b'))
    expect(changed.positions.get('a')).toMatchObject({ x: 328, y: 24, height: 230 })
    collisionFree(changed)
  })
  it('revalidates retained slots against newly supplied control/header obstacles', () => {
    const next = input(['a', 'b']), initial = placed(next).snapshot
    next.obstacles = [{ id: 'header', x: 24, y: 24, width: 280, height: 100 }]
    const { snapshot } = placed(next, initial)
    expect(snapshot.positions.get('b')).toBe(initial.positions.get('b'))
    expect(snapshot.positions.get('a')).not.toEqual(initial.positions.get('a'))
    collisionFree(snapshot, next.obstacles)
  })
  it('uses actual variable heights, preserves all filtered tickets, and does not treat frame interiors as obstacles', () => {
    const next = { ...input(['a', 'b', 'c']), frames: { f: { x: 0, y: 0, w: 632, h: 296, members: ['a'] } } }
    next.heights = new Map([['a', { identity: 'a-born', height: 40 }], ['b', { identity: 'b-born', height: 210 }], ['c', { identity: 'c-born', height: 75 }]])
    const all = next.tickets.map(t => ({ ...t, status: 'done', filtered: true }))
    const { snapshot } = placed({ ...next, tickets: all })
    expect(snapshot.positions.get('a')).toMatchObject({ x: 24, y: 24, height: 40 })
    expect(snapshot.evaluation.counts.pens.get('p')).toBe(3); collisionFree(snapshot)
  })
  it('reroutes label changes and pen removal through remaining rules and Inbox', () => {
    const next = input(['a', 'b']), initial = placed(next).snapshot
    next.routing.pens.q = { ...next.routing.pens.p, x: 1500, pin: { x: 1524, y: 24 }, requiredLabels: ['y'] }
    next.routing.ruleOrder.push('q'); next.tickets = [next.tickets[0], { ...next.tickets[1], labels: ['y'] }]
    const changed = placed(next, initial).snapshot
    expect(changed.positions.get('a')).toBe(initial.positions.get('a'))
    expect(changed.positions.get('b')).toMatchObject({ x: 1524, destination: { kind: 'pen', penId: 'q' } })
    delete next.routing.pens.q; next.routing.ruleOrder = ['p']
    const removed = placed(next, changed).snapshot
    expect(removed.positions.get('b')).toMatchObject({ x: -1000, y: 0, overflow: false, destination: { kind: 'inbox' } })
    expect(removed.evaluation.counts.inbox).toBe(1)
  })
  it.each(['move', 'resize', 'pin'] as const)('invalidates changed destination geometry for %s while retaining other destinations', kind => {
    const next = input(['a', 'b']); next.tickets = [next.tickets[0], { ...next.tickets[1], labels: [] }]
    const initial = placed(next).snapshot
    if (kind === 'move') { next.routing.pens.p.x += 1000; next.routing.pens.p.pin.x += 1000 }
    if (kind === 'resize') next.routing.pens.p.w = 300
    if (kind === 'pin') next.routing.pens.p.pin = { x: 328, y: 148 }
    const changed = placed(next, initial).snapshot
    expect(changed.positions.get('a')).not.toBe(initial.positions.get('a'))
    expect(changed.positions.get('b')).toBe(initial.positions.get('b'))
    if (kind === 'move') expect(changed.positions.get('a')?.x).toBe(1024)
    if (kind === 'pin') expect(changed.positions.get('a')).toMatchObject({ x: 328, y: 148 })
    if (kind === 'resize') expect(changed.positions.get('a')?.overflow).toBe(true)
  })
  it('allocates overlapping pens in explicit order using a single occupancy index', () => {
    const next = input(['a', 'b']); next.tickets = [{ ...next.tickets[0], labels: ['x'] }, { ...next.tickets[1], labels: ['y'] }]
    next.routing.pens.q = { ...next.routing.pens.p, requiredLabels: ['y'] }; next.routing.ruleOrder = ['q', 'p']
    const { snapshot } = placed(next)
    expect(snapshot.positions.get('b')).toMatchObject({ x: 24, y: 24 })
    expect(snapshot.positions.get('a')).toMatchObject({ x: 24, y: 148 }); collisionFree(snapshot)
  })
  it('tries right after an obstructed below candidate and never overflows to Inbox', () => {
    const next = input(['a']); next.routing.pens.p.w = 100; next.routing.pens.p.h = 100
    next.obstacles = [{ id: 'below', x: 24, y: 124, width: 280, height: 100 }]
    const { snapshot } = placed(next)
    // Right is obstructed by the same rectangle, so above is the next free side.
    expect(snapshot.positions.get('a')).toMatchObject({ x: 24, y: -124, overflow: true, destination: { kind: 'pen', penId: 'p' } })
    expect(snapshot.evaluation.counts.inbox).toBe(0); collisionFree(snapshot, next.obstacles)
    next.obstacles = [{ id: 'below', x: -280, y: 124, width: 280, height: 100 }]
    next.routing.pens.p.pin.x = -280
    expect(placed(next).snapshot.positions.get('a')).toMatchObject({ x: 124, y: 24, overflow: true })
  })
  it('moves the Inbox anchor without inventing an Inbox overflow count', () => {
    const next = input(['a', 'b']); next.routing = { pens: {}, ruleOrder: [], inbox: { x: 0, y: 0 } }
    const first = placed(next).snapshot
    expect(first.positions.get('a')).toMatchObject({ x: 0, y: 0, overflow: false })
    expect(first.overflow.size).toBe(0); expect(first.overflowCounts.size).toBe(0)
    next.routing.inbox = { x: 1000, y: 1000 }
    const moved = placed(next, first).snapshot
    expect(moved.positions.get('a')).toMatchObject({ x: 1000, y: 1000 }); collisionFree(moved)
  })
  it('fits full automatic rectangles within coordinate limits, trying alternate overflow sides at the boundary', () => {
    const next = input(['a']); next.routing.pens.p = { ...next.routing.pens.p, x: 1e9 - 300, y: 1e9 - 100, w: 300, h: 100,
      pin: { x: 1e9 - 24, y: 1e9 - 24 } }
    const { snapshot } = placed(next), point = snapshot.positions.get('a')!
    expect(point.overflow).toBe(true); expect(point.y).toBe(1e9 - 224)
    expect(point.x + point.width).toBeLessThanOrEqual(1e9); expect(point.y + point.height).toBeLessThanOrEqual(1e9)
    next.heights = new Map([['a', { identity: 'a-born', height: 2e9 + 1 }]])
    expect(allocatePlacement(next)).toMatchObject({ ok: false, error: { code: 'coordinate-exhausted', ticketId: 'a' } })
  })
  it('handles giant obstacles without expanding scene-sized bucket arrays and fails atomically at its search budget', () => {
    const next = input(['a', 'b']); next.routing.pens.p.w = 100; next.routing.pens.p.h = 100
    next.obstacles = [{ id: 'world', x: -1e9, y: -1e9, width: 2e9, height: 2e9 }]
    const result = allocatePlacement(next, undefined, { maxCandidates: 32 })
    expect(result).toMatchObject({ ok: false, error: { code: 'search-exhausted' }, work: { candidates: 32 } })
    expect(result).not.toHaveProperty('snapshot'); expect(result.work.collisionChecks).toBeLessThanOrEqual(32)
    const partial = allocatePlacement(input(['a', 'b']), undefined, { maxCandidates: 1 })
    expect(partial).toMatchObject({ ok: false, error: { code: 'search-exhausted', ticketId: 'b' } }); expect(partial).not.toHaveProperty('snapshot')
  })
  it.each([
    (v: PlacementInput) => { v.routing.pens.p.requiredLabels = [] },
    (v: PlacementInput) => { v.tickets = [...v.tickets, v.tickets[0]] },
    (v: PlacementInput) => { v.cards = { a: { x: NaN, y: 0 } } },
    (v: PlacementInput) => { v.heights = new Map([['a', { identity: 'a-born', height: 0 }]]) },
    (v: PlacementInput) => { v.obstacles = [{ id: 'bad', x: 0, y: 0, width: Infinity, height: 1 }] },
    (v: PlacementInput) => { v.previews = new Map([['a', { identity: 'a-born', owner: '', card: { x: 0, y: 0 } }]]) },
  ])('refuses invalid input without publishing a partial snapshot %#', change => {
    const value = input(); change(value)
    expect(allocatePlacement(value)).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
  })
  it('owns immutable outputs without freezing or mutating caller-owned inputs', () => {
    const value = input(), cards = value.cards, result = placed(frozen(value)).snapshot
    expect(value.cards).toBe(cards); expect(value.cards).toEqual({})
    expect(() => (result.positions as Map<string, unknown>).set('bad', {})).toThrow()
    expect(() => { (result.positions.get('a') as { x: number }).x = 999 }).toThrow()
    expect(() => (result.evaluation.counts.pens as Map<string, number>).set('p', 999)).toThrow()
    expect(() => (result.overflow.get('p') as string[]).push('bad')).toThrow()
  })
  it('keeps fractional placements inside padded boundaries without rounding past them', () => {
    for (let i = 1; i <= 100; i++) {
      const next = input(['a', 'b', 'c', 'd']), p = next.routing.pens.p
      p.x = i / 10; p.y = -i / 10; p.pin = { x: p.x + 328, y: p.y + 148 }
      const result = placed(next).snapshot
      for (const card of result.positions.values()) {
        if (card.overflow) continue
        expect(card.x).toBeGreaterThanOrEqual(p.x + 24)
        expect(card.y).toBeGreaterThanOrEqual(p.y + 24)
        expect(card.x + card.width).toBeLessThanOrEqual(p.x + p.w - 24)
        expect(card.y + card.height).toBeLessThanOrEqual(p.y + p.h - 24)
      }
      collisionFree(result)
    }
  })
  it('bounds candidate and collision work for 120 automatic cards across competing pens', () => {
    const ids = Array.from({ length: 120 }, (_, i) => `TKT-${String(i).padStart(3, '0')}`), next = input(ids)
    next.routing.pens.p = { ...next.routing.pens.p, w: 1280, h: 2400 }
    next.routing.pens.q = { ...next.routing.pens.p, x: 1800, pin: { x: 1824, y: 24 }, requiredLabels: ['x', 'q'] }
    next.routing.pens.r = { ...next.routing.pens.p, x: 3600, pin: { x: 3624, y: 24 }, requiredLabels: ['x', 'r'] }
    next.routing.ruleOrder = ['r', 'q', 'p']
    next.tickets = next.tickets.map((t, i) => ({ ...t, labels: i % 3 === 0 ? ['x', 'q', 'r'] : i % 3 === 1 ? ['x', 'q'] : ['x'] }))
    next.heights = new Map(ids.map((id, i) => [id, { identity: `${id}-born`, height: 180 + (i % 3) * 20 }]))
    const { snapshot, work } = placed(next)
    expect(snapshot.positions.size).toBe(120); expect(work.candidates).toBeLessThan(20000); expect(work.collisionChecks).toBeLessThan(100000)
    collisionFree(snapshot)
    const repeated = placed(next, snapshot)
    expect(repeated.work.retained).toBe(120); expect(repeated.work.candidates).toBe(0)
  })
})
