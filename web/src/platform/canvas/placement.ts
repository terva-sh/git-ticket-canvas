import { CARD_WIDTH } from './geometry'
import { evaluatePens, type Destination, type PenEvaluation, type RuleTicket } from './pens'
import { normalizeRouting } from '../tickets/layout'
import type { Card, Cards, Routing } from '../tickets/types'

export const PLACEMENT_GAP = 24
export const PROVISIONAL_HEIGHT = 340
export const SCENE_LIMIT = 1e9
export const DEFAULT_CANDIDATE_BUDGET = 50_000
export interface Rectangle { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface PlacementTicket extends RuleTicket { readonly identity: string }
export interface MeasuredHeight { readonly identity: string; readonly height: number }
export interface ManualPreview { readonly identity: string; readonly owner: string; readonly card: Card }
export interface Obstacle extends Rectangle { readonly id: string }
export interface PlacementInput {
  board: string; generation: number; revision: number; baseline: string
  tickets: readonly PlacementTicket[]; routing: Routing; cards: Readonly<Cards>
  heights: ReadonlyMap<string, MeasuredHeight>; previews: ReadonlyMap<string, ManualPreview>; obstacles: readonly Obstacle[]
  /** How wide a card is on this board. Omit for the full-density CARD_WIDTH.
   * Heights are measured per ticket; width is uniform, so it belongs here. */
  cardWidth?: number
}
export interface Placement extends Rectangle {
  readonly identity: string; readonly mode: 'automatic' | 'manual' | 'preview'; readonly provisional: boolean
  readonly destination: Destination | null; readonly overflow: boolean; readonly anchorKey: string; readonly previewOwner?: string
}
export interface PlacementSnapshot {
  readonly board: string; readonly generation: number; readonly revision: number; readonly baseline: string
  readonly positions: ReadonlyMap<string, Placement>; readonly evaluation: PenEvaluation
  readonly overflow: ReadonlyMap<string, readonly string[]>; readonly overflowCounts: ReadonlyMap<string, number>
}
export interface PlacementWork { candidates: number; collisionChecks: number; retained: number }
export interface PlacementError { code: 'invalid-input' | 'coordinate-exhausted' | 'search-exhausted'; message: string; ticketId?: string }
export type AllocationResult = { ok: true; snapshot: PlacementSnapshot; work: PlacementWork }
  | { ok: false; error: PlacementError; work: PlacementWork }
export interface AllocationOptions { maxCandidates?: number }
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const coordinate = (n: number) => Number.isFinite(n) && Math.abs(n) <= SCENE_LIMIT
const positive = (n: number) => Number.isFinite(n) && n > 0 && n <= Number.MAX_SAFE_INTEGER / 4
const token = (s: string) => typeof s === 'string' && s.length > 0

// Object.freeze(Map) does not freeze its entries. This facade exposes no mutator
// and never hands the backing map to forEach callbacks or callers.
function readonlyMap<K, V>(entries: Iterable<readonly [K, V]>): ReadonlyMap<K, V> {
  const data = new Map(entries)
  const view: ReadonlyMap<K, V> = {
    get size() { return data.size }, get: key => data.get(key), has: key => data.has(key),
    entries: () => data.entries(), keys: () => data.keys(), values: () => data.values(),
    [Symbol.iterator]: () => data[Symbol.iterator](),
    forEach(callback, thisArg) { data.forEach((value, key) => callback.call(thisArg, value, key, view)) },
  }
  return Object.freeze(view)
}
/** Freeze only fresh engine-owned data, never caller-owned inputs. */
function immutable<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  if (value instanceof Map) return readonlyMap([...value].map(([key, entry]) => [key, immutable(entry)])) as T
  for (const [key, child] of Object.entries(value)) (value as Record<string, unknown>)[key] = immutable(child)
  return Object.freeze(value)
}

interface PreparedTicket extends PlacementTicket {
  height: number; provisional: boolean; manual?: Card; preview?: ManualPreview
}
export interface PreparedPlacement {
  input: PlacementInput; tickets: PreparedTicket[]; key: string
}
/** Canonicalize relevant inputs without evaluating rules or allocating slots.
 * The controller uses this key for content reuse; lineage is checked separately.
 */
