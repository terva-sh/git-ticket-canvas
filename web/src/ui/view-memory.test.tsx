// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { App } from './App'
import { RegistryClient, TicketClient, type BoardRead } from '../platform/tickets/client'
import type { BoardResponse, Ticket } from '../platform/tickets/types'
import { remember } from './canvas/viewMemory'

vi.mock('./canvas/grid', () => ({ drawGrid: vi.fn() }))

let root: HTMLDivElement
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  // Frames as timers, so advancing the clock runs them. The opening view is
  // chosen inside a frame callback, so a stub that never calls back would test
  // nothing, and one that calls back synchronously reenters code that assumes
  // it did not.
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

function data(): BoardResponse {
  const ticket: Ticket = { id: 'TKT-1', short: 'TKT-1', title: 'First', revision: 'r1', type: 'task', status: 'draft',
    priority: 'normal', labels: [], assignees: [], dependencies: [], blocksOn: 'none', references: [],
    archived: false, createdAt: '', updatedAt: '', body: { description: '', plan: '', summary: '',
      acceptanceCriteria: [], definitionOfDone: [], notes: [], comments: [] }, readiness: { ready: false, blocked: false } }
  return { tickets: [ticket], layout: { schema: 1, board: 'default', cards: { 'TKT-1': { x: 0, y: 0 } } },
    boards: ['default'], storePath: '/fixture', readOnly: false,
    config: { statuses: ['draft'], openStatuses: ['draft'], terminalStatuses: ['done'], types: ['task'], priorities: ['normal'],
      blocksOn: ['none'], labels: [], milestones: [], series: ['TKT'], actors: [],
      actor: { ID: 'agent:test', Name: 'Test' }, transitions: {}, reasonRequired: {} } }
}
function modified(): BoardRead { return { status: 200, data: data(), etag: '"snapshot"' } }

async function mount() {
  vi.spyOn(RegistryClient.prototype, 'stores').mockResolvedValue({
    stores: [{ name: 'fixture', display: 'fixture', path: '/fixture/.tickets', available: true,
      active: false, favorite: false, readOnly: false }] })
  vi.spyOn(RegistryClient.prototype, 'favorites').mockResolvedValue({ stores: [], paths: [] })
  vi.spyOn(TicketClient.prototype, 'board').mockResolvedValue(modified())
  await act(async () => { render(<App />, root) })
  for (let i = 0; i < 6; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1) })
}

function scene() { return root.querySelector<HTMLElement>('#scene')!.style.transform }

// The bug this file exists for. A board opens by framing every card, and that
// fit ran after the restore and overwrote it, so a reload always landed
// somewhere the person had not chosen. Both now go through one decision made
// once, which is what this pins: the remembered view survives the opening read
// rather than being pushed in beside it.
//
// jsdom reports every element at zero size, so the fit this displaces finds no
// bounds and would not have moved the view here anyway. What this cannot show
// is the ordering; what it does show is that the restore happens at all, and
// that it carries the position.
it('opens a board where it was left, not at the opening fit', async () => {
  remember('fixture', 'default', { x: -640, y: -320, k: 1.75 })
  await mount()
  expect(scene()).toBe('translate(-640px, -320px) scale(1.75)')
  // And the magnifier agrees, rather than still reading the opening level.
  expect(root.querySelector('#btnZoomReset')!.textContent).toContain('175%')
})

// Position and magnification are one memory. Restoring the level alone puts
// somebody at the right scale on the wrong part of the board, which on a large
// board is barely better than putting them nowhere.
it('remembers where they were looking, not only how close', async () => {
  await mount()
  const opened = scene()
  const stage = root.querySelector<HTMLDivElement>('#stage')!
  stage.setPointerCapture = () => {}
  stage.hasPointerCapture = () => false
  stage.releasePointerCapture = () => {}
  await act(async () => {
    stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1, clientX: 400, clientY: 300 }))
    stage.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, isPrimary: true, buttons: 1, clientX: 250, clientY: 220 }))
    stage.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, isPrimary: true, button: 0, buttons: 0, clientX: 250, clientY: 220 }))
  })
  const panned = scene()
  expect(panned).not.toBe(opened)
  // The write is debounced, because a pan reports every motion frame.
  await act(async () => { await vi.advanceTimersByTimeAsync(400) })
  const held = JSON.parse(localStorage.getItem('git-ticket-canvas.view.fixture.default')!)
  expect(scene()).toBe(`translate(${held.x}px, ${held.y}px) scale(${held.k})`)
})

// A board nobody has opened has nothing to restore, so it is left to the fit.
it('leaves the board to the opening fit when there is nothing remembered', async () => {
  await mount()
  // The fit is a no-op at jsdom's zero size, so this is the untouched opening
  // view: nothing was restored, and nothing was written on the way in.
  expect(scene()).toBe('translate(120px, 90px) scale(1)')
  expect(localStorage.getItem('git-ticket-canvas.view.fixture.default')).toBeNull()
})
