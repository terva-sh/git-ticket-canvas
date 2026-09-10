import { describe, expect, it, vi } from 'vitest'
import { PublicationBridge, type PublicationState, type ReportRequest } from './publications'
import { PlacementSnapshots } from './snapshots'
import { allocatePlacement } from './placement'

function state(overrides: Partial<PublicationState> = {}): PublicationState {
  return { board: 'A', storePath: '/store', layoutSchema: 3, tickets: new Map([
    ['a', { id: 'a', createdAt: 'birth', labels: ['ui'] }], ['b', { id: 'b', createdAt: 'birth', labels: [] }],
  ]), cards: {}, pens: {}, ruleOrder: [], inbox: { x: 40, y: 40 }, ...overrides }
}
function setup() {
  const allocator = vi.fn(allocatePlacement), controller = new PlacementSnapshots(allocator)
  const accept = vi.spyOn(controller, 'accept'), activate = vi.spyOn(controller, 'activate'), propose = vi.spyOn(controller, 'propose')
  const onResult = vi.fn(), bridge = new PublicationBridge({ controller, obstacles: [], onResult })
  return { bridge, controller, allocator, accept, activate, propose, onResult }
}
function sample(token: ReportRequest, height = 100) {
  return Object.freeze({ token, heights: new Map([...token.publication.identities.keys()].map(id => [id, height])),
    registrations: new Map([...token.publication.identities.keys()].map(id => [id, Symbol(id)])) })
}
function settle(bridge: PublicationBridge, publication = bridge.current!, height = 100) {
  const request = bridge.request(publication)
  return request ? bridge.report(request, sample(request, height), true) : null
}