export function preparePlacement(input: PlacementInput): PreparedPlacement {
  if (!token(input.board) || !token(input.baseline) || !Number.isSafeInteger(input.generation) || input.generation < 0
    || !Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error('Invalid placement lineage')
  const routing = normalizeRouting({ pens: input.routing.pens, ruleOrder: input.routing.ruleOrder, inbox: input.routing.inbox })
  const seen = new Set<string>()
  const tickets: PreparedTicket[] = input.tickets.map(ticket => {
    if (!token(ticket.id) || !token(ticket.identity) || seen.has(ticket.id) || !Array.isArray(ticket.labels)
      || !ticket.labels.every(label => typeof label === 'string')) throw new Error('Invalid or duplicate ticket identity')
    seen.add(ticket.id)
    const measurement = input.heights.get(ticket.id), rawPreview = input.previews.get(ticket.id)
    const measured = measurement?.identity === ticket.identity
    const height = measured ? measurement.height : PROVISIONAL_HEIGHT
    if (!positive(height)) throw new Error(`Invalid height for ${ticket.id}`)
    const copyCard = (card: Card): Card => {
      if (!card || !coordinate(card.x) || !coordinate(card.y)) throw new Error(`Invalid coordinates for ${ticket.id}`)
      return { x: card.x, y: card.y }
    }
    const manual = Object.hasOwn(input.cards, ticket.id) ? copyCard(input.cards[ticket.id]) : undefined
    let preview: ManualPreview | undefined
    if (rawPreview?.identity === ticket.identity) {
      if (!token(rawPreview.owner)) throw new Error(`Invalid preview owner for ${ticket.id}`)
      preview = { identity: rawPreview.identity, owner: rawPreview.owner, card: copyCard(rawPreview.card) }
    }
    return { id: ticket.id, identity: ticket.identity, labels: [...new Set(ticket.labels)].sort(compare), height, provisional: !measured,
      ...(manual ? { manual } : {}), ...(preview ? { preview } : {}) }
  }).sort((a, b) => compare(a.id, b.id))
  const obstacleIds = new Set<string>()
  const obstacles = input.obstacles.map(o => {
    if (!token(o.id) || obstacleIds.has(o.id) || !coordinate(o.x) || !coordinate(o.y) || !positive(o.width) || !positive(o.height)) {
      throw new Error('Invalid or duplicate obstacle')
    }
    obstacleIds.add(o.id)
    return { id: o.id, x: o.x, y: o.y, width: o.width, height: o.height }
  }).sort((a, b) => compare(a.id, b.id))
  const normalized: PlacementInput = { board: input.board, generation: input.generation, revision: input.revision, baseline: input.baseline,
    routing, tickets: tickets.map(t => ({ id: t.id, identity: t.identity, labels: t.labels })),
    cards: Object.fromEntries(tickets.filter(t => t.manual).map(t => [t.id, t.manual!])),
    heights: new Map(tickets.filter(t => !t.provisional).map(t => [t.id, { identity: t.identity, height: t.height }])),
    previews: new Map(tickets.filter(t => t.preview).map(t => [t.id, t.preview!])), obstacles }
  // Pen title/color and ticket metadata do not affect these snapshot contents.
  const rules = routing.ruleOrder.map(id => {
    const p = routing.pens[id]
    return [id, p.x, p.y, p.w, p.h, p.pin.x, p.pin.y, p.requiredLabels]
  })
  return { input: normalized, tickets, key: JSON.stringify([tickets, rules, routing.inbox, obstacles]) }
}

function overlaps(a: Rectangle, b: Rectangle): boolean {
  return a.x < b.x + b.width + PLACEMENT_GAP && b.x < a.x + a.width + PLACEMENT_GAP
    && a.y < b.y + b.height + PLACEMENT_GAP && b.y < a.y + a.height + PLACEMENT_GAP
}
class Occupancy {
  private cells = new Map<string, Rectangle[]>()
  private large: Rectangle[] = []
  private all: Rectangle[] = []
  constructor(private work: PlacementWork) {}
  private keys(rect: Rectangle, margin = 0): string[] | null {
    const x1 = Math.floor((rect.x - margin) / 512), x2 = Math.floor((rect.x + rect.width + margin) / 512)
    const y1 = Math.floor((rect.y - margin) / 512), y2 = Math.floor((rect.y + rect.height + margin) / 512)
    if ((x2 - x1 + 1) * (y2 - y1 + 1) > 4096) return null
    const keys: string[] = []
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) keys.push(`${x},${y}`)
    return keys
  }
  add(rect: Rectangle) {
    this.all.push(rect)
    const keys = this.keys(rect)
    if (!keys) { this.large.push(rect); return }
    for (const key of keys) {
      let bucket = this.cells.get(key)
      if (!bucket) { bucket = []; this.cells.set(key, bucket) }
      bucket.push(rect)
    }
  }
  free(rect: Rectangle): boolean {
    const keys = this.keys(rect, PLACEMENT_GAP)
    const candidates = keys ? new Set([...this.large, ...keys.flatMap(key => this.cells.get(key) ?? [])]) : this.all
    for (const obstacle of candidates) {
      this.work.collisionChecks++
      if (overlaps(rect, obstacle)) return false
    }
    return true
  }
}
interface Domain { minX: number; maxX: number; minY: number; maxY: number }
interface GridPoint { x: number; y: number; ix: number; iy: number; distance: number }
/** A lazy heap avoids materializing scene-sized grids. */
class Heap {
  private items: GridPoint[] = []
  private before(a: GridPoint, b: GridPoint) { return a.distance < b.distance || a.distance === b.distance && (a.y < b.y || a.y === b.y && a.x < b.x) }
  push(value: GridPoint) {
    const items = this.items; items.push(value)
    let i = items.length - 1
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2)
      if (!this.before(items[i], items[parent])) break
      ;[items[i], items[parent]] = [items[parent], items[i]]; i = parent
    }
  }
  pop(): GridPoint | undefined {
    const items = this.items, first = items[0], last = items.pop()
    if (items.length && last) {
      items[0] = last
      let i = 0
      while (true) {
        let next = i
        const left = i * 2 + 1, right = left + 1
        if (left < items.length && this.before(items[left], items[next])) next = left
        if (right < items.length && this.before(items[right], items[next])) next = right
        if (i === next) break
        ;[items[i], items[next]] = [items[next], items[i]]; i = next
      }
    }
    return first
  }
}
// Every width here defaults to CARD_WIDTH, so a caller that does not care about
// density reads and behaves exactly as before. Compact mode passes its own.
function* grid(domain: Domain, pin: { x: number; y: number }, height: number, width = CARD_WIDTH): Generator<{ x: number; y: number }> {
  if (domain.minX > domain.maxX || domain.minY > domain.maxY) return
  const x = Math.max(domain.minX, Math.min(domain.maxX, pin.x)), y = Math.max(domain.minY, Math.min(domain.maxY, pin.y))
  const dx = width + PLACEMENT_GAP, dy = height + PLACEMENT_GAP
  const minI = Math.ceil((domain.minX - x) / dx), maxI = Math.floor((domain.maxX - x) / dx)
  const minJ = Math.ceil((domain.minY - y) / dy), maxJ = Math.floor((domain.maxY - y) / dy)
  const heap = new Heap(), seen = new Set<string>()
  function add(ix: number, iy: number) {
    if (ix < minI || ix > maxI || iy < minJ || iy > maxJ) return
    const key = `${ix},${iy}`
    if (seen.has(key)) return
    seen.add(key)
    heap.push({ ix, iy, x: x + ix * dx, y: y + iy * dy, distance: (ix * dx) ** 2 + (iy * dy) ** 2 })
  }
  add(0, 0)
  let point: GridPoint | undefined
  while ((point = heap.pop())) {
    // Subtraction along the lattice can round just beyond a fractional boundary.
    yield { x: Math.max(domain.minX, Math.min(domain.maxX, point.x)), y: Math.max(domain.minY, Math.min(domain.maxY, point.y)) }
    add(point.ix - 1, point.iy); add(point.ix + 1, point.iy); add(point.ix, point.iy - 1); add(point.ix, point.iy + 1)
  }
}
const world = (height: number, width = CARD_WIDTH): Domain => ({ minX: -SCENE_LIMIT, maxX: SCENE_LIMIT - width, minY: -SCENE_LIMIT, maxY: SCENE_LIMIT - height })
function inside(rect: Rectangle, domain: Domain) {
  return coordinate(rect.x) && coordinate(rect.y) && rect.x >= domain.minX && rect.x <= domain.maxX && rect.y >= domain.minY && rect.y <= domain.maxY
}
function interior(routing: Routing, id: string, height: number, width = CARD_WIDTH): Domain {
  const p = routing.pens[id], legal = world(height, width)
  return { minX: Math.max(legal.minX, p.x + PLACEMENT_GAP), maxX: Math.min(legal.maxX, p.x + p.w - PLACEMENT_GAP - width),
    minY: Math.max(legal.minY, p.y + PLACEMENT_GAP), maxY: Math.min(legal.maxY, p.y + p.h - PLACEMENT_GAP - height) }
}
function fitsPen(routing: Routing, id: string, rect: Rectangle, width = CARD_WIDTH): boolean {
  const p = routing.pens[id]
  return inside(rect, interior(routing, id, rect.height, width))
    && rect.x + rect.width <= p.x + p.w - PLACEMENT_GAP && rect.y + rect.height <= p.y + p.h - PLACEMENT_GAP
}
function anchorKey(routing: Routing, dest: Destination): string {
  if (dest.kind === 'inbox') return JSON.stringify(['inbox', routing.inbox.x, routing.inbox.y])
  const p = routing.pens[dest.penId]
  return JSON.stringify(['pen', dest.penId, p.x, p.y, p.w, p.h, p.pin.x, p.pin.y])
}
function exterior(routing: Routing, id: string, rect: Rectangle): boolean {
  const p = routing.pens[id]
  return rect.y >= p.y + p.h + PLACEMENT_GAP || rect.x >= p.x + p.w + PLACEMENT_GAP
    || rect.y + rect.height + PLACEMENT_GAP <= p.y || rect.x + rect.width + PLACEMENT_GAP <= p.x
}
function* spill(routing: Routing, id: string, height: number, width = CARD_WIDTH): Generator<{ x: number; y: number }> {
  const p = routing.pens[id], w = world(height, width)
  const domains: Domain[] = [
    { ...w, minY: Math.max(w.minY, p.y + p.h + PLACEMENT_GAP) },
    { ...w, minX: Math.max(w.minX, p.x + p.w + PLACEMENT_GAP) },
    { ...w, maxY: Math.min(w.maxY, p.y - PLACEMENT_GAP - height) },
    { ...w, maxX: Math.min(w.maxX, p.x - PLACEMENT_GAP - width) },
  ]
  const iterators = domains.map(d => grid(d, p.pin, height, width))
  const done = new Set<number>()
  while (done.size < iterators.length) {
    for (let i = 0; i < iterators.length; i++) {
      if (done.has(i)) continue
      const point = iterators[i].next()
      if (point.done) done.add(i)
      else yield point.value
    }
  }
}

