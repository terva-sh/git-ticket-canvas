import type { Ticket } from './types'

/** A label is unselected, required, or forbidden. The map holds only the
 * labels in a state, so an untouched store carries no entries at all. */
export type LabelState = 'include' | 'exclude'
export type LabelFilters = ReadonlyMap<string, LabelState>

/** How the required labels combine. Measured across this store, neither answer
 * is right on its own: at three required labels an intersection empties 13 of
 * the 20 commonest combinations, while a union of the same three matches more
 * than half the tickets. They are useful at different widths, so the board
 * offers both rather than picking. `all` is the default because it is what the
 * board has always done, and a selection should not change meaning under an
 * upgrade. */
export type LabelMatch = 'all' | 'any'

export interface TicketFilters {
  /** Empty means every status, matching how the status chips already read. */
  statuses: ReadonlySet<string>
  labels: LabelFilters
  /** Absent reads as `all`, so a caller that predates the toggle is unchanged. */
  labelMatch?: LabelMatch
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

/** Excludes win over includes, and `match` says how the includes combine.
 *
 * Excluding stays an AND under both modes. A forbidden label removing a ticket
 * is not a claim about how the required ones combine, and a board set to `any`
 * that started showing tickets carrying a label the user had struck out would
 * be answering a question nobody asked.
 *
 * The case worth naming is `any` with no required labels at all. There is
 * nothing for the mode to change there, and asking whether any of an empty set
 * is present answers no, which would empty the board on a filter that only ever
 * excluded. Counting the requirements separately is what keeps that honest. */
export function matchesLabels(labels: readonly string[] = [], filters: LabelFilters,
  match: LabelMatch = 'all'): boolean {
  if (!filters.size) return true
  const carried = new Set(labels)
  let required = 0, met = 0
  for (const [label, state] of filters) {
    if (state === 'exclude') {
      if (carried.has(label)) return false
      continue
    }
    required++
    if (carried.has(label)) met++
  }
  if (!required) return true
  return match === 'any' ? met > 0 : met === required
}

/** The one predicate behind the rendered cards and the toolbar's count.
 * Status, labels, and the search box combine as an AND. */
export function matchesTicket(ticket: Ticket, filters: TicketFilters): boolean {
  if (filters.statuses.size && !filters.statuses.has(ticket.status)) return false
  if (!matchesLabels(ticket.labels, filters.labels, filters.labelMatch)) return false
  const query = filters.query.trim().toLowerCase()
  // Tolerates a partial ticket, as the canvas predicate this replaced did.
  return !query || [ticket.id, ticket.title, ticket.type, ticket.status, ticket.priority, ticket.milestone,
    ...(ticket.labels || []), ...(ticket.assignees || []), ticket.body?.description]
    .filter(Boolean).join(' ').toLowerCase().includes(query)
}

/** One clause the board could drop, and how many tickets that would bring back.
 * `kind` names the clause rather than describing the edit, so the caller owns
 * what "clear" means for its own state. */
export interface Relaxation {
  kind: 'labelMatch' | 'labels' | 'statuses' | 'query'
  label: string
  count: number
}

/** English for a list, because `a, b and c` is what the sentence needs and
 * `join(', ')` is not it. The conjunction carries the mode: requiring every
 * label reads `a, b and c`, requiring one of them reads `a, b or c`, and
 * getting that backwards would state the opposite of what the board did. */
function list(items: readonly string[], conjunction: 'and' | 'or'): string {
  if (items.length < 2) return items[0] || ''
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`
}

/** Why the board is empty, and the single changes that would end it.
 *
 * `0 of 80` is a true answer to the question the filters asked, and an
 * unhelpful one: it cannot say which clause emptied the board, so a filter
 * working exactly as specified is indistinguishable from one that does not mean
 * what the user thought. That ambiguity is what produced the report behind
 * TKT-01M2P0BQT4, where the count was right the whole time.
 *
 * Each candidate drops exactly one clause and counts what comes back from the
 * tickets actually loaded, so an offer is measured rather than predicted and
 * cannot promise a board it will not deliver. Offers that would still leave
 * nothing are dropped, which is why a board can be empty with no offers at all:
 * that is the case where the filters are not the interesting part and the store
 * genuinely holds nothing to show.
 *
 * Returns nothing when the board is not empty, and nothing for an empty store,
 * which is not a filtering outcome and has no relaxation to offer. */
export function emptyBoardHelp(tickets: Iterable<Ticket>, filters: TicketFilters):
  { reason: string; offers: Relaxation[] } | undefined {
  const all = [...tickets]
  if (!all.length) return undefined
  const surviving = (applied: TicketFilters) => all.filter(ticket => matchesTicket(ticket, applied)).length
  if (surviving(filters) > 0) return undefined

  const required = [...filters.labels].filter(([, state]) => state === 'include').map(([label]) => label)
  const candidates: Relaxation[] = []
  // Offered first because it is the smallest change: it keeps every label the
  // user picked and only reinterprets how they join.
  if (filters.labelMatch !== 'any' && required.length > 1) {
    candidates.push({ kind: 'labelMatch', label: 'Match any label instead',
      count: surviving({ ...filters, labelMatch: 'any' }) })
  }
  if (filters.labels.size) {
    candidates.push({ kind: 'labels', label: 'Clear label filters', count: surviving({ ...filters, labels: new Map() }) })
  }
  if (filters.statuses.size) {
    candidates.push({ kind: 'statuses', label: 'Clear status filters', count: surviving({ ...filters, statuses: new Set() }) })
  }
  if (filters.query.trim()) {
    candidates.push({ kind: 'query', label: 'Clear the search', count: surviving({ ...filters, query: '' }) })
  }

  // Naming the labels is only honest when they are the whole reason. With a
  // status or a search also in force, any one of them could be doing the work,
  // and the offers below say which far better than a guessed sentence would.
  const others = filters.statuses.size > 0 || filters.query.trim().length > 0
  const reason = required.length && !others
    ? filters.labelMatch === 'any'
      ? `No ticket carries ${list(required, 'or')}.`
      : `No ticket carries ${required.length > 1 ? `all ${required.length} of ` : ''}${list(required, 'and')}.`
    : 'No ticket matches every filter in force.'

  // Deliberately not sorted by what each would bring back. Ranking by count
  // puts the most destructive offer first whenever it returns the most tickets,
  // so `Clear label filters` would lead and `Match any label instead` would
  // trail it, which is backwards: one discards the selection the user built and
  // the other keeps every label and only rejoins them. Candidate order is
  // smallest-change-first, and each button shows its own count, so the
  // comparison stays available without the order making it for them.
  return { reason, offers: candidates.filter(offer => offer.count > 0) }
}
