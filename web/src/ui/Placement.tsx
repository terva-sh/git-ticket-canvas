import type { Candidate, Explanation, RuleTicket } from '../platform/canvas/resolve'
import type { Match, Pens, Point, Ticket } from '../platform/tickets/types'

/** Why a card is where it is, in the inspector, in the words `git ticket
 * canvas explain` prints. The two share a resolver, so the lines here are
 * derived from the same Explanation the pen layer placed the card by, and the
 * one gesture that changes routing without authoring a rule sits beside them:
 * returning a pinned card to automatic placement. */
export interface PlacementProps {
  ticket: Ticket
  /** The saved position, when somebody placed the card. */
  pinned: Point | null
  explanation: Explanation
  pens: Readonly<Pens>
  inbox: Point
  readOnly: boolean
  /** A frame save in flight: the board is about to change under the card. */
  pending?: boolean
  /** The phone layout, which reads a board's layout and writes none of it. */
  layoutReadOnly?: boolean
  onRelease: (id: string) => void
}

/** What a phone shows where a layout control would be. The Layout setting is
 * the way in from the same screen, so nothing is out of reach, only moved. */
export const ARRANGED_ELSEWHERE = 'Arranged on the tablet or desk layout. Display can switch this screen to one.'

function pointText(p: Point): string { return `(${p.x}, ${p.y})` }

/** A pen's whole rule in words: the fields it tests, in the order the
 * resolver tests them, as `ruleText` prints it in the CLI. */
export function ruleText(m: Match): string {
  const parts: string[] = []
  if (m.labels.length) parts.push(`labels ${m.labels.join(', ')}`)
  for (const [name, values] of [['status', m.status], ['type', m.type], ['parent', m.parent]] as const) {
    if (values.length) parts.push(`${name} ${values.join(' or ')}`)
  }
  return parts.join('; ')
}

/** Why a rule passed one ticket over, field by field, as `failureText` prints
 * it in the CLI: what the ticket has beside what the rule wanted. */
export function failureText(c: Candidate, t: RuleTicket): string {
  const parts: string[] = []
  for (const field of c.failed) {
    if (field === 'labels') parts.push(`missing labels ${c.missingLabels.join(', ')}`)
    else if (field === 'status') parts.push(`status is ${t.status}, rule wants ${c.match.status.join(' or ')}`)
    else if (field === 'type') parts.push(`type is ${t.type || 'none'}, rule wants ${c.match.type.join(' or ')}`)
    else if (field === 'parent') parts.push(`parent is ${t.parent || 'none'}, rule wants ${c.match.parent.join(' or ')}`)
  }
  return parts.join('; ')
}

export interface PlacementLines {
  /** The one-line verdict: pinned, or automatic and by what. */
  placement: string
  /** Where the rules send it, or would if it were released; absent on a board with no pens. */
  destination?: string
  /** One per rule that did not take it, in rule order. */
  passedOver: string[]
}

/** The same three answers `writeCanvasExplain` gives, so a person reading the
 * panel and a person reading the terminal can compare notes word for word. */
export function placementLines(e: Explanation, t: RuleTicket, pinned: Point | null, pens: Readonly<Pens>, inbox: Point): PlacementLines {
  const placement = pinned ? `pinned at ${pointText(pinned)}; routing does not apply`
    : e.candidates.length === 0 ? 'automatic: the board has no pens, so the canvas places it in status lanes'
    : 'automatic: the canvas places it by the rules below'
  if (e.candidates.length === 0) return { placement, passedOver: [] }
  const destination = e.destination.kind === 'inbox'
    ? `goes to the inbox ${pointText(inbox)}: no rule matched`
    : `goes to pen ${e.destination.id} (${pens[e.destination.id]?.title ?? ''}): ${ruleText(e.candidates.find(c => c.outcome === 'winner')!.match)}`
  const passedOver = e.candidates.filter(c => c.outcome !== 'winner').map(c => c.outcome === 'no-match'
    ? `not ${c.pen} (rule ${c.order + 1}): ${failureText(c, t)}`
    : `not ${c.pen} (rule ${c.order + 1}): matches, but an earlier rule took it`)
  return { placement, destination, passedOver }
}

export function PlacementSection(p: PlacementProps) {
  const lines = placementLines(p.explanation, p.ticket, p.pinned, p.pens, p.inbox)
  const locked = p.readOnly || !!p.pending
  return <section class="placement" aria-label="Placement">
    <h3>Placement</h3>
    <p class="placement-verdict">{lines.placement}</p>
    {lines.destination && <ul class="placement-routing">
      <li class="placement-destination">{lines.destination}</li>
      {lines.passedOver.map(line => <li key={line}>{line}</li>)}
    </ul>}
    {p.readOnly && <p class="placement-help">Read-only. Placement cannot be changed.</p>}
    {p.layoutReadOnly && !p.readOnly && <p class="placement-help">{ARRANGED_ELSEWHERE}</p>}
    {!p.layoutReadOnly && <div class="placement-actions">
      <button type="button" data-return-automatic disabled={locked || !p.pinned} onClick={() => p.onRelease(p.ticket.id)}>Return to automatic</button>
    </div>}
  </section>
}
