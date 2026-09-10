import { describe, expect, it, vi } from 'vitest'
import { allocatePlacement, type PlacementInput, type PlacementSnapshot } from './placement'
import { PlacementSnapshots, type BoardScope } from './snapshots'

function input(scope: BoardScope, revision = 1, baseline = `r${revision}`): PlacementInput {
  return { ...scope, revision, baseline, tickets: ['a', 'b'].map(id => ({ id, identity: `${id}-born`, labels: ['x', 'y'] })),
    cards: {}, previews: new Map(), obstacles: [], heights: new Map(['a', 'b'].map(id => [id, { identity: `${id}-born`, height: 100 }])),
    routing: { pens: { p: { title: 'Pen', x: 0, y: 0, w: 632, h: 296, color: '#759bcc', pin: { x: 24, y: 24 }, requiredLabels: ['x'] } },
      ruleOrder: ['p'], inbox: { x: -1000, y: 0 } } }
}
function setup() {
  const allocator = vi.fn(allocatePlacement), controller = new PlacementSnapshots(allocator)
  return { allocator, controller, scope: controller.activate('A') }
}
function snapshot(result: ReturnType<PlacementSnapshots['accept']>): PlacementSnapshot {
  if (!result.ok) throw new Error(JSON.stringify(result.error))
  return result.snapshot
}

