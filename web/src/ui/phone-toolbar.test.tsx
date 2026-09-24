// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Toolbar, type ToolbarProps } from './Toolbar'

let root: HTMLDivElement
beforeEach(() => { root = document.createElement('div'); document.body.append(root) })
afterEach(() => { act(() => render(null, root)); root.remove(); vi.restoreAllMocks() })

/** Every control the desk can show, so what the phone leaves out is left out
 * on purpose rather than because nobody passed it. */
function props(extra: Partial<ToolbarProps> = {}): ToolbarProps {
  return {
    layout: 'phone',
    storePath: '/home/someone/workspace/ledger/.tickets', readOnly: false,
    boards: ['default', 'planning'], board: 'default', query: '',
    version: { schemaVersion: 1, kind: 'version', version: 'devel', commit: 'abc1234', modified: false, go: 'go1.25' },
    config: { statuses: ['draft', 'ready', 'done'] } as ToolbarProps['config'],
    filters: new Set<string>(), counts: '88 of 88',
    relationships: 'selected', onRelationships: vi.fn(),
    density: 'full', densityAutomatic: 'compact', densityChosen: false, onDensity: vi.fn(),
    onQuery: vi.fn(), onFilter: vi.fn(), onBoard: vi.fn(), onNewBoard: vi.fn(),
    onArrange: vi.fn(), onFit: vi.fn(), onNew: vi.fn(),
    onNewFrame: vi.fn(), onUndoFrame: vi.fn(), onRedoFrame: vi.fn(), onPens: vi.fn(),
    zoom: 1, onZoomIn: vi.fn(), onZoomOut: vi.fn(), onZoomReset: vi.fn(),
    onDisplay: vi.fn(),
    labels: ['infrastructure', 'ui'], labelFilters: new Map(), onLabelFilter: vi.fn(), onClearLabelFilters: vi.fn(),
    account: { name: 'Drew Short', onOpen: vi.fn() },
    stores: { stores: [
      { name: 'ledger', display: 'ledger', path: '/ws/ledger', available: true, active: true, favorite: false, readOnly: false },
      { name: 'other', display: 'other', path: '/ws/other', available: true, active: false, favorite: false, readOnly: false },
    ], current: 'ledger', recent: [], onOpen: vi.fn(), onBrowse: vi.fn() },
    ...extra,
  }
}
function show(p: ToolbarProps) { act(() => render(<Toolbar {...p} />, root)) }
const $ = (selector: string) => root.querySelector<HTMLElement>(selector)
function tap(selector: string) {
  const element = $(selector)
  if (!element) throw new Error(`no ${selector}`)
  act(() => element.click())
}
/** The identified controls in the row, in order. */
function row() {
  return [...root.querySelectorAll('#toolbar > .toolbar-row > [id]')].map(element => element.id)
}

it('keeps one row of store, search, read-only, filter and menu', () => {
  show(props())
  expect(root.querySelectorAll('.toolbar-row')).toHaveLength(1)
  expect(row()).toEqual(['phoneStore', 'search', 'roBadge', 'phoneFilter', 'phoneMenu'])
  expect($('#roBadge')!.hidden).toBe(true)
  expect($('#phoneStore')!.textContent).toContain('default')
  expect($('#phoneStore')!.getAttribute('aria-label')).toBe('Store and board: ledger · default')
})

it('does not offer frames, arrange, pens or zoom', () => {
  show(props())
  for (const id of ['btnFrame', 'btnFrameUndo', 'btnFrameRedo', 'btnArrange', 'btnPens',
    'btnZoomIn', 'btnZoomOut', 'btnZoomReset']) expect($(`#${id}`), id).toBeNull()
})

it('puts New ticket outside the header, and disables it when read-only', () => {
  const p = props()
  show(p)
  const button = $('#btnNew') as HTMLButtonElement
  expect(button.closest('#toolbar')).toBeNull()
  expect(button.classList.contains('phone-new')).toBe(true)
  tap('#btnNew')
  expect(p.onNew).toHaveBeenCalledOnce()
  show(props({ readOnly: true }))
  expect(($('#btnNew') as HTMLButtonElement).disabled).toBe(true)
  expect($('#roBadge')!.hidden).toBe(false)
})

