import { describe, expect, it, vi } from 'vitest'
import { allocatePlacement } from './placement'
import { PlacementSnapshots } from './snapshots'
import { SceneCoordinator, sceneRect, type ScenePublication } from './scene'

function setup() {
  const allocator = vi.fn(allocatePlacement), snapshots = new PlacementSnapshots(allocator)
  const coordinator = new SceneCoordinator(snapshots)
  const scope = coordinator.activate({ storePath: '/repo', board: 'A', appGeneration: 1 })
  function publication(revision = 1): ScenePublication {
    return { input: { ...scope, revision, baseline: `b${revision}`,
      tickets: [{ id: 'a', identity: 'a:1', labels: [] }, { id: 'b', identity: 'b:1', labels: [] }],
      cards: {}, previews: new Map(), obstacles: [], routing: { pens: {}, ruleOrder: [], inbox: { x: 0, y: 0 } },
      heights: new Map(['a', 'b'].map(id => [id, { identity: `${id}:1`, height: 100 }])) },
      frames: { f: { title: 'Frame', x: 0, y: 0, w: 100, h: 100, color: 'slate', members: ['b'] } },
      captureToken: 'test', sample: { revision, baseline: `b${revision}`, complete: true,
        cards: new Map([['a', Symbol('a')], ['b', Symbol('b')]]), controls: new Map() } }
  }
  coordinator.publish(publication())
  function drop(id = 'a') { return coordinator.submitDrop(coordinator.beginGesture()!, { [id]: { x: 700, y: 800 } }) }
  return { coordinator, snapshots, allocator, publication, drop }
}

