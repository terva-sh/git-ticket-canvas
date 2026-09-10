import { sameJSON } from '../tickets/reconcile'
import type { CardChanges, Cards, Frame, FrameChanges, Frames, FrameTransaction } from '../tickets/types'

export type { Frame, Frames } from '../tickets/types'
export interface FrameState {
  cards: Cards
  frames: Frames
  /** Supply the board's complete ticket map/set to detect deleted automatic cards too. */
  tickets?: ReadonlyMap<string, unknown> | ReadonlySet<string>
}
export interface FrameOperation extends FrameTransaction { label: string }
export interface Point { x: number; y: number }
export type FrameBounds = Pick<Frame, 'x' | 'y' | 'w' | 'h'>
export interface CaptureCard extends FrameBounds { id: string }

export class FrameConflict extends Error {
  constructor(message: string) { super(message); this.name = 'FrameConflict' }
}

function value<T>(record: Record<string, T>, id: string): T | null {
  return Object.hasOwn(record, id) ? record[id] : null
}
function frameOf(state: FrameState, id: string): Frame {
  const frame = value(state.frames, id)
  if (!frame) throw new FrameConflict(`Frame ${id} no longer exists`)
  return frame
}
function requireTickets(state: FrameState, ids: Iterable<string>) {
  for (const id of ids) {
    if (state.tickets && !state.tickets.has(id)) throw new FrameConflict(`Ticket ${id} no longer exists`)
  }
}
function owners(frames: Frames, id: string): string[] {
  return Object.keys(frames).filter(key => frames[key].members.includes(id)).sort()
}
function members(op: FrameOperation): Set<string> {
  const ids = new Set(Object.keys(op.cards))
  for (const key of Object.keys(op.frames)) {
    for (const id of op.frames[key]?.members ?? []) ids.add(id)
    for (const id of op.expect.frames[key]?.members ?? []) ids.add(id)
  }
  return ids
}
function validateFrame(frame: Frame) {
  if (![frame.x, frame.y, frame.w, frame.h].every(Number.isFinite) || frame.w <= 0 || frame.h <= 0) {
    throw new FrameConflict('Frame bounds must be finite with positive width and height')
  }
  if (new Set(frame.members).size !== frame.members.length) throw new FrameConflict('A frame cannot contain duplicate members')
}

// Match the layout writer's two-decimal rounding, including negative half values.
const coordinate = (n: number) => Math.sign(n) * Math.round(Math.abs(n) * 100) / 100

/** Build a sparse, copied transaction. Null denotes absent manual placement or frame. */
function operation(state: FrameState, label: string, cards: CardChanges, frames: FrameChanges,
  readFrames: Iterable<string> = []): FrameOperation | null {
  const op: FrameOperation = { label, cards: {}, frames: {}, expect: { cards: {}, frames: {} } }
  for (const [id, raw] of Object.entries(cards)) {
    const next = raw === null ? null : { ...raw, x: coordinate(raw.x), y: coordinate(raw.y) }
    const before = value(state.cards, id)
    if (!sameJSON(before, next)) { op.cards[id] = next; op.expect.cards[id] = before }
  }
  for (const [id, raw] of Object.entries(frames)) {
    const next = raw === null ? null : { ...raw, x: coordinate(raw.x), y: coordinate(raw.y),
      w: coordinate(raw.w), h: coordinate(raw.h), members: [...raw.members].sort() }
    const before = value(state.frames, id)
    if (next) validateFrame(next)
    if (!sameJSON(before, next)) { op.frames[id] = next; op.expect.frames[id] = before }
  }
  if (!Object.keys(op.cards).length && !Object.keys(op.frames).length) return null
  for (const id of readFrames) op.expect.frames[id] = value(state.frames, id)
  return structuredClone(op)
}

/** Pass ALL board cards, including filtered cards, with their derived bounds.
 * Centers on the boundary count as inside. Capture never writes card coordinates.
 */
