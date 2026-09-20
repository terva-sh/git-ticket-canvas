import { autoPlace, LANE_GAP, LANE_W, ROW_PITCH, type PinnedPositions, type PlacementItem, type Point } from './geometry'
import type { Match, Pens } from '../tickets/types'

/** Placement by rule, per docs/board-organization-design-v1.md. This is the
 * one function that decides where a card nobody placed by hand goes, and the
 * CLI's `git ticket canvas explain` reads the same rule the same way in Go, so
 * the two must keep giving one answer: a card with a saved position is pinned
 * and no rule places it; otherwise the first pen in `ruleOrder` whose `match`
 * the ticket satisfies; otherwise the inbox.
 *
 * A ticket satisfies a `match` when it satisfies every field the rule names:
 * it carries all of `labels`, and its status, type and parent are each among
 * the values that field lists. An empty field tests nothing.
 *
 * A board with no pens is handed to `autoPlace` untouched, so a store nobody
 * has organized looks exactly as it did before pens existed.
 *
 * Positions come off the same fixed grid `autoPlace` uses, with no measured
 * heights, for the same reason: a density switch must leave every automatic
 * card where it is, and a card that grows must not push its neighbours. */
/** What the resolver reads of a board's routing. `Routing` from the wire
 * satisfies it; so does a caller holding readonly copies. */
export interface RoutingInput {
  readonly pens: Readonly<Pens>
  readonly ruleOrder: readonly string[]
  readonly inbox: Point
}
/** What routing needs to know about a ticket. An absent type or parent is a
 * ticket that has none: it satisfies a rule that does not test that field and
 * no rule that does, as an empty string does in Go. */
export interface RuleTicket extends PlacementItem {
  readonly labels: readonly string[]
  readonly type?: string
  readonly parent?: string
  readonly priority?: string
}
export type Destination = { readonly kind: 'pen'; readonly id: string } | { readonly kind: 'inbox' }
/** Why one rule did or did not take a ticket. `no-match` rather than
 * `missing-labels`, because a rule can fail on a field holding no labels. */
export type Outcome = 'winner' | 'no-match' | 'later-rule'
export interface Candidate {
  readonly pen: string
  /** Zero-based index in `ruleOrder`. */
  readonly order: number
  /** The pen's whole rule, so a reader comparing it to the ticket needs
   * nothing else from the board. */
  readonly match: Match
  /** The labels of `match.labels` the ticket lacks, in the rule's order.
   * Labels is the one field worth reporting per value: the other three hold
   * one value on a ticket, and `match` already says what each wanted. */
  readonly missingLabels: readonly string[]
  /** The fields the ticket did not satisfy, among labels, status, type and
   * parent, in that order. Empty on a rule the ticket matched. */
  readonly failed: readonly string[]
  readonly outcome: Outcome
}
export interface Explanation {
  readonly id: string
  readonly pinned: boolean
  /** Where the rules send the card. A pinned card still carries one: it is
   * where the card would go if released, which is what somebody asks before
   * releasing it. Nothing places a pinned card by it. */
  readonly destination: Destination
  readonly candidates: readonly Candidate[]
}
export interface PenExtent {
  /** How many automatic cards the pen caught. */
  readonly count: number
  /** The height the pen needs to hold them, never less than its own. */
  readonly height: number
  /** True when that is more than the pen was drawn with. */
  readonly overflow: boolean
}
export interface Resolution {
  /** Positions for every unpinned card. Pinned cards are absent, as in `autoPlace`. */
  readonly positions: ReadonlyMap<string, Point>
  /** One per ticket, on a board with pens; empty when `autoPlace` answered. */
  readonly explanations: ReadonlyMap<string, Explanation>
  /** One per pen, in `ruleOrder`. */
  readonly pens: ReadonlyMap<string, PenExtent>
  /** How many automatic cards the inbox caught. */
  readonly inbox: number
  /** False when the board has no pens and `autoPlace` decided. */
  readonly ruled: boolean
}

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

/** How one rule met one ticket: the labels it lacks and the fields it failed,
 * the same two answers `layout.Match.Failures` gives in Go. Two empty results
 * are a match. */
