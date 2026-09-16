// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { App } from './App'
import { RegistryClient, TicketClient, type BoardRead } from '../platform/tickets/client'
import type { BoardResponse, Ticket } from '../platform/tickets/types'

vi.mock('./canvas/grid', () => ({ drawGrid: vi.fn() }))

let root: HTMLDivElement
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0) as unknown as number)
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => clearTimeout(handle))
  vi.stubGlobal('ResizeObserver', class { observe() {}; unobserve() {}; disconnect() {} })
  root = document.createElement('div'); document.body.append(root)
})
afterEach(() => {
  act(() => render(null, root)); root.remove()
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers()
})

function board(): BoardResponse {
  const ticket: Ticket = { id: 'TKT-A', short: 'TKT-A', title: 'Dragged by accident', revision: 'r1', type: 'task',
    status: 'ready', priority: 'normal', labels: [], assignees: [], dependencies: [], blocksOn: 'none', references: [],
    archived: false, createdAt: '', updatedAt: '', body: { description: '', plan: '', summary: '',
      acceptanceCriteria: [], definitionOfDone: [], notes: [], comments: [] }, readiness: { ready: true, blocked: false } }
  return { tickets: [ticket], layout: { schema: 1, board: 'default', cards: { 'TKT-A': { x: 900, y: 700 } } },
    boards: ['default'], storePath: '/fixture', readOnly: false,
    config: { statuses: ['ready'], openStatuses: ['ready'], terminalStatuses: ['done'], types: ['task'],
      priorities: ['normal'], blocksOn: ['none'], labels: [], milestones: [], series: ['TKT'], actors: [],
      actor: { ID: 'agent:test', Name: 'Test' }, transitions: {}, reasonRequired: {} } }
}

async function mount() {
  vi.spyOn(RegistryClient.prototype, 'stores').mockResolvedValue({
    stores: [{ name: 'fixture', display: 'fixture', path: '/fixture/.tickets', available: true,
      active: false, favorite: false, readOnly: false }] })
  vi.spyOn(RegistryClient.prototype, 'favorites').mockResolvedValue({ stores: [], paths: [] })
  vi.spyOn(TicketClient.prototype, 'board').mockResolvedValue({ status: 200, data: board(), etag: '"e"' } as BoardRead)
  const layout = vi.spyOn(TicketClient.prototype, 'layout').mockResolvedValue({} as never)
  await act(async () => { render(<App />, root) })
  for (let i = 0; i < 6; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  return layout
}

// Compact density hides the card head and with it the only control this has, so
// the key is not a convenience: on a board read at compact it is the operation.
it('binds u to handing the selection back, and leaves a typed u alone', async () => {
  const layout = await mount()
  const card = root.querySelector<HTMLElement>('.card[data-id="TKT-A"]')!
  expect(card.querySelector('.card-placement')!.textContent).toBe('Manual')
  // Selection happens on pointerdown, not click, so the gesture is what selects.
  const stage = root.querySelector<HTMLDivElement>('#stage')!
  stage.setPointerCapture = () => {}
  stage.hasPointerCapture = () => false
  stage.releasePointerCapture = () => {}
  const pointer = (type: string, buttons: number) => new PointerEvent(type,
    { bubbles: true, pointerId: 1, isPrimary: true, button: 0, buttons, clientX: 30, clientY: 30 })
  await act(async () => {
    card.dispatchEvent(pointer('pointerdown', 1))
    card.dispatchEvent(pointer('pointerup', 0))
    await vi.advanceTimersByTimeAsync(1)
  })

  // A `u` typed into the search box is a letter, not a command.
  const search = root.querySelector<HTMLInputElement>('#search')!
  await act(async () => {
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', bubbles: true }))
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(layout).not.toHaveBeenCalled()

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', bubbles: true }))
    // LayoutWriter batches for 200ms before it writes.
    await vi.advanceTimersByTimeAsync(400)
  })
  expect(layout).toHaveBeenCalledWith(expect.objectContaining({ board: 'default', cards: { 'TKT-A': null } }))
})
