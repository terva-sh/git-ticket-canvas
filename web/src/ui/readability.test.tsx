// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CardView } from './canvas/CardView'
import { Edges, type RelationshipMode } from './canvas/Edges'
import type { Ticket } from '../platform/tickets/types'

let root: HTMLDivElement
beforeEach(() => { root = document.createElement('div'); document.body.append(root) })
afterEach(() => { act(() => render(null, root)); root.remove() })
const ticket: Ticket = { id: 'a', short: 'a', title: 'Readable title', revision: 'r1', type: 'task', status: 'done',
  priority: 'high', labels: ['ui', 'readability', 'live-updates', 'performance'], assignees: [], dependencies: [],
  blocksOn: 'none', references: [], archived: false, createdAt: '', updatedAt: '', dueOn: '2000-01-01',
  body: { description: '', plan: '', summary: '', acceptanceCriteria: [{ index: 1, text: 'First', checked: true },
    { index: 2, text: 'Second', checked: false }], definitionOfDone: [], notes: [], comments: [] },
  readiness: { ready: false, blocked: false } }
function card(t = ticket) {
  act(() => render(<CardView ticket={t} x={0} y={0} z={1} pinned selected={false} dimmed={false} target={false} register={vi.fn()} />, root))
}
it('renders title first, two labels plus disclosure, textual priority and AC counts', () => {
  card()
  expect(root.querySelector('.card')?.firstElementChild?.textContent).toBe('Readable title')
  expect(root.querySelectorAll('.card-labels > .label')).toHaveLength(2)
  const more = root.querySelector<HTMLButtonElement>('.label-more')!
  expect(more.textContent).toBe('+2'); expect(more.getAttribute('aria-expanded')).toBe('false')
  act(() => more.click())
  expect(more.getAttribute('aria-expanded')).toBe('true')
  const disclosure = root.querySelector<HTMLDivElement>('.card-label-disclosure')!
  expect(disclosure.hidden).toBe(false); expect(disclosure.textContent).toContain('performance')
  expect(root.querySelector('.card-progress')?.textContent).toBe('AC 1/2')
  expect(root.querySelector('.card-priority')?.textContent).toBe('high priority')
  expect(root.querySelector('.card-alerts')?.textContent).not.toContain('Overdue')
})
it('omits empty AC progress and shows blocked and overdue text for open work', () => {
  card({ ...ticket, status: 'ready', labels: [], readiness: { ready: false, blocked: true, blocking: ['b'] },
    body: { ...ticket.body, acceptanceCriteria: [] } })
  expect(root.querySelector('.card-progress')).toBeNull()
  expect(root.querySelector('.card-alerts')?.textContent).toContain('Blocked by 1')
  expect(root.querySelector('.card-alerts')?.textContent).toContain('Overdue 2000-01-01')
  expect(root.querySelector('.card-labels')).toBeNull()
})
it('shows immediate selected relationships with direction and type, or all or none', () => {
  const tickets = new Map<string, Ticket>([
    ['a', { ...ticket, dependencies: ['b'], parent: 'p' }],
    ['b', { ...ticket, id: 'b', dependencies: ['c'] }],
    ['c', { ...ticket, id: 'c' }], ['p', { ...ticket, id: 'p' }],
  ])
  const positions = new Map([...tickets.keys()].map((id, i) => [id, { x: i * 340, y: 0, z: 1, pinned: true }]))
  const show = (mode: RelationshipMode, selection = new Set(['a'])) => act(() => render(<Edges tickets={tickets}
    positions={positions} heights={new Map()} matching={new Set(tickets.keys())} ghost={null} mode={mode} selection={selection} />, root))
  show('selected')
  expect(root.querySelectorAll('.relationship')).toHaveLength(2)
  expect(root.querySelector('[data-kind=dependency]')?.getAttribute('data-from')).toBe('a')
  expect(root.querySelector('[data-kind=dependency]')?.getAttribute('data-to')).toBe('b')
  expect(root.querySelector('[data-kind=parent]')?.getAttribute('data-from')).toBe('p')
  // `path` alone would match the transparent hover target, which carries no marker.
  expect(root.querySelector('[data-kind=parent] path:not(.edge-hit)')?.getAttribute('marker-end')).toBe('url(#arrowParent)')
  expect(root.querySelector('[data-kind=parent] path:not(.edge-hit)')?.getAttribute('stroke')).toBe('var(--edge-parent)')
  expect(root.querySelector('[data-kind=dependency] path:not(.edge-hit)')?.getAttribute('marker-end')).toBe('url(#arrow)')
  expect(root.textContent).toContain('depends on'); expect(root.textContent).toContain('parent of')
  show('all'); expect(root.querySelectorAll('.relationship')).toHaveLength(3)
  show('none'); expect(root.querySelectorAll('.relationship')).toHaveLength(0)
  show('selected', new Set()); expect(root.querySelectorAll('.relationship')).toHaveLength(0)
  show('selected', new Set(['a', 'b'])); expect(root.querySelectorAll('.relationship')).toHaveLength(3)
})
it('names one relationship at a time and fades the rest without hiding them', () => {
  const tickets = new Map<string, Ticket>([
    ['a', { ...ticket, dependencies: ['b'], parent: 'p' }],
    ['b', { ...ticket, id: 'b', dependencies: ['c'] }],
    ['c', { ...ticket, id: 'c' }], ['p', { ...ticket, id: 'p' }],
  ])
  const positions = new Map([...tickets.keys()].map((id, i) => [id, { x: i * 340, y: 0, z: 1, pinned: true }]))
  const show = (selection = new Set<string>(), matching = new Set(tickets.keys())) => act(() => render(<Edges
    tickets={tickets} positions={positions} heights={new Map()} matching={matching} ghost={null}
    mode="all" selection={selection} />, root))
  const kinds = (selector: string) => [...root.querySelectorAll(selector)].map(node => node.getAttribute('data-kind'))

  // Nothing emphasised: three edges at full strength, and no labels at all.
  show()
  expect(root.querySelectorAll('.relationship')).toHaveLength(3)
  expect(root.querySelectorAll('.edge-label')).toHaveLength(0)
  expect([...root.querySelectorAll('.relationship')].map(node => node.getAttribute('opacity'))).toEqual(['1', '1', '1'])

  // A selection names its own edges. The rest fade but stay rendered, and keep
  // the accessible name a screen reader reads.
  show(new Set(['a']))
  expect(kinds('.relationship[data-emphasised=true]')).toEqual(['parent', 'dependency'])
  expect(root.querySelectorAll('.edge-label')).toHaveLength(2)
  const faded = [...root.querySelectorAll('.relationship.faded')]
  expect(faded).toHaveLength(1)
  expect(faded[0].getAttribute('opacity')).toBe('0.28')
  expect(faded[0].querySelector('.edge-label')).toBeNull()
  expect(faded[0].querySelector('title')?.textContent).toContain('depends on')

  // Hovering wins over the selection, including on an edge the selection faded.
  const hit = root.querySelector('.relationship[data-from=b] .edge-hit')!
  act(() => { hit.dispatchEvent(new Event('pointerenter')) })
  expect(root.querySelectorAll('.relationship[data-emphasised=true]')).toHaveLength(1)
  expect(root.querySelector('.relationship[data-emphasised=true]')?.getAttribute('data-from')).toBe('b')
  expect(root.querySelectorAll('.edge-label')).toHaveLength(1)
  expect(root.querySelectorAll('.relationship.faded')).toHaveLength(2)

  // Leaving hands emphasis back to the selection rather than clearing it.
  act(() => { hit.dispatchEvent(new Event('pointerleave')) })
  expect(kinds('.relationship[data-emphasised=true]')).toEqual(['parent', 'dependency'])

  // A filtered-out edge stays faint even when hovered. Filtered means excluded,
  // which outranks not-this-one.
  show(new Set(['a']), new Set(['a', 'b', 'p']))
  const filtered = root.querySelector('.relationship[data-to=c]')!
  expect(filtered.getAttribute('opacity')).toBe('0.12')
  act(() => { filtered.querySelector('.edge-hit')!.dispatchEvent(new Event('pointerenter')) })
  expect(root.querySelector('.relationship[data-to=c]')?.getAttribute('opacity')).toBe('0.12')
})