describe('Test-only accepted publication bridge', () => {
  it('does not issue a request for an incomplete publication', () => {
    const { bridge } = setup()
    expect(bridge.request(bridge.current)).toBeNull()
    bridge.publish(state({ layoutSchema: null }), 0)
    expect(bridge.request(bridge.current)).toBeNull()
  })
  it('activates incomplete generations without accepting placeholder tickets', () => {
    const { bridge, accept, activate } = setup()
    expect(bridge.publish(state({ layoutSchema: null }), 0)).toBeNull()
    expect(activate).toHaveBeenCalledTimes(1); expect(accept).not.toHaveBeenCalled()
    const complete = bridge.publish(state(), 0)!
    expect(complete.scope.generation).toBe(1); expect(accept).not.toHaveBeenCalled()
    expect(settle(bridge)?.ok).toBe(true); expect(accept).toHaveBeenCalledTimes(1)
  })
  it('deduplicates the same publication and equivalent successful reports, never proposing', () => {
    const { bridge, accept, propose, allocator } = setup(), s = state(), pub = bridge.publish(s, 0)!
    expect(bridge.publish(s, 0)).toBe(pub)
    expect(settle(bridge)?.ok).toBe(true)
    expect(settle(bridge)).toBeNull(); expect(accept).toHaveBeenCalledTimes(1)
    expect(allocator).toHaveBeenCalledTimes(1); expect(propose).not.toHaveBeenCalled()
  })
  it('requires fresh baseline-tagged reports even at equal heights and reuses nested content', () => {
    const { bridge, controller, allocator, accept } = setup(), first = bridge.publish(state(), 0)!
    const oldRequest = bridge.request(first)!, oldSample = sample(oldRequest)
    bridge.report(oldRequest, oldSample, true); const old = controller.accepted!
    const next = bridge.publish(state(), 0)!, request = bridge.request(next)!
    expect(next.baseline).not.toBe(first.baseline)
    expect(bridge.report(request, oldSample, true)).toBeNull()
    expect(controller.accepted).toBe(old)
    expect(bridge.report(request, sample(request), true)?.ok).toBe(true)
    expect(controller.accepted!.baseline).toBe(next.baseline)
    expect(controller.accepted!.revision).toBeGreaterThan(old.revision)
    expect(controller.accepted!.positions).toBe(old.positions)
    expect(allocator).toHaveBeenCalledTimes(1); expect(accept).toHaveBeenCalledTimes(2)
  })
  it('keeps measurement-only updates on their publication baseline', () => {
    const { bridge, controller, accept } = setup(), pub = bridge.publish(state(), 0)!
    settle(bridge); const old = controller.accepted!
    settle(bridge, pub, 190)
    expect(controller.accepted!.baseline).toBe(old.baseline)
    expect(controller.accepted!.revision).toBeGreaterThan(old.revision)
    expect(controller.accepted!.positions.get('a')!.height).toBe(190)
    expect(accept.mock.calls.at(-1)![0].previews.size).toBe(0)
  })
  it('fences pre-hold reports and flushes only the latest publication after committed readiness', () => {
    const { bridge, accept } = setup(), first = bridge.publish(state(), 0)!, early = bridge.request(first)!
    bridge.hold()
    expect(bridge.report(early, sample(early), true)).toBeNull()
    const held = bridge.request(first)!
    expect(bridge.report(held, sample(held), false)).toBeNull()
    bridge.publish(state({ inbox: { x: 500, y: 500 } }), 0)
    expect(settle(bridge, first)).toBeNull()
    const current = bridge.current!, beforeSave = bridge.request(current)!
    bridge.hold()
    expect(bridge.report(beforeSave, sample(beforeSave), true)).toBeNull()
    expect(accept).not.toHaveBeenCalled()
    expect(settle(bridge)?.ok).toBe(true)
    expect(accept).toHaveBeenCalledTimes(1); expect(accept.mock.calls[0][0].routing.inbox.x).toBe(500)
  })
  it('rejects older reports after a newer report, and reports after disposal', () => {
    const { bridge, accept } = setup(), pub = bridge.publish(state(), 0)!
    const old = bridge.request(pub)!, next = bridge.request(pub)!
    expect(bridge.report(next, sample(next), true)?.ok).toBe(true)
    expect(bridge.report(old, sample(old, 900), true)).toBeNull()
    const pending = bridge.request(pub)!; bridge.dispose()
    expect(bridge.report(pending, sample(pending), true)).toBeNull()
    expect(bridge.request(pub)).toBeNull(); expect(bridge.publish(state(), 1)).toBeNull()
    expect(accept).toHaveBeenCalledTimes(1)
  })
  it('requires the complete current registration set, including unmeasured tickets', () => {
    const { bridge, accept } = setup(), pub = bridge.publish(state(), 0)!, request = bridge.request(pub)!
    const incomplete = sample(request); incomplete.registrations.delete('b')
    expect(bridge.report(request, incomplete, true)).toBeNull()
    const extra = sample(request); extra.registrations.set('removed', Symbol())
    expect(bridge.report(request, extra, true)).toBeNull()
    expect(accept).not.toHaveBeenCalled()
    const unmeasured = sample(request); unmeasured.heights.delete('b')
    expect(bridge.report(request, unmeasured, true)?.ok).toBe(true)
    expect(accept.mock.calls[0][0].tickets).toHaveLength(2)
    expect(accept.mock.calls[0][0].heights.has('b')).toBe(false)
  })
  it('isolates A/B/A generations while keeping observed ticket identities', () => {
    const { bridge, controller } = setup(), a = bridge.publish(state(), 0)!
    settle(bridge); const old = controller.accepted!, request = bridge.request(a)!
    bridge.publish(state({ board: 'B', layoutSchema: null }), 1)
    expect(controller.accepted).toBeNull()
    const b = bridge.publish(state({ board: 'B' }), 1)!
    expect(b.identities.get('a')).toBe(a.identities.get('a')); settle(bridge)
    const again = bridge.publish(state(), 2)!
    expect(again.scope.generation).not.toBe(a.scope.generation)
    expect(bridge.report(request, sample(request), true)).toBeNull()
    settle(bridge); expect(controller.accepted!.positions).toBe(old.positions)
  })
  it('distinguishes observed disappearance, creation changes and store changes, not ordinary revisions', () => {
    const { bridge } = setup(), original = state(), a = bridge.publish(original, 0)!
    const edited = state({ tickets: new Map([...original.tickets].map(([id, t]) => [id, { ...t, title: 'edited', revision: 'new' }])) })
    expect(bridge.publish(edited, 0)!.identities.get('a')).toBe(a.identities.get('a'))
    bridge.publish(state({ tickets: new Map() }), 0)
    const reappeared = bridge.publish(state(), 0)!
    expect(reappeared.identities.get('a')).not.toBe(a.identities.get('a'))
    const recreated = bridge.publish(state({ tickets: new Map([['a', { id: 'a', createdAt: 'later', labels: [] }]]) }), 0)!
    expect(recreated.identities.get('a')).not.toBe(reappeared.identities.get('a'))
    const other = bridge.publish(state({ storePath: '/other' }), 0)!
    expect(other.identities.get('a')).not.toBe(a.identities.get('a'))
  })
  it('copies publications and fixture obstacles without mutating caller state', () => {
    const s = state(), obstacles = [{ id: 'fixture', x: 40, y: 40, width: 100, height: 100 }]
    const controller = new PlacementSnapshots(), accept = vi.spyOn(controller, 'accept')
    const bridge = new PublicationBridge({ controller, obstacles }), pub = bridge.publish(s, 0)!
    expect(Object.isFrozen(pub)).toBe(true); expect('set' in pub.identities).toBe(false)
    obstacles[0].x = 999; s.inbox.x = 999; s.cards.a = { x: 999, y: 999 }
    settle(bridge)
    expect(accept.mock.calls[0][0].routing.inbox.x).toBe(40)
    expect(accept.mock.calls[0][0].obstacles[0].x).toBe(40)
    expect(accept.mock.calls[0][0].cards).toEqual({})
  })
  it('retains old lineage on calculation failure and permits retry/recovery', () => {
    const { bridge, controller, onResult, accept } = setup(); bridge.publish(state(), 0); settle(bridge)
    const old = controller.accepted!, next = bridge.publish(state(), 0)!
    expect(settle(bridge, next, 3e9)?.ok).toBe(false)
    expect(controller.accepted).toBe(old); expect(controller.failure).not.toBeNull()
    expect(settle(bridge, next, 3e9)?.ok).toBe(false)
    expect(settle(bridge)?.ok).toBe(true); expect(controller.failure).toBeNull()
    expect(controller.accepted!.baseline).toBe(next.baseline)
    expect(accept).toHaveBeenCalledTimes(4); expect(onResult).toHaveBeenCalledTimes(4)
  })
})
