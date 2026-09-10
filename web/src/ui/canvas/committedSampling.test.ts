import { describe, expect, it } from 'vitest'
import { CommittedSampling, type SamplingContext, type SamplingSource } from './committedSampling'

function fixture() {
  const probe = new CommittedSampling()
  const store = {}
  const context: SamplingContext = { store, board: 'A', generation: 0, publication: {}, captureToken: 'token', tickets: ['a'], controls: ['title:f'] }
  const publication = probe.publish(context)
  const cardOwner = Symbol('card'), controlOwner = Symbol('control')
  const source: SamplingSource = () => ({
    cards: [{ id: 'a', incarnation: publication.tickets[0]!.incarnation, owner: cardOwner, height: 180, connected: true }],
    controls: [{ id: 'title:f', owner: controlOwner, rect: { x: 12, y: -16, w: 100, h: 28 }, connected: true }],
  })
  return { probe, context, publication, source, cardOwner }
}

describe('committed sampling receipts', () => {
  it('copies and freezes complete geometry, with fresh receipts and stable geometry revision', () => {
    const f = fixture(), request = f.probe.request(f.publication, f.source)!
    const first = f.probe.sample(request, f.source, () => true)!
    const second = f.probe.sample(f.probe.request(f.publication, f.source)!, f.source, () => true)!
    expect(first).not.toBe(second)
    expect(first.complete).toBe(true)
    expect(first.captureReady).toBe(true)
    expect(second.geometryRevision).toBe(first.geometryRevision)
    expect(Object.isFrozen(first.cards[0])).toBe(true)
    expect(Object.isFrozen(first.controls[0]!.rect)).toBe(true)
    expect(first.request.publication).toBe(f.context.publication)
    expect(first.request.store).toBe(f.context.store)
  })
  it('allows complete tokenless geometry without capture readiness', () => {
    const f = fixture(), p = f.probe.publish({ ...f.context, publication: {}, captureToken: null })
    const receipt = f.probe.sample(f.probe.request(p, f.source)!, f.source, () => true)!
    expect(receipt.complete).toBe(true)
    expect(receipt.captureReady).toBe(false)
  })
  it('invalidates requests across holds even after readiness returns', () => {
    const f = fixture(), request = f.probe.request(f.publication, f.source)!
    f.probe.hold()
    expect(f.probe.sample(request, f.source, () => true)).toBeNull()
    expect(f.probe.sample(f.probe.request(f.publication, f.source)!, f.source, () => true)).not.toBeNull()
  })
  it('checks readiness before and after reads and fences intervening holds/publications', () => {
    for (const change of ['hold', 'publish', 'ready'] as const) {
      const f = fixture(), request = f.probe.request(f.publication, f.source)!
      let ready = true
      expect(f.probe.sample(request, () => {
        if (change === 'hold') f.probe.hold()
        if (change === 'publish') f.probe.publish({ ...f.context, publication: {} })
        if (change === 'ready') ready = false
        return f.source()
      }, () => ready)).toBeNull()
    }
    const f = fixture()
    expect(f.probe.sample(f.probe.request(f.publication, f.source)!, () => { throw Error('must not read') }, () => false)).toBeNull()
  })
  it('rejects old publication, foreign and copied requests', () => {
    const f = fixture(), request = f.probe.request(f.publication, f.source)!
    expect(f.probe.sample({ ...request }, f.source, () => true)).toBeNull()
    expect(new CommittedSampling().sample(request, f.source, () => true)).toBeNull()
    f.probe.publish({ ...f.context, publication: {} })
    expect(f.probe.request(f.publication, f.source)).toBeNull()
    expect(f.probe.sample(request, f.source, () => true)).toBeNull()
  })
  it('preserves incarnation on metadata publications but replaces it after deletion and A/B/A', () => {
    const f = fixture(), original = f.publication.tickets[0]!.incarnation
    const next = f.probe.publish({ ...f.context, publication: {} })
    expect(next.tickets[0]!.incarnation).toBe(original)
    f.probe.publish({ ...f.context, publication: {}, tickets: [] })
    const recreated = f.probe.publish({ ...f.context, publication: {} })
    expect(recreated.tickets[0]!.incarnation).not.toBe(original)
    expect(f.probe.sample(f.probe.request(recreated, f.source)!, f.source, () => true)).toBeNull()
    f.probe.publish({ ...f.context, board: 'B', generation: 1, publication: {} })
    const back = f.probe.publish({ ...f.context, generation: 2, publication: {} })
    expect(back.tickets[0]!.incarnation).not.toBe(recreated.tickets[0]!.incarnation)
  })
  it('rejects incomplete, extra, duplicate, disconnected and invalid geometry', () => {
    for (const change of ['missingCard', 'missingControl', 'extra', 'duplicate', 'disconnected', 'zero', 'nan'] as const) {
      const f = fixture(), data = f.source()!
      if (change === 'missingCard') data.cards = []
      if (change === 'missingControl') data.controls = []
      if (change === 'extra') data.controls.push({ ...data.controls[0]!, id: 'resize:f' })
      if (change === 'duplicate') data.cards.push(data.cards[0]!)
      if (change === 'disconnected') data.cards[0]!.connected = false
      if (change === 'zero') data.cards[0]!.height = 0
      if (change === 'nan') data.controls[0]!.rect.x = NaN
      expect(f.probe.sample(f.probe.request(f.publication, f.source)!, () => data, () => true), change).toBeNull()
    }
  })
  it('detects registration replacement during sampling and advances revision for new owners', () => {
    const f = fixture(), first = f.probe.sample(f.probe.request(f.publication, f.source)!, f.source, () => true)!
    let calls = 0
    expect(f.probe.sample(f.probe.request(f.publication, f.source)!, () => {
      const data = f.source()!
      data.cards[0]!.owner = Symbol(String(++calls))
      return data
    }, () => true)).toBeNull()
    const replacement = Symbol('replacement')
    const replaced = () => { const data = f.source()!; data.cards[0]!.owner = replacement; return data }
    const next = f.probe.sample(f.probe.request(f.publication, replaced)!, replaced, () => true)!
    expect(next.geometryRevision).toBe(first.geometryRevision + 1)
    expect(first.cards[0]!.owner).toBe(f.cardOwner)
  })
  it('binds registration owners at request time, not merely between sample reads', () => {
    const f = fixture(), request = f.probe.request(f.publication, f.source)!
    const owner = Symbol('replacement')
    expect(f.probe.sample(request, () => { const data = f.source()!; data.cards[0]!.owner = owner; return data }, () => true)).toBeNull()
  })
  it('invalidates observed creation changes even without an intervening deletion', () => {
    const f = fixture()
    const one = f.probe.publish({ ...f.context, publication: {}, births: { a: 'birth1' } })
    const two = f.probe.publish({ ...f.context, publication: {}, births: { a: 'birth2' } })
    expect(two.tickets[0]!.incarnation).not.toBe(one.tickets[0]!.incarnation)
  })
  it('clears current evidence on failed sampling and keeps control revision independent of cards', () => {
    const f = fixture(), first = f.probe.sample(f.probe.request(f.publication, f.source)!, f.source, () => true)!
    const next = f.probe.sample(f.probe.request(f.publication, f.source)!, () => { const data = f.source()!; data.cards[0]!.height++; return data }, () => true)!
    expect(first.controlRevision).toBe(1)
    expect(next.controlRevision).toBe(first.controlRevision)
    expect(next.geometryRevision).toBe(first.geometryRevision + 1)
    f.probe.sample(f.probe.request(f.publication, f.source)!, () => null, () => true)
    expect(f.probe.receipt).toBeNull()
  })
  it('accepts genuinely empty sets and reflects read-only control expectations', () => {
    const f = fixture(), empty = f.probe.publish({ ...f.context, publication: {}, tickets: [], controls: [] })
    expect(f.probe.sample(f.probe.request(empty, () => ({ cards: [], controls: [] }))!, () => ({ cards: [], controls: [] }), () => true)!.complete).toBe(true)
  })
})