describe('Placement snapshot ownership', () => {
  it('activates immutable scopes and leaves getters computation-free', () => {
    const { controller, allocator, scope } = setup()
    expect(Object.isFrozen(scope)).toBe(true)
    for (let i = 0; i < 10; i++) {
      expect(controller.accepted).toBeNull(); expect(controller.proposed).toBeNull(); expect(controller.failure).toBeNull()
    }
    expect(allocator).not.toHaveBeenCalled()
    snapshot(controller.accept(input(scope)))
    for (let i = 0; i < 10; i++) { void controller.accepted; void controller.proposed; void controller.failure }
    expect(allocator).toHaveBeenCalledTimes(1)
  })
  it('reuses identical inputs and ignores metadata, filters, title, color and ticket label order', () => {
    const { controller, allocator, scope } = setup(), initial = snapshot(controller.accept(input(scope)))
    const noise = { ...input(scope), filter: 'nothing', tickets: input(scope).tickets.map(t => ({ ...t, title: 'Renamed', labels: ['y', 'x', 'x'] })) }
    noise.routing.pens.p.title = 'Renamed'; noise.routing.pens.p.color = '#b499be'
    const result = controller.accept(noise)
    expect(snapshot(result)).toBe(initial)
    expect(result.work).toEqual({ candidates: 0, collisionChecks: 0, retained: 0 })
    expect(allocator).toHaveBeenCalledTimes(1)
    expect(initial.positions.size).toBe(2); expect(initial.evaluation.counts.pens.get('p')).toBe(2)
  })
  it('retags lineage without copying immutable content or invoking allocation', () => {
    const { controller, allocator, scope } = setup(), first = snapshot(controller.accept(input(scope)))
    const next = snapshot(controller.accept(input(scope, 2)))
    expect(next).not.toBe(first); expect(next).toMatchObject({ ...scope, revision: 2, baseline: 'r2' })
    expect(next.positions).toBe(first.positions); expect(next.evaluation).toBe(first.evaluation)
    expect(next.overflow).toBe(first.overflow); expect(next.overflowCounts).toBe(first.overflowCounts)
    expect(Object.isFrozen(next)).toBe(true); expect(first.revision).toBe(1)
    expect(allocator).toHaveBeenCalledTimes(1)
  })
  it('always allocates proposals from accepted positions, not previous proposed slots', () => {
    const { controller, allocator, scope } = setup(), accepted = snapshot(controller.accept(input(scope)))
    const draft = input(scope); draft.routing.pens.p.pin = { x: 328, y: 148 }
    const proposed = snapshot(controller.propose(draft, 'editor-1'))
    expect(controller.accepted).toBe(accepted); expect(controller.proposed).toBe(proposed)
    const draft2 = input(scope); draft2.routing.pens.p.pin = { x: 328, y: 24 }
    snapshot(controller.propose(draft2, 'editor-2'))
    expect(allocator.mock.calls[1][1]).toBe(accepted); expect(allocator.mock.calls[2][1]).toBe(accepted)
    expect(controller.cancel(scope, 'editor-1')).toBe(false)
    expect(controller.cancel(scope, 'editor-2')).toBe(true)
    expect(controller.proposed).toBeNull(); expect(controller.accepted).toBe(accepted)
    expect(allocator).toHaveBeenCalledTimes(3)
  })
  it('reuses equal proposals and rejects empty owners', () => {
    const { controller, allocator, scope } = setup(); controller.accept(input(scope))
    const draft = input(scope); draft.routing.pens.p.pin = { x: 328, y: 24 }
    const first = snapshot(controller.propose(draft, 'one'))
    expect(snapshot(controller.propose(draft, 'one'))).toBe(first)
    expect(allocator).toHaveBeenCalledTimes(2)
    expect(controller.propose(draft, '')).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
  })
  it('invalidates a proposal on a new accepted baseline even for equal geometry', () => {
    const { controller, scope } = setup(); controller.accept(input(scope))
    const draft = input(scope); draft.routing.pens.p.pin.x = 328
    controller.propose(draft, 'one'); controller.accept(input(scope, 2))
    expect(controller.proposed).toBeNull()
    expect(controller.propose(draft, 'late')).toMatchObject({ ok: false, error: { code: 'no-baseline' } })
  })
  it('never promotes proposed geometry without accepted input', () => {
    const { controller, scope } = setup(), accepted = snapshot(controller.accept(input(scope)))
    const draft = input(scope); draft.routing.pens.p.pin.x = 328
    controller.propose(draft, 'one')
    expect(snapshot(controller.accept(input(scope, 2))).positions).toBe(accepted.positions)
    expect(controller.proposed).toBeNull()
    const actual = { ...draft, revision: 3, baseline: 'r3' }
    expect(snapshot(controller.accept(actual)).positions.get('a')?.x).toBe(328)
  })
  it('preserves old lineage after a failed accepted update and blocks stale proposals', () => {
    const { controller, scope } = setup(), good = snapshot(controller.accept(input(scope)))
    controller.propose(input(scope), 'one')
    const bad = input(scope, 3); bad.heights = new Map([['a', { identity: 'a-born', height: 3e9 }]])
    expect(controller.accept(bad)).toMatchObject({ ok: false, error: { code: 'coordinate-exhausted' } })
    expect(controller.accepted).toBe(good); expect(controller.accepted?.revision).toBe(1)
    expect(controller.proposed).toBeNull(); expect(controller.failure?.code).toBe('coordinate-exhausted')
    expect(controller.propose(input(scope), 'stale')).toMatchObject({ ok: false, error: { code: 'no-baseline' } })
    expect(controller.accept(input(scope, 2))).toMatchObject({ ok: false, error: { code: 'stale-input' } })
    expect(controller.accepted).toBe(good)
    snapshot(controller.accept(input(scope, 4))); expect(controller.failure).toBeNull()
  })
  it('records the revision watermark even when canonicalization fails', () => {
    const { controller, scope } = setup(), good = snapshot(controller.accept(input(scope)))
    const bad = input(scope, 3); bad.routing.ruleOrder = []
    expect(controller.accept(bad)).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
    expect(controller.accept(input(scope, 2))).toMatchObject({ ok: false, error: { code: 'stale-input' } })
    expect(controller.accept(input(scope, 3))).toMatchObject({ ok: false, error: { code: 'revision-conflict' } })
    expect(controller.accepted).toBe(good)
    snapshot(controller.accept(input(scope, 4))); expect(controller.failure).toBeNull()
  })
  it('rejects stale revisions and conflicting reuse of revisions or baselines', () => {
    const { controller, scope } = setup(), good = snapshot(controller.accept(input(scope, 2)))
    expect(controller.accept(input(scope, 1))).toMatchObject({ ok: false, error: { code: 'stale-input' } })
    expect(controller.accept(input(scope, 2, 'different'))).toMatchObject({ ok: false, error: { code: 'revision-conflict' } })
    const changed = input(scope, 2); changed.routing.inbox.x = -2000
    expect(controller.accept(changed)).toMatchObject({ ok: false, error: { code: 'revision-conflict' } })
    expect(controller.accepted).toBe(good)
  })
  it('ignores malformed stale payloads without poisoning a newer accepted baseline', () => {
    const { controller, scope } = setup(), good = snapshot(controller.accept(input(scope, 3)))
    controller.propose(input(scope, 3), 'one')
    const proposed = controller.proposed
    const stale = input(scope, 2, ''); stale.routing.ruleOrder = []
    expect(controller.accept(stale)).toMatchObject({ ok: false, error: { code: 'stale-input' } })
    expect(controller.failure).toBeNull(); expect(controller.accepted).toBe(good); expect(controller.proposed).toBe(proposed)
  })
  it('isolates A/B/A generations while reusing each board last-good content', () => {
    const { controller, allocator, scope: a1 } = setup(), a = snapshot(controller.accept(input(a1)))
    const b = controller.activate('B'); expect(controller.accepted).toBeNull()
    const bi = input(b); bi.routing.pens.p.pin.x = 328
    const bs = snapshot(controller.accept(bi))
    const a2 = controller.activate('A'); expect(controller.accepted).toBeNull(); expect(a2.generation).toBeGreaterThan(b.generation)
    expect(controller.accept(input(a1, 99))).toMatchObject({ ok: false, error: { code: 'stale-input' } })
    expect(controller.cancel(a1, 'one')).toBe(false)
    const again = snapshot(controller.accept(input(a2)))
    expect(again.positions).toBe(a.positions); expect(again.generation).toBe(a2.generation)
    const b2 = controller.activate('B'); bi.generation = b2.generation
    expect(snapshot(controller.accept(bi)).positions).toBe(bs.positions)
    expect(allocator).toHaveBeenCalledTimes(2)
  })
  it('rejects proposals without an accepted baseline or with the wrong scope', () => {
    const { controller, scope } = setup()
    expect(controller.propose(input(scope), 'one')).toMatchObject({ ok: false, error: { code: 'no-baseline' } })
    controller.accept(input(scope)); const other = controller.activate('B')
    expect(controller.propose(input(scope), 'one')).toMatchObject({ ok: false, error: { code: 'stale-input' } })
    expect(controller.propose(input(other), 'one')).toMatchObject({ ok: false, error: { code: 'no-baseline' } })
  })
  it('does not let a failed proposal poison accepted reuse or leave a partial proposal', () => {
    const { controller, scope } = setup(), good = snapshot(controller.accept(input(scope)))
    controller.propose(input(scope), 'one')
    const bad = input(scope); bad.heights = new Map([['a', { identity: 'a-born', height: 3e9 }]])
    expect(controller.propose(bad, 'two').ok).toBe(false)
    expect(controller.proposed).toBeNull(); expect(controller.accepted).toBe(good); expect(controller.failure).toBeNull()
    expect(snapshot(controller.propose(input(scope), 'three')).positions).toBe(good.positions)
  })
  it('ignores old measurements and previews but resets deleted/recreated identities', () => {
    const { controller, allocator, scope } = setup(); controller.accept(input(scope))
    const deleted = input(scope, 2); deleted.tickets = deleted.tickets.filter(t => t.id !== 'a')
    const without = snapshot(controller.accept(deleted)); expect(without.positions.has('a')).toBe(false)
    const stale = { ...deleted, revision: 3, baseline: 'r3', previews: new Map([['a', { identity: 'a-born', owner: 'old', card: { x: 999, y: 999 } }]]) }
    expect(snapshot(controller.accept(stale)).positions).toBe(without.positions)
    expect(allocator).toHaveBeenCalledTimes(2)
    const reborn = input(scope, 4); reborn.tickets = reborn.tickets.map(t => t.id === 'a' ? { ...t, identity: 'reborn' } : t)
    reborn.previews = stale.previews
    expect(snapshot(controller.accept(reborn)).positions.get('a')).toMatchObject({ identity: 'reborn', mode: 'automatic', provisional: true, height: 340 })
  })
  it('does not retain mutable input aliases in the accepted cache', () => {
    const { controller, scope } = setup(), value = input(scope), cards = { a: { x: 24, y: 24 } }
    value.cards = cards
    const good = snapshot(controller.accept(value))
    value.routing.pens.p.pin.x = 328; cards.a.x = 5000
    const original = input(scope); original.cards = { a: { x: 24, y: 24 } }
    expect(snapshot(controller.accept(original))).toBe(good)
    expect(good.positions.get('a')?.x).toBe(24)
    expect(() => { (good as { revision: number }).revision = 99 }).toThrow()
    expect(() => { (good.positions.get('a') as { x: number }).x = 99 }).toThrow()
    expect('set' in good.positions).toBe(false)
  })
  it('retries an identical failed allocation but rejects changed content at its revision', () => {
    const { controller, allocator, scope } = setup(); controller.accept(input(scope))
    allocator.mockReturnValueOnce({ ok: false, error: { code: 'search-exhausted', message: 'budget' }, work: { candidates: 1, collisionChecks: 0, retained: 0 } })
    const next = input(scope, 2); next.routing.pens.p.pin.x = 328
    expect(controller.accept(next).ok).toBe(false)
    const altered = input(scope, 2); altered.routing.pens.p.pin.x = 100
    expect(controller.accept(altered)).toMatchObject({ ok: false, error: { code: 'revision-conflict' } })
    expect(snapshot(controller.accept(next)).positions.get('a')?.x).toBe(328)
    expect(controller.failure).toBeNull()
  })
})
