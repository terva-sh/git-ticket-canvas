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
 * one by luck.
 *
 * Two independent things can produce a difference, and they are measured
 * separately on purpose. Sign-on is inherent — `signOn` returns four nils for
 * the desk kind and neither command can be run as the other. Read-only is a
 * flag both commands have, differing only in default, and pointing a desk
 * canvas at a store you do not intend to modify is a real reason to set it.
 *
 * Bundling them was the first shape of this test, and it was wrong in a way
 * worth keeping a note of: it made the read-only badge read as a served-canvas
 * control, and it would have quietly absorbed any genuine read-only difference
 * into "that is just the served canvas".
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

type SignOn = 'desk' | 'served'
type ReadOnly = 'writable' | 'read-only'

const sessions: Record<SignOn, SessionResponse> = {
  desk: { authenticated: false } as SessionResponse,
  served: { authenticated: true, subject: 'someone', name: 'Someone', email: 'someone@example.test',
    groups: ['engineering'], admin: false } as SessionResponse,
}

/**
 * Mounts the real App at one corner of the grid.
 *
 * The store count is held at two everywhere. It is its own axis — a desk canvas
 * over three repositories shows the picker too — and holding it constant is
 * what stops a difference in configuration being reported as a difference
 * between the commands.
 */
async function mount(signOn: SignOn, readOnly: ReadOnly) {
  const stores = [store('alpha', { active: true }), store('beta')]
  vi.spyOn(RegistryClient.prototype, 'stores').mockResolvedValue({ stores })
  vi.spyOn(RegistryClient.prototype, 'favorites').mockResolvedValue({ stores: [], paths: [] })
  vi.spyOn(RegistryClient.prototype, 'session').mockResolvedValue(sessions[signOn])
  vi.spyOn(RegistryClient.prototype, 'version').mockResolvedValue(
    { schemaVersion: 1, kind: 'version', version: 'test', commit: 'test', go: 'test', modified: false } as never)
  vi.spyOn(TicketClient.prototype, 'board').mockResolvedValue(
    { status: 200, data: board(readOnly === 'read-only'), etag: '"e"' })
  await act(async () => { render(<App />, root) })
  for (let settle = 0; settle < 4; settle++) await act(async () => { await vi.advanceTimersByTimeAsync(0) })
}

/**
 * Every control the canvas identifies, by id.
 *
 * An id is this test's definition of "identified": giving one is how this
 * codebase marks something addressable. A control without one is not covered,
 * which is a real limit rather than an oversight — the manifest records it.
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

/** Which side of a pair each control appears on, for the controls that differ. */
function differences(a: Set<string>, aSide: string, b: Set<string>, bSide: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const control of [...new Set([...a, ...b])].sort()) {
    if (a.has(control) === b.has(control)) continue
    found.set(control, a.has(control) ? aSide : bSide)
  }
  return found
}

const show = (m: Map<string, string>) => [...m].map(([c, side]) => `${c} on ${side}`).join(', ') || '(none)'

interface Entry { control: string; axis: string; present: string; reason: string }
const declared = manifest.chrome as Entry[]

/** A chrome entry and a route entry differ only in what names the thing. */
interface Declared { axis: string; present: string; control?: string; route?: string }
const named = (entry: Declared) => entry.control ?? entry.route ?? '(unnamed entry)'

it('every difference between the canvases is on a declared axis and declared on it', async () => {
  // The whole grid, so each axis can be measured with the other held constant.
  const grid = new Map<string, Set<string>>()
  for (const signOn of ['desk', 'served'] as SignOn[]) {
    for (const readOnly of ['writable', 'read-only'] as ReadOnly[]) {
      act(() => render(null, root))
      await mount(signOn, readOnly)
      grid.set(`${signOn}/${readOnly}`, controls())
    }
  }

  // Guards the harness rather than the product: a corner that failed to mount
  // would contribute an empty set, and empty sets compare equal, so the test
  // would pass having compared nothing.
  for (const [corner, found] of grid) {
    expect(found, `${corner} did not render its toolbar, so this proves nothing`).toContain('#toolbar')
  }

  const measured = {
    // Sign-on measured at each setting of read-only, and read-only at each
    // setting of sign-on.
    'sign-on': {
      writable: differences(grid.get('desk/writable')!, 'desk', grid.get('served/writable')!, 'served'),
      'read-only': differences(grid.get('desk/read-only')!, 'desk', grid.get('served/read-only')!, 'served'),
    },
    'read-only': {
      desk: differences(grid.get('desk/writable')!, 'writable', grid.get('desk/read-only')!, 'read-only'),
      served: differences(grid.get('served/writable')!, 'writable', grid.get('served/read-only')!, 'read-only'),
    },
  }

  // An axis whose differences depend on the other axis is an interaction, and
  // taking either measurement as the answer would be picking one arbitrarily.
  // Separating the axes is only meaningful if they are actually separable, so
  // this asserts that rather than assuming it.
  for (const [axis, held] of Object.entries(measured)) {
    const [[firstName, first], [secondName, second]] = Object.entries(held)
    expect([...second], `the ${axis} axis differs depending on ${axis === 'sign-on' ? 'read-only' : 'sign-on'}: `
      + `${show(first)} when ${firstName}, but ${show(second)} when ${secondName}. `
      + 'That is an interaction between the two, so neither measurement is the answer. '
      + 'Either the control should not depend on both, or this needs a third shape.').toEqual([...first])
  }

  const actual: Entry[] = []
  for (const [axis, held] of Object.entries(measured)) {
    for (const [control, present] of Object.values(held)[0]) actual.push({ control, axis, present, reason: '' })
  }

  const undeclared = actual.filter(found => !declared.some(entry =>
    entry.control === found.control && entry.axis === found.axis && entry.present === found.present))
  expect(undeclared, undeclared.map(found =>
    `${found.control} appears only on the ${found.present} side of the ${found.axis} axis, `
    + 'and the manifest does not say so. If that is deliberate, add it to docs/canvas-parity.json '
    + 'with the reason it is one. If it is not, the other canvas is missing a control somebody '
    + 'added against this one.',
  ).join('\n')).toEqual([])

  // The manifest is a list of claims about the product, so a stale entry is a
  // defect in it. Without this, a difference that was resolved would sit in the
  // file forever describing a canvas that no longer exists.
  const stale = declared.filter(entry => !actual.some(found =>
    found.control === entry.control && found.axis === entry.axis && found.present === entry.present))
  expect(stale, stale.map(entry =>
    `the manifest says ${entry.control} is ${entry.present}-only on the ${entry.axis} axis and it is not. `
    + 'If the canvases were brought into line, delete the entry.',
  ).join('\n')).toEqual([])
})

// Every axis a chrome entry names has to be one the test actually varies.
// Without this, a typo in `axis` would file a real difference under a heading
// nothing measures, and it would read as declared while being unchecked.
it('every declared axis is one the manifest defines', () => {
  const axes = manifest.axes as Record<string, { sides: string[] }>
  const entries: Declared[] = [...manifest.chrome, ...manifest.routes]
  expect(entries.length, 'no entries to check, so this test proves nothing').toBeGreaterThan(0)
  for (const entry of entries) {
    expect(Object.keys(axes), `${named(entry)} is filed under "${entry.axis}", `
      + 'which is not an axis this manifest defines').toContain(entry.axis)
    expect(axes[entry.axis].sides, `${named(entry)} is declared present on "${entry.present}", `
      + `which is not a side of the ${entry.axis} axis`).toContain(entry.present)
  }
})
