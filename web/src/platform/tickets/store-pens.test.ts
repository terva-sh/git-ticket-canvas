import { describe, expect, it, vi } from 'vitest'
import { ApiError, TicketClient, type BoardRead } from './client'
import { TicketStore } from './store'
import type { Board, BoardResponse, LayoutRequest, Routing, RoutingTransaction, TicketResponse } from './types'

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function routing(): Routing {
  const pen = { title: 'Frontend', x: 0, y: 0, w: 500, h: 300, color: '#759bcc', pin: { x: 20, y: 30 }, requiredLabels: ['UI', 'has spaces', 'a,b', 'unused'] }
  return { pens: { p: pen, q: { ...structuredClone(pen), title: 'Other' } }, ruleOrder: ['q', 'p'], inbox: { x: -500, y: 40 } }
}
function data(): BoardResponse {
  return { tickets: [{ id: 'TKT-1', short: 'TKT-1', title: 'One', revision: 'r1', type: 'task', status: 'draft', priority: 'normal',
    labels: ['UI'], assignees: [], dependencies: [], blocksOn: 'none', references: [], archived: false,
    createdAt: '', updatedAt: '', body: { description: '', plan: '', summary: '', acceptanceCriteria: [], definitionOfDone: [], notes: [], comments: [] },
    readiness: { ready: false, blocked: false } }],
  layout: { schema: 3, board: 'default', cards: { 'TKT-1': { x: 1, y: 2 } }, frames: {
    f: { title: 'Frame', x: 0, y: 0, w: 100, h: 100, color: '#759bcc', members: ['TKT-1'] },
  }, ...routing() }, boards: ['default'], storePath: '/repo', readOnly: false,
  config: { statuses: ['draft'], openStatuses: ['draft'], terminalStatuses: [], types: ['task'], priorities: ['normal'], blocksOn: ['none'], labels: [],
    milestones: [], series: ['TKT'], actors: null, actor: { ID: 'test', Name: 'Test' }, transitions: {}, reasonRequired: {} } }
}
const response = (value = data()): BoardRead => ({ status: 200, data: value, etag: '"routing"' })
function setup() {
  const client = new TicketClient(), read = vi.spyOn(client, 'board').mockResolvedValue(response())
  return { client, read, store: new TicketStore(client) }
}
const emptyRouting = { pens: {}, ruleOrder: [], inbox: { x: 0, y: 0 } }
const pick = (value: Routing): Routing => ({ pens: value.pens, ruleOrder: value.ruleOrder, inbox: value.inbox })
function transaction(): RoutingTransaction {
  return { cards: { 'TKT-1': null }, frames: {}, routing: { ...routing(), ruleOrder: ['p', 'q'] },
    expect: { cards: { 'TKT-1': { x: 1, y: 2 } }, frames: {}, routing: routing() } }
}

// These assignments are checked by tsc, not only Vitest's transpiler.
function wireContract() {
  const valid: LayoutRequest = { board: 'default', ...transaction() }
  // @ts-expect-error A routing replacement requires its complete preimage.
  const missing: LayoutRequest = { board: 'default', cards: {}, routing: routing() }
  // @ts-expect-error A partial routing preimage cannot protect a replacement.
  const partial: LayoutRequest = { board: 'default', cards: {}, routing: routing(), expect: { cards: {}, frames: {}, routing: { pens: {} } } }
  return [valid, missing, partial]
}
void wireContract