/** One synchronous calculation; no DOM, timers, store calls, or persistence.
 * Failure exposes diagnostics only. No partially allocated map can be accepted.
 */
export function allocatePlacement(input: PlacementInput, previous?: PlacementSnapshot, options: AllocationOptions = {}): AllocationResult {
  const work: PlacementWork = { candidates: 0, collisionChecks: 0, retained: 0 }
  let prepared: PreparedPlacement
  const budget = options.maxCandidates ?? DEFAULT_CANDIDATE_BUDGET
  try {
    if (!Number.isSafeInteger(budget) || budget < 0) throw new Error('Invalid candidate budget')
    if (input.cardWidth !== undefined && !positive(input.cardWidth)) throw new Error('Invalid card width')
    prepared = preparePlacement(input)
  } catch (error) {
    return { ok: false, error: { code: 'invalid-input', message: error instanceof Error ? error.message : 'Invalid placement input' }, work }
  }
  const { routing, obstacles } = prepared.input, tickets = prepared.tickets
  // Read from the caller's input, not prepared.input: preparePlacement rebuilds
  // the input from the fields it knows, so a width set there would be dropped.
  const cardWidth = input.cardWidth ?? CARD_WIDTH
  const effectiveCards = Object.fromEntries(tickets.filter(t => t.preview || t.manual).map(t => [t.id, t.preview?.card ?? t.manual!]))
  const evaluation = evaluatePens(routing, tickets, effectiveCards), positions = new Map<string, Placement>(), occupancy = new Occupancy(work)
  for (const obstacle of obstacles) occupancy.add(obstacle)
  for (const t of tickets) {
    if (t.manual) occupancy.add({ ...t.manual, width: cardWidth, height: t.height })
    if (t.preview) occupancy.add({ ...t.preview.card, width: cardWidth, height: t.height })
    const card = t.preview?.card ?? t.manual
    if (card) positions.set(t.id, { ...card, width: cardWidth, height: t.height, identity: t.identity,
      provisional: t.provisional, mode: t.preview ? 'preview' : 'manual', destination: null, overflow: false, anchorKey: '',
      ...(t.preview ? { previewOwner: t.preview.owner } : {}) })
  }
  const automatic = tickets.filter(t => !positions.has(t.id))
  const rank = new Map(routing.ruleOrder.map((id, i) => [id, i]))
  const destination = (t: PreparedTicket) => evaluation.tickets.get(t.id)!.destination!
  const order = (t: PreparedTicket) => { const d = destination(t); return d.kind === 'pen' ? rank.get(d.penId)! : rank.size }
  automatic.sort((a, b) => order(a) - order(b) || compare(a.id, b.id))
  const oldFor = (t: PreparedTicket) => previous?.board === input.board ? previous.positions.get(t.id) : undefined
  // Reserve unchanged sizes first so a growing card cannot displace an unaffected neighbor.
  const retained = [...automatic].sort((a, b) => Number(oldFor(a)?.height !== a.height) - Number(oldFor(b)?.height !== b.height))
  for (const t of retained) {
    const old = oldFor(t), dest = destination(t)
    if (!old || old.mode !== 'automatic' || old.identity !== t.identity || old.anchorKey !== anchorKey(routing, dest)) continue
    const candidate = { ...old, height: t.height, provisional: t.provisional }
    if (!inside(candidate, world(t.height, cardWidth))) continue
    if (dest.kind === 'pen' && (old.overflow ? !exterior(routing, dest.penId, candidate) : !fitsPen(routing, dest.penId, candidate, cardWidth))) continue
    if (!occupancy.free(candidate)) continue
    const same = old.height === t.height && old.provisional === t.provisional
    positions.set(t.id, same ? old : candidate); occupancy.add(candidate); work.retained++
  }
  for (const t of automatic) {
    if (positions.has(t.id)) continue
    const dest = destination(t), legal = world(t.height, cardWidth)
    if (legal.minY > legal.maxY) return { ok: false, error: { code: 'coordinate-exhausted', ticketId: t.id, message: 'Card exceeds scene bounds' }, work }
    const sources: { points: Generator<{ x: number; y: number }>; overflow: boolean }[] = dest.kind === 'pen'
      ? [{ points: grid(interior(routing, dest.penId, t.height, cardWidth), routing.pens[dest.penId].pin, t.height, cardWidth), overflow: false },
        { points: spill(routing, dest.penId, t.height, cardWidth), overflow: true }]
      : [{ points: grid(legal, routing.inbox, t.height, cardWidth), overflow: false }]
    search: for (const source of sources) {
      for (const point of source.points) {
        if (work.candidates >= budget) return { ok: false, error: { code: 'search-exhausted', ticketId: t.id, message: 'Placement candidate budget exhausted' }, work }
        work.candidates++
        const candidate: Placement = { ...point, width: cardWidth, height: t.height, identity: t.identity, mode: 'automatic',
          provisional: t.provisional, destination: dest, overflow: source.overflow, anchorKey: anchorKey(routing, dest) }
        if (!inside(candidate, legal)) continue
        if (dest.kind === 'pen' && (source.overflow ? !exterior(routing, dest.penId, candidate) : !fitsPen(routing, dest.penId, candidate, cardWidth))) continue
        if (!occupancy.free(candidate)) continue
        positions.set(t.id, candidate); occupancy.add(candidate); break search
      }
    }
    if (!positions.has(t.id)) return { ok: false, error: { code: 'coordinate-exhausted', ticketId: t.id, message: 'No legal placement slots remain' }, work }
  }
  const overflow = new Map(routing.ruleOrder.map(id => [id, [] as string[]]))
  // Output order is ticket ID order, independently of allocation priority.
  const ordered = new Map(tickets.map(t => [t.id, positions.get(t.id)!]))
  for (const [id, p] of ordered) if (p.overflow && p.destination?.kind === 'pen') overflow.get(p.destination.penId)!.push(id)
  const snapshot = immutable<PlacementSnapshot>({ board: input.board, generation: input.generation, revision: input.revision, baseline: input.baseline,
    positions: ordered, evaluation, overflow, overflowCounts: new Map([...overflow].map(([id, ids]) => [id, ids.length])) })
  return { ok: true, snapshot, work }
}
