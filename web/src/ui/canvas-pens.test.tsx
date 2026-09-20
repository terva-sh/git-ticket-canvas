// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { Canvas, type CanvasProps } from './Canvas'
import type { Ticket } from '../platform/tickets/types'

vi.mock('./canvas/grid', () => ({ drawGrid: vi.fn() }))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function ticket(id: string, labels: string[], status = 'ready'): Ticket {
  return { id, short: id, title: id, status, type: 'task', priority: 'normal', labels, assignees: [], dependencies: [],
    blocksOn: 'none', references: [], updatedAt: '2026-09-20T00:00:00Z' } as unknown as Ticket
}
const pen = { title: 'Frontend', x: 0, y: 0, w: 1000, h: 300, color: '#759bcc', pin: { x: 0, y: 0 }, requiredLabels: ['frontend'] }

function show(over: Partial<CanvasProps>) {
  vi.stubGlobal('ResizeObserver', class { observe() {}; unobserve() {}; disconnect() {} })
  const root = document.createElement('div'); document.body.append(root)
  const props: CanvasProps = { board: 'default', tickets: new Map(), cards: {}, statuses: ['ready', 'done'], priorities: ['normal'],
    selection: new Set(), query: '', filters: new Set(), readOnly: false, onSelect: vi.fn(), onLayout: vi.fn(), onLink: vi.fn(),
    onCompose: vi.fn(), onError: vi.fn(), onBusy: vi.fn(), ...over }
  act(() => render(<Canvas {...props} />, root))
  return root
}

// The rules are what the board is organized by, so the board has to show them:
// each pen at its place with what it caught, and the inbox with what nothing
// caught, drawn as the open question it is.
it('draws each pen, grown to hold its cards, and marks the card no rule caught', () => {
  const tickets = new Map(['a', 'b', 'c', 'd'].map(id => [id, ticket(id, ['frontend'])]))
  tickets.set('stray', ticket('stray', ['docs']))
  tickets.set('held', ticket('held', ['docs']))
  const root = show({ tickets, cards: { held: { x: 900, y: 900 } }, pens: { fe: pen }, ruleOrder: ['fe'], inbox: { x: -400, y: 0 } })
  const drawn = root.querySelector<HTMLElement>('.canvas-pen[data-pen-id="fe"]')!
  expect(drawn.dataset.penCount).toBe('4')
  // 1000 wide holds three columns, so four cards need two rows: more than 300.
  expect(drawn.classList.contains('overflow')).toBe(true)
  expect(parseFloat(drawn.style.height)).toBeGreaterThan(300)
  expect(drawn.textContent).toContain('grown to fit')
  const inbox = root.querySelector<HTMLElement>('.canvas-inbox')!
  expect(inbox.dataset.inboxCount).toBe('1')
  const stray = root.querySelector<HTMLElement>('.card[data-id="stray"]')!
  expect(stray.classList.contains('unhoused')).toBe(true)
  expect(stray.querySelector('.card-placement')?.textContent).toBe('Unhoused')
  expect(stray.style.transform).toContain('translate(-400px, 22px)')
  // A pinned card that matches nothing is not unhoused: somebody placed it.
  const held = root.querySelector<HTMLElement>('.card[data-id="held"]')!
  expect(held.classList.contains('unhoused')).toBe(false)
  expect(held.querySelector('.card-placement')?.textContent).toBe('Manual')
  root.remove()
})

it('draws no pen layer on a board with no rules, and places in lanes', () => {
  const root = show({ tickets: new Map([['a', ticket('a', ['frontend'])]]) })
  expect(root.querySelector('#penLayer')).toBeNull()
  expect(root.querySelector('.card.unhoused')).toBeNull()
  expect(root.querySelector<HTMLElement>('.card[data-id="a"]')!.style.transform).toContain('translate(0px, 0px)')
  root.remove()
})
