import { matchesTicket, type TicketFilters } from './filters'
import type { Ticket } from './types'

/** One status and the tickets in it that the filters let through. */
export interface ListGroup {
  status: string
  tickets: Ticket[]
}

/**
 * What the list view shows: the tickets the filters let through, grouped by
 * status in the store's status order.
 *
 * Filtering goes through `matchesTicket`, the predicate the board dims cards
 * with and the toolbar counts with. A list that filtered for itself could
 * disagree with the count beside it, and the list is exactly where somebody
 * would notice.
 *
 * Inside a group the order is a pen's: more urgent first, then by ID. Every key
 * is a fact on the ticket, so a ticket filed or changed elsewhere lands where
 * it sorts and moves nothing that sorts before it, which is what keeps a live
 * update from shuffling the row somebody was about to press.
 *
 * A status the configuration does not name still has tickets somebody may
 * need, so its group follows the configured ones, in the order first met,
 * rather than dropping them. A group with nothing in it is left out.
 */
export function listGroups(tickets: Iterable<Ticket>, filters: TicketFilters,
  statuses: readonly string[], priorities: readonly string[] = []): ListGroup[] {
  const byStatus = new Map<string, Ticket[]>(statuses.map(status => [status, []]))
  for (const ticket of tickets) {
    if (!matchesTicket(ticket, filters)) continue
    let group = byStatus.get(ticket.status)
    if (!group) { group = []; byStatus.set(ticket.status, group) }
    group.push(ticket)
  }
  // The same ranking resolve.ts sorts a pen with: a priority the store does
  // not list ranks below every one it does.
  const urgency = (ticket: Ticket) => priorities.indexOf(ticket.priority)
  const order = (a: Ticket, b: Ticket) => urgency(b) - urgency(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  return [...byStatus].filter(([, group]) => group.length)
    .map(([status, group]) => ({ status, tickets: group.sort(order) }))
}
