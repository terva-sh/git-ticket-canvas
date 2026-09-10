// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FrameMembership, FramePanel } from './FramesPanel'
import type { FrameMembershipProps, FramePanelProps } from './FramesPanel'
import type { Frame, Ticket } from '../platform/tickets/types'

const frame: Frame = { title: 'Delivery', x: 40, y: 90, w: 620, h: 420, color: '#759bcc', members: ['TKT-1', 'TKT-2', 'missing'] }
const ticket: Ticket = {
  id: 'TKT-1', short: 'TKT-1', title: 'Visible member', revision: 'r1', type: 'task', status: 'ready',
  priority: 'normal', labels: [], assignees: [], dependencies: [], blocksOn: 'none', references: [], archived: false,
  createdAt: '', updatedAt: '', body: { description: '', plan: '', summary: '', acceptanceCriteria: [], definitionOfDone: [], notes: [], comments: [] },
  readiness: { ready: true, blocked: false },
}
const tickets = new Map([[ticket.id, ticket], ['TKT-2', { ...ticket, id: 'TKT-2', title: 'Filtered member' }]])
let root: HTMLDivElement
beforeEach(() => { root = document.createElement('div'); document.body.append(root) })
afterEach(() => { act(() => render(null, root)); root.remove(); vi.restoreAllMocks() })
function panel(overrides: Partial<FramePanelProps> = {}) {
  const props: FramePanelProps = { frame, creating: false, tickets, matching: new Set(['TKT-1']), readOnly: false,
    pending: false, onClose: vi.fn(), onCapture: vi.fn(() => []), onSave: vi.fn().mockResolvedValue(undefined), ...overrides }
  act(() => render(<FramePanel {...props} />, root))
  return props
}
function membership(overrides: Partial<FrameMembershipProps> = {}) {
  const props: FrameMembershipProps = { ticketId: 'TKT-1', frames: { delivery: frame, research: { ...frame, title: 'Research', members: [] } },
    readOnly: false, pending: false, onChange: vi.fn().mockResolvedValue(undefined), onSelectFrame: vi.fn(), ...overrides }
  act(() => render(<FrameMembership {...props} />, root))
  return props
}
function field(label: string): HTMLInputElement | HTMLSelectElement {
  const node = [...root.querySelectorAll('label')].find(node => node.firstChild?.textContent === label)
  return node!.querySelector('input,select')!
}
function input(label: string, value: string) {
  act(() => { const node = field(label); node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })) })
}
function button(label: string) { return [...root.querySelectorAll('button')].find(node => node.textContent === label)! }
async function click(label: string) { await act(async () => button(label).click()) }
async function escape(node: HTMLElement = root.querySelector('form')!) {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  await act(async () => { node.dispatchEvent(event) })
  return event
}

it('labels geometry and appearance controls and lists filtered and missing members', () => {
  panel()
  expect(root.querySelector('#framePanel.open')).not.toBeNull()
  for (const label of ['X', 'Y', 'Width', 'Height']) expect(field(label).type).toBe('number')
  expect(field('Frame title').value).toBe('Delivery')
  expect([...field('Color').querySelectorAll('option')].map(node => node.value)).toEqual(['#759bcc', '#b499be', '#89ad97'])
  expect(root.textContent).toContain('3 members · 1 filtered · 1 missing')
  expect(root.textContent).toContain('Filtered member TKT-2 · Filtered out')
  expect(root.textContent).toContain('missing · Missing ticket')
  expect(root.textContent).toContain('members outside the boundary')
})

it('recomputes creation capture from numeric bounds and captures again on save', async () => {
  const onCapture = vi.fn((bounds: Frame) => bounds.w > 700 ? ['TKT-1', 'TKT-2'] : ['TKT-1'])
  const p = panel({ creating: true, onCapture })
  expect(root.textContent).toContain('Will capture 1 card')
  input('Width', '800')
  expect(root.textContent).toContain('Will capture 2 cards · 1 filtered')
  expect(onCapture).toHaveBeenLastCalledWith(expect.objectContaining({ w: 800 }))
  await click('Create and capture')
  expect(p.onSave).toHaveBeenCalledWith('create', { ...frame, w: 800, members: ['TKT-1', 'TKT-2'] }, frame)
  expect(frame.members).toEqual(['TKT-1', 'TKT-2', 'missing'])
})

