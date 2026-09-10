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
  expect(root.querySelector('[data-kind=parent] path')?.getAttribute('marker-end')).toBe('url(#arrow)')
  expect(root.textContent).toContain('depends on'); expect(root.textContent).toContain('parent of')
  show('all'); expect(root.querySelectorAll('.relationship')).toHaveLength(3)
  show('none'); expect(root.querySelectorAll('.relationship')).toHaveLength(0)
  show('selected', new Set()); expect(root.querySelectorAll('.relationship')).toHaveLength(0)
  show('selected', new Set(['a', 'b'])); expect(root.querySelectorAll('.relationship')).toHaveLength(3)
})
