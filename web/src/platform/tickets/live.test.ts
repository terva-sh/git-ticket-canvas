import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LiveUpdates, type LiveStatus } from './live'
import { invalidation, syncHeaders, type SyncMetadata } from './sync'

const meta = (generation = 1, epoch = 'server-a'): SyncMetadata => ({ epoch, generation, stale: false, degraded: false })
type Stream = Pick<EventSource, 'onopen' | 'onmessage' | 'onerror' | 'close'>
const controllers: LiveUpdates[] = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => { controllers.splice(0).forEach(c => c.stop()); vi.useRealTimers() })
function fixture() {
  const sources: Stream[] = [], status = vi.fn<(s: LiveStatus) => void>()
  const read = vi.fn<() => Promise<SyncMetadata | undefined>>().mockResolvedValue(meta())
  let board = 'default'
  const connect = vi.fn(() => {
    const source: Stream = { onopen: null, onmessage: null, onerror: null, close: vi.fn() }
    sources.push(source); return source
  })
  const controller = new LiveUpdates({ read, board: () => board, status, connect })
  controllers.push(controller)
  function message(value = meta(), scopes = ['tickets'], source = sources.at(-1)!) {
    source.onmessage?.call(source as EventSource, { data: JSON.stringify({ ...value, scopes }) } as MessageEvent)
  }
  function error(source = sources.at(-1)!) { source.onerror?.call(source as EventSource, {} as Event) }
  return { controller, read, status, sources, connect, message, error, board: (value: string) => { board = value } }
}
const flush = () => vi.advanceTimersByTimeAsync(1)