it('opens one sheet at a time, and the same button closes it', () => {
  show(props())
  expect($('.phone-sheet')).toBeNull()
  tap('#phoneStore')
  expect($('#phoneStoreSheet')).not.toBeNull()
  expect($('#phoneStore')!.getAttribute('aria-expanded')).toBe('true')
  tap('#phoneFilter')
  expect($('#phoneStoreSheet')).toBeNull()
  expect($('#phoneFilterSheet')).not.toBeNull()
  tap('#phoneFilter')
  expect($('.phone-sheet')).toBeNull()
})

it('closes a sheet on Escape and on a touch outside the header', () => {
  show(props())
  tap('#phoneMenu')
  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
  expect($('.phone-sheet')).toBeNull()
  tap('#phoneMenu')
  act(() => { $('#phoneMenuSheet')!.dispatchEvent(new Event('pointerdown', { bubbles: true })) })
  expect($('#phoneMenuSheet')).not.toBeNull()
  act(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })) })
  expect($('.phone-sheet')).toBeNull()
})

it('holds the brand, path, version, store picker and board in the store sheet', () => {
  const p = props()
  show(p)
  tap('#phoneStore')
  const sheet = $('#phoneStoreSheet')!
  expect(sheet.querySelector('.brand')!.textContent).toContain('/home/someone/workspace/ledger/.tickets')
  expect(sheet.querySelector('#version')).not.toBeNull()
  expect(sheet.querySelector('#storePicker')).not.toBeNull()
  const select = sheet.querySelector<HTMLSelectElement>('#boardSelect')!
  select.value = 'planning'
  act(() => { select.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(p.onBoard).toHaveBeenCalledWith('planning')
  expect($('.phone-sheet')).toBeNull()
})

it('holds the status and label filters and the count, and badges the button with how many are on', () => {
  show(props())
  expect($('#phoneFilter')!.getAttribute('aria-label')).toBe('Filters')
  expect($('#phoneFilterCount')).toBeNull()
  tap('#phoneFilter')
  const sheet = $('#phoneFilterSheet')!
  expect(sheet.querySelectorAll('#statusFilters .chip')).toHaveLength(3)
  expect(sheet.querySelector('#labelFilter')).not.toBeNull()
  expect(sheet.querySelector('#counts')!.textContent).toBe('88 of 88')

  show(props({ filters: new Set(['ready']), labelFilters: new Map([['ui', 'exclude']]) }))
  expect($('#phoneFilterCount')!.textContent).toBe('2')
  expect($('#phoneFilter')!.getAttribute('aria-label')).toBe('Filters, 2 active')
})

it('holds relationships, density, Fit, Display, account and New board in the menu', () => {
  const p = props()
  show(p)
  tap('#phoneMenu')
  const ids = [...$('#phoneMenuSheet')!.querySelectorAll('[id]')].map(element => element.id)
  expect(ids).toEqual(['relationshipMode', 'cardDensity', 'btnFit', 'btnDisplay', 'btnAccount', 'newBoard'])
  expect($('#cardDensity option')!.textContent).toBe('Automatic — Compact')
  tap('#btnDisplay')
  expect(p.onDisplay).toHaveBeenCalledOnce()
  expect($('.phone-sheet')).toBeNull()
  tap('#phoneMenu')
  tap('#btnAccount')
  expect(p.account!.onOpen).toHaveBeenCalledOnce()
  tap('#phoneMenu')
  tap('#newBoard')
  expect(p.onNewBoard).toHaveBeenCalledOnce()
  tap('#phoneMenu')
  tap('#btnFit')
  expect(p.onFit).toHaveBeenCalledOnce()

  show(props({ readOnly: true }))
  tap('#phoneMenu')
  expect(($('#newBoard') as HTMLButtonElement).disabled).toBe(true)
})
