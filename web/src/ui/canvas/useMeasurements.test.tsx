// @vitest-environment jsdom
import { render } from 'preact'
import { useLayoutEffect, useRef } from 'preact/hooks'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMeasurements } from './useMeasurements'
import { CardView } from './CardView'
import { Canvas, type CanvasProps } from '../Canvas'
import { drawGrid } from './grid'
import type { Ticket } from '../../platform/tickets/types'

vi.mock('./grid', () => ({ drawGrid: vi.fn() }))
let root: HTMLDivElement, api: ReturnType<typeof useMeasurements>, renders: number
let frames: Map<number, FrameRequestCallback>, sequence: number, heights: WeakMap<Element, number>
let observers: Observer[]
class Observer {
  observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn()
  constructor(readonly callback: ResizeObserverCallback) { observers.push(this) }
  fire(...targets: Element[]) {
    const size = [{ blockSize: 9999, inlineSize: 280 }]
    this.callback(targets.map(target => ({ target, contentRect: new DOMRect(0, 0, 280, 9999),
      borderBoxSize: size, contentBoxSize: size, devicePixelContentBoxSize: size })), this as unknown as ResizeObserver)
  }
}
const ticket: Ticket = { id: 'a', short: 'a', title: 'Measured card', revision: 'r1', type: 'task', status: 'ready', priority: 'normal',
  labels: ['one', 'two', 'three'], assignees: [], dependencies: [], blocksOn: 'none', references: [], archived: false,
  createdAt: '', updatedAt: '', body: { description: '', plan: '', summary: '', acceptanceCriteria: [], definitionOfDone: [], notes: [], comments: [] },
  readiness: { ready: true, blocked: false } }
function Harness({ cards = [], dimmed = false }: { cards?: Ticket[]; dimmed?: boolean }) {
  const stage = useRef<HTMLDivElement>(null), measured = useMeasurements(stage)
  renders++
  useLayoutEffect(() => { api = measured })
  return <div ref={stage} data-stage>{cards.map(t => <CardView key={t.id} ticket={t} x={0} y={0} z={1}
    pinned={false} selected={false} dimmed={dimmed} target={false} register={measured.register} />)}</div>
}
function mount(cards: Ticket[] = []) { act(() => render(<Harness cards={cards} />, root)); flush() }
function flush() {
  const pending = [...frames]; frames.clear()
  act(() => { for (const [, callback] of pending) callback(0) })
}
function card(height = 100) {
  const element = document.createElement('div'); root.append(element); heights.set(element, height)
  return element
}
function register(id = 'a', height = 100) {
  const element = card(height)
  let cleanup!: () => void
  act(() => { cleanup = api.register(id, element) })
  flush()
  return { element, cleanup }
}
beforeEach(() => {
  root = document.createElement('div'); document.body.append(root)
  frames = new Map(); sequence = 0; heights = new WeakMap(); observers = []; renders = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
  vi.stubGlobal('ResizeObserver', Observer)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return heights.get(this) ?? (this.matches('.card') ? 100 : 0)
  })
  vi.mocked(drawGrid).mockClear()
})
afterEach(() => { act(() => render(null, root)); root.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Committed card sampling', () => {
  it('binds fresh heights to registration incarnation and rejects detached cards', () => {
    mount(); const element = card(180), incarnation = Symbol('incarnation')
    const cleanup = api.register('a', element, incarnation)
    const first = api.sampleCards()!
    expect(first[0]).toMatchObject({ id: 'a', incarnation, height: 180, connected: true })
    heights.set(element, 230)
    expect(api.sampleCards()![0]!.height).toBe(230)
    expect(first[0]!.height).toBe(180)
    element.remove()
    expect(api.sampleCards()![0]!.connected).toBe(false)
    cleanup()
    expect(api.sampleCards()).toEqual([])
  })
  it('keeps replacement owner and incarnation after stale cleanup', () => {
    mount(); const old = api.register('a', card(), Symbol('old')), incarnation = Symbol('new')
    api.register('a', card(210), incarnation)
    const owner = api.sampleCards()![0]!.owner
    old()
    expect(api.sampleCards()![0]).toMatchObject({ incarnation, owner, height: 210 })
  })
})

