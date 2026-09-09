// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { App } from './App'
import { TicketClient, type BoardRead } from '../platform/tickets/client'
import type { BoardResponse, Ticket } from '../platform/tickets/types'

vi.mock('./canvas/grid', () => ({ drawGrid: vi.fn() }))
let root: HTMLDivElement
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('ResizeObserver', class { observe() {}; unobserve() {}; disconnect() {} })
  root = document.createElement('div'); document.body.append(root)
})
afterEach(() => {
  act(() => render(null, root)); root.remove()
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers()
})
function data(): BoardResponse {
  const ticket: Ticket = { id: 'TKT-1', short: 'TKT-1', title: 'First', revision: 'r1', type: 'task', status: 'draft',
    priority: 'normal', labels: [], assignees: [], dependencies: [], blocksOn: 'none', references: [],
    archived: false, createdAt: '', updatedAt: '', body: { description: 'Original', plan: '', summary: '',
      acceptanceCriteria: [], definitionOfDone: [], notes: [], comments: [] }, readiness: { ready: false, blocked: false } }
  return { tickets: [ticket, { ...structuredClone(ticket), id: 'TKT-2', short: 'TKT-2', title: 'Second' }],
    layout: { schema: 1, board: 'default', cards: { 'TKT-1': { x: 0, y: 0 }, 'TKT-2': { x: 350, y: 0 } } },
    boards: ['default'], storePath: '/fixture', readOnly: false,
    config: { statuses: ['draft'], openStatuses: ['draft'], terminalStatuses: ['done'], types: ['task'], priorities: ['normal'],
      blocksOn: ['none'], labels: [], milestones: [], series: ['TKT'], actors: [],
      actor: { ID: 'agent:test', Name: 'Test' }, transitions: {}, reasonRequired: {} } }
}
function modified(board = data()): BoardRead { return { status: 200, data: board, etag: '"snapshot"' } }
function element<T extends HTMLElement>(selector: string): T { return root.querySelector<T>(selector)! }
function counts() {
  return {
    publications: element('#toolbarRoot').dataset.storePublications,
    placements: element('#stage').dataset.placementCalculations,
    inspector: element('#inspector').dataset.renderCount,
    cards: [...root.querySelectorAll<HTMLElement>('.card')].map(card => card.dataset.renderCount),
  }
}
async function refresh() { await act(async () => { document.dispatchEvent(new Event('visibilitychange')) }) }
async function mount() {
  const read = vi.spyOn(TicketClient.prototype, 'board').mockResolvedValue(modified())
  await act(async () => { render(<App />, root) })
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(root.querySelectorAll('.card')).toHaveLength(2)
  return read
}
function stagePointer(type: string) {
  const stage = element<HTMLDivElement>('#stage')
  stage.setPointerCapture = () => {}
  stage.hasPointerCapture = () => false
  stage.releasePointerCapture = () => {}
  stage.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1 }))
}

it.each([304, 200])('an unchanged %s poll publishes and renders nothing', async status => {
  const read = await mount()
  const before = counts()
  read.mockResolvedValue(status === 304 ? { status: 304 } : modified())
  await act(async () => { await vi.advanceTimersByTimeAsync(12000) })
  expect(read).toHaveBeenCalledTimes(2)
  expect(read).toHaveBeenLastCalledWith('default', '"snapshot"')
  expect(counts()).toEqual(before)
})
it('only rerenders the changed card after a full response', async () => {
  const read = await mount(), before = counts()
  const next = data(); next.tickets[0].title = 'Changed'
  read.mockResolvedValue(modified(next)); await refresh()
  const after = counts()
  expect(Number(after.publications)).toBe(Number(before.publications) + 1)
  expect(Number(after.cards[0])).toBe(Number(before.cards[0]) + 1)
  expect(after.cards[1]).toBe(before.cards[1])
  expect(element('.card-title').textContent).toBe('Changed')
})
it('publishes an accepted drag-deferred snapshot even when the next read is 304', async () => {
  const read = await mount()
  let resolve!: (result: BoardRead) => void
  read.mockReturnValueOnce(new Promise<BoardRead>(yes => { resolve = yes }))
  await refresh()
  act(() => stagePointer('pointerdown'))
  const next = data(); next.tickets[0].title = 'Arrived during pan'
  await act(async () => { resolve(modified(next)); await vi.advanceTimersByTimeAsync(0) })
  expect(element('#stage').classList.contains('panning')).toBe(true)
  expect(element('.card-title').textContent).toBe('First')
  const before = counts()
  read.mockResolvedValue({ status: 304 })
  await act(async () => { stagePointer('pointercancel'); await vi.advanceTimersByTimeAsync(0) })
  expect(read).toHaveBeenCalledTimes(3)
  expect(element('.card-title').textContent).toBe('Arrived during pan')
  expect(Number(counts().publications)).toBe(Number(before.publications) + 1)
  expect(read).toHaveBeenLastCalledWith('default', '"snapshot"')
})
it('keeps a focused inspector draft through unchanged and changed responses', async () => {
  const read = await mount(), patch = vi.spyOn(TicketClient.prototype, 'patch')
  act(() => {
    element('.card').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, isPrimary: true, button: 0 }))
    stagePointer('pointercancel')
  })
  const field = [...root.querySelectorAll('.field')].find(node => node.querySelector('label')?.textContent === 'Description')!.querySelector('textarea')!
  act(() => { field.focus(); field.value = 'Unfinished draft'; field.dispatchEvent(new Event('input', { bubbles: true })) })
  read.mockResolvedValueOnce({ status: 304 }); await refresh()
  const next = data(); next.tickets[0].body.description = 'External prose'; next.tickets[0].revision = 'r2'
  read.mockResolvedValueOnce(modified(next)); await refresh()
  expect(field.value).toBe('Unfinished draft'); expect(document.activeElement).toBe(field)
  expect(patch).not.toHaveBeenCalled()
})
