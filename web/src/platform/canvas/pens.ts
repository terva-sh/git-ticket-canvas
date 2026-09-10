import { normalizeRouting } from '../tickets/layout'
import type { Cards, Routing } from '../tickets/types'

// A tagged destination keeps a pen whose ID is "inbox" distinct from Inbox.
export type Destination = { readonly kind: 'pen'; readonly penId: string } | { readonly kind: 'inbox' }
export interface RuleTicket { readonly id: string; readonly labels: readonly string[] }
export type CandidateOutcome = 'winner' | 'missing-labels' | 'lower-specificity' | 'later-rule'
export interface Candidate {
  readonly penId: string
  /** Zero-based index in authored ruleOrder, not object iteration order. */
  readonly order: number
  readonly specificity: number
  readonly matchedLabels: readonly string[]
  readonly missingLabels: readonly string[]
  readonly outcome: CandidateOutcome
}
export interface TicketRouting {
  readonly id: string
  readonly manual: boolean
  /** Manual cards have no automatic assignment but retain an explanation. */
  readonly destination: Destination | null
  readonly potentialDestination: Destination
  readonly winnerReason: 'inbox' | 'only-match' | 'specificity' | 'rule-order'
  readonly candidates: readonly Candidate[]
}
export type OverlapRelation = 'equal' | 'earlier-subset' | 'later-subset' | 'intersecting' | 'disjoint'
export interface RuleOverlap {
  readonly earlier: string
  readonly later: string
  readonly relation: OverlapRelation
  readonly equalSpecificity: boolean
  /** These positive requirements can always coexist, even if disjoint. */
  readonly requiredLabels: readonly string[]
  readonly automaticMatches: number
  readonly manualMatches: number
  /** Both rules tie at the maximum matching specificity. Another rule may be
   * earlier too; per-ticket candidates explain the actual winner in that case.
   */
  readonly topSpecificityTies: number
  readonly outrankedMatches: number
  readonly specificityResolvedMatches: number
}
export interface PenEvaluation {
  readonly tickets: ReadonlyMap<string, TicketRouting>
  readonly counts: { readonly pens: ReadonlyMap<string, number>; readonly inbox: number }
  readonly overlaps: readonly RuleOverlap[]
}
interface Rule { penId: string; order: number; labels: string[] }

function evaluateTicket(rules: Rule[], ticket: RuleTicket, manual: boolean): TicketRouting {
  const labels = new Set(ticket.labels)
  const matches = rules.map(rule => ({ penId: rule.penId, order: rule.order, specificity: rule.labels.length,
    matchedLabels: rule.labels.filter(label => labels.has(label)), missingLabels: rule.labels.filter(label => !labels.has(label)) }))
  let winner: typeof matches[number] | undefined, matchingCount = 0, ties = 0
  for (const candidate of matches) {
    if (candidate.missingLabels.length) continue
    matchingCount++
    if (!winner || candidate.specificity > winner.specificity) { winner = candidate; ties = 1 }
    else if (candidate.specificity === winner.specificity) ties++
  }
  const potentialDestination: Destination = winner ? { kind: 'pen', penId: winner.penId } : { kind: 'inbox' }
  const candidates: Candidate[] = matches.map(candidate => ({ ...candidate,
    outcome: candidate.missingLabels.length ? 'missing-labels' : candidate === winner ? 'winner'
      : candidate.specificity < winner!.specificity ? 'lower-specificity' : 'later-rule' }))
  return { id: ticket.id, manual, destination: manual ? null : potentialDestination, potentialDestination, candidates,
    winnerReason: !winner ? 'inbox' : ties > 1 ? 'rule-order' : matchingCount > 1 ? 'specificity' : 'only-match' }
}

function overlaps(rules: Rule[], tickets: ReadonlyMap<string, TicketRouting>): RuleOverlap[] {
  const result: RuleOverlap[] = []
  const winnerSpecificities = new Map([...tickets].map(([id, ticket]) =>
    [id, ticket.candidates.find(candidate => candidate.outcome === 'winner')?.specificity ?? 0]))
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i], b = rules[j], left = new Set(a.labels), right = new Set(b.labels)
      const aSubset = a.labels.every(label => right.has(label)), bSubset = b.labels.every(label => left.has(label))
      const relation: OverlapRelation = aSubset && bSubset ? 'equal' : aSubset ? 'earlier-subset'
        : bSubset ? 'later-subset' : a.labels.some(label => right.has(label)) ? 'intersecting' : 'disjoint'
      const equalSpecificity = left.size === right.size
      let automaticMatches = 0, manualMatches = 0, topSpecificityTies = 0, outrankedMatches = 0, specificityResolvedMatches = 0
      for (const ticket of tickets.values()) {
        // Candidate order is the same explicit order as rules.
        if (ticket.candidates[i].missingLabels.length || ticket.candidates[j].missingLabels.length) continue
        if (ticket.manual) { manualMatches++; continue }
        automaticMatches++
        if (winnerSpecificities.get(ticket.id)! > Math.max(left.size, right.size)) outrankedMatches++
        else if (equalSpecificity) topSpecificityTies++
        else specificityResolvedMatches++
      }
      result.push({ earlier: a.penId, later: b.penId, relation, equalSpecificity,
        requiredLabels: [...new Set([...a.labels, ...b.labels])], automaticMatches, manualMatches,
        topSpecificityTies, outrankedMatches, specificityResolvedMatches })
    }
  }
  return result
}

/** Evaluate one complete board input. Pass all tickets, not the filtered view.
 * Geometry and frame membership never determine assignments. Counts include all
 * automatic winners, regardless of eventual interior/overflow placement.
 *
 * This function has no cache, DOM, I/O, or invocation side effects. Callers will
 * supply accepted or proposed inputs at publication time in the placement slice;
 * rendering must never call it. Only explicit manual card records exclude counts.
 */
export function evaluatePens(routing: Routing, allTickets: Iterable<RuleTicket>, cards: Readonly<Cards>): PenEvaluation {
  const normalized = normalizeRouting({ pens: routing.pens, ruleOrder: routing.ruleOrder, inbox: routing.inbox })
  const rules = normalized.ruleOrder.map((penId, order) => ({ penId, order, labels: normalized.pens[penId].requiredLabels }))
  const tickets = new Map<string, TicketRouting>(), pens = new Map(rules.map(rule => [rule.penId, 0]))
  let inbox = 0
  for (const ticket of allTickets) {
    if (tickets.has(ticket.id)) throw new Error(`Duplicate ticket identity ${ticket.id}`)
    const evaluation = evaluateTicket(rules, ticket, Object.hasOwn(cards, ticket.id))
    tickets.set(ticket.id, evaluation)
    if (evaluation.destination?.kind === 'pen') pens.set(evaluation.destination.penId, pens.get(evaluation.destination.penId)! + 1)
    else if (evaluation.destination?.kind === 'inbox') inbox++
  }
  return { tickets, counts: { pens, inbox }, overlaps: overlaps(rules, tickets) }
}