export function captureMembers(frames: Frames, bounds: FrameBounds, cards: Iterable<CaptureCard>): string[] {
  const assigned = new Set(Object.values(frames).flatMap(frame => frame.members))
  const captured = new Set<string>()
  for (const card of cards) {
    const x = card.x + card.w / 2, y = card.y + card.h / 2
    if (!assigned.has(card.id) && x >= bounds.x && x <= bounds.x + bounds.w
      && y >= bounds.y && y <= bounds.y + bounds.h) captured.add(card.id)
  }
  return [...captured].sort()
}

export function createFrame(state: FrameState, id: string, frame: Frame): FrameOperation {
  if (value(state.frames, id)) throw new FrameConflict(`Frame ${id} already exists`)
  requireTickets(state, frame.members)
  for (const member of frame.members) {
    if (owners(state.frames, member).length) throw new FrameConflict(`Ticket ${member} already belongs to a frame`)
  }
  return operation(state, 'Create frame', {}, { [id]: { ...frame, members: [...frame.members].sort() } }, Object.keys(state.frames))!
}

/** positions must contain every explicit member, including hidden/outside members.
 * Use accepted saved positions for manual cards and current derived positions for automatic cards.
 */
export function moveFrame(state: FrameState, id: string, dx: number, dy: number,
  positions: ReadonlyMap<string, Point>): FrameOperation | null {
  const frame = frameOf(state, id)
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new FrameConflict('Frame displacement must be finite')
  requireTickets(state, frame.members)
  const cards: CardChanges = {}
  for (const member of frame.members) {
    const position = positions.get(member)
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      throw new FrameConflict(`Position for ticket ${member} is unavailable`)
    }
    const saved = value(state.cards, member)
    if (saved && (saved.x !== position.x || saved.y !== position.y)) {
      throw new FrameConflict(`Position for ticket ${member} changed`)
    }
    const x = position.x + dx, y = position.y + dy
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new FrameConflict(`Position for ticket ${member} exceeds finite coordinates`)
    cards[member] = { ...saved, x, y }
  }
  if (dx === 0 && dy === 0) return null
  const op = operation(state, 'Move frame and members', cards, { [id]: { ...frame, x: frame.x + dx, y: frame.y + dy } })
  if (op) for (const member of frame.members) op.expect.cards[member] = structuredClone(value(state.cards, member))
  return op
}

export function resizeFrame(state: FrameState, id: string, bounds: FrameBounds): FrameOperation | null {
  return operation(state, 'Resize frame boundary', {}, { [id]: { ...frameOf(state, id), ...bounds } })
}
export function updateFrame(state: FrameState, id: string, changes: Partial<Pick<Frame, 'title' | 'color'>>): FrameOperation | null {
  return operation(state, 'Edit frame', {}, { [id]: { ...frameOf(state, id), ...changes } })
}
export function deleteFrame(state: FrameState, id: string): FrameOperation {
  frameOf(state, id)
  return operation(state, 'Delete frame', {}, { [id]: null })!
}

/** Assign all ids to targetId, transferring existing assignments atomically.
 * A null target removes their assignments. Positions and placement ownership stay untouched.
 */
export function setMembership(state: FrameState, ticketIds: Iterable<string>, targetId: string | null): FrameOperation | null {
  const ids = new Set(ticketIds), frames: FrameChanges = {}
  if (targetId !== null) { frameOf(state, targetId); requireTickets(state, ids) }
  for (const [id, frame] of Object.entries(state.frames)) {
    const next = frame.members.filter(member => !ids.has(member))
    if (id === targetId) next.push(...ids)
    // Membership is a set; retain original order for a no-op assignment.
    if (sameJSON([...next].sort(), [...frame.members].sort())) continue
    frames[id] = { ...frame, members: next.sort() }
  }
  return operation(state, targetId === null ? 'Remove frame members' : 'Assign frame members', {}, frames,
    targetId === null ? [] : Object.keys(state.frames))
}

