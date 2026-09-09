import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, TicketClient, type BoardRead } from './client'
import { LayoutWriter, TicketStore } from './store'
import type { BoardResponse, Ticket } from './types'

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function ticket(revision = 'r1'): Ticket {
  return { id: 'TKT-1', short: 'TKT-1', title: revision, revision, type: 'task', status: 'draft', priority: 'normal',
    labels: [], assignees: [], dependencies: [], blocksOn: 'none', references: [], archived: false,
    createdAt: '', updatedAt: '', body: { description: '', plan: '', summary: '', acceptanceCriteria: [],
      definitionOfDone: [], notes: [], comments: [] }, readiness: { ready: false, blocked: false } }
}
function boardData(revision = 'r1', name = 'default'): BoardResponse {
  return { tickets: [ticket(revision)], layout: { schema: 1, board: name, cards: { 'TKT-1': { x: 1, y: 2 } } },
    boards: [name], storePath: '/repo', readOnly: false,
    config: { statuses: ['draft'], openStatuses: ['draft'], terminalStatuses: [], types: ['task'], priorities: ['normal'],
      blocksOn: ['none'], labels: [], milestones: [], series: ['TKT'], actors: null,
      actor: { ID: 'agent:test', Name: 'Test' }, transitions: { draft: null }, reasonRequired: {} } }
}
function board(revision = 'r1', name = 'default'): BoardRead {
  return { status: 200, data: boardData(revision, name), etag: `"${name}-${revision}"` }
}
function setup() {
  const client = new TicketClient()
  const read = vi.spyOn(client, 'board').mockResolvedValue(board())
  return { client, read, store: new TicketStore(client) }
}
const ops = [{ op: 'setTitle', title: 'requested' }] as const

describe('TicketStore reads', () => {
  it('accepts only the latest read, including stale errors', async () => {
    const { store, read } = setup()
    const first = deferred<BoardRead>(), second = deferred<BoardRead>()
    read.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const a = store.load(), b = store.load()
    second.resolve(board('r2')); expect(await b).toBe(true)
    first.resolve(board('r1')); expect(await a).toBe(false)
    expect(store.state.tickets.get('TKT-1')?.revision).toBe('r2')
    const old = deferred<BoardRead>()
    read.mockReturnValueOnce(old.promise)
    const c = store.load(); await store.load()
    old.reject(new Error('old request')); expect(await c).toBe(false)
  })
  it('rejects an old A response after switching A to B to A', async () => {
    const { store, read } = setup(), old = deferred<BoardRead>()
    read.mockReturnValueOnce(old.promise)
    const pending = store.load()
    store.selectBoard('other'); store.selectBoard('default')
    old.resolve(board('old')); expect(await pending).toBe(false)
    expect(store.state.cards).toEqual({})
  })
  it('leaves accepted data alone when the current read fails', async () => {
    const { store, read } = setup(); await store.load()
    const before = store.state
    read.mockRejectedValueOnce(new Error('offline'))
    await expect(store.load()).rejects.toThrow('offline')
    expect(store.state).toBe(before)
  })
})

