// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Inspector } from './Inspector'
import type { Schema, Ticket } from '../platform/tickets/types'

const schema: Schema = {
  statuses: ['draft', 'ready', 'done'], openStatuses: ['draft', 'ready'], terminalStatuses: ['done'],
  types: ['task', 'epic'], priorities: ['normal'], blocksOn: ['none', 'children'], labels: [],
  milestones: [], series: ['TKT'], actors: [], actor: { ID: 'agent:test', Name: 'Test' },
  transitions: {}, reasonRequired: {},
}
function make(id: string, title: string, extra: Partial<Ticket> = {}): Ticket {
  return {
    id, short: id, title, revision: `r-${id}`, type: 'task', status: 'ready', priority: 'normal', labels: [],
    assignees: [], dependencies: [], blocksOn: 'none', references: [], archived: false, createdAt: '',
    updatedAt: '2026-09-01T00:00:00Z',
    body: { description: '', plan: '', summary: '', acceptanceCriteria: [], definitionOfDone: [], notes: [], comments: [] },
    readiness: { ready: true, blocked: false }, ...extra,
  }
}

// SELF would close a three-ticket loop by depending on LOOP, which waits on
// MID, which waits on SELF, and a two-ticket one by depending on MID. DONE is
// finished, and a dependency on it is fine.
const self = make('TKT-SELF', 'The inspected ticket')
const tickets = [
  self,
  make('TKT-MID', 'Middle of the loop', { dependencies: ['TKT-SELF'] }),
  make('TKT-LOOP', 'Loop closer', { dependencies: ['TKT-MID'] }),
  make('TKT-DONE', 'Finished groundwork', { status: 'done', updatedAt: '2026-09-02T00:00:00Z' }),
  make('TKT-OTHER', 'Unrelated work'),
]

let root: HTMLDivElement
beforeEach(() => { root = document.createElement('div'); document.body.append(root) })
afterEach(() => { act(() => render(null, root)); root.remove(); vi.restoreAllMocks() })

function inspector(t = self, all = tickets, patch = vi.fn().mockResolvedValue(undefined), readOnly = false, onClose = vi.fn()) {
  act(() => render(<Inspector ticket={t} config={schema} tickets={new Map(all.map(x => [x.id, x]))} readOnly={readOnly}
    onPatch={patch} onClose={onClose} onNavigate={() => {}} onDelete={vi.fn()} />, root))
  return { patch, onClose }
}
function button(text: RegExp): HTMLButtonElement {
  return [...root.querySelectorAll<HTMLButtonElement>('.relation-picker > button')].find(node => text.test(node.textContent!))!
}
const search = () => root.querySelector<HTMLInputElement>('.relation-search input')!
const options = () => [...root.querySelectorAll<HTMLElement>('[role=option]')]
const ids = () => options().map(node => node.querySelector('.id')!.textContent)
function type(text: string) {
  act(() => { const node = search(); node.value = text; node.dispatchEvent(new Event('input', { bubbles: true })) })
}
async function key(node: HTMLElement, name: string) {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })
  await act(async () => { node.dispatchEvent(event) })
  return event
}

it('says the drag is not the only way to add a dependency', () => {
  inspector()
  const empty = [...root.querySelectorAll('.muted')].find(node => node.textContent!.startsWith('none yet'))!
  expect(empty.textContent).toBe("none yet. Add one below, or drag a card's right handle onto another")
})

it('offers every other ticket except the ones that would close a cycle, done ones included', () => {
  inspector()
  act(() => button(/Add dependency/).click())
  expect(document.activeElement).toBe(search())
  // Most recently updated first, so the done ticket leads here.
  expect(ids()).toEqual(['TKT-DONE', 'TKT-OTHER'])
  expect(options()[0].textContent).toContain('done')
  expect(root.querySelector('.relation-refused')!.textContent).toBe('2 tickets are left out because linking would close a cycle')
})

it('searches by ID and title the way the board search does', () => {
  inspector()
  act(() => button(/Add dependency/).click())
  type('groundwork')
  expect(ids()).toEqual(['TKT-DONE'])
  type('tkt-other')
  expect(ids()).toEqual(['TKT-OTHER'])
  type('loop closer')
  expect(ids()).toEqual([])
  expect(root.textContent).toContain('No ticket matches "loop closer"')
  expect(root.querySelector('.relation-refused')!.textContent).toContain('1 ticket is left out')
})

it('adds a dependency by keyboard alone and hands focus back to the button', async () => {
  const { patch, onClose } = inspector()
  const add = button(/Add dependency/)
  act(() => add.focus())
  act(() => add.click())
  type('TKT')
  const box = search()
  expect(box.getAttribute('aria-activedescendant')).toBe(options()[0].id)
  await key(box, 'ArrowDown')
  expect(options()[1].getAttribute('aria-selected')).toBe('true')
  expect(box.getAttribute('aria-activedescendant')).toBe(options()[1].id)
  // Up from the first wraps to the last.
  await key(box, 'ArrowUp'); await key(box, 'ArrowUp')
  expect(options()[1].getAttribute('aria-selected')).toBe('true')
  const enter = await key(box, 'Enter')
  expect(enter.defaultPrevented).toBe(true)
  expect(patch).toHaveBeenCalledWith(self, [{ op: 'addDependency', id: 'TKT-OTHER' }])
  expect(search()).toBeNull()
  expect(document.activeElement).toBe(add)
  expect(onClose).not.toHaveBeenCalled()
})