/** Check immediately before preview/submission. The server must check expect again atomically. */
export function assertFrameOperation(state: FrameState, op: FrameOperation): void {
  for (const kind of ['cards', 'frames'] as const) {
    for (const id of Object.keys(op[kind])) {
      if (!Object.hasOwn(op.expect[kind], id)) throw new FrameConflict(`Missing ${kind} preimage for ${id}`)
    }
    for (const [id, expected] of Object.entries(op.expect[kind])) {
      if (!sameJSON(value(state[kind], id), expected)) throw new FrameConflict(`${kind === 'cards' ? 'Card' : 'Frame'} ${id} changed`)
    }
  }
  requireTickets(state, Object.keys(op.cards))
  const frames = applyChanges(state.frames, op.frames)
  const assigned = new Set<string>()
  for (const [id, frame] of Object.entries(frames)) {
    validateFrame(frame)
    // Existing dangling memberships remain readable and do not block unrelated
    // edits. Changed nonnull frames must remove missing identities before save.
    if (op.frames[id]) requireTickets(state, frame.members)
    for (const id of frame.members) {
      if (assigned.has(id)) throw new FrameConflict(`Ticket ${id} already belongs to another frame`)
      assigned.add(id)
    }
  }
}
function applyChanges<T>(before: Record<string, T>, changes: Record<string, T | null>): Record<string, T> {
  const after = { ...before }
  for (const [id, next] of Object.entries(changes)) {
    if (next === null) delete after[id]
    else after[id] = structuredClone(next)
  }
  return after
}
/** Pure conditional application, useful for previews and tests; never changes ticket data. */
export function applyFrameOperation(state: FrameState, op: FrameOperation): FrameState {
  assertFrameOperation(state, op)
  return { ...state, cards: applyChanges(state.cards, op.cards), frames: applyChanges(state.frames, op.frames) }
}

/** Invert only written keys, retaining read-set preimages for the next save. */
export function inverseFrameOperation(op: FrameOperation): FrameOperation {
  const inverse = structuredClone(op)
  inverse.label = `Undo ${op.label}`
  for (const id of Object.keys(op.cards)) {
    inverse.cards[id] = structuredClone(op.expect.cards[id])
    inverse.expect.cards[id] = structuredClone(op.cards[id])
  }
  for (const id of Object.keys(op.frames)) {
    inverse.frames[id] = structuredClone(op.expect.frames[id])
    inverse.expect.frames[id] = structuredClone(op.frames[id])
  }
  return inverse
}

interface HistoryEntry { forward: FrameOperation; backward: FrameOperation; blockedReason?: string }
export interface HistoryStatus { label: string; blockedReason?: string }

/** One instance per board, held above the board view. Nothing is persisted.
 * record/acceptUndo/acceptRedo run ONLY after a successful request, before observe.
 * undo/redo only prepare a transaction. A failed request needs no rollback or stack mutation.
 * Feed accepted external reads and ordinary card edits to observe, never gesture previews.
 */
export class FrameHistory {
  private past: HistoryEntry[] = []
  private future: HistoryEntry[] = []
  private accepted?: FrameState
  get undoEntry(): HistoryStatus | undefined { return this.status(this.past.at(-1), 'backward') }
  get redoEntry(): HistoryStatus | undefined { return this.status(this.future.at(-1), 'forward') }
  get undoCount(): number { return this.past.length }
  get redoCount(): number { return this.future.length }

  private status(entry: HistoryEntry | undefined, direction: 'forward' | 'backward'): HistoryStatus | undefined {
    return entry ? { label: entry[direction].label, blockedReason: entry.blockedReason } : undefined
  }
  private remember(state: FrameState) {
    // Ticket text is neither history nor a conflict input. Keep identities only.
    this.accepted = { cards: structuredClone(state.cards), frames: structuredClone(state.frames),
      tickets: state.tickets ? new Set(state.tickets.keys()) : undefined }
  }

  observe(state: FrameState): void {
    if (this.accepted) {
      for (const entry of [...this.past, ...this.future]) {
        entry.blockedReason ??= this.changed(entry, this.accepted, state)
      }
    }
    this.remember(state)
  }

  private changed(entry: HistoryEntry, before: FrameState, after: FrameState): string | undefined {
    const op = entry.forward
    for (const id of Object.keys(op.expect.cards)) {
      if (!sameJSON(value(before.cards, id), value(after.cards, id))) return `Card ${id} changed after this frame operation`
    }
    for (const id of Object.keys(op.frames)) {
      if (!sameJSON(value(before.frames, id), value(after.frames, id))) return `Frame ${id} changed after this frame operation`
    }
    for (const id of members(op)) {
      if (after.tickets && !after.tickets.has(id)) return `Ticket ${id} no longer exists`
      if (!sameJSON(owners(before.frames, id), owners(after.frames, id))) return `Membership of ticket ${id} changed`
    }
  }