describe('Conditional snapshots', () => {
  it('uses only the current accepted validator and treats 304 and equal 200 as no-ops', async () => {
    const { store, read } = setup()
    expect(await store.load()).toBe(true)
    expect(read).toHaveBeenLastCalledWith('default', undefined)
    const before = store.state
    read.mockResolvedValueOnce({ status: 304 })
    expect(await store.load()).toBe(false)
    expect(read).toHaveBeenLastCalledWith('default', '"default-r1"')
    expect(store.state).toBe(before)
    read.mockResolvedValueOnce({ status: 200, data: boardData(), etag: '"new-validator"' })
    expect(await store.load()).toBe(false)
    expect(store.state).toBe(before)
    await store.load()
    expect(read).toHaveBeenLastCalledWith('default', '"new-validator"')
  })
  it('reuses unchanged entries and collections, including after object key reordering', async () => {
    const { store, read } = setup()
    const data = boardData()
    data.tickets.push({ ...ticket(), id: 'TKT-2' })
    data.layout.cards['TKT-2'] = { x: 3, y: 4 }
    read.mockResolvedValueOnce({ status: 200, data, etag: '"initial"' }); await store.load()
    const before = store.state, changed = structuredClone(data)
    changed.tickets[0].title = 'changed'
    changed.layout.cards['TKT-1'].x = 8
    changed.layout.cards['TKT-2'] = { y: 4, x: 3 }
    read.mockResolvedValueOnce({ status: 200, data: changed, etag: '"changed"' })
    expect(await store.load()).toBe(true)
    expect(store.state.tickets).not.toBe(before.tickets)
    expect(store.state.tickets.get('TKT-1')).not.toBe(before.tickets.get('TKT-1'))
    expect(store.state.tickets.get('TKT-2')).toBe(before.tickets.get('TKT-2'))
    expect(store.state.cards['TKT-1']).not.toBe(before.cards['TKT-1'])
    expect(store.state.cards['TKT-2']).toBe(before.cards['TKT-2'])
    expect(store.state.boards).toBe(before.boards)
    expect(store.state.config).toBe(before.config)
    const layoutOnly = structuredClone(changed)
    layoutOnly.layout.cards['TKT-1'].x = 9
    const previous = store.state
    read.mockResolvedValueOnce({ status: 200, data: layoutOnly, etag: null }); await store.load()
    expect(store.state.tickets).toBe(previous.tickets)
    read.mockResolvedValueOnce({ status: 200, data: layoutOnly, etag: null })
    expect(await store.load()).toBe(false)
    expect(read).toHaveBeenLastCalledWith('default', undefined)
  })
  it.each([
    (data: BoardResponse) => { data.tickets[0].readiness = { ready: false, blocked: true, blocking: ['other'] } },
    (data: BoardResponse) => { data.tickets[0].short = 'TKT-longer' },
    (data: BoardResponse) => { data.tickets[0].claim = { actor: 'agent:test', expired: true } },
    (data: BoardResponse) => { data.tickets[0].body.notes.push({ index: 1, text: 'A note' }) },
    (data: BoardResponse) => { data.layout.schema = 2 },
    (data: BoardResponse) => { data.boards.push('other') },
    (data: BoardResponse) => { data.config.labels.push('new') },
    (data: BoardResponse) => { data.readOnly = true },
    (data: BoardResponse) => { data.storePath = '/other' },
  ])('accepts observable changes without relying on ticket revision %#', async change => {
    const { store, read } = setup(); await store.load()
    const before = store.state, data = boardData()
    change(data)
    read.mockResolvedValueOnce({ status: 200, data, etag: '"derived"' })
    expect(await store.load()).toBe(true)
    expect(store.state).not.toBe(before)
    expect(store.state.tickets.get('TKT-1')?.revision).toBe('r1')
  })
  it('applies deletions and server ordering without dropping unchanged record identity', async () => {
    const { store, read } = setup(), data = boardData()
    data.tickets.push({ ...ticket(), id: 'TKT-2' })
    read.mockResolvedValueOnce({ status: 200, data, etag: null }); await store.load()
    const first = store.state.tickets.get('TKT-1')
    const changed = structuredClone(data); changed.tickets.reverse()
    read.mockResolvedValueOnce({ status: 200, data: changed, etag: null }); await store.load()
    expect([...store.state.tickets.keys()]).toEqual(['TKT-2', 'TKT-1'])
    expect(store.state.tickets.get('TKT-1')).toBe(first)
    read.mockResolvedValueOnce({ status: 200, data: { ...boardData(), tickets: [], layout: { schema: 1, board: 'default', cards: {} } }, etag: null })
    await store.load()
    expect(store.state.tickets.size).toBe(0); expect(store.state.cards).toEqual({})
  })
  it('clears the validator on board switches, including A to B to A', async () => {
    const { store, read } = setup(); await store.load()
    store.selectBoard('other')
    read.mockResolvedValueOnce(board('r1', 'other')); await store.load()
    expect(read).toHaveBeenLastCalledWith('other', undefined)
    store.selectBoard('default'); await store.load()
    expect(read).toHaveBeenLastCalledWith('default', undefined)
  })
  it('retries a cacheless 304 once without publishing empty state', async () => {
    const { store, read } = setup()
    read.mockResolvedValueOnce({ status: 304 }).mockResolvedValueOnce(board())
    expect(await store.load()).toBe(true)
    expect(read.mock.calls).toEqual([['default', undefined], ['default']])
    store.selectBoard('other')
    const before = store.state
    read.mockResolvedValue({ status: 304 })
    await expect(store.load()).rejects.toMatchObject({ code: 'invalid_response' })
    expect(store.state).toBe(before); expect(read).toHaveBeenCalledTimes(4)
  })
  it('refuses a mismatched board without caching its validator', async () => {
    const { store, read } = setup()
    read.mockResolvedValueOnce(board('r1', 'other'))
    await expect(store.load()).rejects.toMatchObject({ code: 'invalid_response' })
    await store.load()
    expect(read).toHaveBeenLastCalledWith('default', undefined)
  })
  it.each([false, true])('invalidates validators around a write even when it fails=%s', async fails => {
    const { store, read, client } = setup(); await store.load()
    const write = deferred<{ ticket: Ticket }>()
    vi.spyOn(client, 'patch').mockReturnValue(write.promise)
    const pending = store.patch('TKT-1', [...ops], 'r1').catch(e => e)
    expect(await store.load()).toBe(false)
    expect(read).toHaveBeenLastCalledWith('default', undefined)
    if (fails) write.reject(new Error('offline'))
    else write.resolve({ ticket: ticket('r2') })
    await pending
    await store.load()
    expect(read).toHaveBeenLastCalledWith('default', undefined)
  })
  it('does not accept stale 304 results or cache stale 200 validators', async () => {
    const { store, read, client } = setup(); await store.load()
    const old = deferred<BoardRead>(); read.mockReturnValueOnce(old.promise)
    const pending = store.load()
    vi.spyOn(client, 'patch').mockResolvedValue({ ticket: ticket('r2') })
    await store.patch('TKT-1', [...ops], 'r1')
    old.resolve({ status: 304 }); expect(await pending).toBe(false)
    expect(store.state.tickets.get('TKT-1')?.revision).toBe('r2')
    const stale = deferred<BoardRead>(); read.mockReturnValueOnce(stale.promise)
    const a = store.load()
    read.mockResolvedValueOnce(board('newest')); await store.load()
    stale.resolve(board('old')); expect(await a).toBe(false)
    read.mockResolvedValueOnce({ status: 304 }); await store.load()
    expect(read).toHaveBeenLastCalledWith('default', '"default-newest"')
  })
  it('does not publish equivalent mutation or layout responses', async () => {
    const { store, client } = setup(); await store.load()
    const before = store.state
    vi.spyOn(client, 'patch').mockResolvedValue({ ticket: ticket() })
    await store.patch('TKT-1', [...ops], 'r1')
    expect(store.state).toBe(before)
    vi.spyOn(client, 'layout').mockResolvedValue(boardData().layout)
    await store.saveLayout('default', boardData().layout.cards)
    expect(store.state).toBe(before)
  })
})