it.each([
  ['Move frame and members', 'move', { x: -10, y: 120 }],
  ['Resize boundary only', 'resize', { w: 800, h: 500 }],
  ['Save title and color', 'appearance', { title: 'Local title', color: '#89ad97' }],
  ['Delete frame only', 'delete', {}],
] as const)('keeps %s separate from other uncommitted fields', async (label, kind, changes) => {
  const p = panel()
  input('X', '-10'); input('Y', '120'); input('Width', '800'); input('Height', '500')
  input('Frame title', 'Local title'); input('Color', '#89ad97')
  await click(label)
  expect(p.onSave).toHaveBeenCalledExactlyOnceWith(kind, { ...frame, ...changes }, frame)
  expect(p.onCapture).not.toHaveBeenCalled()
  if (kind === 'move') expect(field('Frame title').value).toBe('Local title')
})

it('preserves focused text, selection and its baseline across accepted frame updates', async () => {
  const p = panel()
  const title = field('Frame title') as HTMLInputElement
  act(() => title.focus())
  input('Frame title', 'Local title')
  title.setSelectionRange(2, 7)
  const updated = { ...frame, title: 'External title', x: 75, members: ['TKT-1'] }
  panel({ ...p, frame: updated, tickets: new Map(tickets) })
  expect(field('Frame title')).toBe(title)
  expect(document.activeElement).toBe(title)
  expect([title.selectionStart, title.selectionEnd]).toEqual([2, 7])
  expect(title.value).toBe('Local title')
  expect(field('X').value).toBe('75')
  expect(root.textContent).toContain('1 member · 0 filtered')
  await click('Save title and color')
  expect(p.onSave).toHaveBeenCalledWith('appearance', { ...frame, title: 'Local title' }, frame)
})

it('does not replace a focused pristine field until it blurs', () => {
  const p = panel(), title = field('Frame title')
  act(() => title.focus())
  panel({ ...p, frame: { ...frame, title: 'External title' } })
  expect(title.value).toBe('Delivery')
  act(() => title.blur())
  expect(title.value).toBe('External title')
  expect(p.onSave).not.toHaveBeenCalled()
})

it('retains unfocused dirty drafts and resets them to authoritative values on Escape', async () => {
  const p = panel(), ancestor = vi.fn()
  root.addEventListener('keydown', ancestor)
  input('X', '200')
  panel({ ...p, frame: { ...frame, x: 70 } })
  expect(field('X').value).toBe('200')
  expect((await escape()).defaultPrevented).toBe(true)
  expect(ancestor).not.toHaveBeenCalled()
  expect(field('X').value).toBe('70')
  expect(p.onSave).not.toHaveBeenCalled()
  expect(p.onClose).not.toHaveBeenCalled()
  expect(root.textContent).toContain('Saved operations are unchanged.')
  await escape()
  expect(p.onClose).toHaveBeenCalledOnce()
})

it('keeps failure explanations and drafts visible through rerenders and a retry', async () => {
  const onSave = vi.fn().mockRejectedValueOnce(new Error('Frame changed on server')).mockResolvedValue(undefined)
  const p = panel({ onSave })
  input('X', '123')
  await click('Move frame and members')
  panel({ ...p, frame: { ...frame, x: 99 } })
  expect(root.querySelector('[role="alert"]')?.textContent).toBe('Frame changed on server')
  expect(field('X').value).toBe('123')
  await click('Move frame and members')
  expect(onSave).toHaveBeenLastCalledWith('move', { ...frame, x: 123 }, frame)
  expect(root.querySelector('[role="alert"]')).toBeNull()
})

it('locks writes during a save and never claims Escape cancels that save', async () => {
  let resolve!: () => void
  const p = panel({ onSave: vi.fn(() => new Promise<void>(done => { resolve = done })) })
  input('X', '200')
  await click('Move frame and members')
  expect(field('X').disabled).toBe(true)
  expect(button('Resize boundary only').disabled).toBe(true)
  await click('Move frame and members')
  await escape()
  expect(p.onSave).toHaveBeenCalledOnce()
  expect(p.onClose).not.toHaveBeenCalled()
  expect(root.textContent).toContain('The save is still running.')
  await click('Close')
  expect(p.onClose).toHaveBeenCalledOnce()
  await act(async () => resolve())
  expect(field('X').value).toBe('200')
  expect(root.textContent).toContain('Frame saved.')
})

it.each([{ readOnly: true }, { pending: true }])('blocks external locked writes with %j', async lock => {
  const p = panel(lock)
  for (const node of root.querySelectorAll('input,select')) expect((node as HTMLInputElement).disabled).toBe(true)
  for (const label of ['Move frame and members', 'Resize boundary only', 'Save title and color', 'Delete frame only']) {
    expect(button(label).disabled).toBe(true)
    await click(label)
  }
  expect(p.onSave).not.toHaveBeenCalled()
  await click('Close')
  expect(p.onClose).toHaveBeenCalledOnce()
})

