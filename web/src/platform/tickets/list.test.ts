import { expect, it } from 'vitest'
import { listGroups } from './list'
import type { Ticket } from './types'
import type { TicketFilters } from './filters'

const ticket = (id: string, status: string, priority = 'normal', labels: string[] = []): Ticket => ({
  id, short: id, title: `Ticket ${id}`, type: 'task', status, priority, labels,
  assignees: [], dependencies: [], blocksOn: 'none', references: [], archived: false,
  createdAt: '', updatedAt: '', revision: `rev-${id}`, body: { description: '' },
} as unknown as Ticket)

const STATUSES = ['draft', 'ready', 'in-progress', 'done']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']
const open: TicketFilters = { statuses: new Set(), labels: new Map(), query: '' }
const shape = (groups: ReturnType<typeof listGroups>) => groups.map(group => [group.status, group.tickets.map(t => t.id)])

it('groups by status in the store order and leaves empty groups out', () => {
  const tickets = [ticket('c', 'done'), ticket('a', 'draft'), ticket('b', 'in-progress')]
  expect(shape(listGroups(tickets, open, STATUSES, PRIORITIES))).toEqual([
    ['draft', ['a']], ['in-progress', ['b']], ['done', ['c']],
  ])
})

it('puts the more urgent first inside a group, then orders by ID', () => {
  const tickets = [ticket('b', 'ready', 'low'), ticket('d', 'ready', 'urgent'), ticket('a', 'ready'),
    ticket('c', 'ready'), ticket('e', 'ready', 'invented')]
  expect(shape(listGroups(tickets, open, STATUSES, PRIORITIES))).toEqual([['ready', ['d', 'a', 'c', 'b', 'e']]])
})

it('keeps a status the configuration does not name, after the configured ones', () => {
  const tickets = [ticket('z', 'parked'), ticket('a', 'done'), ticket('y', 'waiting'), ticket('b', 'draft')]
  expect(shape(listGroups(tickets, open, STATUSES, PRIORITIES))).toEqual([
    ['draft', ['b']], ['done', ['a']], ['parked', ['z']], ['waiting', ['y']],
  ])
})

it('lists exactly what matchesTicket lets through', () => {
  const tickets = [ticket('a', 'draft', 'normal', ['ui']), ticket('b', 'ready', 'normal', ['ui', 'api']),
    ticket('c', 'ready', 'normal', ['api']), ticket('d', 'done')]
  const ids = (filters: Partial<TicketFilters>) =>
    listGroups(tickets, { ...open, ...filters }, STATUSES, PRIORITIES).flatMap(group => group.tickets.map(t => t.id))
  expect(ids({ statuses: new Set(['ready']) })).toEqual(['b', 'c'])
  expect(ids({ labels: new Map([['ui', 'include']]) })).toEqual(['a', 'b'])
  expect(ids({ labels: new Map([['ui', 'exclude']]) })).toEqual(['c', 'd'])
  expect(ids({ labels: new Map([['ui', 'include'], ['api', 'include']]) })).toEqual(['b'])
  expect(ids({ labels: new Map([['ui', 'include'], ['api', 'include']]), labelMatch: 'any' })).toEqual(['a', 'b', 'c'])
  expect(ids({ query: 'ticket d' })).toEqual(['d'])
  expect(ids({ query: 'nothing like it' })).toEqual([])
})
