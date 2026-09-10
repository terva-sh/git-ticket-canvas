import { describe, expect, it, vi } from 'vitest'
import { CaptureGuard } from './capture'
import { SceneCoordinator, type ScenePublication } from './scene'
import { PlacementSnapshots } from './snapshots'
import { allocatePlacement } from './placement'

const bounds = { x: -1000, y: -1000, w: 4000, h: 4000 }
function setup() {
  const allocator = vi.fn(allocatePlacement), coordinator = new SceneCoordinator(new PlacementSnapshots(allocator))
  const scope = coordinator.activate({ storePath: '/repo', board: 'A', appGeneration: 1 })
  const registration = Symbol('card'), control = Symbol('control')
  const publication = (): ScenePublication => ({ input: { ...scope, revision: 1, baseline: 'b1',
    tickets: [{ id: 'a', identity: 'a:1', labels: [] }], cards: {}, previews: new Map(), obstacles: [],
    heights: new Map([['a', { identity: 'a:1', height: 100 }]]),
    routing: { pens: {}, ruleOrder: [], inbox: { x: 0, y: 0 } } },
    frames: { f: { title: 'F', x: 0, y: 0, w: 100, h: 100, color: 'slate', members: ['a'] } },
    captureToken: 'token', sample: { baseline: 'b1', revision: 1, complete: true,
      cards: new Map([['a', registration]]), controls: new Map([['f:title', control]]) } })
  const guard = new CaptureGuard()
  function publish(p = publication()) { coordinator.publish(p); guard.observe(coordinator.scene) }
  publish()
  return { allocator, coordinator, guard, publication, publish }
}

describe('Local capture receipt regressions', () => {
  it('starts unavailable and never treats unavailability as an empty success', () => {
    const guard = new CaptureGuard(), capture = guard.capture(bounds)
    expect(capture.kind).toBe('unavailable'); expect(guard.validate(capture).ok).toBe(false)
    expect(guard.prepareMove('f', { x: 1, y: 1 }).kind).toBe('unavailable')
    expect(guard.validateRedo(guard.armRedo([])).ok).toBe(false)
  })
  it('retains receipts for equivalent envelopes and repeated observations without engine work', () => {
    const { guard, coordinator, allocator, publish } = setup()
    const capture = guard.capture(bounds), redo = guard.armRedo(['a'])
    guard.observe(coordinator.scene); publish(); allocator.mockClear()
    for (let i = 0; i < 5; i++) {
      expect(guard.validate(capture)).toEqual({ ok: true })
      expect(guard.validateRedo(redo)).toEqual({ ok: true })
      guard.capture(bounds); guard.prepareMove('f', { x: 1, y: 1 })
    }
    expect(allocator).not.toHaveBeenCalled()
  })
  it.each(['card owner', 'control owner', 'token', 'frame title'] as const)(
    'invalidates same-lineage %s changes and cannot revive receipts on change-back', change => {
      const { guard, publication, publish } = setup(), capture = guard.capture(bounds), redo = guard.armRedo(['a'])
      const p = publication()
      if (change === 'frame title') p.frames.f.title = 'Changed'
      publish(change === 'token' ? { ...p, captureToken: 'new-token' }
        : change === 'card owner' ? { ...p, sample: { ...p.sample, cards: new Map([['a', Symbol('card')]]) } }
          : change === 'control owner' ? { ...p, sample: { ...p.sample, controls: new Map([['f:title', Symbol('control')]]) } } : p)
      expect(guard.validate(capture).ok).toBe(false); expect(guard.validateRedo(redo).ok).toBe(false)
      publish(); expect(guard.validate(capture).ok).toBe(false); expect(guard.validateRedo(redo).ok).toBe(false)
      expect(guard.validate(guard.capture(bounds))).toEqual({ ok: true })
    })
  it('rejects copied and foreign receipts even for the same observed scene', () => {
    const { guard, coordinator } = setup(), other = new CaptureGuard()
    other.observe(coordinator.scene)
    const capture = guard.capture(bounds), redo = guard.armRedo(['a'])
    expect(guard.validate({ ...capture }).ok).toBe(false); expect(other.validate(capture).ok).toBe(false)
    expect(guard.validateRedo({ ...redo }).ok).toBe(false); expect(other.validateRedo(redo).ok).toBe(false)
  })
  it.each([NaN, Infinity, -1, 0])('refuses invalid capture width %s', w => {
    const { guard } = setup()
    expect(guard.capture({ ...bounds, w }).kind).toBe('unavailable')
  })
  it('does not resurrect a receipt after an unavailable scene returns unchanged', () => {
    const { guard, coordinator, publish } = setup(), capture = guard.capture(bounds), redo = guard.armRedo(['a'])
    const gesture = coordinator.beginGesture()!; guard.observe(coordinator.scene)
    coordinator.cancelGesture(gesture); publish()
    expect(guard.validate(capture).ok).toBe(false); expect(guard.validateRedo(redo).ok).toBe(false)
  })
  it('rejects missing members, absent frames and invalid deltas without partial operations', () => {
    const { guard, publication, publish } = setup()
    expect(guard.prepareMove('absent', { x: 1, y: 1 }).kind).toBe('unavailable')
    expect(guard.prepareMove('f', { x: NaN, y: 1 }).kind).toBe('unavailable')
    expect(guard.prepareMove('f', { x: 0, y: 0 }).kind).toBe('noop')
    expect(guard.armRedo(['absent']).kind).toBe('unavailable')
    const p = publication(); p.frames.f.members.push('absent'); publish(p)
    expect(guard.prepareMove('f', { x: 1, y: 1 }).kind).toBe('unavailable')
  })
  it('freezes capture rectangles, move operations and automatic null preimages', () => {
    const { guard, coordinator } = setup(), prepared = guard.prepareMove('f', { x: 10.125, y: -10.125 })
    expect(prepared.kind).toBe('ready')
    if (prepared.kind !== 'ready') throw new Error('Expected move fixture')
    expect(prepared.operation.cards.a).toEqual({ x: 10.13, y: -10.13 })
    expect(prepared.operation.expect.cards.a).toBeNull()
    expect(prepared.capture.members).toEqual(['a'])
    expect(Object.isFrozen(prepared.operation.cards.a)).toBe(true)
    expect(Object.isFrozen(prepared.operation.expect.frames.f!.members)).toBe(true)
    expect('set' in prepared.capture.rectangles).toBe(false)
    prepared.capture.rectangles.forEach((_rect, _id, map) => expect(map).toBe(prepared.capture.rectangles))
    expect(coordinator.scene.cards).toEqual({})
  })
})
