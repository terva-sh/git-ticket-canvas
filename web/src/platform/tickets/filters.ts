import type { Ticket } from './types'

/** A label is unselected, required, or forbidden. The map holds only the
 * labels in a state, so an untouched store carries no entries at all. */
export type LabelState = 'include' | 'exclude'
export type LabelFilters = ReadonlyMap<string, LabelState>

export interface TicketFilters {
  /** Empty means every status, matching how the status chips already read. */
  statuses: ReadonlySet<string>
  labels: LabelFilters
  query: string
}

/** unselected to include to exclude and back. */
export function cycleLabel(filters: LabelFilters, label: string): LabelFilters {
  const next = new Map(filters)
  const state = filters.get(label)
  if (state === undefined) next.set(label, 'include')
  else if (state === 'include') next.set(label, 'exclude')
  else next.delete(label)
  return next
}

/** Every label the user can filter by: the ones `config.yml` lists and the ones
 * tickets carry. A store that does not enforce labels configures none, so
 * configuration alone would leave nothing to filter. A configured label that no
 * ticket uses still appears, which is what keeps the control steady as tickets
 * come and go. Labels are exact strings, so `UI` and `ui` are two of them. */
export function labelUniverse(configured: readonly string[] | undefined,
  tickets: Iterable<Pick<Ticket, 'labels'>>): string[] {
  const all = new Set(configured || [])
  for (const ticket of tickets) for (const label of ticket.labels) all.add(label)
  return [...all].sort()
}

/** Excludes win over includes, and includes intersect. */
export function matchesLabels(labels: readonly string[] = [], filters: LabelFilters): boolean {
  if (!filters.size) return true
  const carried = new Set(labels)
  for (const [label, state] of filters) {
    if (state === 'exclude' && carried.has(label)) return false
    if (state === 'include' && !carried.has(label)) return false
  }
  return true
}

/** The one predicate behind the rendered cards and the toolbar's count.
 * Status, labels, and the search box combine as an AND. */
export function matchesTicket(ticket: Ticket, filters: TicketFilters): boolean {
  if (filters.statuses.size && !filters.statuses.has(ticket.status)) return false
  if (!matchesLabels(ticket.labels, filters.labels)) return false
  const query = filters.query.trim().toLowerCase()
  // Tolerates a partial ticket, as the canvas predicate this replaced did.
  return !query || [ticket.id, ticket.title, ticket.type, ticket.status, ticket.priority, ticket.milestone,
    ...(ticket.labels || []), ...(ticket.assignees || []), ticket.body?.description]
    .filter(Boolean).join(' ').toLowerCase().includes(query)
}
