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
 * Every row is a button. That makes the list the keyboard's way to a ticket:
 * Tab reaches the switch in the header, then the rows, and Enter opens one.
 * The board's cards are not focusable, so before the list a ticket could only
 * be opened with a pointer.
 */
export function TicketList(p: TicketListProps) {
  const groups = listGroups(p.tickets.values(), p.filters, p.statuses, p.priorities)
  return <div id="ticketList" class="ticket-list">
    {groups.map(group => <section key={group.status} class="list-group" data-status={group.status}
      aria-labelledby={`list-${group.status}`} style={{ '--status': `var(--s-${group.status})` }}>
      <h2 id={`list-${group.status}`} class="list-heading">{group.status} <span class="badge">{group.tickets.length}</span></h2>
      <ul class="list-rows">{group.tickets.map(ticket =>
        <li key={ticket.id}><Row ticket={ticket} selected={p.selected === ticket.id} onSelect={p.onSelect} /></li>)}</ul>
    </section>)}
  </div>
}

/** A compact card laid out in a line: title, ID, priority, labels and how many
 * criteria are ticked. */
function Row({ ticket: t, selected, onSelect }: { ticket: Ticket; selected: boolean; onSelect(id: string): void }) {
  const ac = t.body?.acceptanceCriteria || []
  const done = ac.filter(item => item.checked).length
  const priority = t.priority || 'normal'
  return <button type="button" class="list-row" data-id={t.id} aria-current={selected ? 'true' : undefined}
    onClick={() => onSelect(t.id)}>
    <span class="list-title">{t.title}</span>
    <span class="list-meta">
      <span class="list-id">{t.short || t.id}</span>
      <span class={`list-priority prio-${priority}`}>{priority}</span>
      {(t.labels || []).map(label => <span key={label} class="pill label">{label}</span>)}
      {!!ac.length && <span class="list-progress">AC {done}/{ac.length}</span>}
    </span>
  </button>
}