describe('TicketStore schema-3 routing', () => {
  it.each([1, 2])('normalizes legacy schema %s without writes and resets board-local routing', async schema => {
    const { client, read, store } = setup(), legacy = data()
    legacy.layout = { schema, board: 'default', cards: {} }
    const write = vi.spyOn(client, 'layout')
    read.mockResolvedValueOnce(response(legacy)); await store.load()
    expect(pick(store.state)).toEqual(emptyRouting)
    const first = store.state.inbox
    store.selectBoard('other'); expect(pick(store.state)).toEqual(emptyRouting)
    expect(store.state.inbox).not.toBe(first)
    expect(write).not.toHaveBeenCalled()
  })
  it('preserves routing and identities across equal 200, 304, and routing-only changes', async () => {
    const { store, read } = setup(); await store.load()
    const before = store.state
    expect(pick(before)).toEqual(routing())
    expect(await store.load()).toBe(false); expect(store.state).toBe(before)
    read.mockResolvedValueOnce({ status: 304 }); expect(await store.load()).toBe(false)
    expect(store.state).toBe(before)
    const changed = data(); changed.layout.pens!.p.title = 'Changed'
    read.mockResolvedValueOnce(response(changed)); expect(await store.load()).toBe(true)
    expect(store.state.pens.p).not.toBe(before.pens.p); expect(store.state.pens.q).toBe(before.pens.q)
    expect(store.state.ruleOrder).toBe(before.ruleOrder); expect(store.state.inbox).toBe(before.inbox)
    expect(store.state.cards).toBe(before.cards); expect(store.state.frames).toBe(before.frames); expect(store.state.tickets).toBe(before.tickets)
    const reordered = structuredClone(changed); reordered.layout.ruleOrder!.reverse()
    read.mockResolvedValueOnce(response(reordered)); expect(await store.load()).toBe(true)
    expect(store.state.ruleOrder).toEqual(['p', 'q'])
    reordered.layout.inbox = { x: -700, y: 60 }
    read.mockResolvedValueOnce(response(reordered)); expect(await store.load()).toBe(true)
    expect(store.state.inbox).toEqual({ x: -700, y: 60 })
  })
  it('loads distinct board-local routing and accepts schema-3 boards with no pens', async () => {
    const { store, read } = setup(); await store.load()
    store.selectBoard('other')
    const other = data(); other.layout = { schema: 3, board: 'other', cards: {}, frames: {}, ...emptyRouting, inbox: { x: 80, y: 90 } }
    read.mockResolvedValueOnce(response(other)); await store.load()
    expect(pick(store.state)).toEqual({ ...emptyRouting, inbox: { x: 80, y: 90 } })
    store.selectBoard('default'); await store.load(); expect(pick(store.state)).toEqual(routing())
  })
  it('preserves Go-valid Unicode format labels and unrounded read geometry', async () => {
    const { store, read } = setup(), next = data()
    next.layout.pens!.p.requiredLabels = ['\uFEFF', ' 😀 ', 'a\u200Bb']
    next.layout.pens!.p.pin.x = 12.51234
    read.mockResolvedValueOnce(response(next)); await store.load()
    expect(store.state.pens.p.requiredLabels).toEqual(['\uFEFF', ' 😀 ', 'a\u200Bb'])
    expect(store.state.pens.p.pin.x).toBe(12.51234)
  })
  it('deduplicates exact requirements without trimming, splitting, or folding case', async () => {
    const { store, read } = setup(), next = data()
    next.layout.pens!.p.requiredLabels = ['UI', 'ui', ' a,b ', 'a b', 'UI']
    read.mockResolvedValueOnce(response(next)); await store.load()
    expect(store.state.pens.p.requiredLabels).toEqual(['UI', 'ui', ' a,b ', 'a b'])
    expect(next.layout.pens!.p.requiredLabels).toHaveLength(5)
  })
  it.each(['save', 'frame', 'routing', 'create'] as const)('reconciles routing in %s responses', async path => {
    const { store, client } = setup(); await store.load()
    const before = store.state, next = data().layout
    next.pens!.p.title = 'Server normalized'; next.inbox = { x: 100, y: 200 }
    vi.spyOn(client, 'layout').mockResolvedValue(next)
    vi.spyOn(client, 'create').mockResolvedValue({ ticket: data().tickets[0], layout: next })
    if (path === 'save') await store.saveLayout('default', {})
    if (path === 'frame') await store.saveFrameLayout('default', { cards: {}, frames: {}, expect: { cards: {}, frames: {} } })
    if (path === 'routing') await store.saveRoutingLayout('default', transaction())
    if (path === 'create') await store.create({ title: 'New' })
    expect(store.state.pens.p.title).toBe('Server normalized'); expect(store.state.inbox).toEqual(next.inbox)
    expect(store.state.pens.q).toBe(before.pens.q); expect(store.state.ruleOrder).toBe(before.ruleOrder)
    expect(store.state.cards).toBe(before.cards); expect(store.state.frames).toBe(before.frames)
  })
  it('keeps state identity on equivalent layout mutations', async () => {
    const { store, client } = setup(); await store.load(); const before = store.state
    vi.spyOn(client, 'layout').mockResolvedValue(data().layout)
    await store.saveRoutingLayout('default', transaction()); expect(store.state).toBe(before)
    await store.saveLayout('default', {}); expect(store.state).toBe(before)
  })
  it.each([undefined, 'disk full'])('retains routing on ticket-only create, patch, and deletion with cleanup error=%s', async layoutError => {
    const { store, client } = setup(); await store.load(); const before = store.state
    expect(pick(before)).toEqual(routing())
    vi.spyOn(client, 'create').mockResolvedValue({ ticket: data().tickets[0], layoutError })
    await store.create({ title: 'New' })
    vi.spyOn(client, 'patch').mockResolvedValue({ ticket: { ...data().tickets[0], labels: ['changed'] } })
    await store.patch('TKT-1', [{ op: 'addLabel', label: 'changed' }], 'r1')
    vi.spyOn(client, 'remove').mockResolvedValue({ removed: 'TKT-1', layoutError })
    await store.remove('TKT-1', 'r1')
    expect(store.state.pens).toBe(before.pens); expect(store.state.ruleOrder).toBe(before.ruleOrder); expect(store.state.inbox).toBe(before.inbox)
    expect(store.state.frames.f.members).toEqual(layoutError ? ['TKT-1'] : [])
  })
  const invalid = [
    (b: Board) => { b.schema = 4 },
    (b: Board) => { b.schema = 1.5 },
    (b: Board) => { delete b.pens },
    (b: Board) => { delete b.ruleOrder },
    (b: Board) => { b.inbox = null as never },
    (b: Board) => { b.schema = 2 },
    (b: Board) => { b.pens!.p.requiredLabels = [] },
    (b: Board) => { b.pens!.p.requiredLabels = [' '] },
    (b: Board) => { b.pens!.p.requiredLabels = null as never },
    (b: Board) => { b.ruleOrder = ['p', 'p'] },
    (b: Board) => { b.ruleOrder = ['p', 'missing'] },
    (b: Board) => { b.ruleOrder = ['p'] },
    (b: Board) => { b.pens!.p.pin = { x: 1 } as never },
    (b: Board) => { b.pens!.p.pin.x = Infinity },
    (b: Board) => { b.pens!.p.w = 0 },
    (b: Board) => { Object.assign(b.pens!.p, { future: true }) },
    (b: Board) => { Object.assign(b.inbox!, { future: true }) },
    (b: Board) => { Object.assign(b, { future: true }) },
  ]
  it.each(invalid)('refuses malformed/future layouts without publishing or caching their validator %#', async change => {
    const { store, read } = setup(); await store.load(); const before = store.state, bad = data()
    change(bad.layout)
    read.mockResolvedValueOnce({ status: 200, data: bad, etag: '"bad"' })
    await expect(store.load()).rejects.toMatchObject({ code: 'invalid_response' })
    expect(store.state).toBe(before)
    read.mockResolvedValueOnce({ status: 304 }); await store.load()
    expect(read).toHaveBeenLastCalledWith('default', '"routing"')
  })
  it.each(['save', 'create'] as const)('refuses invalid %s layouts before publishing any data', async path => {
    const { store, client } = setup(); await store.load(); const before = store.state, bad = data().layout
    delete bad.inbox
    vi.spyOn(client, 'layout').mockResolvedValue(bad)
    vi.spyOn(client, 'create').mockResolvedValue({ ticket: { ...data().tickets[0], title: 'Not published' }, layout: bad })
    const pending = path === 'save' ? store.saveLayout('default', {}) : store.create({ title: 'New' })
    await expect(pending).rejects.toMatchObject({ code: 'invalid_response' }); expect(store.state).toBe(before)
  })
  it.each(['read', 'save', 'frame', 'routing', 'create'] as const)('ignores delayed %s data after A to B to A', async path => {
    const { store, client, read } = setup(); await store.load()
    const boardRead = deferred<BoardRead>(), layout = deferred<Board>(), creation = deferred<TicketResponse>()
    read.mockReturnValueOnce(boardRead.promise); vi.spyOn(client, 'layout').mockReturnValueOnce(layout.promise)
    vi.spyOn(client, 'create').mockReturnValueOnce(creation.promise)
    const pending = path === 'read' ? store.load() : path === 'save' ? store.saveLayout('default', {})
      : path === 'frame' ? store.saveFrameLayout('default', { cards: {}, frames: {}, expect: { cards: {}, frames: {} } })
        : path === 'routing' ? store.saveRoutingLayout('default', transaction()) : store.create({ title: 'New' })
    store.selectBoard('other'); store.selectBoard('default'); const before = store.state
    boardRead.resolve(response()); layout.resolve(data().layout); creation.resolve({ ticket: data().tickets[0], layout: data().layout })
    await pending; expect(store.state).toBe(before); expect(pick(store.state)).toEqual(emptyRouting)
  })
})

