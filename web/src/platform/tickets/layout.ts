import type { Board, Match, NormalizedBoard, Pen, Point, Routing } from './types'

/** The layout schema this client writes, and the one a pen's `match` belongs
 * to. A schema 3 response spells the same rule `requiredLabels`. */
export const SCHEMA = 4

/** Fresh per board. Never share a mutable default Inbox across generations. */
export function emptyRouting(): Routing {
  return { pens: {}, ruleOrder: [], inbox: { x: 0, y: 0 } }
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${name} record`)
  return value as Record<string, unknown>
}
function fields(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (required.some(key => !Object.hasOwn(value, key) || value[key] == null)
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) {
    throw new Error('Missing, null, or unknown layout field')
  }
}
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e9
// Go strings.TrimSpace uses Unicode White_Space. JS trim also removes U+FEFF,
// which the backend permits as an exact authored label, so do not use trim here.
const text = (s: unknown): s is string => typeof s === 'string' && !/^\p{White_Space}*$/u.test(s) && !/[\p{Cc}\p{Cs}]/u.test(s)
function point(value: unknown): Point {
  const p = record(value, 'point'); fields(p, ['x', 'y'])
  if (!finite(p.x) || !finite(p.y)) throw new Error('Invalid point coordinates')
  return { x: p.x, y: p.y }
}

/** One field of a rule: a list of exact values, deduplicated as the backend
 * deduplicates it, and absent means the rule does not test that field. */
function values(rule: Record<string, unknown>, name: string): string[] {
  if (!Object.hasOwn(rule, name)) return []
  const list = rule[name]
  if (!Array.isArray(list) || !list.every(text)) throw new Error(`Invalid pen match ${name}`)
  return [...new Set<string>(list as string[])]
}

/** A pen's rule, in the spelling its schema allows. Schema 4 writes `match`
 * and schema 3 wrote `requiredLabels`, which is `match.labels` and always
 * was, so a legacy response routes exactly as it did. A pen carrying both
 * spellings, or neither, is two readings of one rule or none at all, and the
 * backend refuses each; so does this, per git-ticket layout/pens.go. */
const TICKET_ID = /^[A-Z][A-Z0-9]{1,7}-[0-9A-HJKMNP-TV-Z]{26}$/

function match(pen: Record<string, unknown>, schema: number): Match {
  const wide = Object.hasOwn(pen, 'match'), legacy = Object.hasOwn(pen, 'requiredLabels')
  if (wide === legacy) throw new Error('A pen carries exactly one of match and requiredLabels')
  if (wide && schema < 4) throw new Error('A pen match requires layout schema 4')
  if (legacy && schema >= 4) throw new Error('requiredLabels is the schema 3 spelling of match')
  const rule = legacy
    ? { labels: values(pen, 'requiredLabels'), status: [], type: [], parent: [] }
    : (() => {
      const m = record(pen.match, 'match')
      fields(m, [], ['labels', 'status', 'type', 'parent'])
      const parent = values(m, 'parent')
      // A parent is a ticket ID, the grammar of git-ticket plan 5.6: a series
      // of two to eight uppercase letters and digits, a hyphen, and 26
      // characters of Crockford base32. The backend refuses anything else,
      // and a response that carried one would route by a rule no ticket can
      // satisfy, so this refuses it too rather than accepting it silently.
      if (!parent.every(id => TICKET_ID.test(id))) throw new Error('Pen match parent values must be ticket IDs')
      return { labels: values(m, 'labels'), status: values(m, 'status'), type: values(m, 'type'), parent }
    })()
  if (!rule.labels.length && !rule.status.length && !rule.type.length && !rule.parent.length) {
    throw new Error('Pen rules require a nonempty rule: labels, status, type or parent')
  }
  return rule
}

/** Validate complete authored routing and copy it without rounding coordinates or
 * rewriting exact label identities. Also used for whole-routing CAS preimages.
 */
export function normalizeRouting(value: unknown, schema: number = SCHEMA): Routing {
  const r = record(value, 'routing'); fields(r, ['pens', 'ruleOrder', 'inbox'])
  const pens = record(r.pens, 'pens'), entries: [string, Pen][] = []
  for (const [id, value] of Object.entries(pens)) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid pen ID')
    const p = record(value, 'pen')
    fields(p, ['title', 'x', 'y', 'w', 'h', 'color', 'pin'], ['match', 'requiredLabels'])
    if (!text(p.title) || [...p.title].length > 80) throw new Error('Invalid pen title')
    if (!finite(p.x) || !finite(p.y) || !finite(p.w) || !finite(p.h)
      || Math.round(p.w * 100) <= 0 || Math.round(p.h * 100) <= 0) throw new Error('Invalid pen geometry')
    if (typeof p.color !== 'string' || !['#759bcc', '#b499be', '#89ad97'].includes(p.color)) throw new Error('Invalid pen color')
    entries.push([id, { title: p.title, x: p.x, y: p.y, w: p.w, h: p.h, color: p.color,
      pin: point(p.pin), match: match(p, schema) }])
  }
  if (!Array.isArray(r.ruleOrder) || r.ruleOrder.length !== entries.length
    || new Set(r.ruleOrder).size !== entries.length
    || !r.ruleOrder.every(id => typeof id === 'string' && Object.hasOwn(pens, id))) {
    throw new Error('ruleOrder must contain every pen exactly once')
  }
  return { pens: Object.fromEntries(entries), ruleOrder: [...r.ruleOrder], inbox: point(r.inbox) }
}

/** Normalize all layout-bearing responses before any part is published. The
 * server owns disk migration; accepting a legacy response never requests a write.
 */
export function normalizeLayout(value: Board, board: string): NormalizedBoard {
  const b = record(value, 'board')
  fields(b, ['schema', 'board', 'cards'], ['frames', 'pens', 'ruleOrder', 'inbox'])
  if (b.board !== board) throw new Error('Server returned another board')
  if (![1, 2, 3, SCHEMA].includes(b.schema as number)) throw new Error('Unsupported layout schema')
  record(b.cards, 'cards')
  if (b.frames !== undefined) record(b.frames, 'frames')
  if ((b.schema as number) < 3 && ['pens', 'ruleOrder', 'inbox'].some(key => Object.hasOwn(b, key))) {
    throw new Error('Routing requires layout schema 3')
  }
  const routing = (b.schema as number) >= 3
    ? normalizeRouting({ pens: b.pens, ruleOrder: b.ruleOrder, inbox: b.inbox }, b.schema as number) : emptyRouting()
  return { ...value, frames: value.frames ?? {}, ...routing }
}
