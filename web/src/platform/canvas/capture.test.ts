import { describe, expect, it } from 'vitest'
import { SceneCoordinator, sceneRect } from './scene'
import { CaptureGuard } from './capture'
import { PlacementSnapshots } from './snapshots'
import type { PlacementInput, MeasuredHeight } from './placement'
import { applyFrameOperation, FrameHistory, type Frames } from './frames'

function setup() {
  const coordinator = new SceneCoordinator(new PlacementSnapshots())
  const scope = coordinator.activate({ storePath: '/repo', board: 'A', appGeneration: 1 })
  function publication(revision = 1) {
    const input: PlacementInput & { heights: Map<string, MeasuredHeight> } = { ...scope, revision, baseline: `b${revision}`,
      tickets: ['a', 'hidden', 'owned'].map(id => ({ id, identity: `${id}:1`, labels: [] })),
      cards: { a: { x: 0, y: 0 }, hidden: { x: 500, y: 900 }, owned: { x: 0, y: 0 } },
      heights: new Map(['a', 'hidden', 'owned'].map(id => [id, { identity: `${id}:1`, height: 100 }])),
      obstacles: [], previews: new Map(), routing: { pens: {}, ruleOrder: [], inbox: { x: 50, y: 60 } } }
    const frames: Frames = { old: { title: 'Old', x: 0, y: 0, w: 200, h: 200, color: 'slate', members: ['owned'] } }
    return { input, frames, captureToken: 'capture-v1:test',
      sample: { baseline: input.baseline, revision, complete: true,
        cards: new Map(['a', 'hidden', 'owned'].map(id => [id, `registration:${id}`])), controls: new Map<string, string>() } }
  }
  const guard = new CaptureGuard()
  function publish(p = publication()) { coordinator.publish(p); guard.observe(coordinator.scene) }
  publish()
  return { coordinator, guard, publication, publish }
}
const wide = { x: -1000, y: -1000, w: 3000, h: 3000 }
function readyCapture(guard: CaptureGuard, bounds = wide) {
  const result = guard.capture(bounds)
  if (result.kind !== 'ready') throw new Error('Expected a ready capture fixture')
  return result
}

