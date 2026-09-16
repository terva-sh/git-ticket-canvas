// @vitest-environment jsdom
import { createRef, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Canvas, type CanvasHandle, type CanvasProps } from './Canvas'
import type { Cards, Ticket } from '../platform/tickets/types'

vi.mock('./canvas/grid', () => ({ drawGrid: vi.fn() }))

let root: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {}; unobserve() {}; disconnect() {} })
  root = document.createElement('div'); document.body.append(root)
})
afterEach(() => { act(() => render(null, root)); root.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function ticket(id: string): Ticket {
  return { id, short: id, title: id, status: 'ready', type: 'task', priority: 'normal', labels: [],
    assignees: [], dependencies: [], blocksOn: 'none', references: [], updatedAt: '' } as unknown as Ticket
}

function mount(over: Partial<CanvasProps> = {}) {
  const save = vi.fn().mockResolvedValue(undefined)
  const cards: Cards = { 'TKT-A': { x: 400, y: 400 }, 'TKT-B': { x: 800, y: 400 } }
  const props: CanvasProps = {
    board: 'default', tickets: new Map([['TKT-A', ticket('TKT-A')], ['TKT-B', ticket('TKT-B')], ['TKT-C', ticket('TKT-C')]]),
    cards, statuses: ['ready'], selection: new Set(), query: '', filters: new Set(), readOnly: false,
    onSelect: vi.fn(), onLayout: save, onLink: vi.fn(), onCompose: vi.fn(), onError: vi.fn(), onBusy: vi.fn(),
    ...over,
  }
  const handle = createRef<CanvasHandle>()
  act(() => render(<Canvas {...props} ref={handle} />, root))
  return { save, handle, props }
}

function card(id: string) { return root.querySelector<HTMLElement>(`.card[data-id="${id}"]`)! }
function releaseButton(id: string) { return root.querySelector<HTMLButtonElement>(`button[data-release="${id}"]`) }

it('hands a card back to the rules by removing its saved position', () => {
  const { save } = mount()
  act(() => releaseButton('TKT-A')!.click())
  expect(save).toHaveBeenCalledWith('default', { 'TKT-A': null })
})

// The point of a preview: the card should land where the rules put it on the
// same frame the press happens, rather than sitting where it was dropped until
// the write returns and the next read arrives.
it('lays a released card out by the rules before the write returns', () => {
  let settle = () => {}
  const save = vi.fn(() => new Promise<void>(resolve => { settle = () => resolve() }))
  mount({ onLayout: save })
  const before = card('TKT-A').style.transform
  act(() => releaseButton('TKT-A')!.click())
  expect(card('TKT-A').style.transform).not.toBe(before)
  // And it now reports itself as automatic, with nothing left to press.
  expect(card('TKT-A').querySelector('.card-placement')!.textContent).toBe('Automatic')
  expect(releaseButton('TKT-A')).toBeNull()
  act(() => settle())
})

// Dragging moves the whole selection, so releasing releases the whole
// selection. Anything the rules already place is left out rather than written
// as a removal that removes nothing.
it('releases the whole selection when the pressed card is in it', () => {
  const { save } = mount({ selection: new Set(['TKT-A', 'TKT-B', 'TKT-C']) })
  act(() => releaseButton('TKT-A')!.click())
  expect(save).toHaveBeenCalledWith('default', { 'TKT-A': null, 'TKT-B': null })
})

it('releases only the pressed card when it is not in the selection', () => {
  const { save } = mount({ selection: new Set(['TKT-B']) })
  act(() => releaseButton('TKT-A')!.click())
  expect(save).toHaveBeenCalledWith('default', { 'TKT-A': null })
})

// Compact density drops the card head, and with it the only control this has.
// A large board is where compact and an accidental drag are both most likely,
// so the keyboard reaches the same operation.
it('releases the selection from the handle, which is what the keyboard uses', () => {
  const { save, handle } = mount({ density: 'compact', selection: new Set(['TKT-A', 'TKT-B']) })
  expect(root.querySelector('.card-head')).toBeNull()
  act(() => handle.current!.releaseSelected())
  expect(save).toHaveBeenCalledWith('default', { 'TKT-A': null, 'TKT-B': null })
})

it('writes nothing when every selected card is already automatic', () => {
  const { save, handle } = mount({ selection: new Set(['TKT-C']) })
  act(() => handle.current!.releaseSelected())
  expect(save).not.toHaveBeenCalled()
})

// A read-only canvas passes no handler, so the label stays a label. The
// keyboard route still refuses out loud rather than doing nothing.
it('offers no control and refuses the key on a read-only canvas', () => {
  const onError = vi.fn()
  const { save, handle } = mount({ readOnly: true, selection: new Set(['TKT-A']), onError })
  expect(releaseButton('TKT-A')).toBeNull()
  act(() => handle.current!.releaseSelected())
  expect(save).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledWith('read-only')
})