it('anchors edges and the ghost on the active density width', () => {
  const tickets = new Map<string, Ticket>([
    ['a', { ...ticket, dependencies: ['b'] }], ['b', { ...ticket, id: 'b' }],
  ])
  // `d` opens `M<x>,<y>`, and x is the anchor on the source card's edge.
  const anchorX = () => Number(root.querySelector('[data-kind=dependency] path:not(.edge-hit)')!
    .getAttribute('d')!.match(/^M(-?[\d.]+),/)![1])
  const show = (positions: Map<string, { x: number; y: number; z: number; pinned: boolean }>, cardWidth?: number) =>
    act(() => render(<Edges tickets={tickets} positions={positions} heights={new Map()}
      matching={new Set(tickets.keys())} ghost={{ from: 'a', point: { x: 900, y: 400 } }} mode="all"
      selection={new Set(['a'])} cardWidth={cardWidth} />, root))

  // Far apart horizontally, so both widths route sideways and the anchor is the
  // card's right edge. That isolates the width from the routing decision.
  const apart = new Map([['a', { x: 0, y: 0, z: 1, pinned: true }], ['b', { x: 340, y: 0, z: 1, pinned: true }]])
  show(apart)
  expect(anchorX(), 'full width anchors at the 280px edge').toBe(280)
  expect(root.querySelector('#ghost')?.getAttribute('d')).toContain('M280,')
  show(apart, 180)
  expect(anchorX(), 'compact anchors at the 180px edge').toBe(180)
  expect(root.querySelector('#ghost')?.getAttribute('d')).toContain('M180,')

  // The width also decides vertical against horizontal routing. At 200px apart
  // and vertically disjoint, full routes vertically and leaves from the card's
  // horizontal centre, while compact still routes sideways.
  const stacked = new Map([['a', { x: 0, y: 0, z: 1, pinned: true }], ['b', { x: 200, y: 300, z: 1, pinned: true }]])
  show(stacked)
  expect(anchorX(), 'full routes vertically from the centre').toBe(140)
  show(stacked, 180)
  expect(anchorX(), 'compact routes sideways from the edge').toBe(180)
})