describe('Conditional routing writes', () => {
  it('round-trips complete routing through the real HTTP client and reuses normalized response preimages', async () => {
    const normalized = { ...data().layout, ...routing(), inbox: { x: 12.51, y: -0.01 } }
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify(data()), { headers: { ETag: '"initial"' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(normalized)))
      .mockResolvedValueOnce(new Response(JSON.stringify(normalized)))
    const store = new TicketStore(new TicketClient(send)); await store.load()
    const op = transaction(), result = await store.saveRoutingLayout('default', { ...op })
    expect(JSON.parse(send.mock.calls[1][1]!.body as string)).toEqual({ board: 'default', ...op })
    expect(send.mock.calls[1][0]).toBe('/api/layout')
    const before = pick(result)
    await store.saveRoutingLayout('default', { cards: {}, frames: {}, routing: before, expect: { cards: {}, frames: {}, routing: before } })
    expect(JSON.parse(send.mock.calls[2][1]!.body as string).expect.routing.inbox).toEqual({ x: 12.51, y: -0.01 })
    expect(pick(store.state)).toEqual(before)
  })
  it('rechecks read-only state when a queued routing write starts', async () => {
    const { store, client } = setup(); await store.load()
    const first = deferred<Board>(), send = vi.spyOn(client, 'layout').mockReturnValueOnce(first.promise)
    const a = store.saveLayout('default', {}), b = store.saveRoutingLayout('default', transaction())
    await Promise.resolve(); store.state = { ...store.state, readOnly: true }
    const refused = expect(b).rejects.toMatchObject({ code: 'read_only' })
    first.resolve(data().layout); await a; await refused
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('serializes with card writes, captures full preimages, and forwards only wire fields', async () => {
    const { store, client, read } = setup(); await store.load()
    const first = deferred<Board>(), second = deferred<Board>(), old = deferred<BoardRead>()
    read.mockReturnValueOnce(old.promise); const staleRead = store.load()
    const send = vi.spyOn(client, 'layout').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const a = store.saveLayout('default', {}), op = { ...transaction(), label: 'client only' }, sent = structuredClone(transaction())
    const b = store.saveRoutingLayout('default', op)
    op.routing.ruleOrder.reverse(); op.expect.routing.pens.p.pin.x = 999; op.routing.pens.p.requiredLabels.push('later')
    await Promise.resolve(); expect(send).toHaveBeenCalledTimes(1)
    const before = store.state; expect(await store.load()).toBe(false); expect(store.state).toBe(before)
    first.resolve(data().layout); await a; await Promise.resolve()
    expect(send).toHaveBeenLastCalledWith({ board: 'default', ...sent })
    const result = { ...data().layout, ...sent.routing, cards: {} }
    second.resolve(result); expect(await b).toEqual(result)
    old.resolve(response()); expect(await staleRead).toBe(false)
    expect(store.state.ruleOrder).toEqual(['p', 'q']); expect(store.state.cards).toEqual({})
    expect(store.state.frames.f.members).toEqual(['TKT-1'])
  })
  it.each([false, true])('reloads conflicts once, never replays, preserves original error when reload fails=%s', async fails => {
    const { store, client, read } = setup(); await store.load(); const before = store.state
    const error = new ApiError(409, { code: 'layout_conflict', message: 'routing changed' })
    const send = vi.spyOn(client, 'layout').mockRejectedValueOnce(error)
    const next = data(); next.layout.ruleOrder = ['p', 'q']
    if (fails) read.mockRejectedValueOnce(new Error('offline'))
    else read.mockResolvedValueOnce(response(next))
    await expect(store.saveRoutingLayout('default', transaction())).rejects.toBe(error)
    expect(send).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledTimes(2)
    if (fails) expect(store.state).toBe(before)
    else expect(store.state.ruleOrder).toEqual(['p', 'q'])
  })
  it('waits for queued ticket-only writes before reloading a routing conflict', async () => {
    const { store, client, read } = setup(); await store.load()
    const error = new ApiError(409, { code: 'layout_conflict', message: 'routing changed' }), patch = deferred<TicketResponse>()
    vi.spyOn(client, 'layout').mockRejectedValueOnce(error)
    const sendPatch = vi.spyOn(client, 'patch').mockReturnValueOnce(patch.promise)
    const external = data(); external.layout.ruleOrder = ['p', 'q']; external.tickets[0].title = 'Patched'
    read.mockResolvedValueOnce(response(external))
    let settled = false, routingAtRejection: string[] | undefined
    const a = store.saveRoutingLayout('default', transaction()).catch(reason => {
      settled = true; routingAtRejection = store.state.ruleOrder; return reason
    })
    const b = store.patch('TKT-1', [{ op: 'setTitle', title: 'Patched' }], 'r1')
    await vi.waitFor(() => expect(sendPatch).toHaveBeenCalledTimes(1))
    const settledWhileQueued = settled, readsWhileQueued = read.mock.calls.length
    patch.resolve({ ticket: external.tickets[0] }); await b
    expect(await a).toBe(error)
    expect(settledWhileQueued).toBe(false); expect(readsWhileQueued).toBe(1)
    expect(routingAtRejection).toEqual(['p', 'q']); expect(read).toHaveBeenCalledTimes(2)
    expect(store.state.tickets.get('TKT-1')?.title).toBe('Patched')
  })
  it('rechecks board generation after waiting for queued writes during conflict recovery', async () => {
    const { store, client, read } = setup(); await store.load()
    const patch = deferred<TicketResponse>(), error = new ApiError(409, { code: 'layout_conflict', message: 'routing changed' })
    vi.spyOn(client, 'layout').mockRejectedValueOnce(error)
    const sendPatch = vi.spyOn(client, 'patch').mockReturnValueOnce(patch.promise)
    const a = store.saveRoutingLayout('default', transaction()).catch(reason => reason)
    const b = store.patch('TKT-1', [{ op: 'setTitle', title: 'Patched' }], 'r1')
    await vi.waitFor(() => expect(sendPatch).toHaveBeenCalledTimes(1))
    store.selectBoard('other'); store.selectBoard('default'); const before = store.state
    patch.resolve({ ticket: data().tickets[0] }); await b; expect(await a).toBe(error)
    expect(read).toHaveBeenCalledTimes(1); expect(store.state).toBe(before)
  })
  it('does not reload a new board generation after a delayed conflict', async () => {
    const { store, client, read } = setup(); await store.load(); const pending = deferred<Board>()
    vi.spyOn(client, 'layout').mockReturnValueOnce(pending.promise)
    const write = store.saveRoutingLayout('default', transaction())
    store.selectBoard('other'); store.selectBoard('default')
    pending.reject(new ApiError(409, { code: 'layout_conflict', message: 'stale' }))
    await expect(write).rejects.toMatchObject({ code: 'layout_conflict' }); expect(read).toHaveBeenCalledTimes(1)
  })
  it('leaves accepted routing intact on failure and continues the queue', async () => {
    const { store, client } = setup(); await store.load(); const before = store.state
    vi.spyOn(client, 'layout').mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce(data().layout)
    await expect(store.saveRoutingLayout('default', transaction())).rejects.toThrow('disk full')
    expect(store.state).toBe(before); await store.saveRoutingLayout('default', transaction()); expect(store.state).toBe(before)
  })
  it('rejects missing preimages, invalid rules, and read-only writes before sending', async () => {
    const { store, client } = setup(); await store.load(); const send = vi.spyOn(client, 'layout')
    const missing = transaction(); delete (missing.expect as Partial<typeof missing.expect>).routing
    await expect(store.saveRoutingLayout('default', missing)).rejects.toMatchObject({ code: 'invalid_layout' })
    const partial = transaction(); delete partial.expect.cards['TKT-1']
    await expect(store.saveRoutingLayout('default', partial)).rejects.toMatchObject({ code: 'invalid_layout' })
    const empty = transaction(); empty.routing.pens.p.requiredLabels = []
    await expect(store.saveRoutingLayout('default', empty)).rejects.toMatchObject({ code: 'invalid_layout' })
    store.state = { ...store.state, readOnly: true }
    await expect(store.saveRoutingLayout('default', transaction())).rejects.toMatchObject({ code: 'read_only' })
    expect(send).not.toHaveBeenCalled()
  })
})
