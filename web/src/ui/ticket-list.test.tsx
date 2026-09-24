// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TicketList, type TicketListProps } from './TicketList'
import type { Ticket } from '../platform/tickets/types'

let root: HTMLDivElement
beforeEach(() => { root = document.createElement('div'); document.body.append(root) })
afterEach(() => { act(() => render(null, root)); root.remove() })

const ticket = (id: string, status: string, extra: Partial<Ticket> = {}): Ticket => ({
  id, short: id.slice(0, 8), title: `Ticket ${id}`, type: 'task', status, priority: 'normal', labels: [],
  assignees: [], dependencies: [], blocksOn: 'none', references: [], archived: false,
  createdAt: '', updatedAt: '', revision: `rev-${id}`,
  body: { description: '', acceptanceCriteria: [] },
  ...extra,
} as unknown as Ticket)

function show(extra: Partial<TicketListProps> = {}) {
  const tickets = [
    ticket('TKT-AAAAAAAA1', 'ready', { priority: 'high', labels: ['ui', 'mobile'],
      body: { acceptanceCriteria: [{ index: 1, checked: true, text: 'one' }, { index: 2, checked: false, text: 'two' }] } as Ticket['body'] }),
    ticket('TKT-BBBBBBBB2', 'draft'),
  ]
  const p: TicketListProps = {
    tickets: new Map(tickets.map(t => [t.id, t])),
    filters: { statuses: new Set(), labels: new Map(), query: '' },
    statuses: ['draft', 'ready', 'done'], priorities: ['low', 'normal', 'high'],
    selected: null, onSelect: vi.fn(), ...extra,
  }
  act(() => render(<TicketList {...p} />, root))
  return p
}

it('heads each status that has tickets, in the store order, with its count', () => {
  show()
  const headings = [...root.querySelectorAll('.list-heading')].map(h => h.textContent)
  expect(headings).toEqual(['draft 1', 'ready 1'])
})

it('carries title, ID, priority, labels and criterion progress on a row', () => {
  show()
  const row = root.querySelector<HTMLButtonElement>('[data-id="TKT-AAAAAAAA1"]')!
  expect(row.tagName).toBe('BUTTON')
  expect(row.querySelector('.list-title')!.textContent).toBe('Ticket TKT-AAAAAAAA1')
  expect(row.querySelector('.list-id')!.textContent).toBe('TKT-AAAA')
  expect(row.querySelector('.list-priority')!.textContent).toBe('high')
  expect([...row.querySelectorAll('.pill.label')].map(l => l.textContent)).toEqual(['ui', 'mobile'])
  expect(row.querySelector('.list-progress')!.textContent).toBe('AC 1/2')
  expect(root.querySelector('[data-id="TKT-BBBBBBBB2"] .list-progress')).toBeNull()
})

it('opens a ticket through onSelect and marks the one the inspector shows', () => {
  const p = show({ selected: 'TKT-BBBBBBBB2' })
  expect(root.querySelector('[data-id="TKT-BBBBBBBB2"]')!.getAttribute('aria-current')).toBe('true')
  expect(root.querySelector('[data-id="TKT-AAAAAAAA1"]')!.hasAttribute('aria-current')).toBe(false)
  act(() => root.querySelector<HTMLButtonElement>('[data-id="TKT-AAAAAAAA1"]')!.click())
  expect(p.onSelect).toHaveBeenCalledWith('TKT-AAAAAAAA1')
})

it('shows only what the filters let through', () => {
  show({ filters: { statuses: new Set(), labels: new Map([['ui', 'include']]), query: '' } })
  expect([...root.querySelectorAll('.list-row')].map(r => r.getAttribute('data-id'))).toEqual(['TKT-AAAAAAAA1'])
})
