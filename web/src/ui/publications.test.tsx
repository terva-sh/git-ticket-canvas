// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { App } from './App'
import { CommittedSampling } from './canvas/committedSampling'
import { TicketClient, type BoardRead } from '../platform/tickets/client'
import type { Board, BoardResponse, Ticket } from '../platform/tickets/types'
import { PublicationBridge } from '../platform/canvas/publications'
import { PlacementSnapshots } from '../platform/canvas/snapshots'
import { allocatePlacement } from '../platform/canvas/placement'

vi.mock('./canvas/grid', () => ({ drawGrid: vi.fn() }))
let root: HTMLDivElement, frames: Map<number, FrameRequestCallback>, sequence: number, height: number
let observer: ResizeObserverCallback
function data(board = 'default'): BoardResponse {
  const ticket: Ticket = { id: 'a', short: 'a', title: 'First', revision: 'r1', type: 'task', status: 'draft',
    priority: 'normal', labels: [], assignees: [], dependencies: [], blocksOn: 'none', references: [],
    archived: false, createdAt: 'birth', updatedAt: '', body: { description: '', plan: '', summary: '',
      acceptanceCriteria: [], definitionOfDone: [], notes: [], comments: [] }, readiness: { ready: false, blocked: false } }
  return { tickets: [ticket], layout: { schema: 3, board, cards: {}, frames: {}, pens: {}, ruleOrder: [], inbox: { x: 900, y: 900 } },
    boards: ['default', 'B'], storePath: '/fixture', readOnly: false,
    config: { statuses: ['draft'], openStatuses: ['draft'], terminalStatuses: ['done'], types: ['task'], priorities: ['normal'],
      blocksOn: ['none'], labels: [], milestones: [], series: ['TKT'], actors: [],
      actor: { ID: 'agent:test', Name: 'Test' }, transitions: {}, reasonRequired: {} } }
}
const modified = (value = data()): BoardRead => ({ status: 200, data: value, etag: 'snapshot' })
const element = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
async function flush() {
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  for (let i = 0; frames.size && i < 8; i++) {
    const pending = [...frames.values()]; frames.clear()
    await act(async () => { pending.forEach(callback => callback(0)) })
  }
  expect(frames.size).toBe(0)
}
async function refresh() { await act(async () => { document.dispatchEvent(new Event('visibilitychange')) }); await flush() }
function pointer(type: string, target: HTMLElement = element('#stage'), x = 0, y = 0) {
  const stage = element('#stage')
  stage.setPointerCapture = () => {}; stage.hasPointerCapture = () => false; stage.releasePointerCapture = () => {}
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y }))
}
async function board(name: string) {
  const select = element<HTMLSelectElement>('#boardSelect')
  await act(async () => { select.value = name; select.dispatchEvent(new Event('change', { bubbles: true })) }); await flush()
}
function setup() {
  const allocator = vi.fn(allocatePlacement), controller = new PlacementSnapshots(allocator)
  const accept = vi.spyOn(controller, 'accept'), onResult = vi.fn()
  const bridge = new PublicationBridge({ controller, obstacles: [], onResult })
  return { bridge, controller, accept, allocator, onResult }
}
async function mount(bridge?: PublicationBridge, samplingProbe?: CommittedSampling) {
  const read = vi.spyOn(TicketClient.prototype, 'board').mockImplementation(async name => modified(data(name)))
  await act(async () => { render(<App publicationBridge={bridge} samplingProbe={samplingProbe} />, root) }); await flush()
  expect(root.querySelectorAll('.card')).toHaveLength(1)
  return read
}
beforeEach(() => {
  vi.useFakeTimers(); frames = new Map(); sequence = 0; height = 100
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
  vi.stubGlobal('ResizeObserver', class {
    constructor(readonly callback: ResizeObserverCallback) {}
    observe(target: Element) { if (target.id === 'stage') observer = this.callback }
    unobserve() {}; disconnect() {}
  })
  vi.stubGlobal('EventSource', undefined)
  vi.spyOn(TicketClient.prototype, 'version').mockRejectedValue(new Error('fixture'))
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.matches('.card') ? height : this.matches('.canvas-frame-title, .canvas-frame-resize') ? 26 : 0 })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100)
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) { return this.closest('.canvas-frame') })
  root = document.createElement('div'); document.body.append(root)
})
afterEach(() => { act(() => render(null, root)); root.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

it('samples committed App cards without calling placement or mutations', async () => {
  const probe = new CommittedSampling(), accept = vi.spyOn(PlacementSnapshots.prototype, 'accept')
  const write = vi.spyOn(TicketClient.prototype, 'layout')
  const read = await mount(undefined, probe)
  const first = probe.receipt!
  expect(first?.complete).toBe(true)
  expect(first.captureReady).toBe(false)
  expect(first.cards[0]!.height).toBe(100)
  const next = data(); next.tickets[0].title = 'New metadata'; next.tickets[0].revision = 'r2'
  read.mockResolvedValue(modified(next)); await refresh()
  expect(probe.receipt!.request.publication).not.toBe(first.request.publication)
  expect(probe.receipt!.geometryRevision).toBe(first.geometryRevision)
  expect(probe.receipt!.cards[0]!.incarnation).toBe(first.cards[0]!.incarnation)
  await board('B'); await board('default')
  expect(probe.receipt!.cards[0]!.incarnation).not.toBe(first.cards[0]!.incarnation)
  expect(accept).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled()
})
it('clears sampling evidence throughout gesture and unpublished accepted state', async () => {
  const probe = new CommittedSampling(), read = await mount(undefined, probe), pending = deferred<BoardRead>()
  read.mockReturnValueOnce(pending.promise); await refresh()
  act(() => pointer('pointerdown'))
  expect(probe.receipt).toBeNull()
  const next = data(); next.tickets[0].title = 'Deferred sampling'
  await act(async () => pending.resolve(modified(next))); await flush()
  expect(probe.receipt).toBeNull()
  read.mockResolvedValue({ status: 304 })
  act(() => pointer('pointercancel')); await flush()
  expect(probe.receipt?.complete).toBe(true)
})

it('keeps default App disconnected and captures injection once for the mount', async () => {
  const samplePublish = vi.spyOn(CommittedSampling.prototype, 'publish')
  const publish = vi.spyOn(PublicationBridge.prototype, 'publish'), accept = vi.spyOn(PlacementSnapshots.prototype, 'accept')
  await mount(); expect(publish).not.toHaveBeenCalled(); expect(accept).not.toHaveBeenCalled()
  const { bridge } = setup()
  await act(async () => { render(<App publicationBridge={bridge} />, root) }); await refresh()
  expect(publish).not.toHaveBeenCalled(); expect(accept).not.toHaveBeenCalled(); expect(samplePublish).not.toHaveBeenCalled()
})
it.each([200, 304])('accepts the initial committed publication but not unchanged %s reads', async status => {
  const { bridge, accept, controller } = setup(), read = await mount(bridge)
  expect(accept).toHaveBeenCalledTimes(1); expect(controller.accepted!.positions.get('a')!.height).toBe(100)
  read.mockResolvedValue(status === 200 ? modified() : { status: 304 }); await refresh()
  expect(accept).toHaveBeenCalledTimes(1)
})
it('requires fresh equal-height samples for metadata publications and ignores filter, selection and zoom renders', async () => {
  const { bridge, controller, accept, allocator } = setup(), read = await mount(bridge)
  const first = controller.accepted!, owner = element('.card'), identity = bridge.current!.identities.get('a')
  const next = data(); next.tickets[0].title = 'Edited'; next.tickets[0].revision = 'r2'
  read.mockResolvedValue(modified(next)); await refresh()
  expect(controller.accepted!.baseline).not.toBe(first.baseline)
  expect(controller.accepted!.positions).toBe(first.positions); expect(allocator).toHaveBeenCalledTimes(1)
  expect(bridge.current!.identities.get('a')).toBe(identity); expect(element('.card')).toBe(owner)
  const count = accept.mock.calls.length
  await act(async () => { const search = element<HTMLInputElement>('#search'); search.value = 'hidden'; search.dispatchEvent(new Event('input', { bubbles: true })) }); await flush()
  await act(async () => { element('#stage').dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 10 })) }); await flush()
  expect(accept).toHaveBeenCalledTimes(count)
})
it('defers accepted reads during a gesture and publishes them after a later 304', async () => {
  const { bridge, accept } = setup(), read = await mount(bridge), pending = deferred<BoardRead>()
  read.mockReturnValueOnce(pending.promise); await refresh()
  const old = bridge.current!, request = bridge.request(old)!
  act(() => pointer('pointerdown'))
  const next = data(); next.tickets[0].title = 'Deferred'
  await act(async () => { pending.resolve(modified(next)) }); await flush()
  expect(element('.card-title').textContent).toBe('First'); expect(bridge.current).toBe(old)
  expect(bridge.report(request, { token: request, heights: new Map([['a', 100]]), registrations: new Map([['a', Symbol()]]) }, true)).toBeNull()
  expect(accept).toHaveBeenCalledTimes(1)
  read.mockResolvedValue({ status: 304 })
  act(() => pointer('pointercancel')); await flush()
  expect(element('.card-title').textContent).toBe('Deferred'); expect(accept).toHaveBeenCalledTimes(2)
})
it('rejects stale commits through A/B/A and disposes outstanding reports on unmount', async () => {
  const { bridge, controller } = setup(); await mount(bridge)
  const first = bridge.current!, request = bridge.request(first)!, positions = controller.accepted!.positions
  await board('B'); await board('default')
  expect(bridge.current!.scope.generation).not.toBe(first.scope.generation)
  expect(bridge.current!.identities.get('a')).toBe(first.identities.get('a'))
  expect(controller.accepted!.positions).toBe(positions)
  expect(bridge.report(request, { token: request, heights: new Map(), registrations: new Map() }, true)).toBeNull()
  act(() => render(null, root)); expect(bridge.request(bridge.current!)).toBeNull()
})
it('changes observed creation identity even with reused DOM and detects observed deletion/reappearance', async () => {
  const { bridge } = setup(), read = await mount(bridge), first = bridge.current!, dom = element('.card')
  const next = data(); next.tickets[0].createdAt = 'recreated'
  read.mockResolvedValue(modified(next)); await refresh()
  expect(element('.card')).toBe(dom); expect(bridge.current!.identities.get('a')).not.toBe(first.identities.get('a'))
  const beforeDelete = bridge.current!, empty = data(); empty.tickets = []
  read.mockResolvedValue(modified(empty)); await refresh()
  read.mockResolvedValue(modified(next)); await refresh()
  expect(bridge.current!.identities.get('a')).not.toBe(beforeDelete.identities.get('a'))
})
it('accepts measurement-only changes and recovers failed calculations without replacing displayed positions', async () => {
  const { bridge, controller, onResult } = setup(); await mount(bridge)
  const first = controller.accepted!, displayed = element('.card').style.transform
  async function resize(value: number) {
    height = value
    act(() => observer([{ target: element('.card') } as unknown as ResizeObserverEntry], {} as ResizeObserver)); await flush()
  }
  await resize(3e9)
  expect(onResult.mock.lastCall![0].ok).toBe(false); expect(controller.accepted).toBe(first)
  expect(element('.card').style.transform).toBe(displayed)
  await resize(190)
  expect(controller.failure).toBeNull(); expect(controller.accepted!.baseline).toBe(first.baseline)
  expect(controller.accepted!.positions.get('a')!.height).toBe(190)
  expect(element('.card').style.transform).toBe(displayed)
})
it.each([true, false])('holds through drop previews until manual save settles, success=%s', async success => {
  const probe = new CommittedSampling()
  const { bridge, accept, controller } = setup(), read = await mount(bridge, probe), pending = deferred<Board>()
  expect(probe.receipt?.complete).toBe(true)
  const save = vi.spyOn(TicketClient.prototype, 'layout').mockReturnValue(pending.promise)
  read.mockResolvedValue({ status: 304 })
  act(() => pointer('pointerdown', element('.card'), 10, 10))
  act(() => pointer('pointermove', element('#stage'), 60, 70)); await flush()
  height = 170
  act(() => observer([{ target: element('.card') } as unknown as ResizeObserverEntry], {} as ResizeObserver)); await flush()
  expect(accept).toHaveBeenCalledTimes(1)
  act(() => pointer('pointerup', element('#stage'), 60, 70)); await flush()
  expect(accept).toHaveBeenCalledTimes(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(200) }); await flush()
  expect(save).toHaveBeenCalledTimes(1); expect(accept).toHaveBeenCalledTimes(1)
  expect(probe.receipt).toBeNull()
  const request = save.mock.calls[0][0]
  expect(Object.keys(request).sort()).toEqual(['board', 'cards'])
  const saved = { ...data().layout, cards: request.cards! } as Board
  await act(async () => { if (success) pending.resolve(saved); else pending.reject(new Error('fixture failure')) }); await flush()
  if (success) { expect(accept).toHaveBeenCalledTimes(2); expect(controller.accepted!.positions.get('a')!.mode).toBe('manual') }
  else { expect(controller.accepted!.positions.get('a')!.mode).toBe('automatic'); expect(root.textContent).toContain('fixture failure') }
  expect(controller.accepted!.positions.get('a')!.height).toBe(170)
  expect(probe.receipt?.cards[0]!.height).toBe(170)
  expect(save).toHaveBeenCalledTimes(1)
})
it('holds frame operations until the accepted frame state is committed', async () => {
  const probe = new CommittedSampling()
  const { bridge, accept } = setup(), read = await mount(bridge, probe), pending = deferred<Board>()
  expect(probe.receipt?.complete).toBe(true)
  const save = vi.spyOn(TicketClient.prototype, 'layout').mockReturnValue(pending.promise)
  read.mockResolvedValue({ status: 304 })
  const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'New frame')!
  act(() => button.click()); await flush()
  const submit = [...root.querySelectorAll<HTMLButtonElement>('#framePanel button')].find(button => button.textContent === 'Create and capture')!
  act(() => submit.click()); await flush()
  expect(save).toHaveBeenCalledTimes(1); expect(accept).toHaveBeenCalledTimes(1)
  expect(probe.receipt).toBeNull()
  const request = save.mock.calls[0][0]
  await act(async () => pending.resolve({ ...data().layout, frames: request.frames } as Board)); await flush()
  expect(accept).toHaveBeenCalledTimes(2)
  expect(probe.receipt?.complete).toBe(true)
  expect(probe.receipt?.controls).toHaveLength(2)
})
it('samples changed DOM heights on a new publication before any observer notification', async () => {
  const { bridge, controller, accept } = setup(), read = await mount(bridge)
  const first = controller.accepted!, next = data(); next.tickets[0].title = 'New wrapped title'
  height = 240
  read.mockResolvedValue(modified(next)); await refresh()
  expect(controller.accepted!.baseline).not.toBe(first.baseline)
  expect(controller.accepted!.positions.get('a')!.height).toBe(240)
  expect(accept).toHaveBeenCalledTimes(2)
})
it.each([true, false])('injection preserves displayed positions and exact manual requests, success=%s', async success => {
  async function exercise(injected: boolean) {
    const { bridge, controller } = setup(), read = await mount(injected ? bridge : undefined)
    const pending = deferred<Board>(), save = vi.spyOn(TicketClient.prototype, 'layout').mockReturnValue(pending.promise)
    read.mockResolvedValue({ status: 304 })
    const initial = element('.card').style.transform
    if (injected) expect(controller.accepted!.positions.get('a')!.x).toBe(900)
    act(() => pointer('pointerdown', element('.card'), 10, 10))
    act(() => pointer('pointermove', element('#stage'), 60, 70)); await flush()
    act(() => pointer('pointerup', element('#stage'), 60, 70)); await flush()
    const preview = element('.card').style.transform
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(save).toHaveBeenCalledTimes(1)
    const request = structuredClone(save.mock.calls[0][0])
    await act(async () => {
      if (success) pending.resolve({ ...data().layout, cards: request.cards } as Board)
      else pending.reject(new Error('fixture failure'))
    }); await flush()
    const settled = element('.card').style.transform
    act(() => render(null, root)); read.mockRestore(); save.mockRestore()
    return { initial, preview, settled, request }
  }
  expect(await exercise(true)).toEqual(await exercise(false))
})
it('isolates a throwing diagnostic observer from accepted App state', async () => {
  const bridge = new PublicationBridge({ obstacles: [], onResult() { throw new Error('diagnostic only') } })
  await mount(bridge)
  expect(bridge.current).not.toBeNull(); expect(element('.card-title').textContent).toBe('First')
  expect(root.textContent).not.toContain('diagnostic only')
})
