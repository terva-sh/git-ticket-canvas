import { expect, it, vi } from 'vitest'
import { ApiError, TicketClient } from './client'

it('calls default fetch without binding the TicketClient as its receiver', async () => {
  const native = globalThis.fetch
  globalThis.fetch = function (this: unknown) {
    expect(this).toBeUndefined()
    return Promise.resolve(new Response('{}'))
  }
  try { await new TicketClient().schema() }
  finally { globalThis.fetch = native }
})

it('serializes nullable edits, actor IDs and snapshot revisions without renaming fields', async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"ticket":{"revision":"r2"}}'))
  const client = new TicketClient(send)
  const body = { ifRevision: 'sha256:original', ops: [
    { op: 'assign' as const, actor: 'agent:test' }, { op: 'setParent' as const, parent: null },
    { op: 'setChecklistItem' as const, section: 'ac', index: 1, checked: false },
  ] }
  await client.patch('TKT/a b', body)
  expect(send).toHaveBeenCalledWith('/api/tickets/TKT%2Fa%20b', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
})
it('encodes board and delete queries and keeps the revision on forced deletion', async () => {
  const send = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{"removed":"TKT-1","dangling":null}'))
  const client = new TicketClient(send)
  await client.board('A & B'); expect(send.mock.calls[0][0]).toBe('/api/board?board=A%20%26%20B')
  const result = await client.remove('TKT/1', 'A & B', 'sha256:a+b', true)
  const url = new URL(String(send.mock.calls[1][0]), 'http://local')
  expect(url.pathname).toBe('/api/tickets/TKT%2F1')
  expect(Object.fromEntries(url.searchParams)).toEqual({ board: 'A & B', ifRevision: 'sha256:a+b', force: 'true' })
  expect(result.dangling).toBeNull()
})
it('preserves server actor casing, null transitions and server-owned vocabulary', async () => {
  const data = { actor: { ID: 'agent:test', Name: 'Test' }, actors: null, transitions: { archived: null }, statuses: ['future-status'] }
  const client = new TicketClient(vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(data))))
  const result = await client.schema()
  expect(result.actor.ID).toBe('agent:test'); expect(result.actor.Name).toBe('Test')
  expect(result.actors).toBeNull(); expect(result.transitions.archived).toBeNull()
  expect(result.statuses).toEqual(['future-status'])
})
it.each(['create', 'remove'] as const)('retains HTTP 207 partial success for %s', async method => {
  const data = method === 'create' ? { ticket: { id: 'TKT-1' }, layoutError: 'disk full' } : { removed: 'TKT-1', layoutError: 'disk full' }
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(data), { status: 207 }))
  const client = new TicketClient(send)
  const result = method === 'create' ? await client.create({ title: 'new', parent: null }) : await client.remove('TKT-1', 'default', 'r1')
  expect(result).toEqual(data); expect(send).toHaveBeenCalledTimes(1)
})
it('sends sparse layout deletion without inventing ticket mutations', async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"schema":1,"board":"A","cards":{}}'))
  const client = new TicketClient(send)
  await client.layout({ board: 'A', cards: { 'TKT-1': null } })
  expect(send).toHaveBeenCalledWith('/api/layout', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"board":"A","cards":{"TKT-1":null}}',
  })
})
it.each([
  [409, '{"code":"stale_revision","message":"changed","ticket":"TKT-1","field":"revision"}', 'stale_revision'],
  [500, '{}', 'http_error'], [200, '', 'invalid_response'], [200, 'null', 'invalid_response'],
  [502, '<html>bad gateway</html>', 'invalid_response'],
] as const)('reports status %s and structured errors for %s', async (status, body, code) => {
  const client = new TicketClient(vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status })))
  const error = await client.schema().catch(e => e)
  expect(error).toBeInstanceOf(ApiError); expect(error.status).toBe(status); expect(error.code).toBe(code)
  if (status === 409) expect(error.body).toMatchObject({ ticket: 'TKT-1', field: 'revision' })
})