it('closes the search on Escape without closing the inspector', async () => {
  const { patch, onClose } = inspector()
  act(() => button(/Add dependency/).click())
  type('work')
  await key(search(), 'Escape')
  expect(search()).toBeNull()
  expect(document.activeElement).toBe(button(/Add dependency/))
  expect(onClose).not.toHaveBeenCalled()
  expect(patch).not.toHaveBeenCalled()
})

it('keeps the search and its query open when the write fails', async () => {
  const patch = vi.fn().mockRejectedValue(new Error('conflict'))
  inspector(self, tickets, patch)
  act(() => button(/Add dependency/).click())
  type('Unrelated')
  await key(search(), 'Enter')
  expect(patch).toHaveBeenCalledTimes(1)
  expect(search().value).toBe('Unrelated')
  expect(search().readOnly).toBe(false)
})

it('sets a parent with a click, leaving out a descendant and the current parent', async () => {
  // CHILD's parent is SELF, so SELF under CHILD would be a parent loop.
  const child = make('TKT-CHILD', 'A child of the inspected ticket', { parent: 'TKT-SELF' })
  const parented = { ...self, parent: 'TKT-OTHER' }
  const { patch } = inspector(parented, [parented, child, ...tickets.slice(1)])
  const set = button(/parent/)
  expect(set.textContent).toBe('Change parent…')
  act(() => set.click())
  expect(ids()).not.toContain('TKT-CHILD')
  expect(ids()).not.toContain('TKT-OTHER')
  expect(ids()).toContain('TKT-LOOP')
  const loop = options().find(node => node.textContent!.includes('TKT-LOOP'))!
  await act(async () => { loop.click() })
  expect(patch).toHaveBeenCalledWith(parented, [{ op: 'setParent', parent: 'TKT-LOOP' }])
})

it('reads Set parent when there is none', () => {
  inspector()
  expect(button(/parent/).textContent).toBe('Set parent…')
})

it('leaves out an epic that blocks on its children when the ticket already waits on it', () => {
  const epic = make('TKT-EPIC', 'Gated epic', { type: 'epic', blocksOn: 'children' })
  const waiting = { ...self, dependencies: ['TKT-EPIC'] }
  inspector(waiting, [waiting, epic, ...tickets.slice(1)])
  act(() => button(/parent/).click())
  expect(ids()).not.toContain('TKT-EPIC')
  expect(root.querySelector('.relation-refused')).not.toBeNull()
})

it('disables both controls when read-only and closes an open search if it turns read-only', () => {
  const { patch } = inspector()
  act(() => button(/Add dependency/).click())
  expect(search()).not.toBeNull()
  inspector(self, tickets, patch, true)
  expect(search()).toBeNull()
  expect(button(/Add dependency/).disabled).toBe(true)
  expect(button(/parent/).disabled).toBe(true)
  act(() => button(/Add dependency/).click())
  expect(search()).toBeNull()
  inspector(self, tickets, patch, false)
  expect(search()).toBeNull()
  expect(patch).not.toHaveBeenCalled()
})

it('counts the matches beyond the ones it shows', () => {
  const many = Array.from({ length: 12 }, (_, i) => make(`TKT-N${String(i).padStart(2, '0')}`, `Numbered ${i}`))
  inspector(self, [self, ...many])
  act(() => button(/Add dependency/).click())
  type('Numbered')
  expect(options()).toHaveLength(8)
  expect(root.textContent).toContain('4 more match. Keep typing to narrow them')
})

it('closes an open search when the inspector moves to another ticket', () => {
  const { patch } = inspector()
  act(() => button(/Add dependency/).click())
  type('Unrelated')
  // The inspector stays mounted and only its ticket changes, as it does when
  // somebody selects another card with the search still open. What closes the
  // search is `InspectorBody key={ticket.id}` in Inspector.tsx, which remounts
  // both pickers; this holds that, because without it the choice would be
  // written to the ticket now showing rather than the one it was opened for.
  inspector(tickets[3], tickets, patch)
  expect(search()).toBeNull()
  act(() => button(/Add dependency/).click())
  expect(search().value).toBe('')
  expect(patch).not.toHaveBeenCalled()
})

it('keeps an open search when the same ticket arrives with a new revision', () => {
  const { patch } = inspector()
  act(() => button(/Add dependency/).click())
  type('Unrelated')
  // A live update replaces the ticket object without changing whose it is.
  inspector({ ...self, revision: 'r-SELF-2' }, tickets, patch)
  expect(search().value).toBe('Unrelated')
})
