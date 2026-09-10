import type { Board, NormalizedBoard, Pen, Point, Routing } from './types'

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

/** Validate complete authored routing and copy it without rounding coordinates or
 * rewriting exact label identities. Also used for whole-routing CAS preimages.
 */
export function normalizeRouting(value: unknown): Routing {
  const r = record(value, 'routing'); fields(r, ['pens', 'ruleOrder', 'inbox'])
  const pens = record(r.pens, 'pens'), entries: [string, Pen][] = []
  for (const [id, value] of Object.entries(pens)) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid pen ID')
    const p = record(value, 'pen')
    fields(p, ['title', 'x', 'y', 'w', 'h', 'color', 'pin', 'requiredLabels'])
    if (!text(p.title) || [...p.title].length > 80) throw new Error('Invalid pen title')
    if (!finite(p.x) || !finite(p.y) || !finite(p.w) || !finite(p.h)
      || Math.round(p.w * 100) <= 0 || Math.round(p.h * 100) <= 0) throw new Error('Invalid pen geometry')
    if (typeof p.color !== 'string' || !['#759bcc', '#b499be', '#89ad97'].includes(p.color)) throw new Error('Invalid pen color')
    if (!Array.isArray(p.requiredLabels) || !p.requiredLabels.length || !p.requiredLabels.every(text)) {
      throw new Error('Pen rules require nonempty exact labels')
    }
    entries.push([id, { title: p.title, x: p.x, y: p.y, w: p.w, h: p.h, color: p.color,
      pin: point(p.pin), requiredLabels: [...new Set<string>(p.requiredLabels)] }])
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
  if (b.schema !== 1 && b.schema !== 2 && b.schema !== 3) throw new Error('Unsupported layout schema')
  record(b.cards, 'cards')
  if (b.frames !== undefined) record(b.frames, 'frames')
  if (b.schema < 3 && ['pens', 'ruleOrder', 'inbox'].some(key => Object.hasOwn(b, key))) {
    throw new Error('Routing requires layout schema 3')
  }
  const routing = b.schema === 3
    ? normalizeRouting({ pens: b.pens, ruleOrder: b.ruleOrder, inbox: b.inbox }) : emptyRouting()
  return { ...value, frames: value.frames ?? {}, ...routing }
}