  record(op: FrameOperation | null, acceptedState: FrameState): void {
    if (!op) return
    this.assertAccepted(op, acceptedState)
    this.observeOtherChanges(op, acceptedState)
    this.past.push({ forward: structuredClone(op), backward: inverseFrameOperation(op) })
    this.future = []
    this.remember(acceptedState)
  }

  undo(state: FrameState): FrameOperation { return this.prepare(this.past, 'backward', state) }
  redo(state: FrameState): FrameOperation { return this.prepare(this.future, 'forward', state) }

  private prepare(stack: HistoryEntry[], direction: 'forward' | 'backward', state: FrameState): FrameOperation {
    this.observe(state)
    const entry = stack.at(-1)
    if (!entry) throw new FrameConflict(`Nothing to ${direction === 'backward' ? 'undo' : 'redo'}`)
    if (entry.blockedReason) throw new FrameConflict(entry.blockedReason)
    const op = structuredClone(entry[direction])
    // Read-only ownership guards are refreshed, not treated as written history.
    // observe checks relevant ownership changes, and the save checks this new read set.
    for (const id of Object.keys(op.expect.frames)) {
      if (!Object.hasOwn(op.frames, id)) delete op.expect.frames[id]
    }
    const restoresMembers = Object.entries(op.frames).some(([id, frame]) =>
      frame?.members.some(member => !op.expect.frames[id]?.members.includes(member)))
    if (restoresMembers) {
      for (const id of Object.keys(state.frames)) {
        if (!Object.hasOwn(op.expect.frames, id)) op.expect.frames[id] = structuredClone(state.frames[id])
      }
    }
    try { assertFrameOperation(state, op) }
    catch (error) {
      entry.blockedReason = error instanceof Error ? error.message : String(error)
      throw error
    }
    return op
  }

  acceptUndo(op: FrameOperation, acceptedState: FrameState): void {
    this.accept(this.past, this.future, 'backward', op, acceptedState)
  }
  acceptRedo(op: FrameOperation, acceptedState: FrameState): void {
    this.accept(this.future, this.past, 'forward', op, acceptedState)
  }
  private accept(from: HistoryEntry[], to: HistoryEntry[], direction: 'forward' | 'backward',
    op: FrameOperation, state: FrameState): void {
    const entry = from.at(-1)
    if (!entry || !sameJSON(entry[direction].cards, op.cards) || !sameJSON(entry[direction].frames, op.frames)
      || !sameJSON(entry[direction].expect.cards, op.expect.cards)
      || Object.keys(op.frames).some(id => !sameJSON(entry[direction].expect.frames[id], op.expect.frames[id]))) {
      throw new FrameConflict('History changed while the operation was saving')
    }
    this.assertAccepted(op, state)
    this.observeOtherChanges(op, state)
    from.pop(); to.push(entry)
    this.remember(state)
  }
  private observeOtherChanges(op: FrameOperation, state: FrameState): void {
    // A successful response can also contain concurrent unrelated writes. Mask
    // only this operation, so those writes still invalidate older affected entries.
    const cards: CardChanges = {}, frames: FrameChanges = {}
    for (const id of Object.keys(op.cards)) cards[id] = op.expect.cards[id]
    for (const id of Object.keys(op.frames)) frames[id] = op.expect.frames[id]
    this.observe({ ...state, cards: applyChanges(state.cards, cards), frames: applyChanges(state.frames, frames) })
  }
  private assertAccepted(op: FrameOperation, state: FrameState): void {
    for (const kind of ['cards', 'frames'] as const) {
      for (const [id, expected] of Object.entries(op[kind])) {
        if (!sameJSON(value(state[kind], id), expected)) throw new FrameConflict(`Server did not accept ${kind} ${id}`)
      }
    }
  }
}