describe('TicketStore mutations', () => {
  it('accepts the server ticket, not the requested title, and retains explicit revision', async () => {
    const { client, store } = setup(); await store.load()
    const patch = vi.spyOn(client, 'patch').mockResolvedValue({ ticket: ticket('server') })
    await store.patch('TKT-1', [...ops], 'snapshot-revision')
    expect(patch).toHaveBeenCalledWith('TKT-1', { ifRevision: 'snapshot-revision', ops })
    expect(store.state.tickets.get('TKT-1')?.title).toBe('server')
  })
  it('invalidates reads started before and during a write, even if they finish later', async () => {
    const { client, store, read } = setup(); await store.load()
    const before = deferred<BoardRead>(), during = deferred<BoardRead>(), write = deferred<{ ticket: Ticket }>()
    read.mockReturnValueOnce(before.promise).mockReturnValueOnce(during.promise)
    vi.spyOn(client, 'patch').mockReturnValue(write.promise)
    const a = store.load(), mutation = store.patch('TKT-1', [...ops], 'r1'), b = store.load()
    write.resolve({ ticket: ticket('r2') }); await mutation
    before.resolve(board('old')); during.resolve(board('old'))
    expect(await a).toBe(false); expect(await b).toBe(false)
    expect(store.state.tickets.get('TKT-1')?.revision).toBe('r2')
  })
  it('does not apply a read while a write is pending', async () => {
    const { store, client } = setup(); await store.load()
    const write = deferred<{ ticket: Ticket }>()
    vi.spyOn(client, 'patch').mockReturnValue(write.promise)
    const mutation = store.patch('TKT-1', [...ops], 'r1')
    expect(await store.load()).toBe(false)
    write.resolve({ ticket: ticket('r2') }); await mutation
  })
  it('serializes writes and continues after a refusal without optimistic edits', async () => {
    const { client, store } = setup(); await store.load()
    const first = deferred<{ ticket: Ticket }>(), error = new ApiError(422, { code: 'invalid', message: 'refused' })
    const patch = vi.spyOn(client, 'patch').mockReturnValueOnce(first.promise).mockResolvedValueOnce({ ticket: ticket('r2') })
    const a = store.patch('TKT-1', [...ops], 'r1').catch(e => e)
    const b = store.patch('TKT-1', [...ops], 'r1')
    await Promise.resolve(); expect(patch).toHaveBeenCalledTimes(1)
    expect(store.state.tickets.get('TKT-1')?.revision).toBe('r1')
    first.reject(error); expect(await a).toBe(error); await b
    expect(patch).toHaveBeenCalledTimes(2)
    expect(store.state.tickets.get('TKT-1')?.revision).toBe('r2')
  })
  it.each([false, true])('reloads stale revisions once and preserves the error when reload fails=%s', async failRead => {
    const { client, store, read } = setup(); await store.load()
    const error = new ApiError(409, { code: 'stale_revision', message: 'stale' })
    const patch = vi.spyOn(client, 'patch').mockRejectedValue(error)
    if (failRead) read.mockRejectedValueOnce(new Error('offline'))
    else read.mockResolvedValueOnce(board('external'))
    await expect(store.patch('TKT-1', [...ops], 'r1')).rejects.toBe(error)
    expect(patch).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledTimes(2)
    expect(store.state.tickets.get('TKT-1')?.revision).toBe(failRead ? 'r1' : 'external')
  })
  it('reloads a refused multi-op patch because an earlier op may have succeeded', async () => {
    const { client, store, read } = setup(); await store.load()
    vi.spyOn(client, 'patch').mockRejectedValue(new ApiError(422, { code: 'invalid', message: 'second op failed' }))
    read.mockResolvedValueOnce(board('partial'))
    await expect(store.patch('TKT-1', [...ops, { op: 'setType', type: 'bad' }], 'r1')).rejects.toThrow('second op failed')
    expect(store.state.tickets.get('TKT-1')?.revision).toBe('partial')
  })
  it('does not apply a delayed mutation to another board generation', async () => {
    const { client, store } = setup(); await store.load()
    const write = deferred<{ ticket: Ticket }>()
    vi.spyOn(client, 'patch').mockReturnValue(write.promise)
    const pending = store.patch('TKT-1', [...ops], 'r1')
    store.selectBoard('other'); store.selectBoard('default')
    write.resolve({ ticket: ticket('old-view') }); await pending
    expect(store.state.tickets.get('TKT-1')?.revision).toBe('r1')
  })
  it('keeps a successful creation when its placement fails, without retrying', async () => {
    const { client, store } = setup(); await store.load()
    const create = vi.spyOn(client, 'create').mockResolvedValue({ ticket: ticket('created'), layoutError: 'disk full' })
    expect((await store.create({ title: 'new' })).layoutError).toBe('disk full')
    expect(store.state.tickets.get('TKT-1')?.revision).toBe('created')
    expect(store.state.cards['TKT-1']).toEqual({ x: 1, y: 2 }); expect(create).toHaveBeenCalledTimes(1)
  })
  it.each([undefined, 'disk full'])('accepts deletion with cleanup error %s', async layoutError => {
    const { client, store } = setup(); await store.load()
    const remove = vi.spyOn(client, 'remove').mockResolvedValue({ removed: 'TKT-1', layoutError })
    await store.remove('TKT-1', 'snapshot', true)
    expect(remove).toHaveBeenCalledWith('TKT-1', 'default', 'snapshot', true)
    expect(store.state.tickets.size).toBe(0)
    expect(store.state.cards['TKT-1']).toEqual(layoutError ? { x: 1, y: 2 } : undefined)
  })
  it('captures layout data before queueing and ignores completion after a board switch', async () => {
    const { client, store } = setup(); await store.load()
    const write = deferred<BoardResponse['layout']>()
    const layout = vi.spyOn(client, 'layout').mockReturnValue(write.promise)
    const cards = { 'TKT-1': { x: 20, y: 30 } }
    const pending = store.saveLayout('default', cards)
    cards['TKT-1'].x = 999; store.selectBoard('other')
    write.resolve({ schema: 1, board: 'default', cards: { 'TKT-1': { x: 20, y: 30 } } }); await pending
    expect(layout).toHaveBeenCalledWith({ board: 'default', cards: { 'TKT-1': { x: 20, y: 30 } } })
    expect(store.state.cards).toEqual({}); expect(store.state.board).toBe('other')
  })
  it('leaves persisted layout unchanged on a save failure', async () => {
    const { client, store } = setup(); await store.load()
    const before = store.state
    vi.spyOn(client, 'layout').mockRejectedValue(new Error('disk full'))
    await expect(store.saveLayout('default', { 'TKT-1': null })).rejects.toThrow('disk full')
    expect(store.state).toBe(before)
  })
})