describe('Measurement publications', () => {
  it('captures child registrations before parent mount and measures border boxes in scene units', () => {
    mount([ticket])
    expect(api.sizes.heights.get('a')).toBe(100)
    expect(api.heights.get('a')).toBe(100)
    expect(typeof api.sizes.registrations.get('a')).toBe('symbol')
    expect(observers[0].observe).toHaveBeenCalledWith(root.querySelector('.card'), { box: 'border-box' })
    root.style.transform = 'scale(3)'
    act(() => observers[0].fire(root.querySelector('.card')!)); flush()
    expect(api.sizes.heights.get('a')).toBe(100)
  })
  it('does not publish or rerender for identical card observations or ordinary parent renders', () => {
    mount(); const { element } = register(), old = api.sizes, count = renders
    act(() => { observers[0].fire(element); observers[0].fire(element) }); flush()
    expect(api.sizes).toBe(old); expect(renders).toBe(count)
    act(() => render(<Harness dimmed />, root))
    expect(api.sizes).toBe(old)
  })
  it('redraws for stage/window changes without publishing unchanged sizes', () => {
    mount(); register(); const old = api.sizes, viewport = api.viewportRevision
    act(() => { observers[0].fire(root.querySelector('[data-stage]')!); window.dispatchEvent(new Event('resize')) })
    flush()
    expect(api.viewportRevision).toBe(viewport + 1); expect(api.sizes).toBe(old)
  })
  it('coalesces true height changes and keeps live reads separate from the immutable publication', () => {
    mount(); const a = register(), b = register('b', 200), old = api.sizes, viewport = api.viewportRevision
    act(() => {
      heights.set(a.element, 110); observers[0].fire(a.element)
      heights.set(a.element, 120); heights.set(b.element, 220); observers[0].fire(a.element, b.element)
    })
    expect(api.sizes).toBe(old); expect(api.heights.get('a')).toBe(120); expect(frames.size).toBe(1)
    flush()
    expect(api.sizes.revision).toBe(old.revision + 1); expect([...api.sizes.heights]).toEqual([['a', 120], ['b', 220]])
    expect(old.heights.get('a')).toBe(100); expect(old.heights.get('b')).toBe(200)
    expect(api.viewportRevision).toBe(viewport)
  })
  it('does not publish changes that revert before the scheduled frame', () => {
    mount(); const { element } = register(), old = api.sizes, count = renders
    act(() => { heights.set(element, 150); observers[0].fire(element); heights.set(element, 100); observers[0].fire(element) })
    flush(); expect(api.sizes).toBe(old); expect(renders).toBe(count)
  })
  it.each([0, -1, NaN, Infinity])('leaves invalid height %s missing but preserves registration membership', height => {
    mount(); const { element } = register('a', height)
    expect(api.sizes.heights.has('a')).toBe(false); expect(api.sizes.registrations.has('a')).toBe(true)
    act(() => { heights.set(element, 100); observers[0].fire(element) }); flush()
    expect(api.sizes.heights.get('a')).toBe(100)
    act(() => { heights.set(element, height); observers[0].fire(element) }); flush()
    expect(api.sizes.heights.has('a')).toBe(false); expect(api.heights.has('a')).toBe(false)
  })
  it('never exposes mutable snapshot maps or a backing map through forEach', () => {
    mount(); register(); const old = api.sizes
    expect(Object.isFrozen(old)).toBe(true)
    expect(() => (old.heights as Map<string, number>).set('a', 999)).toThrow()
    expect(() => (old.registrations as Map<string, symbol>).clear()).toThrow()
    old.heights.forEach((_height, _id, view) => { expect(view).toBe(old.heights); expect('set' in view).toBe(false) })
    expect(() => { (old as { revision: number }).revision = 100 }).toThrow()
  })
  it('captures window-triggered height changes without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    mount(); const { element } = register(), old = api.sizes
    act(() => { heights.set(element, 170); window.dispatchEvent(new Event('resize')) }); flush()
    expect(api.sizes.heights.get('a')).toBe(170); expect(api.sizes.revision).toBe(old.revision + 1)
  })
})

