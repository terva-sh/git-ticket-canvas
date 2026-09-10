import { describe, expect, it, vi } from 'vitest'
import { allocatePlacement, type PlacementInput, type MeasuredHeight } from './placement'
import { PlacementSnapshots, type BoardScope } from './snapshots'
import type { Cards } from '../tickets/types'
import { SceneCoordinator, sceneRect, sceneCenter, sceneBounds } from './scene'

// Contract for the separate opt-in coordinator, not PublicationBridge.
// publish receives complete, committed samples. DOM ownership tests follow later.
function publication(scope: BoardScope, revision = 1) {
  const input: PlacementInput & { heights: Map<string, MeasuredHeight> } = { ...scope, revision, baseline: `b${revision}`,
    tickets: ['a', 'b'].map(id => ({ id, identity: `${id}:1`, labels: [] })),
    cards: {}, previews: new Map(), obstacles: [],
    heights: new Map(['a', 'b'].map(id => [id, { identity: `${id}:1`, height: 100 }])),
    routing: { pens: {}, ruleOrder: [], inbox: { x: 50, y: 60 } } }
  return { input, captureToken: 'capture-v1:test', frames: {},
    sample: { baseline: input.baseline, revision, complete: true,
      cards: new Map([['a', 'registration-a'], ['b', 'registration-b']]), controls: new Map<string, string>() } }
}
function setup() {
  const allocator = vi.fn(allocatePlacement), snapshots = new PlacementSnapshots(allocator)
  const coordinator = new SceneCoordinator(snapshots)
  const scope = coordinator.activate({ storePath: '/repo', board: 'A', appGeneration: 1 })
  return { allocator, snapshots, coordinator, scope }
}
function drop(coordinator: SceneCoordinator, cards: Cards = { a: { x: 500, y: 600 } }) {
  const gesture = coordinator.beginGesture()!
  expect(gesture).not.toBeNull()
  return coordinator.submitDrop(gesture, cards)
}