it('validates metadata and does not mistake missing headers for generation zero', () => {
  expect(syncHeaders(new Headers())).toBeUndefined()
  const headers = new Headers({ 'X-Canvas-Epoch': 'a', 'X-Canvas-Generation': '0', 'X-Canvas-Stale': 'true', 'X-Canvas-Degraded': 'false' })
  expect(syncHeaders(headers)).toEqual({ epoch: 'a', generation: 0, stale: true, degraded: false })
  headers.set('X-Canvas-Generation', '-1'); expect(syncHeaders(headers)).toBeUndefined()
  for (const value of ['null', '{}', 'garbage', JSON.stringify({ ...meta(), scopes: [2] }), JSON.stringify({ ...meta(-1), scopes: [] })]) {
    expect(invalidation(value)).toBeUndefined()
  }
})
it('coalesces a burst and replaces frequent polling with a non-starvable safety read', async () => {
  const f = fixture(); f.controller.start(); f.message(); await flush()
  expect(f.read).toHaveBeenCalledTimes(1)
  for (let i = 0; i < 25; i++) { await vi.advanceTimersByTimeAsync(1000); f.message() }
  expect(f.read).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(35001)
  expect(f.read).toHaveBeenCalledTimes(2)
})
it('retains an invalidation that arrives during the initial read', async () => {
  const f = fixture()
  let resolve!: (value: SyncMetadata) => void
  f.read.mockReturnValueOnce(new Promise(yes => { resolve = yes })).mockResolvedValue(meta(2))
  f.controller.start(); await flush()
  f.message(meta(2)); f.message(meta(2)); f.message(meta(2))
  expect(f.read).toHaveBeenCalledTimes(1)
  resolve(meta()); await flush()
  expect(f.read).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(2000)
  expect(f.read).toHaveBeenCalledTimes(2)
})
it('ignores duplicate and old generations and unrelated layout scopes', async () => {
  const f = fixture(); f.controller.start(); f.message(); await flush()
  f.message(meta()); f.message(meta(0)); f.message(meta(2), ['layout:other']); await flush()
  expect(f.read).toHaveBeenCalledTimes(1)
  f.board('other'); f.read.mockResolvedValue(meta(3)); f.message(meta(3), ['layout:other']); await flush()
  expect(f.read).toHaveBeenCalledTimes(2)
})
it('revalidates generation gaps even when the latest scope names another board', async () => {
  const f = fixture(); f.controller.start(); f.message(); await flush()
  f.read.mockResolvedValue(meta(4)); f.message(meta(4), ['layout:other']); await flush()
  expect(f.read).toHaveBeenCalledTimes(2)
})
it('revalidates every initial subscription even with the same generation', async () => {
  const f = fixture(); f.controller.start(); f.message(); await flush()
  f.error(); await vi.advanceTimersByTimeAsync(1000)
  f.message(); await flush()
  expect(f.read).toHaveBeenCalledTimes(2)
  expect(f.sources[0].close).toHaveBeenCalledTimes(1)
  f.message(meta(9), ['tickets'], f.sources[0]); await flush()
  expect(f.read).toHaveBeenCalledTimes(2)
})
it('does not let repeated failed reconnects starve 12-second fallback reads', async () => {
  const f = fixture(); f.connect.mockImplementation(() => { throw new Error('unavailable') })
  f.controller.start(); await flush()
  await vi.advanceTimersByTimeAsync(12001)
  expect(f.read).toHaveBeenCalledTimes(2)
  expect(f.status).toHaveBeenLastCalledWith(expect.objectContaining({ connection: 'polling' }))
  await vi.advanceTimersByTimeAsync(12000)
  expect(f.read).toHaveBeenCalledTimes(3)
})
it('times out a connection that opens without an initial synchronization message', async () => {
  const f = fixture(); f.controller.start(); await flush()
  f.sources[0].onopen?.call(f.sources[0] as EventSource, {} as Event)
  await vi.advanceTimersByTimeAsync(10000)
  expect(f.sources[0].close).toHaveBeenCalled()
  expect(f.status).toHaveBeenLastCalledWith(expect.objectContaining({ connection: 'polling' }))
})
it('treats malformed stream messages as a recoverable transport failure', async () => {
  const f = fixture(); f.controller.start(); await flush()
  f.sources[0].onmessage?.call(f.sources[0] as EventSource, { data: '{}' } as MessageEvent)
  expect(f.sources[0].close).toHaveBeenCalled()
  expect(f.status).toHaveBeenLastCalledWith(expect.objectContaining({ connection: 'polling' }))
})
it('exposes stale/degraded state and recovers without replacing ticket data', async () => {
  const f = fixture(); f.controller.start(); f.message(); await flush()
  const stale = { ...meta(2), stale: true, degraded: true }
  f.read.mockResolvedValue(stale); f.message(stale); await flush()
  expect(f.status).toHaveBeenLastCalledWith({ connection: 'live', stale: true, degraded: true, readFailed: false })
  await vi.advanceTimersByTimeAsync(12001)
  expect(f.read).toHaveBeenCalledTimes(3)
  f.read.mockResolvedValue(meta(3)); f.message(meta(3)); await flush()
  expect(f.status).toHaveBeenLastCalledWith({ connection: 'live', stale: false, degraded: false, readFailed: false })
})
it('retries failed reads with bounded delays and preserves an error indicator until success', async () => {
  const f = fixture(); f.read.mockRejectedValue(new Error('network'))
  f.controller.start(); f.message(); await flush()
  expect(f.status).toHaveBeenLastCalledWith(expect.objectContaining({ readFailed: true }))
  await vi.advanceTimersByTimeAsync(1000)
  expect(f.read).toHaveBeenCalledTimes(2)
  f.read.mockResolvedValue(meta()); await vi.advanceTimersByTimeAsync(2001)
  expect(f.status).toHaveBeenLastCalledWith(expect.objectContaining({ readFailed: false }))
})
it('reopens the stream when a read reaches a new server epoch', async () => {
  const f = fixture(); f.controller.start(); f.message(); await flush()
  f.read.mockResolvedValue(meta(1, 'server-b')); f.controller.request(); await flush()
  expect(f.sources[0].close).toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1001); f.message(meta(1, 'server-b')); await flush()
  expect(f.status).toHaveBeenLastCalledWith(expect.objectContaining({ connection: 'live' }))
})
it('stop closes the stream and suppresses timers and late read completion', async () => {
  const f = fixture(); let resolve!: (value: SyncMetadata) => void
  f.read.mockReturnValueOnce(new Promise(yes => { resolve = yes }))
  f.controller.start(); await flush(); f.controller.stop()
  const calls = f.status.mock.calls.length
  resolve(meta()); f.message(meta(4)); await vi.advanceTimersByTimeAsync(120000)
  expect(f.read).toHaveBeenCalledTimes(1); expect(f.status).toHaveBeenCalledTimes(calls)
  expect(f.sources[0].close).toHaveBeenCalledTimes(1)
})