it('keeps Enter in a text field from implicitly saving a frame', async () => {
  const p = panel()
  input('Frame title', 'Keyboard draft')
  const event = new Event('submit', { bubbles: true, cancelable: true })
  await act(async () => { root.querySelector('form')!.dispatchEvent(event) })
  expect(event.defaultPrevented).toBe(true)
  expect(p.onSave).not.toHaveBeenCalled()
  await click('Save title and color')
  expect(p.onSave).toHaveBeenCalledWith('appearance', { ...frame, title: 'Keyboard draft' }, frame)
})

it('ignores delayed completion after a keyed panel selection changes', async () => {
  let reject!: (error: Error) => void
  const props = panel({ onSave: vi.fn(() => new Promise((_resolve, fail) => { reject = fail })) })
  await click('Move frame and members')
  act(() => render(<FramePanel key="other-frame" {...props} frame={{ ...frame, title: 'Other frame' }} />, root))
  await act(async () => reject(new Error('Old operation failed')))
  expect(root.querySelector('[role="alert"]')).toBeNull()
  expect(field('Frame title').value).toBe('Other frame')
  expect(button('Move frame and members').disabled).toBe(false)
})

it('rejects empty or nonpositive geometry without blocking unrelated appearance edits', async () => {
  const p = panel()
  input('Width', '0')
  await click('Resize boundary only')
  expect(p.onSave).not.toHaveBeenCalled()
  expect(root.querySelector('[role="alert"]')?.textContent).toContain('greater than zero')
  input('X', '')
  await click('Move frame and members')
  expect(p.onSave).not.toHaveBeenCalled()
  input('Frame title', 'Renamed')
  await click('Save title and color')
  expect(p.onSave).toHaveBeenCalledWith('appearance', { ...frame, title: 'Renamed' }, frame)
})

it('shows explicit membership outside the boundary and offers selection, transfer and removal', async () => {
  const p = membership()
  expect(root.textContent).toContain('Member of Delivery')
  expect(root.textContent).toContain('Membership applies even outside the boundary.')
  await click('Delivery')
  expect(p.onSelectFrame).toHaveBeenCalledExactlyOnceWith('delivery')
  expect(field('Target frame').value).toBe('research')
  await click('Move to another frame')
  expect(p.onChange).toHaveBeenLastCalledWith('research')
  await click('Remove from frame')
  expect(p.onChange).toHaveBeenLastCalledWith(null)
  expect(frame.x).toBe(40)
})

it('adds an unassigned ticket only on explicit action and disables an empty target list', async () => {
  const p = membership({ ticketId: 'unassigned' })
  expect(p.onChange).not.toHaveBeenCalled()
  expect(button('Remove from frame').disabled).toBe(true)
  await click('Add to frame')
  expect(p.onChange).toHaveBeenCalledExactlyOnceWith('delivery')
  membership({ ...p, frames: {} })
  expect(button('Add to frame').disabled).toBe(true)
  expect(field('Target frame').disabled).toBe(true)
})

it('keeps membership target and failure visible through a metadata refresh', async () => {
  const p = membership({ ticketId: 'unassigned', onChange: vi.fn().mockRejectedValue(new Error('Membership conflict')) })
  act(() => { field('Target frame').value = 'research'; field('Target frame').dispatchEvent(new Event('change', { bubbles: true })) })
  await click('Add to frame')
  membership({ ...p, frames: { ...p.frames, delivery: { ...frame, title: 'New delivery' } } })
  expect(field('Target frame').value).toBe('research')
  expect(root.querySelector('[role="alert"]')?.textContent).toBe('Membership conflict')
  expect(p.onChange).toHaveBeenCalledExactlyOnceWith('research')
})

it('locks membership writes immediately and restores the target after a failed save', async () => {
  let reject!: (error: Error) => void
  const p = membership({ onChange: vi.fn(() => new Promise((_resolve, fail) => { reject = fail })) })
  await click('Move to another frame')
  expect(field('Target frame').disabled).toBe(true)
  expect(button('Remove from frame').disabled).toBe(true)
  await click('Move to another frame')
  expect(p.onChange).toHaveBeenCalledOnce()
  await act(async () => reject(new Error('Save unavailable')))
  expect(field('Target frame').disabled).toBe(false)
  expect(field('Target frame').value).toBe('research')
  expect(root.querySelector('[role="alert"]')?.textContent).toBe('Save unavailable')
})

it.each([{ readOnly: true }, { pending: true }])('locks membership writes but allows navigation with %j', async lock => {
  const p = membership(lock)
  expect(button('Move to another frame').disabled).toBe(true)
  expect(button('Remove from frame').disabled).toBe(true)
  await click('Move to another frame'); await click('Remove from frame'); await click('Delivery')
  expect(p.onChange).not.toHaveBeenCalled()
  expect(p.onSelectFrame).toHaveBeenCalledWith('delivery')
})
