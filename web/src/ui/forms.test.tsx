// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Composer } from './Composer'
import { Toolbar, versionLabel, type ToolbarProps } from './Toolbar'
import { FeedbackMessage } from './Feedback'
import { Inspector } from './Inspector'
import type { Schema, Ticket } from '../platform/tickets/types'

let root: HTMLDivElement
beforeEach(() => { root = document.createElement('div'); document.body.append(root) })
afterEach(() => { act(() => render(null, root)); root.remove(); vi.useRealTimers() })
const schema: Schema = { statuses: ['draft', 'ready'], openStatuses: ['draft', 'ready'], terminalStatuses: ['done'],
  types: ['task', 'epic'], priorities: ['normal', 'high'], blocksOn: ['none', 'children'], labels: ['ui'], milestones: ['MVP'],
  series: ['TKT'], actors: [], actor: { ID: 'agent:test', Name: 'Test' }, transitions: { draft: ['ready'] }, reasonRequired: {} }
const ticket: Ticket = { id: 'TKT-1', short: 'TKT-1', title: 'Original', revision: 'r1', type: 'task', status: 'draft',
  priority: 'normal', labels: ['ui'], assignees: ['agent:test'], dependencies: [], blocksOn: 'none', references: [],
  archived: false, createdAt: '', updatedAt: '', body: { description: 'Original prose', plan: '', summary: '',
    acceptanceCriteria: [{ index: 1, checked: false, text: 'First item' }], definitionOfDone: [], notes: [], comments: [] },
  readiness: { ready: false, blocked: false } }