describe('Scene coordinator regression boundaries', () => {
  it('freezes obstacle geometry with the source placement throughout a gesture', () => {
    const { coordinator, publication } = setup(), p = publication(2)
    const obstacle = { id: 'fixture-control', x: -400, y: -400, width: 50, height: 30 }
    p.input.obstacles = [obstacle]; coordinator.publish(p)
    const scene = coordinator.scene, gesture = coordinator.beginGesture()!
    obstacle.width = 900
    const projected = coordinator.projectGesture(gesture, { a: { x: 20, y: 30 } })
    expect(scene.obstacles[0]!.width).toBe(50)
    expect(projected.obstacles).toBe(scene.obstacles)
    expect(projected.placement).toBe(scene.placement)
    expect(Object.isFrozen(scene.obstacles[0])).toBe(true)
  })
  it('reuses equivalent pending proposals without allocator work', () => {
    const { coordinator, allocator, publication, drop } = setup()
    drop(); coordinator.publish(publication(2)); const owner = coordinator.scene.overlayOwner
    allocator.mockClear(); coordinator.publish(publication(2))
    expect(allocator).not.toHaveBeenCalled()
    expect(coordinator.scene.overlayOwner).toBe(owner)
  })
  it('drops reincarnated pending owners even when the new sample is incomplete', () => {
    const { coordinator, publication, drop } = setup(); const old = drop()
    const p = publication(2)
    p.input.tickets = [{ id: 'a', identity: 'a:2', labels: [] }, p.input.tickets[1]!]
    coordinator.publish({ ...p, sample: { ...p.sample, complete: false } })
    expect(coordinator.pending.has('a')).toBe(false)
    expect(sceneRect(coordinator.scene, 'a')).toBeNull()
    expect(coordinator.scene.staged).toContain('a')
    coordinator.complete(old, 'success'); expect(coordinator.scene.captureReady).toBe(false)
  })
  it('rejects older callbacks after incomplete or held newer publications', () => {
    const { coordinator, allocator, publication } = setup()
    coordinator.publish({ ...publication(3), sample: { ...publication(3).sample, complete: false } })
    const stale = coordinator.scene; allocator.mockClear(); coordinator.publish(publication(2))
    expect(coordinator.scene).toBe(stale); expect(allocator).not.toHaveBeenCalled()
    coordinator.publish(publication(3)); const gesture = coordinator.beginGesture()!
    coordinator.publish(publication(5)); coordinator.cancelGesture(gesture)
    allocator.mockClear(); coordinator.publish(publication(4))
    expect(coordinator.scene.captureReady).toBe(false); expect(allocator).not.toHaveBeenCalled()
    coordinator.publish(publication(5)); expect(coordinator.scene.captureReady).toBe(true)
  })
  it('does not restore readiness or accepted coordinates from a completion alone', () => {
    const { coordinator, snapshots, allocator, publication, drop } = setup()
    const submission = drop(); coordinator.publish(publication(2)); allocator.mockClear()
    coordinator.complete(submission, 'success')
    expect(coordinator.scene.captureReady).toBe(false); expect(coordinator.beginGesture()).toBeNull()
    expect(snapshots.accepted!.positions.get('a')!.mode).toBe('automatic')
    expect(snapshots.proposed).toBeNull(); expect(allocator).not.toHaveBeenCalled()
    coordinator.publish(publication(2)); expect(sceneRect(coordinator.scene, 'a')!.mode).toBe('automatic')
  })
  it('keeps authored preimages, sample maps and pending receipts immutable', () => {
    const { coordinator, publication } = setup(), p = publication(2)
    p.input.cards = { a: { x: 1, y: 2 } }; coordinator.publish(p)
    const scene = coordinator.scene
    p.frames.f.members.push('a'); p.frames.f.title = 'changed'; p.input.cards.a.x = 300
    expect(scene.frames.f.members).toEqual(['b']); expect(scene.frames.f.title).toBe('Frame')
    expect(scene.cards.a.x).toBe(1); expect(Object.isFrozen(scene.frames.f.members)).toBe(true)
    expect('set' in scene.sample!.cards).toBe(false)
    const cards = { a: { x: 30, y: 40 } }, submission = coordinator.submitDrop(coordinator.beginGesture()!, cards)
    const pending = coordinator.pending; cards.a.x = 999
    expect(submission.cards.a.x).toBe(30); expect(pending.get('a')!.card.x).toBe(30)
    expect(Object.isFrozen(pending.get('a'))).toBe(true); expect('set' in pending).toBe(false)
    coordinator.complete(submission, 'failure'); expect(pending.has('a')).toBe(true)
  })
  it('rejects foreign, replayed and invalid gesture submissions without disturbing current owners', () => {
    const { coordinator } = setup(), other = setup()
    const gesture = coordinator.beginGesture()!
    expect(() => coordinator.submitDrop(other.coordinator.beginGesture()!, { a: { x: 0, y: 0 } })).toThrow()
    expect(() => coordinator.submitDrop(gesture, { missing: { x: 0, y: 0 } })).toThrow()
    expect(() => coordinator.submitDrop(gesture, { a: { x: NaN, y: 0 } })).toThrow()
    expect(coordinator.pending.size).toBe(0)
    coordinator.cancelGesture(gesture)
    expect(() => coordinator.submitDrop(gesture, {})).toThrow()
  })
  it('requires exact complete card registrations and keeps old lineage on failure', () => {
    const { coordinator, allocator, publication } = setup(), p = publication(2)
    allocator.mockClear()
    coordinator.publish({ ...p, sample: { ...p.sample, cards: new Map([['a', 'a'], ['wrong', 'b']]) } })
    expect(allocator).not.toHaveBeenCalled(); expect(coordinator.scene.baseline).toBe('b1')
    expect(coordinator.scene.captureReady).toBe(false)
    coordinator.publish(p); expect(coordinator.scene.captureReady).toBe(true)
  })
  it('ignores stale-board publications, frame handles and copied completion receipts', () => {
    const { coordinator, publication } = setup()
    const hold = coordinator.beginFrame()!
    coordinator.activate({ storePath: '/other', board: 'B', appGeneration: 2 })
    coordinator.publish(publication(9)); coordinator.endFrame(hold)
    expect(coordinator.scene.mode).toBe('unavailable'); expect(coordinator.scene.storePath).toBe('/other')
    const fresh = setup(), submission = fresh.drop()
    fresh.coordinator.complete({ ...submission }, 'failure')
    expect(fresh.coordinator.pending.size).toBe(1)
  })
})