describe('Opt-in scene contract', () => {
  it('starts unavailable without fabricated positions or computation', () => {
    const { coordinator, allocator } = setup()
    expect(coordinator.scene.mode).toBe('unavailable')
    expect(coordinator.scene.positions.size).toBe(0)
    expect(coordinator.scene.captureReady).toBe(false)
    expect(coordinator.beginGesture()).toBeNull()
    expect(allocator).not.toHaveBeenCalled()
  })
  it('uses one immutable rectangle source for cards, endpoints, focus and fit', () => {
    const { coordinator, allocator, scope } = setup(), p = publication(scope)
    coordinator.publish(p)
    const scene = coordinator.scene, a = sceneRect(scene, 'a')!
    expect(scene).toMatchObject({ mode: 'accepted', captureReady: true,
      storePath: '/repo', appGeneration: 1, board: 'A', baseline: 'b1', revision: 1 })
    expect(a).toMatchObject({ x: 50, y: 60, width: 280, height: 100, identity: 'a:1' })
    expect(sceneCenter(scene, 'a')).toEqual({ x: a.x + 140, y: a.y + 50 })
    const bounds = sceneBounds(scene, ['a'])
    expect(bounds).toEqual({ x: a.x, y: a.y, width: 280, height: 100 })
    expect(sceneRect(scene, 'missing')).toBeNull()
    expect(sceneBounds(scene, [])).toBeNull()
    expect(Object.isFrozen(scene)).toBe(true); expect(Object.isFrozen(a)).toBe(true)
    expect('set' in scene.positions).toBe(false)
    p.input.heights.set('a', { identity: 'a:1', height: 900 }); p.sample.cards.clear()
    expect(sceneRect(scene, 'a')!.height).toBe(100)
    allocator.mockClear()
    for (let n = 0; n < 10; n++) {
      sceneRect(scene, 'a'); sceneCenter(scene, 'b'); sceneBounds(scene, ['a', 'b']); void coordinator.scene
    }
    expect(allocator).not.toHaveBeenCalled()
  })
  it('rejects stale or incomplete committed samples before allocation', () => {
    const { coordinator, allocator, scope } = setup(), p = publication(scope)
    p.sample.baseline = 'old'; coordinator.publish(p)
    expect(coordinator.scene.captureReady).toBe(false); expect(allocator).not.toHaveBeenCalled()
    p.sample.baseline = p.input.baseline; p.sample.complete = false; coordinator.publish(p)
    expect(coordinator.scene.positions.size).toBe(0); expect(allocator).not.toHaveBeenCalled()
    p.sample.complete = true; coordinator.publish(p)
    expect(coordinator.scene.captureReady).toBe(true)
  })
  it('never authorizes capture from provisional geometry or an absent server token', () => {
    const { coordinator, scope } = setup(), p = publication(scope)
    p.input.heights.delete('b'); coordinator.publish(p)
    expect(coordinator.scene.captureReady).toBe(false)
    const measured = publication(scope, 2)
    coordinator.publish({ ...measured, captureToken: null })
    expect(coordinator.scene.captureReady).toBe(false)
    coordinator.publish(publication(scope, 3))
    expect(coordinator.scene.captureReady).toBe(true)
  })
  it('retains honest old lineage on failure and stages new identities without an origin', () => {
    const { coordinator, snapshots, scope } = setup()
    coordinator.publish(publication(scope)); const old = coordinator.scene
    const invalid = publication(scope, 2)
    invalid.input.tickets = [...invalid.input.tickets, { id: 'c', identity: 'c:1', labels: [] }]
    invalid.input.heights.set('c', { identity: 'c:1', height: 100 }); invalid.sample.cards.set('c', 'registration-c')
    invalid.input.obstacles = [{ id: 'invalid', x: Number.NaN, y: 0, width: 10, height: 10 }]
    coordinator.publish(invalid)
    expect(snapshots.failure).not.toBeNull()
    expect(coordinator.scene).toMatchObject({ mode: 'stale', baseline: old.baseline, revision: old.revision, captureReady: false })
    expect(sceneRect(coordinator.scene, 'c')).toBeNull()
    expect(coordinator.scene.staged).toContain('c')
    invalid.input.revision = 3; invalid.input.baseline = 'b3'; invalid.sample.baseline = 'b3'
    invalid.sample.revision = 3; invalid.input.obstacles = []; coordinator.publish(invalid)
    expect(coordinator.scene.captureReady).toBe(true); expect(sceneRect(coordinator.scene, 'c')).not.toBeNull()
  })
  it('freezes dimensions and all neighbors until an owned drop precedes release', () => {
    const { coordinator, allocator, scope } = setup()
    coordinator.publish(publication(scope)); const base = coordinator.scene, gesture = coordinator.beginGesture()!
    const next = publication(scope, 2); next.input.heights.set('a', { identity: 'a:1', height: 489 })
    allocator.mockClear(); coordinator.publish(next)
    const projected = coordinator.projectGesture(gesture, { a: { x: 200, y: 300 } })
    expect(sceneRect(projected, 'a')).toMatchObject({ x: 200, y: 300, height: 100 })
    expect(sceneRect(projected, 'b')).toEqual(sceneRect(base, 'b'))
    expect(allocator).not.toHaveBeenCalled()
    const submitted = coordinator.submitDrop(gesture, { a: { x: 200, y: 300 } })
    expect(submitted).toMatchObject({ board: 'A', appGeneration: 1, cards: { a: { x: 200, y: 300 } } })
    expect(coordinator.pending.get('a')!.owner).toBe(submitted.owner)
    expect(allocator).not.toHaveBeenCalled() // busy(false) cannot flush the queued sample
    coordinator.publish(next)
    expect(sceneRect(coordinator.scene, 'a')).toMatchObject({ x: 200, y: 300, height: 489 })
    expect(coordinator.scene.captureReady).toBe(false)
  })
  it('cancels an unsubmitted gesture without creating a manual request', () => {
    const { coordinator, scope } = setup(); coordinator.publish(publication(scope))
    const gesture = coordinator.beginGesture()!
    coordinator.projectGesture(gesture, { a: { x: 700, y: 800 } }); coordinator.cancelGesture(gesture)
    expect(coordinator.pending.size).toBe(0)
    coordinator.publish(publication(scope, 2))
    expect(sceneRect(coordinator.scene, 'a')!.mode).toBe('automatic')
  })
})

