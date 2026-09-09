import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, TicketClient } from './client'
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
function board(revision = 'r1', name = 'default'): BoardResponse {
  return { tickets: [ticket(revision)], layout: { schema: 1, board: name, cards: { 'TKT-1': { x: 1, y: 2 } } },
    boards: [name], storePath: '/repo', readOnly: false,
    config: { statuses: ['draft'], openStatuses: ['draft'], terminalStatuses: [], types: ['task'], priorities: ['normal'],
      blocksOn: ['none'], labels: [], milestones: [], series: ['TKT'], actors: null,
      actor: { ID: 'agent:test', Name: 'Test' }, transitions: { draft: null }, reasonRequired: {} } }
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
    const first = deferred<BoardResponse>(), second = deferred<BoardResponse>()
    read.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const a = store.load(), b = store.load()
    second.resolve(board('r2')); expect(await b).toBe(true)
    first.resolve(board('r1')); expect(await a).toBe(false)
    expect(store.state.tickets.get('TKT-1')?.revision).toBe('r2')
    const old = deferred<BoardResponse>()
    read.mockReturnValueOnce(old.promise)
    const c = store.load(); await store.load()
    old.reject(new Error('old request')); expect(await c).toBe(false)
  })
  it('rejects an old A response after switching A to B to A', async () => {
    const { store, read } = setup(), old = deferred<BoardResponse>()
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
    const before = deferred<BoardResponse>(), during = deferred<BoardResponse>(), write = deferred<{ ticket: Ticket }>()
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