describe('LayoutWriter', () => {
  afterEach(() => vi.useRealTimers())
  it('copies changes, merges same-board batches, and keeps boards separate', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(undefined), writer = new LayoutWriter(save)
    const cards = { a: { x: 1, y: 2 } }
    const a = writer.enqueue('A', cards); cards.a.x = 999
    const b = writer.enqueue('B', { a: { x: 3, y: 4 } })
    const c = writer.enqueue('A', { b: null })
    await vi.advanceTimersByTimeAsync(199); expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1); await Promise.all([a, b, c])
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenCalledWith('A', { a: { x: 1, y: 2 }, b: null })
    expect(save).toHaveBeenCalledWith('B', { a: { x: 3, y: 4 } })
  })
  it('makes a new batch during an in-flight save and survives failure', async () => {
    vi.useFakeTimers()
    const first = deferred<void>(), save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined)
    const writer = new LayoutWriter(save)
    const a = writer.enqueue('A', { a: { x: 1, y: 2 } }).catch(e => e)
    await vi.advanceTimersByTimeAsync(200)
    const b = writer.enqueue('A', { a: { x: 3, y: 4 } })
    first.reject(new Error('failed')); expect(await a).toBeInstanceOf(Error)
    await vi.advanceTimersByTimeAsync(200); await b
    expect(save).toHaveBeenLastCalledWith('A', { a: { x: 3, y: 4 } })
  })
})
