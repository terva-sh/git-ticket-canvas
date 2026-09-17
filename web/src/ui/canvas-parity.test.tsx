// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { App } from './App'
import { RegistryClient, TicketClient } from '../platform/tickets/client'
import type { BoardResponse, SessionResponse, StoreSummary, Ticket } from '../platform/tickets/types'
import manifest from '../../../docs/canvas-parity.json'

/**
 * The canvas ships as two commands over one browser bundle. What differs is
 * which props arrive filled, and nothing fails when they drift: a control added
 * against whichever canvas the author happened to be running reaches the other
 * one by luck. This mounts the real `App` in both shapes and makes every
 * difference either declared in the manifest or a failing test.
 */
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
vi.mock('./canvas/grid', () => ({ drawGrid: vi.fn() }))

const store = (name: string, over: Partial<StoreSummary> = {}): StoreSummary => ({
  name, display: name, path: `/${name}/.tickets`, available: true, active: false,
  favorite: false, readOnly: false, ...over,
} as StoreSummary)

function board(readOnly: boolean): BoardResponse {
  const ticket: Ticket = { id: 'TKT-1', short: 'TKT-1', title: 'First', revision: 'r1', type: 'task', status: 'draft',
    priority: 'normal', labels: [], assignees: [], dependencies: [], blocksOn: 'none', references: [],
    archived: false, createdAt: '', updatedAt: '', body: { description: '', plan: '', summary: '',
      acceptanceCriteria: [], definitionOfDone: [], notes: [], comments: [] },
    readiness: { ready: false, blocked: false } }
  return { tickets: [ticket], layout: { schema: 1, board: 'default', cards: { 'TKT-1': { x: 0, y: 0 } } },
    boards: ['default'], storePath: '/fixture', readOnly,
    config: { statuses: ['draft', 'ready'], openStatuses: ['draft', 'ready'], terminalStatuses: ['done'], types: ['task'],
      priorities: ['normal'], blocksOn: ['none'], labels: ['ui'], milestones: [], series: ['TKT'], actors: [],
      actor: { ID: 'agent:test', Name: 'Test' }, transitions: {}, reasonRequired: {} } }
}

/**
 * The two shapes as the Go side produces them.
 *
 * Desk is `git-ticket-canvas`: `signOn` returns four nils for it, so the
 * registry has no `Access`, `GET /api/session` answers that nobody is signed
 * in, and writes are allowed. Served is `git-ticket-canvas-server`: somebody is
 * signed in and `-read-only` defaults true.
 *
 * Both are given the same number of stores on purpose. The store count is its
 * own axis — a desk canvas over three repositories shows the picker too — and
 * holding it equal is what stops this test reporting that difference as though
 * it were a difference between the commands.
 */
const shapes = {
  desk: { session: { authenticated: false } as SessionResponse, readOnly: false },
  served: {
    session: { authenticated: true, subject: 'someone', name: 'Someone', email: 'someone@example.test',
      groups: ['engineering'], admin: false } as SessionResponse,
    readOnly: true,
  },
}

async function mount(shape: keyof typeof shapes) {
  const { session, readOnly } = shapes[shape]
  const stores = [store('alpha', { active: true }), store('beta')]
  vi.spyOn(RegistryClient.prototype, 'stores').mockResolvedValue({ stores })
  vi.spyOn(RegistryClient.prototype, 'favorites').mockResolvedValue({ stores: [], paths: [] })
  vi.spyOn(RegistryClient.prototype, 'session').mockResolvedValue(session)
  vi.spyOn(RegistryClient.prototype, 'version').mockResolvedValue(
    { schemaVersion: 1, kind: 'version', version: 'test', commit: 'test', go: 'test', modified: false } as never)
  vi.spyOn(TicketClient.prototype, 'board').mockResolvedValue({ status: 200, data: board(readOnly), etag: '"e"' })
  await act(async () => { render(<App />, root) })
  for (let settle = 0; settle < 4; settle++) await act(async () => { await vi.advanceTimersByTimeAsync(0) })
}

/**
 * Every control the canvas identifies, by id.
 *
 * An id is the test's definition of "identified": giving a control one is how
 * this codebase marks something addressable, by a test or by a person reading
 * the DOM. A control with no id is not covered here, which is a real limit
 * rather than an oversight — see the manifest's own note on it.
 *
 * `hidden` counts as absent. The read-only badge is in the markup on every
 * canvas and hidden when writes are allowed, and a badge nobody can see is not
 * a control the person has.
 */
function controls(): Set<string> {
  const found = new Set<string>()
  for (const node of root.querySelectorAll<HTMLElement>('[id]')) {
    if (node.hidden || node.closest('[hidden]')) continue
    found.add(`#${node.id}`)
  }
  return found
}

interface Difference { control: string; present: 'desk' | 'served'; reason: string }
const declared = new Map((manifest.chrome as Difference[]).map(entry => [entry.control, entry]))

it('every difference between the desk and served chrome is one somebody declared', async () => {
  await mount('desk')
  const desk = controls()
  act(() => render(null, root))
  await mount('served')
  const served = controls()

  // Guards the harness rather than the product: if a shape failed to mount, both
  // sets would be empty or equal and this test would pass having compared
  // nothing. The toolbar is present on any canvas that rendered at all.
  expect(desk, 'the desk canvas did not render its toolbar, so this proves nothing').toContain('#toolbar')
  expect(served, 'the served canvas did not render its toolbar, so this proves nothing').toContain('#toolbar')

  const differences: Difference[] = []
  for (const control of [...new Set([...desk, ...served])].sort()) {
    const inDesk = desk.has(control), inServed = served.has(control)
    if (inDesk === inServed) continue
    differences.push({ control, present: inDesk ? 'desk' : 'served', reason: '' })
  }

  const undeclared = differences.filter(d => declared.get(d.control)?.present !== d.present)
  expect(undeclared, undeclared.map(d =>
    `${d.control} appears only on the ${d.present} canvas and the manifest does not say so. `
    + 'If that is deliberate, add it to docs/canvas-parity.json with the reason it is one. '
    + 'If it is not, the other canvas is missing a control somebody added against this one.',
  ).join('\n')).toEqual([])

  // The manifest is a list of claims about the product, so a stale entry is a
  // defect in it. Without this, a difference that was resolved would sit in the
  // file forever describing a canvas that no longer exists.
  const stale = [...declared.values()].filter(entry =>
    !differences.some(d => d.control === entry.control && d.present === entry.present))
  expect(stale, stale.map(entry =>
    `the manifest says ${entry.control} is ${entry.present}-only and it is not. `
    + 'If the canvases were brought into line, delete the entry.',
  ).join('\n')).toEqual([])
})
