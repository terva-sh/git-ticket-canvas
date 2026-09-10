import { describe, expect, it, vi } from 'vitest'
import { ApiError, TicketClient, type BoardRead } from './client'
import { TicketStore } from './store'
import type { BoardResponse } from './types'

function setup() {
  const client = new TicketClient(), store = new TicketStore(client)
  const data: BoardResponse & { captureToken: string } = {
    captureToken: 'capture-v1:initial', layout: { schema: 3, board: 'default', cards: {}, frames: {}, pens: {}, ruleOrder: [], inbox: { x: 0, y: 0 } },
    tickets: [], boards: ['default'], storePath: '/repo', readOnly: false,
    config: { statuses: [], openStatuses: [], terminalStatuses: [], types: [], priorities: [], blocksOn: [], labels: [], milestones: [], series: [], actors: null, actor: { ID: 'test', Name: 'test' }, transitions: {}, reasonRequired: {} },
  }
  const response = (token = 'capture-v1:initial'): BoardRead => ({ status: 200, data: { ...data, captureToken: token }, etag: 'etag' })
  const read = vi.spyOn(client, 'board').mockResolvedValue(response())
  const token = () => (store.state as typeof store.state & { captureToken: string | null }).captureToken
  return { client, store, data, response, read, token }
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes }); return { promise, resolve } }

describe('Capture token write lifecycle', () => {
  it('invalidates at enqueue and rejects reads crossing a pending write', async () => {
    const { client, store, read, data, response, token } = setup(); await store.load()
    const oldState = store.state, oldRead = deferred<BoardRead>()
    read.mockReturnValueOnce(oldRead.promise); const loading = store.load()
    const pending = deferred<typeof data.layout>()
    vi.spyOn(client, 'layout').mockReturnValue(pending.promise)
    const writing = store.saveLayout('default', {})
    expect(token()).toBeNull()
    expect((oldState as typeof oldState & { captureToken: string }).captureToken).toBe('capture-v1:initial')
    oldRead.resolve(response('capture-v1:stale')); await loading
    expect(token()).toBeNull()
    pending.resolve(data.layout); await writing
    expect(token()).toBeNull()
    await store.load(); expect(token()).toBe('capture-v1:initial')
  })
  it('clears the token on a failed write and never restores it from a bodyless read', async () => {
    const { client, store, read, token } = setup(); await store.load()
    vi.spyOn(client, 'layout').mockRejectedValue(new Error('offline'))
    await expect(store.saveLayout('default', {})).rejects.toThrow('offline')
    expect(token()).toBeNull()
    read.mockResolvedValue({ status: 304 })
    await expect(store.load()).rejects.toMatchObject({ code: 'invalid_response' })
    expect(token()).toBeNull()
  })
  it('reloads after queued writes on conflict without substituting or replaying the guard', async () => {
    const { client, store, data, read, response, token } = setup(); await store.load()
    const pending = deferred<typeof data.layout>()
    const write = vi.spyOn(client, 'layout').mockRejectedValueOnce(new ApiError(409, { code: 'layout_conflict', message: 'stale' })).mockReturnValueOnce(pending.promise)
    const tx = { cards: {}, frames: {}, expect: { cards: {}, frames: {} }, capture: { version: 1 as const, token: 'capture-v1:original' } }
    const first = store.saveFrameLayout('default', tx)
    const rejected = expect(first).rejects.toMatchObject({ code: 'layout_conflict' })
    const second = store.saveLayout('default', {})
    await Promise.resolve(); await Promise.resolve()
    expect(token()).toBeNull(); expect(read).toHaveBeenCalledTimes(1)
    read.mockResolvedValue(response('capture-v1:fresh'))
    pending.resolve(data.layout); await second; await rejected
    expect(write).toHaveBeenCalledTimes(2)
    expect(write.mock.calls[0][0]).toMatchObject({ capture: tx.capture })
    expect(token()).toBe('capture-v1:fresh')
  })
  it.each(['patch', 'create', 'remove'] as const)('invalidates before a %s request settles', async method => {
    const { client, store, token } = setup(); await store.load()
    const failure = new Error('offline')
    if (method === 'patch') vi.spyOn(client, 'patch').mockRejectedValue(failure)
    if (method === 'create') vi.spyOn(client, 'create').mockRejectedValue(failure)
    if (method === 'remove') vi.spyOn(client, 'remove').mockRejectedValue(failure)
    const writing = method === 'patch' ? store.patch('id', [], 'rev')
      : method === 'create' ? store.create({ title: 'New' }) : store.remove('id', 'rev')
    expect(token()).toBeNull()
    await expect(writing).rejects.toThrow('offline')
    expect(token()).toBeNull()
  })
  it('keeps a queued guard immutable and does not bind old-board write responses', async () => {
    const { client, store, data, read, token } = setup(); await store.load()
    const pending = deferred<typeof data.layout>()
    const write = vi.spyOn(client, 'layout').mockReturnValueOnce(pending.promise).mockResolvedValue(data.layout)
    const first = store.saveLayout('default', {})
    const tx = { cards: {}, frames: {}, expect: { cards: {}, frames: {} }, capture: { version: 1 as const, token: 'capture-v1:original' } }
    const second = store.saveFrameLayout('default', tx)
    tx.capture.token = 'changed-after-enqueue'
    store.selectBoard('other'); expect(token()).toBeNull()
    read.mockResolvedValue({ status: 200, etag: 'other', data: { ...data, captureToken: 'capture-v1:other', layout: { ...data.layout, board: 'other' } } })
    pending.resolve(data.layout); await first; await second
    expect(token()).toBeNull()
    expect(write.mock.calls[1][0]).toMatchObject({ capture: { token: 'capture-v1:original' } })
    await store.load(); expect(token()).toBe('capture-v1:other')
  })
  it('accepts legacy tokenless reads as unavailable instead of borrowing the previous token', async () => {
    const { store, data, read, token } = setup(); await store.load()
    const { captureToken: _token, ...legacy } = data
    read.mockResolvedValue({ status: 200, data: legacy, etag: 'legacy' })
    expect(await store.load()).toBe(true); expect(token()).toBeNull()
    read.mockResolvedValue({ status: 304 }); expect(await store.load()).toBe(false); expect(token()).toBeNull()
  })
})