describe('Explicit committed sampling', () => {
  it('rereads equal heights for each token without publishing or scheduling work', () => {
    mount(); const { element } = register(), old = api.sizes, viewport = api.viewportRevision, count = renders
    const read = vi.fn(() => 100)
    Object.defineProperty(element, 'offsetHeight', { get: read })
    const token = Object.freeze({ baseline: 'new' }), first = api.sample(token)!, second = api.sample(token)!
    expect(read).toHaveBeenCalledTimes(2)
    expect(first.token).toBe(token); expect(second).not.toBe(first)
    expect([...first.heights]).toEqual([['a', 100]])
    expect(first.registrations.get('a')).toBe(old.registrations.get('a'))
    expect(frames.size).toBe(0); flush()
    expect(api.sizes).toBe(old); expect(api.viewportRevision).toBe(viewport); expect(renders).toBe(count)
  })
  it('copies fresh changed measurements while retaining coalesced semantic publication', () => {
    mount(); const { element } = register(), old = api.sizes, viewport = api.viewportRevision
    heights.set(element, 170)
    const first = api.sample('first')!
    heights.set(element, 190)
    const second = api.sample('second')!
    expect(first.heights.get('a')).toBe(170); expect(second.heights.get('a')).toBe(190)
    expect(api.sizes).toBe(old); expect(frames.size).toBe(1)
    expect(Object.isFrozen(first)).toBe(true); expect('set' in first.heights).toBe(false)
    first.registrations.forEach((_owner, _id, map) => expect(map).toBe(first.registrations))
    expect('clear' in first.registrations).toBe(false)
    flush(); expect(api.sizes.revision).toBe(old.revision + 1)
    expect(api.sizes.heights.get('a')).toBe(190); expect(api.viewportRevision).toBe(viewport)
    expect(old.heights.get('a')).toBe(100); expect(first.heights.get('a')).toBe(170)
  })
  it.each([0, -1, NaN, Infinity])('omits freshly invalid height %s without omitting registration', height => {
    mount(); const { element } = register()
    heights.set(element, height)
    const sampled = api.sample('invalid')!
    expect(sampled.heights.has('a')).toBe(false); expect(sampled.registrations.has('a')).toBe(true)
    flush(); expect(api.sizes.heights.has('a')).toBe(false)
  })
  it('samples current owners, ignores old cleanup, and refuses sampling after unmount', () => {
    mount(); const old = register(), first = api.sample('first')!
    const newer = register('a', 220); old.cleanup()
    const next = api.sample('next')!
    expect(next.heights.get('a')).toBe(220)
    expect(next.registrations.get('a')).not.toBe(first.registrations.get('a'))
    newer.cleanup(); expect(api.sample('removed')!.registrations.size).toBe(0)
    const sample = api.sample
    act(() => render(null, root))
    expect(sample('disposed')).toBeNull(); expect(frames.size).toBe(0)
    expect(first.heights.get('a')).toBe(100)
  })
})

