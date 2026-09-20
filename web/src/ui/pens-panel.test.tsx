// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LabelTokens, PensPanel, suggestionsFor, type PensPanelProps } from './PensPanel'
import { cloneRouting } from '../platform/canvas/pens'
import type { Pen, Routing, Schema, Ticket } from '../platform/tickets/types'

function ticket(id: string, labels: string[], status = 'ready'): Ticket {
  return { id, short: id, title: `Ticket ${id}`, status, type: 'task', priority: 'normal', labels, assignees: [], dependencies: [],
    blocksOn: 'none', references: [], updatedAt: '' } as unknown as Ticket
}
const pen = (title: string, labels: string[]): Pen => ({ title, x: 0, y: 0, w: 1000, h: 300, color: '#759bcc', pin: { x: 0, y: 0 },
  match: { labels, status: [], type: [], parent: [] } })
const accepted: Routing = { pens: { fe: pen('Frontend', ['frontend']), bugs: pen('Bugs', ['bug']) }, ruleOrder: ['fe', 'bugs'], inbox: { x: -400, y: 0 } }
const tickets = new Map([['a', ticket('a', ['frontend', 'bug'])], ['b', ticket('b', ['bug'])], ['c', ticket('c', ['docs'])]])
const config = { statuses: ['ready', 'done'], types: ['task', 'epic'], labels: ['frontend', 'bug', 'ui'] } as unknown as Schema

let root: HTMLDivElement
beforeEach(() => { root = document.createElement('div'); document.body.append(root) })
afterEach(() => { act(() => render(null, root)); root.remove(); vi.restoreAllMocks() })

/** A parent that holds the draft the way App does: every edit replaces it,
 * a preview copies it, cancel returns to the accepted routing. */
function mount(over: Partial<PensPanelProps> = {}) {
  const state = { draft: cloneRouting(accepted), previewed: null as Routing | null }
  const props: PensPanelProps = {
    accepted, draft: state.draft, previewed: null, tickets, cards: {}, config, readOnly: false, pending: false, conflict: '',
    onDraft: vi.fn(next => { state.draft = next; state.previewed = null; show() }),
    onPreview: vi.fn(() => { state.previewed = cloneRouting(state.draft); show() }),
    onApply: vi.fn().mockResolvedValue('saved' as const),
    onCancel: vi.fn(() => { state.draft = cloneRouting(accepted); state.previewed = null; show() }),
    onClose: vi.fn(), ...over,
  }
  const show = () => act(() => render(<PensPanel {...props} draft={state.draft} previewed={state.previewed} />, root))
  show()
  return { props, state }
}
const button = (label: string) => [...root.querySelectorAll('button')].find(b => b.textContent === label || b.getAttribute('aria-label') === label)!
const byId = (id: string) => root.querySelector<HTMLButtonElement>(`#${id}`)!
const rules = () => [...root.querySelectorAll<HTMLElement>('.pen-rules li')].map(li => li.dataset.penId)
function input(label: string, value: string) {
  const node = [...root.querySelectorAll('label')].find(node => node.firstChild?.textContent === label)!.querySelector('input,select')! as HTMLInputElement
  act(() => { node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })) })
}

it('lists the rules in order with their counts and the overlaps order decides', () => {
  mount()
  expect(rules()).toEqual(['fe', 'bugs'])
  expect(root.querySelector('[data-pen-id="fe"] [data-pen-count]')!.textContent).toContain('1 automatic')
  expect(root.querySelector('[data-pen-id="bugs"]')!.textContent).toContain('1 card also match this rule but Frontend (fe) is earlier')
  expect(root.textContent).toContain('1 automatic card matched no rule')
  expect(byId('btnPenPreview').disabled).toBe(true)
  expect(byId('btnPenApply').disabled).toBe(true)
  expect(root.textContent).toContain('The draft matches the board.')
})

// Every gesture is a draft. Preview is what shows its effect; Apply writes
// exactly the previewed draft; an edit after the preview needs a new one.
it('reorders as a draft, previews the moves, and gates Apply on the exact preview', async () => {
  const { props, state } = mount()
  act(() => button('Move Bugs earlier').click())
  expect(rules()).toEqual(['bugs', 'fe'])
  expect(props.onDraft).toHaveBeenCalled()
  expect(byId('btnPenPreview').disabled).toBe(false)
  expect(byId('btnPenApply').disabled).toBe(true)
  act(() => byId('btnPenPreview').click())
  expect(state.previewed?.ruleOrder).toEqual(['bugs', 'fe'])
  expect(root.textContent).toContain('1 automatic card changes destination')
  expect(root.textContent).toContain('Ticket a: Frontend (fe) → Bugs (bugs)')
  expect(byId('btnPenApply').disabled).toBe(false)
  // An edit after the preview: the parent withdraws the preview, Apply closes.
  act(() => button('Move Bugs later').click())
  expect(byId('btnPenApply').disabled).toBe(true)
  act(() => button('Move Bugs earlier').click())
  act(() => byId('btnPenPreview').click())
  await act(async () => { byId('btnPenApply').click() })
  expect(props.onApply).toHaveBeenCalledTimes(1)
  expect(root.textContent).toContain('Rules saved.')
})

