// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Inspector } from './Inspector'
import type { Schema, Ticket } from '../platform/tickets/types'

const schema: Schema = {
  statuses: ['draft', 'ready', 'blocked'], openStatuses: ['draft', 'ready', 'blocked'], terminalStatuses: ['done'],
  types: ['task', 'epic'], priorities: ['normal', 'high'], blocksOn: ['none', 'children'], labels: ['ui'],
  milestones: [], series: ['TKT'], actors: [], actor: { ID: 'agent:test', Name: 'Test' },
  transitions: { draft: ['ready', 'blocked'] }, reasonRequired: { draft: ['blocked'] },
}
const ticket: Ticket = {
  id: 'TKT-1', short: 'TKT-1', title: 'A long inspector title that wraps instead of hiding its ending',
  revision: 'r1', type: 'task', status: 'draft', priority: 'normal', labels: ['ui', 'readability'],
  assignees: [], dependencies: [], blocksOn: 'none', references: [], archived: false, createdAt: '', updatedAt: '',
  body: { description: 'Description', plan: '', summary: '', acceptanceCriteria: [], definitionOfDone: [], notes: [], comments: [] },
  readiness: { ready: false, blocked: false },
}
let root: HTMLDivElement
beforeEach(() => { root = document.createElement('div'); document.body.append(root) })
afterEach(() => { act(() => render(null, root)); root.remove(); vi.restoreAllMocks() })
function inspector(t = ticket, patch = vi.fn().mockResolvedValue(undefined), readOnly = false) {
  act(() => render(<Inspector ticket={t} config={schema} tickets={new Map([[t.id, t]])} readOnly={readOnly}
    onPatch={patch} onClose={() => {}} onNavigate={() => {}} onDelete={vi.fn()} />, root))
  return patch
}
function section(label: string): HTMLDetailsElement {
  return [...root.querySelectorAll('details')].find(node => node.querySelector('summary')!.textContent!.startsWith(label))!
}
function field(label: string): HTMLElement {
  return [...root.querySelectorAll<HTMLElement>('.field')].find(node => node.querySelector('label')?.textContent === label)!
}
function prose(label: string): HTMLTextAreaElement { return field(label).querySelector('textarea')! }
function input(node: HTMLInputElement | HTMLTextAreaElement, value: string) {
  act(() => { node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })) })
}
async function key(node: HTMLElement, name: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...options })
  await act(async () => { node.dispatchEvent(event) })
  return event
}

it('shows state and all labels without opening the metadata editors', () => {
  inspector({ ...ticket, priority: 'high', assignees: ['agent:a', 'agent:b'], dueOn: '2026-09-10',
    claim: { actor: 'agent:worker', expired: true }, readiness: { ready: false, blocked: true,
      blocking: ['TKT-2'], missing: ['TKT-3'], reason: 'Waiting on a prerequisite' } })
  const state = root.querySelector('.insp-state')!
  for (const text of ['draft', 'high', 'agent:a, agent:b', 'agent:worker · expired', '1 dependency', '1 missing',
    'Waiting on a prerequisite', '2026-09-10']) expect(state.textContent).toContain(text)
  expect(section('Edit status').open).toBe(false)
  expect(field('Labels').closest('details')).toBeNull()
  expect([...field('Labels').querySelectorAll('.chip')].map(node => node.textContent)).toEqual(['ui ×', 'readability ×'])
})

it('collapses empty optional fields without unmounting their editors', () => {
  inspector()
  for (const label of ['Implementation plan', 'Acceptance criteria', 'Definition of done', 'Notes', 'Comments', 'Summary']) {
    expect(section(label).open).toBe(false)
    expect(field(label).querySelector('input,textarea')).not.toBeNull()
    expect(section(label).querySelector('summary')!.textContent).toMatch(/add|edit/)
  }
  expect(section('Relationships').open).toBe(false)
  expect(prose('Description').closest('details')).toBeNull()
})