describe('Registration ownership', () => {
  it('old cleanup and old-element notifications cannot remove or measure a newer same-ID registration', () => {
    mount(); const old = register(), newer = register('a', 200), publication = api.sizes
    act(() => { old.cleanup(); heights.set(newer.element, 250); observers[0].fire(old.element) }); flush()
    expect(api.sizes).toBe(publication); expect(api.heights.get('a')).toBe(200)
    expect(api.elements.get('a')).toBe(newer.element)
    act(() => observers[0].fire(newer.element)); flush()
    expect(api.sizes.heights.get('a')).toBe(250)
    act(() => newer.cleanup()); flush()
    expect(api.sizes.heights.has('a')).toBe(false); expect(api.sizes.registrations.has('a')).toBe(false)
    const removed = api.sizes
    act(() => { newer.cleanup(); observers[0].fire(newer.element) }); flush()
    expect(api.sizes).toBe(removed)
  })
  it('gives same-element re-registration a fresh owner and reads current dimensions instead of queued entry sizes', () => {
    mount(); const old = register(), first = api.sizes
    let cleanup!: () => void
    act(() => { cleanup = api.register('a', old.element) }); flush()
    expect(api.sizes.registrations.get('a')).not.toBe(first.registrations.get('a'))
    expect(api.sizes.revision).toBe(first.revision + 1)
    act(() => { old.cleanup(); heights.set(old.element, 125); observers[0].fire(old.element) }); flush()
    expect(api.sizes.heights.get('a')).toBe(125)
    act(() => cleanup()); flush(); expect(api.sizes.registrations.size).toBe(0)
  })
  it('keeps filtered cards registered, ignores unchanged disclosure height, and publishes actual size changes', () => {
    mount([ticket]); const initial = api.sizes, element = root.querySelector<HTMLDivElement>('.card')!
    act(() => render(<Harness cards={[ticket]} dimmed />, root)); flush()
    expect(element.classList.contains('dimmed')).toBe(true); expect(api.sizes).toBe(initial)
    act(() => root.querySelector<HTMLButtonElement>('.label-more')!.click())
    expect(element.querySelector<HTMLDivElement>('.card-label-disclosure')!.hidden).toBe(false)
    act(() => observers[0].fire(element)); flush()
    expect(api.sizes).toBe(initial)
    act(() => { heights.set(element, 180); observers[0].fire(element) }); flush()
    expect(api.sizes.heights.get('a')).toBe(180)
    act(() => render(<Harness />, root)); flush()
    expect(api.sizes.heights.size).toBe(0); expect(api.sizes.registrations.size).toBe(0)
    act(() => observers[0].fire(element)); flush(); expect(api.sizes.heights.size).toBe(0)
  })
  it('cancels pending work and ignores old observer/RAF/registration callbacks across A/B/A remounts', () => {
    mount(); const a = register(), oldAPI = api, oldObserver = observers[0], published = api.sizes
    act(() => { heights.set(a.element, 180); oldObserver.fire(a.element) })
    const queued = [...frames.values()]
    act(() => render(<Harness key="B" cards={[{ ...ticket, id: 'b' }]} />, root)); flush()
    const b = api.sizes
    act(() => { queued.forEach(fn => fn(0)); oldObserver.fire(a.element); a.cleanup(); oldAPI.register('late', a.element) }); flush()
    expect(api.sizes).toBe(b); expect(api.sizes.heights.has('a')).toBe(false)
    expect(oldObserver.disconnect).toHaveBeenCalledTimes(1)
    expect(oldAPI.elements.size).toBe(0); expect(oldAPI.heights.size).toBe(0); expect(published.heights.get('a')).toBe(100)
    act(() => render(<Harness key="A2" cards={[ticket]} />, root)); flush()
    expect(api.sizes.registrations.get('a')).not.toBe(published.registrations.get('a'))
    act(() => { window.dispatchEvent(new Event('resize')) })
    act(() => render(null, root)); expect(frames.size).toBe(0)
    window.dispatchEvent(new Event('resize')); expect(frames.size).toBe(0)
  })
  it('CardView returns the registration cleanup rather than unregistering by ID', () => {
    const cleanup = vi.fn(), register = vi.fn(() => cleanup)
    act(() => render(<CardView ticket={ticket} x={0} y={0} z={1} pinned={false} selected={false} dimmed={false} target={false} register={register} />, root))
    act(() => render(null, root))
    expect(register).toHaveBeenCalledTimes(1); expect(cleanup).toHaveBeenCalledTimes(1)
  })
})

it('Canvas redraws the grid for viewport events, keeps measured edges and positions, and never saves measurements', () => {
  const props: CanvasProps = { board: 'default', tickets: new Map([['a', { ...ticket, dependencies: ['b'] }], ['b', { ...ticket, id: 'b' }]]),
    cards: { a: { x: 111, y: 222 } }, statuses: ['ready'], selection: new Set(['a']), query: '', filters: new Set(), readOnly: false,
    onSelect: vi.fn(), onLayout: vi.fn(), onLink: vi.fn(), onCompose: vi.fn(), onError: vi.fn(), onBusy: vi.fn() }
  act(() => render(<Canvas {...props} />, root)); flush()
  const elements = [...root.querySelectorAll<HTMLDivElement>('.card')], positions = elements.map(e => e.style.transform)
  const edge = () => root.querySelector('.relationship path')?.getAttribute('d')
  const before = edge(); expect(before).toBeTruthy()
  vi.mocked(drawGrid).mockClear()
  act(() => { heights.set(elements[0], 250); observers[0].fire(elements[0]) }); flush()
  expect(edge()).not.toBe(before); expect(drawGrid).not.toHaveBeenCalled()
  act(() => { window.dispatchEvent(new Event('resize')) }); flush()
  expect(drawGrid).toHaveBeenCalledTimes(1)
  act(() => render(<Canvas {...props} filters={new Set(['done'])} />, root)); flush()
  expect(elements.map(e => e.style.transform)).toEqual(positions)
  expect(elements.every(e => e.classList.contains('dimmed'))).toBe(true)
  expect(props.onLayout).not.toHaveBeenCalled()
})
