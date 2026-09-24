// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Toolbar, type ToolbarProps } from './Toolbar'

let root: HTMLDivElement
beforeEach(() => { root = document.createElement('div'); document.body.append(root) })
afterEach(() => { act(() => render(null, root)); root.remove(); vi.restoreAllMocks() })

/** Everything on, so the layout is pinned at its fullest rather than at the
 * subset a desk canvas happens to render. */
function everything(): ToolbarProps {
  return {
    storePath: '/home/someone/workspace/ledger/.tickets', readOnly: false,
    boards: ['default', 'planning'], board: 'default', query: '',
    version: { schemaVersion: 1, kind: 'version', version: 'devel', commit: 'abc1234', modified: false, go: 'go1.25' },
    config: { statuses: ['draft', 'ready', 'done'] } as ToolbarProps['config'],
    filters: new Set<string>(), counts: '88 of 88',
    relationships: 'selected', onRelationships: () => {},
    density: 'full', densityAutomatic: 'full', densityChosen: false, onDensity: () => {},
    onQuery: () => {}, onFilter: () => {}, onBoard: () => {}, onNewBoard: () => {},
    onArrange: () => {}, onFit: () => {}, onNew: () => {},
    onNewFrame: () => {}, onUndoFrame: () => {}, onRedoFrame: () => {},
    zoom: 1, onZoomIn: () => {}, onZoomOut: () => {}, onZoomReset: () => {},
    onDisplay: () => {}, view: 'board', onView: () => {},
    labels: ['infrastructure', 'ui'], labelFilters: new Map(), onLabelFilter: () => {}, onClearLabelFilters: () => {},
    account: { name: 'Drew Short', onOpen: () => {} },
    stores: { stores: [], current: 'ledger', recent: [], onOpen: () => {}, onBrowse: () => {} },
  }
}
function show(extra: Partial<ToolbarProps> = {}) {
  act(() => render(<Toolbar {...everything()} {...extra} />, root))
}

function group(row: string, side: 'left' | 'right') {
  const element = root.querySelector<HTMLElement>(`.toolbar-row[data-row="${row}"]`)!
  return side === 'right'
    ? element.querySelector<HTMLElement>('.toolbar-side.right')!
    : element.querySelector<HTMLElement>('.toolbar-side:not(.right)')!
}
/** The identified controls a group lays out, in order. Only the outermost of
 * each: what is inside a popover is that popover's business, not the layout's. */
function ids(row: string, side: 'left' | 'right') {
  const found: string[] = []
  const walk = (node: Element) => {
    for (const child of node.children) {
      if (child.id) found.push(child.id)
      else walk(child)
    }
  }
  walk(group(row, side))
  return found
}

// The layout is two rows because it was laid out that way. One wrapping row let
// the browser decide which control fell off the end, and that answer moved with
// the length of the store path and the number of statuses a store defines.
it('is two rows, each with a left and a right group', () => {
  show()
  const rows = [...root.querySelectorAll('.toolbar-row')]
  expect(rows.map(row => row.getAttribute('data-row'))).toEqual(['context', 'working'])
  for (const row of rows) {
    expect(row.querySelectorAll('.toolbar-side')).toHaveLength(2)
    expect(row.querySelector('.toolbar-side:last-child')!.classList.contains('right')).toBe(true)
  }
})

// Placement follows what a control is about. Without this the next control
// lands wherever it was typed, which is how the single row got the way it was.
it('puts each control in the row and the group its purpose asks for', () => {
  show()
  // What you are looking at, and what it is being shown in.
  expect(ids('context', 'left')).toEqual(['storePath', 'version', 'storePicker', 'boardSelect', 'newBoard'])
  expect(ids('context', 'right')).toEqual(['roBadge', 'btnDisplay', 'btnAccount'])
  // Finding things, and the count of what the finding left. The Board/List
  // switch opens the row, beside the search box.
  expect(ids('working', 'left')).toEqual(['viewSwitch', 'search', 'statusFilters', 'labelFilter', 'counts'])
  // Changing the view, then making something.
  expect(ids('working', 'right')).toEqual(['relationshipMode', 'cardDensity',
    'btnFrame', 'btnFrameUndo', 'btnFrameRedo', 'btnArrange',
    'btnZoomOut', 'btnZoomReset', 'btnZoomIn', 'btnFit', 'btnNew'])
})

// It used to end up alone on a second line at the far left, under the store
// path, because that is where the wrap left it.
it('ends the working row with the primary action', () => {
  show()
  const right = group('working', 'right')
  expect(right.lastElementChild!.id).toBe('btnNew')
  expect(right.lastElementChild!.classList.contains('primary')).toBe(true)
})

// The store picker and the account button only exist on a served canvas, and a
// desk canvas must not be left with an empty group holding the edge.
it('keeps the shape when a desk canvas renders half of it', () => {
  const props: ToolbarProps = {
    storePath: '/ws/one/.tickets', readOnly: false, boards: ['default'], board: 'default', query: '',
    config: null, filters: new Set<string>(), counts: '0 of 0',
    onQuery: () => {}, onFilter: () => {}, onBoard: () => {}, onNewBoard: () => {},
    onArrange: () => {}, onFit: () => {}, onNew: () => {},
  }
  act(() => render(<Toolbar {...props} />, root))
  expect(root.querySelectorAll('.toolbar-row')).toHaveLength(2)
  expect(ids('context', 'right')).toEqual(['roBadge'])
  // Relationships is not optional, so it is here even on the smallest canvas.
  expect(ids('working', 'right')).toEqual(['relationshipMode', 'btnArrange', 'btnFit', 'btnNew'])
})

// The phone header is a separate component. Tablet and desk must not notice it:
// the same markup as a toolbar that was never told a layout.
it('renders the same header on a tablet and a desk as with no layout', () => {
  show()
  const unset = root.innerHTML
  show({ layout: 'desk' })
  expect(root.innerHTML).toBe(unset)
  show({ layout: 'tablet' })
  expect(root.innerHTML).toBe(unset)
  show({ layout: 'phone' })
  expect(root.innerHTML).not.toBe(unset)
})
