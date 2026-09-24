import { useEffect, useRef, useState } from 'preact/hooks'
import type { Density } from '../platform/canvas/geometry'
import type { RelationshipMode } from './canvas/Edges'
import { StorePicker } from './StorePicker'
import { LabelFilter, SelectionMode, StatusFilters, Version, ViewSwitch, type ToolbarProps } from './Toolbar'
import './PhoneToolbar.css'

type Sheet = 'store' | 'filters' | 'menu'

/**
 * The header on a phone: one row, and three sheets that hold everything the
 * desk shows in its two rows.
 *
 * The desk header wraps its two rows into six or more on a 390px screen and
 * takes over half of it. What stays in the row is what somebody needs to find
 * a ticket and to see that they cannot write: the store and board, the search,
 * the Board/List switch, the filters as one button, the read-only badge, and a
 * menu. The rest moves
 * into the sheet its button opens:
 *
 *   store    brand, store path, build version, store picker, board select
 *   filters  status and label filters, and the count they leave
 *   menu     relationships, card density, Fit, Display, account, New board
 *
 * Frames, Undo frame, Redo frame, Arrange, Pens and the zoom buttons are not
 * offered. Each of them edits the board's layout or stands in for a gesture a
 * phone already has (pinch zooms), and a layout written by a thumb on a
 * 390px screen is one somebody then has to find and undo.
 *
 * The controls keep the ids they have on a desk, so a test, the `/` shortcut
 * and anything else that finds `#search` or `#boardSelect` finds it here too.
 * Only one of the two headers is ever rendered, so no id is doubled.
 *
 * New ticket is not in the row. It is a button fixed at the bottom right,
 * where a thumb reaches it; see `#btnNew.phone-new` in the stylesheet for how
 * it stays off the ticket sheet's own controls.
 */
export function PhoneToolbar(p: ToolbarProps) {
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const header = useRef<HTMLDivElement>(null)
  const toggle = (which: Sheet) => setSheet(current => current === which ? null : which)
  const close = () => setSheet(null)

  // A sheet closes when a finger lands anywhere outside the header, or on
  // Escape. Captured on the document so a touch that starts a pan on the board
  // closes the sheet on the way past rather than being swallowed by it.
  useEffect(() => {
    if (!sheet) return
    const outside = (event: Event) => {
      if (!header.current?.contains(event.target as Node)) setSheet(null)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSheet(null) }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape)
    }
  }, [sheet])

  // Statuses and labels, not the search: the search is in the row beside the
  // button and needs no badge to say it is in force.
  const active = p.filters.size + (p.labelFilters?.size || 0)
  // The button shows the board and names the store only to a screen reader
  // and in its tooltip. A store's name is usually a repository's, long enough
  // to leave `g…` on a phone at the larger toolbar size, and the board is the
  // one of the two that changes while somebody works. The sheet shows both.
  const shown = p.stores?.stores.find(store => store.name === p.stores?.current)
  const place = shown ? `${shown.display} · ${p.board}` : p.board
  const button = (which: Sheet, id: string, controls: string) => ({
    id, type: 'button' as const, class: 'tool', 'aria-expanded': sheet === which, 'aria-controls': controls,
    onClick: () => toggle(which),
  })

  return <><div id="toolbar" class="phone-toolbar" ref={header}>
    <div class="toolbar-row" data-row="phone">
      <button {...button('store', 'phoneStore', 'phoneStoreSheet')} class="tool phone-store"
        title={`Store and board: ${place}`} aria-label={`Store and board: ${place}`}>
        <span class="phone-store-name">{p.board}</span><span aria-hidden="true">{' ▾'}</span>
      </button>
      {/* The row has no room for a fourth control, so selection mode takes the
          search box's place while it lasts. The query stays in force. */}
      {p.selecting ? <SelectionMode selecting={p.selecting} />
        : <input id="search" class="tool" type="search" placeholder="Search" autoComplete="off"
          value={p.query} onInput={e => p.onQuery(e.currentTarget.value)} />}
      <ViewSwitch {...p} compact />
      {/* Stays in the row: somebody who cannot write needs to see that
          before they try, not after opening a sheet. */}
      <span class="badge warn" id="roBadge" hidden={!p.readOnly}>read-only</span>
      <button {...button('filters', 'phoneFilter', 'phoneFilterSheet')}
        aria-label={active ? `Filters, ${active} active` : 'Filters'}>
        Filter{active ? <span class="phone-count" id="phoneFilterCount">{active}</span> : null}
      </button>
      <button {...button('menu', 'phoneMenu', 'phoneMenuSheet')} aria-label="Menu">{'☰'}</button>
    </div>

    {sheet === 'store' && <div class="phone-sheet" id="phoneStoreSheet" role="dialog" aria-label="Store and board">
      <div class="brand">git-ticket <span id="storePath">{p.storePath}</span></div>
      <Version version={p.version} />
      {p.stores && <StorePicker {...p.stores}
        onOpen={name => { close(); p.stores?.onOpen(name) }}
        onBrowse={() => { close(); p.stores?.onBrowse() }} />}
      <label class="phone-field">Board <select id="boardSelect" class="tool" value={p.board}
        onChange={e => { close(); p.onBoard(e.currentTarget.value) }}>
        {[...new Set([...p.boards, p.board])].map(board => <option key={board} value={board}>{board}</option>)}
      </select></label>
    </div>}

    {sheet === 'filters' && <div class="phone-sheet" id="phoneFilterSheet" role="dialog" aria-label="Filters">
      <StatusFilters {...p} />
      <LabelFilter {...p} />
      <span class="badge" id="counts">{p.counts}</span>
    </div>}

    {sheet === 'menu' && <div class="phone-sheet" id="phoneMenuSheet" role="dialog" aria-label="Menu">
      <label class="phone-field">Relationships <select id="relationshipMode" class="tool" value={p.relationships || 'selected'}
        onChange={event => p.onRelationships?.(event.currentTarget.value as RelationshipMode)}>
        <option value="all">All</option><option value="selected">Selected</option><option value="none">None</option>
      </select></label>
      {p.onDensity && <label class="phone-field">Cards <select id="cardDensity" class="tool"
        value={p.densityChosen ? p.density || 'full' : ''}
        onChange={event => p.onDensity?.((event.currentTarget.value || null) as Density | null)}>
        <option value="">Automatic{p.densityAutomatic ? ` — ${p.densityAutomatic === 'compact' ? 'Compact' : 'Full'}` : ''}</option>
        <option value="full">Full</option><option value="compact">Compact</option>
      </select></label>}
      {/* The design does not place Fit. It stays, here rather than in the
          row: a pinch cannot find a card that is off the screen. */}
      <button id="btnFit" type="button" class="tool" onClick={() => { close(); p.onFit() }}>Fit all cards</button>
      {p.onDisplay && <button id="btnDisplay" type="button" class="tool"
        onClick={() => { close(); p.onDisplay?.() }}>Display</button>}
      {p.account && <button id="btnAccount" type="button" class="tool"
        onClick={() => { close(); p.account?.onOpen() }}>{p.account.name}</button>}
      <button id="newBoard" type="button" class="tool" disabled={p.readOnly}
        onClick={() => { close(); p.onNewBoard() }}>New board</button>
    </div>}
  </div>
  {/* Outside #toolbar on purpose. The header is a stacking context so its
      sheets sit over the board, and anything inside it would sit over the
      ticket sheet as well. Out here the button stacks under that sheet. */}
  <button id="btnNew" type="button" class="tool primary phone-new" title="New ticket"
    disabled={p.readOnly} onClick={p.onNew}>+ New ticket</button>
  </>
}
