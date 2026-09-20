import type { Cards, Match, Pen, Point, Routing, Ticket } from '../tickets/types'
import { explain, type RuleTicket } from './resolve'

/** Authoring a board's rules in the browser: draft operations over a Routing
 * record, what makes a draft valid, and what a preview has to say. Nothing
 * here places a card or touches the server: a draft is a value, a preview is
 * a comparison of two values through `explain`, and the write is the caller's.
 * The same rules the CLI enforces, because the file they both write is one file.
 */

export const PEN_COLORS = ['#759bcc', '#b499be', '#89ad97'] as const
export const PEN_ID = /^[a-zA-Z0-9_-]{1,128}$/
export const TICKET_ID = /^[A-Z][A-Z0-9]{1,7}-[0-9A-HJKMNP-TV-Z]{26}$/

export const emptyMatch = (): Match => ({ labels: [], status: [], type: [], parent: [] })

const clonePen = (p: Pen): Pen => ({ ...p, pin: { ...p.pin }, match: {
  labels: [...p.match.labels], status: [...p.match.status], type: [...p.match.type], parent: [...p.match.parent] } })

/** A deep copy, so a draft never shares a record with the accepted board. */
export function cloneRouting(r: Routing): Routing {
  return { pens: Object.fromEntries(Object.entries(r.pens).map(([id, p]) => [id, clonePen(p)])),
    ruleOrder: [...r.ruleOrder], inbox: { ...r.inbox } }
}

export const sameRouting = (a: Routing, b: Routing) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))

/** The record with its fields in one order and its lists deduplicated, so two
 * routings that the server would write identically compare equal here too. */
export function canonical(r: Routing): Routing {
  const pens = Object.fromEntries([...Object.keys(r.pens)].sort().map(id => {
    const p = r.pens[id]
    return [id, { title: p.title, x: p.x, y: p.y, w: p.w, h: p.h, color: p.color, pin: { x: p.pin.x, y: p.pin.y },
      match: { labels: dedupe(p.match.labels), status: dedupe(p.match.status), type: dedupe(p.match.type), parent: dedupe(p.match.parent) } }]
  }))
  return { pens, ruleOrder: [...r.ruleOrder], inbox: { x: r.inbox.x, y: r.inbox.y } }
}

export function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>(), out: string[] = []
  for (const v of values) if (!seen.has(v)) { seen.add(v); out.push(v) }
  return out
}

/** A pen ID from a title: lower-case, runs of anything else collapsed to one
 * dash, and a number appended when the board already has that ID. The CLI
 * takes the ID as the first word; the browser offers this one and lets it
 * be edited before the pen exists, never after. */
export function penIdFor(title: string, taken: Iterable<string>): string {
  const have = new Set(taken)
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'pen'
  if (!have.has(base)) return base
  for (let n = 2; ; n++) if (!have.has(`${base}-${n}`)) return `${base}-${n}`
}

// --- operations ---------------------------------------------------------

export function addPen(r: Routing, id: string, pen: Pen): Routing {
  const next = cloneRouting(r)
  next.pens[id] = clonePen(pen)
  if (!next.ruleOrder.includes(id)) next.ruleOrder.push(id)
  return next
}

export function updatePen(r: Routing, id: string, pen: Pen): Routing {
  const next = cloneRouting(r)
  next.pens[id] = clonePen(pen)
  return next
}

export function removePen(r: Routing, id: string): Routing {
  const next = cloneRouting(r)
  delete next.pens[id]
  next.ruleOrder = next.ruleOrder.filter(other => other !== id)
  return next
}

/** Move one rule earlier (negative) or later (positive) by `by` places,
 * clamped to the ends. Order is the tie-break and nothing else. */
export function moveRule(r: Routing, id: string, by: number): Routing {
  const next = cloneRouting(r)
  const from = next.ruleOrder.indexOf(id)
  if (from < 0) return next
  const to = Math.max(0, Math.min(next.ruleOrder.length - 1, from + by))
  next.ruleOrder.splice(from, 1)
  next.ruleOrder.splice(to, 0, id)
  return next
}

export function setInbox(r: Routing, inbox: Point): Routing {
  const next = cloneRouting(r)
  next.inbox = { ...inbox }
  return next
}

// --- validity -----------------------------------------------------------

export interface Problem { pen?: string; field: string; message: string }

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const clean = (v: string) => v.trim() !== '' && !/[\p{Cc}]/u.test(v)

/** Everything the server would refuse, said before the write so the panel
 * can say it beside the field. The same rules as validateRouting and
 * validateMatch in git-ticket's layout package. */
