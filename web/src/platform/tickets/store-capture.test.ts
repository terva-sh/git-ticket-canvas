import { describe, expect, it, vi } from 'vitest'
import { ApiError, TicketClient, type BoardRead } from './client'
import { TicketStore } from './store'
import type { BoardResponse, FrameTransaction } from './types'

// Test-local intersections specify the wire additions without production stubs.
function data(token = 'capture-v1:first', board = 'default'): BoardResponse & { captureToken: string } {
  return { captureToken: token, tickets: [], storePath: '/repo', readOnly: false, boards: ['default', 'other'],
    layout: { schema: 3, board, cards: {}, frames: {}, pens: {}, ruleOrder: [], inbox: { x: 0, y: 0 } },
    config: { statuses: ['draft'], openStatuses: ['draft'], terminalStatuses: [], types: ['task'], priorities: ['normal'],
      blocksOn: ['none'], labels: [], milestones: [], series: ['TKT'], actors: null,
      actor: { ID: 'test', Name: 'Test' }, transitions: {}, reasonRequired: {} } }
}
const response = (value = data()): BoardRead => ({ status: 200, data: value, etag: '"response-etag"' })
const token = (store: TicketStore) => (store.state as typeof store.state & { captureToken: string | null }).captureToken
function setup() {
  const client = new TicketClient(), read = vi.spyOn(client, 'board').mockResolvedValue(response())
  return { client, read, store: new TicketStore(client) }
}
function transaction(): FrameTransaction & { capture: { version: 1; token: string } } {
  return { cards: {}, frames: { f: { title: 'Empty capture', x: 0, y: 0, w: 300, h: 200, color: 'slate', members: [] } },
    expect: { cards: {}, frames: { f: null } }, capture: { version: 1, token: 'capture-v1:first' } }
}

describe('Capture token publication and guarded request contracts', () => {
  it('binds the full-read token, preserves it on 304, and publishes token-only changes', async () => {
    const { store, read } = setup(); await store.load()
    expect(token(store)).toBe('capture-v1:first')
    const first = store.state
    read.mockResolvedValueOnce({ status: 304 }); expect(await store.load()).toBe(false)
    expect(store.state).toBe(first); expect(token(store)).toBe('capture-v1:first')
    read.mockResolvedValueOnce(response(data('capture-v1:second')))
    expect(await store.load()).toBe(true); expect(token(store)).toBe('capture-v1:second')
  })
  it('clears the token on board switches and ignores old-generation reads', async () => {
    const { store, read } = setup(); await store.load()
    let resolve!: (value: BoardRead) => void
    read.mockReturnValueOnce(new Promise<BoardRead>(yes => { resolve = yes }))
    const old = store.load(); store.selectBoard('other')
    const switchedToken = token(store)
    resolve(response()); await old
    expect(switchedToken).toBeNull(); expect(token(store)).toBeNull()
    read.mockResolvedValueOnce(response(data('capture-v1:other', 'other'))); await store.load()
    expect(token(store)).toBe('capture-v1:other')
  })
  it('forwards a declared guard and clears an unrefreshable token after mutation', async () => {
    const { client, store, read } = setup(); await store.load()
    const tx = transaction(), written = { ...data().layout, frames: { f: tx.frames.f! } }
    const write = vi.spyOn(client, 'layout').mockResolvedValue(written)
    await store.saveFrameLayout('default', tx)
    expect(write).toHaveBeenCalledWith({ board: 'default', ...tx })
    expect(token(store)).toBeNull()
    // A token cannot be restored from an unrelated 304 after a tokenless write.
    const { captureToken: _token, ...tokenless } = data()
    const readsBefore = read.mock.calls.length
    read.mockResolvedValueOnce({ status: 304 }).mockResolvedValueOnce({ status: 200, data: tokenless, etag: null })
    await store.load(); expect(token(store)).toBeNull()
    expect(read).toHaveBeenCalledTimes(readsBefore + 2)
    read.mockResolvedValueOnce(response(data('capture-v1:after'))); await store.load()
    expect(token(store)).toBe('capture-v1:after')
  })
  it('reloads a capture conflict without replaying the original spatial operation', async () => {
    const { client, store, read } = setup(); await store.load()
    const write = vi.spyOn(client, 'layout').mockRejectedValue(new ApiError(409, { code: 'layout_conflict', message: 'Capture inputs changed' }))
    read.mockResolvedValueOnce(response(data('capture-v1:reloaded')))
    await expect(store.saveFrameLayout('default', transaction())).rejects.toMatchObject({ code: 'layout_conflict' })
    expect(write).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledTimes(2)
    expect(token(store)).toBe('capture-v1:reloaded')
  })
})
