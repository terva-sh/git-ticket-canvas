import { expect, it, vi } from 'vitest'
import { TicketClient, storeBase, type BoardRead } from './client'
import { TicketStore } from './store'
import type { BoardResponse, Schema, Ticket } from './types'

function ticket(id: string, title: string): Ticket {
  return { id, short: id, title, revision: 'r1', type: 'task', status: 'draft', priority: 'normal',
    labels: [], assignees: [], dependencies: [], blocksOn: 'none', references: [], archived: false,
    createdAt: '', updatedAt: '', body: { description: '', plan: '', summary: '', acceptanceCriteria: [],
      definitionOfDone: [], notes: [], comments: [] }, readiness: { ready: false, blocked: false } }
}
const schema: Schema = { statuses: ['draft'], openStatuses: ['draft'], terminalStatuses: ['done'], types: ['task'],
  priorities: ['normal'], blocksOn: ['none'], labels: [], milestones: [], series: ['TKT'], actors: [],
  actor: { ID: 'agent:test', Name: 'Test' }, transitions: {}, reasonRequired: {} }

function board(id: string, title: string, boards = ['default', 'other']): BoardResponse {
  return { tickets: [ticket(id, title)], layout: { schema: 1, board: 'default', cards: { [id]: { x: 1, y: 2 } } },
    boards, storePath: '/first', readOnly: false, config: schema }
}
function read(data: BoardResponse, etag = '"first"'): BoardRead { return { status: 200, data, etag } }

it('scopes every request to its store', async () => {
  const send = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  const client = new TicketClient(send as unknown as typeof fetch, storeBase('my store'))

  await client.schema()
  await client.board('default')
  await client.create({ title: 'x' })
  await client.patch('TKT-1', { ifRevision: 'r', ops: [] })
  await client.layout({ board: 'default', cards: {} })
  await client.remove('TKT-1', 'default', 'r')
  for (const [url] of send.mock.calls as unknown as [string][]) {
    expect(url.startsWith('/api/stores/my%20store/')).toBe(true)
  }
  expect(client.events).toBe('/api/stores/my%20store/events')
})

// The ticket map is keyed by ID, and reconcileTickets reuses an entry whose ID
// it recognizes. An ID present in both stores would otherwise survive the
// switch and show the previous store's title.
it('clears everything the previous store put there', async () => {
  const first = new TicketClient()
  vi.spyOn(first, 'board').mockResolvedValue(read(board('TKT-1', 'From the first store')))
  const store = new TicketStore(first)
  await store.load()
  expect(store.state.tickets.get('TKT-1')!.title).toBe('From the first store')
  expect(store.state.config).not.toBeNull()

  store.selectStore('second', new TicketClient(undefined, storeBase('second')))
  expect(store.state.store).toBe('second')
  expect(store.state.tickets.size).toBe(0)
  expect(store.state.cards).toEqual({})
  expect(store.state.frames).toEqual({})
  expect(store.state.boards).toEqual([])
  expect(store.state.config).toBeNull()
  expect(store.state.storePath).toBe('')
  expect(store.state.layoutSchema).toBeNull()
  expect(store.state.board).toBe('default')
  expect(store.sync).toBeUndefined()
  expect(store.state.pens).toEqual({})
  expect(store.state.ruleOrder).toEqual([])
})

// The validator belongs to the store that issued it. Sending it to another
// store could match an unrelated ETag and return 304 for a board this canvas
// has never read.
it('does not send the previous store validator to the next one', async () => {
  const first = new TicketClient()
  vi.spyOn(first, 'board').mockResolvedValue(read(board('TKT-1', 'First')))
  const store = new TicketStore(first)
  await store.load()

  const second = new TicketClient(undefined, storeBase('second'))
  const secondRead = vi.spyOn(second, 'board').mockResolvedValue(read(board('TKT-9', 'Second'), '"second"'))
  store.selectStore('second', second)
  await store.load()
  expect(secondRead).toHaveBeenCalledWith('default', undefined)
  expect(store.state.tickets.has('TKT-1')).toBe(false)
  expect(store.state.tickets.get('TKT-9')!.title).toBe('Second')
})

it('cannot apply a read that was in flight when the store changed', async () => {
  let release!: (value: BoardRead) => void
  const first = new TicketClient()
  vi.spyOn(first, 'board').mockReturnValue(new Promise<BoardRead>(resolve => { release = resolve }))
  const store = new TicketStore(first)

  const inFlight = store.load()
  const second = new TicketClient(undefined, storeBase('second'))
  vi.spyOn(second, 'board').mockResolvedValue(read(board('TKT-9', 'Second')))
  store.selectStore('second', second)

  release(read(board('TKT-1', 'Too late')))
  expect(await inFlight).toBe(false)
  expect(store.state.tickets.size).toBe(0)

  await store.load()
  expect(store.state.tickets.get('TKT-9')!.title).toBe('Second')
  expect(store.state.tickets.has('TKT-1')).toBe(false)
})