export function failures(match: Match, ticket: RuleTicket): { missingLabels: string[]; failed: string[] } {
  const have = new Set(ticket.labels)
  // Labels conjoin: the ticket carries all of them or the field fails, and
  // which ones it lacks is the part worth naming.
  const missingLabels = match.labels.filter(label => !have.has(label))
  const failed: string[] = []
  if (missingLabels.length) failed.push('labels')
  // The other three disjoin, because a ticket holds one of each: a rule
  // listing none of them tests nothing and matches every ticket.
  const held: readonly [string, readonly string[], string][] = [
    ['status', match.status, ticket.status],
    ['type', match.type, ticket.type ?? ''],
    ['parent', match.parent, ticket.parent ?? ''],
  ]
  for (const [name, wants, has] of held) if (wants.length && !wants.includes(has)) failed.push(name)
  return { missingLabels, failed }
}

export function explain(routing: RoutingInput, ticket: RuleTicket, pinned: boolean): Explanation {
  const candidates: Candidate[] = []
  let winner: string | null = null
  routing.ruleOrder.forEach((pen, order) => {
    const rule = routing.pens[pen]
    if (!rule) return
    const { missingLabels, failed } = failures(rule.match, ticket)
    const outcome: Outcome = failed.length ? 'no-match' : winner ? 'later-rule' : 'winner'
    if (outcome === 'winner') winner = pen
    candidates.push({ pen, order, match: rule.match, missingLabels, failed, outcome })
  })
  return { id: ticket.id, pinned, destination: winner ? { kind: 'pen', id: winner } : { kind: 'inbox' }, candidates }
}

/** How many card columns a pen's width holds, never fewer than one. */
export function penColumns(width: number): number {
  return Math.max(1, Math.floor((width - LANE_GAP) / (LANE_W + LANE_GAP)))
}

/** The height a pen needs for `count` cards packed row-major. */
export function penHeight(width: number, count: number): number {
  return LANE_GAP + Math.ceil(count / penColumns(width)) * ROW_PITCH
}

export function resolveBoard(
  items: Iterable<RuleTicket>,
  routing: RoutingInput,
  pinned: PinnedPositions,
  statuses: readonly string[],
  priorities: readonly string[] = [],
): Resolution {
  const tickets = [...items]
  if (!routing.ruleOrder.length) {
    return { positions: autoPlace(tickets, pinned, statuses), explanations: new Map(), pens: new Map(), inbox: 0, ruled: false }
  }
  const explanations = new Map<string, Explanation>()
  const caught = new Map<string, RuleTicket[]>(routing.ruleOrder.map(id => [id, []]))
  const unhoused: RuleTicket[] = []
  for (const ticket of tickets) {
    const isPinned = !!pinned[ticket.id]
    const e = explain(routing, ticket, isPinned)
    explanations.set(ticket.id, e)
    if (isPinned) continue
    if (e.destination.kind === 'pen') caught.get(e.destination.id)!.push(ticket)
    else unhoused.push(ticket)
  }
  // Status first, so a pen reads like the lanes did; then the more urgent
  // above the less; then ID. Every key is a fact on the ticket, so filing one
  // inserts where it sorts and moves nothing that sorts before it.
  const rank = (list: readonly string[], value: string | undefined, fallback: number) => {
    const i = value === undefined ? -1 : list.indexOf(value)
    return i < 0 ? fallback : i
  }
  const order = (a: RuleTicket, b: RuleTicket) =>
    rank(statuses, a.status, statuses.length) - rank(statuses, b.status, statuses.length)
    || rank(priorities, b.priority, -1) - rank(priorities, a.priority, -1)
    || compare(a.id, b.id)
  const positions = new Map<string, Point>()
  const pens = new Map<string, PenExtent>()
  for (const id of routing.ruleOrder) {
    const pen = routing.pens[id], cards = caught.get(id)!.sort(order)
    const columns = penColumns(pen.w)
    cards.forEach((ticket, i) => positions.set(ticket.id, {
      x: pen.x + LANE_GAP + (i % columns) * (LANE_W + LANE_GAP),
      y: pen.y + LANE_GAP + Math.floor(i / columns) * ROW_PITCH,
    }))
    const height = Math.max(pen.h, cards.length ? penHeight(pen.w, cards.length) : 0)
    pens.set(id, { count: cards.length, height, overflow: height > pen.h })
  }
  // Inset by the same gap as a pen, so the inbox marker and its title sit
  // above the first card rather than under it.
  unhoused.sort(order).forEach((ticket, i) => positions.set(ticket.id, { x: routing.inbox.x, y: routing.inbox.y + LANE_GAP + i * ROW_PITCH }))
  return { positions, explanations, pens, inbox: unhoused.length, ruled: true }
}