describe('Explicit scene-bound capture', () => {
  it('distinguishes a valid empty capture from unavailable geometry', () => {
    const { guard, coordinator } = setup()
    const empty = guard.capture({ x: -900, y: -900, w: 10, h: 10 })
    expect(empty).toMatchObject({ kind: 'ready', members: [], captureToken: 'capture-v1:test' })
    expect(guard.validate(empty)).toEqual({ ok: true })
    coordinator.beginGesture(); guard.observe(coordinator.scene)
    expect(guard.capture(wide).kind).toBe('unavailable')
    expect(guard.validate(empty).ok).toBe(false)
  })
  it('uses inclusive centers and the complete collection without stealing owned members', () => {
    const { guard } = setup()
    // a's center lies exactly on the lower boundary; hidden's on the upper boundary.
    const result = readyCapture(guard, { x: 140, y: 50, w: 500, h: 900 })
    expect(result).toMatchObject({ kind: 'ready', members: ['a', 'hidden'] })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.members)).toBe(true)
    expect(result.rectangles.get('hidden')).toMatchObject({ x: 500, y: 900, width: 280, height: 100 })
  })
  it.each(['height', 'control', 'registration', 'baseline', 'identity', 'ownership', 'manual'] as const)(
    'invalidates a captured preview on a changed %s without silent recapture', change => {
      const { guard, publication, publish } = setup(), capture = readyCapture(guard), p = publication(2)
      if (change === 'height') p.input.heights.set('a', { identity: 'a:1', height: 489 })
      if (change === 'control') {
        p.input.obstacles = [{ id: 'frame:old:title', x: -20, y: -18, width: 350, height: 80 }]
        p.sample.controls.set('frame:old:title', 'control-owner')
      }
      if (change === 'registration') p.sample.cards.set('a', 'replacement')
      if (change === 'identity') {
        p.input.tickets = p.input.tickets.map(t => t.id === 'a' ? { ...t, identity: 'a:2' } : t)
        p.input.heights.set('a', { identity: 'a:2', height: 100 })
      }
      if (change === 'ownership') p.frames.old.members.push('a')
      if (change === 'manual') p.input.cards = { ...p.input.cards, a: { x: 1000, y: 1000 } }
      publish(p)
      expect(guard.validate(capture).ok).toBe(false)
      expect(capture.members).toEqual(['a', 'hidden'])
      expect(guard.validate(guard.capture(wide))).toEqual({ ok: true })
    })
  it('rejects same-baseline measurement changes and observed change-back, not only ticket edits', () => {
    const { guard, publication, publish } = setup(), capture = readyCapture(guard)
    const changed = publication(2); changed.input.baseline = 'b1'; changed.sample.baseline = 'b1'
    changed.input.heights.set('a', { identity: 'a:1', height: 489 }); publish(changed)
    expect(guard.validate(capture).ok).toBe(false)
    const restored = publication(3); restored.input.baseline = 'b1'; restored.sample.baseline = 'b1'; publish(restored)
    expect(guard.validate(capture).ok).toBe(false)
  })
  it('cannot borrow an old capture after board A/B/A or store replacement', () => {
    const { guard, coordinator, publication } = setup(), capture = readyCapture(guard)
    coordinator.activate({ storePath: '/repo', board: 'B', appGeneration: 2 }); guard.observe(coordinator.scene)
    const scope = coordinator.activate({ storePath: '/repo', board: 'A', appGeneration: 3 })
    const p = publication(); Object.assign(p.input, scope); coordinator.publish(p); guard.observe(coordinator.scene)
    expect(guard.validate(capture).ok).toBe(false)
    const current = guard.capture(wide)
    coordinator.activate({ storePath: '/different', board: 'A', appGeneration: 4 }); guard.observe(coordinator.scene)
    expect(guard.validate(current).ok).toBe(false)
  })
  it('blocks capture while pending saves, frame holds, or provisional inputs exist', () => {
    const { guard, coordinator, publication, publish } = setup()
    const gesture = coordinator.beginGesture()!
    const save = coordinator.submitDrop(gesture, { a: { x: 100, y: 200 } }); publish(publication(2))
    expect(guard.capture(wide).kind).toBe('unavailable')
    coordinator.complete(save, 'failure'); publish(publication(3))
    const hold = coordinator.beginFrame()!; guard.observe(coordinator.scene)
    expect(guard.capture(wide).kind).toBe('unavailable')
    coordinator.endFrame(hold); const provisional = publication(4); provisional.input.heights.delete('hidden'); publish(provisional)
    expect(guard.capture(wide).kind).toBe('unavailable')
  })
  it('moves every explicit member using the same scene and keeps automatic null preimages', () => {
    const { coordinator, guard, publication, publish } = setup(), p = publication(2)
    p.frames.old.members = ['a', 'hidden']; p.input.cards = { a: { x: 0, y: 0 } }; publish(p)
    const hidden = sceneRect(coordinator.scene, 'hidden')!
    const prepared = guard.prepareMove('old', { x: 30, y: -10 })
    expect(prepared.kind).toBe('ready')
    if (prepared.kind !== 'ready') throw new Error('Expected a prepared frame move')
    expect(prepared.operation.cards).toEqual({ a: { x: 30, y: -10 }, hidden: { x: hidden.x + 30, y: hidden.y - 10 } })
    expect(prepared.operation.expect.cards).toEqual({ a: { x: 0, y: 0 }, hidden: null })
    expect(guard.validate(prepared.capture)).toEqual({ ok: true })
    const history = new FrameHistory(), before = { cards: p.input.cards, frames: p.frames, tickets: new Set(['a', 'hidden', 'owned']) }
    const accepted = applyFrameOperation(before, prepared.operation); history.record(prepared.operation, accepted)
    // A new routing destination while manual must not block restoration to automatic.
    const rerouted = publication(3); rerouted.input.routing.inbox = { x: -800, y: 300 }
    rerouted.input.cards = accepted.cards; rerouted.frames = accepted.frames; publish(rerouted)
    const undo = history.undo(accepted)
    expect(undo.cards.hidden).toBeNull()
    const undone = applyFrameOperation(accepted, undo); history.acceptUndo(undo, undone)
    const current = publication(4); current.input.cards = undone.cards; current.frames = undone.frames
    current.input.routing.inbox = { x: -800, y: 300 }; publish(current)
    // owned reached the new Inbox while hidden was manual and retains its slot.
    expect(sceneRect(coordinator.scene, 'owned')).toMatchObject({ x: -800, y: 300, mode: 'automatic' })
    expect(sceneRect(coordinator.scene, 'hidden')).toMatchObject({ x: -800, y: 176, mode: 'automatic' })
    const redo = guard.armRedo(['hidden'])
    expect(guard.validateRedo(redo).ok).toBe(true)
    const moved = publication(5); moved.input.cards = undone.cards; moved.frames = undone.frames
    moved.input.routing.inbox = { x: 1000, y: 1000 }; publish(moved)
    expect(guard.validateRedo(redo).ok).toBe(false)
    const back = { ...current, input: { ...current.input, revision: 6, baseline: 'b6' },
      sample: { ...current.sample, revision: 6, baseline: 'b6' } }; publish(back)
    expect(guard.validateRedo(redo).ok).toBe(false)
  })
})