it('adds a pen over the match record and refuses an empty rule', () => {
  const { state } = mount()
  act(() => byId('btnAddPen').click())
  input('Title', 'Documentation')
  expect(byId('btnPenDone').disabled).toBe(true)
  expect(root.textContent).toContain('Add at least one rule field: labels, status, type or parent. Unmatched automatic cards go to Inbox.')
  const done = root.querySelector<HTMLInputElement>('.pen-checks input')!
  act(() => { done.checked = true; done.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(byId('btnPenDone').disabled).toBe(false)
  act(() => byId('btnPenDone').click())
  expect(state.draft.ruleOrder).toEqual(['fe', 'bugs', 'documentation'])
  expect(state.draft.pens.documentation.match.status).toEqual(['ready'])
  expect(state.draft.pens.documentation.title).toBe('Documentation')
})

it('removes a pen from the draft and cancels back to the board', () => {
  const { props, state } = mount()
  act(() => button('Remove Frontend').click())
  expect(rules()).toEqual(['bugs'])
  expect(state.draft.pens.fe).toBeUndefined()
  act(() => byId('btnPenCancel').click())
  expect(props.onCancel).toHaveBeenCalled()
  expect(rules()).toEqual(['fe', 'bugs'])
})

it('shows the reason a preview was discarded', () => {
  mount({ conflict: 'Apply refused: the board\'s rules changed on disk while the preview was held (layout_conflict).' })
  expect(root.querySelector('[role="alert"]')!.textContent).toContain('layout_conflict')
})

// A served canvas is read-only. The rules are worth reading there; nothing
// about them can be changed, and the panel says so.
it('disables every control on a read-only canvas and says why', () => {
  mount({ readOnly: true })
  expect(root.textContent).toContain('Read-only. Rules can be read here and changed with git ticket canvas on the desk.')
  for (const b of root.querySelectorAll<HTMLButtonElement>('button')) {
    if (b.getAttribute('aria-label') === 'Close pens panel') continue
    expect(b.disabled, b.textContent || b.getAttribute('aria-label') || '').toBe(true)
  }
  for (const i of root.querySelectorAll<HTMLInputElement>('input')) expect(i.disabled).toBe(true)
})

// The label field of the authoring addendum.
function tokens(value: string[] = [], over: Partial<Parameters<typeof LabelTokens>[0]> = {}) {
  const onChange = vi.fn()
  const suggestions = suggestionsFor(config, tickets.values())
  act(() => render(<LabelTokens value={value} suggestions={suggestions} disabled={false} onChange={onChange} {...over} />, root))
  return { onChange, entry: root.querySelector<HTMLInputElement>('input[role="combobox"]')! }
}
function type(entry: HTMLInputElement, text: string) { act(() => { entry.value = text; entry.dispatchEvent(new Event('input', { bubbles: true })) }) }
function key(entry: HTMLInputElement, name: string) {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })
  act(() => { entry.dispatchEvent(event) })
  return event
}
const choices = () => [...root.querySelectorAll('[role="option"]')].map(o => o.textContent)

it('suggests labels with their source, searched without regard to case, and keeps exact identity', () => {
  const { onChange, entry } = tokens()
  type(entry, 'FRONT')
  expect(choices()).toEqual(['frontend Configured · Used on tickets', 'Use "FRONT"'])
  key(entry, 'ArrowDown')
  key(entry, 'Enter')
  expect(onChange).toHaveBeenCalledWith(['frontend'])
})

it('offers the typed label as its own entry and never splits it', () => {
  const { onChange, entry } = tokens()
  type(entry, ' backend, api ')
  expect(choices()).toEqual(['Use "backend, api"'])
  key(entry, 'Enter')
  expect(onChange).toHaveBeenCalledWith(['backend, api'])
})

it('reports a duplicate without adding it and counts distinct labels', () => {
  const { onChange, entry } = tokens(['frontend', 'bug'])
  expect(root.textContent).toContain('2 distinct required labels')
  type(entry, 'frontend')
  key(entry, 'Enter')
  expect(onChange).not.toHaveBeenCalled()
  expect(root.textContent).toContain('"frontend" is already required.')
})

it('warns about a label nothing carries, names the remove control, and leaves Backspace alone', () => {
  const { onChange, entry } = tokens(['backend'])
  expect(root.textContent).toContain('"backend" is not currently configured or used.')
  expect(root.querySelector('button[aria-label="Remove required label backend"]')).not.toBeNull()
  key(entry, 'Backspace')
  expect(onChange).not.toHaveBeenCalled()
  act(() => root.querySelector<HTMLButtonElement>('button[aria-label="Remove required label backend"]')!.click())
  expect(onChange).toHaveBeenCalledWith([])
})

it('closes the suggestions on Escape before letting Escape reach the panel', () => {
  const { entry } = tokens()
  type(entry, 'b')
  expect(choices().length).toBeGreaterThan(0)
  const first = key(entry, 'Escape')
  expect(first.defaultPrevented).toBe(true)
  expect(root.querySelector('[role="listbox"]')).toBeNull()
  const second = key(entry, 'Escape')
  expect(second.defaultPrevented).toBe(false)
})
