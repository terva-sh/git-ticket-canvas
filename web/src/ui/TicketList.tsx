import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { Ticket } from '../platform/tickets/types'
import type { TicketFilters } from '../platform/tickets/filters'
import { listGroups } from '../platform/tickets/list'
import './TicketList.css'

export interface TicketListProps {
  tickets: ReadonlyMap<string, Ticket>
  /** The filters in force, the same ones the board dims with and the toolbar
   * counts with. `listGroups` applies them through `matchesTicket`. */
  filters: TicketFilters
  statuses: readonly string[]
  priorities: readonly string[]
  /** The ticket the inspector shows, marked on its row. */
  selected: string | null
  /** The path a tap on a card takes, so a row opens the same inspector, or on
   * a phone the same sheet. */
  onSelect(id: string): void
}

/**
 * The board's tickets as a list, grouped by status in the store's order.
 *
 * Rendered by App as a child of the canvas, over the board, while the view is
 * `list`. It is a child rather than a replacement so that the inspector, the
 * phone's sheet, the composer and the toast, which are all children of the
 * stage, work here unchanged, and so that the board underneath keeps its view
 * for when somebody switches back. The canvas treats a child it does not know
 * as an overlay, so no finger, click or wheel here starts a board gesture.
 *
 * It is a scroll container, and that is what lets a finger scroll it: the
 * stage sets `touch-action: none`, and the browser stops combining ancestors'
 * touch-action at the nearest scroll container, the same rule that lets the
 * inspector body scroll.
 *
 * Every row is a button, and the list is the keyboard's way to a ticket. The
 * board's cards are not focusable and have no reading order, so before the
 * list a ticket could only be opened with a pointer. From page load: Tab to
 * `List` in the header, Enter, Tab into the list, the arrow keys to a row, and
 * Enter. Three things make that a route rather than only possible:
 *
 * - One tab stop. The rows share a roving `tabIndex`: ArrowUp and ArrowDown
 *   move across the status groups, Home and End go to the ends, and Tab
 *   leaves the list for the inspector, which comes after it in the document.
 *   With a stop per row, the inspector was as many Tabs away as there were
 *   rows below the one just opened.
 * - Focus stays in the list. A row removed or moved to another group while it
  has focus keeps it, or hands it to its nearest neighbour.
- Focus comes back. Closing the inspector hides the panel focus was in, and
 *   the next Tab would start from the top of the page. When the selection
 *   clears with focus nowhere, or still inside the inspector, the row takes
 *   it back.
 * - The covered board is out of reach. TicketList.css hides the stage's own
 *   board elements while the list shows, so Tab does not walk through
 *   buttons on cards nobody can see.
 */
export function TicketList(p: TicketListProps) {
  const groups = listGroups(p.tickets.values(), p.filters, p.statuses, p.priorities)
  const order = groups.flatMap(group => group.tickets.map(ticket => ticket.id))
  const container = useRef<HTMLDivElement>(null)
  // The row last focused. Kept here rather than read from the document, so it
  // survives focus leaving the list for the inspector and coming back.
  const [active, setActive] = useState<string | null>(null)
  const stop = active && order.includes(active) ? active
    : p.selected && order.includes(p.selected) ? p.selected : order[0]

  const previous = useRef(p.selected)
  useEffect(() => {
    const was = previous.current
    previous.current = p.selected
    if (!was || p.selected) return
    const focused = document.activeElement
    if (focused && focused !== document.body && !focused.closest('#inspector')) return
    container.current?.querySelector<HTMLElement>('.list-row[tabindex="0"]')?.focus()
  }, [p.selected])

  // An update that removes the focused row, or moves it to another status
  // group, which remounts its button, drops the focus to the body, and a
  // keyboard user is left outside the list with the arrows doing nothing. A
  // live update or another writer's change does that. Whether the list held
  // focus is read here, during the render and so before the DOM changes; after
  // the commit, a list that held it and lost it gives it back: to the same row
  // if it is still shown, otherwise to its nearest neighbour, next below and
  // then above. A filter typed in the search box also removes rows, and there
  // the box has the focus, so nothing moves.
  const shown = useRef(order)
  const held = !!container.current && container.current.contains(document.activeElement)
  useLayoutEffect(() => {
    const before = shown.current
    shown.current = order
    if (!held || !active || container.current?.contains(document.activeElement)) return
    const at = before.indexOf(active)
    const next = order.includes(active) ? active
      : [...before.slice(at + 1), ...before.slice(0, Math.max(0, at)).reverse()].find(id => order.includes(id))
    if (!next) return
    if (next !== active) setActive(next)
    container.current?.querySelector<HTMLElement>(`.list-row[data-id="${CSS.escape(next)}"]`)?.focus()
  })

  const move = (event: KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !container.current) return
    const rows = [...container.current.querySelectorAll<HTMLElement>('.list-row')]
    const at = rows.indexOf(document.activeElement as HTMLElement)
    if (at < 0) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1
      : Math.min(rows.length - 1, Math.max(0, at + (event.key === 'ArrowDown' ? 1 : -1)))
    rows[next].focus()
  }

  return <div id="ticketList" class="ticket-list" ref={container} onKeyDown={move}>
    {groups.map(group => <section key={group.status} class="list-group" data-status={group.status}
      aria-labelledby={`list-${group.status}`} style={{ '--status': `var(--s-${group.status})` }}>
      <h2 id={`list-${group.status}`} class="list-heading">{group.status} <span class="badge">{group.tickets.length}</span></h2>
      <ul class="list-rows">{group.tickets.map(ticket =>
        <li key={ticket.id}><Row ticket={ticket} selected={p.selected === ticket.id} stop={stop === ticket.id}
          onFocus={setActive} onSelect={p.onSelect} /></li>)}</ul>
    </section>)}
  </div>
}

/** A compact card laid out in a line: title, ID, priority, labels and how many
 * criteria are ticked. */
function Row({ ticket: t, selected, stop, onFocus, onSelect }: {
  ticket: Ticket; selected: boolean; stop: boolean; onFocus(id: string): void; onSelect(id: string): void
}) {
  const ac = t.body?.acceptanceCriteria || []
  const done = ac.filter(item => item.checked).length
  const priority = t.priority || 'normal'
  return <button type="button" class="list-row" data-id={t.id} aria-current={selected ? 'true' : undefined}
    tabIndex={stop ? 0 : -1} onFocus={() => onFocus(t.id)} onClick={() => onSelect(t.id)}>
    <span class="list-title">{t.title}</span>
    <span class="list-meta">
      <span class="list-id">{t.short || t.id}</span>
      <span class={`list-priority prio-${priority}`}>{priority}</span>
      {(t.labels || []).map(label => <span key={label} class="pill label">{label}</span>)}
      {!!ac.length && <span class="list-progress">AC {done}/{ac.length}</span>}
    </span>
  </button>
}