export function problems(r: Routing): Problem[] {
  const out: Problem[] = []
  for (const [id, p] of Object.entries(r.pens)) {
    if (!PEN_ID.test(id)) out.push({ pen: id, field: 'id', message: 'A pen ID is 1 to 128 letters, digits, dashes or underscores.' })
    if (!clean(p.title) || [...p.title].length > 80) out.push({ pen: id, field: 'title', message: 'A title is 1 to 80 characters.' })
    if (![p.x, p.y, p.w, p.h].every(finite) || Math.round(p.w * 100) <= 0 || Math.round(p.h * 100) <= 0) {
      out.push({ pen: id, field: 'region', message: 'A region needs a position and a positive width and height.' })
    }
    if (!(PEN_COLORS as readonly string[]).includes(p.color)) out.push({ pen: id, field: 'color', message: 'Choose one of the three pen colours.' })
    if (!finite(p.pin.x) || !finite(p.pin.y)) out.push({ pen: id, field: 'pin', message: 'A pin is a position.' })
    if (matchEmpty(p.match)) {
      out.push({ pen: id, field: 'match', message: 'Add at least one rule field: labels, status, type or parent. Unmatched automatic cards go to Inbox.' })
    }
    for (const [name, values] of Object.entries(p.match) as [keyof Match, string[]][]) {
      if (values.some(v => !clean(v))) out.push({ pen: id, field: name, message: `A ${name} value cannot be blank.` })
    }
    if (p.match.parent.some(v => clean(v) && !TICKET_ID.test(v))) out.push({ pen: id, field: 'parent', message: 'A parent is a ticket ID.' })
    if (!r.ruleOrder.includes(id)) out.push({ pen: id, field: 'order', message: 'Every pen has a place in the rule order.' })
  }
  if (r.ruleOrder.some(id => !r.pens[id]) || new Set(r.ruleOrder).size !== r.ruleOrder.length) {
    out.push({ field: 'order', message: 'The rule order names every pen exactly once.' })
  }
  if (!finite(r.inbox.x) || !finite(r.inbox.y)) out.push({ field: 'inbox', message: 'The inbox is a position.' })
  return out
}

export const matchEmpty = (m: Match) => !m.labels.length && !m.status.length && !m.type.length && !m.parent.length

// --- preview ------------------------------------------------------------

export type Where = string | 'inbox'

export interface Move { id: string; from: Where; to: Where }
export interface Preview {
  /** Automatic cards whose destination changes. */
  moves: Move[]
  /** Pinned cards that stay put but would land somewhere else if released. */
  pinnedWouldMove: Move[]
  /** Per pen of the draft, how many automatic cards it catches before and after. */
  counts: Record<string, { before: number; after: number }>
  inbox: { before: number; after: number }
}

const destination = (r: Routing, t: RuleTicket, pinned: boolean): Where => {
  const e = explain(r, t, pinned)
  return e.destination.kind === 'pen' ? e.destination.id : 'inbox'
}

/** What changes if `after` replaces `before`, card by card. Only automatic
 * cards count toward a pen; a pinned card is reported apart, because it does
 * not move and somebody reading the preview should not think it will. */
export function preview(before: Routing, after: Routing, tickets: Iterable<Ticket>, cards: Cards): Preview {
  const moves: Move[] = [], pinnedWouldMove: Move[] = []
  const counts: Preview['counts'] = Object.fromEntries(after.ruleOrder.map(id => [id, { before: 0, after: 0 }]))
  const inbox = { before: 0, after: 0 }
  const tally = (where: Where, side: 'before' | 'after') => {
    if (where === 'inbox') inbox[side]++
    else if (counts[where]) counts[where][side]++
  }
  for (const t of tickets) {
    const pinned = !!cards[t.id]
    const from = destination(before, t, pinned), to = destination(after, t, pinned)
    if (pinned) { if (from !== to) pinnedWouldMove.push({ id: t.id, from, to }); continue }
    tally(from, 'before'); tally(to, 'after')
    if (from !== to) moves.push({ id: t.id, from, to })
  }
  return { moves, pinnedWouldMove, counts, inbox }
}

export interface Overlap { pen: string; takenBy: string; ids: string[] }

/** For each pen, the automatic cards it matches that an earlier rule took:
 * the overlaps rule order is deciding. Somebody moving a rule earlier wants
 * to know exactly which cards that decides. */
export function overlaps(r: Routing, tickets: Iterable<Ticket>, cards: Cards): Overlap[] {
  const found = new Map<string, Overlap>()
  for (const t of tickets) {
    if (cards[t.id]) continue
    const e = explain(r, t, false)
    const winner = e.destination.kind === 'pen' ? e.destination.id : null
    if (!winner) continue
    for (const c of e.candidates) {
      if (c.outcome !== 'later-rule') continue
      const key = `${c.pen}>${winner}`
      const o = found.get(key) ?? { pen: c.pen, takenBy: winner, ids: [] }
      o.ids.push(t.id)
      found.set(key, o)
    }
  }
  return [...found.values()]
}