function element<T extends HTMLElement>(selector: string): T { return root.querySelector(selector)! }
function input(node: HTMLInputElement | HTMLTextAreaElement, value: string) {
  act(() => { node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })) })
}
async function key(node: HTMLElement, name: string, ctrlKey = false) {
  await act(async () => { node.dispatchEvent(new KeyboardEvent('keydown', { key: name, ctrlKey, bubbles: true })) })
}
function inspector(t = ticket, onPatch = vi.fn().mockResolvedValue(undefined), readOnly = false) {
  act(() => render(<Inspector ticket={t} config={schema} tickets={new Map([[t.id, t]])} readOnly={readOnly}
    onPatch={onPatch} onClose={() => {}} onNavigate={() => {}} onDelete={vi.fn()} />, root))
  return onPatch
}
function prose(label: string): HTMLTextAreaElement {
  return [...root.querySelectorAll('.field')].find(field => field.querySelector('label')?.textContent === label)!.querySelector('textarea')!
}
it('preserves a focused prose draft and snapshot revision during refresh', async () => {
  const patch = inspector(), field = prose('Description')
  act(() => field.focus()); input(field, 'Local draft')
  inspector({ ...ticket, revision: 'r2', body: { ...ticket.body, description: 'External prose' } }, patch)
  expect(prose('Description')).toBe(field); expect(document.activeElement).toBe(field)
  expect(field.value).toBe('Local draft'); expect(patch).not.toHaveBeenCalled()
  await act(async () => field.blur())
  expect(patch).toHaveBeenCalledWith(expect.objectContaining({ revision: 'r1' }), [{ op: 'setDescription', text: 'Local draft' }])
})
it('shows the refreshed title after a stale refusal without retrying the draft', async () => {
  let reject!: (error: unknown) => void
  const patch = vi.fn().mockReturnValue(new Promise((_resolve, no) => { reject = no }))
  inspector(ticket, patch); const title = element<HTMLInputElement>('#fTitle')
  act(() => title.focus()); input(title, 'Local title')
  act(() => title.blur())
  inspector({ ...ticket, revision: 'r2', title: 'External title' }, patch)
  await act(async () => reject({ code: 'stale_revision', message: 'Changed on disk' }))
  expect(title.value).toBe('External title')
  expect(patch).toHaveBeenCalledTimes(1)
  expect(patch).toHaveBeenCalledWith(expect.objectContaining({ revision: 'r1' }), [{ op: 'setTitle', title: 'Local title' }])
})
it('keeps a refused prose draft instead of silently clearing it', async () => {
  const patch = vi.fn().mockRejectedValue(new Error('refused'))
  inspector(ticket, patch); const field = prose('Description')
  act(() => field.focus()); input(field, 'Keep this'); await act(async () => field.blur())
  expect(field.value).toBe('Keep this'); expect(patch).toHaveBeenCalledTimes(1)
})
it('does not submit an active draft when the inspector switches tickets', () => {
  const patch = inspector(), field = prose('Description')
  act(() => field.focus()); input(field, 'Unsubmitted')
  inspector({ ...ticket, id: 'TKT-2', revision: 'other' }, patch)
  expect(patch).not.toHaveBeenCalled()
})
it('disables every inspector write control in read-only mode', () => {
  inspector(ticket, vi.fn(), true)
  for (const field of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select')) expect(field.disabled).toBe(true)
  for (const id of ['btnClaim', 'btnArchive', 'btnDelete']) expect(element<HTMLButtonElement>(`#${id}`).disabled).toBe(true)
})
it('keeps a new note after failure and clears it after success', async () => {
  const patch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
  inspector(ticket, patch)
  const field = prose('Notes'); input(field, 'Remember this')
  await key(field, 'Enter', true); expect(field.value).toBe('Remember this')
  await key(field, 'Enter', true); expect(field.value).toBe('')
})
it('retains composer text after refusal and submits its captured board and position', async () => {
  const position = { x: 10, y: 20, sceneX: 30, sceneY: 40, board: 'A', generation: 1 }
  const create = vi.fn().mockRejectedValueOnce(new Error('refused')).mockResolvedValueOnce({}), close = vi.fn()
  act(() => render(<Composer position={position} readOnly={false} onCreate={create} onClose={close} />, root))
  const field = element<HTMLInputElement>('#composerInput')
  expect(document.activeElement).toBe(field); input(field, 'New draft')
  await key(field, 'Enter'); expect(field.value).toBe('New draft'); expect(close).not.toHaveBeenCalled()
  await key(field, 'Enter'); expect(create).toHaveBeenLastCalledWith('New draft', position); expect(close).toHaveBeenCalledTimes(1)
})
it('does not submit the read-only composer', async () => {
  const create = vi.fn()
  act(() => render(<Composer position={{ x: 0, y: 0, sceneX: 0, sceneY: 0, board: 'A', generation: 1 }} readOnly onCreate={create} onClose={() => {}} />, root))
  const field = element<HTMLInputElement>('#composerInput'); input(field, 'blocked'); await key(field, 'Enter')
  expect(field.disabled).toBe(true); expect(create).not.toHaveBeenCalled()
})
it('refreshes toolbar counts without changing search focus or local filters', () => {
  const p: ToolbarProps = { storePath: '/repo', readOnly: false, boards: ['A'], board: 'A', query: 'draft', config: schema,
    filters: new Set(['draft']), counts: '1 of 2', onQuery: vi.fn(), onFilter: vi.fn(), onBoard: vi.fn(),
    onNewBoard: vi.fn(), onArrange: vi.fn(), onFit: vi.fn(), onNew: vi.fn() }
  act(() => render(<Toolbar {...p} />, root)); const search = element<HTMLInputElement>('#search'); act(() => search.focus())
  act(() => render(<Toolbar {...p} counts="2 of 3" readOnly />, root))
  expect(document.activeElement).toBe(search); expect(search.value).toBe('draft')
  expect(element('#counts').textContent).toBe('2 of 3')
  expect(element('#statusFilters button').getAttribute('aria-pressed')).toBe('true')
  for (const id of ['newBoard', 'btnNew', 'btnArrange']) expect(element<HTMLButtonElement>(`#${id}`).disabled).toBe(true)
})
it('labels the server build with CLI semantics and honest fallbacks', () => {
  const p: ToolbarProps = { storePath: '/repo', readOnly: true, boards: ['A'], board: 'A', query: '', config: schema,
    filters: new Set(), counts: '0 of 0', onQuery: vi.fn(), onFilter: vi.fn(), onBoard: vi.fn(),
    onNewBoard: vi.fn(), onArrange: vi.fn(), onFit: vi.fn(), onNew: vi.fn() }
  // In flight: no element at all rather than a blank label.
  act(() => render(<Toolbar {...p} />, root))
  expect(root.querySelector('#version')).toBeNull()
  const released = { schemaVersion: 1, kind: 'version' as const, version: 'v1.2.3', commit: '0123456789abcdef', go: 'go1.25.0', modified: false }
  for (const [info, label, modified] of [
    [released, 'v1.2.3', 'no'],
    [{ ...released, modified: true }, 'v1.2.3+dirty', 'yes'],
    [{ ...released, version: 'devel', commit: 'unknown' }, 'devel', 'no'],
    [null, 'unknown', 'unknown'],
  ] as const) {
    act(() => render(<Toolbar {...p} version={info} />, root))
    expect(versionLabel(info)).toBe(label)
    const summary = element<HTMLElement>('#version > summary')
    expect(summary.textContent).toBe(label)
    const cells = [...root.querySelectorAll('#version dd')].map(dd => dd.textContent)
    expect(cells.slice(0, 4)).toEqual([info?.version ?? 'unknown', info ? info.commit.slice(0, 12) : 'unknown', modified, info?.go ?? 'unknown'])
    // Read-only disables writes, never the disclosure; the body carries no path.
    expect(element<HTMLDetailsElement>('#version').hasAttribute('disabled')).toBe(false)
    expect(element('#version').textContent).not.toContain('/repo')
  }
  expect(element('#version').textContent).toContain('did not answer')
})
it('shows partial-success feedback as an error and expires only the current message', async () => {
  vi.useFakeTimers()
  act(() => render(<FeedbackMessage feedback={{ id: 1, message: 'Ticket filed; placement failed: disk full', error: true }} />, root))
  expect(element('#toast').textContent).toContain('Ticket filed; placement failed')
  expect(element('#toast').className).toContain('err')
  act(() => render(<FeedbackMessage feedback={{ id: 2, message: 'Saved', error: false }} />, root))
  await act(async () => { await vi.advanceTimersByTimeAsync(2600) })
  expect(element('#toast').className).not.toContain('show')
})