describe('Owned pending scene previews', () => {
  it('accepts an overlay-free base before proposing changed measurements and obstacles', () => {
    const { coordinator, snapshots, scope } = setup(); coordinator.publish(publication(scope)); drop(coordinator)
    const accept = vi.spyOn(snapshots, 'accept'), propose = vi.spyOn(snapshots, 'propose')
    const next = publication(scope, 2)
    next.input.heights.set('b', { identity: 'b:1', height: 489 })
    next.input.obstacles = [{ id: 'frame:f:title', x: 40, y: 40, width: 100, height: 30 }]
    coordinator.publish(next)
    expect(accept).toHaveBeenCalledTimes(1); expect(propose).toHaveBeenCalledTimes(1)
    expect(accept.mock.invocationCallOrder[0]).toBeLessThan(propose.mock.invocationCallOrder[0]!)
    expect(accept.mock.calls[0]![0].previews.size).toBe(0)
    expect(propose.mock.calls[0]![0]).toMatchObject({ revision: 2, baseline: 'b2' })
    expect(propose.mock.calls[0]![0].previews.get('a')).toMatchObject({ card: { x: 500, y: 600 } })
    expect(snapshots.accepted!.positions.get('a')!.mode).toBe('automatic')
    expect(snapshots.proposed!.positions.get('a')!.mode).toBe('preview')
  })
  it.each(['success', 'failure'] as const)('ignores an older %s for a newer owner on the same card', outcome => {
    const { coordinator, scope } = setup(); coordinator.publish(publication(scope))
    const first = drop(coordinator); coordinator.publish(publication(scope, 2))
    const second = drop(coordinator, { a: { x: 900, y: 950 } }); coordinator.publish(publication(scope, 3))
    expect(second.owner).not.toBe(first.owner)
    coordinator.complete(first, outcome)
    expect(coordinator.pending.get('a')!.owner).toBe(second.owner)
    expect(sceneRect(coordinator.scene, 'a')).toMatchObject({ x: 900, y: 950 })
    coordinator.complete(second, 'failure'); coordinator.publish(publication(scope, 4))
    expect(coordinator.pending.size).toBe(0)
    expect(sceneRect(coordinator.scene, 'a')!.mode).toBe('automatic')
  })
  it('uses one immutable aggregate proposal owner for multiple per-card saves', () => {
    const { coordinator, snapshots, scope } = setup(); coordinator.publish(publication(scope))
    const first = drop(coordinator); coordinator.publish(publication(scope, 2))
    const oldSet = coordinator.scene.overlayOwner
    const second = drop(coordinator, { b: { x: 1000, y: 1100 } }); coordinator.publish(publication(scope, 3))
    expect(coordinator.scene.overlayOwner).not.toBe(oldSet)
    expect(snapshots.cancel(scope, oldSet!)).toBe(false)
    expect(snapshots.proposed!.positions.get('a')!.mode).toBe('preview')
    expect(snapshots.proposed!.positions.get('b')!.mode).toBe('preview')
    coordinator.complete(first, 'failure'); coordinator.publish(publication(scope, 4))
    expect(coordinator.pending.has('a')).toBe(false); expect(coordinator.pending.get('b')!.owner).toBe(second.owner)
  })
  it('does not promote proposal slots or invent a saved card on success', () => {
    const { coordinator, snapshots, scope } = setup(); coordinator.publish(publication(scope))
    const submitted = drop(coordinator); coordinator.publish(publication(scope, 2))
    const response = publication(scope, 3); response.input.cards = { a: { x: 500, y: 600 } }
    coordinator.publish(response); coordinator.complete(submitted, 'success'); coordinator.publish(response)
    expect(snapshots.accepted!.positions.get('a')!.mode).toBe('manual')
    expect(snapshots.proposed).toBeNull(); expect(coordinator.pending.size).toBe(0)
    expect(submitted.cards).toEqual({ a: { x: 500, y: 600 } }) // never persist automatic b
  })
  it('preserves explicit pending coordinates after proposal failure without declaring collision safety', () => {
    const { coordinator, snapshots, scope } = setup(); coordinator.publish(publication(scope))
    drop(coordinator)
    vi.spyOn(snapshots, 'propose').mockReturnValueOnce({ ok: false,
      error: { code: 'search-exhausted', message: 'fixture budget' }, work: { candidates: 0, collisionChecks: 0, retained: 0 } })
    coordinator.publish(publication(scope, 2))
    expect(coordinator.scene).toMatchObject({ mode: 'pending-manual-overlay', captureReady: false, collisionSafe: false })
    expect(sceneRect(coordinator.scene, 'a')).toMatchObject({ x: 500, y: 600 })
    expect(snapshots.accepted!.baseline).toBe('b2')
  })
  it('isolates board A/B/A and same-ID reincarnations from old completions', () => {
    const { coordinator, scope } = setup(); coordinator.publish(publication(scope)); const old = drop(coordinator)
    coordinator.activate({ storePath: '/repo', board: 'B', appGeneration: 2 })
    const fresh = coordinator.activate({ storePath: '/repo', board: 'A', appGeneration: 3 })
    coordinator.publish(publication(fresh)); const current = drop(coordinator)
    coordinator.complete(old, 'failure'); expect(coordinator.pending.get('a')!.owner).toBe(current.owner)
    const reborn = publication(fresh, 2)
    reborn.input.tickets = reborn.input.tickets.map(t => t.id === 'a' ? { ...t, identity: 'a:2' } : t)
    reborn.input.heights.set('a', { identity: 'a:2', height: 100 }); coordinator.publish(reborn)
    expect(coordinator.pending.has('a')).toBe(false)
    coordinator.complete(current, 'success')
    expect(sceneRect(coordinator.scene, 'a')).toMatchObject({ identity: 'a:2', mode: 'automatic' })
  })
  it('holds the whole scene for frame operations and refuses to combine them with card saves', () => {
    const { coordinator, allocator, scope } = setup(); coordinator.publish(publication(scope))
    const hold = coordinator.beginFrame()!; expect(hold).not.toBeNull()
    allocator.mockClear(); coordinator.publish(publication(scope, 2)); expect(allocator).not.toHaveBeenCalled()
    expect(coordinator.beginGesture()).toBeNull()
    coordinator.endFrame(hold); expect(allocator).not.toHaveBeenCalled()
    coordinator.publish(publication(scope, 3)); drop(coordinator)
    expect(coordinator.beginFrame()).toBeNull()
  })
})