it('preserves expansion, editor nodes, focused drafts and snapshot revisions across refresh', async () => {
  const patch = inspector(), plan = prose('Implementation plan'), details = section('Implementation plan')
  act(() => { details.open = true; plan.focus() })
  input(plan, 'Local plan')
  plan.setSelectionRange(2, 7)
  inspector({ ...ticket, revision: 'r2', body: { ...ticket.body, plan: 'External plan', summary: 'New summary' } }, patch)
  expect(section('Implementation plan')).toBe(details)
  expect(details.open).toBe(true)
  expect(prose('Implementation plan')).toBe(plan)
  expect(document.activeElement).toBe(plan)
  expect([plan.selectionStart, plan.selectionEnd]).toEqual([2, 7])
  expect(plan.value).toBe('Local plan')
  expect(section('Summary').open).toBe(false)
  expect(prose('Summary').value).toBe('New summary')
  expect(patch).not.toHaveBeenCalled()
  await act(async () => plan.blur())
  expect(patch).toHaveBeenCalledWith(expect.objectContaining({ revision: 'r1' }), [{ op: 'setPlan', text: 'Local plan' }])
  act(() => { details.open = false })
  inspector({ ...ticket, revision: 'r3', body: { ...ticket.body, plan: 'Saved plan' } }, patch)
  expect(details.open).toBe(false)
})

it('starts populated optional sections open but preserves a user collapse on refresh', () => {
  const populated = { ...ticket, body: { ...ticket.body, plan: 'Plan', summary: 'Summary' } }
  const patch = inspector(populated)
  expect(section('Implementation plan').open).toBe(true)
  expect(section('Summary').open).toBe(true)
  act(() => { section('Summary').open = false })
  inspector({ ...populated, revision: 'r2' }, patch)
  expect(section('Summary').open).toBe(false)
})

it('keeps note drafts mounted through disclosure toggles and new activity', async () => {
  const t = { ...ticket, body: { ...ticket.body, notes: [
    { index: 1, text: 'Older note' }, { index: 2, text: 'Latest note' },
  ] } }
  const patch = inspector(t), note = prose('Notes'), older = section('Older notes')
  expect(section('Notes').open).toBe(true)
  expect(older.open).toBe(false)
  expect(older.textContent).toContain('Older note')
  expect(older.textContent).not.toContain('Latest note')
  input(note, 'Unsubmitted note')
  act(() => { older.open = true; section('Notes').open = false })
  inspector({ ...t, revision: 'r2', body: { ...t.body, notes: [...t.body.notes, { index: 3, text: 'New latest' }] } }, patch)
  act(() => { section('Notes').open = true })
  expect(prose('Notes')).toBe(note)
  expect(note.value).toBe('Unsubmitted note')
  expect(older.open).toBe(true)
  expect(older.textContent).toContain('Latest note')
  expect(patch).not.toHaveBeenCalled()
  await key(note, 'Enter', { ctrlKey: true })
  expect(patch).toHaveBeenCalledWith(expect.objectContaining({ revision: 'r1' }), [{ op: 'appendNote', text: 'Unsubmitted note' }])
  expect(note.value).toBe('')
})

it('wraps the title in a textarea while retaining Enter-to-blur and IME behavior', async () => {
  const patch = inspector(), title = root.querySelector<HTMLTextAreaElement>('#fTitle')!
  expect(title.tagName).toBe('TEXTAREA')
  expect(title.getAttribute('aria-label')).toBe('Title')
  act(() => title.focus())
  input(title, 'Edited title')
  await key(title, 'Enter', { isComposing: true })
  expect(document.activeElement).toBe(title)
  expect(patch).not.toHaveBeenCalled()
  const enter = await key(title, 'Enter')
  expect(enter.defaultPrevented).toBe(true)
  expect(document.activeElement).not.toBe(title)
  expect(patch).toHaveBeenCalledWith(ticket, [{ op: 'setTitle', title: 'Edited title' }])
  const description = prose('Description')
  act(() => description.focus())
  expect((await key(description, 'Enter')).defaultPrevented).toBe(false)
  expect(document.activeElement).toBe(description)
  expect(patch).toHaveBeenCalledTimes(1)
})

