// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { App } from './App'
import { RegistryClient, TicketClient, type BoardRead } from '../platform/tickets/client'
import type { BoardResponse, Ticket } from '../platform/tickets/types'
import { remember } from './displayPreferences'

vi.mock('./canvas/grid', () => ({ drawGrid: vi.fn() }))

let root: HTMLDivElement
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0) as unknown as number)
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => clearTimeout(handle))
  vi.stubGlobal('ResizeObserver', class { observe() {}; unobserve() {}; disconnect() {} })
  root = document.createElement('div'); document.body.append(root)
})
afterEach(() => {
  act(() => render(null, root)); root.remove()
  delete document.documentElement.dataset.targets
  delete document.documentElement.dataset.inspector
  delete document.documentElement.dataset.toolbar
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers()
})

function sizeWindow(width: number, height: number, coarse = false) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
  window.matchMedia = ((query: string) => ({
    matches: coarse && query.includes('coarse'), media: query,
    addEventListener() {}, removeEventListener() {},
  })) as unknown as typeof window.matchMedia
}

function data(): BoardResponse {
  const ticket: Ticket = { id: 'TKT-A', short: 'TKT-A', title: 'First', revision: 'r1', type: 'task', status: 'ready',
    priority: 'normal', labels: [], assignees: [], dependencies: [], blocksOn: 'none', references: [],
    archived: false, createdAt: '', updatedAt: '', body: { description: '', plan: '', summary: '',
      acceptanceCriteria: [], definitionOfDone: [], notes: [], comments: [] }, readiness: { ready: true, blocked: false } }
  return { tickets: [ticket], layout: { schema: 1, board: 'default', cards: {} },
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
  vi.spyOn(TicketClient.prototype, 'board').mockResolvedValue({ status: 200, data: data(), etag: '"e"' } as BoardRead)
  await act(async () => { render(<App />, root) })
  for (let i = 0; i < 6; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1) })
}

function card() { return root.querySelector<HTMLElement>('.card')! }

it('opens a phone-shaped window compact, sized for a finger, with the panel at the bottom', async () => {
  sizeWindow(390, 844, true)
  await mount()
  expect(card().classList.contains('compact')).toBe(true)
  // `#app` is outside the Preact tree, so the stylesheet keys on these.
  expect(document.documentElement.dataset.targets).toBe('coarse')
  expect(document.documentElement.dataset.inspector).toBe('bottom')
})

it('opens a desk monitor full, sized for a mouse, with the panel beside the board', async () => {
  sizeWindow(2560, 1440)
  await mount()
  expect(card().classList.contains('compact')).toBe(false)
  expect(document.documentElement.dataset.targets).toBe('fine')
  expect(document.documentElement.dataset.inspector).toBe('beside')
})

// A default is a starting point and never a lock.
it('lets a stored override beat the window', async () => {
  remember({ density: 'full', targets: 'fine' })
  sizeWindow(390, 844, true)
  await mount()
  expect(card().classList.contains('compact')).toBe(false)
  expect(document.documentElement.dataset.targets).toBe('fine')
  // And the one nobody overrode still follows the window.
  expect(document.documentElement.dataset.inspector).toBe('bottom')
})

it('follows a window that changes shape', async () => {
  sizeWindow(1440, 900)
  await mount()
  expect(document.documentElement.dataset.inspector).toBe('beside')
  sizeWindow(820, 1180, true)
  await act(async () => { window.dispatchEvent(new Event('resize')); await vi.advanceTimersByTimeAsync(1) })
  expect(document.documentElement.dataset.inspector).toBe('bottom')
  expect(card().classList.contains('compact')).toBe(true)
})

it('publishes the toolbar size for the stylesheet, and defaults to standard', async () => {
  sizeWindow(1440, 900)
  await mount()
  expect(document.documentElement.dataset.toolbar).toBe('standard')
})

it('follows a stored toolbar size without touching anything else', async () => {
  remember({ toolbar: 'larger' })
  sizeWindow(1440, 900)
  await mount()
  expect(document.documentElement.dataset.toolbar).toBe('larger')
  // The settings the window chose are untouched by it.
  expect(document.documentElement.dataset.inspector).toBe('beside')
  expect(document.documentElement.dataset.targets).toBe('fine')
  expect(card().classList.contains('compact')).toBe(false)
})