it('resizes with the keyboard, clamps width and retains it across refresh', async () => {
  const patch = inspector(), handle = root.querySelector<HTMLElement>('[role=separator]')!
  const panel = root.querySelector<HTMLElement>('#inspector')!
  const width = () => panel.style.getPropertyValue('--inspector-width')
  expect(width()).toBe('400px')
  expect(handle.getAttribute('aria-orientation')).toBe('vertical')
  expect(handle.tabIndex).toBe(0)
  act(() => handle.focus())
  await key(handle, 'ArrowLeft'); expect(width()).toBe('416px')
  await key(handle, 'End'); await key(handle, 'ArrowLeft'); expect(width()).toBe('560px')
  await key(handle, 'Home'); await key(handle, 'ArrowRight'); expect(width()).toBe('320px')
  expect(handle.getAttribute('aria-valuenow')).toBe('320')
  inspector({ ...ticket, revision: 'r2' }, patch)
  expect(width()).toBe('320px')
  expect(document.activeElement).toBe(handle)
  expect(patch).not.toHaveBeenCalled()
})

it('captures pointer resizing without rerendering or changing the focused editor', () => {
  const patch = inspector(), handle = root.querySelector<HTMLElement>('[role=separator]')!
  const panel = root.querySelector<HTMLElement>('#inspector')!, title = root.querySelector<HTMLTextAreaElement>('#fTitle')!
  handle.setPointerCapture = vi.fn()
  handle.hasPointerCapture = vi.fn().mockReturnValue(true)
  handle.releasePointerCapture = vi.fn()
  const pointer = (type: string, x: number, pointerId = 7) => {
    const event = new MouseEvent(type, { clientX: x, button: 0, bubbles: true, cancelable: true })
    Object.defineProperty(event, 'pointerId', { value: pointerId })
    act(() => { handle.dispatchEvent(event) })
  }
  act(() => title.focus()); input(title, 'Draft during resize'); title.setSelectionRange(1, 5)
  const renders = panel.getAttribute('data-render-count')
  pointer('pointerdown', 500)
  expect(handle.setPointerCapture).toHaveBeenCalledWith(7)
  pointer('pointermove', 300, 8)
  expect(panel.style.getPropertyValue('--inspector-width')).toBe('400px')
  pointer('pointermove', 300)
  expect(panel.style.getPropertyValue('--inspector-width')).toBe('560px')
  pointer('pointermove', 900)
  expect(panel.style.getPropertyValue('--inspector-width')).toBe('320px')
  pointer('pointerup', 900)
  expect(handle.releasePointerCapture).toHaveBeenCalledWith(7)
  pointer('pointermove', 300)
  expect(panel.style.getPropertyValue('--inspector-width')).toBe('320px')
  expect(panel.getAttribute('data-render-count')).toBe(renders)
  expect(document.activeElement).toBe(title)
  expect([title.selectionStart, title.selectionEnd]).toEqual([1, 5])
  expect(title.value).toBe('Draft during resize')
  expect(patch).not.toHaveBeenCalled()
})

it('keeps disclosure and width navigation available in read-only mode without allowing writes', async () => {
  const patch = inspector(ticket, vi.fn(), true)
  act(() => { section('Edit status').open = true; section('Summary').open = true })
  for (const control of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select')) {
    expect(control.disabled).toBe(true)
  }
  const summary = prose('Summary')
  input(summary, 'Blocked write'); await key(summary, 'Enter', { ctrlKey: true })
  const handle = root.querySelector<HTMLElement>('[role=separator]')!
  await key(handle, 'End')
  expect(handle.getAttribute('aria-valuenow')).toBe('560')
  expect(patch).not.toHaveBeenCalled()
})
